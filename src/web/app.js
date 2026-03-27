/**
 * CasparCG Web Client — main app entry.
 * Connects via WebSocket for real-time state, shows layout shell.
 * @see main_plan.md Prompt 11
 */

import { WsClient } from './lib/ws-client.js'
import { api } from './lib/api-client.js'
import StateStore from './lib/state-store.js'
import { initSourcesPanel } from './components/sources-panel.js'
import { dashboardState } from './lib/dashboard-state.js'
import { initDashboard } from './components/dashboard.js'
import { initTimelineEditor } from './components/timeline-editor.js'
import { initInspectorPanel } from './components/inspector-panel.js'
import { initMultiviewEditor } from './components/multiview-editor.js'
import { initHeaderBar } from './components/header-bar.js'
import { multiviewState } from './lib/multiview-state.js'

export const stateStore = new StateStore()

const statusDot = document.getElementById('status-dot')
const statusText = document.getElementById('status-text')

function updateConnectionStatus(connected, error, isLive = false) {
	if (connected) {
		statusDot.classList.remove('disconnected', 'error')
		statusDot.classList.add('connected')
		statusText.textContent = isLive ? 'Connected (live)' : 'Connected'
	} else if (error) {
		statusDot.classList.remove('connected')
		statusDot.classList.add('error')
		statusText.textContent = error
	} else {
		statusDot.classList.remove('connected', 'error')
		statusDot.classList.add('disconnected')
		statusText.textContent = 'Connecting…'
	}
}

function initPanelResize() {
	const handle = document.getElementById('resize-sources')
	const panel = document.getElementById('panel-sources')
	if (!handle || !panel) return
	const root = document.documentElement
	const minW = 220
	const maxW = 520
	handle.addEventListener('mousedown', (e) => {
		if (e.button !== 0) return
		e.preventDefault()
		const startX = e.clientX
		const startW = panel.getBoundingClientRect().width
		const onMove = (ev) => {
			const dx = ev.clientX - startX
			const w = Math.max(minW, Math.min(maxW, startW + dx))
			root.style.setProperty('--sources-panel-w', `${w}px`)
		}
		const onUp = () => {
			document.removeEventListener('mousemove', onMove)
			document.removeEventListener('mouseup', onUp)
			document.body.style.cursor = ''
			document.body.style.userSelect = ''
		}
		document.body.style.cursor = 'col-resize'
		document.body.style.userSelect = 'none'
		document.addEventListener('mousemove', onMove)
		document.addEventListener('mouseup', onUp)
	})
}

function initTabs() {
	const tabs = document.querySelectorAll('.tab')
	const panes = document.querySelectorAll('.tab-pane')
	tabs.forEach((tab) => {
		tab.addEventListener('click', () => {
			const target = tab.dataset.tab
			tabs.forEach((t) => t.classList.remove('active'))
			panes.forEach((p) => {
				p.classList.toggle('active', p.id === `tab-${target}`)
			})
			tab.classList.add('active')
			if (target === 'dashboard') {
				requestAnimationFrame(() => document.dispatchEvent(new CustomEvent('dashboard-tab-activated')))
			}
			if (target === 'multiview') {
				requestAnimationFrame(() => document.dispatchEvent(new CustomEvent('mv-tab-activated')))
			}
			if (target === 'timeline') {
				requestAnimationFrame(() => document.dispatchEvent(new CustomEvent('timeline-tab-activated')))
			}
		})
	})
}

async function init() {
	initTabs()
	initPanelResize()
	const header = document.querySelector('.header')
	const statusEl = document.querySelector('.header__status')
	if (header && statusEl) initHeaderBar(header, statusEl, stateStore)
	initSourcesPanel(document.querySelector('#panel-sources .panel__body'), stateStore)
	initDashboard(document.querySelector('#tab-dashboard'), stateStore)
	initTimelineEditor(document.querySelector('#tab-timeline'), stateStore)
	initMultiviewEditor(document.querySelector('#tab-multiview'), stateStore)
	initInspectorPanel(document.getElementById('panel-inspector-body') || document.querySelector('#panel-inspector .panel__body'), stateStore)

	// Bootstrap state from API (works with Companion HTTP when api_port=0)
	let httpConnected = false
	try {
		const state = await api.get('/api/state')
		if (state && typeof state === 'object') {
			stateStore.setState(state)
			dashboardState.setCanvasResolutions(state.channelMap?.programResolutions)
			httpConnected = true
			updateConnectionStatus(true)
		}
	} catch {
		// API not available, state remains empty
	}

	// WebSocket: only available when api_port > 0 (standalone server).
	// When api_port=0 (Companion HTTP only), WS will fail — that's fine; HTTP already works.
	const ws = new WsClient()
	ws.on('state', (data) => {
		stateStore.setState(data)
		if (data?.channelMap?.programResolutions)
			dashboardState.setCanvasResolutions(data.channelMap.programResolutions)
		updateConnectionStatus(true, null, true)
	})
	ws.on('change', (data) => {
		if (data && data.path != null) stateStore.applyChange(data.path, data.value)
	})
	ws.on('timeline.tick', (data) => stateStore.applyChange('timeline.tick', data))
	ws.on('timeline.playback', (pb) => stateStore.applyChange('timeline.playback', pb))
	ws.on('connect', () => {
		updateConnectionStatus(true, null, true)
		const cells = multiviewState.getCells()
		if (cells.length > 0) {
			ws.send({
				type: 'multiview_sync',
				data: {
					layout: multiviewState.toApiLayout(),
					showOverlay: multiviewState.showOverlay,
				},
			})
		}
	})
	ws.on('disconnect', () => {
		if (httpConnected) updateConnectionStatus(true)
		else updateConnectionStatus(false)
	})
	ws.on('error', () => {
		if (httpConnected) updateConnectionStatus(true)
		else updateConnectionStatus(false, 'WebSocket error')
	})
}

init()
