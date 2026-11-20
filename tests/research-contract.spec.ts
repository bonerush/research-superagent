import { describe, expect, it } from 'vitest'
import { contractHash, freezeContract, verifyContract, type Contract } from '../src/research/contract.ts'

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
})

describe('freezeContract', () => {
  it('detects a changed criterion after freezing', () => {
    const f = freezeContract(base, 'human', '2026-11-21T00:00:00.000Z')
    expect(verifyContract({ ...f, budgetCapYuan: 200 })).toBe(false)
  })
  it('keeps an unchanged contract valid', () => {
    const f = freezeContract(base, 'human', '2026-11-21T00:00:00.000Z')
    expect(verifyContract(f)).toBe(true)
  })
})