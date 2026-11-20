import { describe, expect, it } from 'vitest'
import { assertIsoTimestamp, isTestable, validateQuestion, type Question } from '../src/research/model.ts'

const q = (over: Partial<Question> = {}): Question => ({
  id: 'Q-0001', statement: 'x', precision: 'hypothesis', status: 'open',
  createdAt: '2026-11-21T00:00:00.000Z', ...over,
})

describe('validateQuestion', () => {
  it('rejects a hypothesis without a prediction', () => {
    expect(() => validateQuestion(q())).toThrow(/prediction/)
  })
  it('accepts a direction without prediction or test', () => {
    expect(() => validateQuestion(q({ precision: 'direction' }))).not.toThrow()
  })
  it('accepts a hypothesis that names its falsifier', () => {
    expect(isTestable(q({ prediction: 'p', test: 't' }))).toBe(true)
  })
})

describe('assertIsoTimestamp', () => {
  it('rejects a local time with no zone', () => {
    expect(() => assertIsoTimestamp('2026-11-21 00:00')).toThrow(/timezone/)
  })
  it('returns the normalized form', () => {
    expect(assertIsoTimestamp('2026-11-21T08:00:00+08:00')).toBe('2026-11-21T00:00:00.000Z')
  })
})