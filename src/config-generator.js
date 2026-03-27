/**
 * CasparCG config XML generator.
 * Builds full <configuration> XML from structured screen parameters.
 */

/** @type {Record<string, { width: number, height: number, fps: number }>} */
const STANDARD_VIDEO_MODES = {
	PAL: { width: 720, height: 576, fps: 25 },
	NTSC: { width: 720, height: 486, fps: 29.97 },
	'576p2500': { width: 720, height: 576, fps: 25 },
	'720p2398': { width: 1280, height: 720, fps: 23.98 },
	'720p2400': { width: 1280, height: 720, fps: 24 },
	'720p2500': { width: 1280, height: 720, fps: 25 },
	'720p5000': { width: 1280, height: 720, fps: 50 },
	'720p2997': { width: 1280, height: 720, fps: 29.97 },
	'720p5994': { width: 1280, height: 720, fps: 59.94 },
	'720p3000': { width: 1280, height: 720, fps: 30 },
	'720p6000': { width: 1280, height: 720, fps: 60 },
	'1080p2398': { width: 1920, height: 1080, fps: 23.98 },
	'1080p2400': { width: 1920, height: 1080, fps: 24 },
	'1080p2500': { width: 1920, height: 1080, fps: 25 },
	'1080p5000': { width: 1920, height: 1080, fps: 50 },
	'1080p2997': { width: 1920, height: 1080, fps: 29.97 },
	'1080p5994': { width: 1920, height: 1080, fps: 59.94 },
	'1080p3000': { width: 1920, height: 1080, fps: 30 },
	'1080p6000': { width: 1920, height: 1080, fps: 60 },
	'1080i5000': { width: 1920, height: 1080, fps: 50 },
	'1080i5994': { width: 1920, height: 1080, fps: 59.94 },
	'1080i6000': { width: 1920, height: 1080, fps: 60 },
	'1556p2398': { width: 2048, height: 1556, fps: 23.98 },
	'1556p2400': { width: 2048, height: 1556, fps: 24 },
	'1556p2500': { width: 2048, height: 1556, fps: 25 },
	'2160p2398': { width: 3840, height: 2160, fps: 23.98 },
	'2160p2400': { width: 3840, height: 2160, fps: 24 },
	'2160p2500': { width: 3840, height: 2160, fps: 25 },
	'2160p2997': { width: 3840, height: 2160, fps: 29.97 },
	'2160p3000': { width: 3840, height: 2160, fps: 30 },
	'2160p5000': { width: 3840, height: 2160, fps: 50 },
	'2160p5994': { width: 3840, height: 2160, fps: 59.94 },
	'2160p6000': { width: 3840, height: 2160, fps: 60 },
	'dci1080p2398': { width: 2048, height: 1080, fps: 23.98 },
	'dci1080p2400': { width: 2048, height: 1080, fps: 24 },
	'dci1080p2500': { width: 2048, height: 1080, fps: 25 },
	'dci2160p2398': { width: 4096, height: 2160, fps: 23.98 },
	'dci2160p2400': { width: 4096, height: 2160, fps: 24 },
	'dci2160p2500': { width: 4096, height: 2160, fps: 25 },
}

/**
 * @param {number} fps
 * @returns {number}
 */
function calculateCadence(fps) {
	return Math.round(48000 / fps)
}

/**
 * @param {string} modeId
 * @param {Record<string, unknown>} config
 * @param {number} screenIdx - 1-based screen index
 * @returns {{ width: number, height: number, fps: number, modeId: string, isCustom: boolean }}
 */
function getModeDimensions(modeId, config, screenIdx) {
	if (modeId === 'custom') {
		const w = parseInt(String(config[`screen_${screenIdx}_custom_width`] || '1920'), 10) || 1920
		const h = parseInt(String(config[`screen_${screenIdx}_custom_height`] || '1080'), 10) || 1080
		const fps = parseFloat(String(config[`screen_${screenIdx}_custom_fps`] || '50')) || 50
		return { width: w, height: h, fps, modeId: `${w}x${h}`, isCustom: true }
	}
	const std = STANDARD_VIDEO_MODES[modeId]
	if (std) return { ...std, modeId, isCustom: false }
	// Fallback for unknown standard mode
	return { width: 1920, height: 1080, fps: 50, modeId: modeId || '1080p5000', isCustom: false }
}

/**
 * @param {Record<string, unknown>} config
 * @returns {string}
 */
function buildConfigXml(config) {
	const screenCount = Math.min(4, Math.max(1, parseInt(String(config.screen_count || 1), 10) || 1))
	const multiviewEnabled = config.multiview_enabled !== false && config.multiview_enabled !== 'false'
	const decklinkCount = Math.min(8, Math.max(0, parseInt(String(config.decklink_input_count || 0), 10) || 0))
	const inputsEnabled = decklinkCount > 0

	const channelsXml = []
	const customVideoModes = []
	let cumulativeX = 0
	let nextDevice = 1

	for (let n = 1; n <= screenCount; n++) {
		const mode = String(config[`screen_${n}_mode`] || '1080p5000')
		const dims = getModeDimensions(mode, config, n)
		const stretch = ['none', 'fill', 'uniform', 'uniform_to_fill'].includes(String(config[`screen_${n}_stretch`] || 'none'))
			? String(config[`screen_${n}_stretch`])
			: 'none'
		const windowed = config[`screen_${n}_windowed`] !== false && config[`screen_${n}_windowed`] !== 'false'
		const vsync = config[`screen_${n}_vsync`] !== false && config[`screen_${n}_vsync`] !== 'false'
		const alwaysOnTop = config[`screen_${n}_always_on_top`] !== false && config[`screen_${n}_always_on_top`] !== 'false'
		const borderless = config[`screen_${n}_borderless`] === true || config[`screen_${n}_borderless`] === 'true'

		// Program channel (with screen consumer)
		const screenXml = [
			`<device>${nextDevice}</device>`,
			`<x>${cumulativeX}</x><y>0</y>`,
			`<width>${dims.width}</width><height>${dims.height}</height>`,
			`<stretch>${stretch}</stretch>`,
			`<windowed>${windowed}</windowed>`,
			`<vsync>${vsync}</vsync>`,
			`<always-on-top>${alwaysOnTop}</always-on-top>`,
			`<borderless>${borderless}</borderless>`,
		].join('\n                    ')
		channelsXml.push(
			`        <channel>
            <video-mode>${dims.modeId}</video-mode>
            <consumers>
                <screen>
                    ${screenXml}
                </screen>
            </consumers>
        </channel>`
		)
		cumulativeX += dims.width
		nextDevice++

		// Preview channel (same video-mode, empty consumers)
		channelsXml.push(
			`        <channel>
            <video-mode>${dims.modeId}</video-mode>
            <consumers/>
        </channel>`
		)

		if (dims.isCustom) {
			const timeScale = Math.round(dims.fps * 1000)
			const cadence = calculateCadence(dims.fps)
			customVideoModes.push(
				`        <video-mode>
            <id>${dims.modeId}</id>
            <width>${dims.width}</width>
            <height>${dims.height}</height>
            <time-scale>${timeScale}</time-scale>
            <duration>1000</duration>
            <cadence>${cadence}</cadence>
        </video-mode>`
			)
		}
	}

	if (multiviewEnabled) {
		const mode = String(config.multiview_mode || '1080p5000')
		const dims = STANDARD_VIDEO_MODES[mode] || { width: 1920, height: 1080, fps: 50 }
		const modeId = mode
		const stretch = 'none'
		const windowed = true
		const vsync = true
		const borderless = false
		const screenXml = [
			`<device>${nextDevice}</device>`,
			`<x>${cumulativeX}</x><y>0</y>`,
			`<width>${dims.width}</width><height>${dims.height}</height>`,
			`<stretch>${stretch}</stretch>`,
			`<windowed>${windowed}</windowed>`,
			`<vsync>${vsync}</vsync>`,
			`<borderless>${borderless}</borderless>`,
		].join('\n                    ')
		channelsXml.push(
			`        <channel>
            <video-mode>${modeId}</video-mode>
            <consumers>
                <screen>
                    ${screenXml}
                </screen>
            </consumers>
        </channel>`
		)
	}

	// Inputs channel (no consumer) — decklink inputs played here, routable via route://
	if (decklinkCount > 0) {
		const mode = String(config.inputs_channel_mode || '1080p5000')
		const modeId = STANDARD_VIDEO_MODES[mode] ? mode : '1080p5000'
		channelsXml.push(
			`        <channel>
            <video-mode>${modeId}</video-mode>
            <consumers/>
        </channel>`
		)
	}

	const videoModesXml =
		customVideoModes.length > 0
			? `    <video-modes>
${customVideoModes.join('\n')}
    </video-modes>`
			: '    <video-modes/>'

	const oscPort = parseInt(String(config.osc_port || '0'), 10) || 0
	const oscXml = oscPort > 0 ? `    <osc><port>${oscPort}</port></osc>` : ''
	const controllersXml = `    <controllers><tcp><port>5250</port><protocol>AMCP</protocol></tcp>
    </controllers>`

	return `<configuration>
    <paths>
        <media-path>media/</media-path>
        <log-path disable="false">log/</log-path>
        <data-path>media/</data-path>
        <template-path>media/</template-path>
    </paths>
    <lock-clear-phrase>secret</lock-clear-phrase>
    <channels>
${channelsXml.join('\n')}
    </channels>
${videoModesXml}
${controllersXml}
${oscXml}
    <amcp><media-server><host>localhost</host><port>8000</port></media-server></amcp>
    <ndi><auto-load>false</auto-load></ndi>
    <decklink/>
    <html><enable-gpu>false</enable-gpu></html>
</configuration>`
}

/**
 * @returns {Array<{ id: string, label: string }>}
 */
function getStandardModeChoices() {
	const custom = { id: 'custom', label: 'Custom resolution' }
	const modes = Object.keys(STANDARD_VIDEO_MODES).map((id) => ({
		id,
		label: id,
	}))
	return [custom, ...modes]
}

module.exports = {
	buildConfigXml,
	getStandardModeChoices,
	STANDARD_VIDEO_MODES,
	calculateCadence,
	getModeDimensions,
}
