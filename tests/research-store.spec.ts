import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import { freezeContract } from '../src/research/contract.ts'
import type { Attempt, Contract, Question, Run } from '../src/research/model.ts'

const open = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}

const q: Question = {
  id: 'Q-0001', statement: 'x', precision: 'topic', status: 'open',
  createdAt: '2026-11-21T00:00:00.000Z',
}

const base: Contract = {
  version: 1, goal: 'g', requirement: 'r',
  criteria: [{ id: 'c1', statement: 's' }],
  budgetCapYuan: 100, stopCondition: 't', signedBy: 'human',
}

const f1 = freezeContract(base, 'human', '2026-11-21T00:00:00.000Z')

const a: Attempt = {
  id: 'A-1', slug: 'x', questionId: 'Q-0001', contractVersion: 1,
  branch: 'feat/x', protocolPath: 'research/attempts/x.md', status: 'running',
}

const r: Run = {
  id: 'R-1', attemptId: 'A-1', kind: 'experiment', machine: 'autodl-4090',
  image: 'pytorch:2.4', commit: 'abc123', command: 'python train.py', params: {},
  startedAt: '2026-11-21T00:00:00.000Z', artifacts: [],
}

describe('ResearchRepo questions', () => {
  it('round-trips a question', () => {
    const repo = open()
    repo.saveQuestion(q)
    expect(repo.getQuestion('Q-0001')?.statement).toBe('x')
  })
  it('returns undefined for an unknown question', () => {
    expect(open().getQuestion('Q-9999')).toBeUndefined()
  })
  it('keeps a hypothesis prediction and test', () => {
    const repo = open()
    repo.saveQuestion({ ...q, precision: 'hypothesis', prediction: 'p', test: 't' })
    expect(repo.getQuestion('Q-0001')?.test).toBe('t')
  })
})

describe('ResearchRepo contracts', () => {
  it('round-trips a frozen contract', () => {
    const repo = open()
    repo.saveContract(f1)
    expect(repo.getContract(1)?.hash).toBe(f1.hash)
  })
  it('is idempotent for an identical save', () => {
    const repo = open()
    repo.saveContract(f1)
    expect(() => repo.saveContract(f1)).not.toThrow()
  })
  it('refuses to overwrite a frozen contract', () => {
    const repo = open()
    repo.saveContract(f1)
    expect(() => repo.saveContract({ ...f1, budgetCapYuan: 999, hash: 'other' })).toThrow(/frozen/)
  })
})

describe('ResearchRepo attempts', () => {
  it('sums the runs of an attempt', () => {
    const repo = open()
    repo.saveAttempt(a)
    repo.addRun({ ...r, id: 'R-1', costYuan: 1.5 })
    repo.addRun({ ...r, id: 'R-2', costYuan: 2 })
    expect(repo.costOfAttempt('A-1')).toBe(3.5)
  })
  it('reports zero for an attempt with no run', () => {
    const repo = open()
    repo.saveAttempt(a)
    expect(repo.costOfAttempt('A-1')).toBe(0)
  })
  it('accepts a verification run after the attempt concluded', () => {
    const repo = open()
    repo.saveAttempt({ ...a, status: 'concluded', verdict: 'supported' })
    repo.addRun({ ...r, kind: 'verification' })
    expect(repo.getAttempt('A-1')?.verdict).toBe('supported')
  })
})