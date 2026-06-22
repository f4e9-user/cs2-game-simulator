import { describe, expect, it } from 'vitest';
import { TRAITS } from '../data/traits.js';
import { PASSIVE_EFFECT_LABELS, formatTag } from '../../../frontend/src/lib/format';

describe('frontend status labels', () => {
  it('renders stress collapse and career experience ids as Chinese labels', () => {
    expect(formatTag('breaking-down')).toBe('压力崩溃');
    expect(PASSIVE_EFFECT_LABELS['career-time-experience']).toBe('生涯经验自然积累');
  });

  it('renders every trait tag through an explicit Chinese label', () => {
    const traitTags = [...new Set(TRAITS.flatMap((trait) => trait.tags))];

    for (const tag of traitTags) {
      expect(formatTag(tag), tag).not.toBe(tag);
    }
  });

  it('renders unstable and athletic trait tags in Chinese', () => {
    expect(formatTag('inconsistent')).toBe('发挥不稳定');
    expect(formatTag('athletic')).toBe('运动底子');
  });
});
