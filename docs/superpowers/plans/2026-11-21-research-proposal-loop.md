# 提案闭环 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 让研究代理能从一条方向产出五份候选提案、过批判预筛、由人挑一个、起草并签下验收契约——契约一旦签下即冻结，作为后续所有尝试的验收基准。

**Architecture:** 提案是账本，模型是写作者。插件不直接调模型，而是给主会话一组工具：探路 agent 用 research_propose 交批次，批判 agent 用 research_critique 交意见，人用 research_pick 与 research_sign 做决定。插件负责校验、存档、拒绝不合格的输入，并把人的决定记成不可变的 Decision。

**Tech Stack:** TypeScript、node:sqlite、zod、vitest。不新增运行时依赖。

**Spec:** docs/superpowers/specs/2026-11-20-research-superagent-design.md（§5 阶段一、§8 三个点头点）

## Global Constraints

- 代码与注释用英文；文档用中文。
- 导入带 .ts 后缀。
- 纯域代码不得 import app/ 或 sources/。
- 时间戳一律过 assertIsoTimestamp。
- 每个任务一次提交，Conventional Commits，不带 agent 尾巴。
- 测试文件 tests/<name>.spec.ts；换行常量用 String.fromCharCode，不写转义字面量。

## Review Focus

1. 一份只有 2 条先例的提案，或 delta 与 prior 指向同一篇——必须被拒。→ Task 2
2. 批判 agent 把某一项判为 drop，但批次仍被端给人——必须不可能。→ Task 4
3. 人挑了一个已经被批判 drop 的候选——必须被拒。→ Task 5
4. 同一份契约被签两次，或被签后改写——必须被拒。→ Task 7
5. 提案里的 hypothesis 没有预测或判据——必须被拒，而不是留到实验阶段。→ Task 1

---

## File Structure

| 文件 | 责任 |
|---|---|
| src/research/proposal.ts | 候选、批次、批判的类型与校验 |
| src/research/profile.ts | 画像文件协议：解析与最小必填节 |
| src/research/batch.ts | 批次的服务：保存、记录批判、判定能否呈现 |
| src/research/pick.ts | 挑选与拒绝：人的决定 + 品味信号 |
| src/research/draft.ts | 从候选起草契约 |
| src/research/sign.ts | 签发：冻结、存档、记录 Decision |
| src/app/tools/research.ts | 主会话的五个研究工具 |
| tests/research-proposal.spec.ts | Task 1、2 |
| tests/research-profile.spec.ts | Task 3 |
| tests/research-batch.spec.ts | Task 4 |
| tests/research-pick.spec.ts | Task 5 |
| tests/research-contract-draft.spec.ts | Task 6 |
| tests/research-sign.spec.ts | Task 7 |
| tests/research-loop.spec.ts | Task 8 |

---

### Task 1: 提案的类型与校验

**Files:**
- Create: src/research/proposal.ts
- Test: tests/research-proposal.spec.ts
**Interfaces:**
- Produces: Prior、Candidate、Critique、Batch、BatchStatus；validateCandidate(c: Candidate): void；validateBatch(b: Batch): void

- [ ] **Step 1: 写失败测试**
~~~ts
const cand = (over: Partial<Candidate> = {}): Candidate => ({
  id: 'P-1-1', question: 'q', precision: 'topic', why: 'w',
  priors: [{ work: 'A', delta: 'd1' }, { work: 'B', delta: 'd2' }, { work: 'C', delta: 'd3' }],
  feasibility: { data: 'd', hardware: '1x4090', days: 7, yuan: 200 },
  protocolDraft: 'p', risk: 'r', ...over,
})
it('rejects a candidate with fewer than three priors', () => {
  expect(() => validateCandidate(cand({ priors: cand().priors.slice(0, 2) }))).toThrow(/three/)
})
it('rejects a prior without a delta', () => {
  expect(() => validateCandidate(cand({ priors: [{ work: 'A', delta: ' ' }, ...cand().priors.slice(1)] }))).toThrow(/delta/)
})
it('rejects a hypothesis without a falsifier', () => {
  expect(() => validateCandidate(cand({ precision: 'hypothesis' }))).toThrow(/prediction/)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-proposal.spec.ts
- [ ] **Step 3: 实现**
类型：Prior { work; delta }、Candidate { id; question; precision; prediction?; test?; why; priors: Prior[]; feasibility { data; hardware; days; yuan }; protocolDraft; risk }、Critique { candidateId; verdict: keep|drop; reason }、BatchStatus = draft | reviewed | picked、Batch { id; direction; candidates: Candidate[]; critiques: Critique[]; rejections: { candidateId; reason }[]; contractVersion?; createdAt; status }。
validateCandidate：priors 少于 3 条 throw "a candidate needs at least three prior works"；任一 prior 的 work 或 delta 为空 throw "every prior needs a delta"；precision 为 hypothesis 时 prediction 与 test 必填（复用 model 的 validateQuestion）。
validateBatch：候选 1–5 条；id 唯一；id 形如 P-<批次序号>-<序>。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): validate proposal candidates and batches"

### Task 2: 批次的服务：保存与呈现门槛

**Files:**
- Create: src/research/batch.ts
- Test: tests/research-proposal.spec.ts
**Interfaces:**
- Consumes: Batch、Critique、validateBatch
- Produces: saveBatch(batch: Batch, now: string): Batch；presentable(batch: Batch): boolean；survivors(batch: Batch): Candidate[]

- [ ] **Step 1: 写失败测试（覆盖 Review Focus 1、5）**
~~~ts
it('is not presentable until every candidate has a critique', () => {
  const batch = saveBatch(raw(), '2026-11-21T00:00:00.000Z')
  expect(presentable(batch)).toBe(false)
})
it('drops a candidate the critic killed', () => {
  const reviewed = critique(batch, [{ candidateId: 'P-1-1', verdict: 'drop', reason: 'not novel' }])
  expect(survivors(reviewed).map(c => c.id)).not.toContain('P-1-1')
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-proposal.spec.ts -t presentable
- [ ] **Step 3: 实现**
saveBatch 校验后返回规范化批次（状态 draft，rejections 空，critiques 空，createdAt 归一化）。presentable 要求状态不是 draft、每条候选都有 critique、且至少一条 verdict 为 keep。survivors 返回所有 verdict 不是 drop 的候选。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): gate a proposal batch on its critique"

### Task 3: 画像文件协议

**Files:**
- Create: src/research/profile.ts
- Test: tests/research-profile.spec.ts
**Interfaces:**
- Produces: PROFILE_SECTIONS（做什么 / 看重什么 / 不要提什么）；parseProfile(text: string): Profile；emptyProfile(): Profile

- [ ] **Step 1: 写失败测试**
~~~ts
const doc = [
  '# 研究画像', '', '## 做什么', '多模态检索。', '', '## 看重什么', '架构上的新机制。', '', '## 不要提什么', '纯调参。',
].join(LF)
it('reads the three sections', () => { expect(parseProfile(doc)['看重什么']).toContain('架构') })
it('refuses a document missing a section', () => {
  const broken = doc.split(LF).filter(line => line !== '## 不要提什么').join(LF)
  expect(() => parseProfile(broken)).toThrow(/不要提什么/)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-profile.spec.ts
- [ ] **Step 3: 实现**
按 `## <节名>` 切块；缺失任一节 throw 并点名该节；返回以节名为键的记录。emptyProfile 返回三节皆空的对象，供首次使用。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): read the taste profile file"

### Task 4: 批判与呈现

**Files:**
- Modify: src/research/batch.ts
- Test: tests/research-batch.spec.ts
**Interfaces:**
- Produces: critique(batch: Batch, reviews: Critique[]): Batch

- [ ] **Step 1: 写失败测试（覆盖 Review Focus 2）**
~~~ts
it('refuses a review of a candidate the batch does not hold', () => {
  expect(() => critique(batch, [{ candidateId: 'ghost', verdict: 'keep', reason: 'r' }])).toThrow(/ghost/)
})
it('moves the batch to reviewed once every candidate has a verdict', () => {
  expect(critique(batch, fullReviews()).status).toBe('reviewed')
})
it('refuses to present a batch whose every candidate was dropped', () => {
  expect(presentable(critique(batch, allDropped()))).toBe(false)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-batch.spec.ts
- [ ] **Step 3: 实现**
critique 拒绝未知候选、拒绝重复评审同一候选、要求每条 verdict 有非空 reason；凑齐后把状态改为 reviewed。presentable 额外要求至少一条 keep。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): record critiques and settle the batch"

### Task 5: 挑选与拒绝

**Files:**
- Create: src/research/pick.ts
- Modify: src/research/model.ts（DecisionKind 增加 pick_proposal）
- Test: tests/research-pick.spec.ts
**Interfaces:**
- Consumes: Batch、survivors、Decision
- Produces: pick(batch: Batch, candidateId: string, by: string, at: string): { batch: Batch; decision: Decision }

- [ ] **Step 1: 写失败测试（覆盖 Review Focus 3）**
~~~ts
it('refuses a candidate the critic dropped', () => {
  expect(() => pick(reviewed, droppedId, 'me', AT)).toThrow(/critic/)
})
it('records the picked id and rejects the rest with a reason', () => {
  const { batch } = pick(reviewed, keptId, 'me', AT)
  expect(batch.status).toBe('picked')
  expect(batch.rejections).toHaveLength(reviewed.candidates.length - 1)
})
it('produces a human decision', () => {
  expect(pick(reviewed, keptId, 'me', AT).decision).toMatchObject({ kind: 'pick_proposal', actor: 'human', by: 'me' })
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-pick.spec.ts
- [ ] **Step 3: 实现**
pick 要求批次 presentable；候选必须在 survivors 里，否则 throw 并点名 critic；其余候选写入 rejections，reason 记批判意见，没有意见则记 "not picked"。Decision 的 kind 为 pick_proposal，targetId 为批次 id，at 过 assertIsoTimestamp。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): pick one candidate and record the rejection"

### Task 6: 从候选起草契约

**Files:**
- Create: src/research/draft.ts
- Test: tests/research-contract-draft.spec.ts
**Interfaces:**
- Consumes: Candidate、Contract
- Produces: draftContract(candidate: Candidate, requirement: string, version: number): Contract

- [ ] **Step 1: 写失败测试（覆盖 Review Focus 5）**
~~~ts
it('carries the candidate prediction into a criterion', () => {
  const contract = draftContract(hypothesisCandidate, '架构上的新机制', 1)
  expect(contract.criteria.some(c => c.statement.includes('accuracy'))).toBe(true)
})
it('refuses a blank requirement', () => {
  expect(() => draftContract(candidate, '  ', 1)).toThrow(/requirement/)
})
it('caps the budget at the candidate estimate', () => {
  expect(draftContract(candidate, 'r', 1).budgetCapYuan).toBe(candidate.feasibility.yuan)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-contract-draft.spec.ts
- [ ] **Step 3: 实现**
契约由候选决定：goal 取 question；requirement 取人给的那句（去空白后非空）；criteria 由 prediction 与 test 各生成一条，id 为 c1、c2；budgetCapYuan 取 feasibility.yuan；stopCondition 取 test；signedBy 先留空串，签名时再填。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): draft a contract from a picked candidate"

### Task 7: 签发契约

**Files:**
- Create: src/research/sign.ts
- Test: tests/research-sign.spec.ts
**Interfaces:**
- Consumes: Contract、FrozenContract、freezeContract、ResearchRepo
- Produces: sign(repo: ResearchRepo, contract: Contract, by: string, at: string): { frozen: FrozenContract; decision: Decision }

- [ ] **Step 1: 写失败测试（覆盖 Review Focus 4）**
~~~ts
it('freezes and stores the contract', () => {
  const { frozen } = sign(repo, contract, 'me', AT)
  expect(repo.getContract(1)?.hash).toBe(frozen.hash)
})
it('records a human decision with the contract version', () => {
  const { decision } = sign(repo, contract, 'me', AT)
  expect(decision).toMatchObject({ kind: 'sign_contract', actor: 'human' })
})
it('refuses to sign the same version twice', () => {
  sign(repo, contract, 'me', AT)
  expect(() => sign(repo, contract, 'me', AT)).toThrow(/frozen/)
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-sign.spec.ts
- [ ] **Step 3: 实现**
sign 先 freezeContract（signedBy 取 by，signedAt 归一化），再 repo.saveContract（版本已存在且 hash 不同即抛）；随后 repo.recordDecision 记一条 sign_contract，targetId 为 contract:<version>。先存契约再记决定。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): sign and freeze a contract"

### Task 8: 主会话工具与端到端

**Files:**
- Create: src/app/tools/research.ts
- Test: tests/research-loop.spec.ts
**Interfaces:**
- Consumes: 前面全部
- Produces: researchTools(host: ResearchToolsHost): Tool[]，含 research_propose、research_critique、research_pick、research_sign、research_status

- [ ] **Step 1: 写端到端测试（不起会话，直接调服务）**
~~~ts
it('runs a direction to a signed contract', () => {
  // saveBatch -> critique -> pick -> draftContract -> sign
  expect(repo.getContract(1)?.signedBy).toBe('me')
  expect(repo.decisionsFor(batch.id).map(d => d.kind)).toEqual(['pick_proposal'])
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-loop.spec.ts
- [ ] **Step 3: 实现工具**
五个工具只做参数校验与转发：research_propose（存批次）、research_critique（记评审）、research_pick（挑）、research_sign（签）、research_status（读）。schema 用 zod，描述里写明「只有人能做的两个动作」。
- [ ] **Step 4: 跑测试确认通过** — Run: pnpm vitest run tests/research-loop.spec.ts；再跑 pnpm typecheck
- [ ] **Step 5: 提交** — git commit -m "feat(research): expose the proposal loop to the main session"

---
## 边界（本计划不做）

- 面板与飞书卡片：留给计划 5「通知面与清理」。本计划的决定入口只有主会话工具，而主会话只面对人；这一点在 Rulings 记一条。
- 真实的文献检索：由探路 agent 用现有工具自己完成，插件只校验它交上来的先例与 delta。
- 批次与契约的本地文件镜像：议程协议已有先例，若需要另起一条。

## Self-Review

- Spec 覆盖：设计 §5.2（提案阶段）、§8 的「签契约」一列由本计划承担；§5.3–§5.4 留给计划 3、4。
- 五条 Review Focus 都落在具体任务：1、5 → Task 1、2；2 → Task 4；3 → Task 5；4 → Task 7。
- 类型一致性：Candidate.precision 复用 model 的 Precision；Decision.kind 在 Task 5 增加 pick_proposal。
## Rulings（执行时的偏离与决定）

**R1 — Task 2 与 Task 4 合并成一个任务。** 两者写同一个文件 `src/research/batch.ts`，也共用 `presentable` 与 `critique`；拆开会让 Task 2 的测试引用还不存在的 `critique`。代价：提交数少一个。

**R2 — 人的决定入口只有主会话工具，面板与飞书留到计划 5。** 主会话是唯一直接面对人的会话，`research_pick` 与 `research_sign` 的说明里写明只在该人明确表态后调用。代价：这是一个约定而不是强制边界，面板到位后应把这两个动作改成只走人专用路由。

**R3 — 研究库独立成 `research.sqlite`，由 `openResearch` 在启动时打开、关闭时释放。** 这是落实计划 1 的 R2：研究域换库换表，不挂在工单库的迁移链上。

**R4 — `src/app/tools/research.ts` 不在运行时 import `./tool.ts`。** 那条链是 tool → resources → executor/dsh → assessment → tool，本模块的加入改变了求值顺序，使 `assessment.ts` 里的 `AcknowledgementSchema` 在被使用前还是 undefined。改用本地 `make` 身份函数，只以 `import type` 取类型。代价：多三行重复的形状定义。

**R5 — 批次整存一行 JSON。** 候选、批判与拒绝一起走，查询只按状态与创建时间排序；跨批次的分析留给议程，不在这一层做。
