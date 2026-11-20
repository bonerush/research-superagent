/** Proposal candidates and their batch: what the scout agent brings, and what the critic must judge before a person sees it. */
import type { Precision } from './model.ts'

/** One earlier work the proposal must beat, and how it differs from it. */
export interface Prior {
  /** The earlier work, named well enough to find: title, venue and year. */
  work: string
  /** What this proposal does that the work does not. */
  delta: string
}

/** What it would take to try: data, hardware, days and money. */
export interface Feasibility {
  data: string
  hardware: string
  days: number
  yuan: number
}

/** One candidate direction, at one precision. */
export interface Candidate {
  id: string
  question: string
  precision: Precision
  prediction?: string
  test?: string
  /** Why this is worth doing now. */
  why: string
  priors: Prior[]
  feasibility: Feasibility
  /** The experiment protocol in draft: enough for the critic to judge, not yet the signed protocol. */
  protocolDraft: string
  /** Where it is most likely to fail. */
  risk: string
}

/** The critic judgement on one candidate. */
export interface Critique {
  candidateId: string
  verdict: 'keep' | 'drop'
  reason: string
}

/** Where a batch sits: written, judged, or chosen from. */
export type BatchStatus = 'draft' | 'reviewed' | 'picked'

/** A candidate a person passed over, with the reason, kept as a taste signal. */
export interface Rejection {
  candidateId: string
  reason: string
}

/** One round of candidates for one direction. */
export interface Batch {
  id: string
  direction: string
  candidates: Candidate[]
  critiques: Critique[]
  rejections: Rejection[]
  /** Set once a person chose; the only candidate a contract may be drafted from. */
  pickedCandidateId?: string
  contractVersion?: number
  createdAt: string
  status: BatchStatus
}

const CANDIDATE_ID = /^P-[0-9]+-[0-9]+$/u

/**
 * Refuses a candidate a person could not judge: no delta against the nearest work, or a hypothesis with nothing that could refute it.
 * A candidate without a falsifier is an opinion, and the contract would inherit that.
 */
export function validateCandidate(candidate: Candidate): void {
  if (candidate.priors.length < 3) throw new Error('a candidate needs at least three prior works')
  for (const prior of candidate.priors) {
    if (!prior.work.trim() || !prior.delta.trim()) throw new Error('every prior needs a delta')
  }
  if (candidate.precision === 'hypothesis' && (!candidate.prediction?.trim() || !candidate.test?.trim())) {
    throw new Error('hypothesis requires a prediction and a test')
  }
}

/** Refuses a batch too small to be a choice, too large to judge, or carrying a duplicate id. */
export function validateBatch(batch: Batch): void {
  if (batch.candidates.length < 2) throw new Error('a batch needs at least two candidates to be a choice')
  if (batch.candidates.length > 5) throw new Error('a batch holds at most five candidates')
  const seen = new Set<string>()
  for (const candidate of batch.candidates) {
    if (seen.has(candidate.id)) throw new Error(`duplicate candidate id ${candidate.id}`)
    if (!CANDIDATE_ID.test(candidate.id)) throw new Error(`candidate id ${candidate.id} must look like P-<batch>-<n>`)
    seen.add(candidate.id)
    validateCandidate(candidate)
  }
}