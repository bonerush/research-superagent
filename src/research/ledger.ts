/** Pricing a boot: what a run cost, and refusing the runs whose books do not add up. */
import { assertIsoTimestamp, type Run } from './model.ts'

/** Yuan per hour, by machine type. */
export interface Rates {
  readonly [machine: string]: number
}

/** The minutes between two timestamps; a run that ends before it starts is a bookkeeping error, not zero. */
const minutes = (start: string, end: string): number => {
  const from = Date.parse(assertIsoTimestamp(start))
  const to = Date.parse(assertIsoTimestamp(end))
  if (!(to >= from)) throw new Error('the run ended before it started')
  return (to - from) / 60_000
}

/** The money one boot cost: its minutes at the machine rate. */
export function runCost(run: Run, rates: Rates): number {
  if (!run.endedAt) throw new Error(`run ${run.id} never ended, so its cost is unknown`)
  const rate = rates[run.machine]
  if (rate === undefined) throw new Error(`no rate for machine ${run.machine}`)
  return (minutes(run.startedAt, run.endedAt) / 60) * rate
}

/**
 * The money an attempt cost: every run summed, after refusing two runs that overlap on one machine.
 * An overlap would be charged twice and would also mean the record of what ran when is wrong.
 */
export function attemptCost(runs: Run[], rates: Rates): number {
  const byMachine = new Map<string, Run[]>()
  for (const run of runs) {
    const list = byMachine.get(run.machine) ?? []
    list.push(run)
    byMachine.set(run.machine, list)
  }
  for (const [machine, list] of byMachine) {
    const sorted = [...list].sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))
    for (let index = 1; index < sorted.length; index++) {
      const previous = sorted[index - 1]!
      const current = sorted[index]!
      const previousEnd = Date.parse(previous.endedAt ?? previous.startedAt)
      if (Date.parse(current.startedAt) < previousEnd) throw new Error(`runs overlap on ${machine}`)
    }
  }
  return runs.reduce((total, run) => total + runCost(run, rates), 0)
}