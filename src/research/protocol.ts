/** The protocol a person registers before the machine runs: what will be executed, and what will settle each criterion. */
import { assertIsoTimestamp, type Contract } from './model.ts'

/** Which contract criterion a value settles, and where the value comes from. */
export interface Measurement {
  criterionId: string
  /** A file and field, or a command, named well enough for the analyst to read it. */
  from: string
}

/** Everything fixed before the first boot. Registering it is what makes "the procedure was completed" checkable. */
export interface Protocol {
  attemptId: string
  questionId: string
  contractVersion: number
  commands: string[]
  measurements: Measurement[]
  expected: string
  stopCondition: string
  machineHours: number
  registeredAt: string
}

/**
 * Refuses a protocol that cannot settle the contract it names: a criterion with no measurement, no command,
 * no stop condition, or a machine time that is not positive would leave the attempt unjudgeable after the money is spent.
 */
export function validateProtocol(protocol: Protocol, contract: Contract): void {
  if (protocol.contractVersion !== contract.version) {
    throw new Error(`the protocol names contract ${protocol.contractVersion}, but the signed one is ${contract.version}`)
  }
  if (!protocol.commands.length) throw new Error('a protocol needs at least one command')
  if (!protocol.stopCondition.trim()) throw new Error('a protocol needs a stop condition')
  if (!(protocol.machineHours > 0)) throw new Error('a protocol needs a positive machine time')
  const measured = new Set(protocol.measurements.map(entry => entry.criterionId))
  for (const criterion of contract.criteria) {
    if (!measured.has(criterion.id)) throw new Error(`the protocol measures no criterion ${criterion.id}`)
  }
  for (const entry of protocol.measurements) {
    if (!entry.from.trim()) throw new Error(`the measurement of ${entry.criterionId} names no source`)
  }
  assertIsoTimestamp(protocol.registeredAt)
}