// One-off: rasterize public/icon.svg into the PNG app icons the manifest needs.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const svg = readFileSync(new URL('./public/icon.svg', import.meta.url))
const dir = new URL('./public/', import.meta.url)
const cream = { r: 255, g: 252, b: 235, alpha: 1 }

// "any"-purpose icons (keep the icon's own rounded corners)
await sharp(svg).resize(192, 192).png().toFile(new URL('pwa-192.png', dir).pathname.replace(/^\//, ''))
await sharp(svg).resize(512, 512).png().toFile(new URL('pwa-512.png', dir).pathname.replace(/^\//, ''))
// Apple touch icon (iOS rounds it itself)
await sharp(svg).resize(180, 180).png().toFile(new URL('apple-touch-icon.png', dir).pathname.replace(/^\//, ''))

// Maskable: full-bleed cream square (no transparent corners) with the art in the
// safe zone (~80%), so Android's circle/squircle masks never clip anything.
const inner = await sharp(svg).resize(410, 410).png().toBuffer()
await sharp({ create: { width: 512, height: 512, channels: 4, background: cream } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(new URL('pwa-512-maskable.png', dir).pathname.replace(/^\//, ''))

console.log('icons generated')
