// "Export my notes": a signed-in (locked) account in a browser, the same account through a
// pretend Android app, a cancelled and a failing save, and guest mode.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { BASE, SCRATCH, ok, results, report, launch, wait, bodyText, waitText, waitSel, clickText, typeInto, signUpFresh, serverBytes } from './e2e_lib.mjs'

const DL = `${SCRATCH}/downloads-${Date.now()}`
fs.mkdirSync(DL, { recursive: true })
fs.mkdirSync(SCRATCH, { recursive: true })

function inspect(zipPath) {
  const py = `
import zipfile,sys,json
z=zipfile.ZipFile(sys.argv[1]); bad=z.testzip()
out={'bad':bad,'names':z.namelist(),'texts':{}, 'head':{}}
for n in z.namelist():
    b=z.read(n)
    out['head'][n]=b[:12].hex()
    if n.endswith('.txt') or n=='notes.json': out['texts'][n]=b.decode('utf-8')
print(json.dumps(out))`
  return JSON.parse(execFileSync('python3', ['-c', py, zipPath], { maxBuffer: 64 << 20 }).toString())
}
async function pickFile(dir, before = []) {
  for (let i = 0; i < 120; i++) {
    const f = fs.readdirSync(dir).filter((n) => n.endsWith('.zip') && !before.includes(n))
    if (f.length) { await wait(500); return `${dir}/${f[0]}` }
    await wait(250)
  }
  return null
}
async function openSettingsAndExport(page) {
  await page.evaluate(() => document.querySelector('.avatar').click()); await wait(300)
  await clickText(page, '.account-menu button', /Settings/)
  await waitText(page, /Your data/)
  await clickText(page, '.settings-modal button', /Export/)
}
const mkPhoto = (name) => { const p = `${SCRATCH}/${name}.jpg`; execFileSync('convert', ['-size', '1000x700', 'gradient:orange-blue', p]); return p }

const { browser, page, problems } = await launch()
const cdp = await browser.target().createCDPSession()
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL })

try {
  // ===== a locked account with a note, a photo note and a voice note =====
  await signUpFresh(page, 'export')
  await page.evaluate(() => document.querySelector('.fab-main').click()); await wait(300); await clickText(page, '.fab-item', /Text/)
  await page.waitForSelector('.note-modal .rich-body')
  await typeInto(page, '.note-modal .title-input', 'EXPORT-TITLE-ONE Sunday'); await page.click('.note-modal .rich-body'); await page.keyboard.type('EXPORT-BODY-ONE John 3:16')
  await page.type('.note-modal .tag-input', 'preaching'); await page.keyboard.press('Enter')
  await clickText(page, '.note-modal button', /^Close$/); await wait(1200)
  await (await page.$('input[type=file][accept="image/*"]')).uploadFile(mkPhoto('exp-photo'))
  await page.waitForFunction(() => { const i = document.querySelector('.ed-images img'); return i && i.naturalWidth > 0 }, { timeout: 20000 })
  await typeInto(page, '.note-modal .title-input', 'EXPORT-PHOTO-NOTE'); await clickText(page, '.note-modal button', /^Close$/); await wait(1200)
  await page.evaluate(() => document.querySelector('.fab-main').click()); await wait(300); await clickText(page, '.fab-item', /Audio/)
  await page.waitForSelector('.rec-big'); await page.click('.rec-big'); await wait(3500); await page.click('.btn.rec-stop'); await page.waitForSelector('.rec-player')
  await page.type('.rec-text', 'EXPORT-VOICE-WORDS'); await clickText(page, '.rec-foot button', /^Save$/)
  await page.waitForFunction(() => !document.querySelector('.rec-modal'), { timeout: 30000 }); await wait(1500)
  ok('the export set-up has 2 notes + a voice note on a LOCKED account (server holds nothing readable)', !serverBytes().includes('EXPORT-TITLE-ONE') && !serverBytes().includes('EXPORT-VOICE-WORDS'))

  // ===== A. download in a browser =====
  await openSettingsAndExport(page)
  const zipA = await pickFile(DL)
  ok('Export downloads a .zip named Keeply-export-<date>.zip', !!zipA && /Keeply-export-\d{4}-\d{2}-\d{2}\.zip$/.test(zipA), String(zipA))
  const A = inspect(zipA)
  const names = A.names
  ok('the zip is valid (no bad CRC)', A.bad === null, String(A.bad))
  ok('it holds README.txt, notes.json, 3 notes, 1 photo, 1 recording', names.includes('README.txt') && names.includes('notes.json') && names.filter((n) => n.startsWith('notes/')).length === 3 && names.filter((n) => n.startsWith('photos/')).length === 1 && names.filter((n) => n.startsWith('recordings/')).length === 1, names.join(', '))
  const allText = Object.values(A.texts).join('\n')
  ok('the notes are readable in the export (unlocked): titles, words, labels', /EXPORT-TITLE-ONE Sunday/.test(allText) && /EXPORT-BODY-ONE John 3:16/.test(allText) && /#preaching/.test(allText) && /EXPORT-VOICE-WORDS/.test(allText))
  const photo = names.find((n) => n.startsWith('photos/')), rec = names.find((n) => n.startsWith('recordings/'))
  ok('the photo is a real JPEG again (not scrambled)', A.head[photo].startsWith('ffd8ff'), A.head[photo])
  ok('the recording is real WebM audio again (not scrambled)', A.head[rec].startsWith('1a45dfa3'), A.head[rec])
  fs.writeFileSync(`${SCRATCH}/a-rec.webm`, execFileSync('python3', ['-c', 'import zipfile,sys;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))', zipA, rec], { maxBuffer: 64 << 20 }))
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${SCRATCH}/a-rec.webm`]).toString())
  ok('the recording plays for about 3 seconds', dur > 2 && dur < 6, String(dur))
  const json = JSON.parse(A.texts['notes.json'])
  ok('notes.json lists everything with labels, dates, files', json.app === 'Keeply' && json.notes.length === 3 && json.notes.some((n) => n.labels.includes('preaching') && n.title.startsWith('EXPORT-TITLE-ONE')) && json.notes.every((n) => n.created_at && n.file) && json.recordings.length === 1, JSON.stringify(json).slice(0, 200))
  ok('the screen says how many were saved', await waitText(page, /Saved Keeply-export-.*3 note\(s\), 1 photo\(s\), 1 recording\(s\)/, 8000))
  ok('and the README warns the file is not locked', /NOT locked/.test(A.texts['README.txt']))
  ok('exporting did not put anything readable on the server', !serverBytes().includes('EXPORT-TITLE-ONE') && !serverBytes().includes('EXPORT-BODY-ONE'))

  // ===== B. inside the Android app (a pretend app bridge) =====
  const page2 = await browser.newPage()
  await page2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  const mkStub = (mode) => () => {
    window.__saved = []; window.__begin = null; window.__polls = 0; window.__ended = false; window.__cancelled = false
    window.KeeplyApp = {
      barColors() {}, recording() {}, toast() {}, isSecure: () => true, setSecure() {},
      saveBegin(name, mime) { window.__begin = [name, mime]; window.__polls = 0 },
      saveState() { window.__polls++; if (window.__mode === 'cancel') return window.__polls > 2 ? 'cancelled' : 'waiting'; return window.__polls > 2 ? 'ready' : 'waiting' },
      saveChunk(b64) { if (window.__mode === 'fail') return false; window.__saved.push(b64); return true },
      saveEnd() { window.__ended = true; return true },
      saveCancel() { window.__cancelled = true },
    }
  }
  await page2.evaluateOnNewDocument(() => { window.__mode = sessionStorage.getItem('__mode') || 'ok' })
  await page2.evaluateOnNewDocument(mkStub())
  const filesBefore = fs.readdirSync(DL)
  await page2.goto(BASE, { waitUntil: 'networkidle2' })
  ok('the pretend app opens the same account with the key remembered', await waitSel(page2, '.fab-main', 30000))
  await openSettingsAndExport(page2)
  ok('the export finishes through the app bridge', await page2.waitForFunction(() => window.__ended === true, { timeout: 30000 }).then(() => true, () => false))
  const sent = await page2.evaluate(() => ({ begin: window.__begin, chunks: window.__saved, polls: window.__polls }))
  ok('the app is asked to save "Keeply-export-<date>.zip" as application/zip and the page waited for the save dialog', /^Keeply-export-\d{4}-\d{2}-\d{2}\.zip$/.test(sent.begin[0]) && sent.begin[1] === 'application/zip' && sent.polls >= 3, JSON.stringify(sent.begin) + ' polls ' + sent.polls)
  const zipB = `${SCRATCH}/b-via-app.zip`
  fs.writeFileSync(zipB, Buffer.concat(sent.chunks.map((c) => Buffer.from(c, 'base64'))))
  const B = inspect(zipB)
  ok('the file passed across in pieces is the same valid zip (same files and notes)', B.bad === null && JSON.stringify([...B.names].sort()) === JSON.stringify([...A.names].sort()) && B.texts['notes.json'].includes('EXPORT-TITLE-ONE') && B.head[photo].startsWith('ffd8ff'), B.names.join())
  ok('nothing was downloaded by the browser itself in that mode', fs.readdirSync(DL).length === filesBefore.length)

  // cancelled save dialog, and a save that fails half-way
  await page2.evaluate(() => sessionStorage.setItem('__mode', 'cancel')); await page2.reload({ waitUntil: 'networkidle2' }); await waitSel(page2, '.fab-main')
  await openSettingsAndExport(page2); await wait(3500)
  ok('cancelling the save dialog quietly does nothing (no error, no "saved" message)', !/Saved Keeply|Something went wrong|Couldn/.test(await bodyText(page2)) && (await page2.evaluate(() => window.__saved.length)) === 0)
  await page2.evaluate(() => sessionStorage.setItem('__mode', 'fail')); await page2.reload({ waitUntil: 'networkidle2' }); await waitSel(page2, '.fab-main')
  await openSettingsAndExport(page2)
  ok('a save that fails part-way shows a clear message and cancels the file', await waitText(page2, /Saving stopped part-way/, 20000) && await page2.evaluate(() => window.__cancelled === true))
  await page2.close()

  // ===== C. guest mode (data only on this device) =====
  const ctx = await browser.createBrowserContext()
  const g = await ctx.newPage(); await g.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await g.evaluateOnNewDocument(() => { navigator.mediaDevices.getUserMedia = async () => { const c = new AudioContext(); await c.resume(); const o = c.createOscillator(); o.frequency.value = 220; const gn = c.createGain(); gn.gain.value = 0.2; const d = c.createMediaStreamDestination(); o.connect(gn).connect(d); o.start(); return d.stream } })
  const gdl = `${SCRATCH}/downloads-guest-${Date.now()}`; fs.mkdirSync(gdl, { recursive: true })
  const gc = await browser.target().createCDPSession(); await gc.send('Browser.setDownloadBehavior', { behavior: 'allow', browserContextId: ctx.id, downloadPath: gdl })
  await g.goto(BASE, { waitUntil: 'networkidle2' }); await clickText(g, 'button', /^Get started$/); await clickText(g, 'button', /Continue as guest/); await waitSel(g, '.fab-main')
  await g.evaluate(() => document.querySelector('.fab-main').click()); await wait(300); await clickText(g, '.fab-item', /Text/); await g.waitForSelector('.note-modal .rich-body')
  await typeInto(g, '.note-modal .title-input', 'GUEST-EXPORT-NOTE'); await g.click('.note-modal .rich-body'); await g.keyboard.type('guest words'); await clickText(g, '.note-modal button', /^Close$/); await wait(800)
  await (await g.$('input[type=file][accept="image/*"]')).uploadFile(mkPhoto('guest-photo'))
  await g.waitForFunction(() => { const i = document.querySelector('.ed-images img'); return i && i.naturalWidth > 0 }, { timeout: 20000 })
  await typeInto(g, '.note-modal .title-input', 'GUEST-PHOTO'); await clickText(g, '.note-modal button', /^Close$/); await wait(800)
  await g.evaluate(() => document.querySelector('.fab-main').click()); await wait(300); await clickText(g, '.fab-item', /Audio/)
  await g.waitForSelector('.rec-big'); await g.click('.rec-big'); await wait(2500); await g.click('.btn.rec-stop'); await g.waitForSelector('.rec-player'); await clickText(g, '.rec-foot button', /^Save$/)
  await g.waitForFunction(() => !document.querySelector('.rec-modal'), { timeout: 20000 }); await wait(800)
  await openSettingsAndExport(g)
  const zipC = await pickFile(gdl)
  ok('guest mode exports too', !!zipC)
  if (zipC) {
    const C = inspect(zipC)
    ok('the guest export has the notes, the photo (JPEG) and the recording', C.bad === null && C.names.filter((n) => n.startsWith('notes/')).length >= 2 && C.names.filter((n) => n.startsWith('photos/')).length === 1 && C.names.filter((n) => n.startsWith('recordings/')).length === 1 && C.head[C.names.find((n) => n.startsWith('photos/'))].startsWith('ffd8ff') && /GUEST-EXPORT-NOTE/.test(Object.values(C.texts).join('')), C.names.join())
  }
  await ctx.close()
} catch (e) {
  ok('script ran to the end', false, e.stack.split('\n').slice(0, 4).join(' | '))
}
ok('no browser errors (including security-policy violations)', problems.length === 0, problems.slice(0, 5).join(' | '))
await browser.close(); report(); process.exit(results.every((r) => r[1]) ? 0 : 1)
