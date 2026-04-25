// Rival teams generated at session creation. Stored on Player so events
// can reference a stable opponent name in narratives.
export interface Rival {
  name: string;
  tag: string; // short caps prefix, e.g. "NVX"
  region: string;
}

const TEAM_PREFIXES = [
  'Nova',
  'Pixel',
  'Zenith',
  'Blackbird',
  'Cinder',
  'Helix',
  'Volt',
  'Reverb',
  'Onyx',
  'Spectre',
  'Echo',
  'Oblivion',
  'Phantom',
  'Vortex',
  'Frostline',
];

const TEAM_SUFFIXES = [
  'X',
  'Burst',
  'Force',
  'Edge',
  'Dynasty',
  'Squad',
  'Crew',
  'eSports',
  'Gaming',
  'Legion',
];

const REGIONS = ['EU', 'NA', 'CN', 'KR', 'BR', 'SEA', 'CIS'];

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export function generateRivals(count = 4, rng: () => number = Math.random): Rival[] {
  const out: Rival[] = [];
  const seen = new Set<string>();
  while (out.length < count) {
    const prefix = pick(TEAM_PREFIXES, rng);
    const suffix = pick(TEAM_SUFFIXES, rng);
    const name = `${prefix}${suffix}`;
    if (seen.has(name)) continue;
    seen.add(name);
    const tag = (prefix.slice(0, 2) + suffix.slice(0, 1)).toUpperCase();
    const region = pick(REGIONS, rng);
    out.push({ name, tag, region });
  }
  return out;
}
