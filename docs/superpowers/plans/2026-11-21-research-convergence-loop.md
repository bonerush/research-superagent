# 收敛闭环 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 把一个跑完的尝试收成一份能交给人的东西：证据包、复现判定、报告，以及人对着它做的两个决定——收成果或判死。

**Architecture:** 证据是数据，报告是它的投影。复现判定比较原始证据与一次独立重跑（commit、数据哈希、命令、指标容差），结果只有三种；不可复现就降级为 inconclusive 并写进报告。

**Tech Stack:** TypeScript、node:sqlite、zod、vitest。

**Spec:** docs/superpowers/specs/2026-11-20-research-superagent-design.md（§5.4、§8.2、§10）

## Global Constraints

- 代码与注释用英文；文档用中文。
- 导入带 .ts 后缀。
- 纯域代码不 import app/。
- 时间戳过 assertIsoTimestamp。
- 每个任务一次提交，Conventional Commits。
- 换行常量用 String.fromCharCode。

## Review Focus

1. 证据包缺少某条契约判据的数值——必须拒绝封存。→ Task 1
2. 重跑用了不同 commit 或不同数据哈希——必须判 not_reproducible。→ Task 2
3. 不可复现的结论仍被 accept——必须被拒。→ Task 5
4. 报告把不可复现的事略去不提——报告必须显式写出复现判定与花费。→ Task 4
5. 判死没有理由——必须拒绝。→ Task 5

## File Structure

| 文件 | 责任 |
|---|---|
| src/research/evidence.ts | 证据包的类型与校验 |
| src/research/reproduction.ts | 复现判定与降级 |
| src/research/report.ts | 报告草稿 |
| src/research/decide.ts | 收成果与判死 |
| src/app/store-research.ts | evidence 与 reports 两张表 |
| src/app/tools/research.ts | 增加 evidence 与 decide 两个动作 |
| tests/research-evidence.spec.ts | Task 1 |
| tests/research-reproduction.spec.ts | Task 2、3 |
| tests/research-report.spec.ts | Task 4 |
| tests/research-decide.spec.ts | Task 5 |
| tests/research-convergence.spec.ts | Task 6、7 |

### Task 1: 证据包

**Files:**
- Create: src/research/evidence.ts
- Test: tests/research-evidence.spec.ts
**Interfaces:**
- Produces: EvidencePackage、validateEvidence(pkg, contract): void

- [x] **Step 1: 写失败测试**
~~~ts
it('refuses a package that reports no value for a criterion', () => {
  expect(() => validateEvidence(pkg({ metrics: {} }), contract)).toThrow(/criterion/)
})
it('refuses a package with no reproduction command', () => {
  expect(() => validateEvidence(pkg({ reproduce: ' ' }), contract)).toThrow(/reproduce/)
})
it('refuses a package with no data snapshot', () => {
  expect(() => validateEvidence(pkg({ dataSnapshot: { kind: 'hash', value: '' } }), contract)).toThrow(/data/)
})
~~~
- [x] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-evidence.spec.ts
- [x] **Step 3: 实现**
类型：DataSnapshot（kind 为 hash|path|copy，value 为字符串）、EvidencePackage（attemptId、branch、commit、image、machineType、dataSnapshot、command、envFile 可选、logs、artifacts、metrics、reproduce）。校验：commit 与 command 非空；dataSnapshot.value 非空；metrics 覆盖契约的每条 criterion；reproduce 非空。
- [x] **Step 4: 跑测试确认通过** — Expected: PASS
- [x] **Step 5: 提交** — git commit -m "feat(research): define and validate the evidence package"

### Task 2: 复现判定

**Files:**
- Create: src/research/reproduction.ts
- Test: tests/research-reproduction.spec.ts
**Interfaces:**
- Produces: Verification（commit、dataHash、command、metrics）、Reproducibility、checkReproduction(original, verification, contract)

- [x] **Step 1: 写失败测试（覆盖 Review Focus 2）**
~~~ts
it('reproduces when code, data, command and metrics agree', () => {
  expect(checkReproduction(pkg(), verify(), contract)).toBe('reproducible')
})
it('refuses to call a different commit a reproduction', () => {
  expect(checkReproduction(pkg(), verify({ commit: 'other' }), contract)).toBe('not_reproducible')
})
it('refuses a different data hash even when the metrics match', () => {
  expect(checkReproduction(pkg(), verify({ dataHash: 'other' }), contract)).toBe('not_reproducible')
})
it('is inconclusive when a metric is missing', () => {
  expect(checkReproduction(pkg(), verify({ metrics: {} }), contract)).toBe('inconclusive')
})
~~~
- [x] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-reproduction.spec.ts
- [x] **Step 3: 实现**
先比 commit、dataHash、command：任一不同即 not_reproducible。再逐条 criterion：缺值 inconclusive；数值在容差内通过；超出或非数值不等 not_reproducible；契约未给容差时精确相等。
- [x] **Step 4: 跑测试确认通过** — Expected: PASS
- [x] **Step 5: 提交** — git commit -m "feat(research): judge whether a rerun reproduces the result"

### Task 3: 判定落到尝试上

**Files:**
- Modify: src/research/reproduction.ts
- Test: tests/research-reproduction.spec.ts
**Interfaces:**
- Produces: settle(attempt, outcome): Attempt

- [x] **Step 1: 写失败测试**
~~~ts
it('downgrades an unreproduced result to inconclusive', () => {
  expect(settle(concluded, 'not_reproducible').verdict).toBe('inconclusive')
})
it('refuses to settle an attempt that is not concluded', () => {
  expect(() => settle(running, 'reproducible')).toThrow(/concluded/)
})
~~~
- [x] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-reproduction.spec.ts -t settle
- [x] **Step 3: 实现** — 仅接受 concluded；reproducible 原样返回；其余把 verdict 置为 inconclusive。
- [x] **Step 4: 跑测试确认通过** — Expected: PASS
- [x] **Step 5: 提交** — git commit -m "feat(research): settle a verdict on its reproduction"
### Task 4: 报告草稿

**Files:**
- Create: src/research/report.ts
- Test: tests/research-report.spec.ts

**Interfaces:**
- Produces: ReportInput、draftReport(input): string

- [x] **Step 1: 写失败测试（覆盖 Review Focus 4）**

~~~ts
it('states the verdict, the reproduction and the cost', () => {
  const text = draftReport(input({ outcome: 'not_reproducible', costYuan: 12.5 }))
  expect(text).toContain('not_reproducible')
  expect(text).toContain('12.5')
})
it('names the stop condition the contract set', () => {
  expect(draftReport(input())).toContain('no lift on either seed')
})
~~~

- [x] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-report.spec.ts

- [x] **Step 3: 实现**
纯函数，输出 Markdown：标题带 verdict；一段结论；证据表（commit、数据快照、命令、指标）；复现判定一节；花费一节；停止条件；以及「什么会改变这个结论」一段。不可复现时结论里必须写出。

- [x] **Step 4: 跑测试确认通过** — Expected: PASS

- [x] **Step 5: 提交** — git commit -m "feat(research): draft the report a person reads"

### Task 5: 收成果与判死

**Files:**
- Create: src/research/decide.ts
- Test: tests/research-decide.spec.ts

**Interfaces:**
- Produces: accept(attempt, outcome, by, at): Decision、kill(targetId, note, by, at): Decision

- [x] **Step 1: 写失败测试（覆盖 Review Focus 3、5）**

~~~ts
it('accepts a reproduced, supported attempt', () => {
  expect(accept(concluded, 'reproducible', 'me', AT).kind).toBe('accept_result')
})
it('refuses to accept an unreproduced result', () => {
  expect(() => accept(concluded, 'not_reproducible', 'me', AT)).toThrow(/reproduc/)
})
it('refuses to accept an attempt that is not concluded', () => {
  expect(() => accept(running, 'reproducible', 'me', AT)).toThrow(/concluded/)
})
it('refuses to kill without a reason', () => {
  expect(() => kill('Q-1', '  ', 'me', AT)).toThrow(/reason/)
})
~~~

- [x] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-decide.spec.ts

- [x] **Step 3: 实现**
accept 要求 concluded、verdict 为 supported、outcome 为 reproducible，返回 kind 为 accept_result 的 Decision，targetId 为 attempt id；kill 要求 note 去空白后非空，返回 kill_direction。两者 actor 都是 human，时间过 assertIsoTimestamp。

- [x] **Step 4: 跑测试确认通过** — Expected: PASS

- [x] **Step 5: 提交** — git commit -m "feat(research): accept a result or kill a direction"

### Task 6: 存储与工具动作

**Files:**
- Modify: src/app/store-research.ts、src/app/tools/research.ts
- Test: tests/research-convergence.spec.ts

**Interfaces:**
- Produces: saveEvidence、getEvidence、saveReport、getReport；工具动作 evidence 与 decide

- [x] **Step 1: 写失败测试**

~~~ts
it('stores the evidence and the report beside the attempt', () => {
  repo.saveEvidence(pkg)
  expect(repo.getEvidence('A-1')?.commit).toBe('abc')
})
it('refuses a second evidence package for one attempt', () => {
  repo.saveEvidence(pkg)
  expect(() => repo.saveEvidence(pkg)).toThrow(/already/)
})
~~~

- [x] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-convergence.spec.ts

- [x] **Step 3: 实现**
两张表：evidence（attempt_id 主键、json）与 reports（attempt_id 主键、text）。saveEvidence 先校验再插入，重复拒绝。工具 evidence 收 attemptId、outcome 与证据包，存证据、起草并保存报告、返回报告文本；decide 收 op 为 accept 或 kill、attemptId 或 targetId、by、note。

- [x] **Step 4: 跑测试确认通过** — Expected: PASS

- [x] **Step 5: 提交** — git commit -m "feat(research): store the evidence and expose the deciding actions"

### Task 7: 端到端

**Files:**
- Test: tests/research-convergence.spec.ts

**Interfaces:**
- Consumes: 前面全部
- Produces: 无新接口

- [x] **Step 1: 写串起来的测试**

~~~ts
it('turns a concluded attempt into an accepted report', async () => {
  // conclude -> evidence -> reproduction -> settle -> report -> accept
  expect(repo.getReport('A-1')).toContain('reproducible')
  expect(repo.decisionsFor('A-1').map(d => d.kind)).toContain('accept_result')
})
~~~

- [x] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-convergence.spec.ts

- [x] **Step 3: 接线** — 接口对不上时改接口，不改测试。

- [x] **Step 4: 跑全量** — Run: pnpm typecheck && pnpm test；Expected: 新增全绿，既有基线不变

- [x] **Step 5: 提交** — git commit -m "test(research): cover the convergence loop end to end"

---

## 边界（本计划不做）

- 真实的重跑执行：由实验角色在机器上进行，本计划只判定与记账。
- 报告的排版与发到飞书：计划 5。

## Self-Review

- Spec 覆盖：§5.4 收敛、§8.2 收成果、§10 可复现判据由本计划承担；判死的界面留给计划 5。
- 五条 Review Focus 都落在任务上：1 → Task 1；2 → Task 2；3 → Task 5；4 → Task 4；5 → Task 5。
- 证据与报告分两张表：一次尝试只有一份证据与一份报告，重跑历史在 runs 里。

## Rulings（执行时的偏离与决定）

**R1 — 主会话字符预算 63,000 → 64,500。** 工具面 21,639（`research` 单工具 6,155），合计 63,833。evidence 与 decide 是收敛闭环在人这一侧的唯一入口，没有它们报告与决定都无处落地。

**R2 — 复现判定与证据一起存。** `evidence` 表带 `outcome` 列，`accept` 从证据里读判定，而不是让调用方再传一次：判定属于那次封存，重传会让账本出现两个真相。

**R3 — `settleVerdict` 是唯一能改 concluded 尝试 verdict 的入口。** `saveAttempt` 仍然拒绝改写终态；只有复现失败这一条路径能把 supported 降为 inconclusive。

**R4 — 报告存 `reports` 表，而不是只落 git。** 面板与飞书要读它，文件镜像留给计划 5。

## Rulings（执行时的偏离与决定）

**R1 — 主会话字符预算 63,000 → 64,500。** 工具面 21,639，合计 63,833；evidence 与 decide 是收敛闭环在人这一侧的唯一入口。

**R2 — 复现判定由 `checkReproduction` 现算，不接受调用方自报的 outcome。** 工具只收一次独立重跑的 verification（commit、数据哈希、命令、指标），判定在 handler 里算出来再封存。

**R3 — 证据封存要求尝试已 concluded。** 过早的证据会留下一条无法配报告的记录；inconclusive 的重跑可以覆盖上一份证据（机器什么都没证伪），reproducible 与 not_reproducible 不能。

**R4 — `downgradeToInconclusive` 取代原计划里的 `settleVerdict`。** 只允许 supported → inconclusive，不接受空值，不允许升 verdict 或清空；这是唯一能改 concluded verdict 的入口。

**R5 — inconclusive 的重跑不降级。** 设计 §10 只规定 not_reproducible 降级；把「不知道」也降级会永久毁掉一份本来 supported 的结论。

**R6 — 证据包存内容哈希 `dataHash`，不再有 path/copy。** 把路径当哈希是语义错误：同一路径上的数据被替换仍会「复现」。

**R7 — 判死必须同时给理由与批判意见**（`note` 与 `objection` 都非空），目标必须是已存在的问题；`accept` 要求已封存报告；同一 id 的 Decision 重复写入被拒。
