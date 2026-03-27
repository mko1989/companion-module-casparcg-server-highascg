/**
 * AMCP command abstraction layer. All methods return Promises resolving with server response.
 * @see main_plan.md Prompt 6
 */

function param(str) {
	if (str == null || str === '') return ''
	const s = String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
	return /\s/.test(s) ? `"${s}"` : s
}

function chLayer(channel, layer) {
	const c = parseInt(channel, 10)
	if (layer === undefined || layer === null || layer === '') return String(c)
	return `${c}-${parseInt(layer, 10)}`
}

class AmcpCommands {
	constructor(self) {
		this.self = self
	}

	/**
	 * Send raw AMCP command and return Promise. Uses socket.send (not requestData) to preserve case in params.
	 * @param {string} cmd - Full AMCP command (e.g. "PLAY 1-1 video.mov")
	 * @param {string} [responseKey] - Key for callback queue (e.g. "PLAY", "DATA", "CG"). Default: first word of cmd.
	 * @returns {Promise<{ ok: boolean, data?: string|string[] }>}
	 */
	_send(cmd, responseKey) {
		const self = this.self
		const key = (responseKey || cmd.trim().split(/\s+/)[0]).toUpperCase()
		return new Promise((resolve, reject) => {
			if (!self.socket || !self.socket.isConnected) {
				reject(new Error('Not connected'))
				return
			}
			if (self.response_callback[key] === undefined) self.response_callback[key] = []
			// tcp.js invokes: (err, line) for 202, (line) for 201, (lines) for 200
			self.response_callback[key].push((a, b) => {
				if (a instanceof Error) return reject(a)
				const data = b !== undefined ? b : a
				resolve({ ok: true, data })
			})
			self._pendingResponseKey = key
			self.socket.send(cmd.trim() + '\r\n')
		})
	}

	// —— Basic ———————————————————————————————————————————————————————————————
	loadbg(channel, layer, clip, opts = {}) {
		let cmd = `LOADBG ${chLayer(channel, layer)}`
		if (clip) cmd += ' ' + param(clip)
		if (opts.transition && opts.transition !== 'CUT')
			cmd += ` ${opts.transition} ${opts.duration || 0} ${param(opts.tween || 'linear')}`
		if (opts.loop) cmd += ' LOOP'
		if (opts.auto) cmd += ' AUTO'
		if (opts.parameters) cmd += ' ' + opts.parameters
		return this._send(cmd, 'LOADBG')
	}

	load(channel, layer, clip, opts = {}) {
		let cmd = `LOAD ${chLayer(channel, layer)}`
		if (clip) cmd += ' ' + param(clip)
		if (opts.transition && opts.transition !== 'CUT')
			cmd += ` ${opts.transition} ${opts.duration || 0} ${param(opts.tween || 'linear')}`
		if (opts.loop) cmd += ' LOOP'
		if (opts.parameters) cmd += ' ' + opts.parameters
		return this._send(cmd, 'LOAD')
	}

	play(channel, layer, clip, opts = {}) {
		let cmd = `PLAY ${chLayer(channel, layer)}`
		if (clip) cmd += ' ' + param(clip)
		// AMCP spec: LOOP must come before the transition parameters
		if (opts.loop) cmd += ' LOOP'
		if (opts.transition && opts.transition !== 'CUT')
			cmd += ` ${opts.transition} ${opts.duration || 0} ${param(opts.tween || 'linear')}`
		if (opts.auto) cmd += ' AUTO'
		if (opts.parameters) cmd += ' ' + opts.parameters
		return this._send(cmd, 'PLAY')
	}

	pause(channel, layer) {
		return this._send(`PAUSE ${chLayer(channel, layer)}`, 'PAUSE')
	}

	resume(channel, layer) {
		return this._send(`RESUME ${chLayer(channel, layer)}`, 'RESUME')
	}

	stop(channel, layer) {
		return this._send(`STOP ${chLayer(channel, layer)}`, 'STOP')
	}

	clear(channel, layer) {
		return this._send(`CLEAR ${chLayer(channel, layer)}`, 'CLEAR')
	}

	call(channel, layer, fn, paramsStr) {
		let cmd = `CALL ${chLayer(channel, layer)} ${fn}`
		if (paramsStr) cmd += ' ' + paramsStr
		return this._send(cmd, 'CALL')
	}

	swap(channel1, layer1, channel2, layer2, transforms) {
		let cmd = `SWAP ${chLayer(channel1, layer1)} ${chLayer(channel2, layer2)}`
		if (transforms) cmd += ' TRANSFORMS'
		return this._send(cmd, 'SWAP')
	}

	add(channel, consumer, paramsStr) {
		let cmd = `ADD ${parseInt(channel, 10)} ${consumer}`
		if (paramsStr) cmd += ' ' + paramsStr
		return this._send(cmd, 'ADD')
	}

	remove(channel, consumer, paramsStr) {
		let cmd = `REMOVE ${parseInt(channel, 10)} ${consumer}`
		if (paramsStr) cmd += ' ' + paramsStr
		return this._send(cmd, 'REMOVE')
	}

	// —— Mixer —————————————————————————————————————————————————————————————————
	_mixer(channel, layer, subcmd, key = 'MIXER') {
		const cl = chLayer(channel, layer)
		return this._send(`MIXER ${cl} ${subcmd}`, key)
	}

	mixerKeyer(channel, layer, keyer) {
		return this._mixer(channel, layer, `KEYER ${keyer ? 1 : 0}`)
	}

	mixerBlend(channel, layer, mode) {
		return this._mixer(channel, layer, `BLEND ${param(mode)}`)
	}

	mixerOpacity(channel, layer, opacity, duration, tween) {
		let p = String(opacity)
		if (duration != null) p += ` ${duration}`
		if (tween) p += ` ${param(tween)}`
		return this._mixer(channel, layer, `OPACITY ${p}`)
	}

	mixerBrightness(channel, layer, val, duration, tween) {
		let p = String(val)
		if (duration != null) p += ` ${duration}`
		if (tween) p += ` ${param(tween)}`
		return this._mixer(channel, layer, `BRIGTHNESS ${p}`) // CasparCG typo: BRIGTHNESS
	}

	mixerSaturation(channel, layer, val, duration, tween) {
		let p = String(val)
		if (duration != null) p += ` ${duration}`
		if (tween) p += ` ${param(tween)}`
		return this._mixer(channel, layer, `SATURATION ${p}`)
	}

	mixerContrast(channel, layer, val, duration, tween) {
		let p = String(val)
		if (duration != null) p += ` ${duration}`
		if (tween) p += ` ${param(tween)}`
		return this._mixer(channel, layer, `CONTRAST ${p}`)
	}

	mixerLevels(channel, layer, minIn, maxIn, gamma, minOut, maxOut, duration, tween) {
		let p = `${minIn} ${maxIn} ${gamma} ${minOut} ${maxOut}`
		if (duration != null) p += ` ${duration}`
		if (tween) p += ` ${param(tween)}`
		return this._mixer(channel, layer, `LEVELS ${p}`)
	}

	mixerFill(channel, layer, x, y, xScale, yScale, duration, tween) {
		let p = `${x} ${y} ${xScale} ${yScale}`
		if (duration != null) p += ` ${duration}`
		if (tween) p += ` ${param(tween)}`
		return this._mixer(channel, layer, `FILL ${p}`)
	}

	mixerClip(channel, layer, x, y, xScale, yScale, duration, tween) {
		let p = `${x} ${y} ${xScale} ${yScale}`
		if (duration != null) p += ` ${duration}`
		if (tween) p += ` ${param(tween)}`
		return this._mixer(channel, layer, `CLIP ${p}`)
	}

	mixerAnchor(channel, layer, x, y) {
		return this._mixer(channel, layer, `ANCHOR ${x} ${y}`)
	}

	mixerCrop(channel, layer, left, top, right, bottom) {
		return this._mixer(channel, layer, `CROP ${left} ${top} ${right} ${bottom}`)
	}

	mixerRotation(channel, layer, degrees, duration, tween) {
		let p = String(degrees)
		if (duration != null) p += ` ${duration}`
		if (tween) p += ` ${param(tween)}`
		return this._mixer(channel, layer, `ROTATION ${p}`)
	}

	mixerPerspective(channel, layer, nwX, nwY, neX, neY, swX, swY, seX, seY, duration, tween) {
		let p = `${nwX} ${nwY} ${neX} ${neY} ${swX} ${swY} ${seX} ${seY}`
		if (duration != null) p += ` ${duration}`
		if (tween) p += ` ${param(tween)}`
		return this._mixer(channel, layer, `PERSPECTIVE ${p}`)
	}

	mixerMipmap(channel, layer, enabled) {
		return this._mixer(channel, layer, `MIPMAP ${enabled ? 1 : 0}`)
	}

	mixerVolume(channel, layer, volume, duration, tween) {
		let p = String(volume)
		if (duration != null) p += ` ${duration}`
		if (tween) p += ` ${param(tween)}`
		return this._mixer(channel, layer, `VOLUME ${p}`)
	}

	mixerMastervolume(channel, volume) {
		return this._send(`MIXER ${parseInt(channel, 10)} MASTERVOLUME ${volume}`, 'MIXER')
	}

	mixerGrid(channel, resolution) {
		return this._send(`MIXER ${parseInt(channel, 10)} GRID ${parseInt(resolution, 10)}`, 'MIXER')
	}

	mixerCommit(channel) {
		return this._send(`MIXER ${parseInt(channel, 10)} COMMIT`, 'MIXER')
	}

	mixerClear(channel, layer) {
		return this._mixer(channel, layer, 'CLEAR')
	}

	// —— CG ———————————————————————————————————————————————————————————————————
	cgAdd(channel, layer, templateHostLayer, template, playOnLoad, data) {
		let cmd = `CG ${chLayer(channel, layer)} ADD ${parseInt(templateHostLayer, 10)} ${param(template)}`
		cmd += ' ' + (playOnLoad ? 1 : 0)
		if (data) cmd += ' ' + param(data)
		return this._send(cmd, 'CG')
	}

	cgRemove(channel, layer, templateHostLayer) {
		return this._send(`CG ${chLayer(channel, layer)} REMOVE ${parseInt(templateHostLayer, 10)}`, 'CG')
	}

	cgClear(channel, layer) {
		return this._send(`CG ${chLayer(channel, layer)} CLEAR`, 'CG')
	}

	cgPlay(channel, layer, templateHostLayer) {
		return this._send(`CG ${chLayer(channel, layer)} PLAY ${parseInt(templateHostLayer, 10)}`, 'CG')
	}

	cgStop(channel, layer, templateHostLayer) {
		return this._send(`CG ${chLayer(channel, layer)} STOP ${parseInt(templateHostLayer, 10)}`, 'CG')
	}

	cgNext(channel, layer, templateHostLayer) {
		return this._send(`CG ${chLayer(channel, layer)} NEXT ${parseInt(templateHostLayer, 10)}`, 'CG')
	}

	cgGoto(channel, layer, templateHostLayer, label) {
		let cmd = `CG ${chLayer(channel, layer)} GOTO ${parseInt(templateHostLayer, 10)}`
		if (label) cmd += ' ' + param(label)
		return this._send(cmd, 'CG')
	}

	cgUpdate(channel, layer, templateHostLayer, data) {
		return this._send(`CG ${chLayer(channel, layer)} UPDATE ${parseInt(templateHostLayer, 10)} ${param(data)}`, 'CG')
	}

	cgInvoke(channel, layer, templateHostLayer, method) {
		return this._send(`CG ${chLayer(channel, layer)} INVOKE ${parseInt(templateHostLayer, 10)} ${param(method)}`, 'CG')
	}

	cgInfo(channel, layer) {
		return this._send(`CG ${chLayer(channel, layer)} INFO`, 'CG')
	}

	// —— Data —————————————————————————————————————————————————────────────────—
	dataStore(name, data) {
		const escaped = String(data)
			.replace(/\\/g, '\\\\')
			.replace(/"/g, '\\"')
			.replace(/\r\n/g, '\\n')
			.replace(/\r/g, '\\n')
			.replace(/\n/g, '\\n')
		const nameQ = (name == null || name === '') ? '""' : (/\s/.test(String(name)) ? `"${String(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : String(name))
		return this._send(`DATA STORE ${nameQ} "${escaped}"`, 'DATA')
	}

	dataRetrieve(name) {
		return this._send(`DATA RETRIEVE ${param(name)}`, 'DATA')
	}

	dataList() {
		return this._send('DATA LIST', 'DATA')
	}

	dataRemove(name) {
		return this._send(`DATA REMOVE ${param(name)}`, 'DATA')
	}

	// —— Query —————————————————————————————————————————————————————————————————
	cinf(filename) {
		return this._send(`CINF ${param(filename)}`, 'CINF')
	}

	cls() {
		return this._send('CLS', 'CLS')
	}

	tls() {
		return this._send('TLS', 'TLS')
	}

	version(component) {
		const cmd = component ? `VERSION ${param(component)}` : 'VERSION'
		return this._send(cmd, 'VERSION')
	}

	info(channel, layer) {
		let cmd = 'INFO'
		if (channel != null && channel !== '') cmd += ' ' + chLayer(channel, layer)
		return this._send(cmd, 'INFO')
	}

	infoPaths() {
		return this._send('INFO PATHS', 'INFO')
	}

	infoSystem() {
		return this._send('INFO SYSTEM', 'INFO')
	}

	infoConfig() {
		return this._send('INFO CONFIG', 'INFO')
	}

	infoTemplate(filename) {
		return this._send(`INFO TEMPLATE ${param(filename)}`, 'INFO')
	}

	// —— Misc ———————————————————————————————————————————————————————————————————
	diag() {
		return this._send('DIAG', 'DIAG')
	}

	bye() {
		return this._send('BYE', 'BYE')
	}

	channelGrid() {
		return this._send('CHANNEL_GRID', 'CHANNEL_GRID')
	}

	restart() {
		return this._send('RESTART', 'RESTART')
	}

	kill() {
		return this._send('KILL', 'KILL')
	}

	// —— Thumbnail —————————————————————————————————————————————————────────—————
	thumbnailList() {
		return this._send('THUMBNAIL LIST', 'THUMBNAIL')
	}

	thumbnailRetrieve(filename) {
		return this._send(`THUMBNAIL RETRIEVE ${param(filename)}`, 'THUMBNAIL')
	}

	thumbnailGenerate(filename) {
		return this._send(`THUMBNAIL GENERATE ${param(filename)}`, 'THUMBNAIL')
	}

	thumbnailGenerateAll() {
		return this._send('THUMBNAIL GENERATE_ALL', 'THUMBNAIL')
	}

	/**
	 * Send raw AMCP command. Use for custom commands not covered by methods.
	 * @param {string} cmd - Full command string
	 * @returns {Promise<{ ok: boolean, data?: string|string[] }>}
	 */
	raw(cmd) {
		const first = (cmd.trim().match(/^(\S+)/) || [])[1]
		return this._send(cmd, first)
	}
}

module.exports = { AmcpCommands, param, chLayer }
