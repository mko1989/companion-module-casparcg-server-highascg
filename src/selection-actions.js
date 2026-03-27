/**
 * Companion actions: adjust Web UI selection (MIXER FILL / timeline keyframes).
 * @see main_plan.md FEAT-2
 */
'use strict'

const AXIS_CHOICES = [
	{ id: 'pos_x', label: 'Position X' },
	{ id: 'pos_y', label: 'Position Y' },
	{ id: 'size_w', label: 'Size / width (or scale X on timeline)' },
	{ id: 'size_h', label: 'Size / height (or scale Y on timeline)' },
]

const UNIT_CHOICES = [
	{ id: 'pixel', label: 'Pixels (dashboard layer & multiview cells)' },
	{ id: 'normalized', label: 'Normalized (timeline clip fill/scale, ~0–1)' },
]

/**
 * @param {object} self - module instance
 */
function getSelectionActions(self) {
	const { applyUiSelectionAdjust, toggleUiSelectionAspectLock } = require('./ui-selection')
	return {
		SELECTED_ADJUST: {
			name: 'UI selection: nudge position or size',
			options: [
				{ label: 'Axis', type: 'dropdown', id: 'axis', default: 'pos_x', choices: AXIS_CHOICES },
				{
					label: 'Delta',
					type: 'textinput',
					id: 'delta',
					default: '2',
					useVariables: true,
					tooltip: 'Pixels for dashboard/multiview. For timeline use small values (e.g. 0.005) with Normalized unit.',
				},
				{ label: 'Unit', type: 'dropdown', id: 'unit', default: 'pixel', choices: UNIT_CHOICES },
			],
			callback: async (action) => {
				const axis = action.options.axis || 'pos_x'
				const raw = await self.parseVariablesInString(String(action.options.delta ?? '0'))
				const delta = parseFloat(raw)
				const unit = action.options.unit === 'normalized' ? 'normalized' : 'pixel'
				await applyUiSelectionAdjust(self, axis, delta, unit)
			},
		},
		SELECTED_ASPECT_LOCK_TOGGLE: {
			name: 'UI selection: toggle aspect lock',
			options: [],
			callback: () => toggleUiSelectionAspectLock(self),
		},
	}
}

module.exports = { getSelectionActions }
