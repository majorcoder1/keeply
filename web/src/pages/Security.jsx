// "How we keep your notes private": the page behind the security pop-up, the account
// menu and the footer links. Written to be accurate about what is and isn't protected.
export default function Security({ onClose }) {
  return (
    <div className="help">
      <header className="help-top">
        <div className="help-top-in">
          <button className="help-brand" onClick={onClose} title="Back">
            <img src="/icon.svg" alt="" /> Security &amp; privacy
          </button>
          <span className="help-sp" />
          <button className="help-close" onClick={onClose}>✕ Close</button>
        </div>
      </header>

      <main className="help-body">
        <div className="sec-hero">
          <div className="notice-top">4 The People</div>
          <h1 className="notice-brand">Keeply</h1>
          <div className="notice-sub">Keeply Notes</div>
        </div>

        <h1>How we keep your notes private</h1>
        <p className="help-lede">
          Security update · October 2026. We rebuilt how Keeply stores your notes so that we cannot read them.
          Here is what we did, in plain words, and what it means for you.
        </p>

        <nav className="help-toc" aria-label="Topics">
          <a href="#s-what">What we did</a>
          <a href="#s-how">How it works</a>
          <a href="#s-covered">What's protected</a>
          <a href="#s-seen">What we can still see</a>
          <a href="#s-2fa">Two-factor sign-in</a>
          <a href="#s-key">Your Keeply number</a>
          <a href="#s-export">Export</a>
          <a href="#s-voice">Voice recordings</a>
          <a href="#s-limits">Honest limits</a>
          <a href="#s-log">Update log</a>
        </nav>

        <section id="s-what" className="help-sec">
          <h2>🔒 What we did</h2>
          <p>
            Your notes, photos and voice recordings are now <strong>locked on your own phone or computer before they are sent to us</strong>.
            Our servers store only scrambled data that looks like random letters and numbers. We can't read it. A person who breaks into our servers can't read it.
            Our hosting company can't read it. This is called <strong>end-to-end encryption</strong>.
          </p>
        </section>

        <section id="s-how" className="help-sec">
          <h2>⚙️ How it works</h2>
          <ul>
            <li>When you set up, your device makes a random <strong>24-digit Keeply number</strong>. It is made on your device. It is never sent to us.</li>
            <li>That number locks each note, photo and recording on your device, using AES-256, a standard used by banks and governments.</li>
            <li>Only the locked version travels to our servers and is stored there.</li>
            <li>When you open Keeply, your device unlocks your notes with the number. Nobody else has it.</li>
            <li>The number is typed once on each device. After that, that device remembers it safely. The same number can also <strong>log you in</strong>, instead of your email and password. The authenticator code is still asked for.</li>
          </ul>
        </section>

        <section id="s-covered" className="help-sec">
          <h2>✅ What's protected</h2>
          <ul>
            <li>Note titles and everything you write in them, including formatting</li>
            <li>Labels you add to notes</li>
            <li>Names of folders you create</li>
            <li>Photos</li>
            <li>Voice recordings and their titles</li>
          </ul>
        </section>

        <section id="s-seen" className="help-sec">
          <h2>👀 What we can still see</h2>
          <p>Locking your notes doesn't hide that you use Keeply. The server still knows:</p>
          <ul>
            <li>Your name and email address, and when you sign in</li>
            <li>That you have notes, how many, how big they are, and when you saved them</li>
            <li>A note's color, whether it's pinned, and which folder it's in (by number, not by name)</li>
            <li>The names of the three starter folders: Record, Work and Personal</li>
            <li>Only if you turn on <strong>link previews</strong> (off by default): the web addresses you preview. Never the note around them, and nothing is stored</li>
          </ul>
        </section>

        <section id="s-2fa" className="help-sec">
          <h2>🔑 Two-factor sign-in</h2>
          <p>
            Your password alone no longer opens your account. Each time you sign in, you also type a 6-digit code from an authenticator app
            on your phone (Google Authenticator, Authy, 2FAS, Aegis and others). A stolen password is not enough to get in.
          </p>
          <p>When you turn it on, you get <strong>recovery codes</strong>. Each works once if you lose your phone. Keep them somewhere safe.</p>
          <p>Signing in is protected in other ways too: repeated wrong guesses are slowed down, and changing or resetting your password signs your other devices out.</p>
        </section>

        <section id="s-key" className="help-sec">
          <h2>🗝️ Your Keeply number — keep it safe</h2>
          <p>
            Because we never have your number, <strong>we can't recover it if it's lost</strong>, and we can't reset it. If you lose it
            and no signed-in device still has it, your notes can't be opened again. Write it down and keep it somewhere safe, like a notebook, a safe or a password manager.
          </p>
          <p>
            Signing in on a new phone or computer? Type your 24 digits to log in and open your notes in one step. (If you log in with your email instead, you'll be asked for the 24 digits once.) To take the number off a device, go to
            <strong> Settings → Security → Remove number from this device</strong>.
          </p>
          <p>If the number is truly lost, the only way forward is to erase the account's notes and start again with a new number. You'll be asked to confirm before anything is deleted.</p>
        </section>

        <section id="s-export" className="help-sec">
          <h2>📦 Taking your notes with you</h2>
          <p>
            You can export everything any time: <strong>Settings → Your data → Export my notes</strong>. Your device unlocks your notes with your number and saves a plain
            <strong> .zip</strong> of text files, photos and recordings. That file is <strong>not locked</strong>, so keep it safe.
          </p>
        </section>

        <section id="s-voice" className="help-sec">
          <h2>🎙️ Voice recordings</h2>
          <p>
            We removed automatic voice-to-text and summaries. To turn speech into words, a recording has to be sent somewhere to be heard and read,
            and that can't be done on audio that's locked. So voice notes are now <strong>locked recordings</strong> you can play back any time.
            You can still type your own notes next to them.
          </p>
        </section>

        <section id="s-limits" className="help-sec">
          <h2>⚠️ Honest limits</h2>
          <ul>
            <li><strong>Anyone with your unlocked phone, or who knows your number, can read your notes.</strong> Use a screen lock and keep the number private.</li>
            <li>Keeply is delivered as a website and an app that loads it, so the code that locks your notes comes from our server. We protect it with HTTPS and strict browser security rules, and we keep the code simple. But no system is perfect, and we won't claim it is.</li>
            <li>Notes saved before this update were locked the first time you signed in afterward. Older readable copies may linger in our hosting company's backups or in the database's own leftover space until they are overwritten. That is outside our control.</li>
          </ul>
        </section>

        <section id="s-log" className="help-sec">
          <h2>📋 Update log — October 2026</h2>
          <ul>
            <li>New: end-to-end encryption of notes, photos, recordings, labels and folder names</li>
            <li>New: two-factor sign-in with an authenticator app, plus recovery codes</li>
            <li>New: your personal 24-digit Keeply number, made on your device and never sent to us</li>
            <li>Server: refuses any unlocked note, photo or recording, so a bug can't store one by mistake</li>
            <li>Server: sign-in attempts are rate limited; changing or resetting a password signs out other devices</li>
            <li>New: checklists, and the Notes and lists settings now work (item order, completed items, link previews, sharing)</li>
            <li>New: export all your notes, photos and recordings as one .zip, from Settings</li>
            <li>Removed: automatic transcription and summaries of voice recordings (they can't work on locked audio)</li>
            <li>Android app: now built for Android 17 (API 37), kept out of phone backups, and screenshots are blocked and the app is hidden in the recent-apps screen (you can turn that off in Settings)</li>
          </ul>
        </section>

        <div className="help-foot">
          <button className="btn" style={{ width: 'auto', padding: '11px 26px' }} onClick={onClose}>Back to Keeply</button>
        </div>

        <div className="help-legal">
          <a href="/legal-notice.html" target="_blank" rel="noopener">Legal notice</a>
          <span>© {new Date().getFullYear()} 4thePeople Media. All rights reserved.</span>
        </div>
      </main>
    </div>
  )
}
