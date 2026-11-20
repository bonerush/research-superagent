/** Guards over the research invariants that need no I/O: each returns a refusal a caller can surface, never an exception. */
import type { Attempt } from './model.ts'

/** The outcome of a guard: allowed, or refused with the reason to show a person. */
export type Guard = { ok: true } | { ok: false; reason: string }

/**
 * A branch may be deleted only after its conclusion reached the agenda.
 * The branch holds the protocol, the runs and the code; deleting it before the agenda has the conclusion destroys the only record.
 */
export function canDeleteBranch(attempt: Attempt): Guard {
  if (attempt.status !== 'concluded' && attempt.status !== 'abandoned') {
    return { ok: false, reason: `attempt ${attempt.id} is still ${attempt.status}` }
  }
  if (!attempt.agendaEntryId) return { ok: false, reason: `attempt ${attempt.id} has no agenda entry` }
  return { ok: true }
}

/** A conclusion must cite at least one run; without one it is an opinion and the agenda may not carry it as a finding. */
export function canConclude(evidence: string[]): boolean {
  return evidence.some(item => item.trim().length > 0)
}