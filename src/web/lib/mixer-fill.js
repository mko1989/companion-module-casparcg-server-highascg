/**
 * MIXER FILL math (shared: inspector + Companion selection sync).
 * Mirrors Node ui-selection.js calcMixerFill — keep in sync when changing modes.
 */

/**
 * Compute MIXER FILL {x, y, xScale, yScale} for a layer.
 * CasparCG MIXER FILL semantics: xScale/yScale = 1 means source fills the entire channel.
 * So to show a 960px source on a 1920px channel at native 1:1 pixels, xScale = 960/1920 = 0.5.
 * @param {object} ls - { x, y, w, h, stretch }
 */
export function calcMixerFill(ls, res, contentRes) {
	const stretch = ls.stretch || 'none'
	const lx = ls.x ?? 0
	const ly = ls.y ?? 0
	const lw = ls.w ?? res.w
	const lh = ls.h ?? res.h
	const nx = lx / res.w
	const ny = ly / res.h

	if (stretch === 'stretch') {
		return { x: nx, y: ny, xScale: lw / res.w, yScale: lh / res.h }
	}

	const cw = contentRes?.w > 0 ? contentRes.w : null
	const ch = contentRes?.h > 0 ? contentRes.h : null
	const contentAR = cw && ch ? cw / ch : 16 / 9

	if (stretch === 'none') {
		if (cw && ch) {
			return { x: nx, y: ny, xScale: cw / res.w, yScale: ch / res.h }
		}
		return { x: nx, y: ny, xScale: lw / res.w, yScale: lh / res.h }
	}
	if (stretch === 'fit') {
		if (cw && ch) {
			const fitScale = Math.min(lw / cw, lh / ch)
			return { x: nx, y: ny, xScale: (cw * fitScale) / res.w, yScale: (ch * fitScale) / res.h }
		}
		const ar = contentAR
		const fitW = Math.min(lw, lh * ar)
		const fitH = fitW / ar
		return { x: nx, y: ny, xScale: fitW / res.w, yScale: fitH / res.h }
	}
	if (stretch === 'fill-h') {
		const outW = lw
		const outH = outW / contentAR
		return { x: nx, y: ny, xScale: outW / res.w, yScale: outH / res.h }
	}
	if (stretch === 'fill-v') {
		const outH = lh
		const outW = outH * contentAR
		return { x: nx, y: ny, xScale: outW / res.w, yScale: outH / res.h }
	}
	return { x: nx, y: ny, xScale: lw / res.w, yScale: lh / res.h }
}

function parseResolution(s) {
	if (!s || typeof s !== 'string') return null
	const m = String(s).match(/(\d+)[×x](\d+)/i)
	return m ? { w: parseInt(m[1], 10) || 0, h: parseInt(m[2], 10) || 0 } : null
}

/** @param {{ type?: string, value?: string }} source */
export function getContentResolution(source, stateStore, screenIdx = 0) {
	if (!source?.value) return null
	const state = stateStore?.getState?.() || {}
	const channelMap = state.channelMap || {}
	if (source.type === 'media') {
		const media = state.media || []
		const m = media.find((x) => x.id === source.value)
		return parseResolution(m?.resolution) || null
	}
	if (source.type === 'route' || String(source.value || '').startsWith('route://')) {
		const match = String(source.value || '').match(/route:\/\/(\d+)(?:-(\d+))?/)
		if (match) {
			const ch = parseInt(match[1], 10)
			const inputsCh = channelMap.inputsCh
			if (inputsCh != null && ch === inputsCh) {
				const ir = channelMap.inputsResolution
				return ir ? { w: ir.w, h: ir.h } : null
			}
			const idx = channelMap.programChannels?.indexOf(ch) ?? 0
			const pr = channelMap.programResolutions?.[idx] || channelMap.programResolutions?.[screenIdx]
			return pr ? { w: pr.w, h: pr.h } : null
		}
	}
	const pr = channelMap.programResolutions?.[screenIdx]
	return pr ? { w: pr.w, h: pr.h } : null
}
