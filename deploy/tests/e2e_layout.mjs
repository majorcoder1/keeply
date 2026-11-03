import { BASE, launch, wait, waitSel, waitText, ok, results, report, totp, nowStep, shot } from './e2e_lib.mjs'

async function api(path, token, body) {
  const r = await fetch(BASE + '/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) })
  return r.json()
}
async function makeUser(tag, { twoFactor = true, key = false } = {}) {
  const email = `${tag}-${Date.now()}@example.test`
  const reg = await api('/register', null, { name: tag, email, password: 'secret-pass-123' })
  if (twoFactor) { const s = await api('/two-factor/setup', reg.token); await api('/two-factor/confirm', reg.token, { code: totp(s.secret, nowStep()) }) }
  if (key) await api('/key', reg.token, { salt: 'A'.repeat(22), check: 'enc1:abcdef' })
  return reg.token
}

const sizes = [[390, 844], [360, 640], [768, 1024], [1280, 800]]
const { browser, page, problems } = await launch()
const metrics = () => page.evaluate(() => {
  const w = window.innerWidth
  const wide = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > w + 1 || r.left < -1) && getComputedStyle(e).position !== 'fixed' }).map((e) => e.className || e.tagName).slice(0, 4)
  const small = [...document.querySelectorAll('button, input, a')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 30 && !e.closest('.lp-nav, .lp-footer, .help-top, .tag-editor')) }).length
  return { docOverflow: document.documentElement.scrollWidth - w, wide, w }
})

for (const dark of [false, true]) {
  for (const [w, h] of sizes) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 })
    const label = `${w}x${h}${dark ? ' dark' : ''}`
    const visit = async (name, setup, ready) => {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' })
      await page.evaluate((dark) => { localStorage.clear(); localStorage.setItem('keeply_settings', JSON.stringify({ darkMode: dark })) }, dark)
      await setup()
      await page.goto(BASE, { waitUntil: 'networkidle2' })
      const present = await waitSel(page, ready, 15000)
      const m = await metrics()
      ok(`${name} @ ${label}: shows and has no sideways overflow`, present && m.docOverflow <= 0 && m.wide.length === 0, JSON.stringify(m))
      return present
    }
    // landing
    await visit('landing', async () => {}, '.lp-footer')
    // pop-up (logged in, not yet seen)
    const t1 = await makeUser('notice')
    await visit('security pop-up', () => page.evaluate((t) => localStorage.setItem('keeply_token', t), t1), '.notice-card')
    // two-factor setup (token of a user without 2FA, notice seen)
    const t2 = await makeUser('setup', { twoFactor: false })
    await visit('two-factor setup', () => page.evaluate((t) => { localStorage.setItem('keeply_token', t); localStorage.setItem('keeply.notice.2026-10-security', '1') }, t2), '.qr-wrap img')
    // key setup
    const t3 = await makeUser('keysetup')
    await visit('key setup', () => page.evaluate((t) => { localStorage.setItem('keeply_token', t); localStorage.setItem('keeply.notice.2026-10-security', '1') }, t3), '.key-code')
    // key unlock
    const t4 = await makeUser('unlock', { key: true })
    await visit('key unlock', () => page.evaluate((t) => { localStorage.setItem('keeply_token', t); localStorage.setItem('keeply.notice.2026-10-security', '1') }, t4), '.code-input.long')
    // security page from landing
    await visit('security page', async () => {}, '.lp-footer')
    await page.evaluate(() => [...document.querySelectorAll('.lp-link')].find((b) => /Security/.test(b.textContent))?.click())
    await waitText(page, /How we keep your notes private/, 8000)
    const m = await metrics()
    ok(`security page @ ${label}: no sideways overflow`, m.docOverflow <= 0 && m.wide.length === 0, JSON.stringify(m))
    if (w === 390 && !dark) { /* readable screenshots can't be viewed here; layout is checked by measurement */ }
  }
}
ok('no browser errors', problems.length === 0, problems.slice(0, 4).join(' | '))
await browser.close()
report()
process.exit(results.every((r) => r[1]) ? 0 : 1)
