# 赛事胜率分层模型设计方案

落地日期：2026-06-09

当前分支：`feature/team-management-actions`

状态：已实现

## 1. 背景

当前比赛模拟中，队友能力、团队协同和派生队伍默契会直接进入 `effectiveAim`。

简化后类似：

```ts
effectiveAim =
  aimBase
  + feelEffect
  - fatigueDebuff
  - tiltDebuff
  + teamBonus
```

这套公式能让战队系统影响比赛，但它把队伍贡献表现成了“玩家个人枪法提高”。

玩家实际体验中会出现一个问题：

- 无队伍打 C/B 公开赛时，夺冠偏难。
- 加入青训队后，B 级赛事胜率明显跳升。
- 队伍越强，玩家个人 K/D、HS% 和 Rating 也可能被同步抬高。

这会让青训队像是直接给玩家上了枪法 buff，而不是提供队伍容错、配合和战术支撑。

## 2. 设计目标

本设计目标不是削弱队伍系统，而是拆清楚“个人表现”和“队伍胜负”。

- 玩家属性和状态决定个人表现。
- 队伍能力、团队协同、队伍默契决定队伍把个人表现转化为胜利的能力。
- 队伍强可以提高胜率和比分容错，但不应直接抬高玩家 Rating。
- C/B 公开赛中的无队伍状态应理解为临时队、路人队或混编队，不是玩家一个人打 1v5。
- 越高级赛事，团队体系权重越高。

## 3. 当前公式问题

### 3.1 队伍加成混入个人枪法

当前 `teamBonus` 进入 `effectiveAim` 后，会同时影响：

- 胜率。
- 击杀。
- 死亡。
- 爆头率。
- Rating。

但队友更强并不等于玩家个人枪法更准。更合理的表现应该是：

- 玩家自己的 K/D 主要看个人能力和状态。
- 队伍更强时，玩家更容易赢下比赛，比分更稳，逆风容错更高。

### 3.2 B 级赛事对队伍加成敏感

B 级两阶段赛事大致是：

```text
入围赛：baseDifficulty 2 + difficultyBonus -1 = 有效难度 1
决赛：baseDifficulty 2 + difficultyBonus +1 = 有效难度 3
```

对手强度大致：

```ts
enemyAim = 25 + effectiveDifficulty * 8
```

所以：

```text
B 级入围赛 enemyAim ≈ 33
B 级决赛 enemyAim ≈ 49
```

两阶段赛事需要连续获胜。即使单场胜率不低，夺冠率也会被连乘放大：

```text
入围赛 70% * 决赛 50% = 35% 夺冠率
入围赛 77% * 决赛 57% = 44% 夺冠率
```

因此青训队提供的几个点 `effectiveAim` 加成，会在 B 级夺冠体验中显得非常明显。

## 4. 推荐模型

### 4.1 MatchContext

当前实现已新增 `MatchContext`，不再只传一个 `effectiveDifficulty`。

```ts
interface MatchContext {
  tier: TournamentTier;
  progressionTier: TournamentProgressionTier;
  entryType: TournamentEntryType;
  stageIndex: number;
  effectiveDifficulty: number;
}
```

原因：

- 胜率权重主要看 `progressionTier`。
- 无队伍临时队逻辑需要知道是否是公开报名或预选性质。
- 后续宿敌、具体对手强度、品牌赛事修正也可以继续复用赛事上下文。

### 4.2 个人表现和队伍胜负分层

比赛先计算个人表现：

```ts
personalPower =
  aimBase
  + feelEffect
  - fatigueDebuff
  - tiltDebuff
```

再计算队伍表现。`teamPower` 必须保持近似 0-100 标尺，才能和 `personalPower` 做权重混合：

```ts
teamPower =
  50
  + rosterPower
  + synergyPower
  + chemistryPower

teamPower = clamp(teamPower, 20, 80)
```

胜负使用混合后的比赛强度：

```ts
matchPower =
  personalPower * personalWeight
  + teamPower * teamWeight

enemyPower =
  clamp(25 + effectiveDifficulty * 8, 20, 90)

winProb =
  0.5
  + (matchPower - enemyPower) / 60
  + mentalityBonus
```

个人数据使用 `personalPower`：

```ts
kpr / dpr / apr / hs% / rating
  = derivePersonalStats(personalPower, decisionPower, mentality, matchResult)
```

### 4.3 按赛事层级调整权重

越高级赛事，团队体系越重要：

| 赛事层级 | 个人权重 | 队伍权重 |
|---|---:|---:|
| C 级 | 82% | 18% |
| B 级 | 75% | 25% |
| A 级 | 68% | 32% |
| S 级 | 60% | 40% |
| Major | 55% | 45% |

映射建议：

```ts
function matchWeights(progressionTier: TournamentProgressionTier) {
  if (progressionTier === 'c') return { personal: 0.82, team: 0.18 };
  if (progressionTier === 'b') return { personal: 0.75, team: 0.25 };
  if (progressionTier === 'a') return { personal: 0.68, team: 0.32 };
  if (progressionTier === 'major') return { personal: 0.55, team: 0.45 };
  return { personal: 0.60, team: 0.40 };
}
```

设计含义：

- C 级：个人能力可以打出黑马表现。
- B 级：队伍开始重要，但还不能压过个人。
- A 级：二线赛事开始要求固定阵容和战术执行。
- S / Major：职业队伍体系是核心变量。

## 5. teamPower 设计

固定队伍的 `teamPower` 由三部分组成。

```ts
teamPower =
  50
  + rosterPower
  + synergyPower
  + chemistryPower

teamPower = clamp(teamPower, 20, 80)
```

### 5.1 rosterPower

队友能力不直接加玩家枪法，而是进入队伍整体强度。

建议根据赛事层级和当前 bracket 阶段做标准化：

```ts
rosterAvg =
  average(
    teammate.agility * 0.45
    + teammate.intelligence * 0.25
    + teammate.experience * 0.20
    + teammate.mentality * 0.10
  )

expectedRosterAvg =
  expectedRosterPowerByTier(progressionTier, stageIndex)

rosterPower =
  clamp((rosterAvg - expectedRosterAvg) * 3, -12, 12)
```

示例期望值：

| 赛事层级 | 入围 / 早期 | 决赛 / 深轮次 |
|---|---:|---:|
| C 级 | 3.5 | 4 |
| B 级 | 4.5 | 5 |
| A 级 | 7 | 8 |
| S 级 | 10 | 11 |
| Major | 13 | 14 |

B 级普通青训队友的均值大约是 4.5。把 B 级决赛期望写成 5，表示普通青训队能稳定参加，但想夺冠仍需要玩家个人发挥、队伍协同或更好的状态。

### 5.2 synergyPower

沿用当前团队协同来源，但进入 `teamPower`。

```ts
synergyPower =
  clamp(calcSynergyBonus(player, roster) * 2, -6, 8)
```

当前协同项包括：

- IGL + 战术特质。
- AWPer + 火力特质。
- 多名支援型特质。
- 玩家指挥 + 支援队友。
- 多个 ego 特质冲突。
- 单打倾向过多。

需要 clamp 的原因：

- 当前协同最高可以堆到较高正值。
- 在 S/Major 中队伍权重更高，协同如果不封顶会被放大。
- 协同应该是队伍结构修正，不应压过队友基础能力。

### 5.3 chemistryPower

队伍默契仍由队友默契和队伍信任派生：

```ts
teamChemistry =
  deriveTeamChemistry(roster, teamTrust)

chemistryPower =
  calcTeamChemistryModifier(teamChemistry) * 4
```

当前可以先沿用三档：

```ts
if (teamChemistry >= 70) return +1
if (teamChemistry <= 25) return -1
return 0
```

也就是：

```ts
chemistryPower = -4 | 0 | +4
```

如果后续要让队伍默契更细腻，应另开队伍默契曲线设计，不建议和本次胜率分层同时做。

原则：

- `teamTrust` 不单独作为胜率修正叠加。
- `teamTrust` 只通过派生队伍默契影响比赛。
- 队友默契是主体，队伍信任是发挥环境。

## 6. 无队伍临时队模型

无队伍不应等于没有队友。C/B 公开赛可以理解为临时队、路人队或混编队。

建议：

```ts
function pickupTeamPower(context: MatchContext) {
  if (context.progressionTier === 'c') return 45;
  if (context.progressionTier === 'b') return 40;
  return 35;
}
```

适用范围：

- 只在玩家没有固定战队或没有固定阵容时生效。
- 只代表临时队基础配合，不代表可经营队伍。
- A 级以上原则上应由报名门槛阻止无队伍参赛。
- 如果资格门票或特殊规则允许无队伍破格进入高级赛事，仍使用低 `pickupTeamPower`，并在 UI 上提示“临时队参赛，缺少固定阵容支撑”。

限制：

- 临时队不产生 `teamTrust`。
- 临时队不产生队友默契成长。
- 临时队不触发队伍管理收益。
- 临时队不展示具体队友名单。

这样 C/B 公开赛不会显得玩家是在单人参赛，但固定队伍仍然有长期价值。

## 7. 个人数据生成

个人数据应主要吃 `personalPower`，不要吃完整 `matchPower`。

建议：

```ts
aimScore = personalPower / 100
decisionScore = decisionPower / 100
stabilityScore = mentality / 20
```

用于：

- KPR。
- DPR。
- APR。
- HS%。
- Rating。

胜负结果仍可对 Rating 有小幅修正，但队伍强度不应直接抬高基础 KPR 或 HS%。

比分和死亡压力可以继续受比赛结果影响：

```ts
enemyPressure = enemyPower / 100
lostRoundPressure = enemyScore / totalRounds
```

也就是说：

- 击杀和爆头主要看个人。
- 死亡会部分受到队伍输赢和对手压力影响。
- Rating 可以保留小幅胜负修正，但不能由 `teamPower` 直接抬高。

合理例子：

- 玩家发挥普通，但队伍强，比赛赢了：Rating 中等，队伍取胜。
- 玩家发挥很好，但队伍弱，比赛输了：Rating 可高，但比分失利。
- 玩家和队伍都强：高 Rating，大比分胜利。
- 玩家弱但队伍强：可能混赢，但个人数据不会虚高。

## 8. 赛前预览调整

赛前卡片继续不暴露完整公式，但文案应区分个人层和队伍层。

个人层：

```text
手感：热手，预计个人对枪表现上浮
疲劳：偏高，中后程个人稳定性下降
心态波动：轻微波动，关键回合风险可控
```

队伍层：

```text
队友能力：火力正常，能分担对枪压力
团队协同：良好，默认配合更顺
队伍默契：一般，战术执行没有明显修正
```

无队伍时：

```text
队伍：临时队参赛，没有固定阵容加成
```

不要写成“无队伍，以个人状态参赛”，否则仍会让玩家理解成 1v5。

## 9. 落地步骤

### Phase 1：接口与公式分层（已完成）

- 新增 `MatchContext`。
- 将正式赛事结算调用从 `simulateMatch(player, effectiveDiff, rng)` 迁移到 `simulateMatch(player, context, rng)`。
- 在 `matchSimulator.ts` 中拆出 `personalPower`。
- 新增 `deriveTeamPower(player, context)`。
- 胜率改用 `matchPower`。
- 个人 K/D、HS%、Rating 改为主要使用 `personalPower`。

### Phase 2：赛事层级权重（已完成）

- 根据 `context.progressionTier` 决定个人/队伍权重。
- C/B/A/S/Major 使用不同权重。
- 无队伍时使用 `pickupTeamPower(context)`。

### Phase 3：UI 预览同步（已完成）

- 赛前状态卡片区分个人层和队伍层。
- 无队伍 C/B 公开赛显示“临时队参赛”。
- 固定队伍显示队友能力、团队协同、队伍默契。

### Phase 4：测试与数值校准（已完成首轮）

至少覆盖：

- 无队伍 C 级公开赛仍有合理夺冠机会。
- 无队伍 B 级公开赛可打但夺冠偏难。
- 青训队能提高 B 级胜率，但不会让 Rating 明显虚高。
- A/S/Major 中队伍权重高于 C/B。
- 低队伍信任只通过队伍默契影响 `teamPower`，不会重复结算。
- 同一个玩家、同一场赛事中，提升队伍能力会提高胜率，但基础 HS% 不应同步明显上升。

关于随机数：

- 尽量保持 RNG 调用次数和顺序稳定。
- 允许胜负变化导致后续比分和 KDA 不同。
- 测试不要依赖单个随机样本，应使用固定 rng 或概率区间断言。

## 10. 实现审查结论

该方案已经接入当前赛事、战队、队友系统。实现后需要持续注意：

- 正式赛事结算已经通过 `MatchContext` 传入赛事层级、报名类型、阶段和有效难度。
- 个人数据生成不再使用完整 `matchPower`，KPR、HS% 和 Rating 主要来自 `personalPower`。
- 赛前预览已经把无队伍显示为临时队，并将队伍信息描述为容错、默契和队伍表现方向。
- `teamPower` 必须保持 0-100 标尺，不能直接混合小范围 bonus。
- `synergyPower` 和 `rosterPower` 必须有 clamp，避免 S/Major 权重下被过度放大。

本次实现没有同时调整赛事难度、赛事奖励、晋级条件或队友生成范围，便于后续单独校准胜率曲线。
