import { CLUBS } from './clubs.js';
import type { ClubArchetype, ClubProfile, RosterStyle } from '../types.js';

type ClubProfilePreset = Partial<Omit<ClubProfile, 'clubId' | 'politicsBias'>> & {
  politicsBias?: Partial<ClubProfile['politicsBias']>;
};

const DEFAULT_PROFILE: Omit<ClubProfile, 'clubId'> = {
  rosterStyle: 'balanced',
  roleBias: {},
  traitBias: {},
  personalityBias: {},
  identityBias: {},
  fitWeights: { agility: 1, intelligence: 1, mentality: 1, experience: 1 },
  preferredTraitTags: [],
  managementModifiers: {},
  politicsBias: {
    callerWeight: 1,
    starWeight: 1,
    coachControl: 1,
    conflictRisk: 1,
  },
};

const PROFILE_OVERRIDES: Record<string, Partial<Omit<ClubProfile, 'clubId'>>> = {
  'club-local-wolves': {
    rosterStyle: 'chaotic',
    roleBias: { Entry: 2, AWPer: 2 },
    traitBias: { mechanical: 2, clutch: 2, solo: 1, ego: 1 },
    personalityBias: { star: 2, drama: 2, grinder: 1 },
    identityBias: { star: 2, problem: 1 },
    fitWeights: { agility: 1.5, mentality: 1 },
    preferredTraitTags: ['aimer', 'mechanical', 'clutch'],
    managementModifiers: { teamMeetingDc: 1, lockerRoomTalkDc: 1, teamPracticeGrowthMultiplier: 1.1 },
    politicsBias: { callerWeight: 0.8, starWeight: 1.4, coachControl: 0.7, conflictRisk: 1.4 },
  },
  'club-cyber-academy': {
    rosterStyle: 'tactical',
    roleBias: { IGL: 2, Support: 2, Lurker: 1 },
    traitBias: { tactical: 2, steady: 2, support: 2, selfless: 1 },
    personalityBias: { strict: 2, supportive: 2, grinder: 1 },
    identityBias: { caller: 2, glue: 2 },
    fitWeights: { intelligence: 1.5, experience: 1.2, mentality: 1.2 },
    preferredTraitTags: ['igl', 'tactical', 'support', 'steady'],
    managementModifiers: { teamMeetingDc: -1, lockerRoomTalkDc: -1 },
    politicsBias: { callerWeight: 1.4, starWeight: 0.8, coachControl: 1.4, conflictRisk: 0.7 },
  },
  'club-school-team': {
    rosterStyle: 'development',
    roleBias: { Support: 1, IGL: 1, Entry: 1, AWPer: 1, Lurker: 1 },
    traitBias: { support: 2, steady: 2, selfless: 1 },
    personalityBias: { supportive: 2, grinder: 2 },
    identityBias: { rookie: 1, glue: 2 },
    fitWeights: { mentality: 1.4, constitution: 1.2 },
    preferredTraitTags: ['support', 'steady'],
    managementModifiers: { lockerRoomTalkDc: -1, teamPracticeGrowthMultiplier: 1.05 },
    politicsBias: { callerWeight: 1, starWeight: 0.8, coachControl: 1, conflictRisk: 0.6 },
  },
  'club-regional-youth': {
    rosterStyle: 'balanced',
    roleBias: { IGL: 1, AWPer: 1.5, Entry: 1.5 },
    traitBias: { tactical: 1, aimer: 1, mechanical: 1, steady: 1 },
    personalityBias: { strict: 1, star: 1, grinder: 1 },
    identityBias: { caller: 1, star: 1 },
    fitWeights: { agility: 1.3, intelligence: 1.2, experience: 1.1 },
    preferredTraitTags: ['aimer', 'tactical', 'steady'],
    managementModifiers: { teamPracticeDc: 1 },
    politicsBias: { callerWeight: 1.1, starWeight: 1.1, coachControl: 1.2, conflictRisk: 1 },
  },
};

const ARCHETYPE_PROFILE: Record<ClubArchetype, ClubProfilePreset> = {
  'legacy-giant': {
    rosterStyle: 'tactical',
    politicsBias: { callerWeight: 1, starWeight: 1.2, coachControl: 1.2, conflictRisk: 1 },
  },
  'capital-project': {
    rosterStyle: 'firepower',
    politicsBias: { callerWeight: 1, starWeight: 1.4, coachControl: 0.8, conflictRisk: 1.3 },
  },
  'development-factory': {
    rosterStyle: 'development',
    managementModifiers: { teamPracticeGrowthMultiplier: 1.1 },
  },
  'regional-pride': {
    rosterStyle: 'balanced',
  },
  'fallen-legacy': {
    rosterStyle: 'tactical',
    politicsBias: { callerWeight: 1, starWeight: 1, coachControl: 1, conflictRisk: 1.2 },
  },
  'scrappy-underdog': {
    rosterStyle: 'chaotic',
  },
};

const STYLE_BY_TIER: Record<string, RosterStyle> = {
  'semi-pro': 'balanced',
  pro: 'tactical',
  top: 'firepower',
};

export function getClubProfile(clubId: string, tier?: string, archetype?: ClubArchetype): ClubProfile {
  const resolvedArchetype = archetype ?? CLUBS.find((club) => club.id === clubId)?.clubArchetype;
  const archetypePreset = resolvedArchetype ? ARCHETYPE_PROFILE[resolvedArchetype] : {};
  const override = PROFILE_OVERRIDES[clubId] ?? {};
  const rosterStyle = override.rosterStyle
    ?? archetypePreset.rosterStyle
    ?? (tier ? STYLE_BY_TIER[tier] : undefined)
    ?? DEFAULT_PROFILE.rosterStyle;
  return {
    ...DEFAULT_PROFILE,
    ...archetypePreset,
    ...override,
    rosterStyle,
    clubId,
    roleBias: { ...DEFAULT_PROFILE.roleBias, ...(archetypePreset.roleBias ?? {}), ...(override.roleBias ?? {}) },
    traitBias: { ...DEFAULT_PROFILE.traitBias, ...(archetypePreset.traitBias ?? {}), ...(override.traitBias ?? {}) },
    personalityBias: {
      ...DEFAULT_PROFILE.personalityBias,
      ...(archetypePreset.personalityBias ?? {}),
      ...(override.personalityBias ?? {}),
    },
    identityBias: { ...DEFAULT_PROFILE.identityBias, ...(archetypePreset.identityBias ?? {}), ...(override.identityBias ?? {}) },
    fitWeights: { ...DEFAULT_PROFILE.fitWeights, ...(archetypePreset.fitWeights ?? {}), ...(override.fitWeights ?? {}) },
    preferredTraitTags: override.preferredTraitTags ?? archetypePreset.preferredTraitTags ?? DEFAULT_PROFILE.preferredTraitTags,
    managementModifiers: {
      ...DEFAULT_PROFILE.managementModifiers,
      ...(archetypePreset.managementModifiers ?? {}),
      ...(override.managementModifiers ?? {}),
    },
    politicsBias: { ...DEFAULT_PROFILE.politicsBias, ...(archetypePreset.politicsBias ?? {}), ...(override.politicsBias ?? {}) },
  };
}
