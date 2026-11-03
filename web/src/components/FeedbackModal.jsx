import { useState } from 'react'
import client from '../api/client'

// In-app feedback form — sends the message through the server (no email app opens).
export default function FeedbackModal({ onClose }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!message.trim()) { setError('Type your feedback first.'); return }
    setBusy(true)
    try {
      await client.post('/feedback', { message })
      setDone(true)
      setTimeout(onClose, 1500)
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't send right now. Please try again in a moment.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="sm-head">
          <h3>Send feedback</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {done ? (
          <p className="cp-done">✓ Thanks — your feedback was sent.</p>
        ) : (
          <form onSubmit={submit} className="cp-form">
            <p className="cp-note">Tell us what to fix or add. It goes straight to the 4thepeople team — no email app needed.</p>
            {error && <div className="error">{error}</div>}
            <textarea
              className="feedback-text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's on your mind?"
              rows={5}
              autoFocus
            />
            <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send feedback'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
