/** Whether a rerun actually reproduces the result, and what a failed reproduction does to the verdict. */
import type { EvidencePackage } from './evidence.ts'
import type { Attempt, Contract } from './model.ts'

/** What an independent rerun reports: the same fields the evidence pins, plus its own metrics. */
export interface Verification {
  commit: string
  dataHash: string
  command: string
  metrics: Record<string, string>
}

/** The three answers the convergence step can give. */
export type Reproducibility = 'reproducible' | 'not_reproducible' | 'inconclusive'

/** The tolerance a criterion allows, as a number; a missing or unparseable tolerance means exact equality. */
const toleranceOf = (criterion: Contract['criteria'][number]): number => {
  const parsed = Number(criterion.tolerance)
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0
}

/**
 * Compares a rerun with the original evidence.
 * Code, data and command must match exactly: a different commit or a different data hash is a different experiment,
 * however close the numbers look. Metrics are compared per criterion inside the tolerance the contract set;
 * a blank or missing value makes the answer inconclusive rather than a pass.
 */
export function checkReproduction(original: EvidencePackage, verification: Verification, contract: Contract): Reproducibility {
  if (verification.commit !== original.commit) return 'not_reproducible'
  if (verification.dataHash !== original.dataHash) return 'not_reproducible'
  if (verification.command !== original.command) return 'not_reproducible'
  let missing = false
  for (const criterion of contract.criteria) {
    const was = original.metrics[criterion.id]?.trim()
    const now = verification.metrics[criterion.id]?.trim()
    if (!was || !now) { missing = true; continue }
    const wasValue = Number(was)
    const nowValue = Number(now)
    if (Number.isFinite(wasValue) && Number.isFinite(nowValue)) {
      if (Math.abs(wasValue - nowValue) > toleranceOf(criterion)) return 'not_reproducible'
      continue
    }
    if (was !== now) return 'not_reproducible'
  }
  return missing ? 'inconclusive' : 'reproducible'
}

/**
 * Applies a reproduction to a concluded attempt.
 * Only a confirmed failure to reproduce downgrades the verdict; an inconclusive rerun (a missing value) leaves the
 * attempt alone and asks for a better rerun, because the machine did not disprove anything.
 */
export function settle(attempt: Attempt, outcome: Reproducibility): Attempt {
  if (attempt.status !== 'concluded') throw new Error(`attempt ${attempt.id} is not concluded`)
  if (outcome !== 'not_reproducible') return attempt
  return { ...attempt, verdict: 'inconclusive' }
}