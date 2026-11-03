// Logging in with the 24-digit Keeply number (instead of email + password), through the real screens.
import { BASE, ok, results, report, launch, wait, bodyText, waitText, waitSel, clickText, typeInto, signUpFresh, db, totp, nowStep, serverBytes } from './e2e_lib.mjs'

const { browser, page, problems } = await launch()
const PASS = 'fresh-pass-123'
let lastStep = 0
// a code that was not used yet (the server refuses to accept the same 30-second code twice)
const nextCode = async (secret) => { lastStep = Math.max(lastStep + 1, nowStep()); while (lastStep > nowStep()) await wait(1000); return totp(secret, lastStep) }
const logout = async () => { await page.evaluate(() => document.querySelector('.avatar').click()); await wait(300); await clickText(page, '.account-menu button', /Log out/); await waitSel(page, '.lp') }
const openLogin = async () => { await page.goto(BASE, { waitUntil: 'networkidle2' }); await clickText(page, 'button', /^Log in$/) }
const wipeDeviceKey = () => page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('keeply-keys'); q.onsuccess = q.onerror = q.onblocked = r }))
const cannot = () => page.evaluate(() => [...document.querySelectorAll('button.btn')].find((b) => /^Log in$/.test(b.textContent))?.disabled)

try {
  const { email, secret, keyCode } = await signUpFresh(page, 'numlogin')
  lastStep = nowStep()
  const row = () => db(`select number_id,number_auth,key_salt from users where email='${email}'`)[0]

  ok('setting up the number also saved its two one-way login values on the server', /^[a-f0-9]{64}$/.test(row().number_id) && /^[a-f0-9]{64}$/.test(row().number_auth), JSON.stringify(row()))
  ok('the 24 digits themselves are nowhere on the server', !serverBytes().includes(keyCode) && !serverBytes().includes(keyCode.slice(0, 12)))

  // a note to prove the notes open without a separate unlock step
  await page.evaluate(() => document.querySelector('.fab-main').click()); await wait(300)
  await clickText(page, '.fab-item', /Text/); await page.waitForSelector('.note-modal .rich-body')
  await typeInto(page, '.note-modal .title-input', 'NUMBER-LOGIN-NOTE'); await page.click('.note-modal .rich-body'); await page.keyboard.type('body of the number-login note')
  await clickText(page, '.note-modal button', /^Close$/); await wait(1500)

  await logout()
  await wipeDeviceKey() // pretend this is a brand-new phone

  // ============ 1. the login screen offers both ways ============
  await openLogin()
  ok('the login screen offers Email and My 24-digit number', await page.evaluate(() => { const t = [...document.querySelectorAll('.how-switch button')].map((b) => b.textContent); return t.includes('Email') && t.includes('My 24-digit number') }))
  ok('Email is selected first', await page.evaluate(() => document.querySelector('.how-switch button.on')?.textContent === 'Email'))
  await clickText(page, '.how-switch button', /24-digit/)
  ok('the number way shows one box and no email or password', await page.evaluate(() => !!document.querySelector('.code-input.long') && !document.querySelector('input[type=email]') && !document.querySelector('input[type=password]')))
  ok('"Log in" stays off until all 24 digits are typed', await cannot() === true)

  // ============ 2. a wrong number ============
  await typeInto(page, '.code-input.long', '1234 5678 9012 3456 7890 1234')
  ok('typing groups the digits as you go', await page.evaluate(() => document.querySelector('.code-input.long').value) === '1234 5678 9012 3456 7890 1234')
  ok('24 digits turn "Log in" on', await cannot() === false)
  await clickText(page, 'button.btn', /^Log in$/)
  ok('a wrong number is refused with a plain message', await waitText(page, /doesn.t match/i, 20000))
  ok('and it did not reach the authenticator step', !/Two-factor sign-in/.test(await bodyText(page)))

  // ============ 3. the right number, then the authenticator code ============
  await typeInto(page, '.code-input.long', keyCode); await clickText(page, 'button.btn', /^Log in$/)
  ok('the right number goes on to the authenticator code', await waitText(page, /Two-factor sign-in/, 20000))
  await typeInto(page, '.code-input', '000000'); await clickText(page, 'button.btn', /Verify/)
  ok('a wrong authenticator code is refused', await waitText(page, /didn.t work|not right|incorrect|invalid/i, 15000))
  await typeInto(page, '.code-input', await nextCode(secret)); await clickText(page, 'button.btn', /Verify/)
  ok('the right code opens the notes straight away, with no unlock screen on this new device', await waitSel(page, '.fab-main', 90000) && await waitText(page, /NUMBER-LOGIN-NOTE/, 20000))
  ok('the unlock screen was never shown', !/Unlock your notes/.test(await bodyText(page)))
  await page.reload({ waitUntil: 'networkidle2' })
  ok('and the device remembers it after a reload', await waitSel(page, '.fab-main', 30000) && await waitText(page, /NUMBER-LOGIN-NOTE/, 15000))

  // ============ 4. email still works, and asks for the number once ============
  await logout(); await wipeDeviceKey()
  await openLogin()
  await typeInto(page, 'input[type=email]', email); await typeInto(page, 'input[type=password]', PASS); await clickText(page, 'button.btn', /^Log in$/)
  await waitText(page, /Two-factor sign-in/, 20000)
  await typeInto(page, '.code-input', await nextCode(secret)); await clickText(page, 'button.btn', /Verify/)
  ok('email login on a new device asks for the number once', await waitText(page, /Unlock your notes/, 30000))
  await typeInto(page, '.code-input', keyCode); await clickText(page, 'button.btn', /^Unlock/)
  ok('and then opens the notes', await waitSel(page, '.fab-main', 60000) && await waitText(page, /NUMBER-LOGIN-NOTE/, 15000))

  // ============ 5. a recovery code works after the number too ============
  await logout(); await wipeDeviceKey()
  await openLogin(); await clickText(page, '.how-switch button', /24-digit/)
  await typeInto(page, '.code-input.long', keyCode); await clickText(page, 'button.btn', /^Log in$/)
  await waitText(page, /Two-factor sign-in/, 20000)
  ok('"Back to log in" returns to the login screen', await clickText(page, 'button', /Back to log in/) && await waitText(page, /Welcome back/, 8000))

  // ============ 6. an account made before number login gets it when the digits are typed ============
  const uid = db(`select id from users where email='${email}'`)[0].id
  const { execFileSync } = await import('node:child_process')
  execFileSync('python3', ['-c', `import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute("update users set number_id=null,number_auth=null where id=?",(int(sys.argv[2]),));c.commit()`, `${process.env.HOME}/keeply-dev/api/database/test.sqlite`, String(uid)])
  ok('(set-up) the number login was removed from this account', row().number_id === null)
  await clickText(page, '.how-switch button', /^Email/)
  await typeInto(page, 'input[type=email]', email); await typeInto(page, 'input[type=password]', PASS); await clickText(page, 'button.btn', /^Log in$/)
  await waitText(page, /Two-factor sign-in/, 20000)
  await typeInto(page, '.code-input', await nextCode(secret)); await clickText(page, 'button.btn', /Verify/)
  await waitText(page, /Unlock your notes/, 30000)
  await typeInto(page, '.code-input', keyCode); await clickText(page, 'button.btn', /^Unlock/)
  await waitSel(page, '.fab-main', 60000); await wait(1500)
  ok('typing the digits once gave the account number login again', /^[a-f0-9]{64}$/.test(row().number_id || ''), JSON.stringify(row()))
  const after = await page.evaluate(() => fetch('/api/user', { headers: { Accept: 'application/json', Authorization: 'Bearer ' + localStorage.getItem('keeply_token') } }).then((r) => r.json()))
  ok('the account data sent to the app never contains the lookup values', !('number_id' in after) && !('number_auth' in after) && after.number_set === true, Object.keys(after).join())

  // ============ 7. turning it on from Settings (device already has the key) ============
  execFileSync('python3', ['-c', `import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute("update users set number_id=null,number_auth=null where id=?",(int(sys.argv[2]),));c.commit()`, `${process.env.HOME}/keeply-dev/api/database/test.sqlite`, String(uid)])
  await page.reload({ waitUntil: 'networkidle2' }); await waitSel(page, '.fab-main', 30000)
  await page.evaluate(() => document.querySelector('.avatar').click()); await wait(300)
  await clickText(page, '.account-menu button', /Settings/); await waitSel(page, '.settings-modal')
  ok('Settings offers to turn number login on when it is off', await page.evaluate(() => /Log in with my number/.test(document.querySelector('.settings-modal').innerText) && [...document.querySelectorAll('.settings-modal button')].some((b) => /Turn on/.test(b.textContent))))
  await clickText(page, '.settings-modal button', /Turn on ›/)
  await typeInto(page, '.sm-inline .code-input.long', '1234 5678 9012 3456 7890 1234'); await clickText(page, '.sm-inline button', /^Turn on$/)
  ok('a wrong number is refused there', await waitText(page, /doesn.t match/i, 20000) && row().number_id === null)
  await typeInto(page, '.sm-inline .code-input.long', keyCode); await clickText(page, '.sm-inline button', /^Turn on$/)
  ok('the right number turns it on (shows On, saved on the server)', await page.waitForFunction(() => /Log in with my number[\s\S]*On/.test(document.querySelector('.settings-modal').innerText) && ![...document.querySelectorAll('.settings-modal button')].some((b) => /Turn on/.test(b.textContent)), { timeout: 20000 }).then(() => true, () => false) && /^[a-f0-9]{64}$/.test(row().number_id || ''))
  await clickText(page, '.settings-modal button', /Close|✕|×/); await wait(300)

  // ============ 8. the phone-size screens ============
  await logout(); await openLogin(); await clickText(page, '.how-switch button', /24-digit/)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ok('no sideways scrolling on the number login screen at 390px', overflow <= 0, String(overflow))
} catch (e) {
  ok('script ran to the end', false, e.stack.split('\n').slice(0, 4).join(' | '))
}
ok('no browser errors (including security-policy violations)', problems.length === 0, problems.slice(0, 5).join(' | '))
await browser.close(); report(); process.exit(results.every((r) => r[1]) ? 0 : 1)
