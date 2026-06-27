# Phase 5 实现细化方案：世界选手转会模拟

> 文档状态：实现就绪（细化自 `club-identity-season-goal-rebuild-design.md` 的 §10 与 Phase 5）
> 文档日期：2026-06-27
> 适用范围：赛季转会窗口、转会需求/离队意愿评分、转会执行、传闻与新闻、玩家相关转会事件链
> 前置（交汇点，依赖最全）：
> - Phase 1/2 — `clubArchetype` / `clubHeritage` / `clubCapital`（转会倾向）
> - Phase 3 — `WorldPlayer`（转会对象）、`age`（老化触发）、`reputation`
> - Phase 6-7 — `seasonGoal` 失败 / `rebuildPressure`（触发源）
> - Phase 8 — 重建 → 转会（`rebuild-swap` / `star-signing`），玩家相关转会复用其事件链模式
> 机制基线：c362cdf（`WeeklyNewsItem` 新闻系统、`rolloverWorldClubSeason`）

---

## 0. 现状与接入点（已核对代码）

- **赛季窗口**：`rolloverWorldClubSeason`（`worldClubs.ts:920`）每赛季跑一次，遍历所有 runtime 做升降级/剧情/重置。**转会窗口接在它内部、促升降级之后**（这样转会需求能反映新 tier）。
- **转会对象**：Phase 3 后 `ClubRuntimeState.fullRoster: WorldPlayer[]` + `playerIds?`，`WorldPlayer.clubId`。转会即改这些。
- **新闻系统已存在**：`worldNews.ts` 的 `WeeklyNewsItem` + `buildWorldTournamentNews` + `buildWorldNewsSocialPosts`，写入 `session.weeklyNews`。**转会传闻/结果接入同系统**（新增 `buildWorldTransferNews`，`WeeklyNewsSource.kind` 加 `'world-transfer'`）。
- **玩家相关转会浮现**：复用 Phase 8 的 `dynamicTags`（`events.ts:46`）+ 优先注入块模式；玩家被挖角可复用已有 `chain-rival-poach`（`game.ts:510`，已会生成更高档 rival offer → `pendingOffer`）。
- **身份读取**：Phase 1/2 的 `clubIdentity.ts`（`clubArchetype` / `clubHeritage` / `clubCapital`）。
- **池范围**：`worldClubs` 的 `activeClubIds` / `relevantClubIds` / `staticClubIds`（设计 10.8 只处理前两类 + 玩家队 + 高 VRS）。

---

## 1. 关键决策

### 1.1 窗口在 rollover 内、升降级之后跑

`rolloverWorldClubSeason` 末尾（reset seasonPoints 之前/之后均可，但要在 tier 已更新后）调 `runTransferWindow(session, season)`，对**相关队伍集合**计算需求与离队意愿、撮合、执行、产出传闻与新闻。

### 1.2 只处理相关队伍集合（设计 10.8）

集合 = `activeClubIds ∪ relevantClubIds ∪ {玩家当前队}` ∪ 高 VRS top-N（按 `computeClubVrsScore`）。静态远端队不跑完整转会（保持开销可控）。每窗口只产出**少量关键转会 + 传闻**（如 ≤ 总相关队数的 30%，上限 N）。

### 1.3 WorldPlayer 增量持久化

转会只改动**被转会涉及的** `WorldPlayer`（`clubId` / `status`）与两端 runtime 的 `fullRoster`/`playerIds`。其余仍按 Phase 3 的确定性派生。被改写的选手成为"已落库增量",随 runtime 持久化。

### 1.4 玩家相关走事件链，背景走新闻

- **背景转会**（不涉及玩家队）：只产出 `TransferRecord` + `WeeklyNewsItem`（社媒/新闻），不打断玩家。
- **玩家相关转会**（队友被挖、新援加入、玩家被关注）：必须经**事件链铺垫**（设计 10.7 / 14.1），不无预警发生。

### 1.5 缺人时铸造 WorldPlayer（设计 10.8）

撮合时若无现成替补/自由球员，允许 `mintWorldPlayer(clubId, role, kind)` 生成一次性 `prospect`/`free-agent`/新援，**落入 WorldPlayer 库**（确定性派生 + 增量持久化），不留空位。

---

## 2. 类型层（`backend/src/types.ts`）

沿用设计 11.6：

```ts
export type TransferType =
  | 'star-signing' | 'prospect-promotion' | 'veteran-pickup'
  | 'role-fix' | 'benching' | 'poach' | 'rebuild-swap';

export interface TransferRumor {
  id: string; season: number; playerId: string;
  fromClubId: string; toClubId: string; type: TransferType;
  credibility: 'low' | 'medium' | 'high'; reason: string; resolved?: boolean;
}

export interface TransferRecord {
  id: string; season: number; playerId: string;
  fromClubId: string; toClubId: string; type: TransferType; summary: string;
}
```

挂载（`GameSession`）：`transferRumors?: TransferRumor[]`、`transferHistory?: TransferRecord[]`（滚动保留最近 N）。`WeeklyNewsSource.kind` 并入 `'world-transfer'`。

---

## 3. 转会窗口流程（新增 `backend/src/engine/transferWindow.ts`）

```ts
export function runTransferWindow(session: GameSession, season: number): GameSession;
```

1. 取相关队伍集合（1.2）。
2. 每队算**转会需求**（第 4 节）与**可售/可流出选手**。
3. 每名选手算**离队意愿**（第 5 节）。
4. **撮合**（第 6 节）：高需求队 × 高意愿/匹配选手，按 archetype 倾向（设计 10.2）成交少量。
5. **执行**：改 `WorldPlayer.clubId`/`status`、两端 `fullRoster`/`playerIds`；缺人 `mintWorldPlayer`。
6. 产出 `TransferRecord` + 部分 `TransferRumor`（未成交的高可信传闻）+ `WeeklyNewsItem`（第 8 节）。
7. 玩家相关的，置 `pendingStoryFlags` / 玩家快照 tag，交事件链（第 7 节）。
8. 确定性：`makeRng(hashString(\`${session.id}:transfer:${season}\`))`。

---

## 4. 转会需求评分（设计 10.4，读现有数据）

每队需求 = 加权和：

| 来源 | 数据 |
|---|---|
| 缺角色（IGL/AWPer/Entry/Support/Lurker） | 复用 `deriveRosterNeed(runtime)`（`worldClubs.ts`，已产 neededRoles/Identities） |
| 缺核心 | `fullRoster` 无高 `reputation`/star archetype 选手 |
| 阵容老化 | `WorldPlayer.age` 均值偏高（Phase 3） |
| 目标失败/重建 | `runtime.rebuildPressure`（Phase 6-7/8）高 |
| 资本充足 | `clubCapital(club)` 高 → 更追成名选手 |
| 底蕴高 | `clubHeritage(club)` 高 → 偏抗压/经验/荣誉匹配 |
| 青训身份 | `clubArchetype === 'development-factory'` → 偏提拔 prospect |

archetype → 倾向（设计 10.2）决定**用什么类型**满足需求（资本队 `star-signing`、青训 `prospect-promotion`、没落豪门 `veteran-pickup`/复兴核心、缺角色 `role-fix`）。

---

## 5. 离队意愿评分（设计 10.5）

每名 `WorldPlayer`：

| 来源 | 数据 |
|---|---|
| 队伍赛季目标失败 | `runtime.seasonGoal.status === 'failed'` |
| 自己强但队差 | 高 `reputation`/rating × 低 `runtime.currentForm`/seasonPoints |
| 被豪门/资本关注 | 高 reputation 选手 × 存在高 capital/heritage 求购队 |
| 年龄上升求大合同/争冠 | `age` 高（veteran/twilight，Phase 3）|
| 年轻求更高舞台 | `archetype === 'rookie-prospect'` + 强 |
| 角色被挤压 | `status` 非 starter / 角色重叠 |
| 重建不围绕自己 | `runtime.rebuildCorePlayerId` 非本人（Phase 8） |

---

## 6. 撮合与执行（`transferWindow.ts`）

- 把高需求队的"需求类型"与高意愿、角色/声望匹配的选手配对，按 rng + 权重成交少量。
- **执行变更**（设计 10.8 必须全改）：
  - `WorldPlayer.clubId` ← 新队；`status` 调整。
  - 原队 `fullRoster` 移除 / 新队 `fullRoster` 加入；两端 `playerIds` 同步。
  - 缺位 `mintWorldPlayer`（1.5）补满 5 首发。
  - 产 `TransferRecord`（含 `summary` 文案）。
- 转会类型按场景定（`star-signing`/`prospect-promotion`/`veteran-pickup`/`role-fix`/`poach`/`rebuild-swap`/`benching`）。
- 受影响两队 runtime 的 power/form/stability 轻微调整（新援磨合 → stability 略降，补强 → form 略升），复用现有运行态字段，不动核心比赛模型。

---

## 7. 玩家相关转会 → 事件链（设计 10.7，复用 Phase 8 模式）

玩家相关三类，均经事件链/已有机制铺垫：

| 场景 | 落地 |
|---|---|
| 队友被豪门/资本挖走 | 标记 `player.team` 快照 tag（如 `teammate-poach-pending`）→ `dynamicTags` 派生 synthTag → 优先注入 `chain-teammate-poached`（告别 + `player.roster` 移除该 slot，下窗口或即时补位） |
| 引入新援造成位置竞争 | 若与玩家角色重叠 → 复用/衔接 Phase 8 的 `contested`/`rotation-risk` 流程（轻量版竞争事件） |
| 玩家被其他队关注 | 复用已有 `chain-rival-poach`（`game.ts:510`，已生成更高档 offer → `pendingOffer`），按求购队 capital/heritage 决定档位与文案 |
| 表现强 → 围绕玩家买人 | `runtime.rebuildCorePlayerId = 玩家` 时，新援为辅助玩家 → 正向事件 |

`player.roster: Teammate[]` 是 `WorldPlayer` 阵容的互动层镜像（Phase 3 映射）：队友进出转会后，**roster 快照需同步增删并按 id 重映射**（在转会执行后或下次入队/赛季刷新时）。

### 7.1 转会后角色重算与补位（修复缺口 D）

> 问题：现有 `detectRoleOverlap`（`club.ts:307`）只在**入队时**跑一次。赛季中转会改变了玩家所在队阵容（队友被挖、新援加入）后，角色组成变了却不重算——比如队里唯一 IGL 被挖走，玩家本该被推去补位指挥，但系统无感。

修复（转会执行改动玩家队 `player.roster` 后触发）：

- **重算角色重叠/缺口**：转会改动玩家 roster 后，重跑 `detectRoleOverlap(player, roster)` 与 `deriveRosterNeed(runtime)`，刷新玩家的角色重叠状态与队伍角色缺口（不再停留在入队时的快照）。
- **关键角色出缺 → 补位事件**：若转会导致队伍缺关键角色（如 IGL 被挖、无人指挥），注入一次**角色补位/转型建议事件**（复用 `chain-role-transition-start` 链路），让玩家选择是否补位；接受则走现有转型流程（`roleTransition` → `prove-transition`）。
- **新援同角色 → 竞争**：与 §7 第二行一致，新援与玩家 `activeRole` 重叠时，现有 `deriveRolePressure` 的"同角色队友 +25"（`roleTransition.ts:11`）自动升压，并可衔接 Phase 8 的 `contested` 轻量竞争事件。
- **老将被替换判断**：撮合阶段（§6）评估世界队伍是否替换老化选手时，用 Phase 3 §3.4 的 `roleFitScore(ageAdjusted)` 判断该选手当前角色契合是否已下滑——下滑则倾向 `veteran-pickup`/`role-fix` 换人或推其转型，而非无依据替换。

---

## 8. 新闻与社媒透出（接入 `worldNews.ts`）

- 新增 `buildWorldTransferNews(session): WeeklyNewsItem[]`，与 `buildWorldTournamentNews` 并列，把本窗口 `TransferRecord` + 高可信 `TransferRumor` 转为新闻条目（`source.kind = 'world-transfer'`）。
- `buildWorldNewsSocialPosts` 追加转会传闻类社媒贴（明星被关注、青训新人被观察）。
- 赛事中心（Phase 4 §13.2）展示"与赛事相关的转会传闻"即读这些。

---

## 9. 第一版边界（设计 10.8）

- 每赛季一次抽象窗口；只处理 active/relevant/玩家队/高 VRS。
- 每窗口少量关键转会 + 传闻。
- 不做完整转会市场/经济/合同买断/自由市场（仅 `mint` 兜底）。
- 玩家相关必经事件链，不无预警强制后果。
- 更新 `WorldPlayer.clubId` / `ClubRuntimeState.playerIds`+`fullRoster` / `transferHistory` / 新闻 / 对手情报。

---

## 10. 迁移、确定性、存储

- 新字段（`transferRumors`/`transferHistory`、`WorldPlayer` 增量）均可选，旧档缺省空 → 无需迁移；首个赛季 rollover 后自然产生。
- 全程 `makeRng(hashString(...))`，种子含 `session.id:transfer:season`，确定性。
- 存储：`transferHistory`/`transferRumors` 滚动截断（保留最近 N 季）；只持久化被转会改写的 `WorldPlayer`（Phase 3 增量策略）。

---

## 11. 测试

- `transferWindow.test.ts`：
  - 需求：缺 AWPer 的队产生 `role-fix` 需求；高 capital 队偏 `star-signing`；青训队偏 `prospect-promotion`。
  - 意愿：目标失败队的高 reputation 选手离队意愿高；veteran 年龄高意愿高。
  - 执行：转会后 `WorldPlayer.clubId` 改、两端 `fullRoster`/`playerIds` 一致、无空位（必要时 mint）。
  - 确定性：同 seed 同窗口同结果。
  - 边界：每窗口转会数 ≤ 上限；静态远端队不参与。
- 玩家相关：队友被挖 → `chain-teammate-poached` 出现且 `player.roster` 同步移除；玩家被关注 → `pendingOffer` 生成（复用 chain-rival-poach）；无"无预警剥夺"路径。
- 转会后角色重算（§7.1）：队内唯一 IGL 被挖走后，`deriveRosterNeed` 出现 IGL 缺口并注入补位/转型事件；新援与玩家同角色时角色压力升高。
- 新闻：`buildWorldTransferNews` 把 record/rumor 转为 `weeklyNews` 条目。
- 回归：`worldClubs.test.ts` 升降级 + 转会窗口共存不破坏。

---

## 12. 实施步骤（PR 切分）

1. **类型 + 评分纯函数**：types.ts（第 2 节）；`transferWindow.ts` 的需求/意愿评分（4/5），复用 `deriveRosterNeed` 与 `clubIdentity`。纯离线可单测。
2. **撮合 + 执行 + mint**：撮合、`WorldPlayer`/runtime 变更、`mintWorldPlayer`（6、1.5）。仍可单测。
3. **接入 rollover**：`rolloverWorldClubSeason`（`worldClubs.ts:920`）末尾调 `runTransferWindow`（3）。此步起世界阵容会随赛季流动。
4. **新闻透出**：`buildWorldTransferNews` + 社媒贴，挂 `weeklyNews`（8）。
5. **玩家相关事件链**：队友被挖/新援竞争/被关注（7），复用 Phase 8 注入模式与 `chain-rival-poach`；`player.roster` 同步。
6. **测试与平衡**（11），调相关队范围、成交率、意愿/需求权重。

第 1-2 步纯离线；第 3 步打通世界流动；第 4 步出新闻；第 5 步接玩家体验（依赖 Phase 8 的注入模式与 Phase 3 的 roster 映射）；第 6 步收口。`star-signing` 的具体新援、`benching` 的真实顶替依赖 Phase 3 的 WorldPlayer 与 `mint`，首版即可完整跑通。

---

## 13. 整套 club-identity 落地顺序（收尾）

至此 8 个 Phase 全部细化。推荐落地总顺序（依赖驱动）：

**Phase 1-2（身份数据/运行态，地基）→ Phase 3（WorldPlayer + 年龄）→ Phase 4（赛事实例）→ Phase 6-7（赛季目标 + 评估）→ Phase 8（重建链）→ Phase 5（转会，交汇点最后接）。**

Phase 5 放最后，因为它消费前面所有产出（身份倾向、WorldPlayer、年龄、目标失败、重建压力、事件链模式与新闻系统）。
