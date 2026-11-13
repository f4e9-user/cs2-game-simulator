# 经纪人 NPC 与玩家职业机会系统设计

## 1. 目标

本设计扩展现有俱乐部身份、赛季目标、重建和抽象转会系统，新增一个以玩家为中心的经纪人系统。

核心目标：

- 让经纪人从商店 buff 升级为长期 NPC。
- 让玩家能通过经纪人表达职业意向，而不是直接管理阵容或操作完整转会市场。
- 让经纪人的性格、职业操守、金钱欲、忠诚和关系网络影响机会与风险。
- 让经纪人信息默认隐藏，但可通过尽调、事件、合作经历或被坑后的结果逐步揭示。
- 让合同、买断和自由市场完整服务玩家本人；世界队伍之间仍保持抽象模拟。

非目标：

- 不做完整俱乐部经理玩法。
- 不让玩家直接管理队伍阵容、预算或世界选手报价。
- 不展开世界队伍之间的逐条合同谈判。
- 不生成大规模自由球员数据库；自由球员只在需要展示或补位时 materialize。

## 2. 系统边界

经纪人系统是可选增强，不是职业推进的必需系统。

玩家没有经纪人时：

- 仍可通过现有 club market、试训、offer、赛事表现和转会事件推进职业。
- 不存在 `AgentMandate`。
- 不触发经纪人越权或冲突事件。
- 获得的机会主要来自公开市场、俱乐部邀请和现有抽象转会系统。

玩家拥有经纪人时：

- 可设置职业意向，让经纪人筛选或制造玩家相关机会。
- 可获得更多提前信息、更好的谈判条件、特殊路线和更高戏剧性。
- 也可能承担经纪人越权、媒体传闻、队内信任下降、佣金冲突等风险。

世界队伍之间的转会仍由抽象窗口处理。经纪人只 materialize 与玩家相关的机会、传闻、合同结果和冲突。

## 3. 核心循环

1. 玩家通过背景、事件、行动或市场接触经纪人。
2. 经纪人的真实性格默认隐藏，只展示包装话术、基础佣金区间和少量公开履历。
3. 玩家可主动尽调，也可通过事件和合作经历被动揭示经纪人标签。
4. 玩家签约经纪人，设置职业意向 mandate。
5. 经纪人在转会窗口、赛季节点、重大赛事后生成 1-3 个玩家相关机会。
6. 经纪人根据职业操守、金钱欲、忠诚、野心等属性行动，可能尊重玩家，也可能擅自放风、推高佣金合同或制造舆论。
7. 高风险动作进入事件链，玩家可澄清、制止、顺水推舟、解约或更换经纪人。
8. 经历和事件写回经纪人关系历史与已知报告，逐步揭示真实风格。

## 4. 经纪人模型

经纪人分为真实模型和玩家已知模型。真实模型参与模拟；已知模型控制 UI 和事件文案。

```ts
export type AgentTier = 'local' | 'regional' | 'established' | 'elite';

export type AgentStyle =
  | 'career-builder'
  | 'deal-maker'
  | 'media-operator'
  | 'regional-fixer'
  | 'elite-networker';

export interface AgentProfile {
  id: string;
  name: string;
  tier: AgentTier;
  style: AgentStyle;
  ethics: number;
  greed: number;
  ambition: number;
  loyaltyBaseline: number;
  network: number;
  negotiation: number;
  commissionRate: number;
  networkTags: string[];
}
```

属性含义：

- `ethics`：职业操守。高操守经纪人倾向于先征求玩家同意，不擅自放风。
- `greed`：金钱欲。高金钱欲经纪人偏高薪、高佣金、资本项目。
- `ambition`：野心。高野心经纪人偏豪门、曝光、争冠项目。
- `loyaltyBaseline`：基础忠诚。影响是否尊重玩家 mandate。
- `network`：关系网络。影响机会质量和可接触俱乐部层级。
- `negotiation`：谈判能力。影响薪资、角色承诺、买断处理。

第一版预置 8-12 个经纪人模板，不做无限随机市场。

## 5. 玩家经纪人状态

```ts
export type AgentMandate =
  | 'stay-and-renew'
  | 'seek-starting-role'
  | 'seek-high-salary'
  | 'seek-contender'
  | 'return-home-region'
  | 'explore-free-agency'
  | 'force-exit';

export interface PlayerAgentState {
  activeAgentId?: string;
  agentTrust: number;
  activeMandate?: AgentMandate;
  knownReports: AgentScoutingReport[];
  marketState: AgentMarketState;
  conflictFlags: string[];
  history: AgentRelationshipRecord[];
}
```

`activeAgentId` 可为空。为空表示玩家没有经纪人，这是合法状态。

```ts
export interface AgentRelationshipRecord {
  agentId: string;
  round: number;
  type: 'signed' | 'fired' | 'mandate-set' | 'lead-generated' | 'leak' | 'protected-player' | 'conflict-resolved';
  summary: string;
  trustDelta?: number;
  revealedTags?: string[];
}
```

`AgentRelationshipRecord` 是玩家与经纪人的合作履历，用于后续事件引用、报告揭示和 UI 时间线。

## 6. 隐藏信息与揭示

玩家默认不知道经纪人的真实 `ethics`、`greed`、`ambition`、`loyaltyBaseline` 等数值。

```ts
export type AgentReportConfidence = 'unknown' | 'rumor' | 'scouted' | 'verified';

export type AgentReportSource =
  | 'background'
  | 'scouting-action'
  | 'event'
  | 'bad-experience'
  | 'teammate'
  | 'media';

export interface AgentScoutingReport {
  agentId: string;
  confidence: AgentReportConfidence;
  revealedTags: string[];
  riskHints: string[];
  source: AgentReportSource;
  lastUpdatedRound: number;
}
```

信息揭示有两条路径。

主动路径：

- `打听经纪人`：花行动点，获得传闻级标签。
- `安排经纪人会面`：花行动点，获得初步风格判断和签约机会。
- `请人尽调合同/经纪人`：花钱，提升可信度。
- `通过人脉询问`：需要队友关系、媒体关系、本地区标签或相关 buff，成本较低但信息不一定完整。

被动路径：

- 经纪人擅自放风后，揭示“可能越权”“爱炒作”等风险。
- 队友、管理层或媒体事件暴露经纪人名声。
- 合作中经纪人保护玩家长期利益，揭示“职业操守高”“重视长期发展”。
- 玩家被坑后，报告可直接升级为 `verified`，并记录具体历史。

UI 文案必须基于玩家已知报告，而不是直接显示真实数值。

## 7. 经纪人市场

经纪人市场不是完整公开列表，而是当前可接触联系人池。

```ts
export interface AgentMarketState {
  visibleAgentIds: string[];
  contactedAgentIds: string[];
  cooldownUntilRoundByAgentId: Record<string, number>;
  lastRefreshRound: number;
}
```

候选池刷新规则：

- 玩家 `fame`、阶段、VRS、Major 表现越高，高 tier 经纪人越可能出现。
- 背景、地区、人脉标签影响 `regional-fixer` 和特定网络经纪人的出现。
- 草根、学校、网吧型背景开局通常没有经纪人。
- 富裕、关系网、媒体曝光型背景可能开局有经纪人。
- 天才型背景可能触发经纪人主动接触，但不保证经纪人可靠。
- 解雇经纪人后，高操守经纪人短期更谨慎，低操守经纪人更容易主动接触。
- 媒体炒作后，`media-operator` 型经纪人出现概率上升。

## 8. 职业意向与机会生成

签约经纪人后，玩家可设置 `AgentMandate`。

Mandate 不直接导致转会，只影响窗口期和关键节点的机会生成：

- `stay-and-renew`：续约、角色承诺、加薪机会增加，风险较低。
- `seek-starting-role`：中游队、重建队、缺角色队权重上升。
- `seek-high-salary`：资本项目、高薪短约权重上升，压力和轮换风险更高。
- `seek-contender`：高 VRS、老牌豪门、争冠队权重上升，门槛更高。
- `return-home-region`：地区代表、本地区队伍权重上升。
- `explore-free-agency`：合同末期或被挂牌时更有效，机会更广但不稳定。
- `force-exit`：高风险路线，机会更多但当前队信任和媒体压力风险最大。

每次触发最多产出 1-3 个玩家相关机会：

- `agent-offer-lead`：潜在报价线索。
- `renewal-negotiation`：续约、加薪或角色承诺。
- `buyout-interest`：有队愿意处理买断。
- `trial-invite`：非正式试训机会。
- `media-leverage`：媒体造势抬价。
- `conflict-rumor`：经纪人越权放风或当前俱乐部不满。

## 9. 风险事件链

高风险行为必须分阶段，不能单次事件强制转会或直接剥夺首发。

典型链路：

1. **经纪人建议**：经纪人建议放风、试探市场或施压续约。
2. **玩家表态**：同意、拒绝、要求保守、要求更激进。
3. **执行或越权**：低操守、低忠诚、高金钱欲经纪人可能违背玩家意愿。
4. **后果暴露**：管理层质询、队友不满、媒体传闻、报价改善或恶化。
5. **玩家反制**：澄清、顺水推舟、私下沟通、责备经纪人、解约、更换经纪人。
6. **关系记录**：写入 `history` 和 `AgentScoutingReport`。

越权概率来自组合，而不是单一标签：

- 低 `ethics`
- 高 `greed`
- 低当前 `agentTrust`
- 高利益机会
- 玩家选择 `force-exit` 或高风险 mandate

高操守经纪人即使野心高，也倾向于先征求玩家同意。

## 10. 玩家合同、买断与自由市场

玩家合同完整展开；世界选手合同继续抽象。

```ts
export interface PlayerContract {
  clubId: string;
  startRound: number;
  endRound: number;
  monthlySalary: number;
  rolePromise?: 'starter' | 'rotation' | 'development' | 'core';
  buyout?: number;
  releaseClause?: number;
  agentCommissionRate?: number;
  options?: {
    teamOption?: boolean;
    playerOption?: boolean;
    performanceBonus?: number;
  };
}
```

玩家可见机制：

- 续约：当前队满意、目标完成或玩家表现好时触发。
- 买断兴趣：其他队愿意支付或处理买断。
- 合同到期：玩家进入自由市场。
- 被挂牌/允许离队：重建压力、轮换风险、经纪人越权或表现低迷触发。
- 角色承诺：合同承诺影响后续 `teamStatus`、`coreStatus` 和轮换风险事件权重。

世界选手合同只用摘要字段：

```ts
export interface WorldPlayerContractSummary {
  contractValueBand: 'low' | 'medium' | 'high';
  contractYearsLeftBand: 'expiring' | 'short' | 'long';
  buyoutPressure: 'none' | 'manageable' | 'expensive';
}
```

这些字段只用于世界转会评分、新闻文案和对手情报，不做完整财务账本。

自由市场：

- 世界自由球员池默认抽象。
- 玩家成为自由球员、队伍需要补位或新闻需要展示时，才 materialize 少量 `WorldPlayer`。
- 无经纪人玩家也能获得公开试训和低层级邀请。
- 经纪人提升机会筛选、薪资、角色承诺和买断处理质量。

## 11. UI

建议在职业/俱乐部区域加入“经纪人/职业联系人”面板。

模块：

- 当前经纪人：姓名、包装风格、佣金区间、已知标签、关系状态、当前 mandate。
- 经纪人候选：当前可接触的少量候选。
- 尽调结果：按 `rumor/scouted/verified` 显示，不显示真实数值。
- 职业意向：设置 mandate。
- 合同状态：到期时间、薪资、买断、角色承诺。
- 机会列表：经纪人带来的 1-3 个 leads。

UI 表达要求：

- 隐藏真实数值。
- 明确区分传闻、已打听、已确认。
- 不展示完整世界转会市场。
- 不让玩家管理队伍阵容。

## 12. 事件与模块落点

后端模块建议：

- `backend/src/data/agents.ts`：预置经纪人模板。
- `backend/src/engine/agent.ts`：候选池、尽调、签约、mandate、机会生成。
- `backend/src/data/events/agent.ts` 或现有 agent events：经纪人事件定义。
- `backend/src/data/events/chains.ts`：高风险链路。
- `backend/src/types.ts`：核心类型。
- `backend/src/engine/transferWindow.ts`：消费玩家相关 agent signals，不展开世界谈判。
- `backend/src/engine/club.ts`：offer/合同条款、买断、角色承诺。

事件建议：

- `agent-contact`
- `agent-meeting`
- `agent-scouting`
- `agent-mandate-review`
- `agent-market-lead`
- `agent-leak-rumor`
- `agent-club-backlash`
- `agent-renewal-talk`
- `agent-buyout-pressure`
- `agent-fire-or-reconcile`

## 13. 测试边界

必须覆盖：

- 背景决定开局是否有经纪人。
- 无经纪人玩家仍能正常获得 offer。
- 尽调能从 `unknown` 提升到 `rumor/scouted/verified`。
- 被经纪人坑后会揭示风险标签。
- 高操守经纪人不会擅自放风。
- 低操守 + 高金钱欲 + 低信任经纪人才有越权概率。
- mandate 影响机会类型，但不直接强制转会。
- 买断/合同到期影响机会质量。
- 解雇经纪人会清空 mandate，并进入候选池 cooldown。
- 世界转会窗口保持抽象，不要求逐个合同谈判。
- 前端能区分隐藏信息、传闻信息和确认信息。

## 14. 第一版范围

第一版实现：

- 8-12 个经纪人模板。
- 背景决定初始经纪人状态。
- 经纪人候选池。
- 主动尽调与被动揭示。
- 签约、解约、更换经纪人。
- `AgentMandate`。
- 玩家相关机会生成。
- 2-3 条高风险经纪人事件链。
- 玩家合同、买断、合同到期基础字段。
- 经纪人/职业联系人 UI 第一版。

暂不实现：

- 完整经纪人行业生态。
- 经纪人之间互相抢客户。
- 法律诉讼、复杂违约纠纷。
- 所有世界选手完整合同账本。
- 完整俱乐部预算系统。
- 完整自由球员数据库。

## 15. 后续扩展

后续可在本系统上继续扩展：

- 复杂预算系统。
- 世界队伍完整目标追踪。
- 更完整的自由市场。
- 经纪人声誉生态。
- 长期赞助、媒体、公关系统。
- 经纪人和俱乐部管理层之间的关系网络。
