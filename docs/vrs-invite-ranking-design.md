# VRS 排行榜与赛事直邀设计方案

落地日期：2026-06-10

当前分支：`feature/team-management-actions`

状态：已完成

实现要点：`worldClubs` 计算并维护 `vrsScore`，排行榜和赛事报名门槛统一读取该分数。

## 1. 问题

当前排行榜虽然有“队伍积分”，但它和赛事结果的联动还不够强。

问题不在于“有没有分数”，而在于：

- 分数主要是静态累加，看起来像板上数字。
- 队伍实力没有通过赛事模拟持续刷新排名。
- A / S / Major 赛事仍偏资格链逻辑，缺少“强队凭排名直邀”的感觉。
- Major 没有明确的 32 队分层直邀结构。

## 2. 设计目标

- 排行榜成为真正的战队实力排名，而不是空表。
- 战队积分由赛事模拟、世界队伍模拟、玩家战队结果共同驱动。
- B/C 仍然保留资格链，作为新人和中低级别的铺垫。
- A 级及以上赛事保留资格链，同时新增直邀制。
- Major 采用 32 队分层直邀，强队可以直接进 Stage 2 / Stage 3。

## 3. 现实映射

按公开资料，近年的 Major 已经是 32 队规模，并采用 Stage 1 / Stage 2 / Stage 3 + Playoffs 的结构，Stage 1/2/3 的邀请与 Valve Regional Standings（VRS）有关。[Counter-Strike Major Championships](https://en.wikipedia.org/wiki/Counter-Strike_Major_Championships) 和 [StarLadder Budapest Major 2025](https://en.wikipedia.org/wiki/StarLadder_Budapest_Major_2025) 都记录了 32 队、三段 Swiss 阶段的格式；[IEM Cologne Major 2026](https://en.wikipedia.org/wiki/IEM_Cologne_Major_2026) 也描述了 32 队并按 VRS 直接邀请的结构。

游戏里不需要 100% 复刻现实细则，但可以吸收这个骨架：

- 低级赛事负责出分。
- 中级赛事负责拉开排名。
- 高级赛事负责把排名转成直邀。
- Major 用分层邀请体现“顶级队伍不用打资格赛”。

## 4. 数据模型

当前世界队伍池已经有这些可用状态：

- `seasonPoints`
- `currentForm`
- `clubTrust`
- `internalChemistry`
- `rosterStability`
- `qualificationState`

建议把它们拆成两层：

### 4.1 VRS 核心分

`clubVRS` 是战队对外的排名分，用来决定赛事直邀。

### 4.2 世界运行态

`seasonPoints`、`currentForm`、`clubTrust`、`internalChemistry`、`rosterStability` 仍保留，用来驱动世界队伍的涨跌、黑马、崩盘和阵容波动。

`clubVRS` 主要由世界运行态和赛事结果派生。

## 5. 分数来源

### 5.1 赛事结果分

每场赛事结算后，给战队发放 VRS 变动。

建议公式：

```ts
vrsDelta =
  tierBasePoints(tournament.tier)
  * stageWeight(stageIndex, tournament.bracket.length)
  * resultWeight(result)
  * opponentWeight(opponentVrs)
  * prestigeWeight(tournament)
```

建议权重：

| 项 | 说明 |
|---|---|
| `tierBasePoints` | 赛事层级基础分，Major > S > A > B > C |
| `stageWeight` | 越往后权重越高 |
| `resultWeight` | 胜场、深轮次、冠军、爆冷分开处理 |
| `opponentWeight` | 击败高排名队伍给额外加分 |
| `prestigeWeight` | 重要品牌赛略加权 |

示例（可调）：

| 赛事层级 | 基础分 |
|---|---:|
| C | 4 |
| B | 8 |
| A | 12 |
| S | 20 |
| Major | 30 |

### 5.2 世界队伍模拟分

世界队伍池已经会定期 tick：

- `currentForm` 变化
- `clubTrust` 变化
- `internalChemistry` 变化
- `rosterStability` 变化
- `seasonPoints` 变化

建议保留这些作为 VRS 的辅助项，而不是直接等于 VRS：

```ts
clubVRS =
  rollingResultPoints
  + formBonus
  + chemistryBonus
  + stabilityBonus
  + trustBonus
```

这样：

- 稳定体系队伍会慢慢爬分。
- 阵容崩坏的强队会掉分。
- 黑马可以靠赛事连胜快速上升。

### 5.3 玩家战队联动分

玩家参加赛事时，结果会写回玩家所在战队：

- 赢比赛 -> 战队 VRS 上升。
- 打进深轮次 -> 战队 VRS 持续上升。
- 夺冠 -> 战队 VRS 大幅上升。
- 早出局 -> 微降。

这部分应该和 `recordWorldTournamentResult(...)` 的写回逻辑对齐。

## 6. 赛事邀请规则

### 6.1 C / B 级

保持资格链和公开报名。

- C 级继续作为新人开局和 B 种子产出。
- B 级继续作为青训晋级、公开赛和 A 门票来源。
- 这两档保留资格链的意义，是给新人一个“打出来”的台阶。

### 6.2 A 级

A 级保留资格链，同时新增直邀入口。

建议做成双轨：

- 资格链入口：给正在打 B / A 资格路径的队伍。
- 直邀入口：给 `clubVRS` 足够高的队伍。
- 同一个赛事可以同时存在两类席位。

判定时：

1. 先看是否持有对应资格门票。
2. 再看是否达到直邀排名线。
3. 任一满足都可进入报名池或受邀池。

这样低排位队伍还能通过赛事链路往上爬，高排位队伍则可以直接被拉进高水平赛事。

### 6.3 S 级

S 级同样保留资格链，同时增加直邀制。

可以拆成三档：

- `s-open`：既允许资格链晋级，也允许中高排名直邀。
- `s-closed`：既允许更高资格链晋级，也允许更高排名直邀。
- `s-class`：更偏向顶尖排名直邀，但仍可保留少量资格链席位。

这样 S 级既能保留“打出来”的路径，也能体现顶级俱乐部直接受邀的现实感。

### 6.4 Major

Major 采用 32 队分层直邀。

建议结构：

| 阶段 | 进入方式 | 说明 |
|---|---|---|
| Stage 1 | 中低排名直邀 | 仍给一些后排队伍机会 |
| Stage 2 | 高排名直邀 | 中上游强队直接进入 |
| Stage 3 | 顶级直邀 | 最强队伍直接进高级阶段 |
| Playoffs | Swiss 晋级 | 继续按赛事结果推进 |

推荐分配：

- Stage 3：顶尖 8 队
- Stage 2：次顶尖 8 队
- Stage 1：其余 16 队

如果游戏想做得更像现实，可以保留：

- 少量 MRQ / 区域名额。
- 少量地区保底席位。
- 但主干仍然是 VRS 直邀。

## 7. 与当前系统的结合

### 7.1 保留现有世界队伍池

当前 `worldClubs` 已经有：

- 队伍运行态
- 赛季积分
- 资格状态
- 赛事结果写回

这套结构可以直接承接 VRS。

### 7.2 推荐改法

- `seasonPoints` 作为当前赛季积分。
- 新增 `vrsScore` 作为对外展示和邀请判定分。
- `seasonPoints` 影响 `vrsScore`。
- `currentForm / chemistry / trust / stability` 作为辅助修正。

### 7.3 邀请判定

赛事开放接口建议按以下顺序判断：

1. 战队等级是否满足。
2. 名气 / 玩家阶段是否满足。
3. `clubVRS` 是否达到邀请门槛。
4. 是否属于本赛区 / 全球邀请池。
5. 是否需要少量 wildcard。

## 8. UI 建议

排行榜页面建议展示：

- VRS 分数
- 当前赛季积分
- 最近 4 周走势
- 当前邀请段位
- 距离 A / S / Major 邀请线差多少分

赛事详情建议展示：

- 本赛事是直邀还是公开赛
- 当前战队是否已达邀请线
- 还差多少分
- 未来几周如果继续打比赛，可能到哪一档

## 9. 实现顺序

### Phase 1

- 把现有战队积分明确为 VRS 核心分。
- `worldClubs` 的赛事结果写回先继续沿用当前逻辑。
- 排行榜 UI 显示当前分、邀请线、差距。

### Phase 2

- A 级赛事新增直邀席位。
- S 级赛事新增直邀席位。
- 资格链仍然保留，和直邀并行存在。

### Phase 3

- Major 改成 32 队分层邀请。
- Stage 1 / 2 / 3 按 VRS 分层发放名额。

### Phase 4

- 让世界队伍模拟更强地影响 VRS 波动。
- 加入赛区权重、赛事重要度和对手强度修正。

## 10. 结论

这个方案可以做，而且和你当前的世界队伍池、赛事系统、玩家战队系统是能接上的。

最关键的点是：

- A / S 既保留资格链，也增加直邀。
- 让排行榜真的决定直邀。
- Major 用 32 队三阶段邀请，顶级队直接进 Stage 2 / Stage 3。

这样排行榜才不只是“队伍总分”，而是真正的职业生态入口。
