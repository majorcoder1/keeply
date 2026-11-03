import { useState } from 'react'
import { saveSetting, useSettings } from '../lib/settings'
import { useAuth } from '../auth/AuthContext'
import { copyText } from '../lib/clipboard'
import { buildExport } from '../lib/exporter'
import { saveBlob } from '../lib/save'
import { formatCode, isValidCode } from '../lib/crypto'

function Toggle({ on, onChange, disabled }) {
  return (
    <button
      type="button"
      className={`switch ${on ? 'on' : 'off'} ${disabled ? 'disabled' : ''}`}
      onClick={disabled ? undefined : () => onChange(!on)}
      aria-pressed={on}
      aria-label="toggle"
      disabled={disabled}
    />
  )
}

export default function SettingsModal({ onClose, onChangePassword, onFeedback, onSecurity }) {
  const settings = useSettings()
  const { guest, user, store, newRecoveryCodes, forgetThisDevice, enableNumberLogin } = useAuth()
  const [exportState, setExportState] = useState({ phase: 'idle' }) // idle | working | done | error
  // Only inside the Android app: block screenshots and hide Keeply in the recent-apps screen.
  const bridge = typeof window !== 'undefined' ? window.KeeplyApp : null
  const [secureOn, setSecureOn] = useState(() => {
    try { return bridge && typeof bridge.isSecure === 'function' ? !!bridge.isSecure() : null } catch { return null }
  })
  const [codeStep, setCodeStep] = useState('') // '' | 'ask' | 'show'
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState([])
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const [numberStep, setNumberStep] = useState('') // '' | 'ask'
  const [numberText, setNumberText] = useState('')
  const [numberMsg, setNumberMsg] = useState('')
  const [numberBusy, setNumberBusy] = useState(false)

  async function makeCodes(e) {
    e.preventDefault()
    setMsg('')
    try {
      setCodes(await newRecoveryCodes(code))
      setCodeStep('show')
      setCode('')
    } catch (err) {
      const res = err.response
      setMsg(res?.data?.errors ? Object.values(res.data.errors).flat()[0] : res?.data?.message || 'Something went wrong.')
    }
  }

  // Everything, unlocked on this device and saved as one .zip the person keeps.
  async function runExport() {
    setExportState({ phase: 'working', text: 'Getting your notes ready…' })
    try {
      const { blob, filename, counts } = await buildExport(store, ({ done, total }) =>
        setExportState({ phase: 'working', text: total ? `Getting your notes ready… ${done} of ${total}` : 'Getting your notes ready…' }))
      const saved = await saveBlob(blob, filename, (sent, size) =>
        setExportState({ phase: 'working', text: `Saving… ${Math.round((sent / size) * 100)}%` }))
      setExportState(saved
        ? { phase: 'done', text: `Saved ${filename}: ${counts.notes} note(s), ${counts.photos} photo(s), ${counts.recordings} recording(s).` }
        : { phase: 'idle' })
    } catch (err) {
      setExportState({ phase: 'error', text: err?.message || 'Something went wrong. Please try again.' })
    }
  }

  async function turnOnNumber(e) {
    e.preventDefault()
    setNumberBusy(true)
    setNumberMsg('')
    try {
      if (await enableNumberLogin(numberText)) { setNumberStep(''); setNumberText('') }
      else setNumberMsg("That number doesn't match. Check all 24 digits.")
    } catch (err) {
      setNumberMsg(err.response?.data?.message || 'Something went wrong. Try again.')
    }
    setNumberBusy(false)
  }

  async function removeKey() {
    if (!confirm("Remove the number from this device?\n\nYou'll need to type your 24-digit Keeply number again to open your notes here. Make sure you still have it written down.")) return
    await forgetThisDevice()
    onClose()
  }

  function set(key, val) {
    saveSetting(key, val)
    if (key === 'darkMode') {
      document.documentElement.dataset.theme = val ? 'dark' : 'light'
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sm-head">
          <h3>Settings</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="sm-section">
          <div className="sm-title">Appearance</div>
          <div className="sm-opt">
            <span className="sm-label">Enable dark mode<span className="sm-sub">Easier on the eyes at night</span></span>
            <Toggle on={!!settings.darkMode} onChange={(v) => set('darkMode', v)} />
          </div>
          {secureOn !== null && (
            <div className="sm-opt">
              <span className="sm-label">Block screenshots<span className="sm-sub">Also hides Keeply in the recent-apps screen</span></span>
              <Toggle on={secureOn} onChange={(v) => { bridge.setSecure(v); setSecureOn(v) }} />
            </div>
          )}
        </div>

        <div className="sm-section">
          <div className="sm-title">Notes and lists</div>
          <div className="sm-opt">
            <span className="sm-label">Add new items to the bottom<span className="sm-sub">New checklist items go at the end of the list. Off: at the top.</span></span>
            <Toggle on={!!settings.addToBottom} onChange={(v) => set('addToBottom', v)} />
          </div>
          <div className="sm-opt">
            <span className="sm-label">Move checked items to the bottom<span className="sm-sub">Ticked items drop into a "completed items" group. Off: they stay in place, crossed out.</span></span>
            <Toggle on={!!settings.checkedToBottom} onChange={(v) => set('checkedToBottom', v)} />
          </div>
          <div className="sm-opt">
            <span className="sm-label">Display rich link previews<span className="sm-sub">{guest ? 'Sign in to use this.' : 'Shows a card for web addresses in your notes. To make the card, our server looks up the address. It sees the address, never your note.'}</span></span>
            <Toggle on={!!settings.linkPreviews && !guest} disabled={guest} onChange={(v) => set('linkPreviews', v)} />
          </div>
          <div className="sm-opt">
            <span className="sm-label">Enable sharing<span className="sm-sub">Adds a Share button to notes, to send the words to another app.</span></span>
            <Toggle on={!!settings.sharing} onChange={(v) => set('sharing', v)} />
          </div>
        </div>

        {!guest && user && (
          <div className="sm-section">
            <div className="sm-title">Security</div>
            <div className="sm-opt">
              <span className="sm-label">Two-factor sign-in<span className="sm-sub">Authenticator app code at every login</span></span>
              <span className="sm-on">On</span>
            </div>
            <div className="sm-opt">
              <span className="sm-label">Keeply number on this device<span className="sm-sub">Locks and unlocks your notes</span></span>
              <button className="sm-link" onClick={removeKey}>Remove ›</button>
            </div>
            <div className="sm-opt">
              <span className="sm-label">Log in with my number<span className="sm-sub">Use your 24 digits instead of email and password</span></span>
              {user.number_set
                ? <span className="sm-on">On</span>
                : <button className="sm-link" onClick={() => { setNumberStep('ask'); setNumberMsg('') }}>Turn on ›</button>}
            </div>
            {numberStep === 'ask' && !user.number_set && (
              <form className="sm-inline" onSubmit={turnOnNumber}>
                <label>Type your 24-digit Keeply number once</label>
                <input className="code-input long" value={numberText} onChange={(e) => { setNumberText(formatCode(e.target.value.slice(0, 40))); setNumberMsg('') }} inputMode="numeric" autoComplete="off" placeholder="0000 0000 0000 0000 0000 0000" autoFocus />
                {numberMsg && <div className="error">{numberMsg}</div>}
                <button className="btn" disabled={numberBusy || !isValidCode(numberText)} style={{ width: 'auto', padding: '9px 20px' }}>{numberBusy ? 'Checking…' : 'Turn on'}</button>
              </form>
            )}
            <div className="sm-opt">
              <span className="sm-label">Recovery codes<span className="sm-sub">Get a new set (the old ones stop working)</span></span>
              <button className="sm-link" onClick={() => { setCodeStep('ask'); setMsg('') }}>New codes ›</button>
            </div>
            {codeStep === 'ask' && (
              <form className="sm-inline" onSubmit={makeCodes}>
                <label>Enter the current 6-digit code from your authenticator app</label>
                <input className="code-input" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123 456" autoFocus />
                {msg && <div className="error">{msg}</div>}
                <button className="btn" style={{ width: 'auto', padding: '9px 20px' }}>Get new codes</button>
              </form>
            )}
            {codeStep === 'show' && (
              <div className="sm-inline">
                <div className="recovery-grid">{codes.map((c) => <code key={c}>{c}</code>)}</div>
                <button className="sm-link" onClick={async () => { setCopied(await copyText(codes.join('\n'))); setTimeout(() => setCopied(false), 2000) }}>{copied ? 'Copied ✓' : 'Copy codes'}</button>
                <span className="gate-note">Save them now. They won't be shown again.</span>
              </div>
            )}
            <div className="sm-opt">
              <span className="sm-label">How Keeply keeps your notes private</span>
              <button className="sm-link" onClick={() => { onClose(); onSecurity?.() }}>Read ›</button>
            </div>
          </div>
        )}

        {store && (
          <div className="sm-section">
            <div className="sm-title">Your data</div>
            <div className="sm-opt">
              <span className="sm-label">Export my notes<span className="sm-sub">One .zip with your notes, photos and voice recordings. It isn't locked, so keep it safe.</span></span>
              <button className="sm-link" onClick={runExport} disabled={exportState.phase === 'working'}>{exportState.phase === 'working' ? 'Working…' : 'Export ›'}</button>
            </div>
            {exportState.text && <div className={exportState.phase === 'error' ? 'error' : 'gate-note'} style={{ margin: '4px 0 10px' }}>{exportState.text}</div>}
          </div>
        )}

        <div className="sm-section">
          <div className="sm-title">More</div>
          <div className="sm-opt">
            <span className="sm-label">Send feedback<span className="sm-sub">Tell us what to fix or add</span></span>
            <button className="sm-link" onClick={onFeedback}>Open ›</button>
          </div>
          <div className="sm-opt">
            <span className="sm-label">Change password</span>
            <button className="sm-link" onClick={onChangePassword}>Change ›</button>
          </div>
        </div>
      </div>
    </div>
  )
}
