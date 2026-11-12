import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Minimal .env loader (KEY=value lines) so no extra dependency is needed.
const envFile = path.join(root, '.env')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2')
  }
}

const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--prod')

const databaseFile = path.resolve(root, process.env.DATABASE_FILE || 'server/data/edumate.db')

// Secret used to sign login sessions. Set JWT_SECRET, or one is generated once and kept next to the database.
let jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) {
  const secretFile = path.join(path.dirname(databaseFile), '.session-secret')
  fs.mkdirSync(path.dirname(secretFile), { recursive: true })
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(48).toString('hex'), { mode: 0o600 })
  jwtSecret = fs.readFileSync(secretFile, 'utf8').trim()
}

export const config = {
  root,
  isProd,
  // In production one process serves both the site and the API on $PORT (what most hosts provide).
  port: Number(process.env.API_PORT || (isProd && process.env.PORT) || 4000),
  databaseFile,
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || 'server/uploads'),
  maxUploadBytes: 50 * 1024 * 1024,
  jwtSecret,
  // AI provider: 'gemini' or 'anthropic'. If AI_PROVIDER is unset, whichever key is present is used (Gemini first).
  aiProvider: (process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : '')).toLowerCase(),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  // "-latest" aliases follow Google's current Flash models, so they don't break when a version is retired.
  geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
  geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-flash-lite-latest',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  seedDemo: process.env.SEED_DEMO !== 'false',
  // Plain-http testing from a phone on your Wi-Fi (`pnpm start:lan`) needs non-secure cookies.
  secureCookies: isProd && process.env.COOKIE_SECURE !== 'false' && !process.argv.includes('--lan'),
}
