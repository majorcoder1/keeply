import { useEffect, useState } from 'react'
import { SecureAudio } from './Secure'

// Every saved recording. Audio is locked on the server, so each one is fetched and
// unlocked only when you tap Play.
export default function RecordingsView({ store }) {
  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setRecordings(await store.recordings())
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])

  async function remove(id) {
    if (!confirm('Delete this recording? The note it came with is kept.')) return
    await store.deleteRecording(id)
    load()
  }

  if (loading) return <p style={{ color: 'var(--text-soft)' }}>Loading recordings…</p>

  return (
    <>
      <h2 className="view-title">Recordings</h2>
      {recordings.length === 0 ? (
        <div className="empty">
          <div className="big">🎙️</div>
          <p>Your voice recordings appear here. Tap the mic to make one.</p>
        </div>
      ) : (
        <div className="grid">
          {recordings.map((r) => (
            <div className="card" key={r.id}>
              <h3>{r.title || 'Recording'}</h3>
              <div className="meta">
                <span>{fmtDur(r.duration)}</span>
                <span>·</span>
                <span>{fmtDate(r.created_at)}</span>
              </div>
              <SecureAudio recording={r} store={store} />
              <div className="meta" style={{ justifyContent: 'flex-end' }}>
                <button className="icon-btn" title="Delete" onClick={() => remove(r.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function fmtDur(sec = 0) {
  const m = Math.floor(sec / 60)
  const s = String(Math.round(sec % 60)).padStart(2, '0')
  return `${m}:${s}`
}
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
