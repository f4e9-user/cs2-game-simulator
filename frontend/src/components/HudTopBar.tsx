import type { LeaderboardTeam, Player, StatKey } from '@/lib/types';
import { HUD_STAT_LABELS, STAGE_LABELS } from '@/lib/format';

const STAT_ORDER: StatKey[] = [
  'agility',
  'intelligence',
  'mentality',
  'experience',
  'constitution',
  'money',
];
const STAT_MAX = 20;

function barClass(v: number): string {
  if (v >= 12) return 'hud-stat-bar-fill high';
  if (v >= 6) return 'hud-stat-bar-fill mid';
  return 'hud-stat-bar-fill low';
}

interface Props {
  player: Player;
  leaderboard: LeaderboardTeam[];
}

export function HudTopBar({ player, leaderboard }: Props) {
  const sorted = [...leaderboard].sort((a, b) => b.points - a.points);
  const rank = sorted.findIndex((t) => t.isPlayer) + 1;
  const playerPts = sorted.find((t) => t.isPlayer)?.points ?? 0;

  const stressClass =
    player.stress >= 75 ? 'stress-hi' : player.stress >= 50 ? 'stress-mid' : '';

  return (
    <header className="hud-top">
      {/* Identity */}
      <div className="hud-top-id">
        <span className="hud-player-name">{player.name}</span>
        <span className="hud-time">
          Y{player.year} W{player.week}
        </span>
      </div>
      <span className="hud-stage-tag">{STAGE_LABELS[player.stage]}</span>

      {/* Stat bars */}
      <div className="hud-stats-row">
        {STAT_ORDER.map((k) => {
          const v = player.stats[k];
          const pct = Math.min(100, Math.round((v / STAT_MAX) * 100));
          return (
            <div key={k} className="hud-stat">
              <span className="hud-stat-name">{HUD_STAT_LABELS[k]}</span>
              <span className="hud-stat-val">{v}</span>
              <div className="hud-stat-bar">
                <div className={barClass(v)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Gauges */}
      <div className="hud-gauges">
        <div className={`hud-gauge ${stressClass}`}>
          <span className="hud-gauge-label">压力</span>
          <span className="hud-gauge-val">{player.stress}</span>
        </div>
        <div className="hud-gauge fame">
          <span className="hud-gauge-label">名气</span>
          <span className="hud-gauge-val">{player.fame}</span>
        </div>
        {rank > 0 && (
          <div className="hud-rank-badge">
            <span className="hud-rank-label">RANK</span>
            <span className="hud-rank-val">#{rank}</span>
            <span className="hud-rank-pts">{playerPts}pts</span>
          </div>
        )}
      </div>
    </header>
  );
}
