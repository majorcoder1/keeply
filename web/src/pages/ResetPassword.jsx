import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

// Shown when the app is opened via the emailed reset link (…/?reset=TOKEN&email=…).
// Lets the user set a new password, then hands them back to the login screen.
export default function ResetPassword({ token, email, onDone }) {
  const { resetPassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('The two passwords don’t match.'); return }
    setBusy(true)
    try {
      await resetPassword({ token, email, password })
      setDone(true)
    } catch (err) {
      const res = err.response
      if (res?.data?.errors) setError(Object.values(res.data.errors).flat()[0])
      else if (res?.data?.message) setError(res.data.message)
      else setError('That reset link is invalid or has expired. Request a new one.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <img src="/icon.svg" alt="Keeply" />
          <h1>4thepeople Notes</h1>
          <p className="tag">Notes &amp; voice recordings, synced everywhere</p>
        </div>

        <h2>Set a new password</h2>

        {done ? (
          <>
            <div className="sent">Your password has been updated. You can log in with it now.</div>
            <button className="btn" onClick={() => onDone('login')}>Go to log in</button>
          </>
        ) : (
          <>
            <p className="auth-help">Resetting the password for <strong>{email}</strong>.</p>
            {error && <div className="error">{error}</div>}
            <form onSubmit={submit}>
              <div className="field">
                <label>New password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={8} required />
              </div>
              <div className="field">
                <label>Confirm new password</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" minLength={8} required />
              </div>
              <button className="btn" disabled={busy}>{busy ? 'Please wait…' : 'Update password'}</button>
            </form>
            <p className="auth-switch">
              <button onClick={() => onDone('login')}>← Back to log in</button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
