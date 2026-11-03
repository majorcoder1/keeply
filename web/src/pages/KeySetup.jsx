import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { formatCode } from '../lib/crypto'
import { copyText } from '../lib/clipboard'
import { saveBlob } from '../lib/save'

// Shows the person their new 24-digit Keeply number. It's made on this device and only
// the one-way values made from it go to the server — never the number itself. The number
// locks the notes and can also be used to log in.
export default function KeySetup({ onSecurity }) {
  const { makeKeyCode, saveNewKey, logout, user } = useAuth()
  const [code] = useState(() => makeKeyCode())
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [filed, setFiled] = useState(false)

  const groups = formatCode(code).split(' ')

  async function go() {
    setBusy(true)
    setError('')
    try {
      await saveNewKey(code)
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't save your number. Check your connection and try again.")
      setBusy(false)
    }
  }

  async function toFile() {
    const text = [
      'Your Keeply number',
      '',
      formatCode(code),
      '',
      'Log in with it at https://keeply.4thepeople.live (choose "My 24-digit number"), or log in with your email' + (user?.email ? ' (' + user.email + ')' : '') + '.',
      'It also unlocks your notes on a new phone or computer.',
      'Keep this file private. Nobody can get the number back for you if it is lost.',
      '',
    ].join('\n')
    try {
      if (await saveBlob(new Blob([text], { type: 'text/plain' }), 'Keeply-number.txt')) setFiled(true)
    } catch {
      setError("Couldn't save the file. Copy the number or write it down instead.")
    }
  }

  return (
    <div className="auth">
      <div className="auth-card wide">
        <div className="brand">
          <img src="/icon.svg" alt="Keeply" />
          <h1>Your Keeply number</h1>
          <p className="tag">Use it to log in, or log in with your email.</p>
        </div>

        <div className="key-code" aria-label="Your Keeply number">
          {groups.map((g, i) => <span key={i}>{g}</span>)}
        </div>
        <div className="gate-actions">
          <button type="button" className="btn ghost" onClick={async () => { setCopied(await copyText(formatCode(code))); setTimeout(() => setCopied(false), 2000) }}>{copied ? 'Copied ✓' : 'Copy'}</button>
          <button type="button" className="btn ghost" onClick={toFile}>{filed ? 'Saved ✓' : 'Save as file'}</button>
        </div>

        <ul className="gate-points">
          <li><b>Save it now.</b> Copy it, save the file, or write it down.</li>
          <li>Type it on any phone or computer to log in. It also opens your notes there.</li>
          <li>We never see it, so <b>we can't get it back for you.</b></li>
        </ul>

        <label className="gate-check">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span>I saved my number.</span>
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={!saved || busy} onClick={go}>{busy ? 'Securing…' : 'Continue'}</button>

        <div className="gate-links">
          {onSecurity && <button type="button" className="auth-back" onClick={onSecurity}>🔒 How this works</button>}
          <button type="button" className="auth-back" onClick={logout}>Log out</button>
        </div>
      </div>
    </div>
  )
}
