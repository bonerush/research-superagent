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
  })
  it('refuses to accept an unreproduced result', () => {
    expect(() => accept(concluded, 'not_reproducible', 'me', AT)).toThrow(/not reproduced/)
  })
  it('refuses to accept an inconclusive rerun', () => {
    expect(() => accept(concluded, 'inconclusive', 'me', AT)).toThrow(/not reproduced/)
  })
  it('refuses to accept a refuted attempt', () => {
    expect(() => accept({ ...concluded, verdict: 'refuted' }, 'reproducible', 'me', AT)).toThrow(/supported/)
  })
})

describe('kill', () => {
  it('records the reason with the critic objection', () => {
    const decision = kill('Q-1', 'the gap closed', 'the delta is thin', 'me', AT)
    expect(decision.kind).toBe('kill_direction')
    expect(decision.note).toContain('the gap closed')
    expect(decision.note).toContain('the delta is thin')
  })
  it('refuses to kill without a reason', () => {
    expect(() => kill('Q-1', '  ', 'objection', 'me', AT)).toThrow(/reason/)
  })
  it('refuses to kill without the objection', () => {
    expect(() => kill('Q-1', 'reason', ' ', 'me', AT)).toThrow(/objection/)
  })
})