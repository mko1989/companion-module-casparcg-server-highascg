const { combineRgb } = require('@companion-module/base')

/**
 * @param {object} self - Module instance
 */
function initFeedbacks(self) {
	self.setFeedbackDefinitions({
		program_tally: {
			type: 'boolean',
			name: 'Program (FG clip matches)',
			description: 'On when this channel/layer foreground clip matches the given clip name.',
			defaultStyle: { bgcolor: combineRgb(200, 0, 0) },
			options: [
				{ type: 'textinput', id: 'channel', label: 'Channel', default: '1', regex: '/^\\d+$/' },
				{ type: 'textinput', id: 'layer', label: 'Layer', default: '0', regex: '/^\\d+$/' },
				{ type: 'textinput', id: 'clip', label: 'Clip name (exact)', default: '' },
			],
			callback: (feedback) => {
				const ch = String(feedback.options.channel || '1')
				const layer = String(feedback.options.layer || '0')
				const clip = String(feedback.options.clip || '').trim()
				const v = self.variables[`channel_${ch}_layer_${layer}_fg_clip`]
				return clip !== '' && v !== undefined && String(v).trim() === clip
			},
		},
		preview_tally: {
			type: 'boolean',
			name: 'Preview (BG clip matches)',
			description: 'On when this channel/layer background clip matches the given clip name.',
			defaultStyle: { bgcolor: combineRgb(0, 150, 0) },
			options: [
				{ type: 'textinput', id: 'channel', label: 'Channel', default: '1', regex: '/^\\d+$/' },
				{ type: 'textinput', id: 'layer', label: 'Layer', default: '0', regex: '/^\\d+$/' },
				{ type: 'textinput', id: 'clip', label: 'Clip name (exact)', default: '' },
			],
			callback: (feedback) => {
				const ch = String(feedback.options.channel || '1')
				const layer = String(feedback.options.layer || '0')
				const clip = String(feedback.options.clip || '').trim()
				const v = self.variables[`channel_${ch}_layer_${layer}_bg_clip`]
				return clip !== '' && v !== undefined && String(v).trim() === clip
			},
		},
	})
}

module.exports = { initFeedbacks }
