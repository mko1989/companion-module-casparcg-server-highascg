const { Regex } = require('@companion-module/base')
const { getStandardModeChoices, STANDARD_VIDEO_MODES } = require('./config-generator')

const MODE_CHOICES = getStandardModeChoices()
const MULTIVIEW_MODE_CHOICES = Object.keys(STANDARD_VIDEO_MODES).map((id) => ({ id, label: id }))
const STRETCH_CHOICES = [
	{ id: 'none', label: 'None' },
	{ id: 'fill', label: 'Fill' },
	{ id: 'uniform', label: 'Uniform' },
	{ id: 'uniform_to_fill', label: 'Uniform to fill' },
]

/**
 * Build config fields for screens 1–4.
 * @param {number} n - Screen index (1–4)
 * @returns {Array}
 */
function screenFields(n) {
	const visibleExpr = `$(options:screen_count) >= ${n}`
	const customVisibleExpr = `$(options:screen_count) >= ${n} && $(options:screen_${n}_mode) === 'custom'`
	return [
		{
			type: 'static-text',
			id: `screen_${n}_header`,
			label: `Screen ${n}`,
			value: `Screen ${n}`,
			width: 12,
			isVisibleExpression: visibleExpr,
			disableAutoExpression: true,
		},
		{
			type: 'dropdown',
			id: `screen_${n}_mode`,
			label: 'Video mode',
			choices: MODE_CHOICES,
			default: n === 1 ? '1080p5000' : '1080p5000',
			width: 8,
			isVisibleExpression: visibleExpr,
			disableAutoExpression: true,
		},
		{
			type: 'number',
			id: `screen_${n}_custom_width`,
			label: 'Custom width',
			default: 1920,
			min: 1,
			max: 8192,
			width: 4,
			isVisibleExpression: customVisibleExpr,
		},
		{
			type: 'number',
			id: `screen_${n}_custom_height`,
			label: 'Custom height',
			default: 1080,
			min: 1,
			max: 4320,
			width: 4,
			isVisibleExpression: customVisibleExpr,
		},
		{
			type: 'number',
			id: `screen_${n}_custom_fps`,
			label: 'Custom fps',
			default: 50,
			min: 1,
			max: 120,
			step: 0.01,
			width: 4,
			isVisibleExpression: customVisibleExpr,
		},
		{
			type: 'dropdown',
			id: `screen_${n}_stretch`,
			label: 'Stretch',
			choices: STRETCH_CHOICES,
			default: 'none',
			width: 6,
			isVisibleExpression: visibleExpr,
		},
		{
			type: 'checkbox',
			id: `screen_${n}_windowed`,
			label: 'Windowed',
			default: true,
			width: 4,
			isVisibleExpression: visibleExpr,
		},
		{
			type: 'checkbox',
			id: `screen_${n}_vsync`,
			label: 'VSync',
			default: true,
			width: 4,
			isVisibleExpression: visibleExpr,
		},
		{
			type: 'checkbox',
			id: `screen_${n}_always_on_top`,
			label: 'Always on top',
			default: true,
			width: 4,
			isVisibleExpression: visibleExpr,
		},
		{
			type: 'checkbox',
			id: `screen_${n}_borderless`,
			label: 'Borderless',
			default: false,
			width: 4,
			isVisibleExpression: visibleExpr,
		},
	]
}

/**
 * Build config fields for decklink inputs and inputs channel.
 * @returns {Array}
 */
function decklinkFields() {
	const fields = [
		{
			type: 'static-text',
			id: 'decklink_header',
			label: 'DeckLink inputs',
			value: 'Each physical device can only be played once. Use 1:1 mapping (input 1→device 1, input 2→device 2, etc.)',
			width: 12,
		},
		{
			type: 'textinput',
			id: 'decklink_input_count',
			label: 'Number of decklink inputs',
			default: '0',
			width: 4,
			// No regex: allow 0 (no Decklink) so users without capture cards can always save
			tooltip: '0–8. Adds an inputs channel after multiview when > 0. Each input is played on layer N.',
			disableAutoExpression: true,
		},
	]
	for (let n = 1; n <= 8; n++) {
		fields.push({
			type: 'number',
			id: `decklink_input_${n}_device`,
			label: `Input ${n} device`,
			default: n,
			min: 1,
			max: 32,
			width: 4,
			isVisibleExpression: `$(options:decklink_input_count) >= ${n}`,
			tooltip: `DeckLink device index (1–8). Each device can only be used once — input 1→device 1, input 2→device 2, etc.`,
		})
	}
	fields.push({
		type: 'dropdown',
		id: 'inputs_channel_mode',
		label: 'Inputs channel video mode',
		choices: MULTIVIEW_MODE_CHOICES,
		default: '1080p5000',
		width: 6,
		isVisibleExpression: '$(options:decklink_input_count) > 0',
		tooltip: 'Video mode for the inputs channel.',
		disableAutoExpression: true,
	})
	return fields
}

/**
 * Returns the config field definitions for the module.
 * @returns {Array} Companion config field definitions
 */
function getConfigFields() {
	const connection = [
		{
			type: 'textinput',
			id: 'host',
			label: 'IP Address of CasparCG Server',
			width: 6,
			default: '',
			// No regex: allow empty so user can save config when disconnected (e.g. to fix wrong IP)
			tooltip: 'IP or hostname. Leave empty to disconnect. You can save config even when disconnected.',
		},
		{
			type: 'textinput',
			id: 'port',
			label: 'AMCP TCP Port',
			default: '5250',
			// No regex: allow save when disconnected; invalid values fall back to 5250 in code
			tooltip: 'Default 5250. Leave empty to use default.',
		},
	]

	const polling = [
		{
			type: 'textinput',
			id: 'poll_channel',
			label: 'Channel to poll for variables (INFO)',
			width: 6,
			default: '1',
			regex: '/^\\d+$/',
			tooltip: 'Channel number used for INFO command to fill channel_1_* variables.',
		},
		{
			type: 'textinput',
			id: 'poll_interval',
			label: 'Variable poll interval (seconds, 0 = off)',
			width: 6,
			default: '10',
			regex: Regex.NUMBER,
			tooltip: 'How often to refresh variables from server. 0 disables automatic polling.',
		},
		{
			type: 'textinput',
			id: 'max_cinf',
			label: 'Max media files to query with CINF on connect (0 = all)',
			width: 6,
			default: '100',
			regex: Regex.NUMBER,
			tooltip: 'Limit CINF requests per connection. Set to 0 to skip CINF (if server returns errors).',
		},
		{
			type: 'checkbox',
			id: 'query_cinf',
			label: 'Query CINF (media details) on connect',
			default: true,
			tooltip: 'Disable if your server returns COMMAND_UNKNOWN_DATA for CINF.',
		},
		{
			type: 'textinput',
			id: 'osc_port',
			label: 'OSC port (CasparCG Client)',
			width: 6,
			default: '0',
			// No regex: allow 0 (disabled) and any port; when > 0, OSC is added to generated server config
			tooltip: 'Port for OSC control (e.g. /control/play, /control/stop). 0 = disabled.',
		},
		{
			type: 'textinput',
			id: 'channel_consumers',
			label: 'Channel consumers / screens',
			width: 12,
			default: '',
			tooltip: 'Optional: one line per channel, e.g. "1=SCREEN" or "1=SCREEN\\n2=DECKLINK 1". Used for routing presets.',
		},
		{
			type: 'textinput',
			id: 'realtime_poll_interval',
			label: 'Realtime poll interval (ms)',
			width: 6,
			default: '500',
			regex: Regex.NUMBER,
			tooltip: 'Poll state, duration, time, remaining for playing clips (ms). 0 = only use variable poll interval.',
		},
	]

	const screenConfig = [
		{
			type: 'static-text',
			id: 'screens_header',
			label: 'Screens',
			value: 'Configure screens 1–4. Each screen gets program + preview channels. Optional multiview.',
			width: 12,
		},
		{
			type: 'number',
			id: 'screen_count',
			label: 'Number of screens',
			default: 1,
			min: 1,
			max: 4,
			width: 4,
			disableAutoExpression: true,
		},
		...screenFields(1),
		...screenFields(2),
		...screenFields(3),
		...screenFields(4),
		{
			type: 'checkbox',
			id: 'multiview_enabled',
			label: 'Enable multiview channel',
			default: false,
			width: 6,
			tooltip: 'Add a multiview screen consumer after the main screens.',
			disableAutoExpression: true,
		},
		{
			type: 'dropdown',
			id: 'multiview_mode',
			label: 'Multiview video mode',
			choices: MULTIVIEW_MODE_CHOICES,
			default: '1080p5000',
			width: 6,
			isVisibleExpression: '$(options:multiview_enabled) === true',
			disableAutoExpression: true,
		},
		...decklinkFields(),
	]

	const serverConfig = [
		{
			type: 'static-text',
			id: 'server_config_header',
			label: 'Server config',
			value: 'Config is generated from screen settings above. Use action "Apply server config and restart" to send via DATA STORE and restart. Variable info_config shows current server config from INFO CONFIG.',
			width: 12,
		},
		{
			type: 'textinput',
			id: 'server_config_filename',
			label: 'Config filename (DATA STORE name)',
			width: 6,
			default: 'casparcg.config',
			tooltip: 'Name sent in DATA STORE (e.g. casparcg.config). Server stores and reads from media/ as <name>.ftd (e.g. media/casparcg.config.ftd). Synced media folder recommended.',
		},
		{
			type: 'textinput',
			id: 'server_config_restart_command',
			label: 'Restart command after DATA STORE',
			width: 6,
			default: 'RESTART',
			tooltip: 'AMCP command sent after config is stored (e.g. RESTART). Leave empty to skip.',
		},
	]

	const apiConfig = [
		{
			type: 'static-text',
			id: 'api_header',
			label: 'Web GUI & API',
			value: 'Always available via Companion at /instance/<connection>/ — no configuration needed.',
			width: 12,
		},
		{
			type: 'textinput',
			id: 'local_media_path',
			label: 'Local media folder (waveforms)',
			width: 12,
			default: '',
			tooltip: 'Path to a folder that mirrors the CasparCG server media folder. **Required for resolution and fps in the Media content browser** — without this, most files show no metadata. Also used for timeline waveform overlays. Same file names and structure as the CasparCG media path. Use rsync, network share, or other sync tools. Leave empty for synthetic waveforms only.',
		},
		{
			type: 'static-text',
			id: 'local_media_note',
			label: '',
			value: '⚠️ This option requires a synced media folder with the CasparCG server — same file names and structure. Useful for timeline waveform overlays and future features (thumbnails, duration).',
			width: 12,
			isVisibleExpression: '$(options:local_media_path) !== ""',
			tooltip: 'Your local media folder must contain the same files as the CasparCG server media path.',
		},
	]

	return [...connection, ...polling, ...screenConfig, ...serverConfig, ...apiConfig]
}

module.exports = { getConfigFields }
