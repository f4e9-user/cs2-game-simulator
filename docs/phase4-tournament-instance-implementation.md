# Phase 4 实现细化方案：TournamentInstance + 赛事中心

> 文档状态：实现就绪（细化自 `club-identity-season-goal-rebuild-design.md` 的 Phase 4）
> 文档日期：2026-06-27
> 适用范围：赛事实例、参赛场生成、抽签/分组、非玩家抽象模拟、奖项、结果回写、赛事中心 UI
> 前置：Phase 3（`WorldPlayer` 选手库，供关键选手 / MVP / 表现来源）

---

## 0. 现状与目标差距（已核对代码）

现有"赛事"是**玩家中心的阶梯**，不是一个有完整参赛场的赛事：

- 报名时 `game.ts:798` 建 `pendingMatch`，并 `assignPendingMatchOpponent` 选**单个**对手。
- 对手由 `pickOpponentClubId`（`worldClubs.ts:712`）每次从 active/relevant/static 池按 power 加权**随机挑一个**，写进 `pendingMatch.opponent`。
- 玩家**逐阶段、逐周**推进：每个 `bracket` stage 在自己的比赛周结算；赢了 `stageIndex+1`、重排**下周**的新 `pendingMatch` 并**重新随机一个新对手**（`choice.ts:1231-1248`）；输到 `eliminationLosses` 或打完决赛则 `pendingMatch = null`（`choice.ts:1215-1230`）。
- 冠军 = 决赛胜（`isFinal && success`，`choice.ts:1185`）。BO3/BO5 由 `tournamentSeries.ts` 的事件序列承载，**玩家自己那条系列赛可直接复用**。
- 没有：固定参赛名单、种子、分组/瑞士轮、其他队对阵、晋级路线图、跨队 standings、MVP/奖项。

**目标差距**：把"每阶段随机抓一个对手"升级为"报名进入一个**固定参赛场**的赛事实例；玩家在实例里沿自己的路线打（复用现有系列赛），其余队伍每轮**抽象模拟**同步推进，赛后产出名次、MVP、奖项并回写世界。

---

## 1. 核心设计决策

### 1.1 实例与现有逐周推进如何共存（最关键）

保留"玩家逐阶段、逐周打"的现有节奏，`TournamentInstance` 作为**这条路线之上的赛场状态**：

- 报名/预报名时创建实例（`status: 'registered'`），固定参赛场。
- 报名窗口结束（= 玩家首场比赛周到来）→ `locked` → 抽签 `drawn`。
- 玩家每打完**一个 stage/轮**：在结算同一时刻，对该轮其余非玩家对阵做**抽象模拟**，推进实例到下一轮（`in-progress`）。
- 玩家被淘汰或夺冠后：把实例**剩余轮次一次性快进模拟**到 `completed`，结算名次与奖项。
- 这样实例与玩家逐周路线同频推进，不需要把整届赛事压进一周，也不需要重写玩家系列赛。

### 1.2 对手来源切换（集成缝）

`assignPendingMatchOpponent`（`worldClubs.ts:741`）改为：**若当前 `pendingMatch` 关联了 `TournamentInstance`，对手取实例中玩家当前轮次的对阵对手**（实例已抽签决定），否则回退到现有 `pickOpponentClubId` 随机逻辑。这是唯一需要改的对手注入点。

### 1.3 玩家路线 = 实例中玩家队的对阵序列

玩家的 `bracket: TournamentStage[]`（`tournaments.ts`）仍是玩家个人晋级路径，但每个 stage 的对手由实例对阵给出。实例为玩家队维护一个 `playerPath`（每轮对手 clubId），与 `pendingMatch.stageIndex` 对齐。

### 1.4 存储规模上限

一届 Major 32 队 + 完整对阵 + 每场 standout 可能很大。约束：

- 玩家相关对阵（playerPath 上的）存完整（比分、standout、表现）。
- 其余对阵只存**结果摘要**（winner、score、最多 2 个 standoutPlayerIds），不存逐选手表现。
- 选手表现 `TournamentPlayerPerformance` 只对**进入奖项候选**的选手生成与持久化，其余即时算完即弃。
- 同一 session 同时最多一个活跃实例（与"只允许一个 pendingMatch"一致）。

---

## 2. 类型层（`backend/src/types.ts`）

沿用设计 11.8 的结构，补充与现状对齐的字段：

```ts
export type TournamentInstanceStatus =
  | 'registered' | 'locked' | 'drawn' | 'in-progress' | 'completed';

export interface TournamentTeamEntry {
  clubId: string;
  seed: number;
  source: 'player' | 'vrs' | 'qualifier' | 'invite' | 'wildcard' | 'local' | 'regional';
  groupId?: string;
  eliminated?: boolean;
  finalPlacement?: number;
}

export interface TournamentInstanceMatch {
  id: string;
  roundId: string;                 // 所属 stage/round
  teamAClubId: string;
  teamBClubId: string;
  seriesType: 'bo1' | 'bo3' | 'bo5';
  playerMatch?: boolean;
  completed: boolean;
  winnerClubId?: string;
  score?: string;                  // 如 "2-1"
  standoutPlayerIds?: string[];    // 至多 2 个
}

export interface TournamentInstanceStage {
  id: string;
  name: string;
  type: 'group' | 'swiss' | 'play-in' | 'quarterfinal' | 'semifinal' | 'final';
  seriesType?: 'bo1' | 'bo3' | 'bo5';
  matches: TournamentInstanceMatch[];
}

export interface TournamentInstance {
  id: string;                      // `${tournamentId}:${season}`
  tournamentId: string;
  season: number;
  status: TournamentInstanceStatus;
  teams: TournamentTeamEntry[];
  stages: TournamentInstanceStage[];
  playerTeamClubId?: string;
  playerPath?: { stageIndex: number; opponentClubId: string }[];  // 与 pendingMatch.stageIndex 对齐
  awards?: TournamentAwards;
}
```

`TournamentAwards` / `TournamentPlayerAward` / `TournamentPlayerPerformance` 同设计 11.5/11.8。

挂载点（`GameSession`）：

```ts
activeTournamentInstance?: TournamentInstance | null;   // 与 pendingMatch 同生命周期
tournamentHistory?: TournamentInstanceSummary[];          // 仅存名次+奖项摘要，滚动保留最近 N 届
```

`pendingMatch` 增加可选 `tournamentInstanceId?: string` 关联实例。

---

## 3. 参赛场生成（新增 `backend/src/engine/tournamentInstance.ts`）

### 3.1 字段强度与来源（设计 4.2）

```ts
function fieldSpecFor(tier, progressionTier): { size: number; sources: SourceMix };
```

| 层级 | size | 来源池（复用 pickOpponentClubId 的候选池过滤） |
|---|---|---|
| C | 8 | 本地 / youth / 草根（低 tier、区域） |
| B | 8-12 | youth / semi-pro / 区域 |
| A | 16 | semi-pro 强队 + pro（worldClubs） |
| S | 16 | **VRS 排名池 top-N**（按 `computeClubVrsScore` 排序） |
| Major | 32 | VRS 池 + 分阶段进入（高 VRS 后续阶段进） |

### 3.2 选队与种子

- 候选池：复用 `pickOpponentClubId`（`worldClubs.ts:712`）的池构造与 tier 过滤逻辑（抽出成共享函数 `eligibleClubIdsForTournament`），但**取 N 个而非 1 个**。
- 玩家队必入（`source: 'player'`）。
- 种子：S/Major 按 `computeClubVrsScore` 降序定种子；C/B/A 按 `calculateClubPower` + 抽签随机。
- 确定性：`makeRng(hashString(\`${session.id}:instance:${tournamentId}:${season}\`))`。
- 每个被选入的 club 必须有 runtime（`activateClubRuntime`）以便取 `WorldPlayer` 首发。

### 3.3 阶段结构

- 由 `tournament.bracket: TournamentStage[]` 推导阶段数与各阶段 `seriesType`（复用现有定义，如 `FOUR_STAGE` / `SIX_STAGE`）。
- 玩家路线长度 = bracket 长度；实例为全场生成对应轮次（小组/瑞士/淘汰），玩家被放入其中一条路径，`playerPath` 记录每轮对手。
- 首版可简化：A 级及以下用**单淘汰**填充其余对阵；S/Major 的小组/瑞士首版也可用单淘汰近似，UI 按设计 4.7 分层展示深度（C/B 浅、A/S 全、Major 加 Stage 1-3 + Champions）。逐步增强。

---

## 4. 抽象非玩家模拟（`tournamentInstance.ts`）

```ts
function simulateAbstractMatch(a: WorldPlayer[]|runtime, b: ..., rng): {
  winnerClubId; score; standoutPlayerIds;
}
```

- 胜者：`powerA vs powerB`（用 `calculateClubPower(runtime)`，并对各队首发施加 Phase 3 年龄派生）+ 方差（rng）。
- 比分：按 seriesType 生成合理 BO 比分（如 bo3 → 2-0/2-1）。
- standout：从胜队（必要时含败队）`WorldPlayer` 按 `stats + form + reputation` 加权挑 1-2 个，记 `standoutPlayerIds`。
- 奖项候选选手生成 `TournamentPlayerPerformance`（rating/kills/... 由 stats+结果合成），仅冠亚军及深轮队保留。

**推进时机**：

- 玩家每轮结算后（见 5），对**同一轮**其余对阵 `simulateAbstractMatch`，标记 `completed`，产出下一轮对阵。
- 玩家出局/夺冠后，循环快进剩余所有轮次到决出冠军。

---

## 5. 集成点（改现有逻辑）

### 5.1 报名创建实例（`game.ts` signup，`:798` 一带）

建 `pendingMatch` 后：
```ts
const instance = createTournamentInstance(session, t, season);  // status: 'registered' → 抽签后 'drawn'
session.activeTournamentInstance = instance;
pendingMatch.tournamentInstanceId = instance.id;
```
与预报名方案对齐：若是预报名（`resolveWeek` 在未来），实例 `registered` 创建，但 `locked`/`drawn` 延到首场比赛周（或创建即抽签，首版可创建即 `drawn`，简单优先）。

### 5.2 对手注入（`worldClubs.ts:741` `assignPendingMatchOpponent`）

```ts
if (pendingMatch.tournamentInstanceId) {
  const opp = instanceOpponentFor(session.activeTournamentInstance, pendingMatch.stageIndex);
  if (opp) return buildOpponentFromClub(session, pendingMatch, opp);   // 取代随机
}
// 回退：现有 pickOpponentClubId 逻辑
```

### 5.3 玩家轮次结算后推进实例（`choice.ts:1215-1249`）

在现有 stage 结算分支里追加：
```ts
// 记录玩家本轮对阵结果到实例
recordPlayerMatchInInstance(instance, idx, outcome.success, result.matchStats);
// 模拟同轮其余对阵 → 生成下一轮
advanceInstanceRound(instance, idx, rng);
if (eliminated || isFinal) {
  fastForwardInstanceToCompletion(instance, rng);   // 快进剩余轮
  instance.awards = computeAwards(instance);
  session.tournamentHistory = pushSummary(session.tournamentHistory, instance);
  session.activeTournamentInstance = null;           // 与 pendingMatch=null 同步
}
```
注意 `choice.ts:1230` 已 `pendingMatch = null`；实例收尾与之同处。

### 5.4 结果回写世界（`worldClubs.ts` 结算）

- 现有 `seasonPoints` / `recentResults` 累积逻辑扩展：依据实例 `finalPlacement` 给各参赛 club 加分（冠军 > 亚军 > 四强 > 小组出局）。
- 至少对 active/relevant/玩家相关 club 写 `recentResults`（win/deep-run/early-exit）。
- VRS 经现有 `withVrsScore` / 赛季 rollover 自然反映。

---

## 6. 奖项（`tournamentInstance.ts`）

`computeAwards(instance)`（设计 4.8 第一版集合）：

- champion / runnerUp：决赛 winner / loser 的 clubId。
- winnerMvp / loserMvp：冠/亚军队 `TournamentPlayerPerformance` 最高 rating（玩家若在冠亚军队且 rating 最高，MVP 可给玩家）。
- bestPlayers：全场 rating top-N（取已生成表现的候选）。
- 玩家最终名次：`instance.teams.find(player).finalPlacement`。

---

## 7. 前端 / 接口（设计 4.5 / 13.2）

- session 响应带 `activeTournamentInstance`（含 teams/stages/playerPath/awards）。
- 赛事中心视图：参赛队伍、抽签/分组、路线图、玩家高亮、下一场对手情报（对手情报的"公开 vs 需解锁"分层是设计 4.6，可独立小迭代，首版先出公开信息）。
- 展示深度随 tier 分层（4.7）：C/B 简化、A/S 完整、Major 加阶段。

---

## 8. 确定性、迁移、存储

- 所有随机走 `makeRng(hashString(...))`，种子含 `session.id:tournamentId:season`，保证跨读一致与回放稳定。
- 旧存档无 `activeTournamentInstance` 字段：可选字段，缺省 `null`，进行中的旧 `pendingMatch` 无实例则走回退随机对手（向后兼容，无需迁移）。
- 存储上限按 1.4：非玩家对阵只存摘要、表现只存奖项候选、history 只存名次/奖项摘要并滚动截断。

---

## 9. 测试

- `tournamentInstance.test.ts`：
  - 字段规模/来源按 tier 正确（C=8…Major=32）；玩家必入；种子按 VRS（S/Major）。
  - 确定性：同 seed 同参赛场与同模拟结果。
  - 抽象模拟：高 power 队胜率显著更高；比分符合 seriesType。
  - 快进：玩家小组出局后实例仍能决出冠军并产出 awards。
- 集成：`assignPendingMatchOpponent` 在有实例时返回实例对手、无实例时回退随机（回归现有 `tournamentSeries.test.ts` / opponent 测试）。
- 回写：参赛 club 按名次拿到 seasonPoints/recentResults。
- 奖项：冠亚军、winner/loser MVP、玩家名次正确；玩家夺冠时 MVP 可为玩家。

---

## 10. 实施步骤（PR 切分）

1. **类型 + 实例生成**：types.ts（第 2 节）、`tournamentInstance.ts` 的 `createTournamentInstance` + 字段/种子（3.x），抽出 `eligibleClubIdsForTournament` 共享函数。纯新增，不改现有行为。
2. **抽象模拟 + 快进 + 奖项**：`simulateAbstractMatch` / `advanceInstanceRound` / `fastForwardInstanceToCompletion` / `computeAwards`（4、6）。可纯单测，不接线。
3. **接线对手来源**：signup 建实例（5.1）、`assignPendingMatchOpponent` 切换（5.2）。此步起玩家对手来自实例。
4. **接线轮次推进**：`choice.ts` 结算后推进/收尾实例（5.3）、世界回写（5.4）。
5. **前端赛事中心 + 接口透出**（7），按 tier 分层展示。
6. **测试与平衡**（9），调字段规模/方差/回写权重。

第 1-2 步纯离线可测、零行为变更；第 3-4 步替换对手来源并打通赛场推进；第 5 步出 UI；第 6 步收口。对手情报"解锁分层"（4.6）与 Major 小组/瑞士精细化可作为后续增量，不阻塞首版。
