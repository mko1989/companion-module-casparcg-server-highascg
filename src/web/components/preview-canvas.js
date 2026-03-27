/**
 * Collapsible output preview panel — program aspect ratio, layer rectangles, optional thumbnails.
 * Used by Dashboard (active column stack) and Timeline (clips at playhead).
 * @see working.md FEAT-4
 */

export const PREVIEW_LAYER_COLORS = [
	'#e63946',
	'#2a9d8f',
	'#457b9d',
	'#e9c46a',
	'#9b59b6',
	'#1abc9c',
	'#e67e22',
	'#34495e',
	'#95a5a6',
]

/** @param {object} layer */
export function findClipAtTime(layer, ms) {
	for (const c of layer.clips || []) {
		if (ms >= c.startTime && ms < c.startTime + c.duration) return c
	}
	return null
}

/**
 * Linear interpolation of a keyframed numeric property on a clip (matches server timeline-engine _lerp).
 * @param {object} clip
 * @param {string} property
 * @param {number} localMs
 * @param {number} defaultVal
 */
export function lerpKeyframeProperty(clip, property, localMs, defaultVal) {
	const kfs = (clip.keyframes || [])
		.filter((k) => k.property === property)
		.sort((a, b) => a.time - b.time)
	if (!kfs.length) return defaultVal
	const t = localMs
	if (t <= kfs[0].time) return kfs[0].value
	const last = kfs[kfs.length - 1]
	if (t >= last.time) return last.value
	for (let i = 0; i < kfs.length - 1; i++) {
		const a = kfs[i]
		const b = kfs[i + 1]
		if (t >= a.time && t <= b.time) {
			return a.value + (b.value - a.value) * (t - a.time) / (b.time - a.time)
		}
	}
	return defaultVal
}

const _thumbCache = new Map()

/**
 * @param {string} url
 * @param {() => void} onReady
 * @returns {{ img: HTMLImageElement, ready: boolean }}
 */
export function getThumbnailEntry(url, onReady) {
	let e = _thumbCache.get(url)
	if (!e) {
		const img = new Image()
		img.crossOrigin = 'anonymous'
		e = { img, ready: false, failed: false }
		img.onload = () => {
			e.ready = true
			onReady?.()
		}
		img.onerror = () => {
			e.failed = true
			onReady?.()
		}
		img.src = url
		_thumbCache.set(url, e)
	}
	return e
}

function drawImageCover(ctx, img, x, y, w, h) {
	if (!img?.naturalWidth) return
	const iw = img.naturalWidth
	const ih = img.naturalHeight
	const br = w / h
	const ir = iw / ih
	let sx, sy, sw, sh
	if (ir > br) {
		sh = ih
		sw = sh * br
		sy = 0
		sx = (iw - sw) / 2
	} else {
		sw = iw
		sh = sw / br
		sx = 0
		sy = (ih - sh) / 2
	}
	ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W
 * @param {number} H
 * @param {object} opts
 * @param {object} opts.dashboardState
 * @param {number} opts.layerCount
 * @param {(src: object) => string | null} opts.getThumbUrl
 * @param {() => void} opts.onThumbLoaded
 */
export function drawDashboardProgramStack(ctx, W, H, opts) {
	const { dashboardState, layerCount, getThumbUrl, onThumbLoaded } = opts
	ctx.fillStyle = '#0d1117'
	ctx.fillRect(0, 0, W, H)

	const colIdx = dashboardState.getActiveColumnIndex()
	if (colIdx < 0) {
		ctx.fillStyle = '#6e7681'
		ctx.font = `${Math.max(14, Math.round(W / 80))}px system-ui, sans-serif`
		ctx.fillText('Activate a column to preview the stack', 16, Math.round(H / 2))
		return
	}

	const lw = Math.max(2, Math.round(W / 400))

	for (let layerIdx = 0; layerIdx < layerCount; layerIdx++) {
		const ls = dashboardState.getLayerSetting(layerIdx)
		const cell = dashboardState.getCell(colIdx, layerIdx)
		const src = cell?.source
		const x = Math.max(0, Math.min(W - 1, ls.x ?? 0))
		const y = Math.max(0, Math.min(H - 1, ls.y ?? 0))
		const w = Math.max(1, Math.min(W - x, ls.w ?? W))
		const h = Math.max(1, Math.min(H - y, ls.h ?? H))
		const color = PREVIEW_LAYER_COLORS[layerIdx % PREVIEW_LAYER_COLORS.length]
		const op = ls.opacity != null ? ls.opacity : 1

		ctx.save()
		ctx.globalAlpha = op

		const url = src && getThumbUrl ? getThumbUrl(src) : null
		if (url) {
			const { img, ready, failed } = getThumbnailEntry(url, onThumbLoaded)
			if (ready && !failed) {
				ctx.save()
				ctx.beginPath()
				ctx.rect(x, y, w, h)
				ctx.clip()
				drawImageCover(ctx, img, x, y, w, h)
				ctx.restore()
			} else {
				ctx.fillStyle = 'rgba(48, 54, 61, 0.9)'
				ctx.fillRect(x, y, w, h)
			}
		} else if (src?.value) {
			ctx.fillStyle = 'rgba(48, 54, 61, 0.85)'
			ctx.fillRect(x, y, w, h)
			ctx.fillStyle = '#8b949e'
			ctx.font = `${Math.max(11, Math.round(w / 14))}px system-ui, sans-serif`
			const label = (src.label || src.value || '').slice(0, 24)
			ctx.fillText(label, x + 6, y + Math.min(22, h * 0.25))
		} else {
			ctx.fillStyle = 'rgba(22, 27, 34, 0.5)'
			ctx.fillRect(x, y, w, h)
		}

		ctx.strokeStyle = color
		ctx.lineWidth = lw
		ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw)

		ctx.fillStyle = color
		ctx.font = `bold ${Math.max(11, Math.round(W / 100))}px system-ui, sans-serif`
		ctx.fillText(`L${layerIdx + 1}`, x + 6, y + Math.max(14, Math.round(H / 70)))

		ctx.restore()
	}
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W
 * @param {number} H
 * @param {object} opts
 * @param {{ getActive: () => object | null }} opts.timelineState
 * @param {() => { position: number }} opts.getPlayback
 * @param {(src: object) => string | null} opts.getThumbUrl
 * @param {() => void} opts.onThumbLoaded
 */
export function drawTimelineStack(ctx, W, H, opts) {
	const { timelineState, getPlayback, getThumbUrl, onThumbLoaded } = opts
	ctx.fillStyle = '#0d1117'
	ctx.fillRect(0, 0, W, H)

	const tl = timelineState.getActive()
	if (!tl) {
		ctx.fillStyle = '#6e7681'
		ctx.font = `${Math.max(14, Math.round(W / 80))}px system-ui, sans-serif`
		ctx.fillText('No timeline', 16, Math.round(H / 2))
		return
	}

	const pos = getPlayback().position
	const lw = Math.max(2, Math.round(W / 400))

	for (let li = 0; li < tl.layers.length; li++) {
		const clip = findClipAtTime(tl.layers[li], pos)
		if (!clip?.source?.value) continue

		const localMs = Math.max(0, pos - clip.startTime)
		const fx = lerpKeyframeProperty(clip, 'fill_x', localMs, 0)
		const fy = lerpKeyframeProperty(clip, 'fill_y', localMs, 0)
		const sx = lerpKeyframeProperty(clip, 'scale_x', localMs, 1)
		const sy = lerpKeyframeProperty(clip, 'scale_y', localMs, 1)
		const op = lerpKeyframeProperty(clip, 'opacity', localMs, 1)

		const x = fx * W
		const y = fy * H
		const w = Math.max(1, sx * W)
		const h = Math.max(1, sy * H)
		const color = PREVIEW_LAYER_COLORS[li % PREVIEW_LAYER_COLORS.length]

		ctx.save()
		ctx.globalAlpha = Math.max(0, Math.min(1, op))

		const url = getThumbUrl ? getThumbUrl(clip.source) : null
		if (url) {
			const { img, ready, failed } = getThumbnailEntry(url, onThumbLoaded)
			if (ready && !failed) {
				ctx.save()
				ctx.beginPath()
				ctx.rect(x, y, w, h)
				ctx.clip()
				drawImageCover(ctx, img, x, y, w, h)
				ctx.restore()
			} else {
				ctx.fillStyle = 'rgba(48, 54, 61, 0.9)'
				ctx.fillRect(x, y, w, h)
			}
		} else {
			ctx.fillStyle = 'rgba(48, 54, 61, 0.85)'
			ctx.fillRect(x, y, w, h)
			ctx.fillStyle = '#8b949e'
			ctx.font = `${Math.max(11, Math.round(w / 14))}px system-ui, sans-serif`
			const label = (clip.source.label || clip.source.value || '').slice(0, 24)
			ctx.fillText(label, x + 6, y + Math.min(22, h * 0.25))
		}

		ctx.strokeStyle = color
		ctx.lineWidth = lw
		ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw)

		ctx.fillStyle = color
		ctx.font = `bold ${Math.max(11, Math.round(W / 100))}px system-ui, sans-serif`
		ctx.fillText(`L${li + 1}`, x + 6, y + Math.max(14, Math.round(H / 70)))

		ctx.restore()
	}
}

/**
 * @param {HTMLElement} host
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.storageKeyPrefix
 * @param {() => { w: number, h: number }} options.getOutputResolution
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} options.draw
 * @param {import('../lib/state-store.js').StateStore} [options.stateStore]
 */
export function initPreviewPanel(host, options) {
	const {
		title = 'Output preview',
		storageKeyPrefix = 'casparcg_preview',
		getOutputResolution,
		draw,
		stateStore,
	} = options

	const kCollapsed = `${storageKeyPrefix}_collapsed`
	const kHeight = `${storageKeyPrefix}_height`

	let collapsed = false
	try {
		collapsed = localStorage.getItem(kCollapsed) === '1'
	} catch {}

	let bodyHeight = 200
	try {
		const h = parseInt(localStorage.getItem(kHeight) || '', 10)
		if (!isNaN(h) && h >= 80 && h <= 560) bodyHeight = h
	} catch {}

	const root = document.createElement('div')
	root.className = 'preview-panel' + (collapsed ? ' preview-panel--collapsed' : '')
	root.innerHTML = `
		<div class="preview-panel__header">
			<button type="button" class="preview-panel__toggle" aria-expanded="${!collapsed}" title="Show or hide preview"></button>
			<span class="preview-panel__title">${title}</span>
			<span class="preview-panel__res"></span>
		</div>
		<div class="preview-panel__body" style="height:${bodyHeight}px">
			<div class="preview-panel__resize" title="Drag to resize"></div>
			<div class="preview-panel__canvas-outer">
				<div class="preview-panel__canvas-wrap">
					<canvas class="preview-panel__canvas"></canvas>
				</div>
			</div>
		</div>
	`
	host.appendChild(root)

	const btn = root.querySelector('.preview-panel__toggle')
	const resEl = root.querySelector('.preview-panel__res')
	const body = root.querySelector('.preview-panel__body')
	const resizeHandle = root.querySelector('.preview-panel__resize')
	const wrap = root.querySelector('.preview-panel__canvas-wrap')
	const canvas = root.querySelector('.preview-panel__canvas')
	const ctx = canvas.getContext('2d')

	btn.textContent = collapsed ? '▸' : '▾'

	let rafDraw = null
	let ro = null

	function scheduleDraw() {
		if (rafDraw != null) return
		rafDraw = requestAnimationFrame(() => {
			rafDraw = null
			paint()
		})
	}

	function paint() {
		if (collapsed) return
		const { w: W, h: H } = getOutputResolution()
		const ww = Math.max(1, W)
		const hh = Math.max(1, H)
		if (resEl) resEl.textContent = `${ww}×${hh}`

		const dpr = Math.min(window.devicePixelRatio || 1, 2)
		const cw = wrap.clientWidth || 320
		const ch = wrap.clientHeight || 160
		const scale = Math.min(cw / ww, ch / hh, 1) || 1
		const dispW = Math.floor(ww * scale)
		const dispH = Math.floor(hh * scale)
		canvas.style.width = `${dispW}px`
		canvas.style.height = `${dispH}px`
		canvas.width = Math.round(ww * dpr)
		canvas.height = Math.round(hh * dpr)
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
		draw(ctx, ww, hh)
	}

	function setCollapsed(c) {
		collapsed = c
		root.classList.toggle('preview-panel--collapsed', collapsed)
		body.hidden = collapsed
		btn.setAttribute('aria-expanded', String(!collapsed))
		btn.textContent = collapsed ? '▸' : '▾'
		try {
			localStorage.setItem(kCollapsed, collapsed ? '1' : '0')
		} catch {}
		if (!collapsed) scheduleDraw()
	}

	btn.addEventListener('click', () => setCollapsed(!collapsed))

	let dragStartY = 0
	let dragStartH = 0
	resizeHandle.addEventListener('mousedown', (e) => {
		if (e.button !== 0 || collapsed) return
		e.preventDefault()
		dragStartY = e.clientY
		dragStartH = body.offsetHeight
		const onMove = (ev) => {
			const dy = ev.clientY - dragStartY
			const nh = Math.max(80, Math.min(560, dragStartH + dy))
			body.style.height = `${nh}px`
			scheduleDraw()
		}
		const onUp = () => {
			document.removeEventListener('mousemove', onMove)
			document.removeEventListener('mouseup', onUp)
			document.body.style.cursor = ''
			document.body.style.userSelect = ''
			try {
				localStorage.setItem(kHeight, String(body.offsetHeight))
			} catch {}
		}
		document.body.style.cursor = 'row-resize'
		document.body.style.userSelect = 'none'
		document.addEventListener('mousemove', onMove)
		document.addEventListener('mouseup', onUp)
	})

	if (typeof ResizeObserver !== 'undefined') {
		ro = new ResizeObserver(() => scheduleDraw())
		ro.observe(wrap)
	}
	window.addEventListener('resize', scheduleDraw)

	let unsubState = null
	if (stateStore?.on) {
		let rafState = null
		unsubState = stateStore.on('*', () => {
			if (rafState != null) return
			rafState = requestAnimationFrame(() => {
				rafState = null
				scheduleDraw()
			})
		})
	}

	body.hidden = collapsed
	scheduleDraw()

	return {
		scheduleDraw,
		destroy() {
			if (rafDraw != null) cancelAnimationFrame(rafDraw)
			if (ro) ro.disconnect()
			window.removeEventListener('resize', scheduleDraw)
			if (unsubState) unsubState()
			root.remove()
		},
	}
}
