'use client';

import { useState } from 'react';
import type { CareerInsight } from '@/lib/types';

interface Props {
  insight?: CareerInsight | null;
}

function severityLabel(severity: CareerInsight['risks'][number]['severity']): string {
  if (severity === 'danger') return '危险';
  if (severity === 'warning') return '警告';
  return '提示';
}

function priorityLabel(priority: CareerInsight['recommendations'][number]['priority']): string {
  if (priority === 'high') return '高';
  if (priority === 'medium') return '中';
  return '低';
}

export function CareerInsightPanel({ insight }: Props) {
  const [onboardingHidden, setOnboardingHidden] = useState(false);
  if (!insight) return null;

  const visibleRisks = insight?.risks?.slice(0, 3) ?? [];
  const visibleRecommendations = insight?.recommendations?.slice(0, 3) ?? [];
  const visibleOpportunities = insight?.opportunities?.slice(0, 12) ?? [];
  const mainMilestone = insight?.milestones?.[0];
  const stagePressure = insight?.stagePressure;
  const playerExplanations = insight?.explanations?.filter((item) => item.visibility === 'player').slice(0, 2) ?? [];
  const showOnboarding = insight?.onboarding && !onboardingHidden && insight.onboarding.mode !== 'hidden';

  return (
    <section className="career-insight-panel">
      <div className="career-insight-header">
        <div>
          <div className="career-insight-kicker">职业助手</div>
          <div className="career-insight-title">{insight.stage.label}</div>
        </div>
        {insight.stage.nextStage && (
          <span className="career-insight-next">→ {insight.stage.nextStage}</span>
        )}
      </div>

      <div className="career-insight-summary">{insight.stage.summary}</div>
      <div className="career-insight-summary strong">{insight.stage.mainObjective}</div>

      {stagePressure && (
        <div className="career-insight-block">
          <div className="career-insight-block-title">身份压力</div>
          <div className={`career-insight-card risk-${stagePressure.level === 'at_risk' ? 'danger' : 'warning'}`}>
            <div className="career-insight-row-title">
              <span>{stagePressure.summary}</span>
              <span>{stagePressure.level === 'at_risk' ? '高危' : '观察'}</span>
            </div>
            {stagePressure.reasons.length > 0 && (
              <ul>
                {stagePressure.reasons.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
            <div className="career-insight-hint">赛季结算会根据连续压力决定是否回落。</div>
          </div>
        </div>
      )}

      {showOnboarding && insight?.onboarding && (
        <div className="career-insight-onboarding">
          <div className="career-insight-row-title">
            <span>{insight.onboarding.title}</span>
            {insight.onboarding.dismissible && (
              <button type="button" onClick={() => setOnboardingHidden(true)}>收起</button>
            )}
          </div>
          <div className="career-insight-text">{insight.onboarding.message}</div>
          <ul>
            {insight.onboarding.checklist.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}

      {mainMilestone && (
        <div className="career-insight-block">
          <div className="career-insight-block-title">下一目标</div>
          <div className={`career-insight-card ${mainMilestone.status}`}>
            <div className="career-insight-row-title">
              <span>{mainMilestone.title}</span>
              <span>{mainMilestone.status === 'ready' ? '已满足' : '推进中'}</span>
            </div>
            <div className="career-insight-text">{mainMilestone.progressText}</div>
            {mainMilestone.missing.length > 0 && (
              <ul>
                {mainMilestone.missing.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
            {mainMilestone.nextStep && <div className="career-insight-hint">{mainMilestone.nextStep}</div>}
          </div>
        </div>
      )}


      {visibleRisks.length > 0 && (
        <div className="career-insight-block">
          <div className="career-insight-block-title">当前风险</div>
          <div className="career-insight-list">
            {visibleRisks.map((risk) => (
              <div key={risk.id} className={`career-insight-card risk-${risk.severity}`}>
                <div className="career-insight-row-title">
                  <span>{risk.title}</span>
                  <span>{severityLabel(risk.severity)}</span>
                </div>
                <div className="career-insight-text">{risk.reason}</div>
                {risk.suggestedMitigation && <div className="career-insight-hint">{risk.suggestedMitigation}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {visibleRecommendations.length > 0 && (
        <div className="career-insight-block">
          <div className="career-insight-block-title">本周建议</div>
          <div className="career-insight-list">
            {visibleRecommendations.map((item) => (
              <div key={`${item.title}-${item.actionId ?? 'text'}`} className="career-insight-card recommendation">
                <div className="career-insight-row-title">
                  <span>{item.title}</span>
                  <span>{priorityLabel(item.priority)}</span>
                </div>
                <div className="career-insight-text">{item.reason}</div>
                <div className="career-insight-hint">{item.expectedBenefit}</div>
                {item.tradeoff && <div className="career-insight-tradeoff">代价：{item.tradeoff}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {playerExplanations.length > 0 && (
        <div className="career-insight-block">
          <div className="career-insight-block-title">状态解释</div>
          <div className="career-insight-list">
            {playerExplanations.map((item) => (
              <div key={item.id} className="career-insight-card explanation">
                <div className="career-insight-row-title"><span>{item.title}</span></div>
                <div className="career-insight-text">{item.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="career-insight-block">
        <div className="career-insight-block-title">未来 12 周晋级赛程</div>
        {visibleOpportunities.length > 0 ? (
          <div className="career-opportunity-list">
            {visibleOpportunities.map((opportunity) => (
              <div key={opportunity.id} className="career-opportunity-row">
                <span className="career-opportunity-week">第 {opportunity.week} 周</span>
                <span className="career-opportunity-tier">{opportunity.tier}</span>
                <span className="career-opportunity-name">{opportunity.name}</span>
                <span
                  className="career-opportunity-tier"
                  title={opportunity.status}
                >
                  {opportunity.available === false ? '无法报名' : '可报名'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="career-insight-empty">未来暂无符合当前晋级目标的赛事</div>
        )}
      </div>
    </section>
  );
}
