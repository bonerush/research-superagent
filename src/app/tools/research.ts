/** Main Session tools for the proposal loop: what the scout hands in, what the critic settles, and the two acts only a person performs. */
import { z } from 'zod'
import type { Contract } from '../../research/model.ts'
import { critique, presentable, saveBatch } from '../../research/batch.ts'
import { pick } from '../../research/pick.ts'
import type { Batch, Candidate } from '../../research/proposal.ts'
import { sign } from '../../research/sign.ts'
import type { ResearchRepo } from '../store-research.ts'
import type { Tool } from './tool.ts'

/** Identity helper: keeps each tool's schema type without importing the host tool module, which would close an import cycle. */
const make = <S extends z.ZodType>(definition: Tool<S>): Tool<S> => definition

const now = (): string => new Date().toISOString()

const PriorSchema = z.object({
  work: z.string().min(1).describe('The earlier work, findable: title, venue and year.'),
  delta: z.string().min(1).describe('What this proposal does that the work does not.'),
})

const FeasibilitySchema = z.object({
  data: z.string().describe('Which data, and where it comes from.'),
  hardware: z.string().describe('Which machine, such as one 4090.'),
  days: z.number().positive(),
  yuan: z.number().nonnegative().describe('Estimated cost in yuan.'),
})

const CandidateSchema = z.object({
  id: z.string().min(3).describe('Shaped P-<batch>-<n>, unique inside the batch.'),
  question: z.string().min(1),
  precision: z.enum(['direction', 'topic', 'hypothesis']),
  prediction: z.string().optional().describe('Required for a hypothesis: what the experiment should show.'),
  test: z.string().optional().describe('Required for a hypothesis: what result would falsify it.'),
  why: z.string().min(1).describe('Why this is worth doing now.'),
  priors: z.array(PriorSchema).min(1).describe('At least three: the nearest works and the delta against each.'),
  feasibility: FeasibilitySchema,
  protocolDraft: z.string().min(1),
  risk: z.string().min(1).describe('Where this is most likely to fail.'),
})

const ReviewSchema = z.object({
  candidateId: z.string().min(1),
  verdict: z.enum(['keep', 'drop']),
  reason: z.string().min(1),
})

const CriterionSchema = z.object({ id: z.string().min(1), statement: z.string().min(1), tolerance: z.string().optional() })

/** The five tools, bound to the research store they write. */
export function researchTools(repo: ResearchRepo): Tool[] {
  const propose = make({
    name: 'research_propose',
    description: 'Hand in one batch of candidate directions for a direction the person gave. Every candidate needs at least three prior works with a delta each; a hypothesis needs a prediction and a falsifier.',
    schema: z.object({ id: z.string().min(1), direction: z.string().min(1), candidates: z.array(CandidateSchema).min(1).max(5) }),
    execute: async (args) => {
      const raw: Batch = { id: args.id, direction: args.direction, candidates: args.candidates as Candidate[], critiques: [],
        rejections: [], createdAt: now(), status: 'draft' }
      const batch = saveBatch(raw, now())
      repo.saveProposalBatch(batch)
      return { batch_id: batch.id, status: batch.status, candidates: batch.candidates.length }
    },
  })

  const review = make({
    name: 'research_critique',
    description: 'Record the critic verdict on every candidate of a batch. The batch reaches a person only after every candidate is judged and at least one survives.',
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
    description: 'Record which candidate the person chose. Only call this after the person said which one, in their own words: an agent may not choose for them.',
    schema: z.object({ batchId: z.string().min(1), candidateId: z.string().min(1), by: z.string().min(1).describe('The person who chose.') }),
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
    description: 'Sign and freeze the acceptance contract. Only call this after the person approved it: a signed contract cannot be changed, and every attempt is judged against it.',
    schema: z.object({
      version: z.number().int().positive(),
      goal: z.string().min(1),
      requirement: z.string().min(1).describe('The property the person demanded, in their words.'),
      criteria: z.array(CriterionSchema).min(1),
      budgetCapYuan: z.number().nonnegative(),
      stopCondition: z.string().min(1),
      by: z.string().min(1),
    }),
    execute: async (args) => {
      const contract: Contract = { version: args.version, goal: args.goal, requirement: args.requirement,
        criteria: args.criteria, budgetCapYuan: args.budgetCapYuan, stopCondition: args.stopCondition, signedBy: '' }
      const result = sign(repo, contract, args.by, now())
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