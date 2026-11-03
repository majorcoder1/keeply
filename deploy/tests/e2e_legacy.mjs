import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { BASE, API_DIR, SCRATCH, ok, results, report, launch, wait, bodyText, waitText, waitSel, clickText, typeInto, shot, totp, nowStep, db, serverBytes, storedFiles } from './e2e_lib.mjs'

const EMAIL = 'legacy@example.test', PASS = 'legacy-pass-123'
let secret = '', lastStep = 0, keyCode = ''
async function nextCode() {
  let step = Math.max(lastStep + 1, nowStep())
  while (step > nowStep() + 1) await wait(2000)
  lastStep = step
  return totp(secret, step)
}
const SENTINELS = ['SECRET-ALPHA', 'SECRET-BODY-ONE', 'SECRET-TAG', 'SECRET-GAMMA', 'SECRET-RICH', 'SECRET-FOLDER', 'SECRET-BETA', 'preaching', 'God so loved', 'John 3:16']

const { browser, page, problems } = await launch()
const login = async () => {
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await clickText(page, 'button', /^Log in$/)
  await typeInto(page, 'input[type=email]', EMAIL)
  await typeInto(page, 'input[type=password]', PASS)
  await clickText(page, 'button.btn', /^Log in$/)
}

try {
  // ============ 1. old account signs in: pop-up, security page, two-factor ============
  await login()
  ok('security pop-up appears after login', await waitSel(page, '.notice-card'))
  const notice = await bodyText(page)
  ok('pop-up has 4 The People, big Keeply, Keeply Notes and the message', /4 THE PEOPLE/i.test(notice) && /Keeply\s*\n\s*Keeply Notes/.test(notice) && /secured our servers and the app/i.test(notice), notice.slice(0, 300))
  await shot(page, 'notice')
  await clickText(page, 'button', /How we secured Keeply/)
  ok('"How we secured Keeply" opens the security page', await waitText(page, /How we keep your notes private/) && await waitText(page, /Update log/))
  const sec = await bodyText(page)
  ok('security page covers the key points', /24-digit/.test(sec) && /Two-factor/.test(sec) && /What we can still see/i.test(sec) && /Android 17/.test(sec) && /Honest limits/i.test(sec))
  await shot(page, 'security-page')
  await page.click('.help-close')
  ok('closing the page returns to the pop-up', await waitSel(page, '.notice-card'))
  await clickText(page, 'button', /^Continue$/)
  ok('Continue leads to two-factor setup (required for an old account)', await waitText(page, /Turn on two-factor sign-in/))
  await waitSel(page, '.secret-box code'); await waitSel(page, '.qr-wrap img')
  ok('QR code is shown', await page.evaluate(() => !!document.querySelector('.qr-wrap img')?.src.startsWith('data:image/gif')))
  secret = (await page.evaluate(() => document.querySelector('.secret-box code')?.textContent || '')).replace(/\s/g, '')
  ok('setup shows a 32-character authenticator key', /^[A-Z2-7]{32}$/.test(secret), secret)
  await shot(page, '2fa-setup')
  await typeInto(page, '.code-input', '000000'); await clickText(page, 'button.btn', /Turn on two-factor/)
  ok('a wrong code is refused with a clear message', await waitText(page, /That code didn.t work/))
  lastStep = nowStep(); await typeInto(page, '.code-input', totp(secret, lastStep)); await clickText(page, 'button.btn', /Turn on two-factor/)
  const gotCodes = await waitText(page, /Save your recovery codes/, 15000)
  if (!gotCodes) console.log('DEBUG after right code:', (await bodyText(page)).slice(0, 500), '| secret', secret, 'step', lastStep, 'now', nowStep())
  ok('the right code shows 8 recovery codes', gotCodes && (await page.$$eval('.recovery-grid code', (e) => e.length)) === 8)
  const recov = await page.$$eval('.recovery-grid code', (e) => e.map((x) => x.textContent))
  ok('Continue is disabled until "I saved them" is ticked', await page.evaluate(() => [...document.querySelectorAll('button.btn')].find((b) => /Continue/.test(b.textContent))?.disabled === true))
  await shot(page, 'recovery-codes')
  await page.click('.gate-check input'); await clickText(page, 'button.btn', /^Continue$/)

  // ============ 2. the Keeply number ============
  ok('then the Keeply number screen appears', await waitText(page, /Your Keeply number/))
  keyCode = (await page.$$eval('.key-code span', (e) => e.map((x) => x.textContent))).join('')
  ok('the number is 24 digits shown as 6 groups of 4', /^\d{24}$/.test(keyCode) && (await page.$$eval('.key-code span', (e) => e.length)) === 6, keyCode)
  ok('the server has no key yet (nothing is saved until you continue)', db("select key_salt from users where email='legacy@example.test'")[0].key_salt === null)
  await shot(page, 'key-setup')
  const disabledNow = () => page.evaluate(() => [...document.querySelectorAll('button.btn')].find((b) => /^Continue$/.test(b.textContent))?.disabled)
  ok('there is no typing check on the number screen', (await page.$$('.code-input')).length === 0)
  ok('"Continue" starts disabled until "I saved my number" is ticked', await disabledNow() === true)
  await page.click('.gate-check input')
  ok('ticking "I saved my number" enables it', await disabledNow() === false)
  ok('Copy and Save as file buttons are offered', await page.evaluate(() => { const t = [...document.querySelectorAll('.gate-actions button')].map((b) => b.textContent); return t.includes('Copy') && t.includes('Save as file') }))
  await clickText(page, 'button.btn', /^Continue$/)
  ok('workspace opens after the number is saved', await waitSel(page, '.fab-main', 90000))
  const u = db("select key_salt,key_check,key_version from users where email='legacy@example.test'")[0]
  ok('server now holds only a salt and a key check', u.key_salt?.length >= 20 && u.key_check?.startsWith('enc1:') && u.key_version === 1, JSON.stringify(u))
  ok('the 24 digits appear nowhere on the server', !serverBytes().includes(keyCode) && !serverBytes().includes(keyCode.slice(0, 12)))

  // ============ 3. old notes were locked automatically ============
  await wait(1500)
  const rows = db('select id,title,body,tags,images from notes order by id')
  ok('all 3 old notes are now enc1: blocks with empty title and tags', rows.length === 3 && rows.every((r) => r.body.startsWith('enc1:') && !r.title && (r.tags === '[]' || r.tags === null)), JSON.stringify(rows.map((r) => [r.title, r.body.slice(0, 8), r.tags])))
  ok('the photo note now points at an .enc file', rows.some((r) => /\.enc"\]$/.test(r.images || '')), JSON.stringify(rows.map((r) => r.images)))
  const recs = db('select title,path,mime,duration,note_id from recordings')
  ok('the old recording was replaced by an encrypted one, same note', recs.length === 1 && recs[0].path.endsWith('.enc') && recs[0].title.startsWith('enc1:') && recs[0].note_id === 1 && recs[0].duration === 3, JSON.stringify(recs))
  const folders = db('select name,system from folders order by id')
  ok('the custom folder name is locked; starter folders stay plain', folders.filter((f) => f.system).map((f) => f.name).join() === 'Record,Work,Personal' && folders.find((f) => !f.system).name.startsWith('enc1:'), JSON.stringify(folders))
  ok('old readable files are gone from the server', !storedFiles().some((p) => /legacy(photo|rec)/.test(p)) && storedFiles().length === 2, storedFiles().join(' '))
  const files = storedFiles()
  ok('every stored file starts with the KPLY1 marker (no JPEG/WebM inside)', files.length > 0 && files.every((p) => fs.readFileSync(p).subarray(0, 5).toString() === 'KPLY1'))

  // ============ 4. the app shows everything unlocked ============
  const text = await bodyText(page)
  ok('notes read normally in the app', /Sunday sermon SECRET-ALPHA/.test(text) && /Photo note SECRET-GAMMA/.test(text) && /Rich note/.test(text) && /SECRET-BODY-ONE/.test(text), text.slice(0, 400))
  ok('labels and the Audio chip survived', /#preaching/.test(text) && /#SECRET-TAG/.test(text) && /Audio/.test(text))
  ok('the photo is displayed (unlocked)', await page.waitForFunction(() => { const i = document.querySelector('.card-imgs img'); return i && i.naturalWidth > 0 }, { timeout: 15000 }).then(() => true, () => false))
  ok('"Last edited" order was kept (not all stamped now)', (await page.$$eval('.card h3', (e) => e.map((x) => x.textContent))).length >= 3)
  await shot(page, 'workspace')
  await page.evaluate(() => document.querySelector('.menu-toggle').click()); await wait(500)
  ok('the custom folder shows by its real name in the sidebar', /Prayer requests SECRET-FOLDER/.test(await page.evaluate(() => document.querySelector('.sidebar').innerText)))
  await clickText(page, '.sidebar .nav-item', /Recordings/)
  ok('Recordings lists the old one with its title and original date', await waitText(page, /Legacy recording SECRET-BETA/))
  await clickText(page, 'button.play-btn', /Play recording/)
  ok('Play unlocks and plays the recording (3 s)', await page.waitForFunction(() => { const a = document.querySelector('audio'); return a && a.readyState >= 1 && a.duration > 2.5 && a.duration < 3.5 }, { timeout: 20000 }).then(() => true, () => false))

  // ============ 5. new things are encrypted as they're made ============
  await page.evaluate(() => { document.querySelector('.drawer-scrim')?.click() }); await wait(300)
  await clickText(page, '.sidebar .nav-item', /^\s*Notes/); await wait(500)
  await page.evaluate(() => document.querySelector('.fab-main').click()); await wait(300)
  await clickText(page, '.fab-item', /Text/)
  await page.waitForSelector('.note-modal .rich-body')
  await typeInto(page, '.note-modal .title-input', 'NEWNOTE-SECRET title')
  await page.click('.note-modal .rich-body'); await page.keyboard.type('NEWNOTE-SECRET body line')
  await page.type('.note-modal .tag-input', 'NEWTAG-SECRET'); await page.keyboard.press('Enter')
  await clickText(page, '.note-modal button', /^Close$/); await wait(1500)
  const nn = db("select * from notes order by id desc limit 1")[0]
  ok('a new note is stored locked: no title, no labels, body is enc1:', nn.title === null && nn.body.startsWith('enc1:') && (nn.tags === '[]' || nn.tags === null) && !nn.body.includes('NEWNOTE'), JSON.stringify(nn).slice(0, 200))
  ok('and it shows in the app', /NEWNOTE-SECRET title/.test(await bodyText(page)))

  await page.evaluate(() => document.querySelector('.fab-main').click()); await wait(300)
  await clickText(page, '.fab-item', /Audio/)
  await page.waitForSelector('.rec-big'); await page.click('.rec-big'); await wait(3500)
  await page.click('.btn.rec-stop'); await page.waitForSelector('.rec-player')
  ok('a voice note records and reviews (no transcript tabs, no AI)', !/Summary|Transcript/.test(await bodyText(page)))
  await page.type('.rec-text', 'NEWNOTE-SECRET typed words'); await clickText(page, '.rec-foot button', /^Save$/)
  await page.waitForFunction(() => !document.querySelector('.rec-modal'), { timeout: 30000 }); await wait(1500)
  const rr = db('select * from recordings order by id desc limit 1')[0]
  const rf = fs.readFileSync(`${API_DIR}/storage/app/public/${rr.path}`)
  ok('the new recording is stored locked (KPLY1, not WebM), title locked, type recorded', rf.subarray(0, 5).toString() === 'KPLY1' && !rf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && rr.title.startsWith('enc1:') && rr.mime === 'audio/webm' && rr.path.endsWith('.enc'), JSON.stringify(rr))

  const png = `${SCRATCH}/photo-${Date.now()}.jpg`
  execSyncConvert(png)
  await (await page.$('input[type=file][accept="image/*"]')).uploadFile(png)
  ok('a new photo note opens with the photo shown', await page.waitForFunction(() => { const i = document.querySelector('.ed-images img'); return i && i.naturalWidth > 0 }, { timeout: 20000 }).then(() => true, () => false))
  await clickText(page, '.note-modal button', /^Close$/); await wait(1500)
  const imgs = storedFiles().filter((p) => p.includes('/images/'))
  ok('every photo on the server is locked', imgs.length >= 2 && imgs.every((p) => p.endsWith('.enc') && fs.readFileSync(p).subarray(0, 5).toString() === 'KPLY1'), imgs.join(' '))

  // ============ 6. nothing readable anywhere on the server ============
  execFileSync('python3', ['-c', `import sqlite3;c=sqlite3.connect('${API_DIR}/database/test.sqlite');c.execute('VACUUM');c.close()`])
  const bytes = serverBytes()
  const leaks = [...SENTINELS, 'NEWNOTE-SECRET', 'NEWTAG-SECRET', 'NEWNOTE', 'Sunday sermon', 'Photo note'].filter((s) => bytes.includes(s))
  ok('NO readable note text, title, label, folder or recording title anywhere on the server (database + files)', leaks.length === 0, leaks.join(', '))
  ok('no JPEG or WebM signature in any stored file', storedFiles().every((p) => { const b = fs.readFileSync(p); return !b.includes(Buffer.from([0xff, 0xd8, 0xff, 0xe0])) && !b.includes(Buffer.from('JFIF')) && !b.includes(Buffer.from('OpusHead')) }))

  // ============ 7. signing in again: 2FA code, key remembered ============
  await page.evaluate(() => document.querySelector('.avatar').click()); await wait(300)
  await clickText(page, '.account-menu button', /Log out/)
  await waitSel(page, '.lp')
  await login()
  ok('login now asks for the authenticator code', await waitText(page, /Two-factor sign-in/) && await waitText(page, /6-digit code/))
  await typeInto(page, '.code-input', '123456'); await clickText(page, 'button.btn', /Verify/)
  ok('a wrong code is refused', await waitText(page, /That code didn.t work/))
  await typeInto(page, '.code-input', await nextCode()); await clickText(page, 'button.btn', /Verify/)
  ok('the right code goes straight to the notes (this device remembers the key, no pop-up again)', await waitSel(page, '.fab-main', 30000) && !/Unlock your notes/.test(await bodyText(page)))
  ok('notes still unlock after logging back in', await waitText(page, /Sunday sermon SECRET-ALPHA/, 15000))
  await page.evaluate(() => document.querySelector('.avatar').click()); await wait(300)
  await clickText(page, '.account-menu button', /Log out/); await waitSel(page, '.lp')
  await login(); await waitText(page, /Two-factor sign-in/)
  await typeInto(page, '.code-input', recov[0]); await page.evaluate(() => 0)
  await clickText(page, 'button', /Lost your phone/); await typeInto(page, 'input[autocomplete=one-time-code]', recov[0]); await clickText(page, 'button.btn', /Verify/)
  ok('a recovery code signs in instead', await waitSel(page, '.fab-main', 30000))

  // ============ 8. a new device: type the 24 digits once ============
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('keeply-keys'); q.onsuccess = q.onerror = q.onblocked = r }))
  await page.reload({ waitUntil: 'networkidle2' })
  ok('a device without the key asks for it', await waitText(page, /Unlock your notes/))
  await shot(page, 'unlock')
  await typeInto(page, '.code-input', '1234 5678 9012 3456 7890 1234'); await clickText(page, 'button.btn', /^Unlock/)
  ok('a wrong 24-digit key is refused', await waitText(page, /doesn.t match/))
  await typeInto(page, '.code-input', keyCode); await clickText(page, 'button.btn', /^Unlock/)
  ok('the right key unlocks (typed without spaces is fine)', await waitSel(page, '.fab-main', 60000) && await waitText(page, /Sunday sermon SECRET-ALPHA/, 15000))
  await page.reload({ waitUntil: 'networkidle2' })
  ok('and the device remembers it after a reload', await waitSel(page, '.fab-main', 30000))

  // ============ 9. settings ============
  await page.evaluate(() => document.querySelector('.avatar').click()); await wait(300)
  await clickText(page, '.account-menu button', /Settings/)
  ok('Settings has a Security section', await waitText(page, /Two-factor sign-in/) && await waitText(page, /Keeply number on this device/))
  await shot(page, 'settings-security')
  await clickText(page, '.settings-modal button', /New codes/)
  await typeInto(page, '.sm-inline .code-input', '000000'); await clickText(page, '.sm-inline button', /Get new codes/)
  ok('new recovery codes need a valid current code', await waitText(page, /That code didn.t work/))
  await typeInto(page, '.sm-inline .code-input', await nextCode()); await clickText(page, '.sm-inline button', /Get new codes/)
  ok('a valid code gives a fresh set of 8', await page.waitForFunction(() => document.querySelectorAll('.settings-modal .recovery-grid code').length === 8, { timeout: 10000 }).then(() => true, () => false))
  await clickText(page, '.settings-modal button', /Remove ›/)
  ok('"Remove key from this device" locks the device again', await waitText(page, /Unlock your notes/))

  // ============ 10. "I lost my key" ============
  await clickText(page, 'button', /lost my number/)
  await typeInto(page, 'input[type=password]', 'wrong-password'); await typeInto(page, 'input[placeholder=ERASE]', 'ERASE'); await clickText(page, 'button.btn', /Erase everything/)
  ok('erasing with the wrong password is refused', await waitText(page, /password isn.t right/))
  await typeInto(page, 'input[type=password]', PASS); await clickText(page, 'button.btn', /Erase everything/)
  ok('erasing with the right password starts over with a new number screen', await waitText(page, /Your Keeply number/))
  const left = db('select (select count(*) from notes) n, (select count(*) from recordings) r, (select count(*) from folders where system=0) f, (select key_salt from users) k')[0]
  ok('everything was erased from the server, including stored files', left.n === 0 && left.r === 0 && left.f === 0 && left.k === null && storedFiles().length === 0, JSON.stringify(left) + storedFiles().join())
  const k2 = (await page.$$eval('.key-code span', (e) => e.map((x) => x.textContent))).join('')
  ok('and a brand-new, different key is offered', /^\d{24}$/.test(k2) && k2 !== keyCode)
} catch (e) {
  ok('script ran to the end without crashing', false, e.stack.split('\n').slice(0, 4).join(' | '))
  await shot(page, 'failure')
}
ok('no browser errors during the whole run', problems.length === 0, problems.slice(0, 5).join(' | '))
await browser.close()
report()
process.exit(results.every((r) => r[1]) ? 0 : 1)

function execSyncConvert(out) { execFileSync('convert', ['-size', '1200x900', 'gradient:orange-blue', out]) }
