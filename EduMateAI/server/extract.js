// Plain-text extraction from Word (.docx) and PowerPoint (.pptx) files, so AI generation can read them.
// Both formats are zip archives of XML; this reads the zip with Node's built-in zlib (no extra dependency).
// The older binary .doc / .ppt formats are not supported.
import fs from 'node:fs'
import zlib from 'node:zlib'

/** Uncompressed size cap per zip entry (guards against "zip bomb" files). */
const MAX_ENTRY_BYTES = 100 * 1024 * 1024

/** Read a zip file's entries: Map(name -> () => Buffer). Throws on anything that isn't a readable zip. */
function readZip(buf) {
  // End of central directory record: last 22+ bytes of the file (it may be followed by a comment).
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('not a zip file')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const entries = new Map()
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt zip directory')
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    entries.set(name, () => {
      if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('corrupt zip entry')
      const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28)
      const data = buf.subarray(start, start + compressedSize)
      if (method === 0) return data
      if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES })
      throw new Error(`unsupported zip compression (${method})`)
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/**
 * Text of an Office XML part. Only real text runs (<w:t> / <a:t>) are kept, so drawing positions,
 * field codes and other markup never leak in. `ns` is "w" for Word, "a" for PowerPoint.
 */
function xmlText(xml, ns) {
  const re = new RegExp(`<${ns}:t(?:\\s[^>]*)?>([^<]*)</${ns}:t>|<${ns}:tab/>|<${ns}:br\\b[^>]*/>|</${ns}:p>`, 'g')
  let out = ''
  for (const m of xml.matchAll(re)) {
    if (m[1] !== undefined) out += decode(m[1])
    else if (m[0].endsWith(':p>')) out += '\n'
    else out += m[0].includes(':tab') ? '\t' : '\n'
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const part = (entries, name) => entries.get(name)?.().toString('utf8') ?? ''

function docxText(entries) {
  const body = part(entries, 'word/document.xml')
  if (!body) throw new Error('no word/document.xml')
  const extras = [...entries.keys()].filter((n) => /^word\/(footnotes|endnotes)\.xml$/.test(n)).map((n) => xmlText(part(entries, n), 'w')).filter(Boolean)
  return [xmlText(body, 'w'), ...extras.map((t) => `NOTES:\n${t}`)].join('\n\n')
}

function pptxText(entries) {
  const slides = [...entries.keys()]
    .map((n) => n.match(/^ppt\/slides\/slide(\d+)\.xml$/))
    .filter(Boolean)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
  if (!slides.length) throw new Error('no slides')
  return slides.map(([name, num], i) => {
    const text = xmlText(part(entries, name), 'a')
    // Speaker notes are linked from the slide's relationships file (their numbers don't always match).
    const rels = part(entries, `ppt/slides/_rels/slide${num}.xml.rels`)
    const notesFile = rels.match(/Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/)?.[1]
    const notes = notesFile ? xmlText(part(entries, `ppt/notesSlides/${notesFile}`), 'a').replace(/^\d+$/m, '').trim() : ''
    return `--- Slide ${i + 1} ---\n${text || '(no text)'}${notes ? `\nSpeaker notes: ${notes}` : ''}`
  }).join('\n\n')
}

/**
 * Plain text of a DOCX or PPTX file, or '' when the file can't be read or has no text
 * (e.g. slides that are only images). Never throws.
 */
export function officeText(filePath, fileType) {
  try {
    const entries = readZip(fs.readFileSync(filePath))
    const text = fileType === 'DOCX' ? docxText(entries) : fileType === 'PPTX' ? pptxText(entries) : ''
    // Slides with no text at all would only give "--- Slide n --- (no text)" lines.
    return /[A-Za-z0-9]/.test(text.replace(/--- Slide \d+ ---|\(no text\)/g, '')) ? text : ''
  } catch (e) {
    console.warn(`[extract] could not read ${fileType} file`, e.message)
    return ''
  }
}
