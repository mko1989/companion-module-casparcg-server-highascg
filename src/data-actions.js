/**
 * Data and Thumbnail actions for AMCP DATA and THUMBNAIL commands.
 * @see main_plan.md Prompt 10
 */

function sendAmcp(self, fn) {
	fn().catch((e) => self.log('debug', 'AMCP: ' + (e?.message || e)))
}

/**
 * @param {object} self - Module instance
 * @returns {object} Action definitions for DATA and THUMBNAIL commands
 */
function getDataActions(self) {
	const amcp = self.amcp
	if (!amcp) return {}

	return {
		'DATA STORE': {
			name: 'DATA STORE',
			options: [
				{ label: 'Name', type: 'textinput', id: 'name', default: '', tooltip: 'Storage key name' },
				{ label: 'Data', type: 'textinput', id: 'data', default: '', useVariables: true, tooltip: 'Content to store' },
			],
			callback: async (action) => {
				const name = await self.parseVariablesInString(action.options.name || '')
				const data = await self.parseVariablesInString(action.options.data || '')
				sendAmcp(self, () => amcp.dataStore(name, data))
			},
		},
		'DATA RETRIEVE': {
			name: 'DATA RETRIEVE',
			options: [{ label: 'Name', type: 'textinput', id: 'name', default: '', tooltip: 'Storage key to retrieve' }],
			callback: async (action) => {
				const name = await self.parseVariablesInString(action.options.name || '')
				sendAmcp(self, () => amcp.dataRetrieve(name))
			},
		},
		'DATA LIST': {
			name: 'DATA LIST',
			options: [],
			callback: () => sendAmcp(self, () => amcp.dataList()),
		},
		'DATA REMOVE': {
			name: 'DATA REMOVE',
			options: [{ label: 'Name', type: 'textinput', id: 'name', default: '', tooltip: 'Storage key to remove' }],
			callback: async (action) => {
				const name = await self.parseVariablesInString(action.options.name || '')
				sendAmcp(self, () => amcp.dataRemove(name))
			},
		},
		'THUMBNAIL LIST': {
			name: 'THUMBNAIL LIST',
			options: [],
			callback: () => sendAmcp(self, () => amcp.thumbnailList()),
		},
		'THUMBNAIL RETRIEVE': {
			name: 'THUMBNAIL RETRIEVE',
			options: [
				{
					label: 'Filename',
					type: 'dropdown',
					id: 'filename_dd',
					default: '',
					choices: [{ id: '', label: '(None)' }, ...(self.CHOICES_MEDIAFILES || [])],
					allowCustom: true,
				},
				{ label: 'Or filename', type: 'textinput', id: 'filename', default: '' },
			],
			callback: async (action) => {
				const fn = action.options.filename || action.options.filename_dd || ''
				const filename = await self.parseVariablesInString(fn)
				sendAmcp(self, () => amcp.thumbnailRetrieve(filename))
			},
		},
		'THUMBNAIL GENERATE': {
			name: 'THUMBNAIL GENERATE',
			options: [
				{
					label: 'Filename',
					type: 'dropdown',
					id: 'filename_dd',
					default: '',
					choices: [{ id: '', label: '(None)' }, ...(self.CHOICES_MEDIAFILES || [])],
					allowCustom: true,
				},
				{ label: 'Or filename', type: 'textinput', id: 'filename', default: '' },
			],
			callback: async (action) => {
				const fn = action.options.filename || action.options.filename_dd || ''
				const filename = await self.parseVariablesInString(fn)
				sendAmcp(self, () => amcp.thumbnailGenerate(filename))
			},
		},
		'THUMBNAIL GENERATE_ALL': {
			name: 'THUMBNAIL GENERATE_ALL',
			options: [],
			callback: () => sendAmcp(self, () => amcp.thumbnailGenerateAll()),
		},
	}
}

module.exports = { getDataActions }
