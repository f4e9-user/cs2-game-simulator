'use client';

import type { Player, Trait } from '@/lib/types';
import { STAGE_LABELS } from '@/lib/format';

interface Props {
  player: Player;
  traits: Trait[];
  intro: string | null;
  introLoading: boolean;
  onDismiss: () => void;
}

export function WelcomeCard({ player, traits, intro, introLoading, onDismiss }: Props) {
  const playerTraits = traits.filter((t) => player.traits.includes(t.id));
  const stageLabel = STAGE_LABELS[player.stage] ?? player.stage;
  const displayIntro = intro && intro.length > 0
    ? intro
    : `${player.name}，${stageLabel}。一切从这里开始。`;

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
        {introLoading ? (
          <span className="welcome-loading">故事开篇生成中…</span>
        ) : (
          displayIntro
        )}
      </div>

      <button
        type="button"
        className="primary-button welcome-start-btn"
        onClick={onDismiss}
      >
        {introLoading ? '跳过 →' : '出发 →'}
      </button>
    </div>
  );
}
