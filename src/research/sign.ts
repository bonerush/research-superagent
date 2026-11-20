/** Signing: the one act that turns a drafted contract into a frozen baseline. */
import { freezeContract } from './contract.ts'
import { assertIsoTimestamp, type Contract, type Decision, type FrozenContract } from './model.ts'

/** The storage a signature needs. The research repository satisfies it; tests can pass a double. */
export interface ContractSink {
  getContract(version: number): FrozenContract | undefined
  /** Writes the frozen contract and its decision together, or neither. */
  signContract(frozen: FrozenContract, decision: Decision): void
}

/**
 * Freezes the contract and records the human decision that signed it.
 * A version already signed is refused before anything is written; the store then writes both rows in one transaction,
 * so the ledger never holds a contract without its signature or a signature without its contract.
 */
export function sign(sink: ContractSink, contract: Contract, by: string, at: string): { frozen: FrozenContract; decision: Decision } {
  if (sink.getContract(contract.version)) throw new Error(`contract version ${contract.version} is frozen`)
  const frozen = freezeContract(contract, by, at)
  const decision: Decision = {
    id: `sign-${frozen.version}`,
    kind: 'sign_contract',
    targetId: `contract:${frozen.version}`,
    actor: 'human',
    by,
    at: frozen.signedAt ?? assertIsoTimestamp(at),
  }
  sink.signContract(frozen, decision)
  return { frozen, decision }
}