const { combineRgb } = require('@companion-module/base')

/**
 * @param {object} self - Module instance
 */
function initPresets(self) {
	self.setPresetDefinitions({
		refresh_vars: {
			type: 'button',
			category: 'Variables',
			name: 'Refresh variables',
			style: { text: 'Refresh\\nvariables', size: 'auto', color: combineRgb(255, 255, 255), bgcolor: combineRgb(50, 50, 100) },
			steps: [{ down: [{ actionId: 'REFRESH_VARIABLES', options: {} }], up: [] }],
		},
	})
}

/**
 * @param {object} self - Module instance
 */
function updateDynamicPresets(self) {
	const presets = {}
	const chIds = self.gatheredInfo.channelIds.length ? self.gatheredInfo.channelIds : [1]
	// Play media to channel/layer
	self.CHOICES_MEDIAFILES.slice(0, 30).forEach((choice, i) => {
		const clipId = choice.id || choice.label
		chIds.forEach((ch) => {
			['0', '1'].forEach((layer) => {
				const pid = `play_${i}_ch${ch}_l${layer}`
				presets[pid] = {
					type: 'button',
					category: 'Play media',
					name: `${clipId} → ${ch}-${layer}`,
					style: {
						text: `${clipId}\\n${ch}-${layer}`,
						size: 'auto',
						color: combineRgb(255, 255, 255),
						bgcolor: combineRgb(0, 100, 80),
					},
					steps: [{
						down: [{ actionId: 'PLAY', options: { channel: String(ch), layer, clip: '', clip_dd: clipId, loop: 'false', auto: 'false', transition: 'CUT', transition_duration: '', transition_tween: 'linear' } }],
						up: [],
					}],
					feedbacks: [
						{ feedbackId: 'program_tally', options: { channel: String(ch), layer, clip: clipId }, style: { bgcolor: combineRgb(200, 0, 0) } },
						{ feedbackId: 'preview_tally', options: { channel: String(ch), layer, clip: clipId }, style: { bgcolor: combineRgb(0, 150, 0) } },
					],
				}
			})
		})
	})
	// Transport: PLAY, STOP, PAUSE, RESUME, CLEAR per channel-layer
	chIds.forEach((ch) => {
		['0', '1'].forEach((layer) => {
			presets[`stop_${ch}_${layer}`] = {
				type: 'button',
				category: 'Transport',
				name: `STOP ${ch}-${layer}`,
				style: { text: `STOP\\n${ch}-${layer}`, size: 'auto', color: combineRgb(255, 255, 255), bgcolor: combineRgb(180, 60, 60) },
				steps: [{ down: [{ actionId: 'STOP', options: { channel: String(ch), layer } }], up: [] }],
			}
			presets[`clear_${ch}_${layer}`] = {
				type: 'button',
				category: 'Transport',
				name: `CLEAR ${ch}-${layer}`,
				style: { text: `CLEAR\\n${ch}-${layer}`, size: 'auto', color: combineRgb(255, 255, 255), bgcolor: combineRgb(80, 80, 80) },
				steps: [{ down: [{ actionId: 'CLEAR', options: { channel: String(ch), layer } }], up: [] }],
			}
		})
	})
	// Routing: ADD/REMOVE consumer per channel
	chIds.forEach((ch) => {
		;[
			{ cmd: `ADD ${ch} SCREEN`, name: `ADD SCREEN Ch ${ch}`, cat: 'Routing' },
			{ cmd: `REMOVE ${ch} SCREEN`, name: `REMOVE SCREEN Ch ${ch}`, cat: 'Routing' },
			{ cmd: `ADD ${ch} DECKLINK 1`, name: `ADD DECKLINK 1 Ch ${ch}`, cat: 'Routing' },
			{ cmd: `REMOVE ${ch} DECKLINK 1`, name: `REMOVE DECKLINK 1 Ch ${ch}`, cat: 'Routing' },
		].forEach((r, i) => {
			presets[`route_${ch}_${i}`] = {
				type: 'button',
				category: r.cat,
				name: r.name,
				style: { text: r.name.replace(/ Ch \d+$/, ''), size: 'auto', color: combineRgb(255, 255, 255), bgcolor: combineRgb(70, 70, 120) },
				steps: [{ down: [{ actionId: 'COMMAND', options: { cmd: r.cmd } }], up: [] }],
			}
		})
	})
	// Parameters: SEEK, LOOP, MIXER FILL (full screen) per channel-layer
	chIds.forEach((ch) => {
		['0', '1'].forEach((layer) => {
			presets[`seek0_${ch}_${layer}`] = {
				type: 'button',
				category: 'Parameters',
				name: `SEEK 0 ${ch}-${layer}`,
				style: { text: `SEEK 0\\n${ch}-${layer}`, size: 'auto', color: combineRgb(255, 255, 255), bgcolor: combineRgb(80, 80, 80) },
				steps: [{ down: [{ actionId: 'CALL', options: { channel: String(ch), layer, method: 'SEEK 0' } }], up: [] }],
			}
			presets[`loop1_${ch}_${layer}`] = {
				type: 'button',
				category: 'Parameters',
				name: `LOOP 1 ${ch}-${layer}`,
				style: { text: `LOOP 1\\n${ch}-${layer}`, size: 'auto', color: combineRgb(255, 255, 255), bgcolor: combineRgb(60, 80, 60) },
				steps: [{ down: [{ actionId: 'CALL', options: { channel: String(ch), layer, method: 'LOOP 1' } }], up: [] }],
			}
			presets[`fill_${ch}_${layer}`] = {
				type: 'button',
				category: 'Parameters',
				name: `FILL 0 0 1 1 ${ch}-${layer}`,
				style: { text: `FILL full\\n${ch}-${layer}`, size: 'auto', color: combineRgb(255, 255, 255), bgcolor: combineRgb(60, 60, 80) },
				steps: [{ down: [{ actionId: 'COMMAND', options: { cmd: `MIXER ${ch}-${layer} FILL 0 0 1 1` } }], up: [] }],
			}
		})
	})
	// Refresh + manual
	presets.refresh_vars = {
		type: 'button',
		category: 'Variables',
		name: 'Refresh variables',
		style: { text: 'Refresh\\nvariables', size: 'auto', color: combineRgb(255, 255, 255), bgcolor: combineRgb(50, 50, 100) },
		steps: [{ down: [{ actionId: 'REFRESH_VARIABLES', options: {} }], up: [] }],
	}
	presets.manual_clear1 = {
		type: 'button',
		category: 'Manual',
		name: 'CLEAR 1',
		style: { text: 'CLEAR 1', size: 'auto', color: combineRgb(255, 255, 255), bgcolor: combineRgb(60, 60, 60) },
		steps: [{ down: [{ actionId: 'COMMAND', options: { cmd: 'CLEAR 1' } }], up: [] }],
	}
	presets.apply_server_config = {
		type: 'button',
		category: 'Server config',
		name: 'Apply server config and restart',
		style: { text: 'Apply config\\n& restart', size: 'auto', color: combineRgb(255, 255, 255), bgcolor: combineRgb(120, 80, 40) },
		steps: [{ down: [{ actionId: 'APPLY_SERVER_CONFIG', options: {} }], up: [] }],
	}
	self.setPresetDefinitions(presets)
}

module.exports = { initPresets, updateDynamicPresets }
