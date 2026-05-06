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

  useEffect(() => {
    api.listClubs().then((res) => setClubs(res.clubs)).catch(() => {});
  }, []);

  const stageOrder = ['rookie', 'youth', 'second', 'pro', 'star', 'veteran', 'retired'];
  const playerStageIdx = stageOrder.indexOf(player.stage);

  const eligibleClubs = clubs.filter((c) => {
    if (c.isRival) return false; // 对手映射隐藏
    const requiredIdx = stageOrder.indexOf(c.requiredStage);
    if (playerStageIdx < requiredIdx) return false;
    if (c.requiredFame !== undefined && (player.fame ?? 0) < c.requiredFame) return false;
    return true;
  });

  const hasTeam = player.team !== null;
  const hasPending = player.pendingApplication !== null;
  const ap = player.actionPoints ?? 0;

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

  // 路人阶段不显示
  if (player.stage === 'rookie') {
    return (
      <div className="action-panel" style={{ marginTop: 10 }}>
        <div className="action-panel-header">战队</div>
        <div className="action-panel-hint">进入青训后解锁俱乐部签约</div>
      </div>
    );
  }

  return (
    <div className="action-panel" style={{ marginTop: 10 }}>
      <div className="action-panel-header">
        战队
        {hasTeam && (
          <span style={{ fontSize: 11, color: 'var(--fg-2)', marginLeft: 'auto' }}>
            {player.team!.tag} · +{player.team!.weeklySalary * 10}K/周
          </span>
        )}
      </div>

      <div style={{ padding: '8px 0' }}>
        {hasTeam ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
              {player.team!.name} [{player.team!.tag}]
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-2)' }}>
              {TIER_LABELS[player.team!.tier] ?? player.team!.tier} · {player.team!.region}
              · 加入于 第{player.team!.joinedRound}回合
            </div>
          </div>
        ) : hasPending ? (
          <div style={{ fontSize: 12, color: 'var(--fg-2)', padding: 8, textAlign: 'center' }}>
            ⏳ 已向 <strong>{player.pendingApplication!.clubName}</strong> 发送申请，等待回信中…
          </div>
        ) : (
          <div>
            <div className="stat-desc" style={{ marginBottom: 8 }}>
              可申请的俱乐部（消耗 25 AP / 次）
            </div>
            <div className={`${eligibleClubs.length === 0 ? '' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {eligibleClubs.length === 0 && (
                <div className="action-panel-hint">暂无可申请的俱乐部</div>
              )}
              {eligibleClubs.map((c) => {
                const canApply = enabled && !hasPending && ap >= 25 && !loading;
                return (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: 6, background: 'var(--bg-2)' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}>
                        {c.name} [{c.tag}]
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--fg-2)' }}>
                        {TIER_LABELS[c.tier] ?? c.tier} · {c.region} · {c.salaryRange[0] * 10}–{c.salaryRange[1] * 10}K/周
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={!canApply}
                      onClick={() => apply(c.id)}
                      style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
                    >
                      {ap < 25 ? 'AP 不足' : '发简历 -25 AP'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}
