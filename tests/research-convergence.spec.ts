import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { researchTool } from '../src/app/tools/research.ts'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import { sign } from '../src/research/sign.ts'
import type { Contract, Question } from '../src/research/model.ts'

const AT = '2026-11-21T00:00:00.000Z'
const signal = new AbortController().signal
const contract: Contract = {
  version: 1, goal: 'g', requirement: 'r', criteria: [{ id: 'c1', statement: 'accuracy lifts', tolerance: '0.01' }],
  budgetCapYuan: 200, stopCondition: 'no lift', signedBy: '',
}
const question: Question = {
  id: 'Q-1', statement: 'q', precision: 'topic', status: 'open', createdAt: AT,
}
const open = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}
const runTool = (tool: ReturnType<typeof researchTool>, args: unknown) => tool.execute(args as never, signal)
const verification = (over: Record<string, unknown> = {}) => ({
  commit: 'abc', dataHash: 'sha256:1', command: 'python train.py', metrics: { c1: '0.71' }, ...over,
})
const evidenceArgs = (attemptId: string, over: Record<string, unknown> = {}) => ({
  action: 'evidence', attemptId, branch: 'b', commit: 'abc', image: 'img', machineType: 'a100',
  dataHash: 'sha256:1', command: 'python train.py', metrics: { c1: '0.71' }, reproduce: 'bash reproduce.sh',
  verification: verification(), ...over,
})

const concluded = async (): Promise<{ store: ResearchRepo; tool: ReturnType<typeof researchTool> }> => {
  const store = open()
  sign(store, contract, 'me', AT)
  const tool = researchTool({ repo: store })
  await runTool(tool, { action: 'protocol', attemptId: 'A-1', questionId: 'Q-1', contractVersion: 1, commands: ['python train.py'], measurements: [{ criterionId: 'c1', from: 'metrics.json' }], expected: 'e', stopCondition: 's', machineHours: 1 })
  await runTool(tool, { action: 'attempt', op: 'open', attemptId: 'A-1', slug: 's', branch: 'b', protocolPath: 'p' })
  await runTool(tool, { action: 'attempt', op: 'start', attemptId: 'A-1' })
  await runTool(tool, { action: 'run', id: 'RUN-1', attemptId: 'A-1', machine: 'a100', image: 'img', commit: 'abc', command: 'c', startedAt: AT, endedAt: '2026-11-21T01:00:00.000Z', costYuan: 2 })
  await runTool(tool, { action: 'attempt', op: 'conclude', attemptId: 'A-1', verdict: 'supported', evidence: ['RUN-1'] })
  return { store, tool }
}

describe('the convergence loop', () => {
  it('turns a concluded attempt into an accepted report', async () => {
    const { store, tool } = await concluded()
    const out = await runTool(tool, evidenceArgs('A-1')) as { verdict: string; outcome: string }
    expect(out.outcome).toBe('reproducible')
    expect(store.getReport('A-1')).toContain('reproducible')
    await runTool(tool, { action: 'decide', op: 'accept', attemptId: 'A-1', by: 'me' })
    expect(store.decisionsFor('A-1').map(d => d.kind)).toContain('accept_result')
  })

  it('refuses to call a different commit a reproduction', async () => {
    const { store, tool } = await concluded()
    const out = await runTool(tool, evidenceArgs('A-1', { verification: verification({ commit: 'other' }) })) as { verdict: string; outcome: string }
    expect(out.outcome).toBe('not_reproducible')
    expect(out.verdict).toBe('inconclusive')
    expect(store.getAttempt('A-1')?.verdict).toBe('inconclusive')
    await expect(runTool(tool, { action: 'decide', op: 'accept', attemptId: 'A-1', by: 'me' })).rejects.toThrow(/not supported/)
  })

  it('refuses to call different data a reproduction', async () => {
    const { tool } = await concluded()
    const out = await runTool(tool, evidenceArgs('A-1', { verification: verification({ dataHash: 'other' }) })) as { outcome: string }
    expect(out.outcome).toBe('not_reproducible')
  })

  it('leaves the verdict alone when the rerun is inconclusive', async () => {
    const { store, tool } = await concluded()
    const out = await runTool(tool, evidenceArgs('A-1', { verification: verification({ metrics: {} }) })) as { outcome: string; verdict: string }
    expect(out.outcome).toBe('inconclusive')
    expect(store.getAttempt('A-1')?.verdict).toBe('supported')
  })

  it('refuses evidence before the attempt is concluded', async () => {
    const store = open()
    sign(store, contract, 'me', AT)
    const tool = researchTool({ repo: store })
    await runTool(tool, { action: 'protocol', attemptId: 'A-1', questionId: 'Q-1', contractVersion: 1, commands: ['c'], measurements: [{ criterionId: 'c1', from: 'm' }], expected: 'e', stopCondition: 's', machineHours: 1 })
    await runTool(tool, { action: 'attempt', op: 'open', attemptId: 'A-1', slug: 's', branch: 'b', protocolPath: 'p' })
    await runTool(tool, { action: 'attempt', op: 'start', attemptId: 'A-1' })
    await expect(runTool(tool, evidenceArgs('A-1'))).rejects.toThrow(/not concluded/)
  })

  it('records a killed direction with its reason and objection', async () => {
    const { store, tool } = await concluded()
    store.saveQuestion(question)
    await runTool(tool, { action: 'decide', op: 'kill', targetId: 'Q-1', note: 'the gap closed', objection: 'the delta is thin', by: 'me' })
    expect(store.decisionsFor('Q-1')[0]?.kind).toBe('kill_direction')
    await expect(runTool(tool, { action: 'decide', op: 'kill', targetId: 'Q-1', note: 'r', objection: 'o', by: 'me' })).rejects.toThrow(/already recorded/)
  })
})