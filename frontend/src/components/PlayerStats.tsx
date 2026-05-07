'use client';

import { useState } from 'react';
import type { Player, PromotionCheck, Teammate, Trait } from '@/lib/types';
import { STAGE_LABELS } from '@/lib/format';

interface Props {
  player: Player;
  traits: Trait[];
  promotion?: PromotionCheck | null;
}

function statAvg(tm: Teammate): number {
  const s = tm.stats;
  const raw = (s.agility + s.intelligence + s.mentality + s.experience) / 4;
  return Math.round(raw * 10) / 10;
}

export function PlayerStats({ player, traits, promotion }: Props) {
  const [rosterOpen, setRosterOpen] = useState(false);
  const playerTraits = player.traits
    .map((id) => traits.find((t) => t.id === id))
    .filter((t): t is Trait => Boolean(t));

  const roster = player.roster;

  return (
    <div className="player-card">
      {/* Career stats */}
      <div className="career-badges">
        <span className="badge">
          参赛 {player.tournamentParticipations ?? 0}
        </span>
        <span
          className={`badge ${(player.tournamentChampionships ?? 0) > 0 ? 'success' : ''}`}
        >
          夺冠 {player.tournamentChampionships ?? 0}
        </span>
        {player.restRounds > 0 && (
          <span className="badge danger">休养 {player.restRounds}回</span>
        )}
        {player.stressMaxRounds > 0 && (
          <span className="badge danger">崩溃预警</span>
        )}
      </div>

      {/* Promotion */}
      {player.promotionPending ? (
        <div style={{ marginBottom: 6 }}>
          <span className="status-alert warn">
            考察来了 → {STAGE_LABELS[player.promotionPending]}
          </span>
        </div>
      ) : promotion && promotion.reasons.length > 0 ? (
        <div style={{ marginBottom: 6 }}>
          <div
            style={{
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--fg-3)',
              marginBottom: 3,
            }}
          >
            晋级条件
          </div>
          {promotion.reasons.map((r, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--fg-2)' }}>
              · {r}
            </div>
          ))}
        </div>
      ) : null}

      {/* Traits */}
      {playerTraits.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div
            style={{
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--fg-3)',
              marginBottom: 4,
            }}
          >
            特质
          </div>
          <div>
            {playerTraits.map((t) => (
              <span key={t.id} className="trait-chip" title={t.description}>
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {player.tags.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--fg-3)',
              marginBottom: 4,
            }}
          >
            标签
          </div>
          <div>
            {player.tags.map((tag) => (
              <span key={tag} className="trait-chip">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Roster section */}
      {roster && roster.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            className="roster-toggle"
            onClick={() => setRosterOpen((v) => !v)}
          >
            <span className="roster-caret">{rosterOpen ? '▾' : '▸'}</span>
            阵容
          </button>
          {rosterOpen && (
            <div className="roster-list">
              {roster.map((tm) => (
                <div key={tm.id} className="roster-row">
                  <span className="roster-role">[{tm.role}]</span>
                  <span className="roster-name">{tm.name}</span>
                  <span className="roster-traits">
                    {tm.traits.join(' / ')}
                  </span>
                  <span className="roster-avg">均值 {statAvg(tm)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
