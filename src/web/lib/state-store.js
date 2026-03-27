/**
 * Client-side state store for CasparCG module.
 * Merges full state from WebSocket with incremental change events.
 * @see main_plan.md Prompt 11
 */

export class StateStore {
	constructor() {
		this._state = {}
		this._listeners = new Map()
	}

	on(pathOrKey, fn) {
		const key = pathOrKey
		if (!this._listeners.has(key)) this._listeners.set(key, [])
		this._listeners.get(key).push(fn)
		return () => {
			const fns = this._listeners.get(key)
			if (fns) {
				const i = fns.indexOf(fn)
				if (i >= 0) fns.splice(i, 1)
			}
		}
	}

	_set(path, value) {
		const parts = path.split('.')
		let obj = this._state
		for (let i = 0; i < parts.length - 1; i++) {
			const p = parts[i]
			if (!(p in obj)) obj[p] = {}
			obj = obj[p]
		}
		obj[parts[parts.length - 1]] = value
		this._emit(path, value)
	}

	_get(path) {
		const parts = path.split('.')
		let obj = this._state
		for (const p of parts) {
			if (obj == null) return undefined
			obj = obj[p]
		}
		return obj
	}

	_emit(path, value) {
		const fns = this._listeners.get(path)
		if (fns) fns.forEach((fn) => fn(value))
		const fnsAny = this._listeners.get('*')
		if (fnsAny) fnsAny.forEach((fn) => fn(path, value))
	}

	setState(full) {
		this._state = typeof full === 'object' && full !== null ? { ...full } : {}
		this._emit('*', null)
	}

	applyChange(path, value) {
		this._set(path, value)
	}

	getState() {
		return this._state
	}
}

export default StateStore
