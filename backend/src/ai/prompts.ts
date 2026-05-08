import type { Background, GameEventPublic, Player, RoundResult, Trait } from '../types.js';
import { STAGE_LABELS } from '../engine/constants.js';

export interface NarrativePromptInput {
  player: Player;
  baseNarrative: string;   // deterministic outcome text from event config
  eventTitle: string;
  choiceLabel: string;
  success: boolean;
}

export function buildNarrativePrompt(input: NarrativePromptInput): string {
  const { player, baseNarrative, eventTitle, choiceLabel, success } = input;
  return [
    '你是一个 CS2 电竞小说的叙事引擎。',
    '请基于下面的事实，把 "原始描述" 润色成 1-2 句更有画面感、更冷静的中文叙事。',
    '禁止改变成败、属性、阶段、任何数值或剧情走向。只改文字风格。',
    `选手：${player.name}，阶段：${STAGE_LABELS[player.stage] ?? player.stage}`,
    `事件：${eventTitle}`,
    `选择：${choiceLabel}`,
    `结果：${success ? '成功' : '失败'}`,
    `原始描述：${baseNarrative}`,
    '只输出润色后的正文，不要解释，不要加引号。',
  ].join('\n');
}

export function buildIntroPrompt(
  player: Player,
  traits: Trait[],
  background: Background,
): string {
  const traitDescs = traits
    .map((t) => `${t.name}（${t.description}）`)
    .join('、');
  return [
    `为以下 CS2 职业选手写一段 80-120 字的第三人称中文故事开头，`,
    `像小说第一章第一段，有画面感、有情绪。`,
    `禁止出现任何数值、属性名或游戏机制词汇，只写人物与环境。`,
    `选手名：${player.name}`,
    `出身背景：${background.name} —— ${background.description}`,
    `天赋特质：${traitDescs}`,
    `只输出故事正文，不要标题，不要引号。`,
  ].join('\n');
}

export interface PersonalizedEvent {
  narrative: string;
  choices: Array<{ id: string; description: string }>;
}

export function buildPersonalizePrompt(
  player: Player,
  traits: Trait[],
  event: GameEventPublic,
): string {
  const traitNames = traits.map((t) => t.name).join('、');
  const feel = player.volatile?.feel ?? 0;
  const feelLabel = feel >= 2 ? '手感火热' : feel <= -2 ? '手感冰冷' : '手感正常';
  const stressLabel = player.stress >= 80 ? '压力极大' : player.stress >= 50 ? '压力偏高' : '压力正常';

  const choicesJson = event.choices
    .map((c) => `{"id":"${c.id}","label":"${c.label}","description":"${c.description}"}`)
    .join(',\n');

  return [
    '你是 CS2 电竞小说的叙事引擎。',
    '根据选手当前状态，把下面事件的 narrative 和每个选项的 description 改得更有个人色彩。',
    '规则：禁止改变选项数量、选项 id、选项 label、事件类型或任何游戏机制含义。只改措辞和细节。',
    `选手：${player.name}，阶段：${STAGE_LABELS[player.stage] ?? player.stage}`,
    `特质：${traitNames || '无'}`,
    `当前状态：${stressLabel}，名气 ${player.fame}，${feelLabel}`,
    `事件 narrative：${event.narrative}`,
    `选项：\n[${choicesJson}]`,
    '严格输出 JSON，格式：{"narrative":"...","choices":[{"id":"...","description":"..."}]}',
    '不要输出任何其他内容。',
  ].join('\n');
}

const ENDING_LABELS: Record<string, string> = {
  legend: '传奇退役',
  champion: '冠军荣耀',
  retired_on_top: '巅峰退役',
  quiet_exit: '悄然离场',
  stress_breakdown: '心态崩溃，被迫退出',
  injury_ended_career: '伤病终结生涯',
  career_ended: '生涯提前结束',
  'free-agent-legend': '自由人传奇',
  'loyal-veteran': '忠诚老将',
};

export function buildSummaryPrompt(
  player: Player,
  history: RoundResult[],
  ending?: string,
): string {
  const wins = history.filter((r) => r.success).length;
  const endingLabel = ending ? (ENDING_LABELS[ending] ?? ending) : '未知';
  const highlights = history
    .filter((r) => r.success && (r.fameChange > 0 || r.eventType === 'match'))
    .slice(-3)
    .map((r) => `- ${r.eventTitle}`);

  return [
    `为 CS2 职业选手 ${player.name} 写一段 80 字以内的生涯结语，语气像体育解说员盖棺定论。`,
    `生涯阶段：${STAGE_LABELS[player.stage] ?? player.stage}`,
    `总回合数：${history.length}，胜利：${wins}，失败：${history.length - wins}`,
    `名气：${player.fame}，压力峰值经历：${player.stressMaxRounds > 0 ? '有过崩溃边缘' : '心态稳定'}`,
    `结局：${endingLabel}`,
    highlights.length > 0 ? `代表性高光：\n${highlights.join('\n')}` : '',
    '只输出结语正文，不要标题，不要引号，禁止编造未提及的事件。',
  ]
    .filter(Boolean)
    .join('\n');
}
