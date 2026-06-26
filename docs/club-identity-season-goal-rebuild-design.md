# 俱乐部身份、赛季目标与重建系统设计草案
> 文档状态：设计未完成  
> 文档日期：2026-06-25


## 1. 设计目标

当前赛事和世界队伍系统已经具备 `worldClubs`、VRS、俱乐部运行态、报名后分配对手等基础能力。下一步希望让不同俱乐部不只是名字和档位不同，而是拥有可感知的长期身份差异。

本设计目标是：

- 让部分战队拥有历史底蕴，体现老牌豪门、冠军文化、粉丝压力和复兴故事。
- 让部分战队拥有资本财力，体现高薪、买人、短期成绩压力和阵容重建。
- 让玩家在不同类型俱乐部中获得不同体验。
- 在面试或签约时设定赛季目标，并在每个赛季评估目标完成度。
- 如果赛季目标失败，管理层可能围绕某个核心成员进行重建。
- 避免把游戏变成俱乐部经理模拟，玩家仍然是职业选手视角。
- 让所有层级赛事都拥有可信的参赛队伍和对手生态，而不是只在 A 级以上才引入结构化赛事体验。
- 让玩家报名赛事后能看到参赛队伍、抽签分组、对阵路线、关键选手和赛事奖项，进入的是一项完整赛事而不是一场随机比赛。
- 复用现有 BO3 / BO5 赛事回合设计，让玩家在对应阶段实际打完整系列赛；第一版暂不模拟每张地图的细节。
- 新增选手数据库，让核心选手、MVP、战术分析、队伍重建核心和明星引援都有真实对象来源。
- 给玩家新增 `age` 字段，并让年龄长期影响敏捷、体能、智力、心态和经验，而不是只用固定核心属性描述整个生涯。

## 2. 核心概念

### 2.1 俱乐部底色

每个俱乐部新增两个长期属性：

| 字段 | 含义 |
|---|---|
| `heritage` | 历史底蕴，代表冠军传统、粉丝基础、体系传承和名门压力 |
| `capital` | 资本财力，代表薪资预算、引援能力、设施资源和商业曝光 |

这两个值范围建议为 `0-100`。

它们不互斥：

| 类型 | 示例 |
|---|---|
| 高底蕴 + 高资本 | 真正世界豪门 |
| 高底蕴 + 低资本 | 没落豪门、传统强队 |
| 低底蕴 + 高资本 | 新资本项目、新贵 |
| 低底蕴 + 低资本 | 草根队、区域小队 |

### 2.2 俱乐部身份标签

在 `heritage` 和 `capital` 之上，给俱乐部增加 `clubArchetype`，用于快速表达俱乐部性格。

建议第一版保留 6 类：

| 身份 | 含义 |
|---|---|
| `legacy-giant` | 老牌豪门 |
| `capital-project` | 资本项目 |
| `development-factory` | 青训工厂 |
| `regional-pride` | 地区代表 |
| `fallen-legacy` | 没落豪门 |
| `scrappy-underdog` | 草根黑马 |

暂时不单独做 `new-money`，可先并入 `capital-project`。如果后续需要更细，可以再拆分。

### 2.3 选手数据库

俱乐部身份只能说明“这是什么队”，但无法说明“这支队由谁组成”。如果没有选手数据库，核心选手、MVP、战术分析、青训培养、明星空降和管理层重建都会变成随机文案。

因此需要新增一套轻量选手数据库，为每支队伍提供可引用的真实对象。

第一版目标：

- 每支结构化参赛队伍至少拥有 5 名首发选手。
- 每名选手拥有角色、能力、状态、年龄、声望和风格标签。
- 赛事表现、MVP、败方 MVP、最佳新秀、战术分析都从选手数据库中读取。
- 管理层重建时可以选择玩家、队友、明星队友、IGL、新援或青训新人作为重建核心。
- 资本队的明星引援、青训队的新人培养、没落豪门的老将复兴都需要引用具体选手。

选手数据库不等于完整转会市场。第一版只需要能支撑赛事和叙事，不需要模拟所有选手合同、买断、挂牌和自由市场。

映射关系：

- 玩家当前队伍的队友可以继续沿用现有 `player.roster`，第一版不强制完全替换为 `WorldPlayer`。
- 只要是进入赛事中心、MVP、转会和战术分析视图的选手，都必须有对应的 `WorldPlayer` 记录。
- `player.roster` 与 `WorldPlayer` 可以通过稳定的选手 id 或名称映射关联，避免一开始就重构整套玩家队友系统。
- 如果某支队伍已经有完整 `WorldPlayer` 首发，则赛事、情报和转会都优先读 `WorldPlayer`，玩家个人页面仍可继续显示原有队友结构。
- `player.roster` 是玩家当前互动层的队友列表，`WorldPlayer` 是世界赛事与转会系统的权威选手库；两者可映射，但不要求字段完全相同。

### 2.4 年龄系统

玩家和世界选手都应拥有 `age`。年龄不是单纯的装饰字段，它会影响长期成长和竞技状态。

年龄影响方向：

| 年龄阶段 | 敏捷 | 体能 | 智力 | 心态 | 经验 | 设计含义 |
|---|---|---|---|---|---|---|
| 16-18 | 成长倍率高但波动大 | 恢复好 | 战术理解偏低 | 波动大 | 低 | 新人天赋期 |
| 19-23 | 敏捷成长黄金期 | 体能强 | 快速成长 | 逐渐稳定 | 快速积累 | 上升期 |
| 24-27 | 敏捷稳定 | 体能稳定 | 战术成熟 | 心态成熟 | 经验高 | 巅峰期 |
| 28-31 | 敏捷小幅下降 | 体能小幅下降 | 阅读比赛更强 | 心态更稳 | 经验更高 | 老将稳定期 |
| 32+ | 敏捷下降明显 | 体能下降明显 | 智力高但执行受限 | 心态高 | 经验高 | 老将末期 |

核心原则：

- 年龄会适当压低敏捷和体能，尤其是高龄阶段。
- 年龄会适当提高智力、心态和经验，体现老将阅读比赛、抗压和处理关键局的能力。
- 年龄不应该直接硬扣永久属性，而应优先作为派生修正或成长倍率，避免玩家已有核心属性被突然破坏。
- 高龄玩家仍然可以靠经验、心态、角色转型和队伍定位维持竞争力。
- 年轻玩家不应该天然无敌，需要承受心态波动、经验不足和大赛压力。
- 年轻阶段主要给敏捷和体能的成长红利，不直接给稳定表现红利；老将阶段主要给智力、心态和经验红利，但敏捷和体能会限制执行上限。

生效规则：

- 年龄修正只在三类时机计算：角色创建、赛季结算、比赛/训练结算。
- 年龄默认作为派生值参与比赛与成长计算，不直接永久修改 `player.stats`。
- 如果后续需要把年龄结果写回永久属性，必须通过单独的赛季结算规则处理，不能和比赛即时修正混用。
- 年龄修正和伤病、状态、Buff 的修正必须分层，避免同一场比赛重复叠加两次。
- 玩家和世界选手都适用同一套年龄规则，避免不同系统各算各的。

## 3. 不同俱乐部身份的机制差异

### 3.1 老牌豪门：`legacy-giant`

特点：

- 历史底蕴高。
- VRS 起点较高。
- 更容易获得 S 级或 Major 直邀。
- 队伍稳定性较高。
- 输比赛后的压力和舆论更大。

机制影响：

| 系统 | 影响 |
|---|---|
| 面试 | 要求更高，普通新人较难进入 |
| 薪资 | 中高，不一定最高 |
| 赛季目标 | 通常是 S 级深轮、Major 资格、Major 淘汰赛 |
| 失败后果 | 粉丝压力、管理层质询、核心地位动摇 |
| 成功奖励 | 名气提升更高，核心地位更稳定 |

玩家体验：

> 你穿上的是一件有历史重量的队服。赢是应该，输会被质疑。

### 3.2 资本项目：`capital-project`

特点：

- 资本高。
- 薪资高。
- 训练和曝光资源好。
- 管理层耐心低。
- 更容易买人、换人、重建。

机制影响：

| 系统 | 影响 |
|---|---|
| 面试 | 愿意签高潜力或高名气选手 |
| 薪资 | 明显高于同档 |
| 赛季目标 | 激进，常要求快速打进 S 级或 Major |
| 失败后果 | 快速重组、引入明星、玩家进入轮换风险 |
| 成功奖励 | 高薪续约、商业曝光、核心项目地位 |

玩家体验：

> 钱很多，机会很多，但你需要不断证明自己配得上这份合同。

### 3.3 青训工厂：`development-factory`

特点：

- 培养能力强。
- 更愿意给新人机会。
- 薪资普通。
- 队友成长更快。
- 明星选手容易被更大俱乐部挖走。

机制影响：

| 系统 | 影响 |
|---|---|
| 面试 | 新人更容易进入 |
| 薪资 | 中低 |
| 训练 | 训练收益略高 |
| 赛季目标 | 培养新人、打进 A 级、提高 VRS |
| 失败后果 | 惩罚较轻，更多是继续培养 |
| 风险 | 队友或玩家可能收到豪门挖角 |

玩家体验：

> 这里适合成长，但不一定留得住最强的人。

### 3.4 地区代表：`regional-pride`

特点：

- 本地认同强。
- 同地区选手更容易被接纳。
- 队伍信任较高。
- 国际资源一般。
- 在区域赛事中表现更稳定。

机制影响：

| 系统 | 影响 |
|---|---|
| 面试 | 玩家背景地区匹配时更容易进入 |
| 薪资 | 中等 |
| 赛季目标 | 区域赛成绩、A 级突破、进入国际赛事 |
| 失败后果 | 国际赛失败容忍度高，区域赛失败压力大 |
| 成功奖励 | 地区名气和粉丝支持提高 |

玩家体验：

> 你不只是为俱乐部打，也像是在代表一个地区。

### 3.5 没落豪门：`fallen-legacy`

特点：

- 历史底蕴高。
- 当前资本或状态下降。
- VRS 可能不稳定。
- 容易触发复兴故事。
- 管理层可能围绕新核心重建。

机制影响：

| 系统 | 影响 |
|---|---|
| 面试 | 对复兴型选手、潜力选手有兴趣 |
| 薪资 | 中等或偏低 |
| 赛季目标 | 重返 S 级、恢复 VRS、进入 Major 路径 |
| 失败后果 | 复兴计划受挫，老将离队，核心更换 |
| 成功奖励 | 名气提升大，玩家可能成为复兴核心 |

玩家体验：

> 这支队伍曾经很强，现在需要有人把它带回去。

### 3.6 草根黑马：`scrappy-underdog`

特点：

- 资本低。
- 底蕴低或中低。
- 压力较小。
- 爆冷收益高。
- 队伍资源有限。

机制影响：

| 系统 | 影响 |
|---|---|
| 面试 | 门槛低，愿意给机会 |
| 薪资 | 低 |
| 训练 | 资源有限，收益一般 |
| 赛季目标 | 保级、进入 B/A 级赛事、打出曝光 |
| 失败后果 | 惩罚较轻，但可能资金紧张 |
| 成功奖励 | 爆冷名气高，可能吸引赞助或挖角 |

玩家体验：

> 没人看好你们，所以每赢一场都像是在改写故事。

## 4. 赛事对手池与赛事结构展示

### 4.1 设计目的

赛事对手池的主要目的不是简单生成一个下一场对手，而是让玩家参加赛事时进入一个真实存在的职业赛事环境。

玩家报名赛事后，赛事应生成或读取一组完整参赛队伍。这些队伍来自不同层级的俱乐部池，并且每支队伍都应具备可展示、可影响比赛体验的身份信息：

- 俱乐部身份：老牌豪门、资本项目、青训工厂、地区代表、没落豪门、草根黑马。
- 阵容信息：首发五人、核心选手、角色分布、队内化学反应。
- 选手信息：年龄、角色、状态、声望、风格标签和近期赛事表现。
- 战术偏好：火力型、战术型、青训培养型、混乱激进型、平衡型。
- 当前状态：VRS、近期战绩、状态、队伍稳定性、内部默契。
- 赛事叙事：黑马、复兴、资本压力、豪门包袱、地区代表等。

玩家看到的不应该是“你报名了，下一周打一场比赛”，而应该是：

> 这是一项真实赛事，有参赛名单、有抽签、有小组、有晋级路线、有明星选手、有 MVP、有胜负故事。

### 4.2 分层引入规则

结构化赛事体验应覆盖 C/B/A/S/Major 全部层级，只是展示复杂度和对手池强度不同。

| 赛事层级 | 对手池来源 | 展示复杂度 | 设计目的 |
|---|---|---|---|
| C 级 | 本地、青训、草根队伍 | 小型参赛名单、简化淘汰线 | 让新人阶段也有真实杯赛感 |
| B 级 | 青训、半职业、区域队伍 | 参赛名单、主要分组、四强/决赛 | 体现区域赛事和半职业生态 |
| A 级 | 半职业强队、职业队、部分 `worldClubs` | 完整参赛队伍、抽签、小组或淘汰赛路线 | 让玩家首次接触职业生态 |
| S 级 | 必须从 VRS / 世界排名池抽取 | 完整分组、淘汰赛、重点选手和媒体叙事 | 体现顶级赛事强队密度 |
| Major | 32 队世界级结构 | 完整阶段、晋级路线、MVP、赛事历史记录 | 贴近现实 Major 规模和分层进入 |

关键规则：

- C/B 级也要生成结构化参赛队伍，只是队伍来源更低级、更区域化。
- A 级开始明显引入 `worldClubs` 职业队伍。
- S 级和 Major 必须优先从 VRS / 世界排名池抽对手。
- Major 目标参赛规模按 32 队设计。
- 低级赛事不应频繁出现世界强队，除非是特殊剧情、表演赛或降维参赛故事。
- 玩家进入 A/S/Major 后，应明显感觉对手来自完整世界职业生态。

### 4.3 赛事生成流程

玩家报名赛事后，系统不应只生成 `pendingMatch.opponent`，而应生成一个 `TournamentInstance`。

流程：

1. 报名成功后创建赛事实例。
2. 根据赛事层级从对应俱乐部池选出参赛队伍。
3. 报名窗口结束后锁定参赛名单。
4. 触发抽签或分组事件。
5. 生成小组赛、瑞士轮或淘汰赛阶段。
6. 根据玩家比赛和非玩家抽象模拟结果推进八强、四强、决赛。
7. 玩家比赛结果写入赛事路线图。
8. 赛事结束后评选冠军、胜方 MVP、败方 MVP 和赛事最佳选手。
9. 赛事结果回写 VRS、俱乐部状态、社媒和历史记录。

### 4.4 玩家比赛系列赛规则

玩家不是每次只实际打一场关键比赛。玩家应按赛事阶段定义实际打完整系列赛。

现有赛事系统已经有 BO3 / BO5 的赛事回合设计，这部分应复用，而不是新增一套单场关键战逻辑。

第一版规则：

- 如果阶段是 BO1，玩家打一场。
- 如果阶段是 BO3，玩家打一个 BO3 系列赛。
- 如果阶段是 BO5，玩家打一个 BO5 系列赛。
- 第一版暂不模拟每张地图的具体经济、选图和逐图细节。
- 系列赛可以继续沿用现有阶段、回合、胜负和奖励结算模型。
- 非玩家比赛可以抽象模拟，但必须产出比分、胜者、关键选手和可展示结果。

### 4.5 前端 UI 需求

赛事报名后，前端需要新增一个赛事中心或赛事详情视图。

该视图至少包含：

| UI 模块 | 内容 |
|---|---|
| 参赛队伍 | 展示本赛事所有参赛队，包含 VRS、地区、身份标签、状态 |
| 抽签分组事件 | 报名窗口结束后展示抽签结果或分组结果 |
| 小组赛 / 瑞士轮 | 展示各组队伍、胜负记录、晋级状态 |
| 淘汰赛路线图 | 展示八强、四强、决赛、冠军路线 |
| 玩家路径 | 高亮玩家所在队伍的下一场对手和晋级路径 |
| 对手情报 | 展示下一场对手的阵容、核心选手、战术偏好、近期状态 |
| 赛事明星 | 展示赛事表现最优秀选手、胜方 MVP、败方 MVP |
| 赛事总结 | 展示冠军、亚军、黑马、失望队伍、关键比赛 |

### 4.6 对手情报 UI

玩家在比赛前应该能看到下一场对手的详细信息，但不应该默认知道所有战术细节。

对手情报应分为“公开信息”和“战术分析信息”。公开信息可以直接展示，战术分析信息需要通过录像研究、数据分析、媒体报道、队伍会议或赛前准备事件解锁。

基础公开信息：

| 信息 | 示例 | 可见条件 |
|---|---|---|
| 俱乐部身份 | 资本项目 / 老牌豪门 | 默认可见 |
| VRS 排名 | 当前赛事队伍中第 4 | 默认可见 |
| 地区 | 欧洲 / 中国 / 北美 | 默认可见 |
| 赛事种子 | 第 3 种子 / MRQ 晋级队 | 抽签后可见 |
| 近期战绩摘要 | 最近 3 场 2 胜 1 负 | 有公开赛事记录时可见 |

战术分析信息：

| 信息 | 示例 | 解锁来源 |
|---|---|---|
| 战术偏好 | 火力压制 / 慢速控图 / 双核体系 | 录像研究、数据分析、教练报告 |
| 核心选手 | Star AWPer、Entry 核心、IGL | 媒体报道、赛前侦察、历史表现统计 |
| 队伍状态 | 状态火热 / 阵容不稳 / 默契较差 | 近期比赛样本、社媒线索、队伍新闻 |
| 地图倾向 | 偏好 Mirage / 回避 Nuke | 地图池研究、过往 BO3 数据 |
| 风险提示 | 对方近期手感很热，但队内稳定性偏低 | 综合分析事件产出 |

情报可信度建议分为三档：

| 可信度 | 含义 | UI 表达 |
|---|---|---|
| `public` | 公开事实 | 正常显示 |
| `estimated` | 根据有限样本推断 | 显示“推测”或“分析认为” |
| `scouted` | 通过准备事件确认 | 显示为明确情报 |

这样玩家默认只能看到对手是谁、排名如何、是什么俱乐部身份；想知道对方怎么打、谁是核心、哪里有破绽，就需要投入赛前准备或触发战术分析事件。

### 4.7 赛事路线图 UI

不同层级赛事展示深度不同，但都应具备可理解的参赛结构。

C/B 级至少展示：

- 参赛队伍。
- 当前阶段。
- 半决赛或决赛路线。
- 玩家队伍高亮。

A/S 级至少展示：

- 小组赛或瑞士轮。
- 八强。
- 四强。
- 决赛。
- 冠军。
- 玩家队伍高亮。
- 已结束比赛比分。
- 未开赛比赛待定状态。

Major 进一步展示：

- Stage 1。
- Stage 2。
- Stage 3。
- Champions Stage。
- 32 队完整进入路径。
- 高 VRS 队伍从后续阶段进入。

### 4.8 MVP 与赛事最佳选手

赛事结束后应评选多个荣誉：

| 奖项 | 说明 |
|---|---|
| 赛事 MVP | 通常从冠军队伍中选出，综合 rating、击杀、关键局表现 |
| 败方 MVP | 主要从亚军队伍中选出，体现虽败犹荣 |
| 最佳新秀 | 可选，适合 C/B/A 级或青训赛事 |
| 最佳突破手 | 可选，按 Entry 或击杀表现 |
| 最佳指挥 | 可选，偏 IGL 和团队表现 |
| 黑马队伍 | 非高种子但打进深轮 |
| 失望队伍 | 高 VRS 但早早出局 |

第一版至少实现：

- 冠军。
- 亚军。
- 胜方 MVP。
- 败方 MVP。
- 玩家队伍最终名次。
- 赛事最佳表现列表。

### 4.9 实现边界

第一版不要完整模拟所有地图细节，也不要一次性做完整 HLTV 级赛事数据库。

第一版需要做到：

- C/B/A/S/Major 都生成结构化参赛队伍。
- 每支参赛队伍都应引用选手数据库，至少拥有可展示的首发五人。
- 报名窗口结束后生成抽签或分组。
- 展示完整路线图，展示深度随赛事层级提升。
- 玩家实际比赛复用现有 BO1 / BO3 / BO5 阶段回合设计。
- 非玩家比赛用抽象模拟推进，但要产出可展示比分和关键表现。
- 决赛后生成冠军、亚军、胜方 MVP、败方 MVP。
- 赛事结果写回 `worldClubs` 的 VRS、状态和近期结果。

## 5. 赛季目标系统

### 5.1 目标生成时机

赛季目标在以下时机生成：

- 玩家通过面试加入新队时。
- 新赛季开始时。
- 俱乐部经历重建后。
- 玩家从轮换或替补重新成为核心时。

### 5.2 目标类型

建议第一版支持以下目标：

| 目标 ID | 名称 | 适合俱乐部 |
|---|---|---|
| `survive-tier` | 保住当前级别 | 草根队、升班马 |
| `reach-a-main` | 打进 A 级主赛 | 青训、半职业、区域队 |
| `reach-s-event` | 打进 S 级赛事 | 职业队、新贵 |
| `major-qualification` | 获得 Major 席位 | 豪门、资本项目 |
| `major-playoffs` | Major 深轮 | 老牌豪门、世界强队 |
| `develop-rookie` | 培养新人 | 青训工厂 |
| `rebuild-core` | 完成重建 | 没落豪门、资本项目 |

### 5.3 目标难度

目标难度由以下因素决定：

- 俱乐部档位：`youth`、`semi-pro`、`pro`、`top`。
- `heritage`。
- `capital`。
- 当前 VRS。
- 玩家名气和角色。
- 上赛季成绩。
- 俱乐部身份标签。

例如：

| 俱乐部 | 可能目标 |
|---|---|
| 高资本新贵 | 一个赛季内打进 S 级或 Major |
| 老牌豪门 | Major 淘汰赛或 S 级夺冠 |
| 青训工厂 | 培养新人并打进 A 级 |
| 没落豪门 | VRS 回升并重返 S 级 |
| 草根队 | 保级或打进 B/A 级赛事 |

## 6. 赛季目标追踪

### 6.1 追踪指标

目标完成度可读取现有系统数据：

| 指标 | 来源 |
|---|---|
| VRS | `worldClubs.runtimeByClubId[clubId].vrsScore` |
| 赛事成绩 | `pendingMatch`、赛事结算、`recentResults` |
| 玩家表现 | 比赛 rating、击杀、死亡、胜负 |
| 队伍稳定 | `rosterStability` |
| 队内关系 | `teamTrust` 或 `clubTrust` |
| 队伍状态 | `currentForm` |
| 资格门票 | `qualificationSlots` 或 `teamQualificationSlots` |

### 6.2 赛季中反馈

赛季中不需要每周弹窗，但可以在关键节点提示：

- 报名关键赛事前。
- 目标相关赛事失败后。
- VRS 达到或跌破关键线时。
- 赛季剩余机会很少时。
- 管理层耐心下降时。

示例文案：

> 管理层提醒：本赛季目标是打进 S 级赛事。当前 VRS 仍低于邀请线，下一场 A 级赛事会非常关键。

## 7. 赛季末评估

### 7.1 评估结果

赛季末目标结算分为四档：

| 结果 | 含义 |
|---|---|
| `exceeded` | 超额完成 |
| `completed` | 达成目标 |
| `partial` | 部分达成 |
| `failed` | 未达成 |

### 7.2 结果影响

| 结果 | 影响 |
|---|---|
| `exceeded` | 名气、信任、薪资、核心地位提升 |
| `completed` | 稳定续约，管理层满意 |
| `partial` | 轻微压力，下赛季目标调整 |
| `failed` | 增加重建压力，可能触发管理层动作 |

不同俱乐部身份的容忍度不同：

| 身份 | 失败容忍度 |
|---|---|
| `legacy-giant` | 低 |
| `capital-project` | 很低 |
| `development-factory` | 高 |
| `regional-pride` | 中等，区域目标失败时较低 |
| `fallen-legacy` | 中低 |
| `scrappy-underdog` | 高 |

## 8. 管理层重建系统

### 8.1 触发条件

重建不应随机发生，而应满足多个条件：

- 赛季目标失败。
- 队伍 VRS 下滑。
- 连续赛事失利。
- `rosterStability` 低。
- `clubTrust` 低。
- 高资本俱乐部短期目标失败。
- 没落豪门复兴失败。
- 玩家或队友之间出现明显核心差距。

### 8.2 重建压力

新增或派生一个概念：`rebuildPressure`。

建议范围 `0-100`。

| 压力值 | 状态 |
|---|---|
| 0-29 | 稳定 |
| 30-59 | 管理层观察 |
| 60-79 | 准备调整 |
| 80-100 | 进入重建 |

重建压力来源：

| 来源 | 增加 |
|---|---|
| 赛季目标失败 | 大幅增加 |
| 连续赛事失利 | 中幅增加 |
| 玩家表现低迷 | 中幅增加 |
| 队伍信任下降 | 中幅增加 |
| 资本项目失败 | 额外增加 |
| 老牌豪门 Major 失败 | 额外增加 |

### 8.3 重建核心选择

进入重建后，管理层会选择一个核心方向。

| 核心方向 | 条件 |
|---|---|
| 以玩家为核心 | 玩家表现好、名气高、队伍信任高 |
| 以明星队友为核心 | 队友表现更好，玩家低迷 |
| 以 IGL/体系为核心 | 战术型、老牌、青训队更常见 |
| 以新援为核心 | 资本项目更常见 |
| 全面重建 | 多项指标崩盘 |

### 8.4 玩家相关结果

重建后，玩家可能进入以下状态：

| 状态 | 含义 |
|---|---|
| `player-core` | 围绕玩家重建 |
| `contested` | 玩家核心地位被挑战 |
| `rotation-risk` | 玩家有轮换风险 |
| `transfer-listed` | 玩家被挂牌或允许转会 |
| `benched` | 玩家被替补，但不是生涯结束 |

重要原则：

- 不应该无预警把玩家踢掉。
- 不应该因为一场比赛直接让玩家失去位置。
- 至少需要 2-3 个事件节点让玩家反应。
- 玩家表现好时，重建可以是奖励：队伍围绕玩家升级阵容。

## 9. 资本队中的玩家风险

资本项目队伍中，玩家可能遭遇位置威胁，但应该是渐进式事件链。

### 9.1 事件链

#### 阶段 1：管理层施压

触发：

- 连续失利。
- 目标进度落后。
- 玩家 rating 偏低。

效果：

- 压力上升。
- `teamTrust` 或 `clubTrust` 下降。
- 出现管理层警告文案。

#### 阶段 2：明星选手传闻

触发：

- 管理层施压后继续低迷。
- 资本高。
- 队伍仍有高目标。

效果：

- 社媒出现引援传闻。
- 玩家获得位置竞争提示。
- 下一场关键比赛权重提高。

#### 阶段 3：内部竞争

触发：

- 传闻后仍未恢复。
- 玩家角色和潜在新援重叠。

效果：

- 玩家进入 `contested` 或 `rotation-risk`。
- 部分赛事可能需要证明自己。
- 训练或沟通事件变得关键。

#### 阶段 4：重建决定

可能结果：

| 玩家表现 | 结果 |
|---|---|
| 表现优秀 | 稳住首发，甚至成为重建核心 |
| 表现一般 | 进入轮换或角色调整 |
| 表现较差 | 被挂牌、被替补或转会压力增加 |

## 10. 世界选手转会模拟

世界级队伍模拟不应只模拟队伍分数和赛事结果，也应该模拟选手流动。转会系统是俱乐部身份、选手数据库、年龄系统、赛季目标和重建系统的交汇点。

### 10.1 设计目的

世界选手转会模拟的目标是：

- 让非玩家世界队伍因为成绩、资本、底蕴、年龄、角色冲突和目标失败发生真实阵容变化。
- 让资本队能高价买明星，青训队能培养并卖出新人，没落豪门能寻找复兴核心。
- 让玩家所在队伍也受到世界转会生态影响，例如队友被挖、引入新援、玩家被豪门关注。
- 让转会结果改变赛事对手情报、队伍强度、社媒叙事和后续赛事生态。

### 10.2 俱乐部身份与转会倾向

不同俱乐部身份应有不同转会行为：

| 俱乐部身份 | 转会倾向 |
|---|---|
| `capital-project` | 高价买明星、快速换人、失败后大洗牌 |
| `legacy-giant` | 更偏买成熟强者或冠军拼图，重视历史地位和抗压能力 |
| `development-factory` | 培养新人、提拔青训、卖出明星 |
| `regional-pride` | 更偏本地区选手，国际引援少但凝聚力高 |
| `fallen-legacy` | 寻找复兴核心，可能签老将或潜力新星 |
| `scrappy-underdog` | 很少高价买人，更容易被挖角，靠低成本新人补位 |

### 10.3 触发来源

转会模拟主要在赛季窗口发生，也可以由重大事件提前触发。

触发条件：

- 赛季目标失败。
- 重大赛事早早出局。
- S 级或 Major 深轮后明星选手身价上涨。
- 资本队连续低迷。
- 青训队培养出高声望新人。
- 老将年龄上升，敏捷和体能下降。
- 队内角色重叠，例如两个明星 Entry 或两个核心 AWPer。
- 队伍缺少关键角色，例如没有 IGL、AWPer 或稳定 Support。
- 玩家所在队伍表现出明显短板，管理层需要围绕某个核心补强。

### 10.4 转会意图评分

每支队伍在转会窗口计算转会需求。

需求来源：

- 缺少角色：IGL / AWPer / Entry / Support / Lurker。
- 缺少核心：没有高声望明星或关键先生。
- 阵容老化：平均年龄偏高，敏捷和体能下滑。
- 目标失败：`rebuildPressure` 高。
- 资本充足：更愿意追逐成名选手。
- 底蕴高：更倾向选择抗压、经验和荣誉匹配的选手。
- 青训身份：更愿意提拔 `prospect`。

### 10.5 选手离队意愿

每名选手也应有离队倾向。

离队意愿来源：

- 当前队伍赛季目标失败。
- 自己表现好但队伍成绩差。
- 被豪门或资本队关注。
- 年龄上升，需要最后一份大合同或争冠机会。
- 年轻新秀想要更高舞台。
- 角色被挤压，或从首发变成替补。
- 队伍重建方向不围绕自己。

### 10.6 转会类型

| 类型 | 含义 |
|---|---|
| `star-signing` | 资本队或豪门签明星 |
| `prospect-promotion` | 青训提拔新人 |
| `veteran-pickup` | 没落豪门或区域队签老将 |
| `role-fix` | 补缺 IGL / AWPer / Support 等关键角色 |
| `benching` | 表现差或角色冲突导致替补 |
| `poach` | 强队挖走小队核心 |
| `rebuild-swap` | 重建时多位置调整 |

### 10.7 与玩家的关系

世界转会不能只发生在背景里，也应该影响玩家体验。

玩家相关影响：

- 玩家队友可能被豪门或资本队挖走。
- 玩家可能被资本队、老牌豪门或没落豪门关注。
- 玩家所在队伍可能引入新援，造成位置竞争。
- 如果玩家表现强，管理层可能围绕玩家买人。
- 如果玩家表现差，队伍可能买同位置选手制造压力。
- 玩家在青训工厂成长过快时，可能触发豪门挖角或续约压力事件。

### 10.8 第一版边界

第一版不要做完整转会市场，也不要做复杂经济系统。

第一版只需要：

- 每赛季运行一次抽象转会窗口。
- 只处理活跃世界队伍、玩家当前队伍、玩家主要对手和高 VRS 队伍。
- 每个窗口只产出少量关键转会和传闻。
- 转会结果更新 `WorldPlayer.clubId`、`ClubRuntimeState.playerIds`、队伍运行态、社媒和历史记录。
- 玩家相关转会必须通过事件链铺垫，不能无预警剥夺玩家核心体验。
- 如果没有现成替补或自由球员可用，允许生成一次性 `prospect` 或 `bench` 选手，但生成结果仍要落入 `WorldPlayer` 数据库，不能留空位。

## 11. 数据结构建议

### 11.1 `Club` 静态数据

扩展 `Club`：

```ts
export type ClubArchetype =
  | 'legacy-giant'
  | 'capital-project'
  | 'development-factory'
  | 'regional-pride'
  | 'fallen-legacy'
  | 'scrappy-underdog';

export interface Club {
  id: string;
  name: string;
  tag: string;
  region: string;
  tier: ClubTier;
  requiredStage: Stage;
  requiredFame?: number;
  baseSalary: number;
  salaryRange: [number, number];
  originPreference?: ClubOriginPreference;
  preferredOriginRegions?: string[];
  isRival?: boolean;
  rivalIndex?: number;

  heritage?: number;
  capital?: number;
  clubArchetype?: ClubArchetype;
}
```

### 11.2 赛季目标

新增：

```ts
export type ClubSeasonGoalStatus =
  | 'active'
  | 'exceeded'
  | 'completed'
  | 'partial'
  | 'failed';

export type ClubSeasonGoalType =
  | 'survive-tier'
  | 'reach-a-main'
  | 'reach-s-event'
  | 'major-qualification'
  | 'major-playoffs'
  | 'develop-rookie'
  | 'rebuild-core';

export interface ClubSeasonGoal {
  id: string;
  type: ClubSeasonGoalType;
  label: string;
  season: number;
  targetTier?: TournamentTier;
  targetStageIndex?: number;
  minVrsScore?: number;
  minPlayerRating?: number;
  status: ClubSeasonGoalStatus;
  progress: number;
}
```

### 11.3 玩家队伍状态

扩展玩家当前队伍：

```ts
export type ClubCoreStatus =
  | 'player-core'
  | 'teammate-core'
  | 'contested'
  | 'rotation-risk'
  | 'transfer-listed'
  | 'benched';

export interface PlayerTeam {
  clubId: string;
  name: string;
  tag: string;
  region: string;
  tier: ClubTier;
  monthlySalary: number;
  joinedRound: number;

  seasonGoal?: ClubSeasonGoal;
  managementPatience?: number;
  rebuildPressure?: number;
  coreStatus?: ClubCoreStatus;
}
```

### 11.4 世界队伍运行态

世界队伍也可以保留抽象字段，但第一版建议只完整应用于玩家当前队伍。

```ts
export interface ClubRuntimeState {
  clubId: string;
  tier: ClubTier;

  playerIds?: string[];
  seasonGoal?: ClubSeasonGoal;
  rebuildPressure?: number;
  rebuildCorePlayerId?: string;
}
```

### 11.5 选手数据库

新增 `WorldPlayer`，用于承载非玩家选手和玩家队友在世界赛事中的可引用身份。

```ts
export type PlayerArchetype =
  | 'superstar'
  | 'star-awper'
  | 'entry-fragger'
  | 'system-igl'
  | 'veteran-anchor'
  | 'rookie-prospect'
  | 'clutch-specialist'
  | 'role-player'
  | 'volatile-talent';

export interface PlayerSkillProfile {
  mechanics: number;
  awareness: number;
  mentality: number;
  experience: number;
  teamplay: number;
  explosiveness: number;
}

export interface WorldPlayer {
  id: string;
  name: string;
  region: string;
  age: number;
  clubId: string;
  role: TeammateRole;
  status: 'starter' | 'bench' | 'prospect' | 'free-agent';
  archetype: PlayerArchetype;
  stats: PlayerSkillProfile;
  form: number;
  reputation: number;
  traits: string[];
}
```

赛事表现记录：

```ts
export interface TournamentPlayerPerformance {
  playerId: string;
  clubId: string;
  tournamentInstanceId: string;
  rating: number;
  kills: number;
  deaths: number;
  assists: number;
  impact: number;
  clutchScore?: number;
}
```

### 11.6 转会记录与传闻

新增转会相关类型：

```ts
export type TransferType =
  | 'star-signing'
  | 'prospect-promotion'
  | 'veteran-pickup'
  | 'role-fix'
  | 'benching'
  | 'poach'
  | 'rebuild-swap';

export interface TransferRumor {
  id: string;
  season: number;
  playerId: string;
  fromClubId: string;
  toClubId: string;
  type: TransferType;
  credibility: 'low' | 'medium' | 'high';
  reason: string;
  resolved?: boolean;
}

export interface TransferRecord {
  id: string;
  season: number;
  playerId: string;
  fromClubId: string;
  toClubId: string;
  type: TransferType;
  summary: string;
}
```

转会结果必须更新：

- `WorldPlayer.clubId`。
- 原俱乐部和新俱乐部的 `ClubRuntimeState.playerIds`。
- 转会历史记录。
- 社媒或新闻动态。
- 对手情报和赛事阵容展示。

### 11.7 玩家年龄

扩展玩家数据：

```ts
export interface Player extends DynamicState {
  name: string;
  age: number;
  stats: Stats;
}
```

年龄不建议直接写死为核心属性扣减，而应通过派生修正或成长倍率影响竞技表现。

```ts
export interface AgeStatModifier {
  agilityDelta: number;
  constitutionDelta: number;
  intelligenceDelta: number;
  mentalityDelta: number;
  experienceDelta: number;
  agilityGrowthMultiplier: number;
  constitutionGrowthMultiplier: number;
  intelligenceGrowthMultiplier: number;
  mentalityGrowthMultiplier: number;
  experienceGrowthMultiplier: number;
}
```

第一版建议：

- 新建角色时写入初始年龄。
- 每个赛季开始时 `age + 1`。
- 年龄影响比赛和成长时作为派生修正，不直接永久扣除 `player.stats`。
- 年轻阶段敏捷和体能成长更快，但智力、心态和经验修正偏低或波动更大。
- 高龄阶段敏捷和体能成长变慢，并在比赛派生值上轻微下降。
- 高龄阶段智力、心态和经验成长更稳定，并在比赛派生值上轻微提高。

### 11.8 赛事实例

新增 `TournamentInstance`，用于承载某一次赛事的参赛名单、分组、对阵、玩家路径和奖项结果。

```ts
export type TournamentInstanceStatus =
  | 'registered'
  | 'locked'
  | 'drawn'
  | 'in-progress'
  | 'completed';

export interface TournamentInstance {
  id: string;
  tournamentId: string;
  season: number;
  status: TournamentInstanceStatus;
  teams: TournamentTeamEntry[];
  stages: TournamentInstanceStage[];
  playerTeamClubId?: string;
  awards?: TournamentAwards;
}
```

参赛队伍：

```ts
export interface TournamentTeamEntry {
  clubId: string;
  seed: number;
  source: 'player' | 'vrs' | 'qualifier' | 'invite' | 'wildcard' | 'local' | 'regional';
  groupId?: string;
  eliminated?: boolean;
  finalPlacement?: number;
}
```

阶段和对阵：

```ts
export interface TournamentInstanceStage {
  id: string;
  name: string;
  type: 'group' | 'swiss' | 'play-in' | 'quarterfinal' | 'semifinal' | 'final';
  seriesType?: 'bo1' | 'bo3' | 'bo5';
  matches: TournamentInstanceMatch[];
}

export interface TournamentInstanceMatch {
  id: string;
  teamAClubId: string;
  teamBClubId: string;
  winnerClubId?: string;
  score?: string;
  seriesType: 'bo1' | 'bo3' | 'bo5';
  playerMatch?: boolean;
  completed: boolean;
  standoutPlayerIds?: string[];
}
```

奖项：

```ts
export interface TournamentAwards {
  championClubId: string;
  runnerUpClubId: string;
  winnerMvp: TournamentPlayerAward;
  loserMvp: TournamentPlayerAward;
  bestPlayers: TournamentPlayerAward[];
}

export interface TournamentPlayerAward {
  clubId: string;
  playerId: string;
  playerName: string;
  award: string;
  rating: number;
}
```

## 12. 现有系统接入点

### 12.1 俱乐部数据

位置：

`backend/src/data/clubs.ts`

改动：

- 给现有俱乐部补 `heritage`、`capital`、`clubArchetype`。
- 新增世界队伍时按身份分布补齐。
- `top` 队伍中应保留足够的老牌豪门和资本队。

### 12.2 类型定义

位置：

`backend/src/types.ts`

改动：

- 新增 `ClubArchetype`。
- 扩展 `Club`。
- 新增 `ClubSeasonGoal`。
- 新增 `WorldPlayer`、`PlayerSkillProfile`、`TournamentPlayerPerformance`。
- 新增 `TransferRumor`、`TransferRecord`、`TransferType`。
- 给 `Player` 新增 `age`。
- 新增年龄派生修正类型或函数，用于影响敏捷、体能、智力、心态和经验。
- 新增 `TournamentInstance`、`TournamentTeamEntry`、`TournamentInstanceStage`、`TournamentInstanceMatch`、`TournamentAwards`。
- 扩展 `PlayerTeam`。
- 可选扩展 `ClubRuntimeState`。

### 12.3 选手数据库与年龄系统

位置：

新增选手数据库模块、玩家初始化、赛季推进和比赛派生属性计算逻辑。

改动：

- 为每支结构化俱乐部生成或加载 5 名首发 `WorldPlayer`。
- 将 `ClubRuntimeState.playerIds` 关联到选手数据库。
- 赛事表现、MVP、败方 MVP、最佳新秀和战术分析读取 `WorldPlayer`。
- 玩家创建时写入 `age`。
- 新赛季开始时玩家 `age + 1`。
- 年龄对敏捷、体能、智力、心态、经验使用派生修正或成长倍率，不直接无预警修改永久核心属性。
- 年轻选手更容易获得敏捷和体能成长，但心态与经验不足。
- 老将敏捷和体能下降或成长变慢，但心态与经验更稳定。

### 12.4 世界队伍初始化

位置：

`backend/src/engine/worldClubs.ts`

改动：

- `createClubRuntimeState` 根据 `heritage`、`capital`、`clubArchetype` 调整初始运行态。
- `createClubRuntimeState` 或相邻模块为俱乐部生成 `WorldPlayer` 首发名单，并写入 `playerIds`。
- 高底蕴增加 `clubTrust` 和少量 `baselineVrsScore`。
- 高资本增加薪资感、VRS 上限感和重建倾向。
- 资本队可略降 `rosterStability`，体现频繁调整。
- 青训队提高 `internalChemistry` 或成长相关倾向。

### 12.5 世界选手转会模拟

位置：

世界队伍赛季 rollover、赛季末结算、队伍重建和社媒动态逻辑。

改动：

- 每赛季运行一次抽象转会窗口。
- 根据俱乐部身份、资本、底蕴、赛季目标、年龄结构、角色缺口和重建压力计算转会需求。
- 根据选手年龄、表现、声望、角色状态和队伍成绩计算离队意愿。
- 生成少量高价值转会传闻和转会结果。
- 转会结果更新 `WorldPlayer.clubId`、`ClubRuntimeState.playerIds`、转会记录、社媒和对手情报。
- 玩家相关转会通过事件链处理，不能无预警发生强制后果。

### 12.6 赛事实例生成

位置：

赛事报名、报名窗口结束、赛事推进和结果结算逻辑。

改动：

- 报名赛事后创建 `TournamentInstance`。
- C/B/A/S/Major 都根据层级生成参赛队伍，只是来源和展示复杂度不同。
- 报名窗口结束后锁定参赛名单，并触发抽签或分组事件。
- 赛事阶段复用现有 BO1 / BO3 / BO5 回合设计。
- 非玩家比赛通过抽象模拟生成比分、胜者、关键选手和选手表现。
- 赛事结束后基于 `TournamentPlayerPerformance` 生成冠军、亚军、胜方 MVP、败方 MVP 和赛事最佳表现列表。
- 赛事结果回写 `worldClubs`、VRS、近期结果、社媒和历史记录。

### 12.7 面试和签约

位置：

当前俱乐部申请、offer 和 team 相关逻辑。

改动：

- 面试时生成 `seasonGoal`。
- 根据俱乐部身份调整面试门槛。
- 签约面板展示俱乐部身份和赛季目标。
- 玩家接受 offer 后把目标写入 `player.team.seasonGoal`。

### 12.8 赛季末结算

位置：

世界俱乐部赛季 rollover 或玩家年份/赛季切换逻辑。

改动：

- 评估 `seasonGoal`。
- 新赛季推进时更新玩家和世界选手年龄。
- 运行世界选手转会窗口。
- 更新 `managementPatience`。
- 更新 `rebuildPressure`。
- 触发重建事件或生成下赛季目标。

### 12.9 事件系统

位置：

`backend/src/engine/events.ts` 或后续事件链配置。

新增事件类型：

- 管理层施压。
- 赛季目标提醒。
- 引援传闻。
- 核心地位竞争。
- 围绕玩家重建。
- 被挂牌或轮换风险。
- 没落豪门复兴会议。
- 青训队出售明星传闻。

## 13. UI 展示建议

### 13.1 俱乐部列表

每支俱乐部显示：

- 身份标签：老牌豪门、资本项目、青训工厂等。
- 底蕴：高、中、低。
- 资本：高、中、低。
- 赛季目标预期。
- 管理层耐心。

示例：

> Titan Corp  
> 老牌豪门 | 底蕴 90 | 资本 78  
> 预期：至少打进 Major 淘汰赛  
> 风险：成绩压力极高

### 13.2 赛事中心

玩家报名赛事后，前端需要一个赛事中心或赛事详情视图，用来展示本次赛事的完整结构。

赛事中心显示：

- 参赛队伍列表。
- 抽签或分组结果。
- 小组赛、瑞士轮或淘汰赛阶段。
- 八强、四强、决赛和冠军路线。
- 玩家队伍高亮。
- 下一场对手情报。
- 已结束比赛比分。
- 胜方 MVP、败方 MVP、赛事最佳选手。
- 黑马队伍和失望队伍。
- 与赛事相关的转会传闻，例如明星选手被豪门关注、青训新人被资本队观察。

C/B 级赛事可以使用简化版赛事中心，但仍要展示参赛队伍和晋级路线。A/S/Major 使用完整展示。

### 13.3 对手情报面板

比赛前显示下一场对手的复杂画像，而不是只显示队名，但 UI 必须区分“公开可见”和“通过战术分析得出”。

默认可见字段：

- 俱乐部身份。
- VRS 和赛事种子。
- 地区。
- 公开近期战绩。
- 公开首发名单。
- 选手年龄。
- 抽签分组和晋级路径。

需要解锁的分析字段：

- 战术偏好。
- 核心选手。
- 首发阵容和角色分布。
- 选手状态和近期表现。
- 近期状态。
- 阵容稳定性。
- 内部默契。
- 地图倾向。
- 风险提示。

解锁方式：

- 录像研究。
- 数据分析。
- 教练报告。
- 媒体报道。
- 队伍会议。
- 赛前准备事件。

UI 应显示情报可信度，例如“公开信息”“推测分析”“已确认情报”，避免玩家无成本获得完整战术答案。

### 13.4 签约面试

面试时明确告诉玩家：

- 俱乐部为什么要签你。
- 本赛季目标是什么。
- 如果失败会有什么风险。
- 玩家预计承担什么角色。

示例：

> 管理层希望你成为本赛季火力升级的一部分。  
> 赛季目标：打进 S 级主赛。  
> 如果目标失败，俱乐部可能在休赛期启动阵容重建。

### 13.5 赛季目标面板

显示：

- 当前目标。
- 完成进度。
- 剩余时间。
- 管理层耐心。
- 重建压力。

## 14. 平衡原则

### 14.1 避免惩罚过重

玩家不能无预警被踢。

所有高风险结果必须经过事件链铺垫：

1. 管理层提醒。
2. 舆论或引援传闻。
3. 关键比赛或沟通选择。
4. 最终重建决定。

### 14.2 避免身份变成最优解

资本队不能只是薪资高、资源好。

它也要有代价：

- 压力高。
- 轮换风险高。
- 阵容稳定性低。
- 失败后管理层动作更激进。

老牌豪门也不能只是强。

它的代价：

- 面试难。
- 目标高。
- 舆论压力大。
- 失败后更容易被质疑。

### 14.3 赛事结构优先，完整队伍管理后置

第一版要优先保证玩家参与赛事时能看到完整参赛队伍、路线图、对手情报和奖项结果。

但不要在第一版把所有世界队伍都做成完整俱乐部经理模拟。世界队伍第一版需要：

- 静态身份。
- VRS 和运行态微调。
- 阵容与战术偏好摘要。
- 抽象转会传闻和少量关键转会结果。
- 赛事参赛、抽签、对阵和奖项结果。
- 社媒或对手情报文案。

后续再考虑让所有世界队伍都完整执行赛季目标、重建和复杂阵容管理。

## 15. 推荐实施阶段

### Phase 1：俱乐部身份数据

目标：

- 新增 `heritage`、`capital`、`clubArchetype`。
- 给现有队伍补身份。
- 新增世界队伍时按身份分布补齐。

验收：

- 每支队伍都有身份标签。
- UI 或调试数据能看到底蕴和资本。
- 世界队伍池更像真实职业生态。

### Phase 2：身份影响运行态

目标：

- 俱乐部身份影响初始 VRS、信任、稳定、薪资感。
- 不改变核心比赛模型，只做小幅差异。

验收：

- 老牌豪门更稳定。
- 资本队薪资更高、重建倾向更强。
- 青训队更适合成长。
- 草根队更容易出现黑马叙事。

### Phase 3：选手数据库与年龄系统

目标：

- 为结构化队伍生成或加载 5 名首发选手。
- 每名选手拥有年龄、角色、能力、状态、声望和风格标签。
- 玩家新增 `age` 字段。
- 新赛季时玩家年龄递增。
- 年龄通过派生修正或成长倍率影响敏捷、体能、智力、心态和经验。

验收：

- 对手情报、MVP 和赛事表现能引用具体选手。
- 年轻选手体现敏捷、体能成长潜力，但智力、心态和经验不足。
- 老将体现智力、心态、经验优势，但敏捷、体能成长或表现略受影响。
- 玩家年龄不会无预警永久扣除已有核心属性。

### Phase 4：赛事实例与赛事中心

目标：

- C/B/A/S/Major 报名后都生成 `TournamentInstance`。
- 生成参赛名单、抽签分组、路线图和对手情报。
- 玩家实际比赛复用现有 BO1 / BO3 / BO5 回合设计。
- 非玩家比赛抽象模拟并产出比分、胜者、关键选手和选手表现。
- 赛事结束后基于选手表现生成冠军、亚军、胜方 MVP、败方 MVP。

验收：

- 玩家报名 C/B 级赛事也能看到参赛队伍和简化晋级路线。
- 玩家报名 A/S/Major 能看到完整分组、淘汰路线和对手情报。
- BO3 / BO5 阶段不是被压缩成一场关键比赛。
- 赛事奖项和最终名次能展示在前端。

### Phase 5：世界选手转会模拟

目标：

- 每赛季运行一次抽象转会窗口。
- 根据俱乐部身份、资本、底蕴、年龄结构、角色缺口和重建压力生成转会需求。
- 根据选手表现、声望、年龄、角色状态和队伍成绩生成离队意愿。
- 产出少量关键转会传闻和转会记录。
- 转会结果更新选手所属队伍、俱乐部首发名单、社媒和对手情报。

验收：

- 资本队更容易签明星或快速换人。
- 青训工厂更容易提拔新人或被挖走核心。
- 没落豪门会寻找复兴核心。
- 玩家队伍的队友离队、新援加入、玩家被关注都能通过事件链体现。
- 转会不会无预警强制破坏玩家体验。

### Phase 6：面试生成赛季目标

目标：

- 签约时生成 `seasonGoal`。
- 面试文本展示赛季目标。
- 玩家接受 offer 后保存目标。

验收：

- 不同俱乐部给出的目标不同。
- 玩家能在签约前看到风险。
- 目标能随新赛季刷新。

### Phase 7：赛季目标评估

目标：

- 赛季末评估目标。
- 计算完成度。
- 更新管理层耐心和重建压力。

验收：

- 完成目标有奖励。
- 未完成目标产生压力。
- 不同俱乐部容忍度不同。

### Phase 8：重建事件链

目标：

- 未达标后触发管理层重建。
- 管理层选择重建核心。
- 玩家可能成为核心，也可能被边缘化。

验收：

- 玩家不会无预警被踢。
- 资本队能体现高薪高压。
- 没落豪门能体现复兴路线。
- 青训队能体现培养和被挖角。

## 16. 第一版建议范围

第一版不要做太大。

建议只实现：

- `heritage`。
- `capital`。
- `clubArchetype`。
- `WorldPlayer` 基础结构。
- 每支结构化参赛队伍的首发五人。
- `TransferRumor` 和 `TransferRecord` 基础结构。
- 每赛季抽象转会窗口。
- 少量关键转会传闻和转会结果。
- 玩家 `age` 字段。
- 年龄对敏捷、体能、智力、心态、经验的派生修正。
- `TournamentInstance` 基础结构。
- C/B/A/S/Major 的结构化参赛队伍生成。
- 赛事中心 UI 的第一版。
- 对手情报面板。
- 赛事路线图。
- BO1 / BO3 / BO5 阶段复用现有赛事回合设计。
- 冠军、亚军、胜方 MVP、败方 MVP。
- 玩家当前队伍的 `seasonGoal`。
- 玩家当前队伍的 `rebuildPressure`。
- 面试时展示目标。
- 赛季末目标评估。
- 1-2 条重建压力事件。

暂不实现：

- 完整转会市场。
- 所有世界队伍完整目标追踪。
- 复杂预算系统。
- 玩家直接管理阵容。
- 大量专属事件。
- 每张地图的选图、经济、逐图数据和详细技术统计。
- 完整选手合同、买断、挂牌和自由市场。

## 17. 总结

这个系统的核心不是给俱乐部加几个标签，而是让玩家明显感觉到：

- 加入老牌豪门，是背负历史。
- 加入资本队，是拿高薪但承受短期成绩压力。
- 加入青训队，是成长和被挖角。
- 加入地区队，是归属感和地区荣耀。
- 加入没落豪门，是复兴叙事。
- 加入草根队，是爆冷逆袭。
- 参加任何层级赛事，都能看到参赛队伍、对阵路线和复杂对手画像。
- 每支队伍都有具体选手，MVP、核心选手、战术分析和重建核心都有真实来源。
- 世界选手会因为俱乐部身份、年龄、成绩和重建压力发生转会，职业生态会持续变化。
- 玩家的年龄会参与职业生涯变化，年轻时更依赖敏捷和体能，老将阶段更依赖智力、心态和经验。

赛事结构让世界队伍池真正进入玩家比赛体验，赛季目标则把俱乐部身份变成长期玩法。

玩家每次签约都不只是选择薪资和档位，而是在选择一种职业生涯路线。
