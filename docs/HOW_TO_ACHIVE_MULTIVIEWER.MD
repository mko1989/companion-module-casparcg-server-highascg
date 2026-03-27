How we achieve the multiview layout with border/labels overlay
1. Layout design (Settings → Multiview)
MultiviewLayoutWidget is a canvas (e.g. 1920×1080) where you drag/resize:
Program and Preview boxes
Decklink and NDI input boxes (each has position/size)
Those rectangles are stored in the DB as pixel coordinates (e.g. MultiviewPgmX/Y/Width/Height, DecklinkInput_0_MvX, DecklinkInput_0_MvY, …).
2. Sending the layout to the server (channel 3)
On Apply (or when connecting), the client:

Routes program and preview onto Ch3 layers 1 and 2: route://1, route://2.
Routes Decklink/NDI onto Ch3 layers 3+ from the feed channels (no direct Decklink on Ch3).
Uses MIXER FILL so each layer has the right position and size:
MIXER 3-<layer> FILL <x> <y> <w> <h> with normalized 0–1 values from the saved rects (e.g. prX/mvW, prW/mvW).
Commits the mixer so Ch3 shows the grid of video windows.
So the layout = which layers exist + their FILL (position/scale) on Ch3.

3. Borders/labels overlay
If “Show borders/labels on multiviewer output” is enabled:
The client builds a JSON object with the same layout: one entry per cell (pgm, prev, decklink0…, ndi0…) with x, y, w, h (normalized) and a label (e.g. "Program (1920×1080)", "Decklink 1").
It sends ADD / UPDATE / PLAY for the multiview_overlay HTML template on a top layer of Ch3 (layer 3 + dlCount + ndiCount), passing that JSON as template data.
The server loads multiview_overlay.html (must be in the server’s template path). The template’s update(data):
Parses the JSON.
For each key, shows a cell at the given x,y,w,h (as % of the canvas) with a coloured border (red PGM, green PRV, blue Decklink, yellow NDI) and a label bar at the bottom.
So the overlay is a CG layer on top of the same channel; it doesn’t move the video, it just draws borders and labels over the rectangles that the mixer already defined. The client makes sure the overlay JSON uses the same coordinates as the MIXER FILL so they line up.

4. Flow in one sentence
Layout comes from the DB → client sends routes + MIXER FILL on Ch3 for each source → optional overlay layer gets the same layout as JSON → HTML template draws borders and labels on top of those rectangles.

5. Deploying the multiview overlay template

For borders and labels to appear, copy `multiview_overlay.html` to your CasparCG template path.

- Find your template path: CasparCG INFO PATHS returns `<template-path>`. Typical: `/opt/casparcg/media/` or `media/` (relative to CasparCG working dir).
- Copy the template:
  ```bash
  cp multiview_overlay.html /opt/casparcg/media/
  ```
  Or from the module folder:
  ```bash
  cp path/to/companion-module-casparcg-server/multiview_overlay.html /opt/casparcg/media/
  ```
- Restart CasparCG if it was running, or reconnect the module.

Without this file, CG ADD returns OK but the overlay stays empty and no borders show. Apply and Test both use routes (no black template).

6. Troubleshooting

| Symptom | Fix |
|--------|-----|
| Apply clears multiview, no borders | Deploy `multiview_overlay.html` (see §5). Ensure "Show borders/labels" is checked when applying. |
| Video not visible; only see through labels | Redeploy `multiview_overlay.html` — the overlay must have transparent background so video shows through. Copy the latest template from the module folder. |
| Layout disappears on Apply | Normal: Apply CLEARs then rebuilds. If you see black, source channels (program/preview) may be empty. Use Test to verify. |
| PLAY FAILED / 404 | Check channels exist. Enable multiview in Settings → Screens and run "Apply server config and restart". |
| Multiview box selection doesn't show Inspector | Ensure you're on the Multiview tab, then click a cell (not empty area). If still broken, refresh the page. |