'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Stats, StatKey, Trait } from '@/lib/types';
import {
  PER_STAT_MAX,
  POINT_POOL,
  STAT_DESCRIPTION,
  STAT_LABELS,
} from '@/lib/format';

const STAT_ORDER: StatKey[] = [
  'intelligence',
  'agility',
  'experience',
  'money',
  'mentality',
  'constitution',
];

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
    for (const k of STAT_ORDER) {
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
    const avail = STAT_ORDER.filter((k) => s[k] < floor[k] + POINT_POOL);
    if (avail.length === 0) break;
    const pick = avail[Math.floor(Math.random() * avail.length)]!;
    s[pick] += 1;
    remaining -= 1;
  }
  return s;
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

  useEffect(() => {
    if (open) setStats({ ...floor });
  }, [open, floor]);

  const used = useMemo(
    () => STAT_ORDER.reduce((a, k) => a + (stats[k] - floor[k]), 0),
    [stats, floor],
  );
  const remaining = POINT_POOL - used;
  const canConfirm = remaining === 0;

  if (!open) return null;

  const step = (k: StatKey, delta: 1 | -1) => {
    setStats((cur) => {
      const next = cur[k] + delta;
      if (next < floor[k]) return cur;
      if (next > floor[k] + POINT_POOL) return cur;
      if (delta > 0 && remaining <= 0) return cur;
      return { ...cur, [k]: next };
    });
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

        {STAT_ORDER.map((k) => {
          const v = stats[k];
          const floorV = floor[k];
          const negV = negative[k];
          const canInc = remaining > 0 && v < floorV + POINT_POOL;
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
            onClick={() => onConfirm(stats)}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
