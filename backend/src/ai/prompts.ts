import type { Player, RoundResult } from '../types.js';
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

export function buildSummaryPrompt(history: RoundResult[], player: Player): string {
  return [
    `为这名选手 ${player.name} 当前生涯写 1 段 60 字以内的中文小结。`,
    `当前阶段：${STAGE_LABELS[player.stage]}`,
    `最近事件：`,
    ...history.slice(-5).map((r) => `- ${r.eventTitle}：${r.success ? '成功' : '失败'}`),
    '禁止编造未提供的事件。',
  ].join('\n');
}
