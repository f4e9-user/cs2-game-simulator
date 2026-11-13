# 个人 Stage 与新手入队重构设计方案

> 文档状态：设计完成，待实施  
> 文档日期：2026-06-24  
> 目标落地日期：2026-06-24  
> 适用范围：个人 stage、青训申请、新手试训、赛季结算、职业身份反馈

---

## 1. 背景

当前系统里有两套容易混淆的概念：

1. `player.team.tier` 表示当前战队层级。
2. `player.stage` 表示玩家个人职业身份。

这两者现在只做了部分联动，导致两个问题：

- 玩家容易把“战队掉级”理解为“个人 stage 也应该立刻掉级”。
- 新手进入青训战队的入口偏硬，要求先有赛事履历，早期节奏不顺。

本方案要做的不是把两者重新绑死，而是把它们拆开，让：

- 战队 tier 负责世界生态位和赛季升降级。
- 个人 stage 负责玩家的职业身份、市场位置和成长阶段。
- 新手入队不再被赛事履历卡死。

---

## 2. 设计目标

1. 个人 stage 可以升降，但不跟战队 tier 强绑定。
2. 战队升降级时，玩家队伍 tier 要同步，个人 stage 只按规则调整。
3. 新手申请青训战队不再需要硬性赛事门槛。
4. 赛事履历、天赋、名气和背景共同决定入队成功率与初始合同。
5. 所有阶段变化都要有明确事件和 UI 提示，不能静默发生。

---

## 3. 核心定义

### 3.1 个人 stage

个人 stage 只表示玩家本人目前被市场和赛事体系认可到什么层级：

- `rookie`：未进入职业/青训体系
- `youth`：青训/学院身份
- `second`：二线职业身份
- `pro`：职业身份

个人 stage 不等同于当前战队 tier。

> 注：代码层 `STAGE_ORDER` 中还存在终态 `retired`。`retired` 不参与本方案的升降逻辑，仅由退役/离开体系流程单独处理，下文不再展开。

### 3.2 战队 tier

战队 tier 表示队伍所处生态位：

- `youth`
- `semi-pro`
- `pro`
- `top`

战队 tier 负责：

- 世界模拟升降级
- 赛事资格
- 战队展示标签
- 转会市场定位

### 3.3 阶段关系原则

- 战队 tier 可以升降。
- 个人 stage 可以升降。
- 战队 tier 变化不会直接等于个人 stage 变化。
- 玩家在更强战队中时，个人 stage 最低不会低于该队伍所需的职业身份下限。

---

## 4. 总体方案

本方案分三阶段落地。

### 第一阶段：新手入队改造

目标是让 `rookie` 玩家可以直接申请青训战队，不再被“必须打过赛事”卡死。

### 第二阶段：个人 stage 晋级规则

目标是让个人 stage 由赛事履历和市场表现驱动，形成稳定的成长路径。

### 第三阶段：个人 stage 降级与赛季反馈

目标是让个人 stage 具备风险和回落机制，但降级慢、明确、有事件反馈，不会因为战队掉级而直接掉身份。

---

## 5. 第一阶段设计：新手入队改造

### 5.1 规则

`rookie` 玩家在没有战队时，可以直接申请青训战队。

申请不再要求先完成 C/B 级赛事履历。

赛事履历改为“加分项”，不是“准入门槛”。

只有青训战队对无赛事履历玩家开放直接申请。二线、职业、豪门战队仍按现有门槛和市场逻辑筛选。

### 5.2 申请结果分层

申请青训战队时，系统输出三类结果：

1. **直接通过**
   - 条件足够强
   - 进入 `youth` stage
   - 初始合同可给轮换或试训以外的身份

2. **试训通过**
   - 条件一般
   - 进入 `youth` stage
   - 初始身份为试训、轮换或第六人

3. **申请失败**
   - 条件不足
   - 返回明确原因
   - 允许继续刷天梯、名气或特质再申请

### 5.3 申请评分

青训申请使用固定评分，不再使用硬门槛。

基础分为 35 分。

加分项：

- C/B 级赛事参赛：每场 +5，最多 +20（按 `tierParticipations` 中 `c` + `b` 之和计）
- B 级赛事参赛：每场额外 +5，最多 +10（在上一条基础上，仅 `b` 部分再加）
- C/B 级赛事冠军：每次 +12，最多 +24（按 `tierChampionships` 中 `c` + `b` 之和计）
- `aim-god`：+18
- `tactical-mind`：+12
- `ice-cold`：+10
- `grinder`：+8
- `support-soul`：+8
- fame：每 2 点 fame +1，最多 +12
- 青训相关背景：+10
- 地区匹配：+6

> 特质判定：上表用的是 trait ID（`aim-god` 等，均已在 `data/traits.ts` 中存在）。实现时统一按 trait ID 命中，不再走现有 `applyClubRequest` 里的 trait tag（`aimer`）判断，避免两套口径并存。

扣分项：

- stress ≥ 70：-8
- fatigue ≥ 75：-8
- 存在禁赛、作弊、假赛相关标签：-30

评分结果（与 5.2 的三类结果一一对应）：

- 分数 ≥ 85：直接通过（首发竞争身份，即"轮换/试训以外"）
- 分数 50-84：试训通过（试训 / 轮换 / 第六人身份）
- 分数 < 50：申请失败

> 修订说明：原稿把"直接通过"定在 ≥75，但 5.4 又把 75-84 划成"轮换"合同，与 5.2"直接通过 = 轮换/试训以外的身份"冲突。现统一为：**只有 ≥85 才是直接通过（首发级）**，50-84 一律归入"试训通过"，其内部再按 5.4 细分合同身份。这样 5.2 / 5.3 / 5.4 三处语义完全一致。

申请失败时不进入冷却惩罚，只给短冷却，避免新手早期被完全卡死。

### 5.4 合同结果

青训申请通过后的合同按分数生成：

- 分数 ≥ 85：首发竞争，薪资按青训基础薪资 100%
- 分数 75-84：轮换，薪资按青训基础薪资 80%
- 分数 50-74：试训或第六人，薪资按青训基础薪资 60%

分数 < 50（申请失败）不生成合同，返回拒信文案。

成功后：

- `player.stage` 设为 `youth`
- `player.team.tier` 为目标青训战队 tier
- 清除 `applying`、`interview-pending` 等申请状态
- 写入入队事件文案

### 5.5 与现有申请事件链的接管关系

现有青训申请走的是**随机检定 + 事件链**，而非算分：

1. `applyClubRequest` 写入 `pendingApplication` 与 `applying` 标签。
2. 到 `responseRound` 后，`events.ts` 合成 `application-response-ready`，注入 `chain-club-response`（experience/intelligence 检定，DC 9，可能失败）。
3. 成功后写 `interview-pending` → `interview-ready`，注入 `chain-club-interview` / `chain-club-interview-open-match` / `chain-club-interview-talent`（再做一次属性检定）。
4. 面试成功后由 `game.ts` 的战后处理 `generateTeamOffer(app.clubId)` 生成 `pendingOffer`，再经 `respondTeamOffer` → `joinTeamFromOffer` 入队。

本方案的固定评分**接管青训路径的判定**，做法如下：

- **评分时机**：评分所需输入（履历、特质、fame、背景标签、地区、stress/fatigue、违规标签）在 `applyClubRequest` 时已全部已知，因此分数在申请那一刻一次性算定，将 `applicationScore`（数值）与 `applicationResult`（`pass` / `tryout` / `reject`）写入 `pendingApplication`。
- **事件退化为叙事皮**：`chain-club-response` 与 `chain-club-interview*` 仍可保留用于叙事呈现，但其成功/失败**不再掷骰**，改为直接读取 `pendingApplication.applicationResult`：
  - `reject` → 走拒信叙事，不生成 offer。
  - `pass` / `tryout` → 由 `game.ts` 战后处理生成 offer，且 offer 的初始身份与薪资按 5.4 的分数档位确定（不再用 `generateTeamOffer` 的默认薪资区间）。
- **接管范围按战队 tier 限定**：上述 `chain-club-*` 事件是 `rookie/youth/second/pro` 共用的。接管**只作用于目标战队 tier 为 `youth`（即 `requiredStage === 'youth'`）的申请**；二线、职业、豪门申请仍走原有随机检定与 roll bonus（`clubApplicationRollBonus`）逻辑，不受影响。
- **结果即时性**：由于结果已在申请时定下，可选择把青训路径的两段检定合并为单段"申请回复"事件直接给出 通过 / 试训 / 失败 三类文案，省去中间面试检定。是否合并由实现取舍，但判定来源必须是 `applicationResult`，不得再受属性检定影响。

> 设计原则：青训入队从"两次掷骰"改为"一次算分 + 纯叙事反馈"，让新手早期节奏可预期；高层级申请保留随机性与博弈空间。

### 5.6 第一阶段改动范围

第一阶段只改以下内容：

- 青训申请 eligibility（移除 `applyClubRequest` 中 rookie 的 `hasOpenMatchPath || hasTalentPath` 硬门槛抛错，`club.ts:189-206`）
- 青训申请评分（新增固定评分函数，写入 `pendingApplication.applicationScore` / `applicationResult`）
- 青训路径的事件链判定接管（`chain-club-response` / `chain-club-interview*` 在 youth tier 下读 `applicationResult`；`game.ts` 战后处理按档位生成 offer）
- 青训申请结果文案
- 入队后的 `rookie -> youth`
- 相关测试

第一阶段不改二线、职业、豪门申请规则。

---

## 6. 第二阶段设计：个人 stage 晋级规则

### 6.1 升级触发

个人 stage 的升级由两条路径触发。

#### A. 个人履历路径

- `rookie -> youth`
  - 进入青训战队即可触发
  - 重点看是否完成首次职业化落点

- `youth -> second`
  - B 级赛事参赛、冠军、深度表现达到门槛
  - 这是个人从青训身份进入二线职业身份的关键门槛

- `second -> pro`
  - A 级赛事参赛、冠军、深度表现达到门槛
  - 同时要求名气或市场评价达到最低线

#### B. 跟队升级路径

当玩家所在战队 tier 升级时，如果玩家个人 stage 低于该战队所需最低身份，则自动抬升到最低身份。

例如：

- 队伍从 `youth` 升到 `semi-pro`，玩家至少应处于 `second`
- 队伍从 `semi-pro` 升到 `pro` 或 `top`，玩家至少应处于 `pro`

这条规则只负责“下限抬升”，不负责个人 stage 的完整晋级。

### 6.2 阶段门槛

各 stage 的门槛固定如下：

- `rookie -> youth`
  - 通过青训签约或试训录用

- `youth -> second`
  - B 级赛事参赛 ≥ 3
  - B 级赛事冠军 ≥ 1
  - 或玩家所在战队升至 `semi-pro`，且玩家当前仍低于 `second`

- `second -> pro`
  - A 级赛事参赛 ≥ 3
  - A 级赛事冠军 ≥ 1
  - fame ≥ 25
  - 或玩家所在战队升至 `pro` / `top`，且玩家当前仍低于 `pro`

赛事冠军只统计玩家实际参与过的赛事结果，不使用世界模拟里其他队伍的结果。

> fame 阈值对齐：`second -> pro` 的晋级 fame 门槛由原稿的 20 提升到 **25**，与 7.2 中 `pro` 的降级市场线（fame ≥ 25）一致。否则会出现 fame 20-24 的玩家刚升上 `pro` 就立刻满足 `pro` 的降级市场线（+2 压力分）的夹层问题。

### 6.3 晋级流程

晋级流程固定为：

1. 每次赛事结算后检查个人履历门槛。
2. 每次赛季 rollover 后检查跟队升级下限。
3. 满足条件时写入 `promotionPending`。
4. 下一个事件阶段弹出晋级事件。
5. 玩家确认后应用 stage 变化。

跟队升级下限允许直接同步 stage，因为它是队伍整体进入更高生态位后的身份校准；个人履历晋级仍走事件确认，让玩家看到原因和反馈。

> 与第 9 节"不能静默"对齐：跟队下限抬升虽然**直接同步** stage（不需要玩家确认），但仍必须补一条**通知型事件/动态**（非确认弹窗），告知"因战队升入更高生态位，个人身份同步抬升至 X"。即"直接同步"指的是不需要玩家点确认，而非不产生任何提示。当前 `worldClubs.ts` 的 `syncPlayerTeamTierFromRuntime` 是静默改值，第二阶段需补这条提示。

### 6.4 UI 表现

阶段变化后，系统必须输出：

- 个人 stage 变化提示
- 新 stage 名称
- 触发原因
- 下一阶段目标

例如：

- “个人身份提升为二线职业”
- “A 级赛事履历达到职业门槛”

### 6.5 第二阶段改动范围

第二阶段只改以下内容：

- 个人晋级门槛判断
- 跟队升级时的个人 stage 下限同步
- 晋级事件文案
- CareerInsight 中的下一阶段目标
- 相关测试

---

## 7. 第三阶段设计：个人 stage 降级与赛季反馈

### 7.1 降级原则

个人 stage 不会因为战队掉级而直接下降。

降级只在赛季结算中发生，而且需要同时满足多个压力条件。

### 7.2 降级条件

满足以下条件中的多项时，才允许个人 stage 降一级：

降级不直接看单个条件，而是看赛季末压力分。

压力分规则（赛事 tier 用 `TournamentTier` 内部键，见下方对照）：

- 当前 stage 为 `pro`，本赛季没有 `s-class`（S 级正赛）、`s-open` / `s-closed`（S 级预选）或 `major` 深度成绩：+2
- 当前 stage 为 `second`，本赛季没有 `a` 级深度成绩：+2
- fame 低于当前 stage 市场线：+2
- 无队持续 ≥ 12 周：+2
- 当前战队 tier 低于个人 stage 对应下限，且持续 ≥ 16 周：+1
- 最近 4 场高等级赛事早早出局 ≥ 3 场：+1
- stress ≥ 85 或出现压力崩溃标签：+1
- 伤病休养累计 ≥ 8 周：+1
- 禁赛、作弊、假赛相关标签存在：+3

> tier 键对照：`TournamentTier` 权威定义为 `'c' | 'b' | 'a' | 's-open' | 's-closed' | 's-class' | 'major'`（见 `backend/src/types.ts`）。注意 `stages.ts` 的 `TIER_LABELS` 与 `choice.ts` 里残留了 `s-main` / `s-qualifier` 等**不在该类型内的死键**，本方案的压力分计算一律以 `tierParticipations` / `tierChampionships` 中实际记录的上述权威键为准，实现时不要引用死键。

市场线：

- `pro`：fame ≥ 25
- `second`：fame ≥ 10
- `youth`：不检查 fame

降级判断（依赖跨赛季留存的上赛季 level，见 8.2）：

- 压力分 0-2：本赛季 level = `none`
- 压力分 3：本赛季 level = `watch`
- 压力分 4-5：本赛季 level = `at_risk`
- 压力分 ≥ 6：如果**上赛季 level 已是 `at_risk`**，则降一级，本赛季 level 重置为 `none`；否则本赛季 level = `at_risk`，不降级

> 跨赛季依赖说明：判定"上赛季是否 `at_risk`"需要保留上赛季结算后的 level。因此赛季 rollover 时**先把上赛季的 `stagePressure.level` 读出作为对照，再计算本赛季压力分并写入新的 level**；未触发降级时该 level 必须随赛季留存，供下赛季比较（不能清空）。只有在"实际降级"时才把 level 归零（见 7.3）。这样"连续高危→降级"链路才成立：第一季压力分 ≥4 进入 `at_risk`，第二季压力分 ≥6 且上季为 `at_risk` 时降级。

最低降到 `youth`。`youth -> rookie` 不通过赛季压力触发，只能通过长期无队和退役/离开体系事件处理。

### 7.3 降级结果

降级时输出明确事件：

- “职业身份下滑”
- “市场价值受损”
- “重新回到二线竞争区间”

不会静默改值。

降级后：

- `pro -> second`
- `second -> youth`
- 将 `stagePressure` 重置为 `level: 'none'`、`score: 0`、`reasons: []`，并把 `season` 更新为新赛季（即"实际降级"才清零，未降级只是滚动留存 level，见 7.2）
- 写入一条社交动态或职业动态
- CareerInsight 更新下一阶段目标

### 7.4 与战队掉级的关系

战队掉级只改 `player.team.tier`。

个人 stage 是否变化，取决于赛季结算条件，不受战队掉级直接影响。

这样可以保留以下体验：

- 玩家仍是职业选手，但战队掉到二线
- 玩家仍能以职业身份寻找更强队伍
- 队伍层面的波动，不会立刻吞掉个人成长

### 7.5 第三阶段改动范围

第三阶段只改以下内容：

- `stagePressure` 数据结构
- 赛季末个人压力分计算
- 个人降级事件
- CareerInsight 风险提示
- 社交动态/职业动态输出
- 相关测试

---

## 8. 数据与状态要求

### 8.1 需要保留的现有数据

- `player.stage`
- `player.team.tier`
- `player.tierParticipations`
- `player.tierChampionships`
- `player.fame`
- `player.stress`
- `player.tags`
- `player.team` 当前合同信息

### 8.2 需要新增的状态

新增一个个人身份压力状态：

```ts
interface StagePressureState {
  /** 本赛季结算后的压力档位 */
  level: 'none' | 'watch' | 'at_risk';
  /** level 所属赛季，rollover 时更新 */
  season: number;
  /** 本赛季压力分 */
  score: number;
  /** 压力分构成原因，用于 UI/动态文案 */
  reasons: string[];
  /** 最近一次评估的 round */
  evaluatedRound: number;
}
```

用途：

- 记录玩家是否处在”身份不稳”区间
- 用于赛季末判断是否允许降级
- 用于 UI 呈现职业压力

跨赛季留存约定（与 7.2 / 7.3 配套）：

- 该状态**整体跨赛季保留**，不在每个赛季初清空。
- 赛季 rollover 计算压力分时，先读旧的 `level` 作为”上赛季 level”对照，再用新分数覆盖 `level`、`score`、`reasons` 并把 `season` 更新为新赛季。
- 仅当”实际降级”发生时把 `level` 归零（见 7.3）。
- 因此无需额外的 `previousLevel` 字段——“上赛季 level”就是 rollover 计算前 `stagePressure` 里那个尚未被覆盖的 `level`（其 `season` 比当前小 1）。

`stagePressure` 只存在于玩家状态，不写入战队 runtime。

### 8.3 现有 world club 同步

战队升降级结算后：

- 同步玩家所属战队 tier
- 必要时抬升个人 stage 下限

tier 同步逻辑（`worldClubs.ts` 的 `syncPlayerTeamTierFromRuntime`）已和世界模拟升降级兼容，且 `nextStage` 只取 max、从不下降，因此"战队掉级不直接降个人 stage"无需额外改动。**唯一需补充的是 stage 下限抬升时的通知型事件**（当前是静默改值，见 6.3 / 第 9 节）。

---

## 9. 事件与文案

所有 stage 变化都要有事件：

- 入队
- 晋级（个人履历晋级：确认型事件）
- 跟队下限抬升（通知型事件/动态，不需玩家确认，但必须提示，见 6.3）
- 受压
- 降级

事件分两类：**确认型**（玩家点确认后才应用，如个人履历晋级）与**通知型**（变更已应用，仅告知，如跟队下限抬升、降级结算结果）。两类都算"事件"，关键是 stage 变化不能完全无提示地静默发生。

事件必须包含：

- 原因
- 当前 stage
- 下一 stage
- 影响

玩家看到的是“为什么变了”，不是只有一个数值变化。

---

## 10. 第一阶段交付清单

第一阶段完成后，应满足：

1. `rookie` 玩家可直接申请青训战队。
2. 青训申请不再依赖赛事履历作为硬门槛。
3. 履历、天赋、名气、背景只影响成功率和初始合同。
4. 申请结果分成通过、试训通过、失败三类。
5. 新增测试覆盖无赛事履历申请青训、天赋申请青训、低分失败三条路径。

---

## 11. 第二阶段交付清单

第二阶段完成后，应满足：

1. `youth -> second` 可由 B 级履历触发。
2. `second -> pro` 可由 A 级履历触发。
3. 战队升档可抬升个人 stage 下限。
4. UI 能展示个人 stage 变化原因和下一阶段目标。
5. 新增测试覆盖履历晋级、跟队晋级、未达 fame 不晋级三条路径。

---

## 12. 第三阶段交付清单

第三阶段完成后，应满足：

1. 个人 stage 可以在赛季末降级。
2. 战队掉级不会直接导致个人 stage 掉级。
3. 降级有压力状态作为前置反馈。
4. 玩家能在 UI 中看到职业身份受压与回落原因。
5. 新增测试覆盖压力观察、压力高危、连续高危降级、战队掉级不直接降个人 stage 四条路径。

---

## 13. 结论

这个方案的核心不是让玩家“更难升级”，而是让身份系统更像职业生涯：

- 战队有升降级
- 个人有晋级和回落
- 新手能更早进入体系
- 高级身份不再完全依赖战队名义

这样，玩家会更清楚地感受到自己是在经营一个职业生涯，而不是只在追着某个战队 tier 跑。
