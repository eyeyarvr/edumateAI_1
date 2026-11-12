import { HttpError } from './errors.js'

/** Read a trimmed string field; throws 400 when required and empty or too long. */
export function str(body, key, { required = false, max = 500, fallback = '' } = {}) {
  const raw = body?.[key]
  if (raw === undefined || raw === null || raw === '') {
    if (required) throw new HttpError(400, `${label(key)} is required.`)
    return fallback
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') throw new HttpError(400, `${label(key)} must be text.`)
  const v = String(raw).trim()
  if (required && !v) throw new HttpError(400, `${label(key)} is required.`)
  if (v.length > max) throw new HttpError(400, `${label(key)} must be at most ${max} characters.`)
  return v
}

export function oneOf(body, key, options, fallback) {
  const v = body?.[key]
  if (v === undefined || v === null || v === '') return fallback
  if (!options.includes(v)) throw new HttpError(400, `${label(key)} must be one of: ${options.join(', ')}.`)
  return v
}

export function int(value, name = 'id') {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, `Invalid ${name}.`)
  return n
}

export function date(body, key, { required = false } = {}) {
  const v = str(body, key, { required, max: 10 })
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `${label(key)} must be a date (YYYY-MM-DD).`)
  return v || null
}

export function email(body, key = 'email') {
  const v = str(body, key, { required: true, max: 254 }).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new HttpError(400, 'Please enter a valid email address.')
  return v
}

/** A password being set (sign-up or change): required, 8–200 characters. */
export function newPassword(body, key, name = 'Password') {
  const v = str(body, key, { required: true, max: 200 })
  if (v.length < 8) throw new HttpError(400, `${name} must be at least 8 characters.`)
  return v
}

const label = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
