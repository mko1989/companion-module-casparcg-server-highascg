/**
 * Push Web UI selection to module backend for Companion variables + encoder actions.
 * @see main_plan.md FEAT-2
 */
import { api } from './api-client.js'
import { dashboardState } from './dashboard-state.js'
import { multiviewState } from './multiview-state.js'
import { getContentResolution } from './mixer-fill.js'

let _timer = null

function interpKfs(kfs, t, defVal) {
	if (!kfs?.length) return defVal
	const sorted = kfs.slice().sort((a, b) => a.time - b.time)
	if (t <= sorted[0].time) return sorted[0].value
	const last = sorted[sorted.length - 1]
	if (t >= last.time) return last.value
	for (let i = 0; i < sorted.length - 1; i++) {
		const a = sorted[i]
		const b = sorted[i + 1]
		if (t >= a.time && t <= b.time) {
			return a.value + ((b.value - a.value) * (t - a.time)) / (b.time - a.time)
		}
	}
	return defVal
}

function interpClipProp(clip, prop, localMs, defVal) {
	const kfs = (clip.keyframes || []).filter((k) => k.property === prop)
	return interpKfs(kfs, localMs, defVal)
}

/**
 * @param {import('./state-store.js').StateStore} stateStore
 * @param {object|null} sel - same shape as inspector `selection` or null
 * @returns {object} POST body for /api/selection
 */
export function buildSelectionPayload(stateStore, sel) {
	if (!sel) return { context: 'none', label: '' }

	const state = stateStore?.getState?.() || {}
	const cm = state.channelMap || {}
	const timelinePos =
		state.timeline?.tick?.position ??
		state.timeline?.playback?.position ??
		0

	if (sel.type === 'dashboardLayer' && typeof sel.layerIdx === 'number') {
		const layerIdx = sel.layerIdx
		const ls = dashboardState.getLayerSetting(layerIdx)
		const name = dashboardState.getLayerName(layerIdx)
		const screenIdx = dashboardState.activeScreenIndex ?? 0
		const programCh = cm.programChannels?.[screenIdx] ?? cm.programChannels?.[0] ?? 1
		const res = cm.programResolutions?.[screenIdx] || { w: 1920, h: 1080 }
		const colIdx = dashboardState.getActiveColumnIndex()
		const cell = colIdx >= 0 ? dashboardState.getCell(colIdx, layerIdx) : null
		const contentRes = cell?.source ? getContentResolution(cell.source, stateStore, screenIdx) : null
		return {
			context: 'dashboard_layer',
			label: name || `Layer ${layerIdx + 1}`,
			dashboard: {
				colIdx,
				layerIdx,
				channel: programCh,
				casparLayer: layerIdx + 1,
				res,
				screenIdx,
				x: ls.x,
				y: ls.y,
				w: ls.w,
				h: ls.h,
				stretch: ls.stretch || 'none',
				aspectLocked: !!ls.aspectLocked,
				contentRes: contentRes && contentRes.w > 0 ? { w: contentRes.w, h: contentRes.h } : null,
				source: cell?.source || null,
			},
		}
	}

	if (sel.type === 'dashboard' && typeof sel.layerIdx === 'number') {
		return buildSelectionPayload(stateStore, { type: 'dashboardLayer', layerIdx: sel.layerIdx })
	}

	if (sel.type === 'timelineClip' && sel.timelineId && sel.clip && typeof sel.layerIdx === 'number') {
		const clip = sel.clip
		const localMs = Math.max(0, Math.round(timelinePos - clip.startTime))
		return {
			context: 'timeline_clip',
			label: clip.source?.label || clip.source?.value || 'Clip',
			timeline: {
				timelineId: sel.timelineId,
				layerIdx: sel.layerIdx,
				clipId: sel.clipId || clip.id,
				aspectLocked: true,
				fill_x: interpClipProp(clip, 'fill_x', localMs, 0),
				fill_y: interpClipProp(clip, 'fill_y', localMs, 0),
				scale_x: interpClipProp(clip, 'scale_x', localMs, 1),
				scale_y: interpClipProp(clip, 'scale_y', localMs, 1),
			},
		}
	}

	if (sel.type === 'multiview' && sel.cellId) {
		const cell = multiviewState.getCell(sel.cellId)
		if (!cell) return { context: 'none', label: '' }
		const cells = multiviewState.getCells()
		const layerIndex = cells.findIndex((c) => c.id === sel.cellId) + 1
		return {
			context: 'multiview',
			label: cell.label || cell.id,
			multiview: {
				cellId: sel.cellId,
				layerIndex: layerIndex > 0 ? layerIndex : 1,
				multiviewChannel: cm.multiviewCh,
				canvasW: multiviewState.canvasWidth,
				canvasH: multiviewState.canvasHeight,
				x: cell.x,
				y: cell.y,
				w: cell.w,
				h: cell.h,
				aspectLocked: !!cell.aspectLocked,
			},
		}
	}

	if (sel.type === 'timelineLayer' && sel.timelineId && typeof sel.layerIdx === 'number') {
		return {
			context: 'none',
			label: sel.layer?.name || `Layer ${sel.layerIdx + 1}`,
		}
	}

	return { context: 'none', label: '' }
}

export function scheduleSelectionSync(stateStore, sel) {
	clearTimeout(_timer)
	_timer = setTimeout(() => {
		const payload = buildSelectionPayload(stateStore, sel)
		api.post('/api/selection', payload).catch(() => {})
	}, 100)
}
