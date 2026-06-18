'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Stats, StatKey, Trait } from '@/lib/types';
import {
  OPENING_STAT_INVEST_MAX,
  PER_STAT_MAX,
  POINT_POOL,
  STAT_DESCRIPTION,
  STAT_LABELS,
} from '@/lib/format';

const ALLOCATABLE_STAT_ORDER: StatKey[] = [
  'intelligence',
  'agility',
  'mentality',
  'constitution',
];
const TRAIT_STAT_ORDER: StatKey[] = [...ALLOCATABLE_STAT_ORDER, 'experience'];

function zeroStats(): Stats {
  return {
    intelligence: 0,
    agility: 0,
    experience: 0,
    money: 0,
    mentality: 0,
    constitution: 0,
  };
}

function computeFloorAndNegative(traits: Trait[]): {
  floor: Stats;
  negative: Stats;
} {
  const floor = zeroStats();
  const negative = zeroStats();
  for (const t of traits) {
    for (const k of TRAIT_STAT_ORDER) {
      const v = t.modifiers[k];
      if (typeof v !== 'number') continue;
      if (v > 0) floor[k] += v;
      else if (v < 0) negative[k] += v;
    }
  }
  return { floor, negative };
}

function randomAbove(floor: Stats, pool = POINT_POOL): Stats {
  const s = { ...floor };
  let remaining = pool;
  while (remaining > 0) {
    const avail = ALLOCATABLE_STAT_ORDER.filter((k) => s[k] < floor[k] + OPENING_STAT_INVEST_MAX);
    if (avail.length === 0) break;
    const pick = avail[Math.floor(Math.random() * avail.length)]!;
    s[pick] += 1;
    remaining -= 1;
  }
  return s;
}

function negativeOverflowLabels(stats: Stats, negative: Stats): string[] {
  return TRAIT_STAT_ORDER
    .filter((k) => stats[k] + negative[k] < 0)
    .map((k) => STAT_LABELS[k]);
}

interface Props {
  open: boolean;
  traits: Trait[];
  onCancel: () => void;
  onConfirm: (stats: Stats) => void;
}

export function StatAllocatorModal({
  open,
  traits,
  onCancel,
  onConfirm,
}: Props) {
  const { floor, negative } = useMemo(
    () => computeFloorAndNegative(traits),
    [traits],
  );

  const [stats, setStats] = useState<Stats>(() => ({ ...floor }));
  const [overflowConfirmOpen, setOverflowConfirmOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setStats({ ...floor });
      setOverflowConfirmOpen(false);
    }
  }, [open, floor]);

  const used = useMemo(
    () => ALLOCATABLE_STAT_ORDER.reduce((a, k) => a + (stats[k] - floor[k]), 0),
    [stats, floor],
  );
  const remaining = POINT_POOL - used;
  const canConfirm = remaining === 0;
  const overflowLabels = useMemo(
    () => negativeOverflowLabels(stats, negative),
    [stats, negative],
  );

  if (!open) return null;

  const step = (k: StatKey, delta: 1 | -1) => {
    setStats((cur) => {
      const next = cur[k] + delta;
      if (next < floor[k]) return cur;
      if (next > floor[k] + OPENING_STAT_INVEST_MAX) return cur;
      if (delta > 0 && remaining <= 0) return cur;
      return { ...cur, [k]: next };
    });
  };

  const confirmAllocation = () => {
    if (overflowLabels.length > 0) {
      setOverflowConfirmOpen(true);
      return;
    }
    onConfirm(stats);
  };

  const confirmOverflowAllocation = () => {
    setOverflowConfirmOpen(false);
    onConfirm(stats);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 18 }}>分配属性点</div>
          <span className={`badge ${canConfirm ? 'success' : 'accent'}`}>
            剩余 {remaining} / {POINT_POOL}
          </span>
        </div>

        <div className="stat-desc" style={{ marginBottom: 10 }}>
          特质加成作为底线（<span style={{ color: 'var(--success)' }}>绿</span>
          ），不能再减少；特质扣减（<span style={{ color: 'var(--danger)' }}>红</span>
          ）在确认后应用，可用点数抵消。
        </div>

        {ALLOCATABLE_STAT_ORDER.map((k) => {
          const v = stats[k];
          const floorV = floor[k];
          const negV = negative[k];
          const canInc = remaining > 0 && v < floorV + OPENING_STAT_INVEST_MAX;
          const canDec = v > floorV;
          const final = Math.max(0, Math.min(PER_STAT_MAX * 2, v + negV));
          return (
            <div className="stepper" key={k}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="stat-label">{STAT_LABELS[k]}</div>
                <div className="stat-desc">{STAT_DESCRIPTION[k]}</div>
                <div
                  style={{
                    display: 'flex',
                    gap: 4,
                    flexWrap: 'wrap',
                    marginTop: 4,
                  }}
                >
                  {floorV > 0 && (
                    <span className="delta-chip up">特质 +{floorV}</span>
                  )}
                  {negV < 0 && (
                    <span className="delta-chip down">特质 {negV}</span>
                  )}
                  {(floorV > 0 || negV < 0) && (
                    <span className="delta-chip">最终 = {final}</span>
                  )}
                </div>
              </div>
              <div className="stepper-controls">
                <button
                  type="button"
                  className="ghost-button stepper-btn"
                  disabled={!canDec}
                  onClick={() => step(k, -1)}
                >
                  −
                </button>
                <div className="stepper-value">{v}</div>
                <button
                  type="button"
                  className="ghost-button stepper-btn"
                  disabled={!canInc}
                  onClick={() => step(k, 1)}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}

        {(floor.experience > 0 || negative.experience < 0) && (
          <div className="stepper">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="stat-label">{STAT_LABELS.experience}</div>
              <div className="stat-desc">
                {STAT_DESCRIPTION.experience}。经验不消耗开局点数，进入生涯后由赛事和时间增长。
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  flexWrap: 'wrap',
                  marginTop: 4,
                }}
              >
                {floor.experience > 0 && (
                  <span className="delta-chip up">特质 +{floor.experience}</span>
                )}
                {negative.experience < 0 && (
                  <span className="delta-chip down">特质 {negative.experience}</span>
                )}
                <span className="delta-chip">
                  初始 = {Math.max(0, Math.min(PER_STAT_MAX * 2, floor.experience + negative.experience))}
                </span>
              </div>
            </div>
            <div className="stepper-controls">
              <div className="stepper-value">{floor.experience}</div>
            </div>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 16,
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="ghost-button"
            onClick={() => setStats({ ...floor })}
          >
            重置
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setStats(randomAbove(floor))}
          >
            随机分配
          </button>
          <button type="button" className="ghost-button" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!canConfirm}
            onClick={confirmAllocation}
          >
            确认
          </button>
        </div>
      </div>

      {overflowConfirmOpen && (
        <div className="modal-backdrop" onClick={() => setOverflowConfirmOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 480 }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--fg-2)',
                marginBottom: 4,
              }}
            >
              属性风险
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 12,
                gap: 8,
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)' }}>
                确认带伤开局？
              </div>
              <span className="badge danger" style={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                负面溢出
              </span>
            </div>

            <div
              style={{
                fontSize: 14,
                color: 'var(--fg-2)',
                lineHeight: 1.6,
                marginBottom: 14,
              }}
            >
              以下属性会被压到 0 以下。系统会保留 0 下限，但开局会获得可恢复的负面状态。
            </div>

            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--fg-2)',
                  marginBottom: 8,
                }}
              >
                影响属性
              </div>
              <div className="chips-row">
                {overflowLabels.map((label) => (
                  <span key={label} className="chip chip-down">
                    {label}
                  </span>
                ))}
                <span className="chip chip-neu">可等待自动恢复</span>
                <span className="chip chip-neu">可花费资源提前移除</span>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(210, 153, 34, 0.08)',
                border: '1px solid rgba(210, 153, 34, 0.25)',
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 16,
                fontSize: 13,
                color: 'var(--fg-2)',
                lineHeight: 1.5,
              }}
            >
              这些负面状态不会永久跟随整局游戏，但需要付出游戏成本处理，或等待一段生涯时间自然消退。
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setOverflowConfirmOpen(false)}
                style={{ flex: 1 }}
              >
                返回调整
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={confirmOverflowAllocation}
                style={{ flex: 2 }}
              >
                确认继续
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
