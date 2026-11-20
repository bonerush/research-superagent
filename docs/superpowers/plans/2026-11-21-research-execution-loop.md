# 执行闭环 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 让一个已签契约变成可追溯的实验：事前登记协议、开尝试、开机、跑、落盘、关机、按 run 记账，并把五个研究工具收成一个多路复用的 `research` 工具，别再把主会话的工具预算撑破。

**Architecture:** Attempt 与 Protocol 是账本，机器是外部世界。插件不直接跑实验：它用 `MachinePort` 开关机、用 supervisor 按空闲规则止损，用 run 记录每次上机的机器、提交、命令与花费。工具层从五个合并成一个 `research`，动作用判别联合。

**Tech Stack:** TypeScript、node:sqlite、zod、vitest、node:http（测试里的桩服务器）。不新增运行时依赖。

**Spec:** docs/superpowers/specs/2026-11-20-research-superagent-design.md（§5.3、§6、§6.3、§6.4）

## Global Constraints

- 代码与注释用英文；文档用中文。
- 导入带 .ts 后缀。
- 纯域代码不得 import app/ 或 sources/。
- 时间戳一律过 `assertIsoTimestamp`。
- 每个任务一次提交，Conventional Commits，不带 agent 尾巴。
- 换行常量用 `String.fromCharCode`，测试里不写转义字面量。
- token 只从环境变量读，永不落库、永不写进日志。

## Review Focus

1. 协议里没有为某条契约判据写测量方式——必须在登记时拒绝，而不是等跑完才发现无法判定。→ Task 2
2. 尝试没有跑过任何 run 就被判为 supported——必须拒绝。→ Task 3
3. 机器上还有作业在跑，却被空闲规则关掉——判定必须把运行中的作业算作活动。→ Task 6
4. 开机请求与关机请求之间进程崩溃，留下计费的机器——supervisor 必须在重启后仍能判定并关机。→ Task 8
5. 同一台机器上的两次 run 时间重叠，成本被算两遍——归集必须按实际重叠切分或拒绝。→ Task 5

---

## File Structure

| 文件 | 责任 |
|---|---|
| src/research/protocol.ts | 事前登记协议的类型与校验 |
| src/research/attempt.ts | 尝试的生命周期与守卫 |
| src/research/ledger.ts | 费率、run 成本与尝试归集 |
| src/research/machine.ts | 机器状态与空闲关机判定（纯函数） |
| src/app/machine-port.ts | MachinePort 接口与配置化端点适配器 |
| src/app/machine-supervisor.ts | 按空闲规则止损的 supervisor |
| src/app/tools/research.ts | 合并成一个 `research` 工具 |
| src/app/store-research.ts | attempts 增加 protocol 列与查询 |
| tests/research-protocol.spec.ts | Task 2 |
| tests/research-attempt.spec.ts | Task 3 |
| tests/research-ledger.spec.ts | Task 5 |
| tests/research-machine.spec.ts | Task 6 |
| tests/research-machine-port.spec.ts | Task 7 |
| tests/research-supervisor.spec.ts | Task 8 |
| tests/research-execution.spec.ts | Task 9 |

---

### Task 1: 五个工具收成一个 `research`

**Files:**
- Modify: src/app/tools/research.ts
- Test: tests/research-loop.spec.ts
- Modify: tests/model-surface.spec.ts（只在需要时调整预算）
**Interfaces:**
- Produces: `researchTool(repo): Tool`，schema 为 `{ action: propose|critique|pick|sign|status, ... }` 的判别联合；旧五个名字不再注册

- [ ] **Step 1: 改测试，按新入口驱动**
~~~ts
const research = researchTool(store)
await research.execute({ action: 'propose', id: 'B-1', direction: 'd', candidates: [candidate(1), candidate(2)] }, signal)
await research.execute({ action: 'critique', batchId: 'B-1', reviews: [...] }, signal)
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-loop.spec.ts
- [ ] **Step 3: 实现判别联合**
schema 用 `z.discriminatedUnion("action", [...])`；每个分支复用原有的参数 schema；`execute` 按 action 分派到同一组服务函数。工具描述压到两句以内。
- [ ] **Step 4: 跑测试与预算** — Run: `pnpm vitest run tests/research-loop.spec.ts tests/model-surface.spec.ts`；Expected: 全绿，且工具面字符数低于 61,500
- [ ] **Step 5: 提交** — git commit -m "refactor(research): multiplex the proposal tools behind one action"

### Task 2: 事前登记协议

**Files:**
- Create: src/research/protocol.ts
- Test: tests/research-protocol.spec.ts
**Interfaces:**
- Produces: `Protocol`、`Measurement`、`validateProtocol(p: Protocol, contract: Contract): void`

- [ ] **Step 1: 写失败测试**
~~~ts
it('refuses a protocol that measures no criterion', () => {
  expect(() => validateProtocol(proto({ measurements: [] }), contract)).toThrow(/criterion/)
})
it('refuses a protocol with no command', () => {
  expect(() => validateProtocol(proto({ commands: [] }), contract)).toThrow(/command/)
})
it('refuses a protocol for a different contract version', () => {
  expect(() => validateProtocol(proto({ contractVersion: 9 }), contract)).toThrow(/contract/)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-protocol.spec.ts
- [ ] **Step 3: 实现**
类型：Measurement { criterionId; from }、Protocol { attemptId; questionId; contractVersion; commands: string[]; measurements: Measurement[]; expected; stopCondition; machineHours; registeredAt }。校验：契约的每条 criterion 都要有 measurement；commands 至少一条；stopCondition 非空；machineHours 为正；contractVersion 必须等于契约版本。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): pre-register the experiment protocol"

### Task 3: 尝试的生命周期

**Files:**
- Create: src/research/attempt.ts
- Test: tests/research-attempt.spec.ts
**Interfaces:**
- Consumes: Attempt、Run、canConclude
- Produces: `openAttempt(protocol, at): Attempt`、`start(a: Attempt): Attempt`、`wait(a: Attempt): Attempt`、`conclude(a: Attempt, verdict, evidence: string[]): Attempt`

- [ ] **Step 1: 写失败测试（覆盖 Review Focus 2）**
~~~ts
it('opens as opened', () => { expect(openAttempt(proto, AT).status).toBe('opened') })
it('refuses to conclude without a run', () => {
  expect(() => conclude(start(open), 'supported', [])).toThrow(/run/)
})
it('refuses to start twice', () => { expect(() => start(start(open))).toThrow(/running/) })
it('waits and resumes', () => {
  const waiting = wait(start(open))
  expect(waiting.status).toBe('waiting')
  expect(start(waiting).status).toBe('running')
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-attempt.spec.ts
- [ ] **Step 3: 实现**
openAttempt 由协议派生：id 取 protocol.attemptId，slug 与 branch 由调用方随后写入（本函数只放 id、questionId、contractVersion、status）。start 只接受 opened 或 waiting；wait 只接受 running；conclude 要求 status 为 running 或 waiting、evidence 至少一条（复用 canConclude），并写入 verdict。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): drive an attempt through its states"

### Task 4: 存储里的协议与查询

**Files:**
- Modify: src/app/store-research.ts
- Test: tests/research-batch-store.spec.ts（追加）, 或新建 tests/research-attempt-store.spec.ts
**Interfaces:**
- Produces: attempts 表增加 `protocol TEXT`；`saveAttempt` 写协议；`getProtocol(attemptId): Protocol | undefined`；`listAttempts(status?): Attempt[]`

- [ ] **Step 1: 写失败测试**
~~~ts
it('round-trips the protocol with the attempt', () => {
  repo.saveAttempt(a); repo.saveProtocol(proto)
  expect(repo.getProtocol('A-1')?.contractVersion).toBe(1)
})
it('lists attempts by status', () => { expect(repo.listAttempts('opened')).toHaveLength(1) })
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-attempt-store.spec.ts
- [ ] **Step 3: 实现**
ALTER 语句用 `CREATE TABLE IF NOT EXISTS` 的既有做法无法加列，因此在 `createResearchSchema` 里对 attempts 建表语句直接加列，并在 `createResearchSchema` 末尾补一条 `ALTER TABLE attempts ADD COLUMN protocol TEXT` 的容错执行（已存在则忽略错误）。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(store): keep the protocol beside its attempt"

### Task 5: 账本

**Files:**
- Create: src/research/ledger.ts
- Test: tests/research-ledger.spec.ts
**Interfaces:**
- Produces: `Rate`（machine → yuan/hour）、`runCost(run: Run, rates: Record<string, number>): number`、`attemptCost(runs: Run[], rates): number`

- [ ] **Step 1: 写失败测试（覆盖 Review Focus 5）**
~~~ts
it('charges by the minute of the boot', () => {
  expect(runCost(hourRun(), RATES)).toBe(2)
})
it('refuses a run whose end precedes its start', () => {
  expect(() => runCost(badRun(), RATES)).toThrow(/ended/)
})
it('refuses overlapping runs on one machine', () => {
  expect(() => attemptCost([run(0, 60), run(30, 90)], RATES)).toThrow(/overlap/)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-ledger.spec.ts
- [ ] **Step 3: 实现**
runCost 用 (endedAt - startedAt) 的分钟数除以 60 乘费率；未知机型 throw；结束早于开始 throw。attemptCost 先按机器分组、按开始时间排序，检查区间不重叠，再求和。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): price each run and refuse overlapping ones"

### Task 6: 机器状态与空闲判定

**Files:**
- Create: src/research/machine.ts
- Test: tests/research-machine.spec.ts
**Interfaces:**
- Produces: `MachineStatus = off | booting | idle | running`、`Activity { jobRunning; lastJobEndedAt?; lastSessionAt?; lastTransferAt? }`、`shouldPowerOff(activity, now: string, idleMs: number): boolean`

- [ ] **Step 1: 写失败测试（覆盖 Review Focus 3）**
~~~ts
it('keeps the machine when a job runs', () => {
  expect(shouldPowerOff({ jobRunning: true }, '2026-11-21T02:00:00.000Z', HOUR)).toBe(false)
})
it('powers off after an hour of no activity', () => {
  expect(shouldPowerOff({ jobRunning: false, lastSessionAt: '2026-11-21T00:00:00.000Z' }, '2026-11-21T01:00:00.000Z', HOUR)).toBe(true)
})
it('ignores a timestamp from the future', () => {
  expect(shouldPowerOff({ jobRunning: false, lastSessionAt: '2026-11-22T00:00:00.000Z' }, '2026-11-21T01:00:00.000Z', HOUR)).toBe(false)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-machine.spec.ts
- [ ] **Step 3: 实现**
取三种活动时间里最晚的一个；没有活动时间时视为刚开机（不关机）；未来时间按「现在」处理（不关机）；差值大于等于 idleMs 才关机。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): decide when an idle machine should stop"

### Task 7: MachinePort 与端点适配器

**Files:**
- Create: src/app/machine-port.ts
- Test: tests/research-machine-port.spec.ts
**Interfaces:**
- Produces: `MachinePort { status(); powerOn(); powerOff(); balanceYuan() }`、`httpMachinePort({ endpoints, token, instanceId, fetch? }): MachinePort`、`MachineEndpoints { status; powerOn; powerOff; balance }`

- [ ] **Step 1: 写失败测试（用假 fetch）**
~~~ts
it('sends the token header and the instance id', async () => {
  const calls: RequestInit[] = []
  const port = httpMachinePort({ endpoints, token: 't', instanceId: 'i', fetch: async (_url, init) => { calls.push(init!); return json({ status: 'running' }) } })
  await port.status()
  expect(calls[0]?.headers).toMatchObject({ authorization: 't' })
})
it('maps a rejected request to the status code', async () => {
  const port = httpMachinePort({ ..., fetch: async () => json({ error: 'denied' }, 403) })
  await expect(port.powerOn()).rejects.toThrow(/403/)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-machine-port.spec.ts
- [ ] **Step 3: 实现**
四个端点都在 `MachineEndpoints` 里由配置给出，不写死路径；请求用 POST + JSON，头带 `authorization` 与 `content-type`；非 2xx 时把状态码与响应体前 200 字带进错误；`balanceYuan` 从响应体的 `balance` 字段读数字。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): talk to the machine through configured endpoints"

### Task 8: supervisor 与止损

**Files:**
- Create: src/app/machine-supervisor.ts
- Test: tests/research-supervisor.spec.ts
**Interfaces:**
- Produces: `supervise({ port, activity, now, idleMs, onPowerOff }): Promise<topped|kept|off>`

- [ ] **Step 1: 写失败测试（覆盖 Review Focus 4）**
~~~ts
it('powers off an idle machine once', async () => {
  const calls: string[] = []
  const result = await supervise({ port: fakePort({ status: 'idle', calls }), activity: idle(), now: LATE, idleMs: HOUR, onPowerOff: at => calls.push(at) })
  expect(result).toBe('powered-off')
  expect(calls.filter(c => c === 'powerOff')).toHaveLength(1)
})
it('keeps a machine with a running job', async () => {
  expect(await supervise({ ...base, activity: { jobRunning: true } })).toBe('kept')
})
it('does nothing when the machine is already off', async () => {
  expect(await supervise({ ...base, port: fakePort({ status: 'off' }) })).toBe('off')
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-supervisor.spec.ts
- [ ] **Step 3: 实现**
先读状态：off 直接返回；否则用 `shouldPowerOff` 判定；要关时调 `port.powerOff()` 再 `onPowerOff(now)` 记录。状态读取失败时返回 kept，并把错误交给调用方（不吞）。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): stop an idle machine from the supervisor"

### Task 9: 端到端

**Files:**
- Test: tests/research-execution.spec.ts
**Interfaces:**
- Consumes: 前面全部
- Produces: 无新接口

- [ ] **Step 1: 写串起来的测试**
~~~ts
it('runs a signed contract to a concluded attempt with its cost', async () => {
  // sign -> protocol -> openAttempt -> start -> run -> conclude -> cost
  expect(attempt.verdict).toBe('supported')
  expect(repo.costOfAttempt(attempt.id)).toBeCloseTo(2)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-execution.spec.ts
- [ ] **Step 3: 接线** — 接口对不上时改接口，不改测试。
- [ ] **Step 4: 跑全量** — Run: `pnpm typecheck && pnpm test`；Expected: 新增全绿，既有 9 文件 / 39 测试仍是唯一失败
- [ ] **Step 5: 提交** — git commit -m "test(research): cover the execution loop end to end"

---
## 边界（本计划不做）

- AutoDL 的真实端点路径：由配置给出，等有账号文档再填；本计划只保证协议、鉴权头与错误映射。
- 实验产物回收与复现重跑：计划 4。
- 面板与飞书：计划 5。

## Self-Review

- Spec 覆盖：§5.3 执行阶段、§6.1 控制面、§6.3 双重关机（第二层）、§6.4 账本由本计划承担；§6.1 的第一层（脚本自杀）属于实验脚本，留给协议文本。
- 五条 Review Focus 都落在具体任务：1 → Task 2；2 → Task 3；3 → Task 6；4 → Task 8；5 → Task 5。
- Task 1 先做，是因为再加四个工具会再次顶爆主会话预算；合并后新增动作只增加联合分支，不再增加工具条数。
## Rulings（执行时的偏离与决定）

**R1 — 五个工具合并成一个 `research`，动作用判别联合。** 序列化后从 3,281 字符降到 2,684。工具面总量仍是 60,366，超过原始 59,000，所以 61,500 的预算保留；省下的部分留给后续动作，不再抬第二次。

**R2 — 协议用独立的 `protocols` 表，而不是给 attempts 加列。** `CREATE TABLE IF NOT EXISTS` 对已存在的库天然幂等，省掉 `ALTER TABLE` 的容错分支，也不用在启动时读 `PRAGMA table_info`。

**R3 — `openAttempt(protocol, naming)`，不是计划里的 `(protocol, at)`。** `Attempt` 没有创建时间字段，它需要的外部输入是 slug、branch 与 protocolPath。

**R4 — 账本按机器分组检测重叠。** 同一台机器上的两个 run 区间重叠拒绝（会重复计费，也说明记录有误）；不同机器允许重叠。

**R5 — run 的价格在入库前由 `runCost` 算好写进 `costYuan`。** 存储只做归集，不持有费率表；费率属于部署配置，改价不该触发数据迁移。

**R6 — 主会话字符预算 61,500 → 63,000。** 工具面序列化后 20,405（`research` 单工具 4,917），合计 62,599。执行动作必须挂在人能说话的那个会话上，否则闭环没有入口；拆成第二个工具不会更省，名称与描述反而增加。

**R7 — `research` 增加 protocol、attempt、run、machine 四个动作。** `attempt` 的 open 从已登记协议派生；`conclude` 先核对每条证据都属于该尝试的 run，再下结论。

**R8 — 机器由环境变量配置**（`RESEARCH_MACHINE_TOKEN`、`RESEARCH_MACHINE_INSTANCE` 与四个 `_URL`）。未配置时机器动作报错而不是假装可用；supervisor 每分钟一轮，失败只记日志不影响主循环。
