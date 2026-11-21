/** The agenda file: the lab's only long-lived memory, parsed strictly so a hand edit cannot silently drop an entry. */
import { createHash } from 'node:crypto'
import { canConclude } from './guards.ts'
import { assertIsoTimestamp, type Precision } from './model.ts'

const LF = String.fromCharCode(10)
const CRLF = String.fromCharCode(13, 10)

const PRECISIONS: readonly Precision[] = ['direction', 'topic', 'hypothesis']
const STATUSES = ['open', 'testing', 'answered', 'abandoned'] as const
const FIELDS = ['question', 'precision', 'status', 'conclusion', 'evidence', 'decidedBy', 'at'] as const

/** One conclusion the agenda keeps: what was asked, what came of it, and which runs prove it. */
export interface AgendaEntry {
  id: string
  question: string
  precision: Precision
  status: 'open' | 'testing' | 'answered' | 'abandoned'
  conclusion: string
  evidence: string[]
  decidedBy: string
  at: string
}

/**
 * Reads every entry of an agenda document.
 * A missing field, an unknown field, a malformed heading or a stray line throws with its 1-based line:
 * the parser refuses to guess, because a silently dropped entry is a lost conclusion.
 */
export function parseAgenda(text: string): AgendaEntry[] {
  const lines = text.split(CRLF).join(LF).split(LF)
  const entries: AgendaEntry[] = []
  let id: string | null = null
  let headerLine = 0
  let fields: Map<string, string> | null = null

  const finish = (): void => {
    if (!id || !fields) return
    for (const field of FIELDS) {
      if (!fields.has(field)) throw new Error(`agenda: ${id} at line ${headerLine} is missing field ${field}`)
    }
    const precision = fields.get('precision') as Precision
    const status = fields.get('status')
    if (!PRECISIONS.includes(precision)) throw new Error(`agenda: ${id} at line ${headerLine} has an unknown precision ${precision}`)
    if (!status || !(STATUSES as readonly string[]).includes(status)) throw new Error(`agenda: ${id} at line ${headerLine} has an unknown status ${String(status)}`)
    entries.push({
      id,
      question: fields.get('question') ?? '',
      precision,
      status: status as AgendaEntry['status'],
      conclusion: fields.get('conclusion') ?? '',
      evidence: (fields.get('evidence') ?? '').split(',').map(item => item.trim()).filter(Boolean),
      decidedBy: fields.get('decidedBy') ?? '',
      at: assertIsoTimestamp(fields.get('at') ?? ''),
    })
  }

  lines.forEach((line, index) => {
    const lineNo = index + 1
    if (line.startsWith('### ')) {
      finish()
      const heading = line.slice(4).trim()
      if (!heading) throw new Error(`agenda: line ${lineNo} is a heading with no id`)
      id = heading
      headerLine = lineNo
      fields = new Map()
      return
    }
    if (!line.trim()) return
    if (line.startsWith('# ')) return
    if (line.startsWith('#')) throw new Error(`agenda: line ${lineNo} is not a \"### <id>\" heading`)
    if (!fields) throw new Error(`agenda: line ${lineNo} is a field line before any entry`)
    if (!line.startsWith('- ')) throw new Error(`agenda: ${id} at line ${lineNo} is not a field line`)
    const body = line.slice(2)
    const colon = body.indexOf(':')
    if (colon < 0) throw new Error(`agenda: ${id} at line ${lineNo} is not a key: value line`)
    const key = body.slice(0, colon).trim()
    const value = body.slice(colon + 1).trim()
    if (!(FIELDS as readonly string[]).includes(key)) throw new Error(`agenda: ${id} at line ${lineNo} has unknown field ${key}`)
    fields.set(key, value)
  })
  finish()
  return entries
}

/** The block one entry renders to; parseAgenda reads it back unchanged. */
export function renderEntry(entry: AgendaEntry): string {
  for (const [name, value] of [
    ['id', entry.id], ['question', entry.question], ['conclusion', entry.conclusion],
    ['decidedBy', entry.decidedBy], ['at', entry.at],
  ] as const) {
    if (/[\r\n]/.test(value)) throw new Error(`agenda: ${name} must be one line`)
  }
  return [
    `### ${entry.id}`,
    `- question: ${entry.question}`,
    `- precision: ${entry.precision}`,
    `- status: ${entry.status}`,
    `- conclusion: ${entry.conclusion}`,
    `- evidence: ${entry.evidence.join(', ')}`,
    `- decidedBy: ${entry.decidedBy}`,
    `- at: ${entry.at}`,
  ].join(LF)
}

/** The stamp a reader takes before appending: SHA-256 over the document with line endings normalized. */
export function agendaDigest(text: string): string {
  return createHash('sha256').update(text.split(CRLF).join(LF)).digest('hex')
}

/** The only role that may write the agenda; every other role proposes a change instead. */
export const AGENDA_WRITER = 'bookkeeper'

/** Throws when a role other than the bookkeeper tries to write the agenda. */
export function assertAgendaWriter(role: string): void {
  if (role !== AGENDA_WRITER) throw new Error(`agenda: only the bookkeeper may write it, not ${role}`)
}

/**
 * Appends one entry to the document that was read under `digest`.
 * A digest mismatch means someone else wrote since the read: appending would drop their entry, so it throws.
 * An answered entry must cite a run, or the agenda would carry an opinion as a finding.
 */
export function appendEntry(text: string, entry: AgendaEntry, digest: string, writer: string = AGENDA_WRITER): string {
  assertAgendaWriter(writer)
  if (agendaDigest(text) !== digest) throw new Error('agenda: stale read, re-read before appending')
  if (parseAgenda(text).some(existing => existing.id === entry.id)) throw new Error(`agenda: duplicate id ${entry.id}`)
  if (entry.status === 'answered' && !canConclude(entry.evidence)) throw new Error(`agenda: ${entry.id} is answered without a run`)
  const body = text.endsWith(LF) ? text : text + LF
  return body + LF + renderEntry(entry) + LF
}