'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { ActionResult, Player, Stage } from '@/lib/types';

interface ActionMeta {
  id: string;
  label: string;
  description: string;
  icon: string;
  apCost: number;
  comboConsumes?: Array<{
    id: string;
    label: string;
    summary: string;
  }>;
}

const ACTIONS = [
  {
    id: 'action-ranked-grind',
    label: '打天梯',
    description: '实战磨练枪法，敏捷成长',
    icon: '🎯',
    apCost: 30,
    comboConsumes: [
      { id: 'structured-mind', label: '结构化思路', summary: '敏捷成长提高，tilt 风险降低' },
      { id: 'flow-ready', label: '心流准备', summary: '压力和 tilt 风险降低' },
      { id: 'body-activated', label: '身体激活', summary: '疲劳增长降低' },
      { id: 'body-reset', label: '身体清空', summary: '找回手感，疲劳增长降低' },
    ],
  },
  {
    id: 'action-structured-training',
    label: '系统训练',
    description: '战术训练，智力成长',
    icon: '📋',
    apCost: 30,
    comboConsumes: [
      { id: 'practical-problems', label: '实战问题', summary: '智力成长提高，压力增长降低' },
      { id: 'body-activated', label: '身体激活', summary: '疲劳增长降低' },
    ],
  },
  {
    id: 'action-rest-day',
    label: '休息一天',
    description: '恢复疲劳，手感微降',
    icon: '💤',
    apCost: 30,
    comboConsumes: [
      { id: 'overdrawn', label: '透支感', summary: '额外恢复疲劳和压力' },
    ],
  },
  {
    id: 'action-fitness',
    label: '健身锻炼',
    description: '增强体能，增加疲劳',
    icon: '🏋️',
    apCost: 30,
  },
  {
    id: 'action-meditation',
    label: '冥想静心',
    description: '快速缓解疲劳与压力，不消耗成长预算',
    icon: '🧘',
    apCost: 15,
    comboConsumes: [
      { id: 'overdrawn', label: '透支感', summary: '额外恢复疲劳和压力' },
    ],
  },
  {
    id: 'action-mental-training',
    label: '心理训练',
    description: '专项心理强化，心态成长，但会积累压力',
    icon: '🧠',
    apCost: 30,
    comboConsumes: [
      { id: 'flow-ready', label: '心流准备', summary: '压力和 tilt 风险降低' },
    ],
  },
  {
    id: 'action-vacation',
    label: '度假断网',
    description: '大幅恢复，手感生疏',
    icon: '🏖',
    apCost: 50,
  },
  {
    id: 'action-boosting',
    label: '代练接单',
    description: '高强度代练，用枪法换现金',
    icon: '💰',
    apCost: 35,
  },
  {
    id: 'action-coaching',
    label: '陪玩指导',
    description: '指导新人，稳定收入',
    icon: '🎓',
    apCost: 30,
  },
  {
    id: 'action-net-cafe',
    label: '网吧打工',
    description: '网吧值班，体力换钱',
    icon: '🖥️',
    apCost: 35,
  },
] satisfies ActionMeta[];

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
  onActionResult?: (result: ActionResult, moneyChange: number) => void;
  disabledReason?: string;
}

function ApBar({ ap }: { ap: number }) {
  const pct = Math.max(0, Math.min(100, (ap / AP_MAX) * 100));
  return (
    <div className="ap-bar">
      <div className="ap-track" aria-hidden="true">
        <div className="ap-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="ap-label">{ap} AP</span>
    </div>
  );
}

export function ActionResultCard({ result, moneyChange }: { result: ActionResult; moneyChange?: number }) {
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
        {result.comboTriggeredLabels?.map((label) => (
          <span key={`triggered-${label}`} className="chip chip-up">
            连锁 {label}
          </span>
        ))}
        {result.comboAddedLabels?.map((label) => (
          <span key={`added-${label}`} className="chip">
            开启 {label}
          </span>
        ))}
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


export function ActionPanel({ sessionId, player, enabled, onPlayerUpdate, onActionResult, disabledReason }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ap = player.actionPoints ?? 0;
  const activeComboIds = new Set((player.roundCombos ?? []).map((combo) => combo.id));

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
      onActionResult?.(res.actionResult, moneyChange);
      onPlayerUpdate(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const panelDisabledReason = !enabled
    ? (disabledReason ?? '先完成本回合事件决策')
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

      {(player.roundCombos?.length ?? 0) > 0 && !panelDisabledReason ? (
        <div className="action-panel-hint">
          本回合连锁：{player.roundCombos.map((combo) => combo.label).join(' / ')}
        </div>
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
          const availableCombos = (a.comboConsumes ?? []).filter((combo) => activeComboIds.has(combo.id));
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
                  {availableCombos.length > 0 && (
                    <div className="action-btn-desc">
                      可触发：{availableCombos.map((combo) => `${combo.label}（${combo.summary}）`).join(' / ')}
                    </div>
                  )}
                </div>
                <span className="ap-cost-badge">-{a.apCost} AP</span>
              </button>
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
