import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { researchTool } from '../src/app/tools/research.ts'
import { ResearchRepo, createResearchSchema } from '../src/app/store-research.ts'
import { sign } from '../src/research/sign.ts'
import type { Contract } from '../src/research/model.ts'

const AT = '2026-11-21T00:00:00.000Z'
const signal = new AbortController().signal
const contract: Contract = {
  version: 1, goal: 'g', requirement: 'r', criteria: [{ id: 'c1', statement: 'accuracy lifts', tolerance: '0.01' }],
  budgetCapYuan: 200, stopCondition: 'no lift', signedBy: '',
}
const open = (): ResearchRepo => {
  const db = new DatabaseSync(':memory:')
  createResearchSchema(db)
  return new ResearchRepo(db)
}
const runTool = (tool: ReturnType<typeof researchTool>, args: unknown) => tool.execute(args as never, signal)
const evidenceArgs = (attemptId: string, outcome: string) => ({
  action: 'evidence', attemptId, outcome, branch: 'b', commit: 'abc', image: 'img', machineType: 'a100',
  dataKind: 'hash', dataValue: 'sha256:1', command: 'python train.py',
  metrics: { c1: '0.71' }, reproduce: 'bash reproduce.sh',
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
    const out = await runTool(tool, evidenceArgs('A-1', 'reproducible')) as { verdict: string }
    expect(out.verdict).toBe('supported')
    expect(store.getReport('A-1')).toContain('reproducible')
    expect(store.getEvidence('A-1')?.commit).toBe('abc')
    await runTool(tool, { action: 'decide', op: 'accept', attemptId: 'A-1', by: 'me' })
    expect(store.decisionsFor('A-1').map(d => d.kind)).toContain('accept_result')
  })

  it('downgrades an unreproduced result and refuses to accept it', async () => {
    const { store, tool } = await concluded()
    const out = await runTool(tool, evidenceArgs('A-1', 'not_reproducible')) as { verdict: string }
    expect(out.verdict).toBe('inconclusive')
    expect(store.getAttempt('A-1')?.verdict).toBe('inconclusive')
    expect(store.getReport('A-1')).toContain('not_reproducible')
    await expect(runTool(tool, { action: 'decide', op: 'accept', attemptId: 'A-1', by: 'me' })).rejects.toThrow(/not supported/)
  })

  it('records a killed direction with its reason', async () => {
    const { store, tool } = await concluded()
    await runTool(tool, { action: 'decide', op: 'kill', targetId: 'Q-1', note: 'the gap closed', by: 'me' })
    expect(store.decisionsFor('Q-1')[0]?.kind).toBe('kill_direction')
    await expect(runTool(tool, { action: 'decide', op: 'kill', targetId: 'Q-1', by: 'me' })).rejects.toThrow(/reason/)
  })

  it('refuses a second evidence package', async () => {
    const { tool } = await concluded()
    await runTool(tool, evidenceArgs('A-1', 'reproducible'))
    await expect(runTool(tool, evidenceArgs('A-1', 'reproducible'))).rejects.toThrow(/already/)
  })
})