import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { researchTool } from '../src/app/tools/research.ts'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import { sign } from '../src/research/sign.ts'
import type { Contract } from '../src/research/model.ts'

const AT = '2026-11-21T00:00:00.000Z'
const signal = new AbortController().signal
const contract: Contract = {
  version: 1, goal: 'g', requirement: 'r', criteria: [{ id: 'c1', statement: 's' }],
  budgetCapYuan: 200, stopCondition: 't', signedBy: '',
}
const open = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}
const run = (tool: ReturnType<typeof researchTool>, args: unknown) => tool.execute(args as never, signal)

describe('the research tool drives an experiment', () => {
  it('registers a protocol, opens an attempt, records a run and concludes', async () => {
    const store = open()
    sign(store, contract, 'me', AT)
    const tool = researchTool({ repo: store })
    await run(tool, { action: 'protocol', attemptId: 'A-1', questionId: 'Q-1', contractVersion: 1, commands: ['python train.py'], measurements: [{ criterionId: 'c1', from: 'metrics.json' }], expected: 'e', stopCondition: 's', machineHours: 4 })
    await run(tool, { action: 'attempt', op: 'open', attemptId: 'A-1', slug: 's', branch: 'b', protocolPath: 'p' })
    await run(tool, { action: 'attempt', op: 'start', attemptId: 'A-1' })
    await run(tool, { action: 'run', id: 'RUN-1', attemptId: 'A-1', machine: 'a100', image: 'img', commit: 'abc', command: 'c', startedAt: AT, endedAt: '2026-11-21T01:00:00.000Z', costYuan: 2 })
    const done = await run(tool, { action: 'attempt', op: 'conclude', attemptId: 'A-1', verdict: 'supported', evidence: ['RUN-1'] }) as { verdict: string }
    expect(done.verdict).toBe('supported')
    expect(store.getAttempt('A-1')?.status).toBe('concluded')
    expect(store.costOfAttempt('A-1')).toBe(2)
  })

  it('refuses a conclusion whose evidence is not a run of that attempt', async () => {
    const store = open()
    sign(store, contract, 'me', AT)
    const tool = researchTool({ repo: store })
    await run(tool, { action: 'protocol', attemptId: 'A-1', questionId: 'Q-1', contractVersion: 1, commands: ['c'], measurements: [{ criterionId: 'c1', from: 'm' }], expected: 'e', stopCondition: 's', machineHours: 1 })
    await run(tool, { action: 'attempt', op: 'open', attemptId: 'A-1', slug: 's', branch: 'b', protocolPath: 'p' })
    await run(tool, { action: 'attempt', op: 'start', attemptId: 'A-1' })
    await expect(run(tool, { action: 'attempt', op: 'conclude', attemptId: 'A-1', verdict: 'supported', evidence: ['made-up'] })).rejects.toThrow(/not part of attempt/)
  })

  it('refuses machine actions when no machine is configured', async () => {
    const tool = researchTool({ repo: open() })
    await expect(run(tool, { action: 'machine', op: 'status' })).rejects.toThrow(/no machine/)
  })
})