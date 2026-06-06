'use client';

import type { CareerGoal } from '@/lib/types';

interface Props {
  goal: CareerGoal | null;
}

export function CareerGoalPanel({ goal }: Props) {
  if (!goal) return null;

  return (
    <section className="career-goal-panel">
      <div className="career-goal-header">
        <div>
          <div className="career-goal-kicker">职业目标</div>
          <div className="career-goal-title">{goal.stageLabel}</div>
        </div>
        {goal.nextStageLabel && (
          <span className="career-goal-next">→ {goal.nextStageLabel}</span>
        )}
      </div>

      <div className="career-goal-summary">{goal.summary}</div>

      {goal.goals.length > 0 && (
        <div className="career-goal-block">
          <div className="career-goal-block-title">晋级目标</div>
          <div className="career-goal-list">
            {goal.goals.map((item) => (
              <div key={item.id} className={`career-goal-row${item.completed ? ' completed' : ''}`}>
                <span className="career-goal-label">{item.label}</span>
                <span className="career-goal-count">
                  {Math.min(item.current, item.target)} / {item.target}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="career-goal-block">
        <div className="career-goal-block-title">近期机会</div>
        {goal.opportunities.length > 0 ? (
          <div className="career-opportunity-list">
            {goal.opportunities.map((opportunity) => (
              <div key={`${opportunity.week}-${opportunity.name}`} className="career-opportunity-row">
                <span className="career-opportunity-week">第 {opportunity.week} 周</span>
                <span className="career-opportunity-name">{opportunity.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="career-goal-empty">当前赛季暂无直接机会</div>
        )}
      </div>
    </section>
  );
}
