# 经济系统重构 · 实现方案

> 文档状态：实现就绪（细化自 `economy-system-redesign.md`）
> 文档日期：2026-06-27
> 机制基线：c362cdf
> 关联：Phase 1-2（capital→薪资）、Phase 3（年龄→身价）、Phase 4（名次→奖金）、Phase 5（转会费）、Phase 6-7（目标→奖金）、Phase 8（coreStatus→薪资）、cross-cutting（rollover 时序 §4 / 长程 §7 / 迁移 §8）
> **红线**：选手视角理财，不做俱乐部财务报表；竞技为主、内容为辅；饰品负期望、不建市场引擎。

---

## 0. 现状与接入点（已核对 c362cdf）

- **金额单位 K；硬上限 `MONEY_MAX = 999`**（`constants.ts:61`）。`applyMoneyTransaction`（`money.ts:15`）每笔都 `clampMoneyValue` 夹到 `[0, 999]` 并 `round`。⚠️ 新增经常性收入后，成功生涯会**撞 999 顶、收入溢出浪费**——必须先校准（§8）。
- **薪资入账**：`choice.ts:1238`，`roundsSinceLastPay >= payCycle(4)` 时 `applyMoneyTransaction(nextPlayer, team.monthlySalary)`，并有降薪/恢复（`salaryTracker.originalMonthlySalary`/`salaryRestoreRound`）。**经常性收入、抽成、生活成本都挂这个发薪节拍**。
- **赛事奖金**：`stageRewardDelta(t, idx, success)`（`choice.ts:1520`）产出 points/fame/money，源自 `tournament.reward`（C 级 money≈8-10）。**名次梯度奖金改这里**。
- **续约**：`chain-contract-renewal`（`game.ts` 后处理，`contractRenewals` 累加）。**身价驱动涨薪改这里**。
- **money 未被 `clampStats` 限制**（开局分配排除 money），但**运行时被 `MONEY_MAX` 限制**——两处不同，别混。

---

## 1. 关键决策

1. **先校准 `MONEY_MAX`**：新经济需要财富在生涯内累积的头寸。提升上限（如 `9999`，仍 K 单位）或改用更大基数；否则经常性收入毫无意义（见 §8）。
2. **统一"净发薪管线"**：把 + 薪资 + 直播 + 代言 − 经纪人抽成 − 生活/税 合并在发薪节拍（`choice.ts:1238`）一次结清，逐项 passiveEffects。
3. **`marketValue` 在 rollover 派生**：按 cross-cutting §4 时序（第 10 步附近）重算，并在续约/转会即时读取。
4. **奖金接 Phase 4**：有 `TournamentInstance` 时按 `finalPlacement` 发奖金池分成；无则回落现有 `reward.money`。
5. **饰品按需派生**：价值 = f(已有信号)+噪声+负漂移，读时算，不持久化价格序列、不建供需。

---

## 2. 类型层（`backend/src/types.ts`）

```ts
// Player 增
marketValue: number;                 // 0-100 身价指数（派生缓存）
incomeStreams?: { streaming: number; sponsorship: number };  // 每发薪周期金额（K）
agent?: { signed: boolean; cutRate: number };                // 抽成比例 0..1
skinHoldings?: SkinHolding[];

export interface SkinHolding {
  id: string;
  name: string;
  costBasis: number;                 // 买入价（K）
  boughtRound: number;
  linked: { kind: 'major' | 'world-player' | 'self'; refId?: string };  // 价值挂钩信号
}
```

`MONEY_MAX` 调整在 `constants.ts:61`。

---

## 3. 净发薪管线（`choice.ts:1238` 一带）

把现有"只发月薪"扩成净结算：

```ts
if (roundsSinceLastPay >= payCycle) {
  const salary = nextPlayer.team.monthlySalary;
  const streams = nextPlayer.incomeStreams ?? { streaming: 0, sponsorship: 0 };
  const gross = salary + streams.streaming + streams.sponsorship;
  const agentCut = nextPlayer.agent?.signed ? Math.round(gross * nextPlayer.agent.cutRate) : 0;
  const living = livingCost(nextPlayer);                 // §6.2，随 stage/fame 缩放
  const net = gross - agentCut - living;
  applyMoneyTransaction(nextPlayer, net);
  // 逐项 passiveEffects：月薪/直播/代言/经纪人抽成/生活税
}
```

- **收入流计算**（新增 `engine/income.ts`）：
  - `streaming = clamp(f(fame, streamerTraits))`：低 fame≈0，高 fame 显著但 ≤ 顶薪。
  - `sponsorship = f(fame, stage, 近期 deep-run/冠军, hasAgent)`，经纪人放大。
  - 在 fame/stage/赛事结果变化时刷新 `incomeStreams`（或发薪时即时算）。
- **无队时**：无月薪，但**直播/代言仍可有**（自由人靠名气吃饭）——只是 sponsorship 偏低。

---

## 4. 球员身价 `marketValue`（接 Phase 3 / 5）

新增 `engine/marketValue.ts`：

```ts
export function deriveMarketValue(player, history): number;
```

- 输入加权：近 1 年赛事成绩（tierChampionships/participations 增量、深轮）、`fame`、**年龄曲线**（Phase 3 `ageBandFor`：ascending/prime 抬升、veteran/twilight 下滑）、`coreStatus`、角色稀缺度（`roleFitScore` + 角色供需）。
- 输出 0-100，写 `player.marketValue`（rollover 第 10 步附近重算，cross-cutting §4）。
- **驱动续约**（`chain-contract-renewal`）：涨薪幅度 = f(marketValue 相对签约时的变化)；升→涨薪/被挖，降→降薪续约或不续。结合 Phase 1-2 `capitalSalaryMultiplier` 定最终薪资。
- **转会费/签字费**（Phase 5）：玩家转会按 marketValue 产一次性签字费入账；世界转会同口径，影响 Phase 5 撮合"买得起/买不起"。
- 与 **VRS 区分**：VRS=队伍战绩（cross-cutting §6），marketValue=个人身价。

---

## 5. 名次梯度奖金（改 `stageRewardDelta`，`choice.ts:1520`）

```ts
// 有 TournamentInstance 时：
const prize = prizePool(t.tier) * placementShare(instance.finalPlacementOf(playerClub)) * PLAYER_SHARE;
// 无实例（背景/兜底）：回落现有 reward.money
```

- `prizePool(tier)`：Major/s-class 最高，梯度递减（常量表）。
- `placementShare`：冠军 1.0 > 亚军 > 四强 > 深轮 > 小组出局（出局可 0）。
- `PLAYER_SHARE`：玩家拿队伍奖金分成（首发≈1/5 略上浮，替补更少）。
- **替补/顶替**（预报名 §8.5）：奖金分成计入被顶替的**原阵容选手**。
- 注意 `MONEY_MAX`：大额冠军奖金在低上限下会被夹——再次说明 §8 必须先做。

---

## 6. 金钱去处 / sink

### 6.1 经纪人抽成（已在 §3 管线）
`player.agent = { signed, cutRate(0.10~0.15) }`；签约入口走现有 agent 事件链；回报=放大 sponsorship（§3）、提高续约/转会报价、解锁代言事件。

### 6.2 生活成本 / 税（`livingCost`，新增）
`livingCost(player) = base(stage) + fameTax(fame)`，随发薪节拍扣（§3），随 stage/fame 上升，让高收入非纯顺差。

### 6.3 晚期 sink（新增可选消费/行动）
- 奢侈/地位消费：一次性大额 → 小幅 fame/mentality（边际递减）。
- 家人长期供养：持续支出 → 降低家庭危机概率/烈度（接现有家庭危机系统）。
- 退役投资/慈善：接 `finalizePlayerCareerSnapshot`（名人堂结算）——晚期投入影响退役结局/名人堂评级，给攒钱终局意义。

---

## 7. 饰品风险资产（`engine/skins.ts`，按约束不建市场）

```ts
export function deriveSkinValue(holding: SkinHolding, session: GameSession): number;
```

- **当前价值（读时算，不持久化价格）**：
  `value = costBasis × hypeMultiplier(holding, session) × driftFactor(holding, player.round)`
- `hypeMultiplier` 由**已有信号**读出：
  - `major`：临近/刚结束 Major 上扬、之后回落（读赛历日期）。
  - `world-player`：跟随 `WorldPlayer.reputation` / 近期 `tournamentSnapshots` 成绩（Phase 3/4）。
  - `self`：跟随玩家 `fame`。
  - 叠加 `makeRng(hashString(session.id:skin:id:week))` 周噪声。
- `driftFactor`：随持有时长缓慢**负向漂移** + 买卖价差/手续费 → 被动持有期望为负。
- **买入/卖出**：经现有商店/事件；卖出按 `deriveSkinValue` 成交。
- **结果形态**：偶发大涨（明星爆发/Major hype）让**少数**玩家获利；**期望 ≤ 0**，多数亏损 → "靠 CS 理财成功是少数"。
- **明确不做**：供需撮合、全市场价格表、稳定套利。

---

## 8. `MONEY_MAX` 与平衡校准（先做）

- **提升上限**：`MONEY_MAX` 从 999 提到能容纳生涯财富累积的值（建议 `9999`，K 单位不变），否则经常性收入/大额奖金被夹、毫无意义。
- **重标定**：相应检查贷款额度（20-100K）、房产/外设价、奖金池，使典型净值曲线 **先紧（早期房租/贷款压）→ 中宽（成名增收）→ 有 sink（晚期抽成/生活/消费）**，避免撞顶或溢出。
- 数值集中常量，便于调。

---

## 9. 迁移

- 新字段全可选；旧档 `marketValue` 由当前成绩/fame/age 初始化、其余空——并入 cross-cutting §8 统一 `schemaVersion` 迁移。
- `MONEY_MAX` 提升对旧档无害（旧值仍合法）。
- 奖金改名次梯度：无 Phase 4 实例时回落旧 `reward.money`，向后兼容。

---

## 10. 测试

- `income.test.ts`：低 fame 收入流≈0；高 fame 显著但 ≤ 顶薪；无队时仍有直播收入、sponsorship 偏低。
- 净发薪：发薪节拍一次结清 + 薪资 + 流 − 抽成 − 生活；逐项正确；签经纪人后到手减少但 sponsorship 提升。
- `marketValue.test.ts`：成绩/名气升→身价升；进入 twilight→身价降；续约涨薪随身价；转会费随身价。
- 奖金：有实例时冠军 > 小组出局梯度明显、玩家拿分成；替补归原选手；无实例回落。
- `skins.test.ts`：Major 周期/关联选手成绩/fame 驱动 hype；长持有期望为负（大样本平均亏损、分布右偏）；同 seed 同价。
- 平衡（并入 cross-cutting §7 长程）：不撞 `MONEY_MAX` 顶导致溢出；净值曲线先紧后宽再有 sink。

---

## 11. 实施步骤（PR 切分）

1. **`MONEY_MAX` 校准 + 类型**（§2/§8）：提升上限、加字段。地基，先合。
2. **净发薪管线 + 收入流**（§3、§6.1/6.2）：`income.ts`、经纪人抽成、生活/税接 `choice.ts:1238`。
3. **名次梯度奖金**（§5）：改 `stageRewardDelta`，接 Phase 4 `finalPlacement`。
4. **球员身价**（§4）：`marketValue.ts` + 续约涨薪 + Phase 5 转会费。
5. **晚期 sink**（§6.3）：奢侈/供养/退役投资接名人堂。
6. **饰品**（§7）：`skins.ts` 派生价值 + 买卖。
7. **平衡与长程断言**（§10），并入 cross-cutting §7。

第 1 步是地基（不先做后面收入全被 999 夹）；第 2-3 步立刻改善"收入太薄"；第 4 步让经济进生涯弧；5-6 步给钱去处与 flavor；7 步收口。
