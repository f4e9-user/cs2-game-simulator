'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { SessionSummary } from '@/lib/types';

function fmt(ts: string): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

export default function DebugSessionsPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [aiStatus, setAiStatus] = useState<{ provider: string; model: string | null; active: boolean; kvBound: boolean } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionRes, statusRes] = await Promise.all([
        api.listDebugSessions(300),
        api.getDebugAiStatus().catch(() => null),
      ]);
      setSessions(sessionRes.sessions ?? []);
      if (statusRes) setAiStatus(statusRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) =>
      [s.id, s.name, s.stage, s.status, s.ending ?? ''].some((v) => v.toLowerCase().includes(q)),
    );
  }, [filter, sessions]);

  return (
    <div className="layout">
      <div className="hero" style={{ paddingBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <h1 style={{ marginBottom: 6 }}>Session Browser</h1>
            <p>查看所有 sessionId，点进详情页做调试。</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/debug" className="ghost-button">LLM 日志</Link>
            <button type="button" className="primary-button" onClick={() => void refresh()} disabled={loading}>
              {loading ? '刷新中…' : '刷新'}
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">AI 状态</div>
        {aiStatus ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13, color: '#8b949e' }}>
            <span>AI: {aiStatus.active ? '启用' : '未启用'}</span>
            <span>Provider: {aiStatus.provider}</span>
            {aiStatus.model && <span>Model: {aiStatus.model}</span>}
            <span>KV: {aiStatus.kvBound ? '已绑定' : '未绑定'}</span>
          </div>
        ) : (
          <div className="stat-desc">未加载。</div>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">会话过滤</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="按 sessionId / name / stage / status 搜索"
            style={{
            flex: 1,
            background: '#0d1117',
            color: '#e6edf3',
            border: '1px solid #21262d',
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 13,
            }}
          />
          <span style={{ fontSize: 12, color: '#8b949e' }}>
            {visible.length} / {sessions.length}
          </span>
        </div>
      </div>

      {error && (
        <div className="panel" style={{ borderColor: 'rgba(248,81,73,0.35)', color: '#f85149' }}>
          {error}
        </div>
      )}

      <div className="panel" style={{ padding: 0 }}>
        <div className="panel-title" style={{ padding: '14px 14px 0', marginBottom: 0 }}>Sessions</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 0.7fr 0.7fr 1fr 1fr', gap: 12, padding: '10px 14px', fontSize: 11, color: '#3d444d', borderBottom: '1px solid #21262d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <span>Session</span>
          <span>名称</span>
          <span>阶段</span>
          <span>回合</span>
          <span>状态</span>
          <span>更新时间</span>
        </div>
        {visible.length === 0 ? (
          <div style={{ padding: 24, color: '#8b949e', fontSize: 13 }}>
            {loading ? '加载中…' : '没有可显示的 session。'}
          </div>
        ) : (
          visible.map((s) => (
            <Link
              key={s.id}
              href={`/debug/sessions/${s.id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '2.2fr 1fr 0.7fr 0.7fr 1fr 1fr',
                gap: 12,
                padding: '12px 14px',
                borderBottom: '1px solid #161b22',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <span style={{ fontFamily: 'monospace', color: '#c9d1d9' }}>{s.id}</span>
              <span style={{ color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              <span style={{ color: '#8b949e' }}>{s.stage}</span>
              <span style={{ color: '#8b949e' }}>{s.round}</span>
              <span style={{ color: s.status === 'active' ? '#3fb950' : '#8b949e' }}>{s.status}</span>
              <span style={{ color: '#8b949e', fontSize: 12 }}>{fmt(s.updatedAt)}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
