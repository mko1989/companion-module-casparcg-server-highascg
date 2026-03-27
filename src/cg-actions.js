const { Regex } = require('@companion-module/base')

const CHOICES_YESNO_BOOLEAN = [
	{ id: 'true', label: 'Yes' },
	{ id: 'false', label: 'No' },
]

function esc(str) {
	return str.replace(/"/g, '&quot;')
}

function build_templatedata_string(options) {
	const templateData = {}
	let match
	const re = /(([^=]+?)="([^"]+?)"[ ,]*)/g
	while ((match = re.exec(options.variables)) !== null) {
		templateData[esc(match[2])] = esc(match[3])
	}
	if (Object.keys(templateData).length === 0) return null
	if (options.json === true) {
		return JSON.stringify(templateData)
	}
	let templ = '<templateData>'
	for (const key in templateData) {
		templ += '<componentData id="' + key + '"><data id="text" value="' + templateData[key] + '" /></componentData>'
	}
	templ += '</templateData>'
	return templ
}

function AMCP_PARAMETER(data) {
	data = data.replace(/"/g, '\\"')
	if (data.match(/\s/)) return '"' + data + '"'
	return data
}

/**
 * Returns CG action definitions (CG ADD, CG UPDATE, CG PLAY, CG STOP).
 * @param {object} self - Module instance
 * @param {Function} sendCommand - Async function (cmd) => {} to send AMCP command
 * @returns {object} Action definitions object
 */
function getCgActions(self, sendCommand) {
	return {
		'CG ADD': {
			name: 'CG ADD',
			options: [
				{ label: 'Channel', type: 'textinput', id: 'channel', default: 1, regex: '/^\\d+$/' },
				{ label: 'Layer', type: 'textinput', id: 'layer', default: '', regex: '/^\\d*$/' },
				{
					label: 'Template',
					type: 'dropdown',
					id: 'template_dd',
					default: '',
					choices: [{ id: '', label: '(None)' }, ...(self.CHOICES_TEMPLATES || [])],
					allowCustom: true,
				},
				{ label: 'Or template name', type: 'textinput', id: 'template', default: '' },
				{ label: 'Play on load', type: 'dropdown', id: 'playonload', choices: CHOICES_YESNO_BOOLEAN, default: 'false' },
				{ label: 'Template host layer', type: 'textinput', id: 'templatelayer', default: '1', regex: Regex.NUMBER },
				{ label: 'Send as JSON', type: 'checkbox', id: 'json', default: false },
				{
					label: 'Template variables',
					type: 'textinput',
					id: 'variables',
					tooltip: 'Example: f0="John Doe" f1="Foobar janitor"',
					default: 'f0="John Doe"',
					regex: '/(^([^=]+="[^"]+"[ ,]*)+$|^$)/',
				},
			],
			callback: async (action) => {
				let cmd = 'CG ' + parseInt(action.options.channel)
				if (action.options.layer != '') cmd += '-' + parseInt(action.options.layer)
				cmd += ' ADD'
				if (action.options.templatelayer != '') cmd += ' ' + parseInt(action.options.templatelayer)
				if (action.options.template) cmd += ' ' + AMCP_PARAMETER(action.options.template)
				else if (action.options.template_dd) cmd += ' ' + AMCP_PARAMETER(action.options.template_dd)
				if (action.options.playonload == 'true' || action.options.variables != '') {
					cmd += ' ' + (action.options.playonload == 'true' ? '1' : '0')
				}
				if (action.options.variables != '') {
					const templ = build_templatedata_string(action.options)
					cmd += ' "' + templ.replace(/"/g, '\\"') + '"'
				}
				sendCommand(cmd)
			},
		},
		'CG UPDATE': {
			name: 'CG UPDATE',
			options: [
				{ label: 'Channel', type: 'textinput', id: 'channel', default: 1, regex: '/^\\d+$/' },
				{ label: 'Layer', type: 'textinput', id: 'layer', default: '', regex: '/^\\d*$/' },
				{ label: 'Template host layer', type: 'textinput', id: 'templatelayer', default: '1', regex: '/^\\d+$/' },
				{ label: 'Send as JSON', type: 'checkbox', id: 'json', default: false },
				{
					label: 'Template variables',
					type: 'textinput',
					id: 'variables',
					tooltip: 'Example: f0="John Doe" f1="Foobar janitor"',
					default: '',
					regex: '/(^([^=]+="[^"]+"[ ,]*)+$|^$)/',
				},
			],
			callback: async (action) => {
				let cmd = 'CG ' + parseInt(action.options.channel)
				if (action.options.layer != '') cmd += '-' + parseInt(action.options.layer)
				cmd += ' UPDATE'
				cmd += ' ' + parseInt(action.options.templatelayer)
				if (action.options.variables != '') {
					const templ = build_templatedata_string(action.options)
					cmd += ' "' + templ.replace(/"/g, '\\"') + '"'
				}
				sendCommand(cmd)
			},
		},
		'CG PLAY': {
			name: 'CG PLAY',
			options: [
				{ label: 'Channel', type: 'textinput', id: 'channel', default: 1, regex: '/^\\d+$/' },
				{ label: 'Layer', type: 'textinput', id: 'layer', default: '', regex: '/^\\d*$/' },
				{ label: 'Template host layer', type: 'textinput', id: 'templatelayer', default: '1', regex: Regex.NUMBER },
			],
			callback: (action) => {
				let cmd = 'CG ' + parseInt(action.options.channel)
				if (action.options.layer != '') cmd += '-' + parseInt(action.options.layer)
				cmd += ' PLAY'
				cmd += ' ' + parseInt(action.options.templatelayer)
				sendCommand(cmd)
			},
		},
		'CG STOP': {
			name: 'CG STOP',
			options: [
				{ label: 'Channel', type: 'textinput', id: 'channel', default: 1, regex: '/^\\d+$/' },
				{ label: 'Layer', type: 'textinput', id: 'layer', default: '', regex: '/^\\d*$/' },
				{ label: 'Template host layer', type: 'textinput', id: 'templatelayer', default: '1', regex: Regex.NUMBER },
			],
			callback: (action) => {
				let cmd = 'CG ' + parseInt(action.options.channel)
				if (action.options.layer != '') cmd += '-' + parseInt(action.options.layer)
				cmd += ' STOP'
				cmd += ' ' + parseInt(action.options.templatelayer)
				sendCommand(cmd)
			},
		},
		'CG NEXT': {
			name: 'CG NEXT',
			options: [
				{ label: 'Channel', type: 'textinput', id: 'channel', default: 1, regex: '/^\\d+$/' },
				{ label: 'Layer', type: 'textinput', id: 'layer', default: '', regex: '/^\\d*$/' },
				{ label: 'Template host layer', type: 'textinput', id: 'templatelayer', default: '1', regex: Regex.NUMBER },
			],
			callback: (action) => {
				let cmd = 'CG ' + parseInt(action.options.channel)
				if (action.options.layer != '') cmd += '-' + parseInt(action.options.layer)
				cmd += ' NEXT'
				cmd += ' ' + parseInt(action.options.templatelayer)
				sendCommand(cmd)
			},
		},
		'CG GOTO': {
			name: 'CG GOTO',
			options: [
				{ label: 'Channel', type: 'textinput', id: 'channel', default: 1, regex: '/^\\d+$/' },
				{ label: 'Layer', type: 'textinput', id: 'layer', default: '', regex: '/^\\d*$/' },
				{ label: 'Template host layer', type: 'textinput', id: 'templatelayer', default: '1', regex: Regex.NUMBER },
				{ label: 'Label', type: 'textinput', id: 'label', default: '', tooltip: 'Template label to go to' },
			],
			callback: (action) => {
				let cmd = 'CG ' + parseInt(action.options.channel)
				if (action.options.layer != '') cmd += '-' + parseInt(action.options.layer)
				cmd += ' GOTO'
				cmd += ' ' + parseInt(action.options.templatelayer)
				if (action.options.label) cmd += ' ' + AMCP_PARAMETER(action.options.label)
				sendCommand(cmd)
			},
		},
		'CG INVOKE': {
			name: 'CG INVOKE',
			options: [
				{ label: 'Channel', type: 'textinput', id: 'channel', default: 1, regex: '/^\\d+$/' },
				{ label: 'Layer', type: 'textinput', id: 'layer', default: '', regex: '/^\\d*$/' },
				{ label: 'Template host layer', type: 'textinput', id: 'templatelayer', default: '1', regex: Regex.NUMBER },
				{ label: 'Method', type: 'textinput', id: 'method', default: '', tooltip: 'Template method to invoke' },
			],
			callback: (action) => {
				let cmd = 'CG ' + parseInt(action.options.channel)
				if (action.options.layer != '') cmd += '-' + parseInt(action.options.layer)
				cmd += ' INVOKE'
				cmd += ' ' + parseInt(action.options.templatelayer)
				if (action.options.method) cmd += ' ' + AMCP_PARAMETER(action.options.method)
				sendCommand(cmd)
			},
		},
		'CG REMOVE': {
			name: 'CG REMOVE',
			options: [
				{ label: 'Channel', type: 'textinput', id: 'channel', default: 1, regex: '/^\\d+$/' },
				{ label: 'Layer', type: 'textinput', id: 'layer', default: '', regex: '/^\\d*$/' },
				{ label: 'Template host layer', type: 'textinput', id: 'templatelayer', default: '1', regex: Regex.NUMBER },
			],
			callback: (action) => {
				let cmd = 'CG ' + parseInt(action.options.channel)
				if (action.options.layer != '') cmd += '-' + parseInt(action.options.layer)
				cmd += ' REMOVE'
				cmd += ' ' + parseInt(action.options.templatelayer)
				sendCommand(cmd)
			},
		},
		'CG CLEAR': {
			name: 'CG CLEAR',
			options: [
				{ label: 'Channel', type: 'textinput', id: 'channel', default: 1, regex: '/^\\d+$/' },
				{ label: 'Layer', type: 'textinput', id: 'layer', default: '', regex: '/^\\d*$/' },
			],
			callback: (action) => {
				let cmd = 'CG ' + parseInt(action.options.channel)
				if (action.options.layer != '') cmd += '-' + parseInt(action.options.layer)
				cmd += ' CLEAR'
				sendCommand(cmd)
			},
		},
		'CG INFO': {
			name: 'CG INFO',
			options: [
				{ label: 'Channel', type: 'textinput', id: 'channel', default: 1, regex: '/^\\d+$/' },
				{ label: 'Layer', type: 'textinput', id: 'layer', default: '', regex: '/^\\d*$/' },
			],
			callback: (action) => {
				let cmd = 'CG ' + parseInt(action.options.channel)
				if (action.options.layer != '') cmd += '-' + parseInt(action.options.layer)
				cmd += ' INFO'
				sendCommand(cmd)
			},
		},
	}
}

module.exports = { getCgActions }
