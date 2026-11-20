/** The batch service: what the scout brings, what the critic settles, and what may reach a person. */
import { assertIsoTimestamp } from './model.ts'
import { validateBatch, type Batch, type Candidate, type Critique } from './proposal.ts'

/**
 * A saved batch starts as a draft with no judgements: the store owns nothing the scout claimed about its own work.
 * The creation time is normalized, so two batches order the same way wherever they came from.
 */
export function saveBatch(batch: Batch, now: string): Batch {
  validateBatch(batch)
  return { ...batch, createdAt: assertIsoTimestamp(now), status: 'draft', critiques: [], rejections: [], contractVersion: undefined }
}

/** The candidates no critic dropped. */
export function survivors(batch: Batch): Candidate[] {
  const dropped = new Set(batch.critiques.filter(entry => entry.verdict === 'drop').map(entry => entry.candidateId))
  return batch.candidates.filter(candidate => !dropped.has(candidate.id))
}

/**
 * Whether the batch may be put in front of a person: every candidate judged, and at least one survivor.
 * A half-judged batch, or one the critic killed outright, never reaches the desk.
 */
export function presentable(batch: Batch): boolean {
  if (batch.status === 'draft') return false
  const judged = new Set(batch.critiques.map(entry => entry.candidateId))
  if (!batch.candidates.every(candidate => judged.has(candidate.id))) return false
  return batch.critiques.some(entry => entry.verdict === 'keep')
}

/**
 * Records one round of critique. Unknown candidates, a second verdict on the same candidate, and a verdict with no
 * reason are refused: the critique is the only thing that can kill a candidate, so it has to be accountable.
 */
export function critique(batch: Batch, reviews: Critique[]): Batch {
  const known = new Set(batch.candidates.map(candidate => candidate.id))
  const seen = new Set(batch.critiques.map(entry => entry.candidateId))
  for (const review of reviews) {
    if (!known.has(review.candidateId)) throw new Error(`unknown candidate ${review.candidateId}`)
    if (seen.has(review.candidateId)) throw new Error(`candidate ${review.candidateId} was already reviewed`)
    if (!review.reason.trim()) throw new Error('a critique needs a reason')
    seen.add(review.candidateId)
  }
  const critiques = [...batch.critiques, ...reviews]
  const settled = batch.candidates.every(candidate => critiques.some(entry => entry.candidateId === candidate.id))
  return { ...batch, critiques, status: settled ? 'reviewed' : batch.status }
}