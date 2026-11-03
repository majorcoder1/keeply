import { openDB } from 'idb'
import { blobToDataUrl } from '../lib/images'

// Guest mode: everything lives on THIS device only, in IndexedDB.
// No sync between phones/computers — that's what sign-in is for.
const DB_NAME = 'keeply-guest'
const DB_VERSION = 1

const DEFAULT_FOLDERS = ['Record', 'Work', 'Personal']

function uid() {
  return crypto.randomUUID()
}

async function db() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('folders')) {
        database.createObjectStore('folders', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('notes')) {
        const s = database.createObjectStore('notes', { keyPath: 'id' })
        s.createIndex('folder_id', 'folder_id')
      }
      if (!database.objectStoreNames.contains('recordings')) {
        database.createObjectStore('recordings', { keyPath: 'id' })
      }
    },
  })
}

// Seed once even if two screens ask at the same moment (otherwise both see "empty").
let seeding = null
function ensureSeedFolders() {
  seeding ??= seedFolders()
  return seeding
}

async function seedFolders() {
  const d = await db()
  const existing = await d.getAll('folders')
  if (existing.length > 0) return
  const now = new Date().toISOString()
  for (const name of DEFAULT_FOLDERS) {
    await d.put('folders', { id: uid(), name, system: true, created_at: now })
  }
}

const localStore = {
  mode: 'guest',

  async folders() {
    await ensureSeedFolders()
    const d = await db()
    const all = await d.getAll('folders')
    return all.sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
  },

  async createFolder(name) {
    const d = await db()
    const folder = { id: uid(), name, system: false, created_at: new Date().toISOString() }
    await d.put('folders', folder)
    return folder
  },

  async deleteFolder(id) {
    const d = await db()
    const folder = await d.get('folders', id)
    if (folder?.system) throw new Error('Default folders cannot be deleted.')
    // Move any notes in this folder to no folder rather than losing them.
    const notes = await d.getAllFromIndex('notes', 'folder_id', id)
    for (const n of notes) {
      n.folder_id = null
      await d.put('notes', n)
    }
    await d.delete('folders', id)
  },

  async notes(folderId = null) {
    const d = await db()
    let all = await d.getAll('notes')
    if (folderId) all = all.filter((n) => n.folder_id === folderId)
    return all.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return a.updated_at > b.updated_at ? -1 : 1
    })
  },

  async createNote(data) {
    const d = await db()
    const now = new Date().toISOString()
    const note = {
      id: uid(),
      folder_id: data.folder_id ?? null,
      title: data.title ?? '',
      body: data.body ?? '',
      color: data.color ?? 'default',
      pinned: !!data.pinned,
      tags: Array.isArray(data.tags) ? data.tags : [],
      images: Array.isArray(data.images) ? data.images : [],
      kind: data.kind === 'list' ? 'list' : 'text',
      items: Array.isArray(data.items) ? data.items : [],
      created_at: now,
      updated_at: now,
    }
    await d.put('notes', note)
    return note
  },

  async updateNote(id, data) {
    const d = await db()
    const note = await d.get('notes', id)
    if (!note) throw new Error('Note not found')
    Object.assign(note, data, { updated_at: new Date().toISOString() })
    await d.put('notes', note)
    return note
  },

  async deleteNote(id) {
    const d = await db()
    await d.delete('notes', id)
  },

  async recordings() {
    const d = await db()
    const all = await d.getAll('recordings')
    return all.sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
  },

  // For guest, we keep the audio Blob directly in IndexedDB.
  async createRecording({ blob, duration, note_id, title }) {
    const d = await db()
    const rec = {
      id: uid(),
      note_id: note_id ?? null,
      title: title ?? 'Recording',
      duration: duration ?? 0,
      blob,
      created_at: new Date().toISOString(),
    }
    await d.put('recordings', rec)
    return rec
  },

  // Guests keep photos inside the note itself (a data URL), on this device only.
  async uploadImage(blob) {
    return blobToDataUrl(blob)
  },

  // The raw bytes of a recording or photo, for "Export my notes".
  async recordingBytes(rec) {
    return new Uint8Array(await rec.blob.arrayBuffer())
  },

  async imageBytes(src) {
    const bin = atob(String(src).split(',')[1] || '')
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  },

  imageUrl(src) {
    return Promise.resolve(src) // guest photos are stored as data URLs
  },

  async recordingUrl(rec) {
    // rec.blob is a Blob for guests.
    return URL.createObjectURL(rec.blob)
  },

  async deleteRecording(id) {
    const d = await db()
    await d.delete('recordings', id)
  },
}

export default localStore
