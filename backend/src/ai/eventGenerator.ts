import type { Player, RoundResult, EventDef } from '../types.js';
import { validateAiEvents } from '../validation/guard.js';

export interface AiEventGenInput {
  player: Player;
  recentHistory: RoundResult[];
  gaps: EventGap[];
}

export interface EventGap {
  category: string;
  reason: string;
  urgency: 1 | 2 | 3;
  suggestedTone: string;
}

export function analyzeEventGaps(player: Player, recentHistory: RoundResult[]): EventGap[] {
  const gaps: EventGap[] = [];
  const recentTypes = new Set(recentHistory.slice(-5).map((r) => r.eventType as string));

  if (player.stress > 80 && !recentTypes.has('stress')) {
    gaps.push({ category: 'stress', reason: '压力连续高位但近期无压力事件', urgency: 3, suggestedTone: '崩溃边缘的抉择' });
  }

  if (player.team && player.teamTrust < 30 && !recentTypes.has('team')) {
    gaps.push({ category: 'team', reason: '队内信任度极低但无团队事件', urgency: 2, suggestedTone: '裂痕与修补' });
  }

  if (player.fame > 50 && !recentTypes.has('media')) {
    gaps.push({ category: 'media', reason: '高名气但无媒体关注事件', urgency: 1, suggestedTone: '聚光灯下的压力' });
  }

  const lastMatch = [...recentHistory].reverse().find((r) => r.eventId?.startsWith('tournament-'));
  if (lastMatch && !lastMatch.success && !recentTypes.has('life')) {
    gaps.push({ category: 'life', reason: '赛事失利后缺乏生活/心理恢复事件', urgency: 2, suggestedTone: '低谷中的转机' });
  }

  if (player.volatile.fatigue > 80 && !recentTypes.has('life')) {
    gaps.push({ category: 'life', reason: '极度疲劳但无休养相关事件', urgency: 2, suggestedTone: '身体发出的警告' });
  }

  if (player.rivals.length > 0 && !recentTypes.has('rival')) {
    gaps.push({ category: 'rival', reason: '有宿敌但近期无对抗事件', urgency: 1, suggestedTone: '暗流涌动的对手' });
  }

  return gaps.sort((a, b) => b.urgency - a.urgency);
}

export function buildEventGenPrompt(input: AiEventGenInput): string {
  const { player, recentHistory, gaps } = input;
  const topGap = gaps[0];

  const recentSummary = recentHistory.slice(-3).map((r) => {
    const preview = r.narrative.length > 20 ? r.narrative.slice(0, 20) + '…' : r.narrative;
    return `[${r.success ? '赢' : '输'}] ${r.eventTitle} — ${preview}`;
  }).join('\n') || '暂无近期战绩';

  return [
    '你是 CS2 电竞生涯的事件设计师。根据玩家当前状态，设计 2-3 个贴合的随机事件。',
    '',
    '【当前缺口分析】',
    ...(topGap ? [
      `最紧急：${topGap.category} — ${topGap.reason}`,
      `建议基调：${topGap.suggestedTone}`,
    ] : ['当前状态平衡，生成日常向事件即可。']),
    '',
    '【玩家状态】',
    `阶段：${player.stage}，回合：${player.round}`,
    `压力：${player.stress}，名气：${player.fame}`,
    `手感：${player.volatile.feel}，心态波动：${player.volatile.tilt}，疲劳：${player.volatile.fatigue}`,
    `金钱：${player.stats.money}`,
    ...(player.team ? [`战队：${player.team.name}（信任度 ${player.teamTrust}）`] : ['当前无战队']),
    '',
    '【最近事件】',
    recentSummary,
    '',
    '【设计要求】',
    '- 生成 2-3 个事件，每个事件必须包含：id, type, title, narrative, stages, difficulty, choices(2-4个)',
    `- type 必须是以下之一：life / media / stress / rival / team`,
    '- stages 必须包含当前阶段',
    '- difficulty 范围 0-10',
    '- narrative 使用第二人称"你"，20-120字',
    '- 每个 choice 必须包含：id, label, description, check, success, failure',
    '- choices 的 description 是按钮说明，5-80字，必须使用第二人称"你"',
    '- success / failure 的 narrative 使用第二人称"你"，5-80字',
    '- 每个 choice 必须包含 check 字段，格式为 {"primary": "属性名", "dc": 数字}',
    '- primary 可选属性：intelligence / agility / experience / money / mentality / constitution',
    '- dc 范围 4-16',
    '- coreGrowth 只允许 intelligence / agility / experience / mentality / constitution，单个属性变化绝对值不超过 3',
    '- stateDelta 可包含 stress(-10 到 10), fatigue(-20 到 20), feel(-2 到 2), tilt(-2 到 2)',
    '- resourceDelta 可包含 money(-20 到 20), fame(-20 到 20)',
    '- 禁止修改 stage、tags 等元数据',
    '- id 必须以 ai- 开头，后面接小写字母和连字符',
    '',
    '严格输出 JSON 数组，不加任何其他内容：',
    '[{"id":"ai-example","type":"life","title":"...","narrative":"...","stages":["rookie"],"difficulty":3,"choices":[{"id":"c1","label":"...","description":"...","check":{"primary":"mentality","dc":8},"success":{"narrative":"...","coreGrowth":{"mentality":1}},"failure":{"narrative":"...","stateDelta":{"stress":2}}}]}]',
  ].join('\n');
}

export function extractJsonArray(text: string | null): unknown[] | null {
  if (!text) return null;
  const clean = stripCodeFence(text.trim());
  return parseJsonArrayCandidate(clean) ??
    parseEmbeddedJson(clean, '[') ??
    parseEmbeddedJson(clean, '{');
}

function stripCodeFence(text: string): string {
  return text
    .replace(/^```(?:json|javascript|js)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJsonArrayCandidate(text: string, depth = 0): unknown[] | null {
  if (depth > 2) return null;
  try {
    const raw = JSON.parse(text) as unknown;
    if (isEventLikeArray(raw)) return raw;
    if (typeof raw === 'string') return parseJsonArrayCandidate(stripCodeFence(raw.trim()), depth + 1);
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      const arr = obj.events ?? obj.items ?? obj.data ?? obj.result;
      if (isEventLikeArray(arr)) return arr;
      if (typeof arr === 'string') return parseJsonArrayCandidate(stripCodeFence(arr.trim()), depth + 1);
      if (isEventLikeObject(obj)) return [obj];
    }
    return null;
  } catch {
    return null;
  }
}

function isEventLikeArray(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0 && v.every(isEventLikeObject);
}

function isEventLikeObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.id === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.narrative === 'string' &&
    Array.isArray(obj.stages) &&
    Array.isArray(obj.choices);
}

function parseEmbeddedJson(text: string, opener: '[' | '{'): unknown[] | null {
  const closer = opener === '[' ? ']' : '}';
  for (let start = text.indexOf(opener); start >= 0; start = text.indexOf(opener, start + 1)) {
    const candidate = readBalancedJson(text, start, opener, closer);
    if (!candidate) continue;
    const parsed = parseJsonArrayCandidate(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function readBalancedJson(text: string, start: number, opener: '[' | '{', closer: ']' | '}'): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) depth += 1;
    if (ch === closer) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseAiEvents(text: string | null): { valid: EventDef[]; invalid: unknown[] } {
  const raw = extractJsonArray(text);
  if (!raw) return { valid: [], invalid: [] };
  const patched = raw.map((item) => {
    if (item && typeof item === 'object' && Array.isArray((item as Record<string, unknown>).choices)) {
      const patchedItem = { ...(item as Record<string, unknown>) };
      patchedItem.choices = ((item as Record<string, unknown>).choices as unknown[]).map((c) => {
        if (!c || typeof c !== 'object') return c;
        const patchedChoice = { ...(c as Record<string, unknown>) };
        if (!patchedChoice.check) {
          patchedChoice.check = { primary: 'mentality', dc: 8 };
        }
        if (typeof patchedChoice.description !== 'string' && typeof patchedChoice.label === 'string') {
          patchedChoice.description = patchedChoice.label;
        }
        patchedChoice.success = normalizeOutcome(patchedChoice.success);
        patchedChoice.failure = normalizeOutcome(patchedChoice.failure);
        return patchedChoice;
      });
      return patchedItem;
    }
    return item;
  });
  return validateAiEvents(patched);
}

function normalizeOutcome(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const outcome = { ...(value as Record<string, unknown>) };
  const coreGrowth = objectCopy(outcome.coreGrowth);
  const stateDelta = objectCopy(outcome.stateDelta);
  const resourceDelta = objectCopy(outcome.resourceDelta);
  const rawStatChanges = outcome.statChanges;

  moveOutcomeNumeric(outcome, stateDelta, 'stressDelta', 'stress');
  moveOutcomeNumeric(outcome, stateDelta, 'fatigueDelta', 'fatigue');
  moveOutcomeNumeric(outcome, stateDelta, 'feelDelta', 'feel');
  moveOutcomeNumeric(outcome, stateDelta, 'tiltDelta', 'tilt');
  moveOutcomeNumeric(outcome, resourceDelta, 'fameDelta', 'fame');
  moveOutcomeNumeric(outcome, resourceDelta, 'moneyDelta', 'money');

  if (rawStatChanges && typeof rawStatChanges === 'object' && !Array.isArray(rawStatChanges)) {
    const statChanges = { ...(rawStatChanges as Record<string, unknown>) };
    moveOutcomeNumeric(statChanges, stateDelta, 'stressDelta', 'stress');
    moveOutcomeNumeric(statChanges, stateDelta, 'fatigueDelta', 'fatigue');
    moveOutcomeNumeric(statChanges, stateDelta, 'feelDelta', 'feel');
    moveOutcomeNumeric(statChanges, stateDelta, 'tiltDelta', 'tilt');
    moveOutcomeNumeric(statChanges, resourceDelta, 'fameDelta', 'fame');
    moveOutcomeNumeric(statChanges, resourceDelta, 'moneyDelta', 'money');
    moveOutcomeNumeric(statChanges, resourceDelta, 'money', 'money');

    for (const key of ['intelligence', 'agility', 'experience', 'mentality', 'constitution']) {
      if (typeof statChanges[key] === 'number' && coreGrowth[key] === undefined) {
        coreGrowth[key] = statChanges[key];
        delete statChanges[key];
      }
    }

    if (Object.keys(statChanges).length > 0) {
      outcome.statChanges = statChanges;
    } else {
      delete outcome.statChanges;
    }
  }

  if (Object.keys(coreGrowth).length > 0) outcome.coreGrowth = coreGrowth;
  else delete outcome.coreGrowth;
  if (Object.keys(stateDelta).length > 0) outcome.stateDelta = stateDelta;
  else delete outcome.stateDelta;
  if (Object.keys(resourceDelta).length > 0) outcome.resourceDelta = resourceDelta;
  else delete outcome.resourceDelta;
  return outcome;
}

function objectCopy(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function moveOutcomeNumeric(
  from: Record<string, unknown>,
  to: Record<string, unknown>,
  fromKey: string,
  toKey: string,
): void {
  if (typeof from[fromKey] === 'number' && to[toKey] === undefined) {
    to[toKey] = from[fromKey];
    delete from[fromKey];
  }
}
