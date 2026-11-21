import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import { acceptAttempt, killDirection, pickCandidate, signBatch } from '../src/app/research-actions.ts'
import { critique, saveBatch } from '../src/research/batch.ts'
import { sign } from '../src/research/sign.ts'
import type { Attempt, Contract, Question } from '../src/research/model.ts'

const AT = '2026-11-21T00:00:00.000Z'
const contract: Contract = {
  version: 1, goal: 'g', requirement: 'r', criteria: [{ id: 'c1', statement: 's' }],
  budgetCapYuan: 200, stopCondition: 't', signedBy: 'me',
}
const open = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}
const cand = (n: number) => ({
  id: 'P-1-' + String(n), question: 'q', precision: 'topic' as const, why: 'w', prediction: 'accuracy lifts', test: 'accuracy > 0.7',
  priors: [{ work: 'A', delta: 'a' }, { work: 'B', delta: 'b' }, { work: 'C', delta: 'c' }],
  feasibility: { data: 'd', hardware: 'h', days: 1, yuan: 10 }, protocolDraft: 'p', risk: 'r',
})
const reviewed = () => critique(saveBatch({ id: 'B-1', direction: 'd', candidates: [cand(1), cand(2)], critiques: [],
  rejections: [], createdAt: AT, status: 'draft' }, AT), [
  { candidateId: 'P-1-1', verdict: 'keep', reason: 'r' }, { candidateId: 'P-1-2', verdict: 'keep', reason: 'r' }])
const attempt: Attempt = { id: 'A-1', slug: 's', questionId: 'Q-1', contractVersion: 1, branch: 'b', protocolPath: 'p', status: 'concluded', verdict: 'supported' }
const question: Question = { id: 'Q-1', statement: 'does it hold', precision: 'topic', status: 'open', createdAt: AT }

describe('the actions a person takes', () => {
  it('picks a candidate and then signs it into a frozen contract', () => {
    const repo = open()
    repo.saveProposalBatch(reviewed())
    pickCandidate(repo, { batchId: 'B-1', candidateId: 'P-1-1', by: 'me', at: AT })
    const signed = signBatch(repo, { batchId: 'B-1', candidateId: 'P-1-1', requirement: 'r', version: 1, by: 'me', at: AT })
    expect(signed.version).toBe(1)
    expect(repo.getContract(1)?.criteria).toHaveLength(2)
  })
  it('refuses to sign a candidate that was not picked', () => {
    const repo = open()
    repo.saveProposalBatch(reviewed())
    expect(() => signBatch(repo, { batchId: 'B-1', candidateId: 'P-1-1', requirement: 'r', version: 1, by: 'me', at: AT })).toThrow(/picked/)
  })
  it('accepts a reproduced result and writes the agenda', () => {
    const repo = open()
    sign(repo, contract, 'me', AT)
    repo.saveAttempt(attempt)
    repo.addRun({ id: 'RUN-1', attemptId: 'A-1', kind: 'experiment', machine: 'm', image: 'i', commit: 'abc', command: 'c', params: {}, startedAt: '2026-11-20T22:00:00.000Z', endedAt: '2026-11-20T23:00:00.000Z', costYuan: 1, artifacts: [] })
    repo.saveEvidence({ attemptId: 'A-1', branch: 'b', commit: 'abc', image: 'i', machineType: 'm', dataHash: 'h', command: 'c', logs: [], artifacts: [], metrics: { c1: '1' }, reproduce: 'r' }, 'reproducible')
    repo.saveReport('A-1', '# A-1: supported')
    const agenda = join(mkdtempSync(join(tmpdir(), 'act-')), 'agenda.md')
    const result = acceptAttempt(repo, { attemptId: 'A-1', by: 'me', at: AT, agendaPath: agenda })
    expect(result.agenda).toBe(true)
    expect(readFileSync(agenda, 'utf8')).toContain('A-1')
    expect(repo.decisionsFor('A-1').map(d => d.kind)).toContain('accept_result')
  })
  it('refuses to accept an attempt with no report', () => {
    const repo = open()
    sign(repo, contract, 'me', AT)
    repo.saveAttempt(attempt)
    repo.saveEvidence({ attemptId: 'A-1', branch: 'b', commit: 'abc', image: 'i', machineType: 'm', dataHash: 'h', command: 'c', logs: [], artifacts: [], metrics: { c1: '1' }, reproduce: 'r' }, 'reproducible')
    expect(() => acceptAttempt(repo, { attemptId: 'A-1', by: 'me', at: AT })).toThrow(/no report/)
  })
  it('kills a known question and refuses an unknown one', () => {
    const repo = open()
    repo.saveQuestion(question)
    const result = killDirection(repo, { targetId: 'Q-1', note: 'r', objection: 'o', by: 'me', at: AT })
    expect(result.decision.kind).toBe('kill_direction')
    expect(() => killDirection(repo, { targetId: 'Q-9', note: 'r', objection: 'o', by: 'me', at: AT })).toThrow(/unknown question/)
  })
})