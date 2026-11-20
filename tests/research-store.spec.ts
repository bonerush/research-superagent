import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import { freezeContract } from '../src/research/contract.ts'
import type { Contract, Question } from '../src/research/model.ts'

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