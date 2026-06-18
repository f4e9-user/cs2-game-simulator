# 结局后职业履历评价设计

落地日期：2026-06-17

## 背景

当前游戏已经有多种结局方向，例如 `legend`、`champion`、`free-agent-legend`、`loyal-veteran`、`retired_on_top`、`stress_breakdown`、`injury_ended_career` 等。它们能表达最终结果，但对非顶级结局的职业过程总结不够充分。

玩家在一局结束时真正关心的不只是“有没有成为传奇”，还包括这段职业生涯的路线、巅峰、遗憾和代价。例如一个没有拿到传奇结局的玩家，也可能是长期二线稳定输出、自由人路线打出名气、被伤病拖住、经济压力过重，或高光很多但冠军不足。

本设计目标是在结局面板中增加“职业履历评价”，让每局都能形成可回味的职业故事。

## 设计目标

- 保留现有结局 ID 和结局文案，避免破坏当前结局判定。
- 在结局面板新增职业履历评价模块，提供主称号、短评和关键履历标签。
- 让失败结局、普通退役结局也具备辨识度。
- 基于稳定规则生成评价，第一版不依赖 AI 文案。
- 为后续扩展 Major 最佳成绩、世界排名峰值、代表作比赛等履历系统预留空间。

## 非目标

- 第一版不重写现有结局判定逻辑。
- 第一版不引入 AI 生成结局总结。
- 第一版不做复杂评分系统或全球排行榜评价。
- 第一版不要求补全所有历史赛事细节，只使用已有数据和少量必要新增字段。

## 现有可复用数据

当前 `Player` 已经具备以下可用于职业履历评价的数据：

- `stage`：最终阶段。
- `fame`：最终名气。
- `stress`、`stressMaxRounds`：压力状态和压力上限持续时间。
- `stats.constitution`：最终体质。
- `tags`：生涯标签。
- `everHadTeam`：是否曾签约战队。
- `team`：当前或最终战队。
- `contractRenewals`：续约次数。
- `tournamentParticipations`：总参赛次数。
- `tournamentChampionships`：总冠军数。
- `tierParticipations`：分层赛事参赛记录。
- `tierChampionships`：C/B/A/S/Major 等分层冠军记录。
- `championshipSeries`：PGL、BLAST、Major 冠军记录。
- `loans`：贷款状态。
- `creditScore`：信用分。
- `consecutiveBrokeRounds`：连续破产回合数。

这些数据足以生成第一版评价，但仍缺少历史峰值类信息。

## 新增数据字段

建议在 `Player` 上新增两个结构化字段。

```ts
export interface CareerPeaks {
  highestStage: CareerCompetitiveStage;
  peakFame: number;
  peakStress: number;
  lowestConstitution: number;
}

export type CareerCompetitiveStage = Exclude<Stage, 'retired'>;

export interface TeamCareer {
  longestTeamName?: string;
  longestTeamTag?: string;
  longestTeamTier?: ClubTier;
  longestTeamRounds: number;
}
```

并在 `Player` 中追加：

```ts
careerPeaks?: CareerPeaks;
teamCareer?: TeamCareer;
```

### 字段含义

- `highestStage`：职业生涯达到过的最高阶段，避免最终 `retired` 或离队状态掩盖真实巅峰。
- `peakFame`：名气峰值，用于区分“曾经很红但结局一般”和“整个生涯平淡”。
- `peakStress`：压力峰值，用于表达透支代价。
- `lowestConstitution`：最低体质，用于表达伤病代价。
- `longestTeamName` / `longestTeamTag` / `longestTeamTier`：效力最长战队摘要。
- `longestTeamRounds`：最长连续效力回合数。

## 数据维护规则

每次玩家状态变化并准备持久化 session 前，都必须维护职业峰值。实现上建议新增统一收口 helper，例如：

```ts
finalizePlayerCareerSnapshot(player): Player
finalizeGameSessionCareerSnapshot(session): GameSession
```

`finalizePlayerCareerSnapshot` 只处理玩家对象，`finalizeGameSessionCareerSnapshot` 负责把更新后的玩家重新塞回 `session.player`。所有会返回或保存新 `GameSession` 的 mutation，都应在写回前经过 session 级 helper，避免 route 或 engine 调用方忘记把更新后的 player 写回 session。

helper 内部负责：

- `careerPeaks = updateCareerPeaks(player)`。
- `teamCareer = updateTeamCareer(player)`。
- 旧存档字段缺失时补默认值。

不能只在 `applyAction` / `settleEvent` 调用，因为当前游戏还有贷款、商店、接受 offer、离队、debug 更新等独立状态变更入口。实现时应优先让这些入口在返回 session 前统一调用 `finalizeGameSessionCareerSnapshot`，避免职业履历快照漏刷。

禁止 route 直接调用 `storage.sessions.save(session)` 保存未 finalize 的 session；保存前必须保证 session 已经过 `finalizeGameSessionCareerSnapshot`。

为降低漏改风险，后端实现时建议新增局部保存 helper，例如：

```ts
saveFinalizedSession(storage, session): Promise<void>
```

该 helper 内部先调用 `finalizeGameSessionCareerSnapshot(session)`，再调用 `storage.sessions.save(finalizedSession)`。后续逐步替换 `backend/src/routes/game.ts` 和 `backend/src/routes/debug.ts` 中分散的直接 save 调用。

维护规则：

- `highestStage` 只记录竞技阶段，允许值为 `rookie | youth | second | pro`，不包含 `retired`。
- 阶段比较顺序为 `rookie < youth < second < pro`。玩家退役时不更新 `highestStage`，避免 `retired` 覆盖真实竞技巅峰。
- `peakFame` 取历史最大名气。
- `peakStress` 取历史最大压力。
- `lowestConstitution` 取历史最低体质。
- 第一版的 `teamCareer` 记录“最长连续效力战队”，不是完整队史。
- 玩家有战队时，根据 `player.round - player.team.joinedRound` 计算当前连续效力回合；如果超过 `teamCareer.longestTeamRounds`，刷新最长效力战队摘要。
- 玩家离队后，`teamCareer` 不清空。离队、换队、接受新 offer 等会清空或替换旧 `player.team` 的流程，必须在清空旧战队前先调用一次 `finalizePlayerCareerSnapshot` 或专门的 `finalizeCurrentTeamCareer`，记录旧队最后一段连续效力；随后再执行统一的 `finalizeGameSessionCareerSnapshot`。
- 旧存档没有该字段时，读取时用当前状态懒初始化。
- 类型层面字段保留 optional 是为了兼容旧存档；运行时应通过 normalizer 或 helper 给 UI 提供完整默认值，组件不直接假设字段必定存在。

## 前端评价模型

前端新增纯函数：

```ts
buildCareerReview(player: Player, ending?: string): CareerReview
```

返回结构：

```ts
export interface CareerReview {
  title: string;
  summary: string;
  chips: CareerReviewChip[];
}

export interface CareerReviewChip {
  label: string;
  tone: 'gold' | 'good' | 'warn' | 'danger' | 'neutral';
}
```

该函数只负责基于玩家最终快照生成展示文案，不修改游戏状态。

## 主称号规则

主称号按优先级匹配，先匹配强叙事，再匹配普通履历。

| 优先级 | 条件 | 称号 |
|---|---|---|
| 1 | `ending === 'legend'` | 大满贯传奇 |
| 2 | `ending === 'free-agent-legend'` | 草根枪男 |
| 3 | `ending === 'loyal-veteran'` | 体系型老将 |
| 4 | `ending === 'banned_for_match_fixing'` | 禁赛坠落者 |
| 5 | `ending === 'banned_for_cheating'` | 作弊毁掉的职业路 |
| 6 | `ending === 'family_crisis_career_ended'` | 被生活截断的职业路 |
| 7 | `ending === 'injury_ended_career'` 或体质极低 | 被伤病拖住的天才 |
| 8 | `ending === 'stress_breakdown'` 或压力峰值极高 | 透支型选手 |
| 9 | `ending === 'champion'`，或拥有 Major 冠军但未满足传奇条件 | 冠军老兵 |
| 10 | `ending === 'retired_on_top'` 且有 S 级冠军或高名气 | 巅峰退役者 |
| 11 | 拥有 PGL/BLAST/Major 任一系列冠军，或 S 级冠军数达到阈值，但未完成大满贯 | 顶级赛事常客 |
| 12 | A/B 级冠军多，S 级冠军少或没有 | 二线联赛常青树 |
| 13 | 名气峰值高但冠军少 | 高光很多但冠军太少 |
| 14 | 从未签约战队但没有达到自由人传奇 | 自由人游侠 |
| 15 | 贷款违约或经济状况严重恶化 | 被经济拖累的职业路 |
| 16 | 无明显强特征 | 平凡但完整的职业生涯 |

注意：

- 经济类称号优先级低于伤病、压力和竞技履历，避免玩家明明是冠军级表现却只因贷款被覆盖。
- 禁赛类结局优先级高于普通竞技履历，因为这类结局本身会重写玩家对整段职业生涯的记忆。
- PGL/BLAST 是赛事品牌系列，Major 是赛事类型或系列统计，不应统一描述成“S 级冠军”。需要按 `championshipSeries` 和 `tierChampionships.s` 分别判断。

## 第一版阈值

为避免实现时各处临时拍阈值，第一版评价规则统一使用以下默认阈值。后续可以根据真实游玩数据再调整。

评价函数应先把玩家数据归一化为 `NormalizedCareerReviewPlayer`，再应用阈值。归一化兜底：

- `peakFame = player.careerPeaks?.peakFame ?? player.fame ?? 0`。
- `peakStress = player.careerPeaks?.peakStress ?? player.stress ?? 0`。
- `lowestConstitution = player.careerPeaks?.lowestConstitution ?? player.stats.constitution ?? 0`。
- `highestStage = player.careerPeaks?.highestStage ?? (player.stage === 'retired' ? undefined : player.stage)`。
- `teamCareer` 缺失时按兼容性章节处理，不在规则函数中直接读取 optional 字段。

| 规则项 | 阈值 |
|---|---|
| 体质极低 | `normalized.lowestConstitution <= 3` |
| 压力峰值极高 | `normalized.peakStress >= 90` |
| S 级冠军数达到阈值 | `tierChampionships.s >= 2` |
| A/B 级冠军多 | `tierChampionships.a + tierChampionships.b >= 3` |
| 名气峰值高 | `normalized.peakFame >= 70` |
| 冠军少 | `tournamentChampionships <= 1` |
| 高光很多但冠军太少 | 名气峰值高且冠军少，且不是禁赛、伤病、压力崩溃类结局 |
| 贷款未清 | `loans` 中存在 `!paid && !defaulted` |
| 有过违约 | `loans` 中存在 `defaulted`，或存在 `loan-default` / `suspicious-debt` 标签 |
| 经济状况严重恶化 | 有过违约，或 `creditScore <= 30`，或 `consecutiveBrokeRounds >= 4` |

## 短评生成规则

短评控制在一到两句话，组合以下维度：

- 最高阶段：是否达到 `pro`、`second`。
- 赛事层级：最高参赛或夺冠层级。
- 冠军质量：C/B/A/S 冠军数量和 Major/PGL/BLAST 冠军。
- 名气与冠军匹配度：高名气低冠军时强调遗憾。
- 战队路线：全程自由人、曾签约后自由人、长期同队。
- 经济状态：贷款未清、违约、信用低。
- 代价：压力峰值、伤病、体质下滑。

赛事层级归一化：

```ts
participation: c < b < a < s-qualifier < s-main < major
championship: c < b < a < s < major
```

展示规则：

- “最高参赛层级”优先从 `tierParticipations` 推导。当前参赛记录主要使用 `TournamentProgressionTier`，即 `c | b | a | s-qualifier | s-main | major`。
- “最高夺冠层级”优先从 `tierChampionships` 推导。冠军记录可能同时包含 `t.tier`、`t.progressionTier` 和汇总键，因此需要归一化。
- `major` 视为最高赛事层级。
- 冠军层级中，`s`、`s-class`、`s-main` 都展示为 `S 级`；`major` 单独展示为 `Major`。
- 如果只有 `s` 汇总键而没有更细的 `s-main` / `s-class`，仍展示为 `S 级`。

示例：

- “你没有完成大满贯，但已经在顶级赛事中留下过冠军记录，这是一段接近传奇的职业生涯。”
- “你长期停留在二线赛事，却不断积累冠军和经验，是典型的联赛常青树路线。”
- “名气和高光都不缺，但关键冠军数量不足，职业生涯更像一段差一步登顶的故事。”
- “伤病让你的上限没有完全兑现，结局更像是天赋被身体状态提前截断。”

## 关键履历标签

评价模块展示 3 到 6 个标签，帮助玩家快速读懂这一局。

可选标签：

- 最高阶段：`最高阶段：职业`、`最高阶段：二线`。
- 最高赛事层级：`最高赛事：S 级`、`最高赛事：Major`。
- 总冠军：`总冠军 ×3`。
- 系列冠军：`PGL ×1`、`BLAST ×1`、`Major ×1`。
- 大满贯进度：`大满贯完成`、`距大满贯差 BLAST`。
- 战队路线：`全程自由人`、`曾签约战队`、`最长效力 120 回合`。
- 经济状态：`贷款未清`、`有过违约`、`信用良好`。
- 代价：`压力峰值 95`、`伤病代价高`。

标签 tone 建议：

- `gold`：传奇、大满贯、S 级冠军。
- `good`：晋级、冠军、长期效力、信用良好。
- `warn`：冠军不足、压力偏高、贷款未清。
- `danger`：伤病结局、压力崩溃、违约。
- `neutral`：普通事实标签。

## 结局面板结构调整

建议结局页顺序调整为：

1. 生涯结束标题：显示现有结局文案。
2. 职业履历评价：新增模块，显示主称号、短评、履历标签。
3. 生涯轨迹：结束时间、总回合数、最高阶段。
4. 赛事生涯：参赛次数、总冠军、C/B/A/S 冠军、PGL/BLAST/Major。
5. 战队历史：当前/最终战队、最长效力战队、自由人路线、续约次数。
6. 代价与资源：名气峰值、最终资金、贷款状态、压力峰值、最低体质。
7. 开局特质和生涯标签：保留现有展示。

## UI 原则

- 职业履历评价放在结局标题下方，作为玩家读到的第一段“解释”。
- 主称号字号略小于结局标题，但比普通 section 标题更醒目。
- 短评控制长度，避免把结局页变成说明书。
- 标签使用紧凑 chip，不使用大卡片嵌套。
- 移动端需要保证称号、短评、标签自动换行，不挤压原有数据区域。

## 兼容性

- 旧存档没有 `careerPeaks` 和 `teamCareer` 时，前端使用当前 `player.fame`、`player.stress`、`player.stats.constitution`、`player.team` 兜底。
- 旧存档若 `player.stage !== 'retired'`，可以用当前 `player.stage` 作为临时 `highestStage`。
- 旧存档若 `player.stage === 'retired'` 且没有 `careerPeaks`，前端显示“最高阶段未知”，不能把 `retired` 当作最高竞技阶段。
- 如果旧存档缺少 `teamCareer` 且当前仍有 `team`，可以用当前战队和 `player.round - player.team.joinedRound` 作为临时最长效力战队。
- 如果旧存档缺少 `teamCareer` 且当前无战队，只能显示“暂无最长效力记录”或“曾签约战队”，不能推断具体最长战队。
- 后端新建角色时初始化新字段。
- 后端每次持久化 session 前通过 `finalizeGameSessionCareerSnapshot` 刷新新字段，内部调用 `finalizePlayerCareerSnapshot`，逐步让旧存档自然补齐。
- 结局判定仍使用现有字段，不依赖职业履历评价结果。

## 测试计划

后端测试：

- 新角色初始化 `careerPeaks` 和 `teamCareer`。
- 名气上涨后 `peakFame` 更新。
- 压力上涨后 `peakStress` 更新。
- 体质下降后 `lowestConstitution` 更新。
- 晋级到更高阶段后 `highestStage` 更新，退役不覆盖竞技最高阶段。
- 玩家离队后，最长效力战队仍保留。

前端测试：

`buildCareerReview` 必须做成无 React 依赖的纯函数，便于后续直接接入单元测试。

- 规则函数独立放在 `frontend/src/lib/` 下，不依赖组件状态和浏览器 API。
- `npm run typecheck` 覆盖类型正确性。
- 第一版推荐给 frontend 引入 Vitest，只测试纯函数，不测试 React 组件。
- 如果引入 Vitest，需要新增 frontend `test` script，并把 `npm run test` 纳入验证命令。
- 如果实现阶段暂不引入前端测试框架，必须在实现计划中明确原因，并将以下用例保留为手动验证清单。

- `legend` 返回“大满贯传奇”。
- `free-agent-legend` 返回“草根枪男”。
- `loyal-veteran` 返回“体系型老将”。
- 禁赛结局返回对应禁赛类称号。
- `family_crisis_career_ended` 返回生活危机类称号。
- `champion` 返回冠军类称号。
- 高名气低冠军返回“高光很多但冠军太少”。
- 伤病结局优先返回“被伤病拖住的天才”。
- 压力崩溃优先返回“透支型选手”。
- 没有强特征时返回兜底评价。

基础验证命令：

```bash
cd backend && npm run typecheck
cd frontend && npm run typecheck
git diff --check
```

如果引入 Vitest，额外执行：

```bash
cd frontend && npm run test
```

如果第一版暂不引入 frontend 测试框架，最终交付说明必须明确“前端规则仅通过 typecheck 和手动用例验证”。

## 实施拆分

建议分三步实施。

### 第一步：数据层

- 在后端和前端类型中增加 `CareerPeaks`、`TeamCareer`。
- 新建或补充职业峰值维护函数。
- 新角色初始化字段。
- 新增 `finalizePlayerCareerSnapshot` 和 `finalizeGameSessionCareerSnapshot`，所有会持久化 session 的 mutation 在返回前统一调用 session 级 helper。
- 覆盖回合结算、赛事结算、贷款、商店、接受 offer、离队、debug 更新等状态变化入口。
- 在离队、换队、接受新 offer 等逻辑清空或替换 `player.team` 前刷新一次旧队 `teamCareer`，保证最后一段效力不会丢失。

### 第二步：评价生成

- 在开始前明确是否给 frontend 引入 Vitest：
  - 如果引入，先补 `devDependencies` 和 `test` script，再写 `buildCareerReview` 纯函数测试。
  - 如果暂不引入，必须在实现计划和最终交付说明中标注前端评价规则只做 typecheck 与手动用例验证。
- 前端新增 `buildCareerReview`。
- 补充称号优先级和短评规则。
- 从 `careerPeaks`、`teamCareer` 和现有赛事数据生成履历标签。

### 第三步：结局页接入

- `EndingPanel` 增加职业履历评价区块。
- 生涯轨迹中的“最终阶段”调整为“最高阶段”。
- 战队历史补充“最长效力战队”。
- 代价与资源补充名气峰值、压力峰值、最低体质、贷款状态。

## 后续扩展方向

### 1. Major 最佳成绩

当前只能准确记录 Major 冠军数，后续可以增加：

- Major 参赛次数。
- Major 最佳成绩：冠军、亚军、四强、八强、小组出局。
- Major 决赛失败次数。

这样可以支持“无冕之王”“Major 决赛遗憾者”等评价。

### 2. 代表作比赛

从历史比赛中记录最高 rating、最高击杀、最关键淘汰赛胜利：

- 生涯代表作。
- 最佳 BO3 / BO5。
- 最高个人 rating。
- 淘汰赛 MVP 表现。

结局页可以展示“代表作：PGL 半决赛 1.42 rating”。

### 3. 世界排名和 VRS 峰值

如果后续 VRS 和世界俱乐部系统继续完善，可以记录：

- 个人或战队 VRS 峰值。
- 最高世界排名。
- 击败过的最高排名对手。

这能让没有冠军的高水平路线也更有价值。

### 4. 战队生涯履历

当前第一版只记录最长效力战队。后续可扩展为完整队史：

- 效力过的全部战队。
- 每支战队效力回合。
- 在该队期间冠军数。
- 离队原因：主动离队、合约结束、战队解散、队友转会影响。

### 5. 经济生涯评价

当前只展示最终贷款和信用状态。后续可以记录：

- 历史最高负债。
- 总借款次数。
- 总还款金额。
- 是否靠奖金翻身。
- 是否多次依赖家庭/朋友救助。

可生成“从破产边缘翻身”“被经济压力拖垮”等路线。

### 6. 压力与伤病曲线

后续可记录压力峰值次数、伤病事件次数、休养总回合：

- 高压夺冠。
- 伤病反复。
- 长期疲劳比赛。
- 休养复出后夺冠。

这样能让代价不只是最终数值，而是完整职业曲线。

### 7. 结局图鉴

在多周目层面记录玩家解锁过的职业称号和结局：

- 已解锁结局。
- 已解锁职业称号。
- 未解锁路线提示。
- 最佳生涯档案。

这可以强化重玩目标。

### 8. AI 生涯传记

稳定规则版成熟后，可以把结构化履历输入 AI，生成一段可选的生涯传记。

要求：

- AI 只能基于结构化事实生成，不捏造冠军或战队。
- 规则版标题和标签仍作为默认展示。
- AI 文案失败时回退到规则短评。

## 风险与注意事项

- 不要让职业评价反向影响结局判定，避免展示逻辑污染游戏逻辑。
- 主称号优先级需要谨慎，避免“贷款未清”覆盖“大满贯传奇”这类高价值履历。
- 文案要避免羞辱玩家，失败结局也应该有叙事价值。
- 新字段需要兼容旧存档，不能因为字段缺失导致结局页崩溃。
- 第一版规则不要过度复杂，后续可以通过更多历史数据逐步细化。
