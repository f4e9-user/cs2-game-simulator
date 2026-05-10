'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface LlmLogEntry {
  id: string;
  ts: string;
  method: string;
  provider: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  response: string | null;
  latencyMs: number;
  stream: boolean;
}

const METHOD_COLORS: Record<string, string> = {
  narrate: '#ff5b1f',
  narrateStream: '#ff8a5c',
  summarize: '#3fb950',
  intro: '#58a6ff',
  personalizeEvent: '#d2a8ff',
  judgeCustomAction: '#ffa657',
  validateJudgment: '#f0883e',
  simulateSocialFeed: '#79c0ff',
};

function methodColor(method: string): string {
  return METHOD_COLORS[method] ?? '#8b949e';
}

function fmtTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          color: '#8b949e',
          fontSize: 12,
          cursor: 'pointer',
          padding: '2px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 10 }}>{collapsed ? '▶' : '▼'}</span>
        <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ color: '#3d444d' }}>({text.length} chars)</span>
      </button>
      {!collapsed && (
        <pre
          style={{
            margin: '6px 0 0',
            padding: '10px 12px',
            background: '#070a0e',
            border: '1px solid #21262d',
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.6,
            color: '#c9d1d9',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 400,
            overflowY: 'auto',
          }}
        >
          {text || <span style={{ color: '#3d444d' }}>(empty)</span>}
        </pre>
      )}
    </div>
  );
}

function LogRow({ entry, expanded, onToggle }: { entry: LlmLogEntry; expanded: boolean; onToggle: () => void }) {
  return (
    <div
      style={{
        borderBottom: '1px solid #21262d',
        background: expanded ? '#0d1117' : 'transparent',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          color: 'inherit',
          padding: '10px 16px',
          display: 'grid',
          gridTemplateColumns: '20px 130px 1fr 80px 70px 56px',
          gap: 12,
          alignItems: 'center',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: 13,
        }}
      >
        <span style={{ color: '#3d444d', fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
        <span style={{ color: '#8b949e', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
          {fmtTime(entry.ts)}
        </span>
        <span style={{ color: methodColor(entry.method), fontWeight: 600 }}>
          {entry.method}
          {entry.stream && (
            <span style={{ marginLeft: 6, fontSize: 10, color: '#8b949e', fontWeight: 400 }}>stream</span>
          )}
        </span>
        <span style={{ color: '#8b949e', fontSize: 12 }}>{entry.model.split('-').slice(0, 2).join('-')}</span>
        <span
          style={{
            textAlign: 'right',
            color: entry.latencyMs > 3000 ? '#f85149' : entry.latencyMs > 1500 ? '#d29922' : '#3fb950',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 12,
          }}
        >
          {entry.latencyMs}ms
        </span>
        <span
          style={{
            textAlign: 'right',
            fontSize: 11,
            color: entry.response ? '#3fb950' : '#f85149',
          }}
        >
          {entry.response ? `${entry.response.length}c` : 'null'}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 14px', borderTop: '1px solid #161b22' }}>
          <div style={{ marginTop: 10 }}>
            <PromptBlock label="System Prompt" text={entry.systemPrompt} />
            <PromptBlock label="User Prompt" text={entry.userPrompt} />
            <PromptBlock label="Response" text={entry.response ?? '(null)'} />
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: '#3d444d' }}>
            provider: {entry.provider} · id: {entry.id}
          </div>
        </div>
      )}
    </div>
  );
}

const ALL_METHODS = Object.keys(METHOD_COLORS);

export default function LlmDebugPage() {
  const [logs, setLogs] = useState<LlmLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const apiBase =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://127.0.0.1:8787'
      : '';

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/debug/llm-logs?limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { logs: LlmLogEntry[] };
      setLogs(data.logs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => { void fetchLogs(); }, 3000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchLogs]);

  const visible = filter === 'all' ? logs : logs.filter((l) => l.method === filter);

  const methodCounts = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.method] = (acc[l.method] ?? 0) + 1;
    return acc;
  }, {});

  const avgLatency = logs.length > 0
    ? Math.round(logs.reduce((s, l) => s + l.latencyMs, 0) / logs.length)
    : 0;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 64px', fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: '#e6edf3' }}>LLM Debug</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#8b949e' }}>
            查看最近 100 条 LLM 调用 · prompt / response review
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: '#8b949e', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ accentColor: '#ff5b1f' }}
            />
            每 3s 刷新
          </label>
          <button
            onClick={() => void fetchLogs()}
            disabled={loading}
            style={{
              background: '#ff5b1f',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '加载中…' : '刷新'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          padding: '10px 16px',
          background: '#0d1117',
          border: '1px solid #21262d',
          borderRadius: 8,
          marginBottom: 16,
          flexWrap: 'wrap',
          fontSize: 13,
        }}
      >
        <span style={{ color: '#8b949e' }}>共 <strong style={{ color: '#e6edf3' }}>{logs.length}</strong> 条</span>
        <span style={{ color: '#8b949e' }}>均延迟 <strong style={{ color: avgLatency > 2000 ? '#f85149' : '#3fb950' }}>{avgLatency}ms</strong></span>
        {ALL_METHODS.map((m) =>
          methodCounts[m] ? (
            <span key={m} style={{ color: methodColor(m) }}>
              {m}: {methodCounts[m]}
            </span>
          ) : null,
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['all', ...ALL_METHODS] as string[]).map((m) => (
          <button
            key={m}
            onClick={() => setFilter(m)}
            style={{
              background: filter === m ? (m === 'all' ? '#21262d' : methodColor(m)) : 'transparent',
              color: filter === m ? '#fff' : '#8b949e',
              border: `1px solid ${filter === m ? 'transparent' : '#21262d'}`,
              borderRadius: 20,
              padding: '3px 10px',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: filter === m ? 600 : 400,
            }}
          >
            {m}
            {m !== 'all' && methodCounts[m] ? ` (${methodCounts[m]})` : ''}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(248,81,73,0.1)',
            border: '1px solid #f85149',
            borderRadius: 6,
            color: '#f85149',
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error} — 请确认 Worker 在本地运行（http://127.0.0.1:8787）
        </div>
      )}

      {/* Table header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '20px 130px 1fr 80px 70px 56px',
          gap: 12,
          padding: '6px 16px',
          fontSize: 11,
          color: '#3d444d',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          borderBottom: '1px solid #21262d',
        }}
      >
        <span />
        <span>时间</span>
        <span>方法</span>
        <span>模型</span>
        <span style={{ textAlign: 'right' }}>延迟</span>
        <span style={{ textAlign: 'right' }}>响应</span>
      </div>

      {/* Log rows */}
      <div style={{ border: '1px solid #21262d', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
        {visible.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#3d444d', fontSize: 13 }}>
            {loading ? '加载中…' : '暂无记录。触发任意 LLM 调用后数据将出现在这里。'}
          </div>
        ) : (
          visible.map((entry) => (
            <LogRow
              key={entry.id}
              entry={entry}
              expanded={expandedId === entry.id}
              onToggle={() => setExpandedId((prev) => (prev === entry.id ? null : entry.id))}
            />
          ))
        )}
      </div>

      <p style={{ marginTop: 16, fontSize: 11, color: '#3d444d' }}>
        此页面仅在本地 Worker 运行时可用（isLocalDebugRequest 检查）· 日志 KV TTL 24h · 最多保留 100 条
      </p>
    </div>
  );
}
