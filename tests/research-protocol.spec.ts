import { describe, expect, it } from 'vitest'
import type { Contract } from '../src/research/model.ts'
import { validateProtocol, type Protocol } from '../src/research/protocol.ts'

const AT = '2026-11-21T00:00:00.000Z'
const contract: Contract = {
  version: 1, goal: 'g', requirement: 'r',
  criteria: [{ id: 'c1', statement: 'accuracy lifts on both seeds' }],
  budgetCapYuan: 200, stopCondition: 'no lift on either seed', signedBy: 'me',
}
const proto = (over: Partial<Protocol> = {}): Protocol => ({
  attemptId: 'A-1', questionId: 'Q-1', contractVersion: 1,
  commands: ['python train.py --seed 0'],
  measurements: [{ criterionId: 'c1', from: 'metrics.json:accuracy' }],
  expected: 'accuracy above baseline on both seeds', stopCondition: 'no lift on either seed',
  machineHours: 4, registeredAt: AT, ...over,
})

describe('validateProtocol', () => {
  it('accepts a protocol that measures every criterion', () => {
    expect(() => validateProtocol(proto(), contract)).not.toThrow()
  })
  it('refuses a protocol that measures no criterion', () => {
    expect(() => validateProtocol(proto({ measurements: [] }), contract)).toThrow(/criterion/)
  })
  it('refuses a protocol with no command', () => {
    expect(() => validateProtocol(proto({ commands: [] }), contract)).toThrow(/command/)
  })
  it('refuses a protocol for a different contract version', () => {
    expect(() => validateProtocol(proto({ contractVersion: 9 }), contract)).toThrow(/contract/)
  })
  it('refuses a protocol with no stop condition', () => {
    expect(() => validateProtocol(proto({ stopCondition: ' ' }), contract)).toThrow(/stop condition/)
  })
  it('refuses a machine time that is not positive', () => {
    expect(() => validateProtocol(proto({ machineHours: 0 }), contract)).toThrow(/machine/)
  })
  it('refuses a timestamp without a zone', () => {
    expect(() => validateProtocol(proto({ registeredAt: '2026-11-21 00:00' }), contract)).toThrow(/timezone/)
  })
})