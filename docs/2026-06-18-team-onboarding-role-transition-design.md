# 角色转型与角色系统设计方案

> 文档版本：v1.1  
> 日期：2026-06-18  
> 状态：设计稿

---

## 1. 背景

当前系统里，入队流程已经具备完整长事件链，玩家接受 offer 后会进入 onboarding。

真正还缺的是角色系统本身：

- 玩家在队里长期打什么位置
- 当前被安排打什么位置
- 什么情况下会发生换位置
- 换位置如何从短期适应变成长期认定

如果不把角色系统独立出来，后续就会出现两个问题：

1. 角色变化总是被入队事件顺手处理，导致后期成长线断裂。
2. `preferredRole`、`activeRole`、`roleTransition` 之间的关系不够清楚，事件和赛事表现难以统一。

因此，这份文档只聚焦角色系统与角色转型。

---

## 2. 设计目标

1. 角色系统要能表达“临时打什么”和“长期被认定为什么”。
2. 换位置打要作为独立成长线运行，允许长期积累和后期结晶。
3. 角色转型要能被事件驱动，而不是只靠数值硬改。
4. 角色系统要和队伍需求、队内事件、赛事表现统一起来。
5. 入队只作为角色系统的前置条件，不作为本文重点。

---

## 3. 三层状态模型

### 3.1 角色层

角色层描述“你长期在队里更像哪个位置”。

核心字段：

- `preferredRole`
- `activeRole`
- `activeRoleRounds`
- `roleTransition`

语义：

- `preferredRole`：长期认定角色
- `activeRole`：当前实际执行角色
- `roleTransition`：正在进行中的转型目标

### 3.2 队内定位层

队内定位层描述“你在队里的身份”。

核心字段：

- `teamStatus`: `starter | trial | rotation`
- `teamStatusUntilRound`: 可选，到期后转为 starter

语义：

- `starter`：首发成员
- `trial`：试训/考察期成员
- `rotation`：轮换/替补成员

这个层不负责位置转型，只负责队内权责和赛事资格。

角色系统第一阶段只把 `teamStatus` 当作只读依赖，不重新设计队内身份系统。

### 3.3 转型层

转型层描述“你长期在队里承担的角色是否变化”。

这个层应该独立于入队层运行，允许在长期队伍中自然演化。

---

## 4. 角色分类规则

### 4.1 判定原则

角色不是一次性选择，而是三种状态并存：

1. `preferredRole` 表示长期画像，来源于 traits、长期使用和角色结晶。
2. `activeRole` 表示当前战术安排，可以和长期画像不同。
3. `roleTransition` 表示玩家正在从一个角色向另一个角色过渡。

### 4.2 为什么这样分

这套分法能表达真实职业路径：

- 你可能长期是 IGL，但新队先让你打补位
- 你可能最擅长 AWP，但为了队伍先去打 secondary entry
- 你可能在一个体系里只是临时换位，过一段时间才被认定为正式转型

这比“一个角色字段改来改去”更真实，也比“用入队事件顺手改角色”更稳定。

---

## 5. 角色事件链

### 5.1 事件映射

建议保留两段式角色事件：

- `chain-role-transition-start`
- `chain-role-transition-resolve`

### 5.2 统一选择结构

角色事件建议围绕这些动作展开：

- 接受转型建议
- 坚持原本位置
- 试打一段时间再决定
- 用数据证明自己适合新位置

这些选择用于表达角色调整中的心理成本和战术成本。

### 5.3 文案侧重点

- `start`：为什么要换位
- `resolve`：换位之后是否真正站稳
- 长期结果：是否从临时安排变成长期认定

---

## 6. 队内定位系统

### 6.1 `teamStatus`

`teamStatus` 只表达玩家在战队中的身份等级，不直接表达角色。

建议保持三态：

- `starter`
- `trial`
- `rotation`

### 6.2 自动升级

当 `teamStatusUntilRound` 到期时，系统可自动切到 `starter`，但需要保留反馈：

- 回合推进时给出 passive effect
- 不要无声切换
- 不要和角色转型混在一起

### 6.3 与赛事资格的关系

队内定位应该继续影响部分赛事资格判断：

- 需要首发资格的赛事，`trial` / `rotation` 不能直接报名
- 这类限制属于规则层，不属于角色层

---

## 7. 角色转型系统

### 7.1 核心理念

角色转型不是“换队时顺手改一下”，而是长期成长结果。

应该由以下四层共同驱动：

- **主契机**：直接把转型轨道打开的强事件，比如 IGL 离队、教练点名换位、队伍明确缺某个位置
- **权重契机**：只负责把转型事件抽中的概率往上推，比如教练不满、表现下滑、更衣室冲突、队友角色重叠
- **长期轨道**：一旦进入转型，就要经过多回合甚至跨赛季的持续试打与反馈
- **关键节点**：轨道上的具体结算点，比如接受建议、试打、证明自己、转型收束

这四层不是同一个东西，不能合并成一次随机事件。

### 7.2 事件链

建议仍保留两段式，但它们只负责关键节点，不负责整个转型生命周期：

- `chain-role-transition-start`
- `chain-role-transition-resolve`

流程：

1. 主契机先打开转型轨道
2. 权重契机叠加到阈值后，才可能抽到 `start`
3. 系统决定新的目标角色
4. 进入长期轨道，后续会不断出现试打、质疑、证明、收束等关键节点
5. `resolve` 只是其中一个结算点，不代表整条转型链结束
6. 成功则把 `preferredRole` 和 `activeRole` 一起更新为 `targetRole`，并重置 `activeRoleRounds`

### 7.3 角色结晶

当 `activeRole` 长期稳定后，允许结晶到 `preferredRole`。

这意味着：

- 玩家可以从“临时打这个位置”变成“公认打这个位置”
- 中后期角色差异不会消失
- 不同特质和事件会继续影响玩家的成长路径

### 7.4 长期轨道

`roleTransition` 不是一次性结果，而是一个长期进行中的状态。

它可以持续很多回合，甚至跨赛季，直到满足以下之一：

- 成功收束到新角色
- 中途失败、放弃或转回其他位置
- 队伍结构变化导致转型线被重置

在轨道期间，系统可以反复生成和消化这些节点：

- 教练私下建议你试位置
- 队伍缺人，临时让你补位
- 训练和复盘开始集中向某个位置倾斜
- 队内有人质疑你抢了别人的职责

这些都属于同一条长期轨道上的不同阶段，不是独立的单回合事件。

### 7.5 不同位置的差异化

角色系统不能只提供一个“位置名字”，不同位置必须在规则层真的不同。

建议至少从五个维度做差异化：

1. **画像差异**  
   不同位置看重的核心属性不同。
   - IGL：智力、心态、经验
   - AWPer：敏捷、经验、心态
   - Entry：敏捷、心态、胆量型特质
   - Support：心态、智力、团队型特质
   - Lurker：智力、敏捷、独立判断

2. **职责差异**  
   不同位置要承担的队内职责不同。
   - IGL 更容易触发指挥、战术、资源分配类事件
   - AWPer 更容易触发火力、首杀、武器资源类事件
   - Entry 更容易触发开局换血、首死率、破点类事件
   - Support 更容易触发补位、道具、队友协同类事件
   - Lurker 更容易触发绕后、残局、信息差类事件

3. **成长差异**  
   不同位置的成长曲线不能完全一致。
   - IGL 中后期更依赖经验和心态沉淀
   - AWPer 更依赖敏捷和稳定输出
   - Entry 更依赖高风险高回报的即时表现
   - Support 更依赖队内默契和执行力
   - Lurker 更依赖局势判断和独立决策

4. **比赛差异**  
   比赛里不同位置的收益要有不同权重。
   - 指挥位失误会影响整队节奏
   - 火力位状态会放大或压低队伍上限
   - 功能位表现会影响稳定性和容错
   - 侧翼位表现会影响信息和残局转换

5. **转型差异**  
   换位置不应该对所有角色一视同仁。
   - IGL 转位成本最高，因为涉及体系认知
   - AWPer 转位通常牵涉个人火力和资源优先级
   - Entry 转位更容易，但会影响队伍开局风格
   - Support 转位会影响整个队的执行链
   - Lurker 转位会影响信息差和残局权

也就是说，`preferredRole` 只是入口，真正的差异应当落在属性权重、事件权重、比赛收益和转型成本上。

### 7.6 位置画像表

下面这张表定义“每个位置到底像什么”。

| 位置 | 主要属性 | 次要属性 | 常见特质倾向 | 长期画像 |
|---|---|---|---|---|
| IGL | 智力、心态、经验 | 敏捷 | tactical、steady、support、igl | 判断、组织、控节奏 |
| AWPer | 敏捷、经验、心态 | 智力 | aimer、mechanical、clutch | 高爆发、稳定取枪、资源倾斜 |
| Entry | 敏捷、心态 | 经验 | grinder、clutch、ego / solo（风险型） | 开局破点、换血、承压 |
| Support | 心态、智力 | 经验 | support、selfless、steady | 补位、道具、执行、衔接 |
| Lurker | 智力、敏捷 | 心态 | solo、tactical、clutch | 信息差、侧翼、残局、读图 |

### 7.7 位置职责表

下面这张表定义“每个位置平时应该做什么”。

| 位置 | 队内职责 | 常见冲突 | 常见收益 |
|---|---|---|---|
| IGL | 安排回合、调整默认、分配资源 | 指挥权冲突、队友不服、过度负担 | 队伍节奏稳定、事件解锁多 |
| AWPer | 拿首杀、守关键点位、吃资源 | 资源争夺、强点依赖、状态波动 | 上限高、残局威慑强 |
| Entry | 第一波进点、换血、创造空间 | 首死率高、压力大、低回报 | 打开局面、提升队伍主动权 |
| Support | 补道具、补位、协助火力 | 存在感低、成长慢、职责模糊 | 执行稳定、容错高、队伍粘合 |
| Lurker | 拉扯防线、侧翼信息、残局处理 | 被误解为不合群、节奏脱节 | 信息优势、残局翻盘、拉扯空间 |

### 7.8 事件权重表

不同位置应更容易触发对应事件。

| 位置 | 易种下的 tag | 易触发的事件方向 |
|---|---|---|
| IGL | `caller-discipline`、`shared-calling`、`star-system-ready`、`late-round-clarity` | 指挥权、资源分配、战术边界 |
| AWPer | `star-freedom`、`team-carries-through-you`、`role-confusion` | 火力资源、明星位压力、强点依赖 |
| Entry | `locker-tension`、`role-confusion`、`team-carries-through-you` | 开局换血、首死压力、队伍主动权 |
| Support | `shared-calling`、`caller-discipline`、`late-round-clarity` | 补位协同、执行稳定、队伍粘合 |
| Lurker | `late-round-clarity`、`role-confusion`、`locker-tension` | 信息差、残局权、节奏脱节 |

落地时，这里不建议再引入一套全新的权重系统，而是复用现有 tag / event 机制：

- 位置画像决定“更容易种下哪些 tag”
- tag 决定“哪些事件池被打开”
- 事件结果再反过来强化或削弱位置画像
- `team-positive-voice` 这类现有风险/冷却族不应直接写成角色 tag，应在事件筛选阶段作为事件方向处理

这样可以避免在角色系统之外再建一层独立随机器。

注意：`star-system-ready`、`late-round-clarity` 这类正向成果 tag 不应该由角色画像被动添加，只能由事件成功结果添加。

### 7.9 比赛收益表

比赛表现里，不同位置的收益不应该完全同构。

| 位置 | 主要收益 | 风险 |
|---|---|---|
| IGL | 全队稳定、关键回合决策、节奏控制 | 一旦失误会放大整队波动 |
| AWPer | 爆发上限、强点压制、关键击杀 | 状态差时会拖低队伍上限 |
| Entry | 打开局面、创造主动权、影响首杀 | 波动大、容易高风险低回报 |
| Support | 稳定执行、资源衔接、补位容错 | 容易被系统忽略，需要专门表现方式 |
| Lurker | 信息差、残局、侧翼压制 | 过度独立会造成节奏脱节 |

落地时，比赛收益不应该只体现在最终输赢，而应该至少分成三部分：

- 位置主收益：这个位置本应贡献什么
- 位置副收益：这个位置顺手带来的附加价值
- 位置风险：这个位置状态差时会拖累什么

接入当前比赛模拟时，位置收益必须明确落点，避免和团队协同重复叠加：

- IGL / Support 优先影响 `teamPower` 或稳定性解释，不直接重复增加 `calcSynergyBonus`
- AWPer / Entry 优先影响 `personalPower`、rating 或击杀相关表现
- Lurker 优先影响稳定性、残局叙事或轻量 team/personal 混合修正
- 第一阶段可以只生成赛后解释和小幅修正，暂不改动胜率主公式
- 第一阶段数值修正必须保守：单项 power 修正不超过 ±2，rating 修正不超过 ±0.03

这样才能让“不同位置”在比赛回报里真正不同。

### 7.10 转型成本表

不同位置的转型不应该一样贵。

| 转型类型 | 成本 | 说明 |
|---|---|---|
| IGL → 其他 | 高 | 涉及体系认知和队伍话语权 |
| AWPer → 其他 | 中高 | 涉及火力位资源和枪械习惯 |
| Entry → 其他 | 中 | 更容易换，但会改变队伍开局结构 |
| Support → 其他 | 中 | 牵涉执行链和队友衔接 |
| Lurker → 其他 | 中高 | 牵涉信息流、节奏和残局权 |

转型成本不只是一项数值成本，建议至少同时包含：

- 回合时间成本：需要多少回合才能完成转型
- 事件成本：要经历几次角色相关事件
- 队内摩擦成本：是否会引发 `role-confusion`、`locker-tension`
- 机会成本：转型期间是否压低原本位置收益

这样角色转型才像真实职业路径，而不是简单的职业树分支。

---

## 8. 可实现规则细化

### 8.1 位置画像数据结构

建议新增静态配置，而不是把位置差异散落在事件里。

```ts
interface RoleProfile {
  role: TeammateRole;
  label: string;
  primaryStats: CoreStatKey[];
  secondaryStats: CoreStatKey[];
  preferredTraits: string[];
  riskTraits: string[];
  resultTags: string[];
  eventThemes: RoleEventTheme[];
  matchContributions: {
    primary: string;
    secondary: string;
    risk: string;
  };
  transitionCost: 'medium' | 'medium-high' | 'high';
}

type RoleEventTheme =
  | 'calling'
  | 'space-taking'
  | 'utility'
  | 'late-round'
  | 'opening-duel'
  | 'resource-conflict'
  | 'adaptation';
```

`resultTags` 和 `eventThemes` 必须分开：

- `resultTags` 是事件成功或失败后可以实际写入 `player.tags` 的 tag
- `eventThemes` 是筛选或调权重用的主题描述，不能直接写入 `player.tags`
- `resultTags` 只是候选白名单，不代表画像会自动加 tag；最终写入必须由具体事件结果决定

这里必须使用 `CoreStatKey`，不能使用 `StatKey`。当前 `StatKey` 包含 `money`，经济属性不应参与角色适配评分。

前端也需要同步新增：

```ts
type CoreStatKey = Exclude<StatKey, 'money'>;
```

否则 `frontend/src/lib/roleProfiles.ts` 无法复用同一套画像类型。

配置建议以后端为权威：

```text
backend/src/data/roleProfiles.ts
GET /game/meta/role-profiles
```

前端通过 meta 接口获取。`frontend/src/lib/roleProfiles.ts` 只保留展示 fallback，不作为平衡数据来源。fallback 只能用于接口失败时显示空态或旧数据，不能参与任何角色适配、事件权重或比赛收益计算。

### 8.2 角色适配评分

角色适配评分用于回答“玩家适不适合这个位置”。

建议公式：

```text
roleFitScore =
  primaryStatScore
  + secondaryStatScore
  + traitBonus
  + activeRoleExperienceBonus
  + teamNeedBonus
  - riskPenalty
```

字段含义：

- `primaryStatScore`：主要属性命中程度
- `secondaryStatScore`：次要属性补强
- `traitBonus`：特质是否符合位置画像
- `activeRoleExperienceBonus`：已经打过这个位置多久
- `teamNeedBonus`：当前队伍是否缺这个位置
- `riskPenalty`：负面特质或状态是否影响该位置

这个分数不直接决定输赢，只用于：

- 选择转型目标
- 显示角色适配度
- 调整角色事件 DC
- 调整角色事件触发权重

第一阶段默认分数范围为 0-100。建议初始阈值：

- `roleFitScore >= 60`：可以作为转型候选
- `roleFitScore >= 70`：适合作为结晶候选
- `roleFitScore < 45`：不建议作为目标角色，除非队伍强缺口

建议实现时把各分项先换算到同一量纲，再将总分 clamp 到 `0-100`，避免阈值被越界分数冲掉。

### 8.3 角色压力

建议引入一个派生概念，不必先存字段：

```text
rolePressure =
  roleMismatch
  + lowTeamTrust
  + roleOverlap
  + poorRecentMatch
  + activeTransition
```

第一阶段 `rolePressure` 范围固定为 0-100，所有分项累加后 clamp。

建议初始分项：

- `roleMismatch`: 0 或 20
- `lowTeamTrust`: 0-20
- `roleOverlap`: 0-25
- `poorRecentMatch`: 0 或 15
- `activeTransition`: 0 或 10

建议初始阈值：

- `rolePressure >= 35`：允许角色质疑或换位建议进入事件池
- `rolePressure >= 60`：提高 `role-confusion` 相关事件权重
- `rolePressure <= 30`：允许角色结晶检查

触发意义：

- 高压力时更容易触发 `role-confusion`
- 高压力时更容易出现换位建议
- 高压力时角色事件 DC 上升

不要一开始就把它做成长期资源，先作为事件筛选和调权重的派生值更稳。

### 8.4 角色结晶条件

当前已有 `activeRoleRounds`，建议补充结晶门槛：

```text
canCrystallize =
  activeRole != null
  && activeRoleRounds >= 24
  && roleFitScore(activeRole) >= 70
  && rolePressure <= 30
```

这样可以避免玩家只是被迫补位 24 回合，就直接变成该位置。

如果 `activeRoleRounds >= 24` 但没有满足 `roleFitScore` 或 `rolePressure` 条件，不应静默失败：

- 添加 `role-crystallize-cd: 8`
- 触发 passive effect 或后续低压角色事件，说明“还没真正站稳”
- 保留当前 `activeRole`
- 将 `activeRoleRounds` 回退到 18，避免冷却结束后立刻重复检查

结晶必须要求连续承担同一个 `activeRole`。第一阶段固定采用最低成本方案：

- 不新增 `activeRoleSinceRound`
- 不新增 `activeRoleHistory`
- 任何 `activeRole` 改变时必须把 `activeRoleRounds` 重置为 0
- `activeRole = null` 后再回到同一个角色，也不算连续，必须重新累计

不允许在多个不同位置的累计回合数上结晶。

结晶成功后：

- `preferredRole = activeRole`
- `roleCrystallized = true`
- 移除或降低 `role-confusion`
- 增加对应角色稳定 tag
- 添加 `role-crystallize-cd`，并将 `tagExpiry['role-crystallize-cd'] = currentRound + 24`

结晶失败或未达标后：

- 保留当前 `activeRole`
- 将 `activeRoleRounds` 回退到 18
- 添加 `role-crystallize-cd`，并将 `tagExpiry['role-crystallize-cd'] = currentRound + 8`

`roleCrystallized` 的生命周期规则：

- 开始新的 `roleTransition` 时，必须重置 `roleCrystallized = false`
- 如果 `activeRole` 发生变化且不再等于 `preferredRole`，必须重置 `roleCrystallized = false`
- 第一阶段仍保留布尔值，不改成按角色记录

转型成功时，应同步把 `preferredRole` 和 `activeRole` 一起设为 `roleTransition.targetRole`，并将 `activeRoleRounds` 重置为 0。`roleCrystallized` 不应在转型成功时自动置 `true`，它只在满足 24 回合连续补位且 `roleFitScore` / `rolePressure` 达标时才会变为 `true`。

换句话说：

- `roleTransition` 负责“从旧职责切到新职责”
- `roleCrystallized` 负责“这个职责是否已经长期稳定下来”
- 两者可以连续发生，但不是同一个判定

`chain-role-transition-resolve` 这一层只允许处理职责切换，不允许顺手把 `roleCrystallized` 置为 `true`。否则就会把“转型完成”和“长期结晶”再次合并，破坏 24 回合结晶门槛。

### 8.5 转型阶段

`roleTransition` 建议从单个目标字段扩展为阶段概念。

```ts
interface RoleTransition {
  targetRole: TeammateRole;
  startedRound: number;
  resolveRound: number;
  stage?: 'suggested' | 'trial' | 'contested' | 'settling';
  source?: 'coach' | 'team-need' | 'player-choice' | 'performance';
}
```

存档兼容规则：

- 旧存档缺少 `stage` 时，按 `stage: 'trial'` 处理
- 旧存档缺少 `source` 时，按 `source: 'team-need'` 处理
- 旧存档仍保留原有 `targetRole / startedRound / resolveRound` 结算逻辑

阶段语义：

| 阶段 | 含义 | 常见事件 |
|---|---|---|
| suggested | 教练或队伍提出换位 | 是否接受建议 |
| trial | 开始试打一段时间 | 适应新职责 |
| contested | 队内有人质疑或角色重叠 | 解决冲突 |
| settling | 转型接近完成 | 是否结晶 |

可以先只实现 `targetRole / startedRound / resolveRound`，但文档上应保留阶段字段，方便后续扩展。

### 8.6 触发器

角色系统需要三类触发器：

| 触发器 | 条件 | 结果 |
|---|---|---|
| 主契机 | IGL 离队、教练点名换位、队伍明确缺某个位置 | 直接打开转型轨道 |
| 权重契机 | 教练不满、表现下滑、更衣室冲突、角色重叠 | 提高转型事件抽取权重 |
| 轨道节点 | 长期补位、试打、证明、收束 | 推进长期转型状态 |

这些触发器不一定都要变成独立字段，优先作为 `pickEvent` 的动态 tag、权重或长期状态来源。

近期比赛表现第一阶段不新增字段，直接从最近 `history` 中派生：

- 从 `history` 逆序查找最近 5 条记录
- 取第一条带 `matchStats` 的记录
- 如果 `matchStats.rating < 0.95`，视为 `poorRecentMatch`
- 如果找不到带 `matchStats` 的记录，则不触发表现波动

后续如果需要更细的角色表现，再考虑新增 `recentRolePerformance`。

### 8.7 冷却与互斥规则

角色事件必须有冷却和互斥，避免与合同、赛事上下文、队伍冲突事件互相抢池。

建议规则：

- 同一回合最多触发一个角色事件
- `role-transition-active` 存在时，不再触发新的 `chain-role-transition-start`
- 转型失败或拒绝后添加 `role-transition-cd`
- 结晶成功后添加 `role-crystallize-cd: 24`
- 结晶失败或未达标后添加 `role-crystallize-cd: 8`
- 第一阶段固定规则：`pendingMatch` 或 `session.activeEventSequence?.type === 'tournament-context'` 时，角色事件不触发
- `locker-tension` / `team-conflict` 高优先级事件存在时，角色事件只作为后续链路

---

## 9. 状态与 Tag 关系

### 9.1 入队相关 tag

入队 tag 只作为背景前提保留，不作为本文重点：

- `just-joined-team`
- 可扩展为 `just-promoted-team`
- 可扩展为 `just-transferred-team`

### 9.2 角色相关 tag

建议保留现有方向：

- `role-confusion`
- `caller-discipline`
- `star-freedom`
- `team-carries-through-you`
- `shared-calling`
- `star-system-ready`
- `late-round-clarity`

建议新增：

- `role-crystallize-cd`：角色结晶成功或失败后的冷却 tag，实际冷却时长由 `tagExpiry` 决定，避免短期内重复触发结晶事件

这些 tag 表达的是“队内位置和打法演化”，不是“入队身份”。

### 9.3 清理原则

tag 要可恢复、可移除、可过期：

- 入队 tag 只负责短期 onboarding
- 角色 tag 只负责长期成长
- 队伍离开后，队内 tag 应自动清理
- 队伍离开后，`role-transition-active`、`role-transition-cd`、`role-crystallize-cd`、`role-confusion` 等角色相关 tag 必须一并清理，不能留成孤儿状态

---

## 10. API 与前端语义

### 10.1 角色展示

前端需要支持：

- 当前角色显示
- 当前转型目标显示
- 转型事件进度显示

不要只显示一个“位置”字段，否则角色系统会退化成静态标签。

建议展示：

- 队内身份：`teamStatus`
- 长期角色：`preferredRole`
- 当前职责：`activeRole`
- 转型状态：`roleTransition`
- 适配提示：角色适配度、主要属性缺口、队伍需求

UI 上必须把“队内身份”和“场上职责”分开：

- `teamStatus = rotation` 表示你是轮换，不表示你打 Support
- `activeRole = Support` 表示你当前职责偏 Support，不表示你是替补
- `activeRole = null` 时显示“未固定职责 / 灵活补位”，不要显示为空白
- 两者可以并存，但不能合成一个标签

### 10.2 相关接口

角色系统不应绑定到入队接口上，而应该通过以下路径生效：

- 队内事件
- 角色转型事件
- 比赛表现结算
- 队伍需求变化

新增 meta 接口：

```text
GET /game/meta/role-profiles
```

返回：

```ts
{ roleProfiles: RoleProfile[] }
```

该接口以后端 `backend/src/data/roleProfiles.ts` 为权威来源。

前端接入要求：

- `frontend/src/lib/api.ts` 增加 `getRoleProfiles`
- `frontend/src/lib/types.ts` 同步 `CoreStatKey`、`RoleEventTheme`、`RoleProfile`
- 角色页面只消费 meta 数据，不在前端复制平衡配置
- 接口失败时只允许回退到只读展示，不允许回退到参与计算的本地常量

### 10.3 调试信息

建议 debug 面板展示以下信息：

- 当前角色画像评分
- 每个位置的 `roleFitScore`
- 当前 `rolePressure`
- 角色事件权重来源
- 是否满足结晶条件
- `activeRoleRounds` 当前值，并提示“activeRole 变更时会重置”

角色系统一旦开始参与事件权重，如果没有 debug 信息会很难调。

---

## 11. 推荐落地顺序

### Phase 1

- 角色基础展示
- `preferredRole`、`activeRole`、`roleTransition` 语义整理
- 角色事件链和触发条件明确化
- 新增 `roleProfiles` 静态配置
- 实现 `roleFitScore` 派生函数
- 扩展 `RoleTransition` 类型并保持旧存档兼容
- 测试 `roleFitScore` 不引用 `money`
- 测试 `activeRole` 改变会重置 `activeRoleRounds`
- 测试新 `roleTransition` 会重置 `roleCrystallized`
- 测试转型成功时 `preferredRole` 和 `activeRole` 同步切换，且 `roleCrystallized` 仍保持 `false`
- 测试只有连续 24 回合结晶检查成功才会把 `roleCrystallized` 置为 `true`
- 测试 `activeRole` 后续变化且不再等于 `preferredRole` 时，`roleCrystallized` 会回到 `false`
- 测试 `role-transition-cd` / `role-crystallize-cd` 通过 `tagExpiry` 到期后会自动清理
- 测试离队时角色相关 tag 和对应 `tagExpiry` 会一并清理
- 测试旧 `RoleTransition` 存档兼容
- 测试 `/game/meta/role-profiles` 返回后端画像配置

### Phase 2

- 把角色转型事件和队伍需求联动
- 将队内事件中的位置冲突纳入角色系统
- 让角色转型有明确的资源成本和时间成本
- 实现 `rolePressure` 派生函数
- 用动态 tag 或事件权重接入角色触发器
- 完成前后端 `roleProfiles` meta 接口接入

### Phase 3

- 补足中后期不同角色的事件差异
- 让角色系统进入长期演化和结晶阶段
- 与比赛表现、阵容协同、队友关系形成闭环
- 将比赛收益拆成位置主收益 / 副收益 / 风险

---

## 12. 禁止项

1. 不要只把角色做成展示字段。
2. 不要让入队事件承担角色系统的长期逻辑。
3. 不要让所有位置共用同一套比赛收益。
4. 不要让转型只靠一次事件直接改 `preferredRole`。
5. 不要新增无法 debug 的隐藏权重。

---

## 13. 验收标准

1. `preferredRole`、`activeRole`、`roleTransition` 的职责边界清楚。
2. 角色转型不依赖入队流程。
3. 队内事件能驱动角色变化，但不替代角色系统。
4. 中后期不同角色仍有可见差异，不会在结晶后变成同质化。
5. 每个位置都有可解释的画像、收益、风险和转型成本。
6. debug 面板能解释为什么某个角色事件被触发。
7. 角色适配评分不允许引用 `money`。
8. 角色结晶必须基于连续同一 `activeRole`。
9. 比赛收益接入点必须明确，不与团队协同重复叠加。
10. 角色结晶成功与失败都有明确冷却，且不会连续刷事件。
11. 玩家离队后，角色系统 tag、冷却 tag、转型状态不会残留。
