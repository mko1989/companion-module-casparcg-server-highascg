/**
 * Timeline editor — transport bar, keyboard shortcuts (I/O fades), canvas orchestration.
 * Transport bar above the ruler with timecode, play controls, zoom, send-to, follow toggle.
 * I key = fade in (opacity 0→1 over first 500ms of selected clip).
 * O key = fade out (opacity 1→0 over last 500ms of selected clip).
 * Seek on every ruler drag event (CALL SEEK sent to server each move).
 * @see main_plan.md Prompt 17
 */

import { timelineState } from '../lib/timeline-state.js'
import { dashboardState, TRANSITION_TYPES, TRANSITION_TWEENS } from '../lib/dashboard-state.js'
import { api, getApiBase } from '../lib/api-client.js'
import { initTimelineCanvas, fmtSmpte, parseTcInput } from './timeline-canvas.js'
import { initPreviewPanel, drawTimelineStack } from './preview-canvas.js'

export function initTimelineEditor(root, stateStore) {
	let redrawTimelineView = () => {}
	let playback = { playing: false, position: 0, timelineId: null, loop: false }
	let selectedClip = null  // { layerIdx, clipId, timelineId, clip }
	let _seekThrottleLast = 0
	let _seekThrottleId = null
	// sendTo.screenIdx: 0-based screen index, null = all screens
	// Default to both PGM and PRV; timeline uses layers 11–19 on PRV (above black on layer 10)
	const view = {
		sendTo: { preview: true, program: true, screenIdx: 0 },
		follow: true,
		takeTransition: { type: 'MIX', duration: 12, tween: 'linear' },
	}

	// Smooth playhead: track server tick reference point for local interpolation
	let serverTickPos = 0
	let serverTickAt = 0
	let playLoopRaf = null

	function startPlaybackLoop() {
		if (playLoopRaf) return
		const loop = () => {
			if (!playback.playing) {
				playLoopRaf = null
				return
			}
			const elapsed = Date.now() - serverTickAt
			const tl = timelineState.getActive()
			const extrapolated = serverTickPos + elapsed
			playback.position = tl ? Math.min(extrapolated, tl.duration) : extrapolated
			updateTimecode()
			redrawTimelineView()
			playLoopRaf = requestAnimationFrame(loop)
		}
		playLoopRaf = requestAnimationFrame(loop)
	}

	function stopPlaybackLoop() {
		if (playLoopRaf) {
			cancelAnimationFrame(playLoopRaf)
			playLoopRaf = null
		}
	}

	root.innerHTML = `
		<div class="tl-editor-root">
			<div id="tl-preview-host" class="tl-preview-host"></div>
			<div class="tl-editor">
				<div class="tl-transport" id="tl-transport"></div>
				<div class="tl-body" id="tl-body"></div>
			</div>
		</div>
	`
	const previewHost = root.querySelector('#tl-preview-host')
	const transportEl = root.querySelector('#tl-transport')
	const bodyEl = root.querySelector('#tl-body')

	// ── Canvas ────────────────────────────────────────────────────────────────

	const canvas = initTimelineCanvas(bodyEl, {
		getTimeline: () => timelineState.getActive(),
		getPlayback: () => playback,
		getView: () => view,
		onSeek(ms) {
			const tl = timelineState.getActive()
			if (!tl) return
			const clamped = Math.max(0, Math.min(ms, tl.duration))
			playback.position = clamped
			updateTimecode()
			// Throttle SEEK API during drag (~100ms) to avoid flooding CasparCG
			const now = Date.now()
			if (!_seekThrottleLast || now - _seekThrottleLast >= 100) {
				_seekThrottleLast = now
				if (_seekThrottleId) clearTimeout(_seekThrottleId)
				_seekThrottleId = null
				api.post(`/api/timelines/${tl.id}/seek`, { ms: clamped }).catch(() => {})
			} else if (!_seekThrottleId) {
				_seekThrottleId = setTimeout(() => {
					_seekThrottleId = null
					_seekThrottleLast = Date.now()
					const t = timelineState.getActive()
					if (t) api.post(`/api/timelines/${t.id}/seek`, { ms: playback.position }).catch(() => {})
				}, 100)
			}
			redrawTimelineView()
		},
		onSeekEnd(ms) {
			const tl = timelineState.getActive()
			if (!tl) return
			if (_seekThrottleId) { clearTimeout(_seekThrottleId); _seekThrottleId = null }
			const clamped = Math.max(0, Math.min(ms ?? playback.position, tl.duration))
			playback.position = clamped
			updateTimecode()
			api.post(`/api/timelines/${tl.id}/seek`, { ms: clamped }).catch(() => {})
			redrawTimelineView()
		},
		onSelectClip(info) {
			selectedClip = info
			window.dispatchEvent(new CustomEvent('timeline-clip-select', { detail: info }))
		},
		onDropSource(source, layerIdx, startTime) {
			const tl = timelineState.getActive()
			if (!tl) return
			let duration = 5000
			if (source?.type === 'media' && source?.value) {
				const mediaList = stateStore.getState()?.media || []
				const match = mediaList.find((m) => m.id === source.value)
				if (match?.durationMs > 0) duration = match.durationMs
			}
			if (startTime + duration > tl.duration) {
				timelineState.updateTimeline(tl.id, { duration: startTime + duration + 2000 })
			}
			while (tl.layers.length <= layerIdx) {
				timelineState.addLayer(tl.id)
			}
			timelineState.addClip(tl.id, layerIdx, source, startTime, duration)
			syncToServer(timelineState.getActive())
			redrawTimelineView()
		},
		onMoveClip(layerIdx, clipId, newStartTime) {
			const tl = timelineState.getActive()
			if (!tl) return
			timelineState.updateClip(tl.id, layerIdx, clipId, { startTime: newStartTime })
			// Sync deferred to mouseup — avoid flooding API during drag
		},
		onResizeClip(layerIdx, clipId, changes) {
			const tl = timelineState.getActive()
			if (!tl) return
			timelineState.updateClip(tl.id, layerIdx, clipId, changes)
		},
		getThumbnailUrl: (source) => source?.type === 'media' && source?.value
			? `${getApiBase()}/api/thumbnail/${encodeURIComponent(source.value)}`
			: null,
		// Prompt 28: when local_media_path configured, use real waveform API; else synthetic
		getWaveformUrl: (source) => {
			if (source?.type !== 'media' || !source?.value) return null
			if (!stateStore.getState()?.localMediaEnabled) return null
			return `${getApiBase()}/api/local-media/${encodeURIComponent(source.value)}/waveform`
		},
		onLayerContextMenu(timelineId, layerIdx, layer, clientX, clientY) {
			showLayerContextMenu(clientX, clientY, timelineId, layerIdx, layer)
		},
		onLayerClick(timelineId, layerIdx, layer) {
			selectedClip = null
			window.dispatchEvent(new CustomEvent('timeline-clip-select', { detail: null }))
			window.dispatchEvent(new CustomEvent('timeline-layer-select', { detail: { timelineId, layerIdx, layer } }))
		},
		onSelectKeyframe(info) {
			window.dispatchEvent(new CustomEvent('timeline-keyframe-select', { detail: info }))
		},
		onMoveKeyframe(timelineId, layerIdx, clipId, keyframeIdx, newTime) {
			timelineState.updateKeyframeTime(timelineId, layerIdx, clipId, keyframeIdx, newTime)
		},
	})

	let previewPanel = null
	redrawTimelineView = () => {
		canvas.redraw()
		previewPanel?.scheduleDraw?.()
	}

	previewPanel = initPreviewPanel(previewHost, {
		title: 'Timeline output',
		storageKeyPrefix: 'casparcg_preview_timeline',
		getOutputResolution: () => {
			const s = view.sendTo.screenIdx ?? 0
			const pr = stateStore.getState()?.channelMap?.programResolutions?.[s]
			return pr?.w > 0 && pr?.h > 0 ? pr : { w: 1920, h: 1080 }
		},
		stateStore,
		draw(ctx, W, H) {
			drawTimelineStack(ctx, W, H, {
				timelineState,
				getPlayback: () => playback,
				getThumbUrl: (src) =>
					src?.type === 'media' && src?.value
						? `${getApiBase()}/api/thumbnail/${encodeURIComponent(src.value)}`
						: null,
				onThumbLoaded: () => previewPanel.scheduleDraw(),
			})
		},
	})

	function showLayerContextMenu(clientX, clientY, timelineId, layerIdx, layer) {
		const existing = document.getElementById('tl-layer-menu')
		if (existing) existing.remove()
		const menu = document.createElement('div')
		menu.id = 'tl-layer-menu'
		menu.className = 'tl-layer-menu'
		menu.innerHTML = `
			<button type="button" data-action="rename">Rename layer</button>
			<button type="button" data-action="add">Add layer below</button>
			<button type="button" data-action="remove">Remove layer</button>
		`
		menu.style.cssText = `position:fixed;left:${clientX}px;top:${clientY}px;z-index:9999;background:#21262d;border:1px solid #30363d;border-radius:6px;padding:4px;min-width:140px;box-shadow:0 8px 24px rgba(0,0,0,0.4);`
		menu.querySelectorAll('button').forEach((b) => {
			b.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 10px;background:0;border:0;color:#c9d1d9;cursor:pointer;font-size:12px;border-radius:4px;'
			b.addEventListener('mouseenter', () => { b.style.background = '#30363d' })
			b.addEventListener('mouseleave', () => { b.style.background = '0' })
		})
		const close = () => menu.remove()
		menu.querySelector('[data-action="rename"]').addEventListener('click', () => {
			const name = prompt('Layer name', layer.name || `Layer ${layerIdx + 1}`)
			if (name != null && name.trim()) {
				timelineState.updateLayer(timelineId, layerIdx, { name: name.trim() })
				syncToServer(timelineState.getActive())
				redrawTimelineView()
			}
			close()
		})
		menu.querySelector('[data-action="add"]').addEventListener('click', () => {
			timelineState.addLayer(timelineId, `Layer ${layerIdx + 2}`)
			syncToServer(timelineState.getActive())
			redrawTimelineView()
			close()
		})
		menu.querySelector('[data-action="remove"]').addEventListener('click', () => {
			if (confirm(`Remove "${layer.name || 'Layer ' + (layerIdx + 1)}" and all its clips?`)) {
				timelineState.removeLayer(timelineId, layerIdx)
				syncToServer(timelineState.getActive())
				redrawTimelineView()
				if (selectedClip?.layerIdx === layerIdx) selectedClip = null
				window.dispatchEvent(new CustomEvent('timeline-clip-select', { detail: null }))
			}
			close()
		})
		document.body.appendChild(menu)
		document.addEventListener('click', close, { once: true })
	}

	// ── Keyboard shortcuts ────────────────────────────────────────────────────

	root.setAttribute('tabindex', '-1')
	root.addEventListener('keydown', (e) => {
		// Spacebar = play/pause regardless of selection
		if (e.key === ' ') {
			e.preventDefault()
			togglePlay()
			return
		}

		if (!selectedClip) return
		const { timelineId, layerIdx, clipId, clip } = selectedClip
		if (!clip) return

		if (e.key === 'i') {
			e.preventDefault()
			// Fade in: opacity 0 at localTime=0, opacity 1 at localTime=500ms
			timelineState.clearKeyframeRange(timelineId, layerIdx, clipId, 'opacity', 0, 500)
			timelineState.addKeyframe(timelineId, layerIdx, clipId, { time: 0, property: 'opacity', value: 0, easing: 'linear' })
			timelineState.addKeyframe(timelineId, layerIdx, clipId, { time: 500, property: 'opacity', value: 1, easing: 'linear' })
			syncToServer(timelineState.getActive())
			redrawTimelineView()
		}

		if (e.key === 'o') {
			e.preventDefault()
			// Fade out: opacity 1 at (duration-500ms), opacity 0 at duration
			const fadeStart = Math.max(0, clip.duration - 500)
			timelineState.clearKeyframeRange(timelineId, layerIdx, clipId, 'opacity', fadeStart, clip.duration + 1)
			timelineState.addKeyframe(timelineId, layerIdx, clipId, { time: fadeStart, property: 'opacity', value: 1, easing: 'linear' })
			timelineState.addKeyframe(timelineId, layerIdx, clipId, { time: clip.duration, property: 'opacity', value: 0, easing: 'linear' })
			syncToServer(timelineState.getActive())
			redrawTimelineView()
		}

		// p = position keyframe (x,y), s = scale keyframe (locked), v = volume, t = opacity at current time
		if (e.key === 'p' || e.key === 's' || e.key === 'v' || e.key === 't') {
			e.preventDefault()
			const localMs = Math.max(0, Math.round(playback.position - clip.startTime))
			const time = Math.min(localMs, clip.duration)
			if (e.key === 'p') timelineState.addPositionKeyframe(timelineId, layerIdx, clipId, time, 0, 0)
			else if (e.key === 's') timelineState.addScaleKeyframe(timelineId, layerIdx, clipId, time, 1)
			else timelineState.addKeyframe(timelineId, layerIdx, clipId, { time, property: e.key === 'v' ? 'volume' : 'opacity', value: e.key === 'v' ? 1 : 1, easing: 'linear' })
			syncToServer(timelineState.getActive())
			redrawTimelineView()
			window.dispatchEvent(new CustomEvent('timeline-clip-select', { detail: selectedClip }))
		}

		if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault()
			timelineState.removeClip(timelineId, layerIdx, clipId)
			selectedClip = null
			syncToServer(timelineState.getActive())
			redrawTimelineView()
		}
	})

	// Sync after drag ends (mouseup on the body — deferred clip move/resize sync)
	bodyEl.addEventListener('mouseup', () => {
		syncToServer(timelineState.getActive())
	})

	// ── Transport actions ─────────────────────────────────────────────────────

	async function doSeekToStart() {
		await doSeek(0)
	}

	async function doSeekToEnd() {
		const tl = timelineState.getActive()
		if (tl) await doSeek(tl.duration)
	}

	async function doSeek(ms) {
		const tl = timelineState.getActive()
		if (!tl) return
		playback.position = ms
		canvas.setPlayheadPosition(ms)
		updateTimecode()
		redrawTimelineView()
		await api.post(`/api/timelines/${tl.id}/seek`, { ms }).catch(() => {})
	}

	async function togglePlay() {
		const tl = timelineState.getActive()
		if (!tl) return
		if (playback.playing) {
			playback.playing = false
			stopPlaybackLoop()
			buildTransport()
			redrawTimelineView()
			await api.post(`/api/timelines/${tl.id}/pause`).catch(() => {})
		} else {
			// Sync latest state before playing, then route to output
			await syncToServer(tl)
			await api.post(`/api/timelines/${tl.id}/sendto`, view.sendTo).catch(() => {})
			serverTickPos = playback.position
			serverTickAt = Date.now()
			playback.playing = true
			playback.timelineId = tl.id
			buildTransport()
			startPlaybackLoop()
			redrawTimelineView()
			await api.post(`/api/timelines/${tl.id}/play`, { from: playback.position }).catch(() => {})
		}
	}

	async function doStop() {
		const tl = timelineState.getActive()
		if (!tl) return
		playback.playing = false
		stopPlaybackLoop()
		playback.position = 0
		canvas.setPlayheadPosition(0)
		buildTransport()
		redrawTimelineView()
		await api.post(`/api/timelines/${tl.id}/stop`).catch(() => {})
	}

	async function syncToServer(tl) {
		if (!tl) return
		try {
			await api.put(`/api/timelines/${tl.id}`, tl)
		} catch {
			// PUT might not work in all environments (e.g. Companion proxy) — always fall back to POST upsert
			try {
				await api.post('/api/timelines', tl)
			} catch {}
		}
	}

	async function updateSendTo() {
		const tl = timelineState.getActive()
		if (!tl) return
		await api.post(`/api/timelines/${tl.id}/sendto`, view.sendTo).catch(() => {})
	}

	// ── Transport bar (rebuilt on state change) ───────────────────────────────

	function updateTimecode() {
		const tl = timelineState.getActive()
		const fps = tl?.fps || 25
		const tcCur = document.getElementById('tl-tc-cur')
		const tcTot = document.getElementById('tl-tc-tot')
		if (tcCur && !tcCur.matches(':focus')) tcCur.value = fmtSmpte(playback.position, fps)
		if (tcTot && !tcTot.matches(':focus')) tcTot.value = fmtSmpte(tl?.duration ?? 0, fps)
	}

	function buildTransport() {
		const tl = timelineState.getActive()
		const fps = tl?.fps || 25
		const tlSelector = timelineState.timelines.map((t) =>
			`<option value="${t.id}" ${t.id === timelineState.activeId ? 'selected' : ''}>${t.name}</option>`
		).join('')

		// Build screen selector options
		const state = stateStore.getState()
		const screenCount = state?.channelMap?.screenCount || 1
		const screenOpts = Array.from({ length: screenCount }, (_, i) =>
			`<option value="${i}" ${view.sendTo.screenIdx === i ? 'selected' : ''}>Screen ${i + 1}</option>`
		).join('')

		transportEl.innerHTML = `
			<div class="tl-tb">
				<div class="tl-tb-group">
					<select class="tl-select" id="tl-select">${tlSelector}</select>
					<button class="tl-btn" id="tl-new-tl" title="New timeline">+</button>
				</div>
				<div class="tl-tb-group tl-tb-transport">
					<button class="tl-btn" id="tl-to-start" title="To start">⏮</button>
					<button class="tl-btn tl-btn-play ${playback.playing ? 'active' : ''}" id="tl-play">
						${playback.playing ? '⏸' : '▶'}
					</button>
					<button class="tl-btn" id="tl-stop" title="Stop">⏹</button>
					<button class="tl-btn" id="tl-to-end" title="To end">⏭</button>
					<button class="tl-btn ${playback.loop ? 'active' : ''}" id="tl-loop" title="Loop">⟳</button>
				</div>
				<div class="tl-tb-group tl-timecode-group">
					<input type="text" class="tl-timecode tl-timecode-input" id="tl-tc-cur" value="${fmtSmpte(playback.position, fps)}" title="Current time (Enter to focus). ++500 / --500 for jump" />
					<span class="tl-timecode-sep">/</span>
					<input type="text" class="tl-timecode tl-timecode-input" id="tl-tc-tot" value="${fmtSmpte(tl?.duration ?? 0, fps)}" title="Total duration" />
				</div>
				<div class="tl-tb-group">
					<button class="tl-btn" id="tl-trim" title="Trim duration to last clip">Trim</button>
					<button class="tl-btn" id="tl-zm" title="Zoom out">−</button>
					<button class="tl-btn" id="tl-zf" title="Fit to view">Fit</button>
					<button class="tl-btn" id="tl-zp" title="Zoom in">+</button>
				</div>
				<div class="tl-tb-group tl-tb-dest">
					<span class="tl-tb-label">Dest:</span>
					<select class="tl-select tl-select-sm" id="tl-screen">${screenOpts}</select>
					<label class="tl-chk"><input type="checkbox" id="tl-s-prev" ${view.sendTo.preview ? 'checked' : ''}> PRV</label>
					<label class="tl-chk"><input type="checkbox" id="tl-s-pgm" ${view.sendTo.program ? 'checked' : ''}> PGM</label>
				</div>
				<div class="tl-tb-group tl-tb-take">
					<select class="tl-select tl-select-sm" id="tl-take-trans" title="Take transition">
						${TRANSITION_TYPES.map((t) => `<option value="${t}" ${t === view.takeTransition.type ? 'selected' : ''}>${t}</option>`).join('')}
					</select>
					<input type="number" class="tl-input-sm" id="tl-take-dur" value="${view.takeTransition.duration}" min="0" max="120" title="Frames" placeholder="12" />
					<select class="tl-select tl-select-sm" id="tl-take-tween" title="Tween">${TRANSITION_TWEENS.map((tw) => `<option value="${tw}" ${tw === view.takeTransition.tween ? 'selected' : ''}>${tw}</option>`).join('')}</select>
					<button class="tl-btn tl-btn-take" id="tl-take" title="Take to program">Take</button>
				</div>
				<div class="tl-tb-group">
					<button class="tl-btn ${view.follow ? 'active' : ''}" id="tl-follow" title="Follow playhead">Follow</button>
				</div>
			</div>
		`

		// Bind events
		transportEl.querySelector('#tl-select')?.addEventListener('change', (e) => {
			timelineState.setActive(e.target.value)
			canvas.zoomFit()
			redrawTimelineView()
		})
		transportEl.querySelector('#tl-new-tl')?.addEventListener('click', () => {
			timelineState.createTimeline({ name: `Timeline ${timelineState.timelines.length + 1}` })
			buildTransport()
			canvas.zoomFit()
		})
		transportEl.querySelector('#tl-to-start')?.addEventListener('click', doSeekToStart)
		transportEl.querySelector('#tl-to-end')?.addEventListener('click', doSeekToEnd)
		transportEl.querySelector('#tl-play')?.addEventListener('click', togglePlay)
		transportEl.querySelector('#tl-stop')?.addEventListener('click', doStop)
		transportEl.querySelector('#tl-loop')?.addEventListener('click', async () => {
			playback.loop = !playback.loop
			buildTransport()
			const tl = timelineState.getActive()
			if (tl) await api.post(`/api/timelines/${tl.id}/loop`, { loop: playback.loop }).catch(() => {})
		})
		transportEl.querySelector('#tl-trim')?.addEventListener('click', () => {
			const tl = timelineState.getActive()
			if (!tl) return
			let lastEnd = 0
			for (const layer of tl.layers) {
				for (const clip of (layer.clips || [])) {
					const end = clip.startTime + clip.duration
					if (end > lastEnd) lastEnd = end
				}
			}
			if (lastEnd > 0) {
				timelineState.updateTimeline(tl.id, { duration: lastEnd })
				syncToServer(timelineState.getActive())
				buildTransport()
				redrawTimelineView()
			}
		})
		transportEl.querySelector('#tl-zm')?.addEventListener('click', () => canvas.zoom(-1))
		transportEl.querySelector('#tl-zp')?.addEventListener('click', () => canvas.zoom(1))
		transportEl.querySelector('#tl-zf')?.addEventListener('click', () => canvas.zoomFit())
		transportEl.querySelector('#tl-follow')?.addEventListener('click', () => { view.follow = !view.follow; buildTransport() })
		transportEl.querySelector('#tl-screen')?.addEventListener('change', (e) => {
			view.sendTo.screenIdx = parseInt(e.target.value, 10)
			updateSendTo()
			redrawTimelineView()
		})
		transportEl.querySelector('#tl-s-prev')?.addEventListener('change', (e) => { view.sendTo.preview = e.target.checked; updateSendTo() })
		transportEl.querySelector('#tl-s-pgm')?.addEventListener('change', (e) => { view.sendTo.program = e.target.checked; updateSendTo() })
		transportEl.querySelector('#tl-take-trans')?.addEventListener('change', (e) => { view.takeTransition.type = e.target.value })
		transportEl.querySelector('#tl-take-dur')?.addEventListener('change', (e) => { view.takeTransition.duration = Math.max(0, parseInt(e.target.value, 10) || 0) })
		transportEl.querySelector('#tl-take-tween')?.addEventListener('change', (e) => { view.takeTransition.tween = e.target.value })
		transportEl.querySelector('#tl-take')?.addEventListener('click', async () => {
			const tl = timelineState.getActive()
			if (tl) {
				const trans = view.takeTransition || {}
				await api.post(`/api/timelines/${tl.id}/take`, {
					transition: trans.type || 'CUT',
					duration: trans.duration ?? 12,
					tween: trans.tween || 'linear',
					screenIdx: view.sendTo.screenIdx ?? 0,
				}).catch(() => {})
			}
		})

		// Timecode inputs: current (seek), total (duration). Support ++500/--500.
		const tcCur = transportEl.querySelector('#tl-tc-cur')
		const tcTot = transportEl.querySelector('#tl-tc-tot')
		if (tcCur) {
			const onCurCommit = () => {
				const tl = timelineState.getActive()
				if (!tl) return
				const fps = tl.fps || 25
				const ms = parseTcInput(tcCur.value, playback.position, tl.duration, fps)
				if (ms != null) {
					doSeek(ms)
					tcCur.value = fmtSmpte(playback.position, fps)
				} else {
					tcCur.value = fmtSmpte(playback.position, fps)
				}
			}
			tcCur.addEventListener('change', onCurCommit)
			tcCur.addEventListener('blur', onCurCommit)
			tcCur.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') { tcCur.blur(); e.preventDefault() }
			})
		}
		if (tcTot) {
			const onTotCommit = () => {
				const tl = timelineState.getActive()
				if (!tl) return
				const fps = tl.fps || 25
				const ms = parseTcInput(tcTot.value, 0, null, fps)
				if (ms != null && ms >= 1000) {
					timelineState.updateTimeline(tl.id, { duration: ms })
					syncToServer(timelineState.getActive())
					tcTot.value = fmtSmpte(ms, fps)
					redrawTimelineView()
				} else {
					tcTot.value = fmtSmpte(tl.duration, fps)
				}
			}
			tcTot.addEventListener('change', onTotCommit)
			tcTot.addEventListener('blur', onTotCommit)
			tcTot.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') { tcTot.blur(); e.preventDefault() }
			})
		}
	}

	// Enter key anywhere in timeline tab → focus current time input
	root.addEventListener('keydown', (e) => {
		if (e.key !== 'Enter' || e.defaultPrevented) return
		const tcCur = document.getElementById('tl-tc-cur')
		const tab = document.getElementById('tab-timeline')
		if (!tcCur || !tab?.classList?.contains('active')) return
		tcCur.focus()
		tcCur.select()
		e.preventDefault()
	})

	// ── WebSocket tick / playback updates ─────────────────────────────────────

	function onTick(data) {
		if (!data?.timelineId) return
		const tl = timelineState.getActive()
		if (tl?.id !== data.timelineId) return
		// Update server reference point for local interpolation
		serverTickPos = data.position
		serverTickAt = Date.now()
		playback.position = data.position
		if (!playback.playing) {
			playback.playing = true
			buildTransport()
			startPlaybackLoop()
		}
		// The playback loop handles continuous redraws; just update timecode here
		updateTimecode()
	}

	function onPlayback(pb) {
		if (!pb) return
		const wasPlaying = playback.playing
		playback.playing = pb.playing
		playback.position = pb.position
		playback.loop = pb.loop
		if (pb.playing && !wasPlaying) {
			serverTickPos = pb.position
			serverTickAt = Date.now()
			startPlaybackLoop()
		} else if (!pb.playing && wasPlaying) {
			stopPlaybackLoop()
		}
		buildTransport()
		canvas.setPlayheadPosition(pb.position)
		redrawTimelineView()
	}

	stateStore.on('timeline.tick', (data) => onTick(data))
	stateStore.on('timeline.playback', (pb) => onPlayback(pb))
	timelineState.on('change', () => { buildTransport(); redrawTimelineView() })
	window.addEventListener('timeline-redraw-request', () => redrawTimelineView())

	// When the timeline tab is clicked, force canvas resize + fit
	document.addEventListener('timeline-tab-activated', () => {
		canvas.notifyVisible()
		canvas.zoomFit()
		previewPanel?.scheduleDraw?.()
	})

	// Initial build
	buildTransport()
	setTimeout(() => {
		canvas.zoomFit()
		redrawTimelineView()
	}, 100) // allow container to lay out first

	return { onTick, onPlayback }
}
