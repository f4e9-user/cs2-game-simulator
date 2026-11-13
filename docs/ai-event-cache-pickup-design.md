# AI 事件缓存与 Pickup 设计

状态：已实现。

实现日期：2026-06-10。

## 背景

AI 事件由 LLM 根据玩家当前局面生成。直接用完即删可以避免重复，但会增加 token 消耗；完全不删又会让旧事件长期留在池子里，出现和当前状态不匹配的事件。

目标是保留 AI 事件复用价值，同时让事件 pickup 仍然符合当前局面。

## 核心原则

- AI 事件不是生成后纯随机抽取。
- AI 事件应作为短期动态缓存池存在。
- 每次 pickup 前，都要重新检查当前状态是否仍然适合该事件。
- 用过的 AI 事件可以复用，但需要冷却、次数上限和相关性降权。

## 缓存结构

建议把 KV 中的 AI 事件从 `EventDef[]` 升级为运行时缓存对象数组。

兼容策略：

- 旧数据仍按 `EventDef[]` 读取。
- 读到旧格式时，按默认 meta 补齐后再写回新格式。
- 新格式写入后，后续只使用新结构。
- KV 键建议改为版本化 envelope，例如 `ai-events-v2:<sessionId>`；迁移期间先读旧 key，写入时只落新 key，旧 key 只做一次性兼容读取。
- `category` 默认直接取 `event.type`，仅在需要合并语义时再做显式覆盖。
- 所有现有消费者都要先解包 `cached.event` 再做 `validateAiEvents`、结算回找和调试展示。

建议结构：

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
  teamClubId: string | null;
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
4. 合并新生成事件。
5. 按优先级保留前 `MAX_AI_EVENT_CACHE` 条。

优先级建议：

1. 新生成且未使用的事件。
2. 旧的未使用事件。
3. 已使用 1 次但冷却结束的事件。

## 使用状态更新

当玩家结算 AI 事件后：

```ts
cached.usedCount += 1;
cached.lastPickedRound = player.round;
```

不立即删除事件。是否还能再次出现，由 pickup 阶段的过滤和权重决定。
当前正在展示的事件应单独保存在 cache envelope 的 `active` 字段或等价保活位中，确保结算时能回找完整 `EventDef`；它不属于候选缓存池，也不参与缓存淘汰。结算后再按 `usedCount`、冷却和 TTL 决定是否释放回候选池。

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

if (category === 'team' && generatedFor.teamClubId !== currentTeamClubId) {
  过滤;
}

if (category === 'media' && currentFame 仍然较高) {
  保留或加权;
}
```

这样可以避免旧 AI 事件脱离当前局面。

## 回合时序

当前回合流程应当是：

```text
进入回合 -> 日常行动 -> 事件 pickup -> 事件展示 -> 事件决策
```

因此 AI 事件不需要在“上一回合末”提前锁定。pickup 直接使用日常行动后的最新状态即可，缓存只负责候选复用和相关性控制，不负责展示后的二次替换。

如果 AI 事件在日常行动前生成，就会出现状态过期的问题：

```text
上一回合压力 90
系统预生成压力事件
本回合玩家先休息/冥想，压力降到 35
随后仍然进入压力事件
```

这类问题应通过调整 pickup 时机解决，而不是在展示后再重选当前事件。
