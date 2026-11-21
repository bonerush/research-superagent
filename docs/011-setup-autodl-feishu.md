# 011 AutoDL 与飞书接入

这份按实际能调通的方式写：AutoDL 的五个值、飞书机器人的 webhook、以及它们该设置在哪。

## 一、AutoDL

### 要拿到的两个值

| 值 | 在哪 |
| --- | --- |
| 开发者 Token | 控制台 → 账号 → 设置 → [开发者 Token](https://www.autodl.com/console/center/settings/token) |
| 实例 UUID | 控制台实例列表里的 `pro-` 开头那串，例如 `pro-759127a8714f` |

> 容器实例 Pro API 需要先做个人或企业实名认证，否则接口会拒绝。

### 四个端点

| 用途 | 地址 |
| --- | --- |
| 查状态 | `https://api.autodl.com/api/v1/dev/instance/pro/status` |
| 开机 | `https://api.autodl.com/api/v1/dev/instance/pro/power_on` |
| 关机 | `https://api.autodl.com/api/v1/dev/instance/pro/power_off` |
| 查余额 | `https://api.autodl.com/api/v1/dev/wallet/balance` |

请求头是 `Authorization: <你的 Token>`（不加 `Bearer`），请求体用 `instance_uuid`，响应外面包一层 `{code, data, msg}`，余额单位是千分之一元（`data.assets / 1000`）。这些和插件默认的通用形状不一样，所以必须加一句 `RESEARCH_MACHINE_DIALECT=autodl`，插件会按 AutoDL 的形状发请求。

### 环境变量

```
RESEARCH_MACHINE_TOKEN=<开发者 Token>
RESEARCH_MACHINE_INSTANCE=pro-759127a8714f
RESEARCH_MACHINE_STATUS_URL=https://api.autodl.com/api/v1/dev/instance/pro/status
RESEARCH_MACHINE_ON_URL=https://api.autodl.com/api/v1/dev/instance/pro/power_on
RESEARCH_MACHINE_OFF_URL=https://api.autodl.com/api/v1/dev/instance/pro/power_off
RESEARCH_MACHINE_BALANCE_URL=https://api.autodl.com/api/v1/dev/wallet/balance
RESEARCH_MACHINE_DIALECT=autodl
```

### 一个必须知道的坑

AutoDL 的 `power_on` 需要一个 `payload` 字段，目前只接受 `gpu`——**开放 API 不能以无卡模式开机**。也就是说插件每次给你开机都是带显卡计费的。

插件的 supervisor 每分钟看一眼：账本里没有未结束的 run、开机满一小时没有任何活动，就自动关机。所以哪怕你忘了，最坏也是一小时 GPU 的钱。

### 先手动验一下

```bash
curl -s -X GET "https://api.autodl.com/api/v1/dev/instance/pro/status" \
  -H "Authorization: $RESEARCH_MACHINE_TOKEN" \
  -H "content-type: application/json" \
  -d "{\"instance_uuid\":\"$RESEARCH_MACHINE_INSTANCE\"}"
```

看到 `{"code":"Success","data":"running"}` 这类回答就说明 Token 和实例 ID 都对。`data` 的取值会被插件映射成四种：`running`；`shutdown`/`stopped`/`finished` → 关机；`starting`/`booting`/`creating` → 启动中；其余会明确报错，而不是猜。

## 二、飞书

通知走群机器人，不走应用授权——这样不需要审核、不需要装应用，只要一个 webhook。

### 拿到 webhook

1. 在飞书里建一个群（只有你自己也行）。
2. 群设置 → 群机器人 → 添加机器人 → **自定义机器人**。
3. 复制 webhook 地址；如果勾了「签名校验」，把密钥也记下来。

### 环境变量

```
FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx
FEISHU_SECRET=<勾了签名校验才需要>
RESEARCH_NOTIFY_COMMAND=node "D:/Projects/03_科研论文/research-superagent/scripts/notify-feishu.mjs"
```

`scripts/notify-feishu.mjs` 从 stdin 读一行文字，POST 给 webhook；勾了签名就带上时间戳和签名；飞书回 `code` 非 0 时以非零退出，所以通知失败不会被当成送达。

### 先手动验一下

```bash
echo "研究代理测试通知" | node scripts/notify-feishu.mjs
```

群里收到消息就说明通了。命令没设 `FEISHU_WEBHOOK` 时会以退出码 2 结束并在 stderr 说明原因。

## 三、这些变量设在哪

插件在**启动时**读 `process.env`，所以变量必须在 DSH 进程启动前就在环境里：

- Windows：`setx RESEARCH_MACHINE_TOKEN "..."`（对新开的进程生效），然后重启 DSH。
- 或者写进启动 DSH 的脚本 / 服务配置里。

改完重启，面板「研究」页签里能挑提案、能收成果；机器动作在主会话里说「开机」就会走 AutoDL。

## 四、验证清单

- `pnpm vitest run tests/research-machine-autodl.spec.ts`：方言的请求与响应形状。
- `curl` 那条：Token 与实例 ID。
- `echo ... | node scripts/notify-feishu.mjs`：webhook。
- 主会话里说「查一下机器状态」，返回 `running` 或 `off` 即接线完成。