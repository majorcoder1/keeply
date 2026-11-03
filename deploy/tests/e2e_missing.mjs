// Old notes that point at photos / recordings the server no longer has (404): the "Locking your notes"
// step must not get stuck. It locks everything it can, leaves out what is gone, and says so once.
import { execFileSync } from 'node:child_process'
import { BASE, API_DIR, SCRATCH, ok, results, report, launch, wait, bodyText, waitText, waitSel, clickText, signUpFresh, db, serverBytes, storedFiles } from './e2e_lib.mjs'

const { browser, page, problems } = await launch()
try {
  const { email } = await signUpFresh(page, 'missing')
  const S = new URL('./work', import.meta.url).pathname
  const run = (script, env = {}) => execFileSync('php', [new URL('./run_in_app.php', import.meta.url).pathname, API_DIR, new URL(script, import.meta.url).pathname], { env: { ...process.env, KP_S: S, KP_EMAIL: email, ...env } }).toString()
  ok('(set-up) old readable data with missing files was added', /seeded/.test(run('./seed_missing.php')))
  const uid = db(`select id from users where email='${email}'`)[0].id

  await page.reload({ waitUntil: 'domcontentloaded' })
  ok('the locking step finishes instead of sticking on "could not be downloaded"', await waitText(page, /Your notes are locked/, 90000))
  const t = await bodyText(page)
  ok('it says one photo was already gone', /1 photo was already gone/.test(t), t.slice(0, 300))
  ok('and one recording has no sound file', /1 recording has no sound file/.test(t))
  ok('and does not show the old error', !/could not be downloaded/.test(t) && !/Try again/.test(t))
  await clickText(page, 'button.btn', /^Continue$/)
  ok('Continue opens the notes', await waitSel(page, '.fab-main', 30000))
  ok('the note with the lost photo kept its words', await waitText(page, /DEAD-PHOTO-NOTE SECRET-ONE/, 15000))
  ok('the ordinary old note is there too', await waitText(page, /PLAIN-OLD-NOTE SECRET-THREE/, 15000))
  await wait(1500)

  const notes = db(`select title,body,images from notes where user_id=${uid}`)
  ok('every old note is now locked on the server', notes.length === 2 && notes.every((n) => !n.title && n.body.startsWith('enc1:')), JSON.stringify(notes).slice(0, 200))
  const withPhoto = notes.find((n) => JSON.parse(n.images || '[]').length)
  ok('the photo that existed was locked, the lost one was dropped', withPhoto && JSON.parse(withPhoto.images).length === 1 && /\.enc$/.test(JSON.parse(withPhoto.images)[0]), withPhoto?.images)
  const recs = db(`select title,path from recordings where user_id=${uid} order by id`)
  ok('the recording that existed was locked (old copy removed)', recs.some((r) => /\.enc$/.test(r.path)) && !recs.some((r) => /okrec\.webm/.test(r.path)), JSON.stringify(recs))
  ok('the recording whose sound is gone is left in the list', recs.some((r) => /gone-rec\.webm/.test(r.path)))
  const bytes = serverBytes()
  ok('none of the old notes\' words are readable on the server any more', !bytes.includes('DEAD-PHOTO-NOTE') && !bytes.includes('words that must survive') && !bytes.includes('PLAIN-OLD-NOTE') && !bytes.includes('Fine recording'))

  // next time: no locking screen again for the missing recording
  await page.reload({ waitUntil: 'domcontentloaded' })
  ok('on the next visit it goes straight to the notes (no locking screen, no summary)', await waitSel(page, '.fab-main', 30000) && !/Your notes are locked|Locking your notes/.test(await bodyText(page)))
} catch (e) {
  ok('script ran to the end', false, e.stack.split('\n').slice(0, 4).join(' | '))
}
ok('no browser errors (including security-policy violations)', problems.length === 0, problems.slice(0, 5).join(' | '))
await browser.close(); report(); process.exit(results.every((r) => r[1]) ? 0 : 1)
