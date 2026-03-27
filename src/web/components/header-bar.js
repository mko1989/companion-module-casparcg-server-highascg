/**
 * Header bar with project name, Save, Load, server config comparison strip.
 * @see main_plan.md Prompt 20, FEAT-1
 */

import { projectState } from '../lib/project-state.js'
import { dashboardState } from '../lib/dashboard-state.js'
import { timelineState } from '../lib/timeline-state.js'
import { multiviewState } from '../lib/multiview-state.js'
import { api } from '../lib/api-client.js'

/**
 * @param {HTMLElement} headerEl - Header element (contains title + status)
 * @param {HTMLElement} statusEl - Status/ws area
 * @param {import('../lib/state-store.js').StateStore} [stateStore] - for configComparison updates
 */
export function initHeaderBar(headerEl, statusEl, stateStore) {
	const titleEl = headerEl.querySelector('.header__title')
	if (!titleEl) return

	// Project name (editable)
	const nameWrap = document.createElement('div')
	nameWrap.className = 'header-project'
	const nameInp = document.createElement('input')
	nameInp.className = 'header-project__name'
	nameInp.type = 'text'
	nameInp.placeholder = 'Project name'
	nameInp.value = projectState.getProjectName()
	nameInp.title = 'Project name'
	nameInp.addEventListener('change', () => {
		projectState.setProjectName(nameInp.value)
	})
	nameInp.addEventListener('blur', () => {
		projectState.setProjectName(nameInp.value)
	})
	nameWrap.appendChild(nameInp)

	// Save / Load buttons
	const saveBtn = document.createElement('button')
	saveBtn.className = 'header-btn'
	saveBtn.textContent = 'Save'
	saveBtn.title = 'Save project'
	const loadBtn = document.createElement('button')
	loadBtn.className = 'header-btn'
	loadBtn.textContent = 'Load'
	loadBtn.title = 'Load project'

	const fileInput = document.createElement('input')
	fileInput.type = 'file'
	fileInput.accept = '.json,application/json'
	fileInput.style.display = 'none'

	async function saveToServer() {
		const project = projectState.exportProject(dashboardState, timelineState, multiviewState)
		try {
			await api.post('/api/project/save', { project })
			alert('Saved to server')
		} catch (e) {
			alert('Save failed: ' + (e?.message || e))
		}
	}

	function saveToFile() {
		const project = projectState.exportProject(dashboardState, timelineState, multiviewState)
		const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = (project.name || 'project').replace(/\s+/g, '_') + '.json'
		a.click()
		URL.revokeObjectURL(url)
	}

	async function loadFromServer() {
		try {
			const res = await api.post('/api/project/load', {})
			// API returns project directly on 200, or { error } on 4xx
			const project = res && typeof res === 'object' && res.version && !res.error ? res : null
			if (!project) throw new Error(res?.error || 'No project stored')
			projectState.importProject(project, dashboardState, timelineState, multiviewState)
			nameInp.value = projectState.getProjectName()
			window.dispatchEvent(new Event('project-loaded'))
			alert('Loaded from server')
		} catch (e) {
			alert('Load failed: ' + (e?.message || e))
		}
	}

	function loadFromFile(file) {
		const r = new FileReader()
		r.onload = () => {
			try {
				const project = JSON.parse(r.result)
				projectState.importProject(project, dashboardState, timelineState, multiviewState)
				nameInp.value = projectState.getProjectName()
				window.dispatchEvent(new Event('project-loaded'))
			} catch (e) {
				alert('Invalid project file: ' + (e?.message || e))
			}
		}
		r.readAsText(file)
	}

	saveBtn.addEventListener('click', (e) => {
		if (e.shiftKey) saveToServer()
		else saveToFile()
	})
	saveBtn.title = 'Save: click = download file, Shift+click = save to server'

	loadBtn.addEventListener('click', (e) => {
		if (e.shiftKey) loadFromServer()
		else fileInput.click()
	})
	loadBtn.title = 'Load: click = upload file, Shift+click = load from server'

	fileInput.addEventListener('change', () => {
		const f = fileInput.files?.[0]
		if (f) loadFromFile(f)
		fileInput.value = ''
	})

	// Server config vs module (FEAT-1)
	const serverBtn = document.createElement('button')
	serverBtn.type = 'button'
	serverBtn.className = 'header-btn header-btn--server'
	serverBtn.textContent = 'Server ▾'
	serverBtn.title = 'Compare running CasparCG config with module screen settings'

	const strip = document.createElement('div')
	strip.className = 'server-config-strip'
	strip.hidden = true
	strip.innerHTML = `
		<div class="server-config-strip__summary"></div>
		<table class="server-config-strip__table"><thead><tr><th>#</th><th>Module expects</th><th>Server</th></tr></thead><tbody></tbody></table>
		<ul class="server-config-strip__issues"></ul>
		<p class="server-config-strip__hint"></p>
	`
	if (headerEl.parentNode) headerEl.parentNode.insertBefore(strip, headerEl.nextSibling)

	const sumEl = strip.querySelector('.server-config-strip__summary')
	const tbody = strip.querySelector('.server-config-strip__table tbody')
	const issuesEl = strip.querySelector('.server-config-strip__issues')
	const hintEl = strip.querySelector('.server-config-strip__hint')

	function renderConfigComparison(c) {
		if (!c || !sumEl) return
		if (c.aligned) {
			sumEl.textContent = `Server config matches module settings (${c.serverChannelCount} channels).`
			sumEl.className = 'server-config-strip__summary server-config-strip__summary--ok'
		} else if (!c.serverChannelCount) {
			sumEl.textContent = 'Connect to CasparCG or wait for INFO CONFIG to compare channel layout.'
			sumEl.className = 'server-config-strip__summary server-config-strip__summary--warn'
		} else {
			sumEl.textContent = `Mismatch: server has ${c.serverChannelCount} channel(s), module expects ${c.moduleChannelCount}.`
			sumEl.className = 'server-config-strip__summary server-config-strip__summary--warn'
		}
		tbody.innerHTML = ''
		const rows = Math.max(c.serverChannels?.length || 0, c.moduleChannels?.length || 0)
		for (let i = 0; i < rows; i++) {
			const s = c.serverChannels?.[i]
			const m = c.moduleChannels?.[i]
			const tr = document.createElement('tr')
			tr.innerHTML = `<td>${s?.index ?? m?.index ?? i + 1}</td><td>${m ? `${m.role}: ${m.videoMode || '—'}` : '—'}</td><td>${s ? `${s.videoMode || '—'}${s.hasScreen ? ' (screen)' : ''}` : '—'}</td>`
			tbody.appendChild(tr)
		}
		issuesEl.innerHTML = ''
		;(c.issues || []).forEach((msg) => {
			const li = document.createElement('li')
			li.textContent = msg
			issuesEl.appendChild(li)
		})
		hintEl.textContent = c.hint || ''
	}

	serverBtn.addEventListener('click', () => {
		strip.hidden = !strip.hidden
		serverBtn.textContent = strip.hidden ? 'Server ▾' : 'Server ▴'
	})

	if (stateStore) {
		const apply = () => {
			const c = stateStore.getState()?.configComparison
			if (c) renderConfigComparison(c)
		}
		stateStore.on('*', apply)
		stateStore.on('configComparison', apply)
		apply()
	}

	// Layout: [title] [project name] [Save] [Load] [Server] ... [status]
	headerEl.insertBefore(nameWrap, statusEl)
	headerEl.insertBefore(saveBtn, statusEl)
	headerEl.insertBefore(loadBtn, statusEl)
	headerEl.insertBefore(serverBtn, statusEl)

	projectState.on('change', () => {
		nameInp.value = projectState.getProjectName()
	})
}
