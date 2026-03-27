const { parseString } = require('xml2js')

/**
 * @param {object} self - Module instance
 * @param {Array} data - CLS response lines
 */
function handleCLS(self, data) {
	self.CHOICES_MEDIAFILES.length = 0
	self._clsRawLines = data || []
	for (let i = 0; i < data.length; ++i) {
		const match = data[i].match(/^"([^"]+)"/)
		if (match && match.length > 1) {
			const file = match[1].replace(/\\/g, '\\\\')
			self.CHOICES_MEDIAFILES.push({ label: file, id: file })
		}
	}
	self.variables.media_count = String(self.CHOICES_MEDIAFILES.length)
	self.setVariableValues({ media_count: self.variables.media_count })
	self.init_actions()
}

/**
 * @param {object} self - Module instance
 * @param {Array} data - TLS response lines
 */
function handleTLS(self, data) {
	self.CHOICES_TEMPLATES.length = 0
	for (let i = 0; i < data.length; ++i) {
		const match = data[i].match(/\"(.*?)\" +(.*)/)
		let file = null
		if (match === null) file = data[i]
		else file = match[1]
		if (file !== null) {
			file = file.replace(/\\/g, '\\\\')
			self.CHOICES_TEMPLATES.push({ label: file, id: file })
		}
	}
	self.variables.template_count = String(self.CHOICES_TEMPLATES.length)
	self.setVariableValues({ template_count: self.variables.template_count })
	self.init_actions()
}

/**
 * @param {object} self - Module instance
 * @param {string|Array} data - INFO response (XML)
 * @param {object} options - { channel, layer, offset }
 */
function executeGOTO(self, data, options) {
	if (!data || !data.length || !options) return
	parseString(data, async (err, result) => {
		if (err) {
			self.log('debug', 'Error in INFO response: ' + err)
		} else {
			try {
				const offsetString = await self.parseVariablesInString(options.offset)
				const offset = parseInt(offsetString, 10)
				let framerate = 0
				let seek = 0
				if (result.layer) {
					framerate = parseInt(result.layer.foreground[0].producer[0].fps[0], 10)
					if (offset >= 0) seek = offset * framerate
					else {
						const clipFrames = parseInt(result.layer.foreground[0].producer[0]['nb-frames'][0], 10)
						seek = Math.floor(clipFrames + offset * framerate)
					}
				} else if (result.channel) {
					framerate = parseInt(result.channel.framerate[0], 10)
					if (offset >= 0) seek = offset * framerate
					else {
						const clipLength = parseFloat(result.channel.stage[0].layer[0]['layer_' + options.layer][0].foreground[0].file[0].clip[1])
						seek = Math.floor(clipLength + offset) * framerate
					}
				}
				if (framerate > 0) {
					let out = 'CALL ' + parseInt(options.channel, 10)
					if (options.layer !== '') out += '-' + parseInt(options.layer, 10)
					out += ' SEEK ' + seek
					if (self.socket && self.socket.isConnected) self.socket.send(out + '\r\n')
				}
			} catch (e) {
				self.log('debug', 'Error in INFO response: ' + e)
			}
		}
	})
}

module.exports = { handleCLS, handleTLS, executeGOTO }
