# 队伍阵容系统设计方案（待实现）

状态：待定

---

## 核心目标

在现有赛事检定之上加一层**队伍模拟层**：

- 队内四名队友各有名字、性格标签、特质、属性
- 属性每回合按核心成长曲线后台自动增长
- 赛事结算时，队伍整体实力 = 玩家属性 + 队友属性均值 + 特质协同效应
- 更换战队时，新阵容重新生成；转会后与旧队友的关系留存于叙事 tag，不保存完整档案

---

## Teammate 数据结构

```typescript
interface Teammate {
  id: string;                    // 唯一标识（队内位置固定，如 'slot-1'～'slot-4'）
  name: string;                  // 随机生成，中文名或英文 ID
  role: TeammateRole;            // 角色
  personality: PersonalityTag;   // 性格标签，影响 teamTrust 动态
  traits: string[];              // 2-3 个特质 ID，从现有特质池抽取子集
  stats: TeammateStats;          // 4 项核心属性
  growthSpent: number;           // 累计成长量（共享同一上限逻辑）
}

type TeammateRole = 'IGL' | 'AWPer' | 'Entry' | 'Support' | 'Lurker';

type PersonalityTag =
  | 'strict'      // 严格型（教练/IGL）：teamTrust 建立慢但上限高
  | 'supportive'  // 支持型：teamTrust 建立快，冲突少
  | 'star'        // 明星型：自我意识强，冲突频率高
  | 'grinder'     // 苦练型：稳定，低方差
  | 'drama';      // 戏精型：事件方差大，冲突/高光都更极端

interface TeammateStats {
  agility: number;       // 枪法/机械操作
  intelligence: number;  // 战术/决策
  mentality: number;     // 心态/高压发挥
  experience: number;    // 比赛经验/阅图
  // 不含 money / constitution：与队友无关
}
```

---

## 队伍阵容（PlayerRoster）

```typescript
// Player 新增字段
roster: Teammate[] | null;  // 自由人时为 null；加入战队后生成，4 名队友
```

---

## 阵容生成规则

**触发时机**：`respondTeamOffer(accept=true)` 时生成新阵容。

**生成逻辑**：

```
1. 按俱乐部档位确定队友属性基础值范围
2. 各角色各分配 2-3 个特质（从与角色相关的特质子集中抽取）
3. 随机分配性格标签
4. 生成随机名字（中英混合，与 rivals.ts 同逻辑）
```

**属性基础值范围（按俱乐部档位）**：

| 档位 | 属性均值范围 | 说明 |
|---|---|---|
| youth | 3–6 | 新人阵容，和玩家差距小 |
| semi-pro | 5–9 | 初步职业化 |
| pro | 8–13 | 成熟职业选手 |
| top | 11–16 | 精英阵容 |

每名队友各属性在基础范围内独立随机，避免"完美均匀"。

**角色与特质子集（各角色的候选特质）**：

| 角色 | 候选特质 tag |
|---|---|
| IGL | `igl`, `tactical`, `steady`, `support`, `selfless` |
| AWPer | `aimer`, `mechanical`, `clutch`, `solo` |
| Entry | `mechanical`, `clutch`, `grinder`, `solo` |
| Support | `support`, `selfless`, `steady`, `igl` |
| Lurker | `tactical`, `solo`, `steady`, `clutch` |

---

## 队友成长（后台静默运算）

每回合推进时（`applyChoice` 末尾），对每名队友执行一次成长结算：

```
每回合各属性随机选 1 项增长：
  rawGain = random(0.08, 0.18)
  applied = rawGain × growthFactor(currentStat)  // 同玩家衰减曲线
  stat += applied
  growthSpent += applied

上限：growthSpent ≤ TEAMMATE_GROWTH_CAP = 20  // 低于玩家的 30，队友成长空间略小
```

**成长曲线**（与玩家相同分档衰减）：

| 当前值 | 倍率 |
|---|---|
| 0–4 | ×1.0 |
| 5–9 | ×0.7 |
| 10–14 | ×0.4 |
| 15–20 | ×0.15 |

队友成长**不消耗 AP、不产生叙事事件**，纯后台数值更新。

---

## 赛事结算公式更新（matchSimulator.ts）

**当前公式**：
```
attack = d20 + primary*2 + secondary*1 + traitBonuses - traitPenalties
```

**新公式**：
```
attack = d20
       + player_primary * 2
       + player_secondary * 1
       + traitBonuses - traitPenalties     // 玩家特质
       + teamBonus                          // 队友贡献
       + synergyBonus                       // 特质协同
       + trustModifier                      // 信任度修正
```

### teamBonus 计算

```
relevantStat = 赛事主属性（如 match 类取 agility，training 类取 intelligence）

teamBonus = floor(
  roster.reduce((sum, tm) => sum + tm.stats[relevantStat], 0)
  / 4          // 四名队友均值
  / 4          // 缩放系数，避免队友贡献压过玩家
)
// 大约范围：youth 阶段 +1～+2，top 阶段 +3～+4
```

### synergyBonus 计算

检查阵容中特质 tag 的组合：

| 协同条件 | 加成 |
|---|---|
| 有 IGL 角色队友 + 队内存在 `tactical` 特质 | +2 |
| 有 AWPer 角色队友 + 队内存在 `aimer` 特质 | +1 |
| 队内 `support` 特质持有者 ≥ 2 人 | +1 |
| 玩家持有 `igl` 特质 + 队内 `support` ≥ 1 | +1 |
| 队内 `ego` 特质持有者 ≥ 2 人 | -2（内耗） |
| 队内 `solo` 特质持有者 ≥ 3 人 | -1（各打各的） |

### trustModifier 计算

```
teamTrust ≥ 65 → +1
teamTrust ≤ 30 → -1
teamTrust ≤ 15 → -2
```

---

## 对社交关系系统的联动

队伍阵容系统与社交关系系统设计文档（`social-system-design.md`，待写）深度联动：

| 联动点 | 说明 |
|---|---|
| 队内冲突事件（`chain-team-conflict`）| 叙事中的"另一方"为 roster 中随机一名队友，附上其名字和性格 |
| 队友离队传闻（`chain-rival-teammate-leave`）| 随机抽取一名队友名字具体化叙事 |
| teamTrust 变化 | 赛事胜负影响 teamTrust，teamTrust 反过来影响赛事结算（trustModifier）|
| star 性格队友 | consecutiveLosses ≥ 2 时，`star` 性格队友触发冲突事件的概率翻倍 |
| drama 性格队友 | 任意事件结果的方差加大（成功更成功，失败更失败）|

---

## 前端展示

**PlayerStats 面板（右侧）新增"阵容"折叠区**：

```
阵容
├── [IGL]    李大锤   tactical / steady    均值 8.2
├── [AWPer]  xX_Doom  aimer / mechanical   均值 11.4
├── [Entry]  Rush-B   clutch / grinder     均值 7.8
└── [Support] 小李    selfless / support   均值 6.5
```

只显示角色、名字、主要特质 tag、属性均值；不显示单项数值避免信息过载。

---

## 更换战队时的处理

| 场景 | roster 处理 |
|---|---|
| 合同到期离队 / 被踢 | roster 清空（`null`） |
| 转会 | roster 清空，加入新战队后重新生成 |
| 加入新战队 | 按新俱乐部档位重新生成 4 名队友 |

**旧队友不保留档案**，但可通过 tag 留存叙事痕迹，例如：
- `old-teammate-contact`：离队后某位前队友保持联系（触发特定事件）
- `bad-blood`：因冲突离开的队伍，影响 sceneRep

---

## 不做（有意为之的限制）

- **不做队友操控**：玩家无法直接指挥队友训练、选择队友技能点，保持模拟器而非经营游戏的定位
- **不做队友个人剧情线**：队友只在与玩家交集时进入叙事，不单独跟踪其生涯
- **不做五人全属性展示**：前端只显示均值和特质，避免数字轰炸
- **不做跨存档队友持久化**：每局重新生成，保持 roguelike 特性
- **不做队友受伤系统**：已有玩家伤病系统，队友伤病过于复杂

---

## 实现工作量估算

| 模块 | 工作量 |
|---|---|
| `Teammate` 类型定义 | 小 |
| `Player.roster` 字段 + 初始化 | 小 |
| 阵容生成函数（`generateRoster`）| 中 |
| 队友名字生成器扩展 | 小 |
| 每回合成长结算（`applyChoice` 末尾）| 小 |
| `matchSimulator` 公式扩展 | 中 |
| 特质协同检查函数 | 中 |
| 链式事件叙事具名化（取 roster 队友名）| 中 |
| 前端 PlayerStats 阵容展示 | 中 |
| `respondTeamOffer` 触发阵容生成 | 小 |
