/** The two decisions a person makes at the end: keep the result, or end the direction. */
import { assertIsoTimestamp, type Attempt, type Decision } from './model.ts'
import type { Reproducibility } from './reproduction.ts'

/**
 * Accepts a result.
 * Three things must hold: the attempt concluded, its verdict is supported, and a rerun reproduced it. Anything less
 * is a result a person may read, not one the ledger calls accepted.
 */
export function accept(attempt: Attempt, outcome: Reproducibility, by: string, at: string): Decision {
  if (attempt.status !== 'concluded') throw new Error(`attempt ${attempt.id} is not concluded`)
  if (attempt.verdict !== 'supported') throw new Error(`attempt ${attempt.id} was not supported: ${String(attempt.verdict)}`)
  if (outcome !== 'reproducible') throw new Error(`the result was not reproduced: ${outcome}`)
  return {
    id: `accept-${attempt.id}`,
    kind: 'accept_result',
    targetId: attempt.id,
    actor: 'human',
    by,
    at: assertIsoTimestamp(at),
  }
}

/** Ends a direction. The reason is required: a direction killed without one teaches the next batch nothing. */
export function kill(targetId: string, note: string, by: string, at: string): Decision {
  if (!note.trim()) throw new Error('a killed direction needs a reason')
  return {
    id: `kill-${targetId}`,
    kind: 'kill_direction',
    targetId,
    actor: 'human',
    by,
    at: assertIsoTimestamp(at),
    note: note.trim(),
  }
}