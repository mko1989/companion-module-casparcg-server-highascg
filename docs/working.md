# Working Notes — Current Tasks

## Active: Bug fixes

### Completed
- [x] BUG-1: Media browser no info — parse CLS response directly for type/size/fps/duration/resolution (no per-file CINF needed)
- [x] BUG-2: Stretch modes all identical — fixed `calcMixerFill` in both `mixer-fill.js` and `ui-selection.js`; depends on content resolution from CLS
- [x] BUG-3: DeckLink 1 showing when config=0 — `getState()` now respects explicit `decklink_input_count=0`
- [x] BUG-4: Multiview overlay file not found — auto-deploy to `local_media_path`; PLAY [html] fallback if CG ADD fails
- [x] BUG-5: Inspector scroll-wheel — added wheel event to `createMathInput` and `createDragInput` (shift=10x)
- [x] BUG-6: Preview canvas empty — added `preview-host` flex-shrink, `dashboard-tab-activated` event
- [x] BUG-7: Timeline clips always 5s — CLS now provides `durationMs` which `onDropSource` uses

### Requires restart
Server-side: restart module in Companion. Client-side: hard refresh browser (Ctrl+Shift+R).

---

## Backlog
- [ ] FEAT-1 follow-up: reverse-import server XML into Companion fields (optional)

---

## Completed This Session

### FEAT-5: Media metadata in state (CINF → Web UI)
- [x] `cinf-parse.js` — shared `parseCinfMedia` for HTTP + state manager
- [x] `state-manager.updateMediaDetails` merges raw CINF + parsed `durationMs` / `resolution` / `fps` / `type`
- [x] `index.js` — flush after all CINF complete (start of TLS callback) in `runConnectionQueryCycle` and `runMediaLibraryQueryCycle`
- [x] `sources-panel.js` — `mergeMediaProbeOverlay` so WS updates aren’t masked by stale GET `/api/media` cache

### FEAT-4: Preview canvas (Timeline & Dashboard)
- [x] `web/components/preview-canvas.js` — `initPreviewPanel`, `drawDashboardProgramStack`, `drawTimelineStack`, keyframe lerp + thumbnails
- [x] Collapsible header, resizable body height (localStorage), output resolution label
- [x] `dashboard.js` — persistent preview host + `dashboard-main` for grid; redraw on render + state
- [x] `timeline-editor.js` — `tl-editor-root` / `tl-preview-host`; `redrawTimelineView` ties canvas + preview to playhead
- [x] `web/styles.css` — preview panel + tab layout helpers

### FEAT-1: Better server connection flow (v1)
- [x] `config-compare.js`, header Server strip, `companion/HELP.md` — see prior notes

### FEAT-3 / FEAT-2 (prior)
- See git / previous `working.md`

---

## Backlog

- [ ] FEAT-1 follow-up: reverse-import server XML into Companion fields (optional, complex)

---

## Completed (previous prompts)

### Prompt 28–31, code cleanup
- [x] See git history
