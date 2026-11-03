import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { formatCode, isValidCode } from '../lib/crypto'

export default function AuthScreen({ initialMode = 'login', onBack, onSecurity }) {
  const { login, loginWithNumber, register, completeTwoFactor, continueAsGuest, forgotPassword } = useAuth()
  const [mode, setMode] = useState(initialMode) // 'login' | 'register' | 'forgot'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Logging in: with email and password, or with the 24-digit Keeply number.
  const [how, setHow] = useState('email') // 'email' | 'number'
  const [number, setNumber] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')
  const [busy, setBusy] = useState(false)
  // After the password is right on an account with two-factor: the code step.
  const [challenge, setChallenge] = useState(null)
  const [code, setCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)

  function switchMode(m) { setMode(m); setError(''); setSent('') }
  const byNumber = mode === 'login' && how === 'number'

  function failure(err) {
    const res = err.response
    if (res?.data?.errors) setError(Object.values(res.data.errors).flat()[0])
    else if (res?.status === 429) setError('Too many tries. Wait a minute and try again.')
    else if (res?.data?.message) setError(res.data.message)
    else setError('Something went wrong. Is the server running?')
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'register') await register(name, email, password)
      else if (mode === 'forgot') {
        await forgotPassword(email)
        setSent('If that email is registered, a reset link is on its way — check your inbox (and spam).')
      } else if (byNumber) {
        const result = await loginWithNumber(number)
        if (result.twoFactor) { setChallenge(result.challenge); setCode('') }
      } else {
        const result = await login(email, password)
        if (result.twoFactor) { setChallenge(result.challenge); setCode('') }
      }
    } catch (err) {
      failure(err)
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await completeTwoFactor({ challenge, ...(useRecovery ? { recoveryCode: code } : { code }) })
    } catch (err) {
      failure(err)
    } finally {
      setBusy(false)
    }
  }

  if (challenge) {
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="brand">
            <img src="/icon.svg" alt="Keeply" />
            <h1>Two-factor sign-in</h1>
            <p className="tag">{useRecovery ? 'Enter one of your recovery codes' : 'Enter the 6-digit code from your authenticator app'}</p>
          </div>
          {error && <div className="error">{error}</div>}
          <form onSubmit={submitCode}>
            <div className="field">
              <label>{useRecovery ? 'Recovery code' : 'Authenticator code'}</label>
              <input
                className={useRecovery ? '' : 'code-input'}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode={useRecovery ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                autoFocus
                maxLength={useRecovery ? 16 : 7}
                placeholder={useRecovery ? 'xxxxx-xxxxx' : '123 456'}
                required
              />
            </div>
            <button className="btn" disabled={busy}>{busy ? 'Checking…' : 'Verify and log in'}</button>
          </form>
          <p className="auth-switch">
            <button onClick={() => { setUseRecovery((v) => !v); setCode(''); setError('') }}>
              {useRecovery ? 'Use my authenticator app instead' : 'Lost your phone? Use a recovery code'}
            </button>
          </p>
          <button type="button" className="auth-back" onClick={() => { setChallenge(null); setPassword(''); setNumber(''); setError(''); setUseRecovery(false) }}>← Back to log in</button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand">
          <img src="/icon.svg" alt="Keeply" />
          <h1>4thepeople Notes</h1>
          <p className="tag">Notes &amp; voice recordings, synced everywhere</p>
        </div>

        <h2>{mode === 'register' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}</h2>

        {mode === 'login' && (
          <div className="how-switch" role="tablist" aria-label="How to log in">
            <button type="button" role="tab" aria-selected={how === 'email'} className={how === 'email' ? 'on' : ''} onClick={() => { setHow('email'); setError('') }}>Email</button>
            <button type="button" role="tab" aria-selected={how === 'number'} className={how === 'number' ? 'on' : ''} onClick={() => { setHow('number'); setError('') }}>My 24-digit number</button>
          </div>
        )}

        {mode === 'forgot' && !sent && (
          <p className="auth-help">Enter the email you signed up with and we'll send you a link to set a new password.</p>
        )}
        {error && <div className="error">{error}</div>}
        {sent && <div className="sent">{sent}</div>}

        {!(mode === 'forgot' && sent) && (
          <form onSubmit={submit}>
            {byNumber && (
              <div className="field">
                <label>Your Keeply number</label>
                <input
                  className="code-input long"
                  value={number}
                  onChange={(e) => { setNumber(formatCode(e.target.value.slice(0, 40))); setError('') }}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0000 0000 0000 0000 0000 0000"
                />
                <span className="gate-note">The 24 digits you got when you set up. No email or password needed.</span>
              </div>
            )}
            {mode === 'register' && (
              <div className="field">
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" required />
              </div>
            )}
            {!byNumber && (
              <div className="field">
                <label>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
            )}
            {mode !== 'forgot' && !byNumber && (
              <div className="field">
                <label>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={8} required />
                {mode === 'login' && (
                  <button type="button" className="auth-forgot" onClick={() => switchMode('forgot')}>Forgot password?</button>
                )}
              </div>
            )}
            <button className="btn" disabled={busy || (byNumber && !isValidCode(number))}>
              {busy ? 'Please wait…' : mode === 'register' ? 'Sign up' : mode === 'forgot' ? 'Send reset link' : 'Log in'}
            </button>
          </form>
        )}

        {mode === 'forgot' ? (
          <p className="auth-switch">
            <button onClick={() => switchMode('login')}>← Back to log in</button>
          </p>
        ) : (
          <p className="auth-switch">
            {mode === 'register' ? 'Already have an account? ' : "Don't have an account? "}
            <button onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}>
              {mode === 'register' ? 'Log in' : 'Sign up'}
            </button>
          </p>
        )}

        {mode !== 'forgot' && (
          <>
            <div className="divider">or</div>
            <button className="btn ghost" onClick={continueAsGuest}>Continue as guest</button>
            <p className="guest-note">
              Guest mode keeps notes on this device only. Sign in to sync across your phone and computers.
            </p>
          </>
        )}
        {onSecurity && (
          <button type="button" className="auth-back" onClick={onSecurity}>🔒 How Keeply keeps your notes private</button>
        )}
        {onBack && (
          <button type="button" className="auth-back" onClick={onBack}>← Back to home</button>
        )}
      </div>
    </div>
  )
}
