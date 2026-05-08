import type { Buff, DerivedStats, LeaderboardTeam, Player } from '@/lib/types';
import {
  DERIVED_ICONS,
  DERIVED_LABELS,
  STAGE_LABELS,
  computeDerivedStats,
  feelColorClass,
  feelLabel,
  formatMoney,
  scoreBar,
  tiltLabel,
} from '@/lib/format';

const BUFF_ICONS: Record<string, string> = {
  'pro-gear':      '🖱️',
  'ergo-recovery': '🪑',
  'psych-calm':    '🧠',
};

function buffDetail(buff: Buff): { effect: string; scope: string } {
  const pct = Math.round(Math.abs(buff.multiplier - 1) * 100);
  const dir = buff.multiplier >= 1 ? '+' : '-';
  let effect = '';
  if (buff.growthKey) {
    const keyLabel: Record<string, string> = {
      agility: '敏捷', intelligence: '智力', experience: '经验',
      mentality: '心态', constitution: '体能',
    };
    effect = `${keyLabel[buff.growthKey] ?? buff.growthKey} 成长效率 ${dir}${pct}%`;
  } else if (buff.multiplier !== 1) {
    effect = `效率 ${dir}${pct}%`;
  }
  const scopeLabel: Record<string, string> = { all: '所有行动', ranked: '天梯', training: '训练' };
  const scope = scopeLabel[buff.actionTag] ?? buff.actionTag;
  return { effect, scope };
}

interface Props {
  player: Player;
  leaderboard: LeaderboardTeam[];
}

const DERIVED_ORDER: (keyof DerivedStats)[] = ['aim', 'gameSense', 'stability', 'stamina'];

function derivedBarClass(score: number): string {
  if (score >= 65) return 'hud-stat-bar-fill high';
  if (score >= 35) return 'hud-stat-bar-fill mid';
  return 'hud-stat-bar-fill low';
}

export function HudTopBar({ player, leaderboard }: Props) {
  const sorted = [...leaderboard].sort((a, b) => b.points - a.points);
  const rank = sorted.findIndex((t) => t.isPlayer) + 1;
  const playerPts = sorted.find((t) => t.isPlayer)?.points ?? 0;

  const derived = computeDerivedStats(player.stats);
  const vol = player.volatile ?? { feel: 0, tilt: 0, fatigue: 0 };

  const stressClass =
    player.stress >= 75 ? 'stress-hi' : player.stress >= 50 ? 'stress-mid' : '';

  return (
    <header className="hud-top">
      {/* 身份 */}
      <div className="hud-top-id">
        <span className="hud-player-name">{player.name}</span>
        <span className="hud-time">
          Y{player.year} W{player.week}
        </span>
      </div>
      <span className="hud-stage-tag">{STAGE_LABELS[player.stage]}</span>

      {/* 战队信息 */}
      {player.team ? (
        <span className="hud-stage-tag" style={{ background: 'var(--bg-3)', color: 'var(--up)' }}>
          [{player.team.tag}] +{player.team.weeklySalary * 10}K/w
        </span>
      ) : (
        <span className="hud-stage-tag" style={{ background: 'var(--bg-3)', color: 'var(--fg-2)' }}>
          自由人
        </span>
      )}

      {/* 派生属性（主要展示区）*/}
      <div className="hud-stats-row">
        {DERIVED_ORDER.map((k) => {
          const score = derived[k];
          return (
            <div key={k} className="hud-derived-stat">
              <div className="hud-derived-label">
                <span className="hud-derived-icon">{DERIVED_ICONS[k]}</span>
                <span className="hud-derived-name">{DERIVED_LABELS[k]}</span>
              </div>
              <div className="hud-derived-row">
                <span className="hud-derived-val">{score}</span>
                <div className="hud-derived-bar">
                  <div
                    className={derivedBarClass(score)}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 状态系统 */}
      <div className="hud-gauges">
        {/* 手感 */}
        <div className={`hud-gauge ${feelColorClass(vol.feel)}`}>
          <span className="hud-gauge-label">手感</span>
          <span className="hud-gauge-val">
            {vol.feel > 0 ? `+${vol.feel}` : vol.feel}
          </span>
        </div>

        {/* 疲劳 */}
        <div className={`hud-gauge ${vol.fatigue >= 70 ? 'stress-hi' : vol.fatigue >= 45 ? 'stress-mid' : ''}`}>
          <span className="hud-gauge-label">疲劳</span>
          <span className="hud-gauge-val">{vol.fatigue}</span>
        </div>

        {/* 压力 */}
        <div className={`hud-gauge ${stressClass}`}>
          <span className="hud-gauge-label">压力</span>
          <span className="hud-gauge-val">{player.stress}</span>
        </div>

        {/* 资金 */}
        <div className={`hud-gauge ${player.stats.money <= 1 ? 'stress-hi' : ''}`}>
          <span className="hud-gauge-label">资金</span>
          <span className="hud-gauge-val">{formatMoney(player.stats.money)}</span>
        </div>

        {/* 名气 */}
        <div className="hud-gauge fame">
          <span className="hud-gauge-label">名气</span>
          <span className="hud-gauge-val">{player.fame}</span>
        </div>

        {/* 排名 — 新人阶段尚未入队，不参与积分榜 */}
        {rank > 0 && player.stage !== 'rookie' && (
          <div className="hud-rank-badge">
            <span className="hud-rank-label">RANK</span>
            <span className="hud-rank-val">#{rank}</span>
            <span className="hud-rank-pts">{playerPts}pts</span>
          </div>
        )}
      </div>

      {/* Buff 图标区 */}
      {player.buffs && player.buffs.length > 0 && (
        <div className="hud-buffs">
          {player.buffs.map((buff) => {
            const { effect, scope } = buffDetail(buff);
            return (
              <div key={buff.id} className="hud-buff-icon">
                {BUFF_ICONS[buff.id] ?? '⭐'}
                <div className="hud-buff-tooltip">
                  <div className="hud-buff-tooltip-name">{buff.label}</div>
                  {effect && <div className="hud-buff-tooltip-row">{effect}</div>}
                  <div className="hud-buff-tooltip-row">范围：{scope}</div>
                  <div className="hud-buff-tooltip-uses">剩余 {buff.remainingUses} 次</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
}
