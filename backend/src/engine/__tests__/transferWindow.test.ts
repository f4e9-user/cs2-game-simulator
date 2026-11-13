import { describe, expect, it } from 'vitest';
import { applyChoice, createSession, endActionPhase, initPlayer } from '../gameEngine.js';
import { pickEvent } from '../events.js';
import { runTransferWindow } from '../transferWindow.js';
import type { ClubRuntimeState, GameSession, WorldPlayer } from '../../types.js';

function worldPlayer(
  clubId: string,
  id: string,
  overrides: Partial<WorldPlayer> = {},
): WorldPlayer {
  return {
    id,
    name: id,
    region: '欧洲',
    age: 24,
    clubId,
    role: 'AWPer',
    status: 'starter',
    archetype: 'star-awper',
    stats: {
      agility: 82,
      constitution: 70,
      intelligence: 72,
      mentality: 75,
      experience: 65,
    },
    form: 8,
    reputation: 82,
    traits: ['star'],
    personality: 'supportive',
    joinedRound: 1,
    internalChemistry: 55,
    ...overrides,
  };
}

function runtime(clubId: string, players: WorldPlayer[], overrides: Partial<ClubRuntimeState> = {}): ClubRuntimeState {
  return {
    clubId,
    tier: 'top',
    baselineVrsScore: 1500,
    fullRoster: players,
    clubTrust: 55,
    currentForm: 45,
    rosterStability: 60,
    internalChemistry: 55,
    seasonPoints: 0,
    vrsScore: 1500,
    qualificationState: { eligibleTiers: ['s-class', 'major'], openQualifierTickets: [] },
    activeStorylines: [],
    recentResults: [],
    pendingStoryFlags: [],
    updatedRound: 96,
    ...overrides,
  };
}

function session(): GameSession {
  const player = initPlayer({
    name: 'TransferTester',
    traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
    backgroundId: '',
  });
  const sellerId = 'club-starforge';
  const buyerId = 'club-meteor-prime';
  const star = worldPlayer(sellerId, `${sellerId}:star-awper`);
  const sellerRoster = [
    star,
    worldPlayer(sellerId, `${sellerId}:igl`, { role: 'IGL', archetype: 'system-igl', reputation: 62 }),
    worldPlayer(sellerId, `${sellerId}:entry`, { role: 'Entry', archetype: 'entry-fragger', reputation: 58 }),
    worldPlayer(sellerId, `${sellerId}:support`, { role: 'Support', archetype: 'role-player', reputation: 52 }),
    worldPlayer(sellerId, `${sellerId}:lurker`, { role: 'Lurker', archetype: 'rookie-prospect', reputation: 50 }),
  ];
  const buyerRoster = [
    worldPlayer(buyerId, `${buyerId}:igl`, { role: 'IGL', archetype: 'system-igl', reputation: 64 }),
    worldPlayer(buyerId, `${buyerId}:entry`, { role: 'Entry', archetype: 'entry-fragger', reputation: 60 }),
    worldPlayer(buyerId, `${buyerId}:support`, { role: 'Support', archetype: 'role-player', reputation: 57 }),
    worldPlayer(buyerId, `${buyerId}:lurker`, { role: 'Lurker', archetype: 'role-player', reputation: 55 }),
  ];

  return {
    id: 'transfer-window-test',
    apiToken: 'test',
    player: { ...player, round: 96, year: 2, week: 1 },
    phase: 'action',
    currentEvent: null,
    history: [],
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    leaderboard: [],
    worldClubsVersion: 2,
    worldClubs: {
      season: 2,
      activeClubIds: [buyerId, sellerId],
      relevantClubIds: [],
      staticClubIds: ['club-riverline'],
      runtimeByClubId: {
        [buyerId]: runtime(buyerId, buyerRoster, { rebuildPressure: 86, currentForm: 38 }),
        [sellerId]: runtime(sellerId, sellerRoster, {
          rebuildPressure: 78,
          currentForm: 28,
          seasonGoal: {
            id: 'failed-goal',
            type: 'major-qualification',
            label: 'Major qualification',
            season: 2,
            status: 'failed',
            progress: 0.2,
            baseline: {
              tierParticipations: {},
              tierChampionships: {},
              vrsScore: 1400,
              startYear: 2,
            },
          },
        }),
      },
      processedTickKeysByClubId: {},
    },
  };
}

describe('transfer window', () => {
  it('moves a high-reputation player into a rebuild-pressure capital club and keeps rosters consistent', () => {
    const result = runTransferWindow(session(), 2);

    const record = result.transferHistory?.[0];
    expect(record).toMatchObject({
      type: 'star-signing',
      fromClubId: 'club-starforge',
      toClubId: 'club-meteor-prime',
      playerId: 'club-starforge:star-awper',
    });

    const buyer = result.worldClubs?.runtimeByClubId['club-meteor-prime'];
    const seller = result.worldClubs?.runtimeByClubId['club-starforge'];
    expect(buyer?.fullRoster.some((p) => p.id === record?.playerId && p.clubId === buyer.clubId)).toBe(true);
    expect(seller?.fullRoster.some((p) => p.id === record?.playerId)).toBe(false);
    expect(buyer?.playerIds).toEqual(buyer?.fullRoster.map((p) => p.id));
    expect(seller?.playerIds).toEqual(seller?.fullRoster.map((p) => p.id));
    expect(buyer?.fullRoster).toHaveLength(5);
    expect(seller?.fullRoster).toHaveLength(5);
    expect(result.transferRumors?.some((rumor) => rumor.resolved && rumor.playerId === record?.playerId)).toBe(true);
    expect(result.weeklyNews?.some((item) => item.source?.kind === 'world-transfer')).toBe(true);
  });

  it('records a benching when a full buyer roster signs a new starter', () => {
    const s = session();
    const buyerId = 'club-meteor-prime';
    const benchedId = `${buyerId}:fifth`;
    s.worldClubs = {
      ...s.worldClubs!,
      runtimeByClubId: {
        ...s.worldClubs!.runtimeByClubId,
        [buyerId]: runtime(buyerId, [
          worldPlayer(buyerId, `${buyerId}:igl`, { role: 'IGL', archetype: 'system-igl', reputation: 64 }),
          worldPlayer(buyerId, `${buyerId}:entry`, { role: 'Entry', archetype: 'entry-fragger', reputation: 60 }),
          worldPlayer(buyerId, `${buyerId}:support`, { role: 'Support', archetype: 'role-player', reputation: 57 }),
          worldPlayer(buyerId, `${buyerId}:lurker`, { role: 'Lurker', archetype: 'role-player', reputation: 55 }),
          worldPlayer(buyerId, benchedId, { role: 'Support', archetype: 'role-player', reputation: 45 }),
        ], { rebuildPressure: 86, currentForm: 38 }),
      },
    };

    const result = runTransferWindow(s, 2);

    expect(result.transferHistory?.some((record) =>
      record.type === 'benching' &&
      record.playerId === benchedId &&
      record.fromClubId === buyerId &&
      record.toClubId === buyerId
    )).toBe(true);
    expect(result.worldClubs?.runtimeByClubId[buyerId]?.fullRoster.some((player) => player.id === benchedId)).toBe(false);
  });

  it('is deterministic for the same session and season', () => {
    const first = runTransferWindow(session(), 2);
    const second = runTransferWindow(session(), 2);

    expect(second.transferHistory).toEqual(first.transferHistory);
    expect(second.transferRumors).toEqual(first.transferRumors);
  });

  it('does not directly remove players from the player team during the background window', () => {
    const s = session();
    const playerTeamId = 'club-starforge';
    const transferTargetId = `${playerTeamId}:star-awper`;
    s.player = {
      ...s.player,
      team: {
        clubId: playerTeamId,
        name: '星锻战队',
        tag: 'SFG',
        region: '欧洲',
        tier: 'pro',
        monthlySalary: 64,
        joinedRound: 1,
      },
      roster: [{
        id: transferTargetId,
        name: 'Star AWPer',
        role: 'AWPer',
        personality: 'star',
        traits: ['star'],
        stats: { agility: 80, intelligence: 70, mentality: 72, experience: 64 },
        growthSpent: 0,
        chemistry: 50,
      }],
    };
    s.worldClubs = {
      ...s.worldClubs!,
      activeClubIds: ['club-meteor-prime', playerTeamId],
    };

    const result = runTransferWindow(s, 2);
    const playerTeam = result.worldClubs?.runtimeByClubId[playerTeamId];

    expect(result.transferHistory?.some((record) => record.fromClubId === playerTeamId)).not.toBe(true);
    expect(playerTeam?.fullRoster.some((p) => p.id === transferTargetId)).toBe(true);
    expect(result.transferRumors?.some((rumor) =>
      rumor.fromClubId === playerTeamId &&
      rumor.playerId === transferTargetId &&
      !rumor.resolved
    )).toBe(true);
    expect(playerTeam?.pendingStoryFlags).toContain('teammate-poach-pending');
    expect(result.player.pendingDeparture).toMatchObject({
      slotId: transferTargetId,
      rumorShown: false,
      revealed: false,
      destTeamName: '流星主队',
    });
    expect(result.player.pendingDeparture?.departureRound).toBeLessThanOrEqual(result.player.round + 7);
  });

  it('does not directly add a signing to the player team during the background window', () => {
    const s = session();
    const playerTeamId = 'club-meteor-prime';
    s.player = {
      ...s.player,
      team: {
        clubId: playerTeamId,
        name: '流星主队',
        tag: 'MTP',
        region: '北美',
        tier: 'top',
        monthlySalary: 100,
        joinedRound: 1,
      },
    };
    const beforeRoster = s.worldClubs!.runtimeByClubId[playerTeamId]!.fullRoster.map((p) => p.id);

    const result = runTransferWindow(s, 2);
    const playerTeam = result.worldClubs?.runtimeByClubId[playerTeamId];

    expect(result.transferHistory?.some((record) => record.toClubId === playerTeamId)).not.toBe(true);
    expect(playerTeam?.fullRoster.map((p) => p.id)).toEqual(beforeRoster);
    expect(result.transferRumors?.some((rumor) =>
      rumor.toClubId === playerTeamId &&
      !rumor.resolved &&
      rumor.reason.includes('新援')
    )).toBe(true);
    expect(playerTeam?.pendingStoryFlags).toContain('incoming-signing-pending');
  });

  it('surfaces incoming signing competition as an event for the player team', () => {
    const s = session();
    const playerTeamId = 'club-starforge';
    s.player = {
      ...s.player,
      stage: 'pro',
      team: {
        clubId: playerTeamId,
        name: '星锻战队',
        tag: 'STF',
        region: '欧洲',
        tier: 'top',
        monthlySalary: 120,
        joinedRound: 1,
      },
    };
    s.worldClubs = {
      ...s.worldClubs!,
      staticClubIds: [],
      runtimeByClubId: {
        ...s.worldClubs!.runtimeByClubId,
        [playerTeamId]: runtime(playerTeamId, [
          worldPlayer(playerTeamId, `${playerTeamId}:igl`, { role: 'IGL' }),
          worldPlayer(playerTeamId, `${playerTeamId}:entry`, { role: 'Entry' }),
        ], { pendingStoryFlags: ['incoming-signing-pending'] }),
      },
    };

    const event = pickEvent({
      player: s.player,
      session: s,
      recentEventIds: [],
      rng: () => 0.99,
    });

    expect(event?.id).toBe('chain-incoming-signing-contest');

    const resolved = applyChoice({
      ...s,
      phase: 'event',
      currentEvent: {
        id: 'chain-incoming-signing-contest',
        type: 'team',
        title: '新援竞争传闻',
        narrative: '',
        choices: [{
          id: 'prove-role-value',
          label: '证明自己的位置价值',
          description: '',
        }],
      },
    }, 'prove-role-value', 99);

    expect(
      resolved.session.worldClubs?.runtimeByClubId[playerTeamId]?.pendingStoryFlags
    ).not.toContain('incoming-signing-pending');
  });

  it('surfaces incoming signing competition through the normal weekly event picker', () => {
    const s = session();
    const playerTeamId = 'club-starforge';
    s.player = {
      ...s.player,
      stage: 'pro',
      round: 100,
      year: 2,
      week: 5,
      actionPoints: 100,
      team: {
        clubId: playerTeamId,
        name: '星锻战队',
        tag: 'STF',
        region: '欧洲',
        tier: 'top',
        monthlySalary: 120,
        joinedRound: 1,
      },
    };
    s.worldClubs = {
      ...s.worldClubs!,
      staticClubIds: [],
      runtimeByClubId: {
        ...s.worldClubs!.runtimeByClubId,
        [playerTeamId]: runtime(playerTeamId, [
          worldPlayer(playerTeamId, `${playerTeamId}:igl`, { role: 'IGL' }),
          worldPlayer(playerTeamId, `${playerTeamId}:entry`, { role: 'Entry' }),
        ], { pendingStoryFlags: ['incoming-signing-pending'] }),
      },
    };

    const result = endActionPhase(s);

    expect(result.pickedEvent?.id).toBe('chain-incoming-signing-contest');
    expect(result.session.currentEvent?.id).toBe('chain-incoming-signing-contest');
  });

  it('finalizes a pending incoming signing through the competition event', () => {
    const s = session();
    const playerTeamId = 'club-meteor-prime';
    s.player = {
      ...s.player,
      stage: 'pro',
      team: {
        clubId: playerTeamId,
        name: '流星主队',
        tag: 'MTP',
        region: '北美',
        tier: 'top',
        monthlySalary: 120,
        joinedRound: 1,
      },
    };

    const windowResult = runTransferWindow(s, 2);
    const pendingRumor = windowResult.transferRumors?.find((rumor) =>
      rumor.toClubId === playerTeamId &&
      !rumor.resolved &&
      rumor.reason.includes('新援')
    );
    if (!pendingRumor) throw new Error('missing incoming signing rumor');

    const resolved = applyChoice({
      ...windowResult,
      worldClubs: windowResult.worldClubs
        ? { ...windowResult.worldClubs, staticClubIds: [] }
        : windowResult.worldClubs,
      phase: 'event',
      currentEvent: {
        id: 'chain-incoming-signing-contest',
        type: 'team',
        title: '新援竞争传闻',
        narrative: '',
        choices: [{
          id: 'prove-role-value',
          label: '证明自己的位置价值',
          description: '',
        }],
      },
    }, 'prove-role-value', 99);

    const playerRuntime = resolved.session.worldClubs?.runtimeByClubId[playerTeamId];
    const sellerRuntime = resolved.session.worldClubs?.runtimeByClubId[pendingRumor.fromClubId];

    expect(playerRuntime?.pendingStoryFlags).not.toContain('incoming-signing-pending');
    expect(playerRuntime?.fullRoster.some((player) =>
      player.id === pendingRumor.playerId &&
      player.clubId === playerTeamId
    )).toBe(true);
    expect(sellerRuntime?.fullRoster.some((player) => player.id === pendingRumor.playerId)).toBe(false);
    expect(resolved.session.transferHistory?.some((record) =>
      record.playerId === pendingRumor.playerId &&
      record.fromClubId === pendingRumor.fromClubId &&
      record.toClubId === playerTeamId
    )).toBe(true);
    expect(resolved.session.transferRumors?.find((rumor) => rumor.id === pendingRumor.id)?.resolved).toBe(true);
    expect(resolved.session.weeklyNews?.some((item) => item.source?.kind === 'world-transfer')).toBe(true);
  });

  it('regional-pride buyers prefer same-region players when fixing a role', () => {
    const buyerId = 'club-iron-wolves';
    const sameRegionSellerId = 'club-starforge';
    const foreignSellerId = 'club-meteor-prime';
    const s = session();
    s.worldClubs = {
      season: 2,
      activeClubIds: [buyerId, sameRegionSellerId, foreignSellerId],
      relevantClubIds: [],
      staticClubIds: [],
      runtimeByClubId: {
        [buyerId]: runtime(buyerId, [
          worldPlayer(buyerId, `${buyerId}:igl`, { role: 'IGL', reputation: 55 }),
          worldPlayer(buyerId, `${buyerId}:entry`, { role: 'Entry', reputation: 55 }),
          worldPlayer(buyerId, `${buyerId}:support`, { role: 'Support', reputation: 55 }),
          worldPlayer(buyerId, `${buyerId}:lurker`, { role: 'Lurker', reputation: 55 }),
        ], { rebuildPressure: 100, currentForm: -30 }),
        [sameRegionSellerId]: runtime(sameRegionSellerId, [
          worldPlayer(sameRegionSellerId, `${sameRegionSellerId}:regional-awper`, {
            role: 'AWPer',
            region: '欧洲',
            reputation: 84,
          }),
          worldPlayer(sameRegionSellerId, `${sameRegionSellerId}:igl`, { role: 'IGL', reputation: 52 }),
          worldPlayer(sameRegionSellerId, `${sameRegionSellerId}:entry`, { role: 'Entry', reputation: 52 }),
          worldPlayer(sameRegionSellerId, `${sameRegionSellerId}:support`, { role: 'Support', reputation: 52 }),
          worldPlayer(sameRegionSellerId, `${sameRegionSellerId}:lurker`, { role: 'Lurker', reputation: 52 }),
        ], { currentForm: 100, rebuildPressure: 0 }),
        [foreignSellerId]: runtime(foreignSellerId, [
          worldPlayer(foreignSellerId, `${foreignSellerId}:foreign-awper`, {
            role: 'AWPer',
            region: '北美',
            reputation: 86,
          }),
          worldPlayer(foreignSellerId, `${foreignSellerId}:igl`, { role: 'IGL', reputation: 52 }),
          worldPlayer(foreignSellerId, `${foreignSellerId}:entry`, { role: 'Entry', reputation: 52 }),
          worldPlayer(foreignSellerId, `${foreignSellerId}:support`, { role: 'Support', reputation: 52 }),
          worldPlayer(foreignSellerId, `${foreignSellerId}:lurker`, { role: 'Lurker', reputation: 52 }),
        ], { currentForm: 100, rebuildPressure: 0 }),
      },
      processedTickKeysByClubId: {},
    };

    const result = runTransferWindow(s, 2);

    expect(result.transferHistory?.[0]).toMatchObject({
      toClubId: buyerId,
      playerId: `${sameRegionSellerId}:regional-awper`,
    });
  });

  it('development factories promote an internal prospect instead of buying from another club', () => {
    const buyerId = 'club-cyber-academy';
    const sellerId = 'club-starforge';
    const s = session();
    s.worldClubs = {
      season: 2,
      activeClubIds: [buyerId, sellerId],
      relevantClubIds: [],
      staticClubIds: [],
      runtimeByClubId: {
        [buyerId]: runtime(buyerId, [
          worldPlayer(buyerId, `${buyerId}:igl`, { role: 'IGL', reputation: 45 }),
          worldPlayer(buyerId, `${buyerId}:entry`, { role: 'Entry', reputation: 45 }),
          worldPlayer(buyerId, `${buyerId}:support`, { role: 'Support', reputation: 45 }),
          worldPlayer(buyerId, `${buyerId}:lurker`, { role: 'Lurker', reputation: 45 }),
        ], { rebuildPressure: 80, currentForm: -35 }),
        [sellerId]: runtime(sellerId, [
          worldPlayer(sellerId, `${sellerId}:awper`, { role: 'AWPer', reputation: 88 }),
          worldPlayer(sellerId, `${sellerId}:igl`, { role: 'IGL', reputation: 52 }),
          worldPlayer(sellerId, `${sellerId}:entry`, { role: 'Entry', reputation: 52 }),
          worldPlayer(sellerId, `${sellerId}:support`, { role: 'Support', reputation: 52 }),
          worldPlayer(sellerId, `${sellerId}:lurker`, { role: 'Lurker', reputation: 52 }),
        ], { currentForm: 20, rebuildPressure: 40 }),
      },
      processedTickKeysByClubId: {},
    };

    const result = runTransferWindow(s, 2);
    const record = result.transferHistory?.[0];
    const buyer = result.worldClubs?.runtimeByClubId[buyerId];

    expect(record).toMatchObject({
      type: 'prospect-promotion',
      fromClubId: buyerId,
      toClubId: buyerId,
    });
    expect(record?.playerId).toContain(`${buyerId}:transfer-prospect-2`);
    expect(buyer?.fullRoster.some((player) => player.id === record?.playerId && player.status === 'starter')).toBe(true);
    expect(result.worldClubs?.runtimeByClubId[sellerId]?.fullRoster.some((player) => player.id === `${sellerId}:awper`)).toBe(true);
  });

  it('legacy giants prefer experienced pressure-proof players over slightly higher reputation prospects', () => {
    const buyerId = 'club-sovereign';
    const veteranSellerId = 'club-starforge';
    const prospectSellerId = 'club-meteor-prime';
    const s = session();
    s.worldClubs = {
      season: 2,
      activeClubIds: [buyerId, veteranSellerId, prospectSellerId],
      relevantClubIds: [],
      staticClubIds: [],
      runtimeByClubId: {
        [buyerId]: runtime(buyerId, [
          worldPlayer(buyerId, `${buyerId}:igl`, { role: 'IGL', reputation: 60 }),
          worldPlayer(buyerId, `${buyerId}:entry`, { role: 'Entry', reputation: 60 }),
          worldPlayer(buyerId, `${buyerId}:support`, { role: 'Support', reputation: 60 }),
          worldPlayer(buyerId, `${buyerId}:lurker`, { role: 'Lurker', reputation: 60 }),
        ], { rebuildPressure: 95, currentForm: -30 }),
        [veteranSellerId]: runtime(veteranSellerId, [
          worldPlayer(veteranSellerId, `${veteranSellerId}:veteran-awper`, {
            role: 'AWPer',
            age: 28,
            reputation: 82,
            stats: { agility: 75, constitution: 70, intelligence: 78, mentality: 86, experience: 88 },
          }),
          worldPlayer(veteranSellerId, `${veteranSellerId}:entry`, { role: 'Entry', reputation: 52 }),
        ], { currentForm: 40, rebuildPressure: 60 }),
        [prospectSellerId]: runtime(prospectSellerId, [
          worldPlayer(prospectSellerId, `${prospectSellerId}:prospect-awper`, {
            role: 'AWPer',
            age: 20,
            reputation: 98,
            stats: { agility: 88, constitution: 78, intelligence: 58, mentality: 55, experience: 42 },
          }),
          worldPlayer(prospectSellerId, `${prospectSellerId}:entry`, { role: 'Entry', reputation: 52 }),
        ], { currentForm: 40, rebuildPressure: 60 }),
      },
      processedTickKeysByClubId: {},
    };

    const result = runTransferWindow(s, 2);

    expect(result.transferHistory?.[0]).toMatchObject({
      toClubId: buyerId,
      playerId: `${veteranSellerId}:veteran-awper`,
    });
  });

  it('fallen legacy clubs seek veteran revival cores during rebuild pressure', () => {
    const buyerId = 'club-northlight';
    const veteranSellerId = 'club-starforge';
    const prospectSellerId = 'club-meteor-prime';
    const s = session();
    s.worldClubs = {
      season: 2,
      activeClubIds: [buyerId, veteranSellerId, prospectSellerId],
      relevantClubIds: [],
      staticClubIds: [],
      runtimeByClubId: {
        [buyerId]: runtime(buyerId, [
          worldPlayer(buyerId, `${buyerId}:igl`, { role: 'IGL', reputation: 58 }),
          worldPlayer(buyerId, `${buyerId}:entry`, { role: 'Entry', reputation: 58 }),
          worldPlayer(buyerId, `${buyerId}:support`, { role: 'Support', reputation: 58 }),
          worldPlayer(buyerId, `${buyerId}:lurker`, { role: 'Lurker', reputation: 58 }),
        ], { rebuildPressure: 88, currentForm: -35 }),
        [veteranSellerId]: runtime(veteranSellerId, [
          worldPlayer(veteranSellerId, `${veteranSellerId}:revival-awper`, {
            role: 'AWPer',
            age: 31,
            reputation: 78,
            stats: { agility: 70, constitution: 66, intelligence: 82, mentality: 86, experience: 90 },
          }),
          worldPlayer(veteranSellerId, `${veteranSellerId}:entry`, { role: 'Entry', reputation: 52 }),
        ], { currentForm: 35, rebuildPressure: 60 }),
        [prospectSellerId]: runtime(prospectSellerId, [
          worldPlayer(prospectSellerId, `${prospectSellerId}:prospect-awper`, {
            role: 'AWPer',
            age: 19,
            reputation: 92,
            stats: { agility: 89, constitution: 78, intelligence: 55, mentality: 52, experience: 35 },
          }),
          worldPlayer(prospectSellerId, `${prospectSellerId}:entry`, { role: 'Entry', reputation: 52 }),
        ], { currentForm: 35, rebuildPressure: 60 }),
      },
      processedTickKeysByClubId: {},
    };

    const result = runTransferWindow(s, 2);

    expect(result.transferHistory?.[0]).toMatchObject({
      type: 'veteran-pickup',
      toClubId: buyerId,
      playerId: `${veteranSellerId}:revival-awper`,
    });
  });

  it('scrappy underdogs are more vulnerable to poaches from bigger clubs', () => {
    const buyerId = 'club-meteor-prime';
    const scrappySellerId = 'club-local-wolves';
    const stableSellerId = 'club-sovereign';
    const s = session();
    s.worldClubs = {
      season: 2,
      activeClubIds: [buyerId, scrappySellerId, stableSellerId],
      relevantClubIds: [],
      staticClubIds: [],
      runtimeByClubId: {
        [buyerId]: runtime(buyerId, [
          worldPlayer(buyerId, `${buyerId}:igl`, { role: 'IGL', reputation: 65 }),
          worldPlayer(buyerId, `${buyerId}:entry`, { role: 'Entry', reputation: 65 }),
          worldPlayer(buyerId, `${buyerId}:support`, { role: 'Support', reputation: 65 }),
          worldPlayer(buyerId, `${buyerId}:lurker`, { role: 'Lurker', reputation: 65 }),
        ], { rebuildPressure: 90, currentForm: -30 }),
        [scrappySellerId]: runtime(scrappySellerId, [
          worldPlayer(scrappySellerId, `${scrappySellerId}:scrappy-awper`, { role: 'AWPer', reputation: 76 }),
          worldPlayer(scrappySellerId, `${scrappySellerId}:entry`, { role: 'Entry', reputation: 52 }),
        ], { currentForm: 45, rebuildPressure: 20 }),
        [stableSellerId]: runtime(stableSellerId, [
          worldPlayer(stableSellerId, `${stableSellerId}:stable-awper`, { role: 'AWPer', reputation: 78 }),
          worldPlayer(stableSellerId, `${stableSellerId}:entry`, { role: 'Entry', reputation: 52 }),
        ], { currentForm: 45, rebuildPressure: 20 }),
      },
      processedTickKeysByClubId: {},
    };

    const result = runTransferWindow(s, 2);

    expect(result.transferHistory?.[0]).toMatchObject({
      toClubId: buyerId,
      playerId: `${scrappySellerId}:scrappy-awper`,
    });
  });

  it('syncs a completed teammate departure into world runtime, transfer history, and news', () => {
    const playerTeamId = 'club-starforge';
    const destinationId = 'club-meteor-prime';
    const departingId = `${playerTeamId}:star-awper`;
    const basePlayer = initPlayer({
      name: 'DepartureTester',
      traitIds: ['aim-god', 'tactical-mind', 'ice-cold'],
      backgroundId: '',
    });
    const s = createSession({
      ...basePlayer,
      stage: 'pro',
      round: 96,
      year: 2,
      week: 1,
      teamTrust: 60,
      team: {
        clubId: playerTeamId,
        name: '星锻战队',
        tag: 'SFG',
        region: '欧洲',
        tier: 'pro',
        monthlySalary: 64,
        joinedRound: 1,
      },
      roster: [{
        id: departingId,
        name: 'Star AWPer',
        role: 'AWPer',
        personality: 'star',
        traits: ['star'],
        stats: { agility: 80, intelligence: 70, mentality: 72, experience: 64 },
        growthSpent: 0,
        chemistry: 50,
      }],
      pendingDeparture: {
        slotId: departingId,
        departureRound: 96,
        rumorShown: true,
        revealed: true,
        destTeamName: '流星主队',
        destClubId: destinationId,
        earlyRecruit: true,
        baseWindowStartRound: 1,
        pressure: 150,
        pressureThreshold: 100,
        lastPressureRound: 95,
      },
    }, 1);
    s.worldClubsVersion = 2;
    s.worldClubs = {
      season: 2,
      activeClubIds: [playerTeamId, destinationId],
      relevantClubIds: [],
      staticClubIds: [],
      runtimeByClubId: {
        [playerTeamId]: runtime(playerTeamId, [
          worldPlayer(playerTeamId, departingId),
          worldPlayer(playerTeamId, `${playerTeamId}:igl`, { role: 'IGL', archetype: 'system-igl', reputation: 62 }),
          worldPlayer(playerTeamId, `${playerTeamId}:entry`, { role: 'Entry', archetype: 'entry-fragger', reputation: 58 }),
          worldPlayer(playerTeamId, `${playerTeamId}:support`, { role: 'Support', archetype: 'role-player', reputation: 52 }),
          worldPlayer(playerTeamId, `${playerTeamId}:lurker`, { role: 'Lurker', archetype: 'rookie-prospect', reputation: 50 }),
        ]),
        [destinationId]: runtime(destinationId, [
          worldPlayer(destinationId, `${destinationId}:igl`, { role: 'IGL', archetype: 'system-igl', reputation: 64 }),
          worldPlayer(destinationId, `${destinationId}:entry`, { role: 'Entry', archetype: 'entry-fragger', reputation: 60 }),
          worldPlayer(destinationId, `${destinationId}:support`, { role: 'Support', archetype: 'role-player', reputation: 57 }),
          worldPlayer(destinationId, `${destinationId}:lurker`, { role: 'Lurker', archetype: 'role-player', reputation: 55 }),
        ]),
      },
      processedTickKeysByClubId: {},
    };
    s.phase = 'event';
    s.currentEvent = {
      id: 'routine-standard',
      type: 'routine',
      title: '这周怎么安排？',
      narrative: '',
      choices: [{ id: 'ranked-grind', label: '天梯：刷分上分', description: '' }],
    };

    const result = applyChoice(s, 'ranked-grind');
    const fromRuntime = result.session.worldClubs?.runtimeByClubId[playerTeamId];
    const toRuntime = result.session.worldClubs?.runtimeByClubId[destinationId];

    expect(fromRuntime?.fullRoster.some((player) => player.id === departingId)).toBe(false);
    expect(toRuntime?.fullRoster.some((player) => player.id === departingId && player.clubId === destinationId)).toBe(true);
    expect(result.session.transferHistory?.some((record) =>
      record.playerId === departingId &&
      record.fromClubId === playerTeamId &&
      record.toClubId === destinationId
    )).toBe(true);
    expect(result.session.weeklyNews?.some((item) => item.source?.kind === 'world-transfer')).toBe(true);
    expect(result.session.player.forceNextEvent).toBe('chain-role-transition-start');
    expect(result.session.player.tags).toContain('role-transition-eligible');
  });

  it('surfaces player attention as a poach event setup without creating an instant offer', () => {
    const s = session();
    s.player = {
      ...s.player,
      fame: 48,
      stage: 'pro',
      team: {
        clubId: 'club-starforge',
        name: '星锻战队',
        tag: 'SFG',
        region: '欧洲',
        tier: 'pro',
        monthlySalary: 64,
        joinedRound: 1,
      },
    };
    s.worldClubs = {
      ...s.worldClubs!,
      activeClubIds: ['club-meteor-prime', 'club-starforge'],
      runtimeByClubId: {
        ...s.worldClubs!.runtimeByClubId,
        'club-meteor-prime': runtime('club-meteor-prime', [
          worldPlayer('club-meteor-prime', 'club-meteor-prime:igl', { role: 'IGL', archetype: 'system-igl', reputation: 64 }),
          worldPlayer('club-meteor-prime', 'club-meteor-prime:entry', { role: 'Entry', archetype: 'entry-fragger', reputation: 60 }),
          worldPlayer('club-meteor-prime', 'club-meteor-prime:support', { role: 'Support', archetype: 'role-player', reputation: 57 }),
          worldPlayer('club-meteor-prime', 'club-meteor-prime:lurker', { role: 'Lurker', archetype: 'role-player', reputation: 55 }),
        ], { rebuildPressure: 90, currentForm: 20 }),
      },
    };

    const result = runTransferWindow(s, 2);

    expect(result.player.pendingOffer).toBeNull();
    expect(result.player.forceNextEvent).toBe('chain-rival-poach');
    expect(result.transferRumors?.some((rumor) =>
      rumor.playerId === 'player' &&
      rumor.toClubId === 'club-meteor-prime' &&
      !rumor.resolved
    )).toBe(true);
  });

  it('allows high-vrs static clubs with loaded runtimes to participate in the window', () => {
    const s = session();
    const staticBuyerId = 'club-zenith-legacy';
    s.worldClubs = {
      ...s.worldClubs!,
      activeClubIds: ['club-starforge'],
      relevantClubIds: [],
      staticClubIds: [staticBuyerId],
      runtimeByClubId: {
        ...s.worldClubs!.runtimeByClubId,
        [staticBuyerId]: runtime(staticBuyerId, [
          worldPlayer(staticBuyerId, `${staticBuyerId}:igl`, { role: 'IGL', archetype: 'system-igl', reputation: 64 }),
          worldPlayer(staticBuyerId, `${staticBuyerId}:entry`, { role: 'Entry', archetype: 'entry-fragger', reputation: 60 }),
          worldPlayer(staticBuyerId, `${staticBuyerId}:support`, { role: 'Support', archetype: 'role-player', reputation: 57 }),
          worldPlayer(staticBuyerId, `${staticBuyerId}:lurker`, { role: 'Lurker', archetype: 'role-player', reputation: 55 }),
        ], { vrsScore: 2400, rebuildPressure: 82, currentForm: 20 }),
      },
    };

    const result = runTransferWindow(s, 2);

    expect(result.transferHistory?.some((record) => record.toClubId === staticBuyerId)).toBe(true);
  });
});
