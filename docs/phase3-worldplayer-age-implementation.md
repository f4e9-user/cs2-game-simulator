# Phase 3 实现细化方案：WorldPlayer 选手库 + 年龄系统

> 文档状态：实现就绪（细化自 `club-identity-season-goal-rebuild-design.md` 的 Phase 3，采用 A 案）
> 文档日期：2026-06-27
> 适用范围：`WorldPlayer` 选手模型迁移、玩家与世界选手年龄系统
> 前置：A 案已确定（`WorldPlayer` 取代 `ClubRuntimeState.fullRoster` 的 `ClubPlayer`，属性轴与玩家 `Stats` 统一）

---

## 0. 目标与边界

本阶段只做两件事：

1. 把世界侧阵容模型从 `ClubPlayer` 升级为 `WorldPlayer`（唯一权威世界选手模型，`ClubPlayer` 退役）。
2. 给玩家和 `WorldPlayer` 引入 `age`，并以**派生修正 + 成长倍率**方式影响竞技表现。

不在本阶段：转会写改（Phase 5）、`TournamentInstance` / `TournamentPlayerPerformance`（Phase 4）、赛季目标/重建（Phase 6-8）。`WorldPlayer.reputation` / `archetype` 字段本阶段先生成、供后续阶段消费。

现有代码事实（已核对）：

- `ClubPlayer` 仅被 2 个引擎文件消费：`worldClubs.ts`（`generateFullRoster` / `createClubRuntimeState`）与 `team.ts`（`clubPlayerToTeammate` / `rosterFromClubRuntime`），加类型定义 `types.ts:298` 和字段 `types.ts:341`。迁移面很小。
- 世界阵容是**确定性派生**（`worldClubs.ts:331` 用 `hashString + makeRng`），并作为 `ClubRuntimeState.fullRoster` **持久化**在 `runtimeByClubId` 里。
- 玩家比赛有效属性的**单一入口**是 `matchSimulator.ts:169`（`const { stats, volatile } = player;`）。
- 玩家年份递增在 `choice.ts:635`（`advanceWeek` 使 `nextYear > year` 即跨赛季）；世界俱乐部赛季结算 `rolloverWorldClubSeason`（`worldClubs.ts:843`）已以 `player.year > pool.season` 为触发。
- 属性 key：`STAT_KEYS = [intelligence, agility, experience, money, mentality, constitution]`（`constants.ts:3`）。`CORE_STAT_KEYS` 不含 money/experience。
- `TeammateStats`（`types.ts:397`）只有 4 项：agility / intelligence / mentality / experience（**无 constitution**）。

---

## 1. 类型层改动（`backend/src/types.ts`）

### 1.1 新增 `PlayerSkillProfile`（属性轴与 `Stats` 对齐，去掉 money）

```ts
export interface PlayerSkillProfile {
  agility: number;       // 敏捷
  constitution: number;  // 体能
  intelligence: number;  // 智力
  mentality: number;     // 心态
  experience: number;    // 经验
}
```

### 1.2 新增 `PlayerArchetype`

```ts
export type PlayerArchetype =
  | 'superstar' | 'star-awper' | 'entry-fragger' | 'system-igl'
  | 'veteran-anchor' | 'rookie-prospect' | 'clutch-specialist'
  | 'role-player' | 'volatile-talent';
```

### 1.3 新增 `WorldPlayer`（合并原 `ClubPlayer` 字段）

```ts
export interface WorldPlayer {
  // —— 原 ClubPlayer 字段（迁移保留）——
  id: string;
  name: string;
  role: TeammateRole;
  traits: string[];
  personality: PersonalityTag;
  joinedRound: number;
  status: 'starter' | 'bench' | 'trial' | 'prospect' | 'free-agent';
  internalChemistry?: number;
  // —— Phase 3 新增 ——
  region: string;
  age: number;
  clubId: string;
  archetype: PlayerArchetype;
  stats: PlayerSkillProfile;   // ← 取代原 TeammateStats（多了 constitution）
  form: number;                // 近期状态，-100..100，默认 0
  reputation: number;          // 声望，0..100，供 Phase 4/5 消费
}
```

### 1.4 改 `ClubRuntimeState.fullRoster` 类型并删除 `ClubPlayer`

```ts
// types.ts:341
fullRoster: WorldPlayer[];   // 原: ClubPlayer[]
```

删除 `ClubPlayer` 接口（`types.ts:298-308`）。`status` 取值并集已在 `WorldPlayer` 扩展（新增 `prospect` / `free-agent`，为 Phase 5 预留；本阶段只产出 `starter`）。

### 1.5 `Player` 新增 `age`

```ts
// types.ts:708 Player 接口内
age: number;
```

### 1.6 新增年龄修正类型

```ts
export type AgeBand = 'rising-talent' | 'ascending' | 'prime' | 'veteran' | 'twilight';

export interface AgeStatModifier {
  // 比赛派生修正（加到对应 stat 上，可正可负）
  agilityDelta: number;
  constitutionDelta: number;
  intelligenceDelta: number;
  mentalityDelta: number;
  experienceDelta: number;
  // 成长倍率（作用于成长结算）
  agilityGrowthMultiplier: number;
  constitutionGrowthMultiplier: number;
  intelligenceGrowthMultiplier: number;
  mentalityGrowthMultiplier: number;
  experienceGrowthMultiplier: number;
}
```

---

## 2. 年龄规则（新增 `backend/src/engine/age.ts`）

单一来源，玩家与 `WorldPlayer` 共用。

### 2.1 年龄段映射

| AgeBand | 年龄 | agility/constitution Δ | intelligence/mentality/experience Δ | 成长倍率重点 |
|---|---|---|---|---|
| `rising-talent` | 16-18 | 0 | -1（智力/心态偏低、波动大） | 敏捷/体能 ×1.3，智力/心态 ×0.8 |
| `ascending` | 19-23 | +1 | 0 | 敏捷/体能 ×1.2，其余 ×1.0 |
| `prime` | 24-27 | 0 | +1 | 全 ×1.0 |
| `veteran` | 28-31 | -1 | +2 | 敏捷/体能 ×0.7，智力/心态/经验 ×1.1 |
| `twilight` | 32+ | -3 | +3 | 敏捷/体能 ×0.4，智力/心态/经验 ×1.1 |

> 数值是首版建议，集中在 `age.ts` 的常量表，便于平衡调参。Δ 为**派生修正**，不写回永久 `stats`。

### 2.2 函数签名

```ts
export function ageBandFor(age: number): AgeBand;
export function ageStatModifier(age: number): AgeStatModifier;

// 比赛派生：返回叠加年龄 Δ 后的 Stats 副本（不修改入参，不写回）
export function applyAgeToStats(stats: Stats, age: number): Stats;

// 成长结算：把成长量按该 stat 的年龄倍率缩放
export function scaleGrowthByAge(statKey: CoreStatKey | 'experience', amount: number, age: number): number;
```

`applyAgeToStats` 对 `constitution/agility/intelligence/mentality/experience` 加对应 Δ 后 `clampStats`；`money` 不动。

---

## 3. 注入点（关键，决定"分层不双叠"）

### 3.1 玩家比赛——`matchSimulator.ts:169`

```ts
// 改前： const { stats, volatile } = player;
const { volatile } = player;
const stats = applyAgeToStats(player.stats, player.age);
```

之后所有 `stats.agility / intelligence / mentality / experience` 的读取（`aimBase` / `decisionBase` / `stabilityBonus`，`matchSimulator.ts:174/175/193`）自动吃到年龄派生值。

**叠加顺序**：基础 `player.stats` → 年龄 Δ（此处）→ volatile（feel/tilt/fatigue）与 Buff（`matchSimulator.ts:177-194` 仍在其后）。年龄层在前、临时状态层在后，满足设计 2.4「不双叠」。

> 注意：`constitution` 当前不直接进 `personalPower`，主要经 fatigue 链路影响。年龄压低 constitution 会通过现有疲劳计算间接生效，无需额外接线；若后续要让 constitution 直接进 power，再单独评估。

### 3.2 世界选手有效属性

`rosterAveragePower`（`matchSimulator.ts:101`）读的是 `Teammate.stats`（玩家队友快照）。世界选手的年龄影响应在 **`WorldPlayer` → 有效属性**转换处统一施加：

- 玩家队友：在 `clubPlayerToTeammate`（更名 `worldPlayerToTeammate`，见 4.3）映射时，对 `WorldPlayer.stats` 先过 `applyAgeToStats` 再降维到 `TeammateStats`，使快照已含年龄效果。
- 赛季 rollover 时（见 5）需**刷新玩家当前队友快照**，让年龄随赛季推进重新生效（否则快照停留在入队时年龄）。
- 纯抽象世界对战（Phase 4）直接对 `WorldPlayer` 用 `applyAgeToStats`，不经 Teammate。

### 3.3 成长结算——`resolver.ts`

成长写入处（`resolver.ts:153` 一带，`CORE_STAT_KEYS` 成长逻辑）用 `scaleGrowthByAge(growthKey, amount, player.age)` 缩放后再写入 `growthSpent` / `stats`。年轻吃敏捷/体能红利、老将吃智力/心态/经验红利由此体现。

---

## 4. 选手生成与映射迁移

### 4.1 `worldClubs.ts:329` `generateFullRoster` 返回 `WorldPlayer[]`

- 返回类型 `ClubPlayer[]` → `WorldPlayer[]`。
- `stats`：把现有 `randomStats`（`worldClubs.ts:119`，产 4 项 `TeammateStats`）扩展为产 5 项 `PlayerSkillProfile`，新增 `constitution`（沿用 `TIER_STAT_RANGE` 区间，**用同一 rng 续抽**保持确定性；注意新增一次 `rng()` 会改变后续随机序列——见 7.3 迁移影响）。
- 新增字段：
  - `region = club.region`
  - `clubId = club.id`
  - `age`：确定性派生，按 tier 给不同年龄分布（如 youth 偏 17-20，top 偏 22-29），`16 + Math.floor(rng() * span)`。
  - `archetype`：由 `role` + 俱乐部 profile/archetype 推导（如 AWPer→`star-awper`，IGL→`system-igl`，youth 队→偏 `rookie-prospect`）。
  - `form = 0`，`reputation`：按 tier/archetype 给基线（top/superstar 高）。

### 4.2 `createClubRuntimeState`（`worldClubs.ts:352`）

无逻辑改动，`fullRoster: generateFullRoster(...)` 现产 `WorldPlayer[]`，类型自动流通。

### 4.3 `team.ts` 映射改名与降维

- `clubPlayerToTeammate`（`team.ts:199`）→ `worldPlayerToTeammate(wp: WorldPlayer, slotIndex, fallbackChemistry)`。
- `stats` 降维：`Teammate.stats`（`TeammateStats`，无 constitution）= 取 `applyAgeToStats(wp.stats, wp.age)` 后的 `{ agility, intelligence, mentality, experience }`（**丢弃 constitution**，因 TeammateStats 不含）。
- `rosterFromClubRuntime`（`team.ts:212`）内 `clubPlayer` 变量改名 `worldPlayer`，类型随 `fullRoster` 变更自动为 `WorldPlayer`；`.status === 'starter'` 过滤不变。

---

## 5. 年龄递增与赛季钩子

- **玩家 `age + 1`**：在 `choice.ts:635` 判定 `nextYear > (session.player.year ?? 1)` 为跨赛季，于该处对 `nextPlayer.age` +1。与世界赛季结算同一边界。
- **世界选手 `age + 1` + 队友快照刷新**：在 `rolloverWorldClubSeason`（`worldClubs.ts:843`）内，对每个 runtime 的 `fullRoster` 选手 `age + 1`；并触发玩家当前队 `player.roster` 快照按新年龄重映射（3.2）。
- **新建角色初始年龄**：`initPlayer`（`player.ts:183`）写入 `age`：`InitInput` 增加可选 `age`，缺省 `18`；在 `player.ts:210` 的 `player` 对象里补 `age: input.age ?? 18`。

---

## 6. UI / 接口透出（最小）

- `WorldPlayer.age` / `archetype` 随对手情报、阵容展示返回（Phase 4 正式用，本阶段保证字段存在即可）。
- 玩家面板可显示 `player.age` 与当前 `AgeBand` 文案（可选，非阻塞）。

---

## 7. 迁移、确定性与存档

### 7.1 旧存档兼容（`backend/src/storage/d1.ts`）

旧 session 的 `runtimeByClubId[*].fullRoster` 是 `ClubPlayer`（4 项 stats、无 age/constitution/archetype/form/reputation），`player` 无 `age`。需在加载时迁移（沿用 d1.ts 已有的 `pendingOffer` 迁移模式，`d1.ts:14`）：

- `player.age` 缺失 → 回填默认（如 `18 + (player.year-1)` 近似，或固定 18）。
- `fullRoster` 元素缺 `constitution` → 用同 tier 区间中值回填；缺 `age/archetype/form/reputation` → 按 4.1 规则回填或惰性重生成该 runtime。
- 最稳妥：给 `WorldClubPool` 加 schemaVersion，旧版直接**丢弃并重新确定性派生 fullRoster**（玩家未交互过的世界队伍重生成无副作用）。

### 7.2 持久化策略

本阶段维持现状：`fullRoster` 作为 `ClubRuntimeState` 的一部分持久化在 `runtimeByClubId`，只对**已创建 runtime 的活跃/相关/玩家相关**俱乐部存在（`createClubRuntimeState` 惰性创建），规模可控。"只持久化转会增量"的优化留到 Phase 5 转会落地时再做。

### 7.3 确定性影响（务必注意）

4.1 给 `randomStats` 增加一次 `rng()`（constitution）并新增 age/archetype 抽样，会**改变 `generateFullRoster` 的随机序列**，导致迁移后同一 club 的既有阵容数值变化。因世界阵容本就是派生数据、且本就要重生成，可接受；但需更新依赖固定数值的测试快照（见 8）。

---

## 8. 测试

- `worldClubs.test.ts`：`fullRoster` 元素类型/字段断言更新为 `WorldPlayer`（含 age/constitution/archetype）；确定性（同 seed 同结果）回归。
- 新增 `age.test.ts`：`ageBandFor` 边界（18/19/23/24/27/28/31/32）；`applyAgeToStats` 对 twilight 压敏捷、抬智力；`applyAgeToStats` 不修改入参、不写回；`scaleGrowthByAge` 年轻×高敏捷成长、老将×低敏捷成长。
- `matchSimulator` 测试：同属性下，老将（32+）`personalPower` 低于 prime，但 `stabilityBonus`（mentality）更高，验证派生不写回 `player.stats`。
- `teamManagement.test.ts` / 入队相关：`worldPlayerToTeammate` 降维正确（Teammate 仍 4 项、值含年龄效果）。
- 赛季 rollover 测试：跨年后 `player.age` 与世界选手 age 各 +1，玩家队友快照按新年龄刷新。

---

## 9. 实施步骤（建议 PR 切分）

1. **类型 + 年龄引擎**：types.ts 改动（1.x，含删 `ClubPlayer`）、新增 `age.ts`（2.x）。先让类型编译报错暴露所有 `ClubPlayer` 消费点。
2. **生成与映射迁移**：`worldClubs.ts` 生成 `WorldPlayer[]`（4.1/4.2）、`team.ts` 映射改名降维（4.3）。修复编译。
3. **注入年龄**：matchSimulator（3.1）、resolver 成长倍率（3.3）、世界选手有效属性（3.2）。
4. **赛季钩子 + 初始化**：choice.ts age+1（5）、worldClubs rollover age+1 与快照刷新（5）、initPlayer age（5）。
5. **存档迁移**：d1.ts 回填 / schemaVersion 重生成（7.1）。
6. **测试与平衡**：8 的全部测试，调 `age.ts` 常量表。

每步可独立编译通过、独立 PR。第 1-2 步是纯迁移（行为等价，除确定性序列变化），第 3-4 步引入年龄玩法，第 5 步保旧档，第 6 步收口。
