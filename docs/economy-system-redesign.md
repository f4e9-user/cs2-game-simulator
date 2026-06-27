# 经济系统重构设计

> 实现细化：[economy-system-implementation.md](./economy-system-implementation.md)
> 文档状态：设计
> 文档日期：2026-06-27
> 适用范围：玩家收入、球员身价与合同、支出与金钱去处、与俱乐部/赛事/转会/年龄系统的经济联动、饰品风险资产
> 关联：Phase 1-2（capital→薪资）、Phase 3（年龄→身价）、Phase 4（名次→奖金）、Phase 5（转会费）、Phase 6-7（目标→奖金）、Phase 8（coreStatus→薪资）、cross-cutting（VRS / 长程健康）
> **贯穿红线**：做**选手视角的个人理财深度**，不做俱乐部财务报表/经理模拟。所有俱乐部财务只做"能/不能"门槛级影响。

---

## 0. 现状与边界（已核对代码）

**收入**：月薪（`salaryTracker`，`choice.ts:836`，每 `payCycle=4` 回合入账；纠纷可降 0.8 后恢复）、赛事奖金（`reward.money`，C 级≈8-10K，目前近定额）、房产出租（`housing.ts` `city.rentalIncome`）、一次性事件（赞助/直播片段/博彩/诈骗）。
**支出**：房租（tier×城市）、设施维护、按揭、商店/外设、贷款还款（`loan.ts` 本金×利率）、家庭危机、搬家/装修。
**机制**：`money` 是 `Stats` 字段（单位 K）。开局分配的 `clampStats` 不动 money，但**运行时每笔 `applyMoneyTransaction` 都被夹到 `[0, MONEY_MAX=999]`**（`money.ts:15` / `constants.ts:61`）——即 money 有 **999K 硬上限**，新增经常性收入后成功生涯会撞顶、收入溢出，须先校准（见实现方案 §8）。`creditScore`（贷款门槛<50）；破产链（`cash-strapped`/`broke`→bailout）；生涯终结（家庭危机未付 / 长期破产）。
**核心问题**：收入薄且几乎全被动月薪；fame 几乎不变现；奖金不接 Phase 4 名次；无球员身价；晚期无金钱去处。

---

## 1. 设计目标

1. 收入结构真实化：薪资 + 名次奖金分成 + 名气经常性收入（直播/代言），让"养名气/选媒体特质"有长期回报。
2. 引入**球员身价**，把成绩/名气/年龄/地位变成可驱动续约、转会、签字费的经济量，接 Phase 3 衰老与 Phase 5 转会。
3. 给晚期富裕玩家**金钱去处**（经纪人抽成、生活成本/税、奢侈/供养/投资/慈善），让钱始终有意义。
4. 与赛季目标/俱乐部身份/重建/转会经济联动。
5. 饰品作为**诱惑型风险资产**（非收入、非新市场模拟、多数失败）。

---

## 2. 收入侧重构

### 2.1 名气 → 经常性收入（机会 A）

新增"收入流"概念：除月薪外，按 fame/stage/媒体特质产生**每发薪周期入账的被动收入**。

```ts
interface IncomeStreams {
  streaming: number;   // 直播/内容，主要由 fame + streamer/media 特质驱动
  sponsorship: number; // 代言，由 fame + stage + 近期赛事曝光驱动（经纪人放大，见 4.2）
}
```

- 计算：`streaming = f(fame, streamerTraits)`、`sponsorship = f(fame, stage, 近期 deep-run/冠军, hasAgent)`，集中成常量表。
- 入账：与月薪同周期（`salaryTracker` 的 payCycle，`choice.ts:836` 一带）一并 `applyMoneyTransaction`，passiveEffects 显示"直播收入 +X / 代言 +Y"。
- 意义：fame 从"只解锁俱乐部/事件"变成**可持续变现**；`streamer`/`media` 特质有了长期经济身位。
- 边界：低 fame 几乎为 0，避免新人白嫖；高 fame 显著但**不超过顶级薪资**，保持竞技为主、内容为辅。

### 2.2 名次梯度奖金 + 玩家分成（机会 B，接 Phase 4）

赛事奖金改为**按名次×赛事级别发奖金池，玩家拿队伍分成**：

- `prize = prizePool(tier) × placementShare(finalPlacement)`，玩家得 `prize × playerShare`（如首发 1/5 略上浮，替补更少）。
- 复用 Phase 4 的 `finalPlacement` / `awards`；`prizePool(tier)` Major/S 最高，梯度递减。
- 冠军与小组出局的经济落差成为生涯关键正反馈，替代现状的近定额 `reward.money`。
- 替补/顶替出战（预报名 §8.5）：奖金分成同"荣誉归属"规则——**计入被顶替的原阵容选手**。

### 2.3 月薪保留并接身价

月薪机制（`salaryTracker`）保留；签约金额改由**身价 + 俱乐部 capital**（Phase 1-2 `capitalSalaryMultiplier`）共同决定（见 §3）；coreStatus 调整薪资沿用 Phase 8 §6.2。

---

## 3. 球员身价与合同（机会 C，接 Phase 3 / 5）

新增玩家 `marketValue`（与世界选手 `WorldPlayer.reputation` 对位）：

```ts
// Player 增
marketValue: number; // 0-100 派生身价指数
```

- **派生**：`marketValue = f(近1年赛事成绩, fame, marketValue 年龄曲线, coreStatus, 角色稀缺度)`。其中**年龄曲线用 Phase 3 的 AgeBand**：ascending/prime 抬升、veteran/twilight 下滑——**老将身价随年龄回落**，自然带来晚年减薪压力（与衰老闭环）。
- **驱动续约/报价**：`chain-contract-renewal`（现有）涨薪幅度 = f(marketValue 较签约时的变化)；身价涨→涨薪/被挖；身价跌→续约降薪或不续。
- **转会费 / 签字费**（接 Phase 5）：玩家转会时按 marketValue 产生**签字费**（一次性入账）；世界转会的身价也用同一口径，影响 Phase 5 的撮合与"买得起/买不起"。
- **与 VRS 区分**：VRS 是**队伍**战绩分（cross-cutting §6）；marketValue 是**个人**身价。二者输入有重叠（成绩）但主体不同。

---

## 4. 支出与金钱去处（机会 D / E）

### 4.1 经纪人抽成（机会 E）

经纪人从零散事件升级为**经济角色**：

- 签经纪人后，**抽取收入的固定比例**（如薪资+代言+签字费的 10-15%），持续支出。
- 回报：放大 `sponsorship`（2.1）、提高转会/续约报价档位、解锁更好代言事件。
- 权衡：早期穷不划算、成名后净赚——给"签不签经纪人"真实决策。

### 4.2 生活成本 / 税随 stage & fame 缩放

- 除房租外，新增**生活/税务支出**随 stage 与 fame 上升（pro+名气高→支出基数高），让更高收入不是纯顺差。集中常量、随发薪周期扣。

### 4.3 晚期金钱 sink

给富裕/晚期玩家可选的钱去处：

- **奢侈/地位消费**：一次性买入提升 fame 或心态的高价物（边际递减）。
- **家人长期供养**：持续支出，降低未来家庭危机概率/烈度（接现有家庭危机系统）。
- **退役投资 / 慈善**：接 `finalizePlayerCareerSnapshot` 名人堂结算——晚期投入影响**退役后结局/名人堂评级**，给攒钱一个终局意义。

---

## 5. 与新系统的经济联动

- **赛季目标 → 绩效奖金**（Phase 6-7）：达成发奖金、超额更多、失败无奖金 → 让目标有经济重量（现仅影响信任/重建）。
- **capital → 俱乐部预算门槛**（Phase 1-2，**守红线**）：capital 派生一个**抽象预算档**，仅做"能/不能"判断——能否在预报名 §8.5 找到顶替、能否出高薪签人。**不做收支报表**。
- **coreStatus → 薪资**：已在 Phase 8 §6.2（rotation/bench 减薪接破产链），此处引用不重复。
- **替补荣誉/奖金归属**：预报名 §8.5 的荣誉归属同样适用于奖金分成（§2.2）。

---

## 6. 饰品：诱惑型风险资产（按约束，不做市场模拟）

> 约束：**不引入新经济模拟系统**；价格随 Major / 选手表现 / 名气波动；**靠 CS 理财成功的终究是少数**。

设计为"持有少量具名饰品，其价值由**已有世界信号派生** + 噪声 + 负向漂移"，而非订单簿/供需引擎：

- **持有**：玩家可在现有商店/事件买入少量具名饰品（`skinHoldings: { id, name, costBasis, linkedSignal }[]`）。
- **当前价值（按需派生，不持久化价格序列）**：
  `value = costBasis × hypeMultiplier × driftFactor`
  - `hypeMultiplier` 由**已存在的信号**读出，不新建市场：
    - **Major 周期**：临近/刚结束 Major 时整体上扬，之后回落（读赛历）。
    - **关联选手表现**：饰品挂钩某明星/战队（或"玩家签名款"挂钩玩家自己）→ 跟随该 `WorldPlayer.reputation` / 近期 `tournamentSnapshots` 成绩（Phase 3/4 已有数据）或玩家 fame。
    - **噪声**：`makeRng(hashString(session.id:skin:id:week))` 的确定性周噪声。
  - `driftFactor`：**随持有时间缓慢负向漂移 + 买卖价差/手续费** → 被动持有期望为负。
- **结果形态**：偶发大涨（明星爆发 / Major hype）让**少数**玩家获利；但**期望 ≤ 0**，多数人持有亏损或打平 → 符合"靠 CS 理财成功的是少数"。
- **定位**：金钱 sink + 偶发横财 + flavor，**不是收入来源、不是稳定理财**。与现有 betting/skin-scam 事件并存，互为"赌博 vs 半投机"的两端。
- **明确不做**：供需撮合、全市场价格表、可被刷的稳定套利。价格永远是 `f(既有状态)+噪声`，读时计算。

---

## 7. 数据结构

```ts
// Player 增
marketValue: number;
incomeStreams?: IncomeStreams;        // streaming / sponsorship
agent?: { signed: boolean; cutRate: number };
skinHoldings?: SkinHolding[];
```

- `money` 维持在 `Stats`；**运行时受 `MONEY_MAX` 上限约束**，本次须提升上限（实现方案 §8）；拆出 `Stats` 为独立账户字段是可选清理，非本次必须。
- 奖金/收入流入账统一经 `applyMoneyTransaction`（`money.ts:15`）。

---

## 8. 平衡与长程（接 cross-cutting §7）

把经济健康不变量并入长程模拟测试：

- **source/sink 平衡**：不出现"中期人人破产"或"晚期钱溢出无意义"——典型生涯净值曲线先紧后宽再有 sink。
- **fame 收入有界**：经常性收入不超过竞技收入主导地位。
- **身价曲线**：marketValue 随年龄先升后降，老将晚期减薪可观测。
- **饰品期望为负**：长程跑大量持有者，平均亏损、少数暴富（分布右偏）。

---

## 9. 迁移

- 新字段（`marketValue`/`incomeStreams`/`agent`/`skinHoldings`）全可选，旧档缺省（marketValue 由当前成绩/fame/age 初始化，其余空）→ 并入 cross-cutting §8 的统一 `schemaVersion` 迁移。
- 奖金改名次梯度：旧的近定额 `reward.money` 退为"无 Phase 4 实例时的兜底值"。

---

## 10. 实施步骤（PR 切分）

1. **收入流 + 名次奖金**（§2）：`IncomeStreams` 入账（接 salaryTracker 周期）；奖金按 Phase 4 `finalPlacement` 分成。纯加，先见正反馈。
2. **球员身价**（§3）：`marketValue` 派生 + 接续约涨薪；Phase 5 转会费。
3. **支出与 sink**（§4）：经纪人抽成、生活/税缩放、晚期 sink（接名人堂）。
4. **系统联动**（§5）：目标绩效奖金、capital 预算门槛、奖金归属。
5. **饰品风险资产**（§6）：派生价值 + 负漂移，挂已有信号。
6. **平衡与长程断言**（§8），并入 cross-cutting §7 测试。

第 1 步即显著改善"收入太薄"；2-3 步让经济成为生涯弧；4-5 步联动与 flavor；6 步收口。

---

## 11. 红线重申

- **选手视角理财，不做经理财务**：俱乐部 capital 只做门槛级"能/不能"，不出报表。
- **竞技为主、内容为辅**：fame 收入是补充，不喧宾夺主。
- **饰品不是收入**：派生波动 + 负期望，多数失败、少数暴富，不引入新市场引擎。
