# 同回合长事件流程系统设计方案

落地日期：2026-06-10  
当前分支：`feature/team-management-actions`  
状态：已完成

## 1. 设计目标

当前游戏事件流程基本是：

```text
行动阶段
-> 事件阶段：处理 1 个事件
-> 回合推进
```

这个结构简单，但限制了长流程内容：

- Bo3 / Bo5 赛事无法拆成多张地图。
- 战队面试只能做成单次事件。
- 家人危机、队内冲突、赛后采访等长事件链必须跨多个回合，节奏容易被普通事件打断。
- 赛事上下文事件无法和比赛事件组成完整流程。

本设计目标是新增底层“同回合事件流程”系统：

```text
行动阶段
-> 事件阶段：事件 A
-> 事件阶段：事件 B
-> 事件阶段：事件 C
-> 长事件流程结束
-> 回合推进
```

核心目标：

- 普通随机事件仍然每回合最多一个。
- 只有系统明确创建的 `EventSequence` 才能在同一回合连续出现多个事件。
- sequence 未完成时，不推进回合、不刷新 AP、不抽普通事件。
- sequence 完成后，才进入下一回合。
- 为 Bo3 / Bo5、战队面试、家人危机、队内冲突升级、赛事上下文等系统提供统一底层能力。

## 2. 核心概念

不要把它理解成“每回合多个随机事件”。正确概念是：

```text
普通事件：单次事件，处理后推进回合。
长事件流程：由多个事件步骤组成，全部属于同一个 sequence。
```

示例：

```text
Bo3 决赛 sequence
  step 1: Map 1
  step 2: Map 2
  step 3: Map 3，必要时出现
  final: 整场比赛结算
```

```text
战队面试 sequence
  step 1: 收到面试通知
  step 2: 面试问题 1
  step 3: 面试问题 2
  final: 是否签约
```

## 3. 基础规则

### 普通回合

```text
没有 activeEventSequence：
  当前事件处理后推进回合
  刷新 AP
  抽取下一回合事件
```

### 长事件流程

```text
存在 activeEventSequence：
  当前事件处理后更新 sequence 状态
  如果 sequence 还有后续 step：
    不推进回合
    不刷新 AP
    currentEvent = sequence 下一个事件
  如果 sequence 完成：
    处理最终结算
    推进回合
    刷新 AP
    抽取下一回合事件
```

### 事件池隔离

sequence 进行期间：

- 不抽普通随机事件。
- 不插入普通 AI 事件。
- 不插入普通队内事件。
- 不插入普通生活事件。
- 只能进入 sequence 自己的下一个 step。

如果 sequence 内部需要中场调整、教练暂停、图三前沉默，也必须作为 sequence step，而不是普通事件池插入。

## 4. 数据结构

建议在 `GameSession` 上新增：

```ts
interface GameSession {
  activeEventSequence?: EventSequence;
}
```

事件流程：

```ts
interface EventSequence {
  id: string;
  type: EventSequenceType;

  currentIndex: number;
  steps: EventSequenceStep[];

  startedRound: number;
  mustCompleteInCurrentRound: boolean;

  status: 'active' | 'completed' | 'cancelled';

  context: EventSequenceContext;
}

type EventSequenceType =
  | 'tournament-series'
  | 'club-interview'
  | 'family-crisis'
  | 'team-conflict'
  | 'tournament-context'
  | 'custom';

interface EventSequenceStep {
  id: string;
  eventId?: string;
  dynamicEventKind?: EventSequenceDynamicKind;
  generatedEvent?: EventDef;

  completeSequenceAfter?: boolean;
  optional?: boolean;
  skipIf?: EventSequenceCondition;
}

type EventSequenceDynamicKind =
  | 'tournament-map'
  | 'tournament-series-decider'
  | 'interview-question'
  | 'family-crisis-step'
  | 'team-conflict-step';

type EventSequenceCondition =
  | { kind: 'series-score-reached'; wins: number }
  | { kind: 'context-flag'; key: string; value: unknown }
  | { kind: 'player-tag'; tag: string }
  | { kind: 'player-missing-tag'; tag: string };

type EventSequenceContext = Record<string, unknown>;
```

### 动态事件快照

`dynamicEventKind` 只负责说明事件如何生成，不能替代事件本身。

当某个动态 step 第一次被激活时，必须生成并保存 `generatedEvent`：

```text
激活动态 step
-> 根据 dynamicEventKind 和 context 生成 EventDef
-> 写入 step.generatedEvent
-> currentEvent 使用 generatedEvent
```

后续刷新、重载 session、重新调用 `applyChoice(...)` 时，必须优先使用 `generatedEvent`，不能重新生成。

原因：

- 地图名、对手名、比分上下文必须稳定。
- AI 生成的事件文本不能刷新后变化。
- 当前事件必须能被 `applyChoice(...)` 找回完整定义。
- 避免出现 `unknown event` 或同一步事件内容漂移。

### 回合推进约束

普通 step 不允许推进回合。只有 sequence final step 可以结束流程并推进回合。

字段语义：

```ts
completeSequenceAfter?: boolean;
```

规则：

```text
completeSequenceAfter !== true：
  结算当前 step
  不推进回合
  进入下一个 step

completeSequenceAfter === true：
  结算当前 step
  结束 sequence
  推进回合
```

不要在普通 step 上使用“结算后推进回合”的语义，否则会回到 Bo3 打一张图过一周的问题。

后续可以把 `context` 收窄为联合类型，例如：

```ts
type EventSequenceContext =
  | TournamentSeriesContext
  | ClubInterviewContext
  | FamilyCrisisContext
  | TeamConflictContext;
```

## 5. 回合推进改造

当前 `applyChoice(...)` 大概率同时承担：

```text
事件结算
状态变化
回合推进
下一事件生成
```

引入 sequence 后，需要把“是否推进回合”变成显式结果。

建议新增：

```ts
interface ApplyChoiceFlowResult {
  shouldAdvanceRound: boolean;
  nextEvent: EventDef | null;
  activeEventSequence?: EventSequence;
}
```

伪代码：

```ts
function applyChoice(session, choiceId) {
  const resolved = resolveCurrentEvent(session, choiceId);
  const nextSession = applyOutcome(session, resolved);

  if (nextSession.activeEventSequence) {
    const sequenceResult = advanceEventSequence(nextSession, resolved);

    if (sequenceResult.nextStepEvent) {
      return {
        ...nextSession,
        currentEvent: sequenceResult.nextStepEvent,
        activeEventSequence: sequenceResult.sequence,
        roundAdvanced: false,
      };
    }

    nextSession.activeEventSequence = undefined;
  }

  return advanceRoundAndPickNextEvent(nextSession);
}
```

核心变化：

- 普通事件：结算后推进回合。
- sequence 普通 step：结算后不推进回合。
- sequence final step：结算后推进回合。

## 6. 历史记录

同回合多个事件需要历史记录能表达“这些事件属于同一个流程”。

建议 `RoundResult` 增加：

```ts
interface RoundResult {
  sequenceId?: string;
  sequenceType?: EventSequenceType;
  sequenceStepIndex?: number;
  sequenceStepCount?: number;
  sequenceFinal?: boolean;
}
```

这样历史面板可以显示：

```text
Y1 W12 · Academy League Final · Bo3
  Map 1 Mirage：胜
  Map 2 Ancient：负
  Map 3 Inferno：胜
  系列赛结果：2-1
```

而不是把三张地图误认为三个不同回合。

## 7. UI 需求

事件界面需要知道当前是否在 sequence 中。

UI 应显示：

- 当前流程名称。
- 当前步骤。
- 总步骤或预计步骤。
- 已完成结果。
- 是否会在当前流程结束后推进回合。

示例：

```text
IEM Open Qualifier · Bo3
Map 2 / 最多 3
当前比分：1 - 0
地图：Ancient
```

战队面试：

```text
赛博学院面试
问题 2 / 3
```

家人危机：

```text
家人危机
阶段 1 / 3
```

## 8. Bo3 / Bo5 赛事应用

### 当前问题

当前比赛事件一次性代表整场比赛：

```text
tournament-* -> simulateMatch(...) -> 得出胜负
```

这适合 Bo1，但不适合 Bo3 / Bo5。

### 新方案

赛事定义增加：

```ts
interface TournamentStage {
  seriesType?: 'bo1' | 'bo3' | 'bo5';
  mapPool?: string[];
}
```

进入比赛周时：

```ts
if (stage.seriesType === 'bo1') {
  return synthesizeMatchEvent(...);
}

if (stage.seriesType === 'bo3' || stage.seriesType === 'bo5') {
  return createTournamentSeriesSequence(...);
}
```

Bo3 sequence：

```text
Map 1
-> Map 2
-> 如果 1:1，Map 3
-> 系列赛结算
```

Bo5 sequence：

```text
Map 1
-> Map 2
-> Map 3
-> 如果未达到 3 胜，Map 4
-> 如果仍未达到 3 胜，Map 5
-> 系列赛结算
```

### 地图模拟

第一版不做完整 Ban/Pick。

V1 只需要：

- 从地图池选地图名。
- 每张地图调用一次 `simulateMatch(...)`。
- 系列赛根据地图胜场决定最终胜负。
- 决赛可以配置 Bo5。

后续再考虑：

- Ban/Pick。
- 地图熟练度。
- 对手地图池。
- 队伍地图偏好。

## 9. Bo3 / Bo5 结算

地图事件只产生单图结果。

系列赛最终 step 统一结算：

- 赛事晋级。
- 奖金。
- 积分。
- 资格门票。
- 冠军统计。
- 世界战队模拟结果。
- 赛后上下文队列。

不能每张地图都发完整赛事奖励。

建议：

```ts
interface TournamentSeriesContext {
  tournamentId: string;
  stageIndex: number;
  seriesType: 'bo3' | 'bo5';
  maps: TournamentMapResult[];
  playerMapWins: number;
  opponentMapWins: number;
}

interface TournamentMapResult {
  mapName: string;
  won: boolean;
  teamScore: number;
  enemyScore: number;
  kills: number;
  deaths: number;
  assists: number;
  headshotRate: number;
  rating: number;
}
```

最终比赛数据可以取：

- 总 K/D/A。
- 平均 rating。
- 平均 HS%。
- 总回合。
- 系列赛比分。

### Series buff 消耗规则

Bo3 / Bo5 会让“比赛 buff”遇到放大风险。默认规则必须明确：

```text
match buff 默认按整场 series 消耗一次。
```

也就是说：

- 赛前情报、赛前计划、心理准备类 buff 默认作用于整场 Bo3 / Bo5。
- 它们不应该在每张地图各消耗一次，也不应该把效果叠三次或五次。
- 如果某个 buff 明确需要每张地图生效，必须声明 `scope: 'per-map'`。

建议扩展：

```ts
interface Buff {
  matchScope?: 'series' | 'per-map';
}
```

默认：

```text
matchScope 未声明 -> 'series'
```

消耗规则：

```text
series scope：
  series 开始时计算一次
  series final 后消耗

per-map scope：
  每张地图结算前计算
  每张地图结算后按 remainingUses 消耗
```

## 10. 赛事上下文应用

赛事上下文可以嵌入 sequence：

```text
赛前更衣室
-> Map 1
-> Map 2
-> 图三前沉默
-> Map 3
-> 赛后采访
-> 回合推进
```

但需要区分：

- `tournament-context`：赛前/赛后/更衣室事件。
- `tournament-series`：比赛地图事件。

如果上下文事件进入比赛 sequence，它就必须成为 sequence step，不能来自普通事件池。

这里的“嵌入”只允许发生在已经创建好的比赛 sequence 内部，语义上属于 `tournament-series` 的赛间步骤，而不是从 `tournamentContext.contextEventQueue` 临时抽取普通上下文事件。

边界：

```text
准备周 / 赛后周：
  可以消费 tournamentContext 队列事件

比赛周：
  只能进入 tournament-* / tournament-series
  不允许普通 tournamentContext 队列插入

tournament-series 内部：
  可以包含图间沉默、教练暂停、图三前更衣室等 step
  这些 step 必须在 sequence 创建时确定或作为 sequence 动态 step 保存 generatedEvent
```

这样既能保留比赛周最高优先级，也能支持 Bo3 / Bo5 内部的完整叙事。

## 11. 战队面试应用

当前战队面试可以从单事件升级为 sequence：

```text
收到回信
-> 面试问题 1：职业目标
-> 面试问题 2：队伍定位
-> 面试问题 3：薪资 / 角色
-> 结果：签约 / 拒绝 / 进入轮换
```

优点：

- 面试不再像一次随机检定。
- 玩家能感受到战队筛选。
- 不同战队可以有不同问题。

限制：

- 面试 sequence 进行期间不推进回合。
- 面试不能插进比赛周。
- 如果玩家已有赛事 sequence，面试必须排队。

## 12. 家人危机应用

家人危机是长事件链，适合 sequence。

示例：

```text
阶段 1：接到消息
阶段 2：决定是否回家 / 打钱 / 隐瞒
阶段 3：后续结果
```

赛事期间不能直接插入家人危机 sequence。

正确处理：

```text
赛事期间满足家人危机条件
-> family-crisis-queued
-> 当前赛事阶段结束后
-> 开始 family-crisis sequence
```

## 13. 队内冲突应用

队内冲突可以从单事件升级为短 sequence。

示例：

```text
复盘争吵
-> 私下站队
-> 教练介入 / 更衣室冷场
-> 最终影响队伍信任、队友默契、话语权
```

这样可以避免一个事件里塞太多结果，也能让“站队”更有重量。

## 14. AI 事件应用

AI 事件可以生成 sequence，但必须更严格。

AI sequence 必须声明：

```ts
{
  sequenceType: 'family-crisis' | 'team-conflict' | 'tournament-context';
  steps: Array<{
    title: string;
    choices: ...;
  }>;
  maxSteps: number;
}
```

限制：

- AI sequence 不能无限延展。
- AI sequence 不能插进比赛 sequence。
- AI sequence 不能跳过核心系统结算。
- AI sequence 每一步都必须落到已有 outcome 字段。

## 15. 优先级规则

如果已有 `activeEventSequence`：

```text
只处理 activeEventSequence 的下一步
不抽普通事件
不抽赛事上下文事件
不抽 AI 事件
```

如果没有 `activeEventSequence`：

```text
1. 比赛周赛事 sequence / match event
2. 强制状态处理
3. 已排队的系统 sequence
4. 赛事上下文事件
5. 普通系统事件
6. 普通随机事件
```

## 16. 失败和取消

sequence 需要定义取消规则。

示例：

- 玩家退赛：取消 tournament-series sequence。
- 玩家离队：取消 team-conflict sequence。
- 玩家签约成功：完成 club-interview sequence。
- 玩家进入退役结局：取消所有 sequence。

建议：

```ts
interface EventSequence {
  cancelReason?: string;
}
```

取消后要记录历史：

```text
事件流程取消：玩家退赛
```

## 17. 风险点

### 回合推进错误

最大风险是 sequence step 误推进回合，导致：

- Bo3 打一张图过一周。
- 面试问一个问题过一周。
- 家人危机被拆得太散。

必须用测试覆盖：

```text
sequence 未完成 -> round 不变
sequence 完成 -> round + 1
```

### 奖励重复发放

Bo3 / Bo5 每张地图都不能发赛事奖励。

必须保证：

```text
地图 step 只记单图数据
系列赛 final step 才发赛事奖励
```

### 普通事件插入

active sequence 期间不能插入普通事件。

必须保证：

```text
activeEventSequence 存在 -> pickNextEvent 只返回 sequence next step
```

### UI 卡死

如果 sequence step 找不到事件定义，必须 fallback：

```text
记录错误
取消 sequence
进入安全的下一回合事件
```

不能让玩家卡在无事件状态。

### 按 sequence 类型 fallback

不同 sequence 不能用同一个取消策略。

建议：

```text
tournament-series：
  如果地图 step 丢失，转成保底单场比赛结算。
  如果 final step 丢失，根据已记录地图比分结算系列赛。
  如果没有任何地图结果，按退赛结算并清理 pendingMatch。

club-interview：
  取消面试 sequence。
  保留申请冷却或进入短冷却。
  不直接签约，也不永久封死该战队。

family-crisis：
  标记 family-crisis-queued。
  延后重试。
  不直接吞掉危机。

team-conflict：
  降级为普通队内冲突事件或直接结算轻微 teamTrust 变化。

tournament-context：
  丢弃当前上下文 step。
  fallback 到默认赛前准备或赛后摘要。
```

目标不是“静默跳过错误”，而是保证玩家不会卡死，同时核心系统状态能被清理或保底结算。

## 18. 设计分层

以下 V1-V5 只表示设计依赖层级，不表示实施时可以分批交付。完整实施以 [event-sequence-tournament-context-implementation-plan.md](./event-sequence-tournament-context-implementation-plan.md) 为准。

### V1：底层 sequence

- 新增 `activeEventSequence`。
- 支持固定 step。
- 支持同回合多事件。
- 支持 step 不推进回合。
- 支持 sequence 完成后推进回合。
- 历史记录增加 sequence 字段。

### V2：赛事 Bo3 / Bo5

- 赛事阶段支持 `seriesType`。
- Bo3 / Bo5 生成 tournament-series sequence。
- 地图 step 记录单图数据。
- final step 统一赛事奖励。

### V3：战队面试 sequence

- 面试拆成多问题。
- 不同战队可以有不同问题。
- 面试结束后统一给 offer / 拒绝。

### V4：家人危机 / 队内冲突 sequence

- 长事件链从跨回合随机事件改成同回合 sequence。
- 家人危机、队内冲突可以明确阶段推进。

### V5：AI sequence

- AI 生成多步骤事件链。
- 限制最大步数。
- 强制每一步使用结构化 outcome。

## 19. 最终结论

同回合长事件流程是一个底层能力，不是赛事系统的单点功能。

它应该解决：

```text
普通事件 = 每回合一个
长流程事件 = 同回合连续多个，由 sequence 控制
```

这套能力可以支撑：

- Bo3 / Bo5。
- 多问题战队面试。
- 家人危机长事件链。
- 队内冲突升级。
- 赛事上下文从赛前到赛后完整展开。
- AI 生成多步骤事件。

实现时最重要的边界：

- sequence 未完成不推进回合。
- sequence 期间不抽普通事件。
- 系列赛奖励只在 final step 发放。
- UI 必须显示当前流程进度。
