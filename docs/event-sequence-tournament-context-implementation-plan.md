# Event Sequence + 赛事上下文实施路径

落地日期：2026-06-10  
当前分支：`feature/team-management-actions`  
状态：已完成

参考设计文档：

- [event-sequence-system-design.md](./event-sequence-system-design.md)
- [tournament-context-events-design.md](./tournament-context-events-design.md)

## 1. 总目标

本计划用于一次性完成完整玩法，而不是拆成多个版本分批交付。

一次性实现范围：

```text
Event Sequence V1
+ 赛事上下文 V1
+ Bo3 / Bo5 赛事
+ 战队面试 sequence
+ 家人危机 sequence
+ 队内冲突 sequence
+ AI sequence / AI 赛事上下文
+ 伤病与强制休养联动
```

实施时仍按以下内部顺序推进，但最终交付必须同时包含三部分：

```text
1. 先搭 Event Sequence 底层
2. 再接赛事上下文
3. 最后接 Bo3 / Bo5
4. 迁移战队面试、家人危机、队内冲突到 sequence
5. 接入 AI sequence / AI 赛事上下文
6. 接入伤病与强制休养联动
7. 一次性完成整体回归
```

核心原则：

- 普通事件仍然每回合最多一个。
- 只有 `activeEventSequence` 能在同一回合连续出多个事件。
- sequence 未完成时不推进回合、不刷新 AP、不抽普通事件。
- sequence 完成后才推进回合。
- 比赛周只允许赛事比赛事件。
- Bo3 / Bo5 的赛事奖励只能在 series final step 发一次。
- 设计文档中列出的长事件链能力都必须落地，不能只完成赛事部分。

## 2. 内部步骤一：Event Sequence V1

### 目标

实现同回合长事件流程底层能力，并为赛事上下文和 Bo3 / Bo5 提供底座。

注意：该步骤不是独立交付点。完整 `/goal` 完成前，不能只停在 Event Sequence V1。

### 修改文件

```text
backend/src/types.ts
backend/src/engine/gameEngine.ts
backend/src/engine/events.ts
backend/src/engine/__tests__/eventSequence.test.ts
frontend/src/lib/types.ts
frontend/src/components/EventCard.tsx 或当前事件显示组件
frontend/src/components/HistoryPanel.tsx
```

新增文件：

```text
backend/src/engine/eventSequence.ts
```

### 后端类型

在 `backend/src/types.ts` 新增：

```ts
export interface EventSequence {
  id: string;
  type: EventSequenceType;
  currentIndex: number;
  steps: EventSequenceStep[];
  startedRound: number;
  mustCompleteInCurrentRound: boolean;
  status: 'active' | 'completed' | 'cancelled';
  context: EventSequenceContext;
  cancelReason?: string;
}

export type EventSequenceType =
  | 'test-sequence'
  | 'tournament-series'
  | 'club-interview'
  | 'family-crisis'
  | 'team-conflict'
  | 'tournament-context'
  | 'custom';

export interface EventSequenceStep {
  id: string;
  eventId?: string;
  dynamicEventKind?: EventSequenceDynamicKind;
  generatedEvent?: EventDef;
  completeSequenceAfter?: boolean;
  optional?: boolean;
  skipIf?: EventSequenceCondition;
}

export type EventSequenceDynamicKind =
  | 'tournament-map'
  | 'tournament-series-decider'
  | 'interview-question'
  | 'family-crisis-step'
  | 'team-conflict-step';

export type EventSequenceCondition =
  | { kind: 'series-score-reached'; wins: number }
  | { kind: 'context-flag'; key: string; value: unknown }
  | { kind: 'player-tag'; tag: string }
  | { kind: 'player-missing-tag'; tag: string };

export type EventSequenceContext = Record<string, unknown>;
```

在 `GameSession` 新增：

```ts
activeEventSequence?: EventSequence;
```

在 `RoundResult` 新增：

```ts
sequenceId?: string;
sequenceType?: EventSequenceType;
sequenceStepIndex?: number;
sequenceStepCount?: number;
sequenceFinal?: boolean;
```

### 新增 eventSequence 引擎

`backend/src/engine/eventSequence.ts` 提供：

```ts
export function getCurrentSequenceStep(sequence: EventSequence): EventSequenceStep | null;
export function resolveSequenceStepEvent(sequence: EventSequence): EventDef | null;
export function advanceEventSequence(sequence: EventSequence, result: RoundResult): EventSequenceAdvanceResult;
export function cancelEventSequence(sequence: EventSequence, reason: string): EventSequence;
export function isSequenceFinalStep(sequence: EventSequence): boolean;
```

V1 只支持：

- 固定 `eventId` step。
- 已保存的 `generatedEvent`。
- `completeSequenceAfter` 作为 final step 判断。
- 简单跳过条件。

底层 V1 阶段暂不实现：

- Bo3 / Bo5。
- AI sequence。
- 复杂动态事件生成。

这不是最终交付边界。上述能力必须在本实施计划后续步骤内补齐，不能以“Event Sequence V1 已完成”作为整个 `/goal` 的完成条件。

### 改造 applyChoice

`backend/src/engine/gameEngine.ts` 中，事件结算后改为：

```text
如果 activeEventSequence 存在：
  advanceEventSequence(...)
  如果还有 next step：
    currentEvent = next step event
    round 不变
    AP 不刷新
    history 追加本 step
    返回
  如果 sequence 完成：
    清 activeEventSequence
    继续原本 round advance 流程

如果 activeEventSequence 不存在：
  走原本普通事件流程
```

注意：

- 先保证普通事件完全不变。
- sequence 普通 step 不能推进回合。
- 只有 final step 结束后推进回合。
- active sequence 期间不能调用普通 `pickEvent(...)`。

### Sequence 期间操作锁

`activeEventSequence` 存在时，玩家处于事件流程中，不能进行任何非 sequence 操作。

必须禁止：

```text
applyAction
shop purchase
team management action
tournament signup / withdraw
leave team
普通 debug 强制切事件
```

允许：

```text
applyChoice 当前 sequence step
只读查询接口
debug 查看当前 sequence 状态
```

后端所有相关入口都要检查：

```ts
if (session.activeEventSequence) {
  throw new Error('当前事件流程未结束，不能进行其他操作');
}
```

比赛 series 中尤其重要，避免玩家在 Map 1 和 Map 2 之间插入训练、商店或退赛等操作。

### 测试用 sequence

新增测试专用事件：

```text
test-sequence-step-1
test-sequence-step-2
test-sequence-step-3
```

或直接在测试里构造 `generatedEvent`。

测试：

```text
step 1 选择后 round 不变
step 2 选择后 round 不变
step 3 final 后 round + 1
三个 history 都有同一个 sequenceId
sequenceStepIndex 正确
sequenceFinal 只在 final step 为 true
active sequence 期间不抽普通事件
step 找不到时不会卡死
```

### 前端最小适配

同步 `frontend/src/lib/types.ts`。

事件卡或事件页面显示：

```text
流程中：2 / 3
```

历史面板能把同一个 sequenceId 的记录显示为同一组。

### 完成标准

```text
npm run typecheck 通过
eventSequence.test.ts 通过
现有测试不回退
普通事件行为不变
同回合 sequence 可以跑完
```

## 3. 内部步骤二：赛事上下文 V1

### 目标

实现报名后、准备周、赛后上下文事件，并与 Event Sequence 底层兼容。

注意：该步骤不是独立交付点。完整 `/goal` 完成前，必须继续实现 Bo3 / Bo5。

### 修改文件

```text
backend/src/types.ts
backend/src/routes/game.ts
backend/src/engine/gameEngine.ts
backend/src/engine/events.ts
backend/src/data/events/index.ts
backend/src/engine/__tests__/tournamentContext.test.ts
frontend/src/lib/types.ts
```

新增文件：

```text
backend/src/engine/tournamentContext.ts
backend/src/data/events/tournamentContext.ts
```

### 类型

新增：

```ts
export interface TournamentContext {
  tournamentId: string;
  stageIndex: number;
  signedUpAtRound: number;
  signedUpAtYear: number;
  signedUpAtWeek: number;
  resolveYear: number;
  resolveWeek: number;
  phase: TournamentContextPhase;
  contextEventQueue: TournamentContextEventRef[];
  consumedContextEventIds: string[];
  lastMatchResult?: TournamentContextMatchResult;
  pressureLevel: number;
  stakesLevel: number;
  expiresAtRound?: number;
}

export type TournamentContextPhase =
  | 'signup'
  | 'pre-match'
  | 'match'
  | 'post-match'
  | 'complete';
```

建议挂在 `Player`：

```ts
tournamentContext?: TournamentContext;
```

### 报名接入

`backend/src/routes/game.ts` 报名成功后：

```text
创建 pendingMatch
创建 tournamentContext
入队 signup / pre-match context 候选
不覆盖当前 currentEvent
```

如果已有旧 `tournamentContext`：

```text
绑定未完成 pendingMatch -> 禁止报名
只剩赛后 context -> 丢弃或降级，允许报名
```

### 统一 next event

新增或抽出：

```ts
pickNextEvent(session)
```

优先级：

```text
1. activeEventSequence next step
2. 比赛周赛事事件
3. 强制状态处理
4. queued required sequence
5. tournamentContext event
6. 普通系统事件
7. 普通随机事件
```

比赛周规则：

```text
正常状态 -> tournament-* match event
restRounds > 0 -> injury-aware tournament event
```

排队项需要拆成两类，避免把单次系统事件误接成 sequence。

`queuedSequence` 包括：

```text
family-crisis-queued
club-interview-queued
team-conflict-queued
```

`queuedSystemEvent` 包括：

```text
bailout-queued
promotion-narrative-queued
```

这些队列不能压过比赛周赛事事件，也不能压过 active sequence。但在没有 active sequence 且不处于比赛周时，应优先于普通随机事件启动。

### 替代 buildTournamentPrepEvent

当前：

```ts
if (player.pendingMatch) return buildTournamentPrepEvent(...)
```

改成：

```text
pendingMatch 存在且不是比赛周：
  优先 pickTournamentContextEvent(...)
  如果没有可用上下文事件：
    fallback buildDefaultTournamentPrepEvent(...)
```

### 第一批上下文事件

`backend/src/data/events/tournamentContext.ts` 先做：

```text
tournament-context-goal-setting
tournament-context-locker-silence
tournament-context-extra-practice-dispute
tournament-context-pre-match-interview
tournament-context-post-loss-blame
tournament-context-close-win-silence
tournament-context-champion-resource-split
```

先少量事件，重点打通机制。

### 无战队玩家分支

无战队玩家可以触发赛事上下文，但不能写入队伍字段。

无战队上下文只允许影响：

```text
stress
fatigue
feel
fame
match-only buff
无队伍比赛协同修正
```

禁止影响：

```text
teamTrust
teammate.chemistry
pendingDeparture.pressure
队伍默契
队友默契
```

无战队事件文案可以写“临时队友”“临时队伍”，但这只是叙事层概念，不创建真实 roster。

### 赛后接入

比赛结算后：

```text
写入 tournamentContext.lastMatchResult
phase = post-match
enqueuePostMatchContextCandidates(...)
如果 pendingMatch 清空，tournamentContext 仍保留到 expiresAtRound
```

### 不允许压过赛事上下文的事件

赛事期间排队延后：

```text
家人危机
破产救济
战队回信 / 面试
晋级叙事
普通 AI
普通 team/media/life
```

### 测试

```text
报名后创建 tournamentContext
准备周优先返回 tournament-context
无上下文时 fallback 默认赛前准备
比赛周只返回赛事比赛事件
restRounds + 比赛周返回 injury-aware tournament event
赛后创建 post-match context
赛后 context 过期清理
家人危机 / 破产救济 / 面试不压过赛事上下文
无战队赛事上下文不写 teamTrust / teammate.chemistry / pendingDeparture
```

### 完成标准

```text
赛事准备周有上下文事件
比赛周不会被上下文打断
赛后事件能承接比赛结果
旧赛前准备仍可 fallback
普通事件不伪装赛事上下文
```

## 4. 内部步骤三：Bo3 / Bo5

### 目标

用 Event Sequence 实现多地图系列赛，并接入赛事上下文、赛后上下文、历史记录和 UI。

### 修改文件

```text
backend/src/types.ts
backend/src/data/tournaments.ts
backend/src/data/tournaments.ts 或 match event synthesis 相关代码
backend/src/engine/gameEngine.ts
backend/src/engine/matchSimulator.ts
backend/src/engine/__tests__/tournamentSeries.test.ts
frontend/src/lib/types.ts
frontend/src/components/MatchPanel.tsx
frontend/src/components/HistoryPanel.tsx
```

新增文件：

```text
backend/src/engine/tournamentSeries.ts
```

### 赛事定义

`TournamentStage` 增加：

```ts
seriesType?: 'bo1' | 'bo3' | 'bo5';
mapPool?: string[];
```

建议初始配置：

```text
C/B 普通阶段：bo1
B 决赛：bo3
A 淘汰赛：bo3
S 正赛：bo3
Major 决赛：bo5
```

### 进入比赛周

```text
seriesType === bo1：
  保持旧 tournament-* 逻辑

seriesType === bo3 / bo5：
  createTournamentSeriesSequence(...)
  currentEvent = Map 1 event
```

### tournamentSeries 引擎

实现：

```ts
createTournamentSeriesSequence(...)
buildTournamentMapEvent(...)
resolveTournamentMap(...)
advanceTournamentSeries(...)
finalizeTournamentSeries(...)
aggregateSeriesStats(...)
```

### 地图 step

每张地图：

```text
调用 simulateMatch(...)
记录地图结果
更新 playerMapWins / opponentMapWins
判断是否达到胜场
未结束 -> 下一张地图
已结束 -> final step
```

Bo3：

```text
先到 2 胜结束
```

Bo5：

```text
先到 3 胜结束
```

### final step

只有 final step 做：

```text
赛事晋级
奖金
积分
资格门票
冠军统计
排行榜 / 世界战队积分
赛后上下文
pendingMatch 推进或清空
round 推进
```

地图 step 禁止发这些奖励。

### 地图 step outcome 白名单

地图 step 只允许写入“单图过程状态”，不能写入完整赛事奖励。

允许：

```text
series context 内的 map result
series context 内的 playerMapWins / opponentMapWins
单图疲劳 / 压力 / 手感变化
单图比赛经验的临时累计值
per-map buff 消耗
history 中的单图展示字段
```

禁止：

```text
moneyDelta
fameDelta
qualificationDelta / tickets
champion count
tournament participation completion
leaderboard / VRS points
world club points
pendingMatch stage advance / clear
series-scope buff 消耗
post-match tournamentContext enqueue
```

这些字段只能在 series final step 统一结算。实现上建议把地图 step 的结算结果写入 `TournamentSeriesContext.pendingRewards` 或聚合上下文，final step 再转成真实 outcome。

### buff 规则

```text
matchScope 未声明 -> series
series buff：整场系列赛生效一次，final 后消耗
per-map buff：每张地图结算后消耗
```

具体规则：

```text
Bo1：
  比赛前读取 match buff
  比赛结算后消耗 remainingUses

Bo3 / Bo5 series-scope：
  series 创建时冻结可用 match buff 快照
  每张地图使用同一份快照
  series final 后统一消耗一次

Bo3 / Bo5 per-map：
  每张地图结算前读取当前可用 buff
  当前地图结算后消耗一次
```

冻结快照必须保存在 `TournamentSeriesContext`，避免刷新页面或 Map 1 后状态变化导致 Map 2 / Map 3 使用不同的 series-scope 加成。

### 前端

比赛卡显示：

```text
Bo3 · Map 2 / 最多 3
当前比分：1 - 0
地图：Ancient
```

结果面板显示：

```text
系列赛比分：2 - 1
地图结果列表
总 KDA
平均 Rating
平均 HS%
```

### 测试

```text
Bo3 2:0 只打两张图
Bo3 1:1 生成第三张图
Bo5 先到 3 胜结束
地图 step 不发奖励
final step 只发一次奖励
sequence 未结束 round 不变
final 后 round + 1
pendingMatch 正确推进或清理
history 同一个 sequenceId
series buff 默认只消耗一次
per-map buff 每图消耗
Map1 后保存并重新读取 session，Map2 不重新抽地图或重生成事件
```

### 完成标准

```text
Bo1 不回退
Bo3 / Bo5 可以同回合打完
地图数据正确聚合
奖励只发一次
赛事阶段推进正确
UI 能读懂系列赛进度
```

## 5. 内部步骤四：长事件链迁移

### 目标

把设计文档中明确适合 sequence 的长事件链接入同回合事件流程。

必须实现：

```text
战队面试 sequence
家人危机 sequence
队内冲突 sequence
```

### 战队面试 sequence

参考设计：

```text
收到回信
-> 面试问题 1：职业目标
-> 面试问题 2：队伍定位
-> 面试问题 3：薪资 / 角色
-> 结果：签约 / 拒绝 / 进入轮换
```

修改文件：

```text
backend/src/data/events/tryout.ts
backend/src/data/events/chains.ts
backend/src/engine/gameEngine.ts
backend/src/engine/eventSequence.ts
backend/src/engine/__tests__/clubApplication.test.ts
frontend/src/components/TeamOfferModal.tsx 或相关面试 UI
```

要求：

- 面试 sequence 进行期间不推进回合。
- 面试不能插进比赛周。
- 如果已有赛事 sequence，面试必须排队。
- 面试结束后统一生成 offer / 拒绝 / 轮换定位。
- 旧的单事件面试逻辑要么迁移，要么作为 fallback。

测试：

```text
面试多 step 同回合完成
面试中不推进 round
最终 offer 只生成一次
比赛周不会插入面试
已有赛事 sequence 时面试排队
```

### 家人危机 sequence

参考设计：

```text
阶段 1：接到消息
阶段 2：决定是否回家 / 打钱 / 隐瞒
阶段 3：后续结果
```

修改文件：

```text
backend/src/data/events/chains.ts
backend/src/engine/events.ts
backend/src/engine/gameEngine.ts
backend/src/engine/eventSequence.ts
backend/src/engine/__tests__/familyCrisis.test.ts
```

要求：

- 家人危机不压过赛事上下文。
- 赛事期间满足触发条件时，标记 `family-crisis-queued`。
- 当前赛事阶段结束后，启动家人危机 sequence。
- sequence 不被普通事件打断。
- 不能因为 fallback 直接吞掉危机。

测试：

```text
赛事期间家人危机只排队
赛事阶段结束后启动家人危机 sequence
家人危机 sequence 同回合完成或按设计完成
危机结果只结算一次
```

### 队内冲突 sequence

参考设计：

```text
复盘争吵
-> 私下站队
-> 教练介入 / 更衣室冷场
-> 最终影响队伍信任、队友默契、话语权
```

修改文件：

```text
backend/src/data/events/team.ts
backend/src/engine/events.ts
backend/src/engine/gameEngine.ts
backend/src/engine/eventSequence.ts
backend/src/engine/__tests__/teamManagement.test.ts
```

要求：

- 支持指挥 / 支持明星 / 调停的后续事件链。
- 站队结果影响双方默契。
- sequence 期间不插入普通 team 事件。
- 如果玩家离队，取消 team-conflict sequence 并记录原因。

测试：

```text
队内冲突 sequence 同回合连续推进
站队影响双方默契
离队时 sequence 取消
普通队内事件不会插入 active sequence
```

## 6. 内部步骤五：AI sequence / AI 赛事上下文

### 目标

实现设计文档中的 AI 多步骤事件能力，以及 AI 赛事上下文候选。

修改文件：

```text
backend/src/ai/eventGenerator.ts
backend/src/ai/eventCache.ts
backend/src/ai/prompts.ts
backend/src/engine/events.ts
backend/src/engine/eventSequence.ts
backend/src/engine/tournamentContext.ts
backend/src/routes/debug.ts
backend/src/engine/__tests__/aiEvents.test.ts
backend/src/ai/__tests__/
```

### AI sequence 要求

AI 生成 sequence 必须声明：

```ts
{
  sequenceType: 'family-crisis' | 'team-conflict' | 'tournament-context';
  steps: Array<{
    title: string;
    choices: unknown[];
  }>;
  maxSteps: number;
}
```

限制：

- AI sequence 不能无限延展。
- AI sequence 不能插进比赛 sequence。
- AI sequence 不能跳过核心系统结算。
- AI sequence 每一步都必须落到已有 outcome 字段。
- 动态 step 必须保存 `generatedEvent` 快照，刷新后不能重新生成。

### AI 赛事上下文要求

AI 赛事上下文事件必须声明：

```ts
{
  contextPhase: 'signup' | 'pre-match' | 'post-match';
  tournamentTier?: TournamentTier;
  triggerReason: string;
}
```

限制：

- AI 赛事上下文不能出现在比赛周。
- AI 赛事上下文只能进入当前 `tournamentContext.contextEventQueue`。
- 如果到比赛周仍未消费，应推迟到赛后或丢弃。

测试：

```text
AI sequence 最大步数受限
AI sequence step 保存 generatedEvent
刷新后 AI step 不重新生成
AI 赛事上下文不会插入比赛周
AI 赛事上下文进入 context queue
```

## 7. 内部步骤六：伤病与强制休养联动

### 目标

实现 `tournament-context-events-design.md` 中的强制休养和比赛周冲突处理，并提升强制休养触发可见性。

修改文件：

```text
backend/src/types.ts
backend/src/data/events/rest.ts
backend/src/data/events/tournamentContext.ts
backend/src/engine/gameEngine.ts
backend/src/engine/events.ts
backend/src/engine/stateModifiers.ts
backend/src/routes/game.ts
backend/src/engine/__tests__/injuryRest.test.ts
frontend/src/components/PlayerStats.tsx
frontend/src/components/MatchPanel.tsx
```

### 比赛周伤病事件

规则：

```text
restRounds > 0 且不是比赛周：
  触发 rest 类型事件

restRounds > 0 且是比赛周：
  生成 injury-aware tournament event
```

选项：

```text
带伤上场
申请退赛
降低承担
```

要求：

- injury-aware tournament event 属于赛事比赛事件，不属于普通上下文事件。
- 不做完整替补系统。
- 退赛直接清理当前赛事或判负。
- 带伤上场会影响胜率、rating、KDA、疲劳、压力，可能延长 restRounds。

### 伤病风险链

新增中间状态：

```text
minor-injury-risk
injury-warning
injury-limited
forced-rest
```

第一版用 `player.tags` 表示这些状态，不新增复杂伤病对象。

状态含义：

```text
minor-injury-risk：轻微风险，只做 UI 提示和后续风险加权
injury-warning：明确队医警告，继续硬练可能升级
injury-limited：状态受限，比赛或训练会有惩罚
forced-rest：进入强制休养，写入 restRounds
```

新增处理函数：

```ts
applyInjuryRiskTick(player, context): Player
```

调用时机：

```text
日常行动结算后
比赛地图 / 比赛 series 结算后
带伤上场结算后
休息 / 康复服务结算后
```

触发方向：

```text
疲劳高
体能低
连续比赛
连续高 AP 训练
连续加练
```

缓解方向：

```text
休息
康复服务
体能高
人体工学椅
止痛药
```

测试：

```text
非比赛周 restRounds 触发 rest
比赛周 restRounds 触发 injury-aware tournament event
带伤上场影响比赛模拟
退赛清理 pendingMatch
疲劳高会进入 injury-warning
恢复行动能移除 injury-warning
injury-warning 继续硬练可能升级 injury-limited
injury-limited 再恶化会写入 forced-rest 和 restRounds
```

## 8. 一次性实现的内部执行顺序

以下顺序是单次 `/goal` 内部执行顺序，不代表可以分批交付。最终完成前，所有步骤都必须实现并回归。

```text
1. EventSequence 类型 + eventSequence 引擎 + 测试假 sequence
2. applyChoice 接入 sequence，普通事件不回退
3. 前端显示 sequence 进度
4. TournamentContext 类型 + 报名创建 context
5. pickNextEvent + 准备周 / 赛后 context + fallback
6. 第一批 tournament-context 事件
7. TournamentSeries Bo3
8. Bo5 + 系列赛 UI
9. 战队面试 sequence
10. 家人危机 sequence
11. 队内冲突 sequence
12. AI sequence / AI 赛事上下文
13. 伤病与强制休养联动
14. Debug 页面展示 sequence / tournamentContext / queued 状态
15. README 更新
```

## 9. 整体回归要求

完整实现后必须跑：

```text
backend:
  npm run typecheck
  npm test

frontend:
  npm run typecheck 或 npm run build
```

如果前端项目没有对应脚本，以实际 package.json 为准。

## 10. Debug 要求

这套系统状态复杂，必须更新 debug 页面或 debug 接口。

需要展示：

```text
activeEventSequence
  id
  type
  currentIndex
  steps
  generatedEvent 是否存在
  context

tournamentContext
  tournamentId
  stageIndex
  phase
  contextEventQueue
  consumedContextEventIds
  lastMatchResult
  expiresAtRound

queued 状态
  family-crisis-queued
  club-interview-queued
  team-conflict-queued
  bailout-queued

伤病状态
  minor-injury-risk
  injury-warning
  injury-limited
  forced-rest
  restRounds
```

需要支持的调试能力：

```text
查看当前 sequence step
查看 sequence history
查看 tournamentContext 队列
查看为什么当前事件被选中
```

active sequence 期间不允许 debug 强制替换 currentEvent，除非明确走“取消 sequence”调试操作。

## 11. 最终完成标准

整体完成后应满足：

```text
普通事件仍然每回合最多一个
sequence 可以同回合连续处理多个事件
sequence 未完成不推进回合
赛事上下文不会打断比赛周
比赛周只出赛事比赛事件
Bo3 / Bo5 能完整跑完
系列赛奖励只发一次
赛后上下文能承接比赛结果
历史记录能显示同一 sequence
UI 能显示流程进度
战队面试能作为 sequence 完成
家人危机能作为 sequence 完成
队内冲突能作为 sequence 完成
AI sequence 受最大步数和结构化 outcome 限制
AI 赛事上下文不会插入比赛周
强制休养撞比赛周会生成 injury-aware tournament event
伤病风险链可见且可缓解
active sequence 期间所有非 sequence 操作被禁止
debug 能查看 sequence / tournamentContext / queued 状态
```

不得以以下状态作为完成：

```text
只完成 Event Sequence V1
只完成赛事上下文 V1
只完成 Bo3，未完成 Bo5
只完成赛事 sequence，未迁移面试 / 家人危机 / 队内冲突
只完成静态 sequence，未完成 AI sequence 约束
Bo3 / Bo5 能跑但赛事奖励重复发放
比赛周仍可能被普通事件打断
sequence 能跑但 UI 看不出流程进度
强制休养撞比赛周仍正常出普通 tournament-* 事件
active sequence 期间还能训练、买商店、报名或离队
debug 看不到 activeEventSequence / tournamentContext
```
