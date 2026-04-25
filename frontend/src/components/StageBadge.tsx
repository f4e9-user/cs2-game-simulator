import type { Stage } from '@/lib/types';
import { STAGE_LABELS } from '@/lib/format';

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className="badge accent">阶段 · {STAGE_LABELS[stage]}</span>;
}
