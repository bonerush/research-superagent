import { describe, expect, it } from 'vitest'
import { draftContract } from '../src/research/draft.ts'
import type { Candidate } from '../src/research/proposal.ts'

const candidate: Candidate = {
  id: 'P-1-1', question: '新机制能否在多模态检索上带来稳定提升', precision: 'hypothesis',
  prediction: 'the new block lifts accuracy on both seeds',
  test: 'no lift on either seed falsifies it',
  why: 'w', priors: [{ work: 'A', delta: 'd1' }, { work: 'B', delta: 'd2' }, { work: 'C', delta: 'd3' }],
  feasibility: { data: 'd', hardware: '1x4090', days: 7, yuan: 200 },
  protocolDraft: 'p', risk: 'r',
}

describe('draftContract', () => {
  it('carries the prediction into a criterion', () => {
    const contract = draftContract(candidate, '架构上的新机制', 1)
    expect(contract.criteria.some(entry => entry.statement.includes('accuracy'))).toBe(true)
  })
  it('refuses a blank requirement', () => {
    expect(() => draftContract(candidate, '  ', 1)).toThrow(/requirement/)
  })
  it('caps the budget at the candidate estimate', () => {
    expect(draftContract(candidate, '架构上的新机制', 1).budgetCapYuan).toBe(200)
  })
  it('stops on the falsifier the candidate named', () => {
    expect(draftContract(candidate, '架构上的新机制', 1).stopCondition).toBe(candidate.test)
  })
  it('refuses a candidate that states no criterion at all', () => {
    const vague: Candidate = { ...candidate, prediction: undefined, test: undefined, precision: 'topic' }
    expect(() => draftContract(vague, 'r', 1)).toThrow(/criterion/)
  })
  it('refuses a topic candidate that states no stopping condition', () => {
    const topic: Candidate = { ...candidate, prediction: 'p', test: undefined, precision: 'topic' }
    expect(() => draftContract(topic, 'r', 1)).toThrow(/stop condition/)
  })
})