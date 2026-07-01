import { describe, expect, it } from 'vitest';
import { pickEvent } from '../events.js';
import { applyChoice, createSession, initPlayer } from '../gameEngine.js';

function session(rebuildPressure = 80, clubId = 'club-meteor-prime') {
  const player = initPlayer({
    name: 'RebuildTester',
    traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
    backgroundId: '',
  });
  return createSession({
    ...player,
    stage: 'pro',
    round: 60,
    teamTrust: 45,
    team: {
      clubId,
      name: 'Meteor Prime',
      tag: 'MTP',
      region: '欧洲',
      tier: 'top',
      monthlySalary: 100,
      joinedRound: 1,
      rebuildPressure,
    },
  }, 1);
}

describe('rebuild chain', () => {
  it('injects management pressure when rebuild pressure is active', () => {
    const event = pickEvent({
      player: session(85).player,
      recentEventIds: [],
      rng: () => 0.99,
    });

    expect(event?.id).toBe('chain-rebuild-pressure');
  });

  it('uses a lower rebuild trigger threshold for capital projects only', () => {
    const capitalEvent = pickEvent({
      player: session(70, 'club-meteor-prime').player,
      recentEventIds: [],
      rng: () => 0.99,
    });
    const legacyEvent = pickEvent({
      player: session(70, 'club-apex-gaming').player,
      recentEventIds: [],
      rng: () => 0.99,
    });

    expect(capitalEvent?.id).toBe('chain-rebuild-pressure');
    expect(legacyEvent?.id).not.toBe('chain-rebuild-pressure');
  });

  it('advances through pressure, rumor, contest, then decision without skipping steps', () => {
    const base = session(85).player;
    const pressure = pickEvent({
      player: base,
      recentEventIds: [],
      rng: () => 0.99,
    });
    expect(pressure?.id).toBe('chain-rebuild-pressure');

    const afterPressure = {
      ...base,
      tags: ['rebuild-chain-active', 'rebuild-rumor-step'],
    };
    const rumor = pickEvent({
      player: afterPressure,
      recentEventIds: ['chain-rebuild-pressure'],
      rng: () => 0.99,
    });
    expect(rumor?.id).toBe('chain-rebuild-rumor');

    const afterRumor = {
      ...base,
      tags: ['rebuild-chain-active', 'rebuild-contest-step'],
    };
    const contest = pickEvent({
      player: afterRumor,
      recentEventIds: ['chain-rebuild-pressure', 'chain-rebuild-rumor'],
      rng: () => 0.99,
    });
    expect(contest?.id).toBe('chain-rebuild-contest');

    const afterContest = {
      ...base,
      tags: ['rebuild-chain-active', 'rebuild-decision-step'],
    };
    const decision = pickEvent({
      player: afterContest,
      recentEventIds: ['chain-rebuild-rumor', 'chain-rebuild-contest'],
      rng: () => 0.99,
    });
    expect(decision?.id).toBe('chain-rebuild-decision');
  });

  it('settles a rebuild decision into player-core status and resets pressure', () => {
    const s = {
      ...session(85),
      phase: 'event' as const,
      currentEvent: {
        id: 'chain-rebuild-decision',
        type: 'chains' as const,
        title: '重建决定',
        narrative: '',
        choices: [{
          id: 'prove-core',
          label: '要求围绕自己重建',
          description: '',
          disabled: false,
        }],
        importance: 'critical' as const,
      },
    };

    const result = applyChoice(s, 'prove-core');

    expect(result.session.player.team?.coreStatus).toBe('player-core');
    expect(result.session.player.team?.rebuildPressure).toBe(0);
    expect(result.session.player.teamTrust).toBeGreaterThan(45);
  });

  it('applies rotation-risk side effects after a failed rebuild decision', () => {
    const base = session(85);
    const s = {
      ...base,
      phase: 'event' as const,
      player: {
        ...base.player,
        activeRole: 'Entry' as const,
        activeRoleRounds: 20,
      },
      currentEvent: {
        id: 'chain-rebuild-decision',
        type: 'chains' as const,
        title: '重建决定',
        narrative: '',
        choices: [{
          id: 'prove-core',
          label: '要求围绕自己重建',
          description: '',
          disabled: false,
        }],
        importance: 'critical' as const,
      },
    };

    const result = applyChoice(s, 'prove-core', -100);

    expect(result.session.player.team?.coreStatus).toBe('rotation-risk');
    expect(result.session.player.team?.monthlySalary).toBeLessThan(100);
    expect(result.session.player.team?.teamStatus).toBe('rotation');
    expect(result.session.player.activeRole).toBe('Entry');
    expect(result.session.player.activeRoleRounds).toBeLessThanOrEqual(18);
  });
});
