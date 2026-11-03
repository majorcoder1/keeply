import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { createAudioRecorder, createLevelMeter, recordingSupported } from '../lib/recorder'

// The voice-note window: record, then (optionally) add a title and a few typed words.
// On save, the audio is locked and goes to Recordings, and a note holding the typed words
// is made in the Record folder. Nothing is transcribed — locked audio can't be.
export default function RecordModal({ onClose, onComplete }) {
  const [phase, setPhase] = useState('idle') // idle | recording | review
  const [seconds, setSeconds] = useState(0)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { blob, duration }
  const [audioUrl, setAudioUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const r = useRef({}).current // recorder + timer
  const meterRef = useRef(null)
  const canRecord = recordingSupported()

  // Closing the window mid-recording throws the recording away and frees the mic.
  useEffect(() => () => {
    clearInterval(r.timer)
    r.recorder?.cancel()
    meterRef.current?.stop()
  }, [r])

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }, [audioUrl])

  async function start() {
    setError('')
    const recorder = createAudioRecorder()
    let stream
    try {
      stream = await recorder.start()
    } catch {
      setError('Microphone access was blocked. Allow the microphone for Keeply and try again.')
      return
    }
    r.recorder = recorder
    meterRef.current = createLevelMeter(stream)
    const t0 = Date.now()
    setSeconds(0)
    r.timer = setInterval(() => setSeconds(Math.floor((Date.now() - t0) / 1000)), 500)
    setPhase('recording')
  }

  async function stop() {
    clearInterval(r.timer)
    const rec = await r.recorder.stop()
    meterRef.current?.stop()
    setResult(rec)
    if (rec?.blob) setAudioUrl(URL.createObjectURL(rec.blob))
    setTitle(defaultTitle())
    setPhase('review')
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      await onComplete({
        blob: result?.blob,
        duration: result?.duration || seconds,
        text: text.trim(),
        title: title.trim() || defaultTitle(),
      })
    } catch {
      setSaving(false)
      setError("Couldn't save the recording. Check your connection and try again.")
    }
  }

  function discard() {
    if (saving) return
    if (confirm('Discard this recording?')) onClose()
  }

  const backdropClick = phase === 'idle' ? onClose : phase === 'review' ? discard : undefined

  return (
    <div className="modal-backdrop sheet-backdrop rec-backdrop" onClick={backdropClick}>
      <div className="modal rec-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rec-head">
          {phase === 'review' ? (
            <input className="title-input rec-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" />
          ) : (
            <h2>Voice note</h2>
          )}
          {(phase === 'idle' || phase === 'review') && (
            <button className="icon-btn" aria-label="Close" onClick={phase === 'idle' ? onClose : discard}><Icon name="close" /></button>
          )}
        </div>

        {error && <div className="error">{error}</div>}
        {!canRecord && <div className="error">This browser can't record audio.</div>}

        <div className="rec-body">
          <div className="rec-pane audio-pane">
            {phase === 'idle' && (
              <>
                <button className="rec-big" onClick={start} disabled={!canRecord} aria-label="Start recording"><Icon name="mic" size={40} /></button>
                <p className="rec-lead">Tap to start recording.</p>
                <p className="rec-sub">Your recording is locked on this device before it's saved, so only you can play it back.</p>
              </>
            )}
            {phase === 'recording' && (
              <>
                <div className="rec-clock">{fmt(seconds)}</div>
                <Waveform meterRef={meterRef} active />
                <p className="rec-sub">Recording… Keeply keeps going if the screen turns off.</p>
              </>
            )}
            {phase === 'review' && (
              <>
                {audioUrl && <audio controls src={audioUrl} className="rec-player" />}
                <p className="rec-sub">{fmt(Math.round(result?.duration || seconds))} recorded. It will be locked and saved to Recordings.</p>
                <textarea className="rec-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a few words about it (optional)…" />
              </>
            )}
          </div>
        </div>

        <div className="rec-foot">
          {phase === 'idle' && (
            <button className="btn rec-start" onClick={start} disabled={!canRecord}><Icon name="mic" size={20} /> Start recording</button>
          )}
          {phase === 'recording' && (
            <>
              <span className="rec-dot" />
              <span className="rec-time">{fmt(seconds)}</span>
              <div className="spacer" />
              <button className="btn rec-stop" onClick={stop}><Icon name="stop" size={20} /> Stop</button>
            </>
          )}
          {phase === 'review' && (
            <>
              <button className="btn ghost" style={{ width: 'auto' }} onClick={discard} disabled={saving}>Discard</button>
              <div className="spacer" />
              <button className="btn" style={{ width: 'auto', padding: '10px 26px' }} onClick={save} disabled={saving}>{saving ? 'Locking and saving…' : 'Save'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Scrolling level bars, newest on the right.
function Waveform({ meterRef, active }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!active) return
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const color = getComputedStyle(canvas).color
    const levels = []
    let raf = 0
    let last = 0
    function draw(t) {
      raf = requestAnimationFrame(draw)
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      if (t - last > 60) {
        last = t
        levels.push(meterRef.current?.level() || 0)
        if (levels.length > 600) levels.shift()
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = color
      const bar = 3
      const step = 5
      const n = Math.min(levels.length, Math.floor(w / step))
      for (let k = 0; k < n; k++) {
        const v = Math.min(1, Math.pow(levels[levels.length - 1 - k] * 7, 0.8))
        const bh = Math.max(3, v * (h - 6))
        ctx.fillRect(w - (k + 1) * step, (h - bh) / 2, bar, bh)
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [active, meterRef])
  return <canvas ref={ref} className="waveform" aria-hidden="true" />
}

function defaultTitle() {
  const d = new Date()
  return `Recording ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function fmt(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
