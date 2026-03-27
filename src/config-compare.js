/**
 * Compare CasparCG INFO CONFIG (running server) with module Companion config expectations.
 * @see main_plan.md FEAT-1
 */
'use strict'

const { parseString } = require('xml2js')
const { getChannelMap } = require('./routing')
const { getModeDimensions } = require('./config-generator')

/**
 * @param {string} xmlStr - INFO CONFIG XML
 * @returns {Promise<Array<{ index: number, videoMode: string, hasScreen: boolean }>>}
 */
function parseServerChannels(xmlStr) {
	return new Promise((resolve) => {
		if (!xmlStr || typeof xmlStr !== 'string') {
			resolve([])
			return
		}
		parseString(xmlStr, (err, result) => {
			if (err || !result) {
				resolve([])
				return
			}
			try {
				const channels = result.configuration?.channels?.[0]?.channel
				if (!Array.isArray(channels)) {
					resolve([])
					return
				}
				const out = channels.map((ch, i) => {
					const vm = ch['video-mode'] && ch['video-mode'][0] != null ? String(ch['video-mode'][0]) : ''
					const cons = ch.consumers?.[0]
					const screens = cons?.screen ? (Array.isArray(cons.screen) ? cons.screen : [cons.screen]) : []
					return {
						index: i + 1,
						videoMode: vm,
						hasScreen: screens.length > 0,
					}
				})
				resolve(out)
			} catch {
				resolve([])
			}
		})
	})
}

/**
 * Expected channels from module settings (same order as buildConfigXml).
 * @param {Record<string, unknown>} config
 */
function buildModuleChannelExpectation(config) {
	const cfg = config || {}
	const map = getChannelMap(cfg)
	const screenCount = map.screenCount
	const list = []
	for (let s = 1; s <= screenCount; s++) {
		const modeKey = String(cfg[`screen_${s}_mode`] || '1080p5000')
		const dims = getModeDimensions(modeKey, cfg, s)
		const modeId = dims.modeId
		list.push({ index: (s - 1) * 2 + 1, role: `Screen ${s} program`, videoMode: modeId, hasScreen: true })
		list.push({ index: (s - 1) * 2 + 2, role: `Screen ${s} preview`, videoMode: modeId, hasScreen: false })
	}
	if (map.multiviewCh != null) {
		const mvMode = String(cfg.multiview_mode || '1080p5000')
		list.push({ index: map.multiviewCh, role: 'Multiview', videoMode: mvMode, hasScreen: true })
	}
	if (map.inputsCh != null) {
		const inMode = String(cfg.inputs_channel_mode || '1080p5000')
		list.push({ index: map.inputsCh, role: 'DeckLink inputs', videoMode: inMode, hasScreen: false })
	}
	return list
}

/**
 * @param {Array} serverChannels
 * @param {Array} moduleChannels
 */
function buildIssues(serverChannels, moduleChannels) {
	const issues = []
	if (!serverChannels.length) {
		issues.push('No server channels parsed (empty INFO CONFIG or not connected yet).')
		return issues
	}
	if (serverChannels.length !== moduleChannels.length) {
		issues.push(
			`Channel count: server ${serverChannels.length} vs module settings ${moduleChannels.length} (screens/multiview/inputs).`
		)
	}
	const n = Math.min(serverChannels.length, moduleChannels.length)
	for (let i = 0; i < n; i++) {
		const s = serverChannels[i]
		const m = moduleChannels[i]
		const sv = (s.videoMode || '').trim()
		const mv = (m.videoMode || '').trim()
		if (sv && mv && sv !== mv) {
			issues.push(`Ch ${s.index} (${m.role}): server "${sv}" ≠ module "${mv}"`)
		}
	}
	return issues
}

/**
 * Compute comparison and store on instance; broadcast to web clients.
 * @param {object} self - module instance
 */
function refreshConfigComparison(self) {
	const xml = self.gatheredInfo?.infoConfig || ''
	const moduleChannels = buildModuleChannelExpectation(self.config || {})

	const done = (serverChannels) => {
		const issues = buildIssues(serverChannels, moduleChannels)
		const aligned =
			serverChannels.length > 0 &&
			serverChannels.length === moduleChannels.length &&
			issues.length === 0

		self._configComparison = {
			updatedAt: Date.now(),
			aligned,
			serverChannelCount: serverChannels.length,
			moduleChannelCount: moduleChannels.length,
			serverChannels,
			moduleChannels,
			issues,
			hint: 'To apply module screen settings to CasparCG, use Companion action "Apply server config and restart" (after setting filename/restart command in module config).',
		}

		if (self._wsBroadcast) {
			self._wsBroadcast('change', { path: 'configComparison', value: self._configComparison })
		}
	}

	if (!xml.trim()) {
		done([])
		return
	}

	parseServerChannels(xml).then(done).catch(() => done([]))
}

module.exports = {
	parseServerChannels,
	buildModuleChannelExpectation,
	refreshConfigComparison,
}
