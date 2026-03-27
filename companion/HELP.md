## CasparCG

**Available commands for CasparCG**

* LOADBG, LOAD, PLAY, PAUSE, RESUME, STOP, CLEAR
* CALL, SWAP
* CG ADD, CG UPDATE, CG PLAY, CG STOP
* Manually specify AMCP command
* GOTO relative position (from start or end of video)
* Refresh variables (full AMCP query cycle)
* Refresh media library – Re-query CLS/CINF from CasparCG server (same as refresh variables, focused on media)
* Apply server config and restart – Generate config XML from screen settings, DATA STORE it, then send restart command
* Send OSC (CasparCG Client) – path e.g. /control/play, /control/stop

**Connection query cycle**

On connect the module runs a sequential AMCP query cycle and then builds variables and presets from the result:

1. **CLS** – Media file list (used for play actions and CINF).
2. **CINF [filename]** – Per-file media details for each media file (up to **Max media files to query with CINF** in config). Stored in variables `Media: <filename>`. Parsed duration/resolution/fps are merged into module state after each CLS batch (before TLS) so the Web UI Sources list and `/api/state` stay in sync without relying only on HTTP merge.
3. **TLS** – Template list.
4. **VERSION**, **VERSION FLASH**, **VERSION TEMPLATEHOST** – Server/Flash/Template host versions.
5. **INFO** – Channel list (e.g. `1 720p5000 PLAYING`). Parsed to get channel IDs.
6. **INFO PATHS**, **INFO SYSTEM**, **INFO CONFIG** – Paths, system info, full config (consumers, screens, etc.).
7. **INFO [channel]** – Per-channel XML (framerate, layers, foreground/background clip names). Used for channel/layer variables and tally.

**Variables (from AMCP)**

* **Server / Flash / Template host version** – From VERSION commands.
* **Channel list** – From INFO (all channels).
* **Paths, System, Config** – From INFO PATHS, INFO SYSTEM, INFO CONFIG (raw text).
* **Server consumers summary** – Parsed from your generated config (on config change) or from INFO CONFIG (when connected): per-channel video mode and screen consumers (device, size).
* **Media count, Template count** – From CLS/TLS.
* **Channel N status** – Status line for that channel from INFO.
* **Channel N framerate** – From INFO channel XML.
* **Ch N L0/L1 FG (program), state, BG (preview)** – Foreground clip name, state (playing/paused/empty), background clip name per channel/layer.
* **Ch N L0/L1 duration (s), time (s), remaining (s)** – Clip duration, elapsed time, and remaining time (from INFO channel XML; updated on realtime poll).
* **Media: &lt;filename&gt;** – CINF response for each queried media file.

**Feedbacks (tally)**

* **Program (FG clip matches)** – Red when the chosen channel/layer foreground clip name matches (program/on air).
* **Preview (BG clip matches)** – Green when the chosen channel/layer background clip name matches (preview/ready).

Use these on play-media presets for red = on air, green = preview.

**Presets (built from server info)**

After the query cycle the module creates presets from the discovered channels and media:

* **Play media** – One button per (media file × channel × layer 0/1): play that clip to that channel-layer, with program/preview tally feedback.
* **Transport** – STOP and CLEAR per channel-layer.
* **Routing** – ADD/REMOVE SCREEN and ADD/REMOVE DECKLINK 1 per channel (examples; use Manual AMCP for other consumers).
* **Parameters** – SEEK 0, LOOP 1, MIXER FILL 0 0 1 1 (full screen) per channel-layer.
* **Variables** – Refresh variables (re-runs full query cycle).
* **Server config** – Apply server config and restart (DATA STORE + restart command).
* **Manual** – CLEAR 1 (example).

**Config**

* **IP, AMCP port** – CasparCG Server connection.
* **Variable poll interval (s)** – Light refresh (INFO + INFO per channel). 0 = off.
* **Realtime poll interval (ms)** – Fast poll for state, duration, time, remaining (e.g. 500). 0 = only use variable poll.
* **Max CINF on connect** – Limit CINF requests. 0 = skip CINF (use if server returns COMMAND_UNKNOWN_DATA).
* **Query CINF** – Uncheck to skip CINF entirely on connect.
* **OSC port** – CasparCG **Client** OSC port (default 3250). Use with "Send OSC" action (/control/play, /control/stop, etc.). 0 = disabled.
* **Channel consumers / screens** – Optional lines like `1=SCREEN` for routing reference.
* **Screens** – Number of screens (1–4). Each screen has: video mode (standard or custom resolution), stretch, windowed, VSync, always on top, borderless. When mode is custom, enter width, height, and fps. Each screen creates: program channel (with screen consumer) + preview channel (empty consumers). Optional **multiview** adds another channel with screen consumer.
* **Server config** – Config filename (e.g. `casparcg.config`) and restart command (e.g. `RESTART`). Config XML is generated from screen settings. Use action **Apply server config and restart** to send via AMCP DATA STORE; the server stores it in media/ with .ftd added (e.g. media/casparcg.config.ftd) and loads it on restart. Synced media folder recommended.

**Errors and queue**

If one AMCP command fails (e.g. CINF not supported), the module still advances the queue and continues with the rest so the connection cycle does not stop.

**Web UI selection → Companion (encoders / buttons)**

When the web panel has focus, the module stores the current inspector selection and exposes **variables** (`ui_sel_*`: context, label, channel, layer, position/size in px, stretch, timeline clip fill/scale, multiview cell id). Use actions:

* **UI selection: nudge position or size** — Axis (X/Y/width/height), **Delta** (use variables for rotary steps), **Unit**: *Pixels* for dashboard layer settings and multiview cells; *Normalized* for timeline clip keyframed fill/scale (e.g. delta `0.005`).
* **UI selection: toggle aspect lock** — Toggles W/H (or scale X/Y on timeline) lock for the next nudges.

Requires the web client to be open so selection is POSTed to `/api/selection` (debounced). Dashboard layer inspector includes **Lock W/H aspect** for Companion encoders.

**Timeline: place keyframe (capture current value)**

* **Timeline: Place keyframe (capture current value)** — Dropdown **Parameter**: opacity, volume, position (fill X+Y), scale (scale X+Y), or single fill/scale axis. Reads the **interpolated** value at the current playhead and adds/replaces a keyframe (same idea as the web inspector). **Timeline**: active playback, Web UI selected clip, or manual ID. **Layer**: manual # or Web UI selection. Requires a clip under the playhead on that layer.

**Server config vs module settings**

After connect, the module parses **INFO CONFIG** from CasparCG and compares channel count and **video-mode** per channel to what your Companion **Screens** settings would generate. Open the web panel and use the **Server** button in the header for a table and mismatch list. To push generated XML to the server, use **Apply server config and restart** (set config filename and restart command in module settings first).

**Web client**

When the module has HTTP enabled (Companion's built-in server or optional API port in config), a web control panel is available at the instance URL (e.g. `http://companion-ip/instance/caspar/`):

* **Dashboard** — Column/layer grid (Millumin-style). Drag media, templates, routes, or timelines onto cells. Click a column to activate (send to program). Per-column transitions (CUT, MIX, PUSH, WIPE, SLIDE) configurable via the gear icon.
* **Timeline editor** — Multi-layer timeline with clips, keyframes, transport controls. I/O fade shortcuts (i = fade in, o = fade out). Timelines can be sent to preview or program. Take button routes preview to program.
* **Multiview editor** — Visual layout editor for multiview output. Drag/resize program, preview, and Decklink cells. Apply layout to route and position sources.
* **Sources panel** — Media, templates, live sources (routes, Decklink inputs), and timelines. All items draggable to dashboard or timeline.
* **Inspector** — Property editor for selected dashboard layer: position, size, opacity, blend, volume, loop, seek, transition override.
* **Project save/load** — Save project (dashboard, timelines, multiview layout) as JSON file or to CasparCG server via DATA STORE. Load from file or server. Project name in header bar.
