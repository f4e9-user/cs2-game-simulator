import { describe, expect, it } from 'vitest';
import { PASSIVE_EFFECT_LABELS, formatTag } from '../../../frontend/src/lib/format';

describe('frontend status labels', () => {
  it('renders stress collapse and career experience ids as Chinese labels', () => {
    expect(formatTag('breaking-down')).toBe('压力崩溃');
    expect(PASSIVE_EFFECT_LABELS['career-time-experience']).toBe('生涯经验自然积累');
  });
});
