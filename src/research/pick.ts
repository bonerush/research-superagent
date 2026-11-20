/** Picking a candidate: the one act that turns a batch into a direction, and the taste signal of the ones passed over. */
import { presentable, survivors } from './batch.ts'
import { assertIsoTimestamp, type Decision } from './model.ts'
import type { Batch } from './proposal.ts'

/**
 * Records a person picking one candidate. The batch must be reviewed and the candidate must have survived the critic:
 * a dropped candidate is refused rather than quietly resurrected, and a batch already decided cannot be decided again.
 * The others are kept as rejections with the critic reason, which is the only taste signal the next batch can learn from.
 */
export function pick(batch: Batch, candidateId: string, by: string, at: string): { batch: Batch; decision: Decision } {
  if (batch.status !== 'reviewed' || !presentable(batch)) throw new Error('the batch is not ready to be picked from')
  if (!survivors(batch).some(candidate => candidate.id === candidateId)) {
    const reason = batch.critiques.find(entry => entry.candidateId === candidateId)?.reason ?? 'unknown candidate'
    throw new Error(`the critic dropped ${candidateId}: ${reason}`)
  }
  const reasonOf = (id: string): string => batch.critiques.find(entry => entry.candidateId === id)?.reason ?? 'not picked'
  const rejections = batch.candidates
    .filter(candidate => candidate.id !== candidateId)
    .map(candidate => ({ candidateId: candidate.id, reason: reasonOf(candidate.id) }))
  const decision: Decision = {
    id: `pick-${batch.id}-${candidateId}`,
    kind: 'pick_proposal',
    targetId: batch.id,
    actor: 'human',
    by,
    at: assertIsoTimestamp(at),
  }
  return { batch: { ...batch, status: 'picked', pickedCandidateId: candidateId, rejections }, decision }
}