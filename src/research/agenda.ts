/** The agenda file: the lab's only long-lived memory, parsed strictly so a hand edit cannot silently drop an entry. */
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
 * A missing field, an unknown field, or a stray line throws with the 1-based line of the entry it belongs to:
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
      id = line.slice(4).trim()
      headerLine = lineNo
      fields = new Map()
      return
    }
    if (!line.trim() || line.startsWith('#')) return
    if (!fields) return
    if (!line.startsWith('- ')) throw new Error(`agenda: ${id ?? 'entry'} at line ${lineNo} is not a field line`)
    const body = line.slice(2)
    const colon = body.indexOf(':')
    if (colon < 0) throw new Error(`agenda: ${id ?? 'entry'} at line ${lineNo} is not a key: value line`)
    const key = body.slice(0, colon).trim()
    const value = body.slice(colon + 1).trim()
    if (!(FIELDS as readonly string[]).includes(key)) throw new Error(`agenda: ${id ?? 'entry'} at line ${lineNo} has unknown field ${key}`)
    fields.set(key, value)
  })
  finish()
  return entries
}