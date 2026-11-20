/** One main Session tool for the whole research loop: the scout hands in, the critic settles, the person picks and signs, and the machine is asked for its state. */
import { z } from 'zod'
import { critique, presentable, saveBatch } from '../../research/batch.ts'
import { draftContract } from '../../research/draft.ts'
import { pick } from '../../research/pick.ts'
import type { Batch, Candidate } from '../../research/proposal.ts'
import { sign } from '../../research/sign.ts'
import type { ResearchRepo } from '../store-research.ts'
import type { Tool } from './tool.ts'

const now = (): string => new Date().toISOString()

/** Identity helper: keeps the schema type without importing the host tool module, which would close an import cycle. */
const make = <S extends z.ZodType>(definition: Tool<S>): Tool<S> => definition

const PriorSchema = z.object({ work: z.string().min(1), delta: z.string().min(1) })
const FeasibilitySchema = z.object({ data: z.string(), hardware: z.string(), days: z.number().positive(), yuan: z.number().nonnegative() })
const CandidateSchema = z.object({
  id: z.string().min(3), question: z.string().min(1),
  precision: z.enum(['direction', 'topic', 'hypothesis']),
  prediction: z.string().optional(), test: z.string().optional(),
  why: z.string().min(1), priors: z.array(PriorSchema).min(1),
  feasibility: FeasibilitySchema, protocolDraft: z.string().min(1), risk: z.string().min(1),
})
const ReviewSchema = z.object({ candidateId: z.string().min(1), verdict: z.enum(['keep', 'drop']), reason: z.string().min(1) })

const Action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('propose'), id: z.string().min(1), direction: z.string().min(1), candidates: z.array(CandidateSchema).min(2).max(5) }),
  z.object({ action: z.literal('critique'), batchId: z.string().min(1), reviews: z.array(ReviewSchema).min(1) }),
  z.object({ action: z.literal('pick'), batchId: z.string().min(1), candidateId: z.string().min(1), by: z.string().min(1) }),
  z.object({ action: z.literal('sign'), batchId: z.string().min(1), candidateId: z.string().min(1), requirement: z.string().min(1), version: z.number().int().positive(), by: z.string().min(1) }),
  z.object({ action: z.literal('status'), batchId: z.string().optional() }),
])

/** The one research tool. Propose, critique, pick and sign, plus a read. */
export function researchTool(repo: ResearchRepo): Tool {
  return make({
    name: 'research',
    description: 'The research ledger. propose hands in a batch of two to five candidates; critique records the critic verdicts; pick and sign record what the person decided, only after they said it; status reads.',
    schema: Action,
    execute: async (args) => {
      if (args.action === 'propose') {
        const raw: Batch = { id: args.id, direction: args.direction, candidates: args.candidates as Candidate[], critiques: [], rejections: [], createdAt: now(), status: 'draft' }
        const batch = saveBatch(raw, now())
        repo.createProposalBatch(batch)
        return { batch_id: batch.id, status: batch.status, candidates: batch.candidates.length }
      }
      if (args.action === 'critique') {
        const batch = repo.getProposalBatch(args.batchId)
        if (!batch) throw new Error(`unknown batch ${args.batchId}`)
        const settled = critique(batch, args.reviews)
        repo.saveProposalBatch(settled)
        return { status: settled.status, presentable: presentable(settled) }
      }
      if (args.action === 'pick') {
        const batch = repo.getProposalBatch(args.batchId)
        if (!batch) throw new Error(`unknown batch ${args.batchId}`)
        const result = pick(batch, args.candidateId, args.by, now())
        repo.saveProposalBatch(result.batch)
        repo.recordDecision(result.decision)
        return { picked: args.candidateId, rejected: result.batch.rejections.length }
      }
      if (args.action === 'sign') {
        const batch = repo.getProposalBatch(args.batchId)
        if (!batch) throw new Error(`unknown batch ${args.batchId}`)
        if (batch.pickedCandidateId !== args.candidateId) throw new Error(`batch ${batch.id} picked ${String(batch.pickedCandidateId)}`)
        const candidate = batch.candidates.find(entry => entry.id === args.candidateId)
        if (!candidate) throw new Error(`unknown candidate ${args.candidateId}`)
        const contract = draftContract(candidate, args.requirement, args.version)
        const result = sign(repo, contract, args.by, now())
        repo.saveProposalBatch({ ...batch, contractVersion: result.frozen.version })
        return { version: result.frozen.version, hash: result.frozen.hash }
      }
      return args.batchId
        ? { batch: repo.getProposalBatch(args.batchId) ?? null }
        : { batches: repo.listProposalBatches().map(batch => ({ id: batch.id, status: batch.status, candidates: batch.candidates.length })) }
    },
  })
}