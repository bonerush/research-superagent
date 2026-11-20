import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { researchTool } from '../src/app/tools/research.ts'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import type { Tool } from '../src/app/tools/tool.ts'

const signal = new AbortController().signal
const repo = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}

const candidate = (n: number) => ({
  id: 'P-1-' + String(n), question: '新机制能否稳定提升', precision: 'hypothesis' as const,
  prediction: 'accuracy lifts on both seeds', test: 'no lift on either seed falsifies it',
  why: 'w', priors: [{ work: 'A', delta: 'd1' }, { work: 'B', delta: 'd2' }, { work: 'C', delta: 'd3' }],
  feasibility: { data: 'd', hardware: '1x4090', days: 7, yuan: 200 },
  protocolDraft: 'p', risk: 'r',
})
const run = (tool: Tool, args: unknown) => tool.execute(args as never, signal)
const reviewed = async (tool: Tool) => {
  await run(tool, { action: 'propose', id: 'B-1', direction: 'd', candidates: [candidate(1), candidate(2)] })
  await run(tool, { action: 'critique', batchId: 'B-1', reviews: [
    { candidateId: 'P-1-1', verdict: 'keep', reason: 'ok' },
    { candidateId: 'P-1-2', verdict: 'drop', reason: 'not novel' },
  ] })
}

describe('the proposal loop through one tool', () => {
  it('runs a direction to a signed contract drawn from the picked candidate', async () => {
    const store = repo()
    const tool = researchTool(store)
    await reviewed(tool)
    await run(tool, { action: 'pick', batchId: 'B-1', candidateId: 'P-1-1', by: 'me' })
    const signed = await run(tool, { action: 'sign', batchId: 'B-1', candidateId: 'P-1-1', requirement: '架构上的新机制', version: 1, by: 'me' }) as { hash: string }
    const contract = store.getContract(1)
    expect(contract?.hash).toBe(signed.hash)
    expect(contract?.criteria.map(entry => entry.statement)).toContain('accuracy lifts on both seeds')
    expect(store.getProposalBatch('B-1')?.contractVersion).toBe(1)
    expect(store.decisionsFor('contract:1').map(d => d.kind)).toEqual(['sign_contract'])
  })

  it('refuses a resubmitted batch id instead of overwriting its critiques', async () => {
    const store = repo()
    const tool = researchTool(store)
    await reviewed(tool)
    await expect(run(tool, { action: 'propose', id: 'B-1', direction: 'd', candidates: [candidate(1), candidate(2)] })).rejects.toThrow(/UNIQUE|constraint/)
    expect(store.getProposalBatch('B-1')?.critiques).toHaveLength(2)
  })

  it('refuses a second pick on the same batch', async () => {
    const store = repo()
    const tool = researchTool(store)
    await run(tool, { action: 'propose', id: 'B-1', direction: 'd', candidates: [candidate(1), candidate(2), candidate(3)] })
    await run(tool, { action: 'critique', batchId: 'B-1', reviews: [
      { candidateId: 'P-1-1', verdict: 'keep', reason: 'ok' },
      { candidateId: 'P-1-2', verdict: 'keep', reason: 'ok' },
      { candidateId: 'P-1-3', verdict: 'keep', reason: 'ok' },
    ] })
    await run(tool, { action: 'pick', batchId: 'B-1', candidateId: 'P-1-1', by: 'me' })
    await expect(run(tool, { action: 'pick', batchId: 'B-1', candidateId: 'P-1-2', by: 'me' })).rejects.toThrow(/ready/)
  })

  it('refuses to sign a candidate the batch did not pick', async () => {
    const store = repo()
    const tool = researchTool(store)
    await reviewed(tool)
    await run(tool, { action: 'pick', batchId: 'B-1', candidateId: 'P-1-1', by: 'me' })
    await expect(run(tool, { action: 'sign', batchId: 'B-1', candidateId: 'P-1-2', requirement: 'r', version: 1, by: 'me' })).rejects.toThrow(/picked/)
  })

  it('refuses a candidate the critic dropped', async () => {
    const store = repo()
    const tool = researchTool(store)
    await reviewed(tool)
    await expect(run(tool, { action: 'pick', batchId: 'B-1', candidateId: 'P-1-2', by: 'me' })).rejects.toThrow(/critic/)
  })
})