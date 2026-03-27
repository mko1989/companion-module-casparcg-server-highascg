/**
 * Mixer actions for AMCP MIXER commands.
 * @see main_plan.md Prompt 10
 */

const { Regex } = require('@companion-module/base')

const CHANNEL_LAYER_OPTS = [
	{ label: 'Channel', type: 'textinput', id: 'channel', default: '1', regex: '/^\\d+$/' },
	{ label: 'Layer', type: 'textinput', id: 'layer', default: '0', regex: '/^\\d*$/' },
]

const CHOICES_YESNO = [
	{ id: 'true', label: 'Yes' },
	{ id: 'false', label: 'No' },
]

function sendAmcp(self, fn) {
	fn().catch((e) => self.log('debug', 'AMCP: ' + (e?.message || e)))
}

/**
 * @param {object} self - Module instance
 * @returns {object} Action definitions for mixer commands
 */
function getMixerActions(self) {
	const amcp = self.amcp
	if (!amcp) return {}

	return {
		'MIXER FILL': {
			name: 'MIXER FILL',
			options: [
				...CHANNEL_LAYER_OPTS,
				{ label: 'X', type: 'textinput', id: 'x', default: '0', regex: Regex.FLOAT },
				{ label: 'Y', type: 'textinput', id: 'y', default: '0', regex: Regex.FLOAT },
				{ label: 'Width', type: 'textinput', id: 'width', default: '1', regex: Regex.FLOAT },
				{ label: 'Height', type: 'textinput', id: 'height', default: '1', regex: Regex.FLOAT },
			],
			callback: async (action) => {
				const ch = parseInt(await self.parseVariablesInString(action.options.channel || '1'), 10)
				const layer = parseInt(await self.parseVariablesInString(action.options.layer || '0'), 10)
				const x = parseFloat(await self.parseVariablesInString(action.options.x || '0'))
				const y = parseFloat(await self.parseVariablesInString(action.options.y || '0'))
				const w = parseFloat(await self.parseVariablesInString(action.options.width || '1'))
				const h = parseFloat(await self.parseVariablesInString(action.options.height || '1'))
				sendAmcp(self, () => amcp.mixerFill(ch, layer, x, y, w, h))
			},
		},
		'MIXER CLIP': {
			name: 'MIXER CLIP',
			options: [
				...CHANNEL_LAYER_OPTS,
				{ label: 'X', type: 'textinput', id: 'x', default: '0', regex: Regex.FLOAT },
				{ label: 'Y', type: 'textinput', id: 'y', default: '0', regex: Regex.FLOAT },
				{ label: 'Width', type: 'textinput', id: 'width', default: '1', regex: Regex.FLOAT },
				{ label: 'Height', type: 'textinput', id: 'height', default: '1', regex: Regex.FLOAT },
			],
			callback: async (action) => {
				const ch = parseInt(await self.parseVariablesInString(action.options.channel || '1'), 10)
				const layer = parseInt(await self.parseVariablesInString(action.options.layer || '0'), 10)
				const x = parseFloat(await self.parseVariablesInString(action.options.x || '0'))
				const y = parseFloat(await self.parseVariablesInString(action.options.y || '0'))
				const w = parseFloat(await self.parseVariablesInString(action.options.width || '1'))
				const h = parseFloat(await self.parseVariablesInString(action.options.height || '1'))
				sendAmcp(self, () => amcp.mixerClip(ch, layer, x, y, w, h))
			},
		},
		'MIXER OPACITY': {
			name: 'MIXER OPACITY',
			options: [
				...CHANNEL_LAYER_OPTS,
				{ label: 'Opacity (0-1)', type: 'textinput', id: 'opacity', default: '1', regex: Regex.FLOAT },
			],
			callback: async (action) => {
				const ch = parseInt(await self.parseVariablesInString(action.options.channel || '1'), 10)
				const layer = parseInt(await self.parseVariablesInString(action.options.layer || '0'), 10)
				const opacity = parseFloat(await self.parseVariablesInString(action.options.opacity || '1'))
				sendAmcp(self, () => amcp.mixerOpacity(ch, layer, opacity))
			},
		},
		'MIXER VOLUME': {
			name: 'MIXER VOLUME',
			options: [
				...CHANNEL_LAYER_OPTS,
				{ label: 'Volume (0-1)', type: 'textinput', id: 'volume', default: '1', regex: Regex.FLOAT },
			],
			callback: async (action) => {
				const ch = parseInt(await self.parseVariablesInString(action.options.channel || '1'), 10)
				const layer = parseInt(await self.parseVariablesInString(action.options.layer || '0'), 10)
				const vol = parseFloat(await self.parseVariablesInString(action.options.volume || '1'))
				sendAmcp(self, () => amcp.mixerVolume(ch, layer, vol))
			},
		},
		'MIXER KEYER': {
			name: 'MIXER KEYER',
			options: [
				...CHANNEL_LAYER_OPTS,
				{ label: 'Enable', type: 'dropdown', id: 'enable', choices: CHOICES_YESNO, default: 'true' },
			],
			callback: async (action) => {
				const ch = parseInt(await self.parseVariablesInString(action.options.channel || '1'), 10)
				const layer = parseInt(await self.parseVariablesInString(action.options.layer || '0'), 10)
				const enable = action.options.enable === 'true'
				sendAmcp(self, () => amcp.mixerKeyer(ch, layer, enable))
			},
		},
		'MIXER BLEND': {
			name: 'MIXER BLEND',
			options: [
				...CHANNEL_LAYER_OPTS,
				{ label: 'Mode', type: 'textinput', id: 'mode', default: 'NORMAL' },
			],
			callback: async (action) => {
				const ch = parseInt(await self.parseVariablesInString(action.options.channel || '1'), 10)
				const layer = parseInt(await self.parseVariablesInString(action.options.layer || '0'), 10)
				const mode = await self.parseVariablesInString(action.options.mode || 'NORMAL')
				sendAmcp(self, () => amcp.mixerBlend(ch, layer, mode))
			},
		},
		'MIXER BRIGHTNESS': {
			name: 'MIXER BRIGHTNESS',
			options: [...CHANNEL_LAYER_OPTS, { label: 'Value', type: 'textinput', id: 'value', default: '1', regex: Regex.FLOAT }],
			callback: async (action) => {
				const ch = parseInt(await self.parseVariablesInString(action.options.channel || '1'), 10)
				const layer = parseInt(await self.parseVariablesInString(action.options.layer || '0'), 10)
				const val = parseFloat(await self.parseVariablesInString(action.options.value || '1'))
				sendAmcp(self, () => amcp.mixerBrightness(ch, layer, val))
			},
		},
		'MIXER SATURATION': {
			name: 'MIXER SATURATION',
			options: [...CHANNEL_LAYER_OPTS, { label: 'Value', type: 'textinput', id: 'value', default: '1', regex: Regex.FLOAT }],
			callback: async (action) => {
				const ch = parseInt(await self.parseVariablesInString(action.options.channel || '1'), 10)
				const layer = parseInt(await self.parseVariablesInString(action.options.layer || '0'), 10)
				const val = parseFloat(await self.parseVariablesInString(action.options.value || '1'))
				sendAmcp(self, () => amcp.mixerSaturation(ch, layer, val))
			},
		},
		'MIXER CONTRAST': {
			name: 'MIXER CONTRAST',
			options: [...CHANNEL_LAYER_OPTS, { label: 'Value', type: 'textinput', id: 'value', default: '1', regex: Regex.FLOAT }],
			callback: async (action) => {
				const ch = parseInt(await self.parseVariablesInString(action.options.channel || '1'), 10)
				const layer = parseInt(await self.parseVariablesInString(action.options.layer || '0'), 10)
				const val = parseFloat(await self.parseVariablesInString(action.options.value || '1'))
				sendAmcp(self, () => amcp.mixerContrast(ch, layer, val))
			},
		},
		'MIXER ROTATION': {
			name: 'MIXER ROTATION',
			options: [...CHANNEL_LAYER_OPTS, { label: 'Degrees', type: 'textinput', id: 'degrees', default: '0', regex: Regex.FLOAT }],
			callback: async (action) => {
				const ch = parseInt(await self.parseVariablesInString(action.options.channel || '1'), 10)
				const layer = parseInt(await self.parseVariablesInString(action.options.layer || '0'), 10)
				const deg = parseFloat(await self.parseVariablesInString(action.options.degrees || '0'))
				sendAmcp(self, () => amcp.mixerRotation(ch, layer, deg))
			},
		},
		'MIXER COMMIT': {
			name: 'MIXER COMMIT',
			options: [{ label: 'Channel', type: 'textinput', id: 'channel', default: '1', regex: '/^\\d+$/' }],
			callback: async (action) => {
				const ch = parseInt(await self.parseVariablesInString(action.options.channel || '1'), 10)
				sendAmcp(self, () => amcp.mixerCommit(ch))
			},
		},
		'MIXER CLEAR': {
			name: 'MIXER CLEAR',
			options: CHANNEL_LAYER_OPTS,
			callback: async (action) => {
				const ch = parseInt(await self.parseVariablesInString(action.options.channel || '1'), 10)
				const layer = parseInt(await self.parseVariablesInString(action.options.layer || '0'), 10)
				sendAmcp(self, () => amcp.mixerClear(ch, layer))
			},
		},
	}
}

module.exports = { getMixerActions }
