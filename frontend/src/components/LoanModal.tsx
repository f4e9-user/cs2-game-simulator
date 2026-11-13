'use client';

import { LoanPanel } from '@/components/LoanPanel';
import type { Player } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  player: Player;
  onPlayerUpdate: (p: Player) => void;
  enabled?: boolean;
}

export function LoanModal({ open, onClose, sessionId, player, onPlayerUpdate, enabled = true }: Props) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="loan-modal-title"
        style={{ maxWidth: 400, padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="loan-modal-title" style={{ fontSize: 16, margin: '0 0 12px' }}>贷款</h2>
        <LoanPanel
          sessionId={sessionId}
          player={player}
          onPlayerUpdate={onPlayerUpdate}
          enabled={enabled}
        />
        <button
          type="button"
          className="ghost-button"
          onClick={onClose}
          style={{ width: '100%', marginTop: 12, fontSize: 12 }}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
