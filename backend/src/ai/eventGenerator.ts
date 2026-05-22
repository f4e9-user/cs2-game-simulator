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
    '- 生成 2-3 个事件，每个事件必须包含：id, type, title, narrative, stages, difficulty, choices(2-4个，每个有 success 和 failure)',
    `- type 必须是以下之一：life / media / stress / rival / team`,
    '- stages 必须包含当前阶段',
    '- difficulty 范围 0-10',
    '- narrative 使用第二人称"你"，20-120字',
    '- choices 的 narrative 使用第二人称"你"，5-80字',
    '- statChanges 中单个属性变化绝对值不超过 3',
    '- stressDelta 范围 -10 到 10',
    '- fatigueDelta 范围 -20 到 20',
    '- feelDelta 范围 -2 到 2',
    '- 禁止修改 stage、tags 等元数据',
    '- id 必须以 ai- 开头，后面接小写字母和连字符',
    '',
    '严格输出 JSON 数组，不加任何其他内容：',
    '[{"id":"ai-example","type":"life","title":"...","narrative":"...","stages":["rookie"],"difficulty":3,"choices":[{"id":"c1","label":"...","success":{"narrative":"...","statChanges":{"mentality":1}},"failure":{"narrative":"...","statChanges":{"stressDelta":2}}}]}]',
  ].join('\n');
}

export function extractJsonArray(text: string | null): unknown[] | null {
  if (!text) return null;
  try {
    const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const raw = JSON.parse(clean) as unknown;
    return Array.isArray(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function parseAiEvents(text: string | null): { valid: EventDef[]; invalid: unknown[] } {
  const raw = extractJsonArray(text);
  if (!raw) return { valid: [], invalid: [] };
  return validateAiEvents(raw);
}
