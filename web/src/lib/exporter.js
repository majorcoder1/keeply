import { ZipWriter } from './zip'
import { RICH_MARKER, isRich, toPlainText } from './richtext'
import { normalizeImages } from './images'
import { listToText } from './checklist'

// "Export my notes": everything the person has, as one ordinary .zip they can keep, open on
// any computer, or move to another app. It is made on their device from the unlocked data,
// so it works with end-to-end encryption — and the file it makes is NOT locked.
//
//   README.txt        what is in the file
//   notes/*.txt       one plain-text file per note
//   notes.json        everything, with dates, labels, folders and colors, for other programs
//   photos/*          the photos
//   recordings/*      the voice recordings (.webm / .m4a ...)

const AUDIO_EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/aac': 'aac' }

function slug(text, fallback) {
  const s = String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return s || fallback
}

function unique(used, base, ext) {
  let name = `${base}.${ext}`
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}-${n}.${ext}`
  used.add(name.toLowerCase())
  return name
}

function imageExt(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png'
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'gif'
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return 'webp'
  return 'img'
}

const pad = (n) => String(n).padStart(2, '0')
function dayOf(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'undated' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function when(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
function tagsOf(n) {
  return Array.isArray(n.tags) ? n.tags.map(String).filter(Boolean) : []
}

// Returns { blob, filename, counts }. `onProgress({done,total,label})` is called as it goes.
export async function buildExport(store, onProgress = () => {}) {
  const [folders, notes, recordings] = await Promise.all([store.folders(), store.notes(), store.recordings()])
  const folderName = new Map(folders.map((f) => [f.id, f.name]))
  const recsByNote = new Map()
  for (const r of recordings) {
    if (r.note_id == null) continue
    if (!recsByNote.has(r.note_id)) recsByNote.set(r.note_id, [])
    recsByNote.get(r.note_id).push(r)
  }

  const photoCount = notes.reduce((n, x) => n + normalizeImages(x.images).length, 0)
  const total = notes.length + photoCount + recordings.length
  let done = 0
  const step = (label) => onProgress({ done: ++done, total, label })
  onProgress({ done: 0, total, label: '' })

  const zip = new ZipWriter()
  const usedNotes = new Set()
  const usedPhotos = new Set()
  const usedRecs = new Set()
  const recFiles = new Map() // recording id -> file name
  const jsonNotes = []
  let photos = 0

  // newest first, like the app
  const ordered = [...notes].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
  for (const n of ordered) {
    const base = `${dayOf(n.created_at || n.updated_at)}-${slug(n.title || toPlainText(n.body || '').split('\n').find((l) => l.trim()), 'note')}`
    const noteFile = unique(usedNotes, base, 'txt')

    const photoFiles = []
    for (const [i, src] of normalizeImages(n.images).entries()) {
      try {
        const bytes = await store.imageBytes(src)
        const file = unique(usedPhotos, `${base}-photo-${i + 1}`, imageExt(bytes))
        zip.add(`photos/${file}`, bytes, new Date(n.updated_at))
        photoFiles.push(`photos/${file}`)
        photos++
      } catch {
        photoFiles.push('(this photo could not be read)')
      }
      step(n.title || 'photo')
    }

    const recFilesForNote = []
    for (const r of recsByNote.get(n.id) || []) {
      recFilesForNote.push(`recordings/${await addRecording(r)}`)
    }

    const isList = n.kind === 'list'
    const text = isList ? listToText(n.items) : toPlainText(n.body || '')
    const lines = [
      n.title || '(no title)',
      '='.repeat(Math.min(60, Math.max(8, (n.title || '(no title)').length))),
      `Created: ${when(n.created_at)}`,
      `Last edited: ${when(n.updated_at)}`,
    ]
    if (n.folder_id && folderName.get(n.folder_id)) lines.push(`Folder: ${folderName.get(n.folder_id)}`)
    if (tagsOf(n).length) lines.push(`Labels: ${tagsOf(n).map((t) => '#' + t).join(' ')}`)
    if (n.pinned) lines.push('Pinned: yes')
    if (photoFiles.length) lines.push(`Photos: ${photoFiles.join(', ')}`)
    if (recFilesForNote.length) lines.push(`Voice recording: ${recFilesForNote.join(', ')}`)
    lines.push('', text, '')
    zip.addText(`notes/${noteFile}`, lines.join('\r\n'), new Date(n.updated_at))

    jsonNotes.push({
      id: n.id,
      title: n.title || '',
      kind: isList ? 'list' : 'text',
      items: isList ? (n.items || []).map((i) => ({ text: i.text, done: !!i.done })) : undefined,
      text,
      html: typeof n.body === 'string' && n.body.startsWith('​⁣') ? n.body.slice(2) : undefined,
      labels: tagsOf(n),
      folder: n.folder_id ? folderName.get(n.folder_id) || null : null,
      color: n.color || 'default',
      pinned: !!n.pinned,
      created_at: n.created_at || null,
      updated_at: n.updated_at || null,
      file: `notes/${noteFile}`,
      photos: photoFiles,
      recordings: recFilesForNote,
    })
    step(n.title || 'note')
  }

  // recordings that belong to no note (or whose note was deleted)
  async function addRecording(r) {
    if (recFiles.has(r.id)) return recFiles.get(r.id)
    let file = ''
    try {
      const bytes = await store.recordingBytes(r)
      const ext = AUDIO_EXT[String(r.mime || r.blob?.type || '').split(';')[0]] || 'webm'
      file = unique(usedRecs, `${dayOf(r.created_at)}-${slug(r.title, 'recording')}`, ext)
      zip.add(`recordings/${file}`, bytes, new Date(r.created_at))
    } catch {
      file = '(this recording could not be read)'
    }
    recFiles.set(r.id, file)
    step(r.title || 'recording')
    return file
  }
  const standalone = []
  for (const r of recordings) {
    if (!recFiles.has(r.id)) await addRecording(r)
    standalone.push({ id: r.id, title: r.title || '', created_at: r.created_at || null, seconds: r.duration || 0, file: `recordings/${recFiles.get(r.id)}`, note_id: r.note_id ?? null })
  }

  const exportedAt = new Date()
  zip.addText('notes.json', JSON.stringify({
    app: 'Keeply',
    exported_at: exportedAt.toISOString(),
    folders: folders.map((f) => ({ id: f.id, name: f.name })),
    notes: jsonNotes,
    recordings: standalone,
  }, null, 2), exportedAt)
  zip.addText('README.txt', [
    'Your Keeply export',
    `Made ${when(exportedAt.toISOString())}`,
    '',
    `${notes.length} note(s), ${photos} photo(s), ${recordings.length} recording(s).`,
    '',
    'notes/       one plain-text file per note (open with any text editor)',
    'photos/      the photos from your notes',
    'recordings/  your voice recordings (.webm or .m4a; VLC and most browsers play them)',
    'notes.json   everything in one file, for moving to another program',
    '',
    'IMPORTANT: Keeply keeps your notes locked, but this file is NOT locked. Anyone who has it can',
    'read your notes. Keep it somewhere safe, and delete it when you are done.',
    '',
  ].join('\r\n'), exportedAt)

  return {
    blob: zip.finish(),
    filename: `Keeply-export-${dayOf(exportedAt.toISOString())}.zip`,
    counts: { notes: notes.length, photos, recordings: recordings.length },
  }
}
