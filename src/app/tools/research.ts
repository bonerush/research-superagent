/** Main Session tools for the proposal loop: what the scout hands in, what the critic settles, and the two acts only a person performs. */
import { z } from 'zod'
import { critique, presentable, saveBatch } from '../../research/batch.ts'
import { draftContract } from '../../research/draft.ts'
import { pick } from '../../research/pick.ts'
import type { Batch, Candidate } from '../../research/proposal.ts'
import { sign } from '../../research/sign.ts'
import type { ResearchRepo } from '../store-research.ts'
import type { Tool } from './tool.ts'

const now = (): string => new Date().toISOString()

/** Identity helper: keeps each tool schema type without importing the host tool module, which would close an import cycle. */
const make = <S extends z.ZodType>(definition: Tool<S>): Tool<S> => definition

const PriorSchema = z.object({ work: z.string().min(1), delta: z.string().min(1) })
const FeasibilitySchema = z.object({ data: z.string(), hardware: z.string(), days: z.number().positive(), yuan: z.number().nonnegative() })
const CandidateSchema = z.object({
  id: z.string().min(3),
  question: z.string().min(1),
  precision: z.enum(['direction', 'topic', 'hypothesis']),
  prediction: z.string().optional(),
  test: z.string().optional(),
  why: z.string().min(1),
  priors: z.array(PriorSchema).min(1),
  feasibility: FeasibilitySchema,
  protocolDraft: z.string().min(1),
  risk: z.string().min(1),
})
const ReviewSchema = z.object({ candidateId: z.string().min(1), verdict: z.enum(['keep', 'drop']), reason: z.string().min(1) })

/** The five tools, bound to the research store they write. */
export function researchTools(repo: ResearchRepo): Tool[] {
  const propose = make({
    name: 'research_propose',
    description: 'Hand in one batch of two to five candidate directions for the direction the person gave. A new batch id only.',
    schema: z.object({ id: z.string().min(1), direction: z.string().min(1), candidates: z.array(CandidateSchema).min(2).max(5) }),
    execute: async (args) => {
      const raw: Batch = { id: args.id, direction: args.direction, candidates: args.candidates as Candidate[], critiques: [], rejections: [], createdAt: now(), status: 'draft' }
      const batch = saveBatch(raw, now())
      repo.createProposalBatch(batch)
      return { batch_id: batch.id, status: batch.status, candidates: batch.candidates.length }
    },
  })

  const review = make({
    name: 'research_critique',
    description: 'Record the critic verdict on every candidate. The batch reaches a person only after every candidate is judged and one survives.',
    schema: z.object({ batchId: z.string().min(1), reviews: z.array(ReviewSchema).min(1) }),
    execute: async (args) => {
      const batch = repo.getProposalBatch(args.batchId)
      if (!batch) throw new Error(`unknown batch ${args.batchId}`)
      const settled = critique(batch, args.reviews)
      repo.saveProposalBatch(settled)
      return { status: settled.status, presentable: presentable(settled) }
    },
  })

  const choose = make({
    name: 'research_pick',
    description: 'Record which candidate the person chose. Only after the person said which one; an agent may not choose for them.',
    schema: z.object({ batchId: z.string().min(1), candidateId: z.string().min(1), by: z.string().min(1) }),
    execute: async (args) => {
      const batch = repo.getProposalBatch(args.batchId)
      if (!batch) throw new Error(`unknown batch ${args.batchId}`)
      const result = pick(batch, args.candidateId, args.by, now())
      repo.saveProposalBatch(result.batch)
      repo.recordDecision(result.decision)
      return { picked: args.candidateId, rejected: result.batch.rejections.length }
    },
  })

  const signIt = make({
    name: 'research_sign',
    description: 'Sign and freeze the contract of the candidate the person picked. Criteria and budget come from that candidate, not from this call. Only after the person approved it.',
    schema: z.object({
      batchId: z.string().min(1),
      candidateId: z.string().min(1),
      requirement: z.string().min(1),
      version: z.number().int().positive(),
      by: z.string().min(1),
    }),
    execute: async (args) => {
      const batch = repo.getProposalBatch(args.batchId)
      if (!batch) throw new Error(`unknown batch ${args.batchId}`)
      if (batch.pickedCandidateId !== args.candidateId) throw new Error(`batch ${batch.id} picked ${String(batch.pickedCandidateId)}`)
      const candidate = batch.candidates.find(entry => entry.id === args.candidateId)
      if (!candidate) throw new Error(`unknown candidate ${args.candidateId}`)
      const contract = draftContract(candidate, args.requirement, args.version)
      const result = sign(repo, contract, args.by, now())
      repo.saveProposalBatch({ ...batch, contractVersion: result.frozen.version })
      return { version: result.frozen.version, hash: result.frozen.hash }
    },
  })

  const status = make({
    name: 'research_status',
    description: 'Read one batch, or every batch, with its critiques and rejections.',
    schema: z.object({ batchId: z.string().optional() }),
    execute: async (args) => args.batchId
      ? { batch: repo.getProposalBatch(args.batchId) ?? null }
      : { batches: repo.listProposalBatches().map(batch => ({ id: batch.id, status: batch.status, candidates: batch.candidates.length })) },
  })

  return [propose, review, choose, signIt, status]
}