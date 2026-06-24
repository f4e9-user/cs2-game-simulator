'use client';

import { useEffect } from 'react';

export interface InjuryAlert {
  title: string;
  severity: 'info' | 'warn' | 'danger';
  effects: string[];
}

const INJURY_NOTICE_PATTERNS = [
  '轻微伤病风险',
  '队医警告',
  '伤病警告',
  '伤病状态受限',
  '强制休养',
];

function alertTitle(effect: string): { title: string; severity: InjuryAlert['severity'] } {
  if (effect.includes('强制休养')) return { title: '强制休养', severity: 'danger' };
  if (effect.includes('伤病状态受限')) return { title: '伤病状态受限', severity: 'warn' };
  if (effect.includes('队医警告')) return { title: '伤病警告', severity: 'warn' };
  return { title: '轻微伤病风险', severity: 'info' };
}

export function buildInjuryAlertFromEffects(effects?: string[] | null): InjuryAlert | null {
  const injuryEffects = Array.from(new Set(
    (effects ?? []).filter((effect) => INJURY_NOTICE_PATTERNS.some((pattern) => effect.includes(pattern))),
  ));
  if (injuryEffects.length === 0) return null;

  const { title, severity } = alertTitle(injuryEffects[0]!);
  return {
    title,
    severity,
    effects: injuryEffects,
  };
}

export function InjuryAlertModal({
  alert,
  onClose,
}: {
  alert: InjuryAlert | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!alert) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [alert, onClose]);

  if (!alert) return null;

  const toneColor =
    alert.severity === 'danger'
      ? 'var(--danger)'
      : alert.severity === 'warn'
        ? 'var(--warn)'
        : 'var(--accent)';
  const toneBg =
    alert.severity === 'danger'
      ? 'rgba(255, 94, 94, 0.08)'
      : alert.severity === 'warn'
        ? 'rgba(255, 183, 77, 0.08)'
        : 'rgba(92, 200, 255, 0.08)';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: toneColor,
            marginBottom: 4,
          }}
        >
          伤病提示
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--fg)', marginBottom: 12 }}>
          {alert.title}
        </div>

        <div
          style={{
            fontSize: 13,
            color: alert.severity === 'danger' ? 'var(--danger)' : 'var(--fg)',
            background: toneBg,
            padding: '8px 10px',
            borderRadius: 6,
            marginBottom: 14,
            lineHeight: 1.55,
          }}
        >
          {alert.effects.map((effect) => (
            <div key={effect}>{effect}</div>
          ))}
        </div>

        <button
          type="button"
          className="ghost-button"
          onClick={onClose}
          style={{ width: '100%' }}
        >
          收起
        </button>
      </div>
    </div>
  );
}
