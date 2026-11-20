import { describe, expect, it } from 'vitest'
import { supervise } from '../src/app/machine-supervisor.ts'
import type { MachinePort } from '../src/app/machine-port.ts'
import type { MachineStatus } from '../src/research/machine.ts'

const HOUR = 3_600_000
const AT = '2026-11-21T00:00:00.000Z'
const LATE = '2026-11-21T02:00:00.000Z'
const fakePort = (status: MachineStatus, calls: string[]): MachinePort => ({
  status: async () => status,
  powerOn: async () => { calls.push('powerOn') },
  powerOff: async () => { calls.push('powerOff') },
  balanceYuan: async () => 100,
})

describe('supervise', () => {
  it('powers off an idle machine once and records when', async () => {
    const calls: string[] = []
    const result = await supervise({ port: fakePort('idle', calls), activity: { jobRunning: false, lastSessionAt: AT }, now: LATE, idleMs: HOUR, onPowerOff: at => calls.push('at=' + at) })
    expect(result).toBe('powered-off')
    expect(calls.filter(entry => entry === 'powerOff')).toHaveLength(1)
    expect(calls).toContain('at=' + LATE)
  })
  it('keeps a machine with a running job', async () => {
    const calls: string[] = []
    const result = await supervise({ port: fakePort('running', calls), activity: { jobRunning: true }, now: LATE, idleMs: HOUR, onPowerOff: () => {} })
    expect(result).toBe('kept')
    expect(calls).toEqual([])
  })
  it('does nothing when the machine is already off', async () => {
    const calls: string[] = []
    const result = await supervise({ port: fakePort('off', calls), activity: { jobRunning: false }, now: LATE, idleMs: HOUR, onPowerOff: () => {} })
    expect(result).toBe('off')
    expect(calls).toEqual([])
  })
  it('keeps a machine that was busy a minute ago', async () => {
    const calls: string[] = []
    const result = await supervise({ port: fakePort('idle', calls), activity: { jobRunning: false, lastSessionAt: '2026-11-21T01:59:00.000Z' }, now: LATE, idleMs: HOUR, onPowerOff: () => {} })
    expect(result).toBe('kept')
  })
})