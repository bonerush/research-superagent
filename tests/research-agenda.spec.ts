import { describe, expect, it } from 'vitest'
import { agendaDigest, appendEntry, assertAgendaWriter, parseAgenda, renderEntry, type AgendaEntry } from '../src/research/agenda.ts'

const LF = String.fromCharCode(10)
const CRLF = String.fromCharCode(13, 10)
const doc = ['# Agenda', '', '### Q-0001', '- question: 能不能用 X 替代 Y', '- precision: topic', '- status: open', '- conclusion:', '- evidence:', '- decidedBy:', '- at: 2026-11-21T00:00:00.000Z'].join(LF)

const entry: AgendaEntry = {
  id: 'Q-0002', question: 'q', precision: 'topic', status: 'open',
  conclusion: '', evidence: [], decidedBy: '', at: '2026-11-21T00:00:00.000Z',
}

describe('parseAgenda', () => {
  it('parses an entry', () => {
    const [parsed] = parseAgenda(doc)
    expect(parsed?.id).toBe('Q-0001')
    expect(parsed?.precision).toBe('topic')
    expect(parsed?.evidence).toEqual([])
  })
  it('names the entry line and the missing field', () => {
    const broken = doc.split(LF).filter(line => line !== '- status: open').join(LF)
    expect(() => parseAgenda(broken)).toThrow(/line 3/)
    expect(() => parseAgenda(broken)).toThrow(/status/)
  })
  it('accepts CRLF line endings', () => {
    expect(parseAgenda(doc.replaceAll(LF, CRLF))).toHaveLength(1)
  })
  it('refuses an entry whose time has no zone', () => {
    expect(() => parseAgenda(doc.replace('2026-11-21T00:00:00.000Z', '2026-11-21 00:00'))).toThrow(/timezone/)
  })
  it('refuses a heading that is not three hashes', () => {
    const broken = doc.replace('### Q-0001', '## Q-0001')
    expect(() => parseAgenda(broken)).toThrow(/heading/)
  })
  it('refuses a field line before any entry', () => {
    expect(() => parseAgenda('# Agenda' + LF + '- question: x' + LF)).toThrow(/before any entry/)
  })
})

describe('appendEntry', () => {
  it('appends and round-trips', () => {
    const base = '# Agenda' + LF
    expect(parseAgenda(appendEntry(base, entry, agendaDigest(base)))).toHaveLength(1)
  })
  it('refuses a duplicate id', () => {
    const once = appendEntry('# Agenda' + LF, entry, agendaDigest('# Agenda' + LF))
    expect(() => appendEntry(once, entry, agendaDigest(once))).toThrow(/duplicate/)
  })
  it('refuses a stale read', () => {
    const base = '# Agenda' + LF
    const digest = agendaDigest(base)
    expect(() => appendEntry(base + '### Q-9999' + LF, entry, digest)).toThrow(/stale/)
  })
  it('refuses an answered entry that cites no run', () => {
    const base = '# Agenda' + LF
    expect(() => appendEntry(base, { ...entry, status: 'answered', evidence: [] }, agendaDigest(base))).toThrow(/without a run/)
  })
  it('refuses a writer that is not the bookkeeper', () => {
    expect(() => assertAgendaWriter('scout')).toThrow(/bookkeeper/)
    expect(() => assertAgendaWriter('bookkeeper')).not.toThrow()
    expect(() => appendEntry('# Agenda' + LF, entry, agendaDigest('# Agenda' + LF), 'scout')).toThrow(/bookkeeper/)
  })
})

describe('renderEntry', () => {
  it('reads back through the parser', () => {
    expect(parseAgenda(renderEntry(entry))[0]?.id).toBe('Q-0002')
  })
})