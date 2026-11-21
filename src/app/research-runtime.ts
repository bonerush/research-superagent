/** Opens the research database beside the orchestrator's, and drives the machine it pays for. */
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import type { Activity } from '../research/machine.ts'
import { httpMachinePort, type MachinePort } from './machine-port.ts'
import { commandNotifier, runNotifyCommand, type Notifier } from './notifier.ts'
import { supervise } from './machine-supervisor.ts'
import { ResearchRepo, createResearchSchema } from './store-research.ts'

/**
 * The notifier, when the operator configured a command: research events outside the panel land wherever that command
 * sends them. Without it the panel is the only surface, rather than a notifier that silently does nothing.
 */
export function notifierFromEnv(env: NodeJS.ProcessEnv = process.env): Notifier | undefined {
  const command = env.RESEARCH_NOTIFY_COMMAND
  return command ? commandNotifier(command, runNotifyCommand) : undefined
}

/** The open research store and the way to close it. */
export interface ResearchRuntime {
  repo: ResearchRepo
  close(): void
}

/**
 * A separate file, not the ticket store: the research domain replaces that schema rather than extending it, and the two
 * must be able to move on different schedules while the old one is still being removed.
 */
export function openResearch(stateDir: string): ResearchRuntime {
  const db = new DatabaseSync(join(stateDir, 'research.sqlite'))
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL')
  createResearchSchema(db)
  return { repo: new ResearchRepo(db), close: () => db.close() }
}

/**
 * The machine, when the operator configured one. The token and the four endpoints come from the environment, so no
 * secret is written to the state directory, and an unconfigured deployment simply has no machine to bill.
 */
export function machinePortFromEnv(env: NodeJS.ProcessEnv = process.env): MachinePort | undefined {
  const token = env.RESEARCH_MACHINE_TOKEN
  const instanceId = env.RESEARCH_MACHINE_INSTANCE
  const status = env.RESEARCH_MACHINE_STATUS_URL
  const powerOn = env.RESEARCH_MACHINE_ON_URL
  const powerOff = env.RESEARCH_MACHINE_OFF_URL
  const balance = env.RESEARCH_MACHINE_BALANCE_URL
  if (!token || !instanceId || !status || !powerOn || !powerOff || !balance) return undefined
  const dialect = env.RESEARCH_MACHINE_DIALECT === 'autodl' ? 'autodl' as const : undefined
  return httpMachinePort({ endpoints: { status, powerOn, powerOff, balance }, token, instanceId, ...(dialect ? { dialect } : {}) })
}

/** What counts as use, read from the ledger: a run still open means the machine is working. */
export function activityOf(repo: ResearchRepo): Activity {
  const runs = repo.listAttempts().flatMap(attempt => repo.runsOf(attempt.id))
  const ended = runs.map(run => run.endedAt).filter((value): value is string => Boolean(value)).sort()
  const boot = repo.machine().bootedAt
  return {
    jobRunning: runs.some(run => run.endedAt == null),
    ...(boot ? { bootedAt: boot } : {}),
    ...(ended.length ? { lastJobEndedAt: ended[ended.length - 1]! } : {}),
  }
}

/** One supervision round: stop the meter when nothing is using it, and clear the boot for the next one. */
export async function machineTick(options: { repo: ResearchRepo; port: MachinePort; now: string; idleMs: number }): Promise<"powered-off" | "kept" | "off"> {
  return supervise({
    port: options.port,
    activity: activityOf(options.repo),
    now: options.now,
    idleMs: options.idleMs,
    onPowerOff: at => options.repo.clearMachineBootedAt(at),
  })
}