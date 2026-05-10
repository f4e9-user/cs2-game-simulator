# CS2 电竞选手人生模拟器

一个以 `CS2` 职业生涯为主题的文字冒险 + 数值模拟项目。

- 前端：`Next.js 15` + `React 18` + `Zustand` + `TypeScript`
- 后端：`Cloudflare Workers` + `Hono` + `D1` + `KV`
- AI：可选接入 `Anthropic / OpenAI / Workers AI`，未配置时使用模板叙事兜底

项目当前已经包含：

- 开局抽特质与属性分配
- 日常行动系统
- 随机事件池
- 商店系统
- 战队申请 / 入队 / 离队
- 多层级赛事报名与结算
- 战队积分榜
- 生涯结局面板

---

## 项目结构

```text
cs2-game-simulator/
├── README.md
├── shared/
│   └── types.ts
├── backend/
│   ├── package.json
│   ├── schema.sql
│   ├── wrangler.toml
│   └── src/
│       ├── index.ts
│       ├── types.ts
│       ├── routes/
│       │   └── game.ts
│       ├── engine/
│       │   ├── constants.ts
│       │   ├── resolver.ts
│       │   ├── events.ts
│       │   ├── stages.ts
│       │   ├── qualification.ts
│       │   └── gameEngine.ts
│       ├── data/
│       │   ├── actions.ts
│       │   ├── shop.ts
│       │   ├── clubs.ts
│       │   ├── tournaments.ts
│       │   ├── leaderboard.ts
│       │   ├── traits.ts
│       │   ├── backgrounds.ts
│       │   ├── rivals.ts
│       │   └── events/
│       ├── storage/
│       └── ai/
└── frontend/
    ├── package.json
    ├── .env.example
    └── src/
        ├── app/
        ├── components/
        ├── lib/
        └── store/
```

说明：

- `shared/types.ts` 是共享领域类型源文件
- `backend/src/types.ts` 和 `frontend/src/lib/types.ts` 是手动同步镜像
- 当前不是 monorepo 构建体系，前后端分别运行和部署

---

## 当前玩法总览

### 生涯阶段

当前阶段顺序：

`rookie -> youth -> second -> pro -> retired`

对应展示名：

- `rookie`：路人新人
- `youth`：青训
- `second`：二线队
- `pro`：职业队
- `retired`：退役

说明：

- `pro` 是当前竞技生涯的终点阶段
- `star` / `veteran` 现在是叙事标签方向，不再是正式阶段

### 核心属性

后端核心属性为 `0-20` 区间：

- `intelligence`：智力
- `agility`：敏捷
- `experience`：经验
- `money`：资金
- `mentality`：心态
- `constitution`：体能

基础规则：

- 开局可分配点数：`12`
- `constitution` 默认底线为 `3`
- `money` 不参与成长衰减曲线

### 派生属性

前端主要展示四项派生值：

- 枪法：由 `agility + experience` 换算
- 决策：由 `intelligence + experience` 换算
- 稳定性：由 `mentality` 换算
- 续航：由 `constitution` 换算

当前公式：

- 枪法：`(agility * 0.7 + experience * 0.3) / 20 * 100`
- 决策：`(intelligence * 0.7 + experience * 0.3) / 20 * 100`
- 稳定性：`mentality / 20 * 100`
- 续航：`constitution / 20 * 100`

### volatile 状态

玩家有一套高频波动状态：

- `feel`：手感，范围 `-3 ~ +3`
- `tilt`：心态波动，范围 `0 ~ 3`
- `fatigue`：疲劳，范围 `0 ~ 100`

它们会被：

- 日常行动影响
- 随机事件影响
- 商店商品影响
- 比赛与失败连锁影响

### 成长系统

核心成长采用：

- 属性越高，成长越慢
- 生涯总成长上限 `GROWTH_CAP = 30`
- `money` 不计入成长上限

当前成长倍率：

| 当前属性 | 成长倍率 |
| --- | --- |
| `< 5` | `1.0` |
| `< 10` | `0.7` |
| `< 15` | `0.4` |
| `>= 15` | `0.15` |

### Buff 系统

Buff 作用于成长结算，核心字段包括：

- `actionTag`：作用范围，如 `training` / `ranked` / `match` / `all`
- `growthKey`：可选，限定只增益某个成长属性
- `multiplier`：成长倍率
- `remainingUses`：剩余生效次数

当前实现里，Buff 需要同时满足：

- `actionTag` 匹配当前行动或事件类型
- 若配置了 `growthKey`，还必须匹配当前成长属性

### 压力与体能规则

- `stress` 范围为 `0-100`
- 压力过高会持续累积崩溃风险
- `constitution` 会影响正向疲劳增量倍率
- 低体能时，日常和事件更容易把人拖进受伤或强制休养

当前关键公式：

- 心态被动压力：
  - `mentality >= 14` -> `stress -8`
  - `mentality >= 10` -> `stress -5`
  - `mentality >= 6` -> `stress -2`
  - `mentality <= 4` -> `stress +4`
  - `mentality <= 2` -> `stress +8`
- 疲劳阈值放大：`fatigue >= 70` 时，正向压力增量乘以 `1.4`
- 体能对正向疲劳增量倍率：
  - `constitution >= 15` -> `0.30`
  - `constitution >= 11` -> `0.55`
  - `constitution >= 7` -> `0.85`
  - `constitution >= 4` -> `1.35`
  - 否则 `1.60`

### 事件与行动判定公式

普通事件和日常行动默认使用同一套检定结构：

- `attack = d20 + primary * 2 + secondary + traitBonuses - traitPenalties`
- `dc = choice.dc + event.difficulty * 2 + floor(stageIndex / 2)`

补充规则：

- 如果失败且该选项没有显式 `stressDelta`，会吃到默认失败压力
- 老事件里的 `stressDelta` 会按 `STRESS_SCALE = 5` 映射到 `0-100` 压力系统
- `money` 作为副属性参与检定时，会先换算成 `round(money / 2)`

---

## 日常行动

当前日常行动定义在 `backend/src/data/actions.ts`。

现有 7 个行动：

- `打天梯`
- `系统训练`
- `休息一天`
- `度假断网`
- `健身锻炼`
- `冥想静心`
- `心理训练`

特点：

- 每个行动消耗 `AP`
- 成功与失败都会有不同的叙事和状态结算
- 部分行动会带来核心成长
- 商店 Buff 会对对应行动的成长结算生效

---

## 商店系统

商品定义在 `backend/src/data/shop.ts`，前端面板在 `frontend/src/components/ShopPanel.tsx`。

当前商店分为四类：

- `consumable`：消耗品
- `service`：服务
- `equipment`：装备
- `social`：社交

当前重点商品包括：

- 恢复类：`energy-drink`、`meal-kit`、`painkiller`、`massage-therapy`
- 训练类：`aim-coach`、`tactical-review`
- 装备类：`pro-peripherals`、`ergo-chair`、`wrist-brace`
- 社交类：`team-dinner`、`fan-meetup`、`pr-interview`
- 经纪人系统：`hire-agent`、`fire-agent`

商店规则：

- 商品可配置 `priceMoney`
- 商品可配置 `cooldownRounds`
- 商品可配置 `requireStage` / `requireFame`
- 商品可带负面事件
- 商品可添加或移除 `Buff`
- 商品可添加或移除 `tag`

### 经纪人系统

经纪人是当前商店里最特殊的一类长期服务：

- `签约经纪人`：仅 `second / pro` 可购买
- 购买后添加 `has-agent` 标签
- 购买后添加长期 Buff：`经纪团队`
- 已签约时，商店同位置改为 `解雇经纪人`
- 解约会移除对应 Buff 与标签

签约 / 解约弹窗现在会明确显示：

- 获得的 Buff
- 移除的 Buff
- 添加的标签
- 移除的标签

---

## 随机事件系统

事件池入口：`backend/src/engine/events.ts`

总事件注册：`backend/src/data/events/index.ts`

当前事件来源包括：

- `training`
- `ranked`
- `team`
- `tryout`
- `match`
- `media`
- `life`
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

核心机制：

- 事件会按玩家阶段筛选
- 会按 `requireTags` / `forbidTags` 筛选
- 会参考最近事件去重
- 会根据玩家状态动态加权
- 特殊状态下会强插特定事件

例如：

- 强制休养期间只会进入 `rest` 事件池
- 已报名赛事时，会优先进入赛前准备事件
- 面试中的玩家，会被强插面试相关事件

### 经纪人事件池

当玩家拥有 `has-agent` 标签时，会进入经纪人专属事件池。

当前已接入的事件包括：

- `agent-brand-deal`
- `agent-media-training`
- `agent-overbooking`
- `agent-pr-slip`

这些事件：

- 有正向，也有负向
- 会通过 `agent-event-cd` 冷却标签防止连续刷出
- 主要影响 `名气 / 资金 / 压力 / 疲劳`

---

## 战队与晋级

### 俱乐部系统

玩家可以：

- 申请俱乐部
- 收到面试 / 回应类事件
- 获取入队邀请
- 接受或拒绝战队 Offer
- 主动离队
- 被剧情或连败链路影响离队

相关核心路由：

- `POST /game/:sessionId/apply-club`
- `POST /game/:sessionId/team-response`
- `POST /game/:sessionId/leave-team`

### 晋级系统

当前晋级逻辑在 `backend/src/engine/stages.ts`。

规则分两段：

- `rookie -> youth`：不是赛事门槛，核心依赖申请战队并成功入队
- `youth -> second -> pro`：依赖赛事参与与夺冠条件，满足后注入晋级叙事事件

当前正式竞技晋级到 `pro` 为止。

---

## 赛事系统

赛事定义在 `backend/src/data/tournaments.ts`，核心报名与赛程逻辑在 `backend/src/routes/game.ts` 和 `backend/src/engine/gameEngine.ts`。

当前支持：

- 周窗口报名
- 名气门槛
- 战队积分门槛
- 战队等级门槛
- 资格门票消耗与返还
- 多阶段赛事推进
- 赛前准备事件
- 弃赛惩罚

### 赛事胜负判定

正式比赛不走普通 `d20` 检定，而是走独立的数值模拟，核心代码在 `backend/src/engine/matchSimulator.ts`。

比赛先计算玩家侧的 `effectiveAim`：

- `aimBase = (agility * 0.7 + experience * 0.3) / 20 * 100`
- `decisionBase = (intelligence * 0.7 + experience * 0.3) / 20 * 100`
- `feelEffect = feel * 3`
- `fatigueDebuff = max(0, (fatigue - 60) * 0.2)`
- `tiltDebuff = tilt * 3`
- `teamBonus = rawTeamBonus + synergyBonus + trustModifier`
- `effectiveAim = clamp(aimBase + feelEffect - fatigueDebuff - tiltDebuff + teamBonus, 5, 99)`

对手强度用赛事难度换算：

- `enemyAim = clamp(25 + effectiveDifficulty * 8, 20, 90)`
- `effectiveDifficulty = tournament.baseDifficulty + bracketStage.difficultyBonus`

最终胜率公式：

- `aimAdv = effectiveAim - enemyAim`
- `stabilityBonus = (mentality / 20 - 0.5) * 0.08`
- `winProb = clamp(0.5 + aimAdv / 60 + stabilityBonus, 0.05, 0.95)`
- 然后用 `rng() < winProb` 判定胜负

### 哪些属性会影响赛事胜负

直接影响比赛胜率的核心属性有：

- `agility`
  - 影响 `aimBase`
  - 也影响爆头率 `headshotRate`
  - 是比赛里最直接的枪法属性
- `experience`
  - 同时参与 `aimBase` 与 `decisionBase`
  - 让枪法和决策都更稳定
- `intelligence`
  - 影响 `decisionBase`
  - 虽然不直接进入 `winProb` 主体，但会影响 `rating` 叙事表现与部分赛事事件选择
- `mentality`
  - 直接进入 `stabilityBonus`
  - 心态越高，基础胜率越稳
- `constitution`
  - 不直接进入 `winProb`
  - 但会通过疲劳系统影响长期比赛和连续作战表现

直接影响比赛即时表现的非核心状态有：

- `feel`
  - 直接加到 `effectiveAim`
- `fatigue`
  - 通过 `fatigueDebuff` 直接削弱 `effectiveAim`
- `tilt`
  - 通过 `tiltDebuff` 直接削弱 `effectiveAim`

团队相关加成也会影响比赛：

- `rosterTeamBonus`
  - 来自队友敏捷总和
  - 公式：`floor(sum(teammate.agility) / 4 / 4)`
- `synergyBonus`
  - 来自阵容角色和 trait 协同
  - 例如 `IGL + tactical`、`AWPer + aimer`、多 `support` 协同会加分
  - 多个 `ego`、过多 `solo` 会扣分
- `trustModifier`
  - 来自 `teamTrust`
  - `teamTrust >= 65` -> `+1`
  - `teamTrust <= 30` -> `-1`
  - `teamTrust <= 15` -> `-2`

### 赛事个人表现公式

比赛打完后，还会结算个人数据：

- 击杀 / 死亡 / 助攻
- 爆头率 `headshotRate`
- `rating`
- 比分

其中：

- `headshotRate` 主要看 `agility + feel`
- `rating` 近似公式为：
  - `kd * 0.60 + headshotRate * 0.35 + decisionMod + 0.20`
  - 其中 `decisionMod = (decisionBase - 50) / 100 * 0.12`

这些数据进一步影响：

- 比赛叙事文案
- `feelDelta`
- `tiltDelta`
- `fatigueDelta`

也就是说：

- `agility`、`experience`、`mentality` 更直接决定你赢不赢
- `intelligence` 更偏向提升决策表现和赛事事件分支质量
- `constitution` 更偏向影响长期作战稳定性，而不是单场纯胜率

相关路由：

- `GET /game/:sessionId/tournaments`
- `POST /game/:sessionId/signup`
- `POST /game/:sessionId/withdraw`

弃赛当前会带来：

- 压力惩罚
- 名气惩罚
- 在 `second / pro` 阶段可能附带资金惩罚

---

## 积分榜

项目内维护一份战队积分榜，用于：

- 展示玩家队伍所处位置
- 校验部分赛事报名门槛
- 作为赛事生态的一部分持续滚动

前端展示组件：`frontend/src/components/Leaderboard.tsx`

---

## API 概览

主要后端入口在 `backend/src/routes/game.ts`。

### 基础接口

- `GET /health`
- `GET /traits`
- `GET /backgrounds`
- `POST /game/roll-traits`
- `POST /game/start`
- `GET /game/:sessionId`

### 回合与行动

- `POST /game/:sessionId/choice`
- `POST /game/:sessionId/action`

### 商店

- `POST /game/:sessionId/shop`
- `GET /game/meta/shop`

`/shop` 当前返回：

- `player`
- `itemName`
- `shopNarrative`
- `shopNarrativePositive`
- `shopBuffLabelsAdded`
- `shopBuffLabelsRemoved`
- `shopTagsAdded`
- `shopTagsRemoved`

### 赛事

- `GET /game/:sessionId/tournaments`
- `POST /game/:sessionId/signup`
- `POST /game/:sessionId/withdraw`
- `GET /game/meta/rules`

### 战队

- `GET /game/meta/clubs`
- `POST /game/:sessionId/apply-club`
- `POST /game/:sessionId/team-response`
- `POST /game/:sessionId/leave-team`

### 元数据

- `GET /game/meta/actions`
- `GET /game/meta/shop`
- `GET /game/meta/clubs`

---

## 本地开发

### 1. 安装依赖

后端：

```bash
cd backend
npm install
```

前端：

```bash
cd frontend
npm install
```

### 2. 初始化本地数据库

```bash
cd backend
npm run db:init:local
```

### 3. 启动后端

```bash
cd backend
npm run dev
```

默认会跑在 `http://127.0.0.1:8787`。

### 4. 启动前端

先配置 `frontend/.env.local`：

```bash
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8787
```

然后启动：

```bash
cd frontend
npm run dev
```

---

## 部署

### 后端

先更新 `backend/wrangler.toml`：

- `database_id`
- `kv namespace id`
- 可选 AI 相关变量

然后执行：

```bash
cd backend
npm run deploy
```

如需远端初始化 D1：

```bash
cd backend
npm run db:init:remote
```

### 前端

前端可单独部署到支持 `Next.js` 的平台。

必须保证：

- `NEXT_PUBLIC_API_BASE` 指向后端地址

---

## 脚本

### backend

- `npm run dev`
- `npm run deploy`
- `npm run db:init:local`
- `npm run db:init:remote`
- `npm run typecheck`

### frontend

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`

---

## 当前文档边界

这份 README 只描述当前仓库里已经实现或已经接线的系统。

它刻意移除了以下过时内容：

- 旧版阶段链路（如 `star` / `veteran` 正式阶段）
- 早期 roadmap / phase 规划
- 已经改成历史设计但不再对应现有代码的数值说明

如果后续继续扩展：

- 经纪人事件种类
- 商店准备类商品
- 更复杂的战队生态
- 更多结局条件

建议同步维护这里，而不是继续在 README 里堆历史计划。
