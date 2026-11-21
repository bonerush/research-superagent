/** The machine, behind a port: the plugin asks for power, status and balance and never learns the provider. */
import type { MachineStatus } from '../research/machine.ts'

/** Where each operation lives. The paths belong to the provider and to the operator who configured them. */
export interface MachineEndpoints {
  status: string
  powerOn: string
  powerOff: string
  balance: string
}

/**
 * Which request and response shape the endpoints speak.
 * `generic` is the shape this plugin documents: a POST taking `{ instance_id }`, answering `{ status }` and
 * `{ balance }`. `autodl` follows the provider documented at api.autodl.com: `instance_uuid`, a GET for the status,
 * a `data` envelope and a balance in thousandths of a yuan.
 */
export type MachineDialect = 'generic' | 'autodl'

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
  dialect?: MachineDialect
  /** How long one call may take before it is aborted; a hung control plane must not hang the supervisor. */
  timeoutMs?: number
  fetch?: typeof fetch
}

const STATUSES: readonly MachineStatus[] = ['off', 'booting', 'idle', 'running']
const DEFAULT_TIMEOUT_MS = 15_000

/** AutoDL answers a status word; these are the ones its documentation names, mapped onto ours. */
const AUTODL_STATUSES: Record<string, MachineStatus> = {
  running: 'running',
  shutdown: 'off',
  stopped: 'off',
  finished: 'off',
  released: 'off',
  starting: 'booting',
  booting: 'booting',
  creating: 'booting',
}

interface Call {
  method: 'GET' | 'POST'
  body?: unknown
  readBody: boolean
}

/**
 * Talks to a provider whose four endpoint URLs are configured, so no path is invented here.
 * The token travels in the authorization header and never into an error message: a gateway that echoes the header
 * would otherwise put the secret into a log. A failed call reports the status code and a bounded, scrubbed body.
 * Only the calls whose answer is read parse a body; a power call that answers 204 is a success, not a parse error.
 */
export function httpMachinePort(options: MachinePortOptions): MachinePort {
  const dialect = options.dialect ?? 'generic'
  const scrub = (text: string): string => text.split(options.token).join('***')
  const call = async (url: string, request: Call): Promise<unknown> => {
    const send = options.fetch ?? fetch
    const response = await send(url, {
      method: request.method,
      headers: { authorization: options.token, 'content-type': 'application/json' },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
    if (!response.ok) {
      const detail = scrub((await response.text()).slice(0, 200))
      throw new Error(`machine request failed with ${response.status}: ${detail}`)
    }
    if (!request.readBody) {
      await response.body?.cancel()
      return undefined
    }
    return response.json()
  }
  if (dialect === 'autodl') {
    const envelope = (body: unknown): unknown => (body as { data?: unknown } | null)?.data
    return {
      async status() {
        const body = await call(options.endpoints.status, { method: 'GET', body: { instance_uuid: options.instanceId }, readBody: true })
        const word = envelope(body)
        const status = typeof word === 'string' ? AUTODL_STATUSES[word] : undefined
        if (!status) throw new Error(`unknown machine status ${String(word)}`)
        return status
      },
      async powerOn() { await call(options.endpoints.powerOn, { method: 'POST', body: { instance_uuid: options.instanceId, payload: 'gpu' }, readBody: false }) },
      async powerOff() { await call(options.endpoints.powerOff, { method: 'POST', body: { instance_uuid: options.instanceId }, readBody: false }) },
      async balanceYuan() {
        const body = await call(options.endpoints.balance, { method: 'POST', readBody: true })
        const assets = (envelope(body) as { assets?: unknown } | null)?.assets
        if (typeof assets !== 'number') throw new Error('the balance endpoint returned no number')
        return assets / 1000
      },
    }
  }
  return {
    async status() {
      const body = await call(options.endpoints.status, { method: 'POST', body: { instance_id: options.instanceId }, readBody: true })
      const status = (body as { status?: unknown } | null)?.status
      if (typeof status !== 'string' || !STATUSES.includes(status as MachineStatus)) {
        throw new Error(`unknown machine status ${String(status)}`)
      }
      return status as MachineStatus
    },
    async powerOn() { await call(options.endpoints.powerOn, { method: 'POST', body: { instance_id: options.instanceId }, readBody: false }) },
    async powerOff() { await call(options.endpoints.powerOff, { method: 'POST', body: { instance_id: options.instanceId }, readBody: false }) },
    async balanceYuan() {
      const body = await call(options.endpoints.balance, { method: 'POST', body: { instance_id: options.instanceId }, readBody: true })
      const balance = (body as { balance?: unknown } | null)?.balance
      if (typeof balance !== 'number') throw new Error('the balance endpoint returned no number')
      return balance
    },
  }
}