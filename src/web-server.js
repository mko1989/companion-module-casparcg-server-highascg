/**
 * Optional HTTP + WebSocket server for API access when api_port is configured.
 * Companion's handleHttpRequest handles API when api_port is 0.
 * Serves web/ static files and SPA fallback for non-API paths.
 * @see main_plan.md Prompt 7, 11
 */

const http = require('http')
const fs = require('fs')
const path = require('path')
const { routeRequest, getState } = require('./api-routes')

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
}

const WEB_DIR = path.join(__dirname, 'web')
const TEMPLATES_DIR = path.join(__dirname, 'templates')
const MIME = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'application/javascript',
	'.json': 'application/json',
	'.ico': 'image/x-icon',
	'.svg': 'image/svg+xml',
}

/**
 * Serve static file from web/ or index.html for SPA fallback.
 * @param {string} requestPath - Normalized path (e.g. /app.js, /lib/ws-client.js)
 * @returns {Promise<{ status: number, headers?: object, body?: string }>}
 */
async function serveWebApp(requestPath) {
	let filePath = requestPath || '/'
	if (filePath === '/') filePath = '/index.html'
	// Security: no path traversal
	if (filePath.includes('..')) {
		return { status: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not found' }
	}
	// Serve template files from templates/ dir
	if (filePath.startsWith('/templates/')) {
		const tplName = filePath.replace(/^\/templates\//, '')
		const tplPath = path.join(TEMPLATES_DIR, tplName)
		try {
			const body = await fs.promises.readFile(tplPath, 'utf8')
			const ext = path.extname(tplPath)
			return { status: 200, headers: { 'Content-Type': MIME[ext] || 'text/html' }, body }
		} catch {
			return { status: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not found' }
		}
	}
	const relPath = filePath.replace(/^\/+/, '') || 'index.html'
	let fullPath = path.join(WEB_DIR, relPath)
	try {
		const stat = await fs.promises.stat(fullPath)
		if (stat.isDirectory()) {
			fullPath = path.join(fullPath, 'index.html')
		}
		const ext = path.extname(fullPath)
		const contentType = MIME[ext] || 'application/octet-stream'
		const body = await fs.promises.readFile(fullPath, 'utf8')
		return { status: 200, headers: { 'Content-Type': contentType }, body }
	} catch (e) {
		if (e.code === 'ENOENT') {
			// SPA fallback: serve index.html for unknown paths
			try {
				const body = await fs.promises.readFile(path.join(WEB_DIR, 'index.html'), 'utf8')
				return { status: 200, headers: { 'Content-Type': 'text/html' }, body }
			} catch {
				return { status: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not found' }
			}
		}
		throw e
	}
}

/**
 * Start HTTP + WebSocket server on port. Returns server instance or null.
 * @param {number} port - Port to listen on (0 = do not start)
 * @param {object} self - Module instance
 * @returns {http.Server|null}
 */
function startWebServer(port, self) {
	port = parseInt(port, 10)
	if (!port || port < 1) return null

	let wss = null
	try {
		const WebSocket = require('ws')
		const clients = new Set()

		const server = http.createServer(async (req, res) => {
			// CORS preflight
			if (req.method === 'OPTIONS') {
				res.writeHead(204, CORS_HEADERS)
				res.end()
				return
			}

			let body = ''
			for await (const chunk of req) body += chunk

			const reqPath = (req.url || '').split('?')[0]
			let result
			if (reqPath.startsWith('/api/') || reqPath === '/api') {
				result = await routeRequest(req.method, reqPath, body, self)
			} else {
				result = await serveWebApp(reqPath)
			}
			const headers = { ...CORS_HEADERS, ...(result.headers || {}) }
			res.writeHead(result.status || 200, headers)
			res.end(result.body ?? '')
		})

		server.on('upgrade', (req, socket, head) => {
			const path = (req.url || '').split('?')[0]
			if (path === '/api/ws' || path === '/ws') {
				wss.handleUpgrade(req, socket, head, (ws) => {
					wss.emit('connection', ws, req)
				})
			} else {
				socket.destroy()
			}
		})

		wss = new WebSocket.Server({ noServer: true })
		wss.on('connection', (ws) => {
			clients.add(ws)
			ws.send(JSON.stringify({ type: 'state', data: getState(self) }))

			ws.on('message', async (data) => {
				try {
					const msg = JSON.parse(String(data))
					if (msg.type === 'amcp' && msg.cmd) {
						const r = await self.amcp.raw(msg.cmd)
						ws.send(JSON.stringify({ type: 'amcp_result', data: r }))
					} else if (msg.type === 'multiview_sync' && msg.data) {
						const persistence = require('./persistence')
						self._multiviewLayout = msg.data
						persistence.set('multiviewLayout', msg.data)
						self.log('debug', 'Multiview layout synced from web UI')
					} else if (msg.type === 'selection_sync' && msg.data) {
						const { setUiSelection } = require('./ui-selection')
						setUiSelection(self, msg.data)
					}
				} catch (e) {
					ws.send(JSON.stringify({ type: 'error', data: String(e.message) }))
				}
			})
			ws.on('close', () => clients.delete(ws))
		})

		self._wsBroadcast = (event, data) => {
			const msg = JSON.stringify({ type: event, data })
			clients.forEach((ws) => {
				if (ws.readyState === 1) ws.send(msg)
			})
		}

		server.listen(port, () => {
			self.log('info', `API server listening on port ${port} (http://localhost:${port}/api/...)`)
		})

		return server
	} catch (e) {
		self.log('warn', 'Web server failed (install ws?): ' + e.message)
		return null
	}
}

function stopWebServer(server) {
	if (server && typeof server.close === 'function') {
		server.close()
	}
}

module.exports = { startWebServer, stopWebServer, serveWebApp }
