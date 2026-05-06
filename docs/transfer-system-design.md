# 转会系统设计方案（待实现）

状态：待定

---

## 背景

Phase H 完成后，战队系统已有以下路径：

- **被动转会**：`chain-rival-poach`（挖角）、`chain-team-promote-offer`（晋升邀约）
- **合同到期**：`chain-contract-renewal` → 离队 → 自由人 → 重新申请

缺失的是**主动转会**：玩家在合同期内自己发起转会请求。

`tryout-invite` 事件（原`stages: ['youth']`，`stageDelta: 1`）在当前设计中已无意义——youth 阶段玩家必然已有战队，且 `stageDelta` 会绕过赛事晋升门槛。该事件应在转会系统实现后删除。

---

## 核心原则

转会不是"找个更好俱乐部"的普通操作，需要有代价感：违约成本、关系影响、心态波动。

---

## 两条路径

| 路径 | 触发方式 | 现状 |
|---|---|---|
| 被动 | 对方主动挖角 / 晋升邀约 | 已有 |
| 主动 | 玩家中途自己发起 | **本方案目标** |

---

## 主动转会流程

```
ClubPanel 选目标俱乐部（显示违约金）
        ↓ 消耗 25 AP
  pendingTransfer 写入
        ↓ 3–5 回合后
chain-transfer-response（新事件）
  ├─ 成功 → 写入 transfer-interview-pending tag
  │       ↓
  │   chain-transfer-interview（新事件）
  │     ├─ 通过 → pendingOffer 生成
  │     │       ↓
  │     │   TeamOfferModal（接受时扣违约金，更新战队）
  │     └─ 失败 → 回现队，加冷却 transfer-cd: 12
  └─ 拒绝 → 回现队，加冷却 transfer-cd: 10
```

---

## 申请条件

| 条件 | 说明 |
|---|---|
| 有战队 | 仅适用在队玩家 |
| 在队 ≥ 12 回合 | 刚签约不能立即跑路（`round - team.joinedRound >= 12`） |
| 无 `pendingMatch` | 赛事期间不能提申请 |
| 无 `transfer-cd` tag | 上次转会/被拒后有冷却期 |
| 无 `pendingApplication` / `pendingOffer` / `pendingTransfer` | 同一时间只能有一个进行中的申请 |
| 目标俱乐部档位 ≥ 当前档位 | 不允许降级转会（可后续讨论放开） |

---

## 违约成本

```
违约金 = 当前周薪 × buyoutMultiplier
```

| 当前档位 | buyoutMultiplier | 示例（周薪 5）|
|---|---|---|
| youth | 2× | 10 |
| semi-pro | 3× | 15 |
| pro | 4× | 20 |
| top | 5× | 25 |

- 违约金在 `respondTeamOffer` 接受时从 `money` 扣除
- 金钱不足时 ClubPanel 禁用转会按钮并提示原因

---

## 新增 Player 字段

```typescript
pendingTransfer: {
  clubId: string;
  clubName: string;
  requestRound: number;
  responseRound: number;   // requestRound + 3~5（随机）
} | null;
```

---

## 新增动态 tag（events.ts `dynamicTags`）

| tag | 触发条件 |
|---|---|
| `transfer-eligible` | 有战队 + 在队 ≥ 12 回合 + 无 pendingMatch + 无 transfer-cd |
| `transfer-response-ready` | `round >= pendingTransfer.responseRound` |
| `transfer-interview-ready` | `transfer-response-ready` + `transfer-interview-pending` tag |

---

## 新增链式事件（chains.ts）

### `chain-transfer-response`
- requireTags: `['transfer-response-ready']`
- stages: `['youth', 'second', 'pro', 'star']`
- 叙事：对方得知你在队期间也想加入，态度更审慎——他们在评估你的职业态度
- 选择：展示决心 / 强调职业成长需求 / 等待答复

| 分支 | 结果 |
|---|---|
| 成功 | `tagsAdded: ['transfer-interview-pending']`，fameDelta +1 |
| 失败 | `tagCooldowns: { 'transfer-cd': 10 }`，stressDelta +2（被拒后回现队的尴尬） |

### `chain-transfer-interview`
- requireTags: `['transfer-interview-ready']`
- stages: `['youth', 'second', 'pro', 'star']`
- 叙事：秘密面试，可能被现队察觉；你需要在两家俱乐部之间保持平衡
- 选择1 展示竞技状态（check: agility + experience，DC 11）
- 选择2 谈职业规划与适配性（check: intelligence + mentality，DC 10）

| 分支 | 结果 |
|---|---|
| 成功 | 生成 `pendingOffer`，清理 transfer tags |
| 失败 | `tagCooldowns: { 'transfer-cd': 12 }`，stressDelta +3 |

---

## 对现有系统的改动

| 位置 | 改动内容 |
|---|---|
| `gameEngine.ts` | 新增 `applyTransferRequest(session, clubId)` 函数（独立于 `applyClubRequest`） |
| `gameEngine.ts` `respondTeamOffer` | 若 `player.team` 非空（转会场景），接受时扣违约金，加 `transfer-cd: 16` |
| `engine/events.ts` `dynamicTags` | 新增 `transfer-eligible`、`transfer-response-ready`、`transfer-interview-ready` |
| `routes/game.ts` | 新增 `POST /game/:sessionId/transfer-request` 路由 |
| `ClubPanel.tsx` | 有队时新增"申请转会"区块，显示可转会俱乐部、违约金、余额是否充足 |
| `tryout-invite` 事件 | **删除**（功能被新系统取代，原有 stageDelta 绕过晋升门槛的问题一并消除） |

---

## 有意为之的限制（暂不实现）

- **不做转会窗口期**：过于复杂，用 `transfer-cd` tag 代替
- **不做降级转会**：保持向上流动的驱动力，后续可讨论开放
- **不做俱乐部"拒绝放人"机制**：当前叙事复杂度已足够
- **不做经纪人系统**：可作为独立后续扩展

---

## 实现工作量估算

| 模块 | 工作量 |
|---|---|
| `applyTransferRequest` engine 函数 | 小 |
| `respondTeamOffer` 违约金逻辑 | 小 |
| 3 个动态 tag | 小 |
| 2 个链式事件叙事 | 中 |
| `/transfer-request` 路由 | 小 |
| `ClubPanel` 转会区块 UI | 中 |
| 类型定义（`pendingTransfer` 字段） | 小 |
| `tryout-invite` 删除 + 回归测试 | 小 |
