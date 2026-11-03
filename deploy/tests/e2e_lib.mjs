// Shared helpers for driving Keeply in a headless browser and checking the server's data.
import puppeteer from '/home/aaron/keeply-dev/tools/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import fs from 'node:fs'

export const BASE = process.env.KP_BASE || 'http://127.0.0.1:5173'
export const API_DIR = '/home/aaron/keeply-dev/api'
export const SCRATCH = process.env.KP_WORK || '/tmp/keeply-tests'
export const results = []
export const ok = (name, cond, detail = '') => results.push([name, !!cond, detail])

export function totp(secret, step) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''; for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)))
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step))
  const h = createHmac('sha1', key).update(msg).digest(); const o = h[19] & 15
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 1000000).padStart(6, '0')
}
export const nowStep = () => Math.floor(Date.now() / 1000 / 30)

export function db(sql) {
  const py = 'import sqlite3,json,sys\nc=sqlite3.connect(sys.argv[1]);c.row_factory=sqlite3.Row\nprint(json.dumps([dict(r) for r in c.execute(sys.argv[2])]))'
  return JSON.parse(execFileSync('python3', ['-c', py, `${API_DIR}/database/test.sqlite`, sql]).toString())
}

// every byte the server holds: the database file and every stored file
export function serverBytes() {
  const parts = [fs.readFileSync(`${API_DIR}/database/test.sqlite`)]
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = `${d}/${f.name}`; f.isDirectory() ? walk(p) : parts.push(fs.readFileSync(p)) } }
  if (fs.existsSync(`${API_DIR}/storage/app/public`)) walk(`${API_DIR}/storage/app/public`)
  return Buffer.concat(parts)
}
export function storedFiles() {
  const out = []
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = `${d}/${f.name}`; f.isDirectory() ? walk(p) : out.push(p) } }
  if (fs.existsSync(`${API_DIR}/storage/app/public`)) walk(`${API_DIR}/storage/app/public`)
  return out.filter((p) => !p.endsWith('.gitignore'))
}

export async function launch() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/brave-browser', headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=390,844', `--user-data-dir=${SCRATCH}/profile-${Date.now()}`],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  const problems = []
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/401|403|422|429|Failed to load resource/.test(m.text())) problems.push('console: ' + m.text()) })
  page.on('dialog', (d) => d.accept())
  // a fake microphone: a tone that "speaks" so the level meter and recorder have real audio
  await page.evaluateOnNewDocument(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext(); await ctx.resume()
      const o = ctx.createOscillator(); o.frequency.value = 220
      const g = ctx.createGain(); g.gain.value = 0.2
      const d = ctx.createMediaStreamDestination(); o.connect(g).connect(d); o.start()
      return d.stream
    }
  })
  return { browser, page, problems }
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms))
export const bodyText = (page) => page.evaluate(() => document.body.innerText)
export async function waitText(page, re, ms = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (re.test(await bodyText(page))) return true; await wait(150) }
  return false
}
export async function waitSel(page, sel, ms = 20000) {
  try { await page.waitForSelector(sel, { timeout: ms }); return true } catch { return false }
}
export async function clickText(page, selector, re) {
  const done = await page.evaluate((selector, src) => {
    const re = new RegExp(src, 'i')
    const el = [...document.querySelectorAll(selector)].find((e) => re.test(e.textContent || e.getAttribute('aria-label') || ''))
    if (!el) return false
    el.click(); return true
  }, selector, re.source)
  return done
}
export async function typeInto(page, selector, text) {
  await page.waitForSelector(selector, { timeout: 15000 })
  await page.focus(selector)
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  await page.keyboard.type(text, { delay: 5 })
}
export const shot = (page, name) => page.screenshot({ path: `${SCRATCH}/shot-${name}.png` })

export function report() {
  const w = Math.max(...results.map((r) => r[0].length))
  for (const [n, good, d] of results) console.log((good ? 'PASS ' : 'FAIL ') + n.padEnd(w) + (good ? '' : '   <- ' + d))
  console.log(`\n${results.filter((r) => r[1]).length} of ${results.length} passed`)
}

// Sign up a brand-new account through the screens (pop-up, two-factor, key) and land in the workspace.
export async function signUpFresh(page, label = 'tester') {
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await clickText(page, 'button', /^Get started$/)
  const email = `${label}-${Date.now()}@example.test`
  await typeInto(page, 'input[placeholder="Jane Doe"]', 'Test ' + label); await typeInto(page, 'input[type=email]', email); await typeInto(page, 'input[type=password]', 'fresh-pass-123')
  await clickText(page, 'button.btn', /^Sign up$/)
  await waitSel(page, '.notice-card'); await clickText(page, 'button', /^Continue$/)
  await waitSel(page, '.secret-box code')
  const secret = (await page.evaluate(() => document.querySelector('.secret-box code').textContent)).replace(/\s/g, '')
  await typeInto(page, '.code-input', totp(secret, nowStep())); await clickText(page, 'button.btn', /Turn on two-factor/)
  await waitText(page, /recovery codes/); await page.click('.gate-check input'); await clickText(page, 'button.btn', /^Continue$/)
  await waitText(page, /Your Keeply number/)
  const keyCode = (await page.$$eval('.key-code span', (e) => e.map((x) => x.textContent))).join('')
  await page.click('.gate-check input'); await clickText(page, 'button.btn', /^Continue$/)
  await waitSel(page, '.fab-main', 60000)
  return { email, secret, keyCode }
}
