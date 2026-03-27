const { TCPHelper, InstanceStatus } = require('@companion-module/base')

const ACMP_STATE = { NEXT: 0, SINGLE_LINE: 1, MULTI_LINE: 2 }
const RETCODE = {
	INFO: 100,
	INFODATA: 101,
	OKMULTIDATA: 200,
	OKDATA: 201,
	OK: 202,
	COMMAND_UNKNOWN_DATA: 400,
	INVALID_CHANNEL: 401,
	PARAMETER_MISSING: 402,
	PARAMETER_ILLEGAL: 403,
	MEDIAFILE_NOT_FOUND: 404,
	INTERNAL_SERVER_ERROR_DATA: 500,
	INTERNAL_SERVER_ERROR: 501,
	MEDIAFILE_UNREADABLE: 502,
	ACCESS_ERROR: 503,
}

function swapObj(obj) {
	const ret = {}
	for (const key in obj) ret[obj[key]] = key
	return ret
}
const RETCODE2TYPE = swapObj(RETCODE)

/**
 * @param {object} self - Module instance
 */
function initTcp(self) {
	if (self.pollTimer) {
		clearInterval(self.pollTimer)
		self.pollTimer = null
	}
	if (self.realtimePollTimer) {
		clearInterval(self.realtimePollTimer)
		self.realtimePollTimer = null
	}
	if (self.socket) {
		self.updateStatus(InstanceStatus.Disconnected)
		self.socket.destroy()
		delete self.socket
	}

	if (self.config.host) {
		self.updateStatus(InstanceStatus.Connecting)
		const port = parseInt(String(self.config.port || ''), 10) || 5250
		self.socket = new TCPHelper(self.config.host, port)

		self.socket.on('status_change', (status, message) => self.updateStatus(status, message))
		self.socket.on('error', (err) => self.log('error', 'Network error: ' + err.message))
		self.socket.on('connect', () => {
			self.log('debug', 'Connected')
			self.runConnectionQueryCycle()
		})

		let receivebuffer = ''
		let amcp_state = ACMP_STATE.NEXT
		let error_code = undefined
		let multilinedata = []
		let response_current = ''

		self.socket.on('data', (chunk) => {
			let i = 0
			let offset = 0
			receivebuffer += chunk
			while ((i = receivebuffer.indexOf('\r\n', offset)) !== -1) {
				const line = receivebuffer.substr(offset, i - offset)
				offset = i + 2
				self.socket.emit('receiveline', line.toString())
			}
			receivebuffer = receivebuffer.substr(offset)
		})

		self.socket.on('receiveline', (line) => {
			let error = false
			if (amcp_state === ACMP_STATE.NEXT) {
				const codeMatch = line.match(/^(\d+)\s+(\S*)/)
				let status
				if (codeMatch && codeMatch.length > 1) {
					if (codeMatch.length > 2) status = codeMatch[2]
					const code = parseInt(codeMatch[1], 10)

					switch (code) {
						case RETCODE.INVALID_CHANNEL:
						case RETCODE.PARAMETER_MISSING:
						case RETCODE.PARAMETER_ILLEGAL:
						case RETCODE.MEDIAFILE_NOT_FOUND:
						case RETCODE.INTERNAL_SERVER_ERROR:
						case RETCODE.MEDIAFILE_UNREADABLE:
						case RETCODE.ACCESS_ERROR:
							error = true
							error_code = code
							amcp_state = ACMP_STATE.NEXT
							break
						case RETCODE.INFO:
						case RETCODE.OK:
							amcp_state = ACMP_STATE.NEXT
							error_code = undefined
							break
						case RETCODE.COMMAND_UNKNOWN_DATA:
						case RETCODE.INTERNAL_SERVER_ERROR_DATA:
							error = true
							error_code = code
							amcp_state = ACMP_STATE.SINGLE_LINE
							break
						case RETCODE.INFODATA:
						case RETCODE.OKDATA:
							amcp_state = ACMP_STATE.SINGLE_LINE
							response_current = status
							error_code = undefined
							break
						case RETCODE.OKMULTIDATA:
							amcp_state = ACMP_STATE.MULTI_LINE
							response_current = status
							error_code = undefined
							multilinedata = []
							break
						default:
							self.log('error', 'Unrecognized data from server: ' + line)
							return
					}
					if (error && amcp_state === ACMP_STATE.NEXT) {
						self.log('error', 'Got error ' + RETCODE2TYPE[code] + ': ' + line)
					}
					// Invoke pending callback for single-line responses (e.g. 202 DATA STORE OK or 5xx error)
					// Use status from response (e.g. 'DATA') so we don't steal callbacks from other commands
					const cbKey = (status && self.response_callback[status.toUpperCase()] && self.response_callback[status.toUpperCase()].length > 0)
						? status.toUpperCase()
						: self._pendingResponseKey
					if (amcp_state === ACMP_STATE.NEXT && cbKey && self.response_callback[cbKey] && self.response_callback[cbKey].length > 0) {
						const cb = self.response_callback[cbKey].shift()
						if (cbKey === self._pendingResponseKey) self._pendingResponseKey = undefined
						if (typeof cb === 'function') cb(error ? new Error(line) : null, line)
					}
				} else {
					self.log('error', 'Protocol out of sync, expected number: ' + line)
					return
				}
		} else if (amcp_state === ACMP_STATE.SINGLE_LINE) {
			amcp_state = ACMP_STATE.NEXT
			if (error_code !== undefined) {
				const errType = RETCODE2TYPE[error_code] || String(error_code)
				self.log('error', 'Got error ' + errType + ': ' + line)
				const key = self._pendingResponseKey
				if (key && self.response_callback[key] !== undefined && self.response_callback[key].length > 0) {
					const cb = self.response_callback[key].shift()
					self._pendingResponseKey = undefined
					if (typeof cb === 'function') cb(new Error(errType + ': ' + line))
				} else {
					self._pendingResponseKey = undefined
				}
				if (self.runCommandQueue) self.runCommandQueue()
			} else {
					response_current = response_current.toUpperCase()
					if (self.response_callback[response_current] !== undefined && self.response_callback[response_current].length) {
						const cb = self.response_callback[response_current].shift()
						if (typeof cb === 'function') cb(line)
					}
				}
			} else if (amcp_state === ACMP_STATE.MULTI_LINE) {
				if (line === '') {
					amcp_state = ACMP_STATE.NEXT
					response_current = response_current.toUpperCase()
					if (self.response_callback[response_current] !== undefined && self.response_callback[response_current].length) {
						const cb = self.response_callback[response_current].shift()
						if (typeof cb === 'function') {
							cb(multilinedata)
							multilinedata = []
						}
					}
				} else {
					multilinedata.push(line)
				}
			}
		})
	}
}

module.exports = { initTcp }
