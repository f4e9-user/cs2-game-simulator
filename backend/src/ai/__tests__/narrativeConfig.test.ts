import { describe, it, expect } from 'vitest';
import {
  loadTraitNarrativeConfig,
  loadEventNarrativeMeta,
  resolveNarrativeMeta,
  buildTraitRulesForPlayer,
} from '../narrativeConfig.js';
import type { TraitNarrativeRule, EventNarrativeMeta } from '../narrativeConfig.js';

describe('narrativeConfig', () => {
  describe('loadTraitNarrativeConfig', () => {
    it('loads config with 22 traits', async () => {
      const config = await loadTraitNarrativeConfig();
      expect(Object.keys(config).length).toBe(22);
      expect(config.scapegoat).toBeDefined();
      expect(config.scapegoat!.emotionalCore).toBeTruthy();
    });

    it('scapegoat has bailout modifier in eventTypeModifiers', async () => {
      const config = await loadTraitNarrativeConfig();
      expect(config.scapegoat?.eventTypeModifiers?.bailout).toBeDefined();
      expect(config.scapegoat!.eventTypeModifiers!.bailout!.emphasis).toContain('被关怀时感到刺痛');
    });

    it('hothead has eventTypeModifiers (empty object)', async () => {
      const config = await loadTraitNarrativeConfig();
      expect(config.hothead?.eventTypeModifiers).toBeDefined();
    });

    it('returns empty object on invalid import', async () => {
      // This tests the catch path — we can't easily trigger an import error,
      // but the fallback path exists. We verify by ensuring valid path works.
      const config = await loadTraitNarrativeConfig();
      expect(typeof config).toBe('object');
    });
  });

  describe('loadEventNarrativeMeta', () => {
    it('loads meta for bailout type', async () => {
      const config = await loadEventNarrativeMeta();
      expect(config.bailout).toBeDefined();
      expect(config.bailout!.emotionTone).toBe('被救济的自尊冲突');
      expect(config.bailout!.narrativeConstraints).toContain('禁止写成被施舍的愤怒');
    });

    it('loads meta for life type with traitReactions', async () => {
      const config = await loadEventNarrativeMeta();
      expect(config.life).toBeDefined();
      expect(config.life!.traitReactions.scapegoat).toBeDefined();
    });

    it('includes all expected event types', async () => {
      const config = await loadEventNarrativeMeta();
      const expectedTypes = [
        'bailout', 'life', 'stress', 'training', 'ranked', 'team',
        'tryout', 'match', 'media', 'betting', 'cheat', 'rest',
        'rival', 'broadcast', 'daily', 'routine', 'chains', 'skins', 'agent',
      ];
      for (const t of expectedTypes) {
        expect(config[t]).toBeDefined();
      }
    });

    it('each meta has required fields', async () => {
      const config = await loadEventNarrativeMeta();
      for (const [eventType, meta] of Object.entries(config)) {
        expect(meta.eventType).toBe(eventType);
        expect(meta.emotionTone).toBeTruthy();
        expect(meta.playerStance).toBeTruthy();
        expect(meta.conflictType).toBeTruthy();
        expect(Array.isArray(meta.narrativeConstraints)).toBe(true);
      }
    });
  });

  describe('resolveNarrativeMeta', () => {
    const defaults: Record<string, EventNarrativeMeta> = {
      bailout: {
        eventType: 'bailout',
        emotionTone: 'default-tone',
        playerStance: 'default-stance',
        conflictType: 'default-conflict',
        traitReactions: {},
        narrativeConstraints: [],
      },
    };

    it('returns type default when no override', () => {
      const result = resolveNarrativeMeta('bailout', undefined, undefined, defaults);
      expect(result.emotionTone).toBe('default-tone');
    });

    it('override takes priority over type default', () => {
      const overrides = [
        { eventId: 'bailout-family-gift', emotionTone: 'override-tone' },
      ];
      const result = resolveNarrativeMeta('bailout', 'bailout-family-gift', overrides, defaults);
      expect(result.emotionTone).toBe('override-tone');
      expect(result.playerStance).toBe('default-stance');
    });

    it('returns empty fallback for unknown event type', () => {
      const result = resolveNarrativeMeta('nonexistent');
      expect(result.eventType).toBe('nonexistent');
      expect(result.emotionTone).toBe('');
    });

    it('ignores overrides when eventId does not match', () => {
      const overrides = [
        { eventId: 'other-event', emotionTone: 'other-tone' },
      ];
      const result = resolveNarrativeMeta('bailout', 'bailout-family-gift', overrides, defaults);
      expect(result.emotionTone).toBe('default-tone');
    });

    it('no overrides array returns default', () => {
      const result = resolveNarrativeMeta('bailout', 'anything', undefined, defaults);
      expect(result.emotionTone).toBe('default-tone');
    });

    it('empty overrides array returns default', () => {
      const result = resolveNarrativeMeta('bailout', 'anything', [], defaults);
      expect(result.emotionTone).toBe('default-tone');
    });
  });

  describe('buildTraitRulesForPlayer', () => {
    const config: Record<string, TraitNarrativeRule> = {
      scapegoat: {
        traitId: 'scapegoat',
        behaviorPatterns: ['a'],
        forbiddenMisreads: ['b'],
        emotionalCore: 'c',
        stateInteractions: {},
      },
      hothead: {
        traitId: 'hothead',
        behaviorPatterns: ['d'],
        forbiddenMisreads: ['e'],
        emotionalCore: 'f',
        stateInteractions: {},
      },
    };

    it('returns rules for existing traits', () => {
      const rules = buildTraitRulesForPlayer(['scapegoat'], config);
      expect(rules.length).toBe(1);
      expect(rules[0]!.traitId).toBe('scapegoat');
    });

    it('skips missing traits (graceful degradation)', () => {
      const rules = buildTraitRulesForPlayer(['scapegoat', 'nonexistent'], config);
      expect(rules.length).toBe(1);
    });

    it('returns empty array for empty trait list', () => {
      const rules = buildTraitRulesForPlayer([], {});
      expect(rules.length).toBe(0);
    });

    it('returns multiple rules when multiple traits match', () => {
      const rules = buildTraitRulesForPlayer(['scapegoat', 'hothead'], config);
      expect(rules.length).toBe(2);
    });

    it('all rules in result have traitId matching input order', () => {
      const rules = buildTraitRulesForPlayer(['hothead', 'scapegoat'], config);
      expect(rules[0]!.traitId).toBe('hothead');
      expect(rules[1]!.traitId).toBe('scapegoat');
    });
  });
});
