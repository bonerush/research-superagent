import { describe, expect, it } from 'vitest'
import { critique, presentable, saveBatch, survivors } from '../src/research/batch.ts'
import { validateBatch, type Batch, type Candidate, type Critique } from '../src/research/proposal.ts'

const AT = '2026-11-21T00:00:00.000Z'
const cand = (n: number): Candidate => ({
  id: 'P-1-' + String(n), question: 'q' + String(n), precision: 'topic', why: 'w',
  priors: [{ work: 'A', delta: 'd1' }, { work: 'B', delta: 'd2' }, { work: 'C', delta: 'd3' }],
  feasibility: { data: 'd', hardware: '1x4090', days: 7, yuan: 200 },
  protocolDraft: 'p', risk: 'r',
})
const raw = (): Batch => ({
  id: 'B-1', direction: '多模态检索', candidates: [cand(1), cand(2)], critiques: [],
  rejections: [], createdAt: AT, status: 'draft',
})

describe('saveBatch', () => {
  it('normalizes the time and clears what the batch does not have yet', () => {
    const saved = saveBatch(raw(), '2026-11-21T08:00:00+08:00')
    expect(saved.createdAt).toBe(AT)
    expect(saved.status).toBe('draft')
    expect(saved.critiques).toEqual([])
  })
  it('refuses a batch that fails validation', () => {
    expect(() => saveBatch({ ...raw(), candidates: [] }, AT)).toThrow(/at least two/)
  })
})

describe('presentable', () => {
  it('is false for a draft', () => {
    expect(presentable(saveBatch(raw(), AT))).toBe(false)
  })
  it('is false until every candidate has a critique', () => {
    const half = critique(saveBatch(raw(), AT), [{ candidateId: 'P-1-1', verdict: 'keep', reason: 'ok' }])
    expect(presentable(half)).toBe(false)
  })
  it('is true once every candidate is judged and one survives', () => {
    const all = critique(saveBatch(raw(), AT), [
      { candidateId: 'P-1-1', verdict: 'keep', reason: 'ok' },
      { candidateId: 'P-1-2', verdict: 'drop', reason: 'not novel' },
    ])
    expect(presentable(all)).toBe(true)
  })
  it('is false when every candidate was dropped', () => {
    const none = critique(saveBatch(raw(), AT), [
      { candidateId: 'P-1-1', verdict: 'drop', reason: 'a' },
      { candidateId: 'P-1-2', verdict: 'drop', reason: 'b' },
    ])
    expect(presentable(none)).toBe(false)
  })
})

describe('survivors', () => {
  it('drops the candidates the critic killed', () => {
    const all = critique(saveBatch(raw(), AT), [
      { candidateId: 'P-1-1', verdict: 'keep', reason: 'ok' },
      { candidateId: 'P-1-2', verdict: 'drop', reason: 'not novel' },
    ])
    expect(survivors(all).map(c => c.id)).toEqual(['P-1-1'])
  })
})

describe('critique', () => {
  it('refuses a review of a candidate the batch does not hold', () => {
    const review: Critique = { candidateId: 'ghost', verdict: 'keep', reason: 'r' }
    expect(() => critique(saveBatch(raw(), AT), [review])).toThrow(/ghost/)
  })
  it('refuses a second verdict on the same candidate', () => {
    const once = critique(saveBatch(raw(), AT), [{ candidateId: 'P-1-1', verdict: 'keep', reason: 'ok' }])
    expect(() => critique(once, [{ candidateId: 'P-1-1', verdict: 'drop', reason: 'x' }])).toThrow(/already/)
  })
  it('refuses a verdict with no reason', () => {
    expect(() => critique(saveBatch(raw(), AT), [{ candidateId: 'P-1-1', verdict: 'keep', reason: ' ' }])).toThrow(/reason/)
  })
})

describe('validateBatch from the batch service', () => {
  it('still refuses six candidates', () => {
    const six = [1, 2, 3, 4, 5, 6].map(cand)
    expect(() => validateBatch({ ...raw(), candidates: six })).toThrow(/five/)
  })
})