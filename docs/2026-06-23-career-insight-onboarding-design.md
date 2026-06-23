# 状态解释层 + 首局引导设计方案

> 文档版本：v0.1  
> 日期：2026-06-23 08:44 +08:00  
> 当前实现状态：已实现 v1（状态解释层、首局引导、职业助手 UI、debug 展示已接入；Vitest 在当前环境启动即 Bus error，测试文件已补但无法执行）  
> 目标实现状态：分阶段完整落地“方案 2：状态解释层 + 首局引导”  
> 关联方向：B 体验优化 + C 工程重构重组合

---

## 1. 背景

当前项目已经形成比较完整的 CS2 电竞选手职业生涯模拟：特质、属性成长、压力疲劳、战队合同、队伍阵容、赛事资格、比赛模拟、经济压力、AI 叙事和多结局都已接线。

随着系统增多，玩家体验和工程维护同时出现两个问题：

1. 玩家不一定知道“我现在最该做什么”。
2. 代码中存在大量规则、门槛、事件原因和下一目标判断，但这些判断散落在赛事、战队、行动、事件和前端展示里，难以统一解释、测试和复用。

因此，本方案不是单纯增加一个 UI 提示框，而是新增一个结构化的“状态解释层”，把当前局势、风险、目标、行动建议和事件原因从游戏核心状态中归纳出来，再由前端和调试页消费。

---

## 2. 设计目标

### 2.1 玩家体验目标

让玩家在每回合都能快速回答：

1. 我现在处于什么职业阶段和处境？
2. 当前最重要的短期目标是什么？
3. 我距离晋级、报名、签约、夺冠还差什么？
4. 当前最大的风险是什么？
5. 本周推荐做什么行动，为什么？
6. 为什么系统给了我这个事件、结果或限制？

### 2.2 工程目标

1. 将“解释当前状态”的逻辑从 UI 和路由中抽离为纯函数模块。
2. 让阶段目标、风险提示、行动建议、赛事资格差距等输出结构化数据。
3. 保持核心结算逻辑不被 UI 文案污染。
4. 让 debug 页可以复用同一套解释数据，减少排查成本。
5. 为后续拆分 `routes/game.ts`、`engine/choice.ts` 提供稳定边界。

### 2.3 非目标

第一阶段不做以下事情：

- 不重写主循环。
- 不重做赛事系统。
- 不大规模拆分 `choice.ts`。
- 不让 AI 直接决定建议结果。
- 不把建议变成自动行动系统。

解释层只负责“解释和建议”，不负责“替玩家玩游戏”。

---

## 3. 总体方案

新增一个后端 `insights` 模块，输入当前 `GameSession`，输出结构化 `CareerInsight`。

建议目录：

```text
backend/src/engine/insights/
├── index.ts
├── careerInsight.ts
├── progressionInsight.ts
├── riskInsight.ts
├── actionRecommendation.ts
├── eventReason.ts
└── types.ts
```

前端新增或改造现有职业目标展示：

```text
frontend/src/components/CareerInsightPanel.tsx
frontend/src/components/CareerGoalPanel.tsx
```

调试页增加 insight 区域：

```text
frontend/src/app/debug/sessions/[sessionId]/page.tsx
```

返回结构大致如下：

```ts
interface CareerInsight {
  generatedAtRound: number;
  stage: StageInsight;
  headline: string;
  onboarding?: OnboardingInsight;
  priorities: PriorityInsight[];
  risks: RiskInsight[];
  recommendations: ActionRecommendation[];
  milestones: MilestoneInsight[];
  blockers: BlockerInsight[];
  explanations: ExplanationInsight[];
}
```

---

## 4. 核心数据结构

### 4.1 StageInsight

描述玩家当前职业阶段。

```ts
interface StageInsight {
  stage: 'rookie' | 'youth' | 'second' | 'pro' | 'retired';
  label: string;
  summary: string;
  mainObjective: string;
  nextStage?: string;
}
```

示例：

```json
{
  "stage": "rookie",
  "label": "路人新人",
  "summary": "你还没有进入俱乐部体系，当前重点是通过 C/B 级赛事证明自己。",
  "mainObjective": "积累 C/B 级赛事经历并争取冠军，为申请青训战队做准备。",
  "nextStage": "youth"
}
```

### 4.2 MilestoneInsight

描述晋级、赛事、战队和长期目标的差距。

```ts
interface MilestoneInsight {
  id: string;
  title: string;
  category: 'promotion' | 'team' | 'tournament' | 'economy' | 'fame' | 'ending';
  status: 'locked' | 'in_progress' | 'ready' | 'completed';
  progressText: string;
  missing: string[];
  nextStep?: string;
}
```

示例：

```json
{
  "id": "rookie-to-youth",
  "title": "申请青训战队",
  "category": "promotion",
  "status": "in_progress",
  "progressText": "C/B 赛事参赛 1/3，B 级赛事 0/1，冠军 0/1",
  "missing": ["至少再参加 2 场 C/B 级赛事", "至少参加 1 场 B 级赛事", "赢得 1 次 C/B 级冠军"],
  "nextStep": "优先查看未来 12 周的 B 级赛事窗口。"
}
```

### 4.3 RiskInsight

描述当前风险，并给出原因和缓解建议。

```ts
interface RiskInsight {
  id: string;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  reason: string;
  suggestedMitigation?: string;
  relatedStats: string[];
}
```

风险来源包括：

- 高压力
- 高疲劳
- 资金不足
- AP 不足
- 队伍信任过低
- 连败
- 即将错过赛事窗口
- 贷款/违约风险
- 伤病或休养需求

### 4.4 ActionRecommendation

描述推荐行动，要求解释为什么推荐。

```ts
interface ActionRecommendation {
  actionId?: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  expectedBenefit: string;
  tradeoff?: string;
}
```

示例：

```json
{
  "actionId": "rest",
  "title": "安排一次休息",
  "priority": "high",
  "reason": "当前疲劳已经超过 70，继续训练会放大压力收益并增加伤病风险。",
  "expectedBenefit": "降低疲劳和后续崩盘概率。",
  "tradeoff": "本周成长速度会下降。"
}
```

### 4.5 OnboardingInsight

只在新局前几回合或玩家尚未完成核心概念理解时突出显示。

```ts
interface OnboardingInsight {
  mode: 'first_round' | 'early_game' | 'stage_intro' | 'hidden';
  title: string;
  message: string;
  checklist: string[];
  dismissible: boolean;
}
```

---

## 5. 多阶段实现计划

### 阶段 0：类型和边界准备

状态：未开始。

目标：建立解释层的稳定数据结构，不改动游戏规则。

任务：

1. 新增 `backend/src/engine/insights/types.ts`。
2. 定义 `CareerInsight`、`StageInsight`、`MilestoneInsight`、`RiskInsight`、`ActionRecommendation`、`OnboardingInsight`。
3. 在前端镜像类型中加入对应结构。
4. 不接 UI，只跑类型检查。

验收标准：

- 后端 `npm --prefix backend run typecheck` 通过。
- 前端 `npm --prefix frontend run typecheck` 通过。
- 不改变现有 API 行为。

---

### 阶段 1：职业阶段和晋级解释

状态：未开始。

目标：先解决“我现在处于什么阶段，下一步要做什么”。

任务：

1. 新增 `progressionInsight.ts`。
2. 读取玩家阶段、赛事统计、冠军记录、战队状态。
3. 输出晋级目标差距。
4. 复用或对齐现有 `careerGoal` 逻辑，避免两套规则分叉。
5. 在 session 响应中附带 `careerInsight.stage` 和 `careerInsight.milestones`。

建议规则：

- `rookie`：解释 C/B 赛事、B 级赛事和冠军对青训申请的意义。
- `youth`：解释 B 级赛事参赛和夺冠对二线晋级的意义。
- `second`：解释 A 级赛事参赛和夺冠对职业晋级的意义。
- `pro`：解释 S 级赛事、Major、名气和结局评价。
- `retired`：解释生涯总结和结局原因。

验收标准：

- 不同阶段能输出不同主目标。
- 晋级差距能列出缺失条件。
- 已满足条件时显示 `ready`，不是继续提示缺口。
- 相关纯函数有单元测试。

---

### 阶段 2：风险解释层

状态：未开始。

目标：让玩家知道当前为什么危险，以及该怎么缓解。

任务：

1. 新增 `riskInsight.ts`。
2. 根据压力、疲劳、资金、连败、战队信任、贷款、AP、伤病状态生成风险。
3. 每条风险包含严重程度、原因、建议缓解行动。
4. 风险排序：`danger` > `warning` > `info`。
5. 前端展示最高 3-5 条，避免信息过载。

优先规则：

- 压力 >= 85：危险，提示崩溃风险。
- 疲劳 >= 70：警告，提示压力放大和伤病风险。
- 资金不足以覆盖关键支出：警告或危险。
- 队伍信任低：提示队内冲突或离队压力。
- 连败 >= 2：提示心态和对手事件风险。

验收标准：

- 高压力、高疲劳、低资金均有测试。
- 多风险同时存在时排序稳定。
- 文案解释不夸大，不替代规则结算。

---

### 阶段 3：行动建议层

状态：未开始。

目标：把“下一步建议”从静态目标推进到每周可执行行动。

任务：

1. 新增 `actionRecommendation.ts`。
2. 根据阶段目标、风险、AP、赛事窗口、战队状态生成推荐行动。
3. 每条建议包含收益和代价。
4. 建议不超过 3 条，避免变成完整攻略。
5. 建议应尽量引用现有 actionId，方便前端未来高亮对应按钮。

推荐逻辑示例：

- 疲劳过高：优先休息或恢复。
- rookie 且赛事条件不足：建议报名合适赛事或提升竞技属性。
- 没钱且有关键支出：建议赚钱行动，但提醒疲劳/压力代价。
- 已满足晋级条件：建议等待或处理晋级/申请相关事件。
- 比赛临近：建议恢复手感、降低疲劳，而不是盲目训练。

验收标准：

- 推荐和风险不互相矛盾。
- `actionId` 不存在时可以用纯文本建议。
- 不在事件阶段推荐行动阶段才能做的操作，除非文案明确“下一回合”。

---

### 阶段 4：首局引导

状态：未开始。

目标：降低首局理解成本，让新玩家知道前几回合如何活下来并进入主线。

任务：

1. 新增 `onboarding` 输出。
2. 针对第 1-5 回合提供渐进式说明。
3. 引导重点包括：AP、压力、疲劳、赛事、战队申请、经济。
4. 前端允许折叠或关闭引导。
5. 引导文案不直接承诺最优解，只解释基础策略。

建议节奏：

- 第 1 回合：解释 AP 和行动成本。
- 第 2 回合：解释训练、天梯、疲劳、压力的取舍。
- 第 3 回合：解释赛事窗口和晋级目标。
- 第 4 回合：解释经济压力和赚钱行动代价。
- 第 5 回合：解释战队申请和长期职业路径。

验收标准：

- 新局首回合有引导。
- 早期回合引导不会覆盖关键风险。
- 非新局或中后期可以隐藏引导。

---

### 阶段 5：前端 CareerInsightPanel

状态：未开始。

目标：把结构化 insight 变成清晰 UI。

任务：

1. 新增 `CareerInsightPanel`。
2. 保留或融合现有 `CareerGoalPanel`。
3. UI 分区：当前阶段、下一目标、风险、推荐行动、首局引导。
4. 风险使用颜色/等级区分，但不制造视觉噪音。
5. 推荐行动可以在未来与 `ActionPanel` 做按钮高亮联动。

建议布局：

```text
职业助手
├── 当前处境：路人新人，需要通过赛事证明自己
├── 下一目标：申请青训战队
├── 缺口：B 级赛事 0/1，冠军 0/1
├── 当前风险：疲劳偏高、资金紧张
└── 本周建议：休息 / 报名赛事 / 赚钱
```

验收标准：

- 空 insight 时前端不崩溃。
- 移动端和窄屏可读。
- 不影响已有事件卡、行动面板和结果面板。

---

### 阶段 6：事件原因和限制解释

状态：未开始。

目标：解释“为什么会触发这个事件 / 为什么不能报名 / 为什么没晋级”。

任务：

1. 新增 `eventReason.ts`。
2. 对固定事件 pickup、AI 事件 pickup、赛事上下文事件、晋级事件输出原因摘要。
3. 对常见失败限制输出 blocker：赛事资格、阶段不足、资金不足、队伍条件不足。
4. 先接入 debug 页，再决定是否给普通玩家展示。

输出示例：

```json
{
  "id": "event:tournament-context",
  "title": "赛事上下文事件触发原因",
  "detail": "你刚完成一场 B 级赛事，系统优先抽取赛后上下文事件。",
  "visibility": "debug"
}
```

验收标准：

- debug 页能看到解释。
- 普通 UI 不被过多内部细节打扰。
- 事件原因解释和实际 pickup 规则一致。

---

### 阶段 7：调试页集成和工程收束

状态：未开始。

目标：让 insight 成为开发时也有价值的可观测性工具。

任务：

1. 在 debug session 页面展示完整 `CareerInsight` JSON 或分组 UI。
2. 展示里程碑、风险、推荐、解释的原始数据。
3. 为关键规则补测试。
4. 检查是否可以把现有 `careerGoal` 逻辑合并或改为调用 insight 子模块。
5. 记录后续可拆分点：`routes/game.ts`、`engine/choice.ts`、赛事报名限制、事件 pickup。

验收标准：

- debug 页能解释当前 session 的主要状态。
- 后端测试覆盖核心 insight 规则。
- `careerGoal` 与 `CareerInsight` 不出现明显规则重复冲突。

---

## 6. API 接入策略

推荐渐进式接入，不一次性改完所有响应。

### 6.1 第一阶段接入

在读取 session 的响应中附带：

```ts
{
  session: GameSession,
  careerInsight?: CareerInsight
}
```

如果当前 API 已经直接返回 `GameSession`，需要评估兼容性：

1. 优先新增字段到 session 内部：`session.careerInsight`。
2. 或新增独立 endpoint：`GET /game/:sessionId/insight`。
3. 避免破坏现有前端调用。

初步建议：优先使用独立 endpoint 或 response envelope，等前端稳定后再决定是否内嵌到 session。

### 6.2 后续接入

- `/game/:sessionId`：返回完整 insight。
- `/game/:sessionId/action`：行动后返回更新后的 insight。
- `/game/:sessionId/choice`：选择后返回更新后的 insight。
- `/game/:sessionId/end-action-phase`：进入事件阶段后返回事件原因解释。
- debug endpoint：返回未裁剪的 insight。

---

## 7. 测试策略

### 7.1 后端单元测试

新增：

```text
backend/src/engine/__tests__/careerInsight.test.ts
backend/src/engine/__tests__/riskInsight.test.ts
backend/src/engine/__tests__/actionRecommendation.test.ts
```

重点场景：

1. rookie 初始状态输出青训路径。
2. youth 输出 B 级赛事晋级差距。
3. second 输出 A 级赛事晋级差距。
4. pro 输出 S 级/Major/名气目标。
5. 高压力输出 danger 风险。
6. 高疲劳输出 warning 风险。
7. 低资金输出经济风险。
8. 已满足晋级条件时输出 ready。
9. 比赛周不推荐无关行动。
10. 空队伍、空赛事、旧 session 数据不崩溃。

### 7.2 前端验证

重点验证：

1. 空 insight 不崩溃。
2. insight 字段缺失时有兜底。
3. 移动端布局正常。
4. 风险和推荐的展示顺序稳定。
5. 早期引导可折叠。

### 7.3 回归验证命令

每阶段至少运行：

```bash
npm --prefix backend run typecheck
npm --prefix frontend run typecheck
npm --prefix backend run test
```

若阶段涉及前端构建，还应运行：

```bash
npm --prefix frontend run build
```

---

## 8. 工程风险和控制

### 风险 1：规则重复

如果 `careerGoal`、赛事资格、晋级条件、insight 各自维护规则，会导致显示和实际结算不一致。

控制方式：

- insight 尽量调用已有规则函数。
- 无法调用时，先抽出共享 helper。
- 测试覆盖“显示 ready”和“实际可晋级/可申请”的一致性。

### 风险 2：建议过度承诺

建议如果写得像最优解，会削弱玩家探索，也容易在规则变化后失真。

控制方式：

- 文案使用“建议 / 可以考虑 / 当前优先级较高”。
- 每条建议都写 tradeoff。
- 推荐数量限制在 3 条以内。

### 风险 3：UI 信息过载

状态解释层数据可能很多，如果全塞给玩家会更乱。

控制方式：

- 玩家 UI 只显示摘要。
- debug 页显示完整信息。
- 风险和推荐做排序和裁剪。

### 风险 4：借重构之名大改主循环

方案目标是建立解释层，不是重写游戏。

控制方式：

- 每阶段只改一个边界。
- insight 先只读 session，不参与结算。
- 等解释层稳定后再考虑拆主链路。

---

## 9. 最终完成标准

当以下条件全部满足时，可以认为“状态解释层 + 首局引导”完整完成：

1. 后端有独立 `insights` 模块。
2. 前端有清晰的职业助手面板。
3. 新局前几回合有渐进式引导。
4. 玩家能看到当前阶段目标、晋级差距、风险和行动建议。
5. debug 页能查看完整解释数据。
6. 事件原因和关键限制可以被解释。
7. 核心 insight 规则有单元测试。
8. `careerGoal` 和 `CareerInsight` 没有明显重复冲突。
9. 类型检查和后端测试通过。
10. 文档、README 或相关说明同步更新。

---

## 10. 实现记录

### 2026-06-23 v1 实现状态

已完成：

1. 阶段 0：后端 `backend/src/engine/insights/` 类型和生成入口已建立。
2. 阶段 1：职业阶段和晋级解释已接入，复用 `buildCareerGoal` 的阶段目标和赛事窗口结果。
3. 阶段 2：风险解释层已实现，覆盖高压力、高疲劳、低资金、队伍信任、连败、低 AP。
4. 阶段 3：行动建议层已实现，按阶段、风险、事件阶段限制输出最多 3 条建议。
5. 阶段 4：首局第 1-5 回合引导已实现。
6. 阶段 5：前端职业助手面板已接入，展示阶段、目标、风险、建议、首局引导、玩家可见解释。
7. 阶段 6：事件阶段、赛事上下文、pending match 的基础解释和 blocker 已实现。
8. 阶段 7：debug session 页已展示完整 `CareerInsight` 摘要和 JSON。

已接入 API：

- `POST /game/start`
- `GET /game/:sessionId`
- `POST /game/:sessionId/choice`
- `POST /game/:sessionId/action`
- `POST /game/:sessionId/end-action-phase`
- `POST /game/:sessionId/team-response`

验证记录：

- `npm --prefix backend run typecheck`：通过。
- `npm --prefix frontend run typecheck`：通过。
- `npm --prefix frontend run build`：通过。
- `git diff --check`：通过。
- `npm --prefix backend run test`：当前环境启动 Vitest 即 `Bus error`，退出码 135；该问题在实现前基线也可复现。已新增 `backend/src/engine/__tests__/careerInsight.test.ts`，但当前环境无法执行 Vitest 验证。

后续建议：

1. 单独排查 Vitest / Node 22.22.3 / WSL 当前环境的 `Bus error`。
2. 在测试可运行后执行 `careerInsight.test.ts` 并补充更细的路由响应测试。
3. 继续收束 `careerGoal` 与 `CareerInsight` 的重复展示逻辑，避免长期双轨维护。

---

## 11. 推荐实施顺序

建议按以下 PR / 分支节奏推进：

1. `feat/career-insight-types`：只加类型和空生成器。
2. `feat/progression-insight`：阶段目标和晋级差距。
3. `feat/risk-insight`：风险解释。
4. `feat/action-recommendations`：行动建议。
5. `feat/onboarding-insight`：首局引导。
6. `feat/career-insight-panel`：前端职业助手面板。
7. `feat/insight-debug-reasons`：debug 页和事件原因解释。
8. `refactor/unify-career-goal-insight`：收束重复逻辑。

这个顺序保证每一步都能独立 review、独立验证，同时逐步完成方案 2 的目标。
