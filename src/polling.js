const { parseString } = require('xml2js')
const variables = require('./variables')

/**
 * @param {object} self - Module instance
 */
function refreshVariables(self) {
	if (!self.socket || !self.socket.isConnected) return

	const pollCh = self.config && self.config.poll_channel ? String(self.config.poll_channel) : '1'

	// VERSION family (server echoes "VERSION") – order must match response order
	self.requestData('VERSION', null, (line) => {
		self.variables.server_version = self._responseToStr(line)
		self.setVariableValues({ server_version: self.variables.server_version })
	})
	self.requestData('VERSION FLASH', null, (line) => {
		self.variables.flash_version = self._responseToStr(line)
		self.setVariableValues({ flash_version: self.variables.flash_version })
	}, 'VERSION')
	self.requestData('VERSION TEMPLATEHOST', null, (line) => {
		self.variables.templatehost_version = self._responseToStr(line)
		self.setVariableValues({ templatehost_version: self.variables.templatehost_version })
	}, 'VERSION')

	// INFO family (server echoes "INFO") – order must match response order
	self.requestData('INFO', null, (lines) => {
		const list = Array.isArray(lines) ? lines.join(' | ') : self._responseToStr(lines)
		self.variables.channel_list = list
		const channel = parseInt(pollCh, 10)
		const chStatus = Array.isArray(lines) ? (lines.find((l) => String(l).trim().startsWith(channel + ' ')) || (lines[0] || '')) : ''
		self.variables.channel_1_status = chStatus
		self.setVariableValues({
			channel_list: self.variables.channel_list,
			channel_1_status: self.variables.channel_1_status,
		})
	})
	self.requestData('INFO', pollCh, (xmlLine) => {
		if (!xmlLine || typeof xmlLine !== 'string') return
		parseString(xmlLine, (err, result) => {
			if (err) {
				self.variables.channel_1_framerate = ''
				self.variables.channel_1_layer_0_clip = ''
				self.variables.channel_1_layer_0_state = ''
			} else {
				try {
					let framerate = ''
					let clipName = ''
					let state = 'empty'
					if (result.layer) {
						framerate = (result.layer.foreground && result.layer.foreground[0].producer && result.layer.foreground[0].producer[0].fps && result.layer.foreground[0].producer[0].fps[0]) ? result.layer.foreground[0].producer[0].fps[0] : ''
						if (result.layer.foreground && result.layer.foreground[0].producer) {
							const p = result.layer.foreground[0].producer[0]
							clipName = (p.$ && p.$.name) ? p.$.name : (p.name && p.name[0]) ? p.name[0] : ''
							state = result.layer.foreground[0].paused && result.layer.foreground[0].paused[0] === 'true' ? 'paused' : 'playing'
						}
					} else if (result.channel) {
						framerate = (result.channel.framerate && result.channel.framerate[0]) ? result.channel.framerate[0] : ''
						const layers = result.channel.stage && result.channel.stage[0] && result.channel.stage[0].layer && result.channel.stage[0].layer[0]
						if (layers && layers.layer_0 && layers.layer_0[0].foreground) {
							const fg = layers.layer_0[0].foreground[0]
							if (fg.file && fg.file[0].$) clipName = fg.file[0].$.name || (fg.file[0].clip && fg.file[0].clip[0]) || ''
							else if (fg.producer) clipName = fg.producer[0].$.name || ''
							state = fg.paused && fg.paused[0] === 'true' ? 'paused' : 'playing'
						}
					}
					self.variables.channel_1_framerate = String(framerate)
					self.variables.channel_1_layer_0_clip = String(clipName)
					self.variables.channel_1_layer_0_state = state
				} catch (e) {
					self.variables.channel_1_framerate = ''
					self.variables.channel_1_layer_0_clip = ''
					self.variables.channel_1_layer_0_state = ''
				}
			}
			self.setVariableValues({
				channel_1_framerate: self.variables.channel_1_framerate,
				channel_1_layer_0_clip: self.variables.channel_1_layer_0_clip,
				channel_1_layer_0_state: self.variables.channel_1_layer_0_state,
			})
		})
	})
	self.requestData('INFO PATHS', null, (data) => {
		self.variables.info_paths = self._responseToStr(data)
		self.setVariableValues({ info_paths: self.variables.info_paths })
	})
	self.requestData('INFO SYSTEM', null, (data) => {
		self.variables.info_system = self._responseToStr(data)
		self.setVariableValues({ info_system: self.variables.info_system })
	})
	self.requestData('INFO CONFIG', null, (data) => {
		const raw = self._responseToStr(data)
		self.gatheredInfo.infoConfig = raw
		self.variables.info_config = raw
		self.setVariableValues({ info_config: self.variables.info_config })
		self.summarizeConsumersFromConfig(raw, (summary) => {
			self.variables.server_consumers_summary = summary
			self.setVariableValues({ server_consumers_summary: summary })
		})
		variables.parseInfoConfigForDecklinks(raw, (dl) => {
			self.gatheredInfo.decklinkFromConfig = dl || {}
		})
		try {
			require('./config-compare').refreshConfigComparison(self)
		} catch (_) {}
	})
}

/**
 * @param {object} self - Module instance
 */
function startVariablePoll(self) {
	if (self.pollTimer) {
		clearInterval(self.pollTimer)
		self.pollTimer = null
	}
	if (self.realtimePollTimer) {
		clearInterval(self.realtimePollTimer)
		self.realtimePollTimer = null
	}
	const sec = parseInt(self.config && self.config.poll_interval ? self.config.poll_interval : '0', 10)
	if (sec > 0) {
		self.pollTimer = setInterval(() => refreshVariablesLight(self), sec * 1000)
		const realtimeMs = parseInt(self.config && self.config.realtime_poll_interval ? self.config.realtime_poll_interval : '0', 10)
		if (realtimeMs > 0) {
			self.realtimePollTimer = setInterval(() => refreshRealtime(self), realtimeMs)
		}
	}
}

/**
 * Fast poll: INFO per channel only (state, duration, time, remaining)
 * @param {object} self - Module instance
 */
function refreshRealtime(self) {
	if (!self.socket || !self.socket.isConnected || self.commandQueue.length > 0) return
	const ids = self.gatheredInfo.channelIds.length ? self.gatheredInfo.channelIds : [1]
	ids.forEach((ch, idx) => {
		self.enqueue('INFO', String(ch), 'INFO', (xmlLine) => {
			const str = typeof xmlLine === 'string' ? xmlLine : self._responseToStr(xmlLine)
			if (self.state) self.state.updateFromInfo(ch, str)
			self.updateChannelVariablesFromXml(ch, str)
			if (idx === ids.length - 1) {
				self.setVariableValues(self.variables)
				if (self.checkFeedbacks) self.checkFeedbacks('program_tally', 'preview_tally')
			}
		})
	})
	self.runCommandQueue()
}

/**
 * Light refresh: INFO + INFO per channel only (updates channel/layer variables and tally)
 * @param {object} self - Module instance
 */
function refreshVariablesLight(self) {
	if (!self.socket || !self.socket.isConnected || self.commandQueue.length > 0) return
	const ids = self.gatheredInfo.channelIds.length ? self.gatheredInfo.channelIds : [1]
	self.enqueue('INFO', null, 'INFO', (lines) => {
		const arr = Array.isArray(lines) ? lines : (lines ? [String(lines)] : [])
		self.variables.channel_list = arr.join(' | ')
		arr.forEach((line) => {
			const m = String(line).trim().match(/^(\d+)\s+/)
			if (m) {
				const ch = parseInt(m[1], 10)
				self.gatheredInfo.channelStatusLines[ch] = String(line).trim()
				if (!self.gatheredInfo.channelIds.includes(ch)) self.gatheredInfo.channelIds.push(ch)
			}
		})
		ids.forEach((ch, idx) => {
			const isLast = idx === ids.length - 1
			self.enqueue('INFO', String(ch), 'INFO', (xmlLine) => {
				const str = typeof xmlLine === 'string' ? xmlLine : self._responseToStr(xmlLine)
				self.gatheredInfo.channelXml[String(ch)] = str
				if (self.state) self.state.updateFromInfo(ch, str)
				self.updateChannelVariablesFromXml(ch, str)
				if (isLast) {
					self.setVariableValues(self.variables)
					if (self.checkFeedbacks) self.checkFeedbacks('program_tally', 'preview_tally')
				}
			})
		})
		self.runCommandQueue()
	})
	self.runCommandQueue()
}

module.exports = { refreshVariables, refreshVariablesLight, refreshRealtime, startVariablePoll }
