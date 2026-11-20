/** The attempt lifecycle: what may follow what, and what may not be concluded. */
import { canConclude } from './guards.ts'
import type { Attempt, Verdict } from './model.ts'
import type { Protocol } from './protocol.ts'

/** Where the attempt lives in the repository. */
export interface Naming {
  slug: string
  branch: string
  protocolPath: string
}

/** Opens an attempt from its registered protocol. Nothing runs yet. */
export function openAttempt(protocol: Protocol, naming: Naming): Attempt {
  return {
    id: protocol.attemptId,
    slug: naming.slug,
    questionId: protocol.questionId,
    contractVersion: protocol.contractVersion,
    branch: naming.branch,
    protocolPath: naming.protocolPath,
    status: 'opened',
  }
}

/** Starts, or resumes a waiting attempt. An attempt already running cannot start again. */
export function startAttempt(attempt: Attempt): Attempt {
  if (attempt.status === 'running') throw new Error(`attempt ${attempt.id} is already running`)
  if (attempt.status !== 'opened' && attempt.status !== 'waiting') throw new Error(`attempt ${attempt.id} cannot start from ${attempt.status}`)
  return { ...attempt, status: 'running' }
}

/** Waits: the machine is between runs, or a person is needed. */
export function waitAttempt(attempt: Attempt): Attempt {
  if (attempt.status !== 'running') throw new Error(`attempt ${attempt.id} is not running`)
  return { ...attempt, status: 'waiting' }
}

/**
 * Concludes an attempt with a verdict and the runs that prove it.
 * Only a running or waiting attempt can conclude: an attempt that never started has nothing to conclude from.
 * A conclusion with no run is refused too, because the ledger must not carry a claim the machine never made.
 */
export function conclude(attempt: Attempt, verdict: Verdict, evidence: string[]): Attempt {
  if (attempt.status === 'concluded') throw new Error(`attempt ${attempt.id} is already concluded`)
  if (attempt.status === 'abandoned') throw new Error(`attempt ${attempt.id} was abandoned`)
  if (attempt.status !== 'running' && attempt.status !== 'waiting') throw new Error(`attempt ${attempt.id} never ran: it is ${attempt.status}`)
  if (!canConclude(evidence)) throw new Error(`attempt ${attempt.id} cites no run: a conclusion needs evidence`)
  return { ...attempt, status: 'concluded', verdict }
}