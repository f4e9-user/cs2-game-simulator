# CS2 电竞选手人生模拟器

一个以 CS2 职业生涯为主题的文字冒险 + 数值模拟项目。玩家从路人新人开局，抽取特质、分配属性，在每周回合中安排训练、天梯、休息、赚钱、购物、战队申请、赛事报名和队伍管理，并通过事件、比赛和经济压力推进职业生涯。

项目当前是前后端分离实现：

- 前端：Next.js 15、React 18、Zustand、TypeScript
- 后端：Cloudflare Workers、Hono、D1、KV、Vitest
- AI：可选接入 OpenAI / Anthropic；未启用时使用模板叙事兜底

玩法细节见 [README-game.md](./README-game.md)。系统设计文档在 [docs](./docs) 目录。

---

## 当前能力

- 新局创建：随机 3 个特质，可重抽 1 次；在特质底线之上分配 12 点竞技属性。
- 核心数值：智力、敏捷、经验、心态、体能、资金，以及压力、名气、AP、手感、疲劳、tilt、成长上限。
- 回合阶段：行动阶段和事件阶段分离；行动结束后按最新状态 pickup 本回合事件。
- 日常行动：天梯、系统训练、休息、度假、健身、冥想、心理训练、代练、陪玩指导、网吧打工。
- 行动 Combo：同回合行动顺序可以触发短期连锁收益。
- 随机事件：训练、天梯、战队、试训、赛事、媒体、生活、救助、博彩、作弊、休养、对手、直播、经纪人、赛事上下文等事件池。
- 长事件流程：战队面试、家人危机、队内冲突、Bo3 / Bo5 系列赛等同回合 Event Sequence。
- 战队系统：申请、等待回应、面试、Offer、接受/拒绝、主动离队、合同、薪资、跳槽代价。
- 阵容系统：队友角色、个性、属性、队友默契、队伍信任、协同、身份定位和离队压力。
- 队伍管理：队友加练、战术会议、安抚更衣室、挽留核心队友、队伍训练重点。
- 赛事系统：报名窗口、资格门票、战队门槛、VRS 积分门槛、多阶段 bracket、弃赛和资格返还。
- 赛事上下文：报名后、赛前、赛后上下文事件；比赛周只出比赛事件。
- 比赛模拟：个人表现层和队伍胜负层分离，生成比分、K/D/A、HS%、rating、奖励和资格推进。
- 经济系统：商店、装备、Buff、贷款、朋友借款、还款、违约、典当、薪资和奖金分成。
- AI 叙事：开场故事、事件润色、流式叙事、自由行动判定、商店叙事、生涯总结、社交动态和临时事件生成。
- 调试页：查看 session、LLM 日志、AI 状态、AI 事件缓存和事件流程状态。
- 生涯收束：压力崩溃、普通退役、传奇、赛事荣誉等结局和总结面板。

---

## 项目结构

```text
cs2-game-simulator/
├── README.md
├── README-game.md
├── docs/
│   ├── action-combo-design.md
│   ├── event-sequence-system-design.md
│   ├── match-winrate-layered-model-design.md
│   ├── roster-system-design.md
│   ├── social-system-design.md
│   ├── team-system-design.md
│   ├── tournament-context-events-design.md
│   └── ...
├── shared/
│   └── types.ts
├── backend/
│   ├── package.json
│   ├── schema.sql
│   ├── wrangler.toml.local
│   └── src/
│       ├── index.ts
│       ├── routes/
│       │   ├── game.ts
│       │   └── debug.ts
│       ├── engine/
│       │   ├── gameEngine.ts
│       │   ├── events.ts
│       │   ├── eventSequence.ts
│       │   ├── matchSimulator.ts
│       │   ├── tournamentContext.ts
│       │   ├── tournamentEligibility.ts
│       │   ├── tournamentSeries.ts
│       │   ├── worldClubs.ts
│       │   ├── teamIdentity.ts
│       │   └── ...
│       ├── data/
│       │   ├── actions.ts
│       │   ├── clubs.ts
│       │   ├── clubProfiles.ts
│       │   ├── leaderboard.ts
│       │   ├── roster.ts
│       │   ├── shop.ts
│       │   ├── tournaments.ts
│       │   ├── traits.ts
│       │   └── events/
│       ├── ai/
│       ├── storage/
│       └── validation/
└── frontend/
    ├── package.json
    ├── next.config.mjs
    └── src/
        ├── app/
        ├── components/
        ├── lib/
        └── store/
```

说明：

- [backend/src/types.ts](./backend/src/types.ts) 是后端实际使用的领域类型。
- [frontend/src/lib/types.ts](./frontend/src/lib/types.ts) 是前端镜像类型。
- [shared/types.ts](./shared/types.ts) 保留为共享类型参考文件，但当前没有自动生成链路；改类型时需要手动同步。
- [docs](./docs) 中有设计和实现计划文档，README 只描述当前代码已经接线的能力。

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

仓库提供 [backend/wrangler.toml.local](./backend/wrangler.toml.local) 作为本地模板。运行 `wrangler dev` 前需要创建本地配置文件：

```bash
cd backend
cp wrangler.toml.local wrangler.toml
```

按需替换：

- D1 `database_id`
- KV namespace id
- `[vars]` 中的 AI 配置

AI 密钥不要写进 `wrangler.toml`，使用 Wrangler secret：

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
```

如果不需要 AI，保持 `AI_PROVIDER = "none"` 即可。核心游戏仍能运行；自由行动、流式叙事和 AI 临时事件会不可用或走兜底。

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

默认地址：

```text
http://127.0.0.1:8787
```

健康检查：

```text
http://127.0.0.1:8787/api/health
```

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

默认访问：

```text
http://localhost:3000
```

调试页：

```text
http://localhost:3000/debug
```

---

## 运行脚本

后端：

- `npm run dev`：启动 Cloudflare Worker 本地开发服务。
- `npm run deploy`：部署 Worker。
- `npm run db:init:local`：初始化本地 D1。
- `npm run db:init:remote`：初始化远端 D1。
- `npm run typecheck`：运行 TypeScript 检查。
- `npm run test`：运行 Vitest。

前端：

- `npm run dev`：启动 Next.js 开发服务。
- `npm run build`：构建前端。
- `npm run start`：启动生产构建。
- `npm run lint`：运行 Next lint。
- `npm run typecheck`：运行 TypeScript 检查。

---

## 核心模型

### 生涯阶段

正式阶段链路：

```text
rookie -> youth -> second -> pro -> retired
```

- `rookie`：路人新人。
- `youth`：青训。
- `second`：二线队。
- `pro`：职业队。
- `retired`：退役。

阶段推进不靠经验自动升级，而是和战队、赛事参赛、冠军记录和晋级叙事事件绑定：

- `rookie -> youth`：通常需要完成 C/B 级证明路径并成功加入青训战队；拥有枪法天才相关天赋时可以走天赋申请路线。
- `youth -> second`：依赖 B 级赛事参赛和冠军门槛。
- `second -> pro`：依赖 A 级赛事参赛和冠军门槛。
- `pro`：当前正式竞技阶段终点，后续目标是 S 级赛事、Major、名气和结局评价。

### 属性和状态

核心属性定义在 [backend/src/engine/constants.ts](./backend/src/engine/constants.ts)：

| Key | 中文 | 用途 |
| --- | --- | --- |
| `intelligence` | 智力 | 战术理解、复盘、决策和部分赚钱行动 |
| `agility` | 敏捷 | 枪法、反应、天梯和比赛输出 |
| `experience` | 经验 | 比赛经验、稳定输出和长期表现 |
| `mentality` | 心态 | 抗压、压力倍率、比赛稳定性 |
| `constitution` | 体能 | 疲劳倍率、伤病风险和连续作战 |
| `money` | 资金 | 商店、贷款、罚款、工资和奖金 |

竞技属性通常在 `0-20` 区间，资金上限更高。开局 `POINT_POOL = 12`，只分配到五个竞技属性；`money` 不参与开局分配。

高频状态：

- `stress`：压力，`0-100`。
- `fame`：名气，`0-100`。
- `actionPoints`：本回合 AP。
- `volatile.feel`：手感，默认 `-3 ~ +3`，外设可提高上限。
- `volatile.tilt`：心态波动，`0 ~ 3`。
- `volatile.fatigue`：疲劳，`0 ~ 100`。

成长规则：

- 生涯总成长预算 `GROWTH_CAP = 30`，只作用于五个竞技属性。
- 属性越高，后续成长越慢。
- Buff 可以影响行动标签、成长属性、疲劳增长、压力增长和比赛表现，但不会绕过成长上限。
- 疲劳和压力的正向增量走统一倍率系统；恢复类负向增量不会被体能或心态削弱。

### 回合阶段

一轮主循环：

```text
action 阶段：日常行动 / 商店 / 贷款 / 战队 / 赛事 / 队伍管理
  -> end-action-phase
event 阶段：固定选项或 AI 自由行动
  -> choice
action 阶段：推进到下一周
```

`currentEvent` 只在事件阶段存在。行动阶段不会提前固定下一事件。赛事、战队申请、强制休养、AI 事件缓存和调试强制事件都会影响 `end-action-phase` 的事件 pickup。

---

## 后端系统

### 路由

业务路由集中在 [backend/src/routes/game.ts](./backend/src/routes/game.ts)，挂载在 `/api` 下。写操作通常需要创建 session 时返回的 `apiToken`，通过 `Authorization: Bearer <apiToken>` 传入。

基础：

- `GET /api/health`
- `GET /api/traits`
- `GET /api/backgrounds`
- `POST /api/game/roll-traits`
- `POST /api/game/start`
- `GET /api/game/:sessionId`
- `GET /api/game/meta/rules`
- `GET /api/game/meta/actions`

回合和事件：

- `POST /api/game/:sessionId/action`
- `POST /api/game/:sessionId/end-action-phase`
- `POST /api/game/:sessionId/choice`
- `GET /api/game/:sessionId/intro`
- `POST /api/game/:sessionId/narrate-stream`

赛事：

- `GET /api/game/:sessionId/tournaments`
- `POST /api/game/:sessionId/signup`
- `POST /api/game/:sessionId/withdraw`

商店和经济：

- `GET /api/game/meta/shop`
- `POST /api/game/:sessionId/shop`
- `POST /api/game/:sessionId/pawn`
- `POST /api/game/:sessionId/loan`
- `POST /api/game/:sessionId/friend-loan`
- `POST /api/game/:sessionId/narrate-shop`

战队和队伍管理：

- `GET /api/game/meta/clubs`
- `GET /api/game/:sessionId/clubs`
- `POST /api/game/:sessionId/apply-club`
- `POST /api/game/:sessionId/team-response`
- `POST /api/game/:sessionId/leave-team`
- `POST /api/game/:sessionId/team-practice`
- `POST /api/game/:sessionId/team-meeting`
- `POST /api/game/:sessionId/locker-room-talk`
- `POST /api/game/:sessionId/retain-core-teammate`
- `POST /api/game/:sessionId/team-training-focus`

调试：

- `POST /api/debug/:sessionId`
- `GET /api/debug/sessions`
- `GET /api/debug/llm-logs`
- `GET /api/debug/llm-logs/:id`
- `POST /api/debug/llm-logs/test`
- `GET /api/debug/ai-status`
- `GET /api/debug/ai-events/:sessionId`

### 事件和 Outcome

事件入口：

- [backend/src/engine/events.ts](./backend/src/engine/events.ts)
- [backend/src/data/events/index.ts](./backend/src/data/events/index.ts)
- [backend/src/data/events/tournamentContext.ts](./backend/src/data/events/tournamentContext.ts)

事件和行动结果统一使用结构化 `Outcome`：

- `coreGrowth`：五个竞技属性成长，不包含 `money`。
- `dailyGrowth`：日常行动触发的成长属性。
- `stateDelta`：手感、tilt、疲劳、压力等高频状态。
- `resourceDelta`：资金、名气、积分、AP 等资源。
- `progression`：阶段、战队层级、伤病休养和结局推进。
- `tags`：标签增删和冷却标签。
- `effects`：Buff 添加或移除。

新增事件或行动时，不要再写旧式顶层字段，例如 `moneyDelta`、`stressDelta`、`tagAdds`、`buffAdd`。资金进入 `resourceDelta.money`，压力进入 `stateDelta.stress`，标签进入 `tags`，Buff 进入 `effects`。

### AI

AI 服务入口在 [backend/src/ai/service.ts](./backend/src/ai/service.ts)。当前支持：

- 开场故事。
- 事件叙事润色和流式叙事。
- 商店购买叙事。
- 生涯总结。
- 自由行动判定和二次校验。
- 社交动态。
- 临时事件生成和 AI 事件缓存。

AI 生成事件会经过 [backend/src/validation/guard.ts](./backend/src/validation/guard.ts) 校验，再进入缓存。赛事上下文 AI 事件需要使用 `type: "tournament-context"` 并匹配当前阶段。

### 存储

- D1：session、round history、LLM 日志等持久数据。
- KV：开场故事缓存、AI 事件缓存等短期或可再生成内容。
- [backend/src/storage/index.ts](./backend/src/storage/index.ts) 负责按环境组装存储实现。

---

## 前端页面

- `/`：新局创建，包含选手名、特质抽取、重抽和属性分配。
- `/game/:sessionId`：主游戏界面，包含 HUD、目标、事件、行动、商店、贷款、战队、赛事、社交动态、历史和结局面板。
- `/debug`：本地调试入口。
- `/debug/sessions`：session 列表。
- `/debug/sessions/:sessionId`：单个 session 调试视图。

API 基础地址解析在 [frontend/src/lib/api.ts](./frontend/src/lib/api.ts)：

1. 优先使用 `NEXT_PUBLIC_API_BASE`。
2. 本地或局域网 host 默认指向 `http://127.0.0.1:8787`。
3. `cs.example.com` 会映射到 `cs-api.example.com`。
4. 其他 host 会尝试映射到 `api.{host}`。

---

## 开发注意事项

- 写 session 的 API 需要 `apiToken`；前端会在创建新局后保存并带上。
- 行动阶段和事件阶段有严格路由限制，新增写操作时要确认阶段。
- 长事件流程进行中时，报名、退赛、离队、日常行动等操作会被拦截。
- 资金变化优先使用 [backend/src/engine/money.ts](./backend/src/engine/money.ts)；事件和行动使用 `Outcome.resourceDelta.money`。
- 修改类型时同步后端、前端和 `shared/types.ts`。
- 新增赛事要同时考虑报名窗口、阶段门槛、战队门槛、资格门票、积分门槛和赛事上下文。
- 新增队伍功能要考虑队友默契、`teamTrust`、队伍身份、战队运行态和比赛模拟。

---

## 验证建议

常用检查：

```bash
cd backend
npm run typecheck
npm run test

cd ../frontend
npm run typecheck
npm run build
```

文档改动通常不需要重新初始化 D1；涉及 schema、存储字段或旧 session 迁移时，需要额外验证本地 D1 和调试页。
