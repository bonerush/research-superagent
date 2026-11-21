import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { httpMachinePort, type MachineEndpoints } from '../src/app/machine-port.ts'

const endpoints: MachineEndpoints = {
  status: 'https://api.autodl.com/api/v1/dev/instance/pro/status',
  powerOn: 'https://api.autodl.com/api/v1/dev/instance/pro/power_on',
  powerOff: 'https://api.autodl.com/api/v1/dev/instance/pro/power_off',
  balance: 'https://api.autodl.com/api/v1/dev/wallet/balance',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const port = (fetch: typeof globalThis.fetch) => httpMachinePort({ endpoints, token: 't', instanceId: 'pro-1', dialect: 'autodl', fetch })

describe('the AutoDL dialect', () => {
  it('asks for the status with the instance uuid in the body of a GET', async () => {
    let seen: RequestInit | undefined
    const status = await port(async (_url, init) => { seen = init; return json({ code: 'Success', data: 'running', msg: '' }) }).status()
    expect(status).toBe('running')
    expect(seen?.method).toBe('GET')
    expect(JSON.parse(String(seen?.body))).toEqual({ instance_uuid: 'pro-1' })
  })
  it('reads a shutdown instance as off', async () => {
    expect(await port(async () => json({ code: 'Success', data: 'shutdown' })).status()).toBe('off')
  })
  it('reads an instance that is still coming up as booting', async () => {
    expect(await port(async () => json({ code: 'Success', data: 'starting' })).status()).toBe('booting')
  })
  it('refuses a status it does not know', async () => {
    await expect(port(async () => json({ code: 'Success', data: 'zombie' })).status()).rejects.toThrow(/unknown machine status/)
  })
  it('powers on with the gpu payload AutoDL requires', async () => {
    let seen: RequestInit | undefined
    await port(async (_url, init) => { seen = init; return json({ code: 'Success', data: null }) }).powerOn()
    expect(seen?.method).toBe('POST')
    expect(JSON.parse(String(seen?.body))).toEqual({ instance_uuid: 'pro-1', payload: 'gpu' })
  })
  it('reads the balance in yuan from assets in thousandths', async () => {
    const balance = await port(async () => json({ code: 'Success', data: { assets: 12345, accumulate: 0, voucher_balance: 0 } })).balanceYuan()
    expect(balance).toBe(12.345)
  })
  it('reports a failed call without leaking the token', async () => {
    await expect(port(async () => json({ msg: 'bad token t' }, 401)).status()).rejects.toThrow(/\*\*\*/)
  })
})