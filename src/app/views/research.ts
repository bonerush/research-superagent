/** What the research loop wants a person for: a batch to pick, an attempt to judge, a report to read. */
import type { ResearchRepo } from '../store-research.ts'

/** One line per thing that waits for a person. */
export interface ResearchOverview {
  batches: { id: string; direction: string; candidates: number }[]
  attempts: { id: string; verdict: string; costYuan: number }[]
  reports: { attemptId: string; title: string }[]
}

const firstLine = (text: string): string => text.split(String.fromCharCode(10))[0] ?? text

/**
 * Reads the research store once and answers the only question the panel asks: what needs a person now.
 * A batch already picked is not a choice, and an attempt already accepted or killed is not a decision,
 * so both are left out rather than listed again.
 */
export function researchOverview(repo: ResearchRepo): ResearchOverview {
  const batches = repo.listProposalBatches('reviewed').map(batch => ({
    id: batch.id,
    direction: batch.direction,
    candidates: batch.candidates.length,
  }))
  const attempts = repo.listAttempts('concluded')
    .filter(attempt => !repo.decisionsFor(attempt.id).some(decision =>
      decision.kind === 'accept_result' || decision.kind === 'kill_direction'))
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
  return { batches, attempts, reports }
}