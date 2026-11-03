import { useSyncExternalStore } from 'react'

// Per-device preferences (kept in this browser, not on the server).
const KEY = 'keeply_settings'

export const DEFAULTS = {
  darkMode: false,
  addToBottom: true, // new checklist items go at the bottom (off: at the top)
  checkedToBottom: true, // ticked items drop into a "Completed" group (off: they stay put, crossed out)
  linkPreviews: false, // asks the server to look up web addresses, so it starts off
  sharing: true, // a Share button on notes
}

function read() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) } } catch { return { ...DEFAULTS } }
}

let snapshot = read()
const listeners = new Set()
function notify() { listeners.forEach((l) => l()) }

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) { snapshot = read(); notify() } })
}

export function loadSettings() {
  return snapshot
}

export function saveSetting(key, value) {
  let stored = {}
  try { stored = JSON.parse(localStorage.getItem(KEY)) || {} } catch { /* start fresh */ }
  stored[key] = value
  try { localStorage.setItem(KEY, JSON.stringify(stored)) } catch { /* private mode: lasts until reload */ }
  snapshot = { ...DEFAULTS, ...stored }
  notify()
}

// Re-renders a component whenever any setting changes.
export function useSettings() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => snapshot)
}
