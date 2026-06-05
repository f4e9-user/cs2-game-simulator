# 状态倍率系统落地方案

这份文档记录疲劳、压力倍率系统的理想实现方式。

目标是把以下设计统一到一套规则里：

- 体能属性影响疲劳增长。
- 心态属性影响压力增长。
- 特质可以独立影响疲劳/压力倍率。
- Buff 可以独立影响疲劳/压力倍率。
- 日常行动、普通事件、比赛结算都使用同一套状态增量修正规则。

---

## 当前问题

当前代码里已经存在部分倍率逻辑：

- `fatigueMult(constitution)`：体能影响疲劳增长。
- `stressMult(mentality)`：心态影响压力增长。

但接入不完整：

- 普通事件路径已经对正向疲劳使用 `fatigueMult`。
- 普通事件路径已经对正向压力使用 `stressMult`。
- 日常行动路径没有使用 `fatigueMult`。
- 日常行动路径没有使用 `stressMult`。
- 比赛疲劳没有使用 `fatigueMult`。
- Buff 目前只有成长倍率，没有疲劳倍率或压力倍率。
- 特质目前主要通过属性修正间接影响疲劳/压力，没有独立倍率。

还有一个具体配置问题：

- `ergo-recovery` 的注释意图是降低疲劳增长。
- 但当前 Buff 的 `multiplier` 实际只作用于成长。
- 因此 `multiplier: 0.85` 会变成成长减益，而不是疲劳减益。

---

## 设计原则

### 1. 只修正负面增长

状态倍率只作用于正向增量：

```text
fatigueDelta > 0  才套疲劳倍率
stressDelta > 0   才套压力倍率
```

恢复不应该被抗性削弱：

```text
fatigueDelta < 0  直接作为恢复处理
stressDelta < 0   直接作为减压处理
```

否则会出现高体能选手休息恢复变少、高心态选手心理咨询收益变少的反直觉情况。

### 2. 属性、特质、Buff 乘算

最终倍率由三类来源相乘：

```text
最终疲劳倍率 = 体能倍率 × 特质疲劳倍率 × Buff 疲劳倍率
最终压力倍率 = 心态倍率 × 特质压力倍率 × Buff 压力倍率 × 高疲劳压力放大
```

### 3. 所有来源统一入口

日常行动、普通事件、比赛结算都应该调用同一套状态修正函数，避免各处逻辑漂移。

---

## Buff 类型调整

当前 Buff 的 `multiplier` 语义过宽，容易被误用。

建议改成明确字段：

```ts
export interface Buff {
  id: string;
  label: string;

  actionTag: string;
  growthKey?: StatKey;

  growthMultiplier?: number;
  fatigueGainMultiplier?: number;
  stressGainMultiplier?: number;

  remainingUses: number;

  consumeOn?: 'growth' | 'fatigue' | 'stress' | 'any';
}
```

字段含义：

- `growthMultiplier`：只影响核心属性成长。
- `fatigueGainMultiplier`：只影响正向疲劳增量。
- `stressGainMultiplier`：只影响正向压力增量。
- `consumeOn`：决定 Buff 何时扣次数。

### 示例

枪法私教：

```ts
{
  id: 'aim-coached',
  label: '枪法私教',
  actionTag: 'ranked',
  growthKey: 'agility',
  growthMultiplier: 1.18,
  remainingUses: 4,
  consumeOn: 'growth',
}
```

战术复盘：

```ts
{
  id: 'tactical-review',
  label: '战术复盘',
  actionTag: 'training',
  growthKey: 'intelligence',
  growthMultiplier: 1.15,
  remainingUses: 4,
  consumeOn: 'growth',
}
```

人体工学：

```ts
{
  id: 'ergo-recovery',
  label: '人体工学',
  actionTag: 'all',
  fatigueGainMultiplier: 0.85,
  remainingUses: 15,
  consumeOn: 'fatigue',
}
```

心理稳定：

```ts
{
  id: 'psych-calm',
  label: '心理稳定',
  actionTag: 'all',
  stressGainMultiplier: 0.85,
  growthMultiplier: 1.05,
  remainingUses: 3,
  consumeOn: 'any',
}
```

---

## 特质倍率

特质已经有 tags。建议先基于 tag 做倍率映射，而不是给每个 Trait 增加新字段。

新增一个映射：

```ts
const TRAIT_STATE_MULTIPLIERS: Record<string, {
  fatigueGainMultiplier?: number;
  stressGainMultiplier?: number;
}> = {
  athletic: { fatigueGainMultiplier: 0.90 },
  fragile: { fatigueGainMultiplier: 1.20, stressGainMultiplier: 1.10 },
  obsessed: { fatigueGainMultiplier: 1.10, stressGainMultiplier: 1.05 },
  grinder: { fatigueGainMultiplier: 1.05 },

  steady: { stressGainMultiplier: 0.90 },
  clutch: { stressGainMultiplier: 0.90 },
  volatile: { stressGainMultiplier: 1.15 },
};
```

建议数值保持克制：

```text
正面特质：0.85 - 0.95
负面特质：1.05 - 1.20
```

避免特质倍率盖过体能和心态属性本身。

---

## 统一状态修正模块

建议新增：

```text
backend/src/engine/stateModifiers.ts
```

核心类型：

```ts
interface ModifierContext {
  actionTag: string;
  source: 'event' | 'routine' | 'match' | 'shop';
}

interface StateDeltaInput {
  fatigueDelta: number;
  stressDelta: number;
}

interface StateDeltaResult {
  fatigueDelta: number;
  stressDelta: number;
  consumedBuffIds: string[];
  passiveEffects: string[];
}
```

核心函数：

```ts
export function applyStateDeltaModifiers(
  player: Player,
  input: StateDeltaInput,
  context: ModifierContext,
): StateDeltaResult
```

职责：

- 对正向疲劳增量应用体能、特质、Buff 倍率。
- 对正向压力增量应用心态、特质、Buff、高疲劳压力放大。
- 返回最终增量。
- 返回哪些 Buff 应该被消耗。
- 返回可展示的被动效果文案 key。

---

## 疲劳公式

建议公式：

```ts
function modifyPositiveFatigueDelta(
  player: Player,
  base: number,
  context: ModifierContext,
): number {
  if (base <= 0) return base;

  const attrMult = fatigueMult(player.stats.constitution);
  const traitMult = traitFatigueMultiplier(player);
  const buffMult = buffFatigueMultiplier(player.buffs, context);

  const floor = context.source === 'routine'
    ? FATIGUE_DELTA_FLOOR_ROUTINE
    : context.source === 'match'
      ? FATIGUE_DELTA_FLOOR_MATCH
      : FATIGUE_DELTA_FLOOR_EVENT;

  return Math.max(
    Math.round(base * attrMult * traitMult * buffMult),
    floor,
  );
}
```

需要新增：

```ts
export const FATIGUE_DELTA_FLOOR_MATCH = 8;
```

比赛疲劳比普通事件更高，保留一个较高下限，避免高体能选手打完整场比赛几乎不累。

---

## 压力公式

建议公式：

```ts
function modifyPositiveStressDelta(
  player: Player,
  base: number,
  context: ModifierContext,
): number {
  if (base <= 0) return base;

  const attrMult = stressMult(player.stats.mentality);
  const traitMult = traitStressMultiplier(player);
  const buffMult = buffStressMultiplier(player.buffs, context);
  const fatiguePressureMult =
    player.volatile.fatigue >= FATIGUE_STRESS_THRESHOLD
      ? FATIGUE_STRESS_MULTIPLIER
      : 1;

  const floor = context.source === 'routine'
    ? STRESS_DELTA_FLOOR_ROUTINE
    : STRESS_DELTA_FLOOR_EVENT;

  return Math.max(
    Math.round(base * attrMult * traitMult * buffMult * fatiguePressureMult),
    floor,
  );
}
```

---

## 接入点

### 1. 普通事件路径

当前 `applyChoice` 已经局部实现体能/心态倍率。

改造时应迁移到统一函数：

```ts
const modified = applyStateDeltaModifiers(
  nextPlayer,
  {
    fatigueDelta: fatigueDeltaBase,
    stressDelta: stressDeltaBase,
  },
  {
    actionTag: eventDef.type,
    source: eventDef.type === 'routine' ? 'routine' : 'event',
  },
);
```

### 2. 日常行动路径

当前 `applyAction` 直接使用：

```ts
volatile.fatigue + outcome.fatigueDelta
stress + explicitStress * STRESS_SCALE
```

应该改成统一函数：

```ts
const modified = applyStateDeltaModifiers(
  session.player,
  {
    fatigueDelta: outcome.fatigueDelta,
    stressDelta: explicitStress ? explicitStress * STRESS_SCALE : 0,
  },
  {
    actionTag: actionDef.eventType,
    source: 'routine',
  },
);
```

### 3. 比赛结算路径

比赛模拟返回：

```ts
sim.fatigueDelta
sim.tiltDelta
sim.feelDelta
```

其中 `sim.fatigueDelta` 应该在结算时套疲劳倍率：

```ts
const modified = applyStateDeltaModifiers(
  player,
  {
    fatigueDelta: sim.fatigueDelta,
    stressDelta: matchStressDelta,
  },
  {
    actionTag: 'match',
    source: 'match',
  },
);
```

---

## Buff 消耗规则

当前 Buff 在有成长时扣次数。改造后应按 `consumeOn` 判断。

伪代码：

```ts
function shouldConsumeBuff(
  buff: Buff,
  trigger: {
    growthApplied: boolean;
    fatigueReduced: boolean;
    stressReduced: boolean;
  },
): boolean {
  switch (buff.consumeOn ?? 'growth') {
    case 'growth':
      return trigger.growthApplied;
    case 'fatigue':
      return trigger.fatigueReduced;
    case 'stress':
      return trigger.stressReduced;
    case 'any':
      return trigger.growthApplied || trigger.fatigueReduced || trigger.stressReduced;
  }
}
```

这样人体工学椅不会因为一次普通成长事件被错误扣次数，只有它实际降低正向疲劳时才消耗。

---

## 推荐首批数值

### 属性倍率

体能：

```text
constitution >= 15 -> fatigue ×0.30
constitution >= 11 -> fatigue ×0.55
constitution >= 7  -> fatigue ×0.85
constitution >= 4  -> fatigue ×1.35
else               -> fatigue ×1.60
```

心态：

```text
mentality >= 16 -> stress ×0.30
mentality >= 13 -> stress ×0.55
mentality >= 9  -> stress ×0.85
mentality >= 5  -> stress ×1.25
else            -> stress ×1.60
```

### 特质倍率

```text
athletic      fatigue ×0.90
fragile       fatigue ×1.20
obsessed      fatigue ×1.10
grinder       fatigue ×1.05

steady        stress ×0.90
clutch        stress ×0.90
volatile      stress ×1.15
fragile       stress ×1.10
```

### Buff 倍率

```text
人体工学椅       fatigue ×0.85，15 次
护腕支撑套       fatigue ×0.90，5 次
心理稳定         stress ×0.85，3 次
经纪团队         stress ×0.95，仅 media/social/agent 类事件
```

---

## UI 展示建议

倍率系统接入后，玩家需要看懂为什么状态变化被修正。

行动面板可以展示预测：

```text
预计疲劳：+18 -> +10
来源：
- 体能：×0.55
- 人体工学：×0.85
- 玻璃腕：×1.20
```

结算面板可以展示触发：

```text
体能充沛：疲劳增量降低
人体工学椅：疲劳增量降低，剩余 12 次
```

压力同理：

```text
心态稳定：压力增量降低
心理稳定：压力增量降低，剩余 2 次
```

---

## 推荐落地顺序

1. 新增 `stateModifiers.ts`。
2. 把 `applyChoice` 现有疲劳/压力倍率迁移到统一函数，保持行为基本不变。
3. 把 `applyAction` 接入统一函数。
4. 把比赛疲劳接入统一函数。
5. 扩展 Buff 类型，拆出 `growthMultiplier`、`fatigueGainMultiplier`、`stressGainMultiplier`。
6. 修复 `ergo-recovery`，让它真正降低疲劳增长。
7. 增加 trait tag 倍率映射。
8. 调整 Buff 消耗规则。
9. 最后做 UI 预测和结算展示。

---

## 最终目标

实现后，系统关系应当是：

```text
体能属性 -> 基础疲劳抗性
心态属性 -> 基础压力抗性
特质标签 -> 个性化疲劳/压力倾向
Buff -> 临时疲劳/压力修正
所有行动/事件/比赛 -> 统一状态修正入口
```

这样可以让玩家明确感受到：

- 高体能选手更能连续训练和比赛。
- 高心态选手更能承受失败和舆论。
- 玻璃腕、训练狂、冰冷心脏等特质不只是属性修正，也会塑造长期状态曲线。
- 商店里的恢复和装备投资能自然嵌入疲劳/压力系统。
