/** The report a person reads: what was claimed, what the machine showed, and whether it could be repeated. */
import type { EvidencePackage } from './evidence.ts'
import type { Attempt, Contract } from './model.ts'
import type { Reproducibility } from './reproduction.ts'

/** Everything the report is built from; the drafter invents nothing. */
export interface ReportInput {
  attempt: Attempt
  contract: Contract
  evidence: EvidencePackage
  outcome: Reproducibility
  costYuan: number
  /** What the independent rerun cost, when it was recorded as a verification run. */
  verificationYuan?: number
}

const outcomeLine = (outcome: Reproducibility): string => {
  if (outcome === 'reproducible') return 'A rerun reproduced it: the same commit, the same data and metrics inside tolerance.'
  if (outcome === 'not_reproducible') return 'A rerun did NOT reproduce it, so the verdict is downgraded to inconclusive.'
  return 'A rerun was inconclusive: a criterion reported no value, so nothing was confirmed either way.'
}

/**
 * Draws the report: verdict first, then the evidence it rests on, then the reproduction, the money and what would
 * change the conclusion. A failure to reproduce appears in the first paragraph, not in a footnote.
 */
export function draftReport(input: ReportInput): string {
  const { attempt, contract, evidence, outcome, costYuan, verificationYuan } = input
  const lines: string[] = []
  lines.push(`# ${attempt.id}: ${String(attempt.verdict)}`, '')
  lines.push(`> ${outcomeLine(outcome)}`, '')
  lines.push(`**Question.** ${contract.goal}`, '')
  lines.push(`**Requirement.** ${contract.requirement}`, '')
  lines.push('## Evidence', '')
  lines.push(`- commit: ${evidence.commit}`)
  lines.push(`- data: ${evidence.dataHash}`)
  lines.push(`- command: ${evidence.command}`)
  lines.push(`- image: ${evidence.image} on ${evidence.machineType}`)
  lines.push(`- reproduce: ${evidence.reproduce}`, '')
  lines.push('| Criterion | Value |', '| --- | --- |')
  for (const criterion of contract.criteria) {
    lines.push(`| ${criterion.statement} | ${evidence.metrics[criterion.id] ?? 'missing'} |`)
  }
  lines.push('', '## Reproduction', '', outcome, '')
  lines.push('## Cost', '', `${costYuan} yuan`, '')
  if (verificationYuan !== undefined) {
    lines.push(`Independent rerun: ${verificationYuan} yuan (included in the total above only if recorded as a run of this attempt)`, '')
  }
  lines.push('## Stop condition', '', contract.stopCondition, '')
  lines.push('## What would change this', '')
  lines.push(`A rerun at commit ${evidence.commit} on the same data, or a different value for ${contract.criteria.map(c => c.id).join(', ')}, would change it.`)
  return lines.join(String.fromCharCode(10))
}