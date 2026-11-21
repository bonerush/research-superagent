/** One main Session tool for the whole research loop: propose, critique, pick, sign, run the attempt, then converge it. */
import { z } from 'zod'
import { conclude, openAttempt, startAttempt, waitAttempt } from '../../research/attempt.ts'
import { critique, presentable, saveBatch } from '../../research/batch.ts'
import { appendAgenda, readAgenda } from '../agenda-file.ts'
import { accept, kill } from '../../research/decide.ts'
import { draftContract } from '../../research/draft.ts'
import type { AgendaEntry } from '../../research/agenda.ts'
import type { EvidencePackage } from '../../research/evidence.ts'
import { pick } from '../../research/pick.ts'
import type { Batch, Candidate } from '../../research/proposal.ts'
import { draftReport } from '../../research/report.ts'
import { checkReproduction, settle, type Reproducibility } from '../../research/reproduction.ts'
import { sign } from '../../research/sign.ts'
import type { MachinePort } from '../machine-port.ts'
import type { Notifier } from '../notifier.ts'
import type { ResearchRepo } from '../store-research.ts'
import type { Tool } from './tool.ts'

const now = (): string => new Date().toISOString()

/** Identity helper: keeps the schema type without importing the host tool module, which would close an import cycle. */
const make = <S extends z.ZodType>(definition: Tool<S>): Tool<S> => definition

const PriorSchema = z.object({ work: z.string().min(1), delta: z.string().min(1) })
const FeasibilitySchema = z.object({ data: z.string(), hardware: z.string(), days: z.number().positive(), yuan: z.number().nonnegative() })
const CandidateSchema = z.object({
  id: z.string().min(3), question: z.string().min(1),
  precision: z.enum(['direction', 'topic', 'hypothesis']), prediction: z.string().optional(), test: z.string().optional(),
  why: z.string().min(1), priors: z.array(PriorSchema).min(1), feasibility: FeasibilitySchema,
  protocolDraft: z.string().min(1), risk: z.string().min(1),
})
const ReviewSchema = z.object({ candidateId: z.string().min(1), verdict: z.enum(['keep', 'drop']), reason: z.string().min(1) })
const MeasurementSchema = z.object({ criterionId: z.string().min(1), from: z.string().min(1) })
const VerificationSchema = z.object({ commit: z.string().min(1), dataHash: z.string().min(1), command: z.string().min(1), metrics: z.record(z.string(), z.string()) })

const Action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('propose'), id: z.string().min(1), direction: z.string().min(1), candidates: z.array(CandidateSchema).min(2).max(5) }),
  z.object({ action: z.literal('critique'), batchId: z.string().min(1), reviews: z.array(ReviewSchema).min(1) }),
  z.object({ action: z.literal('pick'), batchId: z.string().min(1), candidateId: z.string().min(1), by: z.string().min(1) }),
  z.object({ action: z.literal('sign'), batchId: z.string().min(1), candidateId: z.string().min(1), requirement: z.string().min(1), version: z.number().int().positive(), by: z.string().min(1) }),
  z.object({ action: z.literal('protocol'), attemptId: z.string().min(1), questionId: z.string().min(1), contractVersion: z.number().int().positive(), commands: z.array(z.string().min(1)).min(1), measurements: z.array(MeasurementSchema).min(1), expected: z.string().min(1), stopCondition: z.string().min(1), machineHours: z.number().positive() }),
  z.object({ action: z.literal('attempt'), op: z.enum(['open', 'start', 'wait', 'conclude']), attemptId: z.string().min(1), slug: z.string().optional(), branch: z.string().optional(), protocolPath: z.string().optional(), verdict: z.enum(['supported', 'refuted', 'inconclusive']).optional(), evidence: z.array(z.string()).optional() }),
  z.object({ action: z.literal('run'), id: z.string().min(1), attemptId: z.string().min(1), kind: z.enum(['experiment', 'verification']).optional(), machine: z.string().min(1), image: z.string().min(1), commit: z.string().min(1), command: z.string().min(1), startedAt: z.string().min(1), params: z.record(z.string(), z.string()).optional(), endedAt: z.string().optional(), costYuan: z.number().nonnegative().optional(), artifacts: z.array(z.string()).optional() }),
  z.object({ action: z.literal('evidence'), attemptId: z.string().min(1), branch: z.string().min(1), commit: z.string().min(1), image: z.string().min(1), machineType: z.string().min(1), dataHash: z.string().min(1), command: z.string().min(1), metrics: z.record(z.string(), z.string()), reproduce: z.string().min(1), envFile: z.string().optional(), logs: z.array(z.string()).optional(), artifacts: z.array(z.string()).optional(), verification: VerificationSchema }),
  z.object({ action: z.literal('decide'), op: z.enum(['accept', 'kill']), attemptId: z.string().optional(), targetId: z.string().optional(), note: z.string().optional(), objection: z.string().optional(), by: z.string().min(1) }),
  z.object({ action: z.literal('machine'), op: z.enum(['status', 'on', 'off', 'balance']) }),
  z.object({ action: z.literal('agenda') }),
  z.object({ action: z.literal('status'), batchId: z.string().optional() }),
])

/** What the tool writes to: the research store, and the machine when one is configured. */
export interface ResearchToolDeps {
  repo: ResearchRepo
  machine?: MachinePort
  /** The agenda file; when set, an accepted or killed decision is written there as a conclusion. */
  agendaPath?: string
  /** Where a waiting decision is announced outside the panel; absent means the panel is the only surface. */
  notify?: Notifier
}

/** The one research tool: the loop from a batch to an accepted report. */
export function researchTool(deps: ResearchToolDeps): Tool {
  const { repo, agendaPath, notify } = deps
  return make({
    name: 'research',
    description: 'The research ledger: propose, critique, pick and sign build the contract; protocol, attempt and run execute it; evidence, decide and machine converge it; status reads. pick, sign and decide record what the person decided and may only be called after they said it.',
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
        const ready = presentable(settled)
        if (ready && notify) await notify.notify(`batch ${settled.id} has ${settled.candidates.length} candidates waiting for a pick`)
        return { status: settled.status, presentable: ready }
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
        const result = sign(repo, draftContract(candidate, args.requirement, args.version), args.by, now())
        repo.saveProposalBatch({ ...batch, contractVersion: result.frozen.version })
        return { version: result.frozen.version, hash: result.frozen.hash }
      }
      if (args.action === 'protocol') {
        repo.saveProtocol({ ...args, registeredAt: now() })
        return { registered: args.attemptId }
      }
      if (args.action === 'attempt') {
        if (args.op === 'open') {
          const protocol = repo.getProtocol(args.attemptId)
          if (!protocol) throw new Error(`attempt ${args.attemptId} has no protocol`)
          if (!args.slug || !args.branch || !args.protocolPath) throw new Error('an attempt needs a slug, a branch and a protocol path')
          repo.saveAttempt(openAttempt(protocol, { slug: args.slug, branch: args.branch, protocolPath: args.protocolPath }))
          return { opened: args.attemptId }
        }
        const attempt = repo.getAttempt(args.attemptId)
        if (!attempt) throw new Error(`unknown attempt ${args.attemptId}`)
        if (args.op === 'start') { repo.saveAttempt(startAttempt(attempt)); return { status: 'running' } }
        if (args.op === 'wait') { repo.saveAttempt(waitAttempt(attempt)); return { status: 'waiting' } }
        if (!args.verdict) throw new Error('a conclusion needs a verdict')
        for (const id of args.evidence ?? []) {
          const run = repo.getRun(id)
          if (!run || run.attemptId !== args.attemptId) throw new Error(`run ${id} is not part of attempt ${args.attemptId}`)
        }
        const done = conclude(attempt, args.verdict, args.evidence ?? [])
        repo.saveAttempt(done)
        return { status: done.status, verdict: done.verdict }
      }
      if (args.action === 'run') {
        repo.addRun({ id: args.id, attemptId: args.attemptId, kind: args.kind ?? 'experiment', machine: args.machine, image: args.image,
          commit: args.commit, command: args.command, params: args.params ?? {}, startedAt: args.startedAt,
          ...(args.endedAt ? { endedAt: args.endedAt } : {}), ...(args.costYuan != null ? { costYuan: args.costYuan } : {}),
          artifacts: args.artifacts ?? [] })
        return { run: args.id, cost: repo.costOfAttempt(args.attemptId) }
      }
      if (args.action === 'evidence') {
        const attempt = repo.getAttempt(args.attemptId)
        if (!attempt) throw new Error(`unknown attempt ${args.attemptId}`)
        if (attempt.status !== 'concluded') throw new Error(`attempt ${args.attemptId} is not concluded`)
        const contract = repo.getContract(attempt.contractVersion)
        if (!contract) throw new Error(`attempt ${args.attemptId} has no signed contract`)
        const pkg: EvidencePackage = {
          attemptId: args.attemptId, branch: args.branch, commit: args.commit, image: args.image,
          machineType: args.machineType, dataHash: args.dataHash, command: args.command,
          ...(args.envFile ? { envFile: args.envFile } : {}),
          logs: args.logs ?? [], artifacts: args.artifacts ?? [], metrics: args.metrics, reproduce: args.reproduce,
        }
        const outcome = checkReproduction(pkg, args.verification, contract)
        repo.saveEvidence(pkg, outcome)
        const settled = settle(attempt, outcome)
        if (settled.verdict !== attempt.verdict) repo.downgradeToInconclusive(attempt.id)
        const runs = repo.runsOf(attempt.id)
        const verificationYuan = runs.filter(run => run.kind === 'verification').reduce((total, run) => total + (run.costYuan ?? 0), 0)
        const text = draftReport({ attempt: settled, contract, evidence: pkg, outcome, costYuan: repo.costOfAttempt(attempt.id),
          ...(verificationYuan ? { verificationYuan } : {}) })
        repo.saveReport(attempt.id, text)
        if (notify) await notify.notify(`attempt ${attempt.id} concluded ${String(settled.verdict)}; a rerun was ${outcome}; the report is ready`)
        return { verdict: settled.verdict, outcome, report: text }
      }
      if (args.action === 'decide') {
        if (args.op === 'accept') {
          if (!args.attemptId) throw new Error('accept needs an attempt')
          const attempt = repo.getAttempt(args.attemptId)
          if (!attempt) throw new Error(`unknown attempt ${args.attemptId}`)
          const evidence = repo.getEvidence(args.attemptId)
          if (!evidence) throw new Error(`attempt ${args.attemptId} has no evidence`)
          if (!repo.getReport(args.attemptId)) throw new Error(`attempt ${args.attemptId} has no report`)
          const contract = repo.getContract(attempt.contractVersion)
          if (!contract) throw new Error(`attempt ${args.attemptId} has no signed contract`)
          repo.recordDecision(accept(attempt, evidence.outcome as Reproducibility, args.by, now()))
          const written = agendaPath !== undefined && appendAgenda(agendaPath, {
            id: attempt.id,
            question: contract.goal,
            precision: 'topic',
            status: 'answered',
            conclusion: `${String(attempt.verdict)} after a reproduced rerun: ${contract.requirement}` ,
            evidence: repo.runsOf(attempt.id).map(run => run.id),
            decidedBy: args.by,
            at: now(),
          })
          return { accepted: args.attemptId, agenda_written: written }
        }
        if (!args.targetId) throw new Error('kill needs a target')
        const question = repo.getQuestion(args.targetId)
        if (!question) throw new Error(`unknown question ${args.targetId}`)
        const decision = kill(args.targetId, args.note ?? '', args.objection ?? '', args.by, now())
        repo.recordDecision(decision)
        const written = agendaPath !== undefined && appendAgenda(agendaPath, {
          id: args.targetId,
          question: question.statement,
          precision: question.precision,
          status: 'abandoned',
          conclusion: String(decision.note ?? ''),
          evidence: [],
          decidedBy: args.by,
          at: now(),
        })
        return { killed: args.targetId, agenda_written: written }
      }
      if (args.action === 'machine') {
        const port = deps.machine
        if (!port) throw new Error('no machine is configured: set RESEARCH_MACHINE_TOKEN and its four endpoints')
        if (args.op === 'status') return { status: await port.status() }
        if (args.op === 'balance') return { balance: await port.balanceYuan() }
        if (args.op === 'on') { await port.powerOn(); repo.setMachineBootedAt(now()); return { powered: 'on' } }
        await port.powerOff()
        repo.clearMachineBootedAt(now())
        return { powered: 'off' }
      }
      if (args.action === 'agenda') return { entries: agendaPath ? readAgenda(agendaPath) : [] }
      return args.batchId
        ? { batch: repo.getProposalBatch(args.batchId) ?? null }
        : { batches: repo.listProposalBatches().map(batch => ({ id: batch.id, status: batch.status, candidates: batch.candidates.length })) }
    },
  })
}