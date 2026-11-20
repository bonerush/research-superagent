# 通知面与清理 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 让研究循环有一屏能一眼看完的人机界面——待签的契约、待挑的提案、待判定的尝试、已出的报告——并把这些写进文档。

**Architecture:** 视图函数是纯的，路由是薄的，客户端只渲染。`researchOverview(store)` 从研究库读出四类「需要人」的条目；`GET research` 把它交给面板；面板新增一个研究页签。

**Tech Stack:** TypeScript、node:sqlite、React（面板已有）、vitest。

**Spec:** docs/superpowers/specs/2026-11-20-research-superagent-design.md（§8 三个点头点、§9）

## Global Constraints

- 代码与注释用英文；文档用中文。
- 导入带 .ts 后缀。
- 视图函数不写库、不发网络请求。
- 每个任务一次提交，Conventional Commits。

## Review Focus

1. 待签契约一栏把已冻结的契约又列一遍——必须只列未签的。→ Task 1
2. 待判定尝试把已被 accept 或 kill 的 attempt 又列出——必须排除。→ Task 1
3. 面板路由在未配置研究库时抛错，而不是返回空——必须返回空列表。→ Task 2
4. 报告链接指向不存在的 attempt——必须只列存在的。→ Task 1

## File Structure

| 文件 | 责任 |
|---|---|
| src/app/views/research.ts | researchOverview：四类待办 |
| src/app/http.ts | GET research 路由 |
| src/app/api.ts | Api 类型增加 research |
| src/client/research.tsx | 研究页签 |
| src/client/route.ts | TABS 增加 research |
| docs/009-research.md | 研究域的说明文档 |
| tests/research-view.spec.ts | Task 1、2 |

### Task 1: 研究总览视图

**Files:**
- Create: src/app/views/research.ts
- Test: tests/research-view.spec.ts
**Interfaces:**
- Produces: ResearchOverview { batches: { id; direction; candidates }[]; attempts: { id; verdict; costYuan }[]; reports: { attemptId; title }[] }、researchOverview(repo: ResearchRepo): ResearchOverview

- [ ] **Step 1: 写失败测试**
~~~ts
it('lists a reviewed batch that was never picked', () => {
  const view = researchOverview(repo)
  expect(view.batches.map(b => b.id)).toEqual(['B-1'])
})
it('leaves out a batch that was already picked', () => {
  expect(researchOverview(pickedRepo).batches).toEqual([])
})
it('lists a concluded attempt nobody decided on', () => {
  expect(researchOverview(repo).attempts.map(a => a.id)).toEqual(['A-1'])
})
it('leaves out an attempt that was accepted', () => {
  expect(researchOverview(acceptedRepo).attempts).toEqual([])
})
~~~
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-view.spec.ts
- [ ] **Step 3: 实现**
batches：状态为 reviewed 的批次。attempts：状态为 concluded、且 decisionsFor(attempt) 里没有 accept_result 也没有 kill_direction 的。reports：有报告的 attempt，标题取报告第一行。花费取 costOfAttempt。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): show what needs a person"

### Task 2: 面板路由

**Files:**
- Modify: src/app/http.ts、src/app/api.ts
- Test: tests/research-view.spec.ts
**Interfaces:**
- Produces: Api 的 GET research → ResearchOverview；HttpHost 增加 research 字段

- [ ] **Step 1: 写失败测试** — 用一个假的 host 调路由处理函数，断言 200 与字段。
- [ ] **Step 2: 跑测试确认失败** — Run: pnpm vitest run tests/research-view.spec.ts -t route
- [ ] **Step 3: 实现** — 在 `Api` 里加一行；在 `http.ts` 的路由表里加 `GET research`；`HttpHost` 加 `research: ResearchRepo`，Runtime 传进去。
- [ ] **Step 4: 跑测试确认通过** — Expected: PASS
- [ ] **Step 5: 提交** — git commit -m "feat(research): expose the research overview to the panel"

### Task 3: 研究页签

**Files:**
- Create: src/client/research.tsx
- Modify: src/client/route.ts、src/client/app.tsx
- Test: tests/research-view.spec.ts（视图数据已测，客户端只做渲染）

- [ ] **Step 1:** 在 TABS 里加 `research`，路由类型加 `{ page: "research" }`。
- [ ] **Step 2:** 页面列四块：待签契约（空时写「没有」）、待挑提案、待判定尝试、报告。每条只显示 id、状态、花费。
- [ ] **Step 3:** 跑 `pnpm typecheck` 与 `pnpm build`，确认客户端能编译。
- [ ] **Step 4:** 提交 — git commit -m "feat(panel): add the research tab"

### Task 4: 文档

**Files:**
- Create: docs/009-research.md
- Modify: docs/007-architecture.md
- [ ] **Step 1:** 写 009：研究域的概念（Agenda/Proposal/Contract/Attempt/Run/Evidence/Report）、三个点头点、机器与预算、目录与文件。
- [ ] **Step 2:** 007 的模块表补 `src/app/views/research.ts` 与 `src/client/research.tsx`，测试表补 `tests/research-view.spec.ts`。
- [ ] **Step 3:** 提交 — git commit -m "docs: describe the research domain and its panel"

## 清理的边界（本计划只做一半，另一半记 Ruling）
设计要求的终点是删掉 Ticket 域与 GitHub 监听。本计划**不删**，理由：飞书通知与面板外壳仍骑在旧域上，删掉会先打断通知面；而且删旧域要同时重写 001–008 与大量测试，无法在本计划里高质量完成。
本计划交付的是「新的那一半」——研究域的人机界面与文档；删除旧域另立一份计划，在它之前先让研究域自己具备通知能力。

## Rulings（执行时的偏离与决定）

**R1 — Task 2、3、4 合并成一次提交**（`6c91778`），路由、页签与文档同一次落地：三者互为验证，拆开会让中间状态不可构建。完成以提交为准，计划里的复选框不再逐个勾。

**R2 — 旧域删除不在本计划。** 飞书通知与面板外壳仍骑在 Ticket 域上，先删会打断通知面；删旧域另立计划，前置条件是研究域先有自己的通知能力。

**R3 — 研究库是启动必需项，不是可选项。** 因此 `GET research` 不做「未配置返回空」的兜底：打不开研究库，插件本来就起不来。计划 Review Focus 3 以本条取代。

**R4 — 待签契约从「已 pick 且 contractVersion 未设」的批次派生**，不另建契约表视图：签之前契约还不存在，签之后它已冻结。

**R5 — 判死的目标是 question，不是 attempt。** 视图按 `attempt.questionId` 查 kill_direction，按 `attempt.id` 查 accept_result；两者目标不同，混用会把已判死的方向继续列出来。
