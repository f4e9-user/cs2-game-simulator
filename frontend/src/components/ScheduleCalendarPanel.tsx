'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { CareerInsight, Player, TournamentWithResult } from '@/lib/types';
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
  sessionId,
  player,
  insight,
  busyTournamentId,
  onSignup,
}: {
  sessionId: string;
  player: Player;
  insight: CareerInsight | null;
  busyTournamentId?: string | null;
  onSignup?: (tournamentId: string) => void;
}) {
  const [scope, setScope] = useState<'stage' | 'all'>('stage');
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [yearTournaments, setYearTournaments] = useState<TournamentWithResult[]>([]);
  const [openTournamentIds, setOpenTournamentIds] = useState<Set<string>>(new Set());
  const [tournamentLoading, setTournamentLoading] = useState(false);
  const year = player.year ?? 1;
  const week = player.week ?? 1;
  const blocks = insight?.calendarBlocks ?? [];
  const qualifications = qualificationLabels(player);
  const currentStage = player.stage;

  useEffect(() => {
    let cancelled = false;
    setTournamentLoading(true);
    Promise.all([
      api.listAllTournaments(sessionId),
      api.listTournaments(sessionId).catch(() => ({ open: [], pendingMatch: null })),
    ])
      .then(([allRes, openRes]) => {
        if (cancelled) return;
        setYearTournaments(allRes.tournaments);
        setOpenTournamentIds(new Set(openRes.open.map((tournament) => tournament.id)));
      })
      .catch(() => {
        if (!cancelled) {
          setYearTournaments([]);
          setOpenTournamentIds(new Set());
        }
      })
      .finally(() => {
        if (!cancelled) setTournamentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const visibleBlocks = blocks.filter((block) => (
    scope === 'all' || block.kind !== 'opportunity' || block.status !== '阶段不符'
  ));
  const listTournaments = useMemo(() => {
    const tournaments = scope === 'stage'
      ? yearTournaments.filter((tournament) => tournament.stages.includes(currentStage))
      : yearTournaments;
    return [...tournaments].sort((a, b) => {
      const aWeek = Array.isArray(a.signupWeeks) ? Math.min(...a.signupWeeks) : 1;
      const bWeek = Array.isArray(b.signupWeeks) ? Math.min(...b.signupWeeks) : 1;
      return aWeek - bWeek || a.name.localeCompare(b.name);
    });
  }, [currentStage, scope, yearTournaments]);
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
          <div className="schedule-subtitle">{view === 'calendar' ? `Y${year} W${week} 起 · 未来 12 周` : `Y${year} 全年赛事列表`}</div>
        </div>
        <div className="schedule-header-actions">
          <div className="schedule-view" role="group" aria-label="赛事视图">
            <button
              type="button"
              className={view === 'calendar' ? 'active' : ''}
              onClick={() => setView('calendar')}
            >
              日历
            </button>
            <button
              type="button"
              className={view === 'list' ? 'active' : ''}
              onClick={() => setView('list')}
            >
              列表
            </button>
          </div>
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

      {view === 'calendar' ? (
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
      ) : (
        <div className="schedule-list">
          {tournamentLoading ? (
            <div className="schedule-list-empty">加载赛事中…</div>
          ) : listTournaments.length > 0 ? listTournaments.map((tournament) => {
            const allowed = tournament.stages.includes(currentStage);
            const open = openTournamentIds.has(tournament.id);
            const signupWeeks = tournament.signupWeeks === 'always'
              ? '每周'
              : tournament.signupWeeks.map((w) => `W${w}`).join(' / ');
            return (
              <div key={tournament.id} className={`schedule-list-row${tournament.isEnded ? ' ended' : ''}${open ? ' open' : ''}${allowed ? '' : ' locked'}`}>
                <div className="schedule-list-main">
                  <div className="schedule-list-top">
                    <span className="schedule-list-week">{signupWeeks}</span>
                    <span className={`schedule-tier tier-${tournament.tier}`}>{tournament.displayName}</span>
                  </div>
                  <div className="schedule-list-title">{tournament.name}</div>
                  {tournament.isEnded && (
                    <div
                      className="schedule-list-result"
                      title={tournament.resultYear != null && tournament.resultWeek != null ? `Y${tournament.resultYear} W${tournament.resultWeek}` : undefined}
                    >
                      已结束 · 冠军：{tournament.championName ?? '未知'} · 亚军：{tournament.runnerUpName ?? '未知'}
                    </div>
                  )}
                  <div className="schedule-list-meta">
                    <span>{tournament.brand}</span>
                    <span>{tournament.region ?? '全球'}</span>
                    <span>{tournament.stages.join(' / ')}</span>
                  </div>
                </div>
                <div className="schedule-list-side">
                  <span className={`schedule-list-status ${tournament.isEnded ? 'ended' : allowed ? 'allowed' : 'blocked'}`}>
                    {tournament.isEnded ? '已结束' : allowed ? '我的阶段' : '其他阶段'}
                  </span>
                  <span className={`schedule-list-status ${tournament.isEnded ? 'ended' : open ? 'open' : 'locked'}`}>
                    {tournament.isEnded ? '结果已出' : open ? '当前可报名' : '未开放'}
                  </span>
                  {!tournament.isEnded && open && tournament.id && (
                    <button
                      type="button"
                      className="schedule-signup"
                      disabled={busyTournamentId === tournament.id}
                      onClick={() => onSignup?.(tournament.id)}
                    >
                      {busyTournamentId === tournament.id ? '…' : '报名'}
                    </button>
                  )}
                </div>
              </div>
            );
          }) : (
            <div className="schedule-list-empty">暂无赛事</div>
          )}
        </div>
      )}
    </section>
  );
}
