/** Canonical form and freeze hash of an acceptance contract. A frozen contract can be proved unchanged. */
import { createHash } from 'node:crypto'
import { assertIsoTimestamp, type Contract, type FrozenContract } from './model.ts'

/**
 * Serializes a contract in one fixed order, so two contracts equal in content hash alike however their keys were built.
 * signedBy, signedAt and hash are outside the canonical form: the hash identifies what was agreed, not who signed it.
 */
export function canonicalContract(contract: Contract): string {
  const criteria = contract.criteria.map(criterion => ({
    id: criterion.id,
    statement: criterion.statement,
    tolerance: criterion.tolerance ?? null,
  }))
  return JSON.stringify([
    contract.version, contract.goal, contract.requirement, criteria, contract.budgetCapYuan, contract.stopCondition,
  ])
}

/** The hex SHA-256 of the canonical form. */
export function contractHash(contract: Contract): string {
  return createHash('sha256').update(canonicalContract(contract)).digest('hex')
}

/** Signs a contract once, stamping the signer and the normalized time, and records its hash. */
export function freezeContract(contract: Contract, by: string, at: string): FrozenContract {
  const signed: Contract = { ...contract, signedBy: by, signedAt: assertIsoTimestamp(at) }
  return { ...signed, hash: contractHash(signed) }
}

/** Whether a frozen contract still hashes to its recorded hash: false means someone edited it after signing. */
export function verifyContract(frozen: FrozenContract): boolean {
  return contractHash(frozen) === frozen.hash
}