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
  /** How long one call may take before it is aborted; a hung control plane must not hang the supervisor. */
  timeoutMs?: number
  fetch?: typeof fetch
}

const STATUSES: readonly MachineStatus[] = ['off', 'booting', 'idle', 'running']
const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Talks to a provider whose four endpoint URLs are configured, so no path is invented here.
 * The token travels in the authorization header and never into an error message: a gateway that echoes the header
 * would otherwise put the secret into a log. A failed call reports the status code and a bounded, scrubbed body.
 * Only the endpoints whose answer is read parse a body; a power call that answers 204 is a success, not a parse error.
 */
export function httpMachinePort(options: MachinePortOptions): MachinePort {
  const scrub = (text: string): string => text.split(options.token).join('***')
  const call = async (url: string, readBody: boolean): Promise<unknown> => {
    const send = options.fetch ?? fetch
    const response = await send(url, {
      method: 'POST',
      headers: { authorization: options.token, 'content-type': 'application/json' },
      body: JSON.stringify({ instance_id: options.instanceId }),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
    if (!response.ok) {
      const detail = scrub((await response.text()).slice(0, 200))
      throw new Error(`machine request failed with ${response.status}: ${detail}`)
    }
    if (!readBody) {
      await response.body?.cancel()
      return undefined
    }
    return response.json()
  }
  return {
    async status() {
      const body = await call(options.endpoints.status, true)
      const status = (body as { status?: unknown } | null)?.status
      if (typeof status !== 'string' || !STATUSES.includes(status as MachineStatus)) {
        throw new Error(`unknown machine status ${String(status)}`)
      }
      return status as MachineStatus
    },
    async powerOn() { await call(options.endpoints.powerOn, false) },
    async powerOff() { await call(options.endpoints.powerOff, false) },
    async balanceYuan() {
      const body = await call(options.endpoints.balance, true)
      const balance = (body as { balance?: unknown } | null)?.balance
      if (typeof balance !== 'number') throw new Error('the balance endpoint returned no number')
      return balance
    },
  }
}