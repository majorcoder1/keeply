// Full help / how-it-works page. Opened from the account menu and the landing footer.
export default function Help({ onClose }) {
  return (
    <div className="help">
      <header className="help-top">
        <div className="help-top-in">
          <button className="help-brand" onClick={onClose} title="Back">
            <img src="/icon.svg" alt="" /> Help
          </button>
          <span className="help-sp" />
          <button className="help-close" onClick={onClose}>✕ Close</button>
        </div>
      </header>

      <main className="help-body">
        <h1>How 4thepeople Notes works</h1>
        <p className="help-lede">Everything you need to capture, organize, and find your notes. Jump to a topic or scroll through.</p>

        <nav className="help-toc" aria-label="Help topics">
          <a href="#h-start">Getting started</a>
          <a href="#h-notes">Notes</a>
          <a href="#h-voice">Voice recordings</a>
          <a href="#h-lists">Checklists</a>
          <a href="#h-labels">Labels &amp; folders</a>
          <a href="#h-search">Search</a>
          <a href="#h-settings">Settings &amp; dark mode</a>
          <a href="#h-account">Your account</a>
          <a href="#h-export">Export your notes</a>
          <a href="#h-privacy">Privacy</a>
          <a href="#h-feedback">Feedback</a>
        </nav>

        <section id="h-start" className="help-sec">
          <h2>🚀 Getting started</h2>
          <p>Tap <strong>Get started</strong> to make a free account with your email and a password, then you're in. Want to look around first? Choose <strong>Continue as guest</strong> — guest notes stay on that one device only. Sign in any time to sync everywhere.</p>
        </section>

        <section id="h-notes" className="help-sec">
          <h2>📝 Notes</h2>
          <p>Tap <strong>Take a note</strong> at the top (or the <strong>+</strong> button, bottom-right) to start. Add a title and your text. You can:</p>
          <ul>
            <li>Pick a <strong>color</strong> for the note from the dots.</li>
            <li><strong>Pin</strong> important notes so they jump to the top.</li>
            <li>Put a note in a <strong>folder</strong>.</li>
          </ul>
          <p>Notes save automatically when you tap <strong>Done</strong> or close the editor. Tap any note to open and edit it.</p>
        </section>

        <section id="h-voice" className="help-sec">
          <h2>🎙️ Voice recordings</h2>
          <p>Tap the <strong>+</strong> button, then <strong>Audio</strong>, to record. When you stop, give it a title, add a few typed words if you like, and save. Your recording is locked on your device and saved with a note. Find all your recordings under <strong>Recordings</strong> in the sidebar, and tap <strong>Play</strong> to hear one.</p>
        </section>

        <section id="h-lists" className="help-sec">
          <h2>☑️ Checklists</h2>
          <p>Tap the <strong>+</strong> button, then <strong>List</strong>. Type an item and press Enter to add the next one. Tick an item when it's done; you can tick items right from the note card, too. In <strong>Settings → Notes and lists</strong> you choose whether new items go at the bottom or the top, and whether ticked items drop into a <strong>completed items</strong> group or stay in place, crossed out.</p>
        </section>

        <section id="h-share" className="help-sec">
          <h2>🔗 Link previews and sharing</h2>
          <p><strong>Rich link previews</strong> (Settings → Notes and lists, off until you turn it on) show a small card with the title and picture for web addresses in your notes. To make a card, Keeply's server looks the address up, so it sees that address, but never your note. <strong>Enable sharing</strong> adds a <strong>Share</strong> button in a note that sends its words to another app, or copies them if your device can't share.</p>
        </section>

        <section id="h-labels" className="help-sec">
          <h2>🏷️ Labels &amp; folders</h2>
          <p>Inside a note, use <strong>Add tag</strong> to label it — for example <em>#preacher</em>, <em>#church</em>, or a place. Labels you've used before show up as chips you can tap to reuse. Create <strong>folders</strong> in the sidebar (like Preaching or Study) to group notes together.</p>
        </section>

        <section id="h-search" className="help-sec">
          <h2>🔍 Search</h2>
          <p>Use the <strong>search bar</strong> at the top to find any note by the words in its title or body.</p>
        </section>

        <section id="h-settings" className="help-sec">
          <h2>⚙️ Settings &amp; dark mode</h2>
          <p>Tap your <strong>avatar</strong> (top-right) → <strong>Settings</strong>. There you can turn on <strong>dark mode</strong> for a night-friendly look, and more options are on the way.</p>
        </section>

        <section id="h-account" className="help-sec">
          <h2>👤 Your account</h2>
          <p>Signed in, your notes <strong>sync</strong> across your phone, tablet, and computer automatically. On a new device, log in with your email and password, or with just your 24-digit Keeply number. If you used your email, type your number once to open your notes. You can <strong>change your password</strong> any time from <strong>Settings → Change password</strong>. Logging out takes you back to the home page.</p>
        </section>

        <section id="h-export" className="help-sec">
          <h2>📦 Export your notes</h2>
          <p>Your notes are yours to take with you. Open your <strong>avatar → Settings → Your data → Export my notes</strong>. Keeply unlocks everything on your device and saves one <strong>.zip</strong> file: a plain-text file for every note, your photos, your voice recordings, and a <strong>notes.json</strong> file for other programs. In the Android app you choose where to save it (like Downloads). On a computer it goes to your Downloads folder.</p>
          <p>The exported file is <strong>not locked</strong>, so anyone who has it can read your notes. Keep it somewhere safe and delete it when you're done.</p>
        </section>

        <section id="h-privacy" className="help-sec">
          <h2>🔒 Privacy</h2>
          <p>Your notes, photos and recordings are locked on your own device with a 24-digit number only you have, so we can't read them. Sign-in needs a code from an authenticator app. Read the full details under <strong>Security &amp; privacy</strong> in the account menu.</p>
        </section>

        <section id="h-feedback" className="help-sec">
          <h2>💬 Feedback</h2>
          <p>Found a bug or have an idea? Open <strong>Settings → Send feedback</strong>, type your message, and it goes straight to the 4thepeople team — no email app needed.</p>
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
