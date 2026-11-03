#!/usr/bin/env node
// protect.mjs — 4thePeople Media standard "protect" build step.
//
//   node protect.mjs <sourceFolder> <outputFolder>
//
// Reads a built site from <sourceFolder>, writes a protected copy to
// <outputFolder>, and NEVER modifies the source. For each file it:
//   .css  -> minify (clean-css) + copyright banner        (*.min.css copied as-is)
//   .js   -> minify (terser) + obfuscate + banner          (*.min.js, service-worker
//            files, and anything unparseable copied as-is)
//   .html -> insert a banner comment after <head>
//   *     -> copied through unchanged
//
// NOTE: This is a deterrent and an ownership stamp. It does NOT prevent copying,
// block screenshots, or make the code un-viewable. Anything a browser runs can be
// read. The value here is (1) making casual reuse harder and (2) a clear, stamped
// claim of ownership.

import { readdir, readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises'
import { join, extname, relative, basename, dirname } from 'node:path'
import { minify as terserMinify } from 'terser'
import CleanCSS from 'clean-css'
import JsObfuscator from 'javascript-obfuscator'

const [, , SRC, OUT] = process.argv
if (!SRC || !OUT) {
  console.error('Usage: node protect.mjs <sourceFolder> <outputFolder>')
  process.exit(1)
}

const YEAR = new Date().getFullYear()
const BANNER = `© ${YEAR} 4thePeople Media — All rights reserved. Unauthorized copying, reuse, or redistribution is prohibited. See /legal-notice.html`
const JS_BANNER = `/*! ${BANNER} */\n`
const HTML_BANNER = `<!-- ${BANNER} -->\n`

// Files that must NOT be minified/obfuscated (already minified, or generated code
// whose exact form matters — the PWA service worker and its registration).
const SKIP_TRANSFORM = (name) =>
  /\.min\.(js|css)$/i.test(name) ||
  /^sw\.js$/i.test(name) ||
  /^workbox-[\w-]+\.js$/i.test(name) ||
  /^registerSW\.js$/i.test(name)

// Conservative obfuscation. The aggressive transforms that commonly break React /
// bundled apps or tank runtime performance are deliberately disabled.
const OBFUSCATE_OPTS = {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,          // renaming globals breaks module boundaries
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  // --- kept OFF on purpose (breakage / perf) ---
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  selfDefending: false,
  transformObjectKeys: false,
  numbersToExpressions: false,
  splitStrings: false,
  unicodeEscapeSequence: false,
}

let counts = { css: 0, js: 0, html: 0, copied: 0, skipped: 0, fallback: 0 }

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const abs = join(dir, e.name)
    if (e.isDirectory()) { await walk(abs); continue }
    await handleFile(abs)
  }
}

async function handleFile(abs) {
  const rel = relative(SRC, abs)
  const outAbs = join(OUT, rel)
  await mkdir(dirname(outAbs), { recursive: true })

  const name = basename(abs)
  const ext = extname(abs).toLowerCase()

  if (SKIP_TRANSFORM(name)) { await copyFile(abs, outAbs); counts.skipped++; return }

  try {
    if (ext === '.css') {
      const src = await readFile(abs, 'utf8')
      const out = new CleanCSS({ returnPromise: false }).minify(src)
      if (out.errors && out.errors.length) throw new Error(out.errors.join('; '))
      await writeFile(outAbs, JS_BANNER + out.styles)
      counts.css++
      return
    }
    if (ext === '.js' || ext === '.mjs') {
      const src = await readFile(abs, 'utf8')
      const min = await terserMinify(src, { module: true, compress: true, mangle: true })
      if (min.error) throw min.error
      const obf = JsObfuscator.obfuscate(min.code || src, OBFUSCATE_OPTS).getObfuscatedCode()
      await writeFile(outAbs, JS_BANNER + obf)
      counts.js++
      return
    }
    if (ext === '.html') {
      const src = await readFile(abs, 'utf8')
      const out = src.includes('<head>')
        ? src.replace('<head>', '<head>\n' + HTML_BANNER.trimEnd())
        : HTML_BANNER + src
      await writeFile(outAbs, out)
      counts.html++
      return
    }
    // Everything else: pass through untouched.
    await copyFile(abs, outAbs)
    counts.copied++
  } catch (err) {
    // Never fail the whole build over one file — copy the original through and warn.
    console.warn(`  ! ${rel}: ${err.message} — copied original unchanged`)
    await copyFile(abs, outAbs)
    counts.fallback++
  }
}

const srcStat = await stat(SRC).catch(() => null)
if (!srcStat || !srcStat.isDirectory()) {
  console.error(`Source folder not found: ${SRC}`)
  process.exit(1)
}

console.log(`protect: ${SRC} -> ${OUT}`)
await mkdir(OUT, { recursive: true })
await walk(SRC)
console.log(
  `protect: done. css=${counts.css} js=${counts.js} html=${counts.html} ` +
  `copied=${counts.copied} skipped(min/sw)=${counts.skipped} fallback=${counts.fallback}`
)
