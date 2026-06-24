# 未来赛事预报名设计方案

> 文档状态：设计待落地  
> 文档日期：2026-06-24  
> 目标落地日期：2026-06-24  
> 适用范围：赛事日历、报名接口、`calendarBlocks` 行程展示、赛事状态机  
> 当前策略：第一阶段只支持单个未来赛事预报名，暂不支持多赛事并行排程

---

## 1. 背景

当前中栏已经新增“赛程”标签页，后端也开始提供 `careerInsight.calendarBlocks`，用于展示未来 12 周赛事、空档周和已报名赛事行程。

现有问题是：玩家在日历上看到未来 12 周内的赛事窗口后，会自然期待可以提前锁定行程。例如第 6 周看到第 12 周的 BLAST Bounty，合理体验应是可以提前预报名，而不是只能等到第 12 周才操作。

但现有后端 `signup` 只允许本周开放赛事报名。前端若直接给未来周展示“报名”按钮，会触发 `400 Bad Request`。

因此，需要明确“未来赛事预报名”的规则、状态和落地边界。

---

## 2. 设计目标

1. 让赛事日历真正成为“职业行程表”，而不是静态赛事列表。
2. 支持玩家提前锁定未来 12 周内的一个赛事。
3. 报名后，日历自动把当前周到比赛周之间展示为连续行程。
4. 保持第一阶段状态机简单，不引入多个并行赛事队列。
5. 避免前端展示可点击按钮但后端拒绝的合同不一致问题。

---

## 3. 非目标

第一阶段不做以下内容：

- 不支持同时报名多个未来赛事。
- 不新增完整 `scheduledMatches[]` 多赛事队列。
- 不实现复杂行程冲突、改签和自动优先级。
- 不允许一个玩家同时锁定两个重叠赛事。
- 不重构整个赛事状态机。

这些能力后续可以作为第二阶段扩展。

---

## 4. 推荐方案

第一阶段沿用现有 `player.pendingMatch`，但允许它指向未来 12 周内的赛事。

也就是说：

```text
未报名
  -> 日历展示未来 12 周赛事
  -> 可预报名赛事显示“预报名”

点击预报名
  -> 后端校验赛事在未来 12 周窗口内
  -> 后端校验资格、战队、VRS、名气等门槛
  -> 写入 player.pendingMatch
  -> 消耗资格票
  -> 生成 tournamentContext

报名成功后
  -> 当前周到比赛周显示连续行程
  -> 不允许报名第二个赛事
  -> 允许退赛，沿用 withdraw 惩罚
```

---

## 5. 状态设计

### 5.1 日历块状态

后端 `calendarBlocks` 应明确区分“展示状态”和“可执行动作”。

```ts
type CalendarBlockKind =
  | 'opportunity'
  | 'commitment'
  | 'prep'
  | 'match'
  | 'empty';

type CalendarBlockAction =
  | 'signup'
  | 'preregister'
  | 'withdraw'
  | 'none';
```

推荐字段：

```ts
interface CalendarBlockInsight {
  id: string;
  year: number;
  week: number;
  kind: CalendarBlockKind;
  title: string;
  shortTitle: string;
  tier?: string;
  status: string;
  tone: 'neutral' | 'available' | 'locked' | 'active' | 'major' | 'warning';
  source: 'career-goal' | 'pending-match' | 'tournament-context' | 'system';
  tournamentId?: string;
  action: CalendarBlockAction;
  detail?: string;
}
```

### 5.2 未报名时

| 场景 | status | action | 前端按钮 |
|---|---|---|---|
| 本周可报名 | `可报名` | `signup` | `报名` |
| 未来周可预报名 | `可预报名` | `preregister` | `预报名` |
| 未来周资格不足 | 缺资格原因 | `none` | 无 |
| 空档周 | `空档` | `none` | 无 |

### 5.3 已预报名后

| 周期 | kind | status | action | 说明 |
|---|---|---|---|---|
| 报名当周 | `commitment` | `已报名` | `withdraw` | 可退赛 |
| 报名后到比赛前 | `prep` 或 `commitment` | `备赛周` / `等待比赛` | `none` | 展示行程占用 |
| 比赛周 | `match` | `比赛周` | `none` | 行动冻结，进入赛事事件 |

示例：

```text
W6  BLAST Bounty Season 9
    已报名

W7  BLAST Bounty Season 9
    备赛周

W8  BLAST Bounty Season 9
    备赛周

W9  BLAST Bounty Season 9
    备赛周

W10 BLAST Bounty Season 9
    比赛周
```

---

## 6. 后端落地方案

### 6.1 改造报名接口

当前 `POST /api/game/:sessionId/signup` 只接受本周赛事。

需要改成：

1. 先查本周可报名赛事。
2. 如果没找到，再查未来 12 周可见赛事。
3. 如果赛事在未来 12 周内且资格满足，允许预报名。
4. 如果已有 `player.pendingMatch`，拒绝报名第二个赛事。

错误文案建议：

```text
已有报名赛事，需先退赛后才能报名新赛事
该赛事不在未来 12 周预报名窗口内
当前资格不足，不能预报名该赛事
```

### 6.2 资格消耗

第一阶段采用“报名时立即锁定/消耗资格”的规则。

理由：

- 玩家点击预报名后应得到确定席位。
- 避免到比赛周时资格变化导致行程突然失效。
- 逻辑与当前本周报名保持一致。

退赛是否返还资格：

第一阶段不返还，沿用现有弃赛惩罚。

### 6.3 `pendingMatch` 复用

预报名成功后继续写入：

```ts
player.pendingMatch = {
  tournamentId,
  resolveYear,
  resolveWeek,
  stageIndex,
  qualificationSlotUsed,
  qualificationSlotOwner,
  ...
}
```

`resolveWeek` 指向赛事实际比赛周。

### 6.4 `tournamentContext` 生成

预报名成功后立即生成 `tournamentContext`：

```ts
player.tournamentContext = createTournamentContext(player, pendingMatch, tournament);
```

用于后续：

- 赛前上下文事件
- 备赛周提示
- 比赛周强制赛事事件
- 赛后上下文承接

---

## 7. 前端落地方案

### 7.1 赛程 Tab 展示

中栏 `赛程` tab 保持 12 周日历视图。

按钮规则：

| action | 按钮 |
|---|---|
| `signup` | `报名` |
| `preregister` | `预报名` |
| `withdraw` | `退赛` |
| `none` | 不显示按钮 |

### 7.2 报名成功后刷新

前端点击 `预报名` 后：

1. 调用后端报名接口。
2. 成功后刷新 session。
3. 读取新的 `careerInsight.calendarBlocks`。
4. 日历自动显示连续行程。

### 7.3 禁止前端自行推断按钮

前端不能用 `status === '可报名'` 或 `available === true` 自行推断按钮。

唯一按钮来源是：

```ts
block.action
```

这样可以避免 UI 和后端规则不一致。

---

## 8. 风险与处理

### 8.1 多赛事冲突

第一阶段通过“只允许一个 `pendingMatch`”规避。

如果已有 `pendingMatch`，所有其他赛事块只展示，不给报名按钮。

### 8.2 未来资格变化

第一阶段采用报名时锁定席位，资格立刻消耗。

后续如果想更真实，可以增加“预约报名”状态，到比赛周再复核资格。但这会增加失败行程、退票和补位逻辑，不建议第一阶段做。

### 8.3 误点未来赛事

需要保留退赛能力。

第一阶段可复用现有 `withdraw`，但建议前端增加确认弹窗，明确：

- 退赛会增加压力。
- 可能损失名气。
- 已消耗资格不返还。

### 8.4 赛事上下文提前触发过多

预报名成功后，不应该每周都强塞赛事事件。

建议规则：

- 报名当周：可插入报名确认/媒体反应。
- 比赛前 1 周：插入赛前准备事件。
- 比赛周：强制赛事比赛事件。
- 其他备赛周：只在日历展示，不强制事件。

---

## 9. 分阶段落地

### 第一阶段：单赛事预报名

状态：待实现  
目标落地日期：2026-06-24

- 后端允许未来 12 周赛事预报名。
- `pendingMatch` 支持未来赛事。
- `calendarBlocks` 输出 `preregister` action。
- 前端显示 `预报名` 按钮。
- 报名后日历显示连续占用。
- 已有 `pendingMatch` 时禁止第二个报名。
- 退赛复用现有 `withdraw`。

### 第二阶段：更完整的行程块

状态：待设计

- 区分 `travel` / `prep` / `media` / `match` / `recovery`。
- 根据赛事级别生成更明确的备赛节奏。
- 背靠背赛事给疲劳或压力提示。

### 第三阶段：多赛事排程

状态：暂不做

- 引入 `scheduledMatches[]`。
- 支持多个未来赛事。
- 做行程冲突、优先级、改签和退票规则。

---

## 10. 验收标准

第一阶段完成后应满足：

1. 未来 12 周内符合资格的赛事显示 `预报名`。
2. 点击未来赛事不会再触发 `400 Bad Request`。
3. 预报名成功后，日历从当前周到比赛周显示连续行程。
4. 已预报名时，其他未来赛事不显示报名按钮。
5. 退赛后，日历恢复未来赛事窗口。
6. 前端按钮完全由 `calendarBlocks.action` 驱动。
7. 后端测试覆盖：
   - 本周报名。
   - 未来预报名。
   - 已有 `pendingMatch` 时拒绝第二报名。
   - 资格不足时不允许预报名。
   - 预报名后 `calendarBlocks` 连续更新。

