/** Research page: what the research loop waits for a person to do. */
import type { ReactNode } from 'react'
import { usePoll } from './api.ts'
import { usePanel } from './provider.tsx'
import { LoadState, Section } from './widgets.tsx'

/**
 * One screen with three lists: the batches to pick from, the attempts to judge, and the reports drawn for them.
 * An empty list says so plainly instead of hiding the section, so a quiet week looks quiet rather than broken.
 */
export function ResearchPage(): ReactNode {
  const { t, call } = usePanel()
  const { data, error } = usePoll(() => call('GET research'), [])
  if (!data) return <LoadState error={error} loading />
  const empty = <p className="dt-hint">{t('researchNone')}</p>
  return <div className="dt-column">
    <Section title={t('researchBatches')} count={data.batches.length}>
      {data.batches.length === 0 ? empty : <ul className="dt-list">
        {data.batches.map(batch => <li key={batch.id} className="dt-row">
          <span className="dt-mono">{batch.id}</span> {batch.direction} · {batch.candidates}
        </li>)}
      </ul>}
    </Section>
    <Section title={t('researchAttempts')} count={data.attempts.length}>
      {data.attempts.length === 0 ? empty : <ul className="dt-list">
        {data.attempts.map(attempt => <li key={attempt.id} className="dt-row">
          <span className="dt-mono">{attempt.id}</span> · {attempt.verdict} · {attempt.costYuan}
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