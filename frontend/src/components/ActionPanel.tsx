'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { ActionResult, Player, Stage } from '@/lib/types';

const ACTIONS = [
  {
    id: 'action-ranked-grind',
    label: '打天梯',
    description: '实战磨练枪法，敏捷成长',
    icon: '🎯',
    apCost: 25,
  },
  {
    id: 'action-structured-training',
    label: '系统训练',
    description: '战术训练，智力成长',
    icon: '📋',
    apCost: 25,
  },
  {
    id: 'action-rest-day',
    label: '休息一天',
    description: '恢复疲劳，手感微降',
    icon: '💤',
    apCost: 25,
  },
  {
    id: 'action-fitness',
    label: '健身锻炼',
    description: '增强体能，增加疲劳',
    icon: '🏋️',
    apCost: 25,
  },
  {
    id: 'action-meditation',
    label: '冥想静心',
    description: '快速缓解疲劳与压力，不消耗成长预算',
    icon: '🧘',
    apCost: 15,
  },
  {
    id: 'action-mental-training',
    label: '心理训练',
    description: '专项心理强化，心态成长，但会积累压力',
    icon: '🧠',
    apCost: 25,
  },
  {
    id: 'action-vacation',
    label: '度假断网',
    description: '大幅恢复，手感生疏',
    icon: '🏖',
    apCost: 25,
  },
  {
    id: 'action-boosting',
    label: '代练接单',
    description: '高强度代练，用枪法换现金',
    icon: '💰',
    apCost: 25,
  },
  {
    id: 'action-coaching',
    label: '陪玩指导',
    description: '指导新人，稳定收入',
    icon: '🎓',
    apCost: 25,
  },
  {
    id: 'action-net-cafe',
    label: '网吧打工',
    description: '网吧值班，体力换钱',
    icon: '🖥️',
    apCost: 25,
  },
];

const STAGE_ORDER: Stage[] = ['rookie', 'youth', 'second', 'pro', 'retired'];
const ACTION_STAGE_REQUIREMENTS: Record<string, Stage> = {
  'action-boosting': 'youth',
  'action-coaching': 'youth',
};

function stageIndex(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}

const AP_MAX = 100;

interface Props {
  sessionId: string;
  player: Player;
  enabled: boolean; // false = 事件决策前，不可用
  onPlayerUpdate: (p: Player) => void;
}

const AP_SEGMENT = 25; // bar displays segments of 25 AP

function ApBar({ ap }: { ap: number }) {
  const filled = Math.round(ap / AP_SEGMENT);
  return (
    <div className="ap-bar">
      {Array.from({ length: AP_MAX / AP_SEGMENT }).map((_, i) => (
        <div
          key={i}
          className={`ap-segment ${i < filled ? 'filled' : 'empty'}`}
        />
      ))}
      <span className="ap-label">{ap} AP</span>
    </div>
  );
}

function ActionResultCard({ result, moneyChange }: { result: ActionResult; moneyChange?: number }) {
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
        {moneyChange !== undefined && moneyChange !== 0 && (
          <span className={`chip ${moneyChange > 0 ? 'chip-up' : 'chip-down'}`}>
            金钱 {moneyChange > 0 ? '+' : ''}{moneyChange}K
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
  const [moneyChanges, setMoneyChanges] = useState<Record<string, number>>({});

  const ap = player.actionPoints ?? 0;

  const isTournamentWeek =
    player.pendingMatch !== null &&
    player.pendingMatch.resolveYear === player.year &&
    player.pendingMatch.resolveWeek === player.week;

  const doAction = async (actionId: string) => {
    setBusyId(actionId);
    setError(null);
    const prevMoney = player.stats.money;
    try {
      const res = await api.submitAction(sessionId, actionId);
      const moneyChange = res.actionResult.newStats.money - prevMoney;
      setResults((prev) => ({ ...prev, [actionId]: res.actionResult }));
      setMoneyChanges((prev) => ({ ...prev, [actionId]: moneyChange }));
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
          const requiredStage = ACTION_STAGE_REQUIREMENTS[a.id];
          const isStageLocked = !!requiredStage && stageIndex(player.stage) < stageIndex(requiredStage);
          let actionDisabledReason: string | null = null;
          if (!enabled || panelDisabledReason) {
            actionDisabledReason = panelDisabledReason || '先完成本回合事件决策';
          } else if (ap < a.apCost) {
            actionDisabledReason = 'AP 不足';
          } else if (isStageLocked) {
            actionDisabledReason = `需达到 ${requiredStage === 'youth' ? '青训' : requiredStage} 阶段`;
          }
          const canDo = actionDisabledReason === null && busyId === null;
          const result = results[a.id];
          return (
            <div key={a.id} className="action-item">
              <button
                type="button"
                className="action-btn"
                disabled={!canDo || busyId === a.id}
                onClick={() => doAction(a.id)}
                title={actionDisabledReason || undefined}
              >
                <div className="action-btn-body">
                  <div className="action-btn-label">{a.label}</div>
                  <div className="action-btn-desc">{a.description}</div>
                </div>
                <span className="ap-cost-badge">-{a.apCost} AP</span>
              </button>
              {result && <ActionResultCard result={result} moneyChange={moneyChanges[a.id]} />}
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
