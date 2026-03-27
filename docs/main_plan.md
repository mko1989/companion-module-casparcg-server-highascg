# CasparCG Companion Module — Main Plan

## Bug Fixes

### BUG-1: Multiviewer resets to default values on reconnection
- **Problem:** When the backend reconnects to CasparCG, `setupAllRouting()` in `routing.js` sends MIXER FILL commands with default layout positions, overwriting whatever the user had arranged.
  - `self._multiviewLayout` is only set when the user explicitly clicks "Apply" in the web UI. If they never applied (or persistence was cleared), the backend falls back to the default 2×2 grid.
  - Even when `_multiviewLayout` is set, a reconnect re-applies from persistence — but the web UI's localStorage layout may have diverged since the last Apply.
- **Fix:** On connection, the backend should request the current layout from the web UI (via WebSocket) or at minimum preserve the last-applied layout reliably. The web UI should also sync its layout to the backend on connect.
- **Files:** `routing.js` (setupAllRouting, setupMultiview), `api-routes.js` (handleMultiviewApply), `index.js` (init, _multiviewLayout), `persistence.js`

### BUG-2: Preview labels in WebUI are smaller than final output
- **Problem:** The multiview editor canvas scales cells to fit in the browser container (`scale = Math.min(sx, sy, 1)`). Font sizes for labels are drawn in canvas-scaled coordinates, but on the actual CasparCG output the overlay HTML template renders at native resolution. This mismatch makes it hard to judge whether sources overlap.
- **Fix:** Label font sizes in the canvas should be proportional to the cell's actual output size, not the viewport-scaled size. Draw labels at a size that matches the ratio they'll appear on output.
- **Files:** `web/components/multiview-editor.js` (draw function, label rendering)

### BUG-3: Content display — "none" stretch mode is not pixel-accurate
- **Problem:** `calcMixerFill()` in `inspector-panel.js` implements `stretch: 'none'` as uniform fit (`fitScale = min(res.w/contentRes.w, res.h/contentRes.h)`), which is actually "fill uniform" behavior. The user wants true pixel-accurate (1:1 pixel mapping): a 720×480 source on a 1920×1080 output should appear at its native size, centered, not scaled to fit.
- **Fix:** Change 'none' mode to: `xScale = contentRes.w / res.w`, `yScale = contentRes.h / res.h`, centered at `x = (1 - xScale) / 2`, `y = (1 - yScale) / 2`. Add a separate 'fit' mode for the current uniform-fit behavior.
- **Files:** `web/components/inspector-panel.js` (calcMixerFill), `web/lib/dashboard-state.js` (STRETCH_MODES)

---

## Features

### FEAT-1: Better server connection flow — v1 done; import deferred
- **Done:** `config-compare.js` parses INFO CONFIG channel list + video-mode; compares to module expectation (screens / multiview / inputs). `configComparison` in API state + WS `change`. Web header **Server** panel: table + issues + hint to use **Apply server config and restart**.
- **Not done:** Auto “import server config” into Companion fields; defer routing until user confirms (would need UX + safety review).
- **Files:** `config-compare.js`, `index.js`, `polling.js`, `api-routes.js` (`getState`), `web/components/header-bar.js`, `web/styles.css`, `web/app.js`

### FEAT-2: Selected layer/clip manipulation via Companion ✅ (implemented)
- **Done:** `POST /api/selection` + WS `selection_sync`; variables `ui_sel_*`; actions **UI selection: nudge position or size** (axis + delta + pixel|normalized unit) and **toggle aspect lock**; dashboard layer + multiview + timeline clip paths; `web/lib/selection-sync.js`, `ui-selection.js`, `timeline-engine.adjustClipFillDelta`, shared `web/lib/mixer-fill.js`.
- **Files:** `index.js`, `actions.js`, `selection-actions.js`, `variables.js`, `api-routes.js`, `web-server.js`, `web/components/inspector-panel.js`, `web/lib/selection-sync.js`, `web/lib/mixer-fill.js`

### FEAT-3: Keyframe placement via Companion button ✅
- **Done:** Action **Timeline: Place keyframe (capture current value)** (`TL_PLACE_KEYFRAME`) with parameter dropdown (opacity, volume, position, scale, or single fill/scale axis). Uses `timelineEngine.captureKeyframeAtNow()` to sample interpolated values at playhead. Timeline source: active playback, Web UI selection (`ui_sel` timeline clip), or manual ID; layer: manual or Web UI selection.
- **Files:** `actions.js`, `timeline-engine.js`

### FEAT-4: Preview canvas in Timeline & Dashboard views ✅
- **Done:** Shared `preview-canvas.js` with `initPreviewPanel` (collapsible toggle, drag-to-resize height, localStorage), internal canvas sized to program resolution (DPR-aware). **Dashboard:** draws active column’s 9 layers using `layerSettings` geometry + media thumbnails. **Timeline:** draws each layer’s clip under the playhead with `fill_x`/`fill_y`/`scale_x`/`scale_y`/`opacity` keyframe interpolation (same linear rules as server). `redrawTimelineView` keeps preview in sync with transport, seek, and playback.
- **Files:** `web/components/preview-canvas.js`, `web/components/timeline-editor.js`, `web/components/dashboard.js`, `web/styles.css`

### FEAT-5: Media data fetch / CINF in state ✅
- **Done:** CINF responses were stored on the instance (`mediaDetails`) but not merged into `StateManager`, so WebSocket `media` updates lacked parsed duration/resolution/fps. **`cinf-parse.js`** shares parsing with **`getState`**. **`updateMediaDetails`** rebuilds `state.media` with `cinf` + parsed fields and emits after the TLS step (when queued CINFs for the current CLS have finished). Sources panel merges live state with cached GET `/api/media` (ffprobe overlay) so metadata updates aren’t overwritten by stale probe data.
- **Files:** `cinf-parse.js`, `api-routes.js`, `state-manager.js`, `index.js`, `web/components/sources-panel.js`, `companion/HELP.md`

---

## Priority Order
1. BUG-3 — Content display pixel-accurate (affects core workflow)
2. BUG-1 — Multiviewer reset on connection
3. BUG-2 — Preview label size mismatch
4. FEAT-2 — Selected layer/clip Companion manipulation
5. FEAT-3 — Keyframe placement via button
6. FEAT-1 — Better server connection flow
7. FEAT-4 — Preview canvas in timeline/dashboard
8. FEAT-5 — Media / CINF state sync ✅
