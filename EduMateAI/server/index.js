// EduMate AI — API server.
//   dev:  node server/index.js            (Vite proxies /api to this server)
//   prod: npm run build && npm start      (this server also serves the built site from /dist)
import express from 'express'
import cookieParser from 'cookie-parser'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { config } from './config.js'
import './db/index.js'
import { seedDemo } from './db/seed.js'
import { HttpError } from './errors.js'
import { requireAuth } from './auth.js'
import { authRouter } from './routes/auth.js'
import { subjectsRouter } from './routes/subjects.js'
import { studyRouter } from './routes/study.js'
import { plannerRouter } from './routes/planner.js'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

// Basic security headers.
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  next()
})

// Reject cross-site form posts (CSRF): state-changing API calls must come from our own origin.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.get('origin')
  if (origin && originHost(origin) !== req.get('host')) return next(new HttpError(403, 'Cross-site request blocked.'))
  next()
})

/** Host part of an Origin header; null for opaque origins such as "null" (sandboxed frames, file://). */
function originHost(origin) {
  try {
    return new URL(origin).host
  } catch {
    return null
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api', authRouter)
app.use('/api', requireAuth, subjectsRouter, studyRouter, plannerRouter)
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')))

// Serve the built front-end in production.
const dist = path.join(config.root, 'dist')
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

// Central error handler: JSON for API errors, no stack traces leaked.
app.use((err, _req, res, _next) => {
  let status = err.status || 500
  let message = err.message
  if (err instanceof multer.MulterError) {
    status = 400
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Files must be 50 MB or smaller.' : 'Upload failed.'
  } else if (err.type === 'entity.parse.failed') {
    status = 400
    message = 'Invalid JSON body.'
  } else if (!(err instanceof HttpError) && status >= 500) {
    console.error(err)
    message = 'Something went wrong on our side. Please try again.'
  }
  res.status(status).json({ error: message })
})

if (config.seedDemo && (await seedDemo())) console.log('Seeded demo account → demo@university.edu / demo1234')

app.listen(config.port, () => {
  console.log(`EduMate API listening on http://localhost:${config.port}`)
})
