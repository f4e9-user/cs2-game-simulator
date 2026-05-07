# 社交关系系统设计方案（待实现）

状态：待定

---

## 核心思路

不追踪每个 NPC 的完整档案，用**三个关系圈的数值**驱动事件和判定。
命名 NPC（教练、核心队友、宿敌）提供叙事锚点，实际数值由关系圈承载。

与阵容系统（`roster-system-design.md`）深度联动：队友有了名字和性格后，
社交事件的叙事方可以从阵容中取具体人名，不再是抽象的"队友"。

---

## 三个关系圈

| 圈子 | 字段 | 范围 | 说明 |
|---|---|---|---|
| 队内信任度 | `rel.teamTrust` | 0–100 | 与队友/教练的默契和信任 |
| 圈内声望 | `rel.sceneRep` | 0–100 | 职业圈对你的业内口碑（≠ fame） |
| 媒体关系 | `rel.mediaRel` | 0–100 | 媒体/直播圈/公众形象 |

**与 fame 的区别**：
- `fame` = 大众知名度（粉丝量感）
- `sceneRep` = 业内口碑（其他选手/俱乐部的评价）
- 可以背离：圈内公认的害群之马但粉丝众多；或低调但极受业内尊敬的老将

---

## Player 新增字段

```typescript
rel: {
  teamTrust: number;   // 0–100，无队时忽略
  sceneRep: number;    // 0–100
  mediaRel: number;    // 0–100
} | null;  // null = 未初始化（游戏开始时初始化）
```

---

## 初始值与重置规则

| 场景 | teamTrust | sceneRep | mediaRel |
|---|---|---|---|
| 游戏开始 | — （无队）| 30 | 20 |
| 加入新战队 | 40（陌生人起点）| 不变 | 不变 |
| 转会（中途）| 重置为 35 | -5（背刺感）| 不变 |
| 被踢出队 | — | -8 | -5 |
| 合同到期正常离队 | — | 不变 | 不变 |

---

## 动态 tag（派生自关系值，每回合重新计算）

| tag | 触发条件 | 主要用途 |
|---|---|---|
| `team-trusted` | teamTrust ≥ 65 | 队内事件有额外选项；合同续约条件更好；赛事 +1 |
| `team-friction` | teamTrust ≤ 30 | 触发队内矛盾；losing-streak 阈值降低；赛事 -1 |
| `scene-respected` | sceneRep ≥ 60 | 面试 DC -2；俱乐部主动邀约更频繁；新事件解锁 |
| `scene-toxic` | sceneRep ≤ 20 | 面试 DC +3；圈内事件出现负面选项 |
| `media-friendly` | mediaRel ≥ 55 | 媒体事件倾向正面；fame 增长加成 ×1.2 |
| `media-hostile` | mediaRel ≤ 20 | 媒体事件出现负面报道；fame 增长受损 ×0.8 |

---

## 每回合自然衰减（applyChoice 末尾）

```
teamTrust  -= 0.5   // 需要主动维护
sceneRep   向 50 归中，每回合 ±0.5
mediaRel   向 40 归中，每回合 ±0.3（比 sceneRep 更快衰减）
```

---

## 关系值的变化来源

### teamTrust

| 触发事件/行为 | 变化 |
|---|---|
| 赛事胜利 | +5 |
| 赛事失利 | -3 |
| 主动联系队友（新事件 chain-teammate-bond）| +3 ~ +8 |
| 队内冲突（chain-team-conflict）| -5 ~ -15 |
| 拒绝挖角/忠于战队 | +8 |
| 赛前心理战处理得当（chain-rival-match-trash 成功）| +3 |
| 转会离队 | 归零 |

### sceneRep

| 触发事件/行为 | 变化 |
|---|---|
| 赛事夺冠 | +8 |
| 赛事首轮出局 | -3 |
| 赢得宿敌对决 | +5 |
| trash-talk 赢了 | +3 |
| trash-talk 翻车（chain-rival-match-trash 失败）| -6 |
| 外挂/博彩被抓 | -30（永久性打击）|
| 帮助后辈（新事件 chain-scene-mentor）| +5 |
| 转会时违约离队 | -5 |

### mediaRel

| 触发事件/行为 | 变化 |
|---|---|
| 媒体采访表现好（media 类事件成功）| +5 ~ +10 |
| 媒体采访失控（media 类事件失败）| -8 |
| 粉丝见面会（购物系统）| +8 |
| 拒绝采访 | -3 |
| trash-talk 系列事件 | ±5（依结果） |

---

## 对现有事件/系统的增强

| 系统/事件 | 改动 |
|---|---|
| `chain-team-conflict` | 结果影响 teamTrust；叙事中的"另一方"从 roster 取具名队友 |
| `chain-rival-match-trash` | 结果影响 sceneRep + mediaRel |
| `chain-contract-renewal` | teamTrust ≥ 65 时，薪资谈判 DC -2；可争取更高上限 |
| `chain-team-fired` | 触发条件改为：consecutiveLosses ≥ 3 **且** teamTrust ≤ 40（双条件） |
| `chain-rival-teammate-leave` | 叙事中"离队队友"从 roster 取具名 |
| 所有 media 类事件 | 结果影响 mediaRel |
| `matchSimulator` | trustModifier 接入（见阵容系统文档） |
| 俱乐部面试 DC | sceneRep 修正：≥60 → -2，≤20 → +3 |
| `generateTeamOffer` 薪资范围 | team-trusted 且合同续约 → salaryRange 上限 +1 |

---

## 新增链式事件

### chain-teammate-bond
- requireTags: `['has-team']`，forbidTags: `['teammate-bond-cd']`
- 触发条件偏向 teamTrust ≤ 50（state weight 加权）
- 叙事：主动联系 roster 中某位队友（取具名），一起吃饭/复盘比赛/打排位
- 选择：认真交流 / 随便聊 / 推说有事
- 成功：teamTrust +5~+8，`tagCooldowns: { 'teammate-bond-cd': 8 }`
- 失败：teamTrust +2（仍有小收益），冷却同上

### chain-scene-mentor
- requireTags: `['scene-respected']`，forbidTags: `['mentor-cd']`
- 叙事：某位后辈/新人通过 DM 请教你某个战术细节
- 选择：认真指导 / 简单回复 / 不理
- 成功：sceneRep +5，fameDelta +1，`tagCooldowns: { 'mentor-cd': 12 }`
- 失败/拒绝：sceneRep -2（吃瓜群众觉得你架子大）

### chain-rival-respect
- requireTags: `['scene-respected']`，触发条件：曾击败宿敌（tag `tournament-winner`）
- 叙事：宿敌选手（roster 宿敌名字）私下联系你，语气出人意料地平和
- 选择：坦诚交流 / 保持距离 / 激怒对方
- 成功：sceneRep +3，stressDelta -1（意外的和解）
- 失败：sceneRep -2（撕破脸）

---

## 命名 NPC（游戏开始 / 加入战队时生成）

从阵容系统（roster）自动衍生，不额外存储：

| NPC 来源 | 说明 |
|---|---|
| `roster[IGL]` | 教练/指挥，性格标签影响 teamTrust 建立速度 |
| `roster[Support]` 或 `roster[Lurker]` | 核心队友（选取 personality 为 supportive 的优先）|
| `rivals[0]` 的某个具名成员（未来扩展）| 宿敌选手，用于 chain-rival-respect 等事件 |

---

## 性格标签对 teamTrust 的影响

| 性格 | teamTrust 建立速度 | 冲突频率 | 事件方差 |
|---|---|---|---|
| `strict` | 慢（+0.7×）| 低 | 低 |
| `supportive` | 快（+1.3×）| 极低 | 低 |
| `star` | 正常 | 高 | 中 |
| `grinder` | 正常 | 极低 | 低 |
| `drama` | 正常 | 高 | 高 |

---

## 前端展示建议

**PlayerStats 右侧面板新增"关系"区块**：

```
关系
  队内信任  ████████░░  78
  圈内声望  █████░░░░░  48
  媒体关系  ███░░░░░░░  32
```

三条进度条，色彩编码（绿/黄/红），鼠标悬停显示当前激活的 tag。

---

## 有意为之的限制

- **不做 NPC 独立关系值**：三个圈子足以驱动叙事，避免追踪 N 个 NPC 的复杂度
- **不做"好感度"系统**：防止变成恋爱/交友模拟器
- **NPC 名字只用于叙事文本**：从 roster 实时取，不单独持久化
- **mediaRel 不直接修改 fame**：通过事件权重间接影响，保持两个数值各自独立
- **不做跨队 teamTrust 记忆**：换队后 teamTrust 重置，旧关系只留 tag 痕迹

---

## 实现工作量估算

| 模块 | 工作量 |
|---|---|
| `player.rel` 字段 + 初始化 | 小 |
| 6 个动态 tag + `dynamicTags()` | 小 |
| 每回合关系值衰减（`applyChoice` 末尾）| 小 |
| 增强现有 5 个链式事件（叙事具名 + rel 变化）| 中 |
| 3 个新链式事件叙事 | 中 |
| 俱乐部面试 DC 修正 | 小 |
| 薪资谈判修正 | 小 |
| `matchSimulator` trustModifier 接入 | 小（与阵容系统同步实现）|
| 前端 PlayerStats 关系进度条 | 小 |
