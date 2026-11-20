import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import type { Attempt } from '../src/research/model.ts'
import type { Protocol } from '../src/research/protocol.ts'

const AT = '2026-11-21T00:00:00.000Z'
const a: Attempt = {
  id: 'A-1', slug: 'arch-block', questionId: 'Q-1', contractVersion: 1,
  branch: 'feat/arch-block', protocolPath: 'research/attempts/arch-block.md', status: 'opened',
}
const proto = { attemptId: 'A-1', questionId: 'Q-1', contractVersion: 1, commands: ['python train.py'],
  measurements: [{ criterionId: 'c1', from: 'metrics.json' }], expected: 'e', stopCondition: 's',
  machineHours: 4, registeredAt: AT } as Protocol
const open = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}

describe('protocols', () => {
  it('round-trips the protocol beside its attempt', () => {
    const repo = open()
    repo.saveAttempt(a)
    repo.saveProtocol(proto)
    expect(repo.getProtocol('A-1')?.contractVersion).toBe(1)
    expect(repo.getProtocol('A-1')?.measurements[0]?.from).toBe('metrics.json')
  })
  it('returns undefined for an attempt with no protocol', () => {
    expect(open().getProtocol('A-9')).toBeUndefined()
  })
})

describe('listAttempts', () => {
  it('lists by status, newest contract version first', () => {
    const repo = open()
    repo.saveAttempt({ ...a, id: 'A-1', status: 'opened' })
    repo.saveAttempt({ ...a, id: 'A-2', status: 'running', contractVersion: 2 })
    expect(repo.listAttempts('opened').map(x => x.id)).toEqual(['A-1'])
    expect(repo.listAttempts()).toHaveLength(2)
  })
})