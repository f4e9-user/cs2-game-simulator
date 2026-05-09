import type { RoundResult, SocialPost, StatKey } from '@/lib/types';
import {
  EVENT_TYPE_LABELS,
  describeFeelChange,
  describeTiltChange,
  describeFatigueChange,
  describeStressChange,
  describeFameChange,
  describeStatChange,
  describeBuffAdded,
} from '@/lib/format';

const AUTHOR_TYPE_LABEL: Record<SocialPost['authorType'], string> = {
  teammate: '队友',
  club: '俱乐部',
  rival: '对手',
  media: '媒体',
};

const AUTHOR_TYPE_COLOR: Record<SocialPost['authorType'], string> = {
  teammate: 'var(--success)',
  club: '#60a5fa',
  rival: 'var(--danger)',
  media: 'var(--fg-3)',
};

interface Props {
  history: RoundResult[];
  socialPosts?: SocialPost[];
  socialLoading?: boolean;
}

export function FeedPanel({ history, socialPosts, socialLoading }: Props) {
  const rows = [...history].reverse().slice(0, 20);

  return (
    <>
      {/* ── 社区动态 ─────────────────────────────────────── */}
      <div className="feed-section-title" style={{ marginTop: 0 }}>社区动态</div>
      {socialLoading ? (
        <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--fg-3)' }}>
          加载中…
        </div>
      ) : socialPosts && socialPosts.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {socialPosts.map((post, i) => (
            <div
              key={i}
              style={{
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '7px 10px',
                fontSize: 11,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 11,
                    color: 'var(--fg-1)',
                    flexShrink: 0,
                  }}
                >
                  {post.author}
                </span>
                <span style={{ fontSize: 10, color: 'var(--fg-3)', flexShrink: 0 }}>
                  {post.handle}
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 9,
                    fontWeight: 700,
                    color: AUTHOR_TYPE_COLOR[post.authorType],
                    flexShrink: 0,
                    border: `1px solid ${AUTHOR_TYPE_COLOR[post.authorType]}`,
                    borderRadius: 3,
                    padding: '1px 4px',
                    opacity: 0.85,
                  }}
                >
                  {AUTHOR_TYPE_LABEL[post.authorType]}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-1)', lineHeight: 1.5 }}>
                {post.content}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--fg-3)', marginBottom: 8 }}>
          暂无社区动态
        </div>
      )}

      {/* ── 我的动态（历史事件）───────────────────────────── */}
      <div className="feed-section-title">我的动态</div>
      {rows.length === 0 ? (
        <div style={{ padding: '12px', fontSize: 11, color: 'var(--fg-3)' }}>
          还没有记录
        </div>
      ) : (
        rows.map((r) => {
          const deltas = Object.entries(r.statChanges) as [StatKey, number][];
          const buffsAdded = r.buffsAdded ?? [];
          const stressChange = r.stressChange ?? 0;
          const fameChange = r.fameChange ?? 0;
          const feelChange = r.feelChange ?? 0;
          const tiltChange = r.tiltChange ?? 0;
          const fatigueChange = r.fatigueChange ?? 0;
          const hasDeltas =
            deltas.length > 0 ||
            buffsAdded.length > 0 ||
            stressChange !== 0 ||
            fameChange !== 0 ||
            feelChange !== 0 ||
            tiltChange !== 0 ||
            fatigueChange !== 0;
          return (
            <div className="feed-item" key={`${r.round}-${r.eventId}`}>
              <div className="feed-item-top">
                <span className="feed-round-tag">R{r.round}</span>
                <span
                  className={`event-type-badge ${r.eventType}`}
                  style={{ fontSize: 9, padding: '1px 5px' }}
                >
                  {EVENT_TYPE_LABELS[r.eventType]}
                </span>
                <span className="feed-title">{r.eventTitle}</span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: r.success ? 'var(--success)' : 'var(--danger)',
                    flexShrink: 0,
                  }}
                >
                  {r.success ? '✓' : '✗'}
                </span>
              </div>
              <div className="feed-choice">→ {r.choiceLabel}</div>
              <div className="feed-narrative">{r.narrative}</div>
              {hasDeltas && (
                <div className="feed-deltas">
                  {feelChange !== 0 && (
                    <span className={`chip ${feelChange > 0 ? 'chip-up' : 'chip-down'}`}>
                      {describeFeelChange(feelChange)}
                    </span>
                  )}
                  {tiltChange !== 0 && (
                    <span className={`chip ${tiltChange > 0 ? 'chip-down' : 'chip-up'}`}>
                      {describeTiltChange(tiltChange)}
                    </span>
                  )}
                  {fatigueChange !== 0 && (
                    <span className={`chip ${fatigueChange > 0 ? 'chip-down' : 'chip-up'}`}>
                      {describeFatigueChange(fatigueChange)}
                    </span>
                  )}
                  {stressChange !== 0 && (
                    <span className={`chip ${stressChange > 0 ? 'chip-down' : 'chip-up'}`}>
                      {describeStressChange(stressChange)}
                    </span>
                  )}
                  {fameChange !== 0 && (
                    <span className={`chip ${fameChange >= 0 ? 'chip-up' : 'chip-down'}`}>
                      {describeFameChange(fameChange)}
                    </span>
                  )}
                  {deltas.map(([k, v]) => (
                    <span key={k} className={`chip ${v >= 0 ? 'chip-up' : 'chip-down'}`}>
                      {describeStatChange(k, v)}
                    </span>
                  ))}
                  {buffsAdded.map((b) => (
                    <span key={b.id} className="chip chip-buff">
                      {describeBuffAdded(b)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
