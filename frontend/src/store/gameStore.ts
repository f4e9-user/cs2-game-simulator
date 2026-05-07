import { create } from 'zustand';
import type {
  GameEvent,
  GameSession,
  LeaderboardTeam,
  Player,
  PromotionCheck,
  RoundResult,
  SessionStatus,
  TeamOffer,
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

  actionsPhase: boolean;
  pendingOffer: TeamOffer | null;

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
  setLeaderboard: (leaderboard: LeaderboardTeam[]) => void;
  setActionsPhase: (v: boolean) => void;
  clearOffer: () => void;
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
  pendingOffer: null,
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
      pendingOffer: session.player.pendingOffer ?? null,
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
      actionsPhase: status === 'active',
      pendingOffer: player.pendingOffer ?? null,
      error: null,
    })),

  setPlayer: (player) => set({ player, pendingOffer: player.pendingOffer ?? null }),
  setLeaderboard: (leaderboard) => set({ leaderboard }),
  setActionsPhase: (v) => set({ actionsPhase: v }),
  clearOffer: () => set({ pendingOffer: null }),
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
