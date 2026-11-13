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

## 8. 世界新闻集成与背景赛事真实化

> 目的：让 `worldNews.ts` 的新闻**按真实赛程进度报道**，而非现状的"日期窗口模板 + 假比分"。

### 8.1 现状根因（已核对 c362cdf）

- **背景赛事结果是"一次性强度排序"**：`tickWorldClubRuntimes`（`worldClubs.ts:675-784`）给每队算 `strength = power + vrs/25 + form/25 + rng*4`，排序后第一名即冠军、第二名即亚军，无逐轮对阵 → 高 VRS 恒赢、扁平可预测。
- **比分是假的**：`finalScore = hashString % 2 ? '3-1' : '3-2'`，与强弱无关。
- **开赛/阶段新闻是模板**：`buildTournamentOpeningNews` 的 focus 队是按 VRS 取的 top-N（非真名单）；`buildTournamentStageNews` 的阶段用周偏移 `currentOffset-1` 猜（非真实当前轮）。
- 无 MVP/选手（无 `WorldPlayer`）、无转会新闻。

### 8.2 两类赛事、两套真实化路径

- **玩家参加的赛事**：已有 `activeTournamentInstance`（本方案主体）。新闻直接读实例的真实 `stages[].matches[]`（真名单、真比分、真 standout、真 awards），**按实例 round 推进驱动**新闻，而非日期窗口。
- **背景赛事（玩家未参加）**：**复用本方案的抽象 bracket**取代现状"排序+假分"。即把 `worldClubs.ts:675-784` 的快照生成改为：用 `eligibleClubIdsForTournament` 选场 → `createTournamentInstance`（轻量、不持久化全量）→ `fastForwardInstanceToCompletion`（`simulateAbstractMatch` 逐轮）→ 产出真实 `WorldTournamentSnapshot`（真冠军路径、**真比分**、真 standout/MVP）。

### 8.3 背景赛事快照升级（改 `worldClubs.ts:675-784`）

```ts
// 改前：strength 排序选冠军 + hash 假比分
// 改后：
const instance = createTournamentInstance(nextSession, tournament, season, { lightweight: true });
const completed = fastForwardInstanceToCompletion(instance, rng);   // 复用 §4
const awards = computeAwards(completed);                            // 复用 §6
const snapshot: WorldTournamentSnapshot = {
  ...,
  championClubId: awards.championClubId,
  runnerUpClubId: awards.runnerUpClubId,
  finalScore: finalMatchScore(completed),        // 真比分，取自决赛 match.score
  darkHorseClubId: darkHorseFrom(completed),     // 真黑马（低种子打进深轮）
  mvpPlayerId: awards.winnerMvp.playerId,        // Phase 3：真 MVP
  participants: completed.teams.map(...),         // 真名次 finalPlacement
};
```

- `lightweight: true`：背景实例只算到 awards/snapshot，**不写入 `activeTournamentInstance`、不持久化完整 bracket**，只落 `WorldTournamentSnapshot`（保持存档体积，符合 §1.4）。
- 参赛队的 `seasonPoints` / `recentResults` / form 回写沿用现状逻辑，但 `result`（win/deep-run/early-exit）改为取自**真实 `finalPlacement`**，而非 seed 近似。

### 8.4 新闻改为进度驱动（改 `worldNews.ts`）

- **结果新闻**（`buildTournamentResultNews`）：已读 `tournamentSnapshots`，升级后自动拿到真比分、真黑马、真 MVP（加 `report.mvp` 字段）。
- **开赛新闻**（`buildTournamentOpeningNews`）：focus 队改为读 snapshot/instance 的**真实参赛名单种子**，而非 top-VRS 猜测。
- **阶段新闻**（`buildTournamentStageNews`）：玩家赛事用 `activeTournamentInstance` 的真实当前 round；背景赛事因一次性快进无逐轮过程，阶段新闻退化为"开赛 + 结果"两点（或在 snapshot 里保留每轮 winner 摘要供阶段播报，按需）。
- **选手/MVP 新闻**：Phase 3 落地后，结果新闻可点名 MVP；开赛新闻可提及明星选手。
- **转会新闻**：Phase 5 的 `buildWorldTransferNews` 并入同一 `weeklyNews` 流（见 phase5 文档 §8）。

### 8.5 依赖与顺序

- 背景赛事真实化**依赖本方案的 `createTournamentInstance` / `simulateAbstractMatch` / `fastForwardInstanceToCompletion` / `computeAwards`**（§3/4/6）已实现——所以它是 Phase 4 的**自然延伸**，不是独立系统。
- 真 MVP/选手新闻依赖 **Phase 3**（`WorldPlayer`）；无 Phase 3 时先出真比分/真名次/真黑马，MVP 字段留空。
- 转会新闻依赖 **Phase 5**。

### 8.6 单一真相源与落幕时机（修正"赛事提前落幕"）

**问题**：同一赛事现有两条互不知情的轨道——(a) 玩家逐周打（`pendingMatch` 逐阶段，受 signup+2/备赛周拖慢，真实跨多周）；(b) 背景快照在赛事**名义结果周** `tournamentResultDate`（定义里写死）就生成冠军，`buildWorldTournamentNews` 在该周发"落幕"。两者不同步：玩家还在半决赛，名义结果周已到 → 新闻误报"该赛事落幕"。背景路径只把玩家**俱乐部**排除出名单（`clubId !== playerClubId`），并不知道"这个赛事玩家正在打、不该由我宣布结束"。

**修正原则——一个赛事在世界侧只能有一个真相源：**

- **玩家参加的赛事**：世界结果与落幕新闻**只由 `activeTournamentInstance` 驱动**，仅在实例 `status: 'completed'` 时发布（玩家被淘汰 → `fastForwardInstanceToCompletion` 快进其余队决出冠军 → 发布；玩家夺冠 → 发布）。落幕时间 = 玩家真实走完之时。
- **背景快照路径必须跳过该赛事**：`worldClubs.ts:675-784` 生成快照前，跳过"存在 `activeTournamentInstance` 且 `tournamentId` 匹配"的赛事；`buildWorldTournamentNews` 的结果新闻改由"实例完成"触发，而非 `sameDate(current, tournamentResultDate)`。杜绝同一赛事被双重结算。
- **逐轮报道**：玩家每轮结算时同步模拟同轮其余对阵（§5.3），世界新闻按真实轮次播报（打半决赛就报半决赛），"落幕"只在真正决出冠军时触发。

**背景赛事（玩家完全未参加）的时机真实性：**

- 在赛事**真实结果周**（不早于其赛程跨度 `bracket.length`）才结算，冠军取自 §8.3 的真实抽象 bracket。
- 逐轮阶段新闻如需，需把抽象模拟分散到赛程跨度的多周（每周推进一轮发阶段新闻）；首版可只报"开赛 + 结果"两点，但**结果周必须真实、不可提前**。

> 实现要点：背景快照与结果新闻都要能查询"该 tournamentId 是否有进行中的玩家实例"。建议在 `session` 上以 `activeTournamentInstance.tournamentId` 为准做跳过判断；玩家实例 `completed` 时再把其最终结果写入 `tournamentSnapshots`（统一供新闻读取），保证"玩家赛事"与"背景赛事"最终都经同一 snapshot 出口、但只有一个来源。

### 8.7 背景赛事保真度分级（Tier 1 / Tier 3）与成本控制

背景赛事的抽象有两档保真度，**按赛事重要性与是否被玩家看见分级触发**，不一刀切。

| 档 | 做法 | 单场胜负 | 选手数据 | 成本 |
|---|---|---|---|---|
| **Tier 1（默认/兜底）** | §8.3 的概率 bracket 快进 | logistic 胜率 + 逐图掷骰出真比分 | 加权抽 1-2 standout | 低（一届 ~N 场数值运算） |
| **Tier 3（高保真，按需）** | 全引擎逐图模拟 | 复用 `matchSimulator` 跑队 vs 队，出真实图分 | **每名 `WorldPlayer` 每图产 rating/击杀/死亡/ADR**，全员 `TournamentPlayerPerformance` | 高（见下） |

#### 8.7.1 Tier 3 算法

1. **单图全引擎**：新增 `simulateClubMap(rosterA, rosterB, context, rng)`，把 `matchSimulator.ts` 的玩家中心派生（`aimBase`/`decisionBase`/`stability`，`matchSimulator.ts:174-193`）改造成"队 vs 队"——两队战力由各自 5 名 `WorldPlayer` 的 Phase 3 年龄修正后属性聚合，产**真实图分**（回合差）+ 每名选手一条 stat 行（rating/kills/deaths/impact 由 `stats+form+role+对位+方差` 生成）。
2. **系列赛多图**：bo3/bo5 逐图跑，图间带**动量**（赢图 +、输图 −）与**疲劳**（每图累加，高龄按 Phase 3 衰减更快）。
3. **整届 bracket**：每对阵跑系列赛，全员 stat 行累加成 `TournamentPlayerPerformance`（设计 11.5）。
4. **奖项/叙事全用真值**：MVP = 累计 rating 最高（统计真值，非抽取）；最佳新秀/突破手按真实数据；黑马/upset 从真实战果检测；决胜图高光进新闻文案。
5. **跨赛事连续性**：赛后 form/疲劳/声望/转会身价（喂 Phase 5）/年龄经验更新，带入下一站。

#### 8.7.2 成本与压制（关键）

诚实成本：一届 Major 32 队单淘汰 ≈ 31 系列 × ~2.5 图 × 10 人 ≈ 近 800 次选手级运算；整赛季几十站 → 每次赛季结算上万次。必须有选择地用：

1. **分级触发**：只有 **S / Major（及有 storyline / 玩家关注）** 默认 Tier 3；C/B/A 用 Tier 1。
2. **懒计算/按需**：背景赛事默认只存 Tier 1 结果；**仅当玩家打开该赛事详情、或它是本周焦点赛事**时，才即时升级跑 Tier 3 出完整数据（`snapshot.fidelity: 'tier1' | 'tier3'` 标记，已升级则缓存复用）。玩家看不到的不算。
3. **采样选手**：Tier 3 时只对**晋级深轮的队**产全员 stat 行，早出局的队聚合近似——不影响奖项候选。
4. **分摊多周**：配合 8.6 背景逐轮时机，每周只跑一轮而非结算周一次性跑完。

#### 8.7.3 触发规则（推荐默认）

- 默认：所有背景赛事走 **Tier 1**（结果周出真冠军/真比分/真名次）。
- 升级到 **Tier 3** 的条件（任一）：tier ∈ {s-class, major}；或玩家在赛事中心打开该赛事详情（懒触发）；或该赛事被标为本周焦点 / 含活跃 storyline。
- 玩家**亲自参加**的赛事不走这里——由 `activeTournamentInstance` 驱动（§8.6），其玩家本人比赛本就是真实系列赛，其余队按需 Tier 1/3。

#### 8.7.4 类型/落点增量

- `WorldTournamentSnapshot` 加 `fidelity: 'tier1' | 'tier3'`、可选 `playerPerformances?: TournamentPlayerPerformance[]`（Tier 3 时填、采样后的）。
- 新增 `simulateClubMap`（`tournamentInstance.ts` 或 `matchSimulator.ts` 抽出共享核）。
- Tier 3 依赖 **Phase 3**（`WorldPlayer` 属性/年龄）；无 Phase 3 时 Tier 3 不可用，全部回落 Tier 1。

---

## 9. 确定性、迁移、存储

- 所有随机走 `makeRng(hashString(...))`，种子含 `session.id:tournamentId:season`，保证跨读一致与回放稳定。
- 旧存档无 `activeTournamentInstance` 字段：可选字段，缺省 `null`，进行中的旧 `pendingMatch` 无实例则走回退随机对手（向后兼容，无需迁移）。
- 存储上限按 1.4：非玩家对阵只存摘要、表现只存奖项候选、history 只存名次/奖项摘要并滚动截断。

---

## 10. 测试

- `tournamentInstance.test.ts`：
  - 字段规模/来源按 tier 正确（C=8…Major=32）；玩家必入；种子按 VRS（S/Major）。
  - 确定性：同 seed 同参赛场与同模拟结果。
  - 抽象模拟：高 power 队胜率显著更高；比分符合 seriesType。
  - 快进：玩家小组出局后实例仍能决出冠军并产出 awards。
- 集成：`assignPendingMatchOpponent` 在有实例时返回实例对手、无实例时回退随机（回归现有 `tournamentSeries.test.ts` / opponent 测试）。
- 回写：参赛 club 按名次拿到 seasonPoints/recentResults。
- 奖项：冠亚军、winner/loser MVP、玩家名次正确；玩家夺冠时 MVP 可为玩家。
- **世界新闻（§8）**：背景赛事快照的 `finalScore` 为真实决赛比分（非 hash）、`championClubId` 来自快进 bracket、`participants.finalPlacement` 真实；`buildTournamentResultNews` 读到真比分/真黑马；有 Phase 3 时 MVP 非空。轻量背景实例不写入 `activeTournamentInstance`、不持久化完整 bracket。
- **单一真相源（§8.6）**：玩家正在打某 S 级赛事且处于半决赛时，世界新闻**不得**出现该赛事"落幕"；只有玩家实例 `completed`（淘汰快进或夺冠）后才发布该赛事落幕新闻；背景快照路径跳过该 tournamentId，不重复结算。
- **保真度分级（§8.7，若实现 Tier 3）**：默认 Tier 1；S/Major 或玩家打开详情时升级 Tier 3 并缓存（`snapshot.fidelity`）；Tier 3 产全员/采样 `TournamentPlayerPerformance`、MVP 取累计 rating 真值；无 Phase 3 时回落 Tier 1。

---

## 11. 实施步骤（PR 切分）

1. **类型 + 实例生成**：types.ts（第 2 节）、`tournamentInstance.ts` 的 `createTournamentInstance` + 字段/种子（3.x），抽出 `eligibleClubIdsForTournament` 共享函数。纯新增，不改现有行为。
2. **抽象模拟 + 快进 + 奖项**：`simulateAbstractMatch` / `advanceInstanceRound` / `fastForwardInstanceToCompletion` / `computeAwards`（4、6）。可纯单测，不接线。
3. **接线对手来源**：signup 建实例（5.1）、`assignPendingMatchOpponent` 切换（5.2）。此步起玩家对手来自实例。
4. **接线轮次推进**：`choice.ts` 结算后推进/收尾实例（5.3）、世界回写（5.4）。
5. **背景赛事真实化 + 新闻进度驱动 + 单一真相源**：用 `lightweight` 背景实例替换 `worldClubs.ts:675-784` 的强度排序快照（8.3）；`worldNews.ts` 改为读真实 snapshot/instance（8.4）；**背景快照与结果新闻跳过玩家正在打的赛事，该赛事落幕由 `activeTournamentInstance` 完成时触发（8.6），修正"半决赛却报落幕"**；背景赛事结果不早于真实结果周。
6. **前端赛事中心 + 接口透出**（7），按 tier 分层展示。
7. **测试与平衡**（10），调字段规模/方差/回写权重。

第 1-2 步纯离线可测、零行为变更；第 3-4 步替换对手来源并打通赛场推进；**第 5 步把世界新闻从模板升级为真实赛程报道（背景赛事默认 Tier 1 概率 bracket）**；第 6 步出 UI；第 7 步收口。后续增量（不阻塞首版）：对手情报"解锁分层"（4.6）、Major 小组/瑞士精细化、背景赛事逐轮阶段播报、**§8.7 的 Tier 3 全引擎模拟（S/Major + 按需懒触发，依赖 Phase 3）**。
