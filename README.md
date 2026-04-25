# CS2 电竞选手人生模拟器

一个 AI 文字模拟器的 MVP：扮演 CS2 选手，从新人到职业赛场。前端 Next.js + TypeScript，后端 TypeScript on Cloudflare Workers（Hono + D1 + KV）。

## 目录结构

```
cs2-game-simulator/
├── README.md                 根目录说明、本地开发、部署
├── .gitignore
├── shared/
│   └── types.ts              前后端共用的领域类型（手动同步到两端）
├── backend/                  Cloudflare Workers 后端
│   ├── package.json
│   ├── tsconfig.json
│   ├── wrangler.toml         Workers 配置（D1 + KV 绑定）
│   ├── schema.sql            D1 初始化脚本
│   └── src/
│       ├── index.ts          Worker 入口 + Hono 应用
│       ├── types.ts          内部类型 & 转出共享类型
│       ├── routes/
│       │   └── game.ts       /api/game/* 路由
│       ├── engine/
│       │   ├── constants.ts  阶段、初始属性、阈值
│       │   ├── resolver.ts   属性/特质/阶段结算核心
│       │   ├── events.ts     事件选择 & 权重
│       │   └── gameEngine.ts 初始化 / apply choice / 推进回合
│       ├── data/
│       │   ├── traits.ts     特质库
│       │   ├── backgrounds.ts 起点身份
│       │   └── events/       事件池（按类型分文件）
│       │       ├── training.ts
│       │       ├── ranked.ts
│       │       ├── team.ts
│       │       ├── tryout.ts
│       │       ├── match.ts
│       │       ├── media.ts
│       │       ├── life.ts
│       │       └── index.ts
│       ├── storage/
│       │   ├── d1.ts         会话读写
│       │   ├── kv.ts         缓存/特质快照
│       │   └── index.ts      Storage 统一出口
│       └── ai/
│           ├── prompts.ts    prompt 拼装
│           └── service.ts    LLM 调用接口（预留，默认回退模板）
└── frontend/                 Next.js 前端
    ├── package.json
    ├── tsconfig.json
    ├── next.config.mjs
    ├── .env.example
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── globals.css
        │   ├── page.tsx                新游戏页（特质 + 起点选择）
        │   └── game/[sessionId]/page.tsx
        ├── components/
        │   ├── PlayerStats.tsx
        │   ├── TraitSelector.tsx
        │   ├── BackgroundSelector.tsx
        │   ├── EventCard.tsx
        │   ├── ChoiceList.tsx
        │   ├── ResultPanel.tsx
        │   ├── HistoryPanel.tsx
        │   └── StageBadge.tsx
        ├── lib/
        │   ├── api.ts        后端 API 封装
        │   ├── types.ts      共享类型（与 shared/types.ts 保持一致）
        │   └── format.ts
        └── store/
            └── gameStore.ts  Zustand 会话状态
```

> 共享类型通过把 `shared/types.ts` 复制到 `backend/src/types.ts` 和 `frontend/src/lib/types.ts` 保持一致。MVP 先不做 monorepo 发包，保持两个子工程各自可独立部署。

## 数据模型（概览）

- `StatKey`：`intelligence | agility | experience | money | mentality`
- `Stats`：上述 5 个属性的数值表
- `Trait`：`{ id, name, description, modifiers: Partial<Stats>, tags: string[] }`
- `Background`：起点身份，决定初始阶段、属性偏置、起手事件池
- `Stage`：`rookie → youth → second → pro → star → veteran → retired`
- `Player`：`{ name, stats, traits: TraitId[], background, stage, round, tags }`
- `Event`：`{ id, type, stage[], difficulty, narrative, choices: Choice[] }`
- `Choice`：`{ id, label, description, check: { primary, dc, traitBonuses } , success, failure }`
- `Outcome`：`{ narrativeTemplate, statChanges: Partial<Stats>, tagAdds, tagRemoves, stageDelta }`
- `RoundResult`：一回合归档（事件 + 选择 + 成败 + 属性变化 + 叙事）
- `GameSession`：`{ id, player, currentEvent, history, status, createdAt, updatedAt }`

## API 设计

所有接口返回 `application/json`。错误统一 `{ error: string }`。

| 方法 | 路径                          | 说明                                       |
| ---- | ----------------------------- | ------------------------------------------ |
| GET  | `/api/health`                 | 健康检查                                   |
| GET  | `/api/traits`                 | 列出可选特质（供开局页展示）               |
| GET  | `/api/backgrounds`            | 列出可选起点身份                           |
| POST | `/api/game/start`             | 创建会话；body: `{ name, traits, backgroundId }` |
| GET  | `/api/game/:sessionId`        | 读取会话完整状态                           |
| POST | `/api/game/:sessionId/choice` | body: `{ choiceId }`；结算并返回下一回合   |

`POST /api/game/start` 响应：`{ sessionId, player, currentEvent }`
`POST /api/game/:sessionId/choice` 响应：`{ result: RoundResult, player, currentEvent, status }`

## 本地开发

需要 Node.js >= 18、pnpm 或 npm。

### 后端

```bash
cd backend
npm install
# 首次初始化本地 D1
npx wrangler d1 create cs2-sim-db         # 记下 database_id，填入 wrangler.toml
npx wrangler d1 execute cs2-sim-db --local --file=./schema.sql
# 本地运行
npx wrangler dev
# 默认监听 http://127.0.0.1:8787
```

KV：本地 `wrangler dev` 会自动使用临时 KV。生产需要 `wrangler kv namespace create CS2_KV` 并把 id 写入 `wrangler.toml`。

### 前端

```bash
cd frontend
cp .env.example .env.local   # 设置 NEXT_PUBLIC_API_BASE=http://127.0.0.1:8787
npm install
npm run dev
# http://localhost:3000
```

## Cloudflare 部署

后端：

```bash
cd backend
npx wrangler d1 create cs2-sim-db                         # 若还没有
npx wrangler d1 execute cs2-sim-db --remote --file=./schema.sql
npx wrangler kv namespace create CS2_KV
# 把 database_id / namespace id 填入 wrangler.toml
npx wrangler deploy
```

前端（任选其一）：

- Vercel：`vercel --prod`，在面板中把 `NEXT_PUBLIC_API_BASE` 指向 Workers 域名。
- Cloudflare Pages：`npx @cloudflare/next-on-pages` + `wrangler pages deploy`。

## 扩展路线

- 战队系统：增加 `Team` 表与 `team_players` 关联，在事件引擎中引入队伍 tag。
- 排行榜：在结算时写入 `runs` 表，按 `stage_reached / final_score` 排序。
- 多结局：`gameEngine.checkEnding()` 根据属性/tag/阶段命中结局配置。
- 事件库：新增 `data/events/*.ts` 并在 `data/events/index.ts` 注册即可热插拔。
- 真·AI 叙事：在 `ai/service.ts` 接入 Workers AI / Anthropic / OpenAI，保留模板兜底。
