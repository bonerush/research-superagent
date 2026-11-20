/** Persistence for the research domain. Its own database, not the ticket store's schema. */
import type { DatabaseSync } from 'node:sqlite'
import type { Attempt, Decision, FrozenContract, Question, Run } from '../research/model.ts'

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, statement TEXT NOT NULL, precision TEXT NOT NULL, prediction TEXT, test TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS contracts (version INTEGER PRIMARY KEY, json TEXT NOT NULL, hash TEXT NOT NULL, signed_by TEXT NOT NULL, signed_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, slug TEXT NOT NULL, question_id TEXT NOT NULL, contract_version INTEGER NOT NULL, branch TEXT NOT NULL, protocol_path TEXT NOT NULL, agenda_entry_id TEXT, status TEXT NOT NULL, verdict TEXT)',
  'CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, kind TEXT NOT NULL, machine TEXT NOT NULL, image TEXT NOT NULL, git_commit TEXT NOT NULL, command TEXT NOT NULL, params TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, cost_yuan REAL, log_path TEXT, artifacts TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, target_id TEXT NOT NULL, actor TEXT NOT NULL, by TEXT NOT NULL, at TEXT NOT NULL, note TEXT)',
]

/** Creates the research tables in an open database. Idempotent: safe on every start. */
export function createResearchSchema(db: DatabaseSync): void {
  for (const statement of SCHEMA) db.exec(statement)
}

const toQuestion = (row: Record<string, unknown>): Question => ({
  id: String(row.id),
  statement: String(row.statement),
  precision: row.precision as Question['precision'],
  ...(row.prediction == null ? {} : { prediction: String(row.prediction) }),
  ...(row.test == null ? {} : { test: String(row.test) }),
  status: row.status as Question['status'],
  createdAt: String(row.created_at),
})

const toAttempt = (row: Record<string, unknown>): Attempt => ({
  id: String(row.id),
  slug: String(row.slug),
  questionId: String(row.question_id),
  contractVersion: Number(row.contract_version),
  branch: String(row.branch),
  protocolPath: String(row.protocol_path),
  ...(row.agenda_entry_id == null ? {} : { agendaEntryId: String(row.agenda_entry_id) }),
  status: row.status as Attempt['status'],
  ...(row.verdict == null ? {} : { verdict: row.verdict as Attempt['verdict'] }),
})
const DECISION_KINDS = ['sign_contract', 'kill_direction', 'accept_result'] as const

const toDecision = (row: Record<string, unknown>): Decision => ({
  id: String(row.id),
  kind: row.kind as Decision['kind'],
  targetId: String(row.target_id),
  actor: 'human',
  by: String(row.by),
  at: String(row.at),
  ...(row.note == null ? {} : { note: String(row.note) }),
})

/** Reads and writes the five research aggregates. */
export class ResearchRepo {
  constructor(private readonly db: DatabaseSync) {}

  /** Inserts or updates one question, keyed by its id. */
  saveQuestion(question: Question): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO questions (id, statement, precision, prediction, test, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      question.id, question.statement, question.precision,
      question.prediction ?? null, question.test ?? null, question.status, question.createdAt,
    )
  }

  /** One question, or undefined when the id is unknown. */
  getQuestion(id: string): Question | undefined {
    const row = this.db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? toQuestion(row) : undefined
  }

  /**
   * Stores a frozen contract under its version.
   * An identical save is a no-op; a different body under a taken version throws, because that is the version a person signed.
   */
  saveContract(contract: FrozenContract): void {
    const existing = this.getContract(contract.version)
    if (existing) {
      if (existing.hash === contract.hash) return
      throw new Error(`contract version ${contract.version} is frozen`)
    }
    this.db.prepare(
      'INSERT INTO contracts (version, json, hash, signed_by, signed_at) VALUES (?, ?, ?, ?, ?)',
    ).run(
      contract.version, JSON.stringify(contract), contract.hash,
      contract.signedBy, contract.signedAt ?? '',
    )
  }

  /** One frozen contract, or undefined when the version is unknown. */
  getContract(version: number): FrozenContract | undefined {
    const row = this.db.prepare('SELECT json FROM contracts WHERE version = ?').get(version) as { json?: string } | undefined
    return row?.json ? (JSON.parse(row.json) as FrozenContract) : undefined
  }

  /** Inserts or updates one attempt, keyed by its id. */
  saveAttempt(attempt: Attempt): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO attempts (id, slug, question_id, contract_version, branch, protocol_path, agenda_entry_id, status, verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      attempt.id, attempt.slug, attempt.questionId, attempt.contractVersion, attempt.branch,
      attempt.protocolPath, attempt.agendaEntryId ?? null, attempt.status, attempt.verdict ?? null,
    )
  }

  /** One attempt, or undefined when the id is unknown. */
  getAttempt(id: string): Attempt | undefined {
    const row = this.db.prepare('SELECT * FROM attempts WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? toAttempt(row) : undefined
  }

  /** Records one boot. It never touches the attempt row, so a verification run after a verdict keeps the verdict. */
  addRun(run: Run): void {
    this.db.prepare(
      'INSERT INTO runs (id, attempt_id, kind, machine, image, git_commit, command, params, started_at, ended_at, cost_yuan, log_path, artifacts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      run.id, run.attemptId, run.kind, run.machine, run.image, run.commit, run.command,
      JSON.stringify(run.params), run.startedAt, run.endedAt ?? null, run.costYuan ?? null,
      run.logPath ?? null, JSON.stringify(run.artifacts),
    )
  }

  /** Money spent by one attempt across all its runs, in yuan. */
  costOfAttempt(id: string): number {
    const row = this.db.prepare('SELECT COALESCE(SUM(cost_yuan), 0) AS total FROM runs WHERE attempt_id = ?').get(id) as { total?: number } | undefined
    return row?.total ?? 0
  }

  /** Records a judgement. Only a person can make one: an agent may propose, never write. */
  recordDecision(decision: Decision): void {
    if (decision.actor !== 'human') throw new Error('a decision can only be made by a human')
    if (!(DECISION_KINDS as readonly string[]).includes(decision.kind)) {
      throw new Error(`unknown decision kind ${String(decision.kind)}`)
    }
    this.db.prepare(
      'INSERT INTO decisions (id, kind, target_id, actor, by, at, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(decision.id, decision.kind, decision.targetId, decision.actor, decision.by, decision.at, decision.note ?? null)
  }

  /** The judgements recorded against one target, oldest first. */
  decisionsFor(targetId: string): Decision[] {
    const rows = this.db.prepare('SELECT * FROM decisions WHERE target_id = ? ORDER BY at').all(targetId) as Record<string, unknown>[]
    return rows.map(toDecision)
  }
}