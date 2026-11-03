import { useEffect, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import { useAuth } from '../auth/AuthContext'
import { copyText, downloadText, inAndroidApp } from '../lib/clipboard'

// Required once per account: pair an authenticator app, then save recovery codes.
export default function TwoFactorSetup({ onSecurity }) {
  const { user, startTwoFactorSetup, confirmTwoFactor, finishTwoFactorSetup, logout } = useAuth()
  const [setup, setSetup] = useState(null) // { secret, otpauth }
  const [qr, setQr] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [codes, setCodes] = useState(null)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    startTwoFactorSetup()
      .then((d) => {
        setSetup(d)
        const q = qrcode(0, 'M')
        q.addData(d.otpauth)
        q.make()
        setQr(q.createDataURL(6, 3))
      })
      .catch(() => setError("Couldn't start setup. Check your connection and reload."))
  }, [startTwoFactorSetup])

  async function confirm(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      setCodes(await confirmTwoFactor(code))
    } catch (err) {
      const res = err.response
      setError(res?.data?.errors ? Object.values(res.data.errors).flat()[0] : res?.data?.message || 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function copy(what, text) {
    setCopied((await copyText(text)) ? what : '')
    setTimeout(() => setCopied(''), 2000)
  }

  const grouped = setup ? setup.secret.match(/.{1,4}/g).join(' ') : ''

  if (codes) {
    const text = `Keeply recovery codes for ${user?.email}\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`
    return (
      <div className="auth">
        <div className="auth-card wide">
          <div className="brand">
            <img src="/icon.svg" alt="Keeply" />
            <h1>Save your recovery codes</h1>
            <p className="tag">If you lose your phone, each of these gets you in once.</p>
          </div>
          <div className="recovery-grid">
            {codes.map((c) => <code key={c}>{c}</code>)}
          </div>
          <div className="gate-actions">
            <button type="button" className="btn ghost" onClick={() => copy('codes', codes.join('\n'))}>{copied === 'codes' ? 'Copied ✓' : 'Copy'}</button>
            {!inAndroidApp && <button type="button" className="btn ghost" onClick={() => downloadText('keeply-recovery-codes.txt', text)}>Download</button>}
          </div>
          <p className="gate-note">Write them down or put them in a password manager. We can't show them again.</p>
          <label className="gate-check">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            <span>I've saved my recovery codes somewhere safe.</span>
          </label>
          <button className="btn" disabled={!saved} onClick={finishTwoFactorSetup}>Continue</button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth">
      <div className="auth-card wide">
        <div className="brand">
          <img src="/icon.svg" alt="Keeply" />
          <h1>Turn on two-factor sign-in</h1>
          <p className="tag">A password alone is no longer enough to open your notes.</p>
        </div>

        <ol className="gate-steps">
          <li>Install an authenticator app on your phone, like <b>Google Authenticator</b>, <b>Authy</b>, <b>2FAS</b> or <b>Aegis</b>.</li>
          <li>In the app, add an account by scanning this picture{setup ? '' : ' (loading…)'}.</li>
        </ol>

        {qr && <div className="qr-wrap"><img src={qr} alt="QR code to scan with your authenticator app" width="220" height="220" /></div>}
        {setup && (
          <div className="secret-box">
            <span className="gate-note">Can't scan? Enter this key in the app instead:</span>
            <code>{grouped}</code>
            <button type="button" className="sm-link" onClick={() => copy('secret', setup.secret)}>{copied === 'secret' ? 'Copied ✓' : 'Copy'}</button>
          </div>
        )}

        <form onSubmit={confirm}>
          <div className="field">
            <label>3. Type the 6-digit code the app now shows</label>
            <input className="code-input" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123 456" required />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={busy || !setup}>{busy ? 'Checking…' : 'Turn on two-factor'}</button>
        </form>

        <div className="gate-links">
          {onSecurity && <button type="button" className="auth-back" onClick={onSecurity}>🔒 Why we're asking</button>}
          <button type="button" className="auth-back" onClick={logout}>Log out</button>
        </div>
      </div>
    </div>
  )
}
