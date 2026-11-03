// The pop-up every person sees once after the security update, before the new steps
// (two-factor, then their Keeply number).
export default function SecurityNotice({ onContinue, onLearnMore }) {
  return (
    <div className="notice-backdrop" role="dialog" aria-modal="true" aria-labelledby="notice-title">
      <div className="notice-card">
        <div className="notice-top">4 The People</div>
        <h1 className="notice-brand" id="notice-title">Keeply</h1>
        <div className="notice-sub">Keeply Notes</div>

        <div className="notice-lock" aria-hidden="true">🔒</div>
        <h2>We've secured our servers and the app.</h2>
        <p>
          Your notes, photos and voice recordings are now locked on your own phone or computer
          before they ever reach us. We can't read them, and neither can anyone else.
        </p>
        <p className="notice-small">
          Next, you'll turn on two-factor sign-in and get your personal Keeply number. It takes about two minutes.
        </p>

        <button className="btn" onClick={onContinue}>Continue</button>
        <button className="btn ghost" onClick={onLearnMore}>How we secured Keeply</button>
      </div>
    </div>
  )
}
