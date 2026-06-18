import Link from 'next/link';
import type { Player, Trait } from '@/lib/types';
import { ENDING_LABELS, STAGE_LABELS, STAT_LABELS, formatTag } from '@/lib/format';

const TIER_LABELS: Record<string, string> = {
  c: 'C 级赛事',
  b: 'B 级赛事',
  a: 'A 级赛事',
  s: 'S 级赛事',
  's-qualifier': 'S 级预选',
  's-main': 'S 级正赛',
  's-class': 'S 级联赛',
  major: 'Major',
};

const CHAMPIONSHIP_TIER_ORDER = [
  'c',
  'b',
  'a',
  's',
];

const S_SERIES_LABELS: Record<string, string> = {
  pgl: 'PGL',
  blast: 'BLAST',
  major: 'Major',
};

const S_SERIES_ORDER = ['pgl', 'blast', 'major'];

const CORE_STATS = [
  'intelligence',
  'agility',
  'experience',
  'mentality',
  'constitution',
] as const;

interface Props {
  player: Player;
  traits: Trait[];
  ending?: string;
}

export function EndingPanel({ player, traits, ending }: Props) {
  const playerTraits = player.traits
    .map((id) => traits.find((t) => t.id === id))
    .filter((t): t is Trait => Boolean(t));

  const visibleTags = player.tags.filter((tag) => !tag.endsWith('-cd'));

  const totalRounds = player.round;
  const years = player.year ?? 1;
  const weeks = player.week ?? 1;

  const isLegend = ending === 'legend';
  const isChampion = ending === 'champion' || ending === 'retired_on_top';

  return (
    <div className="ending-panel-rich">
      {/* Header */}
      <div className="ending-rich-header">
        <div className="ending-rich-label">生涯结束</div>
        <div className={`ending-rich-result${isLegend ? ' legend' : isChampion ? ' champion' : ''}`}>
          {ending ? (ENDING_LABELS[ending] ?? ending) : '未知结局'}
        </div>
      </div>

      {/* Career timeline */}
      <div className="ending-section">
        <div className="ending-section-title">生涯轨迹</div>
        <div className="ending-timeline-row">
          <div className="ending-timeline-cell">
            <div className="ending-tl-val">Y{years} W{weeks}</div>
            <div className="ending-tl-label">结束时间</div>
          </div>
          <div className="ending-timeline-sep" />
          <div className="ending-timeline-cell">
            <div className="ending-tl-val">{totalRounds}</div>
            <div className="ending-tl-label">总回合数</div>
          </div>
          <div className="ending-timeline-sep" />
          <div className="ending-timeline-cell">
            <div className="ending-tl-val">{STAGE_LABELS[player.stage]}</div>
            <div className="ending-tl-label">最终阶段</div>
          </div>
        </div>
      </div>

      {/* Resources */}
      <div className="ending-section">
        <div className="ending-section-title">关键数值</div>
        <div className="ending-resources-row">
          <div className="ending-resource-cell">
            <div className="ending-resource-val fame">{player.fame ?? 0}</div>
            <div className="ending-resource-label">人气</div>
          </div>
          <div className="ending-resource-cell">
            <div className="ending-resource-val money">
              {Math.round(player.stats.money)}K
            </div>
            <div className="ending-resource-label">资金</div>
          </div>
          <div className={`ending-resource-cell`}>
            <div className={`ending-resource-val stress${player.stress >= 80 ? ' danger' : player.stress >= 50 ? ' warn' : ''}`}>
              {player.stress ?? 0}
            </div>
            <div className="ending-resource-label">压力</div>
          </div>
        </div>
      </div>

      {/* Core stats */}
      <div className="ending-section">
        <div className="ending-section-title">隐藏五维</div>
        <div className="ending-stats-list">
          {CORE_STATS.map((key) => {
            const val = player.stats[key] ?? 0;
            const pct = Math.min(100, (val / 20) * 100);
            const colorClass = pct >= 60 ? 'high' : pct >= 35 ? 'mid' : 'low';
            return (
              <div key={key} className="ending-stat-row">
                <div className="ending-stat-label">{STAT_LABELS[key]}</div>
                <div className="ending-stat-bar-wrap">
                  <div className="ending-stat-bar">
                    <div
                      className={`ending-stat-bar-fill ${colorClass}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="ending-stat-val">{val.toFixed(1)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Team history */}
      {player.team ? (
        <div className="ending-section">
          <div className="ending-section-title">战队历史</div>
          <div className="ending-team-summary">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                  {player.team.name} [{player.team.tag}]
                </span>
                <span className="badge success" style={{ fontSize: 10 }}>
                  {player.team.tier.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--fg-2)' }}>
                <span>{player.team.region}</span>
                <span>加入于第 {player.team.joinedRound} 回合</span>
                <span>效力 {player.round - player.team.joinedRound} 回合</span>
              </div>
              {(player.contractRenewals ?? 0) > 0 && (
                <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 2 }}>
                  续约 {player.contractRenewals} 次
                </div>
              )}
            </div>
          </div>
        </div>
      ) : player.everHadTeam ? (
        <div className="ending-section">
          <div className="ending-section-title">战队历史</div>
          <div style={{ fontSize: 12, color: 'var(--fg-2)' }}>
            曾签约战队，退役时为自由人
          </div>
        </div>
      ) : (
        <div className="ending-section">
          <div className="ending-section-title">战队历史</div>
          <div style={{ fontSize: 12, color: 'var(--fg-2)' }}>
            全程自由人，从未签约任何战队
          </div>
        </div>
      )}

      {/* Tournament history */}
      <div className="ending-section">
        <div className="ending-section-title">赛事生涯</div>
        <div className="ending-tourney-summary">
          <span className="ending-tourney-stat">
            参赛 <strong>{player.tournamentParticipations ?? 0}</strong> 次
          </span>
          <span className="ending-tourney-sep">·</span>
          <span className={`ending-tourney-stat${(player.tournamentChampionships ?? 0) > 0 ? ' gold' : ''}`}>
            夺冠 <strong>{player.tournamentChampionships ?? 0}</strong> 次
          </span>
        </div>
        <div className="ending-champ-list">
          {CHAMPIONSHIP_TIER_ORDER.map((tier) => (
            <span key={tier} className="ending-champ-chip">
              {TIER_LABELS[tier]} ×{player.tierChampionships?.[tier] ?? 0}
            </span>
          ))}
        </div>
        <div className="ending-champ-list">
          {S_SERIES_ORDER.map((series) => (
            <span key={series} className="ending-champ-chip">
              {S_SERIES_LABELS[series]} ×{player.championshipSeries?.[series] ?? 0}
            </span>
          ))}
        </div>
      </div>

      {/* Traits */}
      {playerTraits.length > 0 && (
        <div className="ending-section">
          <div className="ending-section-title">开局特质</div>
          <div className="ending-traits-list">
            {playerTraits.map((t) => (
              <div key={t.id} className="ending-trait-item">
                <div className="ending-trait-name">{t.name}</div>
                <div className="ending-trait-desc">{t.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {visibleTags.length > 0 && (
        <div className="ending-section">
          <div className="ending-section-title">生涯标签</div>
          <div className="ending-tags-list">
            {visibleTags.map((tag) => (
              <span key={tag} className="ending-tag-chip" title={tag}>#{formatTag(tag)}</span>
            ))}
          </div>
        </div>
      )}

      {/* Restart */}
      <div className="ending-footer">
        <Link href="/" className="primary-button">
          再来一次
        </Link>
      </div>
    </div>
  );
}
