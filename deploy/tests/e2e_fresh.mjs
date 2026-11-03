import fs from 'node:fs'
import { BASE, API_DIR, SCRATCH, ok, results, report, launch, wait, bodyText, waitText, waitSel, clickText, typeInto, totp, nowStep, db, serverBytes, storedFiles } from './e2e_lib.mjs'

const { browser, page, problems } = await launch()
const apiCalls = []
page.on('request', (r) => { if (r.url().includes('/api/')) apiCalls.push(r.method() + ' ' + new URL(r.url()).pathname) })
try {
  // ===== a brand-new account =====
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await clickText(page, 'button', /^Get started$/)
  const email = `fresh-${Date.now()}@example.test`
  await typeInto(page, 'input[placeholder="Jane Doe"]', 'Fresh Fran'); await typeInto(page, 'input[type=email]', email); await typeInto(page, 'input[type=password]', 'fresh-pass-123')
  await clickText(page, 'button.btn', /^Sign up$/)
  ok('sign-up shows the pop-up first', await waitSel(page, '.notice-card'))
  await clickText(page, 'button', /^Continue$/)
  await waitSel(page, '.secret-box code')
  const secret = (await page.evaluate(() => document.querySelector('.secret-box code').textContent)).replace(/\s/g, '')
  let step = nowStep(); await typeInto(page, '.code-input', totp(secret, step)); await clickText(page, 'button.btn', /Turn on two-factor/)
  await waitText(page, /recovery codes/); await page.click('.gate-check input'); await clickText(page, 'button.btn', /^Continue$/)
  await waitText(page, /Your Keeply number/)
  const code = (await page.$$eval('.key-code span', (e) => e.map((x) => x.textContent))).join('')
  await page.click('.gate-check input'); await clickText(page, 'button.btn', /^Continue$/)
  ok('a new account reaches an empty workspace', await waitSel(page, '.fab-main', 60000) && await waitText(page, /Notes you add appear here/, 8000))
  ok('the starter folders are there', /Record/.test(await page.evaluate(() => { document.querySelector('.menu-toggle').click(); return document.querySelector('.sidebar').innerText })))
  await page.evaluate(() => document.querySelector('.drawer-scrim')?.click())
  // add a custom folder (encrypted name), a note in it
  await page.evaluate(() => document.querySelector('.menu-toggle').click()); await wait(300)
  await typeInto(page, '.add-folder input', 'FRESH-FOLDER-SECRET'); await page.keyboard.press('Enter'); await wait(1200)
  ok('a new folder shows its real name', /FRESH-FOLDER-SECRET/.test(await page.evaluate(() => document.querySelector('.sidebar').innerText)))
  const fr = db(`select f.name,f.system from folders f join users u on u.id=f.user_id where u.email='${email}' and f.system=0`)[0]
  ok('and is stored locked', fr && fr.name.startsWith('enc1:') && !fr.name.includes('FRESH'), JSON.stringify(fr))
  await page.evaluate(() => document.querySelector('.drawer-scrim')?.click()); await wait(300)
  await page.evaluate(() => document.querySelector('.fab-main').click()); await wait(300)
  await clickText(page, '.fab-item', /Text/); await page.waitForSelector('.note-modal .rich-body')
  await typeInto(page, '.note-modal .title-input', 'FRESH-TITLE-SECRET'); await page.click('.note-modal .rich-body'); await page.keyboard.type('FRESH-BODY-SECRET')
  await page.evaluate(() => { document.querySelector('.note-modal .ed-folder').value = [...document.querySelectorAll('.note-modal .ed-folder option')].pop().value; document.querySelector('.note-modal .ed-folder').dispatchEvent(new Event('change', { bubbles: true })) })
  await clickText(page, '.note-modal button', /^Close$/); await wait(1500)
  const bytes = serverBytes()
  ok('nothing the person typed is readable on the server', !bytes.includes('FRESH-TITLE-SECRET') && !bytes.includes('FRESH-BODY-SECRET') && !bytes.includes('FRESH-FOLDER-SECRET'))
  ok('the note is in the new folder (folder number plain, name locked)', db(`select n.folder_id from notes n join users u on u.id=n.user_id where u.email='${email}' order by n.id desc limit 1`)[0].folder_id === db(`select f.id from folders f join users u on u.id=f.user_id where u.email='${email}' and f.system=0`)[0].id)
  // reload: still signed in, no prompts
  await page.reload({ waitUntil: 'networkidle2' })
  ok('after a reload it opens straight to the notes', await waitSel(page, '.fab-main', 20000) && await waitText(page, /FRESH-TITLE-SECRET/, 15000))
  // the search works on decrypted text
  await typeInto(page, '.search-pill input', 'fresh-body'); await wait(400)
  ok('search finds notes by their locked words (done on the device)', /FRESH-TITLE-SECRET/.test(await bodyText(page)))
  await typeInto(page, '.search-pill input', 'zzzz-no-match'); await wait(400)
  ok('and finds nothing for words that are not there', /No notes match/.test(await bodyText(page)))
  // a second user can't see it
  const other = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ name: 'o', email: 'o' + Date.now() + '@example.test', password: 'secret-pass-123' }) }).then((r) => r.json())

  // ===== the old password-only token of a locked-out world =====
  // a token from before the update (no 2FA) is refused data until two-factor is on:
  const r = await fetch(BASE + '/api/notes', { headers: { Authorization: 'Bearer ' + other.token, Accept: 'application/json' } })
  ok('a signed-in session without two-factor is refused data (403)', r.status === 403)

  // ===== guest mode is untouched =====
  await page.evaluate(() => document.querySelector('.avatar').click()); await wait(300)
  await clickText(page, '.account-menu button', /Log out/); await waitSel(page, '.lp')
  apiCalls.length = 0
  await clickText(page, 'button', /^Get started$/); await clickText(page, 'button', /Continue as guest/)
  ok('guest mode opens the workspace, no pop-up, no key', await waitSel(page, '.fab-main') && !(await page.$('.notice-card')))
  await page.evaluate(() => document.querySelector('.fab-main').click()); await wait(300); await clickText(page, '.fab-item', /Text/)
  await page.waitForSelector('.note-modal .rich-body'); await typeInto(page, '.note-modal .title-input', 'GUEST NOTE'); await clickText(page, '.note-modal button', /^Close$/); await wait(800)
  ok('a guest note is saved on the device', /GUEST NOTE/.test(await bodyText(page)))
  await page.evaluate(() => document.querySelector('.fab-main').click()); await wait(300); await clickText(page, '.fab-item', /Audio/)
  await page.waitForSelector('.rec-big'); await page.click('.rec-big'); await wait(2500); await page.click('.btn.rec-stop'); await page.waitForSelector('.rec-player')
  await clickText(page, '.rec-foot button', /^Save$/); await page.waitForFunction(() => !document.querySelector('.rec-modal'), { timeout: 20000 }); await wait(800)
  await page.evaluate(() => document.querySelector('.menu-toggle').click()); await wait(300); await clickText(page, '.sidebar .nav-item', /Recordings/)
  await waitText(page, /Recording /)
  await clickText(page, 'button.play-btn', /Play recording/)
  ok('a guest recording plays back', await page.waitForFunction(() => { const a = document.querySelector('audio'); return a && a.readyState >= 1 && a.duration > 1 }, { timeout: 15000 }).then(() => true, () => false))
  ok('guest mode made no calls to the notes server', !apiCalls.some((c) => /notes|recordings|images|folders/.test(c)), apiCalls.join(','))
} catch (e) {
  ok('script ran to the end', false, e.stack.split('\n').slice(0, 3).join(' | '))
}
ok('no browser errors', problems.length === 0, problems.slice(0, 4).join(' | '))
await browser.close(); report(); process.exit(results.every((r) => r[1]) ? 0 : 1)
