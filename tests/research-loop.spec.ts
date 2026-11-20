import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { researchTools } from '../src/app/tools/research.ts'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import type { Tool } from '../src/app/tools/tool.ts'

const AT = '2026-11-21T00:00:00.000Z'
const signal = new AbortController().signal
const repo = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}
const byName = (tools: Tool[], name: string): Tool => {
  const found = tools.find(entry => entry.name === name)
  if (!found) throw new Error('missing tool ' + name)
  return found
}

const candidate = (n: number) => ({
  id: 'P-1-' + String(n), question: '新机制能否稳定提升', precision: 'hypothesis' as const,
  prediction: 'accuracy lifts on both seeds', test: 'no lift on either seed falsifies it',
  why: 'w', priors: [{ work: 'A', delta: 'd1' }, { work: 'B', delta: 'd2' }, { work: 'C', delta: 'd3' }],
  feasibility: { data: 'd', hardware: '1x4090', days: 7, yuan: 200 },
  protocolDraft: 'p', risk: 'r',
})

describe('the proposal loop through its tools', () => {
  it('runs a direction to a signed contract', async () => {
    const store = repo()
    const tools = researchTools(store)

    const proposed = await byName(tools, 'research_propose').execute({ id: 'B-1', direction: '多模态检索', candidates: [candidate(1), candidate(2)] }, signal) as { batch_id: string }
    expect(proposed.batch_id).toBe('B-1')

    const reviewed = await byName(tools, 'research_critique').execute({ batchId: 'B-1', reviews: [
      { candidateId: 'P-1-1', verdict: 'keep', reason: 'ok' },
      { candidateId: 'P-1-2', verdict: 'drop', reason: 'not novel' },
    ] }, signal) as { presentable: boolean }
    expect(reviewed.presentable).toBe(true)

    await byName(tools, 'research_pick').execute({ batchId: 'B-1', candidateId: 'P-1-1', by: 'me' }, signal)
    expect(store.getProposalBatch('B-1')?.status).toBe('picked')

    const signed = await byName(tools, 'research_sign').execute({ version: 1, goal: 'g', requirement: '架构上的新机制',
      criteria: [{ id: 'c1', statement: 's' }], budgetCapYuan: 200, stopCondition: 't', by: 'me' }, signal) as { hash: string }
    expect(store.getContract(1)?.hash).toBe(signed.hash)
    expect(store.getContract(1)?.signedBy).toBe('me')
    expect(store.decisionsFor('B-1').map(d => d.kind)).toEqual(['pick_proposal'])
    expect(store.decisionsFor('contract:1').map(d => d.kind)).toEqual(['sign_contract'])
  })

  it('refuses a candidate the critic dropped', async () => {
    const store = repo()
    const tools = researchTools(store)
    await byName(tools, 'research_propose').execute({ id: 'B-1', direction: 'd', candidates: [candidate(1), candidate(2)] }, signal)
    await byName(tools, 'research_critique').execute({ batchId: 'B-1', reviews: [
      { candidateId: 'P-1-1', verdict: 'keep', reason: 'ok' },
      { candidateId: 'P-1-2', verdict: 'drop', reason: 'not novel' },
    ] }, signal)
    await expect(byName(tools, 'research_pick').execute({ batchId: 'B-1', candidateId: 'P-1-2', by: 'me' }, signal)).rejects.toThrow(/critic/)
  })
})