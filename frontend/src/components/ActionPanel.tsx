'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useGameStore } from '@/store/gameStore';
import type { ActionResult, Player, RulesMeta, Stage, TeamActionResult } from '@/lib/types';

interface ActionMeta {
  id: string;
  label: string;
  description: string;
  icon: string;
  apCost: number;
  category: 'growth' | 'recovery' | 'income';
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
    category: 'growth',
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
    category: 'growth',
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
    category: 'recovery',
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
    category: 'growth',
  },
  {
    id: 'action-meditation',
    label: '冥想静心',
    description: '快速缓解疲劳与压力，不消耗成长预算',
    icon: '🧘',
    apCost: 15,
    category: 'recovery',
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
    category: 'growth',
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
    category: 'recovery',
  },
  {
    id: 'action-boosting',
    label: '代练接单',
    description: '高强度代练，用枪法换现金',
    icon: '💰',
    apCost: 35,
    category: 'income',
  },
  {
    id: 'action-coaching',
    label: '陪玩指导',
    description: '指导新人，稳定收入',
    icon: '🎓',
    apCost: 30,
    category: 'income',
  },
  {
    id: 'action-net-cafe',
    label: '网吧打工',
    description: '网吧值班，体力换钱',
    icon: '🖥️',
    apCost: 35,
    category: 'income',
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

const RECOVERY_ACTION_IDS = new Set(['action-rest-day', 'action-meditation', 'action-vacation']);

const CATEGORY_LABELS: Record<ActionMeta['category'], string> = {
  growth: '训练成长',
  recovery: '恢复调整',
  income: '赚钱',
};

const TEAM_TRAINING_FOCUS_OPTIONS = [
  { id: 'firepower', label: '枪法压迫' },
  { id: 'tactics', label: '战术执行' },
  { id: 'defense', label: '防守纪律' },
  { id: 'mental', label: '心态稳定' },
] as const;

interface Props {
  sessionId: string;
  player: Player;
  enabled: boolean; // false = 事件决策前，不可用
  actionPointMax: number;
  injuryRisk: RulesMeta['injuryRisk'];
  onPlayerUpdate: (p: Player) => void;
  onActionResult?: (result: ActionResult, moneyChange: number) => void;
  disabledReason?: string;
}

function ApBar({ ap, max }: { ap: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (ap / max) * 100)) : 0;
  return (
    <div className="ap-bar">
      <div className="ap-track" aria-hidden="true">
        <div className="ap-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="ap-label">{ap} AP</span>
    </div>
  );
}

function forcedRestRiskReason(player: Player, actionId: string, injuryRisk: RulesMeta['injuryRisk']): string | null {
  if (RECOVERY_ACTION_IDS.has(actionId)) return null;
  if (!player.tags.includes('injury-limited')) return null;

  const fatigue = player.volatile?.fatigue ?? 0;
  const constitution = player.stats.constitution ?? 0;
  const reasons: string[] = [];
  if (fatigue >= injuryRisk.forcedRestFatigueThreshold) reasons.push('疲劳过高');
  if (constitution <= injuryRisk.lowConstitutionThreshold) reasons.push('体质过低');
  if (reasons.length === 0) return null;
  return reasons.join('；');
}

function ActionForcedRestConfirmModal({
  action,
  reason,
  onConfirm,
  onCancel,
}: {
  action: ActionMeta;
  reason: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--danger)',
            marginBottom: 4,
          }}
        >
          伤病风险
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', marginBottom: 12 }}>
          确认执行 {action.label}
        </div>

        <div
          style={{
            fontSize: 13,
            color: 'var(--danger)',
            background: 'rgba(255, 94, 94, 0.08)',
            padding: '8px 10px',
            borderRadius: 6,
            marginBottom: 14,
            lineHeight: 1.55,
          }}
        >
          当前已经是伤病受限状态。继续进行这项非恢复行动后，会立即进入强制休养。
          <br />
          原因：{reason}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="ghost-button" onClick={onCancel} style={{ flex: 1 }}>
            取消
          </button>
          <button type="button" className="primary-button" onClick={onConfirm} style={{ flex: 1 }}>
            仍然执行
          </button>
        </div>
      </div>
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


export function ActionPanel({ sessionId, player, enabled, actionPointMax, injuryRisk, onPlayerUpdate, onActionResult, disabledReason }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forcedRestConfirm, setForcedRestConfirm] = useState<{ action: ActionMeta; reason: string } | null>(null);
  const [mode, setMode] = useState<'daily' | 'team'>('daily');
  const [teamActionResult, setTeamActionResult] = useState<TeamActionResult | null>(null);
  const apiToken = useGameStore((s) => s.apiToken);

  const ap = player.actionPoints ?? 0;
  const activeComboIds = new Set((player.roundCombos ?? []).map((combo) => combo.id));
  const isResting = (player.restRounds ?? 0) > 0;

  const isTournamentWeek =
    player.pendingMatch !== null &&
    player.pendingMatch.resolveYear === player.year &&
    player.pendingMatch.resolveWeek === player.week;

  const doAction = async (actionId: string) => {
    setForcedRestConfirm(null);
    setBusyId(actionId);
    setError(null);
    const prevMoney = player.stats.money;
    try {
      const res = await api.submitAction(sessionId, actionId, apiToken ?? undefined);
      const moneyChange = res.actionResult.newStats.money - prevMoney;
      onActionResult?.(res.actionResult, moneyChange);
      onPlayerUpdate(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const replayLastWeekActions = async () => {
    setForcedRestConfirm(null);
    setBusyId('replay-last-week');
    setError(null);
    let previousMoney = player.stats.money;
    try {
      const res = await api.replayLastWeekActions(sessionId, apiToken ?? undefined);
      for (const actionResult of res.replayResults) {
        const moneyChange = actionResult.newStats.money - previousMoney;
        previousMoney = actionResult.newStats.money;
        onActionResult?.(actionResult, moneyChange);
      }
      if (res.replayTeamResults?.length) {
        setTeamActionResult(res.replayTeamResults[res.replayTeamResults.length - 1]!);
      }
      onPlayerUpdate(res.player);
      if (res.replayStopped) {
        setError(`重复上周行动已停止：第 ${res.replayStopped.index + 1} 个行动失败（${res.replayStopped.reason}）`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const requestAction = (action: ActionMeta) => {
    const riskReason = forcedRestRiskReason(player, action.id, injuryRisk);
    if (riskReason) {
      setForcedRestConfirm({ action, reason: riskReason });
      return;
    }
    void doAction(action.id);
  };

  const panelDisabledReason = !enabled
    ? (disabledReason ?? '先完成本回合事件决策')
    : isTournamentWeek
    ? '赛事比赛周 — 行动力冻结'
    : isResting
    ? '休养期间不能进行日常行动'
    : null;
  const lastWeekActionCount = player.lastWeekRoutineActions?.length ?? 0;
  const replayDisabledReason = panelDisabledReason
    ?? (lastWeekActionCount === 0 ? '上周没有可重复的行动' : null);
  const canReplay = replayDisabledReason === null && busyId === null;
  const hasTeam = Boolean(player.team);
  const weeklyTeamActions = player.weeklyTeamActions ?? {};
  const currentYear = player.year ?? 1;
  const currentWeek = player.week ?? 1;
  const teamActionCount = (actionId: string) => {
    const record = weeklyTeamActions[actionId];
    return record && record.year === currentYear && record.week === currentWeek ? record.count : 0;
  };
  const canShowRetain = Boolean(
    player.pendingDeparture?.revealed &&
    player.team &&
    player.roster?.some((tm) => tm.id === player.pendingDeparture?.slotId),
  );
  const canRetain = Boolean(
    enabled &&
    !panelDisabledReason &&
    !busyId &&
    player.pendingDeparture?.revealed &&
    player.round < player.pendingDeparture.departureRound &&
    !player.pendingDeparture.retentionAttempted &&
    ap >= 35,
  );
  const canInfluenceStrategy =
    player.visibleTeamIdentity === 'caller' ||
    player.visibleTeamIdentity === 'star' ||
    player.visibleTeamIdentity === 'star-caller';

  const runTeamAction = async (
    actionId: string,
    fn: () => Promise<{ player: Player; result: TeamActionResult }>,
  ) => {
    setBusyId(actionId);
    setError(null);
    try {
      const res = await fn();
      setTeamActionResult(res.result);
      onPlayerUpdate(res.player);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="action-panel">
      <div className="action-panel-header">
        <button
          type="button"
          className="action-panel-title-toggle"
          onClick={() => hasTeam && setMode((value) => (value === 'daily' ? 'team' : 'daily'))}
          disabled={!hasTeam}
          title={hasTeam ? '点击切换日常行动/团队管理' : undefined}
        >
          {mode === 'team' ? '团队管理' : '日常行动'}
        </button>
        <div className="action-panel-header-tools">
          <button
            type="button"
            className="ghost-button repeat-actions-button"
            disabled={!canReplay || busyId === 'replay-last-week'}
            onClick={() => void replayLastWeekActions()}
            title={replayDisabledReason ?? `按顺序重复上周 ${lastWeekActionCount} 个行动`}
          >
            ↻ 重复上周
          </button>
          <ApBar ap={isTournamentWeek ? 0 : ap} max={actionPointMax} />
        </div>
      </div>

      {panelDisabledReason ? (
        <div className="action-panel-hint">{panelDisabledReason}</div>
      ) : null}

      {mode === 'daily' && (player.roundCombos?.length ?? 0) > 0 && !panelDisabledReason ? (
        <div className="action-panel-hint">
          本回合连锁：{player.roundCombos.map((combo) => combo.label).join(' / ')}
        </div>
      ) : null}

      {mode === 'daily' ? (
      <div className={`action-list ${panelDisabledReason ? 'panel-disabled' : ''}`}>
        {(['growth', 'recovery', 'income'] as const).map((category) => {
          const group = ACTIONS.filter((a) => a.category === category);
          return (
            <div key={category} className="action-group">
              <div className="action-group-title">{CATEGORY_LABELS[category]}</div>
              {group.map((a) => {
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
          const comboTitle = availableCombos.length > 0
            ? availableCombos.map((combo) => `${combo.label}：${combo.summary}`).join('\n')
            : undefined;
                return (
                  <div key={a.id} className="action-item">
                    <button
                      type="button"
                      className="action-btn"
                      disabled={!canDo || busyId === a.id}
                      onClick={() => requestAction(a)}
                      title={actionDisabledReason || undefined}
                    >
                      <div className="action-btn-body">
                        <div className="action-btn-label">{a.label}</div>
                        <div className="action-btn-desc">{a.description}</div>
                      </div>
                      <div className="action-btn-side">
                        {availableCombos.length > 0 && (
                          <span className="combo-count-badge" title={comboTitle}>连锁 ×{availableCombos.length}</span>
                        )}
                        <span className="ap-cost-badge">-{a.apCost} AP</span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      ) : (
        <div className={`action-list ${panelDisabledReason ? 'panel-disabled' : ''}`}>
          <div className="action-group">
            <div className="action-group-title">团队管理</div>
            {[
              {
                id: 'team-meeting',
                label: teamActionCount('team-meeting') >= 1 ? '会议已开' : '战术会议',
                description: '统一战术语言，提升队内执行。',
                apCost: 30,
                disabledReason: teamActionCount('team-meeting') >= 1 ? '本周会议已开' : null,
                run: () => api.teamMeeting(sessionId, apiToken ?? undefined),
              },
              {
                id: 'locker-room-talk',
                label: teamActionCount('locker-room-talk') >= 1 ? '已安抚' : '安抚更衣室',
                description: '缓和队内紧张，压低冲突风险。',
                apCost: 25,
                disabledReason: teamActionCount('locker-room-talk') >= 1
                  ? '本周已安抚'
                  : (!player.tags.includes('locker-tension') && (player.teamTrust ?? 50) >= 30)
                    ? '当前更衣室不需要额外安抚'
                    : null,
                run: () => api.lockerRoomTalk(sessionId, apiToken ?? undefined),
              },
              ...(canShowRetain ? [{
                id: 'retain-core-teammate',
                label: `挽留 ${player.roster?.find((tm) => tm.id === player.pendingDeparture?.slotId)?.name ?? '核心队友'}`,
                description: '处理离队风险，争取保住关键队友。',
                apCost: 35,
                disabledReason: canRetain ? null : '当前不能挽留',
                run: () => api.retainCoreTeammate(sessionId, apiToken ?? undefined),
              }] : []),
              ...TEAM_TRAINING_FOCUS_OPTIONS.map((option) => ({
                id: `team-training-focus:${option.id}`,
                label: option.label,
                description: '调整本周团队训练重点。',
                apCost: 20,
                disabledReason: canInfluenceStrategy ? null : '需要队内话语权',
                run: () => api.teamTrainingFocus(sessionId, option.id, apiToken ?? undefined),
              })),
            ].map((a) => {
              const lockedReason = panelDisabledReason
                ?? (ap < a.apCost ? 'AP 不足' : a.disabledReason);
              const canDo = lockedReason === null && busyId === null;
              return (
                <div key={a.id} className="action-item">
                  <button
                    type="button"
                    className="action-btn"
                    disabled={!canDo || busyId === a.id}
                    onClick={() => void runTeamAction(a.id, a.run)}
                    title={lockedReason ?? undefined}
                  >
                    <div className="action-btn-body">
                      <div className="action-btn-label">{a.label}</div>
                      <div className="action-btn-desc">{a.description}</div>
                    </div>
                    <span className="ap-cost-badge">-{a.apCost} AP</span>
                  </button>
                </div>
              );
            })}
          </div>
          {teamActionResult && (
            <div className="action-result-box">
              <div className={teamActionResult.success ? 'positive' : 'negative'}>
                {teamActionResult.label} · {teamActionResult.success ? '成功' : '失败'} ({teamActionResult.roll}/{teamActionResult.dc})
              </div>
              <div className="muted-text">{teamActionResult.narrative}</div>
              <div className="chip-row">
                {teamActionResult.comboTriggeredLabels?.map((label) => (
                  <span key={`triggered-${label}`} className="chip chip-pos">触发连锁：{label}</span>
                ))}
                {teamActionResult.comboAddedLabels?.map((label) => (
                  <span key={`added-${label}`} className="chip chip-neu">形成连锁：{label}</span>
                ))}
                {teamActionResult.effects.map((effect) => (
                  <span key={effect} className="chip chip-neu">{effect}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
          {error}
        </div>
      )}

      {forcedRestConfirm && (
        <ActionForcedRestConfirmModal
          action={forcedRestConfirm.action}
          reason={forcedRestConfirm.reason}
          onCancel={() => setForcedRestConfirm(null)}
          onConfirm={() => void doAction(forcedRestConfirm.action.id)}
        />
      )}
    </div>
  );
}
