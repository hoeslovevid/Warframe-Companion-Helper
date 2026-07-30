/**
 * Rasterize resources/brand-mark.svg into app / tray / installer icons.
 * Run: node scripts/generate-icons.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const svgPath = path.join(root, 'resources', 'brand-mark.svg')
const svg = fs.readFileSync(svgPath)

async function writePng(outRel, size) {
  const out = path.join(root, outRel)
  await sharp(svg).resize(size, size).png().toFile(out)
  console.log('wrote', outRel, `${size}×${size}`)
}

/** Minimal ICO with embedded PNG frames (Vista+). */
function pngsToIco(pngBuffers) {
  const count = pngBuffers.length
  const headerSize = 6 + count * 16
  const dims = pngBuffers.map((buf) => ({
    w: buf.readUInt32BE(16),
    h: buf.readUInt32BE(20),
    buf,
  }))

  const total = headerSize + dims.reduce((n, d) => n + d.buf.length, 0)
  const out = Buffer.alloc(total)
  out.writeUInt16LE(0, 0)
  out.writeUInt16LE(1, 2)
  out.writeUInt16LE(count, 4)

  let dataOffset = headerSize
  let entryAt = 6
  for (const { w, h, buf } of dims) {
    out.writeUInt8(w >= 256 ? 0 : w, entryAt)
    out.writeUInt8(h >= 256 ? 0 : h, entryAt + 1)
    out.writeUInt8(0, entryAt + 2)
    out.writeUInt8(0, entryAt + 3)
    out.writeUInt16LE(1, entryAt + 4)
    out.writeUInt16LE(32, entryAt + 6)
    out.writeUInt32LE(buf.length, entryAt + 8)
    out.writeUInt32LE(dataOffset, entryAt + 12)
    buf.copy(out, dataOffset)
    dataOffset += buf.length
    entryAt += 16
  }
  return out
}

async function main() {
  await writePng('resources/icon-256.png', 256)
  await writePng('resources/icon.png', 512)
  await writePng('resources/icon-64.png', 64)
  await writePng('resources/tray.png', 32)
  await writePng('resources/tray-16.png', 16)
  await writePng('docs/assets/icon-256.png', 256)
  await writePng('docs/assets/icon.png', 512)
  await writePng('docs/assets/tray.png', 32)

  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const pngs = []
  for (const size of icoSizes) {
    pngs.push(await sharp(svg).resize(size, size).png().toBuffer())
  }
  const ico = pngsToIco(pngs)
  const icoPath = path.join(root, 'build', 'icon.ico')
  fs.writeFileSync(icoPath, ico)
  console.log('wrote build/icon.ico')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
