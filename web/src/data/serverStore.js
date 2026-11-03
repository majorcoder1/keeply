import client from '../api/client'

// Signed-in mode, raw server calls. Nothing in the app uses this directly any more:
// data/secureStore.js wraps it so notes, folders, photos and recordings are encrypted
// on the way out and decrypted on the way in. The server never receives readable data
// (and refuses it if it ever did).
const serverStore = {
  async folders() {
    const { data } = await client.get('/folders')
    return data
  },

  async createFolder(name) {
    const { data } = await client.post('/folders', { name })
    return data
  },

  async renameFolder(id, name) {
    const { data } = await client.put(`/folders/${id}`, { name })
    return data
  },

  async deleteFolder(id) {
    await client.delete(`/folders/${id}`)
  },

  async notes() {
    const { data } = await client.get('/notes')
    return data
  },

  async createNote(payload) {
    const { data } = await client.post('/notes', payload)
    return data
  },

  async updateNote(id, payload) {
    const { data } = await client.put(`/notes/${id}`, payload)
    return data
  },

  async deleteNote(id) {
    await client.delete(`/notes/${id}`)
  },

  async recordings() {
    const { data } = await client.get('/recordings')
    return data
  },

  // `file` is already-encrypted bytes; `title` is already an enc1: block.
  async createRecording({ file, duration, note_id, title, mime }) {
    const form = new FormData()
    form.append('audio', file, 'recording.enc')
    if (duration) form.append('duration', Math.round(duration))
    if (note_id) form.append('note_id', note_id)
    if (title) form.append('title', title)
    if (mime) form.append('mime', mime)
    const { data } = await client.post('/recordings', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 })
    return data
  },

  async deleteRecording(id) {
    await client.delete(`/recordings/${id}`)
  },

  // Title, description and picture for a web address (the address is sent in the body, not the URL).
  async linkPreview(url) {
    const { data } = await client.post('/link-preview', { url }, { timeout: 20000 })
    return data
  },

  async uploadImage(file) {
    const form = new FormData()
    form.append('image', file, 'photo.enc')
    const { data } = await client.post('/images', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 })
    return data.url
  },
}

export default serverStore
