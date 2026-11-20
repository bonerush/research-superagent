/** Persistence for the research domain. Its own database, not the ticket store's schema. */
import type { DatabaseSync } from 'node:sqlite'
import type { FrozenContract, Question } from '../research/model.ts'

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

  /** Stores a frozen contract under its version. */
  saveContract(contract: FrozenContract): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO contracts (version, json, hash, signed_by, signed_at) VALUES (?, ?, ?, ?, ?)',
    ).run(contract.version, JSON.stringify(contract), contract.hash, contract.signedBy, contract.signedAt ?? '')
  }

  /** One frozen contract, or undefined when the version is unknown. */
  getContract(version: number): FrozenContract | undefined {
    const row = this.db.prepare('SELECT json FROM contracts WHERE version = ?').get(version) as { json?: string } | undefined
    return row?.json ? (JSON.parse(row.json) as FrozenContract) : undefined
  }
}