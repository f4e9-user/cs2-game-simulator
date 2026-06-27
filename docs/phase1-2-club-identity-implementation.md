# Phase 1/2 实现细化方案：俱乐部身份数据 + 身份影响运行态

> 文档状态：实现就绪（细化自 `club-identity-season-goal-rebuild-design.md` 的 Phase 1 与 Phase 2）
> 文档日期：2026-06-27
> 适用范围：`heritage` / `capital` / `clubArchetype` 数据、身份对初始运行态与薪资的小幅影响
> 前置：无（这是整套 club-identity 的地基，最先做）
> 下游：Phase 3-8 都读这些身份字段（生成、目标难度、转会倾向、重建强度、容忍度）

---

## 0. 现状与接入点（已核对代码）

- **俱乐部是静态表**：`backend/src/data/clubs.ts` 共 **48 支**（youth 9 / semi-pro 15 / pro 15 / top 9）+ rival。世界队伍池就是这张表过滤 rival（`worldClubs.ts` `ensureWorldClubPool`），**没有程序化生成新队**，所以 Phase 1 = 给这 48 支补身份。
- **已有 ClubProfile 体系**（`data/clubProfiles.ts`）：`rosterStyle`（`balanced`/`chaotic`/`development`/`tactical`/`firepower`）+ `roleBias`/`traitBias`/`personalityBias`/`identityBias`/`fitWeights`/`managementModifiers`/`politicsBias`。`getClubProfile(clubId, tier)` = 每队 override > tier 默认（`STYLE_BY_TIER`）> `DEFAULT_PROFILE`。
- **运行态初始化**（`worldClubs.ts`）：
  - `createClubRuntimeState`（`:352`）= `styleBaseline(profile.rosterStyle)` 给 `clubTrust/currentForm/rosterStability/internalChemistry` + `baselineVrsScore(session, club)`（`BASELINE_VRS_RANGE[tier]` 随机）+ `generateFullRoster`（stats 取 `TIER_STAT_RANGE[tier]`）。
  - `styleBaseline(style)` 把 RosterStyle 映射到 4 个运行态基线。
  - `deriveRosterNeed` 用 `profile.rosterStyle` + 运行态决定补强需求。
- **薪资**：`generateTeamOffer`（`club.ts:361`）在 `club.salaryRange` 区间内随机。
- **身份字段尚不存在**：`Club` 无 `heritage/capital/clubArchetype`，`ClubArchetype` 类型未定义。

---

## 1. 关键决策

### 1.1 archetype 驱动现有 ClubProfile，不另造平行体系

`clubArchetype` 是高层身份，其机制表达**复用 `ClubProfile`**：新增 archetype → 默认 ClubProfile 预设的映射，`getClubProfile` 的回退链改为 **每队 override > archetype 预设 > tier 默认 > DEFAULT**。这样不会出现"archetype 一套、rosterStyle 一套"的双轨。

### 1.2 heritage/capital 用"archetype×tier 派生默认"，避免手调 48 支

只给每支队**显式标 `clubArchetype`**（48 个枚举值，工作量小）。`heritage`/`capital` 默认由 `(archetype, tier)` 查表 + 确定性抖动派生；只对**旗舰队**（顶级老牌豪门、标志性资本队）写显式 `heritage`/`capital` override。这样数据工作量可控又有差异。

### 1.3 只做小幅差异，不动核心比赛模型（设计 14.2）

身份只影响**初始运行态、薪资感、补强倾向**，不改 `matchSimulator` 胜率公式。代价对称（资本队高薪但稳定性低、豪门强但目标高），见第 8 节。

---

## 2. 类型层（Phase 1，`backend/src/types.ts`）

```ts
export type ClubArchetype =
  | 'legacy-giant' | 'capital-project' | 'development-factory'
  | 'regional-pride' | 'fallen-legacy' | 'scrappy-underdog';

export interface Club {
  // …现有字段不变（id/name/tag/region/tier/requiredStage/…/salaryRange/…）…
  heritage?: number;        // 0-100，缺省由 archetype×tier 派生
  capital?: number;         // 0-100，缺省由 archetype×tier 派生
  clubArchetype?: ClubArchetype;
}
```

（`new-money` 暂并入 `capital-project`，设计 2.2。）

---

## 3. 身份数据填充（Phase 1）

### 3.1 给 48 支标 archetype（`data/clubs.ts`）

逐队加 `clubArchetype`。分布约束（设计 4.2 / 12.1）：

- **top（9）**：至少 3 `legacy-giant` + 2-3 `capital-project`，余 `fallen-legacy`/`regional-pride`。
- **pro（15）**：`capital-project` / `legacy-giant` / `regional-pride` / `fallen-legacy` 混合。
- **semi-pro（15）**：`regional-pride` / `development-factory` / `scrappy-underdog` 为主。
- **youth（9）**：`development-factory` / `scrappy-underdog` 为主。

已有 PROFILE_OVERRIDES 的队（`club-local-wolves`=chaotic→`scrappy-underdog`、`club-cyber-academy`=tactical→`development-factory`/`regional-pride`、`club-school-team`=development→`development-factory`、`club-regional-youth`→`regional-pride`）按其风格对应 archetype，保持一致。

### 3.2 heritage/capital 派生（新增 `data/clubIdentity.ts`）

```ts
const IDENTITY_BASE: Record<ClubArchetype, { heritage: [number,number]; capital: [number,number] }> = {
  'legacy-giant':        { heritage: [75, 95], capital: [55, 80] },
  'capital-project':     { heritage: [20, 45], capital: [80, 98] },
  'development-factory': { heritage: [40, 60], capital: [25, 45] },
  'regional-pride':      { heritage: [50, 70], capital: [40, 60] },
  'fallen-legacy':       { heritage: [70, 90], capital: [25, 45] },
  'scrappy-underdog':    { heritage: [15, 35], capital: [15, 35] },
};

export function clubHeritage(club: Club): number {
  if (typeof club.heritage === 'number') return club.heritage;
  return deriveFromRange(club, 'heritage', IDENTITY_BASE[club.clubArchetype ?? fallbackArchetype(club.tier)].heritage);
}
export function clubCapital(club: Club): number { /* 同理 */ }
```

- `deriveFromRange` 用 `makeRng(hashString(\`identity:${club.id}:heritage\`))` 在区间内确定性取值（同 club 恒定）。
- `fallbackArchetype(tier)`：未标 archetype 的兜底（top→legacy-giant、pro→regional-pride、semi-pro→regional-pride、youth→development-factory）。
- 全代码读身份一律走 `clubHeritage(club)` / `clubCapital(club)` / `club.clubArchetype ?? fallbackArchetype(...)`，不直接读裸字段，保证缺省也有值。

---

## 4. archetype → ClubProfile 映射（Phase 2，`data/clubProfiles.ts`）

新增 archetype 默认 profile 预设，并改 `getClubProfile` 回退链：

```ts
const ARCHETYPE_PROFILE: Record<ClubArchetype, Partial<Omit<ClubProfile,'clubId'>>> = {
  'legacy-giant':        { rosterStyle: 'tactical',   politicsBias: { starWeight: 1.2, coachControl: 1.2, conflictRisk: 1 } },
  'capital-project':     { rosterStyle: 'firepower',  politicsBias: { starWeight: 1.4, coachControl: 0.8, conflictRisk: 1.3 } },
  'development-factory': { rosterStyle: 'development', managementModifiers: { teamPracticeGrowthMultiplier: 1.1 } },
  'regional-pride':      { rosterStyle: 'balanced' },
  'fallen-legacy':       { rosterStyle: 'tactical',   politicsBias: { conflictRisk: 1.2 } },
  'scrappy-underdog':    { rosterStyle: 'chaotic' },
};

// getClubProfile 回退：每队 override > archetype 预设 > STYLE_BY_TIER > DEFAULT
```

每队 `PROFILE_OVERRIDES` 仍可覆盖 archetype 预设（旗舰队精调），保持向后兼容。

---

## 5. 身份影响初始运行态（Phase 2，`worldClubs.ts`）

在 `createClubRuntimeState`（`:352`）的 `styleBaseline` 之后叠加身份修正（小幅）：

```ts
const baseline = styleBaseline(profile.rosterStyle);
const identity = applyIdentityToBaseline(baseline, club);   // 新增
return withVrsScore({
  ...,
  baselineVrsScore: baselineVrsScore(session, club) + heritageVrsBonus(club),  // 高底蕴小幅抬 VRS
  ...identity,   // 取代裸 ...baseline
  ...
});
```

`applyIdentityToBaseline`（新增，设计 12.4）：

| 身份维度 | 运行态影响（小幅，±2~8） |
|---|---|
| 高 `heritage`（≥70） | `clubTrust` +6、`rosterStability` +4 |
| 高 `capital`（≥75） | `currentForm` +4（资源好）、`rosterStability` −6（频繁调整） |
| `development-factory` | `internalChemistry` +6（成长向） |
| `fallen-legacy` | `currentForm` −6、`rosterStability` −4（动荡） |
| `scrappy-underdog` | `clubTrust` +4（抱团）、`baselineVrs` 不抬 |

`heritageVrsBonus(club)`：`clubHeritage ≥ 70 → +8`，`≥ 55 → +4`，否则 0（设计 12.4"少量 baselineVrsScore"）。

> 所有数值集中在 `worldClubs.ts` 顶部常量 / `clubIdentity.ts`，便于平衡。clamp 到合法区间。

---

## 6. capital → 薪资（Phase 2，`club.ts:361` `generateTeamOffer`）

```ts
const [min, max] = club.salaryRange;
const base = min + Math.floor(rng() * (max - min + 1));
const salary = Math.round(base * capitalSalaryMultiplier(club));   // 新增
```

`capitalSalaryMultiplier`：`clubCapital ≥ 80 → 1.25`、`≥ 60 → 1.1`、`≤ 30 → 0.9`，否则 1（设计 3.2 资本队明显高于同档；3.6 草根低）。

---

## 7. 与既有逻辑协调

- `deriveRosterNeed` 已读 `profile.rosterStyle`——archetype 经第 4 节驱动 rosterStyle 后，补强需求自动反映身份（资本/草根 firepower/chaotic→更易缺 AWPer/Entry），无需另改。
- `ClubApplicationSummary.runtimeSummary` 可加 archetype/heritage/capital 透出（设计 13.1 俱乐部列表），首版可选。
- Phase 6-8 的目标难度 / 容忍度 / 转会倾向 / 重建强度都读 `club.clubArchetype` + `clubHeritage/clubCapital`，本阶段把读取入口（`clubIdentity.ts`）建好即可被下游复用。

---

## 8. 平衡原则（设计 14.2，代价对称）

- 资本队：薪资↑、resource form↑，但 `rosterStability`↓、重建更激进（Phase 8 阈值更低）。
- 老牌豪门：`clubTrust`/VRS↑、稳定↑，但面试门槛高、赛季目标高、失败容忍低（Phase 6-7 容忍度表）。
- 不让任一身份成为纯优解。

---

## 9. 迁移与确定性

- `Club` 三字段均可选；读取一律走 `clubIdentity.ts` 的 getter，缺省由 archetype×tier 派生，**旧档无需迁移**。
- 派生与运行态修正全用 `makeRng(hashString(...))`，同 club 恒定、跨读一致。
- 运行态修正只在 `createClubRuntimeState` 施加一次（初始化），不在每 tick 重复叠加。

---

## 10. 测试

- `clubIdentity.test.ts`：每个 archetype 的 `clubHeritage/clubCapital` 落在区间且确定性恒定；显式 override 优先；未标 archetype 走 tier 兜底。
- `clubProfiles.test.ts`：`getClubProfile` 回退链正确（override > archetype > tier > default）。
- `worldClubs.test.ts`：高 heritage 队 `clubTrust`/`baselineVrsScore` 高于低 heritage 同档；资本队 `rosterStability` 偏低；数值 clamp 合法；确定性回归。
- `clubApplication`/offer：`capital-project` 的 offer 薪资显著高于同档 `scrappy-underdog`。
- 分布校验：top tier 含 ≥3 legacy-giant + ≥2 capital-project。

---

## 11. 实施步骤（PR 切分）

1. **类型 + 身份读取层**：`types.ts` 加 `ClubArchetype` + Club 字段；新增 `data/clubIdentity.ts`（派生表 + getter + fallback）。纯新增。
2. **数据填充**：`data/clubs.ts` 给 48 支标 `clubArchetype`，旗舰队补显式 heritage/capital（3）。
3. **archetype→profile**：`clubProfiles.ts` 加 ARCHETYPE_PROFILE + 改回退链（4）。
4. **运行态影响**：`worldClubs.ts` `applyIdentityToBaseline` + `heritageVrsBonus` 接入 `createClubRuntimeState`（5）。
5. **薪资影响**：`club.ts` `generateTeamOffer` 加 `capitalSalaryMultiplier`（6）。
6. **测试与平衡 + UI 透出**（10、7），调派生区间与运行态修正幅度。

第 1-2 步是数据地基（被所有后续 Phase 依赖，应最先合）；第 3-5 步让身份小幅显形；第 6 步收口。注意第 1-2 步**无行为变更前提**是后续 Phase 尚未读这些字段——一旦 Phase 6-8 接入，身份就会真正驱动目标/重建/转会。
