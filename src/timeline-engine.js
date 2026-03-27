/**
 * Timeline engine — data model + AMCP playback.
 * Plays timelines by sending timed PLAY/STOP/CALL SEEK/MIXER commands.
 * @see main_plan.md Prompt 16
 */
'use strict'

const { EventEmitter } = require('events')

const TICK_MS = 40 // ~25 fps evaluation interval

function uid() {
	return 'tl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

class TimelineEngine extends EventEmitter {
	constructor(self) {
		super()
		this.self = self
		this.timelines = new Map() // id -> timeline object
		this._pb = null // active playback state
		this._ticker = null
		this._prevKey = new Map() // "ch-li" -> { clipId } — to detect clip changes
		this._lastKfValues = new Map() // "ch-layer-prop" -> value — only send when changed
	}

	// ── CRUD ──────────────────────────────────────────────────────────────────

	create(opts) {
		const id = opts?.id || uid()
		const tl = {
			id,
			name: opts?.name || 'Timeline',
			duration: opts?.duration || 30000,
			fps: opts?.fps || 25,
			layers: opts?.layers || [
				{ id: uid(), name: 'Layer 1', clips: [] },
				{ id: uid(), name: 'Layer 2', clips: [] },
				{ id: uid(), name: 'Layer 3', clips: [] },
			],
		}
		this.timelines.set(id, tl)
		this._emitChange()
		return tl
	}

	get(id) {
		return this.timelines.get(id) || null
	}

	getAll() {
		return [...this.timelines.values()]
	}

	/** Replace a timeline entirely (used when client syncs edits). */
	update(id, tl) {
		if (!this.timelines.has(id)) return null
		this.timelines.set(id, { ...tl, id })
		this._emitChange()
		return this.timelines.get(id)
	}

	delete(id) {
		if (this._pb?.timelineId === id) this.stop(id)
		this.timelines.delete(id)
		this._emitChange()
	}

	/** Add a keyframe to a clip. Finds clip at current playhead on the specified layer. */
	addKeyframeAtNow(timelineId, layerIdx, property, value) {
		const tl = this.timelines.get(timelineId || this._pb?.timelineId)
		if (!tl) return null
		const ms = this._nowMs()
		const layer = tl.layers[layerIdx]
		if (!layer) return null
		const clip = this._clipAt(layer, ms)
		if (!clip) return null
		const localMs = Math.round(ms - clip.startTime)
		const kf = { time: Math.max(0, localMs), property, value, easing: 'linear' }
		clip.keyframes = (clip.keyframes || []).filter(
			(k) => !(k.property === kf.property && Math.abs(k.time - kf.time) < 0.5)
		)
		clip.keyframes.push(kf)
		clip.keyframes.sort((a, b) => a.time - b.time)
		this._emitChange()
		return kf
	}

	/** Get active playback position in ms. */
	getPositionMs() {
		return this._nowMs()
	}

	/** Interpolated keyframe value at local time (ms inside clip), or default. */
	_interpProp(clip, prop, localMs, defVal) {
		const kfs = (clip.keyframes || []).filter((k) => k.property === prop).sort((a, b) => a.time - b.time)
		if (!kfs.length) return defVal
		const v = this._lerp(kfs, localMs)
		return v != null ? v : defVal
	}

	/**
	 * Adjust fill/scale at current playhead (adds/replaces keyframes at current local time).
	 * @param {string} [timelineId]
	 * @param {number} layerIdx - 0-based
	 * @param {'pos_x'|'pos_y'|'size_w'|'size_h'} axis
	 * @param {number} delta - normalized units for fill (e.g. 0.005), scale (e.g. 0.02)
	 * @param {boolean} aspectLocked - for size_w/size_h keep scale_x/scale_y ratio
	 */
	adjustClipFillDelta(timelineId, layerIdx, axis, delta, aspectLocked) {
		const tl = this.timelines.get(timelineId || this._pb?.timelineId)
		if (!tl) return null
		const layer = tl.layers[layerIdx]
		if (!layer) return null
		const ms = this._nowMs()
		const clip = this._clipAt(layer, ms)
		if (!clip) return null
		const localMs = Math.round(ms - clip.startTime)
		let fx = this._interpProp(clip, 'fill_x', localMs, 0)
		let fy = this._interpProp(clip, 'fill_y', localMs, 0)
		let sx = this._interpProp(clip, 'scale_x', localMs, 1)
		let sy = this._interpProp(clip, 'scale_y', localMs, 1)
		const ar = sx > 0 ? sy / sx : 1

		if (axis === 'pos_x') fx = Math.max(-2, Math.min(2, fx + delta))
		else if (axis === 'pos_y') fy = Math.max(-2, Math.min(2, fy + delta))
		else if (axis === 'size_w') {
			sx = Math.max(0.01, Math.min(8, sx + delta))
			if (aspectLocked) sy = sx * ar
		} else if (axis === 'size_h') {
			sy = Math.max(0.01, Math.min(8, sy + delta))
			if (aspectLocked) sx = ar > 0 ? sy / ar : sx
		}

		for (const [prop, val] of [
			['fill_x', fx],
			['fill_y', fy],
			['scale_x', sx],
			['scale_y', sy],
		]) {
			clip.keyframes = (clip.keyframes || []).filter((k) => !(k.property === prop && Math.abs(k.time - localMs) < 0.5))
			clip.keyframes.push({ time: localMs, property: prop, value: val, easing: 'linear' })
		}
		clip.keyframes.sort((a, b) => a.time - b.time || String(a.property).localeCompare(String(b.property)))
		this._emitChange()
		if (this._pb?.timelineId === tl.id) this._applyAt(tl.id, ms, true)
		return { fill_x: fx, fill_y: fy, scale_x: sx, scale_y: sy }
	}

	/**
	 * Add/replace keyframe(s) at current playhead using **interpolated** values (capture what you see).
	 * @param {string} timelineId
	 * @param {number} layerIdx - 0-based
	 * @param {'opacity'|'volume'|'position'|'scale'|'fill_x'|'fill_y'|'scale_x'|'scale_y'} param
	 * @returns {boolean} ok
	 */
	captureKeyframeAtNow(timelineId, layerIdx, param) {
		const tl = this.timelines.get(timelineId || this._pb?.timelineId)
		if (!tl) return false
		const layer = tl.layers[layerIdx]
		if (!layer) return false
		const ms = this._nowMs()
		const clip = this._clipAt(layer, ms)
		if (!clip) return false
		const t = Math.max(0, Math.round(ms - clip.startTime))

		const addKf = (prop, val) => {
			clip.keyframes = (clip.keyframes || []).filter((k) => !(k.property === prop && Math.abs(k.time - t) < 0.5))
			clip.keyframes.push({ time: t, property: prop, value: val, easing: 'linear' })
		}

		switch (param) {
			case 'opacity':
				addKf('opacity', this._interpProp(clip, 'opacity', t, 1))
				break
			case 'volume':
				addKf('volume', this._interpProp(clip, 'volume', t, clip.volume != null ? clip.volume : 1))
				break
			case 'fill_x':
				addKf('fill_x', this._interpProp(clip, 'fill_x', t, 0))
				break
			case 'fill_y':
				addKf('fill_y', this._interpProp(clip, 'fill_y', t, 0))
				break
			case 'scale_x':
				addKf('scale_x', this._interpProp(clip, 'scale_x', t, 1))
				break
			case 'scale_y':
				addKf('scale_y', this._interpProp(clip, 'scale_y', t, 1))
				break
			case 'position':
				addKf('fill_x', this._interpProp(clip, 'fill_x', t, 0))
				addKf('fill_y', this._interpProp(clip, 'fill_y', t, 0))
				break
			case 'scale':
				addKf('scale_x', this._interpProp(clip, 'scale_x', t, 1))
				addKf('scale_y', this._interpProp(clip, 'scale_y', t, 1))
				break
			default:
				return false
		}

		clip.keyframes.sort((a, b) => a.time - b.time || String(a.property).localeCompare(String(b.property)))
		this._emitChange()
		if (this._pb?.timelineId === tl.id) this._applyAt(tl.id, ms, true)
		return true
	}

	// ── Playback ──────────────────────────────────────────────────────────────

	play(id, fromMs) {
		const tl = this.timelines.get(id)
		if (!tl) return
		const pos = fromMs != null ? fromMs : (this._pb?.timelineId === id ? this._pb.position : 0)
		if (this._ticker) clearInterval(this._ticker)
		const wasPaused = this._pb?.timelineId === id && !this._pb?.playing && this._prevKey.size > 0
		if (wasPaused) {
			this._resumeAll()
		} else {
			this._prevKey = new Map()
			this._lastKfValues.clear()
		}
		this._pb = {
			timelineId: id,
			position: pos,
			playing: true,
			loop: this._pb?.loop ?? false,
			sendTo: this._pb?.sendTo || { preview: false, program: true },
			_t0: Date.now(),
			_p0: pos,
		}
		if (!wasPaused) this._applyAt(id, pos, true)
		this._ticker = setInterval(() => this._tick(), TICK_MS)
		this._emitPb()
	}

	pause(id) {
		if (!this._pb || this._pb.timelineId !== id) return
		if (this._ticker) { clearInterval(this._ticker); this._ticker = null }
		const now = this._nowMs()
		this._pb = { ...this._pb, position: now, _p0: now, _t0: Date.now(), playing: false }
		// Send PAUSE (not LOAD+SEEK) so clip pauses in place without skip
		this._pauseAll()
		this._emitPb()
	}

	stop(id) {
		if (!this._pb) return
		if (this._ticker) { clearInterval(this._ticker); this._ticker = null }
		const saved = this._pb
		this._pb = { ...saved, position: 0, playing: false, _p0: 0, _t0: Date.now() }
		const tl = this.timelines.get(saved.timelineId)
		if (tl) this._stopAll(tl)
		this._prevKey = new Map()
		this._lastKfValues.clear()
		this._emitPb()
	}

	/**
	 * Seek to position in ms.
	 * Sends PLAY <clip> SEEK <frame> for active clips (or CALL SEEK if same clip).
	 * Called on every ruler drag event.
	 */
	seek(id, ms) {
		const tl = this.timelines.get(id)
		if (!tl) return
		const pos = Math.max(0, Math.min(ms, tl.duration))
		if (!this._pb || this._pb.timelineId !== id) {
			this._pb = {
				timelineId: id,
				position: pos,
				playing: false,
				loop: false,
				sendTo: { preview: false, program: true },
				_t0: Date.now(),
				_p0: pos,
			}
		} else {
			this._pb = { ...this._pb, position: pos, _p0: pos, _t0: Date.now() }
		}
		this._applyAt(id, pos, true)
		this._emitPb()
	}

	setSendTo(sendTo) {
		const oldCh = this._pb ? this._channelsFor(this._pb.sendTo) : []
		if (!this._pb) this._pb = { position: 0, playing: false, loop: false, sendTo, _t0: Date.now(), _p0: 0 }
		else this._pb = { ...this._pb, sendTo }
		const newCh = this._channelsFor(sendTo)
		const removed = oldCh.filter((c) => !newCh.includes(c))
		if (removed.length > 0) {
			const tl = this.timelines.get(this._pb?.timelineId)
			const self = this.self
			if (tl && self?.amcp) {
				for (const ch of removed) {
					for (let li = 0; li < tl.layers.length; li++) {
						const caspLayer = this._caspLayer(ch, li)
						self.amcp.stop(ch, caspLayer).catch(() => {})
						this._prevKey.delete(`${ch}-${caspLayer}`)
						for (const pk of this._lastKfValues.keys())
							if (pk.startsWith(`${ch}-${caspLayer}-`)) this._lastKfValues.delete(pk)
					}
				}
			}
		}
		this._emitPb()
	}

	setLoop(id, loop) {
		if (this._pb?.timelineId === id) this._pb = { ...this._pb, loop }
	}

	getPlayback() {
		if (!this._pb) return null
		const { _t0, _p0, ...rest } = this._pb
		return { ...rest, position: this._nowMs() }
	}

	// ── Internal ──────────────────────────────────────────────────────────────

	_tick() {
		const pb = this._pb
		if (!pb?.playing) return
		const ms = this._nowMs()
		const tl = this.timelines.get(pb.timelineId)
		if (!tl) return
		if (ms >= tl.duration) {
			if (pb.loop) { this.play(pb.timelineId, 0); return }
			this.stop(pb.timelineId); return
		}
		this._pb.position = ms
		this._applyAt(pb.timelineId, ms, false)
		this.emit('tick', { timelineId: pb.timelineId, position: ms })
	}

	_nowMs() {
		if (!this._pb?.playing) return this._pb?.position ?? 0
		return this._pb._p0 + (Date.now() - this._pb._t0)
	}

	/** Preview channel has black on layer 10; use layers 11-19 so timeline is visible. */
	_caspLayer(ch, li) {
		let map = null
		try { map = this.self?.config ? require('./routing').getChannelMap(this.self.config) : null } catch {}
		const prevChs = map?.previewChannels || []
		const offset = prevChs.includes(ch) ? 10 : 0
		return offset + li + 1
	}

	_applyAt(id, ms, force) {
		const tl = this.timelines.get(id)
		const self = this.self
		if (!tl || !self?.amcp) return
		const channels = this._channels()

		for (let li = 0; li < tl.layers.length; li++) {
			const layer = tl.layers[li]
			const clip = this._clipAt(layer, ms)

			for (const ch of channels) {
				const caspLayer = this._caspLayer(ch, li)
				const key = `${ch}-${caspLayer}`
				const prev = this._prevKey.get(key)

	if (clip) {
			const src = String(clip.source?.value || '')
			const isRoute = src.startsWith('route://')
			const newClip = !prev || prev.clipId !== clip.id
			const playing = this._pb?.playing ?? false
			const loopClip = clip.loopAlways || clip.loop
			const frame = !isRoute ? Math.floor((ms - clip.startTime) * tl.fps / 1000) + (clip.inPoint || 0) : 0
		if (clip.loopAlways) {
			// loopAlways: PLAY LOOP on enter, ignore seek — clip runs independently
			if (newClip) {
				self.amcp.raw(`PLAY ${ch}-${caspLayer} ${src} LOOP`).catch(() => {})
			}
		} else if (force || newClip) {
			if (isRoute) {
				self.amcp.raw(`PLAY ${ch}-${caspLayer} ${src}`).catch(() => {})
			} else if (playing || loopClip) {
				const loopStr = loopClip ? ' LOOP' : ''
				self.amcp.raw(`PLAY ${ch}-${caspLayer} ${src}${loopStr} SEEK ${frame}`).catch(() => {})
			} else {
				self.amcp.raw(`LOAD ${ch}-${caspLayer} ${src} SEEK ${frame}`).catch(() => {})
			}
		} else if (force && !isRoute && prev?.clipId === clip.id) {
			self.amcp.call(ch, caspLayer, 'SEEK', String(frame)).catch(() => {})
		}
				if (force || newClip) {
					for (const pk of this._lastKfValues.keys())
						if (pk.startsWith(`${ch}-${caspLayer}-`)) this._lastKfValues.delete(pk)
				}
				this._applyKf(ch, caspLayer, clip, ms - clip.startTime)
				this._prevKey.set(key, { clipId: clip.id })
			} else if (prev?.clipId) {
				self.amcp.stop(ch, caspLayer).catch(() => {})
				this._prevKey.set(key, null)
				// Clear keyframe cache for this layer so next clip gets fresh values
				for (const pk of this._lastKfValues.keys())
					if (pk.startsWith(`${ch}-${caspLayer}-`)) this._lastKfValues.delete(pk)
			}
			}
		}
	}

	_applyKf(ch, layer, clip, localMs) {
		if (!clip.keyframes?.length) return
		const self = this.self
		if (!self?.amcp) return
		const byProp = {}
		for (const kf of clip.keyframes) {
			;(byProp[kf.property] = byProp[kf.property] || []).push(kf)
		}
		const FILL_PROPS = ['fill_x', 'fill_y', 'scale_x', 'scale_y']
		let fillChanged = false
		for (const [prop, kfs] of Object.entries(byProp)) {
			const sorted = kfs.slice().sort((a, b) => a.time - b.time)
			const val = this._lerp(sorted, localMs)
			if (val == null) continue
			const k = `${ch}-${layer}-${prop}`
			const last = this._lastKfValues.get(k)
			if (last !== undefined && Math.abs(val - last) < 1e-6) continue
			this._lastKfValues.set(k, val)
			if (prop === 'opacity') self.amcp.mixerOpacity(ch, layer, val).catch(() => {})
			if (prop === 'volume') self.amcp.mixerVolume(ch, layer, val).catch(() => {})
			if (FILL_PROPS.includes(prop)) fillChanged = true
		}
		if (fillChanged) {
			const fx = this._lastKfValues.get(`${ch}-${layer}-fill_x`) ?? 0
			const fy = this._lastKfValues.get(`${ch}-${layer}-fill_y`) ?? 0
			const sx = this._lastKfValues.get(`${ch}-${layer}-scale_x`) ?? 1
			const sy = this._lastKfValues.get(`${ch}-${layer}-scale_y`) ?? 1
			self.amcp.raw(`MIXER ${ch}-${layer} FILL ${fx} ${fy} ${sx} ${sy}`).catch(() => {})
		}
	}

	_lerp(kfs, t) {
		if (!kfs.length) return null
		if (t <= kfs[0].time) return kfs[0].value
		const last = kfs[kfs.length - 1]
		if (t >= last.time) return last.value
		for (let i = 0; i < kfs.length - 1; i++) {
			const a = kfs[i], b = kfs[i + 1]
			if (t >= a.time && t <= b.time) {
				return a.value + (b.value - a.value) * (t - a.time) / (b.time - a.time)
			}
		}
		return null
	}

	_clipAt(layer, ms) {
		for (const c of (layer.clips || []))
			if (ms >= c.startTime && ms < c.startTime + c.duration) return c
		return null
	}

	/** Get channel list for a given sendTo (used by setSendTo to detect removed channels). */
	_channelsFor(sendTo) {
		const st = sendTo || { preview: false, program: true }
		let map = null
		try { map = this.self?.config ? require('./routing').getChannelMap(this.self.config) : null } catch {}
		const screenCount = map?.screenCount || 1
		const screenIdx = st.screenIdx != null ? st.screenIdx : null
		const ch = []
		const addScreen = (i) => {
			if (st.preview !== false) ch.push(map?.previewCh ? map.previewCh(i + 1) : (i + 1) * 2)
			if (st.program) ch.push(map?.programCh ? map.programCh(i + 1) : (i + 1) * 2 - 1)
		}
		if (screenIdx !== null) addScreen(screenIdx)
		else for (let i = 0; i < screenCount; i++) addScreen(i)
		if (ch.length === 0) ch.push(st.program ? (map?.programCh?.(1) ?? 1) : (map?.previewCh?.(1) ?? 2))
		return ch
	}

	_channels() {
		return this._channelsFor(this._pb?.sendTo)
	}

	_pauseAll() {
		const self = this.self
		if (!self?.amcp) return
		for (const key of this._prevKey.keys()) {
			const [ch, caspLayer] = key.split('-').map(Number)
			if (!isNaN(ch) && !isNaN(caspLayer))
				self.amcp.pause(ch, caspLayer).catch(() => {})
		}
	}

	_resumeAll() {
		const self = this.self
		if (!self?.amcp) return
		for (const key of this._prevKey.keys()) {
			const [ch, caspLayer] = key.split('-').map(Number)
			if (!isNaN(ch) && !isNaN(caspLayer))
				self.amcp.resume(ch, caspLayer).catch(() => {})
		}
	}

	_stopAll(tl) {
		const self = this.self
		if (!self?.amcp) return
		const channels = this._channels()
		for (let li = 0; li < tl.layers.length; li++)
			for (const ch of channels)
				self.amcp.stop(ch, this._caspLayer(ch, li)).catch(() => {})
		this._lastKfValues.clear()
	}

	_emitChange() { this.emit('change', this.getAll()) }
	_emitPb() { this.emit('playback', this.getPlayback()) }
}

module.exports = { TimelineEngine }
