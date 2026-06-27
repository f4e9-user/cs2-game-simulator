# Phase 6-7 实现细化方案：赛季目标生成 + 赛季末评估

> 文档状态：实现就绪（细化自 `club-identity-season-goal-rebuild-design.md` 的 Phase 6 与 Phase 7）
> 文档日期：2026-06-27
> 适用范围：赛季目标生成、目标追踪、赛季中反馈、赛季末评估、管理层耐心
> 前置：Phase 1（`clubArchetype` / `heritage` / `capital`，决定目标难度与失败容忍度）；建议 Phase 4（赛事实例，提供更准的赛事成绩追踪，但非阻塞）
> 下游：Phase 8（重建事件链）消费本阶段产出的 `rebuildPressure` 与 `failed` 结果

---

## 0. 现状与接入点（已核对代码）

- **赛季 = 年（year）**：赛事按年生成（`buildYearTournaments(year)`），赛季边界即 `player.year` 递增（`choice.ts:635` `advanceWeek` 使 `nextYear > year`）。
- **世界赛季结算**：`rolloverWorldClubSeason`（`worldClubs.ts:843`）已在 `player.year > pool.season` 时触发一次，经 `tickWorldClubRuntimes`（`choice.ts:1450`）调用。**赛季末目标评估挂这里**。
- **入队提交点**：`joinTeamFromOffer`（`club.ts:274`）是写入 `player.team` 的唯一出口。**签约生成目标挂这里**。
- **中央读模型**：`buildCareerInsight`（`insights/index.ts:52`）每次响应组装 `CareerInsight`。**赛季中反馈作为新的 insight builder 挂这里**。
- **可追踪数据**（设计 6.1，均已存在）：
  - VRS：`leaderboard`（含 isPlayer 的 `points`）/ `computeClubVrsScore(runtime)`。
  - 赛事成绩：`player.tierParticipations` / `tierChampionships`（累计）、`runtime.recentResults`。
  - 队伍稳定 / 状态 / 信任：`runtime.rosterStability` / `runtime.currentForm` / `player.teamTrust`。
  - 资格：`player.qualificationSlots` / `teamQualificationSlots`。
- **存储决策**（已在主文档 11.3/11.4 定）：`seasonGoal` / `managementPatience` / `rebuildPressure` 权威值存玩家当前队对应的 `ClubRuntimeState`，`PlayerTeam` 上同名字段仅作展示快照。

---

## 1. 关键决策

### 1.1 赛季增量追踪（最重要的实现细节）

`tierParticipations` / `tierChampionships` 是**生涯累计**值，无法直接判断"本赛季是否打进 A 级"。方案：目标生成时在目标对象里存一份**赛季初快照基线**，评估/进度 = 当前值 − 基线。

```ts
interface ClubSeasonGoalBaseline {
  tierParticipations: Record<string, number>;
  tierChampionships: Record<string, number>;
  vrsScore: number;
  startYear: number;
}
```

挂在 `ClubSeasonGoal.baseline`。所有"本赛季成绩"判断一律走 `current - baseline`。

### 1.2 目标生成两个时机

- **签约时**（`joinTeamFromOffer`）：新队首个赛季目标。
- **赛季 rollover 时**（`rolloverWorldClubSeason`）：为仍在队的玩家生成下赛季目标（评估完上赛季后）。

### 1.3 评估在世界结算同址

赛季末评估、`managementPatience` 更新、`rebuildPressure` 累加、下赛季目标生成，全部在 `rolloverWorldClubSeason` 内对**玩家当前队 runtime**执行（世界其他队第一版不跑完整目标，符合主文档 14.3）。

---

## 2. 类型层（`backend/src/types.ts`）

沿用主文档 11.2 的 `ClubSeasonGoal` / `ClubSeasonGoalType` / `ClubSeasonGoalStatus`，补 `baseline`：

```ts
export interface ClubSeasonGoal {
  id: string;
  type: ClubSeasonGoalType;
  label: string;
  season: number;
  targetTier?: TournamentTier;
  targetStageIndex?: number;
  minVrsScore?: number;
  minPlayerRating?: number;
  status: ClubSeasonGoalStatus;   // 'active'|'exceeded'|'completed'|'partial'|'failed'
  progress: number;               // 0..1
  baseline: ClubSeasonGoalBaseline;
}
```

`ClubRuntimeState` 增（主文档 11.4 已列）：`seasonGoal?` / `managementPatience?`（0..100，默认 60）/ `rebuildPressure?`（0..100，默认 0）。`PlayerTeam` 增同名快照字段（仅读）。

新增赛季中反馈类型（给 CareerInsight）：

```ts
export interface SeasonGoalInsight {
  clubId: string;
  type: ClubSeasonGoalType;
  label: string;
  status: ClubSeasonGoalStatus;
  progress: number;            // 0..1
  weeksLeftInSeason: number;
  managementPatience: number;
  rebuildPressure: number;
  headline: string;            // 关键节点文案，无则空
  tone: 'neutral' | 'encouraging' | 'warning' | 'critical';
}
```

挂到 `CareerInsight.seasonGoal?: SeasonGoalInsight`（`insights/types.ts`）。

---

## 3. 目标生成（新增 `backend/src/engine/seasonGoal.ts`）

```ts
export function generateSeasonGoal(
  session: GameSession, clubId: string, season: number,
): ClubSeasonGoal;
```

### 3.1 选型（设计 5.2）

按 `club.clubArchetype` + `club.tier` 给候选目标类型与权重：

| archetype | 主目标类型 |
|---|---|
| `legacy-giant` | `major-playoffs` / `reach-s-event` |
| `capital-project` | `major-qualification` / `reach-s-event`（激进） |
| `development-factory` | `develop-rookie` / `reach-a-main` |
| `regional-pride` | `reach-a-main` / `reach-s-event` |
| `fallen-legacy` | `reach-s-event` / `rebuild-core` |
| `scrappy-underdog` | `survive-tier` / `reach-a-main` |

tier 兜底：`youth→survive-tier/reach-a-main`，`top→major-*`。

### 3.2 难度参数（设计 5.3）

由 tier / `heritage` / `capital` / 当前 VRS / 玩家 fame & role / 上赛季结果调 `targetTier` / `targetStageIndex` / `minVrsScore` / `minPlayerRating`。集中成 `seasonGoal.ts` 常量表便于调参。

### 3.3 baseline

生成时写入 1.1 的快照（读 `player.tierParticipations`/`tierChampionships`、当前 VRS、`startYear = season`）。

### 3.4 写入

```ts
runtime.seasonGoal = goal;                 // 权威
player.team.seasonGoal = snapshot(goal);   // 展示快照
```

---

## 4. 目标追踪（`seasonGoal.ts`）

```ts
export function evaluateGoalProgress(
  session, runtime, goal,
): { progress: number; met: boolean; partial: boolean };
```

各类型的判定（全部用 `current - baseline`）：

| 目标 | progress / 达成判据 |
|---|---|
| `survive-tier` | 赛季内未降级（`runtime.lastTierChange` 非本季 relegation）→ 达成 |
| `reach-a-main` | 本季 `tierParticipations['a'] - baseline ≥ 1` |
| `reach-s-event` | 本季 `s-open/s-closed/s-class` 参赛增量 ≥ 1 |
| `major-qualification` | 本季获得 major 资格票 / 参加 major 预选（`qualificationSlots` / 参赛增量） |
| `major-playoffs` | 本季 major 深轮（`tierChampionships['major']` 增量 或 `recentResults` 中 major `deep-run`） |
| `develop-rookie` | 队内某 youth `WorldPlayer`（Phase 3）reputation 提升 / 被提拔；首版可近似为 `rosterStability` 稳定 + 存在 prospect |
| `rebuild-core` | Phase 8 重建完成标志；Phase 6-7 首版先置 `partial` 占位，待 Phase 8 接入 |

`progress` 取 0..1（如 reach-a-main 已 1 场则 1.0；major-playoffs 按到达轮次比例）。

---

## 5. 赛季中反馈（新增 `backend/src/engine/insights/seasonGoalInsight.ts`）

```ts
export function buildSeasonGoalInsight(session, playerPoints): SeasonGoalInsight | undefined;
```

- 无队 / 无 `runtime.seasonGoal` → `undefined`。
- 读权威 runtime 目标，调 `evaluateGoalProgress` 得 progress。
- `weeksLeftInSeason = 48 - (player.week ?? 1)`。
- 关键节点（设计 6.2）才给非空 `headline`/抬高 tone：
  - 目标相关赛事报名前（`pendingMatch` 指向目标层级赛事）。
  - 目标相关赛事失败后（`recentResults` 最近一条 early-exit）。
  - VRS 跨过/跌破 `minVrsScore`。
  - 赛季剩余 ≤ 4 周且未达成 → `warning`。
  - `managementPatience` 低（< 30）→ `critical`。
- 在 `buildCareerInsight`（`insights/index.ts:52`）里 `seasonGoal: buildSeasonGoalInsight(session, playerPoints)`，加入返回对象。

---

## 6. 赛季末评估（`seasonGoal.ts` + 接入 `worldClubs.ts:843`）

```ts
export function settleSeasonGoal(
  session, runtime, goal,
): { status: ClubSeasonGoalStatus; effects: GoalSettlementEffects; patienceDelta: number; rebuildPressureDelta: number };
```

### 6.1 结果分档（设计 7.1）

由 `evaluateGoalProgress` + 超额判据：

- 超出目标（如要求 reach-s 却 major 深轮）→ `exceeded`
- 达成 → `completed`
- 部分（接近但未达，progress ≥ 0.5）→ `partial`
- 否则 → `failed`

### 6.2 结果影响（设计 7.2，按 archetype 容忍度缩放）

容忍度表（设计 7.2）：`capital-project` 最低、`legacy-giant` 低、`fallen-legacy` 中低、`regional-pride` 中、`development-factory`/`scrappy-underdog` 高。

| status | 玩家影响 | patienceDelta | rebuildPressureDelta |
|---|---|---|---|
| `exceeded` | fame↑↑、`teamTrust`↑、薪资↑、核心地位稳固 | + | 大幅 − |
| `completed` | 稳定续约、trust↑ | + | − |
| `partial` | 轻微压力、下季目标微调 | 小 − | 小 + |
| `failed` | 重建压力上升 | 大 −（×容忍度） | 大 +（×容忍度，低容忍队更猛） |

- fame / teamTrust / 薪资改 `player` 与 `player.team`。
- `managementPatience` / `rebuildPressure` 改 `runtime`（权威），并同步 `player.team` 快照。

### 6.3 接入 rollover

在 `rolloverWorldClubSeason`（`worldClubs.ts:843`）内，对玩家当前队 runtime：
1. `settleSeasonGoal` → 应用 effects、patience/rebuildPressure。
2. 产出"赛季总结"事件/动态（入 history 或社媒），不静默改值（呼应主文档第 9 节）。
3. `generateSeasonGoal(session, clubId, newSeason)` 生成下赛季目标（含新 baseline）。
4. `rebuildPressure` 跨过阈值（设计 8.2：≥60 观察、≥80 进入重建）→ 置 `pendingStoryFlags` 供 Phase 8 重建事件链消费。

> 注意：评估发生在 rollover，此时 `player.year` 已是新赛季。`goal.season` / `baseline.startYear` 用于确认评估的是刚结束的那个赛季，避免错评。

---

## 7. UI / 接口（设计 13.4 / 13.5）

- 签约面试面板（设计 13.4）：展示俱乐部身份、本赛季目标、失败风险、玩家角色。数据取生成的 `seasonGoal` + archetype 容忍度。
- 赛季目标面板（设计 13.5）：当前目标、完成进度、剩余周、`managementPatience`、`rebuildPressure`。直接渲染 `CareerInsight.seasonGoal`。

---

## 8. 迁移与确定性

- 旧存档无 `runtime.seasonGoal` / `managementPatience` / `rebuildPressure`：可选字段。玩家当前队若缺目标，可在下一次进入或 rollover 时惰性 `generateSeasonGoal`（baseline 取当时值，相当于"本赛季中途立目标"，可接受）。
- 生成与难度抽样用 `makeRng(hashString(\`${session.id}:season-goal:${clubId}:${season}\`))`，确定性。

---

## 9. 测试

- `seasonGoal.test.ts`：
  - 生成：不同 archetype 给不同目标类型；难度随 tier/VRS/fame 变化；baseline 正确快照。
  - 追踪：`reach-a-main` 在本季打 A 级后 progress=1；累计值不被往季污染（baseline 增量正确）。
  - 评估分档：达成→completed、超额→exceeded、近似→partial、未达→failed。
  - 影响：failed 在 `capital-project` 的 rebuildPressureDelta 明显大于 `development-factory`（容忍度差异）。
  - rollover：评估后生成下赛季目标、baseline 重置、rebuildPressure 跨阈值置 flag。
- `careerInsight.test.ts`：`seasonGoal` insight 在关键节点给出 warning/critical，平时 neutral。
- 集成：签约 `joinTeamFromOffer` 后 `player.team.seasonGoal` 有值且与 runtime 一致；换队后旧目标不带走（主文档 11.3 生命周期）。

---

## 10. 实施步骤（PR 切分）

1. **类型 + 生成/追踪/评估纯函数**：types.ts（第 2 节）、`seasonGoal.ts` 的 `generateSeasonGoal` / `evaluateGoalProgress` / `settleSeasonGoal`（3/4/6.1-6.2）。纯离线可单测，不接线。
2. **签约生成**：`joinTeamFromOffer`（`club.ts:274`）写 runtime + 快照（3.4）。
3. **赛季末评估接入**：`rolloverWorldClubSeason`（`worldClubs.ts:843`）调评估、应用影响、生成下季目标、置重建 flag（6.3）。
4. **赛季中反馈**：`seasonGoalInsight.ts` + 挂 `buildCareerInsight`（5）。
5. **UI**：签约面板 + 赛季目标面板（7）。
6. **测试与平衡**（9），调难度表与容忍度表。

第 1 步纯函数零接线；第 2-3 步打通生成与结算；第 4-5 步透出反馈；第 6 步收口。`develop-rookie` 的精确判定依赖 Phase 3 选手成长、`rebuild-core` 依赖 Phase 8，二者首版按 4 节的近似/占位处理，待对应 Phase 落地后替换。
