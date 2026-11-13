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

第一阶段复用现有 `player.pendingMatch` 数据结构，但**改写赛事调度**，允许它指向未来 12 周内的赛事。

### 4.0 比赛周建模决策（地基，必须先定）

现状必须先讲清楚，否则后面全是错的：

- `Tournament` **没有"比赛周"字段**，只有 `signupWeeks: number[] | 'always'`（报名窗口周）。
- 比赛周在 `game.ts` 的 signup 里**写死为"当前周 + 2"**（`week+1` = 备赛周 / AP 100，`week+2` = 比赛周 / AP 0），完全不看赛事自身日程。
- `calendarBlocks.ts` 的 `allTournamentBlocks` 是按 `signupWeeks.includes(week)` 把赛事块铺在各周，所以日历上 "W12 BLAST" 这个块的语义是 **"W12 是该赛事的报名窗口周"**，不是 "W12 开打"。

**决策：采用方案 (b) —— 不新增比赛周字段，把现有 "signup 窗口周 + 2" 规则参数化。**

- 比赛周 `resolveWeek = 目标 signup 窗口周 + 2`。
- 本周报名（目标 signup 窗口周 = 当前周）→ 当前周 + 2，与现状完全一致。
- 预报名（目标 signup 窗口周在未来）→ 该未来窗口周 + 2。
- 这样同周报名与预报名共用同一条调度规则；承重的 `+1` 备赛周 / `+2` 比赛周 AP 逻辑保持不变；`Tournament` 数据结构不动，符合第 3 节"不重构状态机"的非目标。

**关键澄清：比赛周绑定的是"赛事自己的 signup 窗口周"，不是"你点预报名的那一周"。** 预报名只提前锁席位，不会把比赛拉到点击周附近。

举例（今天 W6，某赛事 `signupWeeks = [12]`）：

| 项 | 取值 |
|---|---|
| 点预报名的周 | W6 |
| 目标 signup 窗口周（赛事自己的） | **W12** |
| `resolveWeek` = 目标窗口周 + 2 | **W14** |
| ~~点击周 + 2~~（不采用） | ~~W8~~ |

即比赛排在 W14，日历从 W6（已报名）连续占用到 W14（比赛周）。若改用"点击周 + 2"会得到 W8——等于"提前报名能让比赛提前开打"，既不合理也与赛事日程脱节，故不采用。同周报名是该规则的特例：当前周已在窗口内时，目标窗口周 = 当前周，`resolveWeek = 当前周 + 2`，与现状一致。

> 备选方案 (a)：给 `Tournament` 增加独立的"比赛周"字段、预报名时 `resolveWeek` 取它。表达更精确，但要改数据模型并重排所有赛事的比赛周，超出第一阶段范围，留作后续。
>
> 目标 signup 窗口周的取法：signup 接口仍只收 `tournamentId`，目标窗口周由后端推导为 **未来 12 周窗口内、严格晚于当前周的最早一个 `signupWeeks`**（`'always'` 类赛事视目标窗口周 = 当前周 + 1）。这样不必给接口加 `week` 参数，结果也唯一确定。

也就是说：

```text
未报名
  -> 日历展示未来 12 周赛事
  -> 可预报名赛事显示“预报名”

点击预报名
  -> 后端推导目标 signup 窗口周（未来 12 周内、晚于当前周的最早一个）
  -> 后端按"目标窗口周"校验报名窗口，按"当前状态"校验资格、战队、VRS、名气
  -> resolveWeek = 目标 signup 窗口周 + 2
  -> 写入 player.pendingMatch（resolveYear/resolveWeek 指向未来）
  -> 消耗资格票
  -> 生成 tournamentContext

报名成功后
  -> 当前周到比赛周显示连续行程（pendingMatchBlocks 已支持，见 5.3）
  -> 不允许报名第二个赛事
  -> 允许退赛，沿用 withdraw 惩罚
```

---

## 5. 状态设计

### 5.1 日历块状态

后端 `calendarBlocks` 应明确区分“展示状态”和“可执行动作”。

> 以现网 `insights/types.ts` 的 `CalendarBlockInsight` 为基线，本方案**只做一处类型扩展**：把现有可选字段 `action` 的取值并集加上 `'preregister'`。`kind` / `source` / `tone` 等枚举沿用现网定义，不要在文档里另立一份会漂移的子集类型。

```ts
// 现网已有，本方案唯一改动：action 并集 + 'preregister'
interface CalendarBlockInsight {
  id: string;
  year: number;
  week: number;
  endYear?: number;
  endWeek?: number;
  kind: 'opportunity' | 'commitment' | 'travel' | 'prep' | 'match' | 'recovery' | 'empty';
  title: string;
  shortTitle: string;
  tier?: string;
  status: string;
  tone: 'neutral' | 'available' | 'locked' | 'active' | 'major' | 'warning';
  // 注意：赛事块用的是 'tournament-calendar'，不是 'career-goal'
  source: 'career-goal' | 'tournament-calendar' | 'pending-match' | 'tournament-context' | 'system';
  tournamentId?: string;
  action?: 'signup' | 'preregister' | 'withdraw' | 'none'; // ← 仅新增 'preregister'
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

> 实现提示：连续行程展示**已经实现**。`calendarBlocks.ts` 的 `pendingMatchBlocks` 已会从 `tournamentContext.signedUpAtYear/Week` 连续渲染到 `pendingMatch.resolveYear/Week`，并输出 `已报名` / `备赛周`（`contextPhase === 'pre-match'`）/ `等待比赛` / `比赛周`、`commitment` / `match` 等状态。因此本节只要 `resolveWeek` 能指向远处即自动成立，**无需新写渲染逻辑**。需要注意的是当前 `备赛周` 仅在 `phase === 'pre-match'` 时出现，多周间隔下中间周会落到 `等待比赛`——若想区分 `prep`/`travel` 等更细的行程块，属于第二阶段（见第 9 节）。

---

## 6. 后端落地方案

### 6.1 改造报名接口

当前 `POST /api/game/:sessionId/signup` 只接受本周赛事，且把比赛周写死为 `当前周 + 2`（`game.ts:787-795`）。两处都要改。

接口仍只收 `tournamentId`，逻辑改成：

1. 取该赛事的 `signupWeeks`，推导**目标 signup 窗口周**：
   - 若当前周在 `signupWeeks` 内（或 `'always'`）→ 目标窗口周 = 当前周，走原本周报名路径。
   - 否则取未来 12 周窗口内、严格晚于当前周的最早一个 `signupWeeks` 作为目标窗口周（即预报名）；窗口外则拒绝。
2. **窗口校验用目标窗口周**：`canSignUpForTournament(player, t, points, 目标窗口周)`，避免预报名被 `signupWeeks.includes(当前周)` 误拒。
3. **门槛校验用当前状态**：资格票、VRS、名气、战队 tier 一律按当前 player 评估并立即锁定（与 6.2 一致）。
4. 比赛周改为 `resolveWeek = 目标窗口周 + 2`（替换写死的 `当前周 + 2`）。
5. 若已有 `player.pendingMatch`，拒绝报名第二个赛事。

> 说明：第 2 步与第 3 步刻意分离——"窗口"看未来目标周，"资格"看当前。这就是"报名即锁定"的语义：用今天的资格锁一个未来席位。

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

> 与现状一致：现网 signup 已在报名时立即消耗资格票（`game.ts:739-784`），本节规则无需改动消耗时机，只是把它沿用到预报名路径。

### 6.3 `pendingMatch` 复用

预报名成功后继续写入：

```ts
player.pendingMatch = {
  tournamentId,
  resolveYear,
  resolveWeek,   // = 目标 signup 窗口周 + 2（跨年时进位，沿用现有 addWeeks 逻辑）
  stageIndex,
  qualificationSlotUsed,
  qualificationSlotOwner,
  ...
}
```

`resolveWeek` 由 `目标 signup 窗口周 + 2` 推出（见 4.0 决策），同周报名时即退化为现状的 `当前周 + 2`。AP 与备赛逻辑不变：`resolveWeek - 1` 为备赛周、`resolveWeek` 为比赛周冻结行动力；预报名拉长的中间周按正常行动周处理（AP 100），不提前冻结。

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

> 与现状一致：`tournamentBlock` 的 `canSubmitSignup` 已要求 `!pendingMatch`，有 pendingMatch 时其余赛事块自动落到 `action: 'none'`。新增的 `preregister` 分支同样必须带 `!pendingMatch` 判定。

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
- 比赛前 1 周（`resolveWeek - 1`）：插入赛前准备事件。
- 比赛周（`resolveWeek`）：强制赛事比赛事件。
- 其他备赛周：只在日历展示，不强制事件。

> 状态机风险（需在实现时验证）：现网 `+2` 调度只产生**单个**备赛周，`tournamentContext.phase` 的 `pre-match` → `match` 流转目前只在 1 周间隔下验证过。预报名会把间隔拉到数周，必须确认：(1) `phase` 不要在报名当周就切到 `pre-match`（否则中间周一直显示"备赛周"且可能误触发赛前事件），赛前事件应严格以 `当前周 === resolveWeek - 1` 为闸；(2) 中间周行动力按正常行动周（AP 100）处理，只有 `resolveWeek` 当周冻结为 0；(3) 跨年（`week > 48`）时 `resolveWeek` 进位与 `pendingMatchBlocks`/`addWeeks` 的折算一致。这三点是预报名相对同周报名唯一新增的状态机覆盖面，应配套测试。

### 8.5 预报名阵容锁定与顶替规则

预报名时**锁定参赛阵容**（报名当下的首发名单，记入 `TournamentInstance.teams[].registeredRosterIds`，Phase 4）。报名后到开赛前若有选手转会/离队（Phase 5），按下列规则裁定资格：

- **可顶替继续参赛**：若队伍能在开赛前找到顶替选手补位，则该队**仍可参赛**；但必须**标注该场由顶替选手出战**（`participatingAsSubstitute`），且该选手取得的**荣誉理论上归属被顶替的原阵容选手**（MVP/积分等记到原选手名下）。
- **超限取消资格**：若开赛时**有 ≥ 3 名出战选手不属于预报名阵容**，该队**取消参赛资格**，由另一支**有资格的队伍顶替进入**赛事（从候选池按 VRS/资格补位）。
- 适用于玩家队与世界队伍：玩家所在队若在开赛前流失 ≥ 3 名预报名首发，则失去该赛事资格（触发相应事件提示，不静默）。

> 落点：阵容锁定与顶替计数在 `TournamentInstance` 维护（Phase 4 §3）；转会执行（Phase 5）改动选手归属后，需回查其预报名赛事并更新顶替计数 / 触发资格裁定；荣誉归属在奖项结算（Phase 4 §6）按 `registeredRosterIds` 映射回原选手。

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
7. 预报名后 `resolveWeek === 目标 signup 窗口周 + 2`，且同周报名仍为 `当前周 + 2`（回归）。
8. 预报名后的中间周行动力为 100，仅 `resolveWeek` 当周冻结为 0；赛前事件只在 `resolveWeek - 1` 触发。
9. 后端测试覆盖：
   - 本周报名（回归，调度不变）。
   - 未来预报名（窗口用目标周校验、资格用当前状态、`resolveWeek` 正确）。
   - 已有 `pendingMatch` 时拒绝第二报名。
   - 资格不足时不允许预报名。
   - 预报名后 `calendarBlocks` 连续更新。
   - 多周间隔下 `phase` 不提前切 `pre-match`、AP 与跨年进位正确。

