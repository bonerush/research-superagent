import { describe, expect, it } from 'vitest'
import { parseAgenda } from '../src/research/agenda.ts'

const LF = String.fromCharCode(10)
const CRLF = String.fromCharCode(13, 10)
const doc = ['# Agenda', '', '### Q-0001', '- question: 能不能用 X 替代 Y', '- precision: topic', '- status: open', '- conclusion:', '- evidence:', '- decidedBy:', '- at: 2026-11-21T00:00:00.000Z'].join(LF)

describe('parseAgenda', () => {
  it('parses an entry', () => {
    const [entry] = parseAgenda(doc)
    expect(entry?.id).toBe('Q-0001')
    expect(entry?.precision).toBe('topic')
    expect(entry?.evidence).toEqual([])
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
})