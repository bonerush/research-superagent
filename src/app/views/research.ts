/** What the research loop wants a person for: a contract to sign, a batch to pick, an attempt to judge, a report to read. */
import { presentable } from '../../research/batch.ts'
import type { ResearchRepo } from '../store-research.ts'

/** One line per thing that waits for a person. */
export interface ResearchOverview {
  contracts: { batchId: string; candidateId: string; direction: string }[]
  batches: { id: string; direction: string; candidates: number }[]
  attempts: { id: string; verdict: string; costYuan: number }[]
  reports: { attemptId: string; title: string }[]
}

const firstLine = (text: string): string => text.split(String.fromCharCode(10))[0] ?? text

/**
 * Reads the research store once and answers the only question the panel asks: what needs a person now.
 * Four answers and their exclusions: a picked batch without a signed contract still waits for a signature; a batch the
 * critic rejected outright never reaches a person; a batch already picked is no longer a choice; an attempt already
 * accepted, or whose question a person killed, is no longer a decision.
 */
export function researchOverview(repo: ResearchRepo): ResearchOverview {
  const contracts = repo.listProposalBatches('picked')
    .filter(batch => batch.contractVersion === undefined)
    .flatMap(batch => batch.pickedCandidateId
      ? [{ batchId: batch.id, candidateId: batch.pickedCandidateId, direction: batch.direction }]
      : [])
  const batches = repo.listProposalBatches('reviewed')
    .filter(presentable)
    .map(batch => ({ id: batch.id, direction: batch.direction, candidates: batch.candidates.length }))
  const attempts = repo.listAttempts('concluded')
    .filter(attempt => {
      if (repo.decisionsFor(attempt.id).some(decision => decision.kind === 'accept_result')) return false
      return !repo.decisionsFor(attempt.questionId).some(decision => decision.kind === 'kill_direction')
    })
    .map(attempt => ({
      id: attempt.id,
      verdict: String(attempt.verdict),
      costYuan: repo.costOfAttempt(attempt.id),
    }))
  const reports = repo.listAttempts()
    .flatMap(attempt => {
      const text = repo.getReport(attempt.id)
      return text ? [{ attemptId: attempt.id, title: firstLine(text) }] : []
    })
  return { contracts, batches, attempts, reports }
}