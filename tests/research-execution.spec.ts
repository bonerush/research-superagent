import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import { conclude, openAttempt, startAttempt } from '../src/research/attempt.ts'
import { runCost } from '../src/research/ledger.ts'
import { sign } from '../src/research/sign.ts'
import { validateProtocol, type Protocol } from '../src/research/protocol.ts'
import type { Contract, Run } from '../src/research/model.ts'

const AT = '2026-11-21T00:00:00.000Z'
const RATES = { a100: 2 }
const contract: Contract = {
  version: 1, goal: 'show the lift', requirement: 'an architectural novelty',
  criteria: [{ id: 'c1', statement: 'accuracy lifts on both seeds' }],
  budgetCapYuan: 200, stopCondition: 'no lift on either seed', signedBy: '',
}
const protocol: Protocol = {
  attemptId: 'A-1', questionId: 'Q-1', contractVersion: 1,
  commands: ['python train.py --seed 0'],
  measurements: [{ criterionId: 'c1', from: 'metrics.json:accuracy' }],
  expected: 'accuracy above baseline on both seeds', stopCondition: 'no lift on either seed',
  machineHours: 1, registeredAt: AT,
}
const open = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}

describe('the execution loop', () => {
  it('runs a signed contract to a concluded attempt with its cost', () => {
    const store = open()
    sign(store, contract, 'me', AT)
    validateProtocol(protocol, contract)

    let attempt = openAttempt(protocol, { slug: 'arch-block', branch: 'feat/arch-block', protocolPath: 'research/attempts/arch-block.md' })
    attempt = startAttempt(attempt)
    store.saveAttempt(attempt)
    store.saveProtocol(protocol)

    const run: Run = {
      id: 'RUN-1', attemptId: 'A-1', kind: 'experiment', machine: 'a100', image: 'pytorch',
      commit: 'abc', command: 'python train.py --seed 0', params: { seed: '0' },
      startedAt: AT, endedAt: '2026-11-21T01:00:00.000Z', artifacts: [],
    }
    store.addRun({ ...run, costYuan: runCost(run, RATES) })

    const done = conclude(attempt, 'supported', [run.id])
    store.saveAttempt(done)

    expect(store.getAttempt('A-1')?.verdict).toBe('supported')
    expect(store.costOfAttempt('A-1')).toBe(2)
    expect(runCost(run, RATES)).toBe(2)
    expect(store.getProtocol('A-1')?.measurements).toHaveLength(1)
  })

  it('refuses to conclude before any run exists', () => {
    const store = open()
    sign(store, contract, 'me', AT)
    const attempt = startAttempt(openAttempt(protocol, { slug: 's', branch: 'b', protocolPath: 'p' }))
    expect(() => conclude(attempt, 'supported', [])).toThrow(/run/)
  })
})