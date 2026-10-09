# fxq-vercel —— 飞行棋 Vercel / Serverless 版

fxq-cf 飞行棋的无服务器适配：**无 WS 长连接、无常驻进程**，跑在 Vercel Functions + 任意 Postgres 上。
对局逻辑与 CF 版逐行为一致（同一引擎 `engine.js` 原样移植，客户端 `app.js` 零改动）。

## 架构（WS/DO → Serverless 的映射）

| CF 版机制 | Vercel 版替代 |
|---|---|
| Durable Object（房间单例 + 内存状态） | Postgres 单行 JSONB 状态 + 乐观并发（`UPDATE ... WHERE seq=期望值`，冲突自动重试） |
| WebSocket 广播 | 事件日志（`log` 数组，版本号 `seq`）+ 客户端**长轮询**增量拉取 |
| WebSocket 心跳/死连接检测 | 无常驻连接，天然不存在死连接问题；长轮询超时返回即心跳 |
| DO alarm / 空座位托管 | **惰性虚拟定时器**：每次读写前 `processTimeouts()` 补算超时轮次 |
| 同 gid 挤占（close 4000） | `sid` 会话令牌：新 join 覆盖旧 sid，旧会话长轮询立即收到 `kicked` |
| 断线重连恢复对局 | join 幂等：重连后 welcome + 棋盘 sync，从断点 seq 续传事件 |
| KV 战绩上报 | 暂未实现（POC 范围外） |

## 新增行为（相对 CF 版）

- **AFK 自动代打**：轮到你后 `AFK_MS`（默认 60s）未行动，系统自动掷骰/移动——CF 版会卡死等永久。可 `AFK_MS` 环境变量调节。
- **快照兜底**：客户端落后超过 100 个事件（`LOG_KEEP`）时返回全量快照，不依赖无限回放。

## 部署（约 10 分钟）

### 1. 建 Postgres（免费）
任选其一，拿到连接串 `DATABASE_URL`：
- **Neon**：neon.tech → 免费 0.5GB，自带 Vercel 集成
- **Supabase**：免费 500MB（连接串用连接池端口 6543）
- 或在 Vercel 面板 Storage 里一键开 Neon（推荐，自动注入环境变量）

### 2. 部署到 Vercel
```bash
npm i -g vercel
vercel login
vercel          # 首次：项目名随意，框架选 Other，其余回车默认
vercel --prod
```
若用 Neon 官网直连（非 Vercel 集成），需手动设环境变量：
```bash
vercel env add DATABASE_URL   # 粘贴 postgres:// 连接串
vercel --prod                 # 重新部署生效
```

数据表自动创建（首次请求 `CREATE TABLE IF NOT EXISTS fxq_rooms`），无需迁移脚本。

### 3. 玩
打开 `https://<你的域名>/fxq/` → 输入名字 → 创建房间 → 分享房间号。

## 本地开发 / 测试
```bash
npm test        # E2E：33 项断言（完整对弈/并发/挤占/快照/AFK/回收），内存存储，无需 DB
vercel dev      # 本地跑 Vercel 环境（需 DATABASE_URL）
```

## 成本测算（Hobby 免费档）
- Vercel Functions：长轮询每客户端每分钟 ~2-3 个请求，Hobby 100GB-hours 绰绰有余
- Neon 免费：每次轮询是 ~1.4 次/秒的毫秒级轻查询，按活跃计算秒计费，闲时归零
- ⚠️ 若 Vercel 提示 `maxDuration` 不可用（个别区域/计划），把 `api/state.js` 的 `maxDuration` 降为 10 并把前端 `wait` 参数改 8000

## 已知限制
- 战绩统计未迁移（需要外部存储，后续可加一张 `fxq_stats` 表）
- 大厅房间列表未做（可加 `GET /api/rooms` 扫 `started=false` 的行）
- 并发上限受乐观并发重试（3 次）约束——飞行棋每回合仅一人行动，实际无热点
