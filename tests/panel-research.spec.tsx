// @vitest-environment jsdom
// The research tab.
import { expect, it } from 'vitest'
import { all, click, mount, usePanel } from './fixtures/panel.tsx'

usePanel()

it('opens the research tab and renders its four sections, each empty when nothing waits', async () => {
  await mount()
  await click('研究')
  expect(all('[role="tab"]').map(tab => tab.getAttribute('aria-selected'))).toContain('true')
  expect(all('.dt-section-title').map(title => title.textContent)).toEqual(['待签契约0', '待挑提案0', '待判定尝试0', '报告0'])
  expect(all('.dt-hint').map(hint => hint.textContent).filter(text => text === '暂无。')).toHaveLength(4)
})