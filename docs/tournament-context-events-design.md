# 赛事上下文事件系统设计方案

落地日期：2026-06-10  
当前分支：`feature/team-management-actions`  
状态：已完成

## 1. 设计目标

当前赛事流程已经能保证比赛事件稳定推进，但赛事周边的更衣室、媒体、队伍压力、赛后分锅等内容还没有作为独立系统存在。后续需要把这些内容做成“赛事上下文事件”，让赛事不只是报名和结算，而是形成完整的赛前、赛中、赛后叙事链。

设计目标：

- 真正比赛事件 `tournament-*` 永远最高优先级，不能被任何上下文事件打断。
- 普通随机事件不能随意插入赛事流程。
- 赛事上下文事件必须服务当前报名赛事，而不是普通事件池里的泛用事件。
- 事件结果要能影响比赛准备、队伍关系、压力、疲劳、队友默契、离队压力、媒体口碑。
- 不同赛事层级有不同强度：C/B 级轻量，A/S 级明显，Major 强烈。
- 多阶段赛事每个阶段都可以有赛前和赛后上下文。

## 2. 当前实现问题

当前代码中，赛事相关事件主要依赖 `pendingMatch`。

现有流程大致是：

```text
报名赛事
  -> 写入 pendingMatch
  -> 准备周 pickEvent(...) 固定返回 buildTournamentPrepEvent(...)
  -> 比赛周 applyChoice(...) 强制生成 tournament-* 比赛事件
  -> 赢了且不是最终阶段则 stageIndex + 1，下一周继续比赛
  -> 输了或打完最终阶段则 pendingMatch = null
```

当前优点：

- 比赛事件不会被普通事件池打断。
- 赛事比赛周会禁用日常行动。
- 多阶段赛事能稳定推进。

当前问题：

- `buildTournamentPrepEvent(...)` 是固定动态事件，不是上下文事件池。
- 更衣室、媒体、队伍政治、赛后分锅等内容无法围绕具体赛事生成。
- 普通 `team` 事件即使写了赛事触发条件，也会被 `pendingMatch` 隔离挡住。
- 赛后缺少承接，输赢对队伍关系和后续故事的影响不够明显。

## 3. 核心原则

赛事上下文事件不是普通随机事件，也不是比赛事件。它应该是赛事系统的一部分。

核心原则：

```text
赛事比赛事件 > 赛事上下文事件 > 普通随机事件
```

只要到了比赛周，就必须直接进入比赛事件：

```ts
if (pendingMatch && isMatchWeek(player, pendingMatch)) {
  return synthesizeMatchEvent(tournament, pendingMatch.stageIndex);
}
```

这条规则必须永远排在赛事上下文事件之前。

## 4. 推荐赛事流程

完整赛事流程：

```text
报名周
  -> 报名确认
  -> 报名后上下文事件入队
  -> 玩家仍可进行日常行动

准备周
  -> 赛事准备上下文事件
  -> 玩家行动
  -> 赛前状态预览

比赛周
  -> 强制 tournament-* 比赛事件
  -> 不允许任何上下文事件插入
  -> 不允许日常行动

赛后周
  -> 赛后上下文事件
  -> 根据胜负、比分、个人数据、赛事阶段生成不同事件
```

多阶段赛事：

```text
报名
-> 报名后上下文
-> 阶段 1 准备上下文
-> 阶段 1 比赛
-> 阶段 1 赛后上下文
-> 阶段 2 准备上下文
-> 阶段 2 比赛
-> 阶段 2 赛后上下文
-> ...
```

## 5. 事件优先级

建议统一抽象为 `pickNextEvent(...)`，不要让不同路径各自决定事件。

优先级：

```text
1. 结局 / 退役 / run 结束
2. tournament-* 比赛事件
3. 白名单最高优先级系统事件
4. 赛事赛后上下文事件
5. 赛事准备上下文事件
6. 赛事报名后上下文事件
7. 面试 / 晋级 / 破产救济等系统事件
8. 普通随机事件
```

伪代码：

```ts
function pickNextEvent(session: GameSession): EventDef | null {
  const player = session.player;

  if (isRunEnded(session)) return null;

  if (player.pendingMatch && isMatchWeek(player, player.pendingMatch)) {
    return buildTournamentMatchEvent(player.pendingMatch);
  }

  const critical = pickCriticalSystemEvent(session);
  if (critical) return critical;

  const tournamentContext = pickTournamentContextEvent(session);
  if (tournamentContext) return tournamentContext;

  const systemEvent = pickSystemEvent(session);
  if (systemEvent) return systemEvent;

  return pickNormalEvent(session);
}
```

关键限制：

- `pickTournamentContextEvent(...)` 不能在比赛周返回任何事件。
- 普通 `pickEvent(...)` 不应该直接处理 `pendingMatch` 的全部赛事逻辑。
- `applyAction(...)` 在比赛周继续禁止日常行动。
- `pickCriticalSystemEvent(...)` 只处理强制状态，不能让任意系统事件压过赛事上下文。

### 赛事期间强制状态处理

赛事期间的强制状态处理只允许解决“如果不处理会让当前赛事状态明显不合理”的问题。

允许在非比赛周压过赛事上下文：

- 强制休养：`restRounds > 0` 且不是比赛周时，优先进入 `rest` 类型事件。

不允许压过赛事上下文：

- 普通 `team` 事件。
- 普通 `media` 事件。
- 普通 `life` 事件。
- 普通 AI 事件。
- 家人危机事件链，赛事期间应排队延后，不能单独压进赛事流程。
- 破产救济事件，赛事期间应标记 `bailout-queued`，当前赛事阶段结束后再处理。
- 战队申请回信 / 面试事件，赛事上下文期间可以延后处理。
- 晋级叙事事件，除非当前赛事已经完全结束。

家人危机虽然重要，但它是长事件链，不是单次状态修复事件。如果在赛事准备周强行插入，会让玩家刚报名或刚晋级就被完全不同的叙事线打断。更合理的处理方式是：

```text
赛事期间满足家人危机触发条件
-> 标记 pendingFamilyCrisis 或 family-crisis-queued
-> 当前赛事阶段结束后再进入家人危机事件链
```

破产救济当前不是长事件链，但它也属于较强叙事事件，会破坏赛事准备节奏。赛事期间如果触发破产救济条件，应该先排队：

```text
赛事期间满足破产救济触发条件
-> 标记 bailout-queued
-> 当前赛事阶段结束后再进入 bailout 事件
```

比赛周规则不变：

```text
只要当前周是 pendingMatch.resolveYear/week：
  只允许赛事比赛事件

正常状态：
  返回普通 tournament-* 比赛事件

restRounds > 0：
  返回 injury-aware tournament event
```

比赛周不允许普通系统事件、普通上下文事件、普通 AI 事件插入。`injury-aware tournament event` 属于赛事比赛事件，不属于普通上下文事件。

如果 Bo3 / Bo5 需要图间沉默、教练暂停、临场争执等内容，它们必须在 `tournament-series` 创建时成为 series 内部 step，不能从 `tournamentContext.contextEventQueue` 现场插入。

```text
允许：
  tournament-series step: Map 1
  tournament-series step: 图间暂停
  tournament-series step: Map 2

不允许：
  比赛周 pickTournamentContextEvent(...)
  普通 AI 事件插入 Map 1 和 Map 2 之间
  普通 team/media/life 事件插入 series
```

## 6. 新增数据结构

建议保留 `pendingMatch` 的职责：记录当前要打哪场赛事、哪一阶段、哪一周结算。

新增 `tournamentContext` 负责赛事叙事链：

```ts
interface TournamentContext {
  tournamentId: string;
  stageIndex: number;

  signedUpAtRound: number;
  signedUpAtYear: number;
  signedUpAtWeek: number;

  resolveYear: number;
  resolveWeek: number;

  phase:
    | 'signup'
    | 'pre-match'
    | 'match'
    | 'post-match'
    | 'complete';

  contextEventQueue: TournamentContextEventRef[];
  consumedContextEventIds: string[];

  lastMatchResult?: TournamentContextMatchResult;

  pressureLevel: number;
  stakesLevel: number;
}

interface TournamentContextEventRef {
  eventId: string;
  phase: TournamentContextPhase;
  stageIndex: number;
  priority: number;
  expiresAtRound?: number;
}

interface TournamentContextMatchResult {
  won: boolean;
  isFinalStage: boolean;
  teamScore: number;
  enemyScore: number;
  kills: number;
  deaths: number;
  assists: number;
  rating: number;
  headshotRate: number;
}

type TournamentContextPhase =
  | 'signup'
  | 'pre-match'
  | 'match'
  | 'post-match'
  | 'complete';
```

阶段语义：

- `signup`：报名后反应，不能覆盖当前事件，只能进入队列。
- `pre-match`：比赛周之前的准备上下文。
- `match`：只用于标记当前处于比赛周，不允许上下文事件消费。
- `post-match`：比赛结算后的赛后上下文。
- `complete`：上下文已结束，可清理。

`between-stages`、`elimination`、`final` 不作为 phase。它们应该作为事件条件或标签存在：

```ts
interface TournamentContextEventDef extends EventDef {
  requireBetweenStages?: boolean;
  requireEliminationStage?: boolean;
  requireFinalStage?: boolean;
}
```

## 7. 新事件类型

新增事件类型：

```ts
type EventType =
  | ...
  | 'tournament-context';
```

赛事上下文事件定义建议：

```ts
interface TournamentContextEventDef extends EventDef {
  type: 'tournament-context';
  contextPhase: TournamentContextPhase[];

  tournamentTiers?: TournamentTier[];
  progressionTiers?: string[];

  requireTeam?: boolean;
  requireNoTeam?: boolean;

  requireMatchResult?: 'win' | 'loss';
  requireFinalStage?: boolean;
  requireBetweenStages?: boolean;
  requireEliminationStage?: boolean;
  requireDeciderStage?: boolean;

  minStress?: number;
  minFatigue?: number;
  maxTeamTrust?: number;
  minTeamTrust?: number;

  requireTeamIdentity?: TeamIdentity[];
  targetIdentity?: TeamIdentity;
}
```

## 8. Context 生命周期

`pendingMatch` 负责比赛进度，`tournamentContext` 负责赛事叙事。两者生命周期不同。

### 创建

报名成功时创建：

```ts
onTournamentSignup(tournament) {
  player.pendingMatch = createPendingMatch(tournament);
  player.tournamentContext = createTournamentContext(tournament, player.pendingMatch);
  enqueueSignupContextCandidates();
  enqueuePreMatchContextCandidates();
}
```

如果玩家已有未完成 `tournamentContext`：

- 如果旧 context 仍绑定未完成 `pendingMatch`，禁止报名新赛事。
- 如果旧 context 只剩赛后事件，报名新赛事时将旧赛后事件降级为普通回忆事件或直接丢弃。
- 不允许同时存在两个活跃赛事 context。

### 阶段推进

比赛胜利且赛事还有下一阶段时：

```ts
onTournamentStageAdvanced(nextPendingMatch) {
  context.stageIndex = nextPendingMatch.stageIndex;
  context.resolveYear = nextPendingMatch.resolveYear;
  context.resolveWeek = nextPendingMatch.resolveWeek;
  context.phase = 'pre-match';
  enqueuePreMatchContextCandidates();
}
```

### 比赛结算

每次比赛结算后写入 `lastMatchResult`：

```ts
onTournamentMatchResolved(result) {
  context.lastMatchResult = result;
  context.phase = 'post-match';
  enqueuePostMatchContextCandidates(result);
}
```

如果比赛失败或最终阶段结束，`pendingMatch` 可以清空，但 `tournamentContext` 仍短期保留用于赛后事件。

### 清理

满足任一条件时清理：

- 赛后上下文队列为空。
- 赛后事件过期。
- 玩家报名新赛事，旧赛后事件被丢弃或降级。
- 已经过了赛事结束后 2 回合。

建议增加：

```ts
context.expiresAtRound = player.round + 2;
```

防止旧赛事事件污染下一场赛事。

## 9. 报名周上下文

报名周上下文不是强制抢当前事件，而是报名成功后进入 `contextEventQueue`。

适合事件：

- 报名后的目标确认。
- 资格门票争论。
- 队友担心赛程。
- 教练询问赛事目标。
- 连续报名导致的疲劳争议。

示例事件：报名后的目标确认

```text
触发：报名任意赛事后
选项：
- 明确目标是夺冠：压力上升，队伍信任上升，失败后分锅事件权重提高。
- 目标是练兵：压力下降，队伍信任小幅变化，比赛收益期待降低。
- 不表态：队伍信任小幅下降。
```

出现概率建议：

```text
C/B 级：30%-40%
A 级：50%
S 级：70%
Major：90%
决赛 / 资格链关键赛：至少 1 个上下文事件
```

## 10. 准备周上下文

准备周是赛事上下文事件的主阶段。

适合事件：

### 赛前更衣室冷场

触发：

- 压力高。
- 淘汰赛、决赛、Major。
- 队伍信任偏低。

影响：

- 成功处理：压力下降，队伍默契上升。
- 失败处理：压力上升，`locker-tension` 增加。

### 加练分歧

触发：

- 比赛前一周。
- 疲劳高或近期连败。

选项：

- 继续练：手感上升，疲劳上升。
- 强制休息：疲劳下降，手感可能下降。
- 分组训练：成功则队伍默契上升，失败则 `role-confusion`。

### 道具资源争执

触发：

- 有战队。
- A/S/Major 前。
- 队内存在指挥和明星位。

选项：

- 支持指挥：指挥默契上升，明星默契下降。
- 支持明星：明星默契上升，指挥默契下降。
- 让教练定：队伍信任上升，但个人话语权不变或下降。

### 默认位冲突

触发：

- 比赛前。
- 队伍协同低。
- 近期比赛表现波动。

影响：

- 队伍默契、目标队友默契、赛前 buff。

### 赛前采访口径

触发：

- A/S/Major。
- 玩家名气高。

影响：

- 名气、队伍信任、`bad-rep` 风险。

### 准备周 fallback

准备周优先从 `contextEventQueue` 取赛事上下文事件。

如果出现以下情况：

- 队列为空。
- 队列事件条件不满足。
- AI 赛事上下文生成失败。
- 当前阶段不适合触发强事件。

则 fallback 到默认赛前准备事件：

```ts
return buildDefaultTournamentPrepEvent(pendingMatch);
```

默认赛前准备事件可以沿用当前 `buildTournamentPrepEvent(...)` 的功能，但应该归入 `tournament-context` 或明确标记为默认赛事准备事件。

## 11. 比赛周规则

比赛周不允许任何上下文事件插入。

规则：

```text
如果 pendingMatch.resolveYear/week == 当前 year/week：
  只允许赛事比赛事件

正常状态：
  返回普通 tournament-* 比赛事件

restRounds > 0：
  返回 injury-aware tournament event
```

同时保留：

```text
比赛周日常行动禁用
```

这能保证：

- 比赛事件不会被普通上下文事件挡住。
- 玩家不会在比赛周先处理更衣室事件再打比赛。
- 赛事节奏稳定。
- 伤病比赛事件仍属于赛事比赛事件，不属于普通上下文事件。

### 强制休养与比赛周

如果玩家处于强制休养中，且当前周不是比赛周：

```text
restRounds > 0
-> 优先触发 rest 类型事件
-> 消耗休养回合
-> 恢复疲劳、压力或手感
```

如果玩家处于强制休养中，且当前周正好是比赛周：

```text
restRounds > 0
pendingMatch.resolveYear/week == 当前 year/week
-> 生成 injury-aware tournament event
```

这类事件仍然算赛事比赛事件，优先级等同于 `tournament-*`，不能被普通上下文事件或普通 `rest` 事件替代。

示例事件：伤病未愈的比赛夜

```text
队医建议你继续休养，但比赛已经排到今晚。你必须决定怎么处理。
```

选项：

- 带伤上场：直接进入比赛模拟，胜率、个人 rating、KDA 下降，疲劳和压力上升，可能延长 `restRounds`。
- 申请退赛：当前赛事直接退出或判负，`pendingMatch = null`，压力变化，队伍信任下降。
- 降低承担：有战队时可用，表示队伍让你少承担关键位；胜率小幅下降，个人数据下降，队伍关系小幅变化。

第一版不做完整替补系统。玩家不上场时，不模拟真实替补阵容；退赛就是退出当前赛事。后续如果要做替补系统，应作为独立大版本处理。

报名接口也需要识别强制休养：

```text
如果玩家 restRounds > 0，且赛事比赛周会落在休养期内：
  C/B 级：允许报名，但提示可能带伤上场或退赛。
  A/S/Major：二次确认。
  严重伤病：禁止报名。
```

## 12. 赛后上下文

赛后事件根据比赛结果生成，而不是普通随机。

事件来源：

```ts
onTournamentMatchResolved(result) {
  enqueuePostMatchContextEvents(result);
}
```

赛后事件类型：

### 赛后分锅

触发：

- 输掉比赛。
- 大比分输。
- 队伍信任低。

影响：

- 队伍信任下降。
- 目标队友默契下降。
- 可能增加 `locker-tension`。

### 险胜后的沉默

触发：

- 赢了，但比分接近。
- 疲劳高。

影响：

- 压力上升。
- 队伍默契小幅变化。

### 爆冷后的采访

触发：

- 低级别战队击败高级别对手。
- 玩家 rating 高。

影响：

- 名气上升。
- 队伍信任上升。
- 可能增加媒体压力。

### 决赛失利后的复盘

触发：

- 决赛失败。

影响：

- 压力上升。
- 离队压力上升。
- 指挥 / 明星冲突权重提高。

### 夺冠后的资源分配

触发：

- 赛事夺冠。

影响：

- 金钱、名气、队伍信任、队友默契。
- 可能影响后续话语权。

## 13. 和比赛公式联动

赛事上下文事件必须能影响比赛，否则只是叙事。

建议扩展短期 buff：

```ts
interface Buff {
  matchWinrateDelta?: number;
  matchRatingDelta?: number;
  matchFatigueMultiplier?: number;
  matchStressMultiplier?: number;
  teamChemistryMatchDelta?: number;
}
```

这些字段必须和日常成长 buff 隔离：

- 只允许 `simulateMatch(...)` 或比赛胜率预览读取。
- 只允许在 `event.type === 'match'` 或 `event.type === 'tournament-context'` 且进入比赛结算时消耗。
- 不参与 `applyGrowth(...)`。
- 不参与日常行动的疲劳 / 压力倍率结算。
- 建议新增 `consumeOn: 'match'`，比赛结算后移除。

示例：

```ts
{
  id: 'tournament-clear-plan',
  label: '赛前计划清晰',
  actionTag: 'match',
  matchWinrateDelta: 0.03,
  remainingUses: 1,
  consumeOn: 'match'
}
```

示例：

```text
赛前复盘成功：
  matchWinrateDelta +0.03

更衣室冷场失败：
  matchWinrateDelta -0.02

加练成功：
  feel +1
  fatigue +8

教练定边界成功：
  teamChemistryMatchDelta +3

资源争执失败：
  添加 role-confusion
  比赛协同下降
```

## 14. 和队伍系统联动

赛事上下文事件需要影响：

- `teamTrust`
- `teammate.chemistry`
- 派生队伍默契
- `locker-tension`
- `role-confusion`
- `pendingDeparture.pressure`
- 玩家队内身份和话语权

示例：

```text
决赛失利 + teamTrust < 40
-> 离队压力 +10
-> 低默契队友更可能成为离队对象
```

```text
连续深轮 / 夺冠
-> 离队压力下降
-> pendingDeparture.lockedUntilRound 延后
```

## 15. 和 AI 事件联动

AI 事件可以进入赛事上下文候选，但必须带上下文阶段。

AI 生成事件需要声明：

```ts
{
  contextPhase: 'signup' | 'pre-match' | 'post-match';
  tournamentTier?: TournamentTier;
  triggerReason: string;
}
```

限制：

- AI 赛事上下文事件不能出现在比赛周。
- 如果 AI 事件生成时已经到比赛周，应推迟到赛后或丢弃。
- AI 事件必须绑定当前赛事，不能变成普通压力事件。
- AI 事件不能直接写入普通事件池，只能进入当前 `tournamentContext.contextEventQueue`。

## 16. 事件队列策略

不要每次都现场随机抽。建议报名时生成上下文队列：

```ts
onTournamentSignup() {
  createTournamentContext();
  enqueueSignupContextCandidates();
  enqueuePreMatchContextCandidates();
}
```

比赛结算后追加赛后队列：

```ts
onTournamentMatchResolved(result) {
  enqueuePostMatchContextCandidates(result);
}
```

好处：

- 事件围绕当前赛事生成。
- 可以防止重复。
- 可以做连续叙事。
- 可以根据赛事层级和阶段控制强度。

## 17. 无战队玩家处理

无战队玩家不能触发队内更衣室事件。

无队伍时的赛事上下文应该是：

- 独自备赛。
- 临时队友磨合差。
- 网友质疑。
- 赛前训练安排。
- 个人压力。
- 临时队伍资源混乱。

这里的“临时队友”和“临时队伍”只是叙事层概念，不创建真实 roster。

字段影响应偏向：

- `stress`
- `fatigue`
- `feel`
- `fame`
- 个人比赛 buff

不要影响：

- `teamTrust`
- 队友默契
- 队伍离队压力

可用替代字段：

- `stress`
- `fatigue`
- `feel`
- `fame`
- match-only buff
- 无队伍比赛协同惩罚或修正

## 18. 需要避免的问题

- 不要让报名周事件直接覆盖当前普通事件，应先进队列。
- 不要每个阶段都强塞太多事件，低级别赛事要轻。
- 不要让赛前事件全是负面，要有正向准备、战术清晰、互相信任。
- 不要让普通 `team` 事件伪装成赛事上下文事件。
- 不要让 AI 事件绕过比赛周最高优先级。
- 不要让赛后事件在下一场比赛周才出现，过期事件应丢弃或降级为普通回忆事件。
- 不要让强制休养和比赛周互相覆盖；比赛周伤病必须转成 injury-aware tournament event。

## 19. 后续：强制休养触发改进

当前强制休养较难触发，主要依赖低体能崩溃或少数事件写入 `injuryRestRounds`。后续可以把休养做成更可见、更可控的风险系统，而不是纯随机惩罚。

改进方向：

- 疲劳高时增加伤病风险，但不是立即休养。
- 体能低时提高伤病风险。
- 连续比赛、连续高 AP 训练、连续加练时提高伤病风险。
- 止痛药、人体工学椅、体能属性、恢复行动可以降低风险。
- 先给出轻伤警告，再进入强制休养，避免玩家完全无预期。

建议新增中间状态：

```text
minor-injury-risk：轻微伤病风险
injury-warning：队医警告
injury-limited：状态受限，但还能比赛
forced-rest：强制休养
```

状态机建议：

```text
healthy
  -> minor-injury-risk
  -> injury-warning
  -> injury-limited
  -> forced-rest
```

互斥规则：

```text
minor-injury-risk / injury-warning / injury-limited / forced-rest 同一时间只保留最高级状态。
升级时移除较低级 tag。
降级时移除当前高级 tag，并按恢复幅度写回较低级 tag 或回到 healthy。
```

事实来源：

```text
forced-rest tag 只表示“当前处于强制休养状态”
restRounds 是剩余休养回合数的事实来源
restRounds 降到 0 时必须移除 forced-rest
如果仍然疲劳过高，可以降级为 injury-limited 或 injury-warning
```

触发路径示例：

```text
疲劳 > 75 + 连续训练 / 连续比赛
-> injury-warning

继续硬练或带伤比赛失败
-> injury-limited 或 forced-rest

及时休息 / 康复服务 / 体能高
-> 移除 injury-warning
```

这样休养不会突然砸下来，玩家能提前看到风险，并通过恢复行动或商店服务管理它。

## 20. 设计分层

以下 V1-V5 只表示设计依赖层级，不表示实施时可以分批交付。完整实施以 [event-sequence-tournament-context-implementation-plan.md](./event-sequence-tournament-context-implementation-plan.md) 为准。

### V1：系统骨架

- 新增 `tournamentContext`。
- 新增 `contextEventQueue`。
- 新增 `tournament-context` 事件类型。
- 抽出统一 `pickNextEvent(...)`。
- 比赛周最高优先级写死。
- 准备周上下文事件替代固定 `buildTournamentPrepEvent(...)`。

### V2：赛后事件

- 根据胜负、比分、rating、是否决赛生成赛后事件。
- 影响队伍信任、队友默契、离队压力、名气。
- 支持大胜、险胜、惨败、爆冷、决赛失利、夺冠。

### V3：队伍政治联动

- 指挥 / 明星 / 普通选手生成不同赛事上下文事件。
- 站队影响双方默契。
- 话语权变化影响后续事件权重。

### V4：AI 上下文事件

- AI 生成赛事上下文候选。
- AI 事件必须带 `contextPhase` 和触发原因。
- AI 事件不能插入比赛周。

### V5：伤病与休养联动

- 增加伤病风险中间状态。
- 比赛周强制休养转成 injury-aware tournament event。
- 报名接口提示休养期撞赛风险。
- 休息、恢复服务、体能属性降低伤病升级概率。

## 21. 最终结论

赛事上下文事件应该作为赛事系统的一部分，而不是普通事件池的扩展。

正确结构是：

```text
pendingMatch 控制比赛进度
tournamentContext 控制赛事叙事
tournament-* 控制比赛结算
tournament-context 控制赛前 / 赛后 / 更衣室 / 媒体联动
```

这样既能保证比赛事件不会被打断，也能让赛事前后的队伍关系、压力、媒体和个人状态真正影响游戏体验。
