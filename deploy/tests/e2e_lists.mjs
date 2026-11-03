// Checklists and the four "Notes and lists" settings: item order, completed items, link previews
// (asks the server; off by default) and sharing. Run against a server allowed to reach the local
// test website (see README): KP_BASE=http://127.0.0.1:5176
import fs from 'node:fs'
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { BASE, SCRATCH, ok, results, report, launch, wait, bodyText, waitText, waitSel, clickText, typeInto, signUpFresh, serverBytes, db } from './e2e_lib.mjs'

fs.mkdirSync(SCRATCH, { recursive: true })
// a tiny test website for the link previews
const site = http.createServer((req, res) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  if (req.url === '/ok') { res.setHeader('Content-Type', 'text/html'); res.end('<html><head><meta property="og:title" content="Sermon &amp; Study: John 3"><meta property="og:description" content="A talk on grace."><meta property="og:site_name" content="Test Church"><meta property="og:image" content="/p.png"></head></html>') }
  else if (req.url === '/p.png') { res.setHeader('Content-Type', 'image/png'); res.end(png) }
  else { res.statusCode = 404; res.end('no') }
}).listen(8191, '127.0.0.1')

const { browser, page, problems } = await launch()
await browser.defaultBrowserContext().overridePermissions(BASE, ['clipboard-read', 'clipboard-write'])
const previewCalls = []
page.on('request', (r) => { if (r.url().includes('/api/link-preview')) previewCalls.push(r.postData()) })

const openSettings = async (p = page) => { if (!(await p.$('.account-menu'))) await p.evaluate(() => document.querySelector('.avatar').click()); await wait(250); await clickText(p, '.account-menu button', /Settings/); await waitText(p, /Notes and lists/) }
const closeSettings = async (p = page) => { await p.evaluate(() => document.querySelector('.settings-modal .sm-head .icon-btn').click()); await wait(300) }
const toggleState = (p, label) => p.evaluate((label) => { const opt = [...document.querySelectorAll('.sm-opt')].find((o) => o.textContent.includes(label)); return opt?.querySelector('.switch')?.getAttribute('aria-pressed') }, label)
const flip = (p, label) => p.evaluate((label) => { [...document.querySelectorAll('.sm-opt')].find((o) => o.textContent.includes(label)).querySelector('.switch').click() }, label)
const newList = async (p, title) => {
  await p.evaluate(() => document.querySelector('.fab-main').click()); await wait(250); await clickText(p, '.fab-item', /List/)
  await p.waitForSelector('.note-modal .cl'); if (title) await typeInto(p, '.note-modal .title-input', title)
}
const addItems = async (p, texts) => { for (const t of texts) { await p.click('.note-modal .cl-add .cl-text'); await p.keyboard.type(t); await p.keyboard.press('Enter'); await wait(120) } }
const rowTexts = (p) => p.$$eval('.note-modal .cl-row:not(.cl-add) .cl-text', (e) => e.map((x) => x.value))
const doneTexts = (p) => p.$$eval('.note-modal .cl-row.done .cl-text', (e) => e.map((x) => x.value))
const tick = (p, text) => p.evaluate((text) => { const row = [...document.querySelectorAll('.note-modal .cl-row:not(.cl-add)')].find((r) => r.querySelector('.cl-text').value === text); row.querySelector('.cl-check').click() }, text)
const closeEditor = async (p) => { await clickText(p, '.note-modal button', /^Close$/); await wait(1200) }

try {
  await signUpFresh(page, 'lists')

  // ===== the four settings are real now =====
  await openSettings()
  const label = { a: 'Add new items to the bottom', c: 'Move checked items to the bottom', l: 'Display rich link previews', s: 'Enable sharing' }
  ok('no "soon" badges are left', !/soon/i.test(await page.evaluate(() => document.querySelector('.settings-modal').innerText)))
  ok('defaults: items to the bottom ON, checked to the bottom ON, link previews OFF, sharing ON', await toggleState(page, label.a) === 'true' && await toggleState(page, label.c) === 'true' && await toggleState(page, label.l) === 'false' && await toggleState(page, label.s) === 'true')
  ok('the link-preview setting tells people the server sees the address', /sees the address, never your note/.test(await page.evaluate(() => document.querySelector('.settings-modal').innerText)))
  await closeSettings()

  // ===== a checklist with the default settings =====
  await newList(page, 'Groceries')
  await addItems(page, ['Milk', 'Eggs', 'Bread'])
  ok('new items are added at the bottom, in the order typed', JSON.stringify(await rowTexts(page)) === JSON.stringify(['Milk', 'Eggs', 'Bread']), JSON.stringify(await rowTexts(page)))
  await tick(page, 'Eggs'); await wait(300)
  ok('a ticked item drops into "1 completed item" below the rest', JSON.stringify(await rowTexts(page)) === JSON.stringify(['Milk', 'Bread', 'Eggs']) && /1 completed item\b/.test(await bodyText(page)) && JSON.stringify(await doneTexts(page)) === JSON.stringify(['Eggs']), JSON.stringify(await rowTexts(page)))
  // Enter adds a row after this one; Backspace on an empty row removes it
  await page.click('.note-modal .cl-row:not(.cl-add) .cl-text'); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await wait(200)
  await page.keyboard.type('Butter'); await wait(150)
  ok('Enter in an item makes a new item right after it', JSON.stringify((await rowTexts(page)).slice(0, 3)) === JSON.stringify(['Milk', 'Butter', 'Bread']), JSON.stringify(await rowTexts(page)))
  await page.keyboard.press('Enter'); await wait(150); await page.keyboard.press('Backspace'); await wait(200)
  ok('Backspace on an empty item removes it', !(await rowTexts(page)).includes('') && (await rowTexts(page)).length === 4, JSON.stringify(await rowTexts(page)))
  await closeEditor(page)
  ok('the card shows the open items with checkboxes and the completed count', await page.evaluate(() => { const l = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes('Groceries')); return l && l.querySelectorAll('.card-list input[type=checkbox]').length === 3 && /1 completed item/.test(l.textContent) && /Milk/.test(l.textContent) }))
  const row = db("select body, title from notes order by id desc limit 1")[0]
  ok('the checklist is locked on the server (no item text anywhere)', row.body.startsWith('enc1:') && !serverBytes().includes('Milk') && !serverBytes().includes('Groceries'))

  // tick straight from the card
  await page.evaluate(() => { const l = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes('Groceries')); [...l.querySelectorAll('.card-list li')].find((li) => li.textContent.includes('Milk')).querySelector('input').click() }); await wait(1200)
  ok('ticking on the card changes it without opening the note', await page.evaluate(() => { const l = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes('Groceries')); return /2 completed items/.test(l.textContent) }))
  await page.reload({ waitUntil: 'networkidle2' }); await waitSel(page, '.fab-main', 30000); await waitText(page, /Groceries/)
  ok('and it is still ticked after a reload (saved, locked, unlocked again)', await page.evaluate(() => /2 completed items/.test([...document.querySelectorAll('.card')].find((c) => c.textContent.includes('Groceries')).textContent)))
  await typeInto(page, '.search-pill input', 'bread'); await wait(400)
  ok('search finds words inside checklist items', /Groceries/.test(await bodyText(page)))
  await typeInto(page, '.search-pill input', ''); await wait(300)

  // ===== settings change behaviour =====
  await openSettings(); await flip(page, label.a); await flip(page, label.c)
  ok('the toggles flip', await toggleState(page, label.a) === 'false' && await toggleState(page, label.c) === 'false'); await closeSettings()
  await newList(page, 'Top list')
  await addItems(page, ['first', 'second', 'third'])
  ok('with "add to the bottom" OFF, new items go to the top', JSON.stringify(await rowTexts(page)) === JSON.stringify(['third', 'second', 'first']), JSON.stringify(await rowTexts(page)))
  await tick(page, 'second'); await wait(300)
  ok('with "move checked to the bottom" OFF, a ticked item stays in place, crossed out', JSON.stringify(await rowTexts(page)) === JSON.stringify(['third', 'second', 'first']) && JSON.stringify(await doneTexts(page)) === JSON.stringify(['second']) && !/completed item/.test(await bodyText(page)))
  await closeEditor(page)
  ok('the card follows the same setting', await page.evaluate(() => { const l = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes('Top list')); const li = [...l.querySelectorAll('.card-list li')]; return li.length === 3 && li[1].classList.contains('done') }))
  await page.reload({ waitUntil: 'networkidle2' }); await waitSel(page, '.fab-main', 30000)
  await openSettings()
  ok('settings are remembered after a reload', await toggleState(page, label.a) === 'false' && await toggleState(page, label.c) === 'false'); await closeSettings()

  // ===== link previews: off = the server is never asked =====
  await page.evaluate(() => document.querySelector('.fab-main').click()); await wait(250); await clickText(page, '.fab-item', /Text/); await page.waitForSelector('.note-modal .rich-body')
  await typeInto(page, '.note-modal .title-input', 'Sermon link'); await page.click('.note-modal .rich-body'); await page.keyboard.type('Watch http://127.0.0.1:8191/ok and http://127.0.0.1:8191/missing today')
  await wait(1200)
  ok('link previews OFF: no lookup is made and no card appears (editor)', previewCalls.length === 0 && !(await page.$('.lc')))
  await closeEditor(page)
  ok('link previews OFF: no lookup is made and no card appears (card)', previewCalls.length === 0 && !(await page.$('.card .lc')))
  await openSettings(); await flip(page, label.l); await closeSettings(); await wait(2500)
  ok('link previews ON: the card shows the page title, site and picture', await page.waitForFunction(() => { const c = document.querySelector('.card .lc'); return c && /Sermon & Study: John 3/.test(c.textContent) && /Test Church/.test(c.textContent) && c.querySelector('img')?.src.startsWith('data:image/png') }, { timeout: 20000 }).then(() => true, () => false))
  ok('only the two web addresses were looked up (one per link), nothing else', previewCalls.length >= 1 && previewCalls.every((b) => { const j = JSON.parse(b); return Object.keys(j).join() === 'url' && /^http:\/\/127\.0\.0\.1:8191\/(ok|missing)$/.test(j.url) }), JSON.stringify(previewCalls))
  ok('the note\'s own words were never sent to the server for previews', previewCalls.every((b) => !/Watch|today|Sermon link/.test(b)))
  ok('a link with no preview (404) shows nothing, no error', !/No preview|error/i.test(await page.evaluate(() => document.querySelector('.card')?.innerText || '')))
  const callsBefore = previewCalls.length
  await page.reload({ waitUntil: 'networkidle2' }); await waitSel(page, '.fab-main', 30000); await wait(3000)
  ok('after a reload the saved preview is reused (no new lookups)', previewCalls.length === callsBefore && !!(await page.$('.card .lc')), `${previewCalls.length} vs ${callsBefore}`)
  await clickText(page, '.card h3', /Sermon link/); await page.waitForSelector('.note-modal')
  ok('the note editor shows the card too', await page.waitForFunction(() => !!document.querySelector('.note-modal .lc'), { timeout: 10000 }).then(() => true, () => false))
  await closeEditor(page)
  ok('the server holds the note locked (no address, no words)', !serverBytes().includes('127.0.0.1:8191') && !serverBytes().includes('Sermon link'))

  // ===== sharing =====
  await page.evaluate(() => { window.__shared = []; navigator.share = async (d) => { window.__shared.push(d) } })
  await clickText(page, '.card h3', /Groceries/); await page.waitForSelector('.note-modal .cl')
  ok('sharing ON: a Share button is in the note editor', !!(await page.$('.note-modal [aria-label="Share note"]')))
  await page.click('.note-modal [aria-label="Share note"]'); await wait(500)
  const shared = await page.evaluate(() => window.__shared)
  ok('Share hands the title and the checklist text to the phone/browser share sheet', shared.length === 1 && shared[0].title === 'Groceries' && /Groceries\n\n/.test(shared[0].text) && /\[x\] Eggs/.test(shared[0].text) && /\[ \] Bread/.test(shared[0].text), JSON.stringify(shared))
  await closeEditor(page)
  // inside the Android app the app's own share sheet is used
  const pageApp = await browser.newPage(); await pageApp.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await pageApp.evaluateOnNewDocument(() => { window.__appShared = []; window.KeeplyApp = { barColors() {}, recording() {}, toast() {}, isSecure: () => true, setSecure() {}, share(t, x) { window.__appShared.push([t, x]) } } })
  await pageApp.goto(BASE, { waitUntil: 'networkidle2' }); await waitSel(pageApp, '.fab-main', 30000); await waitText(pageApp, /Groceries/)
  await clickText(pageApp, '.card h3', /Groceries/); await pageApp.waitForSelector('.note-modal .cl'); await pageApp.click('.note-modal [aria-label="Share note"]'); await wait(400)
  ok('inside the Android app it uses the app\'s share sheet (bridge)', (await pageApp.evaluate(() => window.__appShared)).length === 1 && (await pageApp.evaluate(() => window.__appShared[0][0])) === 'Groceries')
  await pageApp.close()
  // no navigator.share: copies
  await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); window.__copied = null; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t } }, configurable: true }) })
  await clickText(page, '.card h3', /Groceries/); await page.waitForSelector('.note-modal .cl'); await page.click('.note-modal [aria-label="Share note"]')
  ok('with nothing to share to, it copies the text and says so', await waitText(page, /Copied to the clipboard/, 6000) && /^Groceries\n\n/.test(await page.evaluate(() => window.__copied || '')))
  await closeEditor(page)
  await openSettings(); await flip(page, label.s); await closeSettings()
  await clickText(page, '.card h3', /Groceries/); await page.waitForSelector('.note-modal .cl')
  ok('sharing OFF: the Share button is gone', !(await page.$('.note-modal [aria-label="Share note"]')))
  await closeEditor(page)

  // ===== export includes checklists =====
  const dl = `${SCRATCH}/dl-lists-${Date.now()}`; fs.mkdirSync(dl, { recursive: true })
  const cdp = await browser.target().createCDPSession(); await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl })
  await openSettings(); await clickText(page, '.settings-modal button', /Export/)
  let zip = null; for (let i = 0; i < 80 && !zip; i++) { zip = fs.readdirSync(dl).find((f) => f.endsWith('.zip')); await wait(250) }; await wait(500)
  const out = execFileSync('python3', ['-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({n:z.read(n).decode() for n in z.namelist() if n.endswith(".txt") or n=="notes.json"}))', `${dl}/${zip}`], { maxBuffer: 1 << 26 }).toString()
  const files = JSON.parse(out); const exported = JSON.parse(files['notes.json']).notes.find((n) => n.title === 'Groceries')
  ok('the export has the checklist as "[ ] / [x]" lines and its items in notes.json', /\[x\] Eggs/.test(Object.values(files).join('')) && /\[ \] Bread/.test(Object.values(files).join('')) && exported.kind === 'list' && exported.items.some((i) => i.text === 'Eggs' && i.done === true) && exported.items.some((i) => i.text === 'Bread' && i.done === false))
  await closeSettings()

  // ===== guest =====
  const ctx = await browser.createBrowserContext(); const g = await ctx.newPage(); await g.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await g.goto(BASE, { waitUntil: 'networkidle2' }); await clickText(g, 'button', /^Get started$/); await clickText(g, 'button', /Continue as guest/); await waitSel(g, '.fab-main')
  await newList(g, 'Guest list'); await addItems(g, ['one', 'two']); await tick(g, 'one'); await wait(200); await closeEditor(g)
  ok('guests can use checklists too', await g.evaluate(() => { const l = [...document.querySelectorAll('.card')].find((c) => c.textContent.includes('Guest list')); return l && /1 completed item/.test(l.textContent) && /two/.test(l.textContent) }))
  await openSettings(g)
  ok('guests see link previews as unavailable (switch disabled, "Sign in to use this")', await g.evaluate(() => { const o = [...document.querySelectorAll('.sm-opt')].find((x) => x.textContent.includes('rich link previews')); return o.querySelector('.switch').disabled && /Sign in to use this/.test(o.textContent) }))
  await ctx.close()
} catch (e) {
  ok('script ran to the end', false, e.stack.split('\n').slice(0, 4).join(' | '))
}
site.close()
ok('no browser errors (including security-policy violations)', problems.length === 0, problems.slice(0, 5).join(' | '))
await browser.close(); report(); process.exit(results.every((r) => r[1]) ? 0 : 1)
