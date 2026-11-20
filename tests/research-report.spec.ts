import { describe, expect, it } from 'vitest'
import type { EvidencePackage } from '../src/research/evidence.ts'
import type { Attempt, Contract } from '../src/research/model.ts'
import { draftReport, type ReportInput } from '../src/research/report.ts'

const contract: Contract = {
  version: 1, goal: 'show the lift', requirement: 'an architectural novelty',
  criteria: [{ id: 'c1', statement: 'accuracy lifts', tolerance: '0.01' }],
  budgetCapYuan: 200, stopCondition: 'no lift on either seed', signedBy: 'me',
}
const attempt: Attempt = {
  id: 'A-1', slug: 's', questionId: 'Q-1', contractVersion: 1, branch: 'b', protocolPath: 'p',
  status: 'concluded', verdict: 'supported',
}
const evidence: EvidencePackage = {
  attemptId: 'A-1', branch: 'b', commit: 'abc', image: 'pytorch', machineType: 'a100',
  dataSnapshot: { kind: 'hash', value: 'sha256:1' }, command: 'python train.py',
  logs: [], artifacts: [], metrics: { c1: '0.71' }, reproduce: 'bash reproduce.sh',
}
const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  attempt, contract, evidence, outcome: 'reproducible', costYuan: 12.5, ...over,
})

describe('draftReport', () => {
  it('states the verdict, the reproduction and the cost', () => {
    const text = draftReport(input({ outcome: 'not_reproducible' }))
    expect(text).toContain('not_reproducible')
    expect(text).toContain('12.5')
  })
  it('names the stop condition the contract set', () => {
    expect(draftReport(input())).toContain('no lift on either seed')
  })
  it('says what would change the verdict', () => {
    expect(draftReport(input())).toContain('would')
  })
  it('names the attempt and its commit', () => {
    const text = draftReport(input())
    expect(text).toContain('A-1')
    expect(text).toContain('abc')
  })
})