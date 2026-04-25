# CS2 电竞选手人生模拟器

文字冒险 + 数值结算的 CS2 电竞生涯模拟器。前端 Next.js + Zustand + TypeScript，后端 TypeScript on Cloudflare Workers（Hono + D1 + KV），AI 走 Anthropic（默认模板兜底）。

---

## 目录结构

```
cs2-game-simulator/
├── README.md
├── shared/
│   └── types.ts                  共享领域类型（手动同步到前后端）
├── backend/                      Cloudflare Workers 后端
│   ├── wrangler.toml
│   ├── schema.sql
│   └── src/
│       ├── index.ts              Hono 入口 + CORS
│       ├── types.ts              shared/types 镜像 + 内部引擎类型
│       ├── routes/
│       │   └── game.ts           /api/* 路由
│       ├── engine/
│       │   ├── constants.ts      属性/压力/赛季/晋级阈值
│       │   ├── resolver.ts       d20 + primary*2 + secondary 检定 / 成长曲线
│       │   ├── stages.ts         阶段锁（fame/tag 门槛）
│       │   ├── events.ts         pickEvent + 状态权重 + 占位符替换
│       │   └── gameEngine.ts     initPlayer / applyChoice / 时间推进 / 结局判定
│       ├── data/
│       │   ├── traits.ts         22 条特质（含正/负/混合）
│       │   ├── backgrounds.ts    起点身份（数据保留，UI 已隐藏）
│       │   ├── tournaments.ts    9 个赛事 + 多阶段 bracket + 合成事件
│       │   ├── rivals.ts         AI 对手战队名生成
│       │   ├── leaderboard.ts    战队积分榜构建/tick/加分
│       │   └── events/           分类事件池
│       │       ├── training.ts / ranked.ts / team.ts / tryout.ts
│       │       ├── match.ts / media.ts / life.ts
│       │       ├── betting.ts    博彩（被发现 → 永久禁赛）
│       │       ├── cheat.ts      外挂（被发现 → 永久禁赛）
│       │       ├── rest.ts       强制休养
│       │       ├── stress.ts     高压力专属事件
│       │       ├── rival.ts      对手战队事件（用 {rival0}/{rival1} 占位）
│       │       ├── broadcast.ts  Major 落幕广播（不参赛时触发）
│       │       └── index.ts      汇总注册 + tournament-* ID 合成
│       ├── storage/              D1 + KV 包装
│       └── ai/
│           ├── prompts.ts
│           └── service.ts        narrate() + simulateLeaderboardTick 钩子
└── frontend/                     Next.js 前端 (App Router)
    ├── next.config.mjs
    ├── .env.example
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── globals.css
        │   ├── page.tsx                  开局页（特质 → 分配属性 → 开始）
        │   └── game/[sessionId]/page.tsx
        ├── components/
        │   ├── PlayerStats.tsx           六维 + 心理/身体/压力/名气 + 阶段倒计时
        │   ├── TraitRoll.tsx             随机抽特质 + 1 次重抽
        │   ├── StatAllocatorModal.tsx    底线感知分配器
        │   ├── EventCard.tsx
        │   ├── ChoiceList.tsx
        │   ├── ResultPanel.tsx           判定 + 属性变化 + 压力/名气 + 被动
        │   ├── HistoryPanel.tsx
        │   ├── StageBadge.tsx
        │   ├── MatchPanel.tsx            赛事日历 + 报名/退赛 + 阶段进度
        │   └── Leaderboard.tsx           战队积分榜（玩家高亮）
        ├── lib/
        │   ├── api.ts                    自动路由（cs.* → cs-api.*）
        │   ├── types.ts                  shared/types 镜像
        │   └── format.ts                 label/derived helpers
        └── store/
            └── gameStore.ts              Zustand session state
```

> 共享类型在 `shared/types.ts`，手动同步到 `backend/src/types.ts` 和 `frontend/src/lib/types.ts`。两个子工程各自部署，不做 monorepo。

---

## 系统总览

### 基础属性（6 项，0-20 范围）

| 键 | 名称 | 作用 |
|---|---|---|
| `intelligence` | 智力 | 战术、应变、残局决策 |
| `agility` | 敏捷 | 枪法、反应、对枪 |
| `experience` | 经验 | 比赛经验、版本适应、晋升阈值 |
| `money` | 金钱 | 训练资源、生活、康复（豁免成长曲线） |
| `mentality` | 心态 | 高压发挥；驱动压力增减 |
| `constitution` | 体质 | 手腕颈椎；身体状态 = constitution × 2 |

**分配规则**：每项 0 起步，玩家分配 12 点；正向特质加成作为底线（不可降低），负向特质加成在确认后扣减（可被分配点抵消）。

### 动态状态

| 字段 | 范围 | 说明 |
|---|---|---|
| `stress` | 0–100 | 压力值，**100 → 立即结束（生涯压力崩盘）** |
| `fame` | 0–100 | 名气，决定阶段晋升和媒体事件权重 |
| `restRounds` | ≥0 | 强制休养剩余周数 |
| `stressMaxRounds` | ≥0 | 压力拉满连续周计数（>=1 即触发结局） |
| `pendingMatch` | 可空 | 已报名的赛事 + 当前阶段 + 解析周 |
| `year / week` | 1+ / 1-48 | 游戏内时间（48 周 / 年） |
| `rivals` | 4 | 命名对手，事件中通过 `{rival0..3}` 引用 |

### 数值公式

- **判定**：`attack = d20 + primary*2 + secondary*1 + Σ(traitBonus 命中 tag) − Σ(traitPenalty)`，DC = `choice.dc + event.difficulty*2 + floor(stageIndex/2)`
- **博彩/外挂**：纯概率分支，按 stage 阶梯探测率（rookie 5–8% → star 40–55%），被抓即 `endRun`
- **成长曲线**：正向属性增益按 `gain / (1 + currentStat/10)` 递减，至少 +1；负向直接扣；money 豁免
- **心态 → 压力被动**：每回合按 mentality 计算
  - `mentality ≥ 7`：压力 −6
  - `mentality ≥ 4`：压力 −3
  - `mentality ≤ 2`：压力 +4
  - `mentality ≤ 0`：压力 +8
- **失败惩罚**：选项失败若没显式 `stressDelta` 自动 +6；事件声明的 stressDelta 按 ×5 缩放到 0-100 量级
- **破产**：`money ≤ 0` 每回合心态 −1、压力 +8

### 阶段晋升（gates）

阶段顺序：`rookie → youth → second → pro → star → veteran → retired`

每级晋升需要满足：经验 ≥ 阈值 AND（fame ≥ 阈值 OR 持有任一快捷 tag）

| 从 → 到 | exp | fame | 快捷 tag |
|---|---|---|---|
| rookie → youth | 6 | ≥ 2 | `signed-second-team / tournament-winner / fan-favorite` |
| youth → second | 10 | ≥ 5 | `signed-second-team / tournament-winner` |
| second → pro | 14 | ≥ 10 | `tournament-winner / highlight-clip` |
| pro → star | 18 | ≥ 20 | `tournament-winner` |

`Outcome.stageSet / stageDelta` 可绕过 gate（剧情驱动）。

### 特质系统

22 条特质，每条：`{ modifiers, tags }`。开局**随机抽 3 个**（允许 1 次重抽）。
正向 modifier 进分配器底线、负向作为后置扣减；tags 在事件检定中被 `traitBonuses[tag] / traitPenalties[tag]` 引用。

### 经济（含博彩）

- 钱在结算中豁免成长曲线（赚 5 就是 5）
- 破产链：money ≤ 0 → 每回合 心态 −1 + 压力 +8（至 mentality 0 后会拉升压力到 100）
- 博彩事件 (`type: 'betting'`)：押大/押小/拒绝；按阶段阶梯探测率，被抓 → `banned_for_match_fixing`

### 外挂风险系统

- `type: 'cheat'` 事件类似博彩；探测率比博彩高一档（rookie 8% → star 55%）
- 被抓 → `banned_for_cheating`，全社交圈+赞助商+俱乐部连带通报

### 体质 / 伤病系统

- 身体状态 = `constitution × 2`（前端展示）
- 高强度训练/带伤上场 → `injuryRestRounds` 进入强制休养
- `constitution ≤ 0` → 自动进入 `INJURY_REST_ROUNDS = 2` 周强制休养
- 休养中事件池强制走 `rest.ts`
- `tag: injury-prone + constitution = 0` → `injury_ended_career` 结局

### 比赛系统（多阶段 bracket）

| 层级 | 赛事 | 阶段数 | 报名窗口（周） | fame 门槛 | 积分门槛 |
|---|---|---|---|---|---|
| netcafe | 本地网吧赛 | 1 | always | – | – |
| city | 城市公开赛 | 2 | 10/22/34/46 | – | – |
| platform | 平台赛 (Faceit/ESEA) | 2 | always | – | – |
| secondary-league | 次级联赛 | 2 | 6/18/30/42 | 6 | – |
| development-league | 发展联赛 | 4 | 14/38 | 12 | – |
| tier2 | Tier 2 邀请赛 | 4 | 10/26/42 | 18 | 5 |
| tier1 | Tier 1 国际邀请赛 | 4 | 14/38 | 30 | 15 |
| s-class | S 级赛事 | 6 | 12/36 | 45 | 25 |
| **major** | Major 大赛 | 6 | 22/46 | 35 | 30 |

**多阶段流程**：报名 → 次周入围 → 胜则次周下一阶段、败则按 `rewardShareOnEarlyExit` 拿部分奖励
- 6-stage：入围 / 小组 / 淘汰 / 八强 / 半决 / 决赛
- 4-stage：入围 / 小组 / 半决 / 决赛
- 2-stage：入围 / 决赛

合成事件 ID 格式：`tournament-{tournamentId}--{stageIndex}`

### 排行榜（积分榜）

- Session 创建时构建：玩家队 + 4 个 rivals + 10 个填充队 = ~15 队
- **每回合**：非玩家队随机 +0~3 分（15% 概率 +5）
- **玩家**：按 `stageRewardDelta(t, idx, won)` 在每个赛事阶段加分
- Major 等大赛要求积分 ≥ pointsRequired

### 时间系统

- 1 回合 = 1 周；48 周 / 年；MAX_ROUNDS = 80（≈ 1.5 年）
- 显示格式："第 X 年 第 Y 周"
- Major 在周 22/46 报名、周 23/47 入围；广播事件在周 24/48 触发（玩家未报名时）

### 事件分类与权重

| EventType | 用途 |
|---|---|
| `training / ranked / team / tryout / match / media / life` | 常规事件池 |
| `betting / cheat` | 高风险纯概率分支（被抓 endRun） |
| `rest` | 仅在 `restRounds > 0` 触发 |

**state-aware weight**：
- `fame ≥ 15` → media ×1.6
- `money ≤ 1` → betting ×1.8、cheat ×1.5
- `constitution ≤ 2` → life ×1.4
- `stress ≥ 60` → 带 `stressed` 标签的事件 ×2
- `major-broadcast`（周 24/48 + 未参赛）→ 广播事件 ×5

**动态合成 tag**：玩家状态满足条件时自动注入到事件 `requireTags` 过滤集中（`stressed / famous / cash-strapped / frail / major-broadcast`）。

### 多结局

| ending | 触发 |
|---|---|
| `legend` | 满 80 回合 + fame ≥ 30 |
| `champion` | 满 80 回合 + 持 `tournament-winner` |
| `retired_on_top` | 满 80 回合（默认） |
| `quiet_exit` | stage = retired |
| `stress_breakdown` | 压力拉满 ≥1 周 |
| `injury_ended_career` | `injury-prone` 且 constitution ≤ 0 |
| `banned_for_match_fixing` | 博彩被发现 |
| `banned_for_cheating` | 外挂被发现 |
| `career_ended` | outcome.endRun 默认 |

### AI 叙事

- `ai/service.ts` 提供 `AiService`，默认 `TemplateNarrator`（无操作直返原文）
- 设 `AI_PROVIDER=anthropic` + `wrangler secret put ANTHROPIC_API_KEY` 启用 `AnthropicNarrator`
- 调用点：`gameEngine.applyChoice` 末尾对结果叙事润色；rival 占位符替换在 AI 之后
- `simulateLeaderboardTick` 钩子已留出，下版本可被 LLM 实现替换

---

## API

错误统一 `{ error: string }`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 含 `ai: { provider, active }` |
| GET | `/api/traits` | 列出全部特质（开局展示） |
| GET | `/api/backgrounds` | 列出起点身份（保留接口，UI 隐藏） |
| POST | `/api/game/roll-traits` | 服务端随机抽 3 个特质 |
| POST | `/api/game/start` | body: `{ name, traitIds, backgroundId?, stats? }` |
| GET | `/api/game/:sessionId` | 完整会话 + `promotion` 字段 |
| POST | `/api/game/:sessionId/choice` | body: `{ choiceId }` |
| GET | `/api/game/:sessionId/tournaments` | 当周可报名赛事 + 当前 pendingMatch |
| POST | `/api/game/:sessionId/signup` | body: `{ tournamentId }`（验 stage / fame / points / 报名窗口） |
| POST | `/api/game/:sessionId/withdraw` | 清空 pendingMatch |
| GET | `/api/game/meta/rules` | 公开常量（pointPool 等） |

`POST /api/game/start` 响应：`{ sessionId, player, currentEvent, leaderboard }`
`POST /api/game/:sessionId/choice` 响应：`{ result, player, currentEvent, status, ending?, promotion, leaderboard }`

---

## 前端自动路由

`frontend/src/lib/api.ts` 在客户端运行时根据 `window.location.hostname` 推断后端：

1. `NEXT_PUBLIC_API_BASE` 显式覆盖优先
2. `localhost / 127.0.0.1 / 192.168.* / *.local` → `http://127.0.0.1:8787`
3. `cs.atsud0.me` → `https://cs-api.atsud0.me`（前缀 `cs.` → `cs-api.`）
4. 其余 host → `https://api.<host>`（兜底通用规则）

可以直接把 `cs.<your-domain>` 反代到本地 `next dev`，`cs-api.<your-domain>` 反代到本地 `wrangler dev`，无须配 env 变量。

---

## 本地开发

需要 Node ≥ 18、npm。

### 后端

```bash
cd backend
npm install
# wrangler.toml 里 D1 / KV id 在 --local 模式下用占位 UUID 即可
npx wrangler d1 execute cs2-sim-db --local --file=./schema.sql
npx wrangler dev          # http://127.0.0.1:8787
```

可选启用 AI（默认走模板）：

```bash
# wrangler.toml
[vars]
AI_PROVIDER = "anthropic"
AI_MODEL = "claude-haiku-4-5-20251001"

# secret
npx wrangler secret put ANTHROPIC_API_KEY
```

### 前端

```bash
cd frontend
cp .env.example .env.local    # 可不配，自动路由会用 127.0.0.1:8787
npm install
npm run dev                   # http://localhost:3000
```

### 类型检查

```bash
cd backend  && npm run typecheck
cd frontend && npm run typecheck
```

---

## Cloudflare 部署

### 后端

```bash
cd backend
npx wrangler d1 create cs2-sim-db
npx wrangler kv namespace create CS2_KV
# 把返回的 database_id / namespace id 填入 wrangler.toml
npx wrangler d1 execute cs2-sim-db --remote --file=./schema.sql
npx wrangler deploy
```

### 前端

任选其一：
- **Vercel**：`vercel --prod`，把 worker 域名设为 `cs-api.<host>` 后无需配 env（自动路由）
- **Cloudflare Pages**：`npx @cloudflare/next-on-pages` + `wrangler pages deploy`

> 若使用自动路由，把前端绑到 `cs.atsud0.me`、后端 worker 绑到 `cs-api.atsud0.me`。

---

## 已实现里程碑（按迭代）

### v1（MVP）
- 5 属性 / 10 特质 / 5 起点身份 / 14 事件 / 7 类
- d20 检定、阶段经验晋升、4 个结局
- D1 会话存储 + KV、CORS、AI 模板兜底

### v2（随机特质 + 分配器）
- 特质改为**随机抽 3 个**，允许 1 次重抽
- 属性分配器：每项 0 起步，分配 10 点（后改 12），底线/扣减可视化
- 博彩事件（按 stage 阶梯探测率）
- 破产链（money ≤ 0 → mentality −1）
- 心态宽限 3 回合 → burnout

### v3（特质属性回归 + 心态宽限）
- 特质重新带 modifiers，正向作为分配底线、负向后置扣减

### Phase A（6 维 + 动态状态）
- 加 `constitution`、pool 12
- 动态状态：stress / fame / restRounds / collapseRounds
- 派生展示：心理 = mentality×2，身体 = constitution×2
- 成长曲线 `gain / (1 + currentStat/10)`
- 外挂事件 + 强制休养
- 前端 API 自动路由（`cs.*` → `cs-api.*`）

### Phase B（阶段锁 + 比赛深化）
- `STAGE_GATES`：fame + tag 门槛
- 4 个比赛事件（minor / major / league）
- 高压事件（stress ≥ 触发线启用 `requireTags: stressed`）
- 状态权重（media / betting / cheat 按状态加权）
- `champion` / `injury_ended_career` 结局

### Phase C（移除起点选择 + 时间 + 排行榜雏形 + 对手）
- 移除起点身份 UI；后端用中性 `rookie-default`
- 引入年/月时间（后续 D1 改为周）
- 9 个赛事目录 + 单阶段报名机制
- 4 个 rival 战队 + 2 个 rival 事件（占位符替换）

### Phase D1（压力 0-100 + 周制 + 多阶段 + 排行榜）
- 压力刻度 0-100，失败选项强制加压，破产再加压；100 立即结束
- 时间改为周（48 周/年），MAX_ROUNDS=80
- 多阶段比赛 bracket（1/2/4/6 阶段），按阶段加分入排行榜
- 战队积分榜（~15 队，每周 tick）
- Major 落幕广播事件
- AI 服务 active 字段 + leaderboard 模拟钩子

---

## 后续扩展（待办）

### 高优先级（Phase D2）
- **AI 生成随机事件**：基于玩家状态 + 历史让 LLM 产出全新 EventDef，注入事件池一次性消费
- **AI 生成战报**：每场比赛阶段用 LLM 产出 demo 文本（"AWPer X 在 mid 架点拿下 1v3"）
- **Twitter 风格动态 feed**：`/api/game/:id/feed` 返回 LLM 生成的圈内动态条目（玩家、对手、记者发言）
- **AI 替换 leaderboard tick**：让 LLM 按选手 narrative 调分而非纯随机

### 中优先级
- **更多结局**：金钱结局（财务自由提前退役）、纯路人结局（无成就退役）、转教练 / 解说
- **比赛过程化**：每个 stage 内多张图，每张图独立检定，让 BO3/BO5 真正有节奏感
- **社交关系系统**：队友 / 经纪人 / 教练个体，分别有信任度 / 冲突 / 转会促因
- **赞助系统**：fame 门槛触发赞助合同，提供持续收入和压力
- **赛季设定**：版本更新事件，影响 meta；老选手版本不适应 → 经验贬值

### 低优先级 / Polish
- 数值平衡：收集多局数据后微调 DC、stressDelta、reward
- 视觉震屏：心态崩溃时 UI 红边、压力满时呼吸感
- i18n：英文版（事件文本量大，需配套 LLM 翻译流水线）
- 排行榜持久化（sessions ↔ runs 表，跨会话纪录）
- 战队系统真正建模：成员 / 替补 / 主教练；目前 rivals 仅是名字

### 已知遗留问题
- 旧会话（D1 存储里的 JSON）字段缺失时不会自动迁移，需要清 `.wrangler/state` 重开
- 报名后立即结束游戏（如博彩被抓）时 pendingMatch 会丢失，没补救
- 事件占位符替换只支持 `{rival0..3}`，未支持队友/赞助商等

---

## 设计决策备忘

- **特质 = tags + modifiers**：改了三轮最终定为"正 modifier 给底线 + 负 modifier 后置扣减 + tags 在 check.traitBonuses 中匹配"，避免双系统冲突
- **金钱不走成长曲线**：钱是库存不是技能，避免"越富赚越少"反直觉
- **压力是唯一硬性死亡线**：mentality 不再触发 GameOver，而是成为压力调节器，让玩家有时间反应
- **多阶段比赛 vs 单回合比赛**：选了多阶段，因为单回合"打 Major"和"打网吧赛"难以体现差异
- **占位符替换在 toPublicEvent**：保持 EventDef 数据纯净，渲染时再注入 rival 名
- **rookie-default 背景**：用户反映起点身份 UI 与特质冲突 → 隐藏 UI 但保留数据结构供未来扩展
