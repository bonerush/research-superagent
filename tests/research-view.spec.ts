import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import { researchOverview } from '../src/app/views/research.ts'
import { critique, saveBatch } from '../src/research/batch.ts'
import { sign } from '../src/research/sign.ts'
import type { Attempt, Contract } from '../src/research/model.ts'
import type { Batch } from '../src/research/proposal.ts'

const AT = '2026-11-21T00:00:00.000Z'
const contract: Contract = {
  version: 1, goal: 'g', requirement: 'r', criteria: [{ id: 'c1', statement: 's' }],
  budgetCapYuan: 200, stopCondition: 't', signedBy: '',
}
const open = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}
const cand = (n: number) => ({
  id: 'P-1-' + String(n), question: 'q', precision: 'topic' as const, why: 'w',
  priors: [{ work: 'A', delta: 'a' }, { work: 'B', delta: 'b' }, { work: 'C', delta: 'c' }],
  feasibility: { data: 'd', hardware: 'h', days: 1, yuan: 10 }, protocolDraft: 'p', risk: 'r',
})
const draft = (): Batch => ({
  id: 'B-1', direction: 'd', candidates: [cand(1), cand(2)], critiques: [], rejections: [],
  createdAt: AT, status: 'draft',
})
const reviewed = (verdicts: ('keep' | 'drop')[] = ['keep', 'keep']): Batch => critique(saveBatch(draft(), AT), [
  { candidateId: 'P-1-1', verdict: verdicts[0]!, reason: 'r1' },
  { candidateId: 'P-1-2', verdict: verdicts[1]!, reason: 'r2' },
])
const attempt: Attempt = { id: 'A-1', slug: 's', questionId: 'Q-1', contractVersion: 1, branch: 'b', protocolPath: 'p', status: 'concluded', verdict: 'supported' }

describe('researchOverview', () => {
  it('lists a reviewed batch that can be picked', () => {
    const repo = open()
    repo.saveProposalBatch(reviewed())
    expect(researchOverview(repo).batches.map(b => b.id)).toEqual(['B-1'])
  })
  it('leaves out a batch the critic rejected outright', () => {
    const repo = open()
    repo.saveProposalBatch(reviewed(['drop', 'drop']))
    expect(researchOverview(repo).batches).toEqual([])
  })
  it('lists a picked batch without a contract as a contract to sign', () => {
    const repo = open()
    repo.saveProposalBatch({ ...reviewed(), status: 'picked', pickedCandidateId: 'P-1-1' })
    expect(researchOverview(repo).batches).toEqual([])
    expect(researchOverview(repo).contracts).toEqual([{ batchId: 'B-1', candidateId: 'P-1-1', direction: 'd' }])
  })
  it('leaves out a picked batch whose contract is already signed', () => {
    const repo = open()
    repo.saveProposalBatch({ ...reviewed(), status: 'picked', pickedCandidateId: 'P-1-1', contractVersion: 1 })
    expect(researchOverview(repo).contracts).toEqual([])
  })
  it('lists a concluded attempt nobody decided on, with its cost', () => {
    const repo = open()
    sign(repo, contract, 'me', AT)
    repo.saveAttempt(attempt)
    expect(researchOverview(repo).attempts).toEqual([{ id: 'A-1', verdict: 'supported', costYuan: 0 }])
  })
  it('leaves out an accepted attempt', () => {
    const repo = open()
    sign(repo, contract, 'me', AT)
    repo.saveAttempt(attempt)
    repo.recordDecision({ id: 'accept-A-1', kind: 'accept_result', targetId: 'A-1', actor: 'human', by: 'me', at: AT })
    expect(researchOverview(repo).attempts).toEqual([])
  })
  it('leaves out an attempt whose question was killed', () => {
    const repo = open()
    sign(repo, contract, 'me', AT)
    repo.saveAttempt(attempt)
    repo.recordDecision({ id: 'kill-Q-1', kind: 'kill_direction', targetId: 'Q-1', actor: 'human', by: 'me', at: AT })
    expect(researchOverview(repo).attempts).toEqual([])
  })
  it('lists the report of an attempt that has one', () => {
    const repo = open()
    sign(repo, contract, 'me', AT)
    repo.saveAttempt(attempt)
    repo.saveReport('A-1', '# A-1: supported' + String.fromCharCode(10) + 'body')
    expect(researchOverview(repo).reports).toEqual([{ attemptId: 'A-1', title: '# A-1: supported' }])
  })
})