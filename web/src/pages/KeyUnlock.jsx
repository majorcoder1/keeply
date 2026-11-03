import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { formatCode, isValidCode } from '../lib/crypto'

// A phone or computer that doesn't have the number yet: type the 24 digits once.
export default function KeyUnlock({ onSecurity }) {
  const { unlockWithCode, startOver, logout, user } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lost, setLost] = useState(false)
  const [password, setPassword] = useState('')
  const [erase, setErase] = useState('')

  function onType(e) {
    // Group as you type: 1234 5678 …
    setCode(formatCode(e.target.value.slice(0, 40)))
    setError('')
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (!(await unlockWithCode(code))) {
        setError("That number doesn't match. Check the 24 digits and try again.")
        setBusy(false)
      }
    } catch {
      setError('Something went wrong. Try again.')
      setBusy(false)
    }
  }

  async function reset(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await startOver(password)
    } catch (err) {
      const res = err.response
      setError(res?.data?.errors ? Object.values(res.data.errors).flat()[0] : res?.data?.message || 'Something went wrong. Try again.')
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-card wide">
        <div className="brand">
          <img src="/icon.svg" alt="Keeply" />
          <h1>Unlock your notes</h1>
          <p className="tag">Type your 24-digit Keeply number to open {user?.email} on this device.</p>
        </div>

        {!lost ? (
          <>
            <form onSubmit={submit}>
              <div className="field">
                <label>Your Keeply number</label>
                <input className="code-input long" value={code} onChange={onType} inputMode="numeric" autoComplete="off" autoFocus placeholder="0000 0000 0000 0000 0000 0000" />
              </div>
              {error && <div className="error">{error}</div>}
              <button className="btn" disabled={busy || !isValidCode(code)}>{busy ? 'Unlocking… this takes a few seconds' : 'Unlock'}</button>
            </form>
            <p className="gate-note">You only do this once on each device. It's kept safely on this device afterwards.</p>
            <p className="auth-switch"><button onClick={() => { setLost(true); setError('') }}>I've lost my number</button></p>
          </>
        ) : (
          <form onSubmit={reset}>
            <div className="error" style={{ marginBottom: 12 }}>
              <b>This erases everything.</b> Nobody can recover a lost number, not even us. The only way forward is to delete every note, photo and recording in this account and start again with a new number.
            </div>
            <div className="field">
              <label>Your account password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            <div className="field">
              <label>Type ERASE to confirm</label>
              <input value={erase} onChange={(e) => setErase(e.target.value)} autoComplete="off" placeholder="ERASE" />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="btn danger" disabled={busy || erase.trim().toUpperCase() !== 'ERASE' || !password}>{busy ? 'Erasing…' : 'Erase everything and start over'}</button>
            <p className="auth-switch"><button type="button" onClick={() => { setLost(false); setError('') }}>← Back</button></p>
          </form>
        )}

        <div className="gate-links">
          {onSecurity && <button type="button" className="auth-back" onClick={onSecurity}>🔒 How this works</button>}
          <button type="button" className="auth-back" onClick={logout}>Log out</button>
        </div>
      </div>
    </div>
  )
}
