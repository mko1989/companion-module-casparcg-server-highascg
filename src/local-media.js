/**
 * Local media API — scalable backend for waveform, thumbnails, etc.
 * Reads from config.local_media_path (synced media folder on Companion machine).
 * @see main_plan.md Prompt 28
 */

const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function jsonBody(o) {
	return JSON.stringify(o)
}

/**
 * Resolve filename against basePath. Prevent directory traversal.
 * @returns {string|null} Absolute path if safe, else null
 */
function resolveSafe(basePath, filename) {
	if (!basePath || typeof basePath !== 'string') return null
	const cleanFilename = (filename || '')
		.replace(/\.\./g, '')
		.split(/[/\\]/)
		.filter(Boolean)
		.join(path.sep)
	if (!cleanFilename) return null
	const full = path.resolve(path.join(basePath, cleanFilename))
	const baseResolved = path.resolve(basePath)
	if (!full.startsWith(baseResolved) || full === baseResolved) return null
	return full
}

/**
 * Extract waveform peaks via ffmpeg. Returns normalized 0-1 values for N bars.
 * Requires ffmpeg in PATH (typical on CasparCG setups).
 * @param {string} filePath - Absolute path to media file
 * @param {number} bars - Number of peak bars (default 24)
 * @returns {Promise<number[]>} Array of normalized amplitudes
 */
async function extractWaveform(filePath, bars = 24) {
	return new Promise((resolve, reject) => {
		const args = [
			'-i', filePath,
			'-vn',
			'-acodec', 'pcm_s16le',
			'-ac', '1',
			'-ar', '8000',
			'-f', 's16le',
			'-'
		]
		const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
		const chunks = []
		ff.stdout.on('data', (chunk) => chunks.push(chunk))
		ff.stderr.on('data', () => {}) // Suppress ffmpeg progress
		ff.on('error', (err) => reject(err))
		ff.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`ffmpeg exited ${code}`))
				return
			}
			const buf = Buffer.concat(chunks)
			const samples = []
			for (let i = 0; i < buf.length; i += 2) {
				samples.push(buf.readInt16LE(i))
			}
			if (samples.length === 0) {
				resolve(Array(bars).fill(0.1))
				return
			}
			const samplesPerBar = Math.max(1, Math.floor(samples.length / bars))
			const peaks = []
			let maxPeak = 0.01
			for (let b = 0; b < bars; b++) {
				const start = b * samplesPerBar
				const end = Math.min(start + samplesPerBar, samples.length)
				let sumSq = 0
				let n = 0
				for (let i = start; i < end; i++) {
					const v = samples[i] / 32768
					sumSq += v * v
					n++
				}
				const rms = n > 0 ? Math.sqrt(sumSq / n) : 0
				peaks.push(rms)
				if (rms > maxPeak) maxPeak = rms
			}
			const normalized = peaks.map((p) => Math.min(1, p / maxPeak))
			resolve(normalized)
		})
	})
}

/**
 * Run ffprobe on a file to get duration, resolution, codec, file size.
 * @param {string} filePath - Absolute path to media file
 * @returns {Promise<{ durationMs?: number, resolution?: string, fps?: number, codec?: string, fileSize?: number }>}
 */
async function probeMedia(filePath) {
	return new Promise((resolve) => {
		const ff = spawn('ffprobe', [
			'-v', 'quiet',
			'-print_format', 'json',
			'-show_format', '-show_streams',
			filePath
		], { stdio: ['ignore', 'pipe', 'pipe'] })
		let out = ''
		ff.stdout?.on('data', (chunk) => { out += chunk })
		ff.stderr?.on('data', () => {})
		ff.on('error', () => resolve({}))
		ff.on('close', (code) => {
			if (code !== 0) { resolve({}); return }
			try {
				const json = JSON.parse(out)
				const out2 = {}
				if (json.format?.duration) {
					out2.durationMs = Math.round(parseFloat(json.format.duration) * 1000)
				}
				if (json.format?.size != null) {
					out2.fileSize = parseInt(json.format.size, 10) || 0
				}
				const vid = (json.streams || []).find((s) => s.codec_type === 'video')
				if (vid?.width && vid?.height) {
					out2.resolution = `${vid.width}×${vid.height}`
				}
				if (vid?.codec_name) out2.codec = String(vid.codec_name).toLowerCase()
				if (vid?.r_frame_rate) {
					const [num, den] = String(vid.r_frame_rate).split('/').map(Number)
					if (num > 0 && den > 0) out2.fps = Math.round((num / den) * 100) / 100
				}
				resolve(out2)
			} catch {
				resolve({})
			}
		})
	})
}

/** Pluggable handlers per resource type. Add new types here. */
const HANDLERS = {
	waveform: async (filePath) => {
		const peaks = await extractWaveform(filePath, 24)
		return { peaks }
	},
	probe: async (filePath) => probeMedia(filePath),
}

/**
 * Handle GET /api/local-media/:filename/:type
 * @returns {Promise<{ status: number, headers?: object, body?: string }>}
 */
async function handleLocalMedia(path, config) {
	// filename may contain slashes (e.g. subfolder/video.mp4)
	const m = path.match(/^\/api\/local-media\/(.+)\/([^/]+)$/)
	if (!m) return null
	const [, filenameEnc, type] = m
	const filename = decodeURIComponent(filenameEnc)
	if (!filename || filename.includes('..')) {
		return { status: 400, headers: JSON_HEADERS, body: jsonBody({ error: 'Invalid filename' }) }
	}
	const basePath = (config?.local_media_path || '').trim()
	if (!basePath) {
		return { status: 404, headers: JSON_HEADERS, body: jsonBody({ error: 'Local media path not configured' }) }
	}
	const handler = HANDLERS[type]
	if (!handler) {
		return { status: 404, headers: JSON_HEADERS, body: jsonBody({ error: `Unknown type: ${type}` }) }
	}
	const filePath = resolveSafe(basePath, filename)
	if (!filePath) {
		return { status: 400, headers: JSON_HEADERS, body: jsonBody({ error: 'Invalid path' }) }
	}
	if (!fs.existsSync(filePath)) {
		return { status: 404, headers: JSON_HEADERS, body: jsonBody({ error: 'File not found' }) }
	}
	try {
		const data = await handler(filePath)
		return { status: 200, headers: JSON_HEADERS, body: jsonBody(data) }
	} catch (e) {
		return {
			status: 502,
			headers: JSON_HEADERS,
			body: jsonBody({ error: e?.message || 'Waveform extraction failed' }),
		}
	}
}

module.exports = { handleLocalMedia, probeMedia, resolveSafe }
