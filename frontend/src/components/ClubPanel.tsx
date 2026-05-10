'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Club, Player } from '@/lib/types';

const TIER_LABELS: Record<string, string> = {
  youth: '青训',
  'semi-pro': '半职业',
  pro: '职业',
  top: '顶级',
};

function rookieEligibility(player: Player): { eligible: boolean; path: 'open-match' | 'talent' | null; hint: string } {
  const tp = player.tierParticipations ?? {};
  const tc = player.tierChampionships ?? {};
  const openParticipations = (tp['b'] ?? 0) + (tp['a'] ?? 0);
  const openChampionships = (tc['b'] ?? 0) + (tc['a'] ?? 0);
  const hasOpenMatch = openParticipations >= 3 && openChampionships >= 1;

  const traitTags = player.traits.flatMap((id) => {
    // traits array only has IDs — derive tags via known mapping
    // aimer tag comes from 枪法天才 trait; check player.tags set by engine
    return [];
  });
  // Talent path: player has 'elite-prospect' dynamic tag (injected when aimer/solo trait present)
  // We check player.tags but dynamic tags aren't stored — use a workaround:
  // the engine writes 'application-path-talent' only when aimer trait is present.
  // For display we re-derive: if player already has the tag from a prior apply we show it.
  // Best approximation: check if any trait name matches 枪法天才.
  const hasTalentTrait = player.traits.some((id) => id === 'aim-god');

  if (hasOpenMatch) return { eligible: true, path: 'open-match', hint: '✓ 赛事经历达标' };
  if (hasTalentTrait) return { eligible: true, path: 'talent', hint: '✓ 枪法天才特质达标' };

  const parts: string[] = [];
  if (openParticipations < 3) parts.push(`B/A 级赛事参赛 ${openParticipations}/3 场`);
  else if (openChampionships < 1) parts.push('B/A 级赛事夺冠 0/1 次');
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

interface Props {
  sessionId: string;
  player: Player;
  enabled: boolean;
  onPlayerUpdate: (p: Player) => void;
}

export function ClubPanel({ sessionId, player, enabled, onPlayerUpdate }: Props) {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    api.listClubs().then((res) => setClubs(res.clubs)).catch(() => {});
  }, []);

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
  const inMatch = player.pendingMatch !== null && player.pendingMatch !== undefined;

  const apply = async (clubId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.applyClub(sessionId, clubId);
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
      const res = await api.leaveTeam(sessionId);
      setConfirmLeave(false);
      onPlayerUpdate(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
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
                    disabled={loading || inMatch}
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
                disabled={!enabled || inMatch}
                style={{ fontSize: 11, padding: '4px 10px', alignSelf: 'flex-start', color: 'var(--fg-2)' }}
              >
                {inMatch ? '赛事中无法离队' : '申请离队'}
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
