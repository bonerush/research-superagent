import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appendAgenda, readAgenda } from '../src/app/agenda-file.ts'
import type { AgendaEntry } from '../src/research/agenda.ts'

const AT = '2026-11-21T00:00:00.000Z'
const entry = (id: string): AgendaEntry => ({
  id, question: 'q', precision: 'topic', status: 'answered', conclusion: 'c',
  evidence: ['RUN-1'], decidedBy: 'me', at: AT,
})
const temp = (): string => join(mkdtempSync(join(tmpdir(), 'agenda-')), 'agenda.md')

describe('appendAgenda', () => {
  it('creates the file and writes the entry', () => {
    const path = temp()
    appendAgenda(path, entry('Q-1'))
    expect(readAgenda(path).map(item => item.id)).toEqual(['Q-1'])
  })
  it('appends a second entry without losing the first', () => {
    const path = temp()
    appendAgenda(path, entry('Q-1'))
    appendAgenda(path, entry('Q-2'))
    expect(readAgenda(path).map(item => item.id)).toEqual(['Q-1', 'Q-2'])
  })
  it('skips an entry whose id is already there', () => {
    const path = temp()
    appendAgenda(path, entry('Q-1'))
    appendAgenda(path, entry('Q-1'))
    expect(readAgenda(path)).toHaveLength(1)
  })
  it('round-trips a conclusion that cites runs', () => {
    const path = temp()
    appendAgenda(path, { ...entry('Q-1'), conclusion: 'the lift held', evidence: ['RUN-1', 'RUN-2'] })
    expect(readAgenda(path)[0]?.evidence).toEqual(['RUN-1', 'RUN-2'])
  })
})

describe('readAgenda', () => {
  it('returns nothing for a file that does not exist yet', () => {
    expect(readAgenda(temp())).toEqual([])
  })
  it('surfaces a malformed file as an error', () => {
    const path = temp()
    writeFileSync(path, '# Agenda' + String.fromCharCode(10) + '- question: x' + String.fromCharCode(10))
    expect(() => readAgenda(path)).toThrow()
  })
})