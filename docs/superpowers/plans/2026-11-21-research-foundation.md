# 研究代理地基 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 建立研究代理的新域地基——域类型、可检查的不变式、议程文件协议、以及支持它们的 SQLite 仓储——让后续的提案闭环与执行闭环站在一个可测试的底上。

**Architecture:** 新建 src/research/ 放纯域代码（无 I/O、无 DSH 依赖），新建 src/app/store-research.ts 放仓储，沿用现有 Store 的 SQLite 与迁移链。议程是慢状态，落在 research/agenda.md，内容摘要进库。

**Tech Stack:** TypeScript、Node 22 node:sqlite、vitest、pnpm。不新增运行时依赖。

**Spec:** docs/superpowers/specs/2026-11-20-research-superagent-design.md

## 分期

| 计划 | 交付 |
|---|---|
| 1 地基（本文） | 域类型、不变式守卫、议程协议、仓储 |
| 2 提案闭环 | 入口、探路、批判、面板签契约 |
| 3 执行闭环 | Attempt/Protocol、AutoDL 控制面、双重关机、账本 |
| 4 收敛闭环 | 证据包、复现重跑、报告、判死与收成果 |
| 5 通知面与清理 | 飞书卡片；删 GitHub/admission/policy；文档重写 |

## Global Constraints

- 代码与注释用英文；文档用中文。
- 导入带 .ts 后缀（全仓一致）。
- 不新增运行时依赖；SQLite 只用 node:sqlite。
- 测试文件放 tests/，命名 <name>.spec.ts（vitest include 见 vitest.config.ts）。
- 每个任务一次提交，信息用 Conventional Commits，不带 agent 尾巴。
- 纯域代码不得 import 任何 app/ 或 sources/ 下的东西。
- 测试里的换行一律用常量 LF、CRLF，不写转义字面量。

## Review Focus

这五类输入最容易让第一个用户踩坑，每条都在所属任务里配了测试：

1. 人手改过的议程文件——字段缺失、顺序变了、行尾 CRLF。解析器必须报错并指明行号，不能静默跳过。→ Task 3
2. 内容等价但键序不同的契约——哈希必须相同，否则「冻结」形同虚设。→ Task 2
3. 两个收尾同时追加议程——后写的必须察觉基准已变，不能互相覆盖。→ Task 4
4. 已 concluded 的 attempt 追加验证性 run——成本不能丢，状态不能回退。→ Task 7
5. 时间戳混用本地时间与 ISO——排序与「空闲多久」的判断会错。→ Task 1

---

## File Structure

| 文件 | 责任 |
|---|---|
| src/research/model.ts | 域类型、Question 校验、时间戳校验 |
| src/research/contract.ts | 契约规范化、哈希、冻结与校验 |
| src/research/agenda.ts | 议程条目的解析、渲染、摘要、追加 |
| src/research/guards.ts | 可检查的不变式守卫 |
| src/app/store-research.ts | 新域仓储：建表与五个聚合 |
| tests/research-model.spec.ts | Task 1 |
| tests/research-contract.spec.ts | Task 2、6 |
| tests/research-agenda.spec.ts | Task 3、4 |
| tests/research-store.spec.ts | Task 5、6、7 |
| tests/research-guards.spec.ts | Task 8 |
| tests/research-e2e.spec.ts | Task 9 |

---

### Task 1: 域类型与校验

**Files:**
- Create: src/research/model.ts
- Test: tests/research-model.spec.ts
**Interfaces:**
- Produces: Precision、Question、Criterion、Contract、FrozenContract、Attempt、Verdict、Run、Decision；validateQuestion(q: Question): void；isTestable(q: Question): boolean；assertIsoTimestamp(value: string): string

- [ ] **Step 1: 写失败测试**
~~~ts
import { describe, expect, it } from 'vitest'
import { assertIsoTimestamp, isTestable, validateQuestion, type Question } from '../src/research/model.ts'

const q = (over: Partial<Question> = {}): Question => ({
  id: 'Q-0001', statement: 'x', precision: 'hypothesis', status: 'open',
  createdAt: '2026-11-21T00:00:00.000Z', ...over,
})

describe('validateQuestion', () => {
  it('rejects a hypothesis without a prediction', () => {
    expect(() => validateQuestion(q())).toThrow(/prediction/)
  })
  it('accepts a direction without prediction or test', () => {
    expect(() => validateQuestion(q({ precision: 'direction' }))).not.toThrow()
  })
  it('accepts a hypothesis that names its falsifier', () => {
    expect(isTestable(q({ prediction: 'p', test: 't' }))).toBe(true)
  })
})

describe('assertIsoTimestamp', () => {
  it('rejects a local time with no zone', () => {
    expect(() => assertIsoTimestamp('2026-11-21 00:00')).toThrow(/timezone/)
  })
  it('returns the normalized form', () => {
    expect(assertIsoTimestamp('2026-11-21T08:00:00+08:00')).toBe('2026-11-21T00:00:00.000Z')
  })
})
~~~
- [ ] **Step 2: 跑测试确认失败**
Run: pnpm vitest run tests/research-model.spec.ts
Expected: FAIL —— 找不到 src/research/model.ts
- [ ] **Step 3: 实现 src/research/model.ts**
类型：Precision = direction | topic | hypothesis；Question { id; statement; precision; prediction?; test?; status: open|testing|answered|abandoned; createdAt }；Criterion { id; statement; tolerance? }；Contract { version; goal; requirement; criteria: Criterion[]; budgetCapYuan; stopCondition; signedBy; signedAt? }；FrozenContract = Contract & { hash }；Verdict = supported|refuted|inconclusive；Attempt { id; slug; questionId; contractVersion; branch; protocolPath; agendaEntryId?; status: opened|running|waiting|concluded|abandoned; verdict? }；Run { id; attemptId; kind: experiment|verification; machine; image; commit; command; params; startedAt; endedAt?; costYuan?; logPath?; artifacts: string[] }；Decision { id; kind: sign_contract|kill_direction|accept_result; targetId; actor: human; by; at; note? }。
validateQuestion：precision 为 hypothesis 时 prediction 与 test 都必须非空，否则 throw "hypothesis requires a prediction and a test"。isTestable 返回该条件是否满足。
assertIsoTimestamp：用 Date.parse 解析；原串必须带时区标识（结尾 Z 或 ±hh:mm），否则 throw "timestamp must carry a timezone"；返回 toISOString() 的规范化形式。全仓所有时间戳都过它。
- [ ] **Step 4: 跑测试确认通过**
Run: pnpm vitest run tests/research-model.spec.ts；Expected: PASS
- [ ] **Step 5: 提交**
~~~bash
git add src/research/model.ts tests/research-model.spec.ts
git commit -m "feat(research): add the domain types and their validators"
~~~

### Task 2: 契约规范化与冻结哈希

**Files:**
- Create: src/research/contract.ts
- Test: tests/research-contract.spec.ts
**Interfaces:**
- Consumes: Contract, FrozenContract
- Produces: canonicalContract(c: Contract): string；contractHash(c: Contract): string；freezeContract(c: Contract, by: string, at: string): FrozenContract；verifyContract(f: FrozenContract): boolean

- [ ] **Step 1: 写失败测试**
~~~ts
it('hashes equal contracts identically regardless of key order', () => {
  const a = { version: 1, goal: 'g', requirement: 'r', criteria: [{ id: 'c1', statement: 's' }], budgetCapYuan: 100, stopCondition: 't' }
  const b = { stopCondition: 't', budgetCapYuan: 100, criteria: [{ id: 'c1', statement: 's' }], requirement: 'r', goal: 'g', version: 1 }
  expect(contractHash(a as Contract)).toBe(contractHash(b as Contract))
})
it('detects a changed criterion after freezing', () => {
  const f = freezeContract(base, 'human', '2026-11-21T00:00:00.000Z')
  expect(verifyContract({ ...f, budgetCapYuan: 200 })).toBe(false)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-contract.spec.ts
- [ ] **Step 3: 实现 src/research/contract.ts**
canonicalContract 按固定字段顺序与固定键集合序列化（不含 hash 与 signedAt）；contractHash 用 node:crypto 的 createHash("sha256")；freezeContract 写入 signedBy、规范化后的 signedAt 与 hash；verifyContract 重算比对。
- [ ] **Step 4: 跑测试确认通过** — Run: pnpm vitest run tests/research-contract.spec.ts；Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): freeze contracts with a canonical hash"

### Task 3: 议程解析

**Files:**
- Create: src/research/agenda.ts
- Test: tests/research-agenda.spec.ts
**Interfaces:**
- Consumes: assertIsoTimestamp
- Produces: AgendaEntry { id; question; precision; status; conclusion; evidence: string[]; decidedBy; at }；parseAgenda(text: string): AgendaEntry[]

- [ ] **Step 1: 写失败测试（覆盖 Review Focus 1、5）**
~~~ts
const LF = String.fromCharCode(10)
const CRLF = String.fromCharCode(13, 10)
const doc = ['# Agenda', '', '### Q-0001', '- question: 能不能用 X 替代 Y', '- precision: topic', '- status: open', '- conclusion:', '- evidence:', '- decidedBy:', '- at: 2026-11-21T00:00:00.000Z'].join(LF)
it('parses an entry', () => { expect(parseAgenda(doc)[0]?.id).toBe('Q-0001') })
it('names the line number when a field is missing', () => {
  const broken = doc.split(LF).filter(line => line !== '- status: open').join(LF)
  expect(() => parseAgenda(broken)).toThrow(/line 6/)
})
it('accepts CRLF line endings', () => { expect(parseAgenda(doc.replaceAll(LF, CRLF))).toHaveLength(1) })
it('refuses an entry whose time has no zone', () => {
  expect(() => parseAgenda(doc.replace('2026-11-21T00:00:00.000Z', '2026-11-21 00:00'))).toThrow(/timezone/)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-agenda.spec.ts
- [ ] **Step 3: 实现 parseAgenda**
按 ### 标题切块；块内读 - key: value；缺字段或未知字段一律 throw，消息带 1 基行号；先把 CRLF 归一为 LF；evidence 按逗号分隔后 trim、去空；at 过 assertIsoTimestamp。
- [ ] **Step 4: 跑测试确认通过** — Run: pnpm vitest run tests/research-agenda.spec.ts；Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): parse the agenda file strictly"

### Task 4: 议程追加（乐观并发）

**Files:**
- Modify: src/research/agenda.ts
- Test: tests/research-agenda.spec.ts
**Interfaces:**
- Produces: renderEntry(e: AgendaEntry): string；agendaDigest(text: string): string；appendEntry(text: string, e: AgendaEntry, digest: string): string；assertAgendaWriter(role: string): void

- [ ] **Step 1: 写失败测试（覆盖 Review Focus 3）**
~~~ts
it('appends and round-trips', () => {
  const base = '# Agenda' + LF
  expect(parseAgenda(appendEntry(base, entry, agendaDigest(base)))).toHaveLength(1)
})
it('refuses a duplicate id', () => {
  const once = appendEntry('# Agenda' + LF, entry, agendaDigest('# Agenda' + LF))
  expect(() => appendEntry(once, entry, agendaDigest(once))).toThrow(/duplicate/)
})
it('refuses a stale read', () => {
  const base = '# Agenda' + LF
  const digest = agendaDigest(base)
  expect(() => appendEntry(base + '### Q-9999' + LF, entry, digest)).toThrow(/stale/)
})
it('refuses a writer that is not the bookkeeper', () => {
  expect(() => assertAgendaWriter('scout')).toThrow(/bookkeeper/)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-agenda.spec.ts -t stale
- [ ] **Step 3: 实现**
renderEntry 输出与解析器互逆的块；agendaDigest 用 sha256(归一化文本)；appendEntry 先比 digest，不符 throw "stale agenda read"，再 parse 查重复 id，最后在末尾追加空行与新块；assertAgendaWriter 只允许 bookkeeper。
- [ ] **Step 4: 跑测试确认通过** — Run: pnpm vitest run tests/research-agenda.spec.ts；Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): append agenda entries against a stamped read"

### Task 5: 建表与 Question/Contract 仓储

**Files:**
- Create: src/app/store-research.ts
- Modify: src/app/migration.ts（迁移链加一步，SCHEMA_VERSION 加一）
- Test: tests/research-store.spec.ts
**Interfaces:**
- Consumes: Question, FrozenContract
- Produces: createResearchSchema(db: DatabaseSync): void；ResearchRepo { constructor(db); saveQuestion(q); getQuestion(id); saveContract(f); getContract(version) }

- [ ] **Step 1: 写失败测试**
~~~ts
import { DatabaseSync } from 'node:sqlite'
const open = () => { const db = new DatabaseSync(':memory:'); createResearchSchema(db); return new ResearchRepo(db) }
it('round-trips a question', () => {
  const repo = open(); repo.saveQuestion(q)
  expect(repo.getQuestion('Q-0001')?.statement).toBe('x')
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-store.spec.ts
- [ ] **Step 3: 实现**
表：questions(id PK, statement, precision, prediction, test, status, created_at)、contracts(version PK, json, hash, signed_by, signed_at)、attempts(id PK, slug, question_id, contract_version, branch, protocol_path, agenda_entry_id, status, verdict)、runs(id PK, attempt_id, kind, machine, image, commit, command, params, started_at, ended_at, cost_yuan, log_path, artifacts)、decisions(id PK, kind, target_id, actor, by, at, note)。迁移按 migration.ts 现有写法加一步。
- [ ] **Step 4: 跑测试确认通过** — Run: pnpm vitest run tests/research-store.spec.ts
- [ ] **Step 5: 提交** — git commit -m "feat(store): add the research schema and question repository"

### Task 6: 契约版本不可变

**Files:**
- Modify: src/app/store-research.ts
- Test: tests/research-store.spec.ts
**Interfaces:**
- saveContract：版本已存在且 hash 相同为幂等；hash 不同则 throw

- [ ] **Step 1: 写失败测试**
~~~ts
it('refuses to overwrite a frozen contract', () => {
  repo.saveContract(f1)
  expect(() => repo.saveContract({ ...f1, budgetCapYuan: 999, hash: 'other' })).toThrow(/frozen/)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-store.spec.ts -t frozen
- [ ] **Step 3: 实现** — 读同版本行：无则插入；有且 hash 相同则返回；有且 hash 不同则 throw "contract version is frozen"。
- [ ] **Step 4: 跑测试确认通过** — Run: pnpm vitest run tests/research-store.spec.ts
- [ ] **Step 5: 提交** — git commit -m "feat(store): keep frozen contracts immutable"

### Task 7: Attempt 与 Run 的成本归集

**Files:**
- Modify: src/app/store-research.ts
- Test: tests/research-store.spec.ts
**Interfaces:**
- Produces: saveAttempt(a)；getAttempt(id)；addRun(r)；costOfAttempt(id): number

- [ ] **Step 1: 写失败测试（覆盖 Review Focus 4）**
~~~ts
it('sums the runs of an attempt', () => { expect(costOfAttempt('A-1')).toBe(3.5) })
it('accepts a verification run after the attempt concluded', () => {
  repo.saveAttempt({ ...a, status: 'concluded', verdict: 'supported' })
  repo.addRun({ ...r, kind: 'verification' })
  expect(repo.getAttempt('A-1')?.verdict).toBe('supported')
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-store.spec.ts -t verification
- [ ] **Step 3: 实现** — costOfAttempt 用 SUM(cost_yuan)；addRun 不触碰 attempts 行，因此 concluded 后追加不会回退状态。
- [ ] **Step 4: 跑测试确认通过** — Run: pnpm vitest run tests/research-store.spec.ts
- [ ] **Step 5: 提交** — git commit -m "feat(store): attribute run cost to attempts"

### Task 8: 人的决定与两条守卫

**Files:**
- Modify: src/app/store-research.ts
- Create: src/research/guards.ts
- Test: tests/research-guards.spec.ts
**Interfaces:**
- Produces: recordDecision(d: Decision): void；decisionsFor(targetId: string): Decision[]；canDeleteBranch(a: Attempt): { ok: true } | { ok: false; reason: string }；canConclude(evidence: string[]): boolean

- [ ] **Step 1: 写失败测试**
~~~ts
it('refuses a decision written by an agent', () => {
  expect(() => repo.recordDecision({ ...d, actor: 'agent' as never })).toThrow(/human/)
})
it('refuses to delete a branch before the conclusion is in the agenda', () => {
  expect(canDeleteBranch({ ...a, agendaEntryId: undefined }).ok).toBe(false)
})
it('refuses a conclusion that cites no run', () => {
  expect(canConclude([])).toBe(false)
  expect(canConclude(['RUN-0012'])).toBe(true)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-guards.spec.ts
- [ ] **Step 3: 实现** — recordDecision 要求 actor 为 human 且 kind 在三种之内；canDeleteBranch 要求状态为 concluded 或 abandoned 且 agendaEntryId 非空；canConclude 要求 evidence 至少一条（不变式 2）。
- [ ] **Step 4: 跑测试确认通过** — Run: pnpm vitest run tests/research-guards.spec.ts
- [ ] **Step 5: 提交** — git commit -m "feat(research): pin human decisions and the two guards"

### Task 9: 端到端一致性

**Files:**
- Test: tests/research-e2e.spec.ts
**Interfaces:**
- Consumes: 前面全部
- Produces: 无新接口

- [ ] **Step 1: 写一个有顺序的测试**
~~~ts
it('runs a question from creation to a concluded attempt', () => {
  // saveQuestion -> freezeContract -> saveContract -> saveAttempt
  // -> addRun -> canConclude -> canDeleteBranch false
  // -> appendEntry -> canDeleteBranch true
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-e2e.spec.ts
- [ ] **Step 3: 接线** — 若接口对不上，改的是接口而不是测试。
- [ ] **Step 4: 跑全量** — Run: pnpm typecheck && pnpm test；Expected: 全绿
- [ ] **Step 5: 提交** — git commit -m "test(research): cover the foundation end to end"

---
## Self-Review

- Spec 覆盖：设计 §4（域模型与不变式）、§9（存储与议程写协议）、§10（证据包的存储前提）由本计划承担；§5–§8、§11–§12 留给计划 2–5。
- 不变式映射：1（契约不可变）→ Task 2、6；2（结论必须有 run）→ Task 8 canConclude；3（删分支前结论入议程）→ Task 8 canDeleteBranch；4（关机前落盘）与 7（空闲关机）依赖运行时，留给计划 3；5（判死只能由人）→ Task 8；6（提案人≠批判人）、8（预算上限）依赖运行时会话，留给计划 2、3。
- 类型一致性：Attempt.contractVersion 对应 Contract.version；Run.attemptId 对应 Attempt.id；AgendaEntry.evidence 存 Run.id 列表。