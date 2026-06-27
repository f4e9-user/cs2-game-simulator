'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EndingPanel } from '@/components/EndingPanel';
import { api } from '@/lib/api';
import { ENDING_LABELS } from '@/lib/format';
import type { GameSession, Trait } from '@/lib/types';

export default function GameSummaryPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const tokenKey = `api-token-${sessionId}`;

  const [session, setSession] = useState<GameSession | null>(null);
  const [traits, setTraits] = useState<Trait[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [ending, setEnding] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSummaryLoading(true);
    setError(null);
    setSummaryError(null);

    const token = sessionStorage.getItem(tokenKey) ?? undefined;
    Promise.all([
      api.getSession(sessionId, token),
      api.listTraits(),
    ])
      .then(async ([sessionRes, traitsRes]) => {
        if (cancelled) return;
        setSession(sessionRes);
        setTraits(traitsRes.traits);
        setEnding(sessionRes.ending ?? null);

        if (!token) {
          setSummaryError('缺少结算鉴权信息，无法拉取 LLM 总结。');
          return;
        }

        try {
          const summaryRes = await api.getSummary(sessionId, token);
          if (cancelled) return;
          setSummary(summaryRes.summary);
          setEnding(summaryRes.ending ?? sessionRes.ending ?? null);
        } catch (e) {
          if (!cancelled) {
            setSummaryError(e instanceof Error ? e.message : String(e));
          }
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setSummaryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, tokenKey]);

  const visibleHistory = useMemo(() => {
    if (!session) return [];
    return showAllHistory ? session.history : session.history.slice(-8);
  }, [session, showAllHistory]);

  if (loading && !session) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--fg-2)' }}>
        正在加载结算页…
      </div>
    );
  }

  if (error || !session) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', color: 'var(--fg-2)' }}>
          <div style={{ marginBottom: 12 }}>{error ?? '找不到这个生涯记录'}</div>
          <Link href="/" className="primary-button">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  const visibleCount = visibleHistory.length;
  const totalCount = session.history.length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: 16 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 6 }}>游戏结算</div>
            <h1 style={{ margin: 0, fontSize: 26, lineHeight: 1.2 }}>{session.player.name} 的生涯总结</h1>
            <div style={{ marginTop: 8, color: 'var(--fg-2)', fontSize: 13 }}>
              {ENDING_LABELS[ending ?? ''] ?? ending ?? '结局未知'}
            </div>
          </div>
          <Link href="/" className="ghost-button">
            返回首页
          </Link>
        </div>

        <section className="panel-shell">
          <div className="panel-shell-head">
            <span className="panel-shell-title">LLM 结算</span>
            <span className="panel-shell-subtitle">
              {summaryLoading ? '生成中…' : summary ? '已生成' : '未生成'}
            </span>
          </div>
          {summary ? (
            <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--fg)' }}>{summary}</div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>
              {summaryError ?? '正在等待总结结果…'}
            </div>
          )}
        </section>

        <section style={{ display: 'grid', gap: 10 }}>
          {session.history.length > 8 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>
                {showAllHistory ? `当前展示全部 ${totalCount} 回合` : `当前展示最近 ${visibleCount} / ${totalCount} 回合`}
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowAllHistory((value) => !value)}
              >
                {showAllHistory ? '只看最近' : '展开全部'}
              </button>
            </div>
          )}
          <EndingPanel player={session.player} traits={traits} ending={ending ?? undefined} history={visibleHistory} />
        </section>
      </div>
    </div>
  );
}
