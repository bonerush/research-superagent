import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import { sign } from '../src/research/sign.ts'
import type { Attempt, Contract, Run } from '../src/research/model.ts'
import type { Protocol } from '../src/research/protocol.ts'

const AT = '2026-11-21T00:00:00.000Z'
const contract: Contract = {
  version: 1, goal: 'g', requirement: 'r',
  criteria: [{ id: 'c1', statement: 's' }],
  budgetCapYuan: 200, stopCondition: 't', signedBy: '',
}
const a: Attempt = {
  id: 'A-1', slug: 'arch-block', questionId: 'Q-1', contractVersion: 1,
  branch: 'feat/arch-block', protocolPath: 'research/attempts/arch-block.md', status: 'opened',
}
const proto: Protocol = {
  attemptId: 'A-1', questionId: 'Q-1', contractVersion: 1, commands: ['python train.py'],
  measurements: [{ criterionId: 'c1', from: 'metrics.json' }], expected: 'e', stopCondition: 's',
  machineHours: 4, registeredAt: AT,
}
const run = (id: string, start: number, end: number): Run => ({
  id, attemptId: 'A-1', kind: 'experiment', machine: 'a100', image: 'img', commit: 'abc',
  command: 'c', params: {}, artifacts: [], costYuan: 1,
  startedAt: new Date(Date.parse(AT) + start * 60_000).toISOString(),
  endedAt: new Date(Date.parse(AT) + end * 60_000).toISOString(),
})
const open = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}
const signed = (): ResearchRepo => { const repo = open(); sign(repo, contract, 'me', AT); return repo }

describe('protocols', () => {
  it('round-trips the protocol beside its attempt', () => {
    const repo = signed()
    repo.saveAttempt(a)
    repo.saveProtocol(proto)
    expect(repo.getProtocol('A-1')?.measurements[0]?.from).toBe('metrics.json')
  })
  it('returns undefined for an attempt with no protocol', () => {
    expect(open().getProtocol('A-9')).toBeUndefined()
  })
  it('refuses a protocol for an attempt with no signed contract', () => {
    const repo = open()
    repo.saveAttempt(a)
    expect(() => repo.saveProtocol(proto)).toThrow(/signed contract/)
  })
  it('refuses a second registration', () => {
    const repo = signed()
    repo.saveAttempt(a)
    repo.saveProtocol(proto)
    expect(() => repo.saveProtocol(proto)).toThrow(/already has a protocol/)
  })
  it('refuses a protocol that measures no criterion', () => {
    const repo = signed()
    repo.saveAttempt(a)
    expect(() => repo.saveProtocol({ ...proto, measurements: [] })).toThrow(/criterion/)
  })
})

describe('attempts', () => {
  it('lists by status', () => {
    const repo = open()
    repo.saveAttempt({ ...a, id: 'A-1', status: 'opened' })
    repo.saveAttempt({ ...a, id: 'A-2', status: 'running', contractVersion: 2 })
    expect(repo.listAttempts('opened').map(x => x.id)).toEqual(['A-1'])
  })
  it('refuses to change a concluded attempt', () => {
    const repo = open()
    repo.saveAttempt({ ...a, status: 'concluded', verdict: 'supported' })
    expect(() => repo.saveAttempt({ ...a, status: 'opened' })).toThrow(/cannot change/)
  })
})

describe('runs', () => {
  it('refuses a finished run with no cost', () => {
    const repo = open()
    expect(() => repo.addRun({ ...run('R-1', 0, 60), costYuan: undefined })).toThrow(/cost/)
  })
  it('refuses overlapping runs when it prices the attempt', () => {
    const repo = open()
    repo.addRun(run('R-1', 0, 60))
    repo.addRun(run('R-2', 30, 90))
    expect(() => repo.costOfAttempt('A-1')).toThrow(/overlap/)
  })
  it('sums the priced runs', () => {
    const repo = open()
    repo.addRun(run('R-1', 0, 30))
    repo.addRun(run('R-2', 30, 90))
    expect(repo.costOfAttempt('A-1')).toBe(2)
  })
})

describe('machine', () => {
  it('records the boot and clears it on the switch-off', () => {
    const repo = open()
    repo.setMachineBootedAt(AT)
    expect(repo.machine().bootedAt).toBe(AT)
    repo.clearMachineBootedAt('2026-11-21T02:00:00.000Z')
    expect(repo.machine().bootedAt).toBeUndefined()
    expect(repo.machine().offAt).toBe('2026-11-21T02:00:00.000Z')
  })
})