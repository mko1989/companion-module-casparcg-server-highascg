/**
 * API handlers for DATA STORE/RETRIEVE and project save/load.
 * Extracted from api-routes.js to keep files ≤ 500 lines.
 * @see main_plan.md Prompt 21
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const PROJECT_STORE_NAME = 'casparcg_web_project'

function jsonBody(o) {
	return JSON.stringify(o)
}

function parseBody(body) {
	if (body == null) return {}
	if (typeof body === 'object' && !Buffer.isBuffer(body)) return body
	try {
		const s = Buffer.isBuffer(body) ? body.toString('utf8') : String(body)
		return JSON.parse(s || '{}')
	} catch {
		return {}
	}
}

async function handleProject(path, body, self) {
	const b = parseBody(body)
	if (path === '/api/project/save') {
		const project = b.project
		if (!project || typeof project !== 'object') {
			return { status: 400, headers: JSON_HEADERS, body: jsonBody({ error: 'Missing project' }) }
		}
		const data = typeof project === 'string' ? project : JSON.stringify(project)
		await self.amcp.dataStore(PROJECT_STORE_NAME, data)
		return { status: 200, headers: JSON_HEADERS, body: jsonBody({ ok: true }) }
	}
	if (path === '/api/project/load') {
		const r = await self.amcp.dataRetrieve(PROJECT_STORE_NAME)
		let project = null
		if (r?.data) {
			const raw = Array.isArray(r.data) ? r.data.join('\n') : String(r.data)
			try {
				project = JSON.parse(raw)
			} catch {
				project = null
			}
		}
		if (!project) {
			return { status: 404, headers: JSON_HEADERS, body: jsonBody({ error: 'No project stored' }) }
		}
		return { status: 200, headers: JSON_HEADERS, body: jsonBody(project) }
	}
	return null
}

async function handleData(path, body, self) {
	const m = path.match(/^\/api\/data\/([^/]+)$/)
	if (!m) return null
	const b = parseBody(body)
	const cmd = m[1].toLowerCase()
	let r
	switch (cmd) {
		case 'store':
			r = await self.amcp.dataStore(b.name, b.data)
			break
		case 'retrieve':
			r = await self.amcp.dataRetrieve(b.name)
			break
		case 'list':
			r = await self.amcp.dataList()
			break
		case 'remove':
			r = await self.amcp.dataRemove(b.name)
			break
		default:
			return { status: 400, headers: JSON_HEADERS, body: jsonBody({ error: `Unknown data command: ${cmd}` }) }
	}
	return { status: 200, headers: JSON_HEADERS, body: jsonBody(r) }
}

module.exports = { handleProject, handleData }
