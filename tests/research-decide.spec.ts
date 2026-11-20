import { describe, expect, it } from 'vitest'
import { accept, kill } from '../src/research/decide.ts'
import type { Attempt } from '../src/research/model.ts'

const AT = '2026-11-21T00:00:00.000Z'
const concluded: Attempt = {
  id: 'A-1', slug: 's', questionId: 'Q-1', contractVersion: 1, branch: 'b', protocolPath: 'p',
  status: 'concluded', verdict: 'supported',
}

describe('accept', () => {
  it('accepts a reproduced, supported attempt', () => {
    const decision = accept(concluded, 'reproducible', 'me', AT)
    expect(decision.kind).toBe('accept_result')
    expect(decision.targetId).toBe('A-1')
    expect(decision.actor).toBe('human')
  })
  it('refuses to accept an unreproduced result', () => {
    expect(() => accept(concluded, 'not_reproducible', 'me', AT)).toThrow(/not reproduced/)
  })
  it('refuses to accept an inconclusive rerun', () => {
    expect(() => accept(concluded, 'inconclusive', 'me', AT)).toThrow(/not reproduced/)
  })
  it('refuses to accept an attempt that is not concluded', () => {
    expect(() => accept({ ...concluded, status: 'running' }, 'reproducible', 'me', AT)).toThrow(/concluded/)
  })
  it('refuses to accept a refuted attempt', () => {
    expect(() => accept({ ...concluded, verdict: 'refuted' }, 'reproducible', 'me', AT)).toThrow(/supported/)
  })
})

describe('kill', () => {
  it('records a human decision with its reason', () => {
    const decision = kill('Q-1', 'the gap closed', 'me', AT)
    expect(decision.kind).toBe('kill_direction')
    expect(decision.note).toBe('the gap closed')
  })
  it('refuses to kill without a reason', () => {
    expect(() => kill('Q-1', '  ', 'me', AT)).toThrow(/reason/)
  })
})