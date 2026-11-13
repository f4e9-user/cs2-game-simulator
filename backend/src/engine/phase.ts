import type { GameSession } from '../types.js';

export function assertNoActiveEventSequence(session: GameSession): void {
  if (session.activeEventSequence?.status === 'active') {
    throw new Error('当前事件流程未结束，不能进行其他操作');
  }
}
