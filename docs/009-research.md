# 009 Research

本文件描述研究域：一个人类带着一组 agent 把一条方向推到可复现结论的过程，以及它在代码里的位置。前八份文档描述的是工单域；两者共用同一个插件外壳，数据分开存。

## 为什么有这一份

工单域假设「有人按门铃，它才开工」：Source 产生 Trigger，Eval 判谁有权提这个活，Ticket 带授权派给 Executor。研究域把前提倒过来——请求方是 agent，唯一审批者是一个人类，工作单元要活几周。两者的概念不能互译，所以单独立一份文档，而不是改写 001。

## 概念

| 概念 | 是什么 |
| --- | --- |
| Question | 一条问题，精度从「方向」到「选题」到「可检验的假设」 |
| Batch | 一轮候选提案，2–5 份；每份须有至少三条最近先例与 delta |
| Critique | 批判 agent 对每份候选的裁决；裁决之后批次才可能端给人 |
| Contract | 人签一次即冻结的验收基准：目标、要求、判据、预算、停止条件 |
| Protocol | 运行前登记的协议：命令、每条判据的测量方式、占机时长 |
| Attempt | 一条分支 + 一份协议 + 一组 run + 一个 verdict |
| Run | 一次上机：机器、镜像、commit、命令、起止、花费 |
| Evidence | 证据包：commit、数据哈希、命令、指标、复现命令 |
| Report | 人可以读的那一页：结论、证据、复现、花费、停止条件 |
| Decision | 人做的判断：挑提案、签契约、收成果、判死 |

## 循环

```
方向 → propose → critique →（人）pick →（人）sign → 冻结契约
     → protocol → attempt open/start → run → conclude
     → evidence（独立重跑校验）→ report →（人）accept 或 kill
```

三处必须有人的决定：挑提案、签契约、收成果或判死。其余步骤由 agent 推动，但每一次写入都要过服务层的不变式：契约不可改、协议不可覆盖、没跑过 run 不能下结论、证据必须是本尝试的 run、不可复现即降级。

## 存储

- `research.sqlite`：`questions`、`batches`、`contracts`、`protocols`、`attempts`、`runs`、`decisions`、`evidence`、`reports`、`machine`。与工单库分开，换库换表，不迁旧数据。
- 金额以「分」存整数，读出时换算；时间戳一律归一化为 UTC ISO。

## 工具面

主会话只有一个 `research` 工具，动作用判别联合：`propose`、`critique`、`pick`、`sign`、`protocol`、`attempt`、`run`、`evidence`、`decide`、`machine`、`status`。合并成一个是为了守住主会话的字符预算：每加一个能力加一个分支，不加一条工具。

`pick`、`sign`、`decide` 的说明里写明「只在该人明确表态后调用」。这三个动作目前仍挂在主会话上，是约定而不是强制边界；面板的人专用路由是后续工作。

## 机器与预算

机器由环境变量配置：`RESEARCH_MACHINE_TOKEN`、`RESEARCH_MACHINE_INSTANCE` 与四个 `_URL`（status、on、off、balance）。未配置时机器动作明确报错，不假装可用。

supervisor 每分钟一轮：读机器状态，读账本里的活动（未结束的 run 视为在跑，开机时间作为空闲窗口的兜底起点），无活动满一小时就关机；关成功才记账。

## 面板

「研究」页签读 `GET research`，列四块：待签契约、待挑提案、待判定尝试、报告。已被挑走的批次、已被收成果或判死的尝试都不列入。视图函数 `researchOverview` 是纯的，可以直接测。

## 议程

收成果与判死会把结论写进**议程文件**：状态目录下的 `research-agenda.md`（与 `research.sqlite` 并排）。

- 收成果写一条 `answered`，证据是该尝试的 run；判死写一条 `abandoned`，结论是理由加批判意见。
- 同一个 id 只写一次，重试不会重复。
- `research` 的 `agenda` 动作把条目读回来，提案时可以引用。
- 议程文件损坏时写入会报错并保持原文件：宁可停下来让人修，也不覆盖。

## 尚未接线的部分

- 飞书通知：研究事件还没有推给飞书；面板是目前唯一的人机界面。
- 旧域：操作者 2026-11-21 决定保留——GitHub 仓库用作数据与代码的云存储，git 用科研分支管理。研究域与工单域并存；删除计划存档在 `docs/superpowers/plans/2026-11-21-remove-github-source.md`。