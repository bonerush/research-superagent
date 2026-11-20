import { describe, expect, it } from 'vitest'
import { emptyProfile, parseProfile, PROFILE_SECTIONS } from '../src/research/profile.ts'

const LF = String.fromCharCode(10)
const doc = [
  '# 研究画像', '', '## 做什么', '多模态检索。', '', '## 看重什么', '架构上的新机制。', '', '## 不要提什么', '纯调参。',
].join(LF)

describe('parseProfile', () => {
  it('reads the three sections', () => {
    expect(parseProfile(doc)['看重什么']).toContain('架构')
    expect(parseProfile(doc)['做什么']).toBe('多模态检索。')
  })
  it('refuses a document missing a section', () => {
    const broken = doc.split(LF).filter(line => line !== '## 不要提什么').join(LF)
    expect(() => parseProfile(broken)).toThrow(/不要提什么/)
  })
  it('accepts CRLF', () => {
    expect(parseProfile(doc.split(LF).join(String.fromCharCode(13, 10)))['做什么']).toBe('多模态检索。')
  })
})

describe('emptyProfile', () => {
  it('has every section empty', () => {
    const profile = emptyProfile()
    for (const name of PROFILE_SECTIONS) expect(profile[name]).toBe('')
  })
})