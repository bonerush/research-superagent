/** The actions a person takes on the research loop, shared by the Session tool and the panel routes. */
import { accept, kill } from '../research/decide.ts'
import { draftContract } from '../research/draft.ts'
import { pick } from '../research/pick.ts'
import { sign } from '../research/sign.ts'
import type { Decision } from '../research/model.ts'
import { appendAgenda } from './agenda-file.ts'
import type { ResearchRepo } from './store-research.ts'

/** Who decided, and when. Both come from the caller: the domain refuses a decision without them. */
export interface Acted {
  by: string
  at: string
}

/** Picks one candidate and records the judgement; the other candidates are kept with their reasons. */
export function pickCandidate(repo: ResearchRepo, input: { batchId: string; candidateId: string } & Acted): { picked: string; rejected: number } {
  const batch = repo.getProposalBatch(input.batchId)
  if (!batch) throw new Error(`unknown batch ${input.batchId}`)
  const result = pick(batch, input.candidateId, input.by, input.at)
  repo.saveProposalBatch(result.batch)
  repo.recordDecision(result.decision)
  return { picked: input.candidateId, rejected: result.batch.rejections.length }
}

/** Signs the picked candidate into a frozen contract: from here the criteria cannot move. */
export function signBatch(repo: ResearchRepo, input: { batchId: string; candidateId: string; requirement: string; version: number } & Acted): { version: number; hash: string } {
  const batch = repo.getProposalBatch(input.batchId)
  if (!batch) throw new Error(`unknown batch ${input.batchId}`)
  if (batch.pickedCandidateId !== input.candidateId) throw new Error(`batch ${batch.id} picked ${String(batch.pickedCandidateId)}`)
  const candidate = batch.candidates.find(entry => entry.id === input.candidateId)
  if (!candidate) throw new Error(`unknown candidate ${input.candidateId}`)
  const result = sign(repo, draftContract(candidate, input.requirement, input.version), input.by, input.at)
  repo.saveProposalBatch({ ...batch, contractVersion: result.frozen.version })
  return { version: result.frozen.version, hash: result.frozen.hash }
}

/** Accepts a result: concluded, supported and reproduced, with its report and evidence already stored. */
export function acceptAttempt(repo: ResearchRepo, input: { attemptId: string; agendaPath?: string } & Acted): { decision: Decision; agenda: boolean } {
  const attempt = repo.getAttempt(input.attemptId)
  if (!attempt) throw new Error(`unknown attempt ${input.attemptId}`)
  const evidence = repo.getEvidence(input.attemptId)
  if (!evidence) throw new Error(`attempt ${input.attemptId} has no evidence`)
  if (!repo.getReport(input.attemptId)) throw new Error(`attempt ${input.attemptId} has no report`)
  const contract = repo.getContract(attempt.contractVersion)
  if (!contract) throw new Error(`attempt ${input.attemptId} has no signed contract`)
  const decision = accept(attempt, evidence.outcome, input.by, input.at)
  // The agenda entry is written first: a conclusion the file refuses must stop before the ledger records the decision.
  const agenda = input.agendaPath !== undefined && appendAgenda(input.agendaPath, {
    id: attempt.id,
    question: contract.goal,
    precision: 'topic',
    status: 'answered',
    conclusion: `${String(attempt.verdict)} after a reproduced rerun: ${contract.requirement}`,
    evidence: repo.runsOf(attempt.id).map(run => run.id),
    decidedBy: input.by,
    at: input.at,
  })
  repo.recordDecision(decision)
  return { decision, agenda }
}

/** Ends a direction: the reason and the critic objection are both required, and both go into the agenda. */
export function killDirection(repo: ResearchRepo, input: { targetId: string; note: string; objection: string; agendaPath?: string } & Acted): { decision: Decision; agenda: boolean } {
  const question = repo.getQuestion(input.targetId)
  if (!question) throw new Error(`unknown question ${input.targetId}`)
  const decision = kill(input.targetId, input.note, input.objection, input.by, input.at)
  // Same order as acceptance: the file must accept the conclusion before the ledger does.
  const agenda = input.agendaPath !== undefined && appendAgenda(input.agendaPath, {
    id: input.targetId,
    question: question.statement,
    precision: question.precision,
    status: 'abandoned',
    conclusion: String(decision.note ?? ''),
    evidence: [],
    decidedBy: input.by,
    at: input.at,
  })
  repo.recordDecision(decision)
  return { decision, agenda }
}