import type { LeaderboardTeam } from '@/lib/types';

const VISIBLE = 10;

interface Props {
  teams: LeaderboardTeam[];
}

export function Leaderboard({ teams }: Props) {
  // Always include the player's row, even if it would be off-screen.
  const sorted = [...teams].sort((a, b) => b.points - a.points);
  const top = sorted.slice(0, VISIBLE);
  const playerInTop = top.some((t) => t.isPlayer);
  const playerRow = sorted.find((t) => t.isPlayer);
  const playerRank = sorted.findIndex((t) => t.isPlayer) + 1;

  return (
    <div className="panel">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <div className="panel-title" style={{ margin: 0 }}>
          战队积分榜
        </div>
        {playerRow && !playerInTop && (
          <span className="badge">你 #{playerRank}</span>
        )}
      </div>

      <div>
        {top.map((t, i) => (
          <Row key={t.name} rank={i + 1} t={t} />
        ))}
        {!playerInTop && playerRow && (
          <>
            <div className="stat-desc" style={{ padding: '4px 0' }}>
              ...
            </div>
            <Row rank={playerRank} t={playerRow} />
          </>
        )}
      </div>
    </div>
  );
}

function Row({ rank, t }: { rank: number; t: LeaderboardTeam }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 0',
        borderBottom: '1px dashed var(--border)',
        fontFamily: t.isPlayer ? undefined : 'inherit',
        color: t.isPlayer ? 'var(--accent)' : undefined,
        fontWeight: t.isPlayer ? 600 : 400,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
        <span style={{ minWidth: 28, color: 'var(--fg-dim)' }}>#{rank}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
        <span className="stat-desc">[{t.region}]</span>
      </div>
      <span
        style={{
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 600,
          color: t.isPlayer ? 'var(--accent)' : 'var(--fg)',
        }}
      >
        {t.points}
      </span>
    </div>
  );
}
