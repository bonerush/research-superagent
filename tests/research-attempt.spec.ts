import { describe, expect, it } from 'vitest'
import { conclude, openAttempt, startAttempt, waitAttempt, type Naming } from '../src/research/attempt.ts'
import type { Protocol } from '../src/research/protocol.ts'

const proto: Protocol = {
  attemptId: 'A-1', questionId: 'Q-1', contractVersion: 1,
  commands: ['python train.py'], measurements: [{ criterionId: 'c1', from: 'metrics.json' }],
  expected: 'e', stopCondition: 's', machineHours: 4, registeredAt: '2026-11-21T00:00:00.000Z',
}
const naming: Naming = { slug: 'arch-block', branch: 'feat/arch-block', protocolPath: 'research/attempts/arch-block.md' }
const opened = () => openAttempt(proto, naming)

describe('openAttempt', () => {
  it('opens as opened with the protocol naming', () => {
    const attempt = opened()
    expect(attempt.status).toBe('opened')
    expect(attempt.branch).toBe('feat/arch-block')
    expect(attempt.contractVersion).toBe(1)
  })
})

describe('startAttempt', () => {
  it('moves an opened attempt to running', () => {
    expect(startAttempt(opened()).status).toBe('running')
  })
  it('refuses to start an attempt already running', () => {
    expect(() => startAttempt(startAttempt(opened()))).toThrow(/running/)
  })
})

describe('waitAttempt', () => {
  it('waits only from running and resumes', () => {
    const waiting = waitAttempt(startAttempt(opened()))
    expect(waiting.status).toBe('waiting')
    expect(startAttempt(waiting).status).toBe('running')
  })
})

describe('conclude', () => {
  it('refuses a conclusion that cites no run', () => {
    expect(() => conclude(startAttempt(opened()), 'supported', [])).toThrow(/run/)
  })
  it('records the verdict with its evidence', () => {
    const done = conclude(startAttempt(opened()), 'supported', ['RUN-1'])
    expect(done.status).toBe('concluded')
    expect(done.verdict).toBe('supported')
  })
  it('refuses to conclude a concluded attempt', () => {
    const done = conclude(startAttempt(opened()), 'supported', ['RUN-1'])
    expect(() => conclude(done, 'refuted', ['RUN-2'])).toThrow(/concluded/)
  })
})