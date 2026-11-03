// Phone photos are 3–12 MB. Shrink them to a sensible size before they are stored,
// so notes load fast and uploads finish on a weak signal.

const MAX_SIDE = 1600
const QUALITY = 0.85

async function decode(file) {
  // createImageBitmap needs no object URL, so the site's strict image policy doesn't matter.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch { /* fall through to <img> */ }
  }
  const dataUrl = await blobToDataUrl(file)
  return await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

// Returns a JPEG Blob no bigger than MAX_SIDE on its long edge. If the browser can't
// read the file (e.g. HEIC outside Safari) the original comes back unchanged.
export async function shrinkImage(file) {
  try {
    const img = await decode(file)
    const w = img.width
    const h = img.height
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    img.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    return blob || file
  } catch {
    return file
  }
}

// A profile picture: the middle square of the image, 256x256, as a small JPEG.
export async function squareAvatar(file, size = 256) {
  let img
  try {
    img = await decode(file)
  } catch {
    throw new Error("That picture can't be read. Try a JPEG or PNG.")
  }
  const side = Math.min(img.width, img.height)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
  img.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new Error("That picture can't be used.")
  return blob
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// Notes store their photos as a list of URLs (server) or data URLs (guest).
export function normalizeImages(v) {
  if (Array.isArray(v)) return v.filter((s) => typeof s === 'string' && s)
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v)
      if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === 'string' && s)
    } catch { /* not JSON */ }
  }
  return []
}
