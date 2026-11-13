# 实现路线图：按风险从低到高的落地顺序

> 文档状态：总纲（归纳全部设计/实现文档 + 风险驱动的落地顺序）
> 文档日期：2026-06-27
> 机制基线：c362cdf（RoundPlan / worldNews / worldClubs rollover）

## 0. 文档清单

| 领域 | 设计 | 实现细化 |
|---|---|---|
| 个人 stage + 新手入队 | `player-stage-and-rookie-entry-design.md` | （含于设计，3 阶段） |
| 未来赛事预报名 | `2026-06-24-future-tournament-preregistration-design.md` | （含于设计） |
| 俱乐部身份/赛季目标/重建（总） | `club-identity-season-goal-rebuild-design.md` | 见下分 Phase |
| └ Phase 1-2 身份数据+运行态 | — | `phase1-2-club-identity-implementation.md` |
| └ Phase 3 WorldPlayer+年龄 | — | `phase3-worldplayer-age-implementation.md` |
| └ Phase 4 赛事实例+世界新闻真实化 | — | `phase4-tournament-instance-implementation.md` |
| └ Phase 5 世界转会 | — | `phase5-world-transfer-implementation.md` |
| └ Phase 6-7 赛季目标+评估 | — | `phase6-7-season-goal-implementation.md` |
| └ Phase 8 重建事件链 | — | `phase8-rebuild-event-chain-implementation.md` |
| 跨领域系统 | `cross-cutting-systems-design.md` | （代际/复合压力/事件仲裁/rollover时序/AI/VRS/长程/迁移/信息披露） |
| 经济系统 | `economy-system-redesign.md` | `economy-system-implementation.md` |

## 1. 风险评估维度

- **依赖**：必须前置的系统。
- **爆炸半径**：触及共享热路径（`choice.ts`/`events.ts`/`matchSimulator`/`worldClubs`/持久化）越多越险。
- **独立性**：纯新增模块 < 小幅修改 < 类型迁移 < 事件系统改造。
- **机制依赖**：是否依赖 c362cdf 的 RoundPlan/事件机制稳定。

两个**高风险关键支点**（单独小心、配测试）：
- **Phase 3 的 `ClubPlayer→WorldPlayer` 迁移**：动持久化类型 + 多消费者 + 比赛引擎注入。
- **事件链改造（Phase 8 / player-stage 面试接管 / 转会事件）**：依赖 RoundPlan 稳定 + 多链共存仲裁。

---

## 2. 落地波次（低风险先行）

### Wave 0 — 低风险地基（先于一切功能）
**目的**：用最小改动给后面所有功能搭"安全网"，强烈建议最先做。

1. **cross-cutting §8 迁移骨架**：`GameSession.schemaVersion` + 有序 `migrateSession`。之后每个功能的新字段都折进来，杜绝旧档炸。
2. **cross-cutting §4 统一 rollover 时序**：先把 12 步顺序定死（此时多为占位），后续世界系统按编号挂钩，不私自插队。
3. **economy §8 `MONEY_MAX` 校准**：999→9999（K 单位不变）。改动极小、零依赖，解锁后续经济。

> 风险：极低（基础设施/常量/骨架）。收益：去掉后面所有波次的迁移与集成风险。

### Wave 1 — 独立低风险功能（快速正反馈）
**目的**：交付可玩改进，互不依赖、不碰事件/世界核心。

1. **预报名（基础调度）**：`signup` 改 `resolveWeek=目标窗口周+2`、`calendarBlocks` 出 `preregister`、前端按钮。**完全自包含**，不依赖 club-identity、不碰事件系统。（§8.5 阵容锁定**延后**到 Phase 4 有 `TournamentInstance` 再做。）
2. **Phase 1-2 俱乐部身份数据+运行态**：加 `heritage/capital/clubArchetype`、archetype→ClubProfile、小幅运行态修正、`capitalSalaryMultiplier`。**纯加 + 小修**，是整套 club-identity 的数据地基。

> 风险：低。预报名零跨系统；Phase 1-2 仅小幅触 `worldClubs`/`clubProfiles`/`generateTeamOffer`。

### Wave 2 — 关键迁移支点（小心做）
1. **Phase 3 WorldPlayer + 年龄**：`fullRoster: ClubPlayer[]→WorldPlayer[]`、删 `ClubPlayer`、年龄注入 `matchSimulator:169`/成长/赛季钩子、年龄→角色契合（§3.4）。**借 Wave 0 迁移骨架**逐字段/重生成处理旧档。

> 风险：中高（迁移持久化类型 + 动比赛引擎）。但它是 Phase 4/5/6-8 与经济 `marketValue` 的地基，绕不过——单独成 PR、重测确定性。

### Wave 3 — 世界赛事 + 经济正反馈
**目的**：把"真实赛事"和"收入正反馈"立起来。

1. **Phase 4 赛事实例 + 世界新闻真实化**：`TournamentInstance`、对手注入切换、轮次推进、单一真相源（§8.6）、背景 Tier1（+按需 Tier3）。依赖 Phase 3（MVP）+ Phase 1-2（参赛场）。**顺带解锁预报名 §8.5 阵容锁定**。
2. **cross-cutting §6 VRS 重做**：滚动 1 年窗口 + 封顶 2000 + 梯度。围绕 Phase 4 做（喂种子/奖金）。爆炸半径中（`computeClubVrsScore` 多处被读），随 Phase 4 一起测。
3. **economy 净发薪 + 收入流 + 名次奖金**：`income.ts`、发薪管线（`choice.ts:1238`）、名次梯度奖金（`stageRewardDelta`，接 Phase 4 `finalPlacement`）。

> 风险：中。Phase 4 较重但多为新增 + 单一集成缝（对手注入）；VRS 改动需回归 seeding/eligibility。

### Wave 4 — 玩家身份 + 事件链（需 RoundPlan 稳定）
**目的**：上事件驱动的身份/压力玩法，**前提是先有事件仲裁**。

1. **cross-cutting §3 事件仲裁 + §2 复合压力**：多链共存前必须先定优先级与逆境预算闸门。
2. **player-stage 重构**：新手入队评分接管面试链（依赖事件机制稳定）。
3. **Phase 6-7 赛季目标 + 评估**：依赖 Phase 4 成绩；挂 rollover/入队/careerInsight。
4. **Phase 8 重建事件链**：依赖 Phase 6-7（rebuildPressure）+ RoundPlan + 角色系统；coreStatus→经济（接经济）。

> 风险：中高（事件系统多链共存）。务必 §3 仲裁先行，否则链互相挤。

### Wave 5 — 交汇 + 世界长期健康（依赖最全，最后）
1. **Phase 5 世界转会**：消费身份/WorldPlayer/年龄/目标/重建/新闻——交汇点，最后接。
2. **cross-cutting §1 世界代际更替**：退役+青训+突破新闻（依赖 Phase 3 年龄 + Phase 4 数据 + Phase 5 mint）。
3. **economy 身价 + 转会费 + 晚期 sink + 饰品**：`marketValue`（依赖 Phase 3+5）、签字费、经纪人/生活税、饰品派生。
4. **cross-cutting §5 AI 一致性、§9 信息渐进披露**：随上述状态完善时接。
5. **cross-cutting §7 长程验证**：贯穿全程，在此固化为 10+ 赛季健康回归（含经济不变量）。

> 风险：高（依赖最多）。放最后，前置都稳了再接。

---

## 3. 一句话顺序

**Wave 0 地基（迁移骨架 / rollover 时序 / MONEY_MAX）→ Wave 1 预报名 + 身份数据 → Wave 2 WorldPlayer+年龄（关键迁移）→ Wave 3 赛事实例 + VRS + 收入/奖金 → Wave 4 事件仲裁 + player-stage + 赛季目标 + 重建 → Wave 5 转会 + 代际 + 身价/饰品 + 长程验证。**

原则：**先搭安全网（Wave 0），再做自包含快赢（Wave 1），关键迁移单独小心（Wave 2），世界与经济正反馈（Wave 3），事件链需仲裁先行（Wave 4），交汇系统最后（Wave 5）。**
