'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { GameSession, SessionSummary } from '@/lib/types';

type DebugAiStatus = {
  provider: string;
  model: string | null;
  active: boolean;
  kvBound: boolean;
};

type FormState = {
  money: string;
  stage: string;
  fame: string;
  stress: string;
  ownedItems: string;
  round: string;
  consecutiveLosses: string;
  forceNextEvent: string;
  forceMatchResult: '' | 'win' | 'loss';
  teamMonthlySalary: string;
  teamTier: string;
  pendingMatch: string;
};

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function initForm(session: GameSession): FormState {
  return {
    money: String(session.player.stats.money ?? 0),
    stage: session.player.stage,
    fame: String(session.player.fame ?? 0),
    stress: String(session.player.stress ?? 0),
    ownedItems: session.player.ownedItems.join(', '),
    round: String(session.player.round ?? 0),
    consecutiveLosses: String(session.player.consecutiveLosses ?? 0),
    forceNextEvent: session.player.forceNextEvent ?? '',
    forceMatchResult: session.player.forceMatchResult ?? '',
    teamMonthlySalary: session.player.team ? String(session.player.team.monthlySalary) : '',
    teamTier: session.player.team?.tier ?? '',
    pendingMatch: session.player.pendingMatch ? pretty(session.player.pendingMatch) : '',
  };
}

export default function DebugSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const [session, setSession] = useState<GameSession | null>(null);
  const [aiStatus, setAiStatus] = useState<DebugAiStatus | null>(null);
  const [aiEvents, setAiEvents] = useState<unknown[]>([]);
  const [aiEventsMessage, setAiEventsMessage] = useState<string | null>(null);
  const [aiEventsValidCount, setAiEventsValidCount] = useState<number | null>(null);
  const [aiEventsInvalidCount, setAiEventsInvalidCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [testLogMsg, setTestLogMsg] = useState<string | null>(null);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionRes, statusRes, eventsRes] = await Promise.all([
        api.getSession(sessionId),
        api.getDebugAiStatus().catch(() => null),
        api.getDebugAiEvents(sessionId).catch(() => null),
      ]);
      setSession(sessionRes);
      setForm(initForm(sessionRes));
      if (statusRes) setAiStatus(statusRes);
      if (eventsRes) {
        setAiEvents(eventsRes.events ?? []);
        setAiEventsMessage(eventsRes.message ?? null);
        setAiEventsValidCount(eventsRes.validCount ?? null);
        setAiEventsInvalidCount(eventsRes.invalidCount ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo<SessionSummary | null>(() => {
    if (!session) return null;
    return {
      id: session.id,
      name: session.player.name,
      stage: session.player.stage,
      round: session.player.round,
      status: session.status,
      ending: session.ending ?? null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }, [session]);

  const submit = async () => {
    if (!session || !form) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body: Record<string, unknown> = {
        money: Number(form.money),
        stage: form.stage,
        fame: Number(form.fame),
        stress: Number(form.stress),
        ownedItems: form.ownedItems
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
        round: Number(form.round),
        consecutiveLosses: Number(form.consecutiveLosses),
        forceNextEvent: form.forceNextEvent.trim() || null,
        forceMatchResult: form.forceMatchResult || null,
        pendingMatch: form.pendingMatch.trim() ? JSON.parse(form.pendingMatch) : null,
      };
      if (session.player.team) {
        body.teamMonthlySalary = form.teamMonthlySalary.trim() ? Number(form.teamMonthlySalary) : session.player.team.monthlySalary;
        body.teamTier = form.teamTier || session.player.team.tier;
      }
      await api.updateDebugSession(sessionId, body);
      setNotice('已保存调试字段');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const writeTestLog = async () => {
    setTestLogMsg(null);
    try {
      const res = await api.writeDebugTestLog();
      setTestLogMsg(res.message);
    } catch (e) {
      setTestLogMsg(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading && !session) {
    return <div style={{ padding: 24, color: '#8b949e' }}>加载中…</div>;
  }

  if (!session) {
    return (
      <div style={{ padding: 24, color: '#8b949e' }}>
        <div>找不到 session。</div>
        <Link href="/debug/sessions" className="ghost-button" style={{ display: 'inline-block', marginTop: 12 }}>
          返回会话列表
        </Link>
      </div>
    );
  }

  return (
    <div className="layout">
      <div className="hero" style={{ paddingBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ marginBottom: 6 }}>Session Debug</h1>
            <p>{sessionId}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href="/debug/sessions" className="ghost-button">返回列表</Link>
            <Link href="/debug" className="ghost-button">LLM 日志</Link>
            <button type="button" className="primary-button" onClick={() => void load()} disabled={loading}>
              {loading ? '刷新中…' : '刷新'}
            </button>
          </div>
        </div>
      </div>

      {summary && (
        <div className="grid grid-2" style={{ marginBottom: 14 }}>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-title">名称</div>
            <div className="stat-label">{summary.name}</div>
          </div>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-title">阶段 / 回合</div>
            <div className="stat-label">{summary.stage} / {summary.round}</div>
          </div>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-title">状态</div>
            <div className="stat-label" style={{ color: summary.status === 'active' ? 'var(--success)' : 'var(--fg-2)' }}>{summary.status}</div>
          </div>
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-title">更新时间</div>
            <div className="stat-label">{new Date(summary.updatedAt).toLocaleString('zh-CN', { hour12: false })}</div>
          </div>
        </div>
      )}

      {error && <div className="panel" style={{ color: 'var(--danger)', borderColor: 'rgba(248,81,73,0.35)' }}>{error}</div>}

      {notice && <div className="panel" style={{ color: 'var(--success)', borderColor: 'rgba(63,185,80,0.35)' }}>{notice}</div>}

      <div className="grid grid-2">
        <div className="panel">
          <div className="panel-title">可编辑调试字段</div>
          {form && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              {([
                ['money', 'money'],
                ['stage', 'stage'],
                ['fame', 'fame'],
                ['stress', 'stress'],
                ['round', 'round'],
                ['consecutiveLosses', 'consecutiveLosses'],
                ['forceNextEvent', 'forceNextEvent'],
                ['forceMatchResult', 'forceMatchResult'],
                ['teamMonthlySalary', 'teamMonthlySalary'],
                ['teamTier', 'teamTier'],
              ] as const).map(([key, label]) => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#8b949e' }}>
                  <span>{label}</span>
                  {key === 'stage' ? (
                    <select value={form.stage} onChange={(e) => setField('stage', e.target.value as FormState['stage'])} style={inputStyle}>
                      {['rookie', 'youth', 'second', 'pro', 'retired'].map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : key === 'forceMatchResult' ? (
                    <select value={form.forceMatchResult} onChange={(e) => setField('forceMatchResult', e.target.value as FormState['forceMatchResult'])} style={inputStyle}>
                      <option value="">(空)</option>
                      <option value="win">win</option>
                      <option value="loss">loss</option>
                    </select>
                  ) : (
                    <input
                      value={String(form[key])}
                      onChange={(e) => setField(key, e.target.value as never)}
                      disabled={(key === 'teamMonthlySalary' || key === 'teamTier') && !session.player.team}
                      style={inputStyle}
                    />
                  )}
                </label>
              ))}

              <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#8b949e' }}>
                <span>ownedItems（逗号分隔）</span>
                <input value={form.ownedItems} onChange={(e) => setForm((p) => p ? { ...p, ownedItems: e.target.value } : p)} style={inputStyle} />
              </label>

              <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#8b949e' }}>
                <span>pendingMatch JSON</span>
                <textarea
                  value={form.pendingMatch}
                  onChange={(e) => setForm((p) => p ? { ...p, pendingMatch: e.target.value } : p)}
                  rows={8}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }}
                />
              </label>

              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" className="primary-button" onClick={() => void submit()} disabled={saving}>
                  {saving ? '保存中…' : '保存调试字段'}
                </button>
                <button type="button" className="ghost-button" onClick={() => void writeTestLog()}>
                  写入测试日志
                </button>
                {testLogMsg && <span style={{ fontSize: 12, color: '#8b949e' }}>{testLogMsg}</span>}
              </div>
            </div>
          )}
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-title">AI / Session 字段</div>
            <div style={{ display: 'grid', gap: 8, fontSize: 13, color: '#8b949e' }}>
              <div>sessionId: <span style={{ color: '#e6edf3' }}>{session.id}</span></div>
              <div>apiToken: <span style={{ color: '#e6edf3', fontFamily: 'monospace' }}>{session.apiToken}</span></div>
              <div>currentEvent: <span style={{ color: '#e6edf3' }}>{session.currentEvent ? session.currentEvent.id : '(none)'}</span></div>
              <div>forceNextEvent: <span style={{ color: '#e6edf3' }}>{session.player.forceNextEvent ?? '(none)'}</span></div>
              <div>forceMatchResult: <span style={{ color: '#e6edf3' }}>{session.player.forceMatchResult ?? '(none)'}</span></div>
              <div>pendingMatch: <span style={{ color: '#e6edf3' }}>{session.player.pendingMatch ? 'yes' : 'no'}</span></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">AI 事件缓存</div>
            {aiEventsMessage && <div style={{ marginBottom: 8, fontSize: 12, color: '#8b949e' }}>{aiEventsMessage}</div>}
            <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 8 }}>
              共 {aiEvents.length} 条
              {aiEventsValidCount !== null && aiEventsInvalidCount !== null
                ? ` · 有效 ${aiEventsValidCount} · 无效 ${aiEventsInvalidCount}`
                : ''}
            </div>
            <pre style={preStyle}>{pretty(aiEvents)}</pre>
          </div>

          <div className="panel">
            <div className="panel-title">AI 状态</div>
            {aiStatus ? (
              <div style={{ display: 'grid', gap: 8, fontSize: 13, color: '#8b949e' }}>
                <div>provider: <span style={{ color: '#e6edf3' }}>{aiStatus.provider}</span></div>
                <div>model: <span style={{ color: '#e6edf3' }}>{aiStatus.model ?? '(none)'}</span></div>
                <div>active: <span style={{ color: '#e6edf3' }}>{String(aiStatus.active)}</span></div>
                <div>kvBound: <span style={{ color: '#e6edf3' }}>{String(aiStatus.kvBound)}</span></div>
              </div>
            ) : (
              <div style={{ color: '#8b949e', fontSize: 13 }}>未加载</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  background: '#0b0f14',
  color: '#e6edf3',
  border: '1px solid #21262d',
  borderRadius: 6,
  padding: '9px 10px',
  fontSize: 13,
};

const preStyle: CSSProperties = {
  margin: 0,
  padding: 12,
  background: '#070a0e',
  border: '1px solid #21262d',
  borderRadius: 6,
  color: '#c9d1d9',
  fontSize: 12,
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 520,
  overflow: 'auto',
};
