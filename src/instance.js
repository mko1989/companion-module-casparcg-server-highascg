const { InstanceBase } = require('@companion-module/base')
const { parseString } = require('xml2js')
const dgram = require('dgram')
const { AmcpCommands } = require('./amcp')
const compileActionDefinitions = require('./actions')
const { getConfigFields } = require('./config-fields')
const { buildConfigXml } = require('./config-generator')
const variables = require('./variables')
const presets = require('./presets')
const feedbacks = require('./feedbacks')
const polling = require('./polling')
const { initTcp } = require('./tcp')
const handlers = require('./handlers')
const { routeRequest } = require('./api-routes')
const { startWebServer, stopWebServer, serveWebApp } = require('./web-server')
const { StateManager } = require('./state-manager')
const { setupAllRouting } = require('./routing')
const { TimelineEngine } = require('./timeline-engine')
const persistence = require('./persistence')

class instance extends InstanceBase {
	constructor(internal) {
		super(internal)

		this.amcp = new AmcpCommands(this)
		this.state = new StateManager(this)
		this.timelineEngine = new TimelineEngine(this)
		this.response_callback = {}

		this.CHOICES_TEMPLATES = []
		this.CHOICES_MEDIAFILES = []

		this.pollTimer = null
		this.realtimePollTimer = null
		this.apiServer = null
		this.commandQueue = []
		this.mediaDetails = {} // filename -> CINF response string
		this.gatheredInfo = {
			channelIds: [],
			channelStatusLines: {},
			infoPaths: '',
			infoSystem: '',
			infoConfig: '',
			channelXml: {},   // '1' -> xml string, '1-0' -> xml string
			decklinkFromConfig: {}, // From INFO CONFIG when config-based decklink info missing
		}
		this.variables = {
			server_version: '',
			flash_version: '',
			templatehost_version: '',
			channel_list: '',
			channel_1_status: '',
			channel_1_framerate: '',
			channel_1_layer_0_clip: '',
			channel_1_layer_0_state: '',
			info_paths: '',
			info_system: '',
			info_config: '',
			server_consumers_summary: '',
			cg_info: '',
			media_count: '',
			template_count: '',
		}
	}

	async init(config) {
		this.config = config
		this._uiSelection = null
		// Restore persisted runtime state
		this._multiviewLayout = persistence.get('multiviewLayout') || null
		this.summarizeConsumersFromConfig = (cfg, done) => variables.summarizeConsumersFromConfig(cfg, done)
		variables.initVariables(this)
		this.init_actions()
		feedbacks.initFeedbacks(this)
		presets.initPresets(this)
		initTcp(this)
		this._startApiServer()
		// Broadcast state changes to WebSocket clients
		this.state.on('change', (path, value) => {
			if (this._wsBroadcast) this._wsBroadcast('change', { path, value })
		})
	}

	async configUpdated(config) {
		this.config = config
		try {
			require('./config-compare').refreshConfigComparison(this)
		} catch (_) {}
		initTcp(this)
		this._startApiServer()
		// Preview: update server_consumers_summary from generated config so user sees what will be sent
		const generatedXml = buildConfigXml(this.config)
		if (generatedXml) {
			this.summarizeConsumersFromConfig(generatedXml, (summary) => {
				this.variables.server_consumers_summary = summary
				this.setVariableValues({ server_consumers_summary: summary })
			})
		}
	}

	// When module gets deleted
	async destroy() {
		stopWebServer(this.apiServer)
		this.apiServer = null
		delete this._wsBroadcast
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = null
		}
		if (this.realtimePollTimer) {
			clearInterval(this.realtimePollTimer)
			this.realtimePollTimer = null
		}
		if (this.socket) {
			this.socket.destroy()
		}
	}

	_startApiServer() {
		// API is always served via Companion's handleHttpRequest at /instance/<id>/api/...
		// No standalone server — user cannot misconfigure; connection is automatic.
		stopWebServer(this.apiServer)
		this.apiServer = null
		delete this._wsBroadcast
		// Wire timeline engine events to WebSocket broadcast
		this.timelineEngine.removeAllListeners('tick')
		this.timelineEngine.removeAllListeners('playback')
		this.timelineEngine.on('tick', (data) => {
			if (this._wsBroadcast) this._wsBroadcast('timeline.tick', data)
		})
		this.timelineEngine.on('playback', (pb) => {
			if (this._wsBroadcast) this._wsBroadcast('timeline.playback', pb)
		})
	}

	async handleHttpRequest(request) {
		try {
			const reqPath = (request.path || '/').split('?')[0]
			const isApi = reqPath.startsWith('/api/') || reqPath === '/api'
			const result = isApi
				? await routeRequest(request.method || 'GET', reqPath, request.body, this)
				: await serveWebApp(reqPath)
			return {
				status: result.status || 200,
				headers: result.headers,
				body: result.body,
			}
		} catch (e) {
			this.log('error', 'HTTP handler error: ' + (e?.message || e))
			return {
				status: 502,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ error: e?.message || String(e) }),
			}
		}
	}

	// Return config fields for web config
	getConfigFields() {
		return getConfigFields()
	}

	enqueue(command, params, responseKey, callback) {
		this.commandQueue.push({
			command: command,
			params: params != null && params !== '' ? String(params) : null,
			responseKey: responseKey !== undefined ? String(responseKey).toUpperCase() : String(command).split(/\s+/)[0].toUpperCase(),
			callback: typeof callback === 'function' ? callback : undefined,
		})
	}

	runCommandQueue() {
		if (!this.socket || !this.socket.isConnected || this.commandQueue.length === 0) return
		const item = this.commandQueue.shift()
		const self = this
		this.requestData(item.command, item.params, (data) => {
			if (item.callback) item.callback(data)
			self.runCommandQueue()
		}, item.responseKey)
	}

	/**
	 * Media library only: CLS + CINF + TLS. No routing, no DeckLink, no multiview.
	 * Use when refreshing media/template list without touching inputs or consumers.
	 */
	runMediaLibraryQueryCycle() {
		const self = this
		this.commandQueue = []
		this.mediaDetails = {}

		this.enqueue('CLS', null, 'CLS', (data) => {
			handlers.handleCLS(self, data)
			self.state.updateFromCLS(data)
			const queryCinf = self.config && self.config.query_cinf !== false
			const maxCinf = Math.max(0, parseInt(self.config && self.config.max_cinf ? self.config.max_cinf : '100', 10))
			if (queryCinf && maxCinf > 0) {
				const files = self.CHOICES_MEDIAFILES.slice(0, maxCinf)
				files.forEach((choice) => {
					const filename = choice.id || choice.label
					if (!filename || String(filename).match(/^\d+-/)) return // skip malformed or index-prefixed names
					const cinfParam = filename.indexOf(' ') >= 0 ? '"' + String(filename).replace(/"/g, '\\"') + '"' : filename
					self.enqueue('CINF', cinfParam, 'CINF', (cinfData) => {
						self.mediaDetails[filename] = self._responseToStr(cinfData)
					})
				})
			}
			self.enqueue('TLS', null, 'TLS', (data) => {
				if (self.state && self.mediaDetails) self.state.updateMediaDetails(self.mediaDetails)
				handlers.handleTLS(self, data)
				self.state.updateFromTLS(data)
			})
			self.runCommandQueue()
		})
		this.runCommandQueue()
	}

	runConnectionQueryCycle() {
		const self = this
		this.commandQueue = []
		this.mediaDetails = {}
		this.gatheredInfo = { channelIds: [], channelStatusLines: {}, infoPaths: '', infoSystem: '', infoConfig: '', channelXml: {}, decklinkFromConfig: {} }

		// 1. CLS → then CINF for each media (if enabled, up to max), then TLS
		this.enqueue('CLS', null, 'CLS', (data) => {
			handlers.handleCLS(self, data)
			self.state.updateFromCLS(data)
			const queryCinf = self.config && self.config.query_cinf !== false
			const maxCinf = Math.max(0, parseInt(self.config && self.config.max_cinf ? self.config.max_cinf : '100', 10))
			if (queryCinf && maxCinf > 0) {
				const files = self.CHOICES_MEDIAFILES.slice(0, maxCinf)
				files.forEach((choice) => {
					const filename = choice.id || choice.label
					if (!filename || String(filename).match(/^\d+-/)) return // skip malformed or index-prefixed names
					const cinfParam = filename.indexOf(' ') >= 0 ? '"' + String(filename).replace(/"/g, '\\"') + '"' : filename
					self.enqueue('CINF', cinfParam, 'CINF', (cinfData) => {
						self.mediaDetails[filename] = self._responseToStr(cinfData)
					})
				})
			}
			// 2. TLS → then VERSION x3, INFO
			self.enqueue('TLS', null, 'TLS', (data) => {
				if (self.state && self.mediaDetails) self.state.updateMediaDetails(self.mediaDetails)
				handlers.handleTLS(self, data)
				self.state.updateFromTLS(data)
				self.enqueue('VERSION', null, 'VERSION', (line) => {
					self.variables.server_version = self._responseToStr(line)
					self.state.updateServerInfo({ version: self._responseToStr(line) })
					self.setVariableValues({ server_version: self.variables.server_version })
				})
				self.enqueue('VERSION FLASH', null, 'VERSION', (line) => {
					self.variables.flash_version = self._responseToStr(line)
					self.state.updateServerInfo({ flashVersion: self._responseToStr(line) })
					self.setVariableValues({ flash_version: self.variables.flash_version })
				})
				self.enqueue('VERSION TEMPLATEHOST', null, 'VERSION', (line) => {
					self.variables.templatehost_version = self._responseToStr(line)
					self.state.updateServerInfo({ templateHostVersion: self._responseToStr(line) })
					self.setVariableValues({ templatehost_version: self.variables.templatehost_version })
				})
				// 3. INFO (channel list) → then INFO PATHS, SYSTEM, CONFIG, INFO 1, INFO 2, ...
				self.enqueue('INFO', null, 'INFO', (lines) => {
					const arr = Array.isArray(lines) ? lines : (lines ? [String(lines)] : [])
					self.variables.channel_list = arr.join(' | ')
					self.gatheredInfo.channelIds = []
					arr.forEach((line) => {
						const m = String(line).trim().match(/^(\d+)\s+/)
						if (m) {
							const ch = parseInt(m[1], 10)
							if (!self.gatheredInfo.channelIds.includes(ch)) self.gatheredInfo.channelIds.push(ch)
							self.gatheredInfo.channelStatusLines[ch] = String(line).trim()
						}
					})
					self.setVariableValues({ channel_list: self.variables.channel_list })
					// Enqueue INFO PATHS, SYSTEM, CONFIG, then INFO per channel
					self.enqueue('INFO PATHS', null, 'INFO', (d) => {
						self.gatheredInfo.infoPaths = self._responseToStr(d)
						self.state.updateServerInfo({ paths: self._responseToStr(d) })
						self.variables.info_paths = self.gatheredInfo.infoPaths
						self.setVariableValues({ info_paths: self.variables.info_paths })
					})
					self.enqueue('INFO SYSTEM', null, 'INFO', (d) => {
						self.gatheredInfo.infoSystem = self._responseToStr(d)
						self.state.updateServerInfo({ system: self._responseToStr(d) })
						self.variables.info_system = self.gatheredInfo.infoSystem
						self.setVariableValues({ info_system: self.variables.info_system })
					})
					self.enqueue('INFO CONFIG', null, 'INFO', (d) => {
						self.gatheredInfo.infoConfig = self._responseToStr(d)
						self.state.updateServerInfo({ config: self._responseToStr(d) })
						self.variables.info_config = self.gatheredInfo.infoConfig
						self.setVariableValues({ info_config: self.variables.info_config })
						self.summarizeConsumersFromConfig(self.gatheredInfo.infoConfig, (summary) => {
							self.variables.server_consumers_summary = summary
							self.setVariableValues({ server_consumers_summary: summary })
						})
					variables.parseInfoConfigForDecklinks(self.gatheredInfo.infoConfig, (dl) => {
						self.gatheredInfo.decklinkFromConfig = dl || {}
					})
					const tpMatch = self.gatheredInfo.infoConfig.match(/<template-path>\s*(.*?)\s*<\/template-path>/i)
					if (tpMatch?.[1]) self._resolvedTemplatePath = tpMatch[1].replace(/[\\/]+$/, '')
						try {
							require('./config-compare').refreshConfigComparison(self)
						} catch (e) {
							self.log('debug', 'configComparison: ' + (e?.message || e))
						}
						if (self.gatheredInfo.channelIds.length === 0) {
							variables.updateDynamicVariables(self)
							presets.updateDynamicPresets(self)
							polling.startVariablePoll(self)
							if (self.checkFeedbacks) self.checkFeedbacks('program_tally', 'preview_tally')
							setupAllRouting(self).catch((e) => self.log('warn', 'Routing setup: ' + (e?.message || e)))
						}
					})
					const ids = self.gatheredInfo.channelIds
					ids.forEach((ch, idx) => {
						const isLast = idx === ids.length - 1
						self.enqueue('INFO', String(ch), 'INFO', (xmlLine) => {
							const xmlStr = typeof xmlLine === 'string' ? xmlLine : self._responseToStr(xmlLine)
							self.gatheredInfo.channelXml[String(ch)] = xmlStr
							self.state.updateFromInfo(ch, xmlStr)
							self.updateChannelVariablesFromXml(ch, xmlStr)
							if (isLast) {
								variables.updateDynamicVariables(self)
								presets.updateDynamicPresets(self)
								polling.startVariablePoll(self)
								if (self.checkFeedbacks) self.checkFeedbacks('program_tally', 'preview_tally')
								setupAllRouting(self).catch((e) => self.log('warn', 'Routing setup: ' + (e?.message || e)))
							}
						})
					})
				})
			})
			self.runCommandQueue()
		})
		this.runCommandQueue()
	}

	updateChannelVariablesFromXml(ch, xmlStr) {
		if (!xmlStr) return
		const self = this
		parseString(xmlStr, (err, result) => {
			if (err) return
			try {
				let framerate = ''
				const layerData = {}
				if (result.channel && result.channel.framerate && result.channel.framerate[0])
					framerate = result.channel.framerate[0]
				if (result.channel && result.channel.stage && result.channel.stage[0] && result.channel.stage[0].layer && result.channel.stage[0].layer[0]) {
					const layers = result.channel.stage[0].layer[0]
					Object.keys(layers).forEach((key) => {
						if (key.startsWith('layer_') && Array.isArray(layers[key]) && layers[key][0]) {
							const layerIdx = key.replace('layer_', '')
							const fg = layers[key][0].foreground && layers[key][0].foreground[0]
							const bg = layers[key][0].background && layers[key][0].background[0]
							let fgClip = ''
							let fgState = 'empty'
							let bgClip = ''
							let nbFrames = 0
							let currentFrame = 0
							if (fg && fg.producer && fg.producer[0]) {
								const p = fg.producer[0]
								fgClip = (p.$ && p.$.name) ? p.$.name : (p.name && p.name[0]) ? p.name[0] : ''
								fgState = fg.paused && fg.paused[0] === 'true' ? 'paused' : 'playing'
								nbFrames = parseInt(p['nb-frames'] && p['nb-frames'][0], 10) || 0
								currentFrame = parseInt(p.frame && p.frame[0], 10) || parseInt(p['frame-time'] && p['frame-time'][0], 10) || 0
							}
							if (fg && fg.file && fg.file[0]) {
								const f = fg.file[0]
								fgClip = (f.$ && f.$.name) ? f.$.name : (f.clip && f.clip[1]) ? String(f.clip[1]) : fgClip
								if (f.clip && f.clip[1]) nbFrames = Math.floor(parseFloat(f.clip[1]) * (parseInt(framerate, 10) || 1))
							}
							if (bg && bg.producer && bg.producer[0]) bgClip = (bg.producer[0].$ && bg.producer[0].$.name) ? bg.producer[0].$.name : ''
							const fpsNum = parseInt(framerate, 10) || 1
							const durationSec = nbFrames > 0 ? (nbFrames / fpsNum).toFixed(2) : ''
							const timeSec = nbFrames > 0 && currentFrame >= 0 ? (currentFrame / fpsNum).toFixed(2) : ''
							const remainingSec = nbFrames > 0 && currentFrame >= 0 ? ((nbFrames - currentFrame) / fpsNum).toFixed(2) : ''
							layerData[layerIdx] = { framerate, fgClip, fgState, bgClip, durationSec, timeSec, remainingSec }
						}
					})
				}
				if (result.layer && result.layer.foreground && result.layer.foreground[0]) {
					const p = result.layer.foreground[0].producer && result.layer.foreground[0].producer[0]
					if (p) {
						const fr = (p.fps && p.fps[0]) ? p.fps[0] : ''
						const nb = parseInt(p['nb-frames'] && p['nb-frames'][0], 10) || 0
						const cur = parseInt(p.frame && p.frame[0], 10) || 0
						const fpsNum = parseInt(fr, 10) || 1
						layerData['0'] = {
							framerate: fr,
							fgClip: (p.$ && p.$.name) ? p.$.name : (p.name && p.name[0]) ? p.name[0] : '',
							fgState: result.layer.foreground[0].paused && result.layer.foreground[0].paused[0] === 'true' ? 'paused' : 'playing',
							bgClip: '',
							durationSec: nb > 0 ? (nb / fpsNum).toFixed(2) : '',
							timeSec: nb > 0 && cur >= 0 ? (cur / fpsNum).toFixed(2) : '',
							remainingSec: nb > 0 && cur >= 0 ? ((nb - cur) / fpsNum).toFixed(2) : '',
						}
					}
				}
				Object.keys(layerData).forEach((layerIdx) => {
					const d = layerData[layerIdx]
					self.variables[`channel_${ch}_layer_${layerIdx}_fg_clip`] = d.fgClip || ''
					self.variables[`channel_${ch}_layer_${layerIdx}_state`] = d.fgState || 'empty'
					self.variables[`channel_${ch}_layer_${layerIdx}_bg_clip`] = d.bgClip || ''
					self.variables[`channel_${ch}_framerate`] = d.framerate || self.variables[`channel_${ch}_framerate`] || ''
					self.variables[`channel_${ch}_layer_${layerIdx}_duration_sec`] = (d.durationSec !== undefined && d.durationSec !== null) ? String(d.durationSec) : ''
					self.variables[`channel_${ch}_layer_${layerIdx}_time_sec`] = (d.timeSec !== undefined && d.timeSec !== null) ? String(d.timeSec) : ''
					self.variables[`channel_${ch}_layer_${layerIdx}_remaining_sec`] = (d.remainingSec !== undefined && d.remainingSec !== null) ? String(d.remainingSec) : ''
				})
				self.setVariableValues(self.variables)
				if (self.checkFeedbacks) self.checkFeedbacks('program_tally', 'preview_tally')
			} catch (e) {
				self.log('debug', 'Parse INFO XML: ' + e.message)
			}
		})
	}

	// Normalize AMCP response to string for variables (single line or multi-line array)
	_responseToStr(data) {
		if (data == null) return ''
		if (Array.isArray(data)) return data.join('\n')
		return String(data)
	}

	// Send OSC message to CasparCG Client (UDP). Path e.g. /control/play, /control/stop
	sendOsc(path) {
		const port = parseInt(this.config && this.config.osc_port ? this.config.osc_port : '0', 10)
		if (!port || !this.config.host) return
		const p = String(path || '').trim()
		if (!p.startsWith('/')) return
		const pathBuf = Buffer.from(p + '\0', 'utf8')
		const pathPadded = Buffer.alloc(Math.ceil((pathBuf.length + 1) / 4) * 4)
		pathBuf.copy(pathPadded)
		const tagBuf = Buffer.from(',\0\0\0', 'utf8') // no arguments
		const msg = Buffer.concat([pathPadded, tagBuf])
		const client = dgram.createSocket('udp4')
		client.send(msg, 0, msg.length, port, this.config.host, (err) => {
			if (err) this.log('debug', 'OSC send: ' + err.message)
			client.close()
		})
	}

	executeGOTO(data, options) {
		handlers.executeGOTO(this, data, options)
	}

	init_actions() {
		this.setActionDefinitions(compileActionDefinitions(this))
	}
	// responseKey: optional key for callback queue (server echoes first word of command, e.g. "INFO" for "INFO PATHS")
	requestData(command, params, callback, responseKey) {
		if (this.socket && this.socket.isConnected) {
			const fullCommand = (command + (params != null && params !== '' ? ' ' + params : '')).trim().toUpperCase()
			const key = responseKey !== undefined ? String(responseKey).toUpperCase() : fullCommand.split(/\s+/)[0]

			if (this.response_callback[key] === undefined) {
				this.response_callback[key] = []
			}
			this.response_callback[key].push(callback)
			this._pendingResponseKey = key
			this.socket.send(fullCommand + '\r\n')
		}
	}

	applyServerConfigAndRestart() {
		const xml = buildConfigXml(this.config)
		let name = (this.config.server_config_filename || 'casparcg.config').trim() || 'casparcg.config'
		// Server adds .ftd when storing; never send a name that already ends in .ftd
		if (name.toLowerCase().endsWith('.ftd')) {
			name = name.slice(0, -4).trim() || 'casparcg.config'
		}
		const restartCmd = (this.config.server_config_restart_command || '').trim()
		if (!this.socket || !this.socket.isConnected) {
			this.log('warn', 'Apply server config: not connected')
			return
		}
		if (!xml || !xml.trim()) {
			this.log('warn', 'Apply server config: generated config XML is empty')
			return
		}
		this.log('debug', 'Generated config XML:\n' + xml)
		// One TCP line with \n in payload (match working client: literal backslash-n inside quotes)
		const escaped = xml
			.replace(/\\/g, '\\\\')
			.replace(/"/g, '\\"')
			.replace(/\r\n/g, '\\n')
			.replace(/\r/g, '\\n')
			.replace(/\n/g, '\\n')
		const dataStoreCmd = `DATA STORE "${name}" "${escaped}"`
		this.log('debug', 'Sending DATA STORE ' + name)
		// Wait for DATA STORE response before sending RESTART
		const key = 'DATA'
		if (this.response_callback[key] === undefined) this.response_callback[key] = []
		this.response_callback[key].push((err, line) => {
			if (err) {
				this.log('warn', 'Apply server config: DATA STORE failed, not sending restart')
				return
			}
			if (restartCmd) {
				this.log('debug', 'Sending restart: ' + restartCmd)
				this.socket.send(restartCmd.toUpperCase() + '\r\n')
			}
		})
		this._pendingResponseKey = key
		this.socket.send(dataStoreCmd + '\r\n')
	}
}

module.exports = instance
