import { DEFAULT_HOUSING_CITY_ID } from '../data/housing.js';
import { getTournament } from '../data/tournaments.js';
import type { HousingCityId, Player } from '../types.js';

export type TravelRegionKey =
  | 'local'
  | 'apac'
  | 'europe'
  | 'north-america'
  | 'south-america'
  | 'mena'
  | 'oceania'
  | 'global';

export interface TournamentTravelContext {
  tournamentName: string;
  venueLabel: string;
  venueKey: TravelRegionKey;
  distance: 'same-region' | 'cross-region';
  hasCityVenue: boolean;
}

const LOCAL_HOUSING_REGION: Record<HousingCityId, TravelRegionKey> = {
  'local-city': 'local',
  'regional-hub': 'apac',
  'major-hub': 'apac',
  'low-cost-city': 'local',
};

const CITY_REGION_MAP: Record<string, TravelRegionKey> = {
  Cologne: 'europe',
  Katowice: 'europe',
  Rotterdam: 'europe',
  London: 'europe',
  Bucharest: 'europe',
  Helsinki: 'europe',
  Prague: 'europe',
  Lisbon: 'europe',
  Warsaw: 'europe',
  Stockholm: 'europe',
  Belgrade: 'europe',
  Krakow: 'europe',
  Sofia: 'europe',
  Brno: 'europe',
  Porto: 'europe',
  Atlanta: 'north-america',
  Dallas: 'north-america',
  Shanghai: 'apac',
  Shenzhen: 'apac',
  Chengdu: 'apac',
  Wuhan: 'apac',
  Hangzhou: 'apac',
  Busan: 'apac',
  Manila: 'apac',
  Taipei: 'apac',
  Osaka: 'apac',
  Singapore: 'apac',
  Kuala: 'apac',
  Melbourne: 'oceania',
  Abu: 'mena',
  Dubai: 'mena',
  Astana: 'apac',
  Rio: 'south-america',
};

export function normalizeTravelRegionKey(value?: string): TravelRegionKey {
  if (!value) return 'local';
  const lower = value.toLowerCase();
  if (value === '本地' || lower.includes('local')) return 'local';
  if (value === '亚太' || value === '中国' || value === '东南亚' || value === '蒙古' || lower.includes('asia') || lower.includes('east asia')) {
    return 'apac';
  }
  if (value === '欧洲' || value === 'CIS / 东欧' || lower.includes('europe') || lower.includes('cis')) return 'europe';
  if (value === '北美' || lower.includes('north america')) return 'north-america';
  if (value === '南美' || lower.includes('south america')) return 'south-america';
  if (value === '中东' || lower.includes('mena') || lower.includes('middle east')) return 'mena';
  if (value === '大洋洲' || lower.includes('oceania')) return 'oceania';
  return 'global';
}

function venueRegionKey(name?: string, region?: string): TravelRegionKey {
  if (!name) return normalizeTravelRegionKey(region);
  if (CITY_REGION_MAP[name]) return CITY_REGION_MAP[name]!;
  const cityPrefix = Object.keys(CITY_REGION_MAP).find((city) => name.includes(city));
  if (cityPrefix) return CITY_REGION_MAP[cityPrefix]!;
  return normalizeTravelRegionKey(region);
}

function homeRegionKey(player: Player): TravelRegionKey {
  if (player.team?.region) return normalizeTravelRegionKey(player.team.region);
  return LOCAL_HOUSING_REGION[player.housing?.cityId ?? DEFAULT_HOUSING_CITY_ID];
}

function buildTournamentTravelContext(player: Player, options?: { requireMatchWeek?: boolean }): TournamentTravelContext | null {
  const pendingMatch = player.pendingMatch;
  if (!pendingMatch) return null;
  if (
    options?.requireMatchWeek !== false &&
    (pendingMatch.resolveYear !== (player.year ?? 1) || pendingMatch.resolveWeek !== (player.week ?? 1))
  ) {
    return null;
  }
  const tournament = getTournament(pendingMatch.tournamentId);
  if (!tournament) return null;
  const venueKey = venueRegionKey(tournament.city, tournament.region);
  const homeKey = homeRegionKey(player);
  return {
    tournamentName: tournament.displayName,
    venueLabel: tournament.city ?? tournament.region ?? '异地赛场',
    venueKey,
    distance: venueKey === homeKey ? 'same-region' : 'cross-region',
    hasCityVenue: Boolean(tournament.city),
  };
}

export function tournamentTravelContext(player: Player): TournamentTravelContext | null {
  return buildTournamentTravelContext(player, { requireMatchWeek: true });
}

export function awayTournamentTravelContext(player: Player): TournamentTravelContext | null {
  const context = tournamentTravelContext(player);
  return context?.distance === 'cross-region' ? context : null;
}

export function pendingAwayTournamentTravelContext(player: Player): TournamentTravelContext | null {
  const context = buildTournamentTravelContext(player, { requireMatchWeek: false });
  return context?.distance === 'cross-region' ? context : null;
}

export function tournamentTravelEventTags(ctx: TournamentTravelContext): string[] {
  const tags = ['travel-away', `travel-venue-${ctx.venueKey}`];
  if (ctx.distance === 'same-region') tags.push('travel-regional');
  if (ctx.distance === 'cross-region') tags.push('travel-cross-region');
  if (ctx.hasCityVenue) tags.push('travel-city');
  if (ctx.hasCityVenue && ctx.distance === 'cross-region') tags.push('travel-city-hot');
  return tags;
}
