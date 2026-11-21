#!/usr/bin/env node
/**
 * Reads one line of text on stdin and posts it to a Feishu custom-bot webhook.
 * The webhook (and, when the bot uses signing, the secret) come from the environment so nothing secret is committed.
 */
import { createHmac } from 'node:crypto'

const webhook = process.env.FEISHU_WEBHOOK
if (!webhook) { console.error('FEISHU_WEBHOOK is not set'); process.exit(2) }

const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const text = Buffer.concat(chunks).toString('utf8').trim()
if (!text) { console.error('no message on stdin'); process.exit(2) }

const body = { msg_type: 'text', content: { text } }
const secret = process.env.FEISHU_SECRET
if (secret) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const sign = createHmac('sha256', timestamp + '\n' + secret).update('').digest('base64')
  Object.assign(body, { timestamp, sign })
}

const response = await fetch(webhook, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
const answer = await response.text()
if (!response.ok) { console.error(`feishu webhook answered ${response.status}: ${answer.slice(0, 200)}`); process.exit(1) }
// Feishu answers 200 with a code that is not 0 when the payload is refused; that is a failure too.
try {
  const parsed = JSON.parse(answer)
  const code = parsed.code ?? parsed.StatusCode ?? parsed.status_code
  if (code !== undefined && code !== 0) { console.error(`feishu refused the message: ${answer.slice(0, 200)}`); process.exit(1) }
} catch { /* a non-JSON answer is not a refusal when the status was 2xx */ }