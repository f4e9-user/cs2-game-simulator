import type { Club, ClubArchetype, ClubTier } from '../types.js';

type IdentityRange = {
  heritage: [number, number];
  capital: [number, number];
};

const IDENTITY_BASE: Record<ClubArchetype, IdentityRange> = {
  'legacy-giant': { heritage: [75, 95], capital: [55, 80] },
  'capital-project': { heritage: [20, 45], capital: [80, 98] },
  'development-factory': { heritage: [40, 60], capital: [25, 45] },
  'regional-pride': { heritage: [50, 70], capital: [40, 60] },
  'fallen-legacy': { heritage: [70, 90], capital: [25, 45] },
  'scrappy-underdog': { heritage: [15, 35], capital: [15, 35] },
};

const FALLBACK_ARCHETYPE_BY_TIER: Record<ClubTier, ClubArchetype> = {
  youth: 'development-factory',
  'semi-pro': 'regional-pride',
  pro: 'regional-pride',
  top: 'legacy-giant',
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function deriveFromRange(club: Club, key: 'heritage' | 'capital', range: [number, number]): number {
  const [min, max] = range;
  const span = max - min + 1;
  return min + (hashString(`identity:${club.id}:${key}`) % span);
}

export function fallbackArchetype(tier: ClubTier): ClubArchetype {
  return FALLBACK_ARCHETYPE_BY_TIER[tier];
}

export function clubArchetype(club: Pick<Club, 'clubArchetype' | 'tier'>): ClubArchetype {
  return club.clubArchetype ?? fallbackArchetype(club.tier);
}

export function clubHeritage(club: Club): number {
  if (typeof club.heritage === 'number') return club.heritage;
  return deriveFromRange(club, 'heritage', IDENTITY_BASE[clubArchetype(club)].heritage);
}

export function clubCapital(club: Club): number {
  if (typeof club.capital === 'number') return club.capital;
  return deriveFromRange(club, 'capital', IDENTITY_BASE[clubArchetype(club)].capital);
}

export function capitalSalaryMultiplier(club: Club): number {
  const capital = clubCapital(club);
  if (capital >= 80) return 1.25;
  if (capital >= 60) return 1.1;
  if (capital <= 30) return 0.9;
  return 1;
}
