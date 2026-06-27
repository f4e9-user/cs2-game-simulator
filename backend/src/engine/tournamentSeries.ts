import type { Buff, EventDef, EventSequence } from '../types.js';
import type { Tournament } from '../data/tournaments.js';

export interface TournamentMapResult {
  mapName: string;
  won: boolean;
  teamScore: number;
  enemyScore: number;
  kills: number;
  deaths: number;
  assists: number;
  headshotRate: number;
  rating: number;
}

export interface TournamentSeriesContext {
  tournamentId: string;
  stageIndex: number;
  seriesType: 'bo3' | 'bo5';
  mapPool: string[];
  seriesBuffSnapshot?: Buff[];
  maps: TournamentMapResult[];
  playerMapWins: number;
  opponentMapWins: number;
}

const DEFAULT_MAP_POOL = ['Mirage', 'Inferno', 'Nuke', 'Ancient', 'Anubis', 'Overpass', 'Vertigo'];

export function createTournamentSeriesSequence(
  tournament: Tournament,
  stageIndex: number,
  seriesBuffSnapshot: Buff[] = [],
): EventSequence {
  const stage = tournament.bracket[stageIndex]!;
  const seriesType = stage.seriesType === 'bo5' ? 'bo5' : 'bo3';
  const maxMaps = seriesType === 'bo5' ? 5 : 3;
  const mapPool = pickMapPool(stage.mapPool ?? DEFAULT_MAP_POOL, tournament.id, stageIndex, maxMaps);
  const context: TournamentSeriesContext = {
    tournamentId: tournament.id,
    stageIndex,
    seriesType,
    mapPool,
    seriesBuffSnapshot,
    maps: [],
    playerMapWins: 0,
    opponentMapWins: 0,
  };

  return {
    id: `series-${tournament.id}-${stageIndex}`,
    type: 'tournament-series',
    currentIndex: 0,
    startedRound: 0,
    mustCompleteInCurrentRound: true,
    status: 'active',
    context: context as unknown as Record<string, unknown>,
    steps: [
      // 每张图后（除最后一张、且系列赛未提前分出胜负时）插入一个中场休息步骤，
      // 模拟现实 Bo3/Bo5 的图间休息：恢复部分疲劳，并可能触发队友互动/冲突。
      ...mapPool.flatMap((mapName, index) => {
        const mapNumber = index + 1;
        const mapStep = {
          id: `map-${mapNumber}`,
          dynamicEventKind: 'tournament-map' as const,
          generatedEvent: buildTournamentMapEvent(tournament, stageIndex, mapName, mapNumber, maxMaps),
          skipIf: { kind: 'series-score-reached' as const, wins: requiredWins(seriesType) },
        };
        if (index === mapPool.length - 1) return [mapStep];
        const breakStep = {
          id: `break-${mapNumber}`,
          dynamicEventKind: 'tournament-break' as const,
          generatedEvent: buildTournamentBreakEvent(tournament, stageIndex, mapNumber),
          // 一旦系列赛已分出胜负，剩余的中场与地图一起跳过，直奔结算。
          skipIf: { kind: 'series-score-reached' as const, wins: requiredWins(seriesType) },
        };
        return [mapStep, breakStep];
      }),
      {
        id: 'series-final',
        dynamicEventKind: 'tournament-series-decider' as const,
        generatedEvent: buildTournamentSeriesFinalEvent(tournament, stageIndex, seriesType),
        completeSequenceAfter: true,
      },
    ],
  };
}

// 系列赛图间的中场休息事件。type 设为 'rest'，让它在结算时走
// applyInjuryRiskTick(context='rest') —— 即降级伤病状态而非升级。
export function buildTournamentBreakEvent(
  tournament: Tournament,
  stageIndex: number,
  mapNumber: number,
): EventDef {
  const stage = tournament.bracket[stageIndex]!;
  return {
    id: `tournament-series-${tournament.id}-${stageIndex}-break-${mapNumber}`,
    type: 'rest',
    title: `${tournament.name} · ${stage.name} · 中场休息`,
    narrative: `第 ${mapNumber} 张地图打完，进入图间休息。短暂的几分钟里，你可以喘口气、和队友对一下思路，或者给队伍打打气。`,
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    choices: [
      {
        id: 'break-recover',
        label: '抓紧恢复，喝水放松手腕',
        description: '把这几分钟用来回血，稳住状态。',
        check: { primary: 'constitution', secondary: 'mentality', dc: 4, traitBonuses: { athletic: 2, steady: 1 } },
        success: {
          narrative: '你靠在椅背上深呼吸，手腕和肩颈都松了下来，下一张图能满状态上。',
          stateDelta: { fatigue: -12, stress: -4 },
        },
        failure: {
          narrative: '休息时脑子里还在回放刚才的回合，没完全放松下来。',
          stateDelta: { fatigue: -6, stress: -1 },
        },
      },
      {
        id: 'break-review',
        label: '和队友复盘上一张图',
        description: '统一思路有机会提升手感，但意见不合也可能闹僵。',
        check: { primary: 'intelligence', secondary: 'mentality', dc: 7, traitBonuses: { tactical: 2, igl: 2 } },
        success: {
          narrative: '你们快速对齐了下一张图的思路，分歧被捋顺，气氛反而更拧成一股绳。',
          stateDelta: { fatigue: -6, feel: 1 },
          effects: { teamChemistryDelta: 2, teamTrustDelta: 1 },
        },
        failure: {
          narrative: '复盘变成了互相甩锅，几句话就顶了起来，谁也没说服谁。',
          stateDelta: { fatigue: -3, tilt: 1, stress: 4 },
          effects: { teamChemistryDelta: -2, teamTrustDelta: -3 },
        },
      },
      {
        id: 'break-rally',
        label: '给队友打打气',
        description: '稳住队伍情绪，但需要你自己心态够稳。',
        check: { primary: 'mentality', dc: 6, traitBonuses: { igl: 2, steady: 1 } },
        success: {
          narrative: '你拍了拍队友的肩膀说了几句，更衣室的紧绷感散了不少。',
          stateDelta: { fatigue: -6, stress: -6 },
          effects: { teamTrustDelta: 3 },
        },
        failure: {
          narrative: '你想鼓劲，但话说得有点空，自己反而更焦虑了。',
          stateDelta: { fatigue: -4, stress: 2 },
        },
      },
    ],
  };
}

export function buildTournamentMapEvent(
  tournament: Tournament,
  stageIndex: number,
  mapName: string,
  mapNumber: number,
  maxMaps: number,
): EventDef {
  const stage = tournament.bracket[stageIndex]!;
  return {
    id: `tournament-series-${tournament.id}-${stageIndex}-map-${mapNumber}`,
    type: 'match',
    title: `${tournament.name} · ${stage.name} · Map ${mapNumber}`,
    narrative: `${tournament.name} ${stage.name}进入系列赛。第 ${mapNumber}/${maxMaps} 张地图是 ${mapName}。`,
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: tournament.baseDifficulty + stage.difficultyBonus,
    choices: [
      {
        id: 'match-play',
        label: `上场打 ${mapName}`,
        description: '本地图只结算单图表现，系列赛奖励会在最终结果后统一发放。',
        check: { primary: 'agility', dc: 0 },
        success: { narrative: '' },
        failure: { narrative: '' },
      },
    ],
  };
}

export function buildTournamentSeriesFinalEvent(
  tournament: Tournament,
  stageIndex: number,
  seriesType: 'bo3' | 'bo5',
): EventDef {
  const stage = tournament.bracket[stageIndex]!;
  return {
    id: `tournament-${tournament.id}--${stageIndex}`,
    type: 'match',
    title: `${tournament.name} · ${stage.name} · ${seriesType.toUpperCase()} 结果`,
    narrative: '系列赛全部地图结束，现在结算整场比赛结果。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: tournament.baseDifficulty + stage.difficultyBonus,
    choices: [
      {
        id: 'series-confirm',
        label: '确认系列赛结果',
        description: '统一结算晋级、奖金、积分和资格奖励。',
        check: { primary: 'experience', dc: 0 },
        success: { narrative: '' },
        failure: { narrative: '' },
      },
    ],
  };
}

export function requiredWins(seriesType: 'bo3' | 'bo5'): number {
  return seriesType === 'bo5' ? 3 : 2;
}

function pickMapPool(pool: string[], tournamentId: string, stageIndex: number, maxMaps: number): string[] {
  const offset = Math.abs(hash(`${tournamentId}:${stageIndex}`)) % pool.length;
  return Array.from({ length: maxMaps }, (_, index) => pool[(offset + index) % pool.length]!);
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
