/** Domain types of the research agent: the concepts, their unions, and the validators that keep them honest. */

/** How sharp a question is. A direction is a vague topic; a topic is a precise direction; a hypothesis is testable. */
export type Precision = 'direction' | 'topic' | 'hypothesis'
/** Where a question sits in its life. */
export type QuestionStatus = 'open' | 'testing' | 'answered' | 'abandoned'
/** How an attempt ends. A refuted hypothesis is still an answer. */
export type Verdict = 'supported' | 'refuted' | 'inconclusive'
/** Where an attempt sits: waiting means it stopped for a person, usually the budget cap. */
export type AttemptStatus = 'opened' | 'running' | 'waiting' | 'concluded' | 'abandoned'
/** The only decisions a person can make. Agents may propose, never write one. */
export type DecisionKind = 'sign_contract' | 'pick_proposal' | 'kill_direction' | 'accept_result'

/** One question the lab is working on, at one precision. */
export interface Question {
  id: string
  statement: string
  precision: Precision
  /** Required at hypothesis precision: what the experiment should show if the claim holds. */
  prediction?: string
  /** Required at hypothesis precision: what result would falsify the claim. */
  test?: string
  status: QuestionStatus
  createdAt: string
}

/** One line of a contract that a person signs. */
export interface Criterion {
  id: string
  statement: string
  /** How close a rerun must land, when the criterion is numeric. */
  tolerance?: string
}

/** What a person signs: the shape of success, never the commands. */
export interface Contract {
  version: number
  goal: string
  /** The property the user demanded, such as an architectural novelty. */
  requirement: string
  criteria: Criterion[]
  budgetCapYuan: number
  stopCondition: string
  signedBy: string
  signedAt?: string
}

/** A contract after signing: immutable, and identified by the hash of its content. */
export type FrozenContract = Contract & { hash: string }

/** One line of work: a branch, a pre-registered protocol, its runs, and a verdict. */
export interface Attempt {
  id: string
  slug: string
  questionId: string
  contractVersion: number
  branch: string
  protocolPath: string
  /** Set once the conclusion is in the agenda; a branch cannot be deleted before that. */
  agendaEntryId?: string
  status: AttemptStatus
  verdict?: Verdict
}

/** One boot of one machine. The only unit that carries cost and raw evidence. */
export interface Run {
  id: string
  attemptId: string
  kind: 'experiment' | 'verification'
  machine: string
  image: string
  commit: string
  command: string
  params: Record<string, string>
  startedAt: string
  endedAt?: string
  /** Money spent on this boot, in yuan. */
  costYuan?: number
  logPath?: string
  artifacts: string[]
}

/** A judgement only a person can make. */
export interface Decision {
  id: string
  kind: DecisionKind
  targetId: string
  actor: 'human'
  by: string
  at: string
  note?: string
}

const ZONE = /(?:Z|[+-]\d{2}:\d{2})$/u

/**
 * Returns the normalized ISO form of a timestamp, or throws when the value carries no timezone.
 * Every timestamp in the research domain passes through here: a local time without a zone sorts wrong and
 * makes an hour of idling look like a minute.
 */
export function assertIsoTimestamp(value: string): string {
  if (!ZONE.test(value)) throw new Error('timestamp must carry a timezone')
  const time = Date.parse(value)
  if (!Number.isFinite(time)) throw new Error(`not a timestamp: ${value}`)
  return new Date(time).toISOString()
}

/**
 * Throws when a question cannot be worked on as stated: a hypothesis without a prediction or a falsifier
 * is an opinion, and the gate could not judge it.
 */
export function validateQuestion(question: Question): void {
  if (question.precision !== 'hypothesis') return
  if (!question.prediction?.trim() || !question.test?.trim()) throw new Error('hypothesis requires a prediction and a test')
}

/** Whether the question states a claim an experiment could refute. */
export function isTestable(question: Question): boolean {
  return question.precision === 'hypothesis' && Boolean(question.prediction?.trim()) && Boolean(question.test?.trim())
}