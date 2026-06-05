# CS2 电竞选手人生模拟器

一个以 `CS2` 职业生涯为主题的文字冒险 + 数值模拟项目。玩家从新人开局，抽取特质、分配竞技属性，通过日常行动、随机事件、商店、战队申请、贷款、赛事报名和比赛结算推进生涯。

项目当前是前后端分离实现：

- 前端：`Next.js 15` + `React 18` + `Zustand` + `TypeScript`
- 后端：`Cloudflare Workers` + `Hono` + `D1` + `KV`
- AI：可选接入 `OpenAI` / `Anthropic`，未配置时使用模板叙事兜底

---

## 当前已实现

- 新局创建：随机 3 个特质，可重抽 1 次，并在特质底线之上分配竞技属性点；资金不参与开局分配
- 核心数值：五个竞技属性、资金、压力、名气、AP、手感、疲劳、tilt、成长上限
- 回合推进：事件选择、自由行动判定、日常行动、行动 Combo、被动压力和恢复结算
- 随机事件：训练、天梯、战队、试训、赛事、媒体、生活、救助、博彩、作弊、休养、对手、经纪人等事件池
- 战队系统：申请、面试、Offer、接受/拒绝、主动离队、合同与薪资
- 阵容系统：队友角色、个性、数值、协同、信任和离队相关事件
- 赛事系统：报名窗口、资格门票、战队门槛、积分门槛、多阶段推进、弃赛惩罚
- 比赛模拟：根据枪法、经验、心态、手感、疲劳、tilt、团队协同计算胜率和个人数据，并结算比赛疲劳/压力
- 经济系统：商店、装备、成长 Buff、疲劳/压力倍率 Buff、冷却、贷款、还款、违约、典当
- 社交系统：AI 或模板生成 X 风格动态
- 调试页：本地查看 LLM 日志、AI 状态、写入测试日志
- 生涯结束：结局和总结面板

---

## 项目结构

```text
cs2-game-simulator/
├── README.md
├── docs/
│   ├── action-combo-design.md
│   ├── game-design-improvement-notes.md
│   ├── roster-system-design.md
│   ├── social-system-design.md
│   ├── state-multiplier-implementation-plan.md
│   ├── team-system-design.md
│   └── transfer-system-design.md
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
│       │   ├── matchSimulator.ts
│       │   ├── qualification.ts
│       │   ├── resolver.ts
│       │   ├── stateModifiers.ts
│       │   ├── stages.ts
│       │   └── synergy.ts
│       ├── data/
│       │   ├── actions.ts
│       │   ├── backgrounds.ts
│       │   ├── clubs.ts
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

- `backend/src/types.ts` 是后端实际使用的领域类型。
- `frontend/src/lib/types.ts` 是前端镜像类型。
- `shared/types.ts` 保留为共享类型参考文件，但当前不是自动生成链路，改类型时需要手动同步。
- `docs/` 里是系统设计文档，README 只描述当前代码已经接线的能力。

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

仓库里提供了 `backend/wrangler.toml.local` 作为本地配置模板。实际运行 `wrangler dev` 时需要有 `backend/wrangler.toml`。

```bash
cd backend
cp wrangler.toml.local wrangler.toml
```

然后按需替换：

- `database_id`
- `kv namespace id`
- `[vars]` 中的 AI 配置

AI 密钥不要写进 `wrangler.toml`，使用 Wrangler secret：

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
```

未配置 AI 时，`AI_PROVIDER = "none"`，项目仍可运行。

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

- `npm run dev`：启动 Cloudflare Worker 本地开发服务
- `npm run deploy`：部署 Worker
- `npm run db:init:local`：初始化本地 D1
- `npm run db:init:remote`：初始化远端 D1
- `npm run typecheck`：TypeScript 检查
- `npm run test`：运行 Vitest

前端：

- `npm run dev`：启动 Next.js 开发服务
- `npm run build`：构建前端
- `npm run start`：启动生产构建
- `npm run lint`：运行 Next lint
- `npm run typecheck`：TypeScript 检查

---

## 玩法模型

### 生涯阶段

当前正式阶段链路：

```text
rookie -> youth -> second -> pro -> retired
```

对应含义：

- `rookie`：路人新人
- `youth`：青训
- `second`：二线队
- `pro`：职业队
- `retired`：退役

`rookie -> youth` 主要依赖成功加入战队；`youth -> second -> pro` 主要依赖赛事参与、战队条件和晋级叙事事件。

### 核心属性

玩家有五个竞技属性和一个经济属性。竞技属性通常在 `0-20` 区间，资金上限单独更高：

- `intelligence`：智力
- `agility`：敏捷
- `experience`：经验
- `money`：资金
- `mentality`：心态
- `constitution`：体能

开局先抽取 3 个特质，特质会影响属性底线和标签；然后在底线之上分配 `POINT_POOL` 点。当前 `POINT_POOL = 12`，只分配到 `intelligence`、`agility`、`experience`、`mentality`、`constitution` 五个竞技属性；`money` 不参与开局分配。

### 高频状态

除核心属性外，玩家还有一组高频状态：

- `stress`：压力，`0-100`
- `fame`：名气
- `actionPoints`：本回合可用 AP
- `volatile.feel`：手感，默认 `-3 ~ +3`
- `volatile.tilt`：心态波动，`0 ~ 3`
- `volatile.fatigue`：疲劳，`0 ~ 100`

这些状态会被行动、事件、比赛、商店、贷款、战队合同和被动结算持续影响。

### 成长和 Buff

成长结算集中在 `backend/src/engine/resolver.ts` 和 `backend/src/engine/gameEngine.ts`。

核心规则：

- 属性越高，成长越慢。
- 生涯总成长有上限，当前 `GROWTH_CAP = 30`。
- `money` 不计入成长上限。
- Buff 可按行动标签、成长属性和剩余次数影响成长倍率；成长 Buff 只提升成长速度，不会突破 `GROWTH_CAP`。
- 疲劳和压力正向增量会经过统一状态倍率系统：体能影响疲劳增长，心态影响压力增长，特质和 Buff 可以进一步修正倍率。

### 日常行动

日常行动定义在 `backend/src/data/actions.ts`，接口为 `POST /api/game/:sessionId/action`。

当前行动包括：

- 打天梯
- 系统训练
- 休息一天
- 度假断网
- 健身锻炼
- 冥想静心
- 心理训练

行动会消耗 AP，并可能改变成长、压力、疲劳、手感、tilt 和叙事结果。正向疲劳/压力增量会套用属性、特质和 Buff 倍率；恢复类负向增量不被倍率削弱。

---

## 核心系统

### 事件系统

事件池入口：

- `backend/src/engine/events.ts`
- `backend/src/data/events/index.ts`

事件来源包括：

- `training`
- `ranked`
- `team`
- `tryout`
- `match`
- `media`
- `life`
- `bailout`
- `betting`
- `cheat`
- `rest`
- `stress`
- `rival`
- `broadcast`
- `daily`
- `chains`
- `skins`
- `agent`

事件会按阶段、标签、最近事件、压力、疲劳、报名状态、面试状态、强制休养和调试强制事件进行筛选或加权。LLM 开启时，后端还会根据近期历史生成临时 AI 事件，并通过 `backend/src/validation/guard.ts` 做结构校验。

### 自由行动

`POST /api/game/:sessionId/choice` 支持 `customAction`。开启 AI 后，后端会：

1. 用 LLM 评价玩家自定义行动质量。
2. 把质量映射成检定加成。
3. 再用二次校验确认判定是否合理。
4. 不通过时静默降级为普通选项结算。

自由行动需要携带创建 session 时返回的 `apiToken`。

### 商店和经济

商店定义在 `backend/src/data/shop.ts`，购买接口为 `POST /api/game/:sessionId/shop`。

商店支持：

- 价格
- 阶段门槛
- 名气门槛
- 冷却
- 正负面叙事
- 添加或移除 Buff
- 添加或移除 tag
- 装备拥有状态

经济相关接口：

- `POST /api/game/:sessionId/loan`：申请贷款
- `POST /api/game/:sessionId/pawn`：典当装备

贷款规则在 `applyForLoan` 和 `processLoanRepayment` 中：青训以后可借，单笔 `20K-100K`，12 回合后按 10% 利息还款；违约会降低名气并添加转会禁止标签。

### 战队和阵容

战队定义在 `backend/src/data/clubs.ts`，阵容定义在 `backend/src/data/roster.ts`。

玩家可以：

- 申请俱乐部
- 等待回应或面试
- 获取入队 Offer
- 接受或拒绝 Offer
- 主动离队
- 经历合同、挖角、被踢、续约等事件

战队会影响：

- 月薪
- 赛事资格
- 战队积分榜
- 资格门票归属
- 队友协同
- 比赛胜率
- 社交动态

### 赛事和比赛模拟

赛事定义在 `backend/src/data/tournaments.ts`，报名与弃赛接口在 `backend/src/routes/game.ts`，比赛模拟在 `backend/src/engine/matchSimulator.ts`。

赛事支持：

- 报名周窗口
- 阶段门槛
- 名气门槛
- 战队等级门槛
- 战队积分门槛
- 个人或战队资格门票
- 多阶段 bracket 推进
- 赛前准备事件
- 弃赛惩罚

比赛胜率主要看：

- 枪法：`agility` + `experience`
- 稳定：`mentality`
- 即时状态：`feel`、`fatigue`、`tilt`
- 团队加成：队友数值、角色协同、特质协同、`teamTrust`

比赛还会结算比分、击杀、死亡、助攻、爆头率、rating、名气、积分和资格奖励。

当前比赛个人数据按每回合贡献生成：

- 比分：根据胜率和强弱差生成 `13:x` 或 `x:13`，强弱差越大越容易大比分，爆冷局通常更接近。
- K/D/A：先计算每回合击杀率 `KPR`、死亡率 `DPR`、助攻率 `APR`，再乘以总回合数生成个人数据；不再用固定击杀/死亡下限抬高短局样本。
- 爆头率：先按枪法、手感和随机波动生成爆头概率，再由实际击杀数生成爆头击杀，最后反推 `HS%`。
- Rating：使用每回合贡献模型，综合 `KPR`、`DPR`、`APR`、`HS%`、决策和胜负修正；不会只因为小样本 `K/D` 较高就给出正常 rating。

### AI 叙事

AI 服务入口是 `backend/src/ai/service.ts`。当前能力包括：

- 开场故事
- 事件叙事润色
- 流式叙事
- 商店购买叙事
- 生涯总结
- 自由行动判定
- 自由行动判定校验
- 社交动态
- 临时事件生成

`/api/health` 会返回当前 AI provider 和 active 状态。未启用 AI 时，系统会尽量使用模板内容兜底；自由行动和流式叙事这类强依赖 LLM 的能力会返回错误或被前端跳过。

---

## 前端页面

- `/`：新局创建，包含选手名、特质抽取和属性分配。
- `/game/:sessionId`：主游戏界面，包含事件、选项、行动、商店、贷款、战队、赛事、社交动态、历史和结局面板。
- `/debug`：本地 LLM 调试页，读取 `/api/debug/*` 接口。

API 基础地址解析逻辑在 `frontend/src/lib/api.ts`：

1. 优先使用 `NEXT_PUBLIC_API_BASE`。
2. 本地或局域网 host 默认指向 `http://127.0.0.1:8787`。
3. `cs.example.com` 会映射到 `cs-api.example.com`。
4. 其他 host 会尝试映射到 `api.{host}`。

---

## API 概览

所有业务接口挂在 `/api` 下。

基础：

- `GET /api/health`
- `GET /api/traits`
- `GET /api/backgrounds`
- `POST /api/game/roll-traits`
- `POST /api/game/start`
- `GET /api/game/:sessionId`
- `GET /api/game/meta/rules`

回合和行动：

- `POST /api/game/:sessionId/choice`
- `POST /api/game/:sessionId/action`

赛事：

- `GET /api/game/:sessionId/tournaments`
- `POST /api/game/:sessionId/signup`
- `POST /api/game/:sessionId/withdraw`

商店和经济：

- `GET /api/game/meta/shop`
- `POST /api/game/:sessionId/shop`
- `POST /api/game/:sessionId/loan`
- `POST /api/game/:sessionId/pawn`
- `POST /api/game/:sessionId/narrate-shop`

战队：

- `GET /api/game/meta/clubs`
- `POST /api/game/:sessionId/apply-club`
- `POST /api/game/:sessionId/team-response`
- `POST /api/game/:sessionId/leave-team`

AI 和叙事：

- `GET /api/game/:sessionId/intro`
- `POST /api/game/:sessionId/narrate-stream`
- `GET /api/game/:sessionId/social-feed`
- `GET /api/game/:sessionId/summary`

元数据：

- `GET /api/game/meta/actions`
- `GET /api/game/meta/shop`
- `GET /api/game/meta/clubs`

本地调试：

- `POST /api/debug/:sessionId`
- `GET /api/debug/llm-logs`
- `GET /api/debug/llm-logs/:id`
- `POST /api/debug/llm-logs/test`
- `GET /api/debug/ai-status`
- `GET /api/debug/ai-events/:sessionId`

需要注意：

- `choice`、`intro`、`narrate-stream`、`narrate-shop`、`social-feed`、`summary` 需要 `Authorization: Bearer <apiToken>`。
- `apiToken` 由 `POST /api/game/start` 返回。
- `/api/debug/*` 中修改数据和读取日志的接口只允许本地或局域网调试请求。

---

## 存储

后端存储封装在 `backend/src/storage/`：

- `D1`：保存 session、history、round result 等长期状态。
- `KV`：缓存 intro、社交动态、AI 临时事件、LLM 日志等短期或调试数据。

数据库 schema 在 `backend/schema.sql`。

---

## 部署

### 后端

准备 `backend/wrangler.toml`，配置 D1 和 KV：

```toml
[[d1_databases]]
binding = "DB"
database_name = "cs2-sim-db"
database_id = "..."

[[kv_namespaces]]
binding = "KV"
id = "..."
```

部署：

```bash
cd backend
npm run deploy
```

初始化远端 D1：

```bash
cd backend
npm run db:init:remote
```

### 前端

前端可部署到任何支持 Next.js 的平台。生产环境需要设置：

```bash
NEXT_PUBLIC_API_BASE=https://your-worker-domain.example.com
```

---

## 开发注意事项

- 改领域类型时，同步检查 `backend/src/types.ts`、`frontend/src/lib/types.ts` 和 `shared/types.ts`。
- 新增事件时，优先放入 `backend/src/data/events/`，再从 `backend/src/data/events/index.ts` 注册。
- 新增行动改 `backend/src/data/actions.ts`，新增商品改 `backend/src/data/shop.ts`，新增赛事改 `backend/src/data/tournaments.ts`。
- 涉及判定、成长、被动结算、贷款和薪资时，检查 `backend/src/engine/gameEngine.ts`。
- 涉及赛事胜率和个人数据时，检查 `backend/src/engine/matchSimulator.ts`。
- 涉及队伍资格门票时，检查 `backend/src/engine/qualification.ts`。
- 涉及 AI 输出结构时，更新 `backend/src/ai/prompts.ts` 并确认 `backend/src/validation/guard.ts` 仍能兜住非法输出。

---

## 当前边界

这份 README 描述的是当前仓库中已经实现或已经接线的系统，不作为长期路线图。

已知工程边界：

- 不是 monorepo 构建体系，前后端分别安装、运行、检查和部署。
- 共享类型目前不是自动生成，需要人工保持同步。
- AI 是增强能力，不是核心规则引擎的硬依赖。
- `wrangler.toml.local` 是模板，真实部署配置和密钥不应提交。
