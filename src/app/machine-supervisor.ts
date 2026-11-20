/** The supervisor: stops paying for a machine nobody is using, and records that it did. */
import { shouldPowerOff, type Activity } from '../research/machine.ts'
import type { MachinePort } from './machine-port.ts'

/** What one supervision round needs. */
export interface SuperviseOptions {
  port: MachinePort
  activity: Activity
  now: string
  idleMs: number
  /** Called after the power-off succeeded, so the ledger can record the stop. */
  onPowerOff: (at: string) => void
}

/** What the round did. */
export type SuperviseResult = 'powered-off' | 'kept' | 'off'

/**
 * One round: read the machine, decide, act.
 * A machine already off is left alone, and so is one that is working; the power-off is recorded only after it succeeded,
 * so a failed call leaves the ledger honest and the next round tries again.
 */
export async function supervise(options: SuperviseOptions): Promise<SuperviseResult> {
  const status = await options.port.status()
  if (status === 'off') return 'off'
  if (!shouldPowerOff(options.activity, options.now, options.idleMs)) return 'kept'
  await options.port.powerOff()
  options.onPowerOff(options.now)
  return 'powered-off'
}