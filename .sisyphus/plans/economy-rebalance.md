# 经济系统重平衡：月薪制 + 高风险波动 + 破产恢复

## TL;DR
> **Summary**: 将薪资从周薪改为月薪（effective 收入降为 1/4），保持事件高波动（-80K~+60K），大幅提高赛事奖金，引入借贷/救济/典当/打工等破产恢复机制，商店改为阶梯定价。
> **Deliverables**: 薪资发放逻辑重写、赛事奖金表重算、商店阶梯定价、5 个破产恢复子系统、前端 UI 适配
> **Effort**: Large
> **Parallel**: YES - 4 waves
> **Critical Path**: Wave 1（薪资+UI）→ Wave 2（奖金+商店）→ Wave 3（恢复系统，可并行）→ Wave 4（集成）

## Context
### Original Request
用户反馈"事件和战队薪资给的钱太多了"，要求将薪资改为月薪（值=当前周薪值），事件保持高风险波动，并增加破产恢复机制。

### Interview Summary
| 模块 | 最终决策 |
|---|---|
| 薪资频率 | 每 4 周自动发一次，中途离职按周数比例结清 |
| 薪资数值 | 保持当前 clubs.ts 中 salaryRange（youth 10-20K ~ top 70-150K），但频率从每周改为每月 |
| 事件金钱 | 保持当前值（skins.ts -80K~+60K, chains.ts +20K），不做阶段缩放 |
| 赛事奖金 | ×10-15 倍（netcafe 10K → Major 200K），让赛事成为有效收入源 |
| 商店定价 | 阶梯制：消耗品 3-5K / 服务 15-30K / 装备 30-150K / 社交 10-15K |
| 破产恢复-1 | 家人救济事件：money≤0 持续 2 周触发，给 20-40K，代价 fame-5 + stress+10 |
| 破产恢复-2 | 借贷系统：单利月息 10%，到期强制扣款，违约→fame-10+锁定转会 |
| 破产恢复-3 | 物品典当：永久卖出已购**装备**，按原价 50%（外设）/60%（人体工学椅）变现。消耗品和服务不可典当 |
| 破产恢复-4 | 战队援助：有战队时 money≤0 触发，俱乐部垫付 30-80K，但降薪 20%×12 周 |
| 破产恢复-5 | 打工行动：代练/陪玩/网吧打工，消耗 25AP，赚 3-8K，+fatigue+stress |
| 测试策略 | 计划中内置 QA 场景，无正式测试框架 |

### Metis Review (gaps addressed)
- ✅ 薪资发放时机 → 自动周期+离职结清
- ✅ 借贷利率与违约 → 单利 10%+强制扣款+fame 惩罚
- ✅ 物品典当模式 → 永久卖出（50%-60% 原价）
- ✅ 赛事奖金具体倍数 → ×10-15
- ✅ 中期加入/被踢的薪资规则 → 离职按比例结清，新加入从下个 4 周周期开始全额领取
- ✅ 多恢复系统叠加 → 允许，但各自有冷却（家人 24 周、借贷 12 周、战队 24 周）
- ✅ 打工行动 AP 占用 → 消耗 25AP，与正常训练/休息竞争
- ✅ 金钱 cap 溢出 → clamp 在 999K
- ✅ 合同续约与月薪解耦 → 续约仍按 48 周 tick，与薪资发放独立

## Work Objectives
### Core Objective
将经济系统从"周薪保底+事件小波动"改为"月薪紧张+事件高风险+多路径恢复"，让金钱管理成为有意义的游戏决策，前期挣扎、后期从容。

### Deliverables
1. 薪资发放逻辑：每 4 回合自动发放 + 离职按比例结清
2. 赛事奖金表：9 个赛事全部重新标定（×10-15）
3. 商店阶梯定价：4 类商品按新收入水平重定价
4. 家人救济事件池（3 个事件）
5. 借贷系统（借款/计息/扣款/违约）
6. 物品典当系统（卖出已购装备）
7. 战队援助事件（2 个事件）
8. 打工日常行动（3 个行动）
9. 前端 UI 适配（薪资标签、借贷界面、典当确认、负债显示）

### Definition of Done
- [ ] 新存档开局，youth 选手无战队，4 周无收入但可存活（via 初始资金 + 打工 + 救济）
- [ ] 月薪在第 4/8/12... 周自动入账，UI 显示正确金额和标签
- [ ] 中途被踢，当周期薪资按已服役周数/4 折算入账
- [ ] 赛事奖金为原值 10-15 倍，Major 冠军约 200K
- [ ] 商店消耗品 3-5K，服务 15-30K，装备 30-150K
- [ ] 借贷功能可借、计息、到期扣款、违约惩罚全部闭环
- [ ] 物品典当卖出后装备效果永久消失
- [ ] 所有恢复系统有冷却，不可无限刷钱
- [ ] `backend && npm run typecheck` 通过
- [ ] `frontend && npm run typecheck` 通过

### Must Have
- 薪资 cadence 改为每 4 回合
- 所有数值用 1=1K 单位，与现有系统一致
- 每个恢复系统有明确的触发条件、冷却、代价

### Must NOT Have
- 不做阶段缩放事件金钱（硬核路线）
- 不改变 money cap（保持 999K）
- 不改变 48 周合同续约逻辑
- 不做复利或复合借贷
- 不做典当赎回系统（永久卖出）
- 不新增正式测试框架（QA 场景在计划中内置）
- 不做信用评分/信用历史系统

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: tests-after — 每任务附带 QA 场景，全部任务完成后运行 F3 手工 QA
- QA policy: Every task has agent-executed scenarios with exact state/action/assertion
- Evidence: .sisyphus/evidence/task-{N}-{slug}.json (API responses / state snapshots)

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave.

Wave 1 (Foundation): 调试路由 + 薪资逻辑 + 类型定义 + 前端标签
Wave 2 (数值重标定): 赛事奖金 + 商店定价
Wave 3 (恢复系统 - 可高度并行): 家人救济 + 借贷 + 典当 + 战队援助 + 打工行动
Wave 4 (集成与验证): 边界条件 + 冷却叠加 + 前后端联调

### Dependency Matrix (full, all tasks)
| Task | Wave | Blocks | Blocked By |
|---|---|---|---|
| 0. Debug route | 1 | 2-13 (enables QA) | - |
| 1. Types | 1 | 2,4,5,6,7,8,9,10 | - |
| 2. Salary logic | 1 | 11,12 | 0,1 |
| 3. UI labels | 1 | - | - |
| 4. Tournament rewards | 2 | - | 0,1 |
| 5. Shop pricing | 2 | - | 0,1 |
| 6. Family bailout | 3 | - | 0,1 |
| 7. Loan system | 3 | - | 0,1 |
| 8. Item pawning | 3 | - | 0,1 |
| 9. Team bailout | 3 | - | 0,1 |
| 10. Grind actions | 3 | - | 0,1 |
| 11. Recovery integration | 4 | - | 2,6,7,8,9,10 |
| 12. Edge cases | 4 | - | 2,5 |
| 13. Frontend recovery UI | 4 | - | 3,7,8 |

### Agent Dispatch Summary
| Wave | Tasks | Categories |
|---|---|---|
| 1 | 4 | quick, quick, deep, visual-engineering |
| 2 | 2 | quick, quick |
| 3 | 5 | deep ×5 |
| 4 | 3 | deep, deep, visual-engineering |

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

### QA Convention
> - **Session & API paths**:
>   `GET /api/game/:sessionId` → `{ ...session, promotion }` — use `.player.stats.money` for money, `.player.team.weeklySalary` for salary
>   `POST /api/game/:sessionId/choice` → `{ result, player, currentEvent, ... }` — use `.result.success` for win/loss, `.player` for updated state
>   `POST /api/game/:sessionId/action` → `{ actionResult, player }` — use `.actionResult.moneyDelta` for earned money
>   `POST /api/game/:sessionId/shop` → `{ player, itemName, ... }` — use `.player.stats.money` for balance
> - **Advancing rounds**: "Advance 1 round" = `GET /api/game/:sessionId` → extract `currentEvent.choices[0].id` as choiceId → `POST /api/game/:sessionId/choice { "choiceId": "<id>" }`. Repeat N times for N rounds.
> - **Joining a team deterministically**: Use debug route after team join. See specific scenario steps.
> - **Playwright navigation**: Use `frontend/src/app/game/[sessionId]/page.tsx` with a valid sessionId obtained from API.

- [x] 0. 调试路由：支持直接修改玩家状态

  **What to do**:
  - 在 `backend/src/routes/` 新增 `debug.ts` 或在 `game.ts` 中添加 `POST /api/debug/:sessionId` 路由
  - 接受 body: `{ money?: number, stage?: Stage, fame?: number, stress?: number, ownedItems?: string[], round?: number, consecutiveLosses?: number, pendingMatch?: object | null, forceNextEvent?: string, forceMatchResult?: "win" | "loss", teamWeeklySalary?: number, teamTier?: "youth"|"semi-pro"|"pro"|"top" }`
  - 直接修改 session.player 的对应字段
  - `teamWeeklySalary`: 直接设置 player.team.weeklySalary（用于确定性 QA，绕过随机 salaryRange）
  - `teamTier`: 配合 teamWeeklySalary 设置 player.team.tier
  - 仅开发/本地环境生效，生产环境返回 404

  **Must NOT do**: 修改除了 session.player 之外的任何数据，不可修改 traits/shopCooldowns/team/roster 等复杂对象（通过正常游戏流程获取）

  **Agent Profile**: `quick` | **Wave**: 1 | **Blocks**: [2-13 (enables QA)] | **Blocked By**: []

  **References**: `backend/src/routes/game.ts` (路由注册模式), `backend/src/index.ts` (Hono app 注册), `backend/wrangler.toml` (env 判断), `backend/src/engine/matchSimulator.ts` (simulateMatch 函数)

  **Acceptance Criteria**:
  - [ ] `POST /api/debug/:sessionId` 可修改 money/stage/fame/stress/consecutiveLosses/pendingMatch/forceNextEvent
  - [ ] `forceNextEvent` 使得下一次 pickEvent 返回指定事件
  - [ ] `forceMatchResult` 使得下一次 simulateMatch 返回指定结果
  - [ ] `backend && npm run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: Debug route forces match result
    Tool: Bash
    Steps:
      1. POST /api/debug/:sessionId { "forceMatchResult": "win", "forceNextEvent": "tournament-t-netcafe--0" }
      2. POST /api/game/:sessionId/choice { "choiceId": "<from-event>" }
      3. Check response: result.success === true
    Expected: Match forced to win regardless of RNG
    Evidence: .sisyphus/evidence/task-0-debug.json
  ```

  **Commit**: YES | Message: `feat(debug): add /api/debug/:sessionId for QA state setup` | Files: `backend/src/routes/debug.ts`, `backend/src/index.ts`

- [x] 1. 新增经济相关类型定义

  **What to do**:
  - 在 `shared/types.ts` 和 `backend/src/types.ts` 中新增类型：
    ```typescript
    // 借贷记录
    interface Loan {
      id: string;
      principal: number;       // 借款本金 (K)
      interestRate: number;    // 月息 (0.10 = 10%)
      remainingPrincipal: number;
      issuedRound: number;
      dueRound: number;        // issuedRound + 4
      paid: boolean;
      defaulted: boolean;
    }

    // 薪资发放追踪
    interface SalaryTracker {
      lastPayRound: number;
      joinedRound: number;
      payCycle: number;        // 固定 4
    }

    // 加入 Player 类型：
    // - loans: Loan[]
    // - salaryTracker: SalaryTracker | null
    // - pawnedItemIds: string[]
    // - ownedItems: string[]  (已购买物品 ID，用于典当系统)
    ```
  - 在 `frontend/src/lib/types.ts` 中同步前端类型
  - 所有字段在三文件中保持一致

  **Must NOT do**: 改动已有类型字段，不删除 `weeklySalary`

  **Agent Profile**: `quick` | **Wave**: 1 | **Blocks**: [2,4,5,6,7,8,9,10] | **Blocked By**: []

  **References**: `shared/types.ts`, `backend/src/types.ts`, `frontend/src/lib/types.ts`

  **Acceptance Criteria**:
  - [ ] `backend && npm run typecheck` 通过
  - [ ] `frontend && npm run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: Type compilation
    Tool: Bash
    Steps: cd backend && npm run typecheck && cd ../frontend && npm run typecheck
    Expected: Both exit 0
    Evidence: .sisyphus/evidence/task-1-types.txt
  ```

  **Commit**: YES | Message: `feat(types): add Loan, SalaryTracker, pawnedItemIds` | Files: `shared/types.ts`, `backend/src/types.ts`, `frontend/src/lib/types.ts`

- [ ] 2. 薪资发放逻辑重写：周薪→月薪 + 离职结清

  **What to do**:
  - 修改 `backend/src/engine/gameEngine.ts` `applyChoice` 函数（~line 669-674）薪资入账逻辑：
    - `每回合发薪` → `每 4 回合发薪`
    - 判断：`(player.round - salaryTracker.lastPayRound) >= salaryTracker.payCycle`
    - 发薪后 `lastPayRound = player.round`
  - 新增 `settleSalaryOnDeparture()` 函数：
    - 离队时计算 `weeksServed = player.round - salaryTracker.lastPayRound`
    - 结清 = `Math.floor(weeklySalary * weeksServed)`
    - 结清后 salaryTracker = null
  - `initPlayer` 中 `salaryTracker = null`
  - 加入战队时初始化 `salaryTracker = { lastPayRound: player.round, joinedRound: player.round, payCycle: 4 }`
  - `team-response` 路由 accept 逻辑中调用初始化

  **Must NOT do**: 改变 `weeklySalary` 字段名，不改变合同续约 48 周逻辑

  **Agent Profile**: `deep` | **Wave**: 1 | **Blocks**: [11,12] | **Blocked By**: [1]

  **References**: `backend/src/engine/gameEngine.ts:669-674` (当前周薪), `backend/src/engine/gameEngine.ts:1330-1400` (入队), `backend/src/routes/game.ts` (team-response)

  **Acceptance Criteria**:
  - [ ] 无战队玩家不发薪
  - [ ] 有战队玩家每 4 回合收到薪资
  - [ ] 第 4/8/12 回合发薪，第 5-7 回合不发
  - [ ] 离队时结算当周期已服役周数薪资
  - [ ] `backend && npm run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: Monthly salary on round 4
    Tool: Bash
    Steps:
      1. POST /api/game/start → save sessionId
      2. Join a team: GET /api/game/meta/clubs → pick a youth club → POST /api/game/:sessionId/apply-club { "clubId": "<id>" }
      3. Advance until interview/offer event fires → accept → POST /api/game/:sessionId/team-response { "accept": true }
      4. POST /api/debug/:sessionId { "round": 1, "money": 0, "teamWeeklySalary": 10 }
      5. Advance to round 4 (3 choices)
      6. GET /api/game/:sessionId → check player.stats.money = 10
      7. Advance rounds 5-7 → each time GET, check player.stats.money unchanged at 10
      8. Advance to round 8 → check player.stats.money = 20
    Expected: money +10 at round 4 and 8, unchanged 5-7
    Evidence: .sisyphus/evidence/task-2-salary.json

  Scenario: Departure settlement via chain-team-fired
    Tool: Bash
    Steps:
      1. POST /api/game/start → save sessionId; join team as above
      2. POST /api/debug/:sessionId { "round": 2, "money": 50, "teamWeeklySalary": 10, "consecutiveLosses": 3, "forceNextEvent": "chain-team-fired" }
      3. Advance 1 round: GET event → extract choiceId → POST /choice
      4. GET /api/game/:sessionId → check player.stats.money = 70
    Expected: 20K settlement added at departure
    Evidence: .sisyphus/evidence/task-2-departure.json
  ```

  **Commit**: YES | Message: `refactor(salary): weekly→monthly cadence with departure settlement` | Files: `backend/src/engine/gameEngine.ts`, `backend/src/routes/game.ts`

- [x] 3. 前端薪资标签"周薪"→"月薪"

  **What to do**:
  - `frontend/src/components/ClubPanel.tsx`: 薪资文案"周薪"→"月薪"
  - `frontend/src/components/TeamOfferModal.tsx`: 合同详情"周薪"→"月薪"
  - 检查 `HudTopBar.tsx` 是否有薪资展示，如有也更新
  - 检查 `FeedPanel.tsx` 中被动效果"周薪入账"是否需要同步更新

  **Must NOT do**: 改变数值逻辑，仅改显示文本

  **Agent Profile**: `visual-engineering` | **Wave**: 1 | **Blocks**: [] | **Blocked By**: []

  **References**: `frontend/src/components/ClubPanel.tsx`, `frontend/src/components/TeamOfferModal.tsx`

  **Acceptance Criteria**:
  - [ ] 薪资文案全部显示"月薪"而非"周薪"
  - [ ] `frontend && npm run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: UI label verification
    Tool: Playwright
    Steps:
      1. Start game via POST /api/game/start → get sessionId
      2. Navigate to http://localhost:3000/game/<sessionId>
      3. Join a team via ClubPanel (apply → wait → accept offer)
      4. Once team is joined, check ClubPanel text contains "月薪" (not "周薪")
      5. Open TeamOfferModal if an offer appears → verify text contains "月薪 XX K"
    Expected: All salary-related UI text shows "月薪"
    Evidence: .sisyphus/evidence/task-3-ui.png
  ```

  **Commit**: YES | Message: `feat(ui): update salary labels 周薪→月薪` | Files: `frontend/src/components/ClubPanel.tsx`, `frontend/src/components/TeamOfferModal.tsx`

- [ ] 4. 赛事奖金 ×10-15 倍重标定

  **What to do**:
  - 修改 `backend/src/data/tournaments.ts` 中所有 9 个赛事的 `reward.money`：
    | 赛事 | 旧值 | 新值 |
    |---|---|---|
    | t-netcafe | 1 | 10 |
    | t-city | 2 | 25 |
    | t-platform | 2 | 25 |
    | t-secondary | 3 | 40 |
    | t-development | 4 | 55 |
    | t-tier2 | 5 | 70 |
    | t-tier1 | 8 | 110 |
    | t-s-class | 10 | 140 |
    | t-major | 15 | 200 |
  - 验证 `buildMatchResolveResult` 中奖金分成的计算（line 287-308）仍然正确：
    - `isFinal ? r.money : Math.floor(r.money / 4)` — 中间阶段拿 1/4
    - `lossShare` 计算：`Math.floor(r.money * lossShare)` — 早期淘汰按比例
    - `playerShare` 战队抽成（PRIZE_SPLIT）
  - 确保 `money` 值均为整数（K 单位）

  **Must NOT do**: 改变 fame/experience/points 奖励，不改变赛事结构（阶段数/bracket）

  **Agent Profile**: `quick` | **Wave**: 2 | **Blocks**: [] | **Blocked By**: [1]

  **References**: `backend/src/data/tournaments.ts:72-189` (TOURNAMENTS 定义), `backend/src/engine/gameEngine.ts:274-329` (buildMatchResolveResult)

  **Acceptance Criteria**:
  - [ ] 9 个赛事 money 值均为目标新值的整数
  - [ ] Major 冠军奖金 = 200K
  - [ ] `backend && npm run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: Major final win reward (deterministic)
    Tool: Bash
    Steps:
      1. POST /api/game/start → sessionId
      2. POST /api/debug/:sessionId { "stage": "pro", "fame": 35, "money": 100, "forceNextEvent": "tournament-t-major--5", "forceMatchResult": "win" }
      3. Advance 1 round → final stage event fires, match result forced to win
      4. GET /api/game/:sessionId → check player.stats.money = 100 + 200 = 300
    Expected: Full 200K reward applied
    Evidence: .sisyphus/evidence/task-4-major.json

  Scenario: Early exit reward calculation (deterministic)
    Tool: Bash
    Steps:
      1. (Reuse sessionId from previous scenario or POST /api/game/start for new)
      2. POST /api/debug/:sessionId { "forceNextEvent": "tournament-t-major--0", "forceMatchResult": "loss", "money": 50 }
      3. Advance 1 round → match lost at stage 0
      4. GET /api/game/:sessionId → check player.stats.money = 50 + (200 × 0.05) = 60
    Expected: 10K on round-1 exit
    Evidence: .sisyphus/evidence/task-4-earlyexit.json
  ```
  ```

  **Commit**: YES | Message: `feat(tournaments): scale prize money ×10-15, Major=200K` | Files: `backend/src/data/tournaments.ts`

- [ ] 5. 商店阶梯定价

  **What to do**:
  - 修改 `backend/src/data/shop.ts` 中商品价格：
    | 商品 | 旧价 | 新价 | 理由 |
    |---|---|---|---|
    | energy-drink | 10 | 3 | 消耗品低价 |
    | meal-kit | 10 | 3 | 消耗品低价 |
    | painkiller | 10 | 5 | 消耗品中档 |
    | psych-session | 20 | 15 | 服务中档 |
    | short-trip | 40 | 30 | 服务高档 |
    | pro-peripherals | 50/80/120/200 | 30/60/100/150 | 装备阶梯 |
    | ergo-chair | 40 | 35 | 装备中档 |
    | team-dinner | 20 | 10 | 社交中档 |
    | fan-meetup | 30 | 15 | 社交中档 |
  - 更新 `PERIPHERAL_PRICES` 常量（`constants.ts` line 97）：`[50,80,120,200]` → `[30,60,100,150]`

  **Must NOT do**: 改变商品效果/冷却/条件，仅改价格

  **Agent Profile**: `quick` | **Wave**: 2 | **Blocks**: [12] | **Blocked By**: [1]

  **References**: `backend/src/data/shop.ts:37-184` (SHOP_ITEMS), `backend/src/engine/constants.ts:96-97` (PERIPHERAL_PRICES)

  **Acceptance Criteria**:
  - [ ] 9 个商品价格均为目标新值
  - [ ] 外设四档价格为 30/60/100/150
  - [ ] `backend && npm run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: Buy energy drink with new price
    Tool: Bash
    Steps:
      1. POST /api/game/start → sessionId
      2. POST /api/debug/:sessionId { "money": 5 }
      3. POST /api/game/:sessionId/shop { "itemId": "energy-drink" }
      4. GET /api/game/:sessionId → check player.stats.money === 2
    Expected: money=2 (5-3), item purchased
    Evidence: .sisyphus/evidence/task-5-shop.json
  ```

  **Commit**: YES | Message: `rebalance(shop): tiered pricing 3-150K` | Files: `backend/src/data/shop.ts`, `backend/src/engine/constants.ts`

- [ ] 6. 家人救济事件池

  **What to do**:
  - 在 `backend/src/data/events/` 新建 `bailout.ts`，定义 3 个救济事件：
    1. `bailout-family-loan`: 家人借钱 — +30K，fame-3，冷却 24 周
    2. `bailout-family-gift`: 家人赠款 — +20K，stress+8（愧疚），冷却 24 周
    3. `bailout-old-friend`: 老朋友帮忙 — +40K，fame-5，冷却 24 周
  - 触发条件：`money ≤ 0` 持续 ≥ 2 回合，且距上次救济 ≥ 24 周
  - 在 `backend/src/engine/events.ts` 的 `pickEvent` 中添加检测：
    - 新增动态 tag `needs-bailout`：`money ≤ 0 && consecutiveBrokeRounds ≥ 2 && bailoutCooldown <= 0`
    - 新增 `consecutiveBrokeRounds` 和 `bailoutCooldown` 字段到 DynamicState
  - 在 `applyChoice` 的破产处理部分（~line 452-459）追踪 `consecutiveBrokeRounds`
  - 在 `backend/src/data/events/index.ts` 注册新事件池
  - 事件类型：`bailout`，权重：`needs-bailout` tag 触发时 weight=10

  **Must NOT do**: 救济事件可以无限触发（冷却外），不做好感度/关系系统

  **Agent Profile**: `deep` | **Wave**: 3 | **Blocks**: [11] | **Blocked By**: [1]

  **References**: `backend/src/data/events/skins.ts` (事件定义模式), `backend/src/engine/events.ts:19` (动态 tag), `backend/src/engine/gameEngine.ts:452-459` (破产处理), `backend/src/data/events/index.ts` (注册)

  **Acceptance Criteria**:
  - [ ] money≤0 持续 2 回合后触发 bailout 事件
  - [ ] 救济事件有 24 周冷却
  - [ ] 3 个事件均有合理成本和收益
  - [ ] `backend && npm run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: Family bailout triggers after 2 weeks broke
    Tool: Bash
    Steps:
      1. POST /api/game/start → sessionId
      2. POST /api/debug/:sessionId { "money": 0 }
      3. Advance 2 rounds via POST /api/game/:sessionId/choice
      4. Check currentEvent.type === 'bailout'
      5. Select bailout-family-gift choice → GET, check player.stats.money increased by ~20, player.stress increased
      6. POST /api/debug/:sessionId { "money": 0 } → advance 2 rounds → verify NO bailout (cooldown)
    Expected: Bailout fires at 3rd round broke, then 24-week cooldown
    Evidence: .sisyphus/evidence/task-6-bailout.json
  ```

  **Commit**: YES | Message: `feat(recovery): family bailout events with 24w cooldown` | Files: `backend/src/data/events/bailout.ts`, `backend/src/data/events/index.ts`, `backend/src/engine/events.ts`, `backend/src/engine/gameEngine.ts`

- [ ] 7. 借贷系统

  **What to do**:
  - 在 `backend/src/engine/gameEngine.ts` 新增函数：
    - `applyForLoan(player, amount)`: 验证借款资格（需 stage ≥ youth，无未还贷款）
    - 创建 Loan 对象：principal=amount, interestRate=0.10, dueRound=round+4
    - `processLoanRepayment(player, round)`: 每回合检查到期贷款，强制扣款
    - 还不上 → default：fame-10, tag `loan-default`, 锁定转会（添加 `transfer-ban` tag 持续 12 周），已典当物品已失去所以不能再次典当
  - 新增 API 路由 `POST /api/game/:sessionId/loan`：
    - body: `{ amount: number }`
    - 验证 amount 在 [20, 100] 范围
    - 返回更新后的 player
  - 前端新增 LoanPanel 或集成到现有面板（放在后续 Task 13 中实现）
  - 借款记录保存到 player.loans

  **Must NOT do**: 复利计算，信用评分，多次借款叠加

  **Agent Profile**: `deep` | **Wave**: 3 | **Blocks**: [11,13] | **Blocked By**: [1]

  **References**: `backend/src/routes/game.ts` (路由模式), `backend/src/engine/gameEngine.ts:1117-1130` (shop apply 模式), `backend/src/types.ts` (Loan type)

  **Acceptance Criteria**:
  - [ ] 可借 20-100K，单利月息 10%
  - [ ] 到期自动扣款，不足→fame-10 + transfer-ban 12 周
  - [ ] 有未还贷款时不能再借
  - [ ] `backend && npm run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: Borrow and repay on time
    Tool: Bash
    Steps:
      1. POST /api/game/start → sessionId
      2. POST /api/debug/:sessionId { "stage": "youth", "money": 0 }
      3. POST /api/game/:sessionId/loan { "amount": 50 } → GET, check player.stats.money = 50
      4. POST /api/debug/:sessionId { "money": 60, "round": <dueRound-1> }
      5. Advance 1 round to due date → GET, check player.stats.money = 5, loan.paid=true
    Expected: 50K principal + 5K interest repaid, loan cleared
    Evidence: .sisyphus/evidence/task-7-loan-repay.json

  Scenario: Default on loan
    Tool: Bash
    Steps:
      1. (Reuse sessionId from repay scenario, or create new via POST /api/game/start)
      2. POST /api/debug/:sessionId { "money": 0, "stage": "youth" }
      3. POST /api/game/:sessionId/loan { "amount": 50 }
      4. POST /api/debug/:sessionId { "money": 10, "round": <dueRound-1> }
      5. Advance 1 round → check repayment attempt
       6. GET /api/game/:sessionId → check player.stats.money stays 10, player.fame reduced by 10, player.tags includes 'loan-default'
    Expected: Default triggered, fame -10, transfer-ban applied
    Evidence: .sisyphus/evidence/task-7-loan-default.json
  ```

  **Commit**: YES | Message: `feat(recovery): loan system with 10% simple interest` | Files: `backend/src/engine/gameEngine.ts`, `backend/src/routes/game.ts`

- [ ] 8. 物品典当系统

  **What to do**:
  - 在 `backend/src/engine/gameEngine.ts` 新增 `pawnItem(player, itemId)` 函数：
    - **仅装备类物品可典当**（ergo-chair / pro-peripherals），消耗品和服务类不可典当
    - 人体工学椅（ergo-chair）典当价 = 原价 40K × 60% = 24K
    - 外设（pro-peripherals）典当价 = 当前档位价格 × 50%；典当后 peripheralTier 降一级（最低 0）
    - 典当后：money += 典当价，添加到 pawnedItemIds，永久失去装备效果（constitution +2 和 ergo-recovery buff 均移除）
  - 新增 API 路由 `POST /api/game/:sessionId/pawn`：
    - body: `{ itemId: string }`
    - 验证：物品已购买（在 ownedItems 中）、为装备类、未典当过
  - 典当消耗品（能量饮料/外卖/止痛药）不支持——这些是消耗品，用完即无
  - 典当服务类（心理咨询/短途旅行）不支持——这些是服务，不是物品

  **Agent Profile**: `deep` | **Wave**: 3 | **Blocks**: [11,13] | **Blocked By**: [1]

  **References**: `backend/src/engine/gameEngine.ts:1117-1183` (applyShopPurchase), `backend/src/data/shop.ts` (物品价格), `backend/src/routes/game.ts` (路由模式)

  **Acceptance Criteria**:
  - [ ] 已购装备可典当，价格 = 原价 × 50%-60%
  - [ ] 典当后装备效果永久消失
  - [ ] 已典当物品不可再次典当
  - [ ] 未购买物品不可典当
  - [ ] `backend && npm run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: Pawn ergonomic chair
    Tool: Bash
    Steps:
      1. POST /api/game/start → sessionId
      2. POST /api/debug/:sessionId { "money": 50, "ownedItems": ["ergo-chair"] }
      3. POST /api/game/:sessionId/pawn { "itemId": "ergo-chair" }
       4. GET /api/game/:sessionId → check player.stats.money = 74
       5. Check response data: player.ownedItems no longer includes 'ergo-chair'
       6. Check response data: player.pawnedItemIds includes 'ergo-chair'
      7. POST /api/game/:sessionId/pawn { "itemId": "ergo-chair" } → expect error "already pawned"
    Expected: Money +24K, chair effect lost (constitution +2 reversed), cannot re-pawn
    Evidence: .sisyphus/evidence/task-8-pawn.json
  ```

  **Commit**: YES | Message: `feat(recovery): item pawning at 50-60% value` | Files: `backend/src/engine/gameEngine.ts`, `backend/src/routes/game.ts`, `backend/src/types.ts`

- [ ] 9. 战队援助事件

  **What to do**:
  - 在 `backend/src/data/events/bailout.ts` 中新增 2 个战队援助事件（或单独建 `team-bailout.ts`）：
    1. `bailout-team-emergency`: 战队紧急援助 — +30K（youth/semi-pro），代价：降薪 20% × 12 周
    2. `bailout-team-advance`: 俱乐部预支工资 — +50K（pro/top），代价：降薪 20% × 12 周 + stress+10
  - 触发条件：`has-team && money ≤ 0 && teamBailoutCooldown ≤ 0`
  - 冷却：24 周
  - 新增 `teamBailoutCooldown` 字段到 DynamicState
  - 降薪实现：修改 `player.team.weeklySalary` 值（直接 ×0.8 并取整），12 周后通过 `salaryRestoreRound` 恢复
  - 新增 `salaryRestoreRound` 字段到 Player 或 salaryTracker

  **Must NOT do**: 改变 Club 定义中的 baseSalary，降薪只影响当前合同

  **Agent Profile**: `deep` | **Wave**: 3 | **Blocks**: [11] | **Blocked By**: [1]

  **References**: `backend/src/data/events/chains.ts` (链式事件模式), `backend/src/engine/gameEngine.ts:669-674` (薪资), `backend/src/data/events/index.ts` (注册)

  **Acceptance Criteria**:
  - [ ] 有战队 + money≤0 触发援助事件
  - [ ] 接受援助 → 薪资降 20%，持续 12 周后恢复
  - [ ] 冷却 24 周
  - [ ] `backend && npm run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: Team bailout with salary cut
    Tool: Bash
    Steps:
      1. POST /api/game/start → sessionId
       2. Join team: GET /api/game/meta/clubs → pick pro club → POST /apply-club → advance → accept offer → POST /team-response { "accept": true }. Then POST /api/debug/:sessionId { "teamWeeklySalary": 60, "teamTier": "pro", "money": 0, "forceNextEvent": "bailout-team-advance" }
       3. Advance 1 round → bailout-team-advance event fires → extract choiceId → POST /choice
       4. GET /api/game/:sessionId → check player.stats.money = 50, player.team.weeklySalary = 48
       5. POST /api/debug/:sessionId { "round": <current + 12> } → advance → GET, check player.team.weeklySalary = 60
    Expected: Salary cut 20% for 12 weeks, then restored
    Evidence: .sisyphus/evidence/task-9-team-bailout.json
  ```

  **Commit**: YES | Message: `feat(recovery): team bailout with temporary salary cut` | Files: `backend/src/data/events/bailout.ts`, `backend/src/engine/gameEngine.ts`, `backend/src/engine/events.ts`

- [ ] 10. 打工日常行动

  **What to do**:
  - 在 `backend/src/data/actions.ts` 中新增 3 个打工行动：
    | actionId | 名称 | 收入 | 疲劳 | 压力 | DC | 主属性 |
    |---|---|---|---|---|---|---|
    | `action-boosting` | 代练接单 | 5-8K | +20 | +10 | 10 | agility |
    | `action-coaching` | 陪玩指导 | 3-5K | +12 | +5 | 6 | intelligence |
    | `action-net-cafe` | 网吧打工 | 3-4K | +15 | +8 | 4 | constitution |
  - 成功：money += 随机收入（在范围内随机）
  - 失败：money += 1K（低保），fatigue 和 stress 惩罚加倍
  - 消耗 25AP（与其他日常行动一致）
  - 在 `frontend/src/data/actions.ts`（或通过 API 的 `/api/game/meta/actions`）同步

  **Must NOT do**: 打工收入可无限叠加（已有 AP 限制 4 次/回合 + 疲劳代价）

  **Agent Profile**: `deep` | **Wave**: 3 | **Blocks**: [11] | **Blocked By**: [1]

  **References**: `backend/src/data/actions.ts` (现有 6 个行动定义), `backend/src/engine/gameEngine.ts` (applyAction 函数)

  **Acceptance Criteria**:
  - [ ] 3 个打工行动可通过 API 获取
  - [ ] 成功时 money 增加，fatigue+stress 增加
  - [ ] 失败时少量 money + 翻倍惩罚
  - [ ] 消耗 25AP
  - [ ] `backend && npm run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: Boost action earns money, AP limits enforced
    Tool: Bash
    Steps:
      1. POST /api/game/start → sessionId
      2. POST /api/debug/:sessionId { "money": 0 }
      3. POST /api/game/:sessionId/action { "actionId": "action-boosting" }
      4. Check response: actionResult.moneyDelta in [5,8], player.actionPoints = 75
      5. POST action-boosting 3 more times → AP=0
      6. POST action-boosting again → expect error (insufficient AP)
    Expected: 4 actions max, each costs 25AP, money earned in range
    Evidence: .sisyphus/evidence/task-10-grind.json
  ```

  **Commit**: YES | Message: `feat(recovery): grind actions (boosting/coaching/net-cafe)` | Files: `backend/src/data/actions.ts`

- [ ] 11. 恢复系统集成：冷却互斥与优先级

  **What to do**:
  - 在 `backend/src/engine/gameEngine.ts` 的 `applyChoice` 中新增 `processRecoverySystems(player, round)` 函数：
    - 检测顺序：家人救济 → 打工可用 → 典当可用 → 借贷可用 → 战队援助
    - 各系统冷却独立追踪
    - 同回合可触发多个系统（如先打工赚一点 + 再借贷），但同一系统冷却中不可重复触发
  - 新增 DynamicState 字段：
    - `bailoutCooldown: number` (round when bailout available again)
    - `teamBailoutCooldown: number`
    - `consecutiveBrokeRounds: number`
  - 确保 `initPlayer` 初始化这些字段为 0
  - 确保回合推进时正确递减冷却

  **Must NOT do**: 强制互斥（如借贷和救济二选一），允许叠加但各自冷却

  **Agent Profile**: `deep` | **Wave**: 4 | **Blocks**: [] | **Blocked By**: [2,6,7,8,9,10]

  **References**: `backend/src/engine/gameEngine.ts:424-470` (每回合处理流程), `backend/src/engine/constants.ts` (MONEY_MAX)

  **Acceptance Criteria**:
  - [ ] 所有恢复系统冷却独立运作
  - [ ] 同回合可触发多个系统
  - [ ] 冷却到期后恢复可用
  - [ ] `backend && npm run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: Multi-recovery in same week
    Tool: Bash
    Steps:
      1. POST /api/game/start → sessionId
       2. POST /api/debug/:sessionId { "money": 0, "ownedItems": ["ergo-chair"], "forceNextEvent": "bailout-family-gift" }
       3. Advance 1 round → bailout fires → extract choiceId → POST /choice to accept
       4. POST /api/game/:sessionId/pawn { "itemId": "ergo-chair" }
       5. POST /api/game/:sessionId/loan { "amount": 30 }
       6. GET /api/game/:sessionId → check player.stats.money = 74
    Expected: Bailout + pawn + loan all work same round, money cumulative
    Evidence: .sisyphus/evidence/task-11-multi-recovery.json
  ```

  **Commit**: YES | Message: `feat(recovery): integrate all systems with independent cooldowns` | Files: `backend/src/engine/gameEngine.ts`, `backend/src/types.ts`

- [ ] 12. 边界条件处理：cap 溢出 + 负金钱 + 合同交互

  **What to do**:
  - 赛事奖金 cap 溢出处理：`math.min(MONEY_MAX, money + reward)` （已有逻辑，确认无误）
  - 负金钱边界：money 允许到 0 但不低于 0（已有 `Math.max(0, ...)` 保护，确认无误）
  - 合同续约（48 周）与月薪周期解耦验证：
    - 续约事件不改变 salaryTracker.lastPayRound
    - 续约后降薪（战队援助导致）在合同续约时是否保留？→ 保留，直到 12 周恢复
  - 新加入战队 mid-cycle：
    - 加入时 salaryTracker.lastPayRound = player.round（当前回合）
    - 距离下次发薪 = 4 回合
  - 被踢/离队 mid-cycle：
    - 调用 settleSalaryOnDeparture()（Task 2 实现）

  **Must NOT do**: 改变合同续约 48 周规则本身

  **Agent Profile**: `deep` | **Wave**: 4 | **Blocks**: [] | **Blocked By**: [2,5]

  **References**: `backend/src/engine/gameEngine.ts:306-315` (money cap), `backend/src/data/events/chains.ts` (chain-contract-renewal / chain-team-fired 事件定义), `backend/src/engine/gameEngine.ts:669-674` (applyChoice 中薪资发放 — 续约后若仍在队则正常进入月薪周期；salaryTracker 不应被续约事件重置)

  **Acceptance Criteria**:
  - [ ] Cap 溢出正确处理（不丢钱但也不超 999K）
  - [ ] 负金钱保护无漏洞
  - [ ] 合同续约不干扰月薪周期：续约后 salaryTracker.lastPayRound 保持不变，不重新计时
  - [ ] `backend && npm run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: Money cap overflow
    Tool: Bash
    Steps:
      1. POST /api/game/start → sessionId
      2. POST /api/debug/:sessionId { "money": 990, "stage": "pro", "fame": 35, "forceNextEvent": "tournament-t-major--5", "forceMatchResult": "win" }
      3. Advance 1 round → Major final won, reward 200K attempted
       4. GET /api/game/:sessionId → check player.stats.money = 999

  Scenario: Join mid-cycle, first salary at correct round
    Tool: Bash
    Steps:
      1. POST /api/game/start → sessionId
      2. Join team via API steps (apply → wait → accept), then POST /api/debug/:sessionId { "round": 3, "money": 100, "teamWeeklySalary": 40 }
      3. Advance to round 4 → GET, check player.stats.money unchanged at 100
      4. POST /api/debug/:sessionId { "round": 7 } → advance 1 round → GET, check player.stats.money = 140
    Expected: First pay at round 7 (4 weeks after join at round 3)
    Evidence: .sisyphus/evidence/task-12-midcycle.json
  ```

  **Commit**: YES | Message: `fix(economy): edge cases for cap overflow, mid-cycle join, contract interaction` | Files: `backend/src/engine/gameEngine.ts`

- [ ] 13. 前端恢复系统 UI

  **What to do**:
  - 新增/修改以下组件：
    1. **LoanPanel.tsx**: 借款界面
       - 显示当前借款状态（无借款 / 借款中 / 已违约）
       - 借款按钮（验证资格后可用）
       - 借款金额滑块（20-100K）
       - 到期回合和应还金额显示
    2. **PawnConfirmModal.tsx**: 典当确认弹窗
       - 列出可典当物品（已购且未典当）
       - 显示典当价格
       - 确认按钮 + 永久失去警告
    3. 在 **ShopPanel.tsx** 中添加"典当"按钮入口
    4. 在 **HudTopBar.tsx** 或 **PlayerStats.tsx** 中显示负债状态（如有未还贷款）
  - 通过现有 API 路由获取数据

  **Must NOT do**: 创建独立的全屏借贷/典当页面，集成到现有面板即可

  **Agent Profile**: `visual-engineering` | **Wave**: 4 | **Blocks**: [] | **Blocked By**: [3,7,8]

  **References**: `frontend/src/components/ShopPanel.tsx` (购物面板模式), `frontend/src/components/TeamOfferModal.tsx` (弹窗模式), `frontend/src/lib/api.ts` (API 调用)

  **Acceptance Criteria**:
  - [ ] LoanPanel 可借款并显示状态
  - [ ] PawnConfirmModal 可确认典当
  - [ ] 负债状态在 HUD 可见
  - [ ] `frontend && npm run typecheck` 通过

  **QA Scenarios**:
  ```
  Scenario: Borrow via UI
    Tool: Playwright
    Steps:
      1. Use debug route to set stage=youth, money=0 on an existing session
      2. Open LoanPanel → verify "可借款" state and amount slider visible
      3. Set amount to 30 → click "借款"
      4. Verify money increased by 30, loan status shows "还款中 (应还33K)"
      5. Verify "再次借款" button disabled while loan active
    Expected: Full borrow flow works via UI with correct interest display
    Evidence: .sisyphus/evidence/task-13-loan-ui.png

  Scenario: Pawn item via UI
    Tool: Playwright
    Steps:
      1. Use debug route to set ownedItems=["ergo-chair"], money=0 on an existing session
      2. Open pawn modal from ShopPanel
      3. See "人体工学椅 - 典当价 24K" with permanent loss warning
      4. Click confirm → verify money +24K, chair removed from owned items
      5. Verify pawn modal no longer shows ergo-chair
    Expected: Pawn flow works via UI, item permanently gone
    Evidence: .sisyphus/evidence/task-13-pawn-ui.png
  ```

  **Commit**: YES | Message: `feat(ui): loan panel + pawn modal + liability display` | Files: `frontend/src/components/LoanPanel.tsx`, `frontend/src/components/PawnConfirmModal.tsx`, `frontend/src/components/ShopPanel.tsx`, `frontend/src/components/HudTopBar.tsx`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [ ] F1. Plan Compliance Audit

  **Tool**: `oracle` agent
  **Steps**:
  1. Read the plan file `.sisyphus/plans/economy-rebalance.md`
  2. Read all modified source files (via git diff against pre-plan commit)
  3. Check each task's acceptance criteria against actual implementation
  4. Verify no design decisions were silently changed (e.g., stage-based event scaling, redemption system, compound interest)
  **Expected**: All 13 tasks implemented per spec. Any deviation documented with reason.
  **Evidence**: `.sisyphus/evidence/F1-compliance.txt`

- [ ] F2. Code Quality Review

  **Tool**: `oracle` agent
  **Steps**:
  1. Review all new/modified files for type safety (no `any` casts without reason)
  2. Check error handling on all new API routes (/loan, /pawn, /debug)
  3. Verify consistent patterns across recovery systems (bailout, loan, pawn, team-bailout all follow same structure)
  4. Check no dead code or unused imports
  **Expected**: Zero type errors, consistent error responses, no anti-patterns
  **Evidence**: `.sisyphus/evidence/F2-quality.txt`

- [ ] F3. Real Manual QA

  **Tool**: `Bash` (for API scenarios) + `Playwright` (for UI scenarios T3 & T13)
  **Steps**:
  1. Start a fresh game session via `POST /api/game/start`
  2. Execute all QA scenarios from Tasks 0-13 in order using the exact commands specified in each task's QA section
  3. Collect pass/fail for each scenario
  **Expected**: All 14 task QA scenarios pass
  **Evidence**: `.sisyphus/evidence/F3-qa-results.json` (summary: `{ "task-N": "pass"|"fail" }` for N=0..13)

- [ ] F4. Scope Fidelity Check

  **Tool**: `Bash` + `oracle` agent
  **Steps**:
  1. `Bash`: Run grep on all modified files for forbidden patterns:
     - `grep -rni "stage.*moneyDelta\|money.*stage.*scale\|stage.*multiplier" backend/src/`
     - `grep -rni "compound\|Math\.pow.*interest\|interest.*\*.*interest" backend/src/`
     - `grep -rni "redeem\|buyback\|buy.*back\|repurchase" backend/src/`
     - `grep -rni "creditScore\|credit_score\|credit.*rating" backend/src/`
  2. `Bash`: Verify MONEY_MAX unchanged: `grep "MONEY_MAX" backend/src/engine/constants.ts`
  3. `Bash`: Verify contract renewal at 48 weeks: `grep "48" backend/src/data/events/chains.ts | head -5`
  4. `oracle`: Review grep output, confirm zero false positives
  **Expected**: Zero matches for forbidden patterns. MONEY_MAX=999. Contract cycle unchanged.
  **Evidence**: `.sisyphus/evidence/F4-scope.txt`

## Commit Strategy
- 每个任务独立 commit（见各任务 Commit 字段）
- Commit 顺序：按任务编号 1→13 依次提交
- 每个 commit 后验证 `typecheck` 通过

## Success Criteria
1. **存活验证**：新存档 youth 选手，无战队，纯靠打工+救济，可存活 12 回合不破产
2. **月薪正确**：round 4/8/12 正常发薪，round 5-7 不触发
3. **赛事奖金**：Major 冠军 ≈ 200K，网吧赛冠军 ≈ 10K
4. **闭环验证**：借 50K→到期扣 55K→不足→违约→fame-10+转会锁，全链路闭环
5. **典当不可逆**：典当人体工学椅→效果消失→不可回购→不可再典当
6. **冷却生效**：家人救济后 24 周内不再触发
7. **TypeCheck**：`backend && npm run typecheck` + `frontend && npm run typecheck` 均通过
