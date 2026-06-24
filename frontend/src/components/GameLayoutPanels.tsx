'use client';

import { useState } from 'react';
import type { CareerInsight, Player, RoundResult, SocialPost, Trait } from '@/lib/types';
import { STAGE_LABELS, formatTag } from '@/lib/format';

function pickRecommendation(insight: CareerInsight | null) {
  return insight?.recommendations?.[0] ?? null;
}

function groupTags(tags: string[]) {
  const buckets = {
    status: [] as string[],
    risk: [] as string[],
    cooldown: [] as string[],
    other: [] as string[],
  };

  for (const tag of tags) {
    if (tag.includes('cd') || tag.includes('cooldown')) buckets.cooldown.push(tag);
    else if (
      tag.includes('risk') ||
      tag.includes('injury') ||
      tag.includes('broke') ||
      tag.includes('stress') ||
      tag.includes('losing') ||
      tag.includes('conflict')
    ) buckets.risk.push(tag);
    else if (
      tag.includes('team') ||
      tag.includes('champion') ||
      tag.includes('fame') ||
      tag.includes('agent') ||
      tag.includes('scouted') ||
      tag.includes('has-') ||
      tag.includes('major') ||
      tag.includes('tournament')
    ) buckets.status.push(tag);
    else buckets.other.push(tag);
  }

  return buckets;
}

function TagChip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'gold' | 'red' | 'faint' | 'brand' | 'green' }) {
  return <span className={`profile-chip ${tone}`}>{label}</span>;
}

function PendingDepartureAlert({ player }: { player: Player }) {
  const departure = player.pendingDeparture;
  if (!departure) return null;

  const target = (player.roster ?? []).find((tm) => tm.id === departure.slotId);
  const roundsLeft = departure.departureRound - player.round;
  const pressure = departure.pressure ?? 0;
  const threshold = departure.pressureThreshold ?? 100;
  const isRevealed = Boolean(departure.revealed && target);
  const timeText = roundsLeft <= 1 ? '即将爆发' : `${roundsLeft} 回合后可能爆发`;
  const title = isRevealed
    ? `${target!.name} 离队风险 · ${roundsLeft <= 1 ? '即将离队' : `${roundsLeft} 回合后`}`
    : `队内离队传闻 · ${timeText}`;
  const context = isRevealed
    ? `${target!.name} 正在考虑 ${departure.destTeamName} 的邀请，可以在团队管理中尝试挽留。`
    : departure.rumorShown
      ? '队内已经出现转会传闻，但还没有明确是谁在接触外部队伍。等待相关事件确认后，才会开放具名挽留。'
      : '阵容稳定性正在恶化，暂时只是后台风险；出现转会传闻事件前，玩家不应该知道具体是谁。';

  return (
    <div className="profile-alert danger">
      <div className="profile-alert-title">{title}</div>
      <div className="profile-hint">离队压力 {pressure}/{threshold}</div>
      <div className="profile-hint subtle">{context}</div>
      {departure.reasonTags?.length ? (
        <div className="profile-chip-group">
          {departure.reasonTags.slice(0, 3).map((tag) => <TagChip key={tag} label={tag} tone="red" />)}
        </div>
      ) : null}
    </div>
  );
}

export function CareerSuggestionStrip({ insight }: { insight: CareerInsight | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const recommendation = pickRecommendation(insight);
  if (!insight || !recommendation) return null;

  return (
    <section className={`left-strip${collapsed ? ' collapsed' : ''}`}>
      <button
        type="button"
        className="left-strip-toggle"
        aria-label={collapsed ? '展开本周建议' : '收起本周建议'}
        title={collapsed ? '展开本周建议' : '收起本周建议'}
        onClick={() => setCollapsed((value) => !value)}
      />
      {collapsed ? (
        <span className="left-strip-collapsed-label">本周建议</span>
      ) : (
        <>
          <div className="left-strip-head">
            <span className="left-strip-icon">💡</span>
            <div>
              <div className="left-strip-title">{recommendation.title}</div>
              <div className="left-strip-subtitle">本周建议</div>
            </div>
            <span className={`left-strip-priority ${recommendation.priority}`}>{recommendation.priority === 'high' ? '高' : recommendation.priority === 'medium' ? '中' : '低'}</span>
          </div>
          <div className="left-strip-body">{recommendation.reason}</div>
          <div className="left-strip-hint">{recommendation.expectedBenefit}</div>
          {recommendation.tradeoff && <div className="left-strip-cost">代价：{recommendation.tradeoff}</div>}
        </>
      )}
    </section>
  );
}

export function CareerCalendarCard({
  player,
  insight,
}: {
  player: Player;
  insight: CareerInsight | null;
}) {
  const slots = [
    ...(Object.entries(player.qualificationSlots ?? {}).filter(([, count]) => count > 0).map(([slot, count]) => `${slot} ×${count}`)),
    ...(player.teamQualificationSlotBatches ?? []).flatMap((batch) => batch.count > 0 ? [`${batch.slot} ×${batch.count}`] : []),
  ];
  const opportunities = insight?.opportunities ?? [];
  const visible = opportunities.slice(0, 6);

  return (
    <section className="panel-shell">
      <div className="panel-shell-head">
        <span className="panel-shell-title">赛事日历</span>
        <span className="panel-shell-subtitle">未来 12 周赛程</span>
      </div>
      {slots.length > 0 && (
        <div className="panel-shell-band">
          {slots.slice(0, 4).map((slot) => (
            <TagChip key={slot} label={slot} tone="gold" />
          ))}
        </div>
      )}
      <div className="calendar-list">
        {visible.length > 0 ? visible.map((item) => (
          <div key={item.id} className="calendar-row">
            <span className="calendar-week">第 {item.week} 周</span>
            <span className={`calendar-tier tier-${item.tier}`}>{item.tier}</span>
            <span className="calendar-name">{item.name}</span>
            <span className={`calendar-action ${item.available === false ? 'locked' : 'open'}`}>
              {item.available === false ? item.status : '可报名'}
            </span>
          </div>
        )) : (
          <div className="panel-empty">暂无可见赛程</div>
        )}
      </div>
    </section>
  );
}

export function EventActivityPanel({
  history,
  socialPosts,
  socialLoading,
}: {
  history: RoundResult[];
  socialPosts?: SocialPost[];
  socialLoading?: boolean;
}) {
  const rows = [...history].reverse().slice(0, 10);

  return (
    <section className="event-activity-grid">
      <div className="event-focus">
        <div className="panel-shell-head tight">
          <span className="panel-shell-title">赛程时间线</span>
          <span className="panel-shell-subtitle">我的动态</span>
        </div>
        <div className="timeline-list">
          {rows.length > 0 ? rows.map((r) => (
            <div key={`${r.round}-${r.eventId}`} className="timeline-row">
              <div className="timeline-top">
                <span className="timeline-round">R{r.round}</span>
                <span className={`timeline-result ${r.success ? 'up' : 'down'}`}>{r.success ? '胜' : '负'}</span>
                <span className="timeline-title">{r.eventTitle}</span>
              </div>
              <div className="timeline-desc">→ {r.choiceLabel}</div>
              <div className="timeline-narrative">{r.narrative}</div>
            </div>
          )) : <div className="panel-empty">还没有记录</div>}
        </div>
      </div>

      <div className="event-feed">
        <div className="panel-shell-head tight">
          <span className="panel-shell-title">社区动态</span>
          <span className="panel-shell-subtitle">内部滚动</span>
        </div>
        <div className="feed-scroll">
          {socialLoading ? (
            <div className="panel-empty">加载中…</div>
          ) : socialPosts && socialPosts.length > 0 ? (
            socialPosts.map((post, i) => (
              <div key={`${post.handle}-${post.authorType}-${i}`} className="feed-card">
                <div className="feed-card-head">
                  <span className="feed-author">{post.author}</span>
                  <span className="feed-handle">{post.handle}</span>
                  <span className={`feed-role ${post.authorType}`}>{post.authorType}</span>
                </div>
                <div className="feed-card-body">{post.content}</div>
              </div>
            ))
          ) : (
            <div className="panel-empty">暂无社区动态</div>
          )}
        </div>
      </div>
    </section>
  );
}

export function PlayerProfilePanel({
  player,
  traits,
  insight,
}: {
  player: Player;
  traits: Trait[];
  insight: CareerInsight | null;
}) {
  const playerTraits = player.traits
    .map((id) => traits.find((t) => t.id === id))
    .filter((t): t is Trait => Boolean(t));
  const grouped = groupTags(player.tags);
  const milestone = insight?.milestones?.[0] ?? null;
  const pendingDeparture = player.pendingDeparture;

  return (
    <section className="profile-panel">
      <div className="profile-card">
        <div className="profile-card-head">
          <span className="profile-card-title">生涯战绩</span>
          <span className="profile-card-subtitle">{STAGE_LABELS[player.stage]}</span>
        </div>
        <div className="profile-metrics">
          <div className="profile-metric"><span>参赛</span><strong>{player.tournamentParticipations ?? 0}</strong></div>
          <div className="profile-metric gold"><span>夺冠</span><strong>{player.tournamentChampionships ?? 0}</strong></div>
          <div className="profile-metric"><span>A/B/C/S</span><strong>{[
            player.tierChampionships?.a ?? 0,
            player.tierChampionships?.b ?? 0,
            player.tierChampionships?.c ?? 0,
            player.tierChampionships?.s ?? 0,
          ].join('/')}</strong></div>
        </div>
      </div>

      <div className="profile-card">
        <div className="profile-card-head">
          <span className="profile-card-title">特质与标签</span>
        </div>
        {playerTraits.length > 0 && (
          <div className="profile-chip-group">
            {playerTraits.slice(0, 6).map((trait) => (
              <TagChip key={trait.id} label={trait.name} />
            ))}
          </div>
        )}
        <div className="profile-chip-group">
          {grouped.status.slice(0, 4).map((tag) => <TagChip key={tag} label={formatTag(tag)} tone="gold" />)}
          {grouped.risk.slice(0, 3).map((tag) => <TagChip key={tag} label={formatTag(tag)} tone="red" />)}
          {grouped.cooldown.slice(0, 3).map((tag) => <TagChip key={tag} label={formatTag(tag)} tone="faint" />)}
          {grouped.other.slice(0, 4).map((tag) => <TagChip key={tag} label={formatTag(tag)} />)}
        </div>
      </div>

      {milestone && (
        <div className="profile-card">
          <div className="profile-card-head">
            <span className="profile-card-title">下一目标</span>
            <span className="profile-card-subtitle">{milestone.status === 'ready' ? '已满足' : '推进中'}</span>
          </div>
          <div className="profile-copy">{milestone.title}</div>
          <div className="profile-hint">{milestone.progressText}</div>
          {milestone.nextStep && <div className="profile-hint subtle">{milestone.nextStep}</div>}
        </div>
      )}

      <div className="profile-card">
        <div className="profile-card-head">
          <span className="profile-card-title">风险预警</span>
        </div>
        {pendingDeparture && <PendingDepartureAlert player={player} />}
        {player.consecutiveLosses > 0 && (
          <div className="profile-alert danger">
            <div className="profile-alert-title">连续失利警告</div>
            <div className="profile-hint">已连续失利 {player.consecutiveLosses} 场</div>
          </div>
        )}
      </div>
    </section>
  );
}
