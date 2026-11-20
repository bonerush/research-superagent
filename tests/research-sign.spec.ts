import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import type { Contract } from '../src/research/model.ts'
import { sign } from '../src/research/sign.ts'

const AT = '2026-11-21T00:00:00.000Z'
const base: Contract = {
  version: 1, goal: 'g', requirement: 'r',
  criteria: [{ id: 'c1', statement: 's' }],
  budgetCapYuan: 100, stopCondition: 't', signedBy: '',
}
const open = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}

describe('sign', () => {
  it('freezes and stores the contract', () => {
    const repo = open()
    const { frozen } = sign(repo, base, 'me', AT)
    expect(repo.getContract(1)?.hash).toBe(frozen.hash)
    expect(frozen.signedBy).toBe('me')
  })
  it('records a human decision naming the contract version', () => {
    const repo = open()
    const { decision } = sign(repo, base, 'me', AT)
    expect(decision.kind).toBe('sign_contract')
    expect(decision.actor).toBe('human')
    expect(decision.targetId).toBe('contract:1')
  })
  it('refuses to sign the same version twice', () => {
    const repo = open()
    sign(repo, base, 'me', AT)
    expect(() => sign(repo, base, 'me', AT)).toThrow(/frozen/)
  })
  it('records no decision when the signature is refused', () => {
    const repo = open()
    sign(repo, base, 'me', AT)
    try { sign(repo, base, 'me', AT) } catch { /* expected */ }
    expect(repo.decisionsFor('contract:1')).toHaveLength(1)
  })
})