/** Research page: what the research loop waits for a person to do, and the two decisions a person can take here. */
import type { ReactNode } from 'react'
import { usePoll } from './api.ts'
import { Button } from './controls.tsx'
import { useAction, usePanel, usePanelData } from './provider.tsx'
import { LoadState, Section } from './widgets.tsx'

/**
 * Four lists: the contracts to sign, the batches to pick from, the attempts to judge, and the reports drawn for them.
 * Picking a candidate and accepting a result need nothing but a click; signing and killing need words, so they stay in
 * the conversation and this page only points at them.
 */
export function ResearchPage(): ReactNode {
  const { t, call } = usePanel()
  const { data, error, reload } = usePoll(() => call('GET research'), [])
  const { state } = usePanelData()
  const by = state?.masterId ?? 'panel'
  const pick = useAction((batchId: string, candidateId: string) => call('POST research/pick', { body: { batchId, candidateId, by } }), { reload })
  const accept = useAction((attemptId: string) => call('POST research/decide', { body: { op: 'accept', attemptId, by } }), { reload })
  if (!data) return <LoadState error={error} loading />
  const empty = <p className="dt-hint">{t('researchNone')}</p>
  return <div className="dt-column">
    <Section title={t('researchContracts')} count={data.contracts.length}>
      {data.contracts.length === 0 ? empty : <ul className="dt-list">
        {data.contracts.map(contract => <li key={contract.batchId} className="dt-row">
          <span className="dt-mono">{contract.batchId}</span> {contract.direction} · {contract.candidateId}
        </li>)}
      </ul>}
    </Section>
    <Section title={t('researchBatches')} count={data.batches.length}>
      {data.batches.length === 0 ? empty : <ul className="dt-list">
        {data.batches.map(batch => <li key={batch.id} className="dt-row">
          <span className="dt-mono">{batch.id}</span> {batch.direction}
          <div className="dt-row-meta dt-row-buttons">
            {batch.candidates.map(candidate => <Button key={candidate.id} variant="outline" size="sm"
              onClick={() => void pick.run(batch.id, candidate.id)}>{candidate.id}</Button>)}
          </div>
        </li>)}
      </ul>}
    </Section>
    <Section title={t('researchAttempts')} count={data.attempts.length}>
      {data.attempts.length === 0 ? empty : <ul className="dt-list">
        {data.attempts.map(attempt => <li key={attempt.id} className="dt-row">
          <span className="dt-mono">{attempt.id}</span> · {attempt.verdict} · {attempt.costYuan}
          <div className="dt-row-meta dt-row-buttons">
            <Button variant="primary" size="sm"               onClick={() => void accept.run(attempt.id)}>{t('researchAccept')}</Button>
          </div>
        </li>)}
      </ul>}
    </Section>
    <Section title={t('researchReports')} count={data.reports.length}>
      {data.reports.length === 0 ? empty : <ul className="dt-list">
        {data.reports.map(report => <li key={report.attemptId} className="dt-row">
          <span className="dt-mono">{report.attemptId}</span> {report.title}
        </li>)}
      </ul>}
    </Section>
  </div>
}