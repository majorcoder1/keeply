import { useState } from 'react'

// Change password without asking for the current one (the user is already signed in).
export default function ChangePasswordModal({ onSubmit, onClose }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (pw.length < 8) { setError('Use at least 8 characters.'); return }
    if (pw !== pw2) { setError("The two passwords don't match."); return }
    setBusy(true)
    try {
      await onSubmit(pw)
      setDone(true)
      setTimeout(onClose, 1200)
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not change your password. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="sm-head">
          <h3>Change password</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {done ? (
          <p className="cp-done">✓ Password changed.</p>
        ) : (
          <form onSubmit={submit} className="cp-form">
            <p className="cp-note">Enter a new password. You won't need your old one.</p>
            {error && <div className="error">{error}</div>}
            <label className="cp-field">
              <span>New password</span>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" autoFocus />
            </label>
            <label className="cp-field">
              <span>Confirm new password</span>
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="••••••••" />
            </label>
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
