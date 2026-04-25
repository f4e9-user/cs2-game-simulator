import type { Player, PromotionCheck, StatKey, Trait } from '@/lib/types';
import {
  STAGE_LABELS,
  STAT_DESCRIPTION,
  STAT_LABELS,
  physicalState,
  psychologicalState,
} from '@/lib/format';
import { StageBadge } from './StageBadge';

const ORDER: StatKey[] = [
  'intelligence',
  'agility',
  'experience',
  'money',
  'mentality',
  'constitution',
];

interface Props {
  player: Player;
  traits: Trait[];
  promotion?: PromotionCheck | null;
}

export function PlayerStats({ player, traits, promotion }: Props) {
  const playerTraits = player.traits
    .map((id) => traits.find((t) => t.id === id))
    .filter((t): t is Trait => Boolean(t));

  const psych = psychologicalState(player.stats.mentality);
  const phys = physicalState(player.stats.constitution);

  return (
    <div className="panel">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{player.name}</div>
          <div className="stat-desc">
            第 {player.year} 年 第 {player.week} 周 · {STAGE_LABELS[player.stage]}
          </div>
        </div>
        <StageBadge stage={player.stage} />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <span className={`badge ${psych > 0 ? 'success' : 'danger'}`}>
          心理 {psych}
        </span>
        <span className={`badge ${phys > 0 ? 'success' : 'danger'}`}>
          身体 {phys}
        </span>
        <span
          className={`badge ${player.stress >= 75 ? 'danger' : player.stress >= 50 ? 'accent' : ''}`}
        >
          压力 {player.stress}/100
        </span>
        <span className={`badge ${player.fame >= 30 ? 'accent' : ''}`}>
          名气 {player.fame}
        </span>
        {player.restRounds > 0 && (
          <span className="badge danger">休养中（剩 {player.restRounds} 回合）</span>
        )}
        {player.stressMaxRounds > 0 && (
          <span className="badge danger">压力拉满 · 即将结束</span>
        )}
      </div>

      <div>
        {ORDER.map((k) => (
          <div className="stat-row" key={k}>
            <div>
              <div className="stat-label">{STAT_LABELS[k]}</div>
              <div className="stat-desc">{STAT_DESCRIPTION[k]}</div>
            </div>
            <div className="stat-value">{player.stats[k]}</div>
          </div>
        ))}
      </div>

      {promotion && promotion.reasons.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="panel-title">下一阶段需求</div>
          {promotion.reasons.map((r, i) => (
            <div key={i} className="stat-desc">
              · {r}
            </div>
          ))}
        </div>
      )}

      {promotion?.canPromote && promotion.to && (
        <div style={{ marginTop: 14 }}>
          <span className="badge success">
            条件已满足 → 下一回合可晋升 {STAGE_LABELS[promotion.to]}
          </span>
        </div>
      )}

      {playerTraits.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="panel-title">特质</div>
          <div>
            {playerTraits.map((t) => (
              <span key={t.id} className="trait-chip" title={t.description}>
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {player.tags.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="panel-title">标签</div>
          <div>
            {player.tags.map((tag) => (
              <span key={tag} className="trait-chip">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
