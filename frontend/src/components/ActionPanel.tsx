'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { ActionResult, Player } from '@/lib/types';

const ACTIONS = [
  {
    id: 'action-ranked-grind',
    label: '打天梯',
    description: '实战磨练枪法，敏捷成长',
    icon: '🎯',
  },
  {
    id: 'action-structured-training',
    label: '系统训练',
    description: '战术训练，智力成长',
    icon: '📋',
  },
  {
    id: 'action-rest-day',
    label: '休息一天',
    description: '恢复疲劳，手感微降',
    icon: '💤',
  },
  {
    id: 'action-fitness',
    label: '健身锻炼',
    description: '增强体能，增加疲劳',
    icon: '🏋️',
  },
  {
    id: 'action-meditation',
    label: '冥想静心',
    description: '缓解压力，心态成长',
    icon: '🧘',
  },
  {
    id: 'action-vacation',
    label: '度假断网',
    description: '大幅恢复，手感生疏',
    icon: '🏖',
  },
] as const;

const AP_COST = 25;
const AP_MAX = 100;

interface Props {
  sessionId: string;
  player: Player;
  enabled: boolean; // false = 事件决策前，不可用
  onPlayerUpdate: (p: Player) => void;
}

function ApBar({ ap }: { ap: number }) {
  const filled = Math.round(ap / AP_COST);
  return (
    <div className="ap-bar">
      {Array.from({ length: AP_MAX / AP_COST }).map((_, i) => (
        <div
          key={i}
          className={`ap-segment ${i < filled ? 'filled' : 'empty'}`}
        />
      ))}
      <span className="ap-label">{ap} AP</span>
    </div>
  );
}

function ActionResultCard({ result }: { result: ActionResult }) {
  const statusClass = result.success ? 'ok' : 'fail';
  return (
    <div className={`action-result-mini ${statusClass}`}>
      <span className={`badge ${result.success ? 'success' : 'danger'}`} style={{ fontSize: 10 }}>
        {result.success ? '成功' : '失败'}
      </span>
      <span style={{ fontSize: 11, color: 'var(--fg-2)', marginLeft: 6 }}>
        {result.roll} vs {result.dc}
      </span>
      <div style={{ fontSize: 11, color: 'var(--fg)', marginTop: 3 }}>
        {result.narrative}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
        {result.fatigueChange !== 0 && (
          <span className={`chip ${result.fatigueChange < 0 ? 'chip-up' : 'chip-down'}`}>
            疲劳 {result.fatigueChange > 0 ? '+' : ''}{result.fatigueChange}
          </span>
        )}
        {result.feelChange !== 0 && (
          <span className={`chip ${result.feelChange > 0 ? 'chip-up' : 'chip-down'}`}>
            手感 {result.feelChange > 0 ? '+' : ''}{result.feelChange}
          </span>
        )}
        {result.stressChange !== 0 && (
          <span className={`chip ${result.stressChange < 0 ? 'chip-up' : 'chip-down'}`}>
            压力 {result.stressChange > 0 ? '+' : ''}{result.stressChange}
          </span>
        )}
        {result.growthKey && result.growthAmount && (
          <span className="chip chip-up">
            成长 +{result.growthAmount.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}

export function ActionPanel({ sessionId, player, enabled, onPlayerUpdate }: Props) {
  const [results, setResults] = useState<Record<string, ActionResult>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ap = player.actionPoints ?? 0;

  const isTournamentWeek =
    player.pendingMatch !== null &&
    player.pendingMatch.resolveYear === player.year &&
    player.pendingMatch.resolveWeek === player.week;

  const doAction = async (actionId: string) => {
    setBusyId(actionId);
    setError(null);
    try {
      const res = await api.submitAction(sessionId, actionId);
      setResults((prev) => ({ ...prev, [actionId]: res.actionResult }));
      onPlayerUpdate(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const panelDisabledReason = !enabled
    ? '先完成本回合事件决策'
    : isTournamentWeek
    ? '赛事比赛周 — 行动力冻结'
    : null;

  return (
    <div className="action-panel">
      <div className="action-panel-header">
        <span>日常行动</span>
        <ApBar ap={isTournamentWeek ? 0 : ap} />
      </div>

      {panelDisabledReason ? (
        <div className="action-panel-hint">{panelDisabledReason}</div>
      ) : null}

      <div className={`action-list ${panelDisabledReason ? 'panel-disabled' : ''}`}>
        {ACTIONS.map((a) => {
          const canDo = enabled && !panelDisabledReason && ap >= AP_COST && busyId === null;
          const result = results[a.id];
          return (
            <div key={a.id} className="action-item">
              <button
                type="button"
                className="action-btn"
                disabled={!canDo || busyId === a.id}
                onClick={() => doAction(a.id)}
              >
                <div className="action-btn-body">
                  <div className="action-btn-label">{a.label}</div>
                  <div className="action-btn-desc">{a.description}</div>
                </div>
                <span className="ap-cost-badge">-{AP_COST} AP</span>
              </button>
              {result && <ActionResultCard result={result} />}
            </div>
          );
        })}
      </div>

      {error && (
        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}
