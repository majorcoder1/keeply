// Generate PNG app icons for The Upper Room from its SVG logos.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const pub = 'E:/video-web/public/'
const icon = readFileSync(pub + 'icon.svg')             // rounded, for "any"
const maskable = readFileSync(pub + 'icon-maskable.svg') // full-bleed, for maskable + Apple

const D = 700 // high render density so the 64-unit SVG rasterizes crisply
await sharp(icon, { density: D }).resize(192, 192).png().toFile(pub + 'pwa-192.png')
await sharp(icon, { density: D }).resize(512, 512).png().toFile(pub + 'pwa-512.png')
await sharp(maskable, { density: D }).resize(512, 512).png().toFile(pub + 'pwa-512-maskable.png')
await sharp(maskable, { density: D }).resize(180, 180).png().toFile(pub + 'apple-touch-icon.png')

console.log('Upper Room icons generated')
