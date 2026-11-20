/** Persistence for the research domain. Its own database, not the ticket store's schema. */
import type { EvidencePackage } from '../research/evidence.ts'
import { validateEvidence } from '../research/evidence.ts'
import type { Reproducibility } from '../research/reproduction.ts'
import type { DatabaseSync } from 'node:sqlite'
import { verifyContract } from '../research/contract.ts'
import { assertNoOverlap } from '../research/ledger.ts'
import { assertIsoTimestamp, validateQuestion, type Attempt, type Decision, type FrozenContract, type Question, type Run } from '../research/model.ts'
import type { Batch } from '../research/proposal.ts'
import { validateProtocol, type Protocol } from '../research/protocol.ts'

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, statement TEXT NOT NULL, precision TEXT NOT NULL, prediction TEXT, test TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS contracts (version INTEGER PRIMARY KEY, json TEXT NOT NULL, hash TEXT NOT NULL, signed_by TEXT NOT NULL, signed_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, slug TEXT NOT NULL, question_id TEXT NOT NULL, contract_version INTEGER NOT NULL, branch TEXT NOT NULL, protocol_path TEXT NOT NULL, agenda_entry_id TEXT, status TEXT NOT NULL, verdict TEXT)',
  'CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, kind TEXT NOT NULL, machine TEXT NOT NULL, image TEXT NOT NULL, git_commit TEXT NOT NULL, command TEXT NOT NULL, params TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, cost_cents INTEGER, log_path TEXT, artifacts TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, target_id TEXT NOT NULL, actor TEXT NOT NULL, by TEXT NOT NULL, at TEXT NOT NULL, note TEXT)',
  'CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS protocols (attempt_id TEXT PRIMARY KEY, json TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS machine (id TEXT PRIMARY KEY, booted_at TEXT, off_at TEXT)',
  'CREATE TABLE IF NOT EXISTS evidence (attempt_id TEXT PRIMARY KEY, json TEXT NOT NULL, outcome TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS reports (attempt_id TEXT PRIMARY KEY, text TEXT NOT NULL)',
]

/** Creates the research tables in an open database. Idempotent: safe on every start. */
export function createResearchSchema(db: DatabaseSync): void {
  for (const statement of SCHEMA) db.exec(statement)
}

const toQuestion = (row: Record<string, unknown>): Question => ({
  id: String(row.id), statement: String(row.statement),
  precision: row.precision as Question['precision'],
  ...(row.prediction == null ? {} : { prediction: String(row.prediction) }),
  ...(row.test == null ? {} : { test: String(row.test) }),
  status: row.status as Question['status'], createdAt: String(row.created_at),
})

const toAttempt = (row: Record<string, unknown>): Attempt => ({
  id: String(row.id), slug: String(row.slug), questionId: String(row.question_id),
  contractVersion: Number(row.contract_version), branch: String(row.branch),
  protocolPath: String(row.protocol_path),
  ...(row.agenda_entry_id == null ? {} : { agendaEntryId: String(row.agenda_entry_id) }),
  status: row.status as Attempt['status'],
  ...(row.verdict == null ? {} : { verdict: row.verdict as Attempt['verdict'] }),
})

const toRun = (row: Record<string, unknown>): Run => ({
  id: String(row.id), attemptId: String(row.attempt_id),
  kind: row.kind as Run['kind'], machine: String(row.machine), image: String(row.image),
  commit: String(row.git_commit), command: String(row.command),
  params: JSON.parse(String(row.params)) as Record<string, string>,
  startedAt: String(row.started_at),
  ...(row.ended_at == null ? {} : { endedAt: String(row.ended_at) }),
  ...(row.cost_cents == null ? {} : { costYuan: Number(row.cost_cents) / 100 }),
  ...(row.log_path == null ? {} : { logPath: String(row.log_path) }),
  artifacts: JSON.parse(String(row.artifacts)) as string[],
})

const DECISION_KINDS = ['sign_contract', 'pick_proposal', 'kill_direction', 'accept_result'] as const

const toDecision = (row: Record<string, unknown>): Decision => ({
  id: String(row.id),
  kind: row.kind as Decision['kind'],
  targetId: String(row.target_id),
  actor: 'human',
  by: String(row.by), at: String(row.at),
  ...(row.note == null ? {} : { note: String(row.note) }),
})

/** Money in cents: the budget cap is compared against a sum, and float addition moves a boundary. */
const toCents = (yuan: number | undefined): number | null => (yuan == null ? null : Math.round(yuan * 100))

/** Reads and writes the research aggregates. */
export class ResearchRepo {
  constructor(private readonly db: DatabaseSync) {}

  /** Inserts or updates one question. A hypothesis that names no prediction or falsifier is refused here, not only by its editor. */
  saveQuestion(question: Question): void {
    validateQuestion(question)
    this.db.prepare(
      'INSERT OR REPLACE INTO questions (id, statement, precision, prediction, test, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(question.id, question.statement, question.precision, question.prediction ?? null, question.test ?? null,
      question.status, assertIsoTimestamp(question.createdAt))
  }

  /** One question, or undefined when the id is unknown. */
  getQuestion(id: string): Question | undefined {
    const row = this.db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? toQuestion(row) : undefined
  }

  /** Stores a frozen contract under its version; an identical save is a no-op and a different body throws. */
  saveContract(contract: FrozenContract): void {
    const existing = this.getContract(contract.version)
    if (existing) {
      if (existing.hash === contract.hash) return
      throw new Error(`contract version ${contract.version} is frozen`)
    }
    this.db.prepare(
      'INSERT INTO contracts (version, json, hash, signed_by, signed_at) VALUES (?, ?, ?, ?, ?)',
    ).run(contract.version, JSON.stringify(contract), contract.hash, contract.signedBy, assertIsoTimestamp(contract.signedAt ?? ''))
  }

  /** One frozen contract, or undefined when the version is unknown. A stored contract that no longer verifies is refused. */
  getContract(version: number): FrozenContract | undefined {
    const row = this.db.prepare('SELECT json FROM contracts WHERE version = ?').get(version) as { json?: string } | undefined
    if (!row?.json) return undefined
    const stored = JSON.parse(row.json) as FrozenContract
    if (!verifyContract(stored)) throw new Error(`contract version ${version} does not verify`)
    return stored
  }

  /** Inserts or updates one attempt. A concluded or abandoned attempt is final and refuses any later write. */
  saveAttempt(attempt: Attempt): void {
    const existing = this.getAttempt(attempt.id)
    if (existing && (existing.status === 'concluded' || existing.status === 'abandoned')) {
      throw new Error(`attempt ${attempt.id} is ${existing.status} and cannot change`)
    }
    this.db.prepare(
      'INSERT OR REPLACE INTO attempts (id, slug, question_id, contract_version, branch, protocol_path, agenda_entry_id, status, verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(attempt.id, attempt.slug, attempt.questionId, attempt.contractVersion, attempt.branch,
      attempt.protocolPath, attempt.agendaEntryId ?? null, attempt.status, attempt.verdict ?? null)
  }

  /** One attempt, or undefined when the id is unknown. */
  getAttempt(id: string): Attempt | undefined {
    const row = this.db.prepare('SELECT * FROM attempts WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? toAttempt(row) : undefined
  }

  /** Every attempt, newest contract version first, optionally only those in one status. */
  listAttempts(status?: Attempt['status']): Attempt[] {
    const rows = (status
      ? this.db.prepare('SELECT * FROM attempts WHERE status = ? ORDER BY contract_version DESC').all(status)
      : this.db.prepare('SELECT * FROM attempts ORDER BY contract_version DESC').all()) as Record<string, unknown>[]
    return rows.map(row => toAttempt(row))
  }

  /** Records one boot. A finished run must carry its cost: an unpriced boot would quietly count as free. */
  addRun(run: Run): void {
    if (run.endedAt != null && run.costYuan == null) throw new Error(`run ${run.id} ended without a cost`)
    this.db.prepare(
      'INSERT INTO runs (id, attempt_id, kind, machine, image, git_commit, command, params, started_at, ended_at, cost_cents, log_path, artifacts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(run.id, run.attemptId, run.kind, run.machine, run.image, run.commit, run.command,
      JSON.stringify(run.params), assertIsoTimestamp(run.startedAt),
      run.endedAt == null ? null : assertIsoTimestamp(run.endedAt), toCents(run.costYuan),
      run.logPath ?? null, JSON.stringify(run.artifacts))
  }

  /** One run, or undefined when the id is unknown. */
  getRun(id: string): Run | undefined {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? toRun(row) : undefined
  }

  /** Every run of one attempt, oldest first. */
  runsOf(attemptId: string): Run[] {
    const rows = this.db.prepare('SELECT * FROM runs WHERE attempt_id = ? ORDER BY started_at').all(attemptId) as Record<string, unknown>[]
    return rows.map(row => toRun(row))
  }

  /** Money spent by one attempt, after refusing runs that overlap on one machine. */
  costOfAttempt(id: string): number {
    const rows = this.db.prepare(
      'SELECT * FROM runs WHERE attempt_id = ? ORDER BY started_at',
    ).all(id) as Record<string, unknown>[]
    const runs = rows.map(row => toRun(row))
    assertNoOverlap(runs)
    const cents = rows.reduce((total, row) => total + Number(row.cost_cents ?? 0), 0)
    return cents / 100
  }

  /** Records a judgement. Only a person can make one: an agent may propose, never write. */
  recordDecision(decision: Decision): void {
    if (decision.actor !== 'human') throw new Error('a decision can only be made by a human')
    if (!(DECISION_KINDS as readonly string[]).includes(decision.kind)) {
      throw new Error(`unknown decision kind ${String(decision.kind)}`)
    }
    if (this.decisionsFor(decision.targetId).some(existing => existing.id === decision.id)) {
      throw new Error(`${decision.kind} for ${decision.targetId} was already recorded`)
    }
    this.db.prepare(
      'INSERT INTO decisions (id, kind, target_id, actor, by, at, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(decision.id, decision.kind, decision.targetId, decision.actor, decision.by,
      assertIsoTimestamp(decision.at), decision.note ?? null)
  }

  /** Writes the frozen contract and its decision in one transaction: neither lands without the other. */
  signContract(frozen: FrozenContract, decision: Decision): void {
    this.db.exec('BEGIN')
    try {
      this.saveContract(frozen)
      this.recordDecision(decision)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  /** The judgements recorded against one target, oldest first by normalized time. */
  decisionsFor(targetId: string): Decision[] {
    const rows = this.db.prepare('SELECT * FROM decisions WHERE target_id = ? ORDER BY at').all(targetId) as Record<string, unknown>[]
    return rows.map(toDecision)
  }

  /** Updates a stored batch: the candidates, the critiques and the rejections travel together. */
  saveProposalBatch(batch: Batch): void {
    this.db.prepare('INSERT OR REPLACE INTO batches (id, json, status, created_at) VALUES (?, ?, ?, ?)')
      .run(batch.id, JSON.stringify(batch), batch.status, assertIsoTimestamp(batch.createdAt))
  }

  /** Inserts a new batch. A resubmitted id is refused here, not overwritten: the earlier critiques are the record. */
  createProposalBatch(batch: Batch): void {
    this.db.prepare('INSERT INTO batches (id, json, status, created_at) VALUES (?, ?, ?, ?)')
      .run(batch.id, JSON.stringify(batch), batch.status, assertIsoTimestamp(batch.createdAt))
  }

  /** One batch, or undefined when the id is unknown. */
  getProposalBatch(id: string): Batch | undefined {
    const row = this.db.prepare('SELECT json FROM batches WHERE id = ?').get(id) as { json?: string } | undefined
    return row?.json ? (JSON.parse(row.json) as Batch) : undefined
  }

  /** Every batch, newest first, optionally only those in one status. */
  listProposalBatches(status?: Batch['status']): Batch[] {
    const rows = (status
      ? this.db.prepare('SELECT json FROM batches WHERE status = ? ORDER BY created_at DESC').all(status)
      : this.db.prepare('SELECT json FROM batches ORDER BY created_at DESC').all()) as { json: string }[]
    return rows.map(row => JSON.parse(row.json) as Batch)
  }

  /**
   * Registers the protocol an attempt runs under.
   * The attempt and its signed contract must exist, the protocol must be valid for that contract, and a second
   * registration is refused: the protocol is the frozen baseline the verdict is judged against.
   */
  saveProtocol(protocol: Protocol): void {
    if (this.getProtocol(protocol.attemptId)) throw new Error(`attempt ${protocol.attemptId} already has a protocol`)
    const attempt = this.getAttempt(protocol.attemptId)
    const version = attempt ? attempt.contractVersion : protocol.contractVersion
    const contract = this.getContract(version)
    if (!contract) throw new Error(`no signed contract ${version} for attempt ${protocol.attemptId}`)
    validateProtocol(protocol, contract)
    this.db.prepare('INSERT INTO protocols (attempt_id, json) VALUES (?, ?)').run(protocol.attemptId, JSON.stringify(protocol))
  }

  /** The protocol of one attempt, or undefined when it has none. */
  getProtocol(attemptId: string): Protocol | undefined {
    const row = this.db.prepare('SELECT json FROM protocols WHERE attempt_id = ?').get(attemptId) as { json?: string } | undefined
    return row?.json ? (JSON.parse(row.json) as Protocol) : undefined
  }

  /** When the machine was switched on, and when it was last switched off. */
  machine(): { bootedAt?: string; offAt?: string } {
    const row = this.db.prepare("SELECT * FROM machine WHERE id = 'self'").get() as { booted_at?: string | null; off_at?: string | null } | undefined
    return { ...(row?.booted_at ? { bootedAt: row.booted_at } : {}), ...(row?.off_at ? { offAt: row.off_at } : {}) }
  }

  /** Records a switch-on, keeping the last switch-off for the record. */
  setMachineBootedAt(at: string): void {
    this.db.prepare("INSERT OR REPLACE INTO machine (id, booted_at, off_at) VALUES ('self', ?, (SELECT off_at FROM machine WHERE id = 'self'))").run(assertIsoTimestamp(at))
  }

  /** Records a switch-off and clears the boot, so the next idle window starts from a real boot. */
  clearMachineBootedAt(at: string): void {
    this.db.prepare("INSERT OR REPLACE INTO machine (id, booted_at, off_at) VALUES ('self', NULL, ?)").run(assertIsoTimestamp(at))
  }

  /**
   * Stores the evidence package once, after checking it against the contract the attempt was judged under.
   * Only a concluded attempt has evidence; an inconclusive rerun may replace the previous package, because the
   * machine disproved nothing and the person still needs a better rerun.
   */
  saveEvidence(pkg: EvidencePackage, outcome: Reproducibility): void {
    const existing = this.getEvidence(pkg.attemptId)
    if (existing && existing.outcome !== 'inconclusive') throw new Error(`attempt ${pkg.attemptId} already has evidence`)
    const attempt = this.getAttempt(pkg.attemptId)
    if (!attempt) throw new Error(`unknown attempt ${pkg.attemptId}`)
    if (attempt.status !== 'concluded') throw new Error(`attempt ${pkg.attemptId} is not concluded`)
    const contract = this.getContract(attempt.contractVersion)
    if (!contract) throw new Error(`attempt ${pkg.attemptId} has no signed contract`)
    validateEvidence(pkg, contract)
    this.db.prepare('INSERT OR REPLACE INTO evidence (attempt_id, json, outcome) VALUES (?, ?, ?)').run(pkg.attemptId, JSON.stringify(pkg), outcome)
  }

  /** The evidence of one attempt, with the reproduction outcome recorded beside it. */
  getEvidence(attemptId: string): (EvidencePackage & { outcome: Reproducibility }) | undefined {
    const row = this.db.prepare('SELECT json, outcome FROM evidence WHERE attempt_id = ?').get(attemptId) as { json?: string; outcome?: string } | undefined
    return row?.json ? { ...(JSON.parse(row.json) as EvidencePackage), outcome: row.outcome as Reproducibility } : undefined
  }

  /** Stores the report a person reads; a rewrite replaces the previous draft. */
  saveReport(attemptId: string, text: string): void {
    this.db.prepare('INSERT OR REPLACE INTO reports (attempt_id, text) VALUES (?, ?)').run(attemptId, text)
  }

  /** The report of one attempt, or undefined when none was drawn. */
  getReport(attemptId: string): string | undefined {
    const row = this.db.prepare('SELECT text FROM reports WHERE attempt_id = ?').get(attemptId) as { text?: string } | undefined
    return row?.text
  }

  /**
   * Downgrades a supported verdict after a confirmed failure to reproduce.
   * This is the only write that may change a concluded verdict, and it is one-way: a refuted or inconclusive
   * attempt cannot be raised, and a verdict cannot be cleared.
   */
  downgradeToInconclusive(id: string): void {
    const attempt = this.getAttempt(id)
    if (!attempt) throw new Error(`unknown attempt ${id}`)
    if (attempt.status !== 'concluded') throw new Error(`attempt ${id} is not concluded`)
    if (attempt.verdict !== 'supported') throw new Error(`attempt ${id} was not supported: ${String(attempt.verdict)}`)
    this.db.prepare("UPDATE attempts SET verdict = 'inconclusive' WHERE id = ?").run(id)
  }
}