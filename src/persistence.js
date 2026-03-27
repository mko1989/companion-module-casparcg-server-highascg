/**
 * Lightweight file-based persistence for module runtime state.
 *
 * State that should survive Companion restarts (e.g. multiview layout) is written
 * to .module-state.json in the module directory. The file is written synchronously
 * on every change so a crash mid-write is the only failure mode, and the previous
 * file is preserved via a rename-into-place pattern.
 *
 * Usage:
 *   const store = require('./persistence')
 *   store.set('multiviewLayout', layoutData)
 *   const layout = store.get('multiviewLayout')  // null if not set
 */

'use strict'

const fs = require('fs')
const path = require('path')

const STATE_FILE = path.join(__dirname, '..', '.module-state.json')
const STATE_FILE_TMP = STATE_FILE + '.tmp'

let _cache = null

function _load() {
	if (_cache !== null) return _cache
	try {
		const raw = fs.readFileSync(STATE_FILE, 'utf8')
		_cache = JSON.parse(raw) || {}
	} catch {
		_cache = {}
	}
	return _cache
}

function _save() {
	try {
		const json = JSON.stringify(_cache, null, 2)
		fs.writeFileSync(STATE_FILE_TMP, json, 'utf8')
		fs.renameSync(STATE_FILE_TMP, STATE_FILE)
	} catch (e) {
		console.warn('[persistence] Failed to save state:', e.message)
	}
}

/**
 * Get a stored value. Returns null if the key doesn't exist.
 * @param {string} key
 * @returns {*}
 */
function get(key) {
	const state = _load()
	return state[key] !== undefined ? state[key] : null
}

/**
 * Set and immediately persist a value.
 * @param {string} key
 * @param {*} value  Pass null/undefined to delete the key.
 */
function set(key, value) {
	_load()
	if (value == null) {
		delete _cache[key]
	} else {
		_cache[key] = value
	}
	_save()
}

/**
 * Remove a key.
 * @param {string} key
 */
function remove(key) {
	set(key, null)
}

/**
 * Return the full persisted state object (read-only snapshot).
 * @returns {object}
 */
function getAll() {
	return { ..._load() }
}

module.exports = { get, set, remove, getAll }
