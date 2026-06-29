# 赛后输比赛事件池设计

日期：2026-06-29
状态：扩展设计已确认，待实现计划

## 目标

为赛事上下文系统新增一组“输比赛后的赛后事件”，让失败不只表现为结算结果，而能带出复盘、更衣室情绪、队伍信任、外界压力和后续准备。

本设计聚焦“完整赛后失败系统”，不做多步事件链，但要让事件从具体比赛结果中长出来：

- 技术复盘和成长收益要独立于情绪事件。
- 更衣室互相指责和互相鼓励都要存在，避免输比赛固定变成负面叙事。
- 事件结果主要影响压力、疲劳、手感、经验成长、团队信任和团队默契。
- 赛后事件需要按比分差、个人 rating、KDA、团队关系和淘汰状态精确匹配。
- 匹配字段只服务赛后上下文，不参与赛事模拟强度、胜率或结算。

## 现有系统基础

当前 `TournamentContextEventDef` 已支持这些赛事情境条件：

- `contextPhase: ['post-match']`
- `requireMatchResult: 'loss'`
- `requireTeam`
- `requireChampion`
- `minStress`
- `minFatigue`
- `maxTeamTrust`
- `travelRequired`

当前 `TournamentContextMatchResult` 已保存赛后结果数据：

- `teamScore`
- `enemyScore`
- `kills`
- `deaths`
- `assists`
- `rating`
- `headshotRate`

因此本次设计不需要新增赛事结算字段，但需要让事件匹配器使用这些已存在的数据。

## 赛后匹配字段

在 `TournamentContextEventDef` 上扩展以下字段：

```ts
minTeamScore?: number;
maxTeamScore?: number;
minEnemyScore?: number;
maxEnemyScore?: number;
minRoundDiff?: number;
maxRoundDiff?: number;
minPlayerRating?: number;
maxPlayerRating?: number;
minKdDiff?: number;
maxKdDiff?: number;
minRecentTournamentLosses?: number;
postMatchAny?: TournamentContextPostMatchCondition[];
```

其中 `postMatchAny` 用于表达 OR 条件。顶层字段仍然是 AND 语义；如果事件需要“rating 达标或 K-D 达标”，不要把两个字段都放在顶层，而是写成 `postMatchAny`。

```ts
interface TournamentContextPostMatchCondition {
  minTeamScore?: number;
  maxTeamScore?: number;
  minEnemyScore?: number;
  maxEnemyScore?: number;
  minRoundDiff?: number;
  maxRoundDiff?: number;
  minPlayerRating?: number;
  maxPlayerRating?: number;
  minKdDiff?: number;
  maxKdDiff?: number;
}
```

计算规则：

```ts
roundDiff = Math.abs(teamScore - enemyScore);
kdDiff = kills - deaths;
```

字段语义：

- `minTeamScore` / `maxTeamScore`：限制己方比分，用于识别惨败或低得分失败。
- `minEnemyScore` / `maxEnemyScore`：限制对手比分，通常用于比分形态判断。
- `minRoundDiff` / `maxRoundDiff`：限制比分差，用于区分惜败和惨败。
- `minPlayerRating` / `maxPlayerRating`：限制个人 rating，用于识别尽力局或拉胯局。
- `minKdDiff` / `maxKdDiff`：限制击杀死亡差，用于辅助 rating 判断。
- `minRecentTournamentLosses`：用于后续连败压力。本次可以先写入类型和文档，若没有可靠历史统计，可暂不启用对应事件。
- `postMatchAny`：至少满足其中一个条件组即可通过，用于表达 OR 条件。

这些字段只在 `contextPhase: ['post-match']` 且 `lastMatchResult` 存在时参与匹配。没有 `lastMatchResult` 时，带有这些字段的事件不能命中。

## 失败画像

赛后失败事件按失败画像分组，避免事件文案和比赛结果冲突。

### 惜败

建议条件：

- `requireMatchResult: 'loss'`
- `maxRoundDiff: 3`

适合事件：

- `tournament-context-loss-close-rounds`
- `tournament-context-loss-clutch-regret`

叙事重点：几个关键回合、残局处理、道具 timing、临场选择。

### 惨败

建议条件：

- `postMatchAny: [{ minRoundDiff: 7 }, { maxTeamScore: 6 }]`

适合事件：

- `tournament-context-loss-system-exposed`
- `tournament-context-loss-coach-review`

叙事重点：体系被打穿、对手准备更充分、教练组点名复盘。

### 个人尽力局

建议条件：

- `postMatchAny: [{ minPlayerRating: 1.15 }, { minKdDiff: 5 }]`

适合事件：

- `tournament-context-loss-carry-not-enough`
- `tournament-context-loss-silent-respect`

叙事重点：玩家表现够好，但队伍没有赢；队友的认可、无力感和后续责任。

### 个人拉胯局

建议条件：

- `postMatchAny: [{ maxPlayerRating: 0.85 }, { maxKdDiff: -5 }]`

适合事件：

- `tournament-context-loss-underperformed`

叙事重点：自己没有打出来、被针对、角色执行失败、赛后自我修正。

### 团队关系风险局

建议条件：

- `requireTeam: true`
- `maxTeamTrust: 60`

适合事件：

- `tournament-context-loss-locker-blame`

叙事重点：分锅、承担责任、指出问题、控制更衣室情绪。

### 团队凝聚局

建议条件：

- `requireTeam: true`

适合事件：

- `tournament-context-loss-team-rally`

叙事重点：输后互相鼓励，失败变成团队关系修复机会。

### 淘汰出局局

建议条件：

- `requireFinalStage: true`
- `requireMatchResult: 'loss'`

适合事件：

- `tournament-context-loss-elimination-walkout`

叙事重点：离场通道、赛季目标受挫、短期压力和长期经验。

### 外界压力局

建议条件：

- `stages: ['second', 'pro']`
- 可选 `minStress: 45`

适合事件：

- `tournament-context-loss-public-pressure`

叙事重点：解说、粉丝、社媒、外部评价。

## 事件池

所有新增事件都使用：

```ts
type: 'tournament-context'
contextPhase: ['post-match']
requireMatchResult: 'loss'
```

### 1. 赛后录像复盘

事件 ID：`tournament-context-loss-demo-review`

用途：提供稳定的技术复盘入口，让输比赛可以换来成长。

建议条件：

- `stages: ['rookie', 'youth', 'second', 'pro']`
- `difficulty: 2`
- 不要求有队伍

建议选择：

- `review-key-rounds`：复盘关键回合。成功获得少量经验成长或临时战术收益，失败增加疲劳或压力。
- `skip-to-reset`：先恢复状态。成功降低压力/疲劳，失败只是轻微恢复，不给成长收益。

倾向属性：

- `intelligence`
- `experience`
- `mentality`

可用 trait：

- `tactical`、`igl`、`steady` 加成。
- `impulsive` 或类似冲动特质可作为惩罚项，如果现有 trait 池支持。

### 2. 差一点的关键分

事件 ID：`tournament-context-loss-close-rounds`

用途：表达“不是完全打不过，而是关键分没处理好”的失败类型。

建议条件：

- `maxRoundDiff: 3`
- `stages: ['rookie', 'youth', 'second', 'pro']`
- `difficulty: 2`

建议选择：

- `isolate-utility-timing`：复盘道具 timing。成功获得经验成长或短期战术准备 buff。
- `focus-aim-duels`：回到对枪细节。成功提升手感，失败增加压力或 tilt。

### 3. 关键残局没收住

事件 ID：`tournament-context-loss-clutch-regret`

用途：惜败时强调残局、关键枪和最后几回合的心理负担。

建议条件：

- `maxRoundDiff: 3`
- `stages: ['youth', 'second', 'pro']`
- `difficulty: 3`

建议选择：

- `replay-clutch-decisions`：回放残局决策。成功增加经验，失败增加压力。
- `accept-and-reset`：承认当时选择，尽快从懊悔里出来。成功降低 tilt，失败没有成长收益。

### 4. 体系被打穿

事件 ID：`tournament-context-loss-system-exposed`

用途：惨败时表达不是一两个枪法失误，而是整体战术和准备被压制。

建议条件：

- `postMatchAny: [{ minRoundDiff: 7 }, { maxTeamScore: 6 }]`
- `stages: ['youth', 'second', 'pro']`
- `difficulty: 4`

建议选择：

- `map-the-failure-pattern`：梳理被针对的模式。成功获得经验或战术 buff，失败增加疲劳。
- `call-out-prep-gap`：承认准备差距。成功提升团队默契，失败降低团队信任。

### 5. 教练组点名复盘

事件 ID：`tournament-context-loss-coach-review`

用途：提供更职业化、更高风险的队内复盘场景。

建议条件：

- `requireTeam: true`
- `stages: ['second', 'pro']`
- `difficulty: 4`
- 可选 `minStress: 40`
- 可与惨败或个人拉胯画像联动，但不强制要求。

建议选择：

- `own-role-mistake`：承认自己角色内的问题。成功增加经验并提升信任，失败增加压力。
- `turn-to-system`：把问题拉回体系。成功提升默契或获得战术 buff，失败被认为在绕开责任。
- `push-back`：反驳教练判断。成功可能提升个人气场或手感，失败显著降低团队信任。

建议效果：

- 成功收益比普通复盘更高。
- 失败惩罚也更高，尤其影响 `teamTrustDelta`。

### 6. Carry 不动的夜晚

事件 ID：`tournament-context-loss-carry-not-enough`

用途：玩家表现明显不错但仍然输比赛，提供“尽力但无力”的赛后叙事。

建议条件：

- `postMatchAny: [{ minPlayerRating: 1.15 }, { minKdDiff: 5 }]`
- `stages: ['rookie', 'youth', 'second', 'pro']`
- `difficulty: 3`

建议选择：

- `keep-demanding-more`：要求自己下次做更多。成功获得经验，失败增加压力。
- `protect-team-morale`：不把失败归咎给队友。成功提升团队信任，失败让自己压力累积。

### 7. 沉默里的认可

事件 ID：`tournament-context-loss-silent-respect`

用途：队伍输了，但队友知道你打得够好，让输比赛后的团队关系有正向分支。

建议条件：

- `requireTeam: true`
- `postMatchAny: [{ minPlayerRating: 1.15 }, { minKdDiff: 5 }]`
- `stages: ['youth', 'second', 'pro']`
- `difficulty: 2`

建议选择：

- `deflect-credit`：把认可转回团队问题。成功提升信任或默契。
- `take-the-lead-next`：主动承担下一场责任。成功获得战术准备收益，失败增加压力。

### 8. 自己没打出来

事件 ID：`tournament-context-loss-underperformed`

用途：个人拉胯时触发，避免玩家明明 rating 很低却触发“队友认可你尽力”的错位事件。

建议条件：

- `postMatchAny: [{ maxPlayerRating: 0.85 }, { maxKdDiff: -5 }]`
- `stages: ['rookie', 'youth', 'second', 'pro']`
- `difficulty: 3`

建议选择：

- `own-the-bad-map`：承认这张图没打出来。成功降低队内负面影响并获得经验，失败增加压力。
- `hide-in-the-demo`：试图把问题藏进整体复盘。成功短期少受压力，失败降低团队信任。

### 9. 更衣室开始分锅

事件 ID：`tournament-context-loss-locker-blame`

用途：表达输比赛后的队内冲突，给团队信任和压力制造波动。

建议条件：

- `requireTeam: true`
- `maxTeamTrust: 60`
- 可选 `minStress: 45`
- `stages: ['youth', 'second', 'pro']`
- `difficulty: 3`

建议选择：

- `take-responsibility`：自己先担责任。成功提升团队信任，自己压力上升；失败会显得像背锅，压力和 tilt 上升。
- `name-the-problem`：直接指出战术或执行问题。成功提升默契或经验，失败降低团队信任。
- `shut-it-down`：制止争吵。成功降低压力并移除紧张标签，失败让更衣室更僵。

建议效果：

- 成功可 `teamTrustDelta: +3` 或 `teamChemistryDelta: +1`。
- 失败可 `teamTrustDelta: -3`，并添加 `locker-tension`。

### 10. 输球后的互相鼓励

事件 ID：`tournament-context-loss-team-rally`

用途：让队伍在输比赛后也可能形成正向凝聚，而不是只进入分锅。

建议条件：

- `requireTeam: true`
- `stages: ['rookie', 'youth', 'second', 'pro']`
- `difficulty: 2`
- 不设置 `maxTeamTrust`，让普通队伍也能触发

建议选择：

- `rally-room`：主动鼓励队友。成功降低压力并提高团队信任，失败只小幅增加压力。
- `quiet-reset`：安静恢复。成功降低疲劳和压力，但不给团队信任收益。

倾向属性：

- `mentality`
- `experience`
- `constitution`

可用 trait：

- `support`、`selfless`、`steady`、`clutch` 加成。

### 11. 离场通道

事件 ID：`tournament-context-loss-elimination-walkout`

用途：淘汰出局后的收束事件，让失败有阶段性重量。

建议条件：

- `requireFinalStage: true`
- `stages: ['youth', 'second', 'pro']`
- `difficulty: 4`

建议选择：

- `walk-out-together`：和队友一起离场。成功降低团队关系损伤，失败压力上升。
- `stay-and-watch`：留下看后续比赛。成功获得经验，失败增加疲劳或压力。

### 12. 赛后外界质疑

事件 ID：`tournament-context-loss-public-pressure`

用途：补充媒体、解说、粉丝评价带来的压力，尤其适合较高阶段赛事。

建议条件：

- `stages: ['second', 'pro']`
- `difficulty: 3`
- 可选 `minStress: 45`
- 不要求有队伍

建议选择：

- `give-measured-response`：克制回应。成功降低压力或维持口碑，失败增加压力。
- `stay-offline`：不看外界评价。成功降低压力和疲劳，失败可能错过调整信息。

可用 trait：

- `media-friendly`、`steady` 加成。
- `shy` 或类似回避社交特质可影响第二个选择，如果现有 trait 池支持。

## 赛后队列调度

不能把所有命中的失败事件都塞进同一场比赛的赛后队列。否则一次失败可能连续触发多次负面情绪，体验会很重，也会让事件之间互相打架。

建议规则：

- 每场失败最多入队 2-3 个 `post-match` 事件。
- 强画像事件优先于通用事件。
- 同一画像组最多入队 1 个事件。
- 强负面事件最多入队 1 个。
- 没有任何精确画像命中时，回退到 `tournament-context-loss-demo-review` 或 `tournament-context-loss-team-rally`。

建议优先级：

```text
淘汰出局
> 惨败 / 惜败
> 个人尽力 / 个人拉胯
> 团队关系
> 外界压力
> 通用复盘
```

强负面事件包括：

- `tournament-context-loss-locker-blame`
- `tournament-context-loss-underperformed`
- `tournament-context-loss-system-exposed`
- `tournament-context-loss-public-pressure`

这些事件可以在不同比赛中反复出现，但同一场失败后不应该全部同时进入队列。

建议为事件补充内部分类字段，或者在 `postMatchRefs(...)` 中维护固定分组表：

```ts
type TournamentContextEventGroup =
  | 'elimination'
  | 'close-loss'
  | 'blowout-loss'
  | 'player-carried'
  | 'player-underperformed'
  | 'team-conflict'
  | 'team-rally'
  | 'public-pressure'
  | 'generic-review';
```

如果暂时不想扩展事件定义类型，也可以先在 `postMatchRefs(...)` 内用 `Record<string, group>` 管理分组。文档推荐前者，因为事件数据和调度语义放在一起更清楚。

## 与现有事件的关系

现有事件 `tournament-context-post-loss-blame` 已覆盖“赛后分锅”，但范围偏宽，容易同时承担复盘和情绪冲突。

实现时建议二选一：

1. 保留旧事件，但降低其权重或调整文案，让它不与新事件完全重复。
2. 将旧事件改造成上面的 `tournament-context-loss-locker-blame`，并补齐触发条件和选择效果。

推荐方案是第二种，避免事件池里出现两个语义过近的“输球分锅”事件。

如果迁移旧事件 ID 会影响已有存档或测试，可以保留旧 ID 作为兼容别名，但事件池中只应有一个可被调度的“分锅”语义事件。

## 平衡原则

输比赛事件不应该只惩罚玩家。每个事件至少提供一种“用失败换成长或关系修复”的路径。

建议收益分布：

- 技术复盘类：经验成长、战术 buff、少量疲劳或压力代价。
- 情绪冲突类：团队信任波动大，个人压力波动中等。
- 鼓励恢复类：降低压力/疲劳，成长收益较少。
- 外界质疑类：主要围绕压力和媒体感受，不直接大幅影响战力。

建议避免：

- 单个失败选择同时重罚压力、疲劳、信任和手感。
- 输一场后连续触发多个强负面事件。
- 让赛后事件直接决定下一场胜负。

## 测试要求

实现后至少覆盖：

- 输比赛后可以匹配 `requireMatchResult: 'loss'` 的 `post-match` 事件。
- 赢比赛后不会匹配这些输比赛事件。
- 13:11 输或同等小比分差失败可以命中惜败类，不命中惨败类。
- 13:5 输或同等大比分差失败可以命中惨败类，不命中惜败类。
- rating 1.25 输可以命中个人尽力局，不命中个人拉胯局。
- rating 0.75 输可以命中个人拉胯局，不命中个人尽力局。
- K-D 为 +5 以上时可作为尽力局辅助条件。
- K-D 为 -5 以下时可作为拉胯局辅助条件。
- `requireTeam: true` 的事件不会给无队伍玩家触发。
- 低团队信任或高压力条件能正确筛选更衣室分锅事件。
- final stage loss 可以命中淘汰出局事件。
- 同一失败赛后队列不超过 2-3 个事件。
- 同一画像组最多入队 1 个事件。
- 强负面事件同场最多入队 1 个。
- 如果复用旧 `tournament-context-post-loss-blame`，确认不会出现重复 ID 或语义重复事件。
- 新增赛后匹配字段不参与 match simulator 胜率、对手强度或结算计算。

## 非目标

本次不实现：

- 连败事件链。
- 新 UI。
- 新赛事模拟结算字段。

连败事件链可以作为后续赛后系统第二阶段；比分差、个人数据触发和赛后队列调度属于本次设计范围。
