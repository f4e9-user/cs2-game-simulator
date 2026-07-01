# CS2 电竞选手人生模拟器

一款以 CS2 职业生涯为主题的文字冒险 + 数值模拟游戏。玩家从路人新人起步，在每周回合中安排训练、天梯、恢复、赚钱、购物、申请战队、参加赛事和管理队伍，逐步把自己推进到青训、二线和职业阶段。

本仓库按前后端分离结构组织：

- 前端：Next.js 15、React 18、Zustand、TypeScript
- 后端：Cloudflare Workers、Hono、D1、KV、Vitest
- AI：可选接入 OpenAI / Anthropic；未启用时使用模板叙事兜底

玩法细节见 [README-game.md](./README-game.md)。设计与实现说明集中在 [docs](./docs) 目录。

---

## 核心玩法

- 开局随机 3 个特质，可重抽 1 次。
- 在 4 个可分配竞技属性上分配 10 点初始点数，`experience` 不参与开局分配。
- 以 `action` / `event` 双阶段推进每周回合。
- 通过训练、天梯、休息、赚钱、商店、战队和赛事形成长期策略。
- 用压力、疲劳、手感、名气、团队信任和经济压力共同塑造生涯走势。
- 通过赛事成绩和战队路径推进 `rookie -> youth -> second -> pro -> retired`。

---

## 当前系统

- 日常行动：天梯、系统训练、休息、度假、健身、冥想、心理训练、代练、陪玩指导、网吧打工。
- 行动 Combo：同回合顺序行动可触发一次性连锁收益。
- 事件系统：训练、天梯、战队、试训、赛事、媒体、生活、救助、博彩、作弊、休养、对手、直播、经纪人和赛事上下文事件。
- 长事件流程：战队面试、家人危机、队内冲突、Bo3 / Bo5 系列赛等同回合事件链。
- 战队系统：申请、等待回应、面试、Offer、接受 / 拒绝、离队、合同、薪资和跳槽代价。
- 阵容系统：队友角色、个性、属性、默契、队伍信任、协同和离队压力。
- 队伍管理：队友加练、战术会议、安抚更衣室、挽留核心队友、队伍训练重点。
- 赛事系统：报名窗口、资格门票、战队门槛、VRS 积分门槛、多阶段 bracket、弃赛和资格返还。
- 经济系统：商店、装备、 Buff、贷款、朋友借款、还款、违约、典当、薪资和奖金分成。
- AI 叙事：开场故事、事件润色、流式叙事、自由行动判定、商店叙事、生涯总结、社交动态和临时事件生成。
- 调试页：查看 session、LLM 日志、AI 状态、AI 事件缓存和事件流程状态。
- 生涯收束：压力崩溃、普通退役、传奇、赛事荣誉等结局和总结面板。

---

## 仓库结构

```text
cs2-game-simulator/
├── README.md
├── README-game.md
├── docs/
├── backend/
└── frontend/
```

更多系统级设计请直接看 `docs/implementation-roadmap.md` 和相关设计文档。

---

## 本地开发

### 1. 安装依赖

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. 准备 Worker 配置

复制本地模板：

```bash
cd backend
cp wrangler.toml.local wrangler.toml
```

按需填写：

- D1 `database_id`
- KV namespace id
- `[vars]` 中的 AI 配置

AI 密钥不要写进 `wrangler.toml`，请使用 Wrangler secret：

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
```

如果不需要 AI，保持 `AI_PROVIDER = "none"` 即可。核心游戏仍可运行。

### 3. 初始化本地 D1

```bash
cd backend
npm run db:init:local
```

### 4. 启动后端

```bash
cd backend
npm run dev
```

默认地址：`http://127.0.0.1:8787`

健康检查：`http://127.0.0.1:8787/api/health`

### 5. 启动前端

创建 `frontend/.env.local`：

```bash
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8787
```

启动：

```bash
cd frontend
npm run dev
```

默认访问：`http://localhost:3000`

调试页：`http://localhost:3000/debug`

---

## 常用脚本

后端：

- `npm run dev`：启动 Cloudflare Worker 本地开发服务
- `npm run deploy`：部署 Worker
- `npm run db:init:local`：初始化本地 D1
- `npm run db:init:remote`：初始化远端 D1
- `npm run typecheck`：运行 TypeScript 检查
- `npm run test`：运行 Vitest

前端：

- `npm run dev`：启动 Next.js 开发服务
- `npm run build`：构建前端
- `npm run start`：启动生产构建
- `npm run lint`：运行 Next lint
- `npm run typecheck`：运行 TypeScript 检查

---

## 推荐阅读

- [README-game.md](./README-game.md)：完整游戏规则说明
- [docs/implementation-roadmap.md](./docs/implementation-roadmap.md)：系统落地顺序
- [docs/game-design-improvement-notes.md](./docs/game-design-improvement-notes.md)：设计打磨方向
