import type { GameSession } from '../../types.js';
import type { BlockerInsight, ExplanationInsight } from './types.js';

export function buildEventExplanations(session: GameSession): ExplanationInsight[] {
  const explanations: ExplanationInsight[] = [];
  const event = session.currentEvent;

  if (session.phase === 'event' && event) {
    explanations.push({
      id: `event:${event.type}`,
      title: '当前事件触发原因',
      detail: event.type === 'tournament-context'
        ? '你正处在赛事报名、赛前、赛后或系列赛上下文中，系统优先处理赛事上下文事件。'
        : `当前处于事件阶段，系统抽取了 ${event.type} 类型事件。`,
      visibility: event.type === 'tournament-context' ? 'player' : 'debug',
    });
  }

  if (session.player.pendingMatch) {
    explanations.push({
      id: 'pending-match',
      title: '已有待进行赛事',
      detail: `${session.player.pendingMatch.displayName ?? session.player.pendingMatch.name} 将在第 ${session.player.pendingMatch.resolveWeek} 周进行，当前行动应围绕状态管理。`,
      visibility: 'player',
    });
  }

  return explanations;
}

export function buildBlockerInsights(session: GameSession): BlockerInsight[] {
  const blockers: BlockerInsight[] = [];

  if (session.phase === 'event') {
    blockers.push({
      id: 'event-phase-actions-locked',
      title: '事件阶段不能安排日常行动',
      detail: '请先完成当前事件选择，结算后才能进入下一回合行动阶段。',
      severity: 'info',
    });
  }

  if (session.player.pendingMatch) {
    blockers.push({
      id: 'pending-match-signup-locked',
      title: '已有报名赛事',
      detail: '当前已有待进行赛事，通常需要先完成或退赛后再考虑新的报名。',
      severity: 'warning',
    });
  }

  return blockers;
}
