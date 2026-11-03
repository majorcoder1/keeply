import { useEffect, useRef, useState } from 'react'
import { RICH_MARKER, isRich, sanitizeHtml, hasFormatting, toPlainText } from '../lib/richtext'
import { normalizeImages, shrinkImage } from '../lib/images'
import Icon from './Icon'
import { SecureImage, SecureAudio } from './Secure'
import ChecklistEditor from './ChecklistEditor'
import LinkCard from './LinkCard'
import { useSettings } from '../lib/settings'
import { cleanItems, listToText } from '../lib/checklist'
import { findLinks } from '../lib/linkpreview'
import { shareNote } from '../lib/share'

const COLORS = ['default', 'yellow', 'green', 'blue', 'pink', 'purple', 'orange']
const COLOR_VAR = {
  default: 'var(--note-default)', yellow: 'var(--note-yellow)', green: 'var(--note-green)', blue: 'var(--note-blue)',
  pink: 'var(--note-pink)', purple: 'var(--note-purple)', orange: 'var(--note-orange)',
}

// Normalize tags coming from the server (array), guest store (array) or bad data.
function normalizeTags(t) {
  if (Array.isArray(t)) return t.filter(Boolean)
  if (typeof t === 'string' && t.trim()) {
    try {
      const parsed = JSON.parse(t)
      if (Array.isArray(parsed)) return parsed.filter(Boolean)
    } catch { /* not JSON */ }
    return t.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return []
}

function cleanTag(raw) {
  return raw.trim().replace(/^#+/, '').slice(0, 50)
}

const FONTS = [
  { label: 'Default font', value: '' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Monospace', value: "'Courier New', monospace" },
  { label: 'Rounded', value: "'Trebuchet MS', sans-serif" },
]

// Create or edit a note. `note` null = new note. The body is a rich-text editor:
// notes with formatting save as marked HTML; plain notes stay plain text.
export default function NoteEditor({ note, newKind, folders, currentFolderId, allTags = [], store, initialFiles, recording, onSave, onDelete, onClose }) {
  const [title, setTitle] = useState(note?.title || '')
  const [color, setColor] = useState(note?.color || 'default')
  const [pinned, setPinned] = useState(note?.pinned || false)
  const [folderId, setFolderId] = useState(note?.folder_id || currentFolderId || '')
  const [tags, setTags] = useState(() => normalizeTags(note?.tags))
  const [tagDraft, setTagDraft] = useState('')
  const [fmtOpen, setFmtOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const [active, setActive] = useState({ bold: false, italic: false, underline: false })
  const [images, setImages] = useState(() => normalizeImages(note?.images))
  const settings = useSettings()
  const kind = note?.kind === 'list' || (!note && newKind === 'list') ? 'list' : 'text'
  const [items, setItems] = useState(() => (Array.isArray(note?.items) ? note.items : []))
  const [liveText, setLiveText] = useState(() => toPlainText(note?.body || ''))
  const [shareMsg, setShareMsg] = useState('')
  const liveTimer = useRef(null)
  const [uploading, setUploading] = useState(0)
  const [imgError, setImgError] = useState('')
  const bodyRef = useRef(null)
  const fileRef = useRef(null)
  const sizeRef = useRef(3) // execCommand font sizes run 1–7; 3 ≈ normal

  // Photos: shrink, then store (server upload, or a data URL for guests).
  async function addFiles(files) {
    const list = [...(files || [])].filter((f) => f.type.startsWith('image/') || !f.type)
    if (!list.length) return
    setImgError('')
    for (const file of list) {
      setUploading((n) => n + 1)
      try {
        const blob = await shrinkImage(file)
        const url = await store.uploadImage(blob)
        if (url) setImages((prev) => [...prev, url])
      } catch {
        setImgError("A photo couldn't be added. Check your connection and try again.")
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  // A new photo note (the + menu's Image) arrives with its files already picked.
  const filesTaken = useRef(false)
  useEffect(() => {
    if (filesTaken.current || !initialFiles?.length) return
    filesTaken.current = true
    addFiles(initialFiles)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the note's content into the editor once, on open.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const b = note?.body || ''
    if (isRich(b)) el.innerHTML = sanitizeHtml(b.slice(RICH_MARKER.length))
    else el.innerText = b
    if (initialFiles?.length) return // a photo note: don't pop the keyboard over the photo
    el.focus()
    const r = document.createRange()
    r.selectNodeContents(el)
    r.collapse(false)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reflect Bold/Italic/Underline state on the buttons as the caret moves.
  useEffect(() => {
    function onSel() {
      if (document.activeElement !== bodyRef.current) return
      try {
        setActive({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
        })
      } catch { /* not supported */ }
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function exec(cmd, val) {
    const el = bodyRef.current
    if (!el) return
    el.focus()
    try { document.execCommand('styleWithCSS', false, true) } catch { /* noop */ }
    try { document.execCommand(cmd, false, val ?? null) } catch { /* noop */ }
    try {
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      })
    } catch { /* noop */ }
  }

  function changeSize(delta) {
    sizeRef.current = Math.max(1, Math.min(7, sizeRef.current + delta))
    exec('fontSize', String(sizeRef.current))
  }

  function highlight() {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--note-hilite').trim() || '#fff1a8'
    exec('hiliteColor', c)
  }

  // Serialize the editor: rich (marked HTML) if it has formatting, else plain text.
  function computeBody() {
    if (kind === 'list') return { body: '', empty: cleanItems(items).length === 0 }
    const el = bodyRef.current
    if (!el) return { body: '', empty: true }
    const sanitized = sanitizeHtml(el.innerHTML)
    const text = (el.innerText || '').replace(/ /g, ' ')
    if (hasFormatting(sanitized)) return { body: RICH_MARKER + sanitized, empty: text.trim() === '' }
    return { body: text.replace(/\n{3,}/g, '\n\n').trimEnd(), empty: text.trim() === '' }
  }

  // Send the note's words to another app (the phone's share sheet) or copy them.
  async function doShare() {
    const text = kind === 'list' ? listToText(items) : (bodyRef.current?.innerText || '').trim()
    const full = [title.trim(), text.trim()].filter(Boolean).join('\n\n')
    if (!full) { setShareMsg('Nothing to share yet'); setTimeout(() => setShareMsg(''), 2500); return }
    const result = await shareNote({ title: title.trim(), text: full })
    if (result === 'copied') { setShareMsg('Copied to the clipboard'); setTimeout(() => setShareMsg(''), 2500) }
  }

  function addTag(raw) {
    const clean = cleanTag(raw)
    if (!clean) return
    setTags((prev) => (prev.some((t) => t.toLowerCase() === clean.toLowerCase()) ? prev : [...prev, clean]))
    setTagDraft('')
  }

  function removeTag(tag) {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  function onTagKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagDraft)
    } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
      setTags((prev) => prev.slice(0, -1))
    }
  }

  function finalTags() {
    const clean = cleanTag(tagDraft)
    if (clean && !tags.some((t) => t.toLowerCase() === clean.toLowerCase())) return [...tags, clean]
    return tags
  }

  function handleClose() {
    if (uploading > 0) {
      setImgError('Hang on — a photo is still being added.')
      return
    }
    const t = finalTags()
    const { body, empty } = computeBody()
    if (title.trim() || !empty || t.length || images.length) {
      onSave({ id: note?.id, title, body, color, pinned, folder_id: folderId || null, tags: t, images, kind, items: kind === 'list' ? cleanItems(items) : [] })
    } else {
      onClose()
    }
  }

  const editedAt = note?.updated_at ? new Date(note.updated_at) : null
  const editedLabel = editedAt && !Number.isNaN(editedAt.getTime())
    ? `Edited ${editedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : ''

  const draft = tagDraft.trim().toLowerCase()
  const suggestions = allTags.filter(
    (t) =>
      !tags.some((x) => x.toLowerCase() === t.toLowerCase()) &&
      (draft ? t.toLowerCase().includes(draft) : true)
  )

  return (
    <div className="modal-backdrop sheet-backdrop" onClick={handleClose}>
      <div className="modal note-modal" style={{ background: COLOR_VAR[color] }} onClick={(e) => e.stopPropagation()}>
        <div className="ed-top">
          <button className="icon-btn ed-back" aria-label="Back" onClick={handleClose}><Icon name="back" /></button>
        </div>

        {(images.length > 0 || uploading > 0) && (
          <div className={`ed-images n${Math.min(images.length + uploading, 3)}`}>
            {images.map((src) => (
              <div className="ed-img" key={src}>
                <SecureImage src={src} store={store} />
                <button className="ed-img-x" aria-label="Remove photo" onClick={() => setImages((prev) => prev.filter((u) => u !== src))}>
                  <Icon name="close" size={18} />
                </button>
              </div>
            ))}
            {Array.from({ length: uploading }, (_, i) => (
              <div className="ed-img loading" key={`up${i}`}><span className="mini-spin" /> Adding photo…</div>
            ))}
          </div>
        )}
        {imgError && <div className="error">{imgError}</div>}
        {recording && <div className="ed-audio"><SecureAudio recording={recording} store={store} /></div>}

        <div className="ed-titlebar">
          <input
            className="title-input"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ background: 'transparent' }}
          />
          <span className="tip-wrap">
            <button className={`icon-btn ed-pin ${pinned ? 'on' : ''}`} aria-label={pinned ? 'Unpin note' : 'Pin note'} aria-pressed={pinned} onClick={() => setPinned(!pinned)}>
              <Icon name="pin" />
            </button>
            <span className="tip" role="tooltip">
              {pinned ? 'Unpin note' : 'Pin note — jumps to the top'}
            </span>
          </span>
        </div>

        <div className={`fmtbar ${fmtOpen ? 'open' : ''}`} id="fmtbar">
          <div className="fmtbar-inner">
            <div className="fmtbar-row" role="toolbar" aria-label="Text formatting">
              <button type="button" className={`fbtn ${active.bold ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')} title="Bold"><b>B</b></button>
              <button type="button" className={`fbtn ${active.italic ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')} title="Italic"><i>I</i></button>
              <button type="button" className={`fbtn ${active.underline ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')} title="Underline"><u>U</u></button>
              <span className="fsep" />
              <select className="fsel" defaultValue="" onChange={(e) => exec('fontName', e.target.value)} onMouseDown={(e) => e.stopPropagation()} title="Font" aria-label="Font">
                {FONTS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
              </select>
              <span className="fsep" />
              <button type="button" className="fbtn sz" onMouseDown={(e) => e.preventDefault()} onClick={() => changeSize(-1)} title="Smaller"><span className="sml">A</span>−</button>
              <button type="button" className="fbtn sz" onMouseDown={(e) => e.preventDefault()} onClick={() => changeSize(1)} title="Bigger"><span className="big">A</span>＋</button>
              <span className="fsep" />
              <button type="button" className="fbtn" onMouseDown={(e) => e.preventDefault()} onClick={highlight} title="Highlight">🖍</button>
            </div>
          </div>
        </div>

        {kind === 'list' ? (
          <ChecklistEditor items={items} setItems={setItems} addToBottom={settings.addToBottom} checkedToBottom={settings.checkedToBottom} />
        ) : (
          <div
            ref={bodyRef}
            className="rich-body"
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Take a note…"
            role="textbox"
            aria-multiline="true"
            onInput={() => {
              clearTimeout(liveTimer.current)
              liveTimer.current = setTimeout(() => setLiveText(bodyRef.current?.innerText || ''), 700)
            }}
          />
        )}

        {settings.linkPreviews && store?.linkPreview && findLinks(kind === 'list' ? items.map((i) => i.text).join('\n') : liveText).map((u) => (
          <LinkCard key={u} url={u} store={store} enabled />
        ))}

        <div className="tag-editor">
          {tags.map((t) => (
            <span className="tag" key={t}>
              #{t}
              <button className="tag-x" onClick={() => removeTag(t)} title="Remove tag" type="button">×</button>
            </span>
          ))}
          <input
            className="tag-input"
            placeholder={tags.length ? 'Add tag' : '+ Add tag (e.g. preacher, church, place)'}
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={onTagKey}
            onBlur={() => addTag(tagDraft)}
          />
        </div>

        {suggestions.length > 0 && (
          <div className="tag-suggest">
            <span className="tag-suggest-label">Your labels</span>
            {suggestions.slice(0, 24).map((t) => (
              <button type="button" className="tag ghost-tag" key={t} onClick={() => addTag(t)}>
                #{t}
              </button>
            ))}
          </div>
        )}

        {shareMsg && <div className="ed-toast" role="status">{shareMsg}</div>}

        <div className="ed-footer">
          {colorOpen && (
            <div className="color-dots ed-colors" role="group" aria-label="Note color">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={color === c ? 'sel' : ''}
                  style={{ background: COLOR_VAR[c] }}
                  onClick={() => { setColor(c); setColorOpen(false) }}
                  title={c}
                />
              ))}
            </div>
          )}
          <div className="ed-tools">
            {kind === 'text' && <button
              type="button"
              className={`icon-btn ${fmtOpen ? 'on' : ''}`}
              aria-pressed={fmtOpen}
              aria-controls="fmtbar"
              onClick={() => setFmtOpen((o) => !o)}
              title="Formatting options"
              aria-label="Formatting options"
            >
              <Icon name="text" />
            </button>}
            <button type="button" className={`icon-btn ${colorOpen ? 'on' : ''}`} title="Background options" aria-label="Background options" aria-pressed={colorOpen} onClick={() => setColorOpen((o) => !o)}>
              <Icon name="palette" />
            </button>
            <button type="button" className="icon-btn" title="Add image" aria-label="Add image" onClick={() => fileRef.current?.click()}>
              <Icon name="image" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
 {settings.sharing && (
              <button type="button" className="icon-btn" title="Share" aria-label="Share note" onClick={doShare}>
                <Icon name="share" />
              </button>
            )}
            <select className="ed-folder" value={folderId} onChange={(e) => setFolderId(e.target.value)} aria-label="Folder">
              <option value="">No folder</option>
              {folders.filter((f) => f.name !== 'Recordings').map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            {note?.id && (
              <button type="button" className="icon-btn" title="Delete note" aria-label="Delete note" onClick={() => onDelete(note.id)}>
                <Icon name="trash" />
              </button>
            )}
            <div className="spacer" />
            {editedLabel && <span className="ed-edited">{editedLabel}</span>}
            <button type="button" className="ed-close" onClick={handleClose} disabled={uploading > 0}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}
