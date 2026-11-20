/** The machine, behind a port: the plugin asks for power, status and balance and never learns the provider. */
import type { MachineStatus } from '../research/machine.ts'

/** Where each operation lives. The paths belong to the provider and to the operator who configured them. */
export interface MachineEndpoints {
  status: string
  powerOn: string
  powerOff: string
  balance: string
}

/** What the ledger and the supervisor need from a machine. */
export interface MachinePort {
  status(): Promise<MachineStatus>
  powerOn(): Promise<void>
  powerOff(): Promise<void>
  balanceYuan(): Promise<number>
}

/** Everything the HTTP adapter needs, including the fetch it will use, so tests can stub it. */
export interface MachinePortOptions {
  endpoints: MachineEndpoints
  token: string
  instanceId: string
  fetch?: typeof fetch
}

const STATUSES: readonly MachineStatus[] = ['off', 'booting', 'idle', 'running']

/**
 * Talks to a provider whose four endpoint URLs are configured, so no path is invented here.
 * The token travels in the authorization header and is never logged; a failed call reports the status code and a
 * bounded slice of the body, which is what an operator needs to tell a wrong token from a wrong instance id.
 */
export function httpMachinePort(options: MachinePortOptions): MachinePort {
  const call = async (url: string): Promise<unknown> => {
    const send = options.fetch ?? fetch
    const response = await send(url, {
      method: 'POST',
      headers: { authorization: options.token, 'content-type': 'application/json' },
      body: JSON.stringify({ instance_id: options.instanceId }),
    })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200)
      throw new Error(`machine request failed with ${response.status}: ${detail}`)
    }
    return response.json()
  }
  return {
    async status() {
      const body = await call(options.endpoints.status) as { status?: unknown }
      if (typeof body.status !== 'string' || !STATUSES.includes(body.status as MachineStatus)) {
        throw new Error(`unknown machine status ${String(body.status)}`)
      }
      return body.status as MachineStatus
    },
    async powerOn() { await call(options.endpoints.powerOn) },
    async powerOff() { await call(options.endpoints.powerOff) },
    async balanceYuan() {
      const body = await call(options.endpoints.balance) as { balance?: unknown }
      if (typeof body.balance !== 'number') throw new Error('the balance endpoint returned no number')
      return body.balance
    },
  }
}