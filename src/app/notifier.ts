/** Where the research loop tells a person that something is waiting, outside the panel. */
import { spawn } from 'node:child_process'

/** One short line; the adapter decides where it lands. */
export interface Notifier {
  notify(text: string): Promise<void>
}

/** The runner a notifier uses: the command the operator configured, the text on stdin. */
export type NotifyRunner = (command: string, text: string) => Promise<void>

/**
 * The operator supplies the command, so no vendor syntax is invented here: whatever reaches their phone is their
 * own script, reading the message on stdin. An unset command means no notifier at all rather than a silent no-op.
 */
export function commandNotifier(command: string, run: NotifyRunner): Notifier {
  return {
    notify: async (text: string) => { await run(command, text) },
  }
}
/**
 * Runs the operator command through the platform shell with the message on stdin.
 * A child that writes to stderr and exits non-zero fails the notification, and the caller decides whether to surface
 * it: a missed notification must not quietly look like a delivered one.
 */
export function runNotifyCommand(command: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ['pipe', 'ignore', 'pipe'] })
    let detail = ''
    child.stderr.on('data', chunk => { detail = (detail + String(chunk)).slice(0, 400) })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`notify command exited ${String(code)}: ${detail.trim()}`))
    })
    child.stdin.end(text)
  })
}