# AI 事件缓存与 Pickup 设计

状态：搁置，后续排期。

## 背景

AI 事件由 LLM 根据玩家当前局面生成。直接用完即删可以避免重复，但会增加 token 消耗；完全不删又会让旧事件长期留在池子里，出现和当前状态不匹配的事件。

目标是保留 AI 事件复用价值，同时让事件 pickup 仍然符合当前局面。

## 核心原则

- AI 事件不是生成后纯随机抽取。
- AI 事件应作为短期动态缓存池存在。
- 每次 pickup 前，都要重新检查当前状态是否仍然适合该事件。
- 用过的 AI 事件可以复用，但需要冷却、次数上限和相关性降权。

## 缓存结构

建议把 KV 中的 AI 事件从 `EventDef[]` 改为运行时缓存对象数组：

```ts
interface CachedAiEvent {
  event: EventDef;
  meta: AiEventMeta;
}

interface AiEventMeta {
  category: 'stress' | 'team' | 'media' | 'rival' | 'life';
  generatedRound: number;
  generatedFor: AiEventTriggerSnapshot;
  usedCount: number;
  lastPickedRound: number | null;
}

interface AiEventTriggerSnapshot {
  stress: number;
  fatigue: number;
  fame: number;
  teamTrust: number | null;
  hasTeam: boolean;
  hasRival: boolean;
  lastMatchResult?: 'win' | 'loss';
}
```

`event` 保持原有事件定义；`meta` 只服务于缓存、复用和 pickup，不进入事件结算结构。

## 缓存生命周期

建议参数：

```ts
MAX_AI_EVENT_CACHE = 6;
AI_EVENT_TTL_ROUNDS = 24;
AI_EVENT_PICK_COOLDOWN = 8;
AI_EVENT_MAX_USES = 2;
```

每次生成新 AI 事件后：

1. 读取现有缓存。
2. 移除过期事件。
3. 移除 `usedCount >= AI_EVENT_MAX_USES` 的事件。
4. 保留当前正在展示的 AI 事件。
5. 合并新生成事件。
6. 按优先级保留前 `MAX_AI_EVENT_CACHE` 条。

优先级建议：

1. 当前正在展示的 AI 事件。
2. 新生成且未使用的事件。
3. 旧的未使用事件。
4. 已使用 1 次但冷却结束的事件。

## 使用状态更新

当玩家结算 AI 事件后：

```ts
cached.usedCount += 1;
cached.lastPickedRound = player.round;
```

不立即删除事件。是否还能再次出现，由 pickup 阶段的过滤和权重决定。

## Pickup 流程

AI 事件进入候选池前，应经过四步：

```text
AI 缓存池
  ↓
基础有效性过滤
  ↓
主题条件过滤
  ↓
当前状态相关性评分
  ↓
和静态事件池一起 weightedPick
```

### 1. 基础有效性过滤

```ts
if (!event.stages.includes(player.stage)) skip;
if (usedCount >= AI_EVENT_MAX_USES) skip;
if (lastPickedRound !== null && round - lastPickedRound < AI_EVENT_PICK_COOLDOWN) skip;
if (round - generatedRound > AI_EVENT_TTL_ROUNDS) skip;
if (requireTags / forbidTags 不满足) skip;
```

### 2. 主题条件过滤

压力事件：

```ts
category === 'stress'

允许条件：
  stress >= 60
  或 tilt >= 2
  或最近 3 轮有失败、争议、高压比赛
```

生活/疲劳事件：

```ts
category === 'life'

疲劳主题：
  fatigue >= 65

赛后低谷主题：
  最近 3 轮有赛事失利

普通生活主题：
  stage 匹配即可
```

战队事件：

```ts
category === 'team'

必须：
  hasTeam = true

矛盾主题：
  teamTrust <= 40

凝聚主题：
  teamTrust >= 45 或最近有比赛
```

媒体事件：

```ts
category === 'media'

允许条件：
  fame >= 20
  或最近 3 轮有赛事
  或最近 3 轮 fameDelta 明显变化
```

对手事件：

```ts
category === 'rival'

必须：
  rivals.length > 0

更高权重条件：
  最近有比赛
  或最近连续胜利
  或最近输掉关键赛事
```

### 3. 相关性评分

示例：

```ts
stressScore =
  stress >= 80 ? 1.5 :
  stress >= 60 ? 1.0 :
  stress >= 45 ? 0.4 :
  0;

fatigueScore =
  fatigue >= 85 ? 1.5 :
  fatigue >= 65 ? 1.0 :
  fatigue >= 50 ? 0.4 :
  0;

teamConflictScore =
  !team ? 0 :
  teamTrust <= 25 ? 1.5 :
  teamTrust <= 40 ? 1.0 :
  0;
```

最终权重：

```ts
aiEventWeight =
  baseStateWeight(event, player)
  * relevanceScore
  * freshnessMultiplier
  * reuseMultiplier;
```

建议倍率：

```ts
freshnessMultiplier:
  age <= 6 rounds  -> 1.2
  age <= 12 rounds -> 1.0
  age <= 24 rounds -> 0.5

reuseMultiplier:
  usedCount = 0 -> 1.0
  usedCount = 1 -> 0.35
```

## 状态快照对比

生成时记录 `generatedFor`，pickup 时比较当前状态：

```ts
if (category === 'stress' && currentStress <= generatedFor.stress - 30) {
  降权或过滤;
}

if (category === 'team' && generatedFor.hasTeam && !currentHasTeam) {
  过滤;
}

if (category === 'media' && currentFame 仍然较高) {
  保留或加权;
}
```

这样可以避免旧 AI 事件脱离当前局面。

## 后续问题

当前回合流程是：

```text
进入回合 -> 日常行动 -> 事件决策
```

如果 AI 事件是上一回合末按当时状态生成的，那么玩家在本回合先通过日常行动改变状态后，事件可能已经不再合理。

例如：

```text
上一回合压力 90
系统生成压力事件
本回合玩家先休息/冥想，压力降到 35
随后仍然进入压力事件
```

因此 AI 事件 pickup 不应只在回合生成时固定。后续需要结合回合流程一起设计：事件展示前是否需要二次校验、是否允许替换当前事件、日常行动后是否重新挑事件。
