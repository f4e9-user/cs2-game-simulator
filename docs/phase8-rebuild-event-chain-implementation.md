# Phase 8 实现细化方案：管理层重建事件链（基于 RoundPlan 新机制）

> 文档状态：实现就绪（细化自 `club-identity-season-goal-rebuild-design.md` 的 Phase 8 + §9 资本队风险链）
> 文档日期：2026-06-27
> 适用范围：重建触发、跨回合重建事件链、玩家核心地位结局、资本队渐进风险
> 前置：Phase 6-7（提供 `rebuildPressure` 与 `player.team` 快照，是触发源）；Phase 1（`clubArchetype` 决定强度与容忍度）
> 机制基线：**c362cdf 的 RoundPlan 多事件编排**（`roundPlan.ts` / `EventDef.severity` / `choice.ts` 多事件流转）。实现分支须基于/合并 c362cdf，否则对不上。

---

## 0. 新机制接入点（已核对 c362cdf）

- **事件按回合编排**：每回合一个 anchor → `composeRoundPlan` 定 archetype/theme/tone/targetCount(1-3) → `continueWithRoundPlan` 按 `roundPlanFit` 续挑同主题事件（`roundPlan.ts`）。
- **强制注入仍在**：`pickEvent`（`events.ts:424`）里有一串按 synthTag 的优先注入块（`interview-ready`、`team-*-conflict-risk`、`role-transition-eligible`…），命中即直接返回该事件作 anchor。**重建链照此加一个块**。
- **synthTag 来源**：`dynamicTags(player)`（`events.ts:46`）只吃 `player`，从玩家状态派生 tag。**重建触发 tag 在此派生**——数据源是 Phase 6-7 写在 `player.team` 上的 `rebuildPressure` / `coreStatus` 快照（`dynamicTags` 拿得到 `player.team`，拿不到 runtime，这正是用快照的原因）。
- **事件重要度**：`eventImportance`（`choice.ts:190`）—— 有 `severity` 用 `severity`；否则 `chain` 类型默认 `important`，`chain-team-conflict` 为 `critical`。`news`/`background` 会被 round-plan 续挑跳过。
- **单事件锚定**：`isMajorSingleAnchor`（`roundPlan.ts`）已含 `chain-team-fired` / `chain-team-conflict` / `chain-contract-renewal`。**重建"决定"节点要加进去**，锁成单事件回合。
- **季末写入**：`rolloverWorldClubSeason`（`worldClubs.ts:920`）—— Phase 6-7 在此累加 `rebuildPressure` 并同步 `player.team` 快照。`pendingStoryFlags` 在 c362cdf 尚无"→玩家"消费路径，故**本方案不用 runtime flag，改用 `player.team` 快照作触发桥**。

---

## 1. 关键决策

### 1.1 触发用 `player.team` 快照，不用 runtime flag

Phase 6-7 已把 `rebuildPressure` / `coreStatus` 快照到 `player.team`。`dynamicTags` 据此派生 synthTag：

- `rebuild-watch`：`player.team.rebuildPressure ≥ 60`
- `rebuild-active`：`player.team.rebuildPressure ≥ 80`

链一旦开始，用一个进行中 tag（`rebuild-chain-active`）闸住，避免重复起链。

### 1.2 链是"跨回合顺序叙事"，与 targetCount 正交

重建链 4 个节点**分布在不同回合**（设计 §8.4：至少 2-3 个事件节点让玩家反应），靠 **tag + 冷却**串联（复用现有 `chain-club-response → interview-pending → interview-ready` 那套跨回合模式）。这与"一回合内塞几个事件"的 `targetCount` 是两回事：每个重建节点都作该回合的 **anchor**（经优先注入块返回），`composeRoundPlan` 再围绕它编排。

### 1.3 节点重要度与锚定

- 节点 1-3（施压/传闻/竞争）：`chain` 类型 → 默认 `important` → `team-drama` archetype、tone `tense`。会自然和其他 team 事件成团（重建氛围成团，可接受）。
- 节点 4（重建决定）：标 `severity: 'critical'` **并加入 `isMajorSingleAnchor`** → 单事件回合，不被稀释。

### 1.4 结局落地为 `coreStatus`

决定节点的选择 + 链中累积的玩家表现 → 写 `player.team.coreStatus`，由 game.ts 后处理应用副作用（同现有 `chain-team-fired` / `chain-rival-poach` 后处理模式）。

---

## 2. 类型层（`backend/src/types.ts`）

```ts
export type ClubCoreStatus =
  | 'player-core' | 'contested' | 'rotation-risk' | 'transfer-listed' | 'benched';
```

`PlayerTeam` 增（Phase 6-7 已加 `rebuildPressure?` / `managementPatience?` 快照，本阶段补）：

```ts
coreStatus?: ClubCoreStatus;        // 快照，权威同步自 runtime
```

`ClubRuntimeState` 增（权威）：`coreStatus?: ClubCoreStatus`、`rebuildCorePlayerId?: string`（设计 11.4 已列）。

事件链 tag（无需进类型，运行时 tag）：`rebuild-chain-active`、`rebuild-pressure-step`、`rebuild-rumor-step`、`rebuild-contest-step`。

---

## 3. 触发（`dynamicTags` + 优先注入块）

### 3.1 `dynamicTags`（`events.ts:46`）追加

```ts
if (player.team && !player.tags.includes('rebuild-chain-active')) {
  const rp = player.team.rebuildPressure ?? 0;
  if (rp >= 80) out.push('rebuild-active');
  else if (rp >= 60) out.push('rebuild-watch');
}
```

`rebuild-watch` 只给 UI/反馈（不起链）；`rebuild-active` 起链。

### 3.2 优先注入块（`pickEvent`，与 interview-ready 块并列）

```ts
if (synthTags.has('rebuild-active') && !synthTags.has('rebuild-chain-active')) {
  const start = pool.find((e) =>
    e.id === 'chain-rebuild-pressure' &&
    e.stages.includes(player.stage) &&
    !e.requireTags?.some((t) => !synthTags.has(t)) &&
    !e.forbidTags?.some((t) => synthTags.has(t)),
  );
  if (start && !isExcluded(start) && !isExcludedId(start)) return start;
}
```

### 3.3 链推进节点的注入

节点 2-4 用 `requireTags` 串联（如 `chain-rebuild-rumor` 的 `requireTags: ['rebuild-rumor-step']`），并加各自的优先注入或交由随机池（`roundPlanFit` 会因 tag/主题契合抬权）。关键节点（决定）建议显式优先注入，保证不被随机挤掉。

---

## 4. 链结构与跨回合推进（新增 `backend/src/data/events/rebuild.ts`）

四节点，逐回合推进（设计 §8.4 / §9）：

| # | 事件 id | type/severity | 触发 | 结束写 tag（带冷却，下回合才到下一节点） |
|---|---|---|---|---|
| 1 管理层施压 | `chain-rebuild-pressure` | chains / important | `rebuild-active` | 加 `rebuild-chain-active` + `rebuild-rumor-step`(cd 2-3 回合)，`teamTrust` 略降 |
| 2 明星传闻 | `chain-rebuild-rumor` | chains / important | `rebuild-rumor-step` | 加 `rebuild-contest-step`(cd 2)，浮现引援传闻（接 Phase 5 转会，可先占位文案） |
| 3 内部竞争 | `chain-rebuild-contest` | chains / important | `rebuild-contest-step` | 加 `rebuild-decision-step`(cd 1-2)，玩家进 `contested`/`rotation-risk` 临时态 |
| 4 重建决定 | `chain-rebuild-decision` | chains / **critical** | `rebuild-decision-step` | 结算 `coreStatus`，清 `rebuild-chain-active` 及各 step tag |

- 冷却复用现有 tag 冷却机制（`tags.ts` 的 cooldowns，如 `interview-pending: 8` 那套）。
- 节点 4 的 id 需加入 `roundPlan.ts` 的 `isMajorSingleAnchor`：
```ts
if (event.id === 'chain-rebuild-decision') return true;
```
- 玩家在链中的关键比赛/沟通选择（节点 1-3 的 choices）累积影响节点 4 的判定（通过 tag，如表现好加 `rebuild-proved-self`）。

---

## 5. 与 RoundPlan 编排对齐（`roundPlan.ts`，仅元数据/清单改动）

- 节点 1-3：`deriveThemeFromEvent` → `team` group，`deriveToneFromEvent` → `tense`（id 前缀 `chain-` 命中 `TENSE_ID_PATTERNS`）。无需改 roundPlan 逻辑。
- 节点 4：加进 `isMajorSingleAnchor`（见 4）。`composeRoundPlan` 对 major-single 强制 `targetCount=1`，决定回合纯净。
- `roundPlanFit`：当某回合 anchor 是重建节点时，其余重建/team 事件因同 type/group/tag 自动获高权（×3/×2/×1.5），形成"重建主题回合"，符合设计意图。
- `severity: 'critical'` 让节点 4 在 `eventImportance` 判为 critical，不被 round-plan 续挑当作可跳过的 news/background。

---

## 6. 结局落地（`coreStatus` + game.ts 后处理）

### 6.1 决定节点输出 coreStatus（设计 8.4）

依据链中累积表现（rating / fame / `teamTrust` / `rebuild-proved-self` tag）与选择：

| 玩家表现 | coreStatus | 说明 |
|---|---|---|
| 优秀（高 rating + 高 trust 或 proved-self） | `player-core` | 围绕玩家重建，阵容升级（奖励向） |
| 中上、有竞争 | `contested` | 核心地位被挑战，后续需证明 |
| 一般 | `rotation-risk` | 进入轮换风险 |
| 较差 + 同位置新援 | `transfer-listed` | 被挂牌/允许转会 |
| 差 + 崩盘 | `benched` | 替补（非生涯结束） |

### 6.2 game.ts 后处理（与 `chain-team-fired` 同模式，参考现有 `game.ts` 链后处理）

```ts
if (result.eventId === 'chain-rebuild-decision') {
  const status = deriveRebuildCoreStatus(updated.player, result);
  updated.player.team.coreStatus = status;           // 快照
  // 副作用：
  // player-core → teamTrust↑、薪资↑、teamStatus 'starter'
  // rotation-risk → teamStatus 'rotation' + 期限
  // transfer-listed → 生成 pendingOffer 离队选项 / 允许申请
  // benched → teamStatus 'rotation'，fame 微降
  updated.player.team.rebuildPressure = 0;            // 重置
  // 清链 tag
}
```

runtime 权威 `coreStatus` / `rebuildCorePlayerId` 在世界侧同步（玩家当前队 runtime）。

---

## 7. 资本队渐进风险变体（设计 §9）

`clubArchetype === 'capital-project'`（及 `legacy-giant` Major 失败）时链更激进：

- 触发阈值更低（`rebuildPressure ≥ 70` 即 `rebuild-active`）。
- 节点冷却更短（决定来得更快）。
- 节点 2 明星传闻强化（资本队更可能买人 → `contested`/`rotation-risk` 概率高）。
- 由 `chain-rebuild-*` 事件内按 `player.team` 的 archetype 分支文案与权重（archetype 也需快照到 `player.team`，或经 `getClub(clubId).clubArchetype` 读静态值——后者更简单，clubArchetype 是 Club 静态字段）。

---

## 8. 防挫败原则（设计 14.1 / 8.4）

- 至少 3 个前置节点（施压→传闻→竞争）才到决定，跨多回合，玩家有反应空间。
- 表现好可把结局翻成奖励（`player-core` + 阵容升级）。
- 不因单场比赛直接出局：coreStatus 最差是 `benched`（替补），非清空 team。`transfer-listed` 给玩家**选择**离队而非强制。

---

## 9. 迁移与确定性

- 旧档无 `coreStatus` / `rebuildPressure`：可选字段，缺省无链。链触发依赖 Phase 6-7 的赛季评估产出，自然在新赛季后出现。
- 链中随机（传闻对象、竞争结果）用 `makeRng(hashString(\`${session.id}:rebuild:${clubId}:${round}\`))`。

---

## 10. 测试

- `rebuildChain.test.ts`：
  - 触发：`player.team.rebuildPressure ≥ 80` → 下回合 anchor 为 `chain-rebuild-pressure`；< 60 不触发；`rebuild-chain-active` 期间不重复起链。
  - 推进：四节点按 tag+冷却跨回合依次出现，顺序不乱。
  - 锚定：`chain-rebuild-decision` 回合 `roundPlan.targetCount === 1`（major-single）。
  - 结局：高表现→`player-core`、低表现+新援→`transfer-listed`；决定后 `rebuildPressure` 归零、链 tag 清除。
  - 防挫败：不存在"未经前置节点直接 benched"的路径。
  - 资本队：`capital-project` 触发阈值更低、冷却更短。
- 回归：`multiEventQueue.test.ts` / `longEventChains.test.ts` 不被破坏（新增链不影响既有编排）。

---

## 11. 实施步骤（PR 切分）

1. **类型 + 锚定清单**：`types.ts` 加 `ClubCoreStatus` / `PlayerTeam.coreStatus`；`roundPlan.ts` 的 `isMajorSingleAnchor` 加决定节点。纯标注，零行为。
2. **链事件数据**：`data/events/rebuild.ts` 四节点（含 severity、requireTags、cooldowns、choices）。
3. **触发接线**：`dynamicTags`（`events.ts:46`）派生 `rebuild-watch/active`；`pickEvent` 加优先注入块（3.2）。
4. **结局接线**：game.ts 决定节点后处理 → `coreStatus` + 副作用 + 重置（6）。
5. **资本队变体 + UI**：archetype 分支（7）；coreStatus / rebuildPressure 进 `CareerInsight`（复用 Phase 6-7 的 `SeasonGoalInsight` 或新增字段）。
6. **测试与平衡**（10），调阈值/冷却/结局判定。

第 1-2 步纯新增；第 3 步打通触发；第 4 步打通结局；第 5 步出变体与 UI；第 6 步收口。明星传闻节点（2）与 `transfer-listed` 的真实新援/离队依赖 Phase 5 转会，首版用占位文案与现有 `pendingOffer` 机制近似，待 Phase 5 落地后替换。
