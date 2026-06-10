# 队伍主动管理动作设计方案（已完成）

> 文档版本：v1.0
> 落地日期：2026-06-06
> 当前分支：feature/team-management-actions
> 状态：V1/V2 已实现；V3/V3.5/V4 已按当前工程边界进入实现与验证阶段

---

## 1. 设计目标

当前队友系统已经有阵容、角色、个性、队友属性、teamTrust、团队协同计算和离队计划，但玩家主要是被动等待队友事件。新增队伍主动管理动作的目标是：

- 让战队系统像一个会自行运行的 CS 世界，而不是玩家入队后才生成的附属面板。
- 非玩家战队也应该拥有阵容、风格、近期状态、队内关系和可控变化。
- 玩家加入战队时，是加入一个已经存在并持续运行的队伍，而不是为玩家临时创建一支队伍。
- 让队友名单从“展示信息”变成“可经营对象”。
- 让 teamTrust、队友属性、队伍默契、队友默契和团队协同形成可理解的关系。
- 保持单选手职业生涯视角，不扩展成完整经理模拟。
- 所有主动管理动作消耗 AP，和现有行动力系统保持一致。

核心原则：

- 玩家可以影响自己所在队伍，但不能让整个战队生态围着玩家才开始运转。
- 战队画像、阵容模板、队内身份和话语权事件必须先能在非玩家战队上成立，再接到玩家入队后的互动。
- 不需要一开始完整模拟所有俱乐部的每场比赛，但至少要有赛季级运行态，让申请、交手、宿敌、转会传闻和赛事表现都有来源。

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
- `Teammate.chemistry`
- `player.weeklyTeamActions`

### 已有比赛影响

当前版本比赛中已经存在：

```ts
teamBonus = rosterTeamBonus + synergyBonus + chemistryModifier
```

当前版本含义：

- `rosterTeamBonus` 来自队友属性。
- `synergyBonus` 来自角色、特质和阵容协同。
- `chemistryModifier` 来自 `deriveTeamChemistry(roster, teamTrust)`。

V2 已移除独立 `trustModifier`，`teamTrust` 只作为派生队伍默契的发挥环境参与计算，避免信任度重复结算。

V1 阶段曾先用以下方式表达队伍经营成果：

- 队友属性成长
- `teamTrust`
- 短期比赛 buff

V2 以后，长期队友默契已经接入 `Teammate.chemistry`，队伍默契仍然保持派生值，不独立存储。

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

当前 V2 以后，比赛公式保持分层：

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
| 队伍默契 `teamChemistry` | 派生值 | 已实现 | 随派生变化 | 队友默契 + 队伍信任 |
| 队友默契 `Teammate.chemistry` | 0-100 | 已实现 | 中 | 单人加练、共同比赛、队友事件 |

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

示例：

```text
队伍信任：关系紧张，更衣室气氛会拖累关键回合
团队协同：良好，角色和特质能形成配合
队伍默契：一般，战术执行没有明显加成
```

---

## 6. V1：最小可落地版本（已完成）

V1 只做三个主动动作：

- 和某个队友加练
- 战术会议
- 安抚更衣室

V1 阶段不调整比赛公式，不新增队友默契字段，也不移除当时的 `trustModifier`。比赛公式、队友默契和派生队伍默契统一放到 V2，避免出现半套团队公式。

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

## 9. V2：队友默契与派生队伍默契（已完成）

V2 不新增独立 `teamChemistry` 存储字段，只给单个队友新增默契字段：

```ts
interface Teammate {
  chemistry?: number; // 0-100
}
```

初始化规则：

- 新签战队生成 roster：队友默契默认 `40`。
- 队友离队后的替补加入：队友默契默认 `35`。
- 如果通过已有转会事件提前招募到较好替补，可给该替补初始默契 `45`。

队伍默契通过队友默契和队伍信任派生：

```ts
function deriveTeamChemistry(roster: Teammate[], teamTrust: number): number {
  if (roster.length === 0) return 0;
  const avgTeammateChemistry =
    roster.reduce((sum, tm) => sum + (tm.chemistry ?? 50), 0) / roster.length;

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

当前修正：

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

派生队伍默契不直接大幅影响胜率，避免队伍管理动作变成必刷收益。当前只给小修正：

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

当前版本会展示队伍默契；关键队友默契只在特别高或特别低时展示，避免赛前卡片信息过载。

---

## 10. V3：队内身份识别与离队风险主动干预

V3 先补齐“队内身份识别层”，再处理 `pendingDeparture`。原因是后续 V4 会大量使用“玩家是明星 / 玩家是指挥 / 队友是明星 / 队友是指挥”这类判断，如果当前阵容系统不能明确识别这些身份，事件文案和触发条件会显得凭空出现。

V3 的目标不是给每个队友硬塞大量固定标签，而是用现有字段派生出轻量身份，让事件系统能找到明确对象。

### 10.1 队内身份识别层

当前队友已有：

- `role`
- `personality`
- `traits`
- `stats`
- `chemistry`

这些字段可以推断身份，但语义还不够明确：

- `personality === 'star'` 不一定等于队内明星。
- `role === 'IGL'` 不一定等于真正拥有指挥话语权。
- 高敏捷队友可能是核心火力，也可能只是普通枪男。
- 低默契队友可能是冲突源，也可能只是新加入。

因此 V3 建议新增派生身份函数，而不是一开始就存长期字段。

建议身份类型：

```ts
type TeamIdentity =
  | 'caller'   // 队内指挥
  | 'star'     // 队内明星 / 核心火力
  | 'veteran'  // 老资历 / 经验核心
  | 'rookie'   // 新人
  | 'glue'     // 稳定器 / 气氛维护者
  | 'problem'; // 冲突风险源
```

建议工具函数：

```ts
deriveTeammateIdentities(teammate, roster): TeamIdentity[]
derivePlayerTeamIdentities(player, roster): TeamIdentity[]
findTeamCaller(player, roster): TeamIdentityTarget | null
findTeamStar(player, roster): TeamIdentityTarget | null

interface TeamIdentityTarget {
  type: 'player' | 'teammate';
  id: string;
  label: string;
  score: number;
  reasons: string[];
}
```

这些函数用于事件触发和 UI 解释，不要求直接改变比赛公式。

`score` 和 `reasons` 很重要：

- `score` 用于多个候选人排序。
- `reasons` 用于调试页面和 UI tooltip，解释为什么系统认为某人是“核心火力”或“队内指挥”。
- 如果最高分没有达到最低阈值，返回 `null`，避免强行给队伍安一个明星或指挥。

### 10.2 队友身份派生规则

#### 队内指挥 `caller`

队友满足任一强条件时可视为指挥：

- `role === 'IGL'`
- `traits` 包含 `igl`
- `traits` 包含 `tactical` 且 `intelligence + experience` 在队内靠前

弱条件：

- `intelligence` 为队内最高
- `experience` 为队内最高

如果多个队友都像指挥，优先级：

```text
IGL role > igl trait > tactical + 高智力经验 > 单纯高智力经验
```

#### 队内明星 `star`

队友满足任一强条件时可视为明星：

- `personality === 'star'` 且属性均值高于队伍均值
- `agility` 队内最高且领先第二名明显
- `traits` 包含 `aimer` / `mechanical` / `clutch`
- `traits` 包含 `ego` 且个人属性很强

弱条件：

- `agility + experience` 队内最高
- 近期赛事叙事或事件给过 `carry` 类短期 tag

如果多个队友都像明星，只取最强一个作为“队内明星”，其余可以作为普通高火力队友。

#### 稳定器 `glue`

用于调停、安抚、更衣室事件：

- `personality === 'supportive'`
- `traits` 包含 `support` / `selfless` / `steady`
- `chemistry >= 65`
- `mentality` 较高

#### 冲突源 `problem`

用于冲突权重和事件点名：

- `personality === 'drama'`
- `traits` 包含 `ego` / `solo`
- `chemistry <= 25`
- 队伍存在 `locker-tension` 时，该队友更容易被点名

#### 老资历 `veteran` 和新人 `rookie`

如果当前没有入队时间字段，可以先用经验和补位来源近似：

- `veteran`：`experience` 队内靠前，或 `chemistry >= 70`
- `rookie`：新补位队友，或 `chemistry <= 35` 且经验较低

后续如果给队友增加 `joinedRound`，这两个身份可以从真实入队时间派生。

### 10.3 玩家队内身份

玩家也需要派生队内身份。否则 V4 事件无法稳定判断“玩家是明星”还是“玩家是指挥”。

建议：

```ts
derivePlayerTeamIdentities(player, roster)
```

玩家是 `caller`：

- `activeRole === 'IGL'`
- `preferredRole === 'IGL'`
- 玩家 trait 含 `igl` / `tactical`
- `intelligence + experience` 明显高于队友平均

玩家是 `star`：

- `tags.includes('star-player')`
- `fame >= 80`
- S 级正赛冠军数足够
- Major 冠军
- `agility + experience` 明显高于队友平均

玩家同时满足时：

```text
star-caller
```

这个身份会在 V4 触发“双重责任”事件，而不是触发明星和指挥互相争夺的事件。

### 10.4 UI 展示原则

战队面板可以在队友行上显示轻量身份，但不要过度标签化。

示例：

```text
[IGL] 李大锤  均值 5.2  默契 41  队内指挥
[AWPer] OneTap 均值 6.1 默契 55  核心火力
[Support] 阿杰  均值 4.8 默契 70  稳定器
```

显示原则：

- 每个队友最多显示 1 个主身份。
- 优先显示对当前系统最有用的身份：指挥 > 明星 > 稳定器 > 冲突风险 > 老资历/新人。
- 如果身份不明显，不显示。
- 玩家自己的身份可以放在个人信息或战队面板：

```text
队内定位：核心火力
队内定位：指挥
队内定位：明星指挥
```

### 10.5 事件系统使用方式

后续事件不要直接写：

```ts
roster.find(tm => tm.personality === 'star')
```

而是使用身份函数：

```ts
const star = findTeamStar(player, roster);
const caller = findTeamCaller(player, roster);
```

这样可以避免：

- 没有明星却强行触发明星冲突。
- 没有指挥却强行出现“队内指挥要求你”。
- 把 `personality === 'star'` 误当作队内绝对核心。
- 把 `role === 'IGL'` 误当作拥有完整话语权。

V3 完成后，V4 的话语权事件才有稳定对象。

### 10.6 身份稳定性

队内身份不应该因为一两点属性变化每周跳来跳去。否则 UI 会显得很随机，事件也会突兀。

建议规则：

- 身份派生可以每周计算，但 UI 主身份需要稳定。
- 只有新候选身份分数明显高于旧身份时才切换。
- 或要求连续满足 2-3 周后切换主身份。
- 角色转换、换队、队友离队、关键赛事夺冠等重大事件可以立即刷新。

如果不新增存储字段，至少在派生函数中使用阈值：

```ts
if (top.score < minIdentityScore) return null;
if (top.score - second.score < identityGapThreshold) return previousVisibleIdentity ?? null;
```

如果愿意新增轻量字段，可考虑：

```ts
visibleIdentity?: TeamIdentity;
identitySinceRound?: number;
```

这两个字段只用于 UI 和事件稳定性，不进入比赛公式。

V3 MVP 建议直接新增这两个轻量字段，而不是只做纯派生：

- 纯派生适合事件实时判断，但无法跨周记住上一周 UI 显示的身份。
- `previousVisibleIdentity` 如果不落盘，刷新 session 或推进回合后就没有稳定依据。
- 字段只存“当前可见主身份”，不存完整身份分数，避免把身份系统做成新的长期养成数值。

建议位置：

```ts
interface Teammate {
  visibleIdentity?: TeamIdentity;
  identitySinceRound?: number;
}

interface Player {
  visibleTeamIdentity?: TeamIdentity | 'star-caller';
  teamIdentitySinceRound?: number;
}
```

更新时机：

- 入队、离队、换队、转会补位后立即重算。
- 每周推进时可以重算一次，但只有新身份分数明显高于旧身份，或连续满足 2-3 周后才更新可见字段。
- Debug 页面展示即时派生身份和当前可见身份的差异，方便排查“系统认为他像明星，但 UI 暂时仍显示指挥”的情况。

### 10.7 Debug 支持

V3 开始，队伍系统会变得很难肉眼判断。需要在 debug 页面展示：

- 玩家队内身份、score、reasons。
- 每名队友身份、score、reasons。
- `findTeamCaller` / `findTeamStar` 当前返回对象。
- 哪些身份因为阈值不足返回 `null`。
- 身份最近一次变化的 round。

这不是给玩家看的正式 UI，而是为了调试事件触发和身份误判。没有 debug 支撑，V4 的话语权事件会很难排查。

### 10.8 V3 实现顺序建议

V3 建议按以下顺序实现：

1. 只做身份派生函数和单元测试。
2. 在战队面板显示队友主身份和玩家队内定位。
3. 加 debug 页面展示身份 score/reasons。
4. 让离队风险 UI 使用身份信息解释“为什么这个人值得挽留”。
5. 最后实现“挽留核心队友”动作。

不要在 V3 直接实现话语权冲突事件。V3 的职责是让队伍里的人有清晰身份，V4 才负责使用这些身份生成队内政治和话语权事件。

---

### 10.9 离队风险主动干预

V3 同时处理 `pendingDeparture`，让队友离队不只是被动惩罚。

当前代码已经有 `chain-teammate-transfer-reveal` 事件：

- `联系教练，提前安排替补`
- `当面质询 {transferTarget}`

这两个选项成功后都会设置：

```ts
pendingDeparture.earlyRecruit = true
```

因此 V3 不再新增“提前接触替补”主动动作，避免和已有事件链重复。提前补位继续由具名转会事件承担。

### 10.10 新动作：挽留核心队友

显示条件：

- `pendingDeparture.revealed === true`
- 离队队友是 `star` / `caller` / `glue` / `veteran` 之一，或均值高于当前 roster 均值

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
if (targetTeammate has 'star' identity) dc += 1
if (targetTeammate has 'glue' identity) dc -= 1
if (targetTeammate has 'problem' identity) dc += 1
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

为保证“每个离队事件只能尝试一次”跨周和跨 session 稳定，需要给 `PendingDeparture` 增加轻量字段：

```ts
interface PendingDeparture {
  retentionAttempted?: boolean;
  retentionAttemptRound?: number;
}
```

规则：

- 点击挽留动作后，无论成功失败都设置 `retentionAttempted = true`。
- `retentionAttemptRound` 只用于 debug、历史记录和后续事件文案，不参与公式。
- 不建议只用 `weeklyTeamActions` 限制，因为离队事件可能跨多周存在。

---

## 11. V3.5：战队画像、运行态与阵容模板

V3.5 放在 V3 和 V4 之间更合适。

- V3 解决“队伍里的人是谁”：身份识别、玩家定位、核心队友。
- V3.5 解决“为什么这支队会长这样，以及它在玩家不参与时如何继续运转”：战队画像、战队运行态、阵容模板、申请匹配、初始关系。
- V4 解决“这些人之间如何争夺话语权”：明星、指挥、教练组、资源倾斜和队内政治事件。

战队画像不能只是 UI 文案。它必须接入现有系统链路，否则会变成空功能。

更重要的是，战队系统不能只在玩家入队后才存在。每支可交互战队都应该有静态画像和运行态：

- 静态画像决定这支队偏向什么风格。
- 运行态决定这支队现在状态如何、阵容是否稳定、内部关系是否紧张、近期表现如何。
- 玩家申请、加入、交手、转会传闻和宿敌事件，都从这个运行态读取上下文。

### 11.1 设计目标

战队画像用于让不同战队有真实差异：

- 不同战队在玩家未加入时也会拥有自己的阵容和状态。
- 不同战队生成不同风格的阵容。
- 不同战队看重不同类型的玩家。
- 玩家加入战队后获得不同初始定位、信任和队友默契，但这些来自既有队伍状态。
- 队伍管理动作的 DC 和收益受战队文化影响。
- V4 话语权事件的教练组态度和队内政治倾向有来源。

它不应该直接给比赛胜率增加一条 `clubProfileBonus`。战队画像应该通过已有系统间接生效：

- 阵容角色和 trait 影响团队协同。
- 队友属性影响队友能力。
- 初始队友默契和 `player.teamTrust` 影响派生队伍默契。
- 管理动作 DC 影响玩家经营队伍的难度。
- 事件权重影响队内政治走向。

### 11.2 静态画像与运行态边界

V3.5 需要把“战队是什么样”和“战队现在怎么样”拆开。

静态画像：

```ts
interface ClubProfile {
  clubId: string;
  rosterStyle: RosterStyle;
  roleBias: Partial<Record<TeammateRole, number>>;
  traitBias: Record<string, number>;
  personalityBias: Partial<Record<PersonalityTag, number>>;
  identityBias: Partial<Record<TeamIdentity, number>>;
  fitWeights: Partial<Record<StatKey, number>>;
  preferredTraitTags: string[];
  managementModifiers: ClubManagementModifiers;
  politicsBias: ClubPoliticsBias;
}
```

运行态：

```ts
interface ClubRuntimeState {
  clubId: string;
  tier: ClubTier;
  fullRoster: ClubPlayer[];
  clubTrust: number;
  currentForm: number; // -100 到 100，近期战绩和状态的抽象值
  rosterStability: number; // 0 到 100，越低越容易出现离队、换人、冲突
  internalChemistry: number; // 0 到 100，非玩家队伍内部磨合
  seasonPoints: number;
  qualificationState: ClubQualificationState;
  activeStorylines: ClubStoryline[];
  recentResults: ClubRecentResult[];
  pendingStoryFlags: string[];
  updatedRound: number;
}

interface ClubPlayer {
  id: string;
  name: string;
  role: TeammateRole;
  stats: TeammateStats;
  traits: string[];
  personality: PersonalityTag;
  joinedRound: number;
  status: 'starter' | 'bench' | 'trial';
  internalChemistry?: number;
}

interface ClubQualificationState {
  eligibleTiers: TournamentTier[];
  openQualifierTickets: string[];
  majorPathProgress?: string;
  seasonRank?: number;
}
```

两者关系：

- `ClubProfile` 是长期不变或很少变化的战队性格。
- `ClubRuntimeState` 是每个赛季、每几周会变化的战队状态。
- `ClubRuntimeState` 只保存运行态，不复制 `ClubProfile`；需要画像时通过 `clubId` 查询 `ClubProfile`。
- `ClubRuntimeState.fullRoster` 表示这支战队自己的完整阵容，通常是 5 名首发加可选替补。
- `player.roster` 仍然表示玩家视角下的 4 名队友，不要和 `fullRoster` 混用。
- `clubTrust` 表示战队整体更衣室关系；现有 `player.teamTrust` 表示玩家在当前队伍里的被信任程度。
- `internalChemistry` 表示非玩家队伍内部磨合；现有 `Teammate.chemistry` 表示玩家和某名队友的默契。
- 玩家入队不应该重新生成整支队伍，而是读取 `ClubRuntimeState`，再根据玩家填补缺口或制造重叠来更新它。
- 玩家离队后，这支队伍仍然保留运行态，可以继续出现在赛事、新闻、宿敌和转会事件中。

### 11.3 战队生态后台运行

V3.5 的重点不是做完整俱乐部经理模拟，而是让世界看起来不是静止的。

推荐三层模拟深度：

```text
完整模拟：玩家当前战队
赛季级模拟：玩家可申请战队、近期对手、宿敌所在战队、同阶段主要竞争队
静态画像：暂时和玩家无关的远端战队
```

#### 完整模拟

玩家当前战队使用完整数据：

- 4 名队友完整属性、角色、个性、trait、chemistry。
- `teamTrust`。
- 派生队伍默契。
- `pendingDeparture`。
- `locker-tension` 等事件状态。
- V1/V2 队伍管理动作。
- V4 话语权事件。

#### 赛季级模拟

赛季级战队不需要每周逐场详细模拟，但需要定期 tick。这里的“赛季级”不是只随机改状态，而是用抽象公式模拟真实 CS 世界里的赛季变化：

```ts
tickClubRuntime(clubState, clubProfile, worldContext): ClubRuntimeState
```

每次 tick 可以更新：

- `currentForm`：近期表现。
- `clubTrust`：队内气氛。
- `rosterStability`：阵容稳定性。
- `internalChemistry`：内部磨合。
- `seasonPoints`：赛季积分。
- `qualificationState`：资格链进度。
- `tier`：长期表现导致的队伍层级变化。
- `recentResults`：抽象比赛结果。
- `activeStorylines` / `pendingStoryFlags`：可被事件系统读取的传闻和风险。

示例：

```ts
if (clubProfile.rosterStyle === 'chaotic') {
  rosterStability -= random(0, 3)
  if (currentForm < -30) clubTrust -= random(1, 4)
}

if (clubProfile.rosterStyle === 'development') {
  internalChemistry += random(0, 2)
  rosterStability += random(0, 1)
}
```

#### 自运行世界要支持的故事

非玩家战队的运行态需要能自然产生以下情况：

- 二线队连续打出深轮次，拿到 S 级预选资格，成为黑马并冲进 Major。
- 青训队培养出核心选手，赛季末升级到更高层级。
- 一线队更换核心后 `internalChemistry` 和 `rosterStability` 下滑，短期成绩波动。
- 老牌强队虽然纸面能力高，但 `clubTrust` 低、连败后进入低迷期。
- 混乱型队伍可能突然爆发，也可能因为内耗快速掉队。
- 体系型队伍起步慢，但阵容稳定时长期积分更稳。

这些故事不能只靠 AI 文案生成。AI 或新闻系统最多负责包装，真实依据必须来自 `ClubRuntimeState` 的状态变化和赛事结果。

#### 静态画像

远端战队只保留 `ClubProfile`，不生成完整运行态。只有当它进入玩家视野时才懒生成：

- 玩家申请该队。
- 玩家即将在赛事中遇到该队。
- AI 事件或新闻提到该队。
- 宿敌选手加入该队。
- 阶段目标需要展示该队为近期机会。

这样可以避免维护一个过重的全局电竞经理系统，同时又能保证玩家接触到的队伍都是“已经在运行”的。

### 11.4 世界队伍池

V3.5 需要先定义世界里有哪些队伍，否则“从赛季级战队池里抽取赛事对手”会没有来源。

建议新增：

```ts
interface WorldClubPool {
  season: number;
  activeClubIds: string[];
  relevantClubIds: string[];
  staticClubIds: string[];
  runtimeByClubId: Record<string, ClubRuntimeState>;
  processedTickKeysByClubId: Record<string, string[]>;
  lastGlobalTickRound?: number;
}
```

三类队伍：

- `activeClubIds`：玩家当前队伍、宿敌所在队伍、近期赛事对手、当前阶段主要竞争队。进入赛季级模拟。
- `relevantClubIds`：玩家可申请队伍、同地区同阶段队伍、近期可能遇到的队伍。按需 tick 或赛事节点 tick。
- `staticClubIds`：暂时和玩家无关的远端队伍，只保留 `ClubProfile`，不生成运行态。

三组 ID 必须互斥。同一 `clubId` 只能出现在一个列表中，优先级为：

```text
active > relevant > static
```

如果某队被提升到更高优先级，必须从低优先级列表移除，避免同一队伍被重复 tick 或重复展示。

来源：

- 静态 `CLUBS` 数据。
- 赛事模板需要的默认参赛队。
- 玩家阶段可申请的战队。
- 宿敌、AI 事件、新闻系统点名的战队。
- 赛季中通过黑马或衰退 storyline 被提升为相关队伍的战队。

激活规则：

- 玩家申请某队：该队进入 `activeClubIds`。
- 玩家即将在赛事中遇到某队：该队进入 `activeClubIds`。
- 某队连续打出深轮次：该队进入 `relevantClubIds` 或 `activeClubIds`。
- 某队和宿敌绑定：该队进入 `activeClubIds`。
- 长期没有再被引用的队伍：可以从 `activeClubIds` 降回 `relevantClubIds`，只保留摘要状态。

数量控制：

- 每个阶段只保留有限数量的赛季级模拟队伍，例如 12-24 支。
- 远端队伍不要每回合 tick。
- 每支队伍的 `recentResults` 建议最多保留 5 条。
- 每支队伍的 `activeStorylines` 建议最多保留 3 条。
- 每支队伍的 `pendingStoryFlags` 建议最多保留 5 条。
- `processedTickKeysByClubId[clubId]` 只保留最近 1-2 个 round 的 key，避免 session 膨胀。
- 世界调试页需要展示当前哪些队伍处于 active/relevant/static，避免排查时看不懂为什么某队在变化。

### 11.5 运行态生成与懒加载

建议新增：

```ts
getOrCreateClubRuntimeState(clubId, worldState, player): ClubRuntimeState
```

生成规则：

- 优先读取已有运行态。
- 没有运行态时，根据 `ClubProfile`、战队 tier、当前年份和玩家阶段生成。
- 如果是玩家申请的战队，生成时不应该为了讨好玩家强行适配，只能在合理范围内根据战队需求判断玩家是否合适。
- 如果是赛事对手，生成时需要能产出赛前分析所需的队伍风格、核心选手、协同和近期状态。
- 如果是宿敌所在战队，生成时需要保留宿敌身份，并围绕宿敌补齐阵容。

运行态刷新频率：

- 玩家当前战队：每回合正常更新。
- 赛季级战队：每 2-4 周抽象更新一次，或在赛事节点前刷新。
- 静态战队：不更新，直到进入赛季级模拟范围。

刷新触发必须稳定，不能因为打开页面、刷新接口或查看 debug 而改变世界。

允许触发：

- 玩家推进回合。
- 赛事开始前生成参赛队。
- 赛事结算后写回结果。
- 赛季末 / 年末结算。
- 重大剧情事件明确要求刷新某支队伍。

不允许触发：

- 打开战队列表。
- 打开赛事详情。
- 打开 debug 页面。
- 重复调用查询接口。

随机性需要可复现：

```ts
rngSeed = hash(sessionSeed, clubId, currentRound, tickType)
```

同一个 session、同一个 round、同一个 tick 类型应该得到稳定结果，避免玩家刷新页面看到世界状态变来变去。

运行态不需要长期保存所有历史，只保留最近几条摘要：

```ts
interface ClubRecentResult {
  round: number;
  tournamentId?: string;
  tier: TournamentTier;
  result: 'win' | 'loss' | 'deep-run' | 'early-exit';
  note: string;
}
```

### 11.5.1 存储、迁移与幂等边界

V3.5 必须先明确运行态存储边界，否则 `getOrCreateClubRuntimeState` 容易因为查询接口、页面刷新或 debug 查看而改变世界。

建议先把世界队伍池放进 `GameSession`，不要为 MVP 单独拆 D1 表：

```ts
interface GameSession {
  worldClubs?: WorldClubPool;
  worldClubsVersion?: number;
}
```

原因：

- 当前存档主状态已经围绕 `GameSession.player` 运转，V3.5 MVP 先跟随 session 保存，迁移和回滚成本最低。
- 世界模拟是单人存档内的抽象生态，不需要跨 session 共享。
- 未来如果世界队伍池变大，再把 `runtimeByClubId` 拆到独立 KV/D1；接口语义不要提前依赖具体存储。

旧存档迁移：

- 读取旧 session 时，如果 `worldClubs` 缺失，先不在 GET 查询里生成。
- 第一次进入允许改变世界的动作时创建初始 `WorldClubPool`，例如推进回合、申请战队、赛事生成对手。
- 迁移生成使用 `session.seed`、当前 `player.round`、当前 `player.team?.clubId` 和已有 `CLUBS`，保证同一旧档只生成一次后落盘。
- 迁移后设置 `worldClubsVersion = 1`，后续结构变化按版本做 backfill。

幂等规则：

- 所有 tick 函数必须接收 `tickRound` 和 `tickType`，并检查 `processedTickKeysByClubId`。
- tick key 使用 `hash(clubId, tickRound, tickType)` 或 `${tickRound}:${tickType}`。
- 同一 `clubId + tickRound + tickType` 已处理过时直接返回已有状态。
- 同一回合允许存在多个不同 tick 类型，例如 `preTournament`、`postTournament`、`seasonEnd`，不能只用 round 去重。
- 查询接口只能读取和派生展示数据，不能调用会写入的 `getOrCreateClubRuntimeState`。
- Debug 页面允许显示“如果激活会生成什么”的 preview，但 preview 不能保存。

建议 API 语义：

```ts
ensureWorldClubPool(session, reason): GameSession
activateClubRuntime(session, clubId, reason): GameSession
tickClubRuntime(session, clubId, tickRound, tickType): GameSession
previewClubRuntime(session, clubId): ClubRuntimeStatePreview
```

其中只有 `ensure*`、`activate*`、`tick*` 能写回 session；`preview*` 永远只读。

### 11.6 与赛事系统融合：非玩家战队也会晋级和衰退

战队运行态应该接入赛事系统，否则“真实 CS 世界”只停留在文档里。这里不应该只是给赛事列表抽几个有名字的对手，而是让非玩家战队也会通过赛事结果改变命运。

建议接入点：

- 赛事生成报名队伍时，从 `WorldClubPool` 中挑选符合 tier、资格、地区和近期状态的队伍。
- 玩家报名战队赛事时，对手可以来自已有 `ClubRuntimeState`，而不是临时名字。
- 赛前分析卡读取对手队伍的 `currentForm`、`rosterStyle`、核心身份和近期结果。
- 赛事结果反向更新非玩家战队的 `currentForm`、`clubTrust`、`internalChemistry`、`seasonPoints`、`qualificationState` 和 `rosterStability`。
- 玩家击败某支队伍后，这支队伍可进入近期对手池，后续触发复仇、宿敌、转会传闻或新闻。

#### 抽象资格与晋级

非玩家战队不需要完整执行玩家同款资格链，但必须有能被赛事系统读取的抽象资格状态。

```ts
interface ClubQualificationState {
  eligibleTiers: TournamentTier[];
  openQualifierTickets: string[];
  majorPathProgress?: string;
  seasonRank?: number;
}
```

资格变化来源：

- C/B 级赛事深轮次：提高 `seasonPoints`，增加 B/A 级公开赛资格概率。
- B 级夺冠或多次深轮次：获得 A 级公开预选资格。
- A 级稳定出线：进入 S 级预选候选池。
- S 级预选深轮次：获得 S 正赛或 Major 路线资格。
- Major 路线赛事深轮次：写入 `majorPathProgress`。
- 连续早早出局：降低 `seasonPoints` 和下次受邀概率。

示例：

```ts
if (result === 'champion' && tournament.tier === 'B') {
  club.seasonPoints += 30
  club.qualificationState.openQualifierTickets.push('a-open')
}

if (result === 'deep-run' && tournament.tier === 'A') {
  club.seasonPoints += 20
  maybeAddEligibleTier(club, 'S')
}

if (result === 'early-exit' && club.tier === 'top') {
  club.currentForm -= 12
  club.clubTrust -= 3
}
```

#### 黑马路线

二线队和青训队需要有机会向上打，而不是永远停留在原层级。

黑马触发条件示例：

```ts
canBecomeDarkHorse =
  club.tier === 'second'
  && club.currentForm >= 45
  && club.internalChemistry >= 65
  && club.seasonPoints >= darkHorsePointThreshold
```

黑马效果：

- 进入更高级别赛事候选池。
- 新闻或调试页面标记为 `dark-horse-run`。
- 赛前分析显示“近期状态火热，连续打出深轮次”。
- 如果继续打出成绩，赛季末可能升级 tier。

#### 强队衰退和换核波动

一线队也应该会掉状态，尤其是更换核心队员后。

建议用 `activeStorylines` 表达：

```ts
type ClubStoryline =
  | 'dark-horse-run'
  | 'core-rebuild'
  | 'chemistry-crisis'
  | 'veteran-decline'
  | 'star-breakout'
  | 'system-clicking';
```

换核后：

```ts
if (storyline === 'core-rebuild') {
  internalChemistry -= 15
  rosterStability -= 10
  currentForm -= random(5, 15)
}
```

衰退不是永久惩罚：

- 如果后续赛事表现恢复，`internalChemistry` 和 `currentForm` 可以慢慢回升。
- 体系队 `tactical/development` 恢复更稳。
- 混乱队 `chaotic/firepower` 波动更大，可能快速反弹，也可能继续崩。

#### 赛季末升降级

每年或每个赛季结束时，对非玩家战队做一次 tier 调整：

```ts
if (club.tier === 'second' && club.seasonPoints >= promoteToProThreshold) {
  club.tier = 'pro'
  club.pendingStoryFlags.push('promoted-after-breakout-season')
}

if (club.tier === 'pro' && club.seasonPoints <= relegationRiskThreshold && club.currentForm < -35) {
  club.pendingStoryFlags.push('fallen-giant')
  maybeDowngradeTier(club)
}
```

升降级结果需要影响：

- 后续可报名赛事池。
- 玩家申请该队的门槛和吸引力。
- 宿敌和新闻事件。
- 赛前分析卡。
- 世界调试页的战队列表。

#### 升降级与玩家职业阶段边界

非玩家队伍的 `tier` 变化属于世界模拟，不应该直接改变玩家职业阶段。

边界：

- 非玩家青训队升到二线，只表示这支队伍在世界中变强，不会自动把玩家阶段从 `rookie` 推到 `second`。
- 玩家申请这支队伍时，再根据该队当前 `tier`、玩家阶段、申请门槛和赛事履历判断是否能加入。
- 玩家所在队伍升降级时，需要通过现有职业目标和战队机制映射成玩家可理解的变化，例如新赛事资格、队伍目标变化、薪资/名气变化。
- 非玩家队伍的升降级可以改变职业目标面板中的“近期机会”，但不能绕过玩家自己的晋级条件。

推荐映射：

```ts
clubRuntime.tier        // 世界战队层级
player.careerStage      // 玩家职业阶段
player.team.tier        // 玩家当前所在队伍映射后的游戏层级
```

这三个字段相关，但不能互相直接覆盖。玩家加入某队时，才根据 `clubRuntime.tier` 生成或更新 `player.team.tier`。

#### 最小可落地版本

如果一次实现完整世界模拟成本过高，可以先做赛事节点驱动：

```text
赛事开始前：为该赛事抽取/生成参赛队
赛事结算后：给参赛队写入抽象结果、积分和状态变化
玩家遇到某队：把它提升为赛季级运行态
赛季末：根据 seasonPoints/currentForm/internalChemistry 做一次升降级结算
```

这样 C/B/A/S/Major 的职业路线会更像一个生态，而不是一串孤立报名按钮。

### 11.7 建议数据结构

```ts
type RosterStyle =
  | 'balanced'
  | 'tactical'
  | 'firepower'
  | 'development'
  | 'chaotic';

interface ClubProfile {
  clubId: string;
  rosterStyle: RosterStyle;
  roleBias: Partial<Record<TeammateRole, number>>;
  traitBias: Record<string, number>;
  personalityBias: Partial<Record<PersonalityTag, number>>;
  identityBias: Partial<Record<TeamIdentity, number>>;
  fitWeights: Partial<Record<StatKey, number>>;
  preferredTraitTags: string[];
  managementModifiers: {
    teamPracticeDc?: number;
    teamPracticeGrowthMultiplier?: number;
    teamMeetingDc?: number;
    lockerRoomTalkDc?: number;
    stressMultiplier?: number;
    fatigueMultiplier?: number;
  };
  politicsBias: {
    callerWeight: number;
    starWeight: number;
    coachControl: number;
    conflictRisk: number;
  };
}
```

这些字段不要求一次全部实现。V3.5A MVP 至少需要：

- `ClubRuntimeState`
- `WorldClubPool`
- `processedTickKeysByClubId`
- `rosterStyle`
- `roleBias`
- `fitWeights`
- `managementModifiers`
- `fullRoster` / `player.roster` 边界
- `clubTrust` / `player.teamTrust` 边界
- `internalChemistry` / `Teammate.chemistry` 边界
- `generateClubRoster`
- `integratePlayerIntoClub`

V3.5A MVP 建议先只接入：

1. `ClubRuntimeState`：让非玩家战队拥有阵容、状态和赛季级变化基础。
2. `rosterStyle`：用于 UI 和少量规则分支。
3. `roleBias`：影响 `fullRoster` 角色生成。
4. `fitWeights`：影响面试 DC。
5. `managementModifiers`：影响队伍管理动作。
6. `WorldClubPool`：统一保存世界队伍池，不散落到赛事或玩家字段。
7. 入队映射：把 `fullRoster` 转换成玩家视角 `player.roster`。

`traitBias`、`personalityBias`、`identityBias`、`politicsBias` 可以第二步接入。这样能先证明画像会影响真实系统，再扩展细粒度队伍风格。

### 11.8 青训队示例画像

#### 本地狼队

定位：混乱但有冲劲的本地队。

```text
rosterStyle: chaotic / firepower
roleBias: Entry, AWPer
traitBias: mechanical, clutch, solo, ego
personalityBias: star, drama, grinder
identityBias: star/problem 更容易出现
fitWeights: agility 高，mentality 次之
managementModifiers:
  teamPracticeGrowthMultiplier +小幅
  teamMeetingDc +1
  lockerRoomTalkDc +1
politicsBias:
  starWeight 高
  conflictRisk 高
  coachControl 低
```

适合：枪法型、敢打型玩家。
代价：更容易出现更衣室问题和资源争夺。

#### 赛博学院

定位：体系化青训。

```text
rosterStyle: tactical / development
roleBias: IGL, Support, Lurker
traitBias: tactical, steady, support, selfless
personalityBias: strict, supportive, grinder
identityBias: caller/glue 更容易出现
fitWeights: intelligence, experience, mentality
managementModifiers:
  teamMeetingDc -1
  lockerRoomTalkDc -1
politicsBias:
  callerWeight 高
  coachControl 高
  conflictRisk 低
```

适合：战术型、心态稳定、愿意按体系成长的玩家。
代价：明星自由度更低，个人火力型玩家可能需要适应体系。

#### 校队

定位：低门槛、低薪资、低压力的兜底队。

```text
rosterStyle: development
roleBias: balanced
traitBias: support, steady
personalityBias: supportive, grinder
identityBias: rookie/glue 更容易出现
fitWeights: mentality, constitution
managementModifiers:
  lockerRoomTalkDc -1
  teamPracticeGrowthMultiplier 小幅
politicsBias:
  coachControl 中
  conflictRisk 低
```

适合：刚拿到青训申请资格、属性不极端的玩家。
代价：队友能力偏弱，上限低。

#### 区域青训

定位：区域竞争更强、筛选更严格的青训。

```text
rosterStyle: balanced / tactical
roleBias: IGL, AWPer, Entry
traitBias: tactical, aimer, mechanical, steady
personalityBias: strict, star, grinder
identityBias: caller/star 都可能出现
fitWeights: agility, intelligence, experience
managementModifiers:
  teamPracticeDc +1
  teamMeetingDc 0
politicsBias:
  coachControl 中高
  conflictRisk 中
```

适合：已经有比赛证明、属性比较突出的玩家。
代价：面试更难，队内竞争更强。

### 11.9 接入申请和面试

战队画像必须影响申请，而不是只影响说明。

建议新增匹配度函数：

```ts
calcClubFit(player, clubProfile): {
  score: number;
  reasons: string[];
}
```

匹配度来源：

- 玩家核心属性和 `fitWeights`。
- 玩家 trait tags 是否命中 `preferredTraitTags`。
- 玩家当前角色是否符合 `roleBias`。
- 玩家近期赛事表现、名气、阶段目标完成情况。

接入点：

- `applyClubRequest` 可以继续只做硬门槛。
- 面试事件 DC 使用 `calcClubFit` 修正。
- 高匹配度提高 Offer 概率或降低面试 DC。
- 低匹配度不一定禁止申请，但会提高面试 DC 或降低初始信任。
- 申请列表读取 `ClubRuntimeState`，展示方向性状态，例如“近期状态火热”“阵容不稳”“正在寻找火力点”。

青训阶段建议：

- 普通青训队不因属性不匹配直接禁止申请。
- 区域青训这类更强青训可以要求更高匹配度。
- 匹配度应该影响“能否通过”和“入队后定位”，而不是只影响按钮是否可点。
- 面试成功后，玩家进入已有战队运行态，不能直接覆盖该队原有 roster 和状态。

### 11.10 接入阵容生成

当前 `generateRoster(tier)` 只按 tier 随机生成队友。V3.5 后建议拆成两个步骤：

```ts
generateClubRoster(tier, rng, clubProfile): ClubPlayer[]
integratePlayerIntoClub(player, clubRuntimeState, clubProfile): PlayerTeamJoinResult
```

`tier` 来源以当前世界运行态或 `CLUBS` 当前层级为准。`ClubProfile` 不存 tier，避免静态画像和运行态层级不一致。

`generateClubRoster` 的原则：

- 根据 `roleBias` 决定角色池权重。
- 根据 `traitBias` 决定队友 trait 权重。
- 根据 `personalityBias` 决定 personality 权重。
- 根据 `identityBias` 让队伍更容易生成 caller/star/glue/problem。
- 不读取玩家属性，避免非玩家战队变成“为玩家定制的队伍”。

`integratePlayerIntoClub` 的原则：

- 读取已有 `ClubRuntimeState.fullRoster` 和 `deriveRosterNeed`。
- 判断玩家是填补缺口、形成轮换，还是和现有核心角色重叠。
- 根据判断生成初始定位、信任、队友默契和后续事件权重。
- 只有在试训、补位或剧情需要时，才轻量调整队友关系，不重建整队。

玩家加入已有战队时，必须明确原阵容如何变化：

```ts
type PlayerJoinMode =
  | 'replace-starter'
  | 'fill-vacancy'
  | 'trial-sixth'
  | 'rotation';
```

四种模式：

- `replace-starter`：玩家顶替一名首发，被顶替者转为替补、离队或进入不满剧情。
- `fill-vacancy`：战队本来就有空缺，玩家直接补进首发。
- `trial-sixth`：玩家先作为第六人试训，短期内不是稳定首发。
- `rotation`：玩家和某名队友轮换，赛事收益和队伍信任成长略低。

生成 `player.roster` 时：

- 从 `ClubRuntimeState.fullRoster` 中选出玩家当前视角的 4 名队友。
- 如果玩家是试训或轮换，保留被竞争队友在 `fullRoster` 中的状态。
- 如果玩家替换了某名首发，被替换者可以进入 `activeStorylines`，后续触发不满、转会或重新竞争事件。
- `player.teamTrust` 根据玩家入队方式、匹配度、原阵容稳定性生成，不直接等于 `clubTrust`。

MVP 不做完整替补席管理：

- `bench` / `trial` 只用于世界运行态和故事标记。
- 玩家不能直接管理替补、指定谁上场、安排轮换。
- 被替换者不会出现在一个可操作的替补系统里，只会影响 `activeStorylines`、`clubTrust`、`rosterStability` 和后续事件权重。
- 如果后续需要完整替补系统，应单独作为更高版本设计，不塞进 V3.5。

青训队建议：

- 尽量保证至少一个可识别的组织者，但不强制每队都有明星。
- `star` 在青训队更像“潜力核心”，不是顶级明星。
- `problem` 可以作为冲突种子，但不要每队都有。

### 11.11 接入初始定位、信任和默契

入队时应根据 `player + clubProfile + ClubRuntimeState` 生成玩家队内定位：

```ts
derivePlayerInitialTeamRole(player, clubProfile, clubRuntimeState)
```

示例：

```text
你被当作青训火力点培养。
你被要求尝试副指挥。
你只是轮换补充位，还需要证明自己。
```

影响：

- 初始 `player.teamTrust`
- 玩家与关键队友的初始 `Teammate.chemistry`
- 是否更容易触发 V4 的话语权事件
- 是否更容易触发角色转换事件

示例：

- 高匹配度：`player.teamTrust +5`，关键队友默契 `+5`
- 低匹配度：`player.teamTrust -5`，初始定位更弱
- 玩家填补队伍缺口：相关队友默契更高
- 玩家和队内明星位置冲突：后续资源争夺权重上升

`clubTrust` 只作为环境输入影响初始关系，不应该被玩家入队结果直接覆盖：

```ts
player.teamTrust =
  baseJoinTrust
  + clubTrustContextModifier
  + clubFitModifier
  + joinModeModifier
```

### 11.12 入队缺口与角色重叠

当前游戏中 `player.roster` 是 4 名队友，玩家默认是第 5 人。V3.5 需要明确：玩家加入时，队伍为什么要签他，以及 `ClubRuntimeState.fullRoster` 中原本的 5 人如何变化。

建议新增入队缺口判断：

```ts
deriveRosterNeed(clubProfile, fullRoster, clubRuntimeState): {
  neededRoles: TeammateRole[];
  neededIdentities: TeamIdentity[];
  reasons: string[];
}
```

常见缺口：

- 缺火力：需要 Entry / AWPer / star。
- 缺指挥：需要 IGL / caller。
- 缺稳定器：需要 Support / glue。
- 缺经验：需要 veteran。
- 缺体系执行：需要 tactical / steady。

玩家加入后可能有两种情况：

- 填补缺口：初始信任和相关队友默契更高。
- 角色重叠：和现有 caller/star/AWPer 等身份产生竞争。
- 轮换补强：队伍本身能打，但玩家作为试训或长期潜力位加入。
- 状态救火：队伍近期低迷或阵容不稳，愿意赌一个新人。

建议新增轻量判断：

```ts
detectRoleOverlap(playerIdentity, rosterIdentities): RoleOverlap[]
```

重叠示例：

- 玩家是 `caller`，队里已有强 `caller`。
- 玩家是 `star`，队里已有 `star`。
- 玩家是 AWPer，队里已有 AWPer。
- 玩家被当作火力点，但队内明星也要求资源。

角色重叠不是纯负面：

- 高 `teamTrust` 时，可能形成双核或副指挥。
- 低 `teamTrust` 时，更容易触发 V4 话语权或资源倾斜事件。
- 青训队里，重叠可以表现为“竞争上岗”，不是马上冲突。

### 11.13 玩家是否接受队伍定位

V3.5 生成入队定位后，不建议永远自动接受。队伍给你的定位可以通过事件让玩家选择。

事件示例：

```text
教练组希望你先从辅助位打起。
```

选择：

- 接受定位
  `teamTrust +2`，相关队友默契小幅上升，后续角色成长偏向队伍需求。

- 坚持原本位置
  压力上升，面试或入队初期 DC 上升；如果玩家实力足够，可能获得更强个人定位。

- 暂时接受，私下加练目标角色
  进入角色转换或个人训练链，短期压力和疲劳上升。

这类事件能把战队画像、玩家职业目标和角色系统连起来，也能解释为什么某些队伍适合玩家，某些队伍会让玩家感到别扭。

### 11.14 轻量试训 / 轮换状态

不建议做完整替补系统，但可以给入队状态一个轻量表达。

用途：

- `starter`：正式首发，正常获得赛事收益。
- `trial`：试训期，初始 `teamTrust` 较低，面试后几周更容易触发证明自己事件。
- `rotation`：轮换位，赛事收益或队伍信任成长略低，但压力也较低。

青训队尤其适合使用 `trial`，因为新人刚加入不一定立刻被完全信任。

如果暂时不新增字段，也可以用短期 tag 表达：

- `team-trial`
- `team-rotation`
- `team-starter`

V3.5 MVP 建议新增字段，而不是只用 tag。原因是试训/轮换会影响赛事收益、资格归属和队伍信任成长，属于结构化状态。

字段应挂在玩家当前队伍状态上，例如 `player.team.teamStatus`，不要挂到全局 `ClubRuntimeState`：

```ts
interface PlayerTeamState {
  teamStatus?: 'starter' | 'trial' | 'rotation';
  teamStatusUntilRound?: number;
}
```

比赛和资格边界：

- `starter`：正常代表当前战队参赛，正常获得个人奖励、战队资格和队伍信任/默契变化。
- `trial`：可以参加低级别或试训性质赛事；正式战队资格赛默认不能使用战队资格，除非事件明确转正。
- `rotation`：可以参加赛事，但队伍收益和队伍信任成长略低；如果赛事是关键主线赛事，赛前事件可以要求“争取首发”。
- 玩家报名个人开放赛时，`teamStatus` 不影响个人资格归属。
- 玩家报名战队拥有资格的赛事时，必须要求 `teamStatus === 'starter'`，或由特殊事件临时授权。

收益建议：

- `trial`：比赛奖金和薪资照常按合同发放，但 `teamTrust` 成长减半，队友默契成长减半。
- `rotation`：比赛收益正常，队友默契成长略低；连续打出好成绩可以触发转正事件。
- `starter`：沿用当前逻辑。

转正/降级时机：

- 试训期结束、关键赛事表现、连胜、教练事件或队友离队后重算。
- `teamStatusUntilRound` 到期后不自动静默切换，应该通过事件或推进回合的 passive effect 给玩家反馈。

### 11.15 职业目标路线提示

战队画像还应该影响职业目标面板的近期建议。

示例：

```text
这支队伍更适合：青训体系晋级
这支队伍更适合：公开赛冲成绩
这支队伍更适合：稳定积累比赛经验
```

不要改变职业目标本身，只给方向性提示，帮助玩家理解为什么选择不同青训队会改变节奏。

### 11.16 接入队伍管理动作

战队画像需要影响 V1/V2 已有动作，否则玩家每回合感受不到差异。

示例：

- `tactical`：战术会议 DC 降低。
- `firepower`：队友加练成功收益略高，但疲劳消耗略高。
- `development`：队友成长更稳定，失败保底更好。
- `chaotic`：安抚更衣室 DC 更高，`locker-tension` 更容易出现。
- `balanced`：没有极端修正。

这些修正要小，避免玩家只按 profile 找最优队。

### 11.17 接入 V4 话语权事件

V4 的话语权事件应该读取 `politicsBias`：

- `callerWeight` 高：教练组更容易支持指挥。
- `starWeight` 高：队伍更愿意围绕明星打。
- `coachControl` 高：冲突更容易被教练组压住。
- `conflictRisk` 高：低信任时更容易触发争夺话语权。

这样“指挥 vs 明星”的事件不是随机出现，而是和玩家选择加入的队伍有关。

### 11.18 不建议做的内容

不要把战队画像做成：

- 纯 UI 文案。
- 直接胜率加成。
- 完整经理系统。
- 每队固定写死 4 个队友。
- 玩家入队前就能精确看到所有隐藏权重。
- 玩家入队时重建整支队伍。
- 为了给玩家制造事件，强行改写非玩家战队的既有状态。

玩家可以看到方向性描述，例如：

```text
战队风格：体系青训
偏好：战术、稳定、团队配合
队内环境：教练组强势，冲突较少
```

但具体权重、DC 和事件概率不直接暴露。

### 11.19 可扩展方向

V3.5 的核心是世界队伍运行态。后续扩展应该优先复用现有系统，避免新增一套平行新闻、宿敌或调试机制。

#### 社交媒体承载世界新闻

当前项目已经有社区动态系统：

- 后端接口：`GET /api/game/:sessionId/social-feed`
- 缓存键：`social:${sessionId}:all`、`social:${sessionId}:r${round}`
- 前端面板：社区动态
- 作者类型：`teammate` / `club` / `rival` / `media` / `star` / `industry` / `fan`

因此不建议新增独立“世界新闻系统”。世界队伍新闻应该接入现有社交动态。

建议给社交动态生成上下文新增：

```ts
interface WorldSocialContext {
  activeStorylines: ClubStoryline[];
  recentClubResults: ClubRecentResult[];
  promotedClubs: string[];
  fallenClubs: string[];
  darkHorseClubs: string[];
  rivalClubIds: string[];
  debugSources?: Array<{
    clubId: string;
    source: 'storyline' | 'recentResult' | 'seasonSummary' | 'rival';
    reason: string;
  }>;
}
```

映射方式：

- `dark-horse-run`：由 `media`、`industry`、`fan` 讨论黑马队。
- `core-rebuild`：由 `media`、`industry` 讨论换核和磨合。
- `chemistry-crisis`：由 `fan`、`media` 讨论队内问题。
- `star-breakout`：由 `star`、`industry` 讨论新星爆发。
- `promoted-after-breakout-season`：由 `club` 官宣或 `media` 总结。
- `fallen-giant`：由 `media`、`fan` 讨论老牌强队低迷。

示例：

```text
media: "NovaCore 这个赛季真不是昙花一现，A 级赛连续两次深轮次了。"
industry: "Titan Rift 换核后默认配合明显慢了半拍，磨合期比想象中更痛。"
club: "我们拿到下一阶段公开预选资格了，继续往前。"
fan: "谁年初能想到 NovaCore 真能冲 Major 路线啊？"
```

生成规则：

- 世界新闻每回合最多占 1-2 条社交动态，不能盖过玩家主线。
- 优先展示和玩家相关的队伍：近期对手、宿敌队伍、可申请队伍、同阶段竞争队。
- 不暴露 `seasonPoints`、`internalChemistry`、`clubTrust` 等机制字段。
- 社交动态只负责展示和氛围，不直接修改世界状态。
- 查询 `/social-feed` 不允许触发世界 tick，只能读取当前已存在的 `WorldClubPool` 摘要。
- `/social-feed` 可以继续生成帖子并写入社交动态 KV 缓存，但不能写回 `GameSession.worldClubs`。
- `WorldSocialContext` 只传摘要，不传完整 `WorldClubPool`，避免 prompt 过长和泄露机制字段。
- 社交动态调试信息应记录“这条世界新闻来自哪个 storyline / clubId / recentResult”，方便排查为什么出现某条帖子。

#### 宿敌系统接入世界队伍

宿敌系统不应该只停留在个人事件。宿敌所在队伍也应进入 `WorldClubPool.activeClubIds`。

可扩展事件：

- 宿敌加入强队。
- 宿敌所在队伍打出黑马路线。
- 玩家在赛事中淘汰宿敌队伍。
- 宿敌队伍升入更高级赛事，形成追逐感。
- 宿敌转会到和玩家目标冲突的队伍。

宿敌相关社交动态优先使用 `rival`、`media`、`fan` 作者类型。

#### 世界调试页

V3.5B 起需要 debug 支撑，否则世界模拟很难排查。

调试页至少展示：

- `WorldClubPool.activeClubIds/relevantClubIds/staticClubIds`
- 每队 `tier/currentForm/seasonPoints/internalChemistry/clubTrust/rosterStability`
- 最近 `recentResults`
- 当前 `activeStorylines`
- 当前 `qualificationState`
- 为什么某队进入某个赛事池
- 最近一次 tick 的 `tickType`、round 和 seed 输入

调试页只能读状态，不能触发 tick。

#### 赛季总结

每年结束可以生成一组赛季总结，展示世界变化。

示例：

```text
年度黑马：NovaCore
陨落强队：Titan Rift
最佳新人队伍：Cyber Academy
Major 新面孔：NovaCore, Eastline
```

赛季总结来源于 `WorldClubPool`，可以展示在社区动态或赛季结算界面。MVP 可以只放到社区动态中，由 `media/industry` 账号发帖。

#### 非玩家队伍实力公式

非玩家赛事结果不能完全随机。建议后续实现一个抽象队伍实力分：

```ts
clubPower =
  rosterPower
  + currentFormModifier
  + internalChemistryModifier
  + clubTrustModifier
  + storylineModifier
```

用途：

- 赛事抽象结果。
- 黑马概率。
- 强队衰退恢复速度。
- 赛前分析卡。

公式只用于非玩家队伍模拟，不直接替代玩家比赛公式。

---

## 12. V4：明星话语权与有限队伍策略

V4 不能直接做成完整队伍管理策略层。游戏主角是个人电竞选手，不是教练、经理或俱乐部老板。普通选手即使在一线队，也通常只能影响自己的训练、和队友的配合、赛前沟通，以及少量更衣室关系，不应该直接决定整队训练方向、战术体系或阵容管理。

因此 V4 的设计前提是：只有当玩家具备明确队内话语权后，才逐步获得对队伍决策的有限影响。话语权有两条合理来源：

- 明星核心：类似 s1mple、ZywOo、NiKo 这类关键明星人物，俱乐部和教练组会重视他的意见。
- 队内指挥：玩家成为 IGL 或承担指挥职责后，对战术训练、默认配合和赛前准备有天然发言权。

这两条路径都不是“经理权限”。玩家可以提出建议、推动沟通、影响战术准备，但不能像俱乐部经理一样直接操作预算、转会和完整阵容。

V4 还应该把“话语权”做成会发生冲突的队内关系系统。明星核心和队内指挥都可能拥有影响力，但他们的目标不一定一致：

- 指挥更关心战术纪律、默认配合、执行统一。
- 明星选手更关心个人发挥空间、资源倾斜、关键回合自由度。

当队伍协同差、队伍信任低、玩家和关键队友默契低时，话语权就不应该只是一个解锁按钮，而应该触发队内博弈事件。

### 12.1 队内话语权解锁条件

建议拆成两个判断：

```ts
canInfluenceByStarPower =
  derivePlayerTeamIdentities(player, roster).includes('star')

canInfluenceByCalling =
  derivePlayerTeamIdentities(player, roster).includes('caller')

canInfluenceTeamStrategy =
  canInfluenceByStarPower
  || canInfluenceByCalling
```

可选加强条件：

- 当前有 `pro` 或 `top` 战队。
- `teamTrust >= 50`，表示队内愿意听你说话。
- 当前合同不是刚签入队的试用状态。

注意：`canInfluenceByCalling` 的权限更偏战术，不应自动解锁阵容建议或转会相关事件。`canInfluenceByStarPower` 才能触发更高层的教练组/管理层讨论。

如果玩家没有达到这些条件，V4 的策略按钮不显示，或只显示为叙事提示：

```text
你还没有足够的队内话语权，教练组只会听取你的个人反馈。
```

### 12.2 普通选手阶段的边界

未成为关键明星前，可以保留：

- 队友加练。
- 战术会议。
- 安抚更衣室。
- 挽留核心队友。
- 赛前个人准备和沟通。

不应该开放：

- 本月队伍训练方向。
- 阵容调整建议。
- 指定替补或转会目标。
- 长期战术体系选择。
- 教练/分析师/设施等俱乐部管理。

这能保持“个人职业生涯模拟”的视角：玩家可以努力成为队伍核心，但不能一开始就像经理一样操作全队。

### 12.3 明星选手：训练方向建议

成为关键明星或队内指挥后，可以让玩家向教练组提出本月训练重点。用“建议”而不是“命令”表达，避免经理化。

入口文案：

```text
向教练组建议训练重点 -20 AP
```

可选方向：

- 枪法压迫
- 战术执行
- 防守纪律
- 心态稳定

效果建议：

- 消耗 AP，表示玩家需要准备复盘和沟通。
- 根据 `fame`、`teamTrust`、`experience`、`intelligence` 做判定。
- 成功后获得 4 周的队伍训练倾向 tag。
- 失败时不生效，或轻微增加压力、降低 teamTrust。

示例：

```ts
dc = 12
if (player.fame >= 100) dc -= 2
if (derivePlayerTeamIdentities(player, roster).includes('caller')) dc -= 2
if (teamTrust >= 65) dc -= 1
if (teamTrust < 35) dc += 2
if (player.team?.tier === 'top') dc += 1 // 顶级队教练组更强势
```

训练倾向不应该给大幅胜率加成，只影响小方向：

- 队友后台成长倾向。
- 指定类型队伍管理动作 DC。
- 赛前状态预览的方向性提示。
- 少量赛事表现修正，最多 `+1` 或条件性触发。

### 12.4 队内指挥：战术建议权限

如果玩家是 IGL 或明确承担指挥职责，应优先解锁战术类影响，而不是管理层影响。

可开放：

- 训练重点：战术执行、防守纪律、默认配合。
- 赛前战术准备：提高战术会议成功率，或让「战术统一」更稳定。
- 角色沟通：降低角色转换事件的 DC。
- 比赛中沟通：小幅降低心态波动或压力增长。

不开放：

- 指定替补。
- 点名换人。
- 转会目标。
- 薪资、合同、教练组相关决策。

示例动作：

```text
梳理默认战术 -25 AP
```

效果：

- 主属性 `intelligence`，副属性 `experience`。
- 成功：全队队友默契 `+1`，下一场赛事获得轻量战术准备 tag。
- 失败：压力 `+6`，如果 `teamTrust < 35` 则可能增加 `locker-tension`。

这个动作可以视为“战术会议”的 IGL 强化版本，或者在 V4 中替代普通战术会议。

### 12.5 明星选手：阵容建议事件

阵容调整不建议做成常驻按钮。即使是明星选手，也很少每周直接点按钮换人。更合理的方式是事件化：

触发条件：

- 玩家满足 `canInfluenceByStarPower`。
- 当前队伍近期连败。
- 有 `locker-tension`。
- 某名队友准备离队。
- 当前阵容协同很差。

事件示例：

```text
教练组问你是否需要调整角色分工。
```

选择：

- 支持保持现阵容：提高 teamTrust，短期队伍默契稳定。
- 建议调整角色分工：有机会获得短期角色分工 tag，下一场团队协同预览更正面；失败会降低队友默契。
- 点名某个问题位置：高风险，高收益，可能触发队友冲突。

注意：这里仍然不是转会市场。玩家只能表达意见，最终结果由事件判定和俱乐部环境决定。

队内指挥路径不默认触发这个事件。IGL 可以建议角色分工和战术结构，但不能因为是指挥就拥有换人话语权。

### 12.6 话语权冲突事件组

新增一组队内事件，用于表达“指挥”和“明星选手”争夺队伍方向。

这组事件只在玩家已经具备某种话语权时出现：

- 玩家是队内指挥，队内存在明星队友。
- 玩家是明星核心，队内存在 IGL 队友。
- 玩家同时是明星和 IGL 时，不触发争夺事件，改为触发“承担双重压力”的事件。

#### 12.6.1 玩家是指挥：和明星队友争夺话语权

触发条件建议：

```ts
playerIsCaller =
  derivePlayerTeamIdentities(player, roster).includes('caller')

starTeammate =
  findTeamStar(player, roster)?.type === 'teammate'
    ? findTeamStar(player, roster)
    : null

shouldTriggerCallerVsStar =
  playerIsCaller
  && starTeammate
  && (
    calcSynergyBonus(player, roster) <= 0
    || teamTrust < 40
    || starTeammate.chemistry <= 35
    || player.consecutiveLosses >= 2
  )
```

事件示例：

```text
明星队友质疑你的默认战术
```

叙事含义：

明星队友觉得你的默认战术限制了他的发挥空间，训练赛里开始频繁要求更多资源或自由度。

选择示例：

- 坚持战术纪律
  主判定：`intelligence + experience`
  成功：获得短期 `caller-discipline` tag，`teamTrust +2`，该明星队友默契 `-2` 或不变。
  失败：`teamTrust -4`，该明星队友默契 `-6`，可能添加 `locker-tension`。

- 给明星队友更多自由度
  主判定：`mentality + experience`
  成功：该明星队友默契 `+4`，短期获得火力倾斜 tag。
  失败：添加短期 `role-confusion` tag，其他队友默契 `-1`。

- 私下复盘，找折中方案
  主判定：`intelligence + mentality`，DC 较高。
  成功：`teamTrust +3`，明星队友默契 `+3`，派生队伍默契随之上升。
  失败：压力 `+8`，无明显收益。

设计重点：

- 指挥不是天然正确。强行压明星可能换来纪律，也可能破坏关系。
- 明星不是纯负面。给自由度可能提高短期火力，但会牺牲体系稳定。
- 最优解应取决于玩家属性、队伍状态和接下来赛事类型。

#### 12.6.2 玩家是明星：和队内指挥争夺话语权

触发条件建议：

```ts
playerIsStar =
  derivePlayerTeamIdentities(player, roster).includes('star')

callerTeammate =
  findTeamCaller(player, roster)?.type === 'teammate'
    ? findTeamCaller(player, roster)
    : null

shouldTriggerStarVsCaller =
  playerIsStar
  && callerTeammate
  && (
    calcSynergyBonus(player, roster) <= 0
    || teamTrust < 40
    || callerTeammate.chemistry <= 35
    || player.consecutiveLosses >= 2
  )
```

事件示例：

```text
队内指挥要求你按体系打
```

叙事含义：

你已经是队伍的主要火力点，但队内指挥认为你最近过度依赖个人判断，破坏了默认战术节奏。

选择示例：

- 接受指挥安排
  成功：`teamTrust +3`，全队队友默契 `+1`，个人手感可能短期 `-1`。
  失败：压力 `+6`，下一场关键回合更容易心态波动。

- 要求更多自由度
  主判定：`fame + mentality` 或 `agility + experience`。
  成功：获得短期火力自由 tag，个人表现上限提高。
  失败：`teamTrust -5`，IGL 队友默契 `-5`，可能添加 `locker-tension`。

- 用数据说服指挥
  主判定：`intelligence + experience`。
  成功：IGL 队友默契 `+3`，战术会议/默认战术相关 DC 降低。
  失败：压力 `+5`，无明显收益。

设计重点：

- 明星话语权不等于可以无视体系。
- 指挥压制明星也不一定正确。
- 玩家需要在个人发挥空间和队伍执行力之间做取舍。

#### 12.6.3 玩家同时是明星和指挥

如果玩家同时满足 `canInfluenceByStarPower` 和 `canInfluenceByCalling`，不应触发“和自己争夺话语权”的事件，而应触发“双重责任”事件。

事件示例：

```text
所有人都在等你做决定
```

触发条件：

- 玩家同时是明星和 IGL。
- 队伍近期连败，或关键赛事前。
- 压力较高，或疲劳较高。

选择示例：

- 继续亲自扛战术和火力
  成功：短期队伍默契上升，个人压力大幅上升。
  失败：疲劳、压力、心态波动明显上升。

- 把部分指挥交给队友
  成功：压力下降，某名 IGL/Support 队友默契上升。
  失败：添加短期 `role-confusion` tag，队伍信任小幅下降。

- 要求教练组介入
  成功：移除 `locker-tension`，但个人话语权短期降低。
  失败：更衣室认为你在甩锅，`teamTrust -4`。

#### 12.6.4 事件结果影响范围

话语权冲突事件可以影响：

- `teamTrust`
- 指定队友 `chemistry`
- 派生队伍默契
- `locker-tension`
- 短期战术/火力 tag
- 玩家压力、疲劳、心态波动
- 后续战术会议、训练重点建议的 DC

不应该直接影响：

- 永久换人。
- 直接转会。
- 俱乐部预算。
- 教练组去留。

这些更高层结果只能通过后续事件链、长期低信任或转会系统间接发生。

### 12.7 话语权状态与事件池

话语权不建议做成一个独立长期数值，例如 `teamInfluence: 0-100`。这类字段容易变成又一个可刷资源，也会让玩家误以为自己拥有稳定管理权。

更推荐每次事件临时派生：

```ts
starInfluence =
  fame
  + recentMatchPerformance
  + majorOrSChampionshipBonus
  + teamTrustContext

callerInfluence =
  roleBonus
  + intelligence
  + experience
  + tacticalTraitBonus
  + teamTrustContext
```

事件只根据当前状态判断谁更有发言权。这样话语权会随着近期成绩、队伍信任、角色和关系波动，而不是永久锁死。

#### 12.7.1 队内话语权状态

战队面板可以显示一句方向性状态，但不要提供“调整话语权”的按钮。

示例：

```text
队内话语权：指挥主导
队内话语权：明星核心影响较大
队内话语权：教练组暂时压住分歧
队内话语权：方向存在争议
```

状态来源：

- `callerInfluence` 明显高：指挥主导。
- `starInfluence` 明显高：明星核心影响较大。
- 两者接近且 `teamTrust >= 55`：共同决策。
- 两者接近且 `teamTrust < 40`：方向存在争议。
- `locker-tension` 存在：话语权状态显示为不稳定。

这个状态只用于解释队内环境，不直接给玩家操作权限。

#### 12.7.2 教练组态度

不需要做完整教练系统，但可以用短期 tag 表示教练组在当前冲突中的态度。

建议 tag：

- `coach-backs-caller`：教练组支持指挥，战术纪律相关选择 DC 降低。
- `coach-backs-star`：教练组支持明星，资源倾斜和自由度相关选择 DC 降低。
- `coach-neutral`：教练组让选手内部解决，调停选项 DC 降低。
- `coach-lost-control`：教练组压不住更衣室，冲突事件权重上升。

这些 tag 应该有短期持续时间，例如 2-4 周，不能永久决定队伍政治。

#### 12.7.3 正向话语权事件

话语权事件不应该全是内斗。高信任或高队友默契时，可以触发正向版本：

- 指挥围绕明星重新设计战术。
- 明星主动适应体系。
- 双方复盘后形成“明星战术包”。
- 关键赛事前达成临时共识。

示例事件：

```text
你们终于把资源分配说清楚了
```

成功结果可以给短期 tag：

- `caller-star-aligned`
- `star-system-ready`
- `late-round-clarity`

效果建议：

- 下一场比赛队伍默契修正更容易触发正面档位。
- 战术会议 DC 降低。
- 指定明星队友默契上升。
- 压力小幅下降。

#### 12.7.4 资源倾斜事件

明星话语权的核心不是“换人”，而是比赛资源分配。资源倾斜必须事件化，不能做成常驻管理菜单。

事件示例：

```text
是否把默认资源向明星倾斜？
```

可选方向：

- 更多默认道具给明星。
- 给明星更多首杀空间。
- 允许关键回合更多自由判断。
- 保持均衡资源，避免其他队友不满。

收益：

- 明星选手相关火力 tag。
- 个人或明星队友表现上限提高。

代价：

- 可能添加短期 `role-confusion` tag。
- 其他队友默契可能下降。
- 低 `teamTrust` 时更容易产生 `locker-tension`。

#### 12.7.5 沉默成本

很多冲突里，玩家可以选择不表态。这很符合个人选手视角，但沉默不应永远无成本。

示例选择：

- 不介入，让教练处理。
- 先忍一忍，比赛后再说。
- 表面同意，实际按自己方式打。

短期收益：

- 压力减少或避免立即冲突。
- 不立刻降低某个队友默契。

长期风险：

- `locker-tension` 权重上升。
- 队伍信任缓慢下降。
- 未来同类冲突 DC 上升。
- 玩家和关键队友默契停滞或下降。

#### 12.7.6 普通选手的站队与调停

即使玩家不是明星也不是指挥，也可以卷入话语权事件，但权限不同。普通选手不能决定队伍方向，只能站队、调停或沉默。

事件示例：

```text
指挥和明星在复盘室僵住了
```

选择：

- 支持指挥：指挥队友默契上升，明星队友默契下降风险。
- 支持明星：明星队友默契上升，短期 `role-confusion` 风险。
- 居中调停：高 DC，成功提高 `teamTrust`。
- 保持沉默：短期无风险，长期提高冲突复发概率。

这让普通选手阶段也能感受到队内政治，但不会提前获得管理权。

#### 12.7.7 失败风险积累

话语权冲突失败不应直接导致换人或转会。更合理的是积累风险：

- `teamTrust` 下降。
- 指定队友 `chemistry` 下降。
- 添加或延长 `locker-tension`。
- 后续转会预警事件权重上升。
- 战术会议和训练重点建议 DC 上升。

只有长期低信任、连续失败、队友默契过低时，才通过现有离队/转会事件链间接发酵。

### 12.8 事件频率预算

V4 事件池不能太高频，否则会盖过训练、赛事和职业目标主线。

建议频率：

- 话语权冲突事件：同类至少冷却 6-8 周。
- 资源倾斜事件：只在关键赛事前、连败后或低信任时触发。
- 正向话语权事件：可以略高频，但仍需要 4 周左右冷却。
- 普通选手站队事件：只在队伍已有 caller 和 star 且关系紧张时触发。

触发窗口：

- 连败后。
- 关键赛事前 1-2 周。
- 新队友加入后。
- 队友离队预警出现后。
- `teamTrust < 40`。
- 指定 caller/star 队友 `chemistry <= 35`。
- `locker-tension` 存在。

不建议：

- 每周都检查并强行触发队内政治。
- 在没有待赛、没有连败、信任正常时频繁制造冲突。
- 连续触发多个同类话语权事件。

### 12.9 AI 事件生成边界

如果未来 AI 事件生成接入队内政治，必须把 V3 身份和 V4 禁止规则传给 AI。

生成上下文必须包含：

- 当前 `findTeamStar(player, roster)` 结果。
- 当前 `findTeamCaller(player, roster)` 结果。
- 每个候选身份的 `reasons`。
- 当前 `teamTrust`、队伍默契、关键队友默契。
- 当前冷却中的事件类型。

AI 禁止生成：

- 没有明星时写“明星队友”。
- 没有指挥时写“队内指挥要求你”。
- 直接换人、直接转会、直接开除教练。
- 直接修改团队协同派生值。
- 超出 outcome 允许范围的长期管理结果。

AI 允许生成：

- 队友默契变化。
- `teamTrust` 变化。
- `locker-tension` 添加或移除。
- 短期 tag。
- 压力、疲劳、心态波动。
- 后续事件权重或 DC 的短期修正。

调试日志需要记录：

- AI 使用了哪个身份对象。
- 为什么这个事件允许触发。
- 哪些候选事件因为身份缺失或冷却被拒绝。

### 12.10 个性冲突管理

把 `Teammate.personality` 从事件权重扩展为长期管理变量。

示例：

- `drama`：会议失败更容易产生 `locker-tension`
- `strict`：加练成功收益更高，失败信任掉更多
- `supportive`：安抚更衣室更容易成功
- `star`：队友属性成长快，但 teamTrust 更不稳定
- `grinder`：加练更容易成功，但疲劳成本更高

这部分不需要明星权限。它是系统内部规则和 UI 解释层，不代表玩家有管理权。

### 12.11 阵容协同可视化

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

这部分也不需要明星权限，因为它只是解释当前阵容为什么强或弱，不提供直接改阵容按钮。

### 12.12 管理动作连锁

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

普通选手阶段只能拥有个人层面的连锁：

- 安抚更衣室 -> 战术会议
- 战术会议 -> 队友加练
- 队友加练 -> 下一场比赛

明星选手阶段可以解锁更高层连锁：

```text
建议训练重点 -> 战术会议
效果：会议成功时全队队友默契额外 +1

建议训练重点 -> 下一场同类型赛事
效果：获得小幅方向性准备修正
```

这些连锁仍然通过 AP、判定和短期 tag 表达，不应变成永久队伍管理菜单。

队内指挥阶段可以解锁战术连锁：

```text
梳理默认战术 -> 战术会议
效果：会议 DC -2

梳理默认战术 -> 下一场比赛
效果：队伍默契修正更容易触发正面档位
```

指挥连锁的收益应集中在战术执行和稳定性，不能变成阵容或转会权限。

### 12.13 旧设计文档同步

V2 以后，比赛中不再单独使用 `trustModifier`。旧文档已经同步为派生队伍默契方案：

- `docs/roster-system-design.md` 的赛事结算公式改为 `chemistryModifier`，并保留 `trustModifier` 旧方案标记。
- `docs/social-system-design.md` 的增强表改为“派生队伍默契修正接入”。

同步原则：

- `teamTrust` 不直接作为独立胜率修正叠加。
- `teamTrust` 只通过 `deriveTeamChemistry(roster, teamTrust)` 影响派生队伍默契。
- 赛前展示可以显示“队伍信任”，但比赛数值拆分应显示为“队伍默契修正”，避免玩家误以为信任和默契各算一次。
- 如果旧文档保留历史方案，需要在标题或段落前标注“旧方案，已由队伍默契公式替代”。

---

## 13. 不建议现在做的内容

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

### 世界模拟可以更重，但必须分层落地

V3.5 要让战队系统自行运行。为了支持黑马、强队衰退、换核磨合、赛季升降级，世界模拟可以比最初设想更重，但仍然不能一步做成完整电竞经理后台。

短期不要做：

- 为所有战队保存完整逐周训练、逐场比赛和完整经济账本。
- 在玩家看不到的远端战队上运行完整 V1/V2/V4 队伍管理逻辑。
- 让非玩家战队每回合都生成大量事件。
- 为每支队伍都写死固定 5 人阵容和长期剧情。

推荐做法：

- 玩家当前队伍完整模拟。
- 相关队伍赛季级模拟。
- 远端队伍只保留静态画像，进入玩家视野时懒生成运行态。
- 非玩家战队的变化以摘要形式保存，例如近期状态、阵容稳定性、内部磨合、赛季积分、资格进度、最近结果和故事标记。

这样可以同时满足“CS 世界在运行”和“游戏仍然是个人选手生涯模拟”。

---

## 14. 工程边界

这一节用于约束 V3 / V3.5 / V4 落地范围。任何新增能力都应先判断属于下面哪条边界，避免把战队系统扩成另一套经理模拟。

### 14.1 模块职责边界

- `backend/src/engine/teamIdentity.ts` 只负责身份派生、候选排序、可见身份刷新和解释原因；不直接修改比赛公式、转会结果或事件 outcome。
- `backend/src/engine/worldClubs.ts` 只负责战队运行态、世界队伍池、赛季级 tick 和摘要结果；不执行玩家队伍主动动作，也不逐回合模拟远端战队完整日常。
- `backend/src/engine/gameEngine.ts` 负责玩家可触发动作、AP 消耗、玩家当前队伍结果写回和存档推进；新增队伍动作时应继续从这里统一进入，避免在 route 或 UI 中实现规则。
- `backend/src/engine/events.ts` 和 `backend/src/data/events/team.ts` 负责事件筛选、权重和 outcome 定义；事件可以读取身份、话语权和世界故事线，但不能绕过 outcome 结构直接改长期状态。
- `backend/src/ai/eventGenerator.ts` 只能生成符合当前身份和状态的候选叙事；AI 不拥有新增规则权限，禁止生成换人、预算、教练任免等系统未支持结果。
- `frontend/src/components/ClubPanel.tsx` 只展示玩家当前可见战队、队友、主动动作和动作结果；远端战队运行态只进入 debug 或申请/对手摘要，不在战队面板展开成管理后台。
- `frontend/src/app/debug/sessions/[sessionId]/page.tsx` 可以展示运行态、身份分数、storylines 和内部数值；正式玩家 UI 不展示原始权重、隐藏池分层或不可解释的内部计数。

### 14.2 状态存储边界

- `player.roster` 永远表示“玩家当前同队且可互动的 4 名队友”，不表示俱乐部完整大名单。
- `ClubRuntimeState.fullRoster` 表示俱乐部运行态中的完整 5 人阵容或抽象阵容来源；加入玩家队伍时只能映射出 `player.roster`，不能把完整替补席暴露为玩家可管理列表。
- `player.teamTrust` 是玩家所在队伍和玩家视角的信任；`clubTrust` 或 `internalChemistry` 是俱乐部运行态摘要，两者不能自动双向同步。
- `Teammate.chemistry` 是玩家和具体队友的默契；`deriveTeamChemistry(roster, teamTrust)` 是派生队伍默契，仍不新增长期 `teamChemistry` 存储字段。
- `visibleIdentity` / `visibleTeamIdentity` 是 UI 和事件稳定性字段；身份完整分数、候选理由和即时排序只在派生函数或 debug 中出现，不作为可刷养成资源。
- `roundCombos` 可以承载队伍管理连锁，但每条连锁必须短期、一次性、可消费；不能作为长期战术体系或永久队伍等级。
- `seasonSummaries`、`activeStorylines` 和世界新闻摘要只保存可复述结果，不保存完整逐场日志、完整经济账本或远端战队逐周训练过程。

### 14.3 行为副作用边界

- 玩家主动队伍动作只能影响 AP、压力/疲劳、`teamTrust`、当前 `player.roster` 的队友默契/成长、短期 tag/buff、离队风险和一次性 combo。
- 队伍动作不能直接换人、签人、开除队友、分配预算、改教练、改俱乐部设施或永久提高团队协同派生值。
- 团队协同仍由阵容结构、角色和 trait 派生；训练、会议和安抚只能通过默契、信任、短期准备或事件链间接影响比赛。
- 非玩家战队 tick 只能产生赛季级摘要变化，例如状态、积分、资格、storyline 和抽象实力；不能为远端战队触发完整 V1/V2/V4 主动动作。
- 世界模拟的写回触发点必须可预期：推进回合、赛事结算、赛季结算或明确 debug 操作。查询、预览和 UI 展示不应创建或改变运行态，除非函数名明确是 `getOrCreate` / `ensure` 类写入入口。
- 路由层只做鉴权、参数校验和调用 engine，不计算 DC、不直接改 `player`，也不拼接业务 outcome。

### 14.4 API 与前端边界

- 所有新增队伍动作 API 返回 `{ player, result }`，`result` 使用 `TeamActionResult`，并包含 `actionId`、`label`、`success`、`roll`、`dc`、`narrative`、`effects`。
- 如果动作接入连锁，只返回 `comboTriggeredLabels` 和 `comboAddedLabels` 给前端；前端不需要知道 combo id、剩余次数或效果细节。
- 战队面板按钮只暴露玩家当前具备权限的动作。普通选手不显示训练重点建议；没有离队风险不显示挽留；没有更衣室问题不鼓励安抚。
- 玩家 UI 使用自然语言解释原因，例如“队内话语权不足”“本周已加练”，不展示 raw 权重、政治 bias、运行态池层级或随机种子。
- Debug 页可以展示 raw 数据，但必须和正式 UI 分离，避免调试字段变成玩家策略入口。

### 14.5 测试边界

- 身份派生需要单元测试覆盖明星、指挥、稳定器、冲突源、玩家双身份和阈值不足返回空。
- 队伍动作测试至少覆盖 AP 消耗、每周限制、成功/失败 outcome、`teamTrust`、队友默契、离队风险和 combo 消费。
- 世界运行态测试需要覆盖懒加载幂等、active/relevant/static 分层、赛季 tick、赛事结果反写和故事线生成。
- V4 事件测试需要覆盖身份缺失时不触发、冲突风险提高权重、普通选手只站队/调停、AI prompt 禁止越权结果。
- 前端类型检查必须覆盖新增 result 字段；前端不为业务规则写单独判定，只根据后端返回和玩家当前状态控制展示。

---

## 15. 推荐排期

### 第一阶段：V1（已完成）

- 队友加练
- 战术会议
- 安抚更衣室
- 每周队伍动作冷却
- 战队面板 UI

### 第二阶段：V2（已完成）

- `Teammate.chemistry`
- 派生队伍默契公式
- 比赛公式接入派生队伍默契修正
- 移除当前比赛公式中的独立 `trustModifier`
- 战队面板展示队伍默契和队友默契

### 第三阶段：V3（已完成）

- 队内身份识别层
- 身份稳定性规则
- 队伍身份 debug 展示
- 队友主身份 UI 展示
- 玩家队内定位展示
- 挽留核心队友
- 离队风险 UI 强化

### 第三点五阶段：V3.5A - 运行态与入队边界（已完成）

- 战队画像数据结构
- 战队运行态 `ClubRuntimeState`
- 世界队伍池 `WorldClubPool`
- `fullRoster` / `player.roster` 边界
- `clubTrust` / `player.teamTrust` 边界
- `internalChemistry` / `Teammate.chemistry` 边界
- 运行态懒加载和刷新规则
- tick 触发时机和可复现随机种子
- 青训队画像配置
- 申请/面试匹配度
- 阵容模板生成，拆分 `generateClubRoster` 和 `integratePlayerIntoClub`
- 入队方式 `replace-starter` / `fill-vacancy` / `trial-sixth` / `rotation`
- 入队初始定位、信任和默契
- 入队缺口与角色重叠
- MVP 不做完整替补席管理

### 第三点五阶段：V3.5B - 赛季级世界模拟（已完成）

- 非玩家战队赛季级后台 tick
- 世界队伍池 active/relevant/static 分层
- 赛事系统读取非玩家战队运行态
- 赛事结果反写非玩家战队状态
- 非玩家战队赛季积分和资格进度
- 非玩家战队可报名赛事池更新
- 世界调试页展示队伍池、运行态、最近结果和资格进度

### 第三点五阶段：V3.5C - 世界故事线与升降级（已完成）

- 黑马路线 storylines
- 强队衰退 storylines
- 换核磨合 storylines
- 赛季末非玩家战队升降级结算
- 升降级与玩家职业阶段边界
- 职业目标近期机会读取世界变化
- 社交动态承载世界新闻，不新增独立新闻系统
- 宿敌系统读取世界队伍运行态
- AI 事件读取 `activeStorylines`
- 世界调试页展示队伍池、tick、资格和 storylines
- 赛季总结
- 非玩家队伍实力公式
- 队伍管理动作修正
- V4 话语权事件权重来源

### 第四阶段：V4（已完成）

- 明星话语权解锁条件
- 队内指挥话语权解锁条件
- 指挥和明星的话语权冲突事件
- 话语权状态与事件池
- 事件频率预算
- AI 事件生成边界
- 明星选手训练方向建议
- 队内指挥战术建议权限
- 明星选手阵容建议事件
- 个性冲突长期管理
- 阵容协同可视化
- 队伍管理 combo
