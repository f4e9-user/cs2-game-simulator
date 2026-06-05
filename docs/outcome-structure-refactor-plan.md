# Outcome 结构拆分改造方案

这份文档描述 `Outcome` 结构的重构目标和迁移顺序，用来避免后续继续出现“同一种结果有两套写法”的问题。

当前问题不是某一个字段错了，而是结果模型过于扁平：

- 核心属性、金钱、名气、压力、疲劳、手感、阶段推进、标签、Buff 都挤在同一个 `Outcome` 里。
- 同一语义可能同时存在专用字段和 `statChanges` 兼容写法。
- 金钱已经暴露过一次“写了但没生效”的问题，说明这种模型对新内容不够稳。

---

## 目标

把 `Outcome` 拆成语义明确的几个区块，让类型系统直接限制错误写法。

建议最终结构如下：

```ts
export interface Outcome {
  narrative: string;
  coreGrowth?: CoreStatDelta;
  stateDelta?: StateDelta;
  resourceDelta?: ResourceDelta;
  progression?: ProgressionDelta;
  tags?: TagDelta;
  effects?: EffectDelta;
  dailyGrowth?: CoreStatKey;
}
```

对应职责：

- `coreGrowth`：只放核心属性变化。
- `stateDelta`：只放压力、疲劳、手感、tilt 这类高频状态。
- `resourceDelta`：只放金钱、名气、积分、AP。
- `progression`：只放阶段、战队层级、伤病、结局推进。
- `tags`：只放标签增删和冷却。
- `effects`：只放 Buff 相关变化。

---

## 现状问题

### 1. 结果模型混杂

现在一个 `Outcome` 可能同时写：

- `statChanges`
- `moneyDelta`
- `stressDelta`
- `fameDelta`
- `feelDelta`
- `tiltDelta`
- `fatigueDelta`
- `injuryRestRounds`
- `stageSet`
- `teamTierSet`
- `tagAdds`
- `tagRemoves`
- `buffAdd`

这会导致：

- 新字段很难知道该放哪。
- 某些字段会被重复表达。
- 结算路径容易分叉。

### 2. `statChanges` 语义不够窄

`statChanges` 现在表面上像“核心属性变化”，但历史上曾经混进过金钱。

更好的做法是让它只表示核心属性，而且进一步收窄到五个竞技属性，不允许 `money`。

### 3. 结算逻辑需要同时懂“旧格式”和“新格式”

这会让 resolver 很难继续扩展：

- 每加一个字段都要考虑兼容层。
- 每个事件池都可能有不同写法。

---

## 建议的最终类型

### CoreStatDelta

```ts
export type CoreStatKey =
  | 'intelligence'
  | 'agility'
  | 'experience'
  | 'mentality'
  | 'constitution';

export type CoreStatDelta = Partial<Record<CoreStatKey, number>>;
```

只允许核心竞技属性，不包含 `money`。

### StateDelta

```ts
export interface StateDelta {
  feel?: number;
  tilt?: number;
  fatigue?: number;
  stress?: number;
}
```

建议这里统一为最终数值，不再引入旧版 scale 语义。

### ResourceDelta

```ts
export interface ResourceDelta {
  money?: number;
  fame?: number;
  points?: number;
  actionPoints?: number;
}
```

### ProgressionDelta

```ts
export interface ProgressionDelta {
  stageSet?: Stage;
  stageDelta?: number;
  teamTierSet?: ClubTier;
  injuryRestRounds?: number;
  endRun?: boolean;
  endReason?: string;
}
```

### TagDelta

```ts
export interface TagDelta {
  add?: string[];
  remove?: string[];
  cooldowns?: Record<string, number>;
}
```

### EffectDelta

```ts
export interface EffectDelta {
  buffAdd?: Buff;
  buffRemoveId?: string;
}
```

---

## 迁移原则

1. 先加新结构，再迁数据。
2. 先迁最容易出错的结果类型。
3. 保留 resolver 的单一结算入口，不新增第二套执行器。
4. 迁移期间不要继续扩写旧字段。
5. 最终要让 TypeScript 阻止错误写法，而不是靠人工约束。

---

## 推荐迁移顺序

### Phase 1 - 建新结构

内容：

- 新增 `CoreStatDelta` / `StateDelta` / `ResourceDelta` / `ProgressionDelta` / `TagDelta` / `EffectDelta`
- `Outcome` 新增这些字段
- 旧字段先保留，但标记为 deprecated
- resolver 同时支持新旧字段

目的：

- 先把目标形状固定下来。
- 不打断现有内容。

### Phase 2 - 迁资源类字段

优先迁移：

- `moneyDelta` -> `resourceDelta.money`
- `fameDelta` -> `resourceDelta.fame`
- `pointsDelta` -> `resourceDelta.points`
- `actionPoints` 相关变化 -> `resourceDelta.actionPoints`

原因：

- 这类字段最容易和属性字段混淆。
- 之前 money 已经出现过语义歧义。

### Phase 3 - 迁状态类字段

迁移：

- `feelDelta`
- `tiltDelta`
- `fatigueDelta`
- `stressDelta`

统一放进 `stateDelta`。

收益：

- 结算逻辑会明显更整洁。
- combo、Buff、状态倍率都更容易接。

### Phase 4 - 迁阶段和标签

迁移：

- `stageSet`
- `stageDelta`
- `teamTierSet`
- `injuryRestRounds`
- `tagAdds`
- `tagRemoves`
- `tagCooldowns`

这些都应进入 `progression` / `tags`。

### Phase 5 - 迁 Buff

迁移：

- `buffAdd`
- `buffRemoveId`

进入 `effects`。

### Phase 6 - 删除旧字段

在所有内容迁完后，移除：

- `statChanges`
- `moneyDelta`（如果已完全由 `resourceDelta.money` 替代）
- `fameDelta`
- `pointsDelta`
- `feelDelta`
- `tiltDelta`
- `fatigueDelta`
- `stressDelta`
- `stageSet`
- `stageDelta`
- `teamTierSet`
- `tagAdds`
- `tagRemoves`
- `tagCooldowns`
- `buffAdd`
- `buffRemoveId`

---

## 代码接入建议

### resolver

resolver 需要按新块顺序合并：

1. `coreGrowth`
2. `stateDelta`
3. `resourceDelta`
4. `progression`
5. `tags`
6. `effects`

如果同类字段来自不同来源，采用“同区块叠加、不同区块分开”的方式处理。

### gameEngine

`applyAction`、`applyChoice`、比赛结算、商店结算都应该只组装统一结果，不再各自拼散字段。

### 数据层

事件、行动、赛事奖励、商店商品都统一改成新结构后，再删除旧字段。

---

## 风险点

### 1. 事件池量大

`backend/src/data/events/` 内容很多，不能手工全靠记忆迁。

建议：

- 先做类型和 resolver。
- 再批量迁 `money` / 状态字段。
- 最后处理少数特殊事件。

### 2. 赛事奖励结构复杂

赛事奖励里同时有经验、金钱、名气、积分、压力。

建议把赛事奖励作为第一批迁移对象，因为它最能验证新结构是否够用。

### 3. 历史兼容会拖慢收口

这次建议不再保留长期兼容层。

只保留迁移窗口，完成后直接删除旧字段。

---

## 验收标准

当这次重构完成时，应该满足：

- `Outcome` 不再出现散落的多个平级数值字段。
- 金钱只能通过 `resourceDelta.money` 表达。
- 核心属性只能通过 `coreGrowth` 表达。
- `statChanges` 不再出现。
- resolver 不再有旧字段兼容分支。
- 新增内容时，字段归属一眼可判定。

---

## 建议排期

### 1. 先做结构设计

- 定义新类型
- 定义 resolver 处理顺序
- 定义事件编写规范

### 2. 再做核心路径迁移

- 日常行动
- 赛事奖励
- 商店商品

### 3. 最后清理事件池

- 批量替换剩余事件
- 跑类型检查
- 跑回归测试
- 删除旧字段

---

## 备注

这次重构的目标不是“改得更抽象”，而是让规则更不容易写错。

只要后续还会新增事件、行动、赛事、商店内容，这个拆分就值得做。
