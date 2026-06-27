'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { formatTag } from '@/lib/format';
import type { ClubPlayer, ClubRuntimeState, GameSession, RulesMeta, SessionSummary, StatKey } from '@/lib/types';

type DebugAiStatus = {
  provider: string;
  model: string | null;
  active: boolean;
  kvBound: boolean;
};

type FormState = {
  intelligence: string;
  agility: string;
  experience: string;
  mentality: string;
  constitution: string;
  money: string;
  stage: string;
  fame: string;
  stress: string;
  ownedItems: string;
  tags: string;
  round: string;
  consecutiveLosses: string;
  forceNextEvent: string;
  forceMatchResult: '' | 'win' | 'loss';
  teamMonthlySalary: string;
  teamTier: string;
  teamVrsScore: string;
  pendingMatch: string;
};

type ClubPlayerForm = {
  id: string;
  name: string;
  role: ClubPlayer['role'];
  personality: ClubPlayer['personality'];
  status: ClubPlayer['status'];
  joinedRound: string;
  internalChemistry: string;
  agility: string;
  intelligence: string;
  mentality: string;
  experience: string;
  traits: string;
};

type ClubRuntimeForm = {
  clubTrust: string;
  currentForm: string;
  rosterStability: string;
  internalChemistry: string;
  vrsScore: string;
};

const CORE_STAT_FIELDS: Array<{ key: Exclude<StatKey, 'money'>; label: string; hint: string }> = [
  { key: 'intelligence', label: '智力', hint: '战术、复盘、决策' },
  { key: 'agility', label: '敏捷', hint: '枪法、反应、定位' },
  { key: 'experience', label: '经验', hint: '比赛经验、稳定输出' },
  { key: 'mentality', label: '心态', hint: '抗压、稳定性' },
  { key: 'constitution', label: '体能', hint: '疲劳、伤病、连续作战' },
];

const RESOURCE_FIELDS: Array<{ key: keyof Pick<FormState, 'money' | 'fame' | 'stress' | 'round' | 'consecutiveLosses'>; label: string; hint: string }> = [
  { key: 'money', label: '资金', hint: '1 点约等于 1K' },
  { key: 'fame', label: '名气', hint: '0-100' },
  { key: 'stress', label: '压力', hint: '0-100' },
  { key: 'round', label: '回合', hint: '调试时间推进' },
  { key: 'consecutiveLosses', label: '连败', hint: '影响部分事件' },
];

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function initForm(session: GameSession): FormState {
  return {
    intelligence: String(session.player.stats.intelligence ?? 0),
    agility: String(session.player.stats.agility ?? 0),
    experience: String(session.player.stats.experience ?? 0),
    mentality: String(session.player.stats.mentality ?? 0),
    constitution: String(session.player.stats.constitution ?? 0),
    money: String(session.player.stats.money ?? 0),
    stage: session.player.stage,
    fame: String(session.player.fame ?? 0),
    stress: String(session.player.stress ?? 0),
    ownedItems: session.player.ownedItems.join(', '),
    tags: (session.player.tags ?? []).join(', '),
    round: String(session.player.round ?? 0),
    consecutiveLosses: String(session.player.consecutiveLosses ?? 0),
    forceNextEvent: session.player.forceNextEvent ?? '',
    forceMatchResult: session.player.forceMatchResult ?? '',
    teamMonthlySalary: session.player.team ? String(session.player.team.monthlySalary) : '',
    teamTier: session.player.team?.tier ?? '',
    teamVrsScore: session.player.team
      ? String(session.worldClubs?.runtimeByClubId[session.player.team.clubId]?.vrsScore ?? 0)
      : '',
    pendingMatch: session.player.pendingMatch ? pretty(session.player.pendingMatch) : '',
  };
}

function initClubRuntimeForm(runtime: ClubRuntimeState): ClubRuntimeForm {
  return {
    clubTrust: String(runtime.clubTrust ?? 0),
    currentForm: String(runtime.currentForm ?? 0),
    rosterStability: String(runtime.rosterStability ?? 0),
    internalChemistry: String(runtime.internalChemistry ?? 0),
    vrsScore: String(runtime.vrsScore ?? 0),
  };
}

function initClubPlayerForm(player: ClubPlayer): ClubPlayerForm {
  return {
    id: player.id,
    name: player.name,
    role: player.role,
    personality: player.personality,
    status: player.status,
    joinedRound: String(player.joinedRound ?? 0),
    internalChemistry: String(player.internalChemistry ?? 50),
    agility: String(player.stats.agility ?? 0),
    intelligence: String(player.stats.intelligence ?? 0),
    mentality: String(player.stats.mentality ?? 0),
    experience: String(player.stats.experience ?? 0),
    traits: (player.traits ?? []).join(', '),
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
  const [rulesMeta, setRulesMeta] = useState<RulesMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clubSaving, setClubSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [testLogMsg, setTestLogMsg] = useState<string | null>(null);
  const [clubFilter, setClubFilter] = useState('');
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [clubRuntimeForm, setClubRuntimeForm] = useState<ClubRuntimeForm | null>(null);
  const [clubRosterForms, setClubRosterForms] = useState<Record<string, ClubPlayerForm>>({});

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sessionRes, rulesRes, statusRes, eventsRes] = await Promise.all([
        api.getDebugSession(sessionId),
        api.getRulesMeta(),
        api.getDebugAiStatus().catch(() => null),
        api.getDebugAiEvents(sessionId).catch(() => null),
      ]);
      setSession(sessionRes);
      setForm(initForm(sessionRes));
      setRulesMeta(rulesRes);
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

  const growthRemaining = useMemo(() => {
    if (!session || !rulesMeta) return 0;
    return Math.max(0, rulesMeta.growthCap - (session.player.growthSpent ?? 0));
  }, [session, rulesMeta]);

  const worldClubRows = useMemo(() => {
    if (!session?.worldClubs) return [];
    const pool = session.worldClubs;
    return Object.values(pool.runtimeByClubId)
      .sort((a, b) => b.updatedRound - a.updatedRound)
      .slice(0, 12)
      .map((runtime) => ({
        ...runtime,
        tickKeys: pool.processedTickKeysByClubId[runtime.clubId] ?? [],
      }));
  }, [session]);

  const visibleClubRows = useMemo(() => {
    const q = clubFilter.trim().toLowerCase();
    if (!q) return worldClubRows;
    return worldClubRows.filter((club) => [
      club.clubId,
      club.displayName ?? '',
      club.displayTag ?? '',
      club.displayRegion ?? '',
      club.tier,
    ].some((value) => value.toLowerCase().includes(q)));
  }, [clubFilter, worldClubRows]);

  const selectedClub = useMemo(() => {
    if (!session?.worldClubs || !selectedClubId) return null;
    return session.worldClubs.runtimeByClubId[selectedClubId] ?? null;
  }, [selectedClubId, session]);

  useEffect(() => {
    if (!selectedClubId && visibleClubRows.length > 0) {
      setSelectedClubId(visibleClubRows[0]!.clubId);
    }
  }, [selectedClubId, visibleClubRows]);

  useEffect(() => {
    if (!selectedClub) return;
    setClubRuntimeForm(initClubRuntimeForm(selectedClub));
    setClubRosterForms(Object.fromEntries(selectedClub.fullRoster.map((player) => [player.id, initClubPlayerForm(player)])));
  }, [selectedClubId, selectedClub]);

  useEffect(() => {
    if (!session?.worldClubs) {
      setSelectedClubId(null);
      setClubRuntimeForm(null);
      setClubRosterForms({});
    }
  }, [session?.worldClubs]);

  const queuedState = useMemo(() => {
    if (!session) return [];
    const tags = new Set(session.player.tags ?? []);
    return [
      'family-crisis-queued',
      'club-interview-queued',
      'team-conflict-queued',
      'bailout-queued',
      'promotion-narrative-queued',
    ].map((tag) => ({ tag, active: tags.has(tag) }));
  }, [session]);

  const injuryState = useMemo(() => {
    if (!session) return [];
    const tags = new Set(session.player.tags ?? []);
    return [
      'minor-injury-risk',
      'injury-warning',
      'injury-limited',
      'forced-rest',
      'injured',
    ].map((tag) => ({ tag, active: tags.has(tag) }));
  }, [session]);

  const submit = async () => {
    if (!session || !form) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body: Record<string, unknown> = {
        stats: {
          intelligence: Number(form.intelligence),
          agility: Number(form.agility),
          experience: Number(form.experience),
          mentality: Number(form.mentality),
          constitution: Number(form.constitution),
        },
        money: Number(form.money),
        stage: form.stage,
        fame: Number(form.fame),
        stress: Number(form.stress),
        ownedItems: form.ownedItems
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
        tags: form.tags
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
        body.teamVrsScore = form.teamVrsScore.trim() ? Number(form.teamVrsScore) : 0;
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

  const submitClub = async () => {
    if (!session?.worldClubs || !selectedClubId || !clubRuntimeForm) return;
    setClubSaving(true);
    setError(null);
    setNotice(null);
    try {
      const roster = selectedClub?.fullRoster ?? [];
      const fullRoster = roster.map((player) => {
        const draft = clubRosterForms[player.id] ?? initClubPlayerForm(player);
        return {
          ...player,
          id: draft.id.trim() || player.id,
          name: draft.name.trim() || player.name,
          role: draft.role,
          personality: draft.personality,
          status: draft.status,
          joinedRound: Number(draft.joinedRound),
          internalChemistry: Number(draft.internalChemistry),
          traits: draft.traits.split(',').map((v) => v.trim()).filter(Boolean),
          stats: {
            ...player.stats,
            agility: Number(draft.agility),
            intelligence: Number(draft.intelligence),
            mentality: Number(draft.mentality),
            experience: Number(draft.experience),
          },
        };
      });

      const worldClubUpdates = {
        [selectedClubId]: {
          clubTrust: Number(clubRuntimeForm.clubTrust),
          currentForm: Number(clubRuntimeForm.currentForm),
          rosterStability: Number(clubRuntimeForm.rosterStability),
          internalChemistry: Number(clubRuntimeForm.internalChemistry),
          vrsScore: Number(clubRuntimeForm.vrsScore),
          fullRoster,
        },
      };

      await api.updateDebugWorldClubs(sessionId, { worldClubUpdates });
      setNotice(`已保存世界战队 ${selectedClubId}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setClubSaving(false);
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
          <div className="panel" style={{ marginBottom: 0 }}>
            <div className="panel-title">成长上限</div>
            <div className="stat-label">{session.player.growthSpent ?? 0} / {rulesMeta?.growthCap ?? 0}</div>
            <div className="stat-desc">剩余 {growthRemaining} 点，只计算智力、敏捷、心态、体能；经验不占用成长上限。</div>
          </div>
        </div>
      )}

      {error && <div className="panel" style={{ color: 'var(--danger)', borderColor: 'rgba(248,81,73,0.35)' }}>{error}</div>}

      {notice && <div className="panel" style={{ color: 'var(--success)', borderColor: 'rgba(63,185,80,0.35)' }}>{notice}</div>}

      <div className="grid grid-2">
        <div className="panel">
          <div className="panel-title">可编辑调试字段</div>
          {form && (
            <div style={{ display: 'grid', gap: 16 }}>
              <section style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <span>核心属性</span>
                  <span>直接写入 player.stats，不经过成长上限。</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  {CORE_STAT_FIELDS.map((field) => (
                    <label key={field.key} style={labelStyle}>
                      <span>{field.label}</span>
                      <input
                        type="number"
                        value={form[field.key]}
                        onChange={(e) => setField(field.key, e.target.value)}
                        style={inputStyle}
                      />
                      <span style={hintStyle}>{field.hint}</span>
                    </label>
                  ))}
                </div>
              </section>

              <section style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <span>资源和进度</span>
                  <span>用于快速构造经济、压力、名气和时间状态。</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  <label style={labelStyle}>
                    <span>阶段</span>
                    <select value={form.stage} onChange={(e) => setField('stage', e.target.value)} style={inputStyle}>
                      {['rookie', 'youth', 'second', 'pro', 'retired'].map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <span style={hintStyle}>会影响事件和赛事门槛。</span>
                  </label>
                  {RESOURCE_FIELDS.map((field) => (
                    <label key={field.key} style={labelStyle}>
                      <span>{field.label}</span>
                      <input
                        type="number"
                        value={form[field.key]}
                        onChange={(e) => setField(field.key, e.target.value)}
                        style={inputStyle}
                      />
                      <span style={hintStyle}>{field.hint}</span>
                    </label>
                  ))}
                </div>
              </section>

              <section style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <span>高级控制</span>
                  <span>强制事件、比赛结果、战队合同和赛事 JSON。</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  <label style={labelStyle}>
                    <span>强制下个事件 ID</span>
                    <input value={form.forceNextEvent} onChange={(e) => setField('forceNextEvent', e.target.value)} style={inputStyle} />
                    <span style={hintStyle}>留空会清除 forceNextEvent。</span>
                  </label>

                  <label style={labelStyle}>
                    <span>强制比赛结果</span>
                    <select value={form.forceMatchResult} onChange={(e) => setField('forceMatchResult', e.target.value as FormState['forceMatchResult'])} style={inputStyle}>
                      <option value="">(空)</option>
                      <option value="win">win</option>
                      <option value="loss">loss</option>
                    </select>
                    <span style={hintStyle}>只影响后续比赛结算。</span>
                  </label>

                  <label style={labelStyle}>
                    <span>战队月薪</span>
                    <input
                      type="number"
                      value={form.teamMonthlySalary}
                      onChange={(e) => setField('teamMonthlySalary', e.target.value)}
                      disabled={!session.player.team}
                      style={inputStyle}
                    />
                    <span style={hintStyle}>{session.player.team ? '当前队伍合同字段。' : '没有战队时不可用。'}</span>
                  </label>

                  <label style={labelStyle}>
                    <span>战队等级</span>
                    <select
                      value={form.teamTier}
                      onChange={(e) => setField('teamTier', e.target.value)}
                      disabled={!session.player.team}
                      style={inputStyle}
                    >
                      <option value="">(无)</option>
                      {['youth', 'semi-pro', 'pro', 'top'].map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <span style={hintStyle}>{session.player.team ? '影响赛事和合同调试。' : '没有战队时不可用。'}</span>
                  </label>

                  <label style={labelStyle}>
                    <span>战队 VRS</span>
                    <input
                      type="number"
                      value={form.teamVrsScore}
                      onChange={(e) => setField('teamVrsScore', e.target.value)}
                      disabled={!session.player.team}
                      style={inputStyle}
                    />
                    <span style={hintStyle}>{session.player.team ? `写入 ${session.player.team.name} 的 worldClub VRS。` : '没有战队时不可用。'}</span>
                  </label>
                </div>
              </section>

              <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#8b949e' }}>
                <span>ownedItems（逗号分隔）</span>
                <input value={form.ownedItems} onChange={(e) => setForm((p) => p ? { ...p, ownedItems: e.target.value } : p)} style={inputStyle} />
              </label>

              <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#8b949e' }}>
                <span>tags（逗号分隔，编辑后保存即可新增或删除）</span>
                <textarea
                  value={form.tags}
                  onChange={(e) => setForm((p) => p ? { ...p, tags: e.target.value } : p)}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }}
                />
                <span style={hintStyle}>示例：team-trust, tournament-winner, minor-injury-risk。</span>
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
              <div>growthSpent: <span style={{ color: '#e6edf3' }}>{session.player.growthSpent ?? 0}</span></div>
              <div>growthCap: <span style={{ color: '#e6edf3' }}>{rulesMeta?.growthCap ?? 0}</span></div>
              <div>growthRemaining: <span style={{ color: '#e6edf3' }}>{growthRemaining}</span></div>
              <div>currentEvent: <span style={{ color: '#e6edf3' }}>{session.currentEvent ? session.currentEvent.id : '(none)'}</span></div>
              <div>forceNextEvent: <span style={{ color: '#e6edf3' }}>{session.player.forceNextEvent ?? '(none)'}</span></div>
              <div>forceMatchResult: <span style={{ color: '#e6edf3' }}>{session.player.forceMatchResult ?? '(none)'}</span></div>
              <div>pendingMatch: <span style={{ color: '#e6edf3' }}>{session.player.pendingMatch ? 'yes' : 'no'}</span></div>
              <div>teamVrs: <span style={{ color: '#e6edf3' }}>{session.player.team ? (session.worldClubs?.runtimeByClubId[session.player.team.clubId]?.vrsScore ?? 0) : '(no team)'}</span></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">CareerInsight Debug</div>
            {session.careerInsight ? (
              <div style={{ display: 'grid', gap: 10, fontSize: 12, color: '#8b949e' }}>
                <div>
                  <span style={{ color: '#e6edf3', fontWeight: 600 }}>{session.careerInsight.stage.label}</span>
                  {' '}· round {session.careerInsight.generatedAtRound}
                </div>
                <div>{session.careerInsight.headline}</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ color: '#e6edf3', fontWeight: 600 }}>milestones</div>
                  {session.careerInsight.milestones.map((item) => (
                    <div key={item.id} style={{ border: '1px solid #21262d', borderRadius: 6, padding: 8 }}>
                      <div style={{ color: '#e6edf3' }}>{item.title} · {item.status}</div>
                      <div>{item.progressText}</div>
                      {item.missing.length > 0 && <div>missing: {item.missing.join(' / ')}</div>}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ color: '#e6edf3', fontWeight: 600 }}>risks</div>
                  {session.careerInsight.risks.length > 0 ? session.careerInsight.risks.map((item) => (
                    <div key={item.id} style={{ border: '1px solid #21262d', borderRadius: 6, padding: 8 }}>
                      <div style={{ color: '#e6edf3' }}>{item.title} · {item.severity}</div>
                      <div>{item.reason}</div>
                    </div>
                  )) : <div>无风险项</div>}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ color: '#e6edf3', fontWeight: 600 }}>recommendations</div>
                  {session.careerInsight.recommendations.map((item) => (
                    <div key={`${item.title}-${item.actionId ?? 'text'}`} style={{ border: '1px solid #21262d', borderRadius: 6, padding: 8 }}>
                      <div style={{ color: '#e6edf3' }}>{item.title} · {item.priority}</div>
                      <div>{item.reason}</div>
                    </div>
                  ))}
                </div>
                <pre style={preStyle}>{pretty(session.careerInsight)}</pre>
              </div>
            ) : (
              <div style={{ color: '#8b949e', fontSize: 13 }}>当前 session 未返回 careerInsight。</div>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">事件流程 Debug</div>
            {session.activeEventSequence ? (
              <div style={{ display: 'grid', gap: 10, fontSize: 12, color: '#8b949e' }}>
                <div>
                  <span style={{ color: '#e6edf3', fontWeight: 600 }}>{session.activeEventSequence.id}</span>
                  {' '}· {session.activeEventSequence.type}
                  {' '}· step {session.activeEventSequence.currentIndex + 1}/{session.activeEventSequence.steps.length}
                  {' '}· {session.activeEventSequence.status}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {session.activeEventSequence.steps.map((step, index) => (
                    <div
                      key={step.id}
                      style={{
                        border: index === session.activeEventSequence?.currentIndex ? '1px solid rgba(88,166,255,0.5)' : '1px solid #21262d',
                        borderRadius: 6,
                        padding: 8,
                      }}
                    >
                      <div style={{ color: '#e6edf3' }}>
                        {index + 1}. {step.id}
                        {step.completeSequenceAfter ? ' · final' : ''}
                      </div>
                      <div>eventId: {step.eventId ?? step.generatedEvent?.id ?? '(dynamic)'}</div>
                      <div>generatedEvent: {step.generatedEvent ? 'yes' : 'no'}</div>
                      {step.skipIf && <div>skipIf: {pretty(step.skipIf)}</div>}
                    </div>
                  ))}
                </div>
                <pre style={preStyle}>{pretty(session.activeEventSequence.context)}</pre>
              </div>
            ) : (
              <div style={{ color: '#8b949e', fontSize: 13 }}>当前没有 activeEventSequence。</div>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">赛事上下文 Debug</div>
            {session.player.tournamentContext ? (
              <div style={{ display: 'grid', gap: 10, fontSize: 12, color: '#8b949e' }}>
                <div>
                  <span style={{ color: '#e6edf3', fontWeight: 600 }}>{session.player.tournamentContext.tournamentId}</span>
                  {' '}· stage {session.player.tournamentContext.stageIndex}
                  {' '}· {session.player.tournamentContext.phase}
                </div>
                <div>
                  queue {session.player.tournamentContext.contextEventQueue.length}
                  {' '}· consumed {session.player.tournamentContext.consumedContextEventIds.length}
                  {' '}· expires {session.player.tournamentContext.expiresAtRound ?? '(none)'}
                </div>
                {session.player.tournamentContext.lastMatchResult && (
                  <div style={{ border: '1px solid #21262d', borderRadius: 6, padding: 8 }}>
                    lastMatch: {session.player.tournamentContext.lastMatchResult.won ? 'win' : 'loss'}
                    {' '}· {session.player.tournamentContext.lastMatchResult.teamScore}:{session.player.tournamentContext.lastMatchResult.enemyScore}
                    {' '}· rating {session.player.tournamentContext.lastMatchResult.rating}
                  </div>
                )}
                <pre style={preStyle}>{pretty(session.player.tournamentContext.contextEventQueue)}</pre>
              </div>
            ) : (
              <div style={{ color: '#8b949e', fontSize: 13 }}>当前没有 tournamentContext。</div>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">Queued / 伤病状态</div>
            <div style={{ display: 'grid', gap: 10, fontSize: 12, color: '#8b949e' }}>
              <div>
                <div style={{ color: '#e6edf3', fontWeight: 600, marginBottom: 6 }}>queued</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {queuedState.map((item) => (
                    <span key={item.tag} className={`badge ${item.active ? 'success' : ''}`} title={item.tag}>
                      {formatTag(item.tag)}: {item.active ? 'yes' : 'no'}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ color: '#e6edf3', fontWeight: 600, marginBottom: 6 }}>injury</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {injuryState.map((item) => (
                    <span key={item.tag} className={`badge ${item.active ? 'danger' : ''}`} title={item.tag}>
                      {formatTag(item.tag)}: {item.active ? 'yes' : 'no'}
                    </span>
                  ))}
                  <span className="badge">restRounds: {session.player.restRounds ?? 0}</span>
                </div>
              </div>
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
            <div className="panel-title">世界战队运行态</div>
            {session.worldClubs ? (
              <div style={{ display: 'grid', gap: 10, fontSize: 12, color: '#8b949e' }}>
                <div>
                  season {session.worldClubs.season} · active {session.worldClubs.activeClubIds.length} · relevant {session.worldClubs.relevantClubIds.length} · static {session.worldClubs.staticClubIds.length} · lastTick {session.worldClubs.lastGlobalTickRound ?? '(none)'}
                </div>
                {session.worldClubs.seasonSummaries?.[0] && (
                  <div style={{ border: '1px solid #21262d', borderRadius: 6, padding: 10 }}>
                    <div style={{ color: '#e6edf3', fontWeight: 600 }}>season summary {session.worldClubs.seasonSummaries[0].season}</div>
                    <div>darkHorse: {session.worldClubs.seasonSummaries[0].darkHorseClubIds.join(', ') || '(none)'}</div>
                    <div>promoted: {session.worldClubs.seasonSummaries[0].promotedClubIds.join(', ') || '(none)'}</div>
                    <div>fallen: {session.worldClubs.seasonSummaries[0].fallenClubIds.join(', ') || '(none)'}</div>
                  </div>
                )}
                {worldClubRows.length > 0 ? worldClubRows.map((club) => (
                  <div key={club.clubId} style={{ border: '1px solid #21262d', borderRadius: 6, padding: 10, display: 'grid', gap: 4 }}>
                    <div style={{ color: '#e6edf3', fontWeight: 600 }}>{club.clubId} · {club.tier} · round {club.updatedRound}</div>
                    <div>form {club.currentForm} · trust {club.clubTrust} · chemistry {club.internalChemistry} · stability {club.rosterStability} · points {club.seasonPoints}</div>
                    <div>storylines: {club.activeStorylines.length > 0 ? club.activeStorylines.join(', ') : '(none)'}</div>
                    <div>recent: {club.recentResults[0] ? `${club.recentResults[0].result} ${club.recentResults[0].tier} r${club.recentResults[0].round}` : '(none)'}</div>
                    <div>ticks: {club.tickKeys.length > 0 ? club.tickKeys.join(', ') : '(none)'}</div>
                  </div>
                )) : (
                  <div>尚未激活任何战队运行态。</div>
                )}
              </div>
            ) : (
              <div style={{ color: '#8b949e', fontSize: 13 }}>worldClubs 未初始化</div>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">队内身份 Debug</div>
            {session.debugTeamIdentity ? (
              <div style={{ display: 'grid', gap: 10, fontSize: 12, color: '#8b949e' }}>
                <div style={{ border: '1px solid #21262d', borderRadius: 6, padding: 10, display: 'grid', gap: 4 }}>
                  <div style={{ color: '#e6edf3', fontWeight: 600 }}>
                    player · visible {session.debugTeamIdentity.player.visibleIdentity ?? '(none)'} · since {session.debugTeamIdentity.player.sinceRound ?? '(none)'}
                  </div>
                  <div>
                    scores: {session.debugTeamIdentity.player.scores.length > 0
                      ? session.debugTeamIdentity.player.scores.map((score) => `${score.identity}:${score.score}`).join(', ')
                      : '(none)'}
                  </div>
                  {session.debugTeamIdentity.player.scores.map((score) => (
                    <div key={`player-${score.identity}`}>
                      {score.identity} reasons: {score.reasons.join(' / ') || '(none)'}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                  <div>
                    caller: {session.debugTeamIdentity.caller
                      ? `${session.debugTeamIdentity.caller.label} (${session.debugTeamIdentity.caller.type}, score ${session.debugTeamIdentity.caller.score})`
                      : '(none)'}
                  </div>
                  <div>
                    star: {session.debugTeamIdentity.star
                      ? `${session.debugTeamIdentity.star.label} (${session.debugTeamIdentity.star.type}, score ${session.debugTeamIdentity.star.score})`
                      : '(none)'}
                  </div>
                </div>

                {session.debugTeamIdentity.teammates.length > 0 ? session.debugTeamIdentity.teammates.map((tm) => (
                  <div key={tm.id} style={{ border: '1px solid #21262d', borderRadius: 6, padding: 10, display: 'grid', gap: 4 }}>
                    <div style={{ color: '#e6edf3', fontWeight: 600 }}>
                      {tm.name} · {tm.id} · visible {tm.visibleIdentity ?? '(none)'} · since {tm.sinceRound ?? '(none)'}
                    </div>
                    <div>
                      scores: {tm.scores.length > 0
                        ? tm.scores.map((score) => `${score.identity}:${score.score}`).join(', ')
                        : '(none)'}
                    </div>
                    {tm.scores.map((score) => (
                      <div key={`${tm.id}-${score.identity}`}>
                        {score.identity} reasons: {score.reasons.join(' / ') || '(none)'}
                      </div>
                    ))}
                  </div>
                )) : (
                  <div>当前没有 roster。</div>
                )}
              </div>
            ) : (
              <div style={{ color: '#8b949e', fontSize: 13 }}>debugTeamIdentity 未返回</div>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">角色 Debug</div>
            {session.debugRole ? (
              <div style={{ display: 'grid', gap: 10, fontSize: 12, color: '#8b949e' }}>
                <div style={{ border: '1px solid #21262d', borderRadius: 6, padding: 10, display: 'grid', gap: 4 }}>
                  <div style={{ color: '#e6edf3', fontWeight: 600 }}>
                    active {session.debugRole.activeRole ?? '(none)'} · preferred {session.debugRole.preferredRole ?? '(none)'}
                  </div>
                  <div>
                    rounds: {session.debugRole.activeRoleRounds} · pressure: {session.debugRole.pressure} · crystallize: {String(session.debugRole.crystallizeReady)}
                  </div>
                  <div>threshold: {session.debugRole.crystallizeThreshold}</div>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {Object.entries(session.debugRole.fitScores).map(([role, score]) => (
                    <div key={role}>{role}: {score}</div>
                  ))}
                </div>
                {session.debugRole.roleTransition ? (
                  <div>
                    transition: {session.debugRole.roleTransition.targetRole} · stage {session.debugRole.roleTransition.stage ?? 'trial'} · source {session.debugRole.roleTransition.source ?? 'team-need'}
                  </div>
                ) : (
                  <div>当前没有进行中的转型轨道。</div>
                )}
              </div>
            ) : (
              <div style={{ color: '#8b949e', fontSize: 13 }}>debugRole 未返回</div>
            )}
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

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title">世界战队编辑</div>
        {!session.worldClubs ? (
          <div className="stat-desc">当前 session 没有 worldClubs。</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 14 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <input
                value={clubFilter}
                onChange={(e) => setClubFilter(e.target.value)}
                placeholder="搜索战队"
                style={inputStyle}
              />
              <div style={{ maxHeight: 520, overflow: 'auto', display: 'grid', gap: 8 }}>
                {visibleClubRows.map((club) => (
                  <button
                    key={club.clubId}
                    type="button"
                    onClick={() => setSelectedClubId(club.clubId)}
                    style={{
                      textAlign: 'left',
                      padding: 10,
                      borderRadius: 6,
                      border: selectedClubId === club.clubId ? '1px solid rgba(255,91,31,0.45)' : '1px solid #21262d',
                      background: selectedClubId === club.clubId ? 'rgba(255,91,31,0.08)' : '#0d1117',
                      color: '#e6edf3',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{club.displayName ?? club.clubId}</div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
                      {club.clubId} · {club.displayTag ?? '(no tag)'} · {club.displayRegion ?? '(no region)'}
                    </div>
                    <div style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
                      trust {club.clubTrust} · form {club.currentForm} · chem {club.internalChemistry} · stab {club.rosterStability} · vrs {club.vrsScore}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {selectedClub && clubRuntimeForm ? (
              <div style={{ display: 'grid', gap: 14 }}>
                <div className="panel" style={{ marginBottom: 0 }}>
                  <div className="panel-title">运行态</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
                    {(['clubTrust', 'currentForm', 'rosterStability', 'internalChemistry', 'vrsScore'] as const).map((key) => (
                      <label key={key} style={labelStyle}>
                        <span>{key}</span>
                        <input
                          type="number"
                          value={clubRuntimeForm[key]}
                          onChange={(e) => setClubRuntimeForm((prev) => prev ? { ...prev, [key]: e.target.value } : prev)}
                          style={inputStyle}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="panel" style={{ marginBottom: 0 }}>
                  <div className="panel-title">fullRoster</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {selectedClub.fullRoster.map((player) => {
                      const playerForm = clubRosterForms[player.id] ?? initClubPlayerForm(player);
                      return (
                        <div key={player.id} style={{ border: '1px solid #21262d', borderRadius: 6, padding: 10, display: 'grid', gap: 10 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                            <label style={labelStyle}>
                              <span>id</span>
                              <input value={playerForm.id} onChange={(e) => setClubRosterForms((prev) => ({ ...prev, [player.id]: { ...playerForm, id: e.target.value } }))} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span>name</span>
                              <input value={playerForm.name} onChange={(e) => setClubRosterForms((prev) => ({ ...prev, [player.id]: { ...playerForm, name: e.target.value } }))} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span>role</span>
                              <input value={playerForm.role} onChange={(e) => setClubRosterForms((prev) => ({ ...prev, [player.id]: { ...playerForm, role: e.target.value as ClubPlayer['role'] } }))} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span>personality</span>
                              <input value={playerForm.personality} onChange={(e) => setClubRosterForms((prev) => ({ ...prev, [player.id]: { ...playerForm, personality: e.target.value as ClubPlayer['personality'] } }))} style={inputStyle} />
                            </label>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
                            {(['agility', 'intelligence', 'mentality', 'experience', 'internalChemistry'] as const).map((key) => (
                              <label key={key} style={labelStyle}>
                                <span>{key}</span>
                                <input
                                  type="number"
                                  value={playerForm[key]}
                                  onChange={(e) => setClubRosterForms((prev) => ({ ...prev, [player.id]: { ...playerForm, [key]: e.target.value } }))}
                                  style={inputStyle}
                                />
                              </label>
                            ))}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                            <label style={labelStyle}>
                              <span>status</span>
                              <input value={playerForm.status} onChange={(e) => setClubRosterForms((prev) => ({ ...prev, [player.id]: { ...playerForm, status: e.target.value as ClubPlayer['status'] } }))} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span>joinedRound</span>
                              <input type="number" value={playerForm.joinedRound} onChange={(e) => setClubRosterForms((prev) => ({ ...prev, [player.id]: { ...playerForm, joinedRound: e.target.value } }))} style={inputStyle} />
                            </label>
                            <label style={labelStyle}>
                              <span>traits</span>
                              <input value={playerForm.traits} onChange={(e) => setClubRosterForms((prev) => ({ ...prev, [player.id]: { ...playerForm, traits: e.target.value } }))} style={inputStyle} />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button type="button" className="primary-button" onClick={() => void submitClub()} disabled={clubSaving}>
                    {clubSaving ? '保存中…' : '保存战队'}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      if (!selectedClub) return;
                      setClubRuntimeForm(initClubRuntimeForm(selectedClub));
                      setClubRosterForms(Object.fromEntries(selectedClub.fullRoster.map((player) => [player.id, initClubPlayerForm(player)])));
                    }}
                  >
                    重置当前战队
                  </button>
                </div>
              </div>
            ) : (
              <div className="stat-desc">请选择一个战队。</div>
            )}
          </div>
        )}
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

const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 12,
  color: '#8b949e',
};

const hintStyle: CSSProperties = {
  color: '#3d444d',
  fontSize: 11,
  lineHeight: 1.4,
};

const sectionStyle: CSSProperties = {
  border: '1px solid #21262d',
  borderRadius: 8,
  padding: 12,
  display: 'grid',
  gap: 12,
};

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  color: '#e6edf3',
  fontSize: 13,
  fontWeight: 700,
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
