# 队伍主动管理动作设计方案

> 文档版本：v1.0  
> 落地日期：2026-06-06  
> 当前分支：dev  
> 状态：设计方案，尚未实现

---

## 1. 设计目标

当前队友系统已经有阵容、角色、个性、队友属性、teamTrust、团队协同计算和离队计划，但玩家主要是被动等待队友事件。新增队伍主动管理动作的目标是：

- 让队友名单从“展示信息”变成“可经营对象”。
- 让 teamTrust、队友属性、队伍默契、队友默契和团队协同形成可理解的关系。
- 保持单选手职业生涯视角，不扩展成完整经理模拟。
- 所有主动管理动作消耗 AP，和现有行动力系统保持一致。

---

## 2. 当前系统约束

### 已有字段

- `player.team`
- `player.roster`
- `player.teamTrust`
- `player.pendingDeparture`
- `player.tags`
- `player.actionPoints`
- `Teammate.stats`
- `Teammate.role`
- `Teammate.personality`
- `Teammate.growthSpent`

### 已有比赛影响

当前版本比赛中已经存在：

```ts
teamBonus = rosterTeamBonus + synergyBonus + trustModifier
```

当前版本含义：

- `rosterTeamBonus` 来自队友属性。
- `synergyBonus` 来自角色、特质和阵容协同。
- `trustModifier` 来自 `teamTrust`。

V2 接入队友默契后，目标公式会移除独立 `trustModifier`，改为让 `teamTrust` 进入派生队伍默契公式，避免信任度重复结算。

所以 V1 不新增长期“默契”字段，先用：

- 队友属性成长
- `teamTrust`
- 短期比赛 buff

来表达队伍经营成果。

---

## 3. 四个队伍概念边界

后续设计必须区分四个概念，避免把所有团队效果都塞进一个数值。

### 3.1 队伍信任

字段：`teamTrust`

含义：队内关系、更衣室气氛、是否愿意相信彼此。

主要影响：

- 冲突事件风险。
- 更衣室相关判定 DC。
- 比赛稳定性修正。
- 队友离队和挽留事件的情绪成本。

它不是战术熟练度，也不是阵容天然适配度。

### 3.2 团队协同

当前函数：`calcSynergyBonus(player, roster)`

含义：这套阵容从角色和特质上是否天然搭配。

来源：

- 队伍里是否有 IGL。
- 是否有 AWPer。
- 玩家和队友 trait 是否互补。
- ego / solo 等负面 trait 是否过多。

它更像“阵容结构分”，不应该被日常训练直接永久刷高。玩家可以通过换队友、角色转型或后续阵容管理间接影响它。

### 3.3 队伍默契

含义：整支队伍是否练熟，战术执行是否顺，临场沟通是否形成习惯。

队伍默契不建议作为独立长期存储字段，而是由“队友默契 + 队伍信任”派生出来。

推荐：

```ts
teamChemistry = deriveTeamChemistry(roster, teamTrust)
```

它和团队协同的区别：

- 团队协同：这套人从纸面上搭不搭。
- 队伍默契：这套人一起练了多久、执行是否熟。

它和队伍信任的区别：

- 队伍信任：愿不愿意相信彼此。
- 队伍默契：知不知道彼此会怎么打。

### 3.4 队友默契

建议字段：放在单个 `Teammate` 上，例如：

```ts
teammateChemistry: number; // 0-100
```

或：

```ts
Teammate.chemistry: number; // 0-100
```

含义：玩家与某一个队友之间是否熟悉。

它用于表达：

- 和某个队友加练很多次。
- 玩家和某个角色位形成固定配合。
- 某个队友离队时，玩家会失去一段具体关系，而不是只掉一个抽象团队数值。

队友默契不等于队伍默契。一个选手可能和 AWPer 很有默契，但整队战术执行仍然混乱。

---

## 4. 四者之间的关系

### 4.1 推荐比赛公式

未来加入队伍默契后，比赛公式建议保持分层：

```ts
teamBonus =
  rosterTeamBonus
  + calcSynergyBonus(player, roster)
  + calcTeamChemistryModifier(deriveTeamChemistry(roster, teamTrust))
```

这样赛前状态预览可以拆开显示：

```text
队友能力 +2
团队协同 +1
队伍默契 +1
```

玩家能看懂每一项来自哪里。

注意：比赛胜率中不再单独叠加 `trustModifier`。队伍信任作为队伍默契的发挥环境参与派生计算，避免同一个 `teamTrust` 同时在“信任修正”和“默契修正”里重复结算。

### 4.2 互相影响，但不互相替代

四者可以互相影响增长效率：

- 高队伍信任会放大队友默契在比赛中的发挥。
- 低队伍信任会压低队友默契在比赛中的发挥。
- 高团队协同会让战术会议更容易成功。
- 低团队协同会让队友默契增长更慢。
- 高队友默契会提高派生出来的队伍默契。
- 队友离队会损失对应队友默契，并降低派生出来的队伍默契。

但它们不应该互相替代：

- 不要用 `teamTrust` 直接代表战术熟练度。
- 不要用 `synergyBonus` 代表训练成果。
- 不要把队伍默契存成另一个可刷资源。
- 不要让单个队友默契直接等同于整队默契，必须经过全队平均和队伍信任修正。

### 4.3 数值定位

建议定位如下：

| 概念 | 范围 | 是否已有 | 变化速度 | 主要来源 |
|---|---:|---|---|---|
| 队伍信任 `teamTrust` | 0-100 | 已有 | 中 | 赛事结果、冲突、安抚、会议 |
| 团队协同 `synergyBonus` | 派生值 | 已有 | 慢 | 阵容角色和 trait |
| 队伍默契 `teamChemistry` | 派生值 | 未有 | 随派生变化 | 队友默契 + 队伍信任 |
| 队友默契 `Teammate.chemistry` | 0-100 | 未有 | 中 | 单人加练、共同比赛、队友事件 |

---

## 5. 总体交互

入口放在战队面板，而不是普通日常行动面板。

建议 UI：

```text
战队
战队信任度 42 / 100
队伍默契 36 / 100

阵容
[IGL] 李大锤  均值 5.2  默契 41    [加练]
[AWPer] OneTap 均值 6.1 默契 55    [加练]
[Support] 阿杰 均值 4.8 默契 33   [加练]

团队管理
[战术会议 -30 AP]
[安抚更衣室 -25 AP]
```

动作结果使用轻量反馈，不进入随机事件池。

---

### 5.1 赛前分析卡片展示

赛事报名后的赛前状态卡片也需要展示队伍相关信息，让玩家理解战队经营为什么会影响比赛。

无队伍时：

```text
队伍：无队伍，以个人状态参赛
```

有队伍时展示：

```text
队伍信任：正常 / 高度信任 / 关系紧张
团队协同：良好 / 普通 / 存在冲突
队伍默契：熟练 / 一般 / 生疏
```

展示原则：

- 不暴露完整公式，只展示方向性影响。
- 队伍相关信息最多展示 3 条，避免赛前卡片信息过载。
- `队伍信任` 来自 `teamTrust`。
- `团队协同` 来自 `calcSynergyBonus(player, roster)`。
- `队伍默契` 来自 `deriveTeamChemistry(roster, teamTrust)`。
- `关键队友默契` 只在特别高或特别低时展示；普通区间不展示。
- 关键队友默契取 `Teammate.chemistry` 最高或最低的 1 名队友，用自然语言描述。
- 如果 V2 尚未实现队友默契，则赛前卡片只展示当前已有的队伍信任和团队协同。

示例：

```text
队伍信任：关系紧张，更衣室气氛会拖累关键回合
团队协同：良好，角色和特质能形成配合
队伍默契：一般，战术执行没有明显加成
```

---

## 6. V1：最小可落地版本

V1 只做三个主动动作：

- 和某个队友加练
- 战术会议
- 安抚更衣室

V1 不调整比赛公式，不新增队友默契字段，也不移除当前 `trustModifier`。比赛公式、队友默契和派生队伍默契统一放到 V2，避免出现半套团队公式。

### 6.1 通用限制

所有队伍管理动作都要求：

- 当前有战队。
- 当前有 `roster`。
- 当前不在赛事比赛周。
- AP 足够。
- 当前处于行动阶段。

建议新增每周冷却字段：

```ts
weeklyTeamActions: Record<string, { year: number; week: number; count: number }>;
```

冷却 key 示例：

```text
practice:slot-1
team-meeting
locker-room-talk
```

不建议复用 `weeklyShopPurchases`，避免商店和队伍动作混在一起。

---

### 6.2 队友加练

入口：队友名单行右侧按钮。

```text
加练 -25 AP
```

目标：培养指定队友，同时让玩家承担疲劳和压力。

#### 判定

按队友角色决定主属性：

| 队友角色 | 玩家主属性 |
|---|---|
| IGL | intelligence |
| AWPer | agility |
| Entry | agility |
| Support | mentality |
| Lurker | intelligence |

副属性：`experience`

建议 DC：

```ts
dc = 8 + Math.floor(teammateAverage / 4)
```

高水平队友更难被玩家“带练”出明显收益。

#### 成功效果

- 目标队友角色主属性 `+0.4 ~ +0.8`。
- 玩家疲劳 `+12`。
- 玩家压力 `+4`。

#### 失败效果

- 目标队友属性不变，或保底 `+0.1`。
- `teamTrust +0`；如果队友个性是 `drama`，可低概率 `teamTrust -1`。
- 玩家疲劳 `+10`。
- 玩家压力 `+8`。

#### 限制

- 每个队友每周 1 次。
- 全队每周最多加练 2 次，避免把“轮流加练所有队友”变成固定最优解。
- AP 消耗：25。

V2 迁移时，队友加练成功映射为目标队友默契 `+4`；失败映射为目标队友默契 `+1` 或不变。队伍默契不单独增加，只会因为目标队友默契进入平均值后自动变化。

---

### 6.3 战术会议

入口：战队面板团队管理区。

```text
战术会议 -30 AP
```

目标：提升整体协作和短期比赛准备。

#### 判定

主属性：`intelligence`  
副属性：`mentality`

基础 DC：

```ts
dc = 10
if (teamTrust < 30) dc += 2
if (tags.includes('locker-tension')) dc += 2
```

#### 成功效果

- `teamTrust +4`。
- 玩家压力 `+3`。
- 玩家疲劳 `+6`。
- 获得短期比赛 buff：

```ts
{
  id: 'team-tactical-ready',
  label: '战术统一',
  actionTag: 'match',
  stressGainMultiplier: 0.9,
  remainingUses: 1,
  consumeOn: 'stress'
}
```

#### 失败效果

- `teamTrust -2`。
- 玩家压力 `+10`。
- 玩家疲劳 `+5`。
- 如果已有 `locker-tension`，保留。
- 如果没有，可低概率添加 `locker-tension`。

#### 限制

- 每周 1 次。
- AP 消耗：30。

V2 迁移时，战术会议成功映射为全队队友默契 `+1~2`。队伍默契不单独增加，只会因为全队队友默契平均值变化而自动变化。它不应该永久提高队友核心属性；核心属性成长保留给“队友加练”。

---

### 6.4 安抚更衣室

入口：战队面板团队管理区。

只有满足以下任一条件时显示：

- 存在 `locker-tension`。
- `teamTrust < 30`。

```text
安抚更衣室 -25 AP
```

#### 判定

主属性：`mentality`  
副属性：`experience`

基础 DC：

```ts
dc = 10
if (roster.some(tm => tm.personality === 'drama')) dc += 2
if (roster.some(tm => tm.personality === 'supportive')) dc -= 1
```

#### 成功效果

- 移除 `locker-tension`。
- `teamTrust +5`。
- 玩家压力 `-5`。
- 玩家疲劳 `+3`。

#### 失败效果

- `teamTrust -3`。
- 玩家压力 `+10`。
- `locker-tension` 保留。

#### 限制

- 每周 1 次。
- AP 消耗：25。

V2 迁移时，安抚更衣室不直接修改队友默契，只通过提高或降低 `teamTrust` 影响派生队伍默契。

---

## 7. V1 后端接口

建议新增接口：

```http
POST /api/game/:sessionId/team-practice
POST /api/game/:sessionId/team-meeting
POST /api/game/:sessionId/locker-room-talk
```

### 队友加练请求体

```json
{
  "teammateId": "slot-1"
}
```

### 返回结构

建议统一返回：

```ts
interface TeamActionResponse {
  player: Player;
  result: {
    actionId: string;
    label: string;
    success: boolean;
    roll: number;
    dc: number;
    narrative: string;
    effects: string[];
  };
}
```

前端可以直接把 `effects` 展示为 chip。

---

## 8. V1 引擎方法

建议新增：

```ts
applyTeamPractice(session, teammateId)
applyTeamMeeting(session)
applyLockerRoomTalk(session)
```

共同处理：

- 校验 session active。
- 校验有战队和 roster。
- 校验 AP。
- 校验比赛周。
- 校验每周次数。
- 根据玩家属性、队友数据和随机数进行判定。
- 更新 player。

队友属性成长建议使用小数，并限制单个队友成长上限：

```ts
teammate.growthSpent += growthAmount;
if (teammate.growthSpent >= TEAMMATE_GROWTH_CAP) stopGrowth;
```

V1 可先设：

```ts
TEAMMATE_GROWTH_CAP = 8
```

避免长期刷一个队友。

---

## 9. V2：队友默契与派生队伍默契

如果 V1 验证后确实需要长期默契，V2 不新增独立 `teamChemistry` 存储字段，只给单个队友新增默契字段：

```ts
interface Teammate {
  chemistry?: number; // 0-100，新队友默认 35，旧阵容迁移默认 50
}
```

初始化规则：

- 新签战队生成 roster：队友默契默认 `40`。
- 队友离队后的替补加入：队友默契默认 `35`。
- 旧数据迁移：已有 roster 的队友默契默认 `50`。
- 如果通过已有转会事件提前招募到较好替补，可给该替补初始默契 `45`。

队伍默契通过队友默契和队伍信任派生：

```ts
function deriveTeamChemistry(roster: Teammate[], teamTrust: number): number {
  if (roster.length === 0) return 0;
  const avgTeammateChemistry =
    roster.reduce((sum, tm) => sum + (tm.chemistry ?? 35), 0) / roster.length;

  const weighted = avgTeammateChemistry * 0.75 + teamTrust * 0.25;
  const trustPenalty = teamTrust < 25 ? 10 : 0;
  return Math.max(0, Math.min(100, Math.round(weighted - trustPenalty)));
}
```

设计理由：

- 队友默契是主体，占 75%。
- 队伍信任是发挥环境，占 25%。
- 极低信任会额外惩罚，表示更衣室关系会让原本练熟的配合在关键局变形。
- 高信任不能凭空制造默契，只能温和改善派生结果。

### 9.1 派生队伍默契作用

比赛中加入：

```ts
teamBonus += chemistryModifier(deriveTeamChemistry(roster, teamTrust))
```

建议修正：

```ts
if (teamChemistry >= 70) return +1
if (teamChemistry <= 25) return -1
return 0
```

### 9.2 队伍默契来源

队伍默契没有独立来源，来自两个输入：

- 全队队友默契平均值。
- 队伍信任修正。

因此：

- 队友加练会提高对应队友默契；队伍默契因平均队友默契变化而自动变化。
- 战术会议会提高全队队友默契；队伍默契因平均队友默契变化而自动变化。
- 安抚更衣室会提高 `teamTrust`；队伍默契因信任修正变化而自动变化。
- 队友离队会移除该队友默契，并让新队友以较低默契加入。
- 连败和冲突优先影响 `teamTrust`，再通过派生公式压低队伍默契。

### 9.3 派生队伍默契比赛作用

派生队伍默契不直接大幅影响胜率，避免队伍管理动作变成必刷收益。建议只给小修正：

```ts
function calcTeamChemistryModifier(teamChemistry: number): number {
  if (teamChemistry >= 70) return 1;
  if (teamChemistry <= 25) return -1;
  return 0;
}
```

### 9.4 队友默契事件作用

更重要的是用于事件：

- 高队友默契：离队预警更早出现，挽留 DC 降低。
- 高队友默契：该队友相关正面社交/训练事件权重提高。
- 低队友默契：冲突事件更容易点名该队友。

### 9.5 队友默契来源

- 指定队友加练成功：该队友默契 `+4`
- 指定队友加练失败：该队友默契 `+1` 或不变
- 一起赢下赛事：全队队友默契 `+1`
- 关键赛事失利：低信任时全队队友默契 `-1`
- 队友冲突事件处理失败：相关队友默契 `-6`

### 9.6 UI

战队面板新增：

```text
队伍默契 48 / 100（由队友默契与队伍信任决定）
[IGL] 李大锤  默契 41 / 100
```

注意：V2 以后需要重新平衡 `teamTrust` 的比赛影响边界。

- `teamTrust`：关系、信任、更衣室气氛。
- 派生队伍默契：全队配合熟练度在当前信任环境下的发挥。
- `Teammate.chemistry`：玩家与某个队友的具体配合关系。

赛前分析卡片同步新增：

```text
队伍信任：高度信任
团队协同：良好
队伍默契：熟练
```

其中队伍默契在 V2 后展示；关键队友默契只在特别高或特别低时展示。V1 仅展示已有的队伍信任和团队协同。

---

## 10. V3：离队风险主动干预

V3 处理 `pendingDeparture`，让队友离队不只是被动惩罚。

当前代码已经有 `chain-teammate-transfer-reveal` 事件：

- `联系教练，提前安排替补`
- `当面质询 {transferTarget}`

这两个选项成功后都会设置：

```ts
pendingDeparture.earlyRecruit = true
```

因此 V3 不再新增“提前接触替补”主动动作，避免和已有事件链重复。提前补位继续由具名转会事件承担。

### 新动作：挽留核心队友

显示条件：

- `pendingDeparture.revealed === true`
- 离队队友均值高于当前 roster 均值

入口：

```text
挽留核心队友 -35 AP
```

#### 判定

主属性：`mentality`  
副属性：`experience`

基础 DC：

```ts
dc = 12
if (teamTrust < 30) dc += 2
if (targetTeammate.chemistry >= 70) dc -= 2
if (targetTeammate.personality === 'star') dc += 1
if (targetTeammate.personality === 'supportive') dc -= 1
```

效果不直接取消离队，只能推迟：

- 成功：`departureRound += 6`
- 目标队友默契越高，DC 越低。
- 失败：`departureRound` 不变，`teamTrust -4`，玩家压力 `+8`
- 大失败或低信任失败：`departureRound -2`，表示谈崩后对方更想离队

#### 防重复规则

- 每个 `pendingDeparture` 只能尝试一次。
- 如果已经进入离队结算周，按钮不显示。
- 如果队友已经正式离队，按钮不显示。
- 该动作不设置 `earlyRecruit`，不影响替补质量，只影响离队时间和关系。

---

## 11. V4：队伍管理策略层

V4 才考虑更完整的队伍经营，但仍然避免经理游戏化。

### 11.1 角色训练计划

让玩家选择本月队伍训练方向：

- 枪法压迫
- 战术执行
- 防守纪律
- 心态稳定

每个方向影响：

- 队友成长倾向
- 比赛前状态预览
- 特定赛事胜率倾向

### 11.2 个性冲突管理

把 `Teammate.personality` 从事件权重扩展为长期管理变量。

示例：

- `drama`：会议失败更容易产生 `locker-tension`
- `strict`：加练成功收益更高，失败信任掉更多
- `supportive`：安抚更衣室更容易成功
- `star`：队友属性成长快，但 teamTrust 更不稳定
- `grinder`：加练更容易成功，但疲劳成本更高

### 11.3 阵容协同可视化

战队面板展示当前协同来源：

```text
团队协同 +2
- 有 IGL 且队内存在 tactical：+2
- 有 AWPer 且队内存在 aimer：+1
- ego 过多：-1
```

这能解释为什么某些阵容打比赛更稳。

注意：这里展示的是团队协同，不是队伍默契。

```text
团队协同：阵容天然配合
队伍默契：训练和比赛磨合
队伍信任：更衣室关系
队友默契：你和某个队友的配合
```

### 11.4 管理动作连锁

将队伍管理动作纳入 combo 系统。

示例：

```text
战术会议 -> 队友加练
效果：加练成功时额外提高 intelligence

安抚更衣室 -> 战术会议
效果：会议 DC -2

队友加练 -> 下一场比赛
效果：目标队友对应角色提供短期 teamBonus
```

---

## 12. 不建议现在做的内容

### 不建议 V1 做完整经理系统

不要做：

- 战队预算
- 转会市场
- 5 人完整阵容替换
- 训练基地设施
- 教练/分析师雇佣

这些会把游戏目标从“个人电竞选手模拟”推向“俱乐部经理模拟”。

### 不建议 V1 增加过多按钮

V1 最多三个主动动作。按钮过多会稀释日常行动和赛事准备的权重。

---

## 13. 推荐排期

### 第一阶段：V1

- 队友加练
- 战术会议
- 安抚更衣室
- 每周队伍动作冷却
- 战队面板 UI

### 第二阶段：V2

- `Teammate.chemistry`
- 派生队伍默契公式
- 比赛公式接入派生队伍默契修正
- 移除当前比赛公式中的独立 `trustModifier`
- 战队面板展示队伍默契和队友默契

### 第三阶段：V3

- 挽留核心队友
- 离队风险 UI 强化

### 第四阶段：V4

- 队伍训练方向
- 个性冲突长期管理
- 阵容协同可视化
- 队伍管理 combo
