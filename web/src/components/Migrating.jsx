import { useEffect, useState } from 'react'

// Right after the key is on this device: lock anything still saved the old, readable way.
// Runs once per sign-in and does nothing if there's nothing to lock.
export default function Migrating({ store, onDone }) {
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  // What couldn't be locked because the server no longer had the file (shown once, then on to the notes).
  const [missing, setMissing] = useState(null)

  useEffect(() => {
    let cancelled = false
    setError('')
    store.migrateLegacy((p) => { if (!cancelled) setProgress(p) })
      .then((summary) => {
        if (cancelled) return
        if (summary && (summary.lostPhotos || summary.lostRecordings)) setMissing(summary)
        else onDone()
      })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.message || err.message || 'Something went wrong.') })
    return () => { cancelled = true }
  }, [store, attempt, onDone])

  if (missing) {
    const photos = missing.lostPhotos, recs = missing.lostRecordings
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="brand">
            <img src="/icon.svg" alt="Keeply" />
            <h1>Your notes are locked</h1>
            <p className="tag">A few old files were already missing.</p>
          </div>
          <ul className="gate-points">
            {photos > 0 && <li>{photos} {photos === 1 ? 'photo was' : 'photos were'} already gone from the server, so {photos === 1 ? 'it was' : 'they were'} left out. The notes and their words are safe.</li>}
            {recs > 0 && <li>{recs} {recs === 1 ? 'recording has' : 'recordings have'} no sound file left on the server, so {recs === 1 ? 'it' : 'they'} couldn't be locked. {recs === 1 ? 'It stays' : 'They stay'} in your Recordings list, and you can delete {recs === 1 ? 'it' : 'them'} there.</li>}
          </ul>
          <button className="btn" onClick={onDone}>Continue</button>
        </div>
      </div>
    )
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  const busy = progress.total > 0

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <img src="/icon.svg" alt="Keeply" />
          <h1>{busy ? 'Locking your notes' : 'Opening Keeply'}</h1>
          <p className="tag">{busy ? 'One-time step. Please keep Keeply open.' : 'Checking for notes that still need locking…'}</p>
        </div>
        {busy && (
          <>
            <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
            <p className="gate-note" style={{ textAlign: 'center' }}>{progress.done} of {progress.total}</p>
          </>
        )}
        {error && (
          <>
            <div className="error">Couldn't finish: {error}</div>
            <button className="btn" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
          </>
        )}
      </div>
    </div>
  )
}
