import { describe, expect, it } from 'vitest';
import { initPlayer, rollRandomTraits } from '../player.js';

describe('player initialization', () => {
  it('sets a default age and accepts a custom starting age', () => {
    const defaultAge = initPlayer({
      name: 'DefaultAge',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    const customAge = initPlayer({
      name: 'CustomAge',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
      age: 21,
    });

    expect(defaultAge.age).toBe(18);
    expect(customAge.age).toBe(21);
  });

  it('uses 20K as the default opening money', () => {
    const player = initPlayer({
      name: 'DefaultMoney',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });

    expect(player.stats.money).toBe(20);
  });

  it('applies opening money from family economy traits', () => {
    const hardship = initPlayer({
      name: 'LowMoney',
      traitIds: ['hardship-kid', 'aim-god', 'tactical-mind'],
      backgroundId: '',
      stats: {
        agility: 5,
        intelligence: 10,
        mentality: 2,
        constitution: 2,
        experience: 0,
        money: 0,
      },
    });
    expect(hardship.stats.money).toBe(5);
    expect(hardship.stats.mentality).toBe(2);
    expect(hardship.stats.constitution).toBe(2);

    const middle = initPlayer({
      name: 'MiddleMoney',
      traitIds: ['middle-class-family', 'aim-god', 'tactical-mind'],
      backgroundId: '',
      stats: {
        agility: 5,
        intelligence: 10,
        mentality: 0,
        constitution: 0,
        experience: 0,
        money: 0,
      },
    });
    expect(middle.stats.money).toBe(50);
    expect(middle.tags).toContain('opening-mental-scar');
    expect(middle.tags).toContain('opening-physical-debt');

    const upper = initPlayer({
      name: 'UpperMoney',
      traitIds: ['upper-class-family', 'aim-god', 'tactical-mind'],
      backgroundId: '',
      stats: {
        agility: 5,
        intelligence: 10,
        mentality: 0,
        constitution: 0,
        experience: 0,
        money: 0,
      },
    });
    expect(upper.stats.money).toBe(100);
    expect(upper.tags).toContain('opening-mental-scar');
    expect(upper.tags).toContain('opening-physical-debt');
  });

  it('rejects mutually exclusive family economy traits', () => {
    expect(() => initPlayer({
      name: 'ConflictMoney',
      traitIds: ['hardship-kid', 'middle-class-family', 'aim-god'],
      backgroundId: '',
    })).toThrow('特质冲突');
  });

  it('rejects rich family traits with scene kid but allows hardship with scene kid', () => {
    expect(() => initPlayer({
      name: 'SceneConflict',
      traitIds: ['scene-kid', 'middle-class-family', 'aim-god'],
      backgroundId: '',
    })).toThrow('特质冲突');

    const allowed = initPlayer({
      name: 'SceneHardship',
      traitIds: ['scene-kid', 'hardship-kid', 'aim-god'],
      backgroundId: '',
    });

    expect(allowed.stats.money).toBe(5);
  });

  it('keeps random trait rolls conflict-free', () => {
    for (let i = 0; i < 100; i++) {
      const traits = rollRandomTraits(3);
      expect(traits).toHaveLength(3);
      expect(() => initPlayer({
        name: `Roll-${i}`,
        traitIds: traits.map((trait) => trait.id),
        backgroundId: '',
      })).not.toThrow();
    }
  });
});
