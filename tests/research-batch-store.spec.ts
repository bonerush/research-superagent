import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import type { Batch, Candidate } from '../src/research/proposal.ts'

const AT = '2026-11-21T00:00:00.000Z'
const cand = (n: number): Candidate => ({
  id: 'P-1-' + String(n), question: 'q' + String(n), precision: 'topic', why: 'w',
  priors: [{ work: 'A', delta: 'd1' }, { work: 'B', delta: 'd2' }, { work: 'C', delta: 'd3' }],
  feasibility: { data: 'd', hardware: '1x4090', days: 7, yuan: 200 },
  protocolDraft: 'p', risk: 'r',
})
const batch = (): Batch => ({
  id: 'B-1', direction: '多模态检索', candidates: [cand(1), cand(2)], critiques: [],
  rejections: [], createdAt: AT, status: 'draft',
})
const open = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}

describe('proposal batches', () => {
  it('round-trips a batch with its candidates and critiques', () => {
    const repo = open()
    const stored = { ...batch(), critiques: [{ candidateId: 'P-1-1', verdict: 'keep' as const, reason: 'ok' }], status: 'reviewed' as const }
    repo.saveProposalBatch(stored)
    const read = repo.getProposalBatch('B-1')
    expect(read?.candidates[1]?.id).toBe('P-1-2')
    expect(read?.critiques[0]?.reason).toBe('ok')
  })
  it('returns undefined for an unknown batch', () => {
    expect(open().getProposalBatch('B-9')).toBeUndefined()
  })
  it('lists batches newest first and can filter by status', () => {
    const repo = open()
    repo.saveProposalBatch({ ...batch(), id: 'B-1', createdAt: AT })
    repo.saveProposalBatch({ ...batch(), id: 'B-2', createdAt: '2026-11-22T00:00:00.000Z', status: 'reviewed' })
    expect(repo.listProposalBatches().map(b => b.id)).toEqual(['B-2', 'B-1'])
    expect(repo.listProposalBatches('reviewed').map(b => b.id)).toEqual(['B-2'])
  })
})