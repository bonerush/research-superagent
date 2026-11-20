import { describe, expect, it } from 'vitest'
import type { EvidencePackage } from '../src/research/evidence.ts'
import type { Attempt, Contract } from '../src/research/model.ts'
import { checkReproduction, settle, type Verification } from '../src/research/reproduction.ts'

const contract: Contract = {
  version: 1, goal: 'g', requirement: 'r',
  criteria: [{ id: 'c1', statement: 'accuracy lifts', tolerance: '0.01' }],
  budgetCapYuan: 200, stopCondition: 'no lift', signedBy: 'me',
}
const pkg: EvidencePackage = {
  attemptId: 'A-1', branch: 'feat/x', commit: 'abc', image: 'pytorch', machineType: 'a100',
  dataHash: 'sha256:1', command: 'python train.py',
  logs: [], artifacts: [], metrics: { c1: '0.71' }, reproduce: 'bash reproduce.sh',
}
const verify = (over: Partial<Verification> = {}): Verification => ({
  commit: 'abc', dataHash: 'sha256:1', command: 'python train.py', metrics: { c1: '0.71' }, ...over,
})

describe('checkReproduction', () => {
  it('reproduces when code, data, command and metrics agree', () => {
    expect(checkReproduction(pkg, verify(), contract)).toBe('reproducible')
  })
  it('refuses to call a different commit a reproduction', () => {
    expect(checkReproduction(pkg, verify({ commit: 'other' }), contract)).toBe('not_reproducible')
  })
  it('refuses a different data hash even when the metrics match', () => {
    expect(checkReproduction(pkg, verify({ dataHash: 'other' }), contract)).toBe('not_reproducible')
  })
  it('refuses a different command', () => {
    expect(checkReproduction(pkg, verify({ command: 'python other.py' }), contract)).toBe('not_reproducible')
  })
  it('is inconclusive when a metric is missing', () => {
    expect(checkReproduction(pkg, verify({ metrics: {} }), contract)).toBe('inconclusive')
  })
  it('is inconclusive when a rerun value is blank', () => {
    expect(checkReproduction(pkg, verify({ metrics: { c1: '   ' } }), contract)).toBe('inconclusive')
  })
  it('honours the tolerance the contract states', () => {
    expect(checkReproduction(pkg, verify({ metrics: { c1: '0.705' } }), contract)).toBe('reproducible')
  })
  it('refuses a metric outside the tolerance', () => {
    expect(checkReproduction(pkg, verify({ metrics: { c1: '0.8' } }), contract)).toBe('not_reproducible')
  })
})

const concluded: Attempt = {
  id: 'A-1', slug: 's', questionId: 'Q-1', contractVersion: 1, branch: 'b', protocolPath: 'p',
  status: 'concluded', verdict: 'supported',
}

describe('settle', () => {
  it('downgrades a confirmed failure to reproduce', () => {
    expect(settle(concluded, 'not_reproducible').verdict).toBe('inconclusive')
  })
  it('leaves an inconclusive rerun alone', () => {
    expect(settle(concluded, 'inconclusive').verdict).toBe('supported')
  })
  it('keeps a reproduced result', () => {
    expect(settle(concluded, 'reproducible').verdict).toBe('supported')
  })
  it('refuses to settle an attempt that is not concluded', () => {
    expect(() => settle({ ...concluded, status: 'running' }, 'reproducible')).toThrow(/concluded/)
  })
})