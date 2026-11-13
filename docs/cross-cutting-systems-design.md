# 跨领域系统设计：世界长期健康、系统集成与一致性

> 文档状态：设计（补三方案落地后暴露的系统性盲点）
> 文档日期：2026-06-27
> 适用范围：跨 Phase 的系统级议题，不属于单一 Phase
> 关联：player-stage / preregistration / club-identity（Phase 1-8）各实现方案
> 机制基线：c362cdf（RoundPlan、worldNews、worldClubs rollover）

本文件覆盖头脑风暴中确认的系统性缺口：世界代际更替（§1）、复合下行压力（§2）、事件链仲裁（§3）、统一 rollover 时序（§4）、AI 一致性（§5）、VRS 长期模型（§6）、长程验证（§7）、累积迁移（§8）、信息渐进披露（§9）。

> 经济系统重构（收入流 / 球员身价 / 金钱去处 / 饰品风险资产）单列于 [economy-system-redesign.md](./economy-system-redesign.md)；其 §6 VRS 与本文 §6、其经济健康不变量与本文 §7 长程验证互相衔接。

> 补：玩家退役/生涯终局**已存在**（`ending.ts` 的 `checkEnding`：legend/champion/retired_on_top/loyal-veteran/quiet_exit 等 + 主动结束 + `finalizePlayerCareerSnapshot` 名人堂结算）。唯一需对齐：Phase 3 年龄系统要与现有 `MAX_ROUNDS`/结局阈值协调，别出现"38 岁还在硬打且无衰退结局"——年龄进入 twilight 且属性大幅衰减时，应提高触发 `retired_on_top`/主动退役提示的权重（见 §4 时序第 3 步后挂一个年龄退役检查）。

---

## 1. 世界代际更替（#2）

**问题**：Phase 3 让世界选手也每赛季 +1 岁，但无退役 + 无新血 → 跑 N 季后全联盟塞满 35+ 老将，世界腐朽。Phase 5 仅在转会缺人时 `mint`，不是代际管线。

**机制**：每赛季 rollover（§4 时序第 5 步）跑一次"代际更替"：

1. **退役判定**：`WorldPlayer.age ≥ 退役线`（如 33-36，按 archetype/reputation 抖动，明星打更久）且 `roleFitScore(ageAdjusted)` 持续低 → 退役，移出 `fullRoster`，写 `TransferRecord`(type 可加 `'retirement'`) + 退役新闻。
2. **青训出新**：每队按 `clubArchetype` 产出新生代 `WorldPlayer`（`development-factory` 产更多更强），`age 16-19`、`archetype: 'rookie-prospect'`、初始低 reputation、确定性派生。补满因退役/转会空出的首发位（复用 Phase 5 `mintWorldPlayer`，但这里是**主动管线**而非缺人兜底）。
3. **新星突破（叙事钩子）**：新生代中按潜力 + 赛事表现（Phase 4 Tier 3 的真实数据）检测"突破"——年轻选手在 S/Major 拿好成绩 → 打 `breakout-star` storyline，reputation 跃升。
4. **新闻/社媒**：经 `worldNews.ts` 新增 `buildWorldGenerationNews`：退役致敬、青训出道、新星统治。例：「donk(16) 决赛 1.4 rating carry，夺得 Major，统治力十足」——数据取自 Tier 3 的真实 `TournamentPlayerPerformance`。

**健康不变量**：退役流出 ≈ 青训流入，保持各队 5 首发 + 全联盟年龄分布稳定（§7 长程测试断言）。

**类型/落点**：`WorldPlayer.status` 增 `'retired'`；新增 `engine/generation.ts`（退役判定 + 青训生成 + 突破检测）；接 `rolloverWorldClubSeason`。依赖 Phase 3（age/roleFit）+ Phase 4（突破数据）。

---

## 2. 复合下行压力调节（#3）

**问题**：年龄衰减 + 重建压力 + 转会竞争 + 赛季目标失败 + 角色被夺，全是**向下压**。各 Phase 内部有局部防挫败，但无人管它们**叠加**——一季可能同时"打不动 + 目标失败 + 被签同位置 + 替补 + 被挂牌"。

**机制：全局逆境预算 `adversityLoad`**（玩家状态，滚动）：

- 每个**重型负面系统事件**（重建决定、转会内部竞争触发、赛季目标 failed 结算、角色被夺/benched、家庭危机、长期无队）发生时 `adversityLoad += 权重`，随回合衰减。
- **闸门**：当 `adversityLoad ≥ 阈值` 时，**抑制新的重型负面链起链**（重建/转会竞争等的触发条件加一条 `adversityLoad < 阈值`），把它们延后到压力回落——而非取消（保留 flag）。
- **跨系统缓冲**：同窗口内已触发一个重型负面大事件后，其余重型负面链进入冷却（复用 tag 冷却）。
- **与 RoundPlan 协同**：高 `adversityLoad` 时 `composeRoundPlan` 偏向 `light` tone、降 targetCount（c362cdf 已有 stress/fatigue 降档逻辑，扩展读 `adversityLoad`）。
- **正向对冲**：表现好/夺冠/晋级降低 `adversityLoad`，保证"低谷后有喘息"。

**目的**：负面体验有节奏、可恢复，而非雪崩。阈值与权重集中常量便于调。

---

## 3. 事件链仲裁与优先级（#4）

**问题**：新设计塞入多条链（重建 4 节点、转会队友被挖/被关注、角色转型、赛季目标反馈、晋级），都走 `dynamicTags`+优先注入抢每回合**唯一 anchor 槽**（`events.ts:424` 一串 if 块）。多链同时就绪时**谁先发**没定义，现状是硬编码 if 顺序。

**机制：单一仲裁器 + 明确优先级表**

把现有零散优先注入块收敛为一个有序仲裁：**进行中的链续接 > 关键不可延 > 其余按优先级**，落选链**保留 tag/flag 下回合再争**（不丢）。

| 优先级 | 类别 | 例 |
|---|---|---|
| 0 最高 | 进行中链的下一节点 | 重建链中段、面试链、转型 `prove` |
| 1 | 关键不可延 | 家庭危机、被开除、赛事比赛周（match） |
| 2 | 赛事上下文 | tournament-context / 赛前 |
| 3 | 重型决定 | 重建决定（critical/major-single） |
| 4 | 入队/面试起点 | interview-ready |
| 5 | 重型软节点 | 重建施压/传闻、转会内部竞争（受 §2 `adversityLoad` 闸门） |
| 6 | 中性 | 角色转型建议、队友被挖告别 |
| 7 最低 | 提示型 | 赛季目标反馈（多为通知，非 anchor） |

- 实现：把 `pickEvent` 里的若干 `if (synthTags.has(...)) return` 改为"收集所有就绪候选 → 按上表优先级排序 → 取最高 → 其余保留 flag"。
- 与 §2 联动：优先级 5 的链额外受 `adversityLoad` 闸门。
- 与 RoundPlan：仲裁出的 anchor 交 `composeRoundPlan`，后续 targetCount 仍按机制填充。

---

## 4. 统一赛季 rollover 时序（#5）

**问题**：`rolloverWorldClubSeason`（`worldClubs.ts:920`）现被 Phase 3/5/6-7/8 + 本文件 §1/§6 同时挂钩，步骤先后影响结果，各文档各说各的。

**定版时序**（一次 rollover 内，严格顺序）：

1. **升降级**（现有）：promotion/relegation、tier 更新、storyline。
2. **背景赛事结算**（现有 + Phase 4 §8 真实化）：出真实冠军/名次，回写 seasonPoints/recentResults。
3. **年龄 +1**：玩家 + 全世界选手（Phase 3 §5）。
4. **角色契合重算**：年龄变动后重算 `roleFitScore(ageAdjusted)`、角色压力（Phase 3 §3.4）。
5. **代际更替**（§1）：先退役（依赖 4 的契合判定）→ 再青训补位。
6. **转会窗口**（Phase 5）：需 tier（1）+ 退役空缺（5）就绪后才算需求；执行后刷新 roster/角色（Phase 5 §7.1）。
7. **赛季目标评估**（Phase 6-7）：成绩已知（2），结算 status + 影响。
8. **重建压力更新 + flag**（Phase 8）：基于 7 的 failed 结果。
9. **下赛季目标生成**（Phase 6-7）：含新 baseline。
10. **VRS 重算**（§6）：滚动窗口 + 归一化（所有结果/转会/代际已落定）。
11. **新闻产出**：赛事结果、转会、代际、突破（§1、Phase 5 §8、Phase 4 §8）。
12. **快照 / clamp / 截断**：seasonPoints 重置、form 衰减、history 滚动截断。

> 每步幂等、可单测；后续 Phase 实现时一律按此编号挂钩，禁止私自插队。

---

## 5. AI 事件与结构化状态一致性（#8）

**问题**：AI 事件层（`buildAiPickCandidates` / `ai/service.ts`）若不感知新结构化状态（`coreStatus`/`seasonGoal`/`age`/转会），会生成自相矛盾的剧情（AI 说"你是队魂"而 `coreStatus==='benched'`）。

**机制：上下文注入 + 矛盾过滤**

1. **喂状态进 AI 上下文**：构造 AI prompt/候选时带上关键结构化字段——`coreStatus`、`seasonGoal.type/status`、`age`/AgeBand、`activeRole`、最近转会、`rebuildPressure` 档。让生成的事件与处境一致。
2. **矛盾过滤**：对 AI 候选事件做一层一致性校验，**丢弃与当前状态冲突**的（基于 tag/语义标签）——如 benched 时丢弃"核心地位"类、目标已 failed 时丢弃"冲冠在望"类。复用现有 `forbidTags`/`requireTags` 机制：给 AI 事件标注其隐含前提 tag，状态不符即过滤。
3. **降级而非硬塞**：过滤后无合适 AI 事件则回落结构化事件池，不强出矛盾内容。

落点：`ai/service.ts` 上下文构造 + `events.ts` 的 `buildAiPickCandidates` 过滤层。

---

## 6. VRS 长期模型重做（#10）

**问题**：现 `computeClubVrsScore`（`worldClubs.ts:409`）是无界 ad-hoc 合成（baseline + seasonPoints×1.3 + form + trust + ...），无封顶、无滚动窗口、无对手梯度，长期会通胀失真。

**新模型（参照真实 VRS）**：

- **滚动窗口**：真实 VRS 取过去 6 个月；游戏取**过去 1 年（48 周）**的赛事结果。每条结果带 `week`，超窗口自动滚出。
- **封顶 2000，保留 1 位小数**。
- **梯度加分**：每条赛事结果 `pts = tierWeight × placementWeight × opponentQualityBonus`：
  - `tierWeight`：Major 最高 → s-class → s-open/closed → a → b → c 递减（Major/S 级加分最多）。
  - `placementWeight`：冠军 > 亚军 > 四强 > 深轮 > 小组出局（出局可为 0 或微负）。
  - `opponentQualityBonus`：**战胜高 VRS / Top 队加分更多**，形成梯度（赢强队才涨得快）。
- **归一化到 [0, 2000]**：累加窗口内 `pts` 得 raw，再用全局缩放因子映射，使**当前 #1 接近 2000**（或固定除数标定）；`round(x, 1)`。

**与现有的衔接**：

- `computeClubVrsScore` 改为读"滚动赛事结果列表"（新增 `runtime.vrsResults: { week, pts }[]`，每次 §4 时序第 2/6 步赛事/转会后追加），替换原 ad-hoc 合成。`form/trust/chemistry` 退回去只影响 `calculateClubPower`（即时战力），**不再混进 VRS**（VRS = 战绩，战力 = 即时强弱，二者分离）。
- 影响面：seeding（Phase 4）、对手挑选、`directEntryBypass.minVrsScore`、赛事中心展示——这些读 VRS 处语义不变（仍是 0-2000 的排名分），只是更真实。
- 迁移：旧档无 `vrsResults` → 用现有 `recentResults` + baseline 近似初始化一个窗口，或重算。

**长程**：滚动窗口天然防通胀（老结果滚出），封顶 2000 防爆表（§7 断言 VRS ∈ [0,2000] 且呈梯度分布）。

---

## 7. 跨赛季长程验证（#9）

**问题**：多数测试是单元级，但世界老化、VRS 通胀、转会漂移、找不到队等只在多赛季后暴露。

**机制：长程模拟集成测试** `longHorizon.test.ts`——确定性跑 10+ 赛季，每季 rollover 后断言世界健康不变量：

- **年龄分布有界**：各队均龄稳定（代际更替生效，无全员老化）。
- **每队 5 首发**：无空壳/空位（退役↔青训平衡）。
- **VRS 分布**：所有队 ∈ [0, 2000]、呈梯度、不单调通胀（§6）。
- **玩家可达性**：任意时点存在玩家可申请的队（青训入口不锁死，呼应 player-stage）。
- **无系统崩溃**：无 NaN/负值越界、无无限链、`adversityLoad` 不锁死。
- **代际产出**：N 季内有新星突破事件产生（§1 生效）。

---

## 8. 累积存档迁移（#11）

**问题**：各 Phase"可选字段 + 惰性回填"单看没问题，但跨所有 Phase 的旧档（老 `ClubPlayer` + 无 age + 无 instance + 无 seasonGoal + 旧 VRS）同时升级缺统筹。

**机制：全局 schemaVersion + 有序迁移**

- `GameSession.schemaVersion: number`；启动加载时跑 `migrateSession(session)`：按版本号顺序执行各迁移步（ClubPlayer→WorldPlayer、补 age、补 identity、初始化 vrsResults…），每步幂等。
- **世界侧优先重生成**：玩家未交互过的世界数据（fullRoster 等）直接按新规则**确定性重生成**，比逐字段回填更稳（Phase 3 §7.1 已提此策略，这里统一）。
- **玩家侧保守回填**：玩家本人字段（age、coreStatus、roleCrystallized…）不能重生成，按默认值回填。
- 各 Phase 文档的"迁移"小节统一指向此处，不各写一套。

---

## 9. 信息渐进披露（#12）

**问题**：新增信息面巨多（赛事中心、对手情报、赛季目标、重建状态、转会新闻、俱乐部身份、年龄），一次全砸会过载。`CareerInsight` 是聚合口但会爆。

**机制：按情境分层披露**（扩展 `buildCareerInsight`）

- **始终在**：当前 stage/目标 headline、`priorities`（已有 top-3）。
- **有队才显**：赛季目标面板、coreStatus/重建状态、队友/角色。
- **报名/进行中才显**：赛事中心、对手情报、路线图。
- **相关才显**：转会新闻只在涉及玩家队/关注玩家时进 priorities；背景转会/世界新闻进独立 feed（c362cdf 已有 weeklyNews/新闻 feed），不挤主界面。
- **按 stage 解锁复杂度**：rookie/youth 隐藏 VRS/Major 路线等高级信息，pro 全开（呼应 player-stage 身份成长）。
- 实现：`CareerInsight` 各板块加 `visibleWhen` 条件；前端按字段在则显、不在则隐，沿用 c362cdf 的 insight 驱动 UI。

---

## 10. 实施优先级

1. **§4 统一 rollover 时序** —— 所有世界级系统的执行骨架，先定，其余挂上去。
2. **§1 世界代际更替** + **§6 VRS 模型** —— 世界长期健康的两根支柱（无它们多赛季玩崩）。
3. **§3 事件仲裁** + **§2 复合压力** —— 玩家体验骨架，事件系统落地前必须定。
4. **§5 AI 一致性**、**§8 迁移**、**§9 渐进披露** —— 随相关 Phase 落地时一并接。
5. **§7 长程验证** —— 贯穿，作为以上所有的回归底座。
