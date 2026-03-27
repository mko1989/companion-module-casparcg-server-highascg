# companion-module-casparcg-server

CasparCG module for [Bitfocus Companion](https://bitfocus.io/companion). Connects to a CasparCG Server via AMCP, provides presets and variables from server state, and includes a web control panel for live production.

## Repository layout

- **`index.js`** — Companion entrypoint (loads `./src/instance`).
- **`src/`** — Module implementation: AMCP, API routes, web UI (`src/web/`), HTML templates (`src/templates/`), timeline engine, etc.
- **`companion/`** — Companion manifest and help.

## Requirements

- **Node.js** ≥ 22.18
- **Yarn** ≥ 4
- **CasparCG Server** running and reachable on the network
- **Bitfocus Companion** 4.x

## Setup

### 1. Install the module in Companion

1. Add the CasparCG Server module in Companion (add connection → CasparCG Server).
2. Configure **IP** and **AMCP port** (default 5250) for your CasparCG Server.
3. Optionally configure **Screens** to generate config XML (program/preview channels, multiview).

### 2. Connect

The module connects on config save. Connection status appears in the connection UI and in the web client.

### 3. Web client

When Companion's HTTP server is enabled, the web control panel is available at:

```
http://<companion-ip>/instance/caspar/<connection-name>/
```

Example: `http://192.168.1.100/instance/caspar/`

The web client provides:

- **Dashboard** — Column/layer grid; drag media, templates, routes, or timelines onto cells; click a column to activate (send to program); per-column transitions (CUT, MIX, PUSH, WIPE, SLIDE).
- **Timeline editor** — Multi-layer timeline with clips, keyframes, transport; timelines can be sent to preview or program; Take button routes preview to program.
- **Multiview editor** — Visual layout editor for multiview output.
- **Sources panel** — Media, templates, live sources (routes, Decklink), timelines; all draggable to dashboard or timeline.
- **Inspector** — Property editor for selected dashboard layer (position, size, opacity, blend, volume, transition override).
- **Project save/load** — Save project (dashboard, timelines, multiview) as JSON file or to CasparCG server via DATA STORE.

### 4. Standalone API (optional)

Set **Standalone API port** in the module config to run an HTTP + WebSocket server outside of Companion. The web client connects via WebSocket for real-time state updates. When the port is `0` (default), the module uses Companion's built-in HTTP handler only (no WebSocket).

## REST API

All endpoints are under `/api/`. POST endpoints accept JSON bodies.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/state` | Full state snapshot (channels, media, templates, channelMap) |
| GET | `/api/media` | Media file list |
| GET | `/api/templates` | Template list |
| GET | `/api/channels` | Channel IDs, status lines, XML |
| GET | `/api/variables` | All module variables |
| GET | `/api/config` | Current server config XML |
| GET | `/api/thumbnails` | Thumbnail list |
| POST | `/api/play` | PLAY command |
| POST | `/api/loadbg` | LOADBG command |
| POST | `/api/load` | LOAD command |
| POST | `/api/pause` | PAUSE command |
| POST | `/api/resume` | RESUME command |
| POST | `/api/stop` | STOP command |
| POST | `/api/clear` | CLEAR command |
| POST | `/api/call` | CALL command |
| POST | `/api/swap` | SWAP command |
| POST | `/api/add` | ADD consumer |
| POST | `/api/remove` | REMOVE consumer |
| POST | `/api/mixer/:cmd` | MIXER sub-commands (fill, opacity, volume, etc.) |
| POST | `/api/cg/:cmd` | CG sub-commands (add, play, stop, update, etc.) |
| POST | `/api/data/:cmd` | DATA sub-commands (store, retrieve, list, remove) |
| POST | `/api/raw` | Send raw AMCP command |
| POST | `/api/multiview/apply` | Apply multiview layout |
| POST | `/api/config/apply` | Apply generated config and restart server |
| POST | `/api/project/save` | Save project to server (DATA STORE) |
| POST | `/api/project/load` | Load project from server |
| GET/POST/PUT/DELETE | `/api/timelines[/:id[/:action]]` | Timeline CRUD and playback |

## Development

```bash
yarn install
yarn format      # Prettier
yarn package     # Build module package
```

### Project structure

```
├── index.js              # Module entry point (InstanceBase)
├── tcp.js                # AMCP TCP connection + protocol parser
├── amcp.js               # AMCP command abstraction (Promise-based)
├── api-routes.js          # HTTP API route dispatcher
├── api-data.js            # DATA STORE/RETRIEVE + project save/load handlers
├── web-server.js          # Standalone HTTP + WebSocket server
├── state-manager.js       # Centralized state with change events
├── routing.js             # Channel map, routing, preview/multiview setup
├── timeline-engine.js     # Timeline data model + AMCP playback
├── timeline-routes.js     # Timeline API routes
├── config-fields.js       # Companion config field definitions
├── config-generator.js    # CasparCG config XML generator
├── actions.js             # Companion action definitions
├── cg-actions.js          # CG template actions
├── mixer-actions.js       # MIXER actions
├── data-actions.js        # DATA + THUMBNAIL actions
├── feedbacks.js           # Tally feedbacks
├── presets.js             # Dynamic presets
├── variables.js           # Variable definitions + dynamic updates
├── polling.js             # Variable polling (light + realtime)
├── handlers.js            # CLS/TLS/GOTO response handlers
├── companion/
│   ├── manifest.json      # Module manifest
│   └── HELP.md            # In-app help documentation
└── web/                   # Web client (vanilla JS, ES modules)
    ├── index.html
    ├── app.js
    ├── styles.css
    ├── lib/               # State stores, API/WS clients
    └── components/        # UI components (dashboard, timeline, etc.)
```

## License

ISC
