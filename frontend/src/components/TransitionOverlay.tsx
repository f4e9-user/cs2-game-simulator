'use client';

interface TransitionOverlayProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
}

export default function TransitionOverlay({
  visible,
  title = '正在生成叙事...',
  subtitle = '请稍候，系统正在处理你的选择',
}: TransitionOverlayProps) {
  if (!visible) return null;

  return (
    <div
      data-testid="transition-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        background: 'rgba(7, 10, 14, 0.85)',
        backdropFilter: 'blur(4px)',
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          border: '3px solid var(--bg-3)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--fg-2)',
          letterSpacing: '0.04em',
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontSize: 12,
          color: 'var(--fg-3)',
        }}
      >
        {subtitle}
      </span>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
