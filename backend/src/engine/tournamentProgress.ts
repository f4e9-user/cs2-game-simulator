import type { Tournament } from '../data/tournaments.js';

export function championshipTierKeys(tournament: Tournament): string[] {
  if (tournament.tier === 'c') return ['c'];
  if (tournament.tier === 'b') return ['b'];
  if (tournament.tier === 'a') return ['a'];
  if (tournament.tier === 'major') return ['s', 'major'];
  if (
    tournament.tier === 's-open' ||
    tournament.tier === 's-closed' ||
    tournament.tier === 's-class' ||
    tournament.progressionTier === 's-qualifier' ||
    tournament.progressionTier === 's-main'
  ) {
    return ['s'];
  }
  return [tournament.tier];
}

export function championshipSeriesKeys(tournament: Tournament): string[] {
  const out: string[] = [];
  const brand = tournament.brand.toLowerCase();
  if (brand.includes('pgl')) out.push('pgl');
  if (brand.includes('blast')) out.push('blast');
  if (tournament.tier === 'major' || tournament.subtype === 'major') out.push('major');
  return out;
}
