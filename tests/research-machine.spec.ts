import { describe, expect, it } from 'vitest'
import { shouldPowerOff } from '../src/research/machine.ts'

const HOUR = 3_600_000
const AT = '2026-11-21T00:00:00.000Z'
const LATER = '2026-11-21T01:00:00.000Z'

describe('shouldPowerOff', () => {
  it('keeps the machine while a job runs', () => {
    expect(shouldPowerOff({ jobRunning: true }, LATER, HOUR)).toBe(false)
  })
  it('powers off after an hour with no activity', () => {
    expect(shouldPowerOff({ jobRunning: false, lastSessionAt: AT }, LATER, HOUR)).toBe(true)
  })
  it('keeps the machine before the hour is up', () => {
    expect(shouldPowerOff({ jobRunning: false, lastSessionAt: AT }, '2026-11-21T00:59:00.000Z', HOUR)).toBe(false)
  })
  it('counts the latest of the activities', () => {
    expect(shouldPowerOff({ jobRunning: false, lastSessionAt: AT, lastTransferAt: '2026-11-21T00:50:00.000Z' }, LATER, HOUR)).toBe(false)
  })
  it('treats a timestamp from the future as now', () => {
    expect(shouldPowerOff({ jobRunning: false, lastSessionAt: '2026-11-22T00:00:00.000Z' }, LATER, HOUR)).toBe(false)
  })
  it('keeps a machine with nothing recorded, as if just booted', () => {
    expect(shouldPowerOff({ jobRunning: false }, LATER, HOUR)).toBe(false)
  })
})