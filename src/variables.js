const { parseString } = require('xml2js')
const uiSelection = require('./ui-selection')

/**
 * @param {object} self - Module instance
 */
function initVariables(self) {
	const uiDefs = uiSelection.getUiSelectionVariableDefinitions()
	self.setVariableDefinitions([
		{ variableId: 'channel_list', name: 'Channel list' },
		{ variableId: 'server_version', name: 'Server version' },
		{ variableId: 'info_paths', name: 'Paths' },
		{ variableId: 'info_system', name: 'System' },
		{ variableId: 'info_config', name: 'Config' },
		{ variableId: 'server_consumers_summary', name: 'Server consumers summary' },
		{ variableId: 'media_count', name: 'Media count' },
		{ variableId: 'template_count', name: 'Template count' },
		...uiDefs,
	])
	for (const d of uiDefs) {
		if (self.variables[d.variableId] === undefined) self.variables[d.variableId] = ''
	}
	self.setVariableValues(self.variables)
	uiSelection.updateUiSelectionVariables(self)
}

/**
 * @param {object} self - Module instance
 */
function updateDynamicVariables(self) {
	const defs = [
		{ variableId: 'server_version', name: 'Server version' },
		{ variableId: 'flash_version', name: 'Flash version' },
		{ variableId: 'templatehost_version', name: 'Template host version' },
		{ variableId: 'channel_list', name: 'Channel list' },
		{ variableId: 'info_paths', name: 'Paths (INFO PATHS)' },
		{ variableId: 'info_system', name: 'System (INFO SYSTEM)' },
		{ variableId: 'info_config', name: 'Config (INFO CONFIG)' },
		{ variableId: 'server_consumers_summary', name: 'Server consumers summary' },
		{ variableId: 'media_count', name: 'Media count' },
		{ variableId: 'template_count', name: 'Template count' },
	]
	self.gatheredInfo.channelIds.forEach((ch) => {
		if (self.gatheredInfo.channelStatusLines[ch]) defs.push({ variableId: `channel_${ch}_status`, name: `Channel ${ch} status` })
		defs.push({ variableId: `channel_${ch}_framerate`, name: `Channel ${ch} framerate` })
		;[0, 1].forEach((layer) => {
			defs.push(
				{ variableId: `channel_${ch}_layer_${layer}_fg_clip`, name: `Ch ${ch} L${layer} FG (program)` },
				{ variableId: `channel_${ch}_layer_${layer}_state`, name: `Ch ${ch} L${layer} state` },
				{ variableId: `channel_${ch}_layer_${layer}_bg_clip`, name: `Ch ${ch} L${layer} BG (preview)` },
				{ variableId: `channel_${ch}_layer_${layer}_duration_sec`, name: `Ch ${ch} L${layer} duration (s)` },
				{ variableId: `channel_${ch}_layer_${layer}_time_sec`, name: `Ch ${ch} L${layer} time (s)` },
				{ variableId: `channel_${ch}_layer_${layer}_remaining_sec`, name: `Ch ${ch} L${layer} remaining (s)` }
			)
		})
	})
	Object.keys(self.mediaDetails).forEach((filename, i) => {
		const id = `media_cinf_${i}`
		defs.push({ variableId: id, name: `Media: ${filename}` })
		self.variables[id] = self.mediaDetails[filename] || ''
	})
	defs.push(...uiSelection.getUiSelectionVariableDefinitions())
	self.setVariableDefinitions(defs)
	self.setVariableValues(self.variables)
	uiSelection.updateUiSelectionVariables(self)
}

/**
 * @param {string} configXml - CasparCG config XML string
 * @param {Function} done - Callback with summary string
 */
function summarizeConsumersFromConfig(configXml, done) {
	if (!configXml || typeof configXml !== 'string') {
		if (typeof done === 'function') done('')
		return
	}
	parseString(configXml, (err, result) => {
		let summary = ''
		if (!err)
			try {
				const channels = result.configuration && result.configuration.channels && result.configuration.channels[0] && result.configuration.channels[0].channel
				if (channels && Array.isArray(channels))
					channels.forEach((ch, idx) => {
						const chNum = idx + 1
						const videoMode = ch['video-mode'] && ch['video-mode'][0] ? ch['video-mode'][0] : ''
						const consumers = ch.consumers && ch.consumers[0]
						const screens = consumers && consumers.screen ? (Array.isArray(consumers.screen) ? consumers.screen : [consumers.screen]) : []
						const parts = []
						screens.forEach((s) => {
							const dev = s.device && s.device[0] ? s.device[0] : ''
							const w = s.width && s.width[0] ? s.width[0] : ''
							const h = s.height && s.height[0] ? s.height[0] : ''
							parts.push('screen dev ' + dev + (w && h ? ' ' + w + 'x' + h : ''))
						})
						const consStr = parts.length ? parts.join('; ') : '(none)'
						if (summary) summary += ' | '
						summary += 'Ch' + chNum + ': ' + (videoMode ? videoMode + ' ' : '') + consStr
					})
			} catch (_) {}
		if (typeof done === 'function') done(summary)
	})
}

/** Standard video mode id -> { width, height, fps } for resolving from INFO CONFIG. */
const STANDARD_VIDEO_MODES = {
	PAL: { width: 720, height: 576, fps: 25 },
	NTSC: { width: 720, height: 486, fps: 29.97 },
	'576p2500': { width: 720, height: 576, fps: 25 },
	'720p2398': { width: 1280, height: 720, fps: 23.98 },
	'720p2400': { width: 1280, height: 720, fps: 24 },
	'720p2500': { width: 1280, height: 720, fps: 25 },
	'720p5000': { width: 1280, height: 720, fps: 50 },
	'720p2997': { width: 1280, height: 720, fps: 29.97 },
	'720p5994': { width: 1280, height: 720, fps: 59.94 },
	'720p3000': { width: 1280, height: 720, fps: 30 },
	'720p6000': { width: 1280, height: 720, fps: 60 },
	'1080p2398': { width: 1920, height: 1080, fps: 23.98 },
	'1080p2400': { width: 1920, height: 1080, fps: 24 },
	'1080p2500': { width: 1920, height: 1080, fps: 25 },
	'1080p5000': { width: 1920, height: 1080, fps: 50 },
	'1080p2997': { width: 1920, height: 1080, fps: 29.97 },
	'1080p5994': { width: 1920, height: 1080, fps: 59.94 },
	'1080p3000': { width: 1920, height: 1080, fps: 30 },
	'1080p6000': { width: 1920, height: 1080, fps: 60 },
	'1080i5000': { width: 1920, height: 1080, fps: 50 },
	'1080i5994': { width: 1920, height: 1080, fps: 59.94 },
	'1080i6000': { width: 1920, height: 1080, fps: 60 },
	'2160p2500': { width: 3840, height: 2160, fps: 25 },
	'2160p5000': { width: 3840, height: 2160, fps: 50 },
	'2160p6000': { width: 3840, height: 2160, fps: 60 },
}

/**
 * Parse INFO CONFIG XML to discover decklink inputs channel and resolution from AMCP.
 * Call when config-based decklink info is missing. Finds channels with no screen consumer (inputs).
 * @param {string} configXml - CasparCG INFO CONFIG XML
 * @param {Function} done - Callback with { inputsCh?: number, inputsResolution?: { w, h, fps }, decklinkCount?: number }
 */
function parseInfoConfigForDecklinks(configXml, done) {
	if (!configXml || typeof configXml !== 'string') {
		if (typeof done === 'function') done({})
		return
	}
	parseString(configXml, (err, result) => {
		const out = {}
		if (err || !result) {
			if (typeof done === 'function') done(out)
			return
		}
		try {
			const channels = result.configuration?.channels?.[0]?.channel
			if (!channels || !Array.isArray(channels)) {
				if (typeof done === 'function') done(out)
				return
			}
			// Find last channel with no screen consumer (inputs channel)
			let inputsCh = null
			for (let idx = channels.length - 1; idx >= 0; idx--) {
				const ch = channels[idx]
				const consumers = ch.consumers?.[0]
				const screens = consumers?.screen ? (Array.isArray(consumers.screen) ? consumers.screen : [consumers.screen]) : []
				if (screens.length === 0) {
					inputsCh = idx + 1
					break
				}
			}
			if (inputsCh != null) {
				out.inputsCh = inputsCh
				out.decklinkCount = 1 // Default when discovered from server
				const ch = channels[inputsCh - 1]
				const modeId = ch?.['video-mode']?.[0] || '1080p5000'
				const dims = STANDARD_VIDEO_MODES[modeId] || { width: 1920, height: 1080, fps: 50 }
				out.inputsResolution = { w: dims.width, h: dims.height, fps: dims.fps }
			}
		} catch (_) {}
		if (typeof done === 'function') done(out)
	})
}

module.exports = {
	initVariables,
	updateDynamicVariables,
	summarizeConsumersFromConfig,
	parseInfoConfigForDecklinks,
}
