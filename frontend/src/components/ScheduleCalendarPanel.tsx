'use client';

import { useState } from 'react';
import type { CareerInsight, Player } from '@/lib/types';
import { PreMatchPreview } from '@/components/MatchPanel';

type CalendarBlock = NonNullable<CareerInsight['calendarBlocks']>[number];

function addWeeks(year: number, week: number, offset: number): { year: number; week: number } {
  let y = year;
  let w = week + offset;
  while (w > 48) {
    w -= 48;
    y += 1;
  }
  return { year: y, week: w };
}

function blockSort(a: CalendarBlock, b: CalendarBlock): number {
  const priority: Record<CalendarBlock['kind'], number> = {
    match: 0,
    commitment: 1,
    prep: 2,
    travel: 3,
    recovery: 4,
    opportunity: 5,
    empty: 9,
  };
  return priority[a.kind] - priority[b.kind] || a.title.localeCompare(b.title);
}

function qualificationLabels(player: Player): string[] {
  return [
    ...Object.entries(player.qualificationSlots ?? {}).filter(([, count]) => count > 0).map(([slot, count]) => `${slot} ×${count}`),
    ...Object.entries(player.teamQualificationSlots ?? {}).filter(([, count]) => count > 0).map(([slot, count]) => `战队 ${slot} ×${count}`),
  ];
}

export function ScheduleCalendarPanel({
  player,
  insight,
  busyTournamentId,
  onSignup,
}: {
  player: Player;
  insight: CareerInsight | null;
  busyTournamentId?: string | null;
  onSignup?: (tournamentId: string) => void;
}) {
  const [scope, setScope] = useState<'stage' | 'all'>('stage');
  const year = player.year ?? 1;
  const week = player.week ?? 1;
  const blocks = insight?.calendarBlocks ?? [];
  const qualifications = qualificationLabels(player);
  const visibleBlocks = blocks.filter((block) => (
    scope === 'all' || block.kind !== 'opportunity' || block.status !== '阶段不符'
  ));
  const cells = Array.from({ length: 12 }, (_, offset) => {
    const date = addWeeks(year, week, offset);
    const cellBlocks = visibleBlocks
      .filter((block) => block.year === date.year && block.week === date.week)
      .sort(blockSort);
    return { ...date, blocks: cellBlocks, isCurrent: offset === 0 };
  });

  return (
    <section className="schedule-page">
      <div className="schedule-header">
        <div>
          <div className="schedule-title">赛事日历</div>
          <div className="schedule-subtitle">Y{year} W{week} 起 · 未来 12 周</div>
        </div>
        <div className="schedule-header-actions">
          <div className="schedule-scope" role="group" aria-label="赛事显示范围">
            <button
              type="button"
              className={scope === 'stage' ? 'active' : ''}
              onClick={() => setScope('stage')}
            >
              我的阶段
            </button>
            <button
              type="button"
              className={scope === 'all' ? 'active' : ''}
              onClick={() => setScope('all')}
            >
              全部赛事
            </button>
          </div>
          <div className="schedule-qualifiers">
            {qualifications.length > 0 ? qualifications.map((item) => (
              <span key={item} className="schedule-qualifier">{item}</span>
            )) : <span className="schedule-qualifier muted">暂无资格票</span>}
          </div>
        </div>
      </div>

      {player.pendingMatch && (
        <div className="schedule-pre-match">
          <div className="schedule-pre-match-head">
            <div>
              <div className="schedule-pre-match-title">{player.pendingMatch.displayName ?? player.pendingMatch.name}</div>
              <div className="schedule-pre-match-meta">
                Y{player.pendingMatch.resolveYear} W{player.pendingMatch.resolveWeek} · 阶段 {player.pendingMatch.stageIndex + 1}
              </div>
            </div>
            <span className="schedule-pre-match-status">
              {player.pendingMatch.resolveYear === year && player.pendingMatch.resolveWeek === week ? '比赛周' : '备赛中'}
            </span>
          </div>
          <PreMatchPreview player={player} pendingMatch={player.pendingMatch} title="赛前状态反馈" />
        </div>
      )}

      <div className="schedule-grid">
        {cells.map((cell) => (
          <div
            key={`${cell.year}-${cell.week}`}
            className={`schedule-cell${cell.isCurrent ? ' current' : ''}`}
            aria-current={cell.isCurrent ? 'date' : undefined}
          >
            <div className="schedule-cell-head">
              <span>W{cell.week}</span>
              <span className="schedule-cell-meta">
                {cell.isCurrent && <span className="schedule-current-badge">本周</span>}
                {cell.year !== year && <span>Y{cell.year}</span>}
              </span>
            </div>
            <div className="schedule-cell-body">
              {cell.blocks.length > 0 ? cell.blocks.slice(0, 3).map((block) => (
                <div key={block.id} className={`schedule-block ${block.tone} ${block.kind}`}>
                  <div className="schedule-block-row">
                    {block.tier && <span className="schedule-tier">{block.tier}</span>}
                    <span className="schedule-status">{block.status}</span>
                  </div>
                  <div className="schedule-block-title" title={block.title}>{block.shortTitle}</div>
                  {block.detail && block.detail !== block.status && (
                    <div className="schedule-block-detail">{block.detail}</div>
                  )}
                  {block.action === 'signup' && block.tournamentId && (
                    <button
                      type="button"
                      className="schedule-signup"
                      disabled={busyTournamentId === block.tournamentId}
                      onClick={() => onSignup?.(block.tournamentId!)}
                    >
                      {busyTournamentId === block.tournamentId ? '…' : '报名'}
                    </button>
                  )}
                </div>
              )) : (
                <div className="schedule-block neutral empty">
                  <div className="schedule-block-title">空档</div>
                  <div className="schedule-block-detail">训练 / 恢复窗口</div>
                </div>
              )}
              {cell.blocks.length > 3 && <div className="schedule-more">+{cell.blocks.length - 3}</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
