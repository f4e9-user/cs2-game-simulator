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
│       │   ├── events.ts         pickEvent + 状态权重 + 动态 tag 合成
│       │   └── gameEngine.ts     initPlayer / applyChoice / 战队周薪 / 连败计数 / 结局判定
│       ├── data/
│       │   ├── traits.ts         22 条特质（含正/负/混合）
│       │   ├── backgrounds.ts    起点身份（数据保留，UI 已隐藏）
│       │   ├── tournaments.ts    9 个赛事 + 多阶段 bracket + 合成事件
│   │   ├── actions.ts        6 个日常行动（+健身锻炼/冥想静心）
│       │   ├── shop.ts           9 件商品（消耗品/服务/装备/社交四类）
│       │   ├── clubs.ts          16 家俱乐部定义（youth/semi-pro/pro/top 四档）
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
│   │       ├── daily.ts      每日行动（routine 类型，主成长途径）
│   │       ├── skins.ts      37 个 CS2 饰品主题事件（7 分类）
│   │       ├── chains.ts     tag 链式事件（矛盾/舆论/禁赛连锁）
│   │       └── index.ts      汇总注册 + tournament-* ID 合成
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
        │   ├── HudTopBar.tsx             顶栏：玩家名/阶段/派生属性条/volatile 状态/排名
        │   ├── PlayerStats.tsx           右侧面板：生涯记录/晋级条件/特质/标签
        │   ├── TraitRoll.tsx             随机抽特质 + 1 次重抽
        │   ├── StatAllocatorModal.tsx    底线感知分配器
        │   ├── EventCard.tsx
        │   ├── ChoiceList.tsx
        │   ├── ResultPanel.tsx           判定 + volatile变化(feel/tilt/fatigue) + 压力/名气 + 被动
        │   ├── FeedPanel.tsx             历史动态，含 volatile 变化 chip
        │   ├── HistoryPanel.tsx
        │   ├── StageBadge.tsx
        │   ├── MatchPanel.tsx            赛事日历 + 报名/退赛（含弃赛惩罚确认） + 阶段进度
        │   ├── ActionPanel.tsx           行动力面板：AP条 + 6个日常行动 + 行动结果小卡
        │   ├── ShopPanel.tsx             购物面板：消耗品/服务/装备/社交四类商品
        │   ├── EndingPanel.tsx           富结局面板：生涯轨迹/五维/赛事战绩/特质/标签/战队历史
        │   ├── ClubPanel.tsx             战队面板：当前战队/申请等待/可申请俱乐部列表
        │   ├── TeamOfferModal.tsx        入队邀请弹窗：合同详情 + 接受/拒绝
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

### 基础属性（核心属性，隐藏值，0-20 范围）

核心属性**不直接展示给玩家**，通过派生属性换算后显示。

| 键 | 名称 | 作用 |
|---|---|---|
| `intelligence` | 智力 | 战术、应变、残局决策；驱动"决策"派生属性 |
| `agility` | 敏捷 | 枪法、反应、对枪；驱动"枪法"派生属性 |
| `experience` | 经验 | 比赛经验（修正项，权重 0.3）；d20 检定修正项 |
| `money` | 金钱 | 训练资源、生活、康复（豁免成长曲线） |
| `mentality` | 心态 | 高压发挥；驱动"稳定性"派生属性；调节压力增减 |
| `constitution` | 体质 | 手腕颈椎；驱动"续航"派生属性 |

**分配规则**：每项 0 起步，玩家分配 12 点；正向特质加成作为底线（不可降低），负向特质加成在确认后扣减（可被分配点抵消）。

### 派生属性（展示给玩家，0-100 分）

派生属性是核心属性的加权换算，以进度条形式显示在 HUD 顶栏。

| 派生属性 | 公式 | 说明 |
|---|---|---|
| 枪法 (AIM) | `(agility×0.7 + experience×0.3) / 20 × 100` | 对枪能力 |
| 决策 | `(intelligence×0.7 + experience×0.3) / 20 × 100` | 战术意识 |
| 稳定性 | `mentality / 20 × 100` | 高压稳定 |
| 续航 | `constitution / 20 × 100` | 持久能力 |

### 状态系统（volatile，高频变化）

volatile 状态每回合实时变化，不受成长上限约束。

| 字段 | 范围 | 说明 |
|---|---|---|
| `feel` | −3 ~ +3（0.5 步进）| 手感：影响对枪表现，失误会降低，连胜会升高 |
| `tilt` | 0 ~ 3 | 心态波动：tilt ≥ 2 时手感上限下降 0.5；tilt 3 = 崩盘边缘 |
| `fatigue` | 0 ~ 100 | 疲劳：≥ 70 时压力增益 ×1.4；≥ 85 时手感自动衰减 −1 |

**volatile 交互规则**：
- `tilt ≥ 2 && feel > 1` → `feel -= 0.5`（心态差抑制手感峰值）
- `fatigue ≥ 85 && feel > 0` → `feel -= 1`（极度疲劳压手感）
- 事件通过 `feelDelta / tiltDelta / fatigueDelta` 直接调整

### 成长系统

核心属性的成长走**衰减曲线 + 生涯总上限**，避免无限堆属性。

| 当前值范围 | 成长倍率 |
|---|---|
| 0 – 4 | ×1.0 |
| 5 – 9 | ×0.7 |
| 10 – 14 | ×0.4 |
| 15 – 20 | ×0.15 |

- **生涯总成长上限**：`GROWTH_CAP = 30`（累计成长量，跨所有属性）
- **每日行动成长**：每次天梯/训练成功随机增长 0.1–0.3（乘以衰减因子）
- **叙事事件**：不再直接修改核心属性；旧版 `statChanges` 通过 `translateStatDelta` 转译为 volatile 效果（agility+ → feel+，mentality- → tilt+，constitution- → fatigue+）；仅 `experience` 可从叙事事件获得极小成长（×0.04）
- **Buff 倍率**：匹配 `actionTag` 的 buff 在成长应用阶段乘上 `multiplier`

### Buff 系统

Buff 是临时性成长加成，有使用次数限制。

| 字段 | 说明 |
|---|---|
| `actionTag` | 触发的事件类型（如 `'training'`, `'match'`, `'all'`） |
| `growthKey` | 可选：只对指定属性生效 |
| `multiplier` | 成长倍率（如 1.2 = +20%） |
| `remainingUses` | 剩余可用次数；用完自动移除 |

### 动态状态

| 字段 | 范围 | 说明 |
|---|---|---|
| `stress` | 0–100 | 压力值，**100 → 立即结束（生涯压力崩盘）** |
| `fame` | 0–100 | 名气，影响俱乐部申请门槛、媒体事件权重、购物条件（粉丝见面会） |
| `volatile` | 见上节 | 手感/心态波动/疲劳，每回合高频变化 |
| `buffs` | 数组 | 当前生效的临时成长加成 |
| `growthSpent` | ≥0 | 生涯已用成长量（上限 30） |
| `restRounds` | ≥0 | 强制休养剩余周数 |
| `stressMaxRounds` | ≥0 | 压力拉满连续周计数（>=1 即触发结局） |
| `pendingMatch` | 可空 | 已报名的赛事 + 当前阶段 + 解析周 |
| `year / week` | 1+ / 1-48 | 游戏内时间（48 周 / 年） |
| `rivals` | 4 | 命名对手，事件中通过 `{rival0..3}` 引用 |
| `team` | 可空 | 当前战队（clubId/name/tag/tier/weeklySalary/joinedRound） |
| `pendingApplication` | 可空 | 待处理俱乐部申请（2 周后触发 chain-club-response） |
| `pendingOffer` | 可空 | 待接受的入队邀请（`POST /team-response` 处理） |
| `consecutiveLosses` | ≥0 | 连续赛事失利计数，≥ 3 → `losing-streak` 动态 tag |
| `everHadTeam` | bool | 是否曾加入过战队（用于 free-agent-legend 结局判定） |
| `contractRenewals` | ≥0 | 合同续约次数（用于 loyal-veteran 结局判定） |

### 数值公式

- **判定**：`attack = d20 + primary*2 + secondary*1 + Σ(traitBonus 命中 tag) − Σ(traitPenalty)`，DC = `choice.dc + event.difficulty*2 + floor(stageIndex/2)`
- **博彩/外挂**：纯概率分支，按 stage 阶梯探测率（rookie 5–8% → star 40–55%），被抓即 `endRun`
- **成长曲线**：`applied = rawAmount × growthFactor(currentStat) × buffMultiplier`，受 `GROWTH_CAP` 约束
- **疲劳放大**：`fatigue ≥ 70` → 压力增益 × 1.4
- **心态 → 压力被动**：每回合按 mentality 计算
  - `mentality ≥ 14`：压力 −8
  - `mentality ≥ 10`：压力 −5
  - `mentality ≥ 6`：压力 −2
  - `mentality ≤ 2`：压力 +4（精确）
  - `mentality ≤ 4`：压力 +4（区间）
- **失败惩罚**：选项失败若没显式 `stressDelta` 自动 +12（原 +6，已增强）；事件声明的 stressDelta 按 ×5 缩放
- **破产**：`money ≤ 0` 每回合心态 −1、压力 +8

### 阶段晋升（gates）

阶段顺序：`rookie → youth → second → pro → star → veteran → retired`

**rookie → youth**：不通过赛事门槛，必须通过俱乐部申请系统加入战队。

申请前提条件（满足任一）：
- **赛事路线**：netcafe / city / platform 参赛合计 ≥ 3 场 **且** 夺冠 ≥ 1 次
- **天赋路线**：持有「枪法天才」特质（aim-god）

满足条件后可在 `ClubPanel` 向青训俱乐部投简历（消耗 25 AP），2–4 回合后触发 `chain-club-response` 事件，成功进入对应路线面试（`chain-club-interview-open-match` 或 `chain-club-interview-talent`），面试通过生成 `pendingOffer`，接受邀约后直接晋升 youth。

**youth 及以上**：基于赛事参与/夺冠数量自动触发晋升叙事事件（`checkTournamentPromotion`），满足门槛后下一回合注入 `promotionPending`，触发晋升叙事事件，叙事事件决策中设置 `stageSet`。

| 从 → 到 | 计入赛事 | 最低参赛 | 最低夺冠 | 晋升叙事事件 |
|---|---|---|---|---|
| youth → second | 次级联赛、发展联赛 | ≥ 3 场 | ≥ 1 次 | `promotion-youth-to-second` |
| second → pro | 发展联赛、Tier2 邀请赛 | ≥ 3 场 | ≥ 1 次 | `promotion-second-to-pro` |
| pro → star | Tier1 邀请赛、S 级、Major | ≥ 2 场 | ≥ 1 次 | `promotion-pro-to-star` |
| star → veteran | — | — | — | 剧情驱动 |
| veteran → retired | — | — | — | 剧情驱动 |

`Outcome.stageSet / stageDelta` 可在任意事件中绕过 gate 直接推进阶段（剧情驱动）。

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

- 1 回合 = 1 周；48 周 / 年；MAX_ROUNDS = 576（12 年，约 16 岁入行 → 28 岁退役）
- 显示格式："第 X 年 第 Y 周"
- Major 在周 22/46 报名、周 23/47 入围；广播事件在周 24/48 触发（玩家未报名时）

### 行动力系统

事件决策完成后，行动阶段解锁，玩家可主动消耗 AP 执行日常行动。

| 字段 | 说明 |
|---|---|
| `actionPoints` | 每回合重置为 100；赛事周为 0（赛前准备期不允许日常行动） |
| 每次行动消耗 | 25 AP（最多 4 次/回合） |

**6 个日常行动**（定义于 `backend/src/data/actions.ts`）：

| actionId | 名称 | 主属性 | 成功效果 | 失败效果 |
|---|---|---|---|---|
| `action-ranked-grind` | 打天梯 | agility | agility 成长 + feel+1 + fatigue+15 | fatigue+10 + tilt+1 |
| `action-structured-training` | 系统训练 | intelligence | intelligence 成长 + fatigue+12 | fatigue+8 |
| `action-rest-day` | 休息一天 | mentality | feel-0.5 + fatigue-20 + stress-5 | feel-1 + fatigue-10 |
| `action-fitness` | 健身锻炼 | constitution（DC 6）| constitution 成长 + fatigue+18 | fatigue+14 |
| `action-meditation` | 冥想静心 | mentality（DC 4）| mentality 成长 + fatigue-8 + stress-10（×5）| fatigue-4 + stress-5（×5）|
| `action-vacation` | 度假断网 | mentality（DC 1）| feel-2 + fatigue-30 + stress-50 | feel-3 + fatigue-20 + stress-30 |

`applyAction()` 复用 `resolveChoice()` 的 d20 检定逻辑，不推进回合、不重置 AP。

### 购物系统

玩家在行动阶段可用资金购买道具，主要用于降压/恢复体能。

**商品分类**（定义于 `backend/src/data/shop.ts`）：

| 类别 | 商品 | 价格 | 冷却 | 主要效果 |
|---|---|---|---|---|
| 消耗品 | 能量饮料 | 10K | 无 | fatigue-20 |
| 消耗品 | 外卖套餐 | 10K | 无 | fatigue-8 |
| 消耗品 | 止痛药 | 10K | 无 | fatigue-15 + constitution+1 |
| 服务 | 心理咨询 | 20K | 5回合 | stress-100 + 心理稳定 buff(×1.15, 3次) |
| 服务 | 短途旅行 | 40K | 5回合 | stress-35 + fatigue-30 + feel重置 |
| 装备 | 高端外设 | 50K | 20回合 | agility 成长 buff(×1.2, 10次) |
| 装备 | 人体工学椅 | 40K | 20回合 | constitution+2 + 人体工学 buff |
| 社交 | 请队友吃饭 | 20K | 3回合 | stress-10 + 移除 locker-tension tag |
| 社交 | 粉丝见面会 | 30K | 3回合 | fame+10 + stress+8（需 fame ≥ 20） |

`shopCooldowns` 记录 `{ itemId: roundAvailableFrom }`，`applyShopPurchase()` 校验余额/冷却/fame/stage 门槛。

### 事件分类与权重

| EventType | 用途 |
|---|---|---|
| `training / ranked / team / tryout / match / media / life` | 常规事件池 |
| `betting / cheat` | 高风险纯概率分支（被抓 endRun） |
| `rest` | 仅在 `restRounds > 0` 触发 |
| `routine` | 每周行动选择，主成长途径 |

**CS2 饰品事件**（`skins.ts`，37 个事件，7 分类）：
- **诈骗/翻车**（7）：假试训、冒充好友、钓鱼链接、Discord 抽奖、假客服、交易卡单等
- **赌狗/上头**（5）：连胜开箱、跟风、输比赛回血、半夜看市场、倒腾库存
- **社交/人性**（5）：队友送饰品、老板赞助、中间人、炫富、被嘲讽穷鬼
- **市场/投机**（5）：Major 贴纸、绝版传言、版本更新带涨、冷门放量、大户扫货
- **灰色/边缘**（5）：低价急出、代练托管、余额套利、黑市截图、赚钱小圈子
- **搞笑/奇葩**（5）：ID 变欧皇、贴纸玄学、巨丑搭配、皮肤分心、观众只看刀
- **高戏剧性**（5）：被盗号、误挂低价、捡漏暴涨、皮肤闹翻、赞助商要求

**state-aware weight**：
- `fame ≥ 15` → media ×1.6
- `money ≤ 1` → betting ×1.8、cheat ×1.5
- `constitution ≤ 2` → life ×1.4
- `stress ≥ 60` → 带 `stressed` 标签的事件 ×2
- `major-broadcast`（周 24/48 + 未参赛）→ 广播事件 ×5
- **gambler 特质** → 赌狗/上头类饰品事件权重 ×2

**动态合成 tag**：玩家状态满足条件时自动注入到事件 `requireTags` 过滤集中，不需要手动添加到 `player.tags`，也无法通过 `tagRemoves` 移除（每回合重新计算）。

| 动态 tag | 触发条件 |
|---|---|
| `stressed` | `stress ≥ 60` |
| `famous` | `fame ≥ 15` |
| `cash-strapped` | `money ≤ 1` |
| `frail` | `constitution ≤ 2` |
| `major-broadcast` | 第 24/48 周 + 未参加 Major |
| `elite-prospect` | 持有 `aimer` 或 `solo` 特质 tag |
| `has-open-match-exp` | city + platform 参赛合计 > 1 |
| `application-response-ready` | `round ≥ pendingApplication.responseRound` |
| `interview-ready` | `application-response-ready` + `interview-pending` |
| `just-joined-team` | `team.joinedRound === player.round` |
| `has-team` | `player.team` 非空 |
| `contract-up` | `(round - joinedRound) % 48 === 0 && > 0` |
| `losing-streak` | `consecutiveLosses ≥ 3` |
| `promote-eligible` | 存在更高档且玩家满足入队门槛的俱乐部 |
| `rival-scout-eligible` | 无战队 + fame ≥ 20 + openMatchCount > 1 |
| `rival-match-pressure` | 有战队 + pendingMatch 非空 |

### 多结局

| ending | 触发条件 |
|---|---|
| `legend` | 满 576 回合 + stage ∈ {pro/star/veteran} + fame ≥ 70 |
| `champion` | 满 576 回合 + stage ∈ {second/pro/star/veteran} + 持 `major-champion` tag |
| `retired_on_top` | 满 576 回合（默认） |
| `quiet_exit` | stage = retired |
| `stress_breakdown` | 压力拉满 ≥1 周 |
| `injury_ended_career` | `injury-prone` 且 constitution ≤ 0 |
| `banned_for_match_fixing` | 博彩被发现 |
| `banned_for_cheating` | 外挂被发现 |
| `career_ended` | outcome.endRun 默认 |
| `free-agent-legend` | 满 576 回合 + 全程无战队（`!everHadTeam`）+ stage ≥ second + fame ≥ 70 + 持 `tournament-winner` |
| `loyal-veteran` | 满 576 回合 + 同一战队连续 ≥ 200 回合 + `contractRenewals ≥ 3` |

**关键 tag**：赢得 Major 决赛时自动打 `major-champion`；赢得任意决赛打 `tournament-winner`。

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
| POST | `/api/game/:sessionId/withdraw` | 弃赛（stress+25 / fame-10 / money-3 惩罚 + `forfeit-recent` tag） |
| POST | `/api/game/:sessionId/action` | body: `{ actionId }` 执行日常行动（消耗 25 AP，不推进回合） |
| POST | `/api/game/:sessionId/shop` | body: `{ itemId }` 购买商品（扣钱 + 应用效果 + 写冷却） |
| GET | `/api/game/meta/actions` | 返回 6 个日常行动定义 |
| GET | `/api/game/meta/shop` | 返回全部商品定义 |
| GET | `/api/game/meta/rules` | 公开常量（pointPool 等） |
| GET | `/api/game/meta/clubs` | 返回全部 16 家俱乐部定义 |
| POST | `/api/game/:sessionId/apply-club` | body: `{ clubId }` 提交俱乐部申请（写入 pendingApplication，2 周后回信） |
| POST | `/api/game/:sessionId/team-response` | body: `{ accept: boolean }` 接受或拒绝入队邀请（接受则写入 team，拒绝写入 10 回合冷却） |

`POST /api/game/start` 响应：`{ sessionId, player, currentEvent, leaderboard }`
`POST /api/game/:sessionId/choice` 响应：`{ result, player, currentEvent, status, ending?, promotion, leaderboard }`
`POST /api/game/:sessionId/action` 响应：`{ actionResult: ActionResult, player }`
`POST /api/game/:sessionId/shop` 响应：`{ player, item: ShopItem }`

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
- 阶段锁雏形（后续迭代已改为赛事参与门槛）
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

### Phase E（属性重构 + 每日行动 + HUD 派生属性展示）

**属性系统重构**
- 核心属性改为隐藏值（0-20），玩家只看派生属性（0-100）
- 派生属性四项：枪法（agility×0.7+exp×0.3）、决策（intelligence×0.7+exp×0.3）、稳定性（mentality）、续航（constitution）
- 叙事事件不再直接修改核心属性；旧 `statChanges` 通过 `translateStatDelta` 转译为 volatile 效果
- 成长曲线从 `gain/(1+stat/10)` 改为分档衰减（0-4: ×1.0 / 5-9: ×0.7 / 10-14: ×0.4 / 15-20: ×0.15）
- 生涯总成长上限 `GROWTH_CAP = 30`，累计跨属性
- 失败惩罚强化：隐式压力从 +6 → +12

**volatile 状态系统**
- 新增三维高频状态：手感 feel（−3~+3, 0.5步进）、心态波动 tilt（0-3）、疲劳 fatigue（0-100）
- feel/tilt/fatigue 通过 `feelDelta/tiltDelta/fatigueDelta` 在每个 Outcome 中直接声明
- tilt ≥ 2 时手感峰值压低；fatigue ≥ 85 时手感自动衰减；fatigue ≥ 70 时压力增益 ×1.4
- `RoundResult` 新增 `feelChange/tiltChange/fatigueChange` 字段

**Buff 系统**
- Player 新增 `buffs: Buff[]` 字段
- Buff 匹配事件类型（actionTag）后在成长阶段乘以 multiplier
- remainingUses 递减，归零后自动移除
- 训练类日常行动成功可赠予 buff（如 `pre-match-analysis` 提升赛事成长效率）

**每日行动（routine 类型事件）**
- 新增 `backend/src/data/events/daily.ts`，3 种场景 × 4 选项
- `Outcome.dailyGrowth: StatKey` 字段：声明本次行动对哪个核心属性进行成长（0.1–0.3）
- 天梯 → agility 成长；训练 → intelligence 成长；休息/度假 → 状态恢复
- 注册到 EVENT_POOL（weight 2-4）

**前端更新**
- `HudTopBar`：4 个派生属性条（AIM/决策/稳定性/续航）+ 手感/疲劳颜色状态 + 压力/名气/排名
- `ResultPanel`：优先展示 feelChange/tiltChange/fatigueChange，再展示 stress/fame/statChanges
- `FeedPanel`：每条历史记录显示 volatile 变化 chip
- `globals.css`：HUD 顶栏从 52px → 64px；新增 `.hud-derived-*`、`.feel-hot/cold/neutral`、`.event-type-badge.routine`

### Phase F（行动力 + 购物 + 赛事隔离 + 结局深化）

**行动力系统**
- 每回合 100 AP；事件决策完成后行动阶段解锁，每次日常行动消耗 25 AP
- `DynamicState` 新增 `actionPoints`；每次 `applyChoice` 后重置为 100（赛事周为 0）
- `applyAction()` 使用合成 EventDef 复用 `resolveChoice()` 逻辑，不推进回合
- 前端状态机：`actionsPhase: boolean`（false=事件阶段，true=行动解锁期）；"进入下一回合"按钮切换
- `ActionPanel` 组件：AP 格子条（4 段）+ 6 个行动按钮 + 每次行动后展示结果小卡（`key={player.round}` 每回合重置）

**购物系统**
- `DynamicState` 新增 `shopCooldowns: Record<string, number>`（itemId → 可购买轮次）
- 9 件商品分四类：消耗品（能量饮料/外卖/止痛药）、服务（心理咨询-100压力/短途旅行）、装备（高端外设/人体工学椅）、社交（请队友吃饭/粉丝见面会）
- `applyShopPurchase()` 校验余额/冷却/fame/stage 后应用效果
- `ShopPanel` 组件：按类别展示，实时校验购买条件，显示冷却剩余

**赛事隔离 + 弃赛惩罚**
- `pickEvent()` 在 `pendingMatch` 存在时返回 `buildTournamentPrepEvent()`（固定 3 选项：分析对手/体能准备/心态调整），不出现随机事件
- 赛前准备事件 ID 格式 `tourney-prep-{tournamentId}` 动态合成，`applyChoice` 中添加回退重建逻辑
- 弃赛从"清空 pendingMatch"改为真实惩罚：stress+25 / fame-10 / money-3（二线及以上）/ 添加 `forfeit-recent` tag
- `chains.ts` 新增 `chain-forfeit-consequence`（弃赛后续：媒体炒作/俱乐部谈话/队友冷眼）
- `MatchPanel` 弃赛按钮改为弹出确认 UI，显示具体惩罚 chips

**结局条件重构**
- `MAX_ROUNDS` 从 80 → 576（12 年生涯）
- `legend`：新增 stage ≥ pro 且 fame ≥ 70 门槛（之前只判 fame ≥ 30）
- `champion`：改为要求持 `major-champion` tag（赢 Major 决赛时自动打）而非普通 `tournament-winner`
- 赢得 Major 决赛同时打两个 tag：`tournament-winner` + `major-champion`

**压力临界视觉反馈**
- `stressMaxRounds` 增加时触发 0.65s 屏幕抖动（`@keyframes stress-shake`）
- 压力临界期间持续显示脉冲红框覆盖层（`@keyframes stress-border-pulse`，1.2s 循环）

**富结局面板**
- `EndingPanel` 组件：结局标签（legend 金色光晕）、生涯轨迹（年/周/回合/阶段）、关键数值（人气/资金/压力）、五维属性条、赛事战绩（按 tier 分类的夺冠金色徽章）、开局特质（含描述）、生涯标签（过滤 `-cd` 冷却标签）
- 底栏"← 新生涯"改为弹出确认框，框内嵌入完整 `EndingPanel`，防止误触丢失存档

### Phase H（战队系统）

**俱乐部数据**（`data/clubs.ts`，16 家俱乐部，4 档 × 4 家）

| 档位 | ClubTier | 薪资范围/周 | 入队门槛 |
|---|---|---|---|
| 青年队 | `youth` | 10–20K | rookie/youth 阶段，无名气要求 |
| 半职业 | `semi-pro` | 20–50K | youth 阶段起，无名气要求 |
| 职业 | `pro` | 40–80K | second 阶段起，fame ≥ 10 |
| 顶级 | `top` | 80–150K | pro 阶段起，fame ≥ 30 |

每档 2 家常规俱乐部 + 1~2 家 `isRival` 对手俱乐部（用于挖角事件匹配）。

**新增 Player 字段**

| 字段 | 类型 | 说明 |
|---|---|---|
| `team` | `PlayerTeam \| null` | 当前所在战队（含合同信息） |
| `pendingApplication` | `PendingApplication \| null` | 待处理的俱乐部申请（2 周后回信） |
| `pendingOffer` | `TeamOffer \| null` | 待接受/拒绝的入队邀请 |
| `consecutiveLosses` | `number` | 连续赛事失利计数（≥ 3 触发 `losing-streak`） |
| `everHadTeam` | `boolean` | 是否曾加入过战队（用于 free-agent-legend 结局） |
| `contractRenewals` | `number` | 合同续约次数（用于 loyal-veteran 结局） |

**周薪系统**：每回合推进时，有战队的玩家自动注入 `team.weeklySalary` 点金钱（`money = min(20, money + weeklySalary)`），并在被动效果列表显示"周薪入账 +XK"。

**申请流程**：
1. 玩家在 `ClubPanel` 选择目标俱乐部 → `POST /apply-club`
2. 写入 `pendingApplication`，`responseRound = appliedRound + 2`
3. 2 回合后，动态 tag `application-response-ready` 注入 → 触发 `chain-club-response` 事件
4. 成功 → 触发 `chain-club-interview` → 通过后生成 `pendingOffer`
5. 玩家在 `TeamOfferModal` 接受/拒绝 → `POST /team-response`；拒绝时写入 10 回合 `poach-cd` 冷却

**新增动态 tag（`events.ts`）**

| tag | 触发条件 |
|---|---|
| `elite-prospect` | 持有 `aimer` 或 `solo` 特质 tag |
| `has-open-match-exp` | city + platform 参赛合计 > 1 |
| `application-response-ready` | `round >= pendingApplication.responseRound` |
| `interview-ready` | `application-response-ready` + `interview-pending` tag |
| `just-joined-team` | `team.joinedRound === player.round`（加入后首回合） |
| `has-team` | 持有战队 |
| `contract-up` | `(round - joinedRound) % 48 === 0 && > 0`（每 48 回合合同到期） |
| `losing-streak` | `consecutiveLosses ≥ 3` |
| `promote-eligible` | 存在更高档且满足门槛的俱乐部 |
| `rival-scout-eligible` | 无战队 + fame ≥ 20 + openMatchCount > 1 |
| `rival-match-pressure` | 有战队 + 有 pendingMatch |

**新增战队链式事件（`chains.ts`）**

| 事件 ID | requireTags | 说明 |
|---|---|---|
| `chain-club-response` | `application-response-ready` | 申请回信（成功/婉拒/无消息） |
| `chain-club-interview` | `interview-ready` | 面试（通过 → 生成 pendingOffer） |
| `chain-club-rejected` | `club-rejected` | 被拒后心态调整 |
| `chain-team-joined` | `just-joined-team` | 新入队首周融入叙事 |
| `chain-contract-renewal` | `contract-up` | 合同到期（续约/离队/被挖角） |
| `chain-team-conflict` | `has-team` | 队内矛盾处理 |
| `chain-team-fired` | `losing-streak` | 连败 3+ 后被队伍劝退 |
| `chain-team-promote-offer` | `promote-eligible` | 更高档俱乐部主动邀请 |
| `chain-rival-scout` | `rival-scout-eligible` | 星探发现自由人玩家 |
| `chain-rival-poach` | `promote-eligible` | 对手俱乐部挖角（`hear-offer` 触发签约流程） |
| `chain-rival-match-trash` | `rival-match-pressure` | 赛前社交媒体心理战 |
| `chain-rival-teammate-leave` | `has-team` | 队友离队传闻处理 |

**新增结局**

| ending | 触发条件 |
|---|---|
| `free-agent-legend` | 满 576 回合 + 全程无战队（`!everHadTeam`）+ stage ≥ second + fame ≥ 70 + 持 `tournament-winner` |
| `loyal-veteran` | 满 576 回合 + 同一战队连续 ≥ 200 回合 + 续约 ≥ 3 次 |

**新增 API 路由**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/game/meta/clubs` | 返回全部 16 家俱乐部定义 |
| POST | `/api/game/:sessionId/apply-club` | body: `{ clubId }` 提交俱乐部申请 |
| POST | `/api/game/:sessionId/team-response` | body: `{ accept: boolean }` 接受/拒绝入队邀请 |

**新增前端组件**

- `ClubPanel.tsx`：显示当前战队信息（名称/档位/地区/周薪/加入回合）、申请等待状态、及可申请的俱乐部列表（按 stage/fame/已有战队过滤）
- `TeamOfferModal.tsx`：收到入队邀请时弹出，展示合同详情（俱乐部/档位/周薪），支持接受/拒绝
- `EndingPanel.tsx` 补充战队历史展示（含 `everHadTeam` 判断）
- `HudTopBar.tsx` 战队 tag 显示

### Phase G（CS2 饰品事件系统 + 行动平衡 + 特质联动全面化）

**饰品事件系统**（`skins.ts`）
- 新增 37 个 CS2 饰品主题事件，7 分类：诈骗/赌狗/社交/市场/灰色/搞笑/高戏剧性
- 所有事件使用新风格（`moneyDelta/fameDelta/stressDelta/feelDelta/tiltDelta/dailyGrowth`）
- 叙事上下文驱动 stage 过滤：提到队友/赞助商 → TEAM/PRO；否则 ALL
- 诈骗类以 `experience` 为主判定，失败带 `dailyGrowth: experience`（吃一堑长一智）
- 判定多样化：experience（15）、mentality（12）、intelligence（6）、agility（3）、money（1）
- 全套特质联动（`streetwise / gambler / steady / impulsive / ego` 等 15+ tags）
- `gambler` 特质持有者赌狗类事件权重 ×2

**日常行动平衡**
- 休息一天：不再恢复手感（`feelDelta: 1 → -0.5`），避免"休息无代价"
- 度假断网：手感生疏加重（`feelDelta: -1 → -2.5`），与疲劳/压力大幅恢复形成取舍
- 新增「健身锻炼」：`dailyGrowth: constitution` + 疲劳积累，成长曲线走 constitution
- 新增「冥想静心」：`dailyGrowth: mentality` + 疲劳/压力缓解

**已有事件特质联动补全**
- 6 个事件文件中 12 个 choice 补充缺失的 `traitBonuses`/`traitPenalties`
- 3 处 stage 过滤修正（`life-wrist-pain → ALL`，`training-demo-review → TEAM`，`media-interview → 可包容`）
- 5 处微调：daily 的 ranked/training 加 aimer/steady，media short-answer 加 shy/streamer

---

## 后续扩展（待办）

### 高优先级
- **特质权重机制**：Trait 加 `weight` 字段，`rollRandomTraits` 改为加权采样，支持稀有特质（如 1% 概率的"CS天赋之子"：agility+10 / intelligence+10 / mentality-3）
- **AI 生成随机事件**：基于玩家状态 + 历史让 LLM 产出全新 EventDef，注入事件池一次性消费
- **AI 生成战报**：每场比赛阶段用 LLM 产出 demo 文本（"AWPer X 在 mid 架点拿下 1v3"）

### 中优先级
- **更多结局**：金钱结局（财务自由提前退役）、纯路人结局（无成就退役）、转教练 / 解说
- **比赛过程化**：每个 stage 内多张图，每张图独立检定，让 BO3/BO5 真正有节奏感
- **社交关系系统**：队友 / 经纪人 / 教练个体，分别有信任度 / 冲突 / 转会促因
- **赞助系统**：fame 门槛触发赞助合同，提供持续收入和压力
- **赛季设定**：版本更新事件，影响 meta；老选手版本不适应 → 经验贬值
- **Twitter 风格动态 feed**：`/api/game/:id/feed` 返回 LLM 生成的圈内动态条目

### 低优先级 / Polish
- 数值平衡：收集多局数据后微调 DC、stressDelta、reward、行动力 AP 值
- i18n：英文版（事件文本量大，需配套 LLM 翻译流水线）
- 排行榜持久化（sessions ↔ runs 表，跨会话纪录）
- 战队系统真正建模：成员 / 替补 / 主教练；目前 rivals 仅是名字
- AI 替换 leaderboard tick：让 LLM 按选手 narrative 调分而非纯随机

### 已知遗留问题
- 旧会话（D1 存储里的 JSON）字段缺失时不会自动迁移，需要清 `.wrangler/state` 后重新 `wrangler d1 execute --local --file=schema.sql` 重开；Phase F 新增 `actionPoints/shopCooldowns` 字段需注意
- 报名后立即结束游戏（如博彩被抓）时 pendingMatch 会丢失，没补救
- 事件占位符替换只支持 `{rival0..3}`，未支持队友/赞助商等
- 旧版叙事事件（training/ranked/team 等）的 `statChanges` 仍保留在 EventDef 定义里，运行时通过 `translateStatDelta` 转译；未来考虑重写为直接使用 feelDelta/tiltDelta 字段

---

## 设计决策备忘

- **特质 = tags + modifiers**：改了三轮最终定为"正 modifier 给底线 + 负 modifier 后置扣减 + tags 在 check.traitBonuses 中匹配"，避免双系统冲突
- **金钱不走成长曲线**：钱是库存不是技能，避免"越富赚越少"反直觉
- **压力是唯一硬性死亡线**：mentality 不再触发 GameOver，而是成为压力调节器，让玩家有时间反应
- **多阶段比赛 vs 单回合比赛**：选了多阶段，因为单回合"打 Major"和"打网吧赛"难以体现差异
- **占位符替换在 toPublicEvent**：保持 EventDef 数据纯净，渲染时再注入 rival 名
- **rookie-default 背景**：用户反映起点身份 UI 与特质冲突 → 隐藏 UI 但保留数据结构供未来扩展
- **核心属性隐藏 / 派生属性展示**：玩家直接看"枪法 72 / 决策 55"而非"agility 8"，直觉更符合 CS 选手视角；隐藏值保留供引擎检定使用
- **translateStatDelta 兼容层**：旧事件的 `statChanges` 不重写，运行时翻译为 volatile 效果。好处是改了100多个事件定义会引入大量回归风险；代价是有轻微双路径复杂度
- **Stats 保留 6 键（含 money）**：将 money 分离为独立字段会导致背景 statBias / 特质 modifiers / 破产检查全部需要改动；保持类型兼容让 money 继续走 `stats.money`
- **成长上限 GROWTH_CAP = 30 跨属性统计**：避免专注堆单项到满级，迫使玩家在敏捷和智力之间做取舍
