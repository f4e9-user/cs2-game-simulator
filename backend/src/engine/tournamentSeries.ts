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
      ...mapPool.map((mapName, index) => ({
        id: `map-${index + 1}`,
        dynamicEventKind: 'tournament-map' as const,
        generatedEvent: buildTournamentMapEvent(tournament, stageIndex, mapName, index + 1, maxMaps),
        skipIf: { kind: 'series-score-reached' as const, wins: requiredWins(seriesType) },
      })),
      {
        id: 'series-final',
        dynamicEventKind: 'tournament-series-decider' as const,
        generatedEvent: buildTournamentSeriesFinalEvent(tournament, stageIndex, seriesType),
        completeSequenceAfter: true,
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
