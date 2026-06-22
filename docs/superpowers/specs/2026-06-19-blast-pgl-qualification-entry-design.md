# BLAST / PGL / IEM Qualification Entry Design

状态：已完成。
落地目标：修正 BLAST、PGL、IEM 赛事链路中的资格自循环和职业队入口不真实问题。

## Background

当前赛事配置里，部分 S 级正赛会在节点奖励中继续发放同级正赛资格。例如 `CS Asia Championships` 本身是 `s-main` 正赛，却显示“晋级决赛：S正赛资格”。这类问题在 BLAST、PGL、IEM 链路里也存在：`BLAST Bounty`、`BLAST Open`、`BLAST Rivals`、`IEM` 正赛、`IEM Major`、`PGL Major` 等高阶赛事会继续产出同品牌 main 资格。

这会带来两个不真实结果：

- 已经参加正赛的战队又获得同一正赛层级资格，奖励语义循环。
- pro/top 战队仍可能被迫从 open qualifier 起步，和世界级战队模拟不一致。

本设计把赛事资格拆成两类能力：

- 资格票据：二线队、边缘职业队通过赛事表现逐级获得。
- 直通入口：高档战队或高 VRS 战队凭世界排名和队伍档位跳过低级预选。

同时，当前世界战队池规模不足也会放大资格链的不真实感。现有 `CLUBS` 模板队只有 16 支：

| 档位 | 数量 |
| --- | ---: |
| youth | 4 |
| semi-pro | 4 |
| pro | 4 |
| top | 4 |

其中 3 支还是 rival 映射模板队，固定 top 队只有 `Titan Corp`、`Neon Dynasty`、`Sovereign` 这 3 支。对于 PGL、BLAST、IEM、Major 这种世界级赛事，4 支左右的 top 生态明显不足。

但问题不只在上层。C/B/A 级赛事也需要对应的青训、半职业、二线职业战队支撑，否则前半段资格爬升仍然会显得空。因此本设计同时要求扩展世界战队池，让 C/B/A/S/Major 各层赛事都能从对应档位里抽到足够多的队伍。

## Goals

- BLAST 正赛不再奖励 `blast-main` 这种同级自循环资格。
- IEM 正赛和 IEM Major 不再奖励 `iem-main` 这种同级自循环资格。
- PGL 链路保留清晰的 `pgl-open -> pgl-closed -> pgl-main -> Major` 晋级路径。
- IEM 链路保留清晰的 `iem-open -> iem-main -> IEM 正赛 / Major` 晋级路径。
- semi-pro 队伍仍需要从 A 赛或 open qualifier 向上爬。
- pro 队伍可以跳过 `pgl-open`，直接进入 `pgl-closed`，前提是 VRS 或资格满足要求。
- top 队伍可以直接进入 `pgl-main` / Major 级入口，不需要打公开预选。
- 世界战队池需要扩展到能支撑 C/B/A/S/Major 全层级生态，避免任何一个档位长期只有少量固定队。
- 前端赛事卡片展示能解释“持票进入”和“战队排名直通”的区别。
- 不破坏现有资格票据存档字段。

## Non-Goals

- 不重做完整赛事日历。
- 不引入真实世界赛事授权规则。
- 不模拟完整 RMR / Valve Regional Standings 复杂邀请制度。
- 不移除所有资格票据。票据仍是二线队上升路径。
- 不让所有 pro 队伍无条件进入 Major。
- 不在第一阶段实现完整转会市场或每队完整历史荣誉库。新增队伍只需要具备世界模拟所需的身份、档位、地区、VRS baseline 和 roster runtime。

## Current Problems

### BLAST

当前 BLAST 链路大致为：

- A 级赛事产出 `blast-closed`
- BLAST Closed Qualifier 消耗 `blast-closed`，产出 `blast-main`
- BLAST 正赛消耗或不消耗 `blast-main`
- BLAST 正赛部分节点继续奖励 `blast-main`

问题在最后一步：正赛继续发同级正赛资格，语义上像“已经在主舞台，又获得主舞台门票”。

### PGL

当前 PGL 链路大致为：

- A 级赛事产出 `pgl-open`
- PGL Open Qualifier 消耗 `pgl-open`，产出 `pgl-closed`
- PGL Closed Qualifier 消耗 `pgl-closed`，产出 `pgl-main`
- PGL Major 消耗 `pgl-main`

链路本身清楚，但入口过于票据化。现实感更强的逻辑应该是：

- semi-pro：从 `pgl-open` 或 A 赛开始。
- pro：可直接进入 `pgl-closed`，不必总打 open。
- top：可直接进入 `pgl-main` / Major 入口。

### IEM

当前 IEM 链路大致为：

- A 级赛事产出 `iem-open`
- IEM Open Qualifier 消耗 `iem-open`，产出 `iem-main`
- IEM 正赛和 IEM Major 消耗 `iem-main`
- IEM 正赛和 IEM Major 部分节点继续奖励 `iem-main`

问题和 BLAST / PGL Major 一样：主舞台继续发主舞台资格，容易变成“参加 IEM 后获得 IEM 门票”的循环奖励。

## Proposed Model

### World Club Pool Scale

赛事资格链的真实感依赖足够大的世界战队池。第一阶段目标不是做完整全球数据库，而是把 `CLUBS` 扩展到足够支撑抽象赛事、排行榜和各档位淘汰链。

建议目标规模：

| 档位 | 目标数量 | 用途 |
| --- | ---: | --- |
| youth | 8-12 | C 级、本地赛、青训体系 |
| semi-pro | 12-16 | B/A 级赛事、公开预选入口 |
| pro | 12-18 | A/S 级封闭预选、S 正赛中游队 |
| top | 8-12 | S 正赛、Major、世界排行榜头部 |

第一阶段最低目标：

- 总队伍数不少于 41。
- 固定 youth 队不少于 8。
- 固定 semi-pro 队不少于 12。
- 固定 top 队不少于 8。
- 固定 pro 队不少于 10。
- rival 映射队继续保留，但不计入固定世界队伍最低数量。

建议分布如下，优先满足档位覆盖，再满足地区结构：

| 地区 | 建议总数 | 建议档位结构 |
| --- | ---: | --- |
| 欧洲 | 11-13 | top 3-4, pro 4-5, semi-pro 2-3, youth 1-2 |
| 北美 | 6-8 | top 1-2, pro 2-3, semi-pro 2, youth 1-2 |
| 蒙古 | 2-3 | 至少 1 支 pro/top，其余可为 pro 或 semi-pro |
| 中国 | 4-6 | 至少 2 支 pro/top，其余可为 pro / semi-pro / youth |
| 大洋洲 | 2-3 | 以 semi-pro / pro 为主，最多 1 支 top |
| 东南亚 | 2-3 | 以 semi-pro / pro 为主，可配置 1 支 youth 作为补位 |
| 南美 | 3-4 | pro 1-2, semi-pro 1-2, youth 0-1 |
| CIS / 东欧 | 3-4 | pro 1-2, semi-pro 1-2, youth 0-1 |
| 中东 | 3-4 | pro 1-2, semi-pro 1-2, youth 0-1 |

建议分布是目标值，不是硬验收线；实现时可优先满足总数和档位门槛，再逐步逼近这些比例。若某地区暂时无法满足总数，允许用同地区下一级档位补齐，但不得长期由单一区域垄断世界池名额。

新增队伍需要覆盖多个地区：

- 欧洲
- 北美
- 蒙古
- 中国
- 大洋洲
- 东南亚
- 南美
- CIS / 东欧
- 中东

其中 APAC 不再作为单一强区看待，而是拆成蒙古、中国、大洋洲、东南亚等子区域分别建模。

这样 PGL、BLAST、IEM 的抽象赛事 tick 才能从足够大的候选池里选出强队，而不是反复让同几支队打所有世界赛事。
同时，C/B/A 级赛事的候选池也不会长期只有同几支青训或半职业队，避免前半段成长线重复感过强。

### Qualification Ticket

继续保留现有 `qualificationTargets` 和资格槽字段。

示例：

```ts
qualificationTargets: ['pgl-open']
qualificationMilestones: [
  milestone(2, '晋级决赛', reward('pgl-closed')),
]
```

含义不变：玩家或队伍拥有对应资格票时，可以报名对应赛事。

### Direct Entry Bypass

为赛事增加可选直通规则。

```ts
interface TournamentDirectEntryBypass {
  minTeamTier?: ClubTier;
  minVrsScore?: number;
  reason: 'world-ranking' | 'partner-invite' | 'major-standing';
}

interface Tournament {
  qualificationTargets?: string[];
  directEntryBypass?: TournamentDirectEntryBypass;
}
```

当赛事设置了 `qualificationTargets` 时，报名满足以下任意条件即可：

1. 玩家或战队持有目标资格票。
2. 当前战队满足 `directEntryBypass` 的 `minTeamTier` 和 `minVrsScore`。

这不是免费通行。战队仍需要满足赛事原本的 stage、teamRequirement、fameRequired、pointsRequired 等门槛。

## BLAST Design

### Short-Term Fix

移除 BLAST 正赛中的同级资格奖励：

- `BLAST Bounty` 不再奖励 `blast-main`
- `BLAST Open` 不再奖励 `blast-main`
- `BLAST Rivals` 不再奖励 `blast-main`

保留 BLAST Closed Qualifier 的奖励：

- `blast-closed -> BLAST Closed Qualifier -> blast-main`

### Optional Later Extension

如果需要让 BLAST 正赛成绩影响下一站，可以新增不同语义的 slot：

```ts
blast-invite
```

语义：

- 不是“正赛资格”
- 是“BLAST 系列下站直邀权”
- 可用于跳过 BLAST Closed Qualifier

第一阶段不实现 `blast-invite`，避免扩大范围。

### BLAST Final Chain

| Source | Target |
| --- | --- |
| A 级赛事四强 / 决赛 | `blast-closed` |
| BLAST Closed Qualifier 晋级决赛 | `blast-main` |
| BLAST Open / Rivals / Bounty 正赛成绩 | VRS、名气、奖金、队伍声望，不发同级票 |

## PGL Design

### Ticket Chain

保留当前 PGL 主链：

| Stage | Entry | Reward |
| --- | --- | --- |
| A 级赛事 | `a-main` 或直接参赛 | `pgl-open` |
| PGL Open Qualifier | `pgl-open` | `pgl-closed` |
| PGL Closed Qualifier | `pgl-closed` | `pgl-main` |
| PGL Major | `pgl-main` | Major 成绩、VRS、声望 |

### Direct Entry Rules

PGL Open Qualifier：

- 面向 semi-pro 和低 VRS pro。
- 无直通必要。

PGL Closed Qualifier：

```ts
directEntryBypass: {
  minTeamTier: 'pro',
  minVrsScore: 80,
  reason: 'world-ranking',
}
```

含义：

- semi-pro 队伍需要 `pgl-closed` 票。
- pro 队伍如果 VRS 达标，可以直接参加 closed，不必打 open。

PGL Major：

```ts
directEntryBypass: {
  minTeamTier: 'top',
  minVrsScore: 150,
  reason: 'major-standing',
}
```

含义：

- 普通 pro 队伍需要 `pgl-main` 票。
- top 队伍且 VRS 达标，可以直接进入 Major。
- 弱 top 或刚升档但 VRS 不足的队伍仍可能需要资格路径。

## IEM Design

### Ticket Chain

保留当前 IEM 主链：

| Stage | Entry | Reward |
| --- | --- | --- |
| A 级赛事 | `a-main` 或直接参赛 | `iem-open` |
| IEM Open Qualifier | `iem-open` | `iem-main` |
| IEM 正赛 | `iem-main` 或排名直通 | VRS、名气、奖金、队伍声望 |
| IEM Major | `iem-main` 或顶级排名直通 | Major 成绩、VRS、声望 |

### Direct Entry Rules

IEM Open Qualifier：

- 面向 semi-pro、低 VRS pro、通过 A 赛拿到 `iem-open` 的队伍。
- 无直通必要。

IEM 正赛：

```ts
directEntryBypass: {
  minTeamTier: 'pro',
  minVrsScore: 90,
  reason: 'world-ranking',
}
```

含义：

- 有 `iem-main` 票的队伍可以报名。
- pro 队伍如果 VRS 达标，可以直接进入 IEM 正赛，不必打 IEM Open Qualifier。
- semi-pro 队伍仍需要走 `iem-open -> iem-main`。

IEM Major：

```ts
directEntryBypass: {
  minTeamTier: 'top',
  minVrsScore: 155,
  reason: 'major-standing',
}
```

含义：

- 普通 pro 队伍需要 `iem-main` 票。
- top 队伍且 VRS 达标，可以直接进入 IEM Major。
- IEM Major 不再通过打进四强或夺冠继续发 `iem-main`，Major 成绩转化为世界排名、历史成就和后续邀请权重。

## Eligibility Rules

报名判断顺序：

1. 检查玩家阶段是否在 `tournament.stages` 中。
2. 检查战队档位是否满足 `teamRequirement`。
3. 检查 fame / VRS / points 门槛。
4. 如果没有 `qualificationTargets`，可报名。
5. 如果有 `qualificationTargets`：
   - 先检查玩家/战队是否持有资格票。
   - 没有票时检查 `directEntryBypass`。
   - 两者都不满足则不可报名。

直通规则只绕过“资格票”，不绕过其他门槛。

## UI Behavior

赛事卡片需要区分三种状态：

- `持票可参加`
- `排名直通`
- `缺少资格`

示例：

```text
PGL Closed Qualifier · 封闭预选
排名直通 · 职业队 VRS 92 满足直通要求
```

```text
PGL Major · Major
缺少资格 · 需要 PGL正赛资格 / 或顶级战队 VRS 150+
```

```text
IEM Major · Major
排名直通 · 顶级战队 VRS 162 满足直通要求
```

资格要求展示也要避免让玩家误解：

```text
资格要求 · PGL正赛资格 / 顶级战队排名直通
```

```text
资格要求 · IEM正赛资格 / 顶级战队排名直通
```

## Data Changes

### World Clubs

扩展 `backend/src/data/clubs.ts` 的静态队伍模板：

- 新增至少 4 支 youth 队。
- 新增至少 9 支 semi-pro 队。
- 新增至少 7 支 pro 队。
- 新增至少 5 支 top 队。

新增队伍只需要保持现有 `Club` 数据结构：

```ts
{
  id: 'club-example-top',
  name: 'Example Esports',
  tag: 'EXP',
  region: '欧洲',
  tier: 'top',
  requiredStage: 'pro',
  requiredFame: 30,
  baseSalary: 100,
  salaryRange: [80, 140],
}
```

`ensureWorldClubPool` 当前会把非 rival 静态队加入 `relevantClubIds` 或 `staticClubIds`，所以新增静态队伍会自然进入世界模拟池。需要验证抽象赛事 tick 的 `.slice(0, 32)` 是否仍合理：如果队伍池扩展到 41+，第一阶段可以把世界赛事候选上限从 32 提高到 48，避免新增队伍长期没有抽象结果。

### BLAST

移除以下正赛的 `blast-main` 节点奖励：

- `BLAST Bounty`
- `BLAST Open`
- `BLAST Rivals`

保留：

- `BLAST Open Closed Qualifier` 晋级决赛奖励 `blast-main`
- A 级赛事产出 `blast-closed`

### PGL

保留：

- A 级赛事产出 `pgl-open`
- PGL Open Qualifier 产出 `pgl-closed`
- PGL Closed Qualifier 产出 `pgl-main`

新增：

- PGL Closed Qualifier 支持 pro + VRS 直通。
- PGL Major 支持 top + VRS 直通。

移除或调整：

- PGL Major 自身不应继续发 `pgl-main` 作为核心奖励。Major 成绩应转化为 VRS、声望、历史成就和下赛季邀请权重。第一阶段可先移除 Major 内部 `pgl-main` 奖励，后续再设计 `major-invite` 或赛季邀请权。

### IEM

保留：

- A 级赛事产出 `iem-open`
- IEM Open Qualifier 产出 `iem-main`
- IEM 正赛和 IEM Major 消耗 `iem-main`

新增：

- IEM 正赛支持 pro + VRS 直通。
- IEM Major 支持 top + VRS 直通。

移除或调整：

- IEM 正赛不再奖励 `iem-main`。
- IEM Major 不再奖励 `iem-main`。Major 成绩应转化为 VRS、声望、历史成就和后续邀请权重。

## Save Compatibility

现有存档的 `qualificationSlots`、`teamQualificationSlots` 不需要迁移。

新增 `directEntryBypass` 是赛事配置字段，不写入存档。

旧存档已有的 `blast-main`、`pgl-main` 票继续有效，直到过期或被使用。

## Testing

新增或更新测试：

- 世界战队模板总数不少于 41。
- 固定 youth 队不少于 8，不把 `club-rival-semi` 这类映射队计入最低数量。
- 固定 semi-pro 队不少于 12，不把 `club-rival-semi` 计入最低数量。
- 固定 top 队不少于 8，不把 `club-rival-top` 计入最低数量。
- 固定 pro 队不少于 10，不把 `club-rival-pro` 计入最低数量。
- `ensureWorldClubPool` 能把新增队伍纳入 `relevantClubIds` 或 `staticClubIds`。
- 地区分布应尽量逼近建议分布，且不得长期只集中在单一区域。
- `s-main` 正赛不奖励通用 `s-main` 票。
- BLAST 正赛不奖励 `blast-main` 票。
- BLAST Closed Qualifier 仍奖励 `blast-main`。
- IEM 正赛不奖励 `iem-main` 票。
- IEM Major 不奖励 `iem-main` 票。
- IEM Open Qualifier 仍奖励 `iem-main`。
- PGL Open Qualifier 仍奖励 `pgl-closed`。
- PGL Closed Qualifier 仍奖励 `pgl-main`。
- pro 队伍 VRS 达标时，没有 `pgl-closed` 票也能报名 PGL Closed Qualifier。
- pro 队伍 VRS 不达标且没有票时，不能报名 PGL Closed Qualifier。
- top 队伍 VRS 达标时，没有 `pgl-main` 票也能报名 PGL Major。
- pro 队伍不能仅靠 pro 档位绕过 PGL Major 的 `pgl-main` 资格。
- pro 队伍 VRS 达标时，没有 `iem-main` 票也能报名 IEM 正赛。
- top 队伍 VRS 达标时，没有 `iem-main` 票也能报名 IEM Major。
- pro 队伍不能仅靠 pro 档位绕过 IEM Major 的 `iem-main` 资格。
- 前端赛事卡片能显示“排名直通”而不是只显示“资格缺失”。

## Implementation Order

1. 增加赛事数据测试，锁定 BLAST / PGL / IEM 不再出现同级自循环奖励。
2. 增加世界战队池规模测试，锁定总数、固定 youth/semi-pro/pro/top 数量与地区建议分布。
3. 扩展 `CLUBS` 静态队伍，补足 youth / semi-pro / pro / top 世界生态。
4. 评估并调整世界赛事抽象 tick 候选上限，避免新增队伍长期不参与模拟。
5. 扩展 `Tournament` 类型，增加 `directEntryBypass`。
6. 更新 `tournamentEligibility.ts`，让 direct entry 只绕过资格票检查。
7. 更新 PGL Closed Qualifier 和 PGL Major 配置。
8. 更新 IEM 正赛和 IEM Major 配置。
9. 移除 BLAST 正赛同级 `blast-main` 奖励。
10. 移除 IEM 正赛和 IEM Major 同级 `iem-main` 奖励。
11. 更新前端类型。
12. 更新 `MatchPanel` 展示文案。
13. 跑后端资格测试、赛事数据测试、世界战队测试、前端 typecheck。

## Risks

- VRS 阈值过低会让职业队太容易跳过预选。
- VRS 阈值过高会让玩家升进职业队后仍然像二线队一样打 open。
- `directEntryBypass` 如果绕过了 teamRequirement，会破坏赛事层级。因此实现必须只绕过资格票，不绕过队伍档位和积分要求。
- BLAST 正赛移除资格奖励后，节点奖励信息会变少。后续可用 VRS、声望、邀约权重补足。
- 世界队伍池扩展后，如果抽象赛事 tick 仍只处理少量候选队，新增队伍可能长期没有 recentResults。需要同步调整候选上限或选择策略。
- 新增 top 队过多且 baseline 过高可能挤压玩家队伍排行榜空间。需要用 baseline 范围和赛事结果分布控制头部密度。
- 如果 youth / semi-pro 队数量不足，C/B/A 赛事会重新陷入“总是那几支队”的问题，前半段成长线会失真。
- 如果地区配比失衡，世界排行榜会继续呈现单一区域统治，抽象赛事的地域感仍然不够。APAC 不能再按单一强区处理，必须区分蒙古、中国、大洋洲、东南亚的强弱层次。

## Acceptance Criteria

- `CS Asia Championships`、BLAST 正赛、IEM 正赛、Major、其他 S 正赛不再显示同级正赛资格奖励。
- PGL Closed Qualifier 对高 VRS pro 队显示“排名直通”。
- PGL Major 对高 VRS top 队显示“排名直通”。
- IEM 正赛对高 VRS pro 队显示“排名直通”。
- IEM Major 对高 VRS top 队显示“排名直通”。
- semi-pro 队仍需要通过 A 赛和 open qualifier 获得上升资格。
- 现有持票逻辑仍然有效。
- 世界战队池总数不少于 41，固定 youth 队不少于 8，固定 semi-pro 队不少于 12，固定 pro 队不少于 10，固定 top 队不少于 8。
- 地区分布应尽量逼近建议分布，且不应长期只集中在单一区域。
- C/B/A/S/Major 各档位都有足够的候选队，不再长期只由少量固定队轮转。
