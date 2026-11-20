import { describe, expect, it } from 'vitest'
import { contractHash, freezeContract, verifyContract } from '../src/research/contract.ts'
import type { Contract } from '../src/research/model.ts'

const base: Contract = {
  version: 1, goal: 'g', requirement: 'r',
  criteria: [{ id: 'c1', statement: 's' }],
  budgetCapYuan: 100, stopCondition: 't', signedBy: 'human',
}

describe('contractHash', () => {
  it('hashes equal contracts identically regardless of key order', () => {
    const a = { version: 1, goal: 'g', requirement: 'r', criteria: [{ id: 'c1', statement: 's' }], budgetCapYuan: 100, stopCondition: 't' }
    const b = { stopCondition: 't', budgetCapYuan: 100, criteria: [{ id: 'c1', statement: 's' }], requirement: 'r', goal: 'g', version: 1 }
    expect(contractHash(a as Contract)).toBe(contractHash(b as Contract))
  })
  it('changes when a criterion changes', () => {
    const changed = { ...base, criteria: [{ id: 'c1', statement: 'other' }] }
    expect(contractHash(changed)).not.toBe(contractHash(base))
  })
})

describe('freezeContract', () => {
  it('verifies an unchanged contract', () => {
    expect(verifyContract(freezeContract(base, 'human', '2026-11-21T00:00:00.000Z'))).toBe(true)
  })
  it('detects a changed criterion after freezing', () => {
    const f = freezeContract(base, 'human', '2026-11-21T00:00:00.000Z')
    expect(verifyContract({ ...f, criteria: [{ id: 'c1', statement: 'other' }] })).toBe(false)
  })
  it('detects a changed budget after freezing', () => {
    const f = freezeContract(base, 'human', '2026-11-21T00:00:00.000Z')
    expect(verifyContract({ ...f, budgetCapYuan: 200 })).toBe(false)
  })
})