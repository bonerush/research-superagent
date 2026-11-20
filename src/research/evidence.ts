/** What a finished run leaves behind: enough for a person, or a rerun, to judge it without asking the agent. */
import type { Contract } from './model.ts'

/** Where the data came from, pinned so a rerun cannot quietly use something else. */
export interface DataSnapshot {
  kind: 'hash' | 'path' | 'copy'
  value: string
}

/** The package a concluded attempt hands to the convergence step. */
export interface EvidencePackage {
  attemptId: string
  branch: string
  commit: string
  image: string
  machineType: string
  dataSnapshot: DataSnapshot
  command: string
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
 * and a package with no commit, command or data snapshot cannot be rerun at all.
 */
export function validateEvidence(pkg: EvidencePackage, contract: Contract): void {
  if (!pkg.commit.trim()) throw new Error('the evidence names no commit')
  if (!pkg.command.trim()) throw new Error('the evidence names no command')
  if (!pkg.dataSnapshot.value.trim()) throw new Error('the evidence names no data snapshot')
  if (!pkg.reproduce.trim()) throw new Error('the evidence needs a reproduce command')
  for (const criterion of contract.criteria) {
    if (!(criterion.id in pkg.metrics)) throw new Error(`the evidence reports no value for criterion ${criterion.id}`)
  }
}