import { describe, expect, it } from 'vitest';
import { applyChoice, createSession, initPlayer } from '../gameEngine.js';
import { toPublicEvent } from '../events.js';
import { makeCachedAiEvent, markAiEventActive } from '../../ai/eventCache.js';
import type { EventDef } from '../../types.js';

function aiEvent(): EventDef {
  return {
    id: 'ai-rival-shadow',
    type: 'rival',
    title: '暗处的对手',
    narrative: '你听见有人在背后研究你的 demo，语气里带着不服气。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    choices: [
      {
        id: 'review',
        label: '反看录像',
        description: '你重新打开自己的 demo，寻找对方可能盯上的习惯。',
        check: { primary: 'intelligence', dc: 6 },
        success: { narrative: '你提前发现了自己的固定习惯，准备做一次改变。' },
        failure: { narrative: '你看了半天，反而越来越怀疑自己的判断。', stateDelta: { stress: 1 } },
      },
      {
        id: 'ignore',
        label: '继续训练',
        description: '你决定先把注意力放回枪法。',
        check: { primary: 'agility', dc: 6 },
        success: { narrative: '你把杂音压下去，手感慢慢热了起来。', stateDelta: { feel: 1 } },
        failure: { narrative: '你越想不在意，越容易被细节干扰。', stateDelta: { tilt: 1 } },
      },
    ],
  };
}

describe('AI events in game engine', () => {
  it('resolves the current AI event from the provided AI event cache', () => {
    const player = initPlayer({
      name: 'TestPlayer',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    const event = aiEvent();
    const session = createSession(player, 1);
    session.currentEvent = toPublicEvent(event, player.rivals, player.roster ?? []);

    const resolved = applyChoice(session, 'review', 0, [event]);
    expect(resolved.result.eventId).toBe('ai-rival-shadow');
  });

  it('falls back when the current AI event definition is missing from the AI event cache', () => {
    const player = initPlayer({
      name: 'TestPlayer',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    const event = aiEvent();
    const session = createSession(player, 1);
    session.currentEvent = toPublicEvent(event, player.rivals, player.roster ?? []);

    const resolved = applyChoice(session, 'review', 0, []);
    expect(resolved.result.eventId).toBe('ai-rival-shadow');
  });

  it('resolves the current AI event from the active cache envelope', () => {
    const player = initPlayer({
      name: 'TestPlayer',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    const event = aiEvent();
    const session = createSession(player, 1);
    session.currentEvent = toPublicEvent(event, player.rivals, player.roster ?? []);
    const cache = markAiEventActive({
      version: 2,
      active: null,
      entries: [makeCachedAiEvent(event, player, [])],
    }, event);

    const resolved = applyChoice(session, 'review', 0, [], cache);
    expect(resolved.result.eventId).toBe('ai-rival-shadow');
  });

  it('falls back to a generic ai event when the cache entry is missing for an old save', () => {
    const player = initPlayer({
      name: 'TestPlayer',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    const session = createSession(player, 1);
    session.currentEvent = {
      id: 'ai-relax-invite',
      type: 'life',
      title: '临时邀请',
      narrative: '旧存档里的 AI 事件定义已经丢失。',
      choices: [
        { id: 'continue', label: '继续', description: '继续处理' },
      ],
    };

    const resolved = applyChoice(session, 'continue', 0, []);
    expect(resolved.result.eventId).toBe('ai-relax-invite');
  });
});
