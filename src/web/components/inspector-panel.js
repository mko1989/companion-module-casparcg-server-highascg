/**
 * Inspector panel — properties of selected item (layer/clip/channel/timeline/multiview).
 * Numeric inputs with drag-to-adjust. Math expressions supported for multiview and layer settings.
 * @see main_plan.md Prompt 14
 */

import { dashboardState, TRANSITION_TYPES, TRANSITION_TWEENS, DEFAULT_TRANSITION, STRETCH_MODES } from '../lib/dashboard-state.js'
import { api } from '../lib/api-client.js'
import { multiviewState } from '../lib/multiview-state.js'
import { timelineState } from '../lib/timeline-state.js'
import { createMathInput } from '../lib/math-input.js'
import { calcMixerFill, getContentResolution } from '../lib/mixer-fill.js'
import { scheduleSelectionSync } from '../lib/selection-sync.js'

const BLEND_MODES = ['normal', 'add', 'alpha', 'multiply', 'overlay', 'screen', 'hardlight', 'softlight', 'difference']

/** @deprecated import from ../lib/mixer-fill.js */
export { calcMixerFill, getContentResolution }

/**
 * Create a numeric input with drag-to-adjust (Millumin/After Effects style).
 */
function createDragInput(opts) {
	const { label, value, min = -Infinity, max = Infinity, step = 0.01, decimals = 2, onChange, placeholder = '' } = opts
	const wrap = document.createElement('div')
	wrap.className = 'inspector-field'
	const lab = document.createElement('label')
	lab.className = 'inspector-field__label'
	const key = document.createElement('span')
	key.className = 'inspector-field__key'
	key.textContent = label
	const inp = document.createElement('input')
	inp.type = 'text'
	inp.className = 'inspector-field__input inspector-drag-input'
	inp.value = value != null && value !== '' ? String(value) : ''
	if (placeholder) inp.placeholder = placeholder
	lab.appendChild(key)
	lab.appendChild(inp)
	wrap.appendChild(lab)

	let startX = 0
	let startVal = parseFloat(inp.value) || 0
	const sensitivity = 0.5

	function parseVal() {
		const v = parseFloat(inp.value)
		return isNaN(v) ? (min !== -Infinity ? min : 0) : v
	}
	function formatVal(v) {
		return decimals >= 0 ? Number(v).toFixed(decimals) : String(v)
	}
	function apply(v) {
		let n = typeof v === 'number' ? v : parseVal()
		n = Math.max(min, Math.min(max, n))
		inp.value = formatVal(n)
		onChange?.(n)
	}

	const DRAG_THRESHOLD = 5
	let dragging = false
	inp.addEventListener('mousedown', (e) => {
		if (e.button !== 0) return
		startX = e.clientX
		startVal = parseVal()
		dragging = false
		const onMove = (ev) => {
			if (!dragging) {
				if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD) return
				dragging = true
				inp.blur()
			}
			ev.preventDefault()
			const dx = (ev.clientX - startX) * sensitivity * step
			startX = ev.clientX
			startVal = Math.max(min, Math.min(max, startVal + dx))
			inp.value = formatVal(startVal)
			onChange?.(startVal)
		}
		const onUp = () => {
			document.removeEventListener('mousemove', onMove)
			document.removeEventListener('mouseup', onUp)
		}
		document.addEventListener('mousemove', onMove)
		document.addEventListener('mouseup', onUp)
	})
	inp.addEventListener('change', () => apply(parseVal()))
	inp.addEventListener('blur', () => apply(parseVal()))

	inp.addEventListener('wheel', (e) => {
		e.preventDefault()
		const dir = e.deltaY < 0 ? 1 : -1
		const mult = e.shiftKey ? 10 : 1
		const cur = parseVal()
		apply(Math.max(min, Math.min(max, cur + dir * step * mult)))
	}, { passive: false })

	return { wrap, input: inp, setValue: (v) => { inp.value = formatVal(v); apply(v) } }
}

/**
 * @param {HTMLElement} root
 * @param {object} stateStore
 */
const KF_PROPERTIES = [
	{ value: 'opacity', label: 'Opacity', min: 0, max: 1, default: 1 },
	{ value: 'volume', label: 'Volume', min: 0, max: 2, default: 1 },
	{ value: 'position', label: 'Position', pair: ['fill_x', 'fill_y'], default: { x: 0, y: 0 } },
	{ value: 'scale', label: 'Scale', pair: ['scale_x', 'scale_y'], locked: true, min: 0, max: 4, default: 1 },
]
const KF_PROP_MAP = Object.fromEntries(KF_PROPERTIES.map((p) => [p.value, p]))

export function initInspectorPanel(root, stateStore) {
	let selection = null
	let _timelinePlaybackPos = 0
	stateStore.on('timeline.tick', (data) => {
		if (data?.position != null) _timelinePlaybackPos = data.position
		if (selection?.type === 'timelineClip') scheduleSelectionSync(stateStore, selection)
	})
	stateStore.on('timeline.playback', (pb) => {
		if (pb?.position != null) _timelinePlaybackPos = pb.position
		if (selection?.type === 'timelineClip') scheduleSelectionSync(stateStore, selection)
	})

	function getProgramChannel() {
		const s = dashboardState.activeScreenIndex
		return getProgramChannelForColumn(s)
	}

	function getProgramChannelForColumn(colIdx) {
		const state = stateStore.getState()
		const ch = state?.channelMap?.programChannels?.[colIdx]
		return ch != null ? ch : 1
	}

	function getResolution() {
		const s = dashboardState.activeScreenIndex
		return getResolutionForColumn(s)
	}

	function getResolutionForColumn(colIdx) {
		const state = stateStore.getState()
		return state?.channelMap?.programResolutions?.[colIdx] || { w: 1920, h: 1080 }
	}

	function isSelectedColumnActive() {
		if (!selection || selection.type !== 'dashboard') return false
		return dashboardState.getActiveColumnIndex() === selection.colIdx
	}

	async function sendAmcpIfActive(cb) {
		if (!selection || selection.type !== 'dashboard') return
		if (!isSelectedColumnActive()) return
		await cb(getProgramChannel(), selection.layerIdx + 1)
	}

	function renderEmpty() {
		root.innerHTML = '<p class="inspector-empty">Select an item</p>'
	}

	// ── Clip inspector (simplified): loop, volume, transition override ─────────

	function renderClipInspector(colIdx, layerIdx, cell) {
		root.innerHTML = ''
		const title = document.createElement('div')
		title.className = 'inspector-title'
		title.textContent = cell.source?.label || cell.source?.value || `Layer ${layerIdx + 1}`
		root.appendChild(title)

		const grp = document.createElement('div')
		grp.className = 'inspector-group'
		grp.innerHTML = '<div class="inspector-group__title">Clip</div>'

		const loopWrap = document.createElement('div')
		loopWrap.className = 'inspector-field'
		const loopLab = document.createElement('label')
		loopLab.className = 'inspector-field__label'
		loopLab.textContent = 'Loop'
		const loopCheck = document.createElement('input')
		loopCheck.type = 'checkbox'
		loopCheck.checked = !!cell.overrides?.loop
		loopCheck.addEventListener('change', () => {
			const v = loopCheck.checked ? 1 : 0
			dashboardState.setCellOverrides(colIdx, layerIdx, { loop: v })
			if (cell.source?.type === 'timeline') {
				api.post(`/api/timelines/${cell.source.value}/loop`, { loop: !!v }).catch(() => {})
			} else {
				sendAmcpIfActive(async (ch, layer) => {
					await api.post('/api/call', { channel: ch, layer, fn: 'LOOP', params: String(v) })
				})
			}
		})
		loopLab.appendChild(loopCheck)
		loopWrap.appendChild(loopLab)
		grp.appendChild(loopWrap)

		// Volume
		const volInp = createDragInput({
			label: 'Volume',
			value: cell.overrides?.volume ?? 1,
			min: 0, max: 2, step: 0.01, decimals: 2,
			onChange: (v) => {
				dashboardState.setCellOverrides(colIdx, layerIdx, { volume: v })
				sendAmcpIfActive(async (ch, layer) => {
					await api.post('/api/mixer/volume', { channel: ch, layer, volume: v })
				})
			},
		})
		grp.appendChild(volInp.wrap)
		root.appendChild(grp)

		// Transition override
		const transGrp = document.createElement('div')
		transGrp.className = 'inspector-group'
		transGrp.innerHTML = '<div class="inspector-group__title">Transition Override</div>'
		const hasTransOverride =
			cell.overrides?.transition != null || cell.overrides?.transitionDuration != null || cell.overrides?.transitionTween != null
		const colTrans = dashboardState.getColumn(colIdx)?.transition || { ...DEFAULT_TRANSITION }
		const transOverrideCheck = document.createElement('input')
		transOverrideCheck.type = 'checkbox'
		transOverrideCheck.checked = !!hasTransOverride
		transOverrideCheck.id = 'inspector-trans-override'
		const transOverrideLabel = document.createElement('label')
		transOverrideLabel.htmlFor = 'inspector-trans-override'
		transOverrideLabel.textContent = 'Override column transition'
		const transOverrideWrap = document.createElement('div')
		transOverrideWrap.className = 'inspector-field'
		transOverrideWrap.appendChild(transOverrideCheck)
		transOverrideWrap.appendChild(transOverrideLabel)
		transGrp.appendChild(transOverrideWrap)

		const transFieldsWrap = document.createElement('div')
		transFieldsWrap.className = 'inspector-transition-fields'
		transFieldsWrap.style.display = hasTransOverride ? 'block' : 'none'
		const typeSel = document.createElement('select')
		typeSel.className = 'inspector-field__select'
		TRANSITION_TYPES.forEach((t) => {
			const opt = document.createElement('option')
			opt.value = t; opt.textContent = t
			if (t === (cell.overrides?.transition ?? colTrans.type)) opt.selected = true
			typeSel.appendChild(opt)
		})
		const durInp = document.createElement('input')
		durInp.type = 'number'
		durInp.className = 'inspector-field__input'
		durInp.min = 0; durInp.placeholder = 'Frames'
		durInp.value = cell.overrides?.transitionDuration ?? colTrans.duration ?? 0
		const tweenSel = document.createElement('select')
		tweenSel.className = 'inspector-field__select'
		TRANSITION_TWEENS.forEach((tw) => {
			const opt = document.createElement('option')
			opt.value = tw; opt.textContent = tw
			if (tw === (cell.overrides?.transitionTween ?? colTrans.tween ?? 'linear')) opt.selected = true
			tweenSel.appendChild(opt)
		})
		transFieldsWrap.appendChild(typeSel)
		transFieldsWrap.appendChild(durInp)
		transFieldsWrap.appendChild(tweenSel)

		transOverrideCheck.addEventListener('change', () => {
			transFieldsWrap.style.display = transOverrideCheck.checked ? 'block' : 'none'
			if (!transOverrideCheck.checked) {
				dashboardState.setCellOverrides(colIdx, layerIdx, {
					transition: undefined, transitionDuration: undefined, transitionTween: undefined,
				})
			} else {
				dashboardState.setCellOverrides(colIdx, layerIdx, {
					transition: typeSel.value,
					transitionDuration: parseInt(durInp.value, 10) || 0,
					transitionTween: tweenSel.value,
				})
			}
		})
		typeSel.addEventListener('change', () => dashboardState.setCellOverrides(colIdx, layerIdx, { transition: typeSel.value }))
		durInp.addEventListener('change', () => {
			const v = parseInt(durInp.value, 10)
			dashboardState.setCellOverrides(colIdx, layerIdx, { transitionDuration: isNaN(v) ? 0 : Math.max(0, v) })
		})
		tweenSel.addEventListener('change', () => dashboardState.setCellOverrides(colIdx, layerIdx, { transitionTween: tweenSel.value }))
		transGrp.appendChild(transFieldsWrap)
		root.appendChild(transGrp)

		const hint = document.createElement('p')
		hint.className = 'inspector-hint'
		hint.textContent = isSelectedColumnActive() ? 'Live — changes apply immediately' : 'Inactive — changes apply on activation'
		root.appendChild(hint)
	}

	// ── Timeline clip inspector: loop, volume, transition, keyframes (Prompt 25) ───

	async function syncTimelineToServer() {
		const tl = timelineState.getActive()
		if (!tl) return
		try {
			await api.put(`/api/timelines/${tl.id}`, tl)
		} catch {
			try { await api.post('/api/timelines', tl) } catch {}
		}
	}

	function renderTimelineClipInspector(timelineId, layerIdx, clipId, clip) {
		if (!clip?.source?.value) return
		root.innerHTML = ''
		const title = document.createElement('div')
		title.className = 'inspector-title'
		title.textContent = clip.source?.label || clip.source?.value || 'Clip'
		root.appendChild(title)

		const grp = document.createElement('div')
		grp.className = 'inspector-group'
		grp.innerHTML = '<div class="inspector-group__title">Clip</div>'

		// Loop
		const loopWrap = document.createElement('div')
		loopWrap.className = 'inspector-field'
		const loopLab = document.createElement('label')
		loopLab.className = 'inspector-field__label'
		loopLab.textContent = 'Loop'
		const loopCheck = document.createElement('input')
		loopCheck.type = 'checkbox'
		loopCheck.checked = !!clip.loop
		loopCheck.addEventListener('change', () => {
			timelineState.updateClip(timelineId, layerIdx, clipId, { loop: loopCheck.checked })
			syncTimelineToServer()
		})
		loopLab.appendChild(loopCheck)
		loopWrap.appendChild(loopLab)
		grp.appendChild(loopWrap)

		// Loop always (Prompt 26): plays in loop regardless of timeline play/pause when playhead is over clip
		const loopAlwaysWrap = document.createElement('div')
		loopAlwaysWrap.className = 'inspector-field'
		const loopAlwaysLab = document.createElement('label')
		loopAlwaysLab.className = 'inspector-field__label'
		loopAlwaysLab.textContent = 'Loop always'
		const loopAlwaysCheck = document.createElement('input')
		loopAlwaysCheck.type = 'checkbox'
		loopAlwaysCheck.checked = !!clip.loopAlways
		loopAlwaysCheck.title = 'Always play in loop when playhead is over clip, even when timeline is paused'
		loopAlwaysCheck.addEventListener('change', () => {
			timelineState.updateClip(timelineId, layerIdx, clipId, { loopAlways: loopAlwaysCheck.checked })
			syncTimelineToServer()
		})
		loopAlwaysLab.appendChild(loopAlwaysCheck)
		loopAlwaysWrap.appendChild(loopAlwaysLab)
		grp.appendChild(loopAlwaysWrap)

		// Has audio (Prompt 25): when true, clip thumbnail shows at 50% opacity with waveform overlay
		if (clip.source?.type === 'media') {
			const hasAudioWrap = document.createElement('div')
			hasAudioWrap.className = 'inspector-field'
			const hasAudioLab = document.createElement('label')
			hasAudioLab.className = 'inspector-field__label'
			hasAudioLab.textContent = 'Has audio'
			const hasAudioCheck = document.createElement('input')
			hasAudioCheck.type = 'checkbox'
			hasAudioCheck.checked = clip.hasAudio ?? true
			hasAudioCheck.title = 'Show waveform overlay on clip thumbnail when checked'
			hasAudioCheck.addEventListener('change', () => {
				timelineState.updateClip(timelineId, layerIdx, clipId, { hasAudio: hasAudioCheck.checked })
				syncTimelineToServer()
			})
			hasAudioLab.appendChild(hasAudioCheck)
			hasAudioWrap.appendChild(hasAudioLab)
			grp.appendChild(hasAudioWrap)
		}

		// Volume
		const volInp = createDragInput({
			label: 'Volume',
			value: clip.volume ?? 1,
			min: 0, max: 2, step: 0.01, decimals: 2,
			onChange: (v) => {
				timelineState.updateClip(timelineId, layerIdx, clipId, { volume: v })
				syncTimelineToServer()
			},
		})
		grp.appendChild(volInp.wrap)
		root.appendChild(grp)

		// Keyframes: build grouped position (fill_x+fill_y) and scale (scale_x+scale_y) by time
		const allKfs = clip.keyframes || []
		const kfByProp = {}
		allKfs.forEach((kf) => { (kfByProp[kf.property] = kfByProp[kf.property] || []).push(kf) })

		const posTimes = new Set()
		;(kfByProp.fill_x || []).forEach((k) => posTimes.add(Math.round(k.time)))
		;(kfByProp.fill_y || []).forEach((k) => posTimes.add(Math.round(k.time)))
		const posKfs = []
		for (const t of posTimes) {
			const kx = (kfByProp.fill_x || []).find((k) => Math.abs(k.time - t) < 0.5)
			const ky = (kfByProp.fill_y || []).find((k) => Math.abs(k.time - t) < 0.5)
			if (kx || ky) posKfs.push({ time: t, x: kx?.value ?? 0, y: ky?.value ?? 0, easing: kx?.easing || ky?.easing || 'linear' })
		}
		posKfs.sort((a, b) => a.time - b.time)

		const scaleTimes = new Set()
		;(kfByProp.scale_x || []).forEach((k) => scaleTimes.add(Math.round(k.time)))
		;(kfByProp.scale_y || []).forEach((k) => scaleTimes.add(Math.round(k.time)))
		const scaleKfs = []
		for (const t of scaleTimes) {
			const kx = (kfByProp.scale_x || []).find((k) => Math.abs(k.time - t) < 0.5)
			const ky = (kfByProp.scale_y || []).find((k) => Math.abs(k.time - t) < 0.5)
			const v = kx?.value ?? ky?.value ?? 1
			if (kx || ky) scaleKfs.push({ time: t, value: v, easing: kx?.easing || ky?.easing || 'linear' })
		}
		scaleKfs.sort((a, b) => a.time - b.time)

		// Render position keyframes (X, Y)
		if (posKfs.length > 0) {
			const kfGrp = document.createElement('div')
			kfGrp.className = 'inspector-group'
			kfGrp.innerHTML = '<div class="inspector-group__title">Position keyframes</div>'
			posKfs.forEach((gkf) => {
				const row = document.createElement('div')
				row.className = 'inspector-field inspector-keyframe-row'
				row.innerHTML = `
					<span class="inspector-field__key">@ ${gkf.time}ms</span>
					<input type="text" class="inspector-field__input inspector-kf-x" value="${gkf.x}" placeholder="X" style="width:42px" />
					<input type="text" class="inspector-field__input inspector-kf-y" value="${gkf.y}" placeholder="Y" style="width:42px" />
					<select class="inspector-field__select inspector-keyframe-easing">
						${['linear', 'ease-in', 'ease-out', 'ease-in-out'].map((e) => `<option value="${e}" ${e === (gkf.easing || 'linear') ? 'selected' : ''}>${e}</option>`).join('')}
					</select>
					<button type="button" class="inspector-btn-sm inspector-kf-remove" title="Remove keyframe">×</button>
				`
				const xInp = row.querySelector('.inspector-kf-x')
				const yInp = row.querySelector('.inspector-kf-y')
				const easeSel = row.querySelector('.inspector-keyframe-easing')
				const removeBtn = row.querySelector('.inspector-kf-remove')
				const applyPos = () => {
					const x = parseFloat(xInp.value)
					const y = parseFloat(yInp.value)
					if (!isNaN(x)) timelineState.addKeyframe(timelineId, layerIdx, clipId, { time: gkf.time, property: 'fill_x', value: x, easing: easeSel.value })
					if (!isNaN(y)) timelineState.addKeyframe(timelineId, layerIdx, clipId, { time: gkf.time, property: 'fill_y', value: y, easing: easeSel.value })
					syncTimelineToServer()
				}
				xInp.addEventListener('change', applyPos)
				yInp.addEventListener('change', applyPos)
				easeSel.addEventListener('change', applyPos)
				removeBtn.addEventListener('click', () => {
					timelineState.removePositionKeyframe(timelineId, layerIdx, clipId, gkf.time)
					syncTimelineToServer()
					window.dispatchEvent(new CustomEvent('timeline-redraw-request'))
					renderTimelineClipInspector(timelineId, layerIdx, clipId, clip)
				})
				kfGrp.appendChild(row)
			})
			root.appendChild(kfGrp)
		}

		// Render scale keyframes (single value, locked)
		if (scaleKfs.length > 0) {
			const kfGrp = document.createElement('div')
			kfGrp.className = 'inspector-group'
			kfGrp.innerHTML = '<div class="inspector-group__title">Scale keyframes</div>'
			const scaleDef = KF_PROP_MAP.scale
			scaleKfs.forEach((gkf) => {
				const row = document.createElement('div')
				row.className = 'inspector-field inspector-keyframe-row'
				row.innerHTML = `
					<span class="inspector-field__key">@ ${gkf.time}ms</span>
					<input type="text" class="inspector-field__input inspector-kf-scale" value="${gkf.value}" style="width:50px" />
					<select class="inspector-field__select inspector-keyframe-easing">
						${['linear', 'ease-in', 'ease-out', 'ease-in-out'].map((e) => `<option value="${e}" ${e === (gkf.easing || 'linear') ? 'selected' : ''}>${e}</option>`).join('')}
					</select>
					<button type="button" class="inspector-btn-sm inspector-kf-remove" title="Remove keyframe">×</button>
				`
				const valInp = row.querySelector('.inspector-kf-scale')
				const easeSel = row.querySelector('.inspector-keyframe-easing')
				const removeBtn = row.querySelector('.inspector-kf-remove')
				valInp.addEventListener('change', () => {
					const v = parseFloat(valInp.value)
					if (!isNaN(v)) {
						const clamped = Math.max(scaleDef.min, Math.min(scaleDef.max, v))
						timelineState.addKeyframe(timelineId, layerIdx, clipId, { time: gkf.time, property: 'scale_x', value: clamped, easing: easeSel.value })
						timelineState.addKeyframe(timelineId, layerIdx, clipId, { time: gkf.time, property: 'scale_y', value: clamped, easing: easeSel.value })
						syncTimelineToServer()
					}
				})
				easeSel.addEventListener('change', () => {
					const v = parseFloat(valInp.value)
					const current = !isNaN(v) ? Math.max(scaleDef.min, Math.min(scaleDef.max, v)) : gkf.value
					timelineState.addKeyframe(timelineId, layerIdx, clipId, { time: gkf.time, property: 'scale_x', value: current, easing: easeSel.value })
					timelineState.addKeyframe(timelineId, layerIdx, clipId, { time: gkf.time, property: 'scale_y', value: current, easing: easeSel.value })
					syncTimelineToServer()
				})
				removeBtn.addEventListener('click', () => {
					timelineState.removeScaleKeyframe(timelineId, layerIdx, clipId, gkf.time)
					syncTimelineToServer()
					window.dispatchEvent(new CustomEvent('timeline-redraw-request'))
					renderTimelineClipInspector(timelineId, layerIdx, clipId, clip)
				})
				kfGrp.appendChild(row)
			})
			root.appendChild(kfGrp)
		}

		// Render opacity and volume keyframes (single value)
		for (const propDef of KF_PROPERTIES) {
			if (propDef.pair) continue
			const propKfs = kfByProp[propDef.value] || []
			if (propKfs.length === 0) continue
			const kfGrp = document.createElement('div')
			kfGrp.className = 'inspector-group'
			kfGrp.innerHTML = `<div class="inspector-group__title">${propDef.label} keyframes</div>`
			propKfs.forEach((kf) => {
				const row = document.createElement('div')
				row.className = 'inspector-field inspector-keyframe-row'
				row.innerHTML = `
					<span class="inspector-field__key">@ ${Math.round(kf.time)}ms</span>
					<input type="text" class="inspector-field__input inspector-keyframe-value" value="${kf.value}" style="width:50px" />
					<select class="inspector-field__select inspector-keyframe-easing">
						${['linear', 'ease-in', 'ease-out', 'ease-in-out'].map((e) => `<option value="${e}" ${e === (kf.easing || 'linear') ? 'selected' : ''}>${e}</option>`).join('')}
					</select>
					<button type="button" class="inspector-btn-sm inspector-kf-remove" title="Remove keyframe">×</button>
				`
				const valInp = row.querySelector('.inspector-keyframe-value')
				const easeSel = row.querySelector('.inspector-keyframe-easing')
				const removeBtn = row.querySelector('.inspector-kf-remove')
				valInp.addEventListener('change', () => {
					const v = parseFloat(valInp.value)
					if (!isNaN(v)) {
						const clamped = Math.max(propDef.min ?? 0, Math.min(propDef.max ?? 1, v))
						timelineState.addKeyframe(timelineId, layerIdx, clipId, { ...kf, value: clamped })
						syncTimelineToServer()
					}
				})
				easeSel.addEventListener('change', () => {
					timelineState.addKeyframe(timelineId, layerIdx, clipId, { ...kf, easing: easeSel.value })
					syncTimelineToServer()
				})
				removeBtn.addEventListener('click', () => {
					timelineState.removeKeyframe(timelineId, layerIdx, clipId, kf.property, kf.time)
					syncTimelineToServer()
					window.dispatchEvent(new CustomEvent('timeline-redraw-request'))
					renderTimelineClipInspector(timelineId, layerIdx, clipId, clip)
				})
				kfGrp.appendChild(row)
			})
			root.appendChild(kfGrp)
		}

		// Add keyframe
		const clipLocalMs = Math.max(0, Math.round(_timelinePlaybackPos - clip.startTime))
		const defaultTime = clipLocalMs >= 0 && clipLocalMs <= clip.duration ? clipLocalMs : 0
		const addKfGrp = document.createElement('div')
		addKfGrp.className = 'inspector-group'
		addKfGrp.innerHTML = '<div class="inspector-group__title">Add keyframe</div>'
		const addKfRow = document.createElement('div')
		addKfRow.className = 'inspector-field inspector-keyframe-row'
		addKfRow.innerHTML = `
			<select class="inspector-field__select" id="inspector-kf-property">
				${KF_PROPERTIES.map((p) => `<option value="${p.value}">${p.label}</option>`).join('')}
			</select>
			<input type="number" class="inspector-field__input" id="inspector-kf-time" value="${defaultTime}" placeholder="time (ms)" min="0" step="100" style="width:70px" />
			<span id="inspector-kf-values">
				<input type="text" class="inspector-field__input inspector-kf-val-single" id="inspector-kf-value" placeholder="value" value="1" style="width:50px" />
			</span>
			<button type="button" class="inspector-btn-sm" id="inspector-kf-add">Add</button>
		`
		const valuesWrap = addKfRow.querySelector('#inspector-kf-values')
		const updateAddInputs = () => {
			const propSel = addKfRow.querySelector('#inspector-kf-property')
			const val = propSel.value
			valuesWrap.innerHTML = ''
			if (val === 'position') {
				valuesWrap.innerHTML = '<input type="text" class="inspector-field__input inspector-kf-val-x" placeholder="X" value="0" style="width:42px" /><input type="text" class="inspector-field__input inspector-kf-val-y" placeholder="Y" value="0" style="width:42px" />'
			} else if (val === 'scale') {
				valuesWrap.innerHTML = '<input type="text" class="inspector-field__input inspector-kf-val-single" placeholder="scale" value="1" style="width:50px" />'
			} else {
				valuesWrap.innerHTML = `<input type="text" class="inspector-field__input inspector-kf-val-single" placeholder="value" value="${KF_PROP_MAP[val]?.default ?? 1}" style="width:50px" />`
			}
		}
		addKfRow.querySelector('#inspector-kf-property').addEventListener('change', updateAddInputs)
		updateAddInputs()
		addKfGrp.appendChild(addKfRow)
		addKfRow.querySelector('#inspector-kf-add').addEventListener('click', () => {
			const timeInp = addKfRow.querySelector('#inspector-kf-time')
			const propSel = addKfRow.querySelector('#inspector-kf-property')
			const time = Math.max(0, parseInt(timeInp.value, 10) || 0)
			const prop = propSel.value
			if (prop === 'position') {
				const xInp = addKfRow.querySelector('.inspector-kf-val-x')
				const yInp = addKfRow.querySelector('.inspector-kf-val-y')
				const x = parseFloat(xInp?.value ?? 0) || 0
				const y = parseFloat(yInp?.value ?? 0) || 0
				timelineState.addPositionKeyframe(timelineId, layerIdx, clipId, time, x, y)
			} else if (prop === 'scale') {
				const valInp = addKfRow.querySelector('.inspector-kf-val-single')
				const v = parseFloat(valInp?.value ?? 1) || 1
				const clamped = Math.max(0, Math.min(4, v))
				timelineState.addScaleKeyframe(timelineId, layerIdx, clipId, time, clamped)
			} else {
				const valInp = addKfRow.querySelector('.inspector-kf-val-single')
				const val = parseFloat(valInp?.value ?? 1)
				if (isNaN(val)) return
				const propInfo = KF_PROP_MAP[prop] || { min: 0, max: 1 }
				const clamped = Math.max(propInfo.min ?? 0, Math.min(propInfo.max ?? 1, val))
				timelineState.addKeyframe(timelineId, layerIdx, clipId, { time, property: prop, value: clamped, easing: 'linear' })
			}
			syncTimelineToServer()
			window.dispatchEvent(new CustomEvent('timeline-redraw-request'))
			renderTimelineClipInspector(timelineId, layerIdx, clipId, clip)
		})
		root.appendChild(addKfGrp)

		const hint = document.createElement('p')
		hint.className = 'inspector-hint'
		hint.textContent = 'Shortcuts: I/O=fade, P=position, S=scale, V=volume, T=opacity'
		root.appendChild(hint)
	}

	// ── Timeline layer inspector: rename, add/remove layer ─────────────────────

	function renderTimelineLayerInspector(timelineId, layerIdx, layer) {
		root.innerHTML = ''
		const title = document.createElement('div')
		title.className = 'inspector-title'
		title.textContent = `Timeline Layer ${layerIdx + 1}`
		root.appendChild(title)

		const grp = document.createElement('div')
		grp.className = 'inspector-group'
		grp.innerHTML = '<div class="inspector-group__title">Layer</div>'

		const nameWrap = document.createElement('div')
		nameWrap.className = 'inspector-field'
		const nameLab = document.createElement('label')
		nameLab.className = 'inspector-field__label'
		const nameKey = document.createElement('span')
		nameKey.className = 'inspector-field__key'
		nameKey.textContent = 'Name'
		const nameInp = document.createElement('input')
		nameInp.type = 'text'
		nameInp.className = 'inspector-field__input'
		nameInp.value = layer?.name || `Layer ${layerIdx + 1}`
		nameInp.addEventListener('change', () => {
			timelineState.updateLayer(timelineId, layerIdx, { name: nameInp.value.trim() || `Layer ${layerIdx + 1}` })
			syncTimelineToServer()
			window.dispatchEvent(new CustomEvent('timeline-redraw-request'))
		})
		nameLab.appendChild(nameKey)
		nameLab.appendChild(nameInp)
		nameWrap.appendChild(nameLab)
		grp.appendChild(nameWrap)
		root.appendChild(grp)

		const actGrp = document.createElement('div')
		actGrp.className = 'inspector-group'
		actGrp.innerHTML = '<div class="inspector-group__title">Actions</div>'

		const addBtn = document.createElement('button')
		addBtn.type = 'button'
		addBtn.className = 'inspector-btn-sm'
		addBtn.textContent = 'Add layer below'
		addBtn.addEventListener('click', () => {
			timelineState.addLayer(timelineId, `Layer ${layerIdx + 2}`)
			syncTimelineToServer()
			window.dispatchEvent(new CustomEvent('timeline-redraw-request'))
		})
		actGrp.appendChild(addBtn)

		const removeBtn = document.createElement('button')
		removeBtn.type = 'button'
		removeBtn.className = 'inspector-btn-sm'
		removeBtn.style.marginLeft = '6px'
		removeBtn.textContent = 'Remove layer'
		removeBtn.addEventListener('click', () => {
			const lName = layer?.name || `Layer ${layerIdx + 1}`
			if (confirm(`Remove "${lName}" and all its clips?`)) {
				timelineState.removeLayer(timelineId, layerIdx)
				syncTimelineToServer()
				window.dispatchEvent(new CustomEvent('timeline-redraw-request'))
				renderEmpty()
			}
		})
		actGrp.appendChild(removeBtn)
		root.appendChild(actGrp)

		const hint = document.createElement('p')
		hint.className = 'inspector-hint'
		hint.textContent = 'Right-click layer header for quick actions'
		root.appendChild(hint)
	}

	// ── Dashboard layer settings inspector: fill, pos/size in px, opacity, straight alpha ─

	async function applyLayerSettings(layerIdx, ls) {
		// Use selected column when available; apply to all columns for stretch/global settings
		const colIdx = selection?.type === 'dashboard' && selection.colIdx >= 0
			? selection.colIdx
			: Math.max(0, dashboardState.getActiveColumnIndex())
		const state = stateStore.getState()
		const programChannels = state?.channelMap?.programChannels || [1]
		const casparLayer = layerIdx + 1
		try {
			for (let i = 0; i < programChannels.length; i++) {
				const ch = programChannels[i] ?? 1
				const res = getResolutionForColumn(i)
				const fill = calcMixerFill(ls, res, null)
				await api.post('/api/mixer/fill', {
					channel: ch, layer: casparLayer, ...fill,
					stretch: ls.stretch || 'none',
					layerX: ls.x ?? 0, layerY: ls.y ?? 0,
					layerW: ls.w ?? res.w, layerH: ls.h ?? res.h,
					channelW: res.w, channelH: res.h,
				})
				await api.post('/api/mixer/opacity', { channel: ch, layer: casparLayer, opacity: ls.opacity ?? 1 })
				await api.post('/api/mixer/volume', { channel: ch, layer: casparLayer, volume: ls.volume ?? 1 })
				await api.post('/api/mixer/blend', { channel: ch, layer: casparLayer, mode: ls.blend ?? 'normal' })
				await api.post('/api/mixer/commit', { channel: ch })
			}
		} catch (e) {
			console.warn('Layer settings apply failed:', e?.message || e)
		}
	}

	function renderLayerSettingsInspector(layerIdx) {
		const ls = dashboardState.getLayerSetting(layerIdx)
		const layerName = dashboardState.getLayerName(layerIdx)
		const res = getResolution()

		root.innerHTML = ''
		const title = document.createElement('div')
		title.className = 'inspector-title'
		title.textContent = `Layer ${layerIdx + 1} Settings`
		root.appendChild(title)

		// Layer name
		const nameGrp = document.createElement('div')
		nameGrp.className = 'inspector-group'
		nameGrp.innerHTML = '<div class="inspector-group__title">Label</div>'
		const nameWrap = document.createElement('div')
		nameWrap.className = 'inspector-field'
		const nameInp = document.createElement('input')
		nameInp.type = 'text'
		nameInp.className = 'inspector-field__input'
		nameInp.value = layerName
		nameInp.placeholder = `Layer ${layerIdx + 1}`
		nameInp.addEventListener('change', () => {
			dashboardState.setLayerName(layerIdx, nameInp.value.trim())
		})
		nameWrap.appendChild(nameInp)
		nameGrp.appendChild(nameWrap)
		root.appendChild(nameGrp)

		// Position / Size (MIXER FILL) — always applied
		const fillGrp = document.createElement('div')
		fillGrp.className = 'inspector-group'
		fillGrp.innerHTML = '<div class="inspector-group__title">Position / Size (px)</div>'

		const fillFields = document.createElement('div')
		fillFields.className = 'inspector-fill-fields'

		const resHint = document.createElement('p')
		resHint.className = 'inspector-hint'
		resHint.textContent = `Resolution: ${res.w}×${res.h}px`
		fillFields.appendChild(resHint)

		const xInp = createMathInput({
			label: 'X', value: Math.round(ls.x ?? 0), min: -res.w * 2, max: res.w * 2, step: 1, decimals: 0,
			placeholder: '0',
			onChange: (v) => {
				const patch = { ...ls, x: v }
				dashboardState.setLayerSetting(layerIdx, { x: v })
				applyLayerSettings(layerIdx, patch)
			},
		})
		const yInp = createMathInput({
			label: 'Y', value: Math.round(ls.y ?? 0), min: -res.h * 2, max: res.h * 2, step: 1, decimals: 0,
			placeholder: '0',
			onChange: (v) => {
				dashboardState.setLayerSetting(layerIdx, { y: v })
				applyLayerSettings(layerIdx, { ...ls, y: v })
			},
		})
		const wInp = createMathInput({
			label: 'W', value: Math.round(ls.w ?? res.w), min: 1, max: res.w * 4, step: 1, decimals: 0,
			placeholder: String(res.w),
			onChange: (v) => {
				dashboardState.setLayerSetting(layerIdx, { w: v })
				applyLayerSettings(layerIdx, { ...ls, w: v })
			},
		})
		const hInp = createMathInput({
			label: 'H', value: Math.round(ls.h ?? res.h), min: 1, max: res.h * 4, step: 1, decimals: 0,
			placeholder: String(res.h),
			onChange: (v) => {
				dashboardState.setLayerSetting(layerIdx, { h: v })
				applyLayerSettings(layerIdx, { ...ls, h: v })
			},
		})
		fillFields.appendChild(xInp.wrap)
		fillFields.appendChild(yInp.wrap)
		fillFields.appendChild(wInp.wrap)
		fillFields.appendChild(hInp.wrap)
		fillGrp.appendChild(fillFields)
		root.appendChild(fillGrp)

		// Opacity, Volume, Blend (mixer)
		const mixerGrp = document.createElement('div')
		mixerGrp.className = 'inspector-group'
		mixerGrp.innerHTML = '<div class="inspector-group__title">Mixer</div>'

		const opInp = createDragInput({
			label: 'Opacity', value: ls.opacity ?? 1, min: 0, max: 1, step: 0.01, decimals: 2,
			onChange: (v) => {
				dashboardState.setLayerSetting(layerIdx, { opacity: v })
				applyLayerSettings(layerIdx, { ...ls, opacity: v })
			},
		})
		mixerGrp.appendChild(opInp.wrap)

		const volInp = createDragInput({
			label: 'Volume', value: ls.volume ?? 1, min: 0, max: 2, step: 0.01, decimals: 2,
			onChange: (v) => {
				dashboardState.setLayerSetting(layerIdx, { volume: v })
				applyLayerSettings(layerIdx, { ...ls, volume: v })
			},
		})
		mixerGrp.appendChild(volInp.wrap)

		const blendWrap = document.createElement('div')
		blendWrap.className = 'inspector-field'
		const blendLab = document.createElement('label')
		blendLab.className = 'inspector-field__label'
		blendLab.textContent = 'Blend'
		const blendSel = document.createElement('select')
		blendSel.className = 'inspector-field__select'
		BLEND_MODES.forEach((m) => {
			const opt = document.createElement('option')
			opt.value = m
			opt.textContent = m
			if (m === (ls.blend || 'normal')) opt.selected = true
			blendSel.appendChild(opt)
		})
		blendSel.addEventListener('change', () => {
			const mode = blendSel.value
			dashboardState.setLayerSetting(layerIdx, { blend: mode })
			applyLayerSettings(layerIdx, { ...ls, blend: mode })
		})
		blendLab.appendChild(blendSel)
		blendWrap.appendChild(blendLab)
		mixerGrp.appendChild(blendWrap)
		root.appendChild(mixerGrp)

		// Stretch mode
		const stretchGrp = document.createElement('div')
		stretchGrp.className = 'inspector-group'
		stretchGrp.innerHTML = '<div class="inspector-group__title">Content Scaling</div>'
		const stretchWrap = document.createElement('div')
		stretchWrap.className = 'inspector-field'
		const stretchLab = document.createElement('label')
		stretchLab.className = 'inspector-field__label'
		stretchLab.textContent = 'Stretch'
		const stretchSel = document.createElement('select')
		stretchSel.className = 'inspector-field__select'
		const stretchLabels = { 'none': 'None (1:1 pixel)', 'fit': 'Fit (uniform)', 'stretch': 'Stretch (fill area)', 'fill-h': 'Fill Horizontal', 'fill-v': 'Fill Vertical' }
		STRETCH_MODES.forEach((m) => {
			const opt = document.createElement('option')
			opt.value = m
			opt.textContent = stretchLabels[m] || m
			if (m === (ls.stretch || 'none')) opt.selected = true
			stretchSel.appendChild(opt)
		})
		stretchSel.addEventListener('change', () => {
			dashboardState.setLayerSetting(layerIdx, { stretch: stretchSel.value })
			applyLayerSettings(layerIdx, { ...dashboardState.getLayerSetting(layerIdx) })
		})
		stretchLab.appendChild(stretchSel)
		stretchWrap.appendChild(stretchLab)
		stretchGrp.appendChild(stretchWrap)

		const aspectLockWrap = document.createElement('div')
		aspectLockWrap.className = 'inspector-field inspector-row'
		const aspectLock = document.createElement('input')
		aspectLock.type = 'checkbox'
		aspectLock.id = 'inspector-layer-aspect-lock'
		aspectLock.checked = !!ls.aspectLocked
		aspectLock.title = 'When adjusting W/H via Companion encoders, keep aspect ratio'
		const aspectLockLab = document.createElement('label')
		aspectLockLab.htmlFor = 'inspector-layer-aspect-lock'
		aspectLockLab.textContent = 'Lock W/H aspect (Companion encoders)'
		aspectLock.addEventListener('change', () => {
			dashboardState.setLayerSetting(layerIdx, { aspectLocked: aspectLock.checked })
			scheduleSelectionSync(stateStore, selection)
		})
		aspectLockWrap.appendChild(aspectLock)
		aspectLockWrap.appendChild(aspectLockLab)
		stretchGrp.appendChild(aspectLockWrap)

		const stretchHint = document.createElement('p')
		stretchHint.className = 'inspector-hint'
		stretchHint.textContent = 'None: 1:1 pixel, no scaling. Fit: scale to fit layer, keep ratio. Stretch: fill area. Fill H/V: fill one axis.'
		stretchGrp.appendChild(stretchHint)
		root.appendChild(stretchGrp)

		const hint = document.createElement('p')
		hint.className = 'inspector-hint'
		hint.textContent = 'Layer settings apply to all clips on this layer, for every column.'
		root.appendChild(hint)
	}

	// ── Multiview inspector ────────────────────────────────────────────────────

	function renderMultiviewInspector(cellId) {
		const cell = multiviewState.getCell(cellId)
		if (!cell) { renderEmpty(); return }
		const cw = multiviewState.canvasWidth || 1920
		const ch = multiviewState.canvasHeight || 1080
		root.innerHTML = ''
		const title = document.createElement('div')
		title.className = 'inspector-title'
		title.textContent = cell.label || cell.id
		root.appendChild(title)

		const posGrp = document.createElement('div')
		posGrp.className = 'inspector-group'
		posGrp.innerHTML = '<div class="inspector-group__title">Position (px)</div>'
		const xInp = createMathInput({
			label: 'X', value: Math.round(cell.x ?? 0), min: 0, max: cw - 1, step: 1, decimals: 0,
			placeholder: 'e.g. 1920/2',
			onChange: (v) => {
				multiviewState.setCell(cellId, { x: Math.round(Math.max(0, Math.min(cw - (cell.w ?? 1), v))) })
			},
		})
		const yInp = createMathInput({
			label: 'Y', value: Math.round(cell.y ?? 0), min: 0, max: ch - 1, step: 1, decimals: 0,
			placeholder: 'e.g. 1080-540',
			onChange: (v) => {
				multiviewState.setCell(cellId, { y: Math.round(Math.max(0, Math.min(ch - (cell.h ?? 1), v))) })
			},
		})
		posGrp.appendChild(xInp.wrap)
		posGrp.appendChild(yInp.wrap)
		root.appendChild(posGrp)

		const sizeGrp = document.createElement('div')
		sizeGrp.className = 'inspector-group'
		sizeGrp.innerHTML = '<div class="inspector-group__title">Size (px)</div>'
		const aspectRatio = (cell.w && cell.h) ? cell.w / cell.h : 16 / 9

		const lockWrap = document.createElement('div')
		lockWrap.className = 'inspector-field inspector-row'
		const lockCheck = document.createElement('input')
		lockCheck.type = 'checkbox'
		lockCheck.id = 'inspector-mv-lock'
		lockCheck.checked = !!cell.aspectLocked
		const lockLabel = document.createElement('label')
		lockLabel.htmlFor = 'inspector-mv-lock'
		lockLabel.textContent = 'Lock aspect ratio'
		lockWrap.appendChild(lockCheck)
		lockWrap.appendChild(lockLabel)
		sizeGrp.appendChild(lockWrap)

		const wInp = createMathInput({
			label: 'W', value: Math.round(cell.w ?? 0), min: 1, max: cw, step: 1, decimals: 0,
			placeholder: 'e.g. 960',
			onChange: (v) => {
				let nw = Math.round(Math.max(1, Math.min(cw - (cell.x ?? 0), v)))
				let nh = cell.h ?? 100
				if (lockCheck.checked && cell.h) nh = Math.max(1, Math.min(ch - (cell.y ?? 0), Math.round(nw / aspectRatio)))
				multiviewState.setCell(cellId, { w: nw, h: nh })
			},
		})
		const hInp = createMathInput({
			label: 'H', value: Math.round(cell.h ?? 0), min: 1, max: ch, step: 1, decimals: 0,
			placeholder: 'e.g. 540',
			onChange: (v) => {
				let nh = Math.round(Math.max(1, Math.min(ch - (cell.y ?? 0), v)))
				let nw = cell.w ?? 100
				if (lockCheck.checked && cell.w) nw = Math.max(1, Math.min(cw - (cell.x ?? 0), Math.round(nh * aspectRatio)))
				multiviewState.setCell(cellId, { w: nw, h: nh })
			},
		})
		sizeGrp.appendChild(wInp.wrap)
		sizeGrp.appendChild(hInp.wrap)
		root.appendChild(sizeGrp)

		lockCheck.addEventListener('change', () => multiviewState.setCell(cellId, { aspectLocked: lockCheck.checked }))

		const hint = document.createElement('p')
		hint.className = 'inspector-hint'
		hint.textContent = 'Values in pixels. Top-left is 0,0. Supports math: 1920/2, 100+50'
		root.appendChild(hint)
	}

	// ── Dispatch ───────────────────────────────────────────────────────────────

	function update(data) {
		selection = data
		if (!data) {
			renderEmpty()
			scheduleSelectionSync(stateStore, null)
			return
		}
		if (data.type === 'dashboard' && data.colIdx != null && data.layerIdx != null) {
			const cell = dashboardState.getCell(data.colIdx, data.layerIdx)
			if (cell?.source?.value) {
				renderClipInspector(data.colIdx, data.layerIdx, cell)
				scheduleSelectionSync(stateStore, selection)
				return
			}
		}
		if (data.type === 'dashboardLayer' && data.layerIdx != null) {
			renderLayerSettingsInspector(data.layerIdx)
			scheduleSelectionSync(stateStore, selection)
			return
		}
		if (data.type === 'multiview' && data.cellId) {
			renderMultiviewInspector(data.cellId)
			scheduleSelectionSync(stateStore, selection)
			return
		}
		if (data.type === 'timelineClip' && data.timelineId && data.layerIdx != null && data.clipId && data.clip) {
			renderTimelineClipInspector(data.timelineId, data.layerIdx, data.clipId, data.clip)
			scheduleSelectionSync(stateStore, selection)
			return
		}
		if (data.type === 'timelineLayer' && data.timelineId && data.layerIdx != null) {
			renderTimelineLayerInspector(data.timelineId, data.layerIdx, data.layer)
			scheduleSelectionSync(stateStore, selection)
			return
		}
		renderEmpty()
		scheduleSelectionSync(stateStore, selection)
	}

	window.addEventListener('dashboard-select', (e) => {
		const d = e.detail
		if (d && typeof d.colIdx === 'number' && typeof d.layerIdx === 'number') {
			update({ type: 'dashboard', colIdx: d.colIdx, layerIdx: d.layerIdx })
		} else if (!d) {
			// Only clear if dashboard had focus — don't wipe multiview/timeline selection on doc click
			if (selection?.type === 'dashboard') update(null)
		}
	})

	window.addEventListener('timeline-clip-select', (e) => {
		const d = e.detail
		if (d && d.timelineId && typeof d.layerIdx === 'number' && d.clipId && d.clip) {
			update({ type: 'timelineClip', timelineId: d.timelineId, layerIdx: d.layerIdx, clipId: d.clipId, clip: d.clip })
		} else {
			update(null)
		}
	})

	window.addEventListener('dashboard-layer-select', (e) => {
		const d = e.detail
		if (d && typeof d.layerIdx === 'number') {
			update({ type: 'dashboardLayer', layerIdx: d.layerIdx })
		}
	})

	window.addEventListener('timeline-layer-select', (e) => {
		const d = e.detail
		if (d && d.timelineId && typeof d.layerIdx === 'number') {
			update({ type: 'timelineLayer', timelineId: d.timelineId, layerIdx: d.layerIdx, layer: d.layer })
		}
	})

	function onMultiviewSelect(e) {
		const d = e?.detail
		if (d?.cellId) update({ type: 'multiview', cellId: d.cellId })
		else update(null)
	}
	window.addEventListener('multiview-select', onMultiviewSelect)
	document.addEventListener('multiview-select', onMultiviewSelect, true)

	multiviewState.on('change', () => {
		if (selection?.type === 'multiview' && selection.cellId) {
			renderMultiviewInspector(selection.cellId)
			scheduleSelectionSync(stateStore, selection)
		}
	})

	dashboardState.on('change', () => {
		if (selection?.type === 'dashboard') {
			const cell = dashboardState.getCell(selection.colIdx, selection.layerIdx)
			if (cell?.source?.value) renderClipInspector(selection.colIdx, selection.layerIdx, cell)
		} else if (selection?.type === 'dashboardLayer') {
			renderLayerSettingsInspector(selection.layerIdx)
		}
	})

	dashboardState.on('activeColumn', () => {
		if (selection?.type === 'dashboard') {
			const cell = dashboardState.getCell(selection.colIdx, selection.layerIdx)
			if (cell?.source?.value) renderClipInspector(selection.colIdx, selection.layerIdx, cell)
		}
	})

	dashboardState.on('layerSettingChange', (idx) => {
		if (selection?.type === 'dashboardLayer' && selection.layerIdx === idx) {
			renderLayerSettingsInspector(idx)
			scheduleSelectionSync(stateStore, selection)
		}
	})

	renderEmpty()
	scheduleSelectionSync(stateStore, null)
}
