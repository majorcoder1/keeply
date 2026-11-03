// The export's .zip writer: build a file with awkward names and big data, then let the system's
// own unzip and Python's zipfile check it (CRCs, names, contents).
import { ZipWriter, crc32 } from '../../web/src/lib/zip.js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = dirname(fileURLToPath(import.meta.url)) + '/work/zip-test.zip'
mkdirSync(dirname(out), { recursive: true })
const results = []
const t = (n, ok, d = '') => results.push([n, !!ok, d])

t('crc32 of "123456789" is cbf43926', crc32(new TextEncoder().encode('123456789')) === 0xcbf43926)
const big = new Uint8Array(6 * 1024 * 1024); for (let i = 0; i < big.length; i += 65536) crypto.getRandomValues(big.subarray(i, i + 65536))
const z = new ZipWriter()
z.addText('README.txt', 'hello\r\nworld', new Date(2026, 10, 2, 9, 30))
z.addText('notes/2026-11-02-Sunday-sermon.txt', 'John 3:16 — “For God so loved” 日本語 🙏')
z.addText('notes/ünï-cødé & spaces (1).txt', 'unicode name')
z.add('photos/empty.bin', new Uint8Array(0))
z.add('recordings/big.webm', big)
writeFileSync(out, Buffer.from(await z.finish().arrayBuffer()))

let list = ''
try { list = execFileSync('unzip', ['-t', out]).toString() } catch (e) { list = String(e.stdout || e) }
t('unzip -t says "No errors detected"', /No errors detected/.test(list), list.slice(-200))
const py = `
import zipfile,sys,hashlib
z=zipfile.ZipFile(sys.argv[1]); print(z.testzip() or 'OK'); print('|'.join(z.namelist()))
print(z.read('notes/2026-11-02-Sunday-sermon.txt').decode('utf-8'))
print(len(z.read('recordings/big.webm')), hashlib.sha1(z.read('recordings/big.webm')).hexdigest())
print(len(z.read('photos/empty.bin')))`
const o = execFileSync('python3', ['-c', py, out]).toString().split('\n')
t('python zipfile: no bad CRCs', o[0] === 'OK', o[0])
t('all 5 names read back, including unicode ones', o[1] === 'README.txt|notes/2026-11-02-Sunday-sermon.txt|notes/ünï-cødé & spaces (1).txt|photos/empty.bin|recordings/big.webm', o[1])
t('unicode text content is intact', o[2] === 'John 3:16 — “For God so loved” 日本語 🙏', o[2])
const { createHash } = await import('node:crypto')
t('a 6 MB file is byte-for-byte identical', o[3] === `${big.length} ${createHash('sha1').update(big).digest('hex')}`, o[3])
t('an empty file is allowed', o[4] === '0')
let tooMany = false; try { const w = new ZipWriter(); for (let i = 0; i < 65535; i++) w.add('f' + i, new Uint8Array(0)) } catch { tooMany = true }
t('refuses more than 65,534 files rather than writing a broken zip', tooMany)

const w = Math.max(...results.map((r) => r[0].length))
for (const [n, ok, d] of results) console.log((ok ? 'PASS ' : 'FAIL ') + n.padEnd(w) + (ok ? '' : '   <- ' + d))
console.log(`\n${results.filter((r) => r[1]).length} of ${results.length} passed`)
process.exit(results.every((r) => r[1]) ? 0 : 1)
