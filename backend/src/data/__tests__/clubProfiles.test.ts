import { describe, expect, it } from 'vitest';
import { getClubProfile } from '../clubProfiles.js';

describe('club profile fallback chain', () => {
  it('uses per-club overrides before archetype presets', () => {
    const profile = getClubProfile('club-local-wolves', 'youth', 'development-factory');

    expect(profile.rosterStyle).toBe('chaotic');
    expect(profile.politicsBias.conflictRisk).toBe(1.4);
  });

  it('uses archetype presets before tier defaults', () => {
    const profile = getClubProfile('profile-capital-test', 'pro', 'capital-project');

    expect(profile.rosterStyle).toBe('firepower');
    expect(profile.politicsBias.starWeight).toBe(1.4);
    expect(profile.politicsBias.coachControl).toBe(0.8);
  });

  it('falls back to tier defaults and then the default profile', () => {
    expect(getClubProfile('profile-pro-test', 'pro').rosterStyle).toBe('tactical');
    expect(getClubProfile('profile-rookie-test').rosterStyle).toBe('balanced');
  });
});
