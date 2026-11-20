/** What a finished run leaves behind: enough for a person, or a rerun, to judge it without asking the agent. */
import type { Contract } from './model.ts'

/** The package a concluded attempt hands to the convergence step. */
export interface EvidencePackage {
  attemptId: string
  branch: string
  commit: string
  image: string
  machineType: string
  /** The content hash of the data, never a path: a path would let the data change under the same name. */
  dataHash: string
  command: string
  /** The environment file the run used, when it had one. */
  envFile?: string
  logs: string[]
  artifacts: string[]
  /** One value per contract criterion, keyed by criterion id. */
  metrics: Record<string, string>
  /** The one command that reruns it. */
  reproduce: string
}

/**
 * Refuses a package a person could not judge: a missing criterion value turns the report into a guess,
 * a blank one is missing, and a package with no commit, command or data hash cannot be rerun at all.
 */
export function validateEvidence(pkg: EvidencePackage, contract: Contract): void {
  if (!pkg.branch.trim()) throw new Error('the evidence names no branch')
  if (!pkg.commit.trim()) throw new Error('the evidence names no commit')
  if (!pkg.command.trim()) throw new Error('the evidence names no command')
  if (!pkg.image.trim()) throw new Error('the evidence names no image')
  if (!pkg.machineType.trim()) throw new Error('the evidence names no machine type')
  if (!pkg.dataHash.trim()) throw new Error('the evidence names no data hash')
  if (!pkg.reproduce.trim()) throw new Error('the evidence needs a reproduce command')
  for (const criterion of contract.criteria) {
    const value = pkg.metrics[criterion.id]
    if (value === undefined || !value.trim()) throw new Error(`the evidence reports no value for criterion ${criterion.id}`)
  }
}