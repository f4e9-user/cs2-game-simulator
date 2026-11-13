# 阵容离队压力设计方案（已完成）

> 文档版本：v1.0
> 落地日期：2026-06-10
> 当前分支：feature/team-management-actions
> 状态：已完成

---

## 1. 设计目标

当前阵容变动使用固定 `departureRound` 推进，优点是实现简单，但会带来两个问题：

- 队伍表现再好，核心队友还是会在某个固定时间点离队。
- 队伍信任、队友默契、话语权、赛事成绩都没有真实影响阵容稳定性。

新的目标是把“离队时间”改成“离队压力”的结果，让阵容变动更像真实 CS 世界：

- 队伍打得越好，核心阵容越容易稳定。
- 队内关系越好，队友越不想走。
- 队内话语权越明确，关键成员越不容易被外部因素撬走。
- 队伍状态越差，离队越容易提前发生。

核心原则：

- 阵容变动不能只看时间。
- 赛事成绩、队伍关系、身份话语权都要参与。
- 玩家可以感知为什么这名队友会留下或离开。

---

## 2. 当前问题

当前实现里，`pendingDeparture` 只记录：

- `slotId`
- `departureRound`
- `rumorShown`
- `revealed`
- `destTeamName`
- `earlyRecruit`

这意味着：

- 只要到了回合就离队。
- 连胜、夺冠、默契提升都不会延后。
- 指挥、明星、轮换位之间没有差异。

这与玩家对“真实队伍”的预期不一致。

---

## 3. 设计思路

建议把离队机制拆成三个层：

### 3.1 基础窗口

每个潜在离队槽位先有一个基础离队窗口：

```ts
baseDepartureWindow = [20, 40] // 现有逻辑可继续作为基础参考
```

它只代表“什么时候开始进入可离队区间”，不代表必定离队。

### 3.2 离队压力

每回合不直接判断“到点离队”，而是计算一个 `departurePressure`。

离队压力达到阈值后，离队事件才真正推进。

### 3.3 延期/加速修正

赛事表现、队伍关系、话语权都会修改离队压力：

- 正向表现好 -> 延后离队
- 队内信任高 -> 延后离队
- 队友默契高 -> 延后离队
- 关键身份冲突 -> 加速离队

---

## 4. 影响因素

### 4.1 赛事战绩

队伍打得越好，越容易把核心成员留住。

建议按队伍档位设置“关键赛事门槛”：

| 队伍档位 | 关键赛事 |
|---|---|
| 青训队 | B 级赛事 |
| 二线队 | A 级赛事 |
| 职业队 | S 级 / Major |
| 顶级队 | S 级 / Major |

说明：职业队和顶级队在离队延后判定上使用同一套标准，不再区分两套门槛。只要在 S 级或 Major 打进深轮、决赛或夺冠，就可以明显延后离队回合。

规则建议：

- 如果队伍在对应关键赛事中打进决赛或夺冠，则对离队压力施加明显延期。
- 如果队伍持续深轮但未夺冠，也应适度延后。
- 如果队伍连续早出局，则离队压力上升。

示例：

```ts
if (clubTier === 'youth' && tournamentTier === 'b' && ['final', 'champion'].includes(result)) delay += 8
if (clubTier === 'semi-pro' && tournamentTier === 'a' && ['final', 'champion'].includes(result)) delay += 8
if (['pro', 'top'].includes(clubTier) && ['s-open', 's-closed', 's-class', 'major'].includes(tournamentTier) && ['deep-run', 'final', 'champion'].includes(result)) delay += 10
```

### 4.2 队伍关系

队伍信任和队友默契都应该降低离队倾向。

建议分开看：

- `teamTrust`：更衣室信任
- `teamChemistry`：整队磨合，建议作为派生值展示，不单独长期存储
- `teammate.chemistry`：与某个队友的个人默契

规则建议：

- `teamTrust` 越高，离队压力越低。
- 队伍默契越高，离队压力越低。
- 要离队的那名队友和玩家的默契越高，离队压力越低。
- 如果队友和玩家本来就不合，则离队压力更高。

### 4.3 话语权

如果目标队友是指挥，且话语权不在他手上，会明显增加离队可能。

建议引入以下判断：

- `caller`：队伍实际指挥
- `star`：队伍明星位
- `player`：玩家本人是否掌握话语权

规则建议：

- 如果即将离队的队友是 `caller`，但真正话语权在玩家或另一名明星手里，则离队压力上升。
- 如果玩家是队内明星，但指挥压不住队伍，也会产生内部冲突事件。
- 如果玩家既是指挥又是明星，离队压力下降，但队伍成绩差时仍可能失稳。

---

## 5. 推荐数据结构

建议把 `pendingDeparture` 扩展为“离队进度对象”：

```ts
pendingDeparture: {
  slotId: string;
  destTeamName: string;
  earlyRecruit: boolean;
  rumorShown: boolean;
  revealed: boolean;
  baseWindowStartRound: number;
  pressure: number;              // 0-100
  pressureThreshold: number;     // 触发离队的门槛
  lastPressureRound: number;
  lockedUntilRound?: number;      // 赛事保护期
  reasonTags: string[];
} | null;
```

### 字段含义

- `pressure`：当前离队倾向
- `pressureThreshold`：何时真正离队
- `lockedUntilRound`：近期打出关键成绩后，短期内锁住阵容
- `reasonTags`：用于 UI 解释“为什么会走 / 为什么没走”

---

## 6. 回合结算建议

每回合推进时，不再直接看 `departureRound`，而是：

```ts
departurePressure += baseDrift
departurePressure += performanceDelta
departurePressure += relationshipDelta
departurePressure += authorityDelta

if (departurePressure >= pressureThreshold && round >= baseWindowStartRound) {
  triggerDeparture()
}
```

### 6.1 `baseDrift`

自然流失项，代表合同周期、转会传闻和赛季推进。

### 6.2 `performanceDelta`

由最近赛事结果决定：

- 连胜、深轮、夺冠 -> 负值
- 连败、早出局 -> 正值

### 6.3 `relationshipDelta`

由队伍信任、队伍默契、队友默契决定：

- 高 -> 负值
- 低 -> 正值

### 6.4 `authorityDelta`

由话语权和身份冲突决定：

- 指挥与明星争权 -> 正值
- 玩家是核心明星且队伍稳定 -> 负值

---

## 7. UI 表达

离队相关 UI 不要只显示“几回合后离队”，要显示原因。

建议展示：

```text
离队倾向：中
原因：
- 队伍最近连续打进 B 级赛事决赛
- 你与他默契较高，离队倾向降低
- 队内话语权冲突较大，离队倾向上升
```

玩家应该能看懂：

- 为什么这名队友可能留下
- 为什么他可能离开
- 当前是延后还是加速

---

## 8. 版本规划

### V1

先把固定 `departureRound` 改成离队压力系统：

- 保留现有转会传闻和到期事件
- 增加压力值
- 队伍表现和关系参与延期

### V2

引入话语权修正：

- 指挥、明星、普通成员的离队倾向不同
- 队内争权可直接影响离队压力

### V3

把队伍成绩和离队压力进一步联动：

- 不同档位对应不同关键赛事
- 赛季深轮可显著稳定阵容
- 低迷期会更频繁触发离队传闻

---

## 9. 实现边界

暂不建议一开始做的内容：

- 完整经纪人系统
- 多名队友同时独立决策离队
- 复杂转会窗口
- 俱乐部拒放人博弈

先把“离队为什么发生”做清楚，再考虑更重的转会生态。
