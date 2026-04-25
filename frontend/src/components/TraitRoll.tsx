import type { StatKey, Trait } from '@/lib/types';
import { STAT_LABELS, formatDelta } from '@/lib/format';

interface Props {
  traits: Trait[];
  rerollsLeft: number;
  onReroll: () => void;
  rolling: boolean;
}

export function TraitRoll({ traits, rerollsLeft, onReroll, rolling }: Props) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div className="stat-desc">
          系统随机抽出 3 个特质。正向加成作为属性分配底线，负向扣减在分配器里可视化。
        </div>
        <button
          type="button"
          className="ghost-button"
          disabled={rerollsLeft <= 0 || rolling}
          onClick={onReroll}
        >
          {rolling ? '抽取中…' : `重抽（剩余 ${rerollsLeft}）`}
        </button>
      </div>
      <div className="grid grid-3">
        {traits.map((t) => {
          const mods = Object.entries(t.modifiers) as [StatKey, number][];
          return (
            <div
              key={t.id}
              className="selectable selected"
              style={{ cursor: 'default' }}
            >
              <div className="title">{t.name}</div>
              <div className="desc">{t.description}</div>
              {mods.length > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  {mods.map(([k, v]) => (
                    <span
                      key={k}
                      className={`delta-chip ${v >= 0 ? 'up' : 'down'}`}
                    >
                      {STAT_LABELS[k]} {formatDelta(v)}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                {t.tags.map((tag) => (
                  <span key={tag} className="trait-chip">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
