import { describe, expect, it } from 'vitest'
import { validateBatch, validateCandidate, type Batch, type Candidate } from '../src/research/proposal.ts'

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  id: 'P-1-1', question: 'q', precision: 'topic', why: 'w',
  priors: [{ work: 'A', delta: 'd1' }, { work: 'B', delta: 'd2' }, { work: 'C', delta: 'd3' }],
  feasibility: { data: 'd', hardware: '1x4090', days: 7, yuan: 200 },
  protocolDraft: 'p', risk: 'r', ...over,
})

const batch = (over: Partial<Batch> = {}): Batch => ({
  id: 'B-1', direction: '多模态检索', candidates: [cand(), cand({ id: 'P-1-2' })], critiques: [],
  rejections: [], createdAt: '2026-11-21T00:00:00.000Z', status: 'draft', ...over,
})

describe('validateCandidate', () => {
  it('accepts a candidate with three priors and a delta each', () => {
    expect(() => validateCandidate(cand())).not.toThrow()
  })
  it('rejects a candidate with fewer than three priors', () => {
    expect(() => validateCandidate(cand({ priors: cand().priors.slice(0, 2) }))).toThrow(/three/)
  })
  it('rejects a prior without a delta', () => {
    expect(() => validateCandidate(cand({ priors: [{ work: 'A', delta: ' ' }, ...cand().priors.slice(1)] }))).toThrow(/delta/)
  })
  it('rejects a hypothesis without a falsifier', () => {
    expect(() => validateCandidate(cand({ precision: 'hypothesis' }))).toThrow(/prediction/)
  })
})

describe('validateBatch', () => {
  it('accepts two to five candidates', () => {
    expect(() => validateBatch(batch())).not.toThrow()
  })
  it('rejects an empty batch', () => {
    expect(() => validateBatch(batch({ candidates: [] }))).toThrow(/at least two/)
  })
  it('rejects more than five candidates', () => {
    const six = [1, 2, 3, 4, 5, 6].map(n => cand({ id: 'P-1-' + String(n) }))
    expect(() => validateBatch(batch({ candidates: six }))).toThrow(/five/)
  })
  it('rejects a duplicated candidate id', () => {
    expect(() => validateBatch(batch({ candidates: [cand(), cand()] }))).toThrow(/duplicate/)
  })
})