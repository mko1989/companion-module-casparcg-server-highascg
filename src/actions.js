const { Regex } = require('@companion-module/base')
const { getCgActions } = require('./cg-actions')
const { getMixerActions } = require('./mixer-actions')
const { getDataActions } = require('./data-actions')
const { getSelectionActions } = require('./selection-actions')

function AMCP_PARAMETER(data) {
	data = data.replace(/"/g, '\\"')
	if (data.match(/\s/)) return '"' + data + '"'
	return data
}

module.exports = function compileActionDefinitions(self) {
	const CHOICES_YESNO_BOOLEAN = [
		{ id: 'true', label: 'Yes' },
		{ id: 'false', label: 'No' },
	]

	const LOADPLAYPARAMS = [
		{
			label: 'Channel',
			type: 'textinput',
			id: 'channel',
			default: 1,
			regex: '/^\\d+$/',
		},
		{
			label: 'Layer',
			type: 'textinput',
			id: 'layer',
			default: '',
			regex: '/^\\d*$/',
		},
		{
			label: 'Clip',
			type: 'dropdown',
			id: 'clip_dd',
			default: '',
			choices: [{ id: '', label: '(None)' }, ...(self.CHOICES_MEDIAFILES || [])],
			allowCustom: true,
		},
		{
			label: 'Or clip name',
			type: 'textinput',
			id: 'clip',
			default: '',
		},
		{
			label: 'Loop clip',
			type: 'dropdown',
			id: 'loop',
			default: 'false',
			choices: CHOICES_YESNO_BOOLEAN,
		},
		{
			label: 'Autostart after FG clip',
			type: 'dropdown',
			id: 'auto',
			default: 'false',
			choices: CHOICES_YESNO_BOOLEAN,
		},
		{
			label: 'Transition',
			type: 'dropdown',
			id: 'transition',
			default: 'CUT',
			choices: [
				{ label: 'CUT', id: 'CUT' },
				{ label: 'MIX', id: 'MIX' },
				{ label: 'PUSH', id: 'PUSH' },
				{ label: 'WIPE', id: 'WIPE' },
				{ label: 'SLIDE', id: 'SLIDE' },
			],
		},
		{
			label: 'Transition duration',
			type: 'textinput',
			id: 'transition_duration',
			default: '0',
			regex: '/^\\d*$/',
		},
		{
			label: 'Transition tween',
			type: 'textinput',
			id: 'transition_tween',
			default: 'linear',
		},
	]

	const PAUSERESUMESTOPCLEARPARAMS = [
		{
			label: 'Channel',
			type: 'textinput',
			id: 'channel',
			default: 1,
			regex: '/^\\d+$/',
		},
		{
			label: 'Layer',
			type: 'textinput',
			id: 'layer',
			default: '',
			regex: '/^\\d*$/',
		},
	]

	const sendCommand = async (cmd) => {
		if (!cmd) return
		self.log('debug', 'sending tcp ' + cmd + ' to ' + self.config.host)
		try {
			const value = await self.parseVariablesInString(cmd)
			await self.amcp.raw(value)
		} catch (e) {
			if (!self.socket || !self.socket.isConnected) {
				self.log('debug', 'Socket not connected :(')
			} else {
				self.log('debug', 'AMCP error: ' + (e?.message || e))
			}
		}
	}
	const sendLoadPlay = (cmd, action) => {
		let out = cmd + ' ' + parseInt(action.options.channel)

		if (action.options.layer != '') {
			out += '-' + parseInt(action.options.layer)
		}

		if (action.options.clip) {
			out += ' ' + AMCP_PARAMETER(action.options.clip)
		} else if (action.options.clip_dd) {
			out += ' ' + AMCP_PARAMETER(action.options.clip_dd)
		}

		if (action.options.loop == 'true') {
			out += ' LOOP'
		}

		if (action.options.transition != 'CUT') {
			out += ' ' + action.options.transition
			out += ' ' + (parseFloat(action.options.transition_duration) || 0)
			out += ' ' + AMCP_PARAMETER(action.options.transition_tween)
		}

		if (action.options.auto == 'true') {
			out += ' AUTO'
		}

		sendCommand(out)
	}
	const sendPauseResumeStopClear = (cmd, action) => {
		let out = cmd + ' ' + parseInt(action.options.channel)

		if (action.options.layer != '') {
			out += '-' + parseInt(action.options.layer)
		}

		sendCommand(out)
	}

	const cgActions = getCgActions(self, sendCommand)
	const mixerActions = getMixerActions(self)
	const dataActions = getDataActions(self)

	return Object.assign({
		LOADBG: {
			name: 'LOADBG',
			options: LOADPLAYPARAMS,
			callback: (action) => {
				sendLoadPlay('LOADBG', action)
			},
		},
		LOAD: {
			name: 'LOAD',
			options: LOADPLAYPARAMS,
			callback: (action) => {
				sendLoadPlay('LOAD', action)
			},
		},
		PLAY: {
			name: 'PLAY',
			options: LOADPLAYPARAMS,
			callback: (action) => {
				sendLoadPlay('PLAY', action)
			},
		},
		PAUSE: {
			name: 'PAUSE',
			options: PAUSERESUMESTOPCLEARPARAMS,
			callback: (action) => {
				sendPauseResumeStopClear('PAUSE', action)
			},
		},
		RESUME: {
			name: 'RESUME',
			options: PAUSERESUMESTOPCLEARPARAMS,
			callback: (action) => {
				sendPauseResumeStopClear('RESUME', action)
			},
		},
		STOP: {
			name: 'STOP',
			options: PAUSERESUMESTOPCLEARPARAMS,
			callback: (action) => {
				sendPauseResumeStopClear('STOP', action)
			},
		},
		CLEAR: {
			name: 'CLEAR',
			options: PAUSERESUMESTOPCLEARPARAMS,
			callback: (action) => {
				sendPauseResumeStopClear('CLEAR', action)
			},
		},
		CALL: {
			name: 'CALL',
			options: [
				{
					label: 'Channel',
					type: 'textinput',
					id: 'channel',
					default: 1,
					regex: '/^\\d+$/',
				},
				{
					label: 'Layer',
					type: 'textinput',
					id: 'layer',
					default: '',
					regex: '/^\\d*$/',
				},
				{
					label: 'Method',
					type: 'textinput',
					id: 'method',
					default: 'SEEK 0',
					regex: '/^.+$/',
				},
			],
			callback: (action) => {
				let cmd = 'CALL ' + parseInt(action.options.channel)

				if (action.options.layer != '') {
					cmd += '-' + parseInt(action.options.layer)
				}

				// This should not be ACMP_PARAMETER-sanetized, since it is actual commands/parameters
				cmd += ' ' + action.options.method

				sendCommand(cmd)
			},
		},
		SWAP: {
			name: 'SWAP',
			options: [
				{
					label: 'Channel 1',
					type: 'textinput',
					id: 'channel1',
					default: 1,
					regex: '/^\\d+$/',
				},
				{
					label: 'Layer 1',
					type: 'textinput',
					id: 'layer1',
					default: '',
					regex: '/^\\d*$/',
				},
				{
					label: 'Channel 2',
					type: 'textinput',
					id: 'channel2',
					default: 1,
					regex: '/^\\d+$/',
				},
				{
					label: 'Layer 2',
					type: 'textinput',
					id: 'layer2',
					default: '',
					regex: '/^\\d*$/',
				},
				{
					label: 'Swap transforms',
					type: 'dropdown',
					id: 'transforms',
					choices: CHOICES_YESNO_BOOLEAN,
					default: 'false',
				},
			],
			callback: (action) => {
				let cmd = 'SWAP ' + parseInt(action.options.channel1)

				if (action.options.layer1 != '') {
					cmd += '-' + parseInt(action.options.layer1)
				}

				cmd += ' ' + parseInt(action.options.channel2)

				if (action.options.layer2 != '') {
					cmd += '-' + parseInt(action.options.layer2)
				}

				if (action.options.transforms == 'true') {
					cmd += ' TRANSFORMS'
				}

				sendCommand(cmd)
			},
		},
		COMMAND: {
			name: 'Manually specify AMCP command',
			options: [
				{
					type: 'textinput',
					label: 'Command',
					id: 'cmd',
					default: 'CLEAR 1',
					useVariables: true,
				},
			],
			callback: (action) => {
				sendCommand(action.options.cmd)
			},
		},
		REFRESH_VARIABLES: {
			name: 'Refresh variables (full AMCP query cycle)',
			options: [],
			callback: () => {
				if (self.runConnectionQueryCycle && typeof self.runConnectionQueryCycle === 'function') {
					self.runConnectionQueryCycle()
				}
			},
		},
		REFRESH_MEDIA_LIBRARY: {
			name: 'Refresh media library',
			options: [],
			callback: () => {
				if (self.runConnectionQueryCycle && typeof self.runConnectionQueryCycle === 'function') {
					self.runConnectionQueryCycle()
				}
			},
		},
		APPLY_SERVER_CONFIG: {
			name: 'Apply server config and restart',
			options: [],
			callback: () => {
				if (self.applyServerConfigAndRestart && typeof self.applyServerConfigAndRestart === 'function') {
					self.applyServerConfigAndRestart()
				}
			},
		},
		OSC: {
			name: 'Send OSC (CasparCG Client)',
			options: [
				{
					type: 'textinput',
					label: 'OSC path',
					id: 'path',
					default: '/control/play',
					useVariables: true,
					tooltip: 'e.g. /control/play, /control/stop, /control/load, /control/pause, /control/clear',
				},
			],
			callback: async (action) => {
				const path = await self.parseVariablesInString(action.options.path || '')
				if (self.sendOsc && typeof self.sendOsc === 'function') self.sendOsc(path)
			},
		},
		GOTO: {
			name: 'Goto to file position (in seconds)',
			options: [
				{
					label: 'Channel',
					type: 'textinput',
					id: 'channel',
					default: 1,
					regex: '/^\\d+$/',
				},
				{
					label: 'Layer',
					type: 'textinput',
					id: 'layer',
					default: '0',
					regex: '/^\\d*$/',
				},
				{
					type: 'textinput',
					label: 'Seconds (from end: prefix "-")',
					id: 'offset',
					default: '',
					useVariables: true,
				},
			],
			callback: (action) => {
				let params = parseInt(action.options.channel)
				if (action.options.layer != '') {
					params += '-' + parseInt(action.options.layer)
				}

				self.requestData('INFO', params, (data) => self.executeGOTO(data, action.options))
			},
		},
		ADD: {
			name: 'ADD consumer',
			options: [
				{ label: 'Channel', type: 'textinput', id: 'channel', default: '1', regex: '/^\\d+$/' },
				{ label: 'Consumer', type: 'textinput', id: 'consumer', default: 'SCREEN', tooltip: 'e.g. SCREEN, DECKLINK 1' },
				{ label: 'Params', type: 'textinput', id: 'params', default: '', useVariables: true },
			],
			callback: async (action) => {
				const ch = parseInt(await self.parseVariablesInString(action.options.channel || '1'), 10)
				const consumer = await self.parseVariablesInString(action.options.consumer || 'SCREEN')
				const params = await self.parseVariablesInString(action.options.params || '')
				try {
					await self.amcp.add(ch, consumer, params || undefined)
				} catch (e) {
					self.log('debug', 'AMCP: ' + (e?.message || e))
				}
			},
		},
		REMOVE: {
			name: 'REMOVE consumer',
			options: [
				{ label: 'Channel', type: 'textinput', id: 'channel', default: '1', regex: '/^\\d+$/' },
				{ label: 'Consumer', type: 'textinput', id: 'consumer', default: 'SCREEN', tooltip: 'e.g. SCREEN, DECKLINK 1' },
				{ label: 'Params', type: 'textinput', id: 'params', default: '', useVariables: true },
			],
			callback: async (action) => {
				const ch = parseInt(await self.parseVariablesInString(action.options.channel || '1'), 10)
				const consumer = await self.parseVariablesInString(action.options.consumer || 'SCREEN')
				const params = await self.parseVariablesInString(action.options.params || '')
				try {
					await self.amcp.remove(ch, consumer, params || undefined)
				} catch (e) {
					self.log('debug', 'AMCP: ' + (e?.message || e))
				}
			},
		},
		CHANNEL_GRID: {
			name: 'CHANNEL GRID',
			options: [],
			callback: () => {
				self.amcp.channelGrid().catch((e) => self.log('debug', 'AMCP: ' + (e?.message || e)))
			},
		},
		DIAG: {
			name: 'DIAG',
			options: [],
			callback: () => {
				self.amcp.diag().catch((e) => self.log('debug', 'AMCP: ' + (e?.message || e)))
			},
		},
		KILL: {
			name: 'KILL',
			options: [],
			callback: () => {
				self.amcp.kill().catch((e) => self.log('debug', 'AMCP: ' + (e?.message || e)))
			},
		},
	}, cgActions, mixerActions, dataActions, getSelectionActions(self), {
		TL_KF_OPACITY: {
			name: 'Timeline: Add opacity keyframe at current time',
			options: [
				{ label: 'Layer', type: 'textinput', id: 'layer', default: '1', regex: '/^\\d+$/', tooltip: '1-based layer index' },
				{ label: 'Value (0–1)', type: 'textinput', id: 'value', default: '1' },
			],
			callback: async (action) => {
				const li = parseInt(await self.parseVariablesInString(action.options.layer || '1'), 10) - 1
				const val = parseFloat(await self.parseVariablesInString(action.options.value || '1'))
				if (!isNaN(val)) self.timelineEngine.addKeyframeAtNow(null, li, 'opacity', Math.max(0, Math.min(1, val)))
			},
		},
		TL_KF_VOLUME: {
			name: 'Timeline: Add volume keyframe at current time',
			options: [
				{ label: 'Layer', type: 'textinput', id: 'layer', default: '1', regex: '/^\\d+$/' },
				{ label: 'Value (0–2)', type: 'textinput', id: 'value', default: '1' },
			],
			callback: async (action) => {
				const li = parseInt(await self.parseVariablesInString(action.options.layer || '1'), 10) - 1
				const val = parseFloat(await self.parseVariablesInString(action.options.value || '1'))
				if (!isNaN(val)) self.timelineEngine.addKeyframeAtNow(null, li, 'volume', Math.max(0, Math.min(2, val)))
			},
		},
		TL_KF_POSITION: {
			name: 'Timeline: Add position keyframe at current time',
			options: [
				{ label: 'Layer', type: 'textinput', id: 'layer', default: '1', regex: '/^\\d+$/' },
				{ label: 'X (0–1)', type: 'textinput', id: 'x', default: '0' },
				{ label: 'Y (0–1)', type: 'textinput', id: 'y', default: '0' },
			],
			callback: async (action) => {
				const li = parseInt(await self.parseVariablesInString(action.options.layer || '1'), 10) - 1
				const x = parseFloat(await self.parseVariablesInString(action.options.x || '0'))
				const y = parseFloat(await self.parseVariablesInString(action.options.y || '0'))
				if (!isNaN(x)) self.timelineEngine.addKeyframeAtNow(null, li, 'fill_x', x)
				if (!isNaN(y)) self.timelineEngine.addKeyframeAtNow(null, li, 'fill_y', y)
			},
		},
		TL_KF_SCALE: {
			name: 'Timeline: Add scale keyframe at current time',
			options: [
				{ label: 'Layer', type: 'textinput', id: 'layer', default: '1', regex: '/^\\d+$/' },
				{ label: 'Scale X (0–4)', type: 'textinput', id: 'sx', default: '1' },
				{ label: 'Scale Y (0–4)', type: 'textinput', id: 'sy', default: '1' },
			],
			callback: async (action) => {
				const li = parseInt(await self.parseVariablesInString(action.options.layer || '1'), 10) - 1
				const sx = parseFloat(await self.parseVariablesInString(action.options.sx || '1'))
				const sy = parseFloat(await self.parseVariablesInString(action.options.sy || '1'))
				if (!isNaN(sx)) self.timelineEngine.addKeyframeAtNow(null, li, 'scale_x', sx)
				if (!isNaN(sy)) self.timelineEngine.addKeyframeAtNow(null, li, 'scale_y', sy)
			},
		},
		TL_PLACE_KEYFRAME: {
			name: 'Timeline: Place keyframe (capture current value)',
			options: [
				{
					label: 'Timeline',
					type: 'dropdown',
					id: 'timeline_mode',
					default: 'active',
					choices: [
						{ id: 'active', label: 'Active playback timeline' },
						{ id: 'ui_sel', label: 'Web UI selection (timeline clip)' },
						{ id: 'manual', label: 'Manual timeline ID' },
					],
				},
				{
					label: 'Timeline ID (manual)',
					type: 'textinput',
					id: 'timeline_id',
					default: '',
					useVariables: true,
					tooltip: 'When Timeline = Manual ID',
				},
				{
					label: 'Layer',
					type: 'dropdown',
					id: 'layer_mode',
					default: 'manual',
					choices: [
						{ id: 'manual', label: 'Manual layer #' },
						{ id: 'ui_sel', label: 'Web UI selection (timeline clip)' },
					],
				},
				{ label: 'Layer # (1-based)', type: 'textinput', id: 'layer', default: '1', regex: '/^\\d+$/' },
				{
					label: 'Parameter',
					type: 'dropdown',
					id: 'param',
					default: 'opacity',
					choices: [
						{ id: 'opacity', label: 'Opacity' },
						{ id: 'volume', label: 'Volume' },
						{ id: 'position', label: 'Position (fill X + Y)' },
						{ id: 'scale', label: 'Scale (scale X + Y)' },
						{ id: 'fill_x', label: 'Fill X only' },
						{ id: 'fill_y', label: 'Fill Y only' },
						{ id: 'scale_x', label: 'Scale X only' },
						{ id: 'scale_y', label: 'Scale Y only' },
					],
				},
			],
			callback: async (action) => {
				const tmode = action.options.timeline_mode || 'active'
				const lmode = action.options.layer_mode || 'manual'
				const param = action.options.param || 'opacity'

				let timelineId = null
				if (tmode === 'active') timelineId = self.timelineEngine._pb?.timelineId
				else if (tmode === 'ui_sel') timelineId = self._uiSelection?.context === 'timeline_clip' ? self._uiSelection?.timeline?.timelineId : null
				else timelineId = String(await self.parseVariablesInString(action.options.timeline_id || '')).trim() || null

				let layerIdx = -1
				if (lmode === 'ui_sel') {
					if (self._uiSelection?.context === 'timeline_clip' && typeof self._uiSelection?.timeline?.layerIdx === 'number')
						layerIdx = self._uiSelection.timeline.layerIdx
				} else {
					layerIdx = parseInt(await self.parseVariablesInString(action.options.layer || '1'), 10) - 1
				}

				if (!timelineId) {
					self.log('warn', 'TL_PLACE_KEYFRAME: no timeline (start playback, select a clip in the web UI, or set manual ID)')
					return
				}
				if (layerIdx < 0) {
					self.log('warn', 'TL_PLACE_KEYFRAME: invalid layer (set manual layer # or select a timeline clip in the web UI)')
					return
				}

				const ok = self.timelineEngine.captureKeyframeAtNow(timelineId, layerIdx, param)
				if (!ok) self.log('warn', 'TL_PLACE_KEYFRAME: no clip at current playhead on that layer')
			},
		},
	})
}
