import { describe, expect, it } from 'vitest'
import { critique, saveBatch } from '../src/research/batch.ts'
import { pick } from '../src/research/pick.ts'
import type { Batch, Candidate } from '../src/research/proposal.ts'

const AT = '2026-11-21T00:00:00.000Z'
const cand = (n: number): Candidate => ({
  id: 'P-1-' + String(n), question: 'q' + String(n), precision: 'topic', why: 'w',
  priors: [{ work: 'A', delta: 'd1' }, { work: 'B', delta: 'd2' }, { work: 'C', delta: 'd3' }],
  feasibility: { data: 'd', hardware: '1x4090', days: 7, yuan: 200 },
  protocolDraft: 'p', risk: 'r',
})
const raw = (): Batch => ({
  id: 'B-1', direction: '多模态检索', candidates: [cand(1), cand(2), cand(3)], critiques: [],
  rejections: [], createdAt: AT, status: 'draft',
})
const reviewed = (): Batch => critique(saveBatch(raw(), AT), [
  { candidateId: 'P-1-1', verdict: 'keep', reason: 'ok' },
  { candidateId: 'P-1-2', verdict: 'drop', reason: 'not novel' },
  { candidateId: 'P-1-3', verdict: 'keep', reason: 'ok too' },
])

describe('pick', () => {
  it('refuses a candidate the critic dropped', () => {
    expect(() => pick(reviewed(), 'P-1-2', 'me', AT)).toThrow(/critic/)
  })
  it('refuses a batch that was never critiqued', () => {
    expect(() => pick(saveBatch(raw(), AT), 'P-1-1', 'me', AT)).toThrow(/ready/)
  })
  it('records the picked id and rejects the rest with a reason', () => {
    const { batch } = pick(reviewed(), 'P-1-1', 'me', AT)
    expect(batch.status).toBe('picked')
    expect(batch.rejections).toHaveLength(2)
    expect(batch.rejections[0]?.candidateId).toBe('P-1-2')
  })
  it('produces a human decision', () => {
    const { decision } = pick(reviewed(), 'P-1-1', 'me', AT)
    expect(decision.kind).toBe('pick_proposal')
    expect(decision.actor).toBe('human')
    expect(decision.by).toBe('me')
  })
})