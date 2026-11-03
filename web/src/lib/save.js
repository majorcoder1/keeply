// Hand a finished file to the person. In a browser that is an ordinary download. Inside
// the Android app a page can't save files by itself, so the file is passed across in
// pieces to the app, which writes it where the person chooses (Downloads, Drive, ...).

const CHUNK = 384 * 1024 // bytes per piece (about 512 KB once encoded)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function saveInApp(bridge, blob, filename, onProgress) {
  bridge.saveBegin(filename, blob.type || 'application/octet-stream')
  // Wait while the person picks where to save it (up to five minutes).
  let state = 'waiting'
  for (let i = 0; i < 1200 && state === 'waiting'; i++) {
    await sleep(250)
    state = bridge.saveState()
  }
  if (state === 'cancelled') return false
  if (state !== 'ready') {
    bridge.saveCancel()
    throw new Error("Couldn't open that file to save into.")
  }
  for (let off = 0; off < blob.size; off += CHUNK) {
    if (!bridge.saveChunk(await toBase64(blob.slice(off, off + CHUNK)))) {
      bridge.saveCancel()
      throw new Error('Saving stopped part-way. Is there enough space on the phone?')
    }
    onProgress?.(Math.min(blob.size, off + CHUNK), blob.size)
  }
  if (!bridge.saveEnd()) throw new Error("The file couldn't be finished.")
  return true
}

// Resolves true once saved, false if the person cancelled the save dialog.
export async function saveBlob(blob, filename, onProgress) {
  const bridge = typeof window !== 'undefined' ? window.KeeplyApp : null
  if (bridge && typeof bridge.saveBegin === 'function') return saveInApp(bridge, blob, filename, onProgress)

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return true
}
