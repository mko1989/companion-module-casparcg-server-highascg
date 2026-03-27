/**
 * Channel routing and decklink inputs management.
 * Setup functions for preview (black BG + route), inputs channel, multiview.
 * @see main_plan.md Prompt 9
 */

/**
 * Compute channel map from config.
 * Channel numbering: for each screen N: program = (N-1)*2+1, preview = (N-1)*2+2.
 * Then multiview (if enabled), then inputs (if decklink > 0).
 *
 * @param {Record<string, unknown>} config
 * @returns {{
 *   screenCount: number,
 *   multiviewEnabled: boolean,
 *   inputsEnabled: boolean,
 *   programCh: (n: number) => number,
 *   previewCh: (n: number) => number,
 *   multiviewCh: number | null,
 *   inputsCh: number | null
 * }}
 */
function getChannelMap(config) {
	const screenCount = Math.min(4, Math.max(1, parseInt(String(config?.screen_count || 1), 10) || 1))
	const multiviewEnabled = config?.multiview_enabled !== false && config?.multiview_enabled !== 'false'
	const decklinkCount = Math.min(8, Math.max(0, parseInt(String(config?.decklink_input_count || 0), 10) || 0))
	const inputsEnabled = decklinkCount > 0

	// Base: 2 channels per screen (program + preview)
	let nextCh = screenCount * 2 + 1
	const multiviewCh = multiviewEnabled ? nextCh++ : null
	const inputsCh = inputsEnabled ? nextCh : null

	const programChFn = (n) => (n - 1) * 2 + 1
	const previewChFn = (n) => (n - 1) * 2 + 2

	return {
		screenCount,
		multiviewEnabled,
		inputsEnabled,
		decklinkCount,
		programCh: programChFn,
		previewCh: previewChFn,
		programChannels: Array.from({ length: screenCount }, (_, i) => programChFn(i + 1)),
		previewChannels: Array.from({ length: screenCount }, (_, i) => previewChFn(i + 1)),
		multiviewCh,
		inputsCh,
	}
}

/**
 * Returns route string for use in PLAY commands.
 * @param {number} channel
 * @param {number} [layer] - omit for whole channel
 * @returns {string}
 */
function getRouteString(channel, layer) {
	if (layer !== undefined && layer !== null) {
		return `route://${channel}-${layer}`
	}
	return `route://${channel}`
}

/**
 * Route a source to a destination layer. Sends PLAY dst route://src.
 * @param {object} self - Module instance
 * @param {number} srcChannel - Source channel
 * @param {number} srcLayer - Source layer
 * @param {number} dstChannel - Destination channel
 * @param {number} dstLayer - Destination layer
 * @returns {Promise<{ ok: boolean, data?: unknown }>}
 */
async function routeToLayer(self, srcChannel, srcLayer, dstChannel, dstLayer) {
	const route = getRouteString(srcChannel, srcLayer)
	return self.amcp.play(dstChannel, dstLayer, route)
}

/**
 * Setup decklink inputs on the inputs channel.
 * Plays each configured input on inputs_ch-N.
 * Each physical DeckLink device can only be played once — duplicate device assignments are skipped.
 *
 * @param {object} self - Module instance
 * @returns {Promise<void>}
 */
async function setupInputsChannel(self) {
	const map = getChannelMap(self.config)
	if (!map.inputsEnabled || !map.inputsCh || !self.amcp) return

	const usedDevices = new Map() // device -> input index that claimed it
	const inputDevice = []
	const skippedDuplicates = []

	for (let i = 1; i <= map.decklinkCount; i++) {
		const device = parseInt(String(self.config[`decklink_input_${i}_device`] || i), 10) || i
		if (usedDevices.has(device)) {
			const firstUser = usedDevices.get(device)
			skippedDuplicates.push({ input: i, device, firstUser })
			self.log(
				'warn',
				`DeckLink input ${i}: device ${device} already in use by input ${firstUser}. Each physical device can only be played once — skipping. Use 1:1 mapping (input 1→device 1, input 2→device 2, etc.).`
			)
			continue
		}
		usedDevices.set(device, i)
		inputDevice.push({ layer: i, device })
	}

	const failed = []
	for (const { layer, device } of inputDevice) {
		try {
			await self.amcp.raw(`PLAY ${map.inputsCh}-${layer} DECKLINK ${device}`)
			self.log('debug', `DeckLink input ${layer} (device ${device}): OK`)
		} catch (e) {
			const msg = e?.message || String(e)
			// "Already playing" is normal on reconnect — the device is still live. Log at debug only.
			const isAlreadyPlaying = /already playing|404|PLAY FAILED/i.test(msg)
			if (isAlreadyPlaying) {
				self.log('debug', `DeckLink input ${layer} (device ${device}): already playing (reconnect) — OK`)
			} else {
				failed.push({ layer, device })
				const hint = ' Possible causes: device in use elsewhere, unsupported format, or not connected. Check inputs channel mode.'
				self.log('warn', `DeckLink input ${layer} (device ${device}): ${msg}${hint}`)
			}
		}
	}

	if (skippedDuplicates.length > 0 || failed.length > 0) {
		const parts = []
		if (skippedDuplicates.length > 0) parts.push(`${skippedDuplicates.length} skipped (duplicate device)`)
		if (failed.length > 0) parts.push(`${failed.length} failed`)
		self.log('info', `DeckLink setup summary: ${inputDevice.length - failed.length} of ${map.decklinkCount} inputs ready. ${parts.join(', ')}.`)
	}
}

/**
 * Setup preview channel for a screen: black BG on layer 10, preview route on layer 11.
 *
 * @param {object} self - Module instance
 * @param {number} screenIdx - 1-based screen index
 * @param {number} [programLayer] - Optional layer to preview; omit for whole program channel
 * @returns {Promise<void>}
 */
async function setupPreviewChannel(self, screenIdx, programLayer) {
	const map = getChannelMap(self.config)
	const previewCh = map.previewCh(screenIdx)
	const programCh = map.programCh(screenIdx)

	if (!self.amcp) return

	// Layer 10: black BG to cover timeline layers 1–9. Use black HTML template ([BLACK] not supported on some CasparCG builds).
	try {
		await self.amcp.cgAdd(previewCh, 10, 0, 'black', 1, '')
	} catch (e) {
		self.log('warn', `Preview ch ${previewCh} layer 10: black template failed. Deploy black.html to CasparCG template path (see HOW_TO_ACHIVE_MULTIVIEWER.MD).`)
	}
	// Layer 11: PRV preview — blank by default. User must explicitly: click a clip to preview, or set timeline to PRV output.
	await self.amcp.stop(previewCh, 11).catch(() => {})
}

/**
 * Setup multiview channel with routes from program, preview, and inputs.
 * Uses a simple default grid layout. Layout positions (x, y, w, h) are normalized 0–1.
 *
 * @param {object} self - Module instance
 * @param {Array<{ layer: number, x: number, y: number, w: number, h: number, source: string }>} [layout] - Optional custom layout
 * @returns {Promise<void>}
 */
async function setupMultiview(self, layout) {
	const map = getChannelMap(self.config)
	if (!map.multiviewEnabled || map.multiviewCh == null || !self.amcp) return

	// Default layout: 2x2 grid - program top-left, preview top-right, inputs bottom
	if (!layout || layout.length === 0) {
		const sources = []
		if (map.screenCount >= 1) {
			sources.push({ layer: 1, x: 0, y: 0, w: 0.5, h: 0.5, route: getRouteString(map.programCh(1)) })
			sources.push({ layer: 2, x: 0.5, y: 0, w: 0.5, h: 0.5, route: getRouteString(map.previewCh(1)) })
		}
		if (map.inputsEnabled && map.inputsCh) {
			for (let i = 1; i <= Math.min(map.decklinkCount, 2); i++) {
				sources.push({
					layer: 2 + i,
					x: (i - 1) * 0.5,
					y: 0.5,
					w: 0.5,
					h: 0.5,
					route: getRouteString(map.inputsCh, i),
				})
			}
		}
		layout = sources
	}

	const ch = map.multiviewCh
	for (const cell of layout) {
		await self.amcp.play(ch, cell.layer, cell.route || cell.source)
		await self.amcp.mixerFill(ch, cell.layer, cell.x, cell.y, cell.w, cell.h)
	}
	await self.amcp.mixerCommit(ch)
}

/**
 * Setup all routing: inputs channel, preview channels for each screen, multiview.
 * Call after connect when config has decklink inputs or multiview.
 *
 * @param {object} self - Module instance
 * @returns {Promise<void>}
 */
async function setupAllRouting(self) {
	const map = getChannelMap(self.config)

	const basePath = (self.config?.local_media_path || '').trim()
	if (basePath) {
		try {
			const fs = require('fs')
			const path = require('path')
			const overlayDest = path.join(basePath, 'multiview_overlay.html')
			const overlaySrc = path.join(__dirname, 'templates', 'multiview_overlay.html')
			if (fs.existsSync(overlaySrc) && !fs.existsSync(overlayDest)) {
				fs.copyFileSync(overlaySrc, overlayDest)
				self.log('info', `Deployed multiview_overlay.html to ${overlayDest}`)
			}
			const blackDest = path.join(basePath, 'black.html')
			if (!fs.existsSync(blackDest)) {
				fs.writeFileSync(blackDest, '<!DOCTYPE html><html><head><style>*{margin:0;padding:0}html,body{width:100%;height:100%;background:#000}</style></head><body></body></html>')
				self.log('info', `Deployed black.html to ${blackDest}`)
			}
		} catch (e) {
			self.log('debug', 'Auto-deploy templates: ' + (e?.message || e))
		}
	}

	if (map.inputsEnabled) {
		await setupInputsChannel(self)
	}

	for (let n = 1; n <= map.screenCount; n++) {
		try {
			await setupPreviewChannel(self, n)
		} catch (e) {
			self.log('warn', `Preview channel ${n} setup: ${e?.message || e}`)
		}
	}

	if (map.multiviewEnabled) {
		if (self._multiviewLayout) {
			try {
				const { handleMultiviewApply } = require('./api-routes')
				const result = await handleMultiviewApply(self._multiviewLayout, self)
				if (result?.status === 200) {
					self.log('debug', 'Multiview layout restored from last applied state')
				} else {
					self.log('warn', `Multiview layout restore returned ${result?.status}: ${JSON.stringify(result?.body || '')}`)
					await setupMultiview(self).catch((e2) => self.log('warn', `Multiview setup fallback: ${e2?.message || e2}`))
				}
			} catch (e) {
				self.log('warn', `Multiview layout restore: ${e?.message || e}`)
				await setupMultiview(self).catch((e2) => self.log('warn', `Multiview setup fallback: ${e2?.message || e2}`))
			}
		} else {
			try {
				await setupMultiview(self)
			} catch (e) {
				self.log('warn', `Multiview setup: ${e?.message || e}`)
			}
		}
	}
}

module.exports = {
	getChannelMap,
	getRouteString,
	routeToLayer,
	setupInputsChannel,
	setupPreviewChannel,
	setupMultiview,
	setupAllRouting,
}
