// Database connection (Node's built-in SQLite — no native build step needed).
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { HttpError } from '../errors.js'
import { int } from '../validate.js'

const here = path.dirname(fileURLToPath(import.meta.url))

fs.mkdirSync(path.dirname(config.databaseFile), { recursive: true })

export const db = new DatabaseSync(config.databaseFile)
db.exec('PRAGMA journal_mode = WAL;')
db.exec('PRAGMA foreign_keys = ON;')
db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'))

/** Run fn inside a transaction; rolls back on error. */
export function transaction(fn) {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** Shorthand helpers. */
export const one = (sql, ...params) => db.prepare(sql).get(...params)
export const all = (sql, ...params) => db.prepare(sql).all(...params)
export const run = (sql, ...params) => db.prepare(sql).run(...params)

/** Run an INSERT and return the new row's id. */
export const insert = (sql, ...params) => Number(run(sql, ...params).lastInsertRowid)

/**
 * Load a row the user owns, or throw 404 "<label> not found." so nobody can reach another account's data.
 * `table` is always a constant from our own code, never user input.
 */
export function findOwned(table, userId, id, label) {
  const row = one(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`, int(id), userId)
  if (!row) throw new HttpError(404, `${label} not found.`)
  return row
}
