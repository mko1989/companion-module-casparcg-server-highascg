/**
 * Web UI selection → Companion variables + encoder/button adjustments (MIXER FILL).
 * @see main_plan.md FEAT-2
 */
'use strict'

const { getChannelMap } = require('./routing')
const { getModeDimensions } = require('./config-generator')
const persistence = require('./persistence')

function clamp(v, lo, hi) {
	return Math.max(lo, Math.min(hi, v))
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

function calcMixerFill(ls, res) {
	const lx = ls.x ?? 0, ly = ls.y ?? 0
	const lw = ls.w ?? res.w, lh = ls.h ?? res.h
	return { x: lx / res.w, y: ly / res.h, xScale: lw / res.w, yScale: lh / res.h }
}

function programResolutions(self) {
	const cfg = self.config || {}
	const map = getChannelMap(cfg)
	return Array.from({ length: map.screenCount }, (_, i) => {
		const modeKey = cfg[`screen_${i + 1}_mode`] || cfg.screen_mode || '1080p5000'
		const dims = getModeDimensions(modeKey, cfg, i + 1)
		return dims ? { w: dims.width, h: dims.height } : { w: 1920, h: 1080 }
	})
}

/**
 * @param {object} self - module instance
 * @param {object|null} body - from POST /api/selection
 */
function setUiSelection(self, body) {
	self._uiSelection = body && typeof body === 'object' ? body : null
	updateUiSelectionVariables(self)
}

const UI_VAR_IDS = [
	'ui_sel_context',
	'ui_sel_label',
	'ui_sel_channel',
	'ui_sel_caspar_layer',
	'ui_sel_pos_x_px',
	'ui_sel_pos_y_px',
	'ui_sel_w_px',
	'ui_sel_h_px',
	'ui_sel_aspect_locked',
	'ui_sel_stretch',
	'ui_sel_timeline_id',
	'ui_sel_timeline_layer',
	'ui_sel_clip_id',
	'ui_sel_fill_x',
	'ui_sel_fill_y',
	'ui_sel_scale_x',
	'ui_sel_scale_y',
	'ui_sel_multiview_cell',
]

function updateUiSelectionVariables(self) {
	const sel = self._uiSelection || {}
	const ctx = sel.context || 'none'
	const vals = {
		ui_sel_context: ctx,
		ui_sel_label: sel.label || '',
		ui_sel_channel: '',
		ui_sel_caspar_layer: '',
		ui_sel_pos_x_px: '',
		ui_sel_pos_y_px: '',
		ui_sel_w_px: '',
		ui_sel_h_px: '',
		ui_sel_aspect_locked: '0',
		ui_sel_stretch: '',
		ui_sel_timeline_id: '',
		ui_sel_timeline_layer: '',
		ui_sel_clip_id: '',
		ui_sel_fill_x: '',
		ui_sel_fill_y: '',
		ui_sel_scale_x: '',
		ui_sel_scale_y: '',
		ui_sel_multiview_cell: '',
	}
	if (ctx === 'dashboard_layer' && sel.dashboard) {
		const d = sel.dashboard
		vals.ui_sel_channel = String(d.channel ?? '')
		vals.ui_sel_caspar_layer = String(d.casparLayer ?? '')
		vals.ui_sel_pos_x_px = String(Math.round(d.x ?? 0))
		vals.ui_sel_pos_y_px = String(Math.round(d.y ?? 0))
		vals.ui_sel_w_px = String(Math.round(d.w ?? 0))
		vals.ui_sel_h_px = String(Math.round(d.h ?? 0))
		vals.ui_sel_aspect_locked = d.aspectLocked ? '1' : '0'
		vals.ui_sel_stretch = String(d.stretch || 'none')
	}
	if (ctx === 'timeline_clip' && sel.timeline) {
		const t = sel.timeline
		vals.ui_sel_timeline_id = t.timelineId || ''
		vals.ui_sel_timeline_layer = String((t.layerIdx ?? 0) + 1)
		vals.ui_sel_clip_id = t.clipId || ''
		vals.ui_sel_fill_x = t.fill_x != null ? String(Number(t.fill_x).toFixed(4)) : ''
		vals.ui_sel_fill_y = t.fill_y != null ? String(Number(t.fill_y).toFixed(4)) : ''
		vals.ui_sel_scale_x = t.scale_x != null ? String(Number(t.scale_x).toFixed(4)) : ''
		vals.ui_sel_scale_y = t.scale_y != null ? String(Number(t.scale_y).toFixed(4)) : ''
		vals.ui_sel_aspect_locked = t.aspectLocked ? '1' : '0'
	}
	if (ctx === 'multiview' && sel.multiview) {
		const m = sel.multiview
		vals.ui_sel_channel = String(m.multiviewChannel ?? '')
		vals.ui_sel_caspar_layer = String(m.layerIndex ?? '')
		vals.ui_sel_pos_x_px = String(Math.round(m.x ?? 0))
		vals.ui_sel_pos_y_px = String(Math.round(m.y ?? 0))
		vals.ui_sel_w_px = String(Math.round(m.w ?? 0))
		vals.ui_sel_h_px = String(Math.round(m.h ?? 0))
		vals.ui_sel_aspect_locked = m.aspectLocked ? '1' : '0'
		vals.ui_sel_multiview_cell = m.cellId || ''
	}
	UI_VAR_IDS.forEach((id) => {
		self.variables[id] = vals[id] ?? ''
	})
	if (typeof self.setVariableValues === 'function') self.setVariableValues(vals)
}

function getUiSelectionVariableDefinitions() {
	return UI_VAR_IDS.map((id) => ({
		variableId: id,
		name:
			id === 'ui_sel_context'
				? 'UI: selection context (none|dashboard_layer|timeline_clip|multiview)'
				: id === 'ui_sel_label'
					? 'UI: selected item label'
					: id === 'ui_sel_channel'
						? 'UI: Caspar channel for selection'
						: id === 'ui_sel_caspar_layer'
							? 'UI: Caspar layer (1-based)'
							: id === 'ui_sel_pos_x_px'
								? 'UI: position X (px) or empty'
								: id === 'ui_sel_pos_y_px'
									? 'UI: position Y (px) or empty'
									: id === 'ui_sel_w_px'
										? 'UI: width (px) or empty'
										: id === 'ui_sel_h_px'
											? 'UI: height (px) or empty'
											: id === 'ui_sel_aspect_locked'
												? 'UI: aspect lock 1/0'
												: id === 'ui_sel_stretch'
													? 'UI: stretch mode (dashboard)'
													: id === 'ui_sel_timeline_id'
														? 'UI: timeline id'
														: id === 'ui_sel_timeline_layer'
															? 'UI: timeline layer (1-based)'
															: id === 'ui_sel_clip_id'
																? 'UI: clip id'
																: id === 'ui_sel_fill_x'
																	? 'UI: clip fill X (norm)'
																	: id === 'ui_sel_fill_y'
																		? 'UI: clip fill Y (norm)'
																		: id === 'ui_sel_scale_x'
																			? 'UI: clip scale X'
																			: id === 'ui_sel_scale_y'
																				? 'UI: clip scale Y'
																				: 'UI: multiview cell id',
	}))
}

async function applyDashboardLayerAdjust(self, axis, delta) {
	const sel = self._uiSelection
	const d = sel?.dashboard
	if (!d) return
	const resList = programResolutions(self)
	const refRes = d.res || resList[d.screenIdx ?? 0] || resList[0] || { w: 1920, h: 1080 }
	let x = Number(d.x) || 0
	let y = Number(d.y) || 0
	let w = Number(d.w) || refRes.w
	let h = Number(d.h) || refRes.h
	const stretch = d.stretch || 'none'
	const aspectLocked = !!d.aspectLocked
	const ar = w > 0 && h > 0 ? w / h : 16 / 9
	const contentRes = d.contentRes || null

	switch (axis) {
		case 'pos_x':
			x = clamp(x + delta, -refRes.w * 2, refRes.w * 2)
			break
		case 'pos_y':
			y = clamp(y + delta, -refRes.h * 2, refRes.h * 2)
			break
		case 'size_w':
			w = clamp(w + delta, 1, refRes.w * 4)
			if (aspectLocked) h = clamp(Math.round(w / ar), 1, refRes.h * 4)
			break
		case 'size_h':
			h = clamp(h + delta, 1, refRes.h * 4)
			if (aspectLocked) w = clamp(Math.round(h * ar), 1, refRes.w * 4)
			break
		default:
			return
	}

	d.x = x
	d.y = y
	d.w = w
	d.h = h
	const casparLayer = d.casparLayer || 1
	const map = getChannelMap(self.config || {})
	const programChannels = map.programChannels || [1]

	for (let i = 0; i < programChannels.length; i++) {
		const ch = programChannels[i] ?? 1
		const res = resList[i] || refRes
		let fill = calcMixerFill({ x, y, w, h }, res)
		try {
			if (stretch && stretch !== 'stretch') {
				const cRes = contentRes || await queryLayerContentRes(self, ch, casparLayer)
				if (cRes) {
					const sf = calcStretchFill(stretch, x, y, w, h, res.w, res.h, cRes.w, cRes.h)
					fill = sf
					if (sf.clip) {
						await self.amcp.mixerClip(ch, casparLayer, sf.clip.x, sf.clip.y, sf.clip.w, sf.clip.h)
					} else {
						await self.amcp.mixerClip(ch, casparLayer, 0, 0, 1, 1)
					}
				}
			} else if (stretch === 'stretch') {
				try { await self.amcp.mixerClip(ch, casparLayer, 0, 0, 1, 1) } catch {}
			}
			await self.amcp.mixerFill(ch, casparLayer, fill.x, fill.y, fill.xScale, fill.yScale)
			await self.amcp.mixerCommit(ch)
		} catch (e) {
			self.log('debug', `UI selection MIXER: ch ${ch} L${casparLayer}: ${e?.message || e}`)
		}
	}
	updateUiSelectionVariables(self)
}

async function applyMultiviewAdjust(self, axis, delta) {
	const sel = self._uiSelection
	const m = sel?.multiview
	if (!m) return
	const map = getChannelMap(self.config || {})
	const mvCh = m.multiviewChannel ?? map.multiviewCh
	const layer = m.layerIndex
	if (mvCh == null || layer == null) return

	const cw = Number(m.canvasW) || 1920
	const chCanvas = Number(m.canvasH) || 1080
	let x = Number(m.x) || 0
	let y = Number(m.y) || 0
	let w = Number(m.w) || cw / 2
	let h = Number(m.h) || chCanvas / 2
	const aspectLocked = !!m.aspectLocked
	const ar = w > 0 && h > 0 ? w / h : 16 / 9

	switch (axis) {
		case 'pos_x':
			x = clamp(x + delta, 0, cw - 1)
			break
		case 'pos_y':
			y = clamp(y + delta, 0, chCanvas - 1)
			break
		case 'size_w':
			w = clamp(w + delta, 1, cw - x)
			if (aspectLocked) h = clamp(Math.round(w / ar), 1, chCanvas - y)
			break
		case 'size_h':
			h = clamp(h + delta, 1, chCanvas - y)
			if (aspectLocked) w = clamp(Math.round(h * ar), 1, cw - x)
			break
		default:
			return
	}

	m.x = x
	m.y = y
	m.w = w
	m.h = h

	const nx = clamp(x / cw, 0, 1)
	const ny = clamp(y / chCanvas, 0, 1)
	const nw = clamp(w / cw, 0, 1)
	const nh = clamp(h / chCanvas, 0, 1)

	try {
		await self.amcp.mixerFill(mvCh, layer, nx, ny, nw, nh)
		await self.amcp.mixerCommit(mvCh)
	} catch (e) {
		self.log('warn', `Multiview MIXER adjust: ${e?.message || e}`)
	}

	patchMultiviewPersistence(self, m.cellId, nx, ny, nw, nh)
	updateUiSelectionVariables(self)
}

function patchMultiviewPersistence(self, cellId, nx, ny, nw, nh) {
	const body = self._multiviewLayout
	if (!body || !Array.isArray(body.layout) || !cellId) return
	for (const cell of body.layout) {
		if (cell.id === cellId) {
			cell.x = nx
			cell.y = ny
			cell.w = nw
			cell.h = nh
			persistence.set('multiviewLayout', body)
			return
		}
	}
}

/**
 * @param {object} self
 * @param {'pos_x'|'pos_y'|'size_w'|'size_h'} axis
 * @param {number} delta - pixels for dashboard/multiview; normalized units for timeline (e.g. 0.005)
 * @param {'pixel'|'normalized'} unit
 */
async function applyUiSelectionAdjust(self, axis, delta, unit) {
	if (!self.amcp) {
		self.log('warn', 'UI selection adjust: CasparCG not connected')
		return
	}
	const sel = self._uiSelection
	if (!sel || sel.context === 'none') {
		self.log('debug', 'UI selection adjust: no selection in web UI')
		return
	}
	const d = Number(delta)
	if (!d || isNaN(d)) return

	if (sel.context === 'dashboard_layer') {
		if (unit !== 'pixel') {
			self.log('warn', 'Dashboard layer selection: use unit "pixel" for deltas')
			return
		}
		await applyDashboardLayerAdjust(self, axis, d)
		return
	}
	if (sel.context === 'multiview') {
		if (unit !== 'pixel') {
			self.log('warn', 'Multiview selection: use unit "pixel" for deltas')
			return
		}
		await applyMultiviewAdjust(self, axis, d)
		return
	}
	if (sel.context === 'timeline_clip') {
		if (unit !== 'normalized') {
			self.log('warn', 'Timeline clip selection: use unit "normalized" for fill/scale deltas')
			return
		}
		const r = self.timelineEngine.adjustClipFillDelta(
			sel.timeline?.timelineId,
			sel.timeline?.layerIdx,
			axis,
			d,
			!!sel.timeline?.aspectLocked
		)
		if (r && sel.timeline) {
			sel.timeline.fill_x = r.fill_x
			sel.timeline.fill_y = r.fill_y
			sel.timeline.scale_x = r.scale_x
			sel.timeline.scale_y = r.scale_y
		}
		updateUiSelectionVariables(self)
	}
}

function toggleUiSelectionAspectLock(self) {
	const sel = self._uiSelection
	if (!sel || sel.context === 'none') return
	if (sel.dashboard) sel.dashboard.aspectLocked = !sel.dashboard.aspectLocked
	if (sel.timeline) sel.timeline.aspectLocked = !sel.timeline.aspectLocked
	if (sel.multiview) sel.multiview.aspectLocked = !sel.multiview.aspectLocked
	updateUiSelectionVariables(self)
}

module.exports = {
	setUiSelection,
	updateUiSelectionVariables,
	getUiSelectionVariableDefinitions,
	applyUiSelectionAdjust,
	toggleUiSelectionAspectLock,
}
