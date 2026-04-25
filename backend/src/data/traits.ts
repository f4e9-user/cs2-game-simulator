import type { Trait } from '../types.js';

// Traits now both grant stat modifiers and expose tags that shape
// choice.check.traitBonuses / traitPenalties during resolution.
// Positive modifiers become the "floor" of the stat allocator;
// negative modifiers are shown in the allocator as a visible penalty
// that the player can compensate for with their 10-point pool.
export const TRAITS: Trait[] = [
  {
    id: 'aim-god',
    name: '枪法天才',
    description: '准星是天生的。枪法和对枪类检定显著加成。',
    modifiers: { agility: 2 },
    tags: ['aimer', 'mechanical'],
  },
  {
    id: 'tactical-mind',
    name: '战术大脑',
    description: '擅长读局、复盘、指挥。战术类检定强势。',
    modifiers: { intelligence: 2 },
    tags: ['igl', 'tactical'],
  },
  {
    id: 'ice-cold',
    name: '冰冷心脏',
    description: '高压局几乎不抖枪，逆风也能保持节奏。',
    modifiers: { mentality: 2 },
    tags: ['clutch', 'steady'],
  },
  {
    id: 'grinder',
    name: '训练狂',
    description: '自律、肯练、能吃苦。训练类事件收益更高。',
    modifiers: { experience: 1, agility: 1, constitution: -1 },
    tags: ['grinder', 'steady'],
  },
  {
    id: 'streamer-charm',
    name: '镜头感',
    description: '镜头前放得开，赞助和舆论更友好。',
    modifiers: { money: 2, mentality: 1 },
    tags: ['streamer', 'media'],
  },
  {
    id: 'support-soul',
    name: '团队型选手',
    description: '愿意掷道具、开假点，队内事件加成。',
    modifiers: { mentality: 1, intelligence: 1 },
    tags: ['support', 'steady'],
  },
  {
    id: 'awper-instinct',
    name: 'AWP 嗅觉',
    description: '对时机和架点有天然直觉。',
    modifiers: { agility: 1, intelligence: 1 },
    tags: ['awper', 'mechanical'],
  },
  {
    id: 'scene-kid',
    name: '网吧少年',
    description: '街头出身，韧性强但对钱敏感。',
    modifiers: { mentality: 2, experience: 1, money: -1, constitution: 1 },
    tags: ['streetwise', 'grinder'],
  },
  {
    id: 'fragile-star',
    name: '玻璃心',
    description: '天赋高，但容易被舆论带偏心态。',
    modifiers: { agility: 2, mentality: -2 },
    tags: ['mechanical', 'media', 'fragile'],
  },
  {
    id: 'ranked-warrior',
    name: '天梯之王',
    description: '路人局个人能力突出，正式比赛容易独。',
    modifiers: { agility: 1, experience: 2, intelligence: -1 },
    tags: ['solo', 'mechanical'],
  },
  {
    id: 'gambler',
    name: '赌徒体质',
    description: '对风险有天然渴望，博彩事件更擅长掩饰，也更容易陷进去。',
    modifiers: { agility: 1, money: -1 },
    tags: ['risky', 'gambler'],
  },
  {
    id: 'hothead',
    name: '易怒',
    description: '点就炸。枪法在线，队内磨合和采访经常翻车。',
    modifiers: { agility: 2, mentality: -2 },
    tags: ['aggressive', 'volatile'],
  },
  {
    id: 'arrogant',
    name: '自负',
    description: '相信自己是最强的。极其个人主义，拒绝复盘。',
    modifiers: { agility: 1, mentality: 1, intelligence: -2 },
    tags: ['solo', 'ego'],
  },
  {
    id: 'introvert',
    name: '社恐',
    description: '在镜头前、采访中、新环境里都容易发挥不出来。',
    modifiers: { intelligence: 2, mentality: -1, money: -1 },
    tags: ['shy', 'anti-media'],
  },
  {
    id: 'addicted',
    name: '沉迷型',
    description: '开局就是 12 小时。训练收益高，但生活会一团糟。',
    modifiers: { experience: 2, mentality: -1, money: -1, constitution: -1 },
    tags: ['grinder', 'obsessed'],
  },
  {
    id: 'flashy',
    name: '花架子',
    description: '操作华丽但不稳定，观众喜欢，教练头疼。',
    modifiers: { agility: 1, money: 1, experience: -1 },
    tags: ['media', 'flashy', 'inconsistent'],
  },
  {
    id: 'impatient',
    name: '急性子',
    description: '坐不住，喜欢主动打开局。默认局和慢节奏吃亏。',
    modifiers: { agility: 1, intelligence: -1 },
    tags: ['impulsive'],
  },
  {
    id: 'procrastinator',
    name: '拖延症',
    description: '复盘能推就推，训练计划总是打折。',
    modifiers: { intelligence: 1, experience: -2 },
    tags: ['lazy'],
  },
  {
    id: 'glass-wrist',
    name: '玻璃腕',
    description: '手腕容易受伤。高强度训练后负反馈明显。',
    modifiers: { agility: 2, mentality: -1, constitution: -2 },
    tags: ['fragile'],
  },
  {
    id: 'scapegoat',
    name: '背锅侠',
    description: '天生会接锅。队内关系稳，但常被当做输球的理由。',
    modifiers: { mentality: 2, money: -1 },
    tags: ['support', 'selfless'],
  },
  {
    id: 'iron-body',
    name: '铁打身板',
    description: '从小打篮球踢球游泳，什么伤都不扛住过。',
    modifiers: { constitution: 3 },
    tags: ['athletic', 'steady'],
  },
  {
    id: 'night-owl',
    name: '夜猫体质',
    description: '能熬，熬坏的概率也更高。',
    modifiers: { experience: 1, constitution: -2, mentality: 1 },
    tags: ['grinder', 'obsessed'],
  },
];

export function getTrait(id: string): Trait | undefined {
  return TRAITS.find((t) => t.id === id);
}
