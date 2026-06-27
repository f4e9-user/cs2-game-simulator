# 多事件回合 · 周编排器（Week Composer）设计

> 把当前「每回合单个事件决策」改造为「单回合多个事件」（足球经理式）的设计方案。
> 本文档为设计稿，落地前可据此再调数值与范围。

## 0. 背景与目标

当前一个回合（round = 一周）分两阶段，由 `session.phase: 'action' | 'event'` 驱动：

1. **行动阶段（action）**：花行动点（AP，每回合重置 100）做日常行动、购物、报名赛事。
2. **事件阶段（event）**：`endActionPhase()` 调 `pickEvent()` 挑出**唯一一个**事件 →
   `/choice` → `applyChoice()` 结算 → **回合 +1**，AP 重置，回到行动阶段。

目标：让一个回合可以连续处理**多个事件**（像 FM 的收件箱），但要有**节奏**、**主题**、**多样性**和**动态自适应**，而不是把 N 个随机事件堆在一起（老虎机感）。

### 已有地基：EventSequence

代码已存在 `activeEventSequence` 机制（`eventSequence.ts` / `choiceSequences.ts`），
用于回合内多步剧情（面试、BO3/BO5、家人危机、队内冲突、AI 多步）。核心一句：

```ts
// choice.ts:261
const shouldAdvanceRound = effectiveActiveSequence ? isSequenceFinalStep(...) : true;
```

**只有序列最后一步才推进回合。** `applyChoice` 中所有「按周结算」（周+1 / 发薪 / 恢复系统 /
生活开销 / 队友成长 / 资格过期 / 角色回合数）都用 `if (shouldAdvanceRound)` 包着。

> 结论：**「结算一个事件」与「推进一周」在代码里已经拆开、且经测试验证**。
> 多事件改造直接复用这道闸门即可，不另造并行结算逻辑。

## 1. 核心理念

> **「一个回合的多个事件」 = 「把整个回合当成一个隐式序列，只有最后一个事件推进回合」。**

四个尺度协同决定玩家体感：

| 尺度 | 管什么 | 体感 |
|---|---|---|
| **数量**（锚点 + 压力分 + 节奏回弹） | 这周有多大事、要不要喘气 | 有的周 1 件、有的周 3 件、忙完必有清净周 |
| **回合内凝聚**（themeFit / tone） | themed 周内部围绕同一件事 | 多件事像一条线，不跳戏 |
| **跨回合多样性**（varietyFit） | 周与周之间换花样 | 不会连着十周都是生活琐事 |
| **回合内自适应**（reconcile） | 中途状态突变时剩余怎么办 | 崩溃收尾 / 压力降级 / 主题失效重派生 / 危机抢占 |

关键设计决定：**`RoundPlan` 存「意图」（数量/主题/语气/规则），不存「事件 id 队列」。**
每封事件**懒解析**——取下一封时基于刚结算后的最新状态选，从根上避免「计划好的事件与结算后状态矛盾」。

## 2. 数据结构（`types.ts`）

```ts
export type EventTone = 'heavy' | 'tense' | 'light';
export type ThemeGroup = 'team' | 'competition' | 'money-life' | 'media' | 'growth';
export type RoundArchetype =
  | 'major-single'                     // 重锤单点：家人危机/被踢/晋级面试/赛事周 → 锁 1
  | 'team-drama' | 'money' | 'media'   // 中等剧情 → 2~3
  | 'quiet';                           // 无锚点平静周 → 1，偶尔 2

export interface RoundPlan {
  archetype: RoundArchetype;
  theme?: { type: EventType; group: ThemeGroup; tags: string[] }; // 主题指纹，来自锚点
  tone?: EventTone;
  targetCount: number;        // 本周目标事件数
  servedCount: number;        // 已呈现（含当前）数
  servedEventIds: string[];   // 回合内去重
  hardDecisionCap: number;    // 固定 1
  servedHardDecisions: number;
}
```

挂载位置：
- `GameSession.roundPlan?: RoundPlan` —— 与 `activeEventSequence` 同类的回合编排态，随 `saveFinalizedSession` 持久化。
- `Player.lastRoundEventCount?: number` —— 节奏回弹用的跨回合记忆。

> **重要约束**：`EventDef` 没有自带 `tags` / `tone` 字段（只有 `requireTags` / `forbidTags` / `difficulty`）。
> 所以「主题」「语气」都从 `type` + `id` 前缀 + `requireTags` **派生**，不能假设事件自带标签。

## 3. 派生表（`engine/roundPlan.ts`，新文件）

```ts
const EVENT_TONE: Record<EventType, EventTone> = {
  life:'heavy', stress:'heavy', bailout:'heavy', cheat:'heavy',
  team:'tense', match:'tense', rival:'tense', tryout:'tense', chains:'tense',
  media:'light', skins:'light', betting:'light', daily:'light',
  training:'light', ranked:'light', broadcast:'light', agent:'light',
  'tournament-context':'tense',
};
// id 前缀覆盖（type 粗分不够准的暗黑事件）
const TONE_OVERRIDE = (id: string): EventTone | null =>
  /^skin-(gamble|scam)-|^family-crisis|^media-abandoned-family/.test(id) ? 'heavy' : null;

const THEME_GROUP: Record<EventType, ThemeGroup> = {
  team:'team', rival:'team', tryout:'team', chains:'team',
  match:'competition', ranked:'competition', 'tournament-context':'competition',
  life:'money-life', bailout:'money-life', betting:'money-life', cheat:'money-life', skins:'money-life',
  media:'media', broadcast:'media', agent:'media',
  training:'growth', daily:'growth', stress:'growth',
};

const isHardDecision = (e: EventDef) => e.difficulty >= 2;
```

**`MAJOR_SINGLE` 锚点集合**（命中即 `archetype='major-single'`，`targetCount=1`）：
`family-crisis-illness`、`chain-team-fired`、`chain-contract-renewal`、`promotion-*`、
面试系 `CLUB_INTERVIEW_IDS`、`bailout-*`、`tournament-*`、赛前/伤病赛事事件，
以及 `pendingMatch` 命中的赛事周。

## 4. 数量分配：`composeRoundPlan()`

```ts
export function composeRoundPlan(
  session: GameSession, anchor: EventDef | null, rng: () => number,
): RoundPlan
```

三层叠加：**锚点定基 → 压力分微调 → 节奏回弹封顶**。

```
// ── 第 1 层 锚点定基 ──
anchor == null                  → archetype='quiet',        base=1
isMajorSingle(anchor)           → archetype='major-single', base=1  ★直接 return targetCount=1
THEME_GROUP[anchor.type] ===
  'team'                        → 'team-drama', base=2
  'money-life'                  → 'money',      base=2
  'media'                       → 'media',      base=2
  'competition'(非赛事周)        → base=2
  'growth'                      → base=1

// ── 第 2 层 压力分（信号全部来自现成 dynamicTags()）──
pressure = Σ 权重:
  breaking-down / needs-family-crisis +2,  stressed +2,  needs-bailout +2,
  pendingDeparture / teammate-transfer-*  +1,  contract-up +1,
  losing-streak +1,  just-joined-team +1,  famous +1
base += (pressure >= 4 ? +1 : 0)
base  = min(base, 3)

// ── 第 3 层 节奏回弹（防疲劳的命门）──
lastRoundEventCount >= 3 → base = min(base, 1)   // 上周炸 → 本周强制静
lastRoundEventCount === 2 → base = min(base, 2)

// ── 收尾 ──
targetCount = clamp(base, 1, 3)
theme = anchor ? { type, group: THEME_GROUP[type], tags: anchor.requireTags ?? [] } : undefined
tone  = anchor ? (TONE_OVERRIDE(anchor.id) ?? EVENT_TONE[anchor.type]) : undefined
hardDecisionCap = 1
```

> `composeRoundPlan` 只产出意图，不预取事件 id。

## 5. 取事件策略：`pickRoundEvent()`（S2 主题填充，S1 兜底）

`events.ts` 新增，给第 2..N 封用；第 1 封（锚点）与无候选兜底仍走原 `pickEvent`。

```ts
export function pickRoundEvent(ctx: EventContext, plan: RoundPlan): EventDef | null
```

逻辑：
1. **优先级级联照跑**（中途新发的硬事件仍能插队），排除 `plan.servedEventIds`。
   若插队的是 `MAJOR_SINGLE` 类 → 占该槽并**截断本周**（`targetCount = servedCount`）。
2. 普通 `eligible` 池权重 = `stateWeight(e) × themeFit × toneFit × varietyFit`。
3. **回合内闸门**：剔除 `servedEventIds`；硬决策已达 `hardDecisionCap` 则剔除 `isHardDecision`；
   **同 `type` 每回合 ≤ 2**。
4. **S1 退化**：`plan.theme == null`（quiet 周或主题失效后）→ `themeFit ≡ 1`、`toneFit ≡ 1`，
   自动退化为普通加权（≈ 现有行为）。

### themeFit（回合内凝聚）

```
e.type === theme.type                          → ×3
THEME_GROUP[e.type] === theme.group            → ×2
e.requireTags ∩ theme.tags ≠ ∅                 → 额外 ×1.5
否则（跨主题）                                  → ×0.3
```

### toneFit（语气一致）

```
同 tone                  → ×1.5
tense ↔ light（相邻）     → ×1
heavy ↔ light（对立）     → ×0.2
```

## 6. 跨回合多样性：`varietyFit()`

解决「平静周连续十几个 life 类事件」的问题。`themeFit` 只管回合内，跨回合靠它。
**无需新增存储字段**——从 `session.history` 派生（`RoundResult.eventType` 已存在）。

```ts
// EventContext 新增：recentGroups = history.slice(-WINDOW).map(r => THEME_GROUP[r.eventType])
const WINDOW = 8;
function varietyFit(e: EventDef, recentGroups: ThemeGroup[]): number {
  const g = THEME_GROUP[e.type];
  const n = recentGroups.filter(x => x === g).length;   // 最近窗口内同组次数
  return [1.4, 1.0, 0.55, 0.3, 0.12][Math.min(n, 4)];   // 越频繁越压
}
```

应用位置（关键：与 themeFit **分处两个阶段，互不对冲**）：

| 选择阶段 | stateWeight | themeFit | toneFit | varietyFit |
|---|---|---|---|---|
| **锚点 / 平静周单事件**（`pickEvent`，跨回合） | ✅ | — | — | ✅ **强** |
| **回合内填充**（`pickRoundEvent`，回合内） | ✅ | ✅ 主导 | ✅ | 弱（仅对非当前主题组施压） |

- `varietyFit` 决定「这周的**主题**该不该换」（跨回合轮换）。
- `themeFit` 决定「既然这周是 X 主题，内部就围着 X」（回合内凝聚）。
- 强制优先级事件（家人危机/救济/面试）**绕过 varietyFit**。

## 7. 回合内自适应：`reconcileRoundPlan()`

中途状态突变（压力/疲劳/受伤/离队/破产）后，**呈现下一封之前**重校准剩余计划。

```ts
function reconcileRoundPlan(plan, p, result): RoundPlan {
  // ① 崩溃/受伤 → 提前收尾
  if (result.endRun) return end(plan);
  if (p.tags.includes('breaking-down')              // 压力顶到 100
   || (p.restRounds > 0 && injuredThisRound)         // 本回合受伤强制休养
  ) return truncate(plan, plan.servedCount);

  // ② 压力/疲劳过线 → 缩一格 + 余下转「轻」语气（taper，不再堆硬决策）
  if (p.stress >= 80 || p.volatile.fatigue >= 85 || result.resultTier === 'critical_failure') {
    plan.targetCount = Math.max(plan.servedCount, plan.targetCount - 1);
    plan.tone = 'light';
  }

  // ③ 主题失效 → 重派生或清空（退化成 S1 + varietyFit）
  if (!themeStillValid(plan.theme, p)) {
    plan.theme = redériveTheme(p) ?? undefined;       // 例：刚离队 → team 主题失效
  }
  return plan;
}
```

第四类由 `pickRoundEvent` 的优先级级联承担：**中途新触发的危机**（破产→`needs-bailout`、
家人危机）是 `MAJOR_SINGLE`，占下一槽并**截断本周**。

### 铁律：plan 只会**缩或持平，绝不中途变大**

唯一的「增量」是危机抢占，但那是**替换一个槽并截断**，不是把 3 件加成 5 件。
玩家永远不会因为「这周过得糟」反而被塞更多决策。

## 8. 接缝改动（`engine/choice.ts`）

### (a) 抽 helper

把 `endActionPhase`（`choice.ts:1512–1581`）那段「面试/系列赛/家人危机/队内冲突/AI 多步 →
包装成子序列」抽成：

```ts
function prepareEventForPresentation(session, picked, plan):
  { currentEvent; activeEventSequence? }
```

`endActionPhase` 和「取下一封」路径共用。**一个子序列整体算 1 个槽**
（`servedCount` 在子序列完成时才 +1，不是每步 +1）。

### (b) `shouldAdvanceRound` 支点（`choice.ts:261`）

```ts
const planHasMore = MULTI_EVENT_ENABLED
  && session.roundPlan
  && session.roundPlan.servedCount < session.roundPlan.targetCount
  && !ending;
const seqFinalOrNone = effectiveActiveSequence ? isSequenceFinalStep(...) : true;
const shouldAdvanceRound = seqFinalOrNone && !planHasMore;
```

子序列进行中 → `seqFinalOrNone=false` → 不推进（与现状一致）；
子序列终结后才由 `planHasMore` 决定。所有按周结算因 `shouldAdvanceRound=false` 自动跳过。

### (c) 终局返回块（`choice.ts:1462`）

```
plan = reconcileRoundPlan(plan, nextPlayer, result)
若 planHasMore 且本封非子序列中途：
  servedCount++; servedEventIds.push(eventId); servedHardDecisions += isHard ? 1 : 0
  next = pickRoundEvent(ctx(nextPlayer), plan)        // 级联可抢占
  若 next 为 MAJOR_SINGLE → targetCount = servedCount   // 占槽后截断
  若 next: prepareEventForPresentation → return phase='event' + next（回合不推进）
  若取不到: 落入正常推进
否则（最后一封）:
  正常推进回合 + 清空 session.roundPlan + nextPlayer.lastRoundEventCount = servedCount
```

### (d) `endActionPhase`

`pickEvent` 出锚点后 `session.roundPlan = composeRoundPlan(...)`，
`servedCount=1`、`servedEventIds=[anchor.id]`、`servedHardDecisions=isHard(anchor)?1:0`；
再走 `prepareEventForPresentation`。

## 9. 前端（几乎零改）

- 续封：`page.tsx:286` 的 `hasNextSequenceEvent = res.phase==='event' && !!res.currentEvent`
  **已能驱动多封连续呈现**，白嫖。
- 可选打磨：HUD 加「本周事件 `servedCount/targetCount`」收件箱进度条
  （`buildSessionPayload` 透传 `roundPlan`）。

## 10. 灰度与测试

- `constants.ts`：`MULTI_EVENT_ENABLED`（默认 **关**）+ 压力权重表 + 数量上限 + reconcile 阈值
  （stress 80 / fatigue 85）。关时 `targetCount` 恒 1，**行为与今日完全一致，老测试全绿**。
- `roundPlan.test.ts`：锚点分类 → base、压力分 +1、节奏回弹钳制、themeFit/toneFit/varietyFit 乘子、
  硬决策上限、连续同组衰减。
- `multiEventRound.test.ts`（集成）：
  - N 封只发 1 次薪 / 周+1 / AP 重置一次；
  - 回合内去重、同 type ≤2；
  - `major-single` 中途抢占 → 截断；
  - 压力过线 → 缩 1 + 转轻；
  - 离队后主题清空 → 走 variety；
  - 中途破产 → bailout 抢占截断；
  - 中途结局 → 停批；
  - `MULTI_EVENT_ENABLED=false` → 等同现状。

## 11. 改动文件清单

| 文件 | 改动 |
|---|---|
| `backend/src/types.ts` | +`RoundPlan` / `EventTone` / `ThemeGroup` / `RoundArchetype`；`GameSession.roundPlan?`；`Player.lastRoundEventCount?` |
| `backend/src/engine/roundPlan.ts` ★新 | 派生表、`composeRoundPlan`、压力分、节奏回弹、`themeFit` / `toneFit` / `varietyFit`、`reconcileRoundPlan`、`themeStillValid`、`isHardDecision`、`MAJOR_SINGLE` |
| `backend/src/engine/events.ts` | +`pickRoundEvent(ctx, plan)`（复用 `stateWeight` / `weightedPick`）；`EventContext` +`recentGroups` |
| `backend/src/engine/choice.ts` | 抽 `prepareEventForPresentation`；`shouldAdvanceRound` 支点；终局续批 + `reconcileRoundPlan`；清 plan + 写 `lastRoundEventCount` |
| `backend/src/engine/constants.ts` | `MULTI_EVENT_ENABLED` + 权重 / 上限 / 阈值常量 |
| `backend/src/routes/game.ts` + `buildSessionPayload` | 透传 `roundPlan`（前端进度条用） |
| `frontend/...` | 可选进度条；续封逻辑零改 |

> **无新增持久化字段用于多样性**（`varietyFit` 从 history 派生）。

## 12. 实施阶段

- **Phase 0**：开关 `MULTI_EVENT_ENABLED`（默认关）+ `roundPlan.ts` 骨架 + 类型字段。行为不变。
- **Phase 1**：`composeRoundPlan` + `pickRoundEvent` + `choice.ts` 三处接缝 + `reconcileRoundPlan` + 两个测试。
- **Phase 2**：前端进度条、数值调优、灰度开启（先 K=2）。

## 13. 待定数值（落地前可再议）

- 忙周封顶：3 还是 4。
- 节奏回弹：单个忙周即回弹，还是连续两个忙周才回弹。
- taper 力度：过线缩 1，还是直接砍半。
- 衰减表 `[1.4, 1.0, 0.55, 0.3, 0.12]`、窗口 8、themeFit 倍率 `×3/×2/×1.5/×0.3`。
- 平静周是否偶尔允许 2 件。
