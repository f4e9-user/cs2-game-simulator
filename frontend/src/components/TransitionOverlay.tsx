'use client';

interface TransitionOverlayProps {
  visible: boolean;
}

export default function TransitionOverlay({ visible }: TransitionOverlayProps) {
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
        正在生成个性化剧情...
      </span>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
