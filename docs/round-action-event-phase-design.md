# 回合行动阶段与事件阶段设计

状态：待评审，尚未实现。

## 背景

当前设计讨论中确认一个前提：

玩家在行动阶段结束之前，不会得知本回合事件。

因此，事件不应该在回合开始时提前固定。否则会出现状态错位：

```text
上一回合压力 90
系统提前为本回合选中压力事件
本回合玩家先休息/冥想，压力降到 35
行动结束后仍然进入高压事件
```

更合理的流程是：

```text
进入新回合
  ↓
行动阶段：玩家执行日常行动、购物、贷款、报名、战队操作
  ↓
行动阶段结束
  ↓
基于最新状态 pickEvent
  ↓
事件阶段：玩家进行事件决策
  ↓
事件结算并推进到下一回合
```

这样事件永远基于行动后的最终状态生成，不需要 UI 做“事件被刷新”的提示。

## 设计目标

- 事件选择基于玩家本回合行动后的最新状态。
- 玩家在行动阶段看不到事件，因此不存在事件被替换的认知落差。
- 日常行动、商店、贷款、报名、战队操作能真实影响本回合事件类型。
- AI 事件缓存可以复用，但 pickup 必须按最新状态重新判断相关性。
- 尽量避免大规模改动现有事件结算和 `applyChoice` 逻辑。

## 回合状态机

建议给 session 增加阶段字段：

```ts
type RoundPhase = 'action' | 'event';

interface GameSession {
  phase: RoundPhase;
  currentEvent: GameEventPublic | null;
}
```

含义：

- `action`：行动阶段。玩家可以执行日常行动、购物、贷款、报名、战队操作。此时 `currentEvent = null`。
- `event`：事件阶段。系统已经根据最新状态选出事件。此时玩家只能进行事件选择或自由行动。

## 标准流程

### 1. 新局开始

```text
createSession
  phase = 'action'
  currentEvent = null
```

新局不立即展示随机事件。玩家先进入第一回合行动阶段。

### 2. 行动阶段

允许操作：

- 日常行动
- 商店购买
- 贷款
- 典当
- 申请战队
- 接受/拒绝 Offer
- 主动离队
- 赛事报名
- 弃赛
- 调试操作

这些操作会更新玩家状态：

- `stress`
- `fatigue`
- `feel`
- `tilt`
- `money`
- `team`
- `teamTrust`
- `pendingMatch`
- `tags`
- `stage`
- `qualificationSlots`
- 其他派生状态

但不会生成或替换 `currentEvent`。

### 3. 结束行动阶段

新增接口：

```text
POST /api/game/:sessionId/end-action-phase
```

职责：

1. 校验 session active。
2. 校验当前 `phase === 'action'`。
3. 读取 AI 事件缓存。
4. 根据最新 player 状态调用 `pickEvent(...)`。
5. 写入 `currentEvent`。
6. 设置 `phase = 'event'`。
7. 保存 session。
8. 返回最新 session/currentEvent。

伪代码：

```ts
function endActionPhase(session, aiEvents) {
  if (session.status !== 'active') throw;
  if (session.phase !== 'action') throw;

  const recentEventIds = session.history.slice(-2).map((r) => r.eventId);
  const eventDef = pickEvent({
    player: session.player,
    recentEventIds,
    rng,
    leaderboard,
    aiEvents,
  });

  return {
    ...session,
    phase: 'event',
    currentEvent: eventDef ? toPublicEvent(eventDef, ...) : null,
  };
}
```

### 4. 事件阶段

允许操作：

- 固定选项选择
- AI 自由行动
- 叙事生成

不允许操作：

- 日常行动
- 商店购买
- 贷款
- 报名/弃赛
- 战队申请/离队

`POST /choice` 只在 `phase === 'event'` 时允许。

### 5. 事件结算后进入下一回合

事件结算仍由 `applyChoice(...)` 负责。

区别是：结算后不再立即 pick 下一回合事件。

```ts
applyChoice(...)
  结算事件
  推进回合
  phase = 'action'
  currentEvent = null
```

AI 事件生成仍可在事件结算后后台进行，但只是写入缓存池，不决定下一回合事件。

## AI 事件接入

AI 事件生成和 pickup 分离：

```text
事件结算后：
  后台 generateEvents(...)
  写入 ai-events:<sessionId> 缓存

下一回合行动阶段：
  玩家行动改变状态

结束行动阶段：
  读取 AI 缓存
  基于最新状态过滤/加权
  和静态事件池一起 pick
```

这解决了“上一回合生成的 AI 事件，下一回合行动后已经不合适”的问题。

后续如果实现 AI 事件缓存 meta，可在 `end-action-phase` 阶段做：

- 过期过滤
- 使用次数过滤
- cooldown 过滤
- category 状态相关性过滤
- relevanceScore 加权

## 状态影响示例

### 压力

```text
上一回合压力 90
AI 缓存里有压力事件
本回合玩家冥想，压力降到 35
结束行动阶段时 pickEvent
压力事件不再进入候选池或权重大幅降低
```

### 疲劳

```text
疲劳 88
玩家休息/按摩后疲劳降到 30
疲劳危机事件不再出现
```

### 资金

```text
资金 0
玩家贷款或打工后资金恢复
破产救济事件不再出现
```

### 战队

```text
行动阶段加入战队
结束行动阶段时 team 事件开始可用
```

```text
行动阶段离队
结束行动阶段时队内矛盾事件不再可用
```

### 赛事

```text
行动阶段报名赛事
结束行动阶段时 pendingMatch 已存在
优先进入赛前准备/赛事相关事件
```

```text
行动阶段弃赛
结束行动阶段时 pendingMatch 清空
赛前准备事件不再出现
```

## 接口影响

### 新增接口

```text
POST /api/game/:sessionId/end-action-phase
```

请求：

```json
{}
```

响应：

```json
{
  "session": GameSession
}
```

### 修改接口约束

`POST /api/game/:sessionId/action`

```ts
要求 phase === 'action'
```

`POST /api/game/:sessionId/shop`

```ts
要求 phase === 'action'
```

`POST /api/game/:sessionId/choice`

```ts
要求 phase === 'event'
要求 currentEvent !== null
```

赛事、贷款、战队相关操作也建议要求 `phase === 'action'`。

## 前端影响

行动阶段：

- 展示 AP、日常行动、商店、贷款、战队、赛事。
- 不展示事件卡。
- 提供“结束行动阶段”按钮。

事件阶段：

- 展示事件卡和选项。
- 隐藏或禁用行动、商店、贷款、报名等操作。
- 事件结算后进入结果页，再进入下一回合行动阶段。

如果 AP 用完，可以自动提示或允许一键结束行动阶段。

## 实现分期

### v1：最小可用

- 增加 `phase` 字段。
- 新局和事件结算后进入 `phase = 'action'`，`currentEvent = null`。
- 新增 `end-action-phase` 接口，在这里 pickEvent。
- `/choice` 只允许 `phase = 'event'`。
- 行动、商店、贷款、赛事、战队操作只允许 `phase = 'action'`。
- AI 事件缓存仍保持当前结构，只是在 end-action-phase 时读取并参与 pick。

### v2：AI 事件缓存 meta

- KV 从 `EventDef[]` 升级为 `CachedAiEvent[]`。
- 增加 `usedCount`、`lastPickedRound`、`generatedRound`。
- pickup 时做 category 状态相关性过滤。
- AI 事件使用后更新使用状态。

### v3：更细的事件时机

如果未来需要更复杂流程，可以引入：

```ts
eventTiming: 'locked' | 'refreshable' | 'delayed'
```

但在当前 UI 前提下，v1 不需要事件刷新机制，因为事件本来就不会提前展示。

## 风险点

### 1. 当前代码默认 session 一直有 currentEvent

需要检查前端和后端所有 `currentEvent` 假设：

- 游戏主页面
- choice 接口
- narrate-stream 接口
- debug 页面
- session 创建
- applyChoice 推进回合

### 2. 叙事接口依赖 currentEvent

`narrate-stream` 只能在 `phase = 'event'` 使用。行动阶段不应调用。

### 3. 历史去重

`pickEvent` 使用最近事件去重。end-action-phase 需要沿用：

```ts
recentEventIds = session.history.slice(-2).map((r) => r.eventId);
```

不需要把当前事件额外塞进去，因为行动阶段没有 currentEvent。

### 4. AI 生成时机

AI 生成仍在事件结算后后台执行。它只是准备缓存，不决定下一回合一定出现什么。

如果缓存为空，end-action-phase 使用静态事件池。

## 推荐结论

在“玩家行动阶段看不到事件”的 UI 前提下，最佳方案是：

```text
不要提前 pick currentEvent。
行动阶段结束后，基于最新状态 pick currentEvent。
```

这比“行动后刷新事件”更简单、更一致，也不会产生 UI 认知落差。
