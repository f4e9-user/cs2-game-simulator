import { describe, expect, it } from 'vitest';
import {
  AI_EVENT_PICK_COOLDOWN,
  buildAiPickCandidates,
  makeCachedAiEvent,
  markAiEventActive,
  mergeGeneratedAiEvents,
  parseAiEventCache,
  recordAiEventUsed,
  releaseActiveAiEvent,
  resolveAiEventById,
} from '../eventCache.js';
import { initPlayer } from '../../engine/gameEngine.js';
import type { EventDef, PlayerTeam } from '../../types.js';

function aiEvent(id = 'ai-team-room', type: EventDef['type'] = 'team'): EventDef {
  return {
    id,
    type,
    title: '训练室里的话',
    narrative: '队友在训练室里提到最近的配合问题，等着你表态。',
    stages: ['rookie', 'youth', 'second', 'pro'],
    difficulty: 1,
    choices: [
      {
        id: 'talk',
        label: '聊聊',
        description: '你把问题摊开聊。',
        check: { primary: 'mentality', dc: 6 },
        success: { narrative: '沟通变得顺畅了一些。' },
        failure: { narrative: '气氛还是有点僵。' },
      },
      {
        id: 'train',
        label: '加练',
        description: '你用训练来代替争论。',
        check: { primary: 'agility', dc: 6 },
        success: { narrative: '训练质量不错。' },
        failure: { narrative: '大家都有些疲惫。', stateDelta: { fatigue: 5 } },
      },
    ],
  };
}

function team(clubId: string): PlayerTeam {
  return {
    clubId,
    name: clubId,
    tag: clubId,
    region: 'CN',
    tier: 'youth',
    monthlySalary: 1,
    joinedRound: 1,
  };
}

function playerWithTeam(clubId: string) {
  const player = initPlayer({
    name: 'TestPlayer',
    traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
    backgroundId: '',
  });
  player.stage = 'youth';
  player.team = team(clubId);
  player.teamTrust = 35;
  return player;
}

describe('AI event cache', () => {
  it('migrates legacy EventDef arrays into cache entries', () => {
    const player = playerWithTeam('cya');
    const event = aiEvent();
    const parsed = parseAiEventCache(JSON.stringify([event]), player, []);

    expect(parsed.migrated).toBe(true);
    expect(parsed.cache.entries).toHaveLength(1);
    expect(parsed.cache.entries[0]?.event.id).toBe(event.id);
    expect(parsed.cache.entries[0]?.meta.generatedFor.teamClubId).toBe('cya');
  });

  it('keeps an active event resolvable while excluding it from candidates', () => {
    const player = playerWithTeam('cya');
    const event = aiEvent();
    const cache = markAiEventActive({
      version: 2,
      active: null,
      entries: [makeCachedAiEvent(event, player, [])],
    }, event);

    expect(resolveAiEventById(cache, event.id)).toBe(event);
    expect(cache.entries.map((entry) => entry.event.id)).not.toContain(event.id);
    expect(buildAiPickCandidates(cache, player, [])).toHaveLength(0);
  });

  it('records use, releases cooled events, and blocks cooldown candidates', () => {
    const player = playerWithTeam('cya');
    player.round = 10;
    const event = aiEvent();
    const activeCache = markAiEventActive({
      version: 2,
      active: null,
      entries: [makeCachedAiEvent(event, player, [])],
    }, event);

    const used = recordAiEventUsed(activeCache, event.id, player.round);
    const released = releaseActiveAiEvent(used, player);
    expect(released.entries[0]?.meta.usedCount).toBe(1);
    expect(buildAiPickCandidates(released, player, [])).toHaveLength(0);

    player.round += AI_EVENT_PICK_COOLDOWN;
    expect(buildAiPickCandidates(released, player, [])).toHaveLength(1);
  });

  it('keeps a max-use active event resolvable after release but out of candidates', () => {
    const player = playerWithTeam('cya');
    player.round = 10;
    const event = aiEvent();
    const activeCache = markAiEventActive({
      version: 2,
      active: null,
      entries: [makeCachedAiEvent(event, player, [])],
    }, event);
    const firstUse = recordAiEventUsed(activeCache, event.id, player.round - AI_EVENT_PICK_COOLDOWN);
    const secondUse = recordAiEventUsed(firstUse, event.id, player.round);

    const released = releaseActiveAiEvent(secondUse, player);

    expect(resolveAiEventById(released, event.id)).toBe(event);
    expect(buildAiPickCandidates(released, player, [])).toHaveLength(0);
  });

  it('filters cached team events after the player changes club', () => {
    const player = playerWithTeam('cya');
    const event = aiEvent();
    const cache = mergeGeneratedAiEvents({ version: 2, active: null, entries: [] }, [event], player, []);

    player.team = team('iron-wolf');
    expect(buildAiPickCandidates(cache, player, [])).toHaveLength(0);
  });
});
