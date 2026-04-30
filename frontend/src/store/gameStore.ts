import { create } from 'zustand';
import type {
  GameEvent,
  GameSession,
  LeaderboardTeam,
  Player,
  PromotionCheck,
  RoundResult,
  SessionStatus,
} from '@/lib/types';

interface GameState {
  sessionId: string | null;
  player: Player | null;
  currentEvent: GameEvent | null;
  history: RoundResult[];
  status: SessionStatus;
  ending: string | null;
  lastResult: RoundResult | null;
  promotion: PromotionCheck | null;
  leaderboard: LeaderboardTeam[];

  // 行动阶段：事件决策完成后解锁，进入下一回合时关闭
  actionsPhase: boolean;

  loading: boolean;
  error: string | null;

  hydrateFromSession: (session: GameSession) => void;
  hydrateFromStart: (args: {
    sessionId: string;
    player: Player;
    currentEvent: GameEvent | null;
  }) => void;
  applyChoiceResponse: (args: {
    result: RoundResult;
    player: Player;
    currentEvent: GameEvent | null;
    status: SessionStatus;
    ending?: string;
    promotion?: PromotionCheck;
    leaderboard?: LeaderboardTeam[];
  }) => void;
  setPlayer: (player: Player) => void;
  setActionsPhase: (v: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  sessionId: null,
  player: null,
  currentEvent: null,
  history: [],
  status: 'active',
  ending: null,
  lastResult: null,
  promotion: null,
  leaderboard: [],
  actionsPhase: false,
  loading: false,
  error: null,

  hydrateFromSession: (session) =>
    set({
      sessionId: session.id,
      player: session.player,
      currentEvent: session.currentEvent,
      history: session.history,
      status: session.status,
      ending: session.ending ?? null,
      lastResult: session.history[session.history.length - 1] ?? null,
      promotion: session.promotion ?? null,
      leaderboard: session.leaderboard ?? [],
      error: null,
    }),

  hydrateFromStart: ({ sessionId, player, currentEvent }) =>
    set({
      sessionId,
      player,
      currentEvent,
      history: [],
      status: 'active',
      ending: null,
      lastResult: null,
      promotion: null,
      error: null,
    }),

  applyChoiceResponse: ({
    result,
    player,
    currentEvent,
    status,
    ending,
    promotion,
    leaderboard,
  }) =>
    set((state) => ({
      player,
      currentEvent,
      status,
      ending: ending ?? state.ending,
      history: [...state.history, result],
      lastResult: result,
      promotion: promotion ?? state.promotion,
      leaderboard: leaderboard ?? state.leaderboard,
      // 进入行动阶段（事件未结束时才开启）
      actionsPhase: status === 'active',
      error: null,
    })),

  setPlayer: (player) => set({ player }),
  setActionsPhase: (v) => set({ actionsPhase: v }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  reset: () =>
    set({
      sessionId: null,
      player: null,
      currentEvent: null,
      history: [],
      status: 'active',
      ending: null,
      lastResult: null,
      promotion: null,
      actionsPhase: false,
      loading: false,
      error: null,
    }),
}));
