# 战队系统设计方案

> 文档版本：v1.0 · 2026-05-06
> 基于 Phase G 代码状态撰写，面向 Phase H+ 实现。

---

## 一、设计原则与约束

### 1.1 叙事抽象原则

CS2 是 5 人团队游戏，但本模拟器是**单选手视角**的生涯故事。战队系统不模拟完整的 5 人阵容博弈，而是以「选手与俱乐部关系」为轴心，通过薪资、合同、队内事件来体现团队归属感。

**核心抽象**：
- 你的胜负代表整支战队的胜负
- 队友是背景 NPC，通过事件叙事出现，不做独立数值建模（Phase H 扩展）
- 俱乐部是「雇主」，提供薪资、赛事资源、发展平台

### 1.2 阶段自然绑定原则

战队进度与赛事进度**强绑定**——进不了职业俱乐部就打不了职业联赛，这是最核心的设计约束。禁止出现「零战队打 Major」的情况。

### 1.3 取舍平衡原则

签约战队不是纯收益，需要体现真实的职业生态取舍：

| 自由人 | 有战队 |
|-------|-------|
| 奖金 100% 自留 | 奖金按档位分成（50–85%） |
| 赛事选择自由 | 有强制参赛义务 |
| 无周薪收入 | 每回合稳定薪资 |
| 只能打开放赛 | 可进入高级别联赛 |
| 无团队加成 | matchSimulator teamBonus |

### 1.4 行动力整合原则

发简历、参加面试等主动行为**消耗 25 AP**，与现有行动力系统统一。不额外创造"免费"的主动操作。

### 1.5 不过度建模原则

以下内容**当前阶段不做**，作为 Phase I+ 预留钩子：
- 完整 5 人队员数值建模
- 战队战术体系（战术偏好影响检定）
- 俱乐部财务状况（战队破产）
- 青训梯队升降级

---

## 二、数据模型

### 2.1 新增类型（`backend/src/types.ts`）

```typescript
export type ClubTier = 'youth' | 'semi-pro' | 'pro' | 'top';

export interface Club {
  id: string;
  name: string;
  tag: string;               // 战队缩写，如 "NaVi"
  region: string;            // 地区，如 "欧洲"、"亚太"
  tier: ClubTier;
  requiredStage: Stage;      // 报名门槛阶段
  requiredFame?: number;     // 报名门槛名气
  baseSalary: number;        // 合同基础周薪（money 单位，×10=K）
  salaryRange: [number, number]; // 谈判可浮动区间 [min, max]
  isRival?: boolean;         // 是否映射到 rivals[] 中的战队
  rivalIndex?: number;       // rivals[rivalIndex] 对应关系
}

export interface PlayerTeam {
  clubId: string;
  name: string;
  tag: string;
  region: string;
  tier: ClubTier;
  weeklySalary: number;      // 每回合实际发放薪资（谈判后确定）
  joinedRound: number;       // 加入时的 round 数
  contractEndRound?: number; // 合同到期 round（可选，未来扩展用）
}

export interface PendingApplication {
  clubId: string;
  clubName: string;
  appliedRound: number;
  responseRound: number;     // 触发回信事件的 round
}

// 加入 Player 接口
// team: PlayerTeam | null;
// pendingApplication: PendingApplication | null;
```

### 2.2 Player 字段变更

```typescript
// DynamicState 新增：
team: PlayerTeam | null;                  // 当前所属战队
pendingApplication: PendingApplication | null; // 进行中的申请
```

### 2.3 前端镜像同步

`frontend/src/lib/types.ts` 同步新增 `Club`、`PlayerTeam`、`PendingApplication`。

---

## 三、俱乐部数据库（`data/clubs.ts`）

### 3.1 分档设计（共 16 个俱乐部）

**Youth 档（解锁：rookie→youth）**

| id | 名称 | Tag | 地区 | 周薪 | 谈判区间 |
|----|------|-----|------|------|---------|
| `club-local-wolves` | 本地狼队 | LW | 本地 | 1 (10K) | [1, 2] |
| `club-cyber-academy` | 赛博学院 | CYA | 亚太 | 1 (10K) | [1, 2] |
| `club-school-team` | 校队 | SCH | 本地 | 1 (10K) | [1, 1] |
| `club-regional-youth` | 区域青训 | RYT | 亚太 | 2 (20K) | [1, 2] |

**Semi-pro 档（解锁：youth→second）**

| id | 名称 | Tag | 地区 | 周薪 | 谈判区间 |
|----|------|-----|------|------|---------|
| `club-rising-force` | 崛起之力 | RF | 亚太 | 3 (30K) | [2, 4] |
| `club-iron-wolves` | 铁狼 | IW | 欧洲 | 3 (30K) | [2, 4] |
| `club-pacific-storm` | 太平洋风暴 | PS | 亚太 | 4 (40K) | [3, 5] |
| `club-rival-semi` | （rival映射） | — | — | 3 (30K) | [2, 4] |

**Pro 档（解锁：second→pro，fame≥15）**

| id | 名称 | Tag | 地区 | 周薪 | 谈判区间 |
|----|------|-----|------|------|---------|
| `club-apex-gaming` | Apex Gaming | APX | 欧洲 | 6 (60K) | [4, 8] |
| `club-phantom-esports` | Phantom | PHT | 北美 | 6 (60K) | [4, 8] |
| `club-dragon-corp` | 龙腾电竞 | DRG | 亚太 | 5 (50K) | [4, 7] |
| `club-rival-pro` | （rival映射） | — | — | 6 (60K) | [5, 8] |

**Top 档（解锁：pro→star，fame≥30）**

| id | 名称 | Tag | 地区 | 周薪 | 谈判区间 |
|----|------|-----|------|------|---------|
| `club-titan-corp` | Titan Corp | TTN | 欧洲 | 10 (100K) | [8, 14] |
| `club-neon-dynasty` | Neon Dynasty | NDY | 亚太 | 9 (90K) | [7, 12] |
| `club-sovereign` | Sovereign | SVR | 北美 | 11 (110K) | [9, 15] |
| `club-rival-top` | （rival映射） | — | — | 10 (100K) | [8, 13] |

### 3.2 Rival 战队映射

4 个 rival 战队（`rivals[0..3]`）分别对应 semi-pro × 1、pro × 1、top × 2 档位各一个俱乐部。这样「向对手俱乐部发简历」或「被对手挖角」就有了叙事依托。

---

## 四、申请/面试流程

### 4.1 完整状态机

```
[ClubPanel] 玩家点击「发简历」
    ├─ 前置校验：AP≥25 / 无 pendingApplication / 满足阶段+名气门槛
    ├─ 消耗 25 AP
    ├─ 写入 pendingApplication { clubId, responseRound: now + rand(2,4) }
    └─ 添加 tag: applying

    ↓ responseRound 到来时

[pickEvent] 检测到 applying tag + responseRound 命中
    └─ 返回 chain-club-response 事件

[chain-club-response]
    ├─ 选项 A：收到面试邀请（概率受 fame/experience 影响）
    │       → 清 applying tag，加 interview-pending tag
    │       → 设 responseRound = now+1（下回合触发面试）
    └─ 选项 B：婉拒来信
            → 清 applying tag + pendingApplication
            → 3 回合冷却后可再次申请

    ↓（若收到面试邀请）

[chain-club-interview] d20 检定（primary: experience，secondary: intelligence）
    ├─ 成功 → 触发前端 TeamOfferModal
    │       → 玩家确认 → 写入 player.team，清 pendingApplication
    │       → 玩家拒绝 → 清 interview-pending，可再次申请（冷却 10 回合）
    └─ 失败 → chain-club-rejected
            → 清所有申请 tag，设 5 回合冷却

```

### 4.2 面试成功率影响因素

```
baseRate = 0.5
+ min(0.2, fame / 100)           // 名气加成
+ min(0.15, experience / 20)      // 经验加成
- rivalPenalty（对手俱乐部 -0.1） // 敌对俱乐部更难进
```

### 4.3 薪资谈判

面试成功进入 TeamOfferModal 时，生成一个在 `salaryRange` 内的随机报价。未来可扩展为玩家手动选择「接受报价 / 要求提高 / 拒绝」。

---

## 五、周薪系统

### 5.1 每回合发薪

在 `gameEngine.ts` 的 `advanceRound()` 内注入：

```typescript
if (nextPlayer.team) {
  nextPlayer.stats.money += nextPlayer.team.weeklySalary;
  passiveEffects.push(`周薪入账 +${nextPlayer.team.weeklySalary * 10}K`);
}
```

### 5.2 奖金分成（赛事结算时）

```typescript
const prizeSplit: Record<ClubTier, number> = {
  youth:      0.85,
  'semi-pro': 0.70,
  pro:        0.60,
  top:        0.50,
};

const playerShare = player.team
  ? prizeSplit[player.team.tier]
  : 1.0;

finalMoneyReward = Math.round(baseMoneyReward * playerShare);
```

分成说明在结算叙事中体现：「俱乐部从奖金中抽取 30%，你实际到手 XX K」。

---

## 六、赛事系统联动

### 6.1 赛事准入新增战队门槛

`routes/game.ts` 的 signup 校验新增：

| 赛事层级 | 新增战队要求 |
|---------|------------|
| netcafe / city / platform | 无（自由人或任意战队均可） |
| secondary-league | 需要 youth+ 战队 |
| development-league | 需要 semi-pro+ 战队 |
| tier2 / tier1 | 需要 pro 战队 |
| s-class / major | 需要 top 战队 |

自由人可参加三档开放赛事，高级别联赛必须依托战队资质。

### 6.2 matchSimulator 团队加成

```typescript
// effectiveAim 计算中加入 teamBonus
const TEAM_BONUS: Record<ClubTier, number> = {
  youth:      2,
  'semi-pro': 4,
  pro:        7,
  top:        10,
};
const teamBonus = player.team ? TEAM_BONUS[player.team.tier] : 0;
effectiveAim = Math.max(5, Math.min(99,
  aimBase + feelEffect - fatigueDebuff - tiltDebuff + teamBonus
));
```

代表教练指导、训练设施、分析师支持对比赛的间接贡献。

### 6.3 俱乐部强制参赛

签约后，俱乐部会把你排入对应级别的联赛（产生 `pendingMatch`，来源标记为 `'club'`）：

- youth 战队 → 每赛季自动报名 secondary-league
- semi-pro 战队 → 自动报名 development-league
- pro/top 战队 → 自动报名 tier1/tier2/major（按合同条款）

强制参赛时玩家无法主动弃赛（或弃赛惩罚加倍：+额外 `chain-team-conflict`）。

---

## 七、事件链设计

### 7.1 申请/入队链（新增）

| 事件 ID | 触发条件 | 核心内容 |
|--------|---------|---------|
| `chain-club-response` | applying tag + responseRound 命中 | 面试邀请或婉拒，experience 检定 |
| `chain-club-interview` | interview-pending tag | 正式面试，d20 检定，成功触发 OfferModal |
| `chain-club-rejected` | 面试失败后 | 叙事收尾，清 tag，设冷却 |
| `chain-team-joined` | 加入战队后第 1 回合 | 新队友见面，队内氛围事件 |

### 7.2 在队期间事件（新增）

| 事件 ID | 触发条件 | 核心内容 |
|--------|---------|---------|
| `chain-contract-renewal` | 有战队 + 每 48 回合 | 续约谈判：加薪/维持/降薪/不续（d20 + fame） |
| `chain-team-conflict` | 有战队 + stress≥60 + random | 与队友矛盾/与教练冲突，压力处理 |
| `chain-team-fired` | 有战队 + 连续 3 次赛事失败 + fame低 | 被踢出战队，team=null，强触发后续链 |
| `chain-team-promote-offer` | 满足更高档战队门槛 + 有战队 | 更好的俱乐部来挖，需要决定去留 |

### 7.3 对手战队联动事件（新增）

| 事件 ID | 触发条件 | 核心内容 |
|--------|---------|---------|
| `chain-rival-scout` | rivals 积分靠前 + fame≥20 + 无战队 | 对手俱乐部星探来看比赛，下次面试+bonus |
| `chain-rival-poach` | 有战队 + rivals 积分高于玩家战队 | 挖角邀请：接受=转会流程，拒绝=loyalty tag |
| `chain-rival-match-trash` | pendingMatch 对手是 rival | 赛前口水战，成功=心态 buff，失败=tilt+ |
| `chain-rival-teammate-leave` | 有战队 + random | 队内某人被 rival 挖走，团队事件 |
| `chain-old-team-derby` | 转会后遇到前战队 | 与前东家对决，额外心态检定 |

### 7.4 事件权重调整

```typescript
// pickEvent 权重修正
if (!player.team) {
  // 自由人：增加申请相关叙事事件权重
  weightMultipliers['tryout'] *= 1.5;
}
if (player.team) {
  // 有战队：增加队内事件权重
  weightMultipliers['team'] *= 1.6;
}
if (player.pendingApplication) {
  // 申请中：暂时压低不相关高权重事件
}
```

---

## 八、前端组件

### 8.1 ClubPanel.tsx（新增）

位置：`hud-left`，ActionPanel 下方，仅在 stage ≥ youth 时显示。

```
┌─ 战队 ────────────────────────────────────┐
│ 当前：[NaVi Academy]  [semi-pro]           │
│ 周薪：+30K/回合  加入于：Y2 W14            │
├───────────────────────────────────────────┤
│ 可申请俱乐部                               │
│                                           │
│ ┌ Rising Force ──────────────── semi-pro ┐ │
│ │ 亚太 · 周薪 30-40K                    │ │
│ │ fame 要求：12  ✓ 已满足               │ │
│ │                     [发简历  -25 AP]  │ │
│ └───────────────────────────────────────┘ │
│                                           │
│ ┌ Titan Corp ─────────────────── top ──┐  │
│ │ 欧洲 · 周薪 80-140K                  │  │
│ │ 🔒 需要 star 阶段 + fame 30          │  │
│ └───────────────────────────────────────┘ │
│                                           │
│ ⏳ 正在等待回信… 还有 2 回合              │
└───────────────────────────────────────────┘
```

**按钮状态：**
- 正常：`发简历 -25 AP`
- 已申请中：`等待回信…`（禁用）
- 门槛不足：`🔒 需要 XXX`（禁用）
- AP 不足：`AP 不足`（禁用）

### 8.2 TeamOfferModal.tsx（新增）

由前端 store 中的 `pendingOffer` 状态驱动，choice 结果返回时触发。

```
┌──────────────────────────────────────────────┐
│  🏆  收到战队邀请                              │
├──────────────────────────────────────────────┤
│  俱乐部    Rising Force                       │
│  档位      Semi-Pro                           │
│  地区      亚太                               │
│  周薪      +30K / 回合                        │
│                                              │
│  加入后你将代表该战队参加联赛，               │
│  俱乐部将从赛事奖金中抽取 30%。              │
├──────────────────────────────────────────────┤
│          [暂时拒绝]      [确认加入 →]         │
└──────────────────────────────────────────────┘
```

### 8.3 现有组件改动

**HudTopBar.tsx**：
- 顶栏阶段 tag 旁加入战队 tag + 周薪小字
- 格式：`[青训]  [CYA +10K/w]`
- 自由人状态：`[青训]  [自由人]`

**PlayerStats.tsx**：
- 生涯记录区加入「当前战队」和「加入时间」

**MatchPanel.tsx**：
- 报名按钮旁标注该赛事是否需要战队资质
- 俱乐部强制参赛的 pendingMatch 标注「[俱乐部安排]」不可弃赛

**ResultPanel.tsx**：
- 显示周薪入账的 passive effect chip

---

## 九、新增 API 端点

```
POST /api/game/:sessionId/apply-club
  Body: { clubId: string }
  Returns: { player: Player }
  Error: 400 if AP<25 | 已有 pendingApplication | 门槛不足

POST /api/game/:sessionId/team-response
  Body: { accept: boolean }
  Returns: { player: Player }
  说明：处理 OfferModal 的确认/拒绝，由前端 TeamOfferModal 触发

GET /api/game/meta/clubs
  Returns: { clubs: Club[] }
```

---

## 十、结局钩子扩展

| 新结局 | 触发条件 |
|-------|---------|
| `free-agent-legend` | 满 576 回合 + 全程无战队 + fame≥60 + major-champion（草根传奇路线） |
| `loyal-veteran` | 满 576 回合 + 同一战队 200+ 回合 + 续约 ≥ 3 次 |

---

## 十一、各阶段里程碑

### Phase H-1：核心可玩（战队基础）

**目标：玩家能签约战队、领取周薪、看到战队信息。**

- [ ] `backend/src/data/clubs.ts` — 16 个俱乐部定义
- [ ] `backend/src/types.ts` — Club / PlayerTeam / PendingApplication 类型
- [ ] `backend/src/engine/gameEngine.ts` — initPlayer 加 team/pendingApplication 字段；advanceRound 注入周薪
- [ ] `backend/src/routes/game.ts` — `POST /apply-club`、`POST /team-response`、`GET /meta/clubs`
- [ ] `backend/src/data/events/chains.ts` — chain-club-response、chain-club-interview、chain-club-rejected
- [ ] `frontend/src/components/ClubPanel.tsx` — 基础版（列表+发简历按钮）
- [ ] `frontend/src/components/TeamOfferModal.tsx` — 确认弹框
- [ ] `frontend/src/store/gameStore.ts` — pendingOffer 状态、applyClub/respondOffer action
- [ ] `frontend/src/lib/types.ts` — 前端类型同步
- [ ] `frontend/src/components/HudTopBar.tsx` — 战队 tag + 周薪显示

**验收标准：**
1. 路人阶段 ClubPanel 不显示或提示「进入青训后解锁」
2. 进入 youth 后可对 youth 档俱乐部发简历，消耗 25 AP
3. 2–4 回合后触发回信事件，成功触发面试，通过后弹出 OfferModal
4. 确认加入后顶栏显示战队信息，每回合 ResultPanel 有周薪 chip
5. 资金随每回合自动增长

---

### Phase H-2：赛事联动

**目标：战队档位影响赛事准入和比赛结果。**

- [ ] `backend/src/routes/game.ts` signup — 新增战队门槛校验（secondary-league 需 youth+，以此类推）
- [ ] `backend/src/engine/matchSimulator.ts` — 加入 teamBonus 到 effectiveAim
- [ ] `backend/src/engine/gameEngine.ts` applyMatch — 奖金分成逻辑
- [ ] `frontend/src/components/MatchPanel.tsx` — 战队要求提示、门槛不足时禁用报名按钮

**验收标准：**
1. 自由人尝试报名 secondary-league 报错「需要青训以上战队」
2. 有 semi-pro 战队时 effectiveAim 提升，胜率可验算
3. 赛事奖金结算时显示分成比例

---

### Phase H-3：在队事件链

**目标：有战队之后产生丰富的队内叙事。**

- [ ] `chain-team-joined` — 加入战队后首回合队友见面事件
- [ ] `chain-contract-renewal` — 每 48 回合触发续约谈判
- [ ] `chain-team-conflict` — stress 高时队内矛盾事件
- [ ] `chain-team-fired` — 连续失败后被踢出事件
- [ ] `chain-team-promote-offer` — 更高档俱乐部来挖角
- [ ] pickEvent 权重调整（有战队时 team 类事件 ×1.6）

**验收标准：**
1. 加入战队后 1 回合内出现新队友见面事件
2. 48 回合后触发续约，选择「拒绝续约」后 team=null
3. 连输 3 次赛事后概率触发 chain-team-fired

---

### Phase H-4：对手战队联动

**目标：排行榜 rivals 在战队叙事中活跃起来。**

- [ ] `chain-rival-scout` — rival 积分靠前时星探来访
- [ ] `chain-rival-poach` — rival 挖角事件
- [ ] `chain-rival-match-trash` — pendingMatch 对手是 rival 时赛前口水战
- [ ] `chain-rival-teammate-leave` — 队友被 rival 挖走
- [ ] `chain-old-team-derby` — 转会后遇前东家
- [ ] rivals[0..3] 与 club isRival 映射打通

**验收标准：**
1. rivals 积分 Top 3 时概率触发星探事件
2. pendingMatch 对手是 rival 战队时出现赛前口水战事件（而非普通叙事）
3. 从 rival 战队跳槽再碰到对方时触发「前东家 derby」事件

---

### Phase H-5：新结局 + 平衡调整

- [ ] `free-agent-legend` 结局判定（全程自由人 + 条件）
- [ ] `loyal-veteran` 结局判定（同队 200 回合 + 续约 ≥ 3）
- [ ] EndingPanel 新增战队历史展示（曾效力 / 当前 / 离队原因）
- [ ] 数值平衡：teamBonus / 周薪 / 奖金分成比率基于游戏测试调整

---

### Phase I（预留钩子，不在当前范围）

- **转会系统**：转会窗口期、违约金、转会费事件链
- **队员系统**：4 个 NPC 队友，有名字/特质，影响 team 类事件；队友伤病/退役
- **俱乐部财务**：战队资金影响薪资；俱乐部倒闭事件
- **战术体系**：俱乐部战术偏好（aggressive/passive）影响比赛检定加成

---

## 附录：关键数值参考

### teamBonus 与 matchSimulator 关系

```
enemyAim(发展联赛决赛) = 65
effectiveAim(玩家枪法37 + semi-pro teamBonus 4) = 41

胜率 = 0.5 + (41 - 65) / 60 = 0.5 - 0.4 = 10%
→ 仍然很难，但比无战队(5%上限)有提升
```

### 周薪与奖金平衡验证

以 semi-pro 档为例（周薪 3 = 30K/回合，奖金分成 70%）：

```
development-league 冠军奖金(全拿) = 4 × 10 = 40K
development-league 冠军奖金(分成70%) = 28K

但签约后每回合 +30K → 打满 48 回合 = +1440K 额外收入
奖金分成损失 12K 相对于薪资完全可以接受
```

### 申请冷却期设计

| 情况 | 冷却期 |
|------|-------|
| 被婉拒 | 3 回合 |
| 面试失败 | 5 回合 |
| 主动拒绝 Offer | 10 回合 |
| 被同一俱乐部第二次拒绝 | 20 回合 |
