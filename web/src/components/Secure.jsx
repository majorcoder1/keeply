import { useEffect, useState } from 'react'
import Icon from './Icon'

// A photo that is stored locked: fetched and unlocked here, shown once it's ready.
export function SecureImage({ src, store, alt = '', className }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    setFailed(false)
    store.imageUrl(src).then((u) => { if (live) setUrl(u) }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [src, store])

  if (failed) return <div className={`img-state ${className || ''}`}>Photo can't be opened</div>
  if (!url) return <div className={`img-state ${className || ''}`}><span className="mini-spin" /></div>
  return <img className={className} src={url} alt={alt} loading="lazy" />
}

// A voice recording: tap to fetch and unlock it, then it plays. (Recordings can be long,
// so nothing is downloaded until the person asks to hear it.)
export function SecureAudio({ recording, store, className }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function load() {
    setBusy(true)
    setFailed(false)
    try {
      setUrl(await store.recordingUrl(recording))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  if (url) return <audio className={className} controls autoPlay src={url} />
  return (
    <button type="button" className={`play-btn ${className || ''}`} onClick={load} disabled={busy}>
      {busy ? <span className="mini-spin" /> : <Icon name="play" size={22} />}
      <span>{busy ? 'Unlocking…' : failed ? 'Couldn’t open — try again' : `Play recording${recording.duration ? ` · ${fmtDur(recording.duration)}` : ''}`}</span>
    </button>
  )
}

function fmtDur(sec = 0) {
  const m = Math.floor(sec / 60)
  return `${m}:${String(Math.round(sec % 60)).padStart(2, '0')}`
}
