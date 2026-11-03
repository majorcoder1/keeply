import { useEffect, useRef, useState } from 'react'
import { openDB } from 'idb'

// Rich link previews: a small card (title, site, picture) for web addresses in a note. The
// server fetches the page, because other sites don't let a browser do it. Previews are kept
// on this device only, so each address is looked up once.

const DAY = 24 * 60 * 60 * 1000
const FRESH = 14 * DAY // a found preview is reused for two weeks
const MISSING = 6 * 60 * 60 * 1000 // "no preview" is remembered for six hours

const URL_RE = /https?:\/\/[^\s<>"'\])}]+/gi

// The web addresses in some text (first three, without trailing punctuation).
export function findLinks(text, max = 3) {
  const found = []
  for (const m of String(text || '').matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?]+$/, '')
    if (url.length > 8 && !found.includes(url)) found.push(url)
    if (found.length >= max) break
  }
  return found
}

function db() {
  return openDB('keeply-previews', 1, { upgrade(d) { d.createObjectStore('p', { keyPath: 'url' }) } })
}

const mem = new Map() // url -> Promise of { ok, data }

let chain = Promise.resolve()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// One lookup at a time, with a short pause, so a screen of notes doesn't flood the server.
function queued(fn) {
  const run = chain.then(fn, fn)
  chain = run.then(() => sleep(250), () => sleep(250))
  return run
}

export function getPreview(store, url) {
  if (!mem.has(url)) {
    mem.set(url, (async () => {
      try {
        const rec = await (await db()).get('p', url)
        if (rec && Date.now() - rec.at < (rec.ok ? FRESH : MISSING)) return { ok: rec.ok, data: rec.data }
      } catch { /* no local cache available */ }
      const result = await queued(async () => {
        try {
          return { ok: true, data: await store.linkPreview(url) }
        } catch (err) {
          if (err?.response?.status === 429) throw err // too fast: try again later, don't remember
          return { ok: false, data: null }
        }
      })
      try { await (await db()).put('p', { url, ok: result.ok, data: result.data, at: Date.now() }) } catch { /* ignore */ }
      return result
    })().catch((err) => { mem.delete(url); throw err }))
  }
  return mem.get(url)
}

// Looks the address up only once the card is on screen.
export function useLinkPreview(store, url, enabled) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState({ phase: 'idle', data: null })

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return undefined
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect() } }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [enabled, url])

  useEffect(() => {
    let live = true
    if (!enabled || !visible) return undefined
    setState({ phase: 'loading', data: null })
    getPreview(store, url)
      .then((r) => { if (live) setState(r.ok ? { phase: 'ready', data: r.data } : { phase: 'none', data: null }) })
      .catch(() => { if (live) setState({ phase: 'none', data: null }) })
    return () => { live = false }
  }, [enabled, visible, store, url])

  return { ref, ...state }
}
