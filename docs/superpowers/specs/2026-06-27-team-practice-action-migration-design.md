# 团队管理加练入口迁移设计

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将“队友加练”从队友卡片迁移到 `ActionPanel` 的“团队管理”里，并改成先展开子面板、再选择队友执行。

**架构：** 保持现有 `teamPractice` 后端接口和周次数规则不变，只调整前端入口层级。`ActionPanel` 负责显示团队管理动作与“加练”子面板，`ClubPanel` 只保留队友信息展示，不再承担执行入口。前端所有禁用条件、AP 约束和本周次数限制都继续沿用现有状态字段与后端响应。

**技术栈：** React、Next.js、Zustand、现有前端 API 封装、现有后端 team action 接口。

---

## 范围

- 保留 `api.teamPractice(sessionId, teammateId)`。
- 保留后端 `applyTeamPractice` 的 AP 消耗、每周次数、比赛周限制和结果文案。
- 只迁移入口和交互，不新增加练数值逻辑。

## 前端行为

- `ActionPanel` 的“团队管理”区新增一个“加练”子面板。
- 子面板默认折叠，点击后展开当前 `player.roster` 中的队友列表。
- 每个队友行显示角色、均值、默契和可执行状态。
- 点击某个队友后直接执行加练。
- 若本周已达上限、AP 不足、当前比赛周不可用或该队友已加练过，对应按钮保持禁用并显示现有原因。

## 布局调整

- `ClubPanel` 中队友卡片上的“加练”按钮移除。
- 队友卡片继续保留基础信息、身份标签和默契显示。
- 团队管理仍保留战术会议、安抚更衣室、挽留和训练重点等动作。

## 数据流

- 展开子面板时，前端直接读取 `player.roster`、`player.weeklyTeamActions`、`player.actionPoints`、`player.round` 和 `player.team` 状态。
- 点击目标队友时，调用现有 `api.teamPractice`。
- 成功后沿用已有 session 更新流程刷新玩家状态和行动结果。

## 错误处理

- 后端返回的错误继续原样透出。
- 前端仅负责在已知条件下禁用按钮，不重复实现规则判断。
- 若队伍为空，不显示队友列表，仅展示空状态。

## 测试与验证

- 前端 `tsc --noEmit` 通过。
- 后端现有 `teamManagement` 相关测试保持通过。
- 手动验证：进入战队页后，队友卡片不再出现加练按钮；`ActionPanel` 的团队管理中可以展开加练并对某个队友执行一次。

## 非目标

- 不修改加练成功率、成长值、AP 成本或周限制。
- 不新增队友选择弹窗。
- 不把加练改成独立后端动作。
