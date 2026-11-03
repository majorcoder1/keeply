import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import AuthScreen from './pages/AuthScreen'
import Landing from './pages/Landing'
import Help from './pages/Help'
import ResetPassword from './pages/ResetPassword'
import Security from './pages/Security'
import TwoFactorSetup from './pages/TwoFactorSetup'
import KeySetup from './pages/KeySetup'
import KeyUnlock from './pages/KeyUnlock'
import SecurityNotice from './components/SecurityNotice'
import Migrating from './components/Migrating'
import NetworkBar from './components/NetworkBar'
import NoteCard from './components/NoteCard'
import NoteEditor from './components/NoteEditor'
import RecordModal from './components/RecordModal'
import RecordingsView from './components/RecordingsView'
import SettingsModal from './components/SettingsModal'
import ChangePasswordModal from './components/ChangePasswordModal'
import FeedbackModal from './components/FeedbackModal'
import UpdatePrompt from './components/UpdatePrompt'
import Icon from './components/Icon'
import { squareAvatar, blobToDataUrl } from './lib/images'

// The one-time security pop-up is remembered per device, per update.
const NOTICE_KEY = 'keeply.notice.2026-10-security'
function noticeSeen() {
  try { return localStorage.getItem(NOTICE_KEY) === '1' } catch { return false }
}
function markNoticeSeen() {
  try { localStorage.setItem(NOTICE_KEY, '1') } catch { /* private mode */ }
}

export default function App() {
  const { loading, isAuthed, guest, user, store, keyState, logout, changePassword, exitGuest } = useAuth()
  const [entering, setEntering] = useState(null) // null = show landing; 'login' | 'register' = show auth
  const [showHelp, setShowHelp] = useState(false)
  const [showSecurity, setShowSecurity] = useState(false)
  // If opened from the emailed reset link (…/?reset=TOKEN&email=…), show the reset page.
  const [resetInfo, setResetInfo] = useState(() => {
    if (typeof window === 'undefined') return null
    const p = new URLSearchParams(window.location.search)
    const token = p.get('reset')
    const email = p.get('email')
    return token && email ? { token, email } : null
  })

  function finishReset(next) {
    if (typeof window !== 'undefined') window.history.replaceState({}, '', window.location.pathname)
    setResetInfo(null)
    setEntering(next === 'login' ? 'login' : null)
  }

  let content
  if (resetInfo) {
    content = <ResetPassword token={resetInfo.token} email={resetInfo.email} onDone={finishReset} />
  } else if (showHelp) {
    content = <Help onClose={() => setShowHelp(false)} />
  } else if (showSecurity) {
    content = <Security onClose={() => setShowSecurity(false)} />
  } else if (loading) {
    content = <div className="auth"><div className="brand"><img src="/icon.svg" width="56" alt="" /></div></div>
  } else if (!isAuthed && !guest) {
    content = entering
      ? <AuthScreen initialMode={entering} onBack={() => setEntering(null)} onSecurity={() => setShowSecurity(true)} />
      : <Landing onGetStarted={() => setEntering('register')} onLogin={() => setEntering('login')} onHelp={() => setShowHelp(true)} onSecurity={() => setShowSecurity(true)} />
  } else if (isAuthed) {
    content = (
      <SecureGate
        user={user}
        keyState={keyState}
        onSecurity={() => setShowSecurity(true)}
        renderWorkspace={() => (
          <Workspace store={store} user={user} guest={false} logout={async () => { setEntering(null); await logout() }} changePassword={changePassword} exitGuest={exitGuest} onHelp={() => setShowHelp(true)} onSecurity={() => setShowSecurity(true)} />
        )}
      />
    )
  } else {
    content = <Workspace store={store} user={user} guest={guest} logout={async () => { setEntering(null); await logout() }} changePassword={changePassword} exitGuest={exitGuest} onHelp={() => setShowHelp(true)} onSecurity={() => setShowSecurity(true)} />
  }

  return (
    <>
      {content}
      <UpdatePrompt />
    </>
  )
}

// Between signing in and seeing your notes: the security pop-up, two-factor setup, the
// Keeply key (new, or typed once on a new device), then locking anything saved the old way.
function SecureGate({ user, keyState, onSecurity, renderWorkspace }) {
  const { store } = useAuth()
  const [seen, setSeen] = useState(noticeSeen)
  const [secured, setSecured] = useState(false)
  const done = useCallback(() => setSecured(true), [])

  if (!seen) {
    return <SecurityNotice onContinue={() => { markNoticeSeen(); setSeen(true) }} onLearnMore={onSecurity} />
  }
  if (!user.two_factor_enabled) return <TwoFactorSetup onSecurity={onSecurity} />
  if (keyState === 'checking') return <div className="auth"><div className="brand"><img src="/icon.svg" width="56" alt="" /></div></div>
  if (keyState === 'none') return <KeySetup onSecurity={onSecurity} />
  if (keyState === 'locked' || !store) return <KeyUnlock onSecurity={onSecurity} />
  if (!secured) return <Migrating store={store} onDone={done} />
  return renderWorkspace()
}

// A note's labels as an array, whatever shape the server / guest store gave us.
function tagsOf(n) {
  const raw = n.tags
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean)
  if (typeof raw === 'string' && raw.trim()) {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map((t) => String(t).trim()).filter(Boolean) } catch { /* not JSON */ }
    return raw.split(',').map((t) => t.trim()).filter(Boolean)
  }
  return []
}

const SORTS = [
  { id: 'edited', label: 'Last edited' },
  { id: 'created', label: 'Date created' },
  { id: 'title', label: 'Title (A–Z)' },
]

function readPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
function writePref(key, value) {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key) } catch { /* private mode (or too big to keep) */ }
}

function Workspace({ store, user, guest, logout, changePassword, exitGuest, onHelp, onSecurity }) {
  const [folders, setFolders] = useState([])
  const [notes, setNotes] = useState([])
  const [recordings, setRecordings] = useState([])
  const [view, setView] = useState('all') // 'all' | 'recordings' | folderId | 'tag:<label>'
  const [editing, setEditing] = useState(null) // note object, {} for new, or { __files } for a photo note
  const [recording, setRecording] = useState(false)
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [labelsOpen, setLabelsOpen] = useState(false) // the folder button at the bottom: pick a folder or label
  const [newFolder, setNewFolder] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [changePwOpen, setChangePwOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [layout, setLayout] = useState(() => readPref('keeply.layout', 'grid'))
  const [sort, setSort] = useState(() => readPref('keeply.sort', 'edited'))
  const imageInput = useRef(null)

  const loadFolders = useCallback(async () => setFolders(await store.folders()), [store])
  const loadNotes = useCallback(async () => setNotes(await store.notes()), [store])
  const loadRecordings = useCallback(async () => {
    try { setRecordings(await store.recordings()) } catch { /* the notes still work */ }
  }, [store])

  useEffect(() => { loadFolders(); loadNotes(); loadRecordings() }, [loadFolders, loadNotes, loadRecordings])

  const currentFolder = folders.find((f) => f.id === view)

  const visibleNotes = useMemo(() => {
    let list = notes
    if (view.startsWith('tag:')) {
      const want = view.slice(4).toLowerCase()
      list = list.filter((n) => tagsOf(n).some((t) => t.toLowerCase() === want))
    } else if (view !== 'all' && view !== 'recordings') list = list.filter((n) => n.folder_id === view)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((n) => ((n.title || '') + ' ' + (n.body || '') + ' ' + (n.items || []).map((i) => i.text).join(' ')).toLowerCase().includes(q))
    }
    const by = {
      edited: (a, b) => (a.updated_at > b.updated_at ? -1 : 1),
      created: (a, b) => ((a.created_at || '') > (b.created_at || '') ? -1 : 1),
      title: (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }),
    }[sort] || (() => 0)
    return [...list].sort(by)
  }, [notes, view, search, sort])

  const pinnedNotes = visibleNotes.filter((n) => n.pinned)
  const otherNotes = visibleNotes.filter((n) => !n.pinned)

  const folderName = useCallback((id) => folders.find((f) => f.id === id)?.name, [folders])

  // The recording saved with each note (voice notes), for the card chip and the editor's player.
  const recordingByNote = useMemo(() => {
    const map = new Map()
    for (const r of recordings) if (r.note_id != null && !map.has(r.note_id)) map.set(r.note_id, r)
    return map
  }, [recordings])

  // Every label used across the user's notes, for quick re-use in the editor.
  const allTags = useMemo(() => {
    const set = new Set()
    for (const n of notes) {
      const raw = n.tags
      let arr = []
      if (Array.isArray(raw)) arr = raw
      else if (typeof raw === 'string' && raw.trim()) {
        try { const p = JSON.parse(raw); arr = Array.isArray(p) ? p : raw.split(',') }
        catch { arr = raw.split(',') }
      }
      arr.forEach((t) => { const s = String(t).trim(); if (s) set.add(s) })
    }
    return [...set].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  }, [notes])

  async function refreshAll() {
    setRefreshing(true)
    try { await Promise.all([loadFolders(), loadNotes(), loadRecordings()]) }
    finally { setRefreshing(false) }
  }

  async function saveNote(data) {
    if (data.id) await store.updateNote(data.id, data)
    else await store.createNote(data)
    setEditing(null)
    loadNotes()
  }

  // Tick or untick one item straight from a checklist card.
  async function toggleItem(note, itemId) {
    const items = (note.items || []).map((i) => (i.id === itemId ? { ...i, done: !i.done } : i))
    setNotes((all) => all.map((n) => (n.id === note.id ? { ...n, items } : n)))
    try {
      await store.updateNote(note.id, { ...note, items, edited_at: undefined })
    } finally {
      loadNotes()
    }
  }

  async function deleteNote(id) {
    await store.deleteNote(id)
    setEditing(null)
    loadNotes()
  }

  async function addFolder(e) {
    e.preventDefault()
    const name = newFolder.trim()
    if (!name) return
    await store.createFolder(name)
    setNewFolder('')
    loadFolders()
  }

  async function removeFolder(id) {
    if (!confirm('Delete this folder? Its notes will move to "No folder".')) return
    await store.deleteFolder(id)
    if (view === id) setView('all')
    loadFolders()
    loadNotes()
  }

  // Voice note saved: the audio goes to Recordings (locked), and a note holding any typed
  // words goes in the "Record" folder, linked to it.
  async function handleRecordComplete({ blob, duration, text, title }) {
    const recordFolder = folders.find((f) => f.name === 'Record')
    const note = await store.createNote({
      title,
      body: text || '',
      folder_id: recordFolder?.id || null,
    })
    if (blob) await store.createRecording({ blob, duration, note_id: note.id, title })
    setRecording(false)
    if (view === 'recordings') setView('all')
    loadNotes()
    loadRecordings()
  }

  function toggleLayout() {
    const next = layout === 'grid' ? 'list' : 'grid'
    setLayout(next)
    writePref('keeply.layout', next)
  }

  function chooseSort(id) {
    setSort(id)
    writePref('keeply.sort', id)
    setSortOpen(false)
  }

  // The + menu. Image opens the phone's camera / photo picker straight away.
  function newImageNote() {
    setFabOpen(false)
    imageInput.current?.click()
  }
  function onImagePicked(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (files.length) setEditing({ __files: files })
  }

  const initial = guest ? 'G' : (user?.name || 'U')[0].toUpperCase()

  // ---- profile picture ------------------------------------------------------------------------
  // Signed in, it is a locked image on the account (same as a note's photo, opened with the key);
  // as a guest it is kept on this device only.
  const { saveAvatar, removeAvatar } = useAuth()
  const [guestAvatar, setGuestAvatar] = useState(() => readPref('keeply.avatar', ''))
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const avatarInput = useRef(null)
  const avatarSrc = guest ? guestAvatar : user?.avatar || ''

  useEffect(() => {
    let live = true
    if (!avatarSrc) { setAvatarUrl(''); return () => { live = false } }
    Promise.resolve(store.imageUrl(avatarSrc)).then((u) => { if (live) setAvatarUrl(u) }).catch(() => { if (live) setAvatarUrl('') })
    return () => { live = false }
  }, [avatarSrc, store])

  async function pickPicture(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAvatarBusy(true)
    setAvatarError('')
    try {
      const blob = await squareAvatar(file)
      if (guest) {
        const data = await blobToDataUrl(blob)
        setGuestAvatar(data)
        writePref('keeply.avatar', data)
      } else {
        await saveAvatar(await store.uploadImage(blob))
      }
    } catch (err) {
      setAvatarError(err?.response?.data?.errors ? Object.values(err.response.data.errors).flat()[0] : err?.message || "Couldn't save the picture. Try again.")
    } finally {
      setAvatarBusy(false)
    }
  }

  async function removePicture() {
    setAvatarError('')
    try {
      if (guest) { setGuestAvatar(''); writePref('keeply.avatar', '') } else await removeAvatar()
    } catch {
      setAvatarError("Couldn't remove the picture. Try again.")
    }
  }
  const renderCard = (n) => (
    <NoteCard
      key={n.id}
      note={n}
      store={store}
      folderName={view === 'all' ? folderName(n.folder_id) : null}
      hasAudio={recordingByNote.has(n.id)}
      onClick={setEditing}
      onToggleItem={toggleItem}
    />
  )

  return (
    <div className="shell">
      <header className="topbar">
        <div className="tb-left">
          <button className="icon-btn menu-toggle" aria-label="Menu" onClick={() => setSidebarOpen((o) => !o)}><Icon name="menu" /></button>
          <button className="logo" onClick={() => { setView('all'); setSidebarOpen(false) }} title="Go to your notes">
            <img src="/icon.svg" alt="" />
            <b>4thepeople Notes</b>
          </button>
        </div>

        <div className="search-pill">
          <Icon name="search" className="sp-glass" />
          <input placeholder="Search Keeply" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search your notes" />
          {search && (
            <button className="icon-btn" aria-label="Clear search" onClick={() => setSearch('')}><Icon name="close" /></button>
          )}
          <button className="icon-btn" aria-label={layout === 'grid' ? 'List view' : 'Grid view'} title={layout === 'grid' ? 'List view' : 'Grid view'} onClick={toggleLayout}>
            <Icon name={layout === 'grid' ? 'agenda' : 'grid'} />
          </button>
          <div className="sort-wrap">
            <button className="icon-btn" aria-label="Sort notes" title="Sort notes" onClick={() => setSortOpen((o) => !o)}><Icon name="sort" /></button>
            {sortOpen && (
              <>
                <div className="menu-overlay" onClick={() => setSortOpen(false)} />
                <div className="pop-menu sort-menu" role="menu">
                  <div className="pm-head">Sort by</div>
                  {SORTS.map((o) => (
                    <button key={o.id} role="menuitemradio" aria-checked={sort === o.id} className={sort === o.id ? 'on' : ''} onClick={() => chooseSort(o.id)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="tb-right">
        {!guest && (
          <button className={`icon-btn refresh-btn ${refreshing ? 'spinning' : ''}`} title="Refresh notes" aria-label="Refresh notes" onClick={refreshAll}>
            <Icon name="refresh" />
          </button>
        )}
        <div className="account">
          <button className="avatar" title={guest ? 'Guest' : user?.email} aria-label="Account menu" onClick={() => setMenuOpen((o) => !o)}>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : initial}
          </button>
          {menuOpen && (
            <>
              <div className="menu-overlay" onClick={() => setMenuOpen(false)} />
              <div className="account-menu">
                <div className="am-head">
                  <div className="am-pic">{avatarUrl ? <img src={avatarUrl} alt="" /> : initial}</div>
                  <div className="am-who">
                    <div className="am-name">{guest ? 'Guest' : user?.name}</div>
                    <div className="am-email">{guest ? 'Notes stay on this device' : user?.email}</div>
                  </div>
                </div>
                <div className="am-pic-actions">
                  <button type="button" className="am-pic-btn" onClick={() => avatarInput.current?.click()} disabled={avatarBusy}>
                    <Icon name="image" size={18} /> {avatarBusy ? 'Saving…' : avatarSrc ? 'Change picture' : 'Add a picture'}
                  </button>
                  {avatarSrc && !avatarBusy && <button type="button" className="am-pic-btn" onClick={removePicture}>Remove</button>}
                </div>
                {avatarError && <div className="error" style={{ margin: '0 12px 8px' }}>{avatarError}</div>}
                {guest && (
                  <button onClick={() => { setMenuOpen(false); exitGuest() }}><span className="ico">🔐</span> Sign in to sync</button>
                )}
                {!guest && (
                  <button onClick={() => { setMenuOpen(false); refreshAll() }}><span className="ico">🔄</span> Refresh notes</button>
                )}
                <button onClick={() => { setMenuOpen(false); setSettingsOpen(true) }}><span className="ico">⚙️</span> Settings</button>
                <button onClick={() => { setMenuOpen(false); onHelp && onHelp() }}><span className="ico">❓</span> Help</button>
                <button onClick={() => { setMenuOpen(false); onSecurity && onSecurity() }}><span className="ico">🔒</span> Security &amp; privacy</button>
                <a className="am-link" href="/legal-notice.html" target="_blank" rel="noopener" onClick={() => setMenuOpen(false)}><span className="ico">©️</span> Legal notice</a>
                {!guest && (
                  <>
                    <button onClick={() => { setMenuOpen(false); setChangePwOpen(true) }}><span className="ico">🔑</span> Change password</button>
                    <div className="am-sep" />
                    <button className="am-danger" onClick={() => { setMenuOpen(false); logout() }}><span className="ico">⎋</span> Log out</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
        </div>
      </header>

      {sidebarOpen && <div className="drawer-scrim" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)}>
        <button className={`nav-item ${view === 'all' ? 'active' : ''}`} onClick={() => setView('all')}>
          <Icon name="bulb" /> <span className="nav-label">Notes</span>
        </button>
        <button className={`nav-item ${view === 'recordings' ? 'active' : ''}`} onClick={() => setView('recordings')}>
          <Icon name="mic" /> <span className="nav-label">Recordings</span>
        </button>

        <div className="nav-section">Folders</div>
        {folders.map((f) => (
          <button key={f.id} className={`nav-item ${view === f.id ? 'active' : ''}`} onClick={() => setView(f.id)}>
            <Icon name="folder" />
            <span className="nav-label">{f.name}</span>
            {!f.system && (
              <span className="del" onClick={(e) => { e.stopPropagation(); removeFolder(f.id) }}>✕</span>
            )}
          </button>
        ))}
        <form className="add-folder" onSubmit={addFolder} onClick={(e) => e.stopPropagation()}>
          <input placeholder="+ New folder" value={newFolder} maxLength={40} onChange={(e) => setNewFolder(e.target.value)} />
        </form>

        {allTags.length > 0 && <div className="nav-section">Labels</div>}
        {allTags.map((t) => (
          <button key={t} className={`nav-item ${view === `tag:${t}` ? 'active' : ''}`} onClick={() => setView(`tag:${t}`)}>
            <Icon name="label" />
            <span className="nav-label">{t}</span>
          </button>
        ))}

        {guest && (
          <p className="guest-note" style={{ padding: '18px 16px' }}>
            You're in guest mode. Notes stay on this device. <br />Sign in to sync everywhere.
          </p>
        )}
      </aside>

      <main className="main">
        {view === 'recordings' ? (
          <RecordingsView store={store} />
        ) : (
          <>
            <div className="quick-add" onClick={() => setEditing({})}>
              <input placeholder="Take a note…" readOnly />
              <button className="icon-btn" title="New list" aria-label="New list" onClick={(e) => { e.stopPropagation(); setEditing({ kind: 'list' }) }}><Icon name="list" /></button>
              <button className="icon-btn" title="New photo note" aria-label="New photo note" onClick={(e) => { e.stopPropagation(); newImageNote() }}><Icon name="image" /></button>
              <button className="icon-btn" title="New voice note" aria-label="New voice note" onClick={(e) => { e.stopPropagation(); setRecording(true) }}><Icon name="mic" /></button>
            </div>

            {view !== 'all' && <h2 className="view-title">{view.startsWith('tag:') ? `#${view.slice(4)}` : (currentFolder?.name || 'Notes')}</h2>}

            {visibleNotes.length === 0 ? (
              <div className="empty">
                <div className="big">💡</div>
                <p>{search ? 'No notes match your search.' : 'Notes you add appear here. Tap + to start.'}</p>
              </div>
            ) : (
              <>
                {pinnedNotes.length > 0 && (
                  <>
                    <div className="section-label">Pinned</div>
                    <Masonry notes={pinnedNotes} layout={layout} renderCard={renderCard} />
                  </>
                )}
                {otherNotes.length > 0 && (
                  <>
                    {pinnedNotes.length > 0 && <div className="section-label">Others</div>}
                    <Masonry notes={otherNotes} layout={layout} renderCard={renderCard} />
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>

      {fabOpen && <div className="menu-overlay fab-scrim" onClick={() => setFabOpen(false)} />}
      <div className={`fab-wrap ${fabOpen ? 'open' : ''}`}>
        {fabOpen && (
          <div className="fab-menu" role="menu">
            <button role="menuitem" className="fab-item" onClick={newImageNote}><Icon name="image" /><span>Image</span></button>
            <button role="menuitem" className="fab-item" onClick={() => { setFabOpen(false); setRecording(true) }}><Icon name="mic" /><span>Audio</span></button>
            <button role="menuitem" className="fab-item" onClick={() => { setFabOpen(false); setEditing({ kind: 'list' }) }}><Icon name="list" /><span>List</span></button>
            <button role="menuitem" className="fab-item" onClick={() => { setFabOpen(false); setEditing({}) }}><Icon name="text" /><span>Text</span></button>
          </div>
        )}
        <button className="fab-main" aria-label={fabOpen ? 'Close menu' : 'New note'} aria-expanded={fabOpen} onClick={() => setFabOpen((o) => !o)}>
          <Icon name={fabOpen ? 'close' : 'add'} size={34} />
        </button>
      </div>
      <button className="labels-fab" aria-label="Folders and labels" title="Folders and labels" onClick={() => setLabelsOpen(true)}>
        <Icon name="folder" size={28} />
      </button>
      {labelsOpen && (
        <div className="label-sheet-backdrop" onClick={() => setLabelsOpen(false)}>
          <div className="label-sheet" role="dialog" aria-label="Folders and labels" onClick={(e) => e.stopPropagation()}>
            <div className="ls-head">
              <b>Folders and labels</b>
              <button className="icon-btn" aria-label="Close" onClick={() => setLabelsOpen(false)}><Icon name="close" /></button>
            </div>
            <div className="ls-list">
              <button className={`nav-item ${view === 'all' ? 'active' : ''}`} onClick={() => { setView('all'); setLabelsOpen(false) }}>
                <Icon name="bulb" /> <span className="nav-label">All notes</span>
              </button>
              <button className={`nav-item ${view === 'recordings' ? 'active' : ''}`} onClick={() => { setView('recordings'); setLabelsOpen(false) }}>
                <Icon name="mic" /> <span className="nav-label">Recordings</span>
              </button>
              {folders.length > 0 && <div className="nav-section">Folders</div>}
              {folders.map((f) => (
                <button key={f.id} className={`nav-item ${view === f.id ? 'active' : ''}`} onClick={() => { setView(f.id); setLabelsOpen(false) }}>
                  <Icon name="folder" /> <span className="nav-label">{f.name}</span>
                </button>
              ))}
              {allTags.length > 0 && <div className="nav-section">Labels</div>}
              {allTags.map((t) => (
                <button key={t} className={`nav-item ${view === `tag:${t}` ? 'active' : ''}`} onClick={() => { setView(`tag:${t}`); setLabelsOpen(false) }}>
                  <Icon name="label" /> <span className="nav-label">{t}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={onImagePicked} />
      <input ref={avatarInput} type="file" accept="image/*" hidden onChange={pickPicture} />

      {editing && (
        <NoteEditor
          note={editing.id ? editing : null}
          newKind={editing.kind}
          folders={folders}
          currentFolderId={view !== 'all' && view !== 'recordings' && !view.startsWith('tag:') ? view : ''}
          allTags={allTags}
          store={store}
          initialFiles={editing.__files}
          recording={editing.id ? recordingByNote.get(editing.id) : null}
          onSave={saveNote}
          onDelete={deleteNote}
          onClose={() => setEditing(null)}
        />
      )}

      {recording && (
        <RecordModal onClose={() => setRecording(false)} onComplete={handleRecordComplete} />
      )}

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onChangePassword={() => { setSettingsOpen(false); setChangePwOpen(true) }}
          onFeedback={() => { setSettingsOpen(false); setFeedbackOpen(true) }}
          onSecurity={onSecurity}
        />
      )}

      {changePwOpen && (
        <ChangePasswordModal onSubmit={changePassword} onClose={() => setChangePwOpen(false)} />
      )}

      {feedbackOpen && (
        <FeedbackModal onClose={() => setFeedbackOpen(false)} />
      )}

      <NetworkBar />
    </div>
  )
}

// Keep-style staggered grid: notes are dealt left-to-right into columns, so reading
// order runs across the rows. Two columns on a phone, more on wider screens.
function Masonry({ notes, layout, renderCard }) {
  const ref = useRef(null)
  const [cols, setCols] = useState(2)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => setCols(layout === 'list' ? 1 : window.innerWidth > 760 ? Math.max(1, Math.floor((el.clientWidth + 16) / 256)) : Math.max(2, Math.floor((el.clientWidth + 12) / 252)))
    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('orientationchange', fit)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    if (ro) ro.observe(el)
    return () => { window.removeEventListener('resize', fit); window.removeEventListener('orientationchange', fit); if (ro) ro.disconnect() }
  }, [layout])

  const columns = Array.from({ length: cols }, () => [])
  notes.forEach((n, i) => columns[i % cols].push(n))

  return (
    <div ref={ref} className={`masonry ${layout}`}>
      {columns.map((col, i) => <div className="mcol" key={i}>{col.map(renderCard)}</div>)}
    </div>
  )
}
