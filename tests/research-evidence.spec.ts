import { describe, expect, it } from 'vitest'
import { validateEvidence, type EvidencePackage } from '../src/research/evidence.ts'
import type { Contract } from '../src/research/model.ts'

const contract: Contract = {
  version: 1, goal: 'g', requirement: 'r',
  criteria: [{ id: 'c1', statement: 'accuracy lifts', tolerance: '0.01' }],
  budgetCapYuan: 200, stopCondition: 'no lift', signedBy: 'me',
}
const pkg = (over: Partial<EvidencePackage> = {}): EvidencePackage => ({
  attemptId: 'A-1', branch: 'feat/x', commit: 'abc', image: 'pytorch', machineType: 'a100',
  dataSnapshot: { kind: 'hash', value: 'sha256:1' }, command: 'python train.py',
  logs: ['run.log'], artifacts: ['metrics.json'], metrics: { c1: '0.71' }, reproduce: 'bash reproduce.sh',
  ...over,
})

describe('validateEvidence', () => {
  it('accepts a complete package', () => {
    expect(() => validateEvidence(pkg(), contract)).not.toThrow()
  })
  it('refuses a package that reports no value for a criterion', () => {
    expect(() => validateEvidence(pkg({ metrics: {} }), contract)).toThrow(/criterion/)
  })
  it('refuses a package with no reproduction command', () => {
    expect(() => validateEvidence(pkg({ reproduce: ' ' }), contract)).toThrow(/reproduce/)
  })
  it('refuses a package with no data snapshot', () => {
    expect(() => validateEvidence(pkg({ dataSnapshot: { kind: 'hash', value: '' } }), contract)).toThrow(/data/)
  })
  it('refuses a package with no commit', () => {
    expect(() => validateEvidence(pkg({ commit: ' ' }), contract)).toThrow(/commit/)
  })
})