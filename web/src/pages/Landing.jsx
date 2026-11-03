// Marketing landing page shown to logged-out visitors. Buttons lead into the app.
export default function Landing({ onGetStarted, onLogin, onHelp, onSecurity }) {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <span className="lp-brand"><img src="/icon.svg" alt="" className="lp-bulb" /> 4thepeople Notes</span>
          <span className="lp-sp" />
          <button className="lp-btn ghost" onClick={onLogin}>Log in</button>
          <button className="lp-btn primary" onClick={onGetStarted}>Get started</button>
        </div>
      </header>

      <main>
        <section className="lp-wrap lp-hero" aria-labelledby="lp-h1">
          <div>
            <span className="lp-eyebrow">🚧 Beta — we're working on the app</span>
            <h1 id="lp-h1">Capture every message. Keep every note.</h1>
            <p className="lp-lede">Type it, speak it, tag it. 4thepeople Notes keeps your sermon notes and voice recordings synced across your phone, tablet, and computer.</p>
            <div className="lp-cta-row">
              <button className="lp-btn primary lg" onClick={onGetStarted}>Get started — free</button>
              <button className="lp-btn ghost lg" onClick={onLogin}>Log in</button>
            </div>
            <p className="lp-cta-note">Free to use · works offline · installs like an app</p>
          </div>
          <div className="lp-shot" aria-hidden="true">
            <div className="lp-phone"><div className="lp-scr">
              <div className="lp-scr-top"><img src="/icon.svg" alt="" style={{ width: 20, height: 20 }} /> All notes</div>
              <div className="lp-scr-body">
                <div className="lp-ncard lp-y"><h4>Sunday — The Spirit of Antichrist</h4><p>1 John 2:18–26 · outline + points…</p><span className="lp-ntag">#preaching</span></div>
                <div className="lp-ncard"><h4>🎙️ Voice note</h4><p>Recording · locked and private</p><span className="lp-ntag">#record</span></div>
                <div className="lp-ncard lp-b"><h4>Study — grace &amp; works</h4><p>Cross-refs and questions for Wed.</p><span className="lp-ntag">#study</span></div>
              </div>
            </div></div>
          </div>
        </section>

        <section className="lp-wrap lp-features" aria-labelledby="lp-feat">
          <div className="lp-sec-head">
            <h2 id="lp-feat">Everything you jot, say, and study — in one place</h2>
            <p>Built for people who take a lot of notes and don't want to lose a single one.</p>
          </div>
          <div className="lp-grid">
            <article className="lp-feat"><div className="lp-ic" aria-hidden="true">🎙️</div><h3>Voice recordings</h3><p>Record a message and play it back any time. It's locked on your device, so only you can hear it.</p></article>
            <article className="lp-feat"><div className="lp-ic" aria-hidden="true">🏷️</div><h3>Labels &amp; folders</h3><p>Tag by preacher, church, or place, and sort into folders. Reuse labels with one tap.</p></article>
            <article className="lp-feat"><div className="lp-ic" aria-hidden="true">📱</div><h3>On every device</h3><p>Phone, tablet, and computer stay in sync. Install it like an app; works offline.</p></article>
            <article className="lp-feat"><div className="lp-ic" aria-hidden="true">🌙</div><h3>Light or dark</h3><p>A clean, calm design with a real dark mode for late-night study.</p></article>
            <article className="lp-feat"><div className="lp-ic" aria-hidden="true">🔒</div><h3>Private &amp; yours</h3><p>Locked on your device before they're synced. We can't read your notes, and neither can anyone else.</p></article>
            <article className="lp-feat"><div className="lp-ic" aria-hidden="true">✨</div><h3>Fast &amp; simple</h3><p>As quick as a notepad, and it never loses your place.</p></article>
          </div>
        </section>

        <section className="lp-wrap" aria-labelledby="lp-priv">
          <div className="lp-privacy">
            <div className="lp-priv-ic" aria-hidden="true">🔒</div>
            <div>
              <h2 id="lp-priv">Privacy first</h2>
              <p>Your notes, photos and voice recordings are locked on your own phone or computer before they reach our servers, with a 24-digit number that only you have. We can't read them. Sign-in is protected with two-factor codes, and we never sell your data or hand it to anyone else.</p>
              <p><button className="lp-link" style={{ padding: 0, textDecoration: 'underline' }} onClick={onSecurity}>How we keep your notes private</button></p>
            </div>
          </div>
        </section>

        <section className="lp-wrap" aria-labelledby="lp-band">
          <div className="lp-band">
            <h2 id="lp-band">Start keeping better notes today</h2>
            <p>Free to sign up. Your first note is one tap away.</p>
            <button className="lp-btn dark lg" onClick={onGetStarted}>Get started — free</button>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-foot-in">
          <span className="lp-brand" style={{ fontSize: 15 }}><img src="/icon.svg" alt="" className="lp-bulb" style={{ width: 24, height: 24 }} /> 4thepeople Notes</span>
          <span className="lp-sp" />
          <button className="lp-link" onClick={onLogin}>Log in</button>
          <button className="lp-link" onClick={onGetStarted}>Get started</button>
          <button className="lp-link" onClick={onHelp}>Help</button>
          <button className="lp-link" onClick={onSecurity}>Security</button>
          <a className="lp-link" href="/legal-notice.html" target="_blank" rel="noopener">Legal notice</a>
          <span>© {new Date().getFullYear()} 4thePeople Media. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}
