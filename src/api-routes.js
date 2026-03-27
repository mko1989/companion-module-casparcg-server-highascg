/**
 * API route handlers for CasparCG module. Returns { status, headers?, body? }.
 * Used by handleHttpRequest (Companion) and web-server (standalone).
 * @see main_plan.md Prompt 7
 */

const { buildConfigXml, getModeDimensions, STANDARD_VIDEO_MODES } = require('./config-generator')
const { getChannelMap } = require('./routing')
const { handleTimelineRoutes } = require('./timeline-routes')
const { handleProject, handleData } = require('./api-data')
const persistence = require('./persistence')
const { handleLocalMedia, probeMedia, resolveSafe } = require('./local-media')
const { parseCinfMedia } = require('./cinf-parse')

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function jsonBody(o) {
	return JSON.stringify(o)
}

async function queryLayerContentRes(self, channel, layer) {
	try {
		const info = await self.amcp.info(channel, layer)
		const s = Array.isArray(info?.data) ? info.data.join('\n') : String(info?.data || '')
		const wm = s.match(/<width>\s*(\d+)\s*<\/width>/i)
		const hm = s.match(/<height>\s*(\d+)\s*<\/height>/i)
		if (wm && hm) {
			const w = parseInt(wm[1], 10), h = parseInt(hm[1], 10)
			if (w > 0 && h > 0) return { w, h }
		}
	} catch {}
	return null
}

function calcStretchFill(mode, lx, ly, lw, lh, resW, resH, cw, ch) {
	const nx = lx / resW, ny = ly / resH
	const clipRect = { x: nx, y: ny, w: lw / resW, h: lh / resH }
	const ar = cw / ch

	if (mode === 'none') {
		return { x: nx, y: ny, xScale: cw / resW, yScale: ch / resH,
			clip: (cw > lw || ch > lh) ? clipRect : null }
	}
	if (mode === 'fit') {
		const fitScale = Math.min(lw / cw, lh / ch)
		const outW = cw * fitScale, outH = ch * fitScale
		const ox = lx + (lw - outW) / 2, oy = ly + (lh - outH) / 2
		return { x: ox / resW, y: oy / resH, xScale: outW / resW, yScale: outH / resH, clip: null }
	}
	if (mode === 'fill-h') {
		const outW = lw, outH = outW / ar
		const oy = ly + (lh - outH) / 2
		return { x: nx, y: oy / resH, xScale: outW / resW, yScale: outH / resH,
			clip: outH > lh ? clipRect : null }
	}
	if (mode === 'fill-v') {
		const outH = lh, outW = outH * ar
		const ox = lx + (lw - outW) / 2
		return { x: ox / resW, y: ny, xScale: outW / resW, yScale: outH / resH,
			clip: outW > lw ? clipRect : null }
	}
	return { x: nx, y: ny, xScale: lw / resW, yScale: lh / resH, clip: null }
}

function parseBody(body) {
	if (body == null) return {}
	if (typeof body === 'object' && !Buffer.isBuffer(body)) return body
	try {
		const s = Buffer.isBuffer(body) ? body.toString('utf8') : String(body)
		return JSON.parse(s || '{}')
	} catch {
		return {}
	}
}

function getState(self) {
	const cfg = self.config || {}
	const map = getChannelMap(cfg)
	const programResolutions = Array.from({ length: map.screenCount }, (_, i) => {
		const modeKey = cfg[`screen_${i + 1}_mode`] || cfg['screen_mode'] || '1080p5000'
		const dims = getModeDimensions(modeKey, cfg, i + 1)
		return dims ? { w: dims.width, h: dims.height, fps: dims.fps } : { w: 1920, h: 1080, fps: 50 }
	})
	// Merge decklink info from AMCP INFO CONFIG only when module config doesn't explicitly set 0
	const dlFromConfig = self.gatheredInfo?.decklinkFromConfig || {}
	const cfgDlExplicitZero = cfg.decklink_input_count != null && String(cfg.decklink_input_count) === '0'
	const decklinkCount = map.decklinkCount > 0 ? map.decklinkCount : (cfgDlExplicitZero ? 0 : (dlFromConfig.decklinkCount ?? 0))
	const inputsCh = map.decklinkCount > 0 ? map.inputsCh : (cfgDlExplicitZero ? null : (dlFromConfig.inputsCh ?? null))
	const inputsResolution =
		map.decklinkCount > 0 && map.inputsCh != null
			? (() => {
					const mode = String(cfg.inputs_channel_mode || '1080p5000')
					const dims = getModeDimensions(mode, cfg, 1)
					return dims ? { w: dims.width, h: dims.height, fps: dims.fps } : { w: 1920, h: 1080, fps: 50 }
				})()
			: (dlFromConfig.inputsResolution ?? null)

	const channelMap = {
		screenCount: map.screenCount,
		decklinkCount,
		programChannels: Array.from({ length: map.screenCount }, (_, i) => map.programCh(i + 1)),
		previewChannels: Array.from({ length: map.screenCount }, (_, i) => map.previewCh(i + 1)),
		multiviewCh: map.multiviewCh,
		inputsCh,
		programResolutions,
		inputsResolution,
	}
	let base
	if (self.state && typeof self.state.getState === 'function') {
		base = self.state.getState()
	} else {
		base = {
			variables: { ...self.variables },
			channels: self.gatheredInfo?.channelIds || [],
			channelStatus: self.gatheredInfo?.channelStatusLines || {},
			media: (self.CHOICES_MEDIAFILES || []).map((c) => ({ id: c.id, label: c.label })),
			templates: (self.CHOICES_TEMPLATES || []).map((c) => ({ id: c.id, label: c.label })),
		}
	}
	if (base.media) {
		base.media = base.media.map((m) => {
			const cinf = m.cinf || (self.mediaDetails || {})[m.id] || ''
			const parsed = parseCinfMedia(cinf)
			const probed = (self._mediaProbeCache || {})[m.id] || {}
			return { ...m, ...parsed, ...probed }
		})
	}
	return {
		...base,
		channelMap,
		localMediaEnabled: !!(cfg.local_media_path || '').trim(),
		configComparison: self._configComparison || null,
	}
}

async function handleAmcpBasic(method, path, body, self) {
	const b = parseBody(body)
	const { channel = 1, layer } = b
	const chLayer = layer != null && layer !== '' ? `${channel}-${layer}` : String(channel)

	switch (path) {
		case '/api/play': {
			const { clip, transition, duration, tween, loop, auto, parameters } = b
			const opts = { loop: !!loop, auto: !!auto }
			if (transition && transition !== 'CUT') opts.transition = transition
			if (duration != null) opts.duration = duration
			if (tween) opts.tween = tween
			if (parameters) opts.parameters = parameters
			const r = await self.amcp.play(channel, layer, clip, opts)
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
		}
		case '/api/loadbg': {
			const { clip, transition, duration, tween, loop, auto, parameters } = b
			const opts = { loop: !!loop, auto: !!auto }
			if (transition && transition !== 'CUT') opts.transition = transition
			if (duration != null) opts.duration = duration
			if (tween) opts.tween = tween
			if (parameters) opts.parameters = parameters
			const r = await self.amcp.loadbg(channel, layer, clip, opts)
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
		}
		case '/api/load': {
			const { clip, transition, duration, tween, loop, parameters } = b
			const opts = { loop: !!loop }
			if (transition && transition !== 'CUT') opts.transition = transition
			if (duration != null) opts.duration = duration
			if (tween) opts.tween = tween
			if (parameters) opts.parameters = parameters
			const r = await self.amcp.load(channel, layer, clip, opts)
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
		}
		case '/api/pause': {
			const r = await self.amcp.pause(channel, layer)
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
		}
		case '/api/resume': {
			const r = await self.amcp.resume(channel, layer)
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
		}
		case '/api/stop': {
			const r = await self.amcp.stop(channel, layer)
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
		}
		case '/api/clear': {
			const r = await self.amcp.clear(channel, layer)
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
		}
		case '/api/call': {
			const { fn, params: paramsStr } = b
			const r = await self.amcp.call(channel, layer, fn, paramsStr)
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
		}
		case '/api/swap': {
			const { channel2, layer2, transforms } = b
			const r = await self.amcp.swap(channel, layer, channel2, layer2, !!transforms)
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
		}
		case '/api/add': {
			const { consumer, params: paramsStr } = b
			const r = await self.amcp.add(channel, consumer, paramsStr)
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
		}
		case '/api/remove': {
			const { consumer, params: paramsStr } = b
			const r = await self.amcp.remove(channel, consumer, paramsStr)
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
		}
		default:
			return null
	}
}

async function handleMixer(path, body, self) {
	const m = path.match(/^\/api\/mixer\/([^/]+)$/)
	if (!m) return null
	const b = parseBody(body)
	const { channel = 1, layer } = b

	const cmd = m[1].toLowerCase()
	let r
	switch (cmd) {
		case 'keyer':
			r = await self.amcp.mixerKeyer(channel, layer, b.keyer)
			break
		case 'blend':
			r = await self.amcp.mixerBlend(channel, layer, b.mode)
			break
		case 'opacity':
			r = await self.amcp.mixerOpacity(channel, layer, b.opacity, b.duration, b.tween)
			break
		case 'brightness':
			r = await self.amcp.mixerBrightness(channel, layer, b.value, b.duration, b.tween)
			break
		case 'saturation':
			r = await self.amcp.mixerSaturation(channel, layer, b.value, b.duration, b.tween)
			break
		case 'contrast':
			r = await self.amcp.mixerContrast(channel, layer, b.value, b.duration, b.tween)
			break
		case 'levels':
			r = await self.amcp.mixerLevels(channel, layer, b.minIn, b.maxIn, b.gamma, b.minOut, b.maxOut, b.duration, b.tween)
			break
		case 'fill': {
			let fx = b.x, fy = b.y, fxs = b.xScale, fys = b.yScale
			const stretchMode = b.stretch
			if (stretchMode && stretchMode !== 'stretch') {
				const contentRes = await queryLayerContentRes(self, channel, layer)
				if (contentRes) {
					const resW = b.channelW || 1920, resH = b.channelH || 1080
					const lw = b.layerW || resW, lh = b.layerH || resH
					const lx = (b.layerX != null ? b.layerX : fx * resW)
					const ly = (b.layerY != null ? b.layerY : fy * resH)
					const sf = calcStretchFill(stretchMode, lx, ly, lw, lh, resW, resH, contentRes.w, contentRes.h)
					fx = sf.x; fy = sf.y; fxs = sf.xScale; fys = sf.yScale
					if (sf.clip) {
						try { await self.amcp.mixerClip(channel, layer, sf.clip.x, sf.clip.y, sf.clip.w, sf.clip.h) } catch {}
					} else {
						try { await self.amcp.mixerClip(channel, layer, 0, 0, 1, 1) } catch {}
					}
				}
			} else if (stretchMode === 'stretch') {
				try { await self.amcp.mixerClip(channel, layer, 0, 0, 1, 1) } catch {}
			}
			r = await self.amcp.mixerFill(channel, layer, fx, fy, fxs, fys, b.duration, b.tween)
			break
		}
		case 'clip':
			r = await self.amcp.mixerClip(channel, layer, b.x, b.y, b.xScale, b.yScale, b.duration, b.tween)
			break
		case 'anchor':
			r = await self.amcp.mixerAnchor(channel, layer, b.x, b.y)
			break
		case 'crop':
			r = await self.amcp.mixerCrop(channel, layer, b.left, b.top, b.right, b.bottom)
			break
		case 'rotation':
			r = await self.amcp.mixerRotation(channel, layer, b.degrees, b.duration, b.tween)
			break
		case 'volume':
			r = await self.amcp.mixerVolume(channel, layer, b.volume, b.duration, b.tween)
			break
		case 'mastervolume':
			r = await self.amcp.mixerMastervolume(channel, b.volume)
			break
		case 'grid':
			r = await self.amcp.mixerGrid(channel, b.resolution)
			break
		case 'commit':
			r = await self.amcp.mixerCommit(channel)
			break
		case 'clear':
			r = await self.amcp.mixerClear(channel, layer)
			break
		default:
			return { status: 400, headers: JSON_HEADERS, body: jsonBody({ error: `Unknown mixer command: ${cmd}` }) }
	}
	return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
}

async function handleMixerSafe(path, body, self) {
	try {
		return await handleMixer(path, body, self)
	} catch (e) {
		const msg = e?.message || String(e)
		const isConnection = /not connected|socket|econnrefused|etimedout|econnreset|connection refused|network/i.test(msg)
		return {
			status: isConnection ? 503 : 502,
			headers: JSON_HEADERS,
			body: jsonBody({ error: msg }),
		}
	}
}

async function handleCg(path, body, self) {
	const m = path.match(/^\/api\/cg\/([^/]+)$/)
	if (!m) return null
	const b = parseBody(body)
	const { channel = 1, layer, templateHostLayer = 1 } = b
	const cmd = m[1].toLowerCase()
	let r
	switch (cmd) {
		case 'add':
			r = await self.amcp.cgAdd(
				channel,
				layer,
				b.templateHostLayer ?? templateHostLayer,
				b.template,
				!!b.playOnLoad,
				b.data
			)
			break
		case 'remove':
			r = await self.amcp.cgRemove(channel, layer, b.templateHostLayer ?? templateHostLayer)
			break
		case 'clear':
			r = await self.amcp.cgClear(channel, layer)
			break
		case 'play':
			r = await self.amcp.cgPlay(channel, layer, b.templateHostLayer ?? templateHostLayer)
			break
		case 'stop':
			r = await self.amcp.cgStop(channel, layer, b.templateHostLayer ?? templateHostLayer)
			break
		case 'next':
			r = await self.amcp.cgNext(channel, layer, b.templateHostLayer ?? templateHostLayer)
			break
		case 'goto':
			r = await self.amcp.cgGoto(channel, layer, b.templateHostLayer ?? templateHostLayer, b.label)
			break
		case 'update':
			r = await self.amcp.cgUpdate(channel, layer, b.templateHostLayer ?? templateHostLayer, b.data)
			break
		case 'invoke':
			r = await self.amcp.cgInvoke(channel, layer, b.templateHostLayer ?? templateHostLayer, b.method)
			break
		case 'info':
			r = await self.amcp.cgInfo(channel, layer)
			break
		default:
			return { status: 400, headers: JSON_HEADERS, body: jsonBody({ error: `Unknown CG command: ${cmd}` }) }
	}
	return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
}

async function handleStateGet(path, self) {
	switch (path) {
		case '/api/state': {
			const basePath = (self.config?.local_media_path || '').trim()
			if (basePath && !self._mediaProbePopulating) {
				const media = self.CHOICES_MEDIAFILES || []
				if (media.length > 0) {
					self._mediaProbePopulating = true
					self._mediaProbeCache = self._mediaProbeCache || {}
					const toProbe = media.filter((c) => {
						const existing = self._mediaProbeCache[c.id]
						return !existing?.resolution || (existing?.fps == null && existing?.fps !== 0)
					}).slice(0, 120)
					Promise.all(toProbe.map(async (c) => {
							const fp = resolveSafe(basePath, c.id)
							if (fp) {
								try {
									const p = await probeMedia(fp)
									if (p && Object.keys(p).length) self._mediaProbeCache[c.id] = p
								} catch {}
							}
						})
					).finally(() => { self._mediaProbePopulating = false })
				}
			}
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(getState(self)) }
		}
		case '/api/variables':
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(self.variables || {}) }
		case '/api/media': {
			const stateMedia = self.state?.getState?.()?.media || []
			let media = stateMedia.length > 0
				? stateMedia
				: (self.CHOICES_MEDIAFILES || []).map((c) => ({ id: c.id, label: c.label }))
			const basePath = (self.config?.local_media_path || '').trim()
			if (basePath) {
				self._mediaProbeCache = self._mediaProbeCache || {}
				const toProbe = media.filter((m) => !m.resolution || (m.fps == null && m.fps !== 0)).slice(0, 120)
				await Promise.all(toProbe.map(async (m) => {
					const fp = resolveSafe(basePath, m.id)
					if (fp) {
						const probed = await probeMedia(fp)
						if (Object.keys(probed).length) self._mediaProbeCache[m.id] = probed
					}
				}))
				media = media.map((m) => ({ ...m, ...(self._mediaProbeCache[m.id] || {}) }))
			}
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(media) }
		}
		case '/api/templates':
			return {
				status: 200,
				headers: JSON_HEADERS,
				body: jsonBody((self.CHOICES_TEMPLATES || []).map((c) => ({ id: c.id, label: c.label }))),
			}
		case '/api/channels':
			return {
				status: 200,
				headers: JSON_HEADERS,
				body: jsonBody({
					ids: self.gatheredInfo?.channelIds || [],
					status: self.gatheredInfo?.channelStatusLines || {},
					channelXml: self.gatheredInfo?.channelXml || {},
				}),
			}
		case '/api/config':
			return {
				status: 200,
				headers: { 'Content-Type': 'text/xml' },
				body: self.gatheredInfo?.infoConfig || '',
			}
		default:
			return null
	}
}

async function handleThumbnail(path, self) {
	const m = path.match(/^\/api\/thumbnail(?:s?)\/([^/]+)$/)
	if (m) {
		try {
			const r = await self.amcp.thumbnailRetrieve(m[1])
			// When CasparCG returns base64 image data, serve raw PNG for img src
			const raw = r?.data
			let base64 = null
			if (Array.isArray(raw)) base64 = raw.join('').replace(/\s/g, '')
			else if (typeof raw === 'string' && raw.length > 100) base64 = raw.replace(/\s/g, '')
			if (base64 && /^[A-Za-z0-9+/=]+$/.test(base64)) {
				const buf = Buffer.from(base64, 'base64')
				return { status: 200, headers: { 'Content-Type': 'image/png' }, body: buf }
			}
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
		} catch (e) {
			return { status: 404, headers: JSON_HEADERS, body: jsonBody({ error: e?.message || 'Thumbnail not found' }) }
		}
	}
	if (path === '/api/thumbnails') {
		const r = await self.amcp.thumbnailList()
		return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
	}
	return null
}

const MULTIVIEW_APPLY_TIMEOUT_MS = 25_000

async function handleMultiviewApply(body, self) {
	const b = parseBody(body)
	const layout = b.layout
	const showOverlay = !!b.showOverlay
	if (!Array.isArray(layout) || layout.length === 0) {
		return { status: 400, headers: JSON_HEADERS, body: jsonBody({ error: 'layout array required' }) }
	}
	const map = getChannelMap(self.config || {})
	if (!map.multiviewEnabled || map.multiviewCh == null) {
		return { status: 400, headers: JSON_HEADERS, body: jsonBody({ error: 'Multiview not enabled' }) }
	}
	const ch = map.multiviewCh
	const programCh = map.programCh(1)
	const previewCh = map.previewCh(1)
	const inputsCh = map.inputsCh

	// Pre-check: verify multiview channel exists on CasparCG (avoid confusing 404 later)
	try {
		await self.amcp.info(ch)
	} catch (e) {
		const raw = (e?.message || (e && typeof e.toString === 'function' ? e.toString() : '') || String(e) || '').trim()
		const isConnection = /not connected|socket|econnrefused|etimedout|econnreset|connection refused|network/i.test(raw) ||
			raw.toLowerCase().includes('not connected')
		const msg = isConnection
			? 'CasparCG is not connected. Check module Settings → Connection and ensure CasparCG server is running.'
			: (raw.includes('404') || raw.includes('401')
				? `Channel ${ch} does not exist on CasparCG. Enable "Multiview channel" in module Settings → Screens, then use "Apply server config and restart" to create it.`
				: raw)
		return { status: isConnection ? 503 : 400, headers: JSON_HEADERS, body: jsonBody({ error: msg }) }
	}

	const routeForCell = (cell) => {
		if (cell.source) return cell.source
		// Support pgm / pgm_0 (screen 1) ... pgm_N (screen N+1)
		const pgmM = cell.id?.match(/^pgm(?:_(\d+))?$/)
		if (pgmM || cell.type === 'pgm') {
			const n = pgmM?.[1] != null ? parseInt(pgmM[1], 10) + 1 : 1
			return `route://${map.programCh(n)}`
		}
		// Support prv / prv_0 (screen 1) ... prv_N (screen N+1)
		const prvM = cell.id?.match(/^prv(?:_(\d+))?$/)
		if (prvM || cell.type === 'prv') {
			const n = prvM?.[1] != null ? parseInt(prvM[1], 10) + 1 : 1
			return `route://${map.previewCh(n)}`
		}
		if (cell.type === 'decklink' && inputsCh) {
			let i = 1
			const idM = cell.id?.match(/decklink_(\d+)/)
			if (idM) {
				i = parseInt(idM[1], 10) + 1
			} else if (cell.source && String(cell.source).startsWith('route://')) {
				const parts = String(cell.source).replace(/^route:\/\//, '').split('-')
				if (parseInt(parts[0], 10) === inputsCh && parts[1]) i = parseInt(parts[1], 10) || 1
			} else {
				const lblM = (cell.label || '').match(/decklink\s*(\d+)/i)
				if (lblM) i = parseInt(lblM[1], 10) || 1
			}
			return `route://${inputsCh}-${i}`
		}
		return `route://${map.programCh(1)}`
	}

	const OVERLAY_LAYER = 50

	async function loadOverlayTemplate(inst, mvCh, overlayLayer, jsonData) {
		// Try 1: CG ADD (uses template-path)
		try {
			await inst.amcp.cgAdd(mvCh, overlayLayer, 0, 'multiview_overlay', 0, jsonData)
			await inst.amcp.cgUpdate(mvCh, overlayLayer, 0, jsonData)
			await inst.amcp.cgPlay(mvCh, overlayLayer, 0)
			inst.log('debug', 'Multiview overlay loaded via CG ADD')
			return true
		} catch (e1) {
			inst.log('debug', 'CG ADD overlay failed: ' + (e1?.message || e1))
		}
		// Try 2: PLAY [html] with media-path relative name (media-path usually = media/)
		try {
			await inst.amcp.raw(`PLAY ${mvCh}-${overlayLayer} [html] multiview_overlay`)
			await new Promise((r) => setTimeout(r, 300))
			const escaped = jsonData.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
			await inst.amcp.raw(`CALL ${mvCh}-${overlayLayer} "update('${escaped}')"`)
			inst.log('debug', 'Multiview overlay loaded via PLAY [html] + CALL')
			return true
		} catch (e2) {
			inst.log('debug', 'PLAY [html] overlay failed: ' + (e2?.message || e2))
		}
		inst.log('warn', 'Multiview overlay could not be loaded. Place multiview_overlay.html in CasparCG template-path AND media-path folders.')
		return false
	}

	if (showOverlay) {
		const basePath = (self.config?.local_media_path || '').trim()
		if (basePath) {
			try {
				const fs = require('fs')
				const path = require('path')
				const dest = path.join(basePath, 'multiview_overlay.html')
				if (!fs.existsSync(dest)) {
					const src = path.join(__dirname, 'templates', 'multiview_overlay.html')
					if (fs.existsSync(src)) {
						fs.copyFileSync(src, dest)
						self.log('info', `Deployed multiview_overlay.html to ${dest}`)
					}
				}
			} catch (e) {
				self.log('debug', 'Auto-deploy overlay: ' + (e?.message || e))
			}
		}
	}

	const doApply = async () => {
		const layersToClear = [...Array(layout.length).keys()].map((i) => i + 1)
		if (showOverlay) layersToClear.push(OVERLAY_LAYER)
		for (const L of layersToClear) {
			try {
				await self.amcp.clear(ch, L)
			} catch {}
		}

		let layer = 1
		const failed = []
		for (const cell of layout) {
			const route = routeForCell(cell)
			try {
				await self.amcp.play(ch, layer, route)
			} catch (e) {
				failed.push({ layer, route, err: e?.message || e })
				layer++
				continue
			}
			try {
				await self.amcp.mixerFill(ch, layer, cell.x, cell.y, cell.w, cell.h)
			} catch (e) {
				failed.push({ layer, route: 'MIXER', err: e?.message || e })
			}
			layer++
		}
		try {
			await self.amcp.mixerCommit(ch)
		} catch (e) {
			const base = e?.message || String(e)
			const hint = (base.includes('404') || base.includes('401') || base.includes('INVALID'))
				? ` Channel ${ch} may not exist on CasparCG. Check module Settings → Screens: enable "Multiview channel", then use "Apply server config and restart" to create channels.`
				: ''
			return { status: 502, headers: JSON_HEADERS, body: jsonBody({ error: base + hint }) }
		}
		if (failed.length > 0) {
			self.log('warn', `Multiview: ${failed.length} cell(s) failed: ${failed.map((f) => `L${f.layer} ${f.route} (${f.err})`).join('; ')}`)
		}

		if (showOverlay) {
			// Derive overlay type from source so Program 2 / Preview 2 (type: route) get pgm/prv borders
			const programChannels = map.programChannels || Array.from({ length: map.screenCount || 4 }, (_, i) => map.programCh(i + 1))
			const previewChannels = map.previewChannels || Array.from({ length: map.screenCount || 4 }, (_, i) => map.previewCh(i + 1))
			const overlayType = (c) => {
				const src = c.source || ''
				if (typeof src === 'string' && src.startsWith('route://')) {
					const routeCh = String(src).replace(/^route:\/\//, '').split('-')[0]
					const ch = parseInt(routeCh, 10)
					if (!isNaN(ch)) {
						if (programChannels.includes(ch)) return 'pgm'
						if (previewChannels.includes(ch)) return 'prv'
						if (inputsCh != null && ch === inputsCh) return 'decklink'
					}
				}
				// Fallback: infer from label when source missing (e.g. manually created cells)
				const lbl = (c.label || '').toLowerCase()
				if (/\b(?:program|pgm)\s*\d+\b|\bpgm\d+\b|pgm\s*s\s*\d+/.test(lbl)) return 'pgm'
				if (/\b(?:preview|prv)\s*\d+\b|\bprv\d+\b|prv\s*s\s*\d+/.test(lbl)) return 'prv'
				return c.type
			}
			const inferScreenFromLabel = (c, pgmOrPrv) => {
				const lbl = (c.label || '').toLowerCase()
				const n = pgmOrPrv === 'pgm'
					? (/\bprogram\s*2|pgm\s*2|pgm2\b/.test(lbl) ? 2 : /\bprogram\s*3|pgm\s*3|pgm3\b/.test(lbl) ? 3 : /\bprogram\s*4|pgm\s*4|pgm4\b/.test(lbl) ? 4 : 1)
					: (/\bpreview\s*2|prv\s*2|prv2\b/.test(lbl) ? 2 : /\bpreview\s*3|prv\s*3|prv3\b/.test(lbl) ? 3 : /\bpreview\s*4|prv\s*4|prv4\b/.test(lbl) ? 4 : 1)
				return n
			}
			function inferPgmScreen(cell) {
				const src = cell?.source
				if (src && typeof src === 'string') {
					const ch = parseInt(String(src).replace(/^route:\/\//, '').split('-')[0], 10)
					if (!isNaN(ch) && programChannels.includes(ch)) {
						const idx = programChannels.indexOf(ch)
						return idx >= 0 ? idx + 1 : 1
					}
				}
				const lbl = (cell?.label || '').toLowerCase()
				const m = lbl.match(/program\s*(\d+)|pgm\s*(\d+)|pgm(\d+)|pgm\s*s\s*(\d+)/)
				return m ? parseInt(m[1] || m[2] || m[3] || m[4], 10) || 1 : 1
			}
			function inferPrvScreen(cell) {
				const src = cell?.source
				if (src && typeof src === 'string') {
					const ch = parseInt(String(src).replace(/^route:\/\//, '').split('-')[0], 10)
					if (!isNaN(ch) && previewChannels.includes(ch)) {
						const idx = previewChannels.indexOf(ch)
						return idx >= 0 ? idx + 1 : 1
					}
				}
				const lbl = (cell?.label || '').toLowerCase()
				const m = lbl.match(/preview\s*(\d+)|prv\s*(\d+)|prv(\d+)|prv\s*s\s*(\d+)/)
				return m ? parseInt(m[1] || m[2] || m[3] || m[4], 10) || 1 : 1
			}
			const cells = layout.map((c) => ({
				id: c.id,
				label: c.label,
				x: c.x,
				y: c.y,
				w: c.w,
				h: c.h,
				type: overlayType(c),
			}))
			// Build keyed overlay slots (pgm, prev, pgm2, prev2, ...) — use route channel as primary source.
			// Each pgm/prv cell must map to a unique slot; route://N determines screen index when available.
			const keyed = {}
			for (const c of layout) {
				const r = { x: c.x, y: c.y, w: c.w, h: c.h, label: c.label || c.id || '' }
				const ovType = overlayType(c)
				// Id-based: pgm → pgm, pgm_1 → pgm2, prv_1 → prev2
				const pgmM = c.id?.match(/^pgm(?:_(\d+))?$/)
				const prvM = c.id?.match(/^prv(?:_(\d+))?$/)
				let n = 1
				if (pgmM || ovType === 'pgm') {
					if (pgmM?.[1] != null) n = parseInt(pgmM[1], 10) + 1
					else if (c.source && String(c.source).startsWith('route://')) {
						const ch = parseInt(String(c.source).replace(/^route:\/\//, '').split('-')[0], 10)
						if (!isNaN(ch) && programChannels.includes(ch))
							n = programChannels.indexOf(ch) + 1
						else n = inferPgmScreen(c)
					} else n = inferPgmScreen(c)
					keyed[n === 1 ? 'pgm' : `pgm${n}`] = r
				} else if (prvM || ovType === 'prv') {
					if (prvM?.[1] != null) n = parseInt(prvM[1], 10) + 1
					else if (c.source && String(c.source).startsWith('route://')) {
						const ch = parseInt(String(c.source).replace(/^route:\/\//, '').split('-')[0], 10)
						if (!isNaN(ch) && previewChannels.includes(ch))
							n = previewChannels.indexOf(ch) + 1
						else n = inferPrvScreen(c)
					} else n = inferPrvScreen(c)
					keyed[n === 1 ? 'prev' : `prev${n}`] = r
				} else {
					let m = c.id?.match(/^(decklink|ndi)_(\d+)$/)
					if (m) {
						keyed[m[1] + m[2]] = r
					} else if (ovType === 'decklink') {
						const lblM = (c.label || '').match(/decklink\s*(\d+)/i)
						const idx = lblM ? parseInt(lblM[1], 10) - 1 : (c.source && String(c.source).match(/route:\/\/[^-]+-(\d+)/)) ? parseInt(RegExp.$1, 10) - 1 : 0
						if (idx >= 0 && idx < 8) keyed['decklink' + idx] = r
					} else if (ovType === 'ndi') {
						const lblM = (c.label || '').match(/ndi\s*(\d+)/i)
						const idx = lblM ? parseInt(lblM[1], 10) - 1 : 0
						if (idx >= 0 && idx < 8) keyed['ndi' + idx] = r
					} else {
						// Fallback: route cells with Program/Preview labels (keyed template needs pgm2, prev2, etc.)
						const lbl = (c.label || '').toLowerCase()
						const pgmN = lbl.match(/\b(?:program|pgm)\s*(\d+)\b/) || lbl.match(/\bpgm(\d+)\b/) || lbl.match(/pgm\s*s\s*(\d+)/)
						const prvN = lbl.match(/\b(?:preview|prv)\s*(\d+)\b/) || lbl.match(/\bprv(\d+)\b/) || lbl.match(/prv\s*s\s*(\d+)/)
						if (pgmN) keyed[parseInt(pgmN[1], 10) === 1 ? 'pgm' : `pgm${pgmN[1]}`] = r
						else if (prvN) keyed[parseInt(prvN[1], 10) === 1 ? 'prev' : `prev${prvN[1]}`] = r
					}
				}
			}
			const overlayData = JSON.stringify({ cells, ...keyed })
			await loadOverlayTemplate(self, ch, OVERLAY_LAYER, overlayData)
		} else {
			try {
				await self.amcp.cgClear(ch, OVERLAY_LAYER)
			} catch {}
			try {
				await self.amcp.stop(ch, OVERLAY_LAYER)
			} catch {}
		}

		return { status: 200, headers: JSON_HEADERS, body: jsonBody({ ok: true }) }
	}

	const timeoutPromise = new Promise((_, reject) => {
		setTimeout(() => reject(new Error('Multiview apply timed out')), MULTIVIEW_APPLY_TIMEOUT_MS)
	})

	try {
		const result = await Promise.race([doApply(), timeoutPromise])
		// Persist applied layout so it survives Companion restarts and CasparCG reconnects
		if (result?.status === 200) {
			const layout = parseBody(body)
			self._multiviewLayout = layout
			persistence.set('multiviewLayout', layout)
		}
		return result
	} catch (e) {
		if (e?.message === 'Multiview apply timed out') {
			self.log('warn', 'Multiview apply timed out')
			return {
				status: 504,
				headers: JSON_HEADERS,
				body: jsonBody({
					error: 'Multiview apply timed out. CasparCG may be slow or unresponsive. Try again or check the server.',
				}),
			}
		}
		throw e
	}
}

async function handleConfigApply(body, self) {
	const b = parseBody(body)
	if (b.apply) {
		self.applyServerConfigAndRestart()
		return { status: 200, headers: JSON_HEADERS, body: jsonBody({ ok: true, message: 'Config apply initiated' }) }
	}
	return { status: 400, headers: JSON_HEADERS, body: jsonBody({ error: 'apply=true required' }) }
}

async function handleMediaRefresh(body, self) {
	// Use media-only cycle: CLS + CINF + TLS. Avoids setupAllRouting (DeckLink, multiview)
	// which can fail when DeckLink cards have no signal or wrong format.
	const fn = self.runMediaLibraryQueryCycle || self.runConnectionQueryCycle
	if (fn && typeof fn === 'function') {
		fn.call(self)
		return { status: 200, headers: JSON_HEADERS, body: jsonBody({ ok: true, message: 'Media refresh initiated' }) }
	}
	return { status: 400, headers: JSON_HEADERS, body: jsonBody({ error: 'Module not ready' }) }
}

async function handleMisc(path, body, self) {
	switch (path) {
		case '/api/restart':
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(await self.amcp.restart()) }
		case '/api/kill':
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(await self.amcp.kill()) }
		case '/api/raw': {
			const b = parseBody(body)
			if (!b.cmd) return { status: 400, headers: JSON_HEADERS, body: jsonBody({ error: 'cmd required' }) }
			const r = await self.amcp.raw(b.cmd)
			return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
		}
		default:
			return null
	}
}

/**
 * Route HTTP request to appropriate handler.
 * @param {string} method - GET, POST, etc.
 * @param {string} path - Request path (e.g. /api/play)
 * @param {string} [body] - Raw request body
 * @param {object} self - Module instance
 * @returns {Promise<{ status: number, headers?: object, body?: string }>}
 */
async function routeRequest(method, path, body, self) {
	path = (path || '').split('?')[0]
	// Strip instance prefix if present (e.g. /instance/caspar/api/... -> /api/...)
	const instanceMatch = path.match(/^\/instance\/[^/]+\/(.+)$/)
	if (instanceMatch) path = '/' + instanceMatch[1]
	if (!path.startsWith('/api/')) {
		return { status: 404, headers: JSON_HEADERS, body: jsonBody({ error: 'Not found' }) }
	}

	// Selection sync from web UI — allowed even when CasparCG TCP is down
	if (method === 'POST' && path === '/api/selection') {
		const { setUiSelection } = require('./ui-selection')
		setUiSelection(self, parseBody(body))
		return { status: 200, headers: JSON_HEADERS, body: jsonBody({ ok: true }) }
	}

	if (!self.amcp) {
		return { status: 503, headers: JSON_HEADERS, body: jsonBody({ error: 'Module not ready' }) }
	}

	try {
		// GET state endpoints
		if (method === 'GET') {
			let r = await handleStateGet(path, self)
			if (r) return r
			r = await handleThumbnail(path, self)
			if (r) return r
			r = await handleLocalMedia(path, self.config || {})
			if (r) return r
		}

		// POST AMCP endpoints
		if (method === 'POST') {
			let r = await handleAmcpBasic(method, path, body, self)
			if (r) return r
			r = await handleMixerSafe(path, body, self)
			if (r) return r
			r = await handleCg(path, body, self)
			if (r) return r
			r = await handleProject(path, body, self)
			if (r) return r
			r = await handleData(path, body, self)
			if (r) return r
			if (path === '/api/config/apply') return await handleConfigApply(body, self)
			if (path === '/api/media/refresh') return await handleMediaRefresh(body, self)
			if (path === '/api/multiview/apply') return await handleMultiviewApply(body, self)
			const misc = await handleMisc(path, body, self)
			if (misc) return misc
		}

		// Timeline routes (GET + POST + PUT + DELETE)
		const tlResult = await handleTimelineRoutes(method, path, body, self)
		if (tlResult) return tlResult
	} catch (e) {
		const msg = e?.message || String(e)
		return { status: 502, headers: JSON_HEADERS, body: jsonBody({ error: msg }) }
	}

	return { status: 404, headers: JSON_HEADERS, body: jsonBody({ error: 'Not found' }) }
}

module.exports = { routeRequest, getState, handleMultiviewApply }
