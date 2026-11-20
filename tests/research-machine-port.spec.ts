import { describe, expect, it } from 'vitest'
import { httpMachinePort, type MachineEndpoints } from '../src/app/machine-port.ts'

const endpoints: MachineEndpoints = {
  status: 'https://api.test/status', powerOn: 'https://api.test/on',
  powerOff: 'https://api.test/off', balance: 'https://api.test/balance',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('httpMachinePort', () => {
  it('sends the token, the instance and a JSON body', async () => {
    let seen: RequestInit | undefined
    const port = httpMachinePort({ endpoints, token: 't', instanceId: 'i', fetch: async (_url, init) => { seen = init; return json({ status: 'running' }) } })
    await port.status()
    const headers = seen?.headers as Record<string, string>
    expect(headers.authorization).toBe('t')
    expect(JSON.parse(String(seen?.body))).toEqual({ instance_id: 'i' })
  })
  it('reads the status', async () => {
    const port = httpMachinePort({ endpoints, token: 't', instanceId: 'i', fetch: async () => json({ status: 'idle' }) })
    expect(await port.status()).toBe('idle')
  })
  it('refuses an unknown status', async () => {
    const port = httpMachinePort({ endpoints, token: 't', instanceId: 'i', fetch: async () => json({ status: 'zombie' }) })
    await expect(port.status()).rejects.toThrow(/zombie/)
  })
  it('reads the balance', async () => {
    const port = httpMachinePort({ endpoints, token: 't', instanceId: 'i', fetch: async () => json({ balance: 12.5 }) })
    expect(await port.balanceYuan()).toBe(12.5)
  })
  it('maps a rejected request to its status code', async () => {
    const port = httpMachinePort({ endpoints, token: 't', instanceId: 'i', fetch: async () => json({ error: 'denied' }, 403) })
    await expect(port.powerOn()).rejects.toThrow(/403/)
  })
})