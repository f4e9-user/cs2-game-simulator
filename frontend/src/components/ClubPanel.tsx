'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useGameStore } from '@/store/gameStore';
import type { ClubApplicationSummary, Player, TeamActionResult, Teammate } from '@/lib/types';

const TIER_LABELS: Record<string, string> = {
  youth: '青训',
  'semi-pro': '二线队',
  pro: '职业',
  top: '职业队',
};

const TEAM_IDENTITY_LABELS: Record<string, string> = {
  caller: '队内指挥',
  star: '核心火力',
  veteran: '老资历',
  rookie: '新人',
  glue: '稳定器',
  problem: '冲突风险',
  'star-caller': '明星指挥',
};

const TEAM_TRAINING_FOCUS_OPTIONS = [
  { id: 'firepower', label: '枪法压迫' },
  { id: 'tactics', label: '战术执行' },
  { id: 'defense', label: '防守纪律' },
  { id: 'mental', label: '心态稳定' },
];

const TEAM_STATUS_LABELS: Record<string, string> = {
  starter: '首发',
  trial: '试训',
  rotation: '轮换',
};

const JOIN_MODE_LABELS: Record<string, string> = {
  'replace-starter': '竞争首发',
  'fill-vacancy': '补位首发',
  'trial-sixth': '第六人试训',
  rotation: '轮换补强',
};

function rookieEligibility(player: Player): { eligible: boolean; path: 'open-match' | 'talent' | null; hint: string } {
  const tp = player.tierParticipations ?? {};
  const tc = player.tierChampionships ?? {};
  const rookieParticipations = (tp['c'] ?? 0) + (tp['b'] ?? 0);
  const bParticipations = tp['b'] ?? 0;
  const rookieChampionships = (tc['c'] ?? 0) + (tc['b'] ?? 0);
  const hasOpenMatch = rookieParticipations >= 3 && bParticipations >= 1 && rookieChampionships >= 1;

  // Talent path: player has 'elite-prospect' dynamic tag (injected when aimer/solo trait present)
  // We check player.tags but dynamic tags aren't stored — use a workaround:
  // the engine writes 'application-path-talent' only when aimer trait is present.
  // For display we re-derive: if player already has the tag from a prior apply we show it.
  // Best approximation: check if any trait name matches 枪法天才.
  const hasTalentTrait = player.traits.some((id) => id === 'aim-god');

  if (hasOpenMatch) return { eligible: true, path: 'open-match', hint: '✓ 赛事经历达标' };
  if (hasTalentTrait) return { eligible: true, path: 'talent', hint: '✓ 枪法天才特质达标' };

  const parts: string[] = [];
  if (rookieParticipations < 3) parts.push(`C/B 级赛事参赛 ${rookieParticipations}/3 场`);
  if (bParticipations < 1) parts.push(`B 级赛事参赛 ${bParticipations}/1 场`);
  if (rookieChampionships < 1) parts.push(`C/B 级赛事冠军 ${rookieChampionships}/1 次`);
  return {
    eligible: false,
    path: null,
    hint: `未达标：${parts.join('，')}（或持有枪法天才特质）`,
  };
}

function trustLabel(trust: number): { text: string; color: string; effect: string } {
  if (trust >= 65) return { text: '高度信任', color: 'var(--up)', effect: '比赛表现 +1' };
  if (trust >= 30) return { text: '正常', color: 'var(--fg-2)', effect: '无加成' };
  if (trust >= 15) return { text: '关系紧张', color: 'var(--warn, #e8a030)', effect: '比赛表现 −1' };
  return { text: '危机', color: 'var(--danger)', effect: '比赛表现 −2' };
}

function TeamTrustBar({ trust }: { trust: number }) {
  const { text, color, effect } = trustLabel(trust);
  return (
    <div style={{ padding: '7px 8px', background: 'var(--bg-2)', borderRadius: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          战队信任度
        </span>
        <span style={{ fontSize: 11, color, fontWeight: 600 }}>
          {trust} / 100 · {text}
        </span>
      </div>
      <div style={{ height: 5, background: 'var(--bg-3, #333)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${trust}%`, background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 4 }}>{effect}</div>
    </div>
  );
}

function statAvg(tm: Teammate): number {
  const s = tm.stats;
  return Math.round(((s.agility + s.intelligence + s.mentality + s.experience) / 4) * 10) / 10;
}

const PLAYER_TRAIT_TAGS: Record<string, string[]> = {
  'aim-god': ['aimer', 'mechanical'],
  'tactical-mind': ['igl', 'tactical'],
  'ice-cold': ['clutch', 'steady'],
  grinder: ['grinder', 'steady'],
  'streamer-charm': ['streamer', 'media'],
  'support-soul': ['support', 'steady'],
  'awper-instinct': ['awper', 'mechanical'],
  'scene-kid': ['streetwise', 'grinder'],
  'fragile-star': ['mechanical', 'media', 'fragile'],
  'ranked-warrior': ['solo', 'mechanical'],
  gambler: ['risky', 'gambler'],
  hothead: ['aggressive', 'volatile'],
  arrogant: ['solo', 'ego'],
  introvert: ['shy', 'anti-media'],
};

function explainSynergy(player: Player): { bonus: number; factors: Array<{ id: string; label: string; value: number }> } {
  const roster = player.roster ?? [];
  if (roster.length === 0) return { bonus: 0, factors: [] };
  const playerTags = player.traits.flatMap((id) => PLAYER_TRAIT_TAGS[id] ?? []);
  const allTraits = new Set(playerTags);
  for (const tm of roster) {
    for (const tag of tm.traits) allTraits.add(tag);
  }
  const traitCounts: Record<string, number> = {};
  for (const tag of allTraits) {
    let count = playerTags.filter((t) => t === tag).length;
    for (const tm of roster) count += tm.traits.filter((t) => t === tag).length;
    traitCounts[tag] = count;
  }
  const factors: Array<{ id: string; label: string; value: number }> = [];
  if (roster.some((tm) => tm.role === 'IGL') && allTraits.has('tactical')) factors.push({ id: 'igl-tactical', label: 'IGL + 战术特质', value: 2 });
  if (roster.some((tm) => tm.role === 'AWPer') && allTraits.has('aimer')) factors.push({ id: 'awper-aimer', label: 'AWP 位 + 火力特质', value: 1 });
  if ((traitCounts.support ?? 0) >= 2) factors.push({ id: 'support-stack', label: '多名支援型特质', value: 1 });
  if (playerTags.includes('igl') && (traitCounts.support ?? 0) >= 1) factors.push({ id: 'player-igl-support', label: '玩家指挥与支援配合', value: 1 });
  if ((traitCounts.ego ?? 0) >= 2) factors.push({ id: 'ego-clash', label: '多个 ego 特质冲突', value: -2 });
  if ((traitCounts.solo ?? 0) >= 3) factors.push({ id: 'solo-stack', label: '单打倾向过多', value: -1 });
  return { bonus: factors.reduce((sum, factor) => sum + factor.value, 0), factors };
}

function deriveTeamChemistry(roster: Teammate[], teamTrust: number): number {
  if (roster.length === 0) return 0;
  const avgTeammateChemistry = roster.reduce((sum, tm) => sum + (tm.chemistry ?? 50), 0) / roster.length;
  const weighted = avgTeammateChemistry * 0.75 + teamTrust * 0.25;
  const trustPenalty = teamTrust < 25 ? 10 : 0;
  return Math.max(0, Math.min(100, Math.round(weighted - trustPenalty)));
}

function teamVoiceStatus(player: Player): { label: string; detail: string; tone: 'neutral' | 'warn' | 'up' } {
  if (player.tags.includes('locker-tension')) {
    return { label: '方向存在争议', detail: '更衣室紧张，话语权事件风险上升', tone: 'warn' };
  }
  const identity = player.visibleTeamIdentity;
  const hasStarTeammate = (player.roster ?? []).some((tm) => tm.visibleIdentity === 'star');
  const hasCallerTeammate = (player.roster ?? []).some((tm) => tm.visibleIdentity === 'caller');
  const trust = player.teamTrust ?? 50;

  if (identity === 'star-caller') return { label: '双重核心', detail: '火力和指挥压力都集中在你身上', tone: trust >= 55 ? 'up' : 'warn' };
  if (identity === 'caller' && hasStarTeammate) return { label: '指挥主导', detail: '需要平衡战术纪律和明星位自由度', tone: trust >= 45 ? 'neutral' : 'warn' };
  if (identity === 'star' && hasCallerTeammate) return { label: '明星核心影响较大', detail: '教练组会听取资源和角色分工建议', tone: trust >= 45 ? 'neutral' : 'warn' };
  if (identity === 'caller') return { label: '指挥影响较大', detail: '你的意见主要影响战术和沟通', tone: 'neutral' };
  if (identity === 'star') return { label: '明星核心影响较大', detail: '你的意见主要影响资源分配和发挥空间', tone: 'neutral' };
  if (hasStarTeammate && hasCallerTeammate && trust < 40) return { label: '方向存在争议', detail: '指挥和明星位的分歧更容易浮现', tone: 'warn' };
  if (trust >= 55) return { label: '教练组暂时压住分歧', detail: '队内讨论整体可控', tone: 'up' };
  return { label: '话语权未集中', detail: '你仍以个人反馈和队友沟通为主', tone: 'neutral' };
}

interface Props {
  sessionId: string;
  player: Player;
  enabled: boolean;
  onPlayerUpdate: (p: Player) => void;
}

export function ClubPanel({ sessionId, player, enabled, onPlayerUpdate }: Props) {
  const apiToken = useGameStore((s) => s.apiToken);
  const [clubs, setClubs] = useState<ClubApplicationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [teamActionResult, setTeamActionResult] = useState<TeamActionResult | null>(null);

  useEffect(() => {
    api.listSessionClubs(sessionId)
      .then((res) => setClubs(res.clubs))
      .catch(() => api.listClubs().then((res) => setClubs(res.clubs)).catch(() => {}));
  }, [sessionId]);

  const stageOrder = ['rookie', 'youth', 'second', 'pro', 'retired'];
  const playerStageIdx = stageOrder.indexOf(player.stage);
  const rookieCheck = player.stage === 'rookie' ? rookieEligibility(player) : null;

  const eligibleClubs = clubs.filter((c) => {
    if (c.isRival) return false;
    if (player.team && c.id === player.team.clubId) return false; // 隐藏当前战队
    const requiredIdx = stageOrder.indexOf(c.requiredStage);
    const rookieCanApplyToYouth =
      player.stage === 'rookie' && c.requiredStage === 'youth' && rookieCheck?.eligible === true;
    if (!rookieCanApplyToYouth && playerStageIdx < requiredIdx) return false;
    if (c.requiredFame !== undefined && (player.fame ?? 0) < c.requiredFame) return false;
    return true;
  });

  const hasTeam = player.team !== null;
  const hasPending = player.pendingApplication !== null;
  const ap = player.actionPoints ?? 0;
  const hasPendingMatch = player.pendingMatch !== null && player.pendingMatch !== undefined;
  const inMatchWeek = hasPendingMatch
    && player.pendingMatch?.resolveYear === (player.year ?? 1)
    && player.pendingMatch?.resolveWeek === (player.week ?? 1);
  const weeklyTeamActions = player.weeklyTeamActions ?? {};
  const currentYear = player.year ?? 1;
  const currentWeek = player.week ?? 1;
  const teamActionCount = (key: string) => {
    const record = weeklyTeamActions[key];
    return record?.year === currentYear && record.week === currentWeek ? record.count : 0;
  };
  const practiceTotal = Object.entries(weeklyTeamActions)
    .filter(([key, record]) => key.startsWith('practice:') && record.year === currentYear && record.week === currentWeek)
    .reduce((sum, [, record]) => sum + record.count, 0);
  const pendingDeparture = player.pendingDeparture;
  const departingTeammate = player.roster?.find((tm) => tm.id === pendingDeparture?.slotId);
  const canShowRetain = !!pendingDeparture?.revealed && !!departingTeammate && !pendingDeparture.retentionAttempted;
  const canRetain = enabled &&
    canShowRetain &&
    !inMatchWeek &&
    !busyAction &&
    ap >= 35 &&
    player.round < pendingDeparture!.departureRound;
  const canInfluenceStrategy =
    player.visibleTeamIdentity === 'caller' ||
    player.visibleTeamIdentity === 'star' ||
    player.visibleTeamIdentity === 'star-caller';
  const synergy = explainSynergy(player);
  const voiceStatus = hasTeam ? teamVoiceStatus(player) : null;

  const apply = async (clubId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.applyClub(sessionId, clubId, apiToken ?? undefined);
      onPlayerUpdate(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const leaveTeam = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.leaveTeam(sessionId, apiToken ?? undefined);
      setConfirmLeave(false);
      onPlayerUpdate(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const runTeamAction = async (
    key: string,
    fn: () => Promise<{ player: Player; result: TeamActionResult }>,
  ) => {
    setBusyAction(key);
    setError(null);
    try {
      const res = await fn();
      setTeamActionResult(res.result);
      onPlayerUpdate(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAction(null);
    }
  };

  const clubListSection = (
    <div style={{ marginTop: 10 }}>
      <div className="stat-desc" style={{ marginBottom: 6 }}>
        可申请的俱乐部（消耗 25 AP / 次）
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {eligibleClubs.length === 0 && (
          <div className="action-panel-hint">暂无可申请的俱乐部</div>
        )}
        {eligibleClubs.map((c) => {
          const rookieBlock = rookieCheck !== null && !rookieCheck.eligible;
          const canApply = enabled && !hasPending && ap >= 25 && !loading && !rookieBlock;
          return (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: 6, background: 'var(--bg-2)' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}>
                  {c.name} [{c.tag}]
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-2)' }}>
                  {TIER_LABELS[c.tier] ?? c.tier} · {c.region} · {c.salaryRange[0]}–{c.salaryRange[1]}K/月
                </div>
                {c.runtimeSummary && (
                  <div style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 2 }}>
                    {c.runtimeSummary.rosterStyle} · {c.runtimeSummary.hint}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="ghost-button"
                disabled={!canApply}
                onClick={() => apply(c.id)}
                style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
              >
                {rookieBlock ? '未达标' : ap < 25 ? 'AP 不足' : '发简历 -25 AP'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="action-panel" style={{ marginTop: 10 }}>
      <div className="action-panel-header">
        战队
        {hasTeam && (
          <span style={{ fontSize: 11, color: 'var(--fg-2)', marginLeft: 'auto' }}>
            {player.team!.tag} · +{player.team!.monthlySalary}K/月
          </span>
        )}
      </div>

      <div style={{ padding: '8px 0' }}>
        {hasTeam ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
                {player.team!.name} [{player.team!.tag}]
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2 }}>
                {TIER_LABELS[player.team!.tier] ?? player.team!.tier} · {player.team!.region}
                · 加入于第 {player.team!.joinedRound} 回合
              </div>
            </div>

            <TeamTrustBar trust={player.teamTrust ?? 50} />

            {player.visibleTeamIdentity && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--bg-2)', borderRadius: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 600 }}>队内定位</span>
                <span style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 700 }}>
                  {TEAM_IDENTITY_LABELS[player.visibleTeamIdentity] ?? player.visibleTeamIdentity}
                </span>
              </div>
            )}

            {voiceStatus && (
              <div style={{ padding: '7px 8px', background: 'var(--bg-2)', borderRadius: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 600 }}>队内话语权</span>
                  <span style={{
                    fontSize: 12,
                    color: voiceStatus.tone === 'up' ? 'var(--up)' : voiceStatus.tone === 'warn' ? 'var(--warn)' : 'var(--fg)',
                    fontWeight: 700,
                  }}>
                    {voiceStatus.label}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 4 }}>{voiceStatus.detail}</div>
              </div>
            )}

            {(player.team!.teamStatus || player.team!.joinMode || player.team!.joinReason) && (
              <div style={{ padding: '7px 8px', background: 'var(--bg-2)', borderRadius: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 600 }}>入队定位</span>
                  <span style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 700 }}>
                    {JOIN_MODE_LABELS[player.team!.joinMode ?? ''] ?? player.team!.joinMode ?? '常规补强'}
                    {' · '}
                    {TEAM_STATUS_LABELS[player.team!.teamStatus ?? 'starter'] ?? player.team!.teamStatus ?? '首发'}
                  </span>
                </div>
                {player.team!.joinReason && (
                  <div style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 4 }}>{player.team!.joinReason}</div>
                )}
                {player.team!.roleOverlap && player.team!.roleOverlap.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                    {player.team!.roleOverlap.slice(0, 2).map((overlap, index) => (
                      <span key={`${overlap.kind}-${overlap.value}-${overlap.teammateId ?? index}`} className="chip chip-neu">
                        重叠：{String(overlap.value)}{overlap.teammateName ? ` / ${overlap.teammateName}` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {player.roster && player.roster.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--bg-2)', borderRadius: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 600 }}>队伍默契</span>
                <span style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 700 }}>
                  {deriveTeamChemistry(player.roster, player.teamTrust ?? 50)} / 100
                </span>
              </div>
            )}

            {player.roster && player.roster.length > 0 && (
              <div style={{ padding: '7px 8px', background: 'var(--bg-2)', borderRadius: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 600 }}>阵容协同</span>
                  <span style={{ fontSize: 12, color: synergy.bonus > 0 ? 'var(--up)' : synergy.bonus < 0 ? 'var(--danger)' : 'var(--fg)', fontWeight: 700 }}>
                    {synergy.bonus > 0 ? '+' : ''}{synergy.bonus}
                  </span>
                </div>
                {synergy.factors.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                    {synergy.factors.map((factor) => (
                      <span key={factor.id} className={`chip ${factor.value > 0 ? 'chip-up' : 'chip-down'}`}>
                        {factor.label} {factor.value > 0 ? '+' : ''}{factor.value}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 4 }}>暂无明显角色/特质协同</div>
                )}
              </div>
            )}

            {player.roster && player.roster.length > 0 && (
              <div style={{ padding: '7px 8px', background: 'var(--bg-2)', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  阵容
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {player.roster.map((tm) => {
                    const practiceKey = `practice:${tm.id}`;
                    const practiced = teamActionCount(practiceKey) >= 1;
                    const canPractice = enabled && !inMatchWeek && !busyAction && ap >= 55 && !practiced && practiceTotal < 1;
                    return (
                      <div key={tm.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}>[{tm.role}]</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: 'var(--fg)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tm.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tm.traits.join(' / ')} · 均值 {statAvg(tm)} · 默契 {tm.chemistry ?? 50}
                            {tm.visibleIdentity ? ` · ${TEAM_IDENTITY_LABELS[tm.visibleIdentity] ?? tm.visibleIdentity}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={!canPractice}
                          onClick={() => runTeamAction(
                            practiceKey,
                            () => api.teamPractice(sessionId, tm.id, apiToken ?? undefined),
                          )}
                          title={practiced ? '本周已加练' : practiceTotal >= 1 ? '本周加练次数已满' : undefined}
                          style={{ fontSize: 11, padding: '4px 8px', whiteSpace: 'nowrap' }}
                        >
                          {practiced ? '已加练' : practiceTotal >= 1 ? '已满' : ap < 55 ? 'AP 不足' : '加练 -55'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ padding: '7px 8px', background: 'var(--bg-2)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                团队管理
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={!enabled || inMatchWeek || !!busyAction || ap < 30 || teamActionCount('team-meeting') >= 1}
                  onClick={() => runTeamAction(
                    'team-meeting',
                    () => api.teamMeeting(sessionId, apiToken ?? undefined),
                  )}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                >
                  {teamActionCount('team-meeting') >= 1 ? '会议已开' : ap < 30 ? 'AP 不足' : '战术会议 -30'}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={!enabled || inMatchWeek || !!busyAction || ap < 25 || teamActionCount('locker-room-talk') >= 1 || (!player.tags.includes('locker-tension') && (player.teamTrust ?? 50) >= 30)}
                  onClick={() => runTeamAction(
                    'locker-room-talk',
                    () => api.lockerRoomTalk(sessionId, apiToken ?? undefined),
                  )}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                >
                  {teamActionCount('locker-room-talk') >= 1 ? '已安抚' : ap < 25 ? 'AP 不足' : '安抚更衣室 -25'}
                </button>
                {canShowRetain && (
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={!canRetain}
                    onClick={() => runTeamAction(
                      'retain-core-teammate',
                      () => api.retainCoreTeammate(sessionId, apiToken ?? undefined),
                    )}
                    title={
                      pendingDeparture.retentionAttempted
                        ? '这次离队风险已经尝试过挽留'
                        : player.round >= pendingDeparture.departureRound
                          ? '已经进入离队结算阶段'
                          : undefined
                    }
                    style={{ fontSize: 11, padding: '4px 10px' }}
                  >
                    {ap < 35 ? 'AP 不足' : `挽留 ${departingTeammate?.name ?? '核心队友'} -35`}
                  </button>
                )}
              </div>
              {canInfluenceStrategy && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {TEAM_TRAINING_FOCUS_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="ghost-button"
                      disabled={!enabled || inMatchWeek || !!busyAction || ap < 20}
                      onClick={() => runTeamAction(
                        `team-training-focus:${option.id}`,
                        () => api.teamTrainingFocus(sessionId, option.id, apiToken ?? undefined),
                      )}
                      style={{ fontSize: 11, padding: '4px 10px' }}
                    >
                      {ap < 20 ? 'AP 不足' : `${option.label} -20`}
                    </button>
                  ))}
                </div>
              )}
              {teamActionResult && (
                <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid var(--border)', fontSize: 11 }}>
                  <div style={{ color: teamActionResult.success ? 'var(--up)' : 'var(--warn)', fontWeight: 600 }}>
                    {teamActionResult.label} · {teamActionResult.success ? '成功' : '失败'} ({teamActionResult.roll}/{teamActionResult.dc})
                  </div>
                  <div style={{ color: 'var(--fg-2)', marginTop: 3 }}>{teamActionResult.narrative}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                    {teamActionResult.comboTriggeredLabels?.map((label) => (
                      <span key={`triggered-${label}`} className="chip chip-pos">触发连锁：{label}</span>
                    ))}
                    {teamActionResult.comboAddedLabels?.map((label) => (
                      <span key={`added-${label}`} className="chip chip-neu">形成连锁：{label}</span>
                    ))}
                    {teamActionResult.effects.map((effect) => (
                      <span key={effect} className="chip chip-neu">{effect}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {confirmLeave ? (
              <div style={{ padding: '8px', background: 'var(--bg-2)', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, color: 'var(--fg-2)' }}>
                  确认离队？名气 -5，赛事进行中无法离队。
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={leaveTeam}
                    disabled={loading || hasPendingMatch}
                    style={{ fontSize: 11, padding: '4px 10px', color: 'var(--danger)' }}
                  >
                    确认离队
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setConfirmLeave(false)}
                    disabled={loading}
                    style={{ fontSize: 11, padding: '4px 10px' }}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="ghost-button"
                onClick={() => setConfirmLeave(true)}
                disabled={!enabled || hasPendingMatch}
                style={{ fontSize: 11, padding: '4px 10px', alignSelf: 'flex-start', color: 'var(--fg-2)' }}
              >
                {hasPendingMatch ? '赛事中无法离队' : '申请离队'}
              </button>
            )}

            {clubListSection}
          </div>
        ) : hasPending ? (
          <div style={{ fontSize: 12, color: 'var(--fg-2)', padding: 8, textAlign: 'center' }}>
            ⏳ 已向 <strong>{player.pendingApplication!.clubName}</strong> 发送申请，等待回信中…
          </div>
        ) : (
          <div>
            {rookieCheck && (
              <div style={{
                fontSize: 11,
                color: rookieCheck.eligible ? 'var(--up)' : 'var(--fg-3)',
                marginBottom: 8,
                padding: '4px 6px',
                background: 'var(--bg-2)',
                borderRadius: 4,
              }}>
                {rookieCheck.eligible
                  ? `${rookieCheck.hint} — 可以投简历`
                  : `入队门槛：${rookieCheck.hint}`}
              </div>
            )}
            {clubListSection}
          </div>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}
