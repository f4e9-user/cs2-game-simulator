import type { Background } from '../types.js';

// Default background applied when the client doesn't supply one.
// Stays in the catalog so the engine + future flows can reference it.
export const DEFAULT_BACKGROUND_ID = 'rookie-default';

export const BACKGROUNDS: Background[] = [
  {
    id: DEFAULT_BACKGROUND_ID,
    name: '无标签新人',
    description: '没有任何先入为主的标签——你就是个想打职业的小孩。',
    startStage: 'rookie',
    statBias: {},
    tags: [],
  },
  {
    id: 'high-rank-pubber',
    name: '高分路人',
    description: '天梯常驻前列，靠自己打出名堂。缺乏团队经验。',
    startStage: 'rookie',
    statBias: { agility: 2, experience: 2, intelligence: -1, constitution: -1 },
    tags: ['solo', 'mechanical'],
  },
  {
    id: 'youth-reserve',
    name: '青训替补',
    description: '俱乐部青训营吃住全包，但竞争激烈。',
    startStage: 'youth',
    statBias: { intelligence: 1, experience: 1, constitution: 1 },
    tags: ['academy', 'steady'],
  },
  {
    id: 'streamer-convert',
    name: '主播转职业',
    description: '自带流量的主播，进队第一天就有镜头。',
    startStage: 'rookie',
    statBias: { mentality: 1, agility: -1, constitution: -1 },
    tags: ['streamer', 'media'],
  },
  {
    id: 'netcafe-champ',
    name: '网吧赛冠军',
    description: '从线下网吧赛一路杀出，经验粗糙但韧性十足。',
    startStage: 'rookie',
    statBias: { mentality: 2, experience: 1, constitution: 1 },
    tags: ['streetwise', 'grinder'],
  },
  {
    id: 'second-team-rising',
    name: '二线队新星',
    description: '已经在二线队打出过关键比赛，被职业队观察中。',
    startStage: 'second',
    statBias: { intelligence: 1, agility: 1, experience: 2 },
    tags: ['academy', 'steady'],
  },
];

export function getBackground(id: string): Background | undefined {
  return BACKGROUNDS.find((b) => b.id === id);
}
