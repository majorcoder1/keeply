// The top bar (search box in the true centre) and the profile picture (signed in = locked
// image on the account; guest = kept on the device).
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { BASE, SCRATCH, ok, results, report, launch, wait, bodyText, waitText, waitSel, clickText, signUpFresh, db, storedFiles } from './e2e_lib.mjs'

fs.mkdirSync(SCRATCH, { recursive: true })
const mk = (name, size) => { const p = `${SCRATCH}/${name}.jpg`; execFileSync('convert', ['-size', size, 'gradient:orange-blue', p]); return p }
const geometry = (page) => page.evaluate(() => {
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, c: (b.left + b.right) / 2, w: b.width } }
  return { vw: window.innerWidth, search: r('.topbar .search-pill'), logo: r('.topbar .logo'), avatar: r('.topbar .avatar'), overflow: document.documentElement.scrollWidth - window.innerWidth }
})

const { browser, page, problems } = await launch()
const apiCalls = []
try {
  const { email } = await signUpFresh(page, 'avatar')

  // ===== the search box is in the middle of the page =====
  for (const [w, h] of [[1920, 1000], [1440, 900], [1280, 800], [1024, 768], [800, 700]]) {
    await page.setViewport({ width: w, height: h, isMobile: false })
    await waitSel(page, '.topbar .search-pill', 20000)
    await wait(400)
    const g = await geometry(page)
    const off = Math.abs(g.search.c - g.vw / 2)
    ok(`desktop ${w}px: the search box is centred (off by ${off.toFixed(1)} px), between the logo and the avatar`, off <= 2 && g.logo.r <= g.search.l && g.avatar.l >= g.search.r && g.overflow <= 0, JSON.stringify(g))
  }
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await waitSel(page, '.topbar .search-pill', 20000); await wait(400)
  const m = await geometry(page)
  ok('phone: the bar still fits, search box fills the middle, avatar on the right', m.overflow <= 0 && m.search.w > 150 && m.avatar.r <= m.vw && m.avatar.l > m.search.l, JSON.stringify(m))
  await page.setViewport({ width: 1280, height: 800, isMobile: false }); await waitSel(page, '.topbar .search-pill', 20000); await wait(300)

  // ===== a profile picture =====
  const open = async () => { if (!(await page.$('.account-menu'))) await page.evaluate(() => document.querySelector('.avatar').click()); await wait(300) }
  await open()
  ok('the account menu offers "Add a picture"', await waitText(page, /Add a picture/, 4000))
  const input = async () => page.$('input[type=file]:not([multiple])')
  await (await input()).uploadFile(mk('wide', '1200x600'))
  ok('after choosing a wide photo, the avatar becomes a square 256 px picture', await page.waitForFunction(() => { const i = document.querySelector('.topbar .avatar img'); return i && i.naturalWidth === 256 && i.naturalHeight === 256 }, { timeout: 20000 }).then(() => true, () => false))
  const u = db(`select avatar from users where email='${email}'`)[0].avatar
  ok('the server remembers it as a locked .enc image', /^\/storage\/images\/\d+\/[A-Za-z0-9_-]+\.enc$/.test(u || ''), String(u))
  const file = storedFiles().find((p) => u && p.endsWith(u.split('/').pop()))
  const bytes = file ? fs.readFileSync(file) : Buffer.alloc(0)
  ok('the picture on the server is scrambled (KPLY1, no JPEG inside)', bytes.subarray(0, 5).toString() === 'KPLY1' && !bytes.includes(Buffer.from('JFIF')) && !bytes.includes(Buffer.from([0xff, 0xd8, 0xff])))
  ok('the menu now says "Change picture" and offers Remove', /Change picture/.test(await bodyText(page)) && /Remove/.test(await bodyText(page)))
  ok('the menu shows the picture too', await page.evaluate(() => !!document.querySelector('.am-pic img')))
  await page.reload({ waitUntil: 'networkidle2' }); await waitSel(page, '.fab-main', 30000)
  ok('after a reload the picture is still there (unlocked again with the key)', await page.waitForFunction(() => { const i = document.querySelector('.topbar .avatar img'); return i && i.naturalWidth === 256 }, { timeout: 20000 }).then(() => true, () => false))

  const before = storedFiles().length
  await open(); await (await input()).uploadFile(mk('tall', '500x900'))
  await page.waitForFunction((old) => { const i = document.querySelector('.topbar .avatar img'); return i && i.src && !i.src.endsWith(old) }, { timeout: 20000 }, 'x').catch(() => {})
  await wait(1500)
  const u2 = db(`select avatar from users where email='${email}'`)[0].avatar
  ok('choosing another picture replaces it and deletes the old file', u2 && u2 !== u && storedFiles().length === before && !storedFiles().some((p) => p.endsWith(u.split('/').pop())), `${u} -> ${u2} files ${before}->${storedFiles().length}`)

  // not an image
  fs.writeFileSync(`${SCRATCH}/not-a-picture.jpg`, 'this is just text, not a picture')
  await open(); await (await input()).uploadFile(`${SCRATCH}/not-a-picture.jpg`)
  ok('a file that is not a picture gives a clear message and changes nothing', await waitText(page, /can.t be read/, 8000) && db(`select avatar from users where email='${email}'`)[0].avatar === u2)

  await clickText(page, '.account-menu button', /^\s*Remove/); await wait(1200)
  ok('Remove goes back to the letter and clears the server (file deleted)', !(await page.$('.topbar .avatar img')) && /^[A-Z]$/.test(await page.evaluate(() => document.querySelector('.topbar .avatar').textContent.trim())) && db(`select avatar from users where email='${email}'`)[0].avatar === null && !storedFiles().some((p) => p.endsWith(u2.split('/').pop())))

  // ===== guest =====
  const ctx = await browser.createBrowserContext(); const g = await ctx.newPage(); await g.setViewport({ width: 1280, height: 800 })
  g.on('request', (r) => { if (r.url().includes('/api/')) apiCalls.push(r.method() + ' ' + new URL(r.url()).pathname) })
  await g.goto(BASE, { waitUntil: 'networkidle2' }); await clickText(g, 'button', /^Get started$/); await clickText(g, 'button', /Continue as guest/); await waitSel(g, '.fab-main')
  apiCalls.length = 0
  await g.evaluate(() => document.querySelector('.avatar').click()); await wait(300)
  await (await g.$('input[type=file]:not([multiple])')).uploadFile(mk('guest', '800x800'))
  ok('a guest can set a picture too (kept on the device)', await g.waitForFunction(() => { const i = document.querySelector('.topbar .avatar img'); return i && i.naturalWidth === 256 }, { timeout: 15000 }).then(() => true, () => false) && await g.evaluate(() => (localStorage.getItem('keeply.avatar') || '').startsWith('data:image/jpeg')))
  ok('and that made no calls to the server', !apiCalls.some((c) => !/user/.test(c)), apiCalls.join())
  await g.reload({ waitUntil: 'networkidle2' }); await waitSel(g, '.fab-main')
  ok('the guest picture survives a reload', await g.waitForFunction(() => !!document.querySelector('.topbar .avatar img'), { timeout: 10000 }).then(() => true, () => false))
  await ctx.close()
} catch (e) {
  ok('script ran to the end', false, e.stack.split('\n').slice(0, 4).join(' | '))
}
ok('no browser errors (including security-policy violations)', problems.length === 0, problems.slice(0, 5).join(' | '))
await browser.close(); report(); process.exit(results.every((r) => r[1]) ? 0 : 1)
