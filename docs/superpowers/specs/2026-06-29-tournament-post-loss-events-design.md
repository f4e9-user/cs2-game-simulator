# 赛后输比赛事件池设计

日期：2026-06-29
状态：设计已确认，待实现计划

## 目标

为赛事上下文系统新增一组“输比赛后的赛后事件”，让失败不只表现为结算结果，而能带出复盘、更衣室情绪、队伍信任、外界压力和后续准备。

第一版聚焦小型事件池，不做多步事件链：

- 技术复盘和成长收益要独立于情绪事件。
- 更衣室互相指责和互相鼓励都要存在，避免输比赛固定变成负面叙事。
- 事件结果主要影响压力、疲劳、手感、经验成长、团队信任和团队默契。
- 所有事件必须使用现有 `tournament-context` 事件结构落地。

## 现有系统约束

当前 `TournamentContextEventDef` 已支持这些赛事情境条件：

- `contextPhase: ['post-match']`
- `requireMatchResult: 'loss'`
- `requireTeam`
- `requireChampion`
- `minStress`
- `minFatigue`
- `maxTeamTrust`
- `travelRequired`

第一版不新增触发器字段。以下精确条件暂不作为实现前置：

- 按比分差判断“惜败”。
- 按个人 rating 判断“自己打得差”或“自己尽力了”。
- 按连续输比赛次数判断连败压力。

如果后续需要更精确的赛后事件，可以扩展：

```ts
maxMatchRoundDiff?: number;
minMatchRoundDiff?: number;
minLastMatchRating?: number;
maxLastMatchRating?: number;
minRecentTournamentLosses?: number;
```

这些字段属于第二阶段，不进入本次事件池的最低可交付范围。

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

### 2. 更衣室开始分锅

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

### 3. 输球后的互相鼓励

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

### 4. 差一点的关键分

事件 ID：`tournament-context-loss-close-rounds`

用途：表达“不是完全打不过，而是关键分没处理好”的失败类型。

第一版触发限制：

- 由于当前系统没有比分差触发器，先作为普通输比赛事件加入。
- 文案避免写死比分，只写“几个关键回合反复出现在脑子里”。

建议条件：

- `stages: ['rookie', 'youth', 'second', 'pro']`
- `difficulty: 2`

建议选择：

- `isolate-utility-timing`：复盘道具 timing。成功获得经验成长或短期战术准备 buff。
- `focus-aim-duels`：回到对枪细节。成功提升手感，失败增加压力或 tilt。

注意：

如果之后实现 `maxMatchRoundDiff`，该事件应改为只在小比分差输比赛后触发。

### 5. 教练组点名复盘

事件 ID：`tournament-context-loss-coach-review`

用途：提供更职业化、更高风险的队内复盘场景。

建议条件：

- `requireTeam: true`
- `stages: ['second', 'pro']`
- `difficulty: 4`
- 可选 `minStress: 40`

建议选择：

- `own-role-mistake`：承认自己角色内的问题。成功增加经验并提升信任，失败增加压力。
- `turn-to-system`：把问题拉回体系。成功提升默契或获得战术 buff，失败被认为在绕开责任。
- `push-back`：反驳教练判断。成功可能提升个人气场或手感，失败显著降低团队信任。

建议效果：

- 成功收益比普通复盘更高。
- 失败惩罚也更高，尤其影响 `teamTrustDelta`。

### 6. 赛后外界质疑

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

## 与现有事件的关系

现有事件 `tournament-context-post-loss-blame` 已覆盖“赛后分锅”，但范围偏宽，容易同时承担复盘和情绪冲突。

实现时建议二选一：

1. 保留旧事件，但降低其权重或调整文案，让它不与新事件完全重复。
2. 将旧事件改造成上面的 `tournament-context-loss-locker-blame`，并补齐触发条件和选择效果。

推荐方案是第二种，避免事件池里出现两个语义过近的“输球分锅”事件。

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
- `requireTeam: true` 的事件不会给无队伍玩家触发。
- 低团队信任或高压力条件能正确筛选更衣室分锅事件。
- 如果复用旧 `tournament-context-post-loss-blame`，确认不会出现重复 ID 或语义重复事件。

## 非目标

本次不实现：

- 连败事件链。
- 按具体比分差触发的惜败事件。
- 按个人数据触发的背锅/尽力局事件。
- 新 UI。
- 新赛事模拟结算字段。

这些可以作为后续赛后系统第二阶段。
