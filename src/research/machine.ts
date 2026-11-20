/** What the machine is doing, and when it may be stopped to stop the meter. */
import { assertIsoTimestamp } from './model.ts'

/** The four states the ledger and the supervisor care about. */
export type MachineStatus = 'off' | 'booting' | 'idle' | 'running'

/** Everything that counted as use since the boot. */
export interface Activity {
  jobRunning: boolean
  /** When the machine was switched on; without it a machine nobody ever used would never be stopped. */
  bootedAt?: string
  lastJobEndedAt?: string
  lastSessionAt?: string
  lastTransferAt?: string
}

/**
 * Whether an idle stretch has passed, in which case the meter should stop.
 * A running job always keeps the machine, even when nobody has logged in for hours: the machine is working, not idle.
 * The idle stretch starts at the latest of the recorded activities and the boot; a timestamp from the future counts as now.
 * With no boot and no activity there is no basis to judge, so the machine is kept rather than switched off blind.
 */
export function shouldPowerOff(activity: Activity, now: string, idleMs: number): boolean {
  if (activity.jobRunning) return false
  const nowMs = Date.parse(assertIsoTimestamp(now))
  const marks = [activity.bootedAt, activity.lastJobEndedAt, activity.lastSessionAt, activity.lastTransferAt]
    .filter((value): value is string => Boolean(value))
    .map(value => Date.parse(assertIsoTimestamp(value)))
  if (!marks.length) return false
  const latest = Math.min(Math.max(...marks), nowMs)
  return nowMs - latest >= idleMs
}