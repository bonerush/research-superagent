/** The agenda file beside the research database: the conclusions that outlive a run. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { agendaDigest, appendEntry, parseAgenda, type AgendaEntry } from '../research/agenda.ts'

const LF = String.fromCharCode(10)
const HEAD = '# Agenda'

/** Every entry in the agenda, or nothing when the file does not exist yet. A malformed file throws: it must be fixed by hand. */
export function readAgenda(path: string): AgendaEntry[] {
  if (!existsSync(path)) return []
  return parseAgenda(readFileSync(path, 'utf8'))
}

/**
 * Appends one conclusion, creating the file with its heading when it is missing.
 * An entry whose id is already there is skipped rather than duplicated, so a retried acceptance does not write twice.
 * Returns whether the entry was written.
 */
export function appendAgenda(path: string, entry: AgendaEntry): boolean {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : HEAD + LF
  if (parseAgenda(text).some(existing => existing.id === entry.id)) return false
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, appendEntry(text, entry, agendaDigest(text)), 'utf8')
  return true
}