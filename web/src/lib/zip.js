// A tiny ZIP writer (files stored as they are, no compression, no dependencies) so a
// person can download all their notes, photos and recordings as one ordinary .zip file.

const encoder = new TextEncoder()

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

export class ZipWriter {
  constructor() {
    this.parts = []
    this.entries = []
    this.offset = 0
  }

  // `bytes` is a Uint8Array. Names may use any characters (they are saved as UTF-8).
  add(name, bytes, date = new Date()) {
    if (this.entries.length >= 65534) throw new Error('Too many files for one .zip.')
    if (this.offset + bytes.length > 0xf0000000) throw new Error('Too much data for one .zip file.')
    const nameBytes = encoder.encode(name)
    const { time, day } = dosDateTime(date)
    const crc = crc32(bytes)

    const head = new DataView(new ArrayBuffer(30))
    head.setUint32(0, 0x04034b50, true) // local file header
    head.setUint16(4, 20, true) // version needed
    head.setUint16(6, 0x0800, true) // names are UTF-8
    head.setUint16(8, 0, true) // stored, not compressed
    head.setUint16(10, time, true)
    head.setUint16(12, day, true)
    head.setUint32(14, crc, true)
    head.setUint32(18, bytes.length, true)
    head.setUint32(22, bytes.length, true)
    head.setUint16(26, nameBytes.length, true)
    head.setUint16(28, 0, true) // no extra field

    this.entries.push({ nameBytes, crc, size: bytes.length, offset: this.offset, time, day })
    this.parts.push(new Uint8Array(head.buffer), nameBytes, bytes)
    this.offset += 30 + nameBytes.length + bytes.length
  }

  addText(name, text, date) {
    this.add(name, encoder.encode(text), date)
  }

  // The finished file, as a Blob (the browser never has to hold it in one piece).
  finish() {
    const central = []
    let centralSize = 0
    for (const e of this.entries) {
      const rec = new DataView(new ArrayBuffer(46))
      rec.setUint32(0, 0x02014b50, true) // central directory header
      rec.setUint16(4, 20, true) // made by
      rec.setUint16(6, 20, true) // needed
      rec.setUint16(8, 0x0800, true)
      rec.setUint16(10, 0, true)
      rec.setUint16(12, e.time, true)
      rec.setUint16(14, e.day, true)
      rec.setUint32(16, e.crc, true)
      rec.setUint32(20, e.size, true)
      rec.setUint32(24, e.size, true)
      rec.setUint16(28, e.nameBytes.length, true)
      rec.setUint32(42, e.offset, true)
      central.push(new Uint8Array(rec.buffer), e.nameBytes)
      centralSize += 46 + e.nameBytes.length
    }
    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, 0x06054b50, true) // end of central directory
    end.setUint16(8, this.entries.length, true)
    end.setUint16(10, this.entries.length, true)
    end.setUint32(12, centralSize, true)
    end.setUint32(16, this.offset, true)
    return new Blob([...this.parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' })
  }
}
