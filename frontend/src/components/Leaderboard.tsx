import type { LeaderboardTeam } from '@/lib/types';

const VISIBLE = 10;

interface Props {
  teams: LeaderboardTeam[];
}

export function Leaderboard({ teams }: Props) {
  const sorted = [...teams].sort((a, b) => b.points - a.points);
  const top = sorted.slice(0, VISIBLE);
  const playerInTop = top.some((t) => t.isPlayer);
  const playerRow = sorted.find((t) => t.isPlayer);
  const playerRank = sorted.findIndex((t) => t.isPlayer) + 1;

  return (
    <div style={{ marginBottom: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '7px 8px 5px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--fg-3)',
          }}
        >
          积分榜
        </span>
        {playerRow && !playerInTop && (
          <span style={{ fontSize: 10, color: 'var(--accent)' }}>
            你 #{playerRank}
          </span>
        )}
      </div>

      <div className="hltv-header">
        <span className="hltv-rank">#</span>
        <span style={{ flex: 1 }}>战队</span>
        <span>分</span>
      </div>

      {top.map((t, i) => (
        <HltvRow key={t.name} rank={i + 1} t={t} />
      ))}

      {!playerInTop && playerRow && (
        <>
          <div
            style={{
              padding: '2px 8px',
              fontSize: 10,
              color: 'var(--fg-3)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            ···
          </div>
          <HltvRow rank={playerRank} t={playerRow} />
        </>
      )}
    </div>
  );
}

function HltvRow({ rank, t }: { rank: number; t: LeaderboardTeam }) {
  return (
    <div className={`hltv-row ${t.isPlayer ? 'is-player' : ''}`}>
      <span className={`hltv-rank ${rank <= 3 ? 'top3' : ''}`}>{rank}</span>
      <span className="hltv-name">{t.name}</span>
      <span className="hltv-tag">[{t.region}]</span>
      <span className="hltv-pts">{t.points}</span>
    </div>
  );
}
