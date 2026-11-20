import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { researchTools } from '../src/app/tools/research.ts'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import type { Tool } from '../src/app/tools/tool.ts'

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
const reviewed = async (store: ResearchRepo, tools: Tool[]) => {
  await byName(tools, 'research_propose').execute({ id: 'B-1', direction: 'd', candidates: [candidate(1), candidate(2)] }, signal)
  await byName(tools, 'research_critique').execute({ batchId: 'B-1', reviews: [
    { candidateId: 'P-1-1', verdict: 'keep', reason: 'ok' },
    { candidateId: 'P-1-2', verdict: 'drop', reason: 'not novel' },
  ] }, signal)
}

describe('the proposal loop through its tools', () => {
  it('runs a direction to a signed contract drawn from the picked candidate', async () => {
    const store = repo()
    const tools = researchTools(store)
    await reviewed(store, tools)
    await byName(tools, 'research_pick').execute({ batchId: 'B-1', candidateId: 'P-1-1', by: 'me' }, signal)

    const signed = await byName(tools, 'research_sign').execute({ batchId: 'B-1', candidateId: 'P-1-1',
      requirement: '架构上的新机制', version: 1, by: 'me' }, signal) as { hash: string }

    const contract = store.getContract(1)
    expect(contract?.hash).toBe(signed.hash)
    expect(contract?.signedBy).toBe('me')
    expect(contract?.criteria.map(entry => entry.statement)).toContain('accuracy lifts on both seeds')
    expect(contract?.budgetCapYuan).toBe(200)
    expect(store.getProposalBatch('B-1')?.contractVersion).toBe(1)
    expect(store.decisionsFor('B-1').map(d => d.kind)).toEqual(['pick_proposal'])
    expect(store.decisionsFor('contract:1').map(d => d.kind)).toEqual(['sign_contract'])
  })

  it('refuses a resubmitted batch id instead of overwriting its critiques', async () => {
    const store = repo()
    const tools = researchTools(store)
    await reviewed(store, tools)
    await expect(byName(tools, 'research_propose').execute({ id: 'B-1', direction: 'd', candidates: [candidate(1), candidate(2)] }, signal)).rejects.toThrow(/UNIQUE|constraint/)
    expect(store.getProposalBatch('B-1')?.critiques).toHaveLength(2)
  })

  it('refuses a second pick on the same batch', async () => {
    const store = repo()
    const tools = researchTools(store)
    await byName(tools, 'research_propose').execute({ id: 'B-1', direction: 'd', candidates: [candidate(1), candidate(2), candidate(3)] }, signal)
    await byName(tools, 'research_critique').execute({ batchId: 'B-1', reviews: [
      { candidateId: 'P-1-1', verdict: 'keep', reason: 'ok' },
      { candidateId: 'P-1-2', verdict: 'keep', reason: 'ok' },
      { candidateId: 'P-1-3', verdict: 'keep', reason: 'ok' },
    ] }, signal)
    await byName(tools, 'research_pick').execute({ batchId: 'B-1', candidateId: 'P-1-1', by: 'me' }, signal)
    await expect(byName(tools, 'research_pick').execute({ batchId: 'B-1', candidateId: 'P-1-2', by: 'me' }, signal)).rejects.toThrow(/ready/)
  })

  it('refuses to sign a candidate the batch did not pick', async () => {
    const store = repo()
    const tools = researchTools(store)
    await reviewed(store, tools)
    await byName(tools, 'research_pick').execute({ batchId: 'B-1', candidateId: 'P-1-1', by: 'me' }, signal)
    await expect(byName(tools, 'research_sign').execute({ batchId: 'B-1', candidateId: 'P-1-2',
      requirement: 'r', version: 1, by: 'me' }, signal)).rejects.toThrow(/picked/)
  })

  it('refuses a candidate the critic dropped', async () => {
    const store = repo()
    const tools = researchTools(store)
    await reviewed(store, tools)
    await expect(byName(tools, 'research_pick').execute({ batchId: 'B-1', candidateId: 'P-1-2', by: 'me' }, signal)).rejects.toThrow(/critic/)
  })
})