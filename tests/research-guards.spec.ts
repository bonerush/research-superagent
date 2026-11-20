import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import { canConclude, canDeleteBranch } from '../src/research/guards.ts'
import type { Attempt, Decision } from '../src/research/model.ts'

const open = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}

const a: Attempt = {
  id: 'A-1', slug: 'x', questionId: 'Q-0001', contractVersion: 1,
  branch: 'feat/x', protocolPath: 'research/attempts/x.md', status: 'concluded', verdict: 'supported',
}

const d: Decision = {
  id: 'D-1', kind: 'kill_direction', targetId: 'Q-0001', actor: 'human',
  by: 'me', at: '2026-11-21T00:00:00.000Z',
}

describe('recordDecision', () => {
  it('records a human decision', () => {
    const repo = open()
    repo.recordDecision(d)
    expect(repo.decisionsFor('Q-0001')[0]?.kind).toBe('kill_direction')
  })
  it('refuses a decision written by an agent', () => {
    const repo = open()
    expect(() => repo.recordDecision({ ...d, actor: 'agent' as never })).toThrow(/human/)
  })
  it('refuses an unknown decision kind', () => {
    const repo = open()
    expect(() => repo.recordDecision({ ...d, kind: 'hack' as never })).toThrow(/unknown decision kind/)
  })
  it('orders decisions by normalized time', () => {
    const repo = open()
    repo.recordDecision({ ...d, id: 'D-1', at: '2026-11-21T08:00:00+08:00' })
    repo.recordDecision({ ...d, id: 'D-2', at: '2026-11-21T01:00:00.000Z' })
    expect(repo.decisionsFor('Q-0001').map(item => item.id)).toEqual(['D-1', 'D-2'])
  })
})

describe('canDeleteBranch', () => {
  it('refuses a branch whose attempt is still running', () => {
    expect(canDeleteBranch({ ...a, status: 'running' }).ok).toBe(false)
  })
  it('refuses to delete a branch before the conclusion is in the agenda', () => {
    expect(canDeleteBranch({ ...a, agendaEntryId: undefined }).ok).toBe(false)
  })
  it('allows a concluded attempt whose conclusion reached the agenda', () => {
    expect(canDeleteBranch({ ...a, agendaEntryId: 'Q-0001' }).ok).toBe(true)
  })
})

describe('canConclude', () => {
  it('refuses a conclusion that cites no run', () => {
    expect(canConclude([])).toBe(false)
    expect(canConclude(['RUN-0012'])).toBe(true)
  })
})