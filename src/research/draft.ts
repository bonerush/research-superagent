/** Drafting a contract from the picked candidate: the person still has to name what they asked for, and sign it. */
import type { Criterion, Contract } from './model.ts'
import type { Candidate } from './proposal.ts'

/**
 * Turns a candidate into a contract a person can sign.
 * The requirement comes from the person, never from the candidate: it is the property they demanded, such as an
 * architectural novelty, and the drafter cannot invent it.
 * The criteria are the candidate prediction and its falsifier; a candidate that states no stopping condition is not ready to be signed.
 */
export function draftContract(candidate: Candidate, requirement: string, version: number): Contract {
  const asked = requirement.trim()
  if (!asked) throw new Error('a contract needs a requirement')
  const criteria: Criterion[] = []
  if (candidate.prediction?.trim()) criteria.push({ id: 'c1', statement: candidate.prediction.trim() })
  if (candidate.test?.trim()) criteria.push({ id: `c${criteria.length + 1}`, statement: candidate.test.trim() })
  if (!criteria.length) throw new Error('a contract needs at least one criterion')
  const stop = candidate.test?.trim() ?? ''
  if (!stop) throw new Error('a contract needs a stop condition: the candidate states no falsifier')
  return {
    version,
    goal: candidate.question,
    requirement: asked,
    criteria,
    budgetCapYuan: candidate.feasibility.yuan,
    stopCondition: stop,
    signedBy: '',
  }
}