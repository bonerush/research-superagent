# 删除 GitHub 监听 实施计划

> **状态：不执行。** 操作者 2026-11-21 决定保留旧域（GitHub 仓库作云存储、git 用科研分支管理）；本文件只作存档，供将来真的要删时参考。

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 把 GitHub Source 与只服务于它的代码删干净，让工单域只从飞书接收工作。研究域不动。

**为什么不一次删完：** 设计的目标态还要删掉整个 Ticket 域，但飞书通知与面板外壳仍骑在工单域上。先删 GitHub 是第一步，第二步（删 Ticket 域）要等研究域自己会通知人。

**Tech Stack:** TypeScript、tsdown、vitest。

**Spec:** docs/superpowers/specs/2026-11-20-research-superagent-design.md（§11 删除项）


## 现状清点（2026-11-21 实测）

- 只服务 GitHub 的文件：`src/sources/github.ts`、`github-channel.ts`、`github-pull.ts`、`github-read.ts`、`github-trigger.ts`。
- 入口三处：`package.json` 的 `./github-watch`、`cordis.patch.yml` 的 `dsh-superagent-github`、`tsdown.config.ts` 的 entry。
- 账户与命令：`src/deployment.ts`（11 处）、`src/setup.ts`（10 处）、`src/infra/environment.ts`（13 处，`gh` shim）、`src/infra/commands.ts`（8 处）。
- 只服务 GitHub 的域面：`src/app/tools/executor.ts`（9 处，PR 工具）、`src/app/resources.ts`、`src/app/cards.ts`、`src/client/locales.ts`（16 处文案）。
- 迁移：`src/app/migration.ts` 有 37 处提到 github，负责把旧库里的 GitHub 记录读出来。
- 测试：43 个测试文件提到 github。

## Global Constraints

- 代码与注释用英文；文档用中文。
- 每个任务一次提交，Conventional Commits。
- 每个任务结束时 `pnpm typecheck` 必须干净：删掉一个名字，就要把引用它的地方一起改。
- 删完后飞书路径必须仍能启动：`tests/bundle-patch.spec.ts` 与 `tests/deployment.spec.ts` 是这条的判据。

## Review Focus

1. 删掉 GitHub 后，`setup` 仍要求一个 GitHub 账户——启动会卡在「未配置」。→ Task 2
2. `gh` shim 还写在 worker 环境里，执行器的 PATH 上仍有一个指向不存在账户的命令。→ Task 3
3. 旧库里的 GitHub 记录让 `migration` 在启动时读到不存在的类型。→ Task 5
4. 面板的「来源」页签仍列 GitHub 状态而它已不存在。→ Task 4

## 任务


### Task 1: 摘掉入口

**Files:**
- Modify: package.json、cordis.patch.yml、tsdown.config.ts
- [ ] **Step 1:** 从 `cordis.patch.yml` 删掉 `dsh-superagent-github` 那一段，保留飞书那一段。
- [ ] **Step 2:** 从 `package.json` 的 `exports` 删掉 `./github-watch`。
- [ ] **Step 3:** 从 `tsdown.config.ts` 的 entry 删掉 `github-watch`。
- [ ] **Step 4:** 跑 `pnpm build` 与 `pnpm vitest run tests/bundle-patch.spec.ts`；Expected: 构建成功，bundle 只含两个插件（index 与 feishu）。
- [ ] **Step 5:** 提交 — `git commit -m "chore(bundle): stop shipping the github source"`

### Task 2: 删账户与探测

**Files:**
- Modify: src/deployment.ts、src/setup.ts、src/app/settings.ts、tests/deployment.spec.ts、tests/setup*
- [ ] **Step 1:** 删掉 deployment 里的 GitHub 账户字段与 `resolveDeployment` 中读取它的分支；`SETUP_FIELDS` 只留飞书。
- [ ] **Step 2:** 删掉 setup 里探测 `gh` 的那一段与它产生的 SetupProblem 种类。
- [ ] **Step 3:** 跑 `pnpm typecheck`，按报错逐个改引用处（settings 的表单、面板的设置页、测试 fixture）。
- [ ] **Step 4:** 跑 `pnpm vitest run tests/deployment.spec.ts`；Expected: 绿，且没有 GitHub 字段。
- [ ] **Step 5:** 提交 — `git commit -m "feat(setup): configure only the feishu account"`

### Task 3: 删命令与环境

**Files:**
- Modify: src/infra/commands.ts、src/infra/environment.ts、tests/environment.spec.ts
- [ ] **Step 1:** 删掉 `gh` 命令的封装与它的 shim。
- [ ] **Step 2:** 删掉环境里注入的 GitHub token 变量名。
- [ ] **Step 3:** 跑 `pnpm vitest run tests/environment.spec.ts`；Expected: 绿，worker 的 PATH 上没有 `gh`。
- [ ] **Step 4:** 提交 — `git commit -m "chore(env): drop the gh shim"`

### Task 4: 删只服务 GitHub 的域面

**Files:**
- Modify: src/app/tools/executor.ts、src/app/resources.ts、src/app/cards.ts、src/app/views/*、src/client/*
- [ ] **Step 1:** 删掉执行器的 PR 工具与 `pull` 资源；`resources` 的资源语法相应收窄。
- [ ] **Step 2:** 删掉卡片与文案里的 GitHub 分支（`src/client/locales.ts` 的 16 处）。
- [ ] **Step 3:** 删掉面板「来源」页签里 GitHub 的状态格；留下飞书。
- [ ] **Step 4:** 跑 `pnpm typecheck` 与 `pnpm vitest run tests/cards.spec.ts tests/resources.spec.ts`；Expected: 绿。
- [ ] **Step 5:** 提交 — `git commit -m "feat(domain): remove the github-only surfaces"`

### Task 5: 决定旧库的 GitHub 记录

**Files:**
- Modify: src/app/migration.ts
- [ ] **Step 1:** 在中途停下，写一条 Ruling 二选一：**丢弃**（迁移只处理飞书记录，遇到 GitHub 记录就跳过并计数）或**保留读取**（迁移保留解析，但新写入不再产生）。
- [ ] **Step 2:** 按选择实现，并在迁移日志里说明跳过了多少条。
- [ ] **Step 3:** 跑 `pnpm vitest run tests/queue.spec.ts`（迁移相关用例在这里）。
- [ ] **Step 4:** 提交 — `git commit -m "feat(migration): settle the legacy github records"`

### Task 6: 删源码文件与测试

**Files:**
- Delete: src/sources/github.ts、github-channel.ts、github-pull.ts、github-read.ts、github-trigger.ts
- Delete: tests/github-read.spec.ts 与其余只测 GitHub 的用例
- [ ] **Step 1:** 删文件，跑 `pnpm typecheck`，按报错收尾剩下的引用。
- [ ] **Step 2:** 删只测 GitHub 的测试文件；在仍需要 Source 的测试里把 fixture 换成飞书。
- [ ] **Step 3:** 跑 `pnpm test`；Expected: 只剩既有的 Windows 基线失败，不新增。
- [ ] **Step 4:** 提交 — `git commit -m "chore(sources): delete the github source"`

### Task 7: 文档

- [ ] **Step 1:** 001 的 Source 行、006 的配置步骤、007 的模块与测试表，删掉 GitHub 相关条目。
- [ ] **Step 2:** 008 cookbook 里「添加一个 Source」的例子改成飞书或抽象成通用步骤。
- [ ] **Step 3:** 提交 — `git commit -m "docs: drop the github source"`

## 边界

- 不删 Ticket 域：那是第二步，前置是研究域有自己的通知能力。
- 不删飞书。

## 完成判据

- `pnpm build` 产出的 bundle 只含 index 与 feishu 两个插件。
- 全新状态目录下启动，`setup` 只要求飞书账户，没有 GitHub 的检查项。
- `pnpm test` 不新增失败文件。
- `grep -ri github src` 只命中迁移里明确保留的兼容分支（如有）。