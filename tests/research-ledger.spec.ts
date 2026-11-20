import { describe, expect, it } from 'vitest'
import { attemptCost, runCost } from '../src/research/ledger.ts'
import type { Run } from '../src/research/model.ts'

const AT = '2026-11-21T00:00:00.000Z'
const RATES = { a100: 2, '4090': 1 }
const run = (machine: string, startMinutes: number, endMinutes: number, id = 'R-1'): Run => ({
  id, attemptId: 'A-1', kind: 'experiment', machine, image: 'img', commit: 'abc', command: 'c', params: {},
  startedAt: new Date(Date.parse(AT) + startMinutes * 60_000).toISOString(),
  endedAt: new Date(Date.parse(AT) + endMinutes * 60_000).toISOString(), artifacts: [],
})

describe('runCost', () => {
  it('charges by the minute of the boot', () => {
    expect(runCost(run('a100', 0, 60), RATES)).toBe(2)
    expect(runCost(run('4090', 0, 30), RATES)).toBe(0.5)
  })
  it('refuses a run that never ended', () => {
    expect(() => runCost({ ...run('a100', 0, 60), endedAt: undefined }, RATES)).toThrow(/ended/)
  })
  it('refuses a run whose end precedes its start', () => {
    expect(() => runCost(run('a100', 60, 30), RATES)).toThrow(/ended/)
  })
  it('refuses a machine with no rate', () => {
    expect(() => runCost(run('h100', 0, 60), RATES)).toThrow(/rate/)
  })
})

describe('attemptCost', () => {
  it('sums the runs of one attempt', () => {
    expect(attemptCost([run('a100', 0, 60, 'R-1'), run('4090', 60, 90, 'R-2')], RATES)).toBe(2.5)
  })
  it('refuses overlapping runs on one machine', () => {
    expect(() => attemptCost([run('a100', 0, 60, 'R-1'), run('a100', 30, 90, 'R-2')], RATES)).toThrow(/overlap/)
  })
  it('allows two machines to overlap', () => {
    expect(attemptCost([run('a100', 0, 60, 'R-1'), run('4090', 30, 90, 'R-2')], RATES)).toBe(3)
  })
})