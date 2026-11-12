// Uploaded module files: accepted types, disk storage and cleanup.
import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { HttpError } from './errors.js'

/** Allowed extensions and the file type stored for each. */
export const FILE_TYPES = { '.pdf': 'PDF', '.docx': 'DOCX', '.doc': 'DOC', '.pptx': 'PPTX', '.ppt': 'PPT', '.txt': 'TXT', '.md': 'MD' }

fs.mkdirSync(config.uploadDir, { recursive: true })

export const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (FILE_TYPES[path.extname(file.originalname).toLowerCase()]) cb(null, true)
    else cb(new HttpError(400, 'Only PDF, DOCX, PPTX, DOC, PPT, TXT or MD files can be uploaded.'))
  },
})

export const uploadPath = (storedName) => path.join(config.uploadDir, storedName)

/** Delete stored files in the background; missing files are ignored. */
export function removeUploads(storedNames) {
  for (const name of storedNames) if (name) fs.rm(uploadPath(name), { force: true }, () => {})
}

/** Rough page count for PDFs without a PDF library. */
export function pdfPages(file) {
  try {
    const text = fs.readFileSync(file, 'latin1')
    const n = (text.match(/\/Type\s*\/Page(?!s)/g) || []).length
    return n || null
  } catch {
    return null
  }
}
