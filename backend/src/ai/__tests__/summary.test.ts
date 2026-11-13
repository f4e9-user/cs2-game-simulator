import { describe, expect, it } from 'vitest';
import { initPlayer } from '../../engine/player.js';
import type { Env, RoundResult } from '../../types.js';
import { makeAiService } from '../service.js';
import { buildSummaryPrompt } from '../prompts.js';
import { ENDING_LABELS } from '../../../../frontend/src/lib/format';

const narrator = makeAiService({ AI_PROVIDER: 'none' } as Env);

function player() {
  return initPlayer({ name: '总结测试', traitIds: ['aim-god', 'tactical-mind', 'ice-cold'], backgroundId: '' });
}

function result(overrides: Partial<RoundResult>): RoundResult {
  return { eventType: 'daily', success: true, round: 1, fameChange: 0, ...overrides } as RoundResult;
}

describe('career summary facts', () => {
  it('uses elapsed rounds rather than the number of events and does not invent a match win rate', async () => {
    const subject = { ...player(), round: 2 };
    const history = [result({}), result({ success: false }), result({ round: 2 })];
    const summary = await narrator.summarize(subject, history, 'voluntary_retirement');

    expect(summary).toContain('完成了 2 回合生涯');
    expect(summary).toContain('事件成功率 67%');
    expect(summary).toContain('暂无已完成的比赛');
    expect(summary).not.toContain('胜率');
    expect(summary).toContain(ENDING_LABELS.voluntary_retirement);
    expect(summary).not.toContain('voluntary_retirement');
    const prompt = buildSummaryPrompt(subject, history, 'voluntary_retirement');
    expect(prompt).toContain('总回合数：2');
    expect(prompt).toContain('事件成功率：67%');
    expect(prompt).toContain('暂无已完成的比赛');
    expect(prompt).not.toContain('总回合数：3');
  });

  it('counts complete series once and excludes individual maps and breaks from match results', async () => {
    const history = [
      result({}),
      result({ eventType: 'match', seriesStepKind: 'map', success: true }),
      result({ eventType: 'match', seriesStepKind: 'break', success: true }),
      result({ eventType: 'match', seriesStepKind: 'map', success: true }),
      result({ eventType: 'match', seriesStepKind: 'final', success: true }),
      result({ eventType: 'match', success: false, round: 2 }),
    ];
    const summary = await narrator.summarize({ ...player(), round: 2 }, history, 'quiet_exit');
    expect(summary).toContain('事件成功率 100%');
    expect(summary).toContain('比赛 1 胜 1 负，胜率 50%');
    const prompt = buildSummaryPrompt(player(), history, 'quiet_exit');
    expect(prompt).toContain('比赛（完整场次/系列赛）：1 胜 1 负，胜率 50%');
  });

  it('handles retirement before any event without undefined rates or internal ending codes', async () => {
    const summary = await narrator.summarize(player(), [], 'unrecognized_ending');
    expect(summary).toContain('完成了 0 回合生涯');
    expect(summary).toContain('尚无事件记录');
    expect(summary).not.toMatch(/NaN|undefined|unrecognized_ending/);
    expect(buildSummaryPrompt(player(), [], 'unrecognized_ending')).not.toContain('unrecognized_ending');
  });

  it('distinguishes voluntary retirement, generic early endings and explicit causes in Chinese', async () => {
    expect(ENDING_LABELS.voluntary_retirement).toBe('主动结束职业生涯');
    expect(ENDING_LABELS.career_ended).toBe('职业生涯提前结束');
    for (const ending of ['voluntary_retirement', 'career_ended', 'family_crisis_career_ended', 'banned_for_cheating']) {
      const summary = await narrator.summarize(player(), [], ending);
      expect(summary).toContain(ENDING_LABELS[ending]);
      expect(summary).not.toContain(ending);
      expect(buildSummaryPrompt(player(), [], ending)).toContain(ENDING_LABELS[ending]);
    }
  });
});
