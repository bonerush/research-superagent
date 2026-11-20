import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import type { Question } from '../src/research/model.ts'

const open = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}

const q: Question = {
  id: 'Q-0001', statement: 'x', precision: 'topic', status: 'open',
  createdAt: '2026-11-21T00:00:00.000Z',
}

describe('ResearchRepo', () => {
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