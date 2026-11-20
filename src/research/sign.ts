/** Signing: the one act that turns a drafted contract into a frozen baseline. */
import { freezeContract } from './contract.ts'
import { assertIsoTimestamp, type Contract, type Decision, type FrozenContract } from './model.ts'

/** The storage a signature needs. The research repository satisfies it; tests can pass a double. */
export interface ContractSink {
  saveContract(contract: FrozenContract): void
  getContract(version: number): FrozenContract | undefined
  recordDecision(decision: Decision): void
}

/**
 * Freezes the contract and records the human decision that signed it.
 * A version already signed is refused here rather than left to the store: an identical re-save is idempotent, and
 * signing twice must not look like success. Nothing is written when the refusal fires.
 */
export function sign(sink: ContractSink, contract: Contract, by: string, at: string): { frozen: FrozenContract; decision: Decision } {
  if (sink.getContract(contract.version)) throw new Error(`contract version ${contract.version} is frozen`)
  const frozen = freezeContract(contract, by, at)
  sink.saveContract(frozen)
  const decision: Decision = {
    id: `sign-${frozen.version}`,
    kind: 'sign_contract',
    targetId: `contract:${frozen.version}`,
    actor: 'human',
    by,
    at: frozen.signedAt ?? assertIsoTimestamp(at),
  }
  sink.recordDecision(decision)
  return { frozen, decision }
}