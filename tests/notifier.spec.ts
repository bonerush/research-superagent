import { describe, expect, it } from 'vitest'
import { commandNotifier, runNotifyCommand } from '../src/app/notifier.ts'

describe('commandNotifier', () => {
  it('runs the configured command with the text', async () => {
    const calls: [string, string][] = []
    const notifier = commandNotifier('my-notify', async (command, text) => { calls.push([command, text]) })
    await notifier.notify('batch B-1 waits for a pick')
    expect(calls).toEqual([['my-notify', 'batch B-1 waits for a pick']])
  })
  it('surfaces a failing command', async () => {
    const notifier = commandNotifier('my-notify', async () => { throw new Error('exit 1') })
    await expect(notifier.notify('x')).rejects.toThrow(/exit 1/)
  })
})

describe('runNotifyCommand', () => {
  it('runs a real command through the shell', async () => {
    const command = '"' + process.execPath + '" -e "process.exit(0)"'
    await expect(runNotifyCommand(command, 'hello')).resolves.toBeUndefined()
  })
  it('fails when the command exits non-zero', async () => {
    const command = '"' + process.execPath + '" -e "process.exit(3)"'
    await expect(runNotifyCommand(command, 'hello')).rejects.toThrow(/exited 3/)
  })
})