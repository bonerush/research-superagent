import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import { agendaDigest, appendEntry, parseAgenda } from '../src/research/agenda.ts'
import { freezeContract } from '../src/research/contract.ts'
import { canConclude, canDeleteBranch } from '../src/research/guards.ts'
import type { Attempt, Contract, Question, Run } from '../src/research/model.ts'

const LF = String.fromCharCode(10)

const q: Question = {
  id: 'Q-0001', statement: 'a new architecture beats the baseline', precision: 'hypothesis',
  prediction: 'the new block lifts accuracy', test: 'no lift on two seeds falsifies it',
  status: 'testing', createdAt: '2026-11-21T00:00:00.000Z',
}

const base: Contract = {
  version: 1, goal: 'show the architectural lift', requirement: 'an architectural novelty, not a hyperparameter sweep',
  criteria: [{ id: 'c1', statement: 'accuracy above baseline', tolerance: '+0.5' }],
  budgetCapYuan: 100, stopCondition: 'two seeds without a lift', signedBy: 'human',
}

const a: Attempt = {
  id: 'A-1', slug: 'arch-block', questionId: 'Q-0001', contractVersion: 1,
  branch: 'feat/arch-block', protocolPath: 'research/attempts/arch-block.md', status: 'running',
}

const r: Run = {
  id: 'RUN-0012', attemptId: 'A-1', kind: 'experiment', machine: 'autodl-4090',
  image: 'pytorch:2.4', commit: 'abc123', command: 'python train.py', params: { seed: '0' },
  startedAt: '2026-11-21T00:00:00.000Z', costYuan: 3.5, artifacts: [],
}

describe('the research foundation end to end', () => {
  it('runs a question from creation to a concluded attempt', () => {
    const db = new DatabaseSync(':memory:')
    createResearchSchema(db)
    const repo = new ResearchRepo(db)

    repo.saveQuestion(q)
    expect(repo.getQuestion('Q-0001')?.precision).toBe('hypothesis')

    repo.saveContract(freezeContract(base, 'human', '2026-11-21T00:00:00.000Z'))
    expect(repo.getContract(1)?.criteria).toHaveLength(1)

    repo.saveAttempt(a)
    repo.addRun(r)
    expect(repo.costOfAttempt('A-1')).toBe(3.5)
    expect(canConclude([r.id])).toBe(true)
    expect(canDeleteBranch(a).ok).toBe(false)

    const entryId = 'Q-0001'
    const agenda = appendEntry('# Agenda' + LF, {
      id: entryId, question: q.statement, precision: q.precision, status: 'answered',
      conclusion: 'the block lifts accuracy by 1.2 points on two seeds', evidence: [r.id],
      decidedBy: 'human', at: '2026-11-21T01:00:00.000Z',
    }, agendaDigest('# Agenda' + LF))
    expect(parseAgenda(agenda)).toHaveLength(1)

    repo.saveAttempt({ ...a, status: 'concluded', verdict: 'supported', agendaEntryId: entryId })
    const concluded = repo.getAttempt('A-1')
    expect(concluded?.verdict).toBe('supported')
    expect(canDeleteBranch(concluded!).ok).toBe(true)
  })
})