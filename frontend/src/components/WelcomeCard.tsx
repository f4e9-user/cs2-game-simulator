'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Player, Trait } from '@/lib/types';
import { STAGE_LABELS } from '@/lib/format';

interface Props {
  sessionId: string;
  player: Player;
  traits: Trait[];
  onDismiss: () => void;
}

export function WelcomeCard({ sessionId, player, traits, onDismiss }: Props) {
  const [intro, setIntro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getIntro(sessionId)
      .then((res) => { if (!cancelled) setIntro(res.intro); })
      .catch(() => { /* silently use fallback below */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  const playerTraits = traits.filter((t) => player.traits.includes(t.id));
  const stageLabel = STAGE_LABELS[player.stage] ?? player.stage;

  const fallbackIntro = `${player.name}，${stageLabel}。一切从这里开始。`;
  const displayIntro = intro && intro.length > 0 ? intro : fallbackIntro;

  return (
    <div className="welcome-card">
      <div className="welcome-chapter">第一章</div>

      <div className="welcome-name">{player.name}</div>
      <div className="welcome-stage">{stageLabel} · 第 1 回合</div>

      <div className="welcome-traits">
        {playerTraits.map((t) => (
          <span key={t.id} className="welcome-trait-chip" title={t.description}>
            {t.name}
          </span>
        ))}
      </div>

      <div className="welcome-divider" />

      <div className="welcome-intro">
        {loading ? (
          <span className="welcome-loading">故事开篇生成中…</span>
        ) : (
          displayIntro
        )}
      </div>

      <button
        type="button"
        className="primary-button welcome-start-btn"
        disabled={loading}
        onClick={onDismiss}
      >
        出发 →
      </button>
    </div>
  );
}
