import type { Player } from '../../types.js';
import { INSIGHT_RISK_THRESHOLDS } from '../constants.js';
import type { RiskInsight } from './types.js';

const SEVERITY_ORDER: Record<RiskInsight['severity'], number> = {
  danger: 0,
  warning: 1,
  info: 2,
};

export function buildRiskInsights(player: Player): RiskInsight[] {
  const risks: RiskInsight[] = [];
  const fatigue = player.volatile?.fatigue ?? 0;
  const money = player.stats.money ?? 0;

  if ((player.stress ?? 0) >= INSIGHT_RISK_THRESHOLDS.highStress) {
    risks.push({
      id: 'high-stress',
      severity: 'danger',
      title: '压力接近崩溃线',
      reason: `当前压力 ${Math.round(player.stress)}，继续承压可能触发崩溃结局。`,
      suggestedMitigation: '优先选择休息、冥想或低风险行动，避免继续堆叠压力。',
      relatedStats: ['stress', 'mentality'],
    });
  } else if ((player.stress ?? 0) >= INSIGHT_RISK_THRESHOLDS.mediumStress) {
    risks.push({
      id: 'medium-stress',
      severity: 'warning',
      title: '压力偏高',
      reason: `当前压力 ${Math.round(player.stress)}，后续失败和高疲劳会让风险更明显。`,
      suggestedMitigation: '在关键比赛前预留恢复回合。',
      relatedStats: ['stress'],
    });
  }

  if (fatigue >= INSIGHT_RISK_THRESHOLDS.fatigueWarning) {
    risks.push({
      id: 'high-fatigue',
      severity: fatigue >= INSIGHT_RISK_THRESHOLDS.fatigueDanger ? 'danger' : 'warning',
      title: '疲劳过高',
      reason: `当前疲劳 ${Math.round(fatigue)}，会放大压力收益并提高伤病/失误风险。`,
      suggestedMitigation: '安排休息、度假或冥想，必要时放弃低价值行动。',
      relatedStats: ['fatigue', 'constitution'],
    });
  }

  if (money <= INSIGHT_RISK_THRESHOLDS.lowMoney) {
    risks.push({
      id: 'low-money',
      severity: money <= 0 ? 'danger' : 'warning',
      title: '资金紧张',
      reason: `当前资金 ${Math.round(money)}，可能限制报名、恢复和装备选择。`,
      suggestedMitigation: '考虑赚钱行动、谨慎购物，必要时评估贷款代价。',
      relatedStats: ['money'],
    });
  }

  if ((player.teamTrust ?? 50) <= INSIGHT_RISK_THRESHOLDS.lowTeamTrust && player.team) {
    risks.push({
      id: 'low-team-trust',
      severity: 'warning',
      title: '队伍信任偏低',
      reason: `当前队伍信任 ${Math.round(player.teamTrust)}，队内冲突和离队压力会上升。`,
      suggestedMitigation: '考虑战术会议、安抚更衣室或降低激进行动。',
      relatedStats: ['teamTrust'],
    });
  }

  if ((player.consecutiveLosses ?? 0) >= INSIGHT_RISK_THRESHOLDS.lossStreak) {
    risks.push({
      id: 'loss-streak',
      severity: 'warning',
      title: '连续失利',
      reason: `已经连续失利 ${player.consecutiveLosses} 场，心态、舆论和对手事件风险会上升。`,
      suggestedMitigation: '优先恢复状态或选择更稳妥的赛事节奏。',
      relatedStats: ['consecutiveLosses', 'mentality'],
    });
  }

  if ((player.actionPoints ?? 0) < INSIGHT_RISK_THRESHOLDS.lowActionPoints) {
    risks.push({
      id: 'low-ap',
      severity: 'info',
      title: '本周 AP 不多',
      reason: `当前 AP ${player.actionPoints ?? 0}，可执行的行动空间有限。`,
      suggestedMitigation: '优先处理本周最关键的目标，不要分散行动。',
      relatedStats: ['actionPoints'],
    });
  }

  return risks.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id));
}
