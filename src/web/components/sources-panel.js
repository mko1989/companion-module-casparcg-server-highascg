/**
 * Sources panel — Media, Templates, Live sources, Timelines.
 * Each source is draggable for use in dashboard columns/layers.
 * Media tab: detailed list with extension, resolution, duration (no thumbnails).
 * @see main_plan.md Prompt 12, Prompt 18
 */

import { timelineState } from '../lib/timeline-state.js'
import { api } from '../lib/api-client.js'


function makeDraggable(el, sourceType, sourceValue, label, extra = {}) {
	el.draggable = true
	el.dataset.sourceType = sourceType
	el.dataset.sourceValue = sourceValue
	el.dataset.sourceLabel = label || sourceValue
	el.classList.add('source-item', 'draggable')
	el.addEventListener('dragstart', (e) => {
		e.dataTransfer.effectAllowed = 'copy'
		e.dataTransfer.setData('application/json', JSON.stringify({ type: sourceType, value: sourceValue, label: label || sourceValue, ...extra }))
		e.dataTransfer.setData('text/plain', sourceValue)
		e.target.classList.add('dragging')
	})
	el.addEventListener('dragend', (e) => {
		e.target.classList.remove('dragging')
	})
}

function renderSourceList(container, items, sourceType, filter, onPreview) {
	container.innerHTML = ''
	if (!items || items.length === 0) {
		container.innerHTML = '<p class="sources-empty">No items</p>'
		return
	}
	const filtered = filter ? items.filter((i) => (i.label || i.id || i).toLowerCase().includes(filter.toLowerCase())) : items
	filtered.forEach((item) => {
		const id = item.id ?? item
		const label = item.label ?? String(id)
		const el = document.createElement('div')
		el.className = 'source-item'
		el.dataset.sourceValue = id
		el.innerHTML = `
			<span class="source-item__icon">${iconFor(sourceType)}</span>
			<span class="source-item__label" title="${escapeHtml(label)}">${escapeHtml(truncate(label, 32))}</span>
		`
		makeDraggable(el, sourceType, id, label)
		container.appendChild(el)
	})
}

function iconFor(type) {
	const icons = { media: '🎬', template: '📄', route: '📺', timeline: '⏱' }
	return icons[type] || '•'
}

function escapeHtml(s) {
	const div = document.createElement('div')
	div.textContent = s
	return div.innerHTML
}

function truncate(s, len) {
	if (!s || s.length <= len) return s
	return s.slice(0, len - 1) + '…'
}

function getExtension(filename) {
	if (!filename || typeof filename !== 'string') return ''
	const m = filename.match(/\.([a-zA-Z0-9]+)$/)
	return m ? m[1].toLowerCase() : ''
}

function formatDuration(ms) {
	if (ms == null || ms < 0) return '—'
	const s = Math.floor(ms / 1000)
	const m = Math.floor(s / 60)
	const h = Math.floor(m / 60)
	if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
	return `${m}:${String(s % 60).padStart(2, '0')}`
}

function formatFps(fps) {
	if (fps == null || fps <= 0 || isNaN(fps)) return ''
	const n = Math.round(fps * 100) / 100
	return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

function formatFileSize(bytes) {
	if (bytes == null || bytes < 0 || !Number.isFinite(bytes)) return ''
	if (bytes < 1024) return bytes + ' B'
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
	return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/**
 * Combine WebSocket `state.media` (CINF metadata after server flush) with last GET /api/media
 * (ffprobe fileSize/codec when local_media_path is set). State wins on overlapping keys.
 */
function mergeMediaProbeOverlay(stateMedia, probeList) {
	const sm = stateMedia || []
	const pl = probeList || []
	if (!pl.length) return sm
	if (!sm.length) return pl
	const pmap = new Map(pl.map((x) => [x.id, x]))
	return sm.map((m) => {
		const p = pmap.get(m.id)
		return p ? { ...p, ...m } : { ...m }
	})
}

/** Super minimal media browser for synced media folder scenario. Columns: ext | res | codec | dur | size */
function renderMediaBrowser(container, media, filter) {
	container.innerHTML = ''
	const filtered = filter
		? media.filter((i) => (i.label || i.id || i).toLowerCase().includes(filter.toLowerCase()))
		: media
	if (filtered.length === 0) {
		container.innerHTML = '<p class="sources-empty">No media files</p>'
		return
	}
	filtered.forEach((item) => {
		const id = item.id ?? item
		const label = item.label ?? String(id)
		const resolution = item.resolution || ''
		const duration = formatDuration(item.durationMs)
		const type = item.type || ''
		const metaParts = []
		if (type) metaParts.push(type)
		if (resolution) metaParts.push(resolution)
		if (duration !== '—') metaParts.push(duration)
		const metaStr = metaParts.join('  ')
		const el = document.createElement('div')
		el.className = 'source-item source-item--media source-item--media-compact'
		el.dataset.sourceValue = id
		el.innerHTML = `
			<span class="source-item__label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
			${metaStr ? `<span class="source-item__meta-inline">${escapeHtml(metaStr)}</span>` : ''}
		`
		makeDraggable(el, 'media', id, label)
		container.appendChild(el)
	})
}

function buildLiveSources(channelMap) {
	const sources = []
	if (!channelMap) return sources
	const { programChannels = [], previewChannels = [], inputsCh, decklinkCount = 0, programResolutions = [] } = channelMap
	programChannels.forEach((ch, i) => {
		const res = programResolutions[i]
		const resolution = res?.w && res?.h ? `${res.w}×${res.h}` : ''
		const fps = res?.fps != null ? formatFps(res.fps) : ''
		sources.push({ type: 'route', routeType: 'pgm', value: `route://${ch}`, label: `Program ${i + 1}`, resolution, fps })
	})
	previewChannels.forEach((ch, i) => {
		const res = programResolutions[i]
		const resolution = res?.w && res?.h ? `${res.w}×${res.h}` : ''
		const fps = res?.fps != null ? formatFps(res.fps) : ''
		sources.push({ type: 'route', routeType: 'prv', value: `route://${ch}-11`, label: `Preview ${i + 1}`, resolution, fps })
	})
	if (inputsCh != null && decklinkCount > 0) {
		const inputsRes = channelMap.inputsResolution
		const resolution = inputsRes?.w && inputsRes?.h ? `${inputsRes.w}×${inputsRes.h}` : ''
		const fps = inputsRes?.fps != null ? formatFps(inputsRes.fps) : ''
		for (let i = 1; i <= decklinkCount; i++) {
			sources.push({ type: 'route', routeType: 'decklink', value: `route://${inputsCh}-${i}`, label: `Decklink ${i}`, resolution, fps })
		}
	}
	return sources
}

/**
 * @param {HTMLElement} root - Panel body element
 * @param {object} stateStore - StateStore instance
 */
export function initSourcesPanel(root, stateStore) {
	let previewFeedback = null  // timeout handle for flash feedback

	async function sendToPreview(source) {
		const channelMap = stateStore.getState()?.channelMap || {}
		const previewCh = channelMap.previewChannels?.[0] ?? 2
		try {
			await api.post('/api/play', { channel: previewCh, layer: 1, clip: source.value })
			// Brief flash to confirm
			const el = root.querySelector(`[data-source-value="${CSS.escape(source.value)}"]`)
			if (el) {
				el.classList.add('source-item--previewing')
				clearTimeout(previewFeedback)
				previewFeedback = setTimeout(() => el.classList.remove('source-item--previewing'), 1200)
			}
		} catch (e) {
			console.warn('Preview failed:', e?.message || e)
		}
	}

	root.innerHTML = `
		<div class="sources-tabs">
			<button class="sources-tab active" data-src-tab="media">Media</button>
			<button class="sources-tab" data-src-tab="templates">Templates</button>
			<button class="sources-tab" data-src-tab="live">Live</button>
			<button class="sources-tab" data-src-tab="timelines">Timelines</button>
		</div>
		<div class="sources-search" id="sources-search" style="display:none">
			<input type="text" placeholder="Filter…" id="sources-filter" />
		</div>
		<div class="sources-list" id="sources-list"></div>
		<div class="sources-media-footer" id="sources-media-footer" style="display:none">
			<button type="button" class="sources-refresh-btn" id="sources-refresh-media" title="Refresh media library from CasparCG server">↻ Refresh</button>
		</div>
	`

	const tabs = root.querySelectorAll('.sources-tab')
	const searchWrap = root.querySelector('#sources-search')
	const filterInput = root.querySelector('#sources-filter')
	const listEl = root.querySelector('#sources-list')
	const mediaFooter = root.querySelector('#sources-media-footer')
	const refreshBtn = root.querySelector('#sources-refresh-media')

	let currentTab = 'media'
	let filter = ''
	let mediaWithProbe = null

	async function fetchMediaWithProbe() {
		try {
			const data = await api.get('/api/media')
			mediaWithProbe = Array.isArray(data) ? data : (data?.media ?? [])
			render()
		} catch {
			mediaWithProbe = null
		}
	}

	function render() {
		const state = stateStore.getState()
		const media = state.media || []
		const templates = state.templates || []
		const timelines = (currentTab === 'timelines' ? timelineState.getAll() : []) || state.timelines || []
		const channelMap = state.channelMap || {}

		if (currentTab === 'media') {
			searchWrap.style.display = 'block'
			listEl.classList.add('sources-media-list')
			renderMediaBrowser(listEl, mergeMediaProbeOverlay(media, mediaWithProbe), filter)
			if (mediaFooter) mediaFooter.style.display = 'block'
		} else if (currentTab === 'templates') {
			searchWrap.style.display = 'block'
			listEl.classList.remove('sources-media-list')
			if (mediaFooter) mediaFooter.style.display = 'none'
			renderSourceList(listEl, templates, 'template', filter, sendToPreview)
		} else if (currentTab === 'live') {
			searchWrap.style.display = 'none'
			listEl.classList.remove('sources-media-list')
			if (mediaFooter) mediaFooter.style.display = 'none'
			const liveSources = buildLiveSources(channelMap)
			listEl.innerHTML = ''
			if (liveSources.length === 0) {
				listEl.innerHTML = '<p class="sources-empty">No live sources (check channel config)</p>'
			} else {
				liveSources.forEach((s) => {
					const metaParts = []
					if (s.resolution) metaParts.push(s.resolution)
					if (s.fps) metaParts.push(`${s.fps}fps`)
					const meta = metaParts.join(' · ')
					const el = document.createElement('div')
					el.className = 'source-item source-item--live'
					el.dataset.sourceValue = s.value
					el.innerHTML = `
						<span class="source-item__icon">${iconFor('route')}</span>
						<span class="source-item__label" title="${escapeHtml(s.label + (meta ? ' — ' + meta : ''))}">${escapeHtml(s.label)}</span>
						${meta ? `<span class="source-item__meta">${escapeHtml(meta)}</span>` : ''}
					`
					const dragExtra = {}
					if (s.resolution) dragExtra.resolution = s.resolution
					if (s.fps) dragExtra.fps = s.fps
					if (s.routeType) dragExtra.routeType = s.routeType
					if (s.screenIdx != null) dragExtra.screenIdx = s.screenIdx
					makeDraggable(el, s.type, s.value, s.label, dragExtra)
					listEl.appendChild(el)
				})
			}
		} else {
			searchWrap.style.display = 'block'
			listEl.classList.remove('sources-media-list')
			if (mediaFooter) mediaFooter.style.display = 'none'
			const items = timelines.map((t) => ({ id: t.id || t.name, label: t.name || t.id || 'Untitled' }))
			renderSourceList(listEl, items, 'timeline', filter, null) // timelines: no preview
		}
	}

	tabs.forEach((tab) => {
		tab.addEventListener('click', () => {
			currentTab = tab.dataset.srcTab
			tabs.forEach((t) => t.classList.remove('active'))
			tab.classList.add('active')
			filter = ''
			if (filterInput) filterInput.value = ''
			if (currentTab === 'media') fetchMediaWithProbe()
			render()
		})
	})

	filterInput?.addEventListener('input', () => {
		filter = filterInput.value.trim()
		render()
	})

	async function handleRefreshMedia() {
		try {
			await api.post('/api/media/refresh')
			await fetchMediaWithProbe()
		} catch (e) {
			console.warn('Refresh media failed:', e?.message || e)
		}
	}
	refreshBtn?.addEventListener('click', () => handleRefreshMedia())

	stateStore.on('*', () => render())
	timelineState.on('change', () => render())
	render()
	// Fetch media with probe data for metadata (extension, resolution, duration, fps)
	if (currentTab === 'media') fetchMediaWithProbe()
}
