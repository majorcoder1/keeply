import { toPlainText } from '../lib/richtext'
import { normalizeImages } from '../lib/images'
import { splitItems } from '../lib/checklist'
import { findLinks } from '../lib/linkpreview'
import { useSettings } from '../lib/settings'
import Icon from './Icon'
import LinkCard from './LinkCard'
import { SecureImage } from './Secure'

const COLOR_VAR = {
  default: 'var(--card)',
  yellow: 'var(--note-yellow)',
  green: 'var(--note-green)',
  blue: 'var(--note-blue)',
  pink: 'var(--note-pink)',
  purple: 'var(--note-purple)',
  orange: 'var(--note-orange)',
}

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

const MAX_ITEMS = 8

export default function NoteCard({ note, store, folderName, hasAudio, onClick, onToggleItem }) {
  const settings = useSettings()
  const tags = normalizeTags(note.tags)
  const images = normalizeImages(note.images)
  const colored = note.color && note.color !== 'default'
  const isList = note.kind === 'list'
  const items = isList && Array.isArray(note.items) ? note.items : []
  const { open, done } = splitItems(items, settings.checkedToBottom)
  const body = !isList && note.body ? toPlainText(note.body) : ''
  const link = settings.linkPreviews && store?.linkPreview
    ? findLinks(isList ? items.map((i) => i.text).join('\n') : body, 1)[0]
    : null
  return (
    <div
      className={`card ${colored ? 'colored' : ''} ${images.length ? 'has-img' : ''}`}
      style={{ background: COLOR_VAR[note.color] || 'var(--card)' }}
      onClick={() => onClick(note)}
    >
      {images.length > 0 && (
        <div className={`card-imgs n${Math.min(images.length, 3)}`}>
          {images.slice(0, 3).map((src) => <SecureImage key={src} src={src} store={store} />)}
        </div>
      )}
      <div className="card-in">
        {note.title ? <h3>{note.title}</h3> : null}
        {body ? <p>{truncate(body, 600)}</p> : null}
        {isList && (
          <ul className="card-list">
            {open.slice(0, MAX_ITEMS).map((i) => (
              <li key={i.id} className={i.done ? 'done' : ''}>
                <input type="checkbox" checked={!!i.done} onClick={(e) => e.stopPropagation()} onChange={() => onToggleItem?.(note, i.id)} aria-label={i.done ? 'Mark not done' : 'Mark done'} />
                <span>{i.text}</span>
              </li>
            ))}
            {open.length > MAX_ITEMS && <li className="card-more">+ {open.length - MAX_ITEMS} more</li>}
            {done.length > 0 && <li className="card-more">{done.length} completed item{done.length === 1 ? '' : 's'}</li>}
          </ul>
        )}
        {link && <LinkCard url={link} store={store} enabled compact />}
        {(tags.length || folderName || hasAudio) ? (
          <div className="chips">
            {hasAudio && <span className="chip"><Icon name="mic" size={14} /> Audio</span>}
            {folderName && <span className="chip">{folderName}</span>}
            {tags.slice(0, 6).map((t) => <span className="chip" key={t}>#{t}</span>)}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + '…' : s
}
