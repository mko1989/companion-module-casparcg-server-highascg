/**
 * API routes for timeline engine (Prompts 16+17).
 * GET/POST /api/timelines, /api/timelines/:id, /api/timelines/:id/:action
 */
'use strict'

const J = { 'Content-Type': 'application/json' }
const j = JSON.stringify
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

async function handleTimelineRoutes(method, path, body, self) {
	if (!path.startsWith('/api/timelines')) return null
	const eng = self?.timelineEngine
	if (!eng) return { status: 503, headers: J, body: j({ error: 'Timeline engine not ready' }) }

	const b = parseBody(body)

	// List all timelines
	if (method === 'GET' && path === '/api/timelines')
		return { status: 200, headers: J, body: j(eng.getAll()) }

	// Create or upsert timeline: if body has an `id` and that timeline already exists, update it
	if (method === 'POST' && path === '/api/timelines') {
		if (b.id && eng.get(b.id)) {
			return { status: 200, headers: J, body: j(eng.update(b.id, b)) }
		}
		return { status: 200, headers: J, body: j(eng.create(b)) }
	}

	// Match /api/timelines/:id  or  /api/timelines/:id/:action
	const m = path.match(/^\/api\/timelines\/([^/]+)(?:\/([^/]+))?$/)
	if (!m) return null
	const [, id, action] = m

	// Timeline CRUD (no action)
	if (!action) {
		if (method === 'GET') {
			const tl = eng.get(id)
			return tl
				? { status: 200, headers: J, body: j(tl) }
				: { status: 404, headers: J, body: j({ error: 'Not found' }) }
		}
		if (method === 'PUT') {
			let tl = eng.update(id, b)
			if (!tl) {
				tl = eng.create({ ...b, id })
			}
			return { status: 200, headers: J, body: j(tl) }
		}
		if (method === 'DELETE') {
			eng.delete(id)
			return { status: 200, headers: J, body: j({ ok: true }) }
		}
	}

	// Playback actions (POST only)
	if (method === 'POST') {
		switch (action) {
			case 'play':
				eng.play(id, b.from != null ? Number(b.from) : null)
				return { status: 200, headers: J, body: j({ ok: true }) }
			case 'take': {
				// Route timeline output (on preview) to program layer 1
				const { getChannelMap } = require('./routing')
				const map = getChannelMap(self?.config || {})
				const screenIdx = Math.max(0, parseInt(b.screenIdx, 10) || 0)
				const programCh = map?.programCh?.(screenIdx + 1) ?? 1
				const previewCh = map?.previewCh?.(screenIdx + 1) ?? 2
				const trans = b.transition || 'CUT'
				const dur = Math.max(0, parseInt(b.duration, 10) || 0)
				const tween = b.tween || 'linear'
				if (trans !== 'CUT' && dur > 0) {
					await self.amcp.loadbg(programCh, 1, `route://${previewCh}`, {
						transition: trans, duration: dur, tween,
					})
					await self.amcp.play(programCh, 1)
				} else {
					await self.amcp.play(programCh, 1, `route://${previewCh}`)
				}
				await self.amcp.mixerCommit(programCh)
				return { status: 200, headers: J, body: j({ ok: true }) }
			}
			case 'pause':
				eng.pause(id)
				return { status: 200, headers: J, body: j({ ok: true }) }
			case 'stop':
				eng.stop(id)
				return { status: 200, headers: J, body: j({ ok: true }) }
			case 'seek': {
				const ms = b.ms != null ? Number(b.ms) : NaN
				if (Number.isNaN(ms) || ms < 0) return { status: 400, headers: J, body: j({ error: 'ms required (number >= 0)' }) }
				eng.seek(id, ms)
				return { status: 200, headers: J, body: j({ ok: true }) }
			}
			case 'sendto':
				eng.setSendTo(b)
				return { status: 200, headers: J, body: j({ ok: true }) }
			case 'loop':
				eng.setLoop(id, !!b.loop)
				return { status: 200, headers: J, body: j({ ok: true }) }
		}
	}

	if (method === 'GET' && action === 'state')
		return { status: 200, headers: J, body: j(eng.getPlayback()) }

	return null
}

module.exports = { handleTimelineRoutes }
