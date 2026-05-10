'use client';

import type { Player, PromotionCheck, Trait } from '@/lib/types';
import { STAGE_LABELS, formatMoney } from '@/lib/format';

interface Props {
  player: Player;
  traits: Trait[];
  promotion?: PromotionCheck | null;
}

export function PlayerStats({ player, traits, promotion }: Props) {
  const playerTraits = player.traits
    .map((id) => traits.find((t) => t.id === id))
    .filter((t): t is Trait => Boolean(t));

  return (
    <div className="player-card">
      {/* Career stats */}
      <div className="career-badges">
        <span className="badge">
          参赛 {player.tournamentParticipations ?? 0}
        </span>
        <span
          className={`badge ${(player.tournamentChampionships ?? 0) > 0 ? 'success' : ''}`}
        >
          夺冠 {player.tournamentChampionships ?? 0}
        </span>
        {player.restRounds > 0 && (
          <span className="badge danger">休养 {player.restRounds}回</span>
        )}
        {player.stressMaxRounds > 0 && (
          <span className="badge danger">崩溃预警</span>
        )}
      </div>

      {/* Promotion */}
      {player.promotionPending ? (
        <div style={{ marginBottom: 6 }}>
          <span className="status-alert warn">
            考察来了 → {STAGE_LABELS[player.promotionPending]}
          </span>
        </div>
      ) : promotion && promotion.reasons.length > 0 ? (
        <div style={{ marginBottom: 6 }}>
          <div
            style={{
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--fg-3)',
              marginBottom: 3,
            }}
          >
            晋级条件
          </div>
          {promotion.reasons.map((r, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--fg-2)' }}>
              · {r}
            </div>
          ))}
        </div>
      ) : null}

      {/* Traits */}
      {playerTraits.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div
            style={{
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--fg-3)',
              marginBottom: 4,
            }}
          >
            特质
          </div>
          <div>
            {playerTraits.map((t) => (
              <span key={t.id} className="trait-chip" title={t.description}>
                {t.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {player.tags.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--fg-3)',
              marginBottom: 4,
            }}
          >
            标签
          </div>
          <div>
            {player.tags.map((tag) => (
              <span key={tag} className="trait-chip">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Financial Overview */}
      {(() => {
        const activeLoan = player.loans?.find(
          (l) => !l.paid && !l.defaulted
        );
        const hasPawned = player.pawnedItemIds?.length > 0;
        const isBroke = player.consecutiveBrokeRounds > 0;
        if (!activeLoan && !hasPawned && !isBroke) return null;

        return (
          <div style={{ marginBottom: 4 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--fg-3)',
                marginBottom: 4,
              }}
            >
              财务状况
            </div>
            <div>
              {activeLoan && (
                <>
                  <span className="badge danger">
                    负债 {formatMoney(Math.floor(activeLoan.remainingPrincipal * (1 + activeLoan.interestRate)))}
                  </span>
                  <span className="badge">
                    {player.round >= activeLoan.dueRound ? '逾期' : `${activeLoan.dueRound - player.round}回合到期`}
                  </span>
                </>
              )}
              {hasPawned && (
                <span className="badge warn">
                  已典当 {player.pawnedItemIds.length}件
                </span>
              )}
              {isBroke && (
                <span className="badge danger">
                  连续破产 {player.consecutiveBrokeRounds} 回合
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Bailout Cooldowns */}
      {(player.bailoutCooldown > 0 || player.teamBailoutCooldown > 0) && (
        <div style={{ marginBottom: 4 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--fg-3)',
              marginBottom: 4,
            }}
          >
            救助冷却
          </div>
          <div>
            {player.bailoutCooldown > 0 && (
              <span className="badge">
                家庭救助 {player.bailoutCooldown}回合
              </span>
            )}
            {player.teamBailoutCooldown > 0 && (
              <span className="badge">
                战队救助 {player.teamBailoutCooldown}回合
              </span>
            )}
          </div>
        </div>
      )}

      {/* Salary Status */}
      {player.salaryTracker && player.team && (() => {
        const salary = player.salaryTracker;
        return (
          <div style={{ marginBottom: 4 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--fg-3)',
                marginBottom: 4,
              }}
            >
              薪资状态
            </div>
            <div style={{ fontSize: 10, color: 'var(--fg-2)' }}>
              <div>距上次发薪: {player.round - salary.lastPayRound} 回合</div>
              <div>发薪周期: {salary.payCycle} 回合/次</div>
              {salary.salaryRestoreRound != null && player.round < salary.salaryRestoreRound && (
                <div>临时降薪中，{salary.salaryRestoreRound - player.round} 回合后恢复</div>
              )}
              {salary.originalMonthlySalary != null && player.team && salary.originalMonthlySalary !== player.team.monthlySalary && (
                <div>原薪资: {formatMoney(salary.originalMonthlySalary)}K/月</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Teammate Departure Warning */}
      {player.pendingDeparture && (() => {
        const pd = player.pendingDeparture;
        const roundsLeft = pd.departureRound - player.round;
        return (
          <div style={{ marginBottom: 4 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--fg-3)',
                marginBottom: 4,
              }}
            >
              阵容变动
            </div>
            <div>
              {pd.revealed && (
                <span className="badge danger">
                  {pd.destTeamName} 挖角中
                </span>
              )}
              {!pd.revealed && pd.rumorShown && (
                <span className="badge warn">
                  离队传闻
                </span>
              )}
              <span className="badge">
                {roundsLeft <= 1 ? '即将离队' : `${roundsLeft} 回合后离队`}
              </span>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
