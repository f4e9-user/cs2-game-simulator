import { create } from 'zustand';
import type {
  CareerInsight,
  GameEvent,
  GameSession,
  EventSequence,
  LeaderboardTeam,
  Player,
  PromotionCheck,
  RoundPlan,
  RoundResult,
  SessionStatus,
  TeamOffer,
  ChoiceResponse,
  TournamentInstance,
  TournamentInstanceSummary,
  WeeklyNewsItem,
} from '@/lib/types';

interface GameState {
  sessionId: string | null;
  apiToken: string | null;
  player: Player | null;
  currentEvent: GameEvent | null;
  queuedEvents: GameEvent[];
  weeklyNews: WeeklyNewsItem[];
  roundPlan: RoundPlan | null;
  activeEventSequence: EventSequence | null;
  history: RoundResult[];
  status: SessionStatus;
  ending: string | null;
  lastResult: RoundResult | null;
  promotion: PromotionCheck | null;
  careerInsight: CareerInsight | null;
  leaderboard: LeaderboardTeam[];
  activeTournamentInstance: TournamentInstance | null;
  tournamentHistory: TournamentInstanceSummary[];

  actionsPhase: boolean;
  pendingOffer: TeamOffer | null;

  aiActive: boolean;
  loading: boolean;
  transitioning: boolean;
  error: string | null;

  setAiActive: (v: boolean) => void;
  hydrateFromSession: (session: GameSession) => void;
  hydrateFromStart: (args: {
    sessionId: string;
    player: Player;
    currentEvent: GameEvent | null;
    queuedEvents?: GameEvent[];
    weeklyNews?: WeeklyNewsItem[];
    roundPlan?: RoundPlan;
    careerInsight?: CareerInsight;
  }) => void;
  applyChoiceResponse: (args: ChoiceResponse) => void;
  setPlayer: (player: Player) => void;
  setCareerInsight: (careerInsight: CareerInsight | null) => void;
  setCurrentEvent: (currentEvent: GameEvent | null) => void;
  setQueuedEvents: (queuedEvents: GameEvent[]) => void;
  setWeeklyNews: (weeklyNews: WeeklyNewsItem[]) => void;
  setRoundPlan: (roundPlan: RoundPlan | null) => void;
  setActiveEventSequence: (activeEventSequence: EventSequence | null) => void;
  setPlayerState: (args: {
    player: Player;
    careerInsight?: CareerInsight;
    leaderboard?: LeaderboardTeam[];
  }) => void;
  setLeaderboard: (leaderboard: LeaderboardTeam[]) => void;
  setActiveTournamentInstance: (activeTournamentInstance: TournamentInstance | null) => void;
  setActionsPhase: (v: boolean) => void;
  clearLastResult: () => void;
  clearOffer: () => void;
  setLoading: (loading: boolean) => void;
  setTransitioning: (v: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  sessionId: null,
  apiToken: null,
  player: null,
  currentEvent: null,
  queuedEvents: [],
  weeklyNews: [],
  roundPlan: null,
  activeEventSequence: null,
  history: [],
  status: 'active',
  ending: null,
  lastResult: null,
  promotion: null,
  careerInsight: null,
  leaderboard: [],
  activeTournamentInstance: null,
  tournamentHistory: [],
  actionsPhase: false,
  pendingOffer: null,
  aiActive: false,
  loading: false,
  transitioning: false,
  error: null,

  hydrateFromSession: (session) =>
    set({
      sessionId: session.id,
      apiToken: session.apiToken,
      player: session.player,
      currentEvent: session.currentEvent,
      queuedEvents: session.queuedEvents ?? [],
      weeklyNews: session.weeklyNews ?? [],
      roundPlan: session.roundPlan ?? null,
      activeEventSequence: session.activeEventSequence ?? null,
      history: session.history,
      status: session.status,
      ending: session.ending ?? null,
      lastResult: session.history[session.history.length - 1] ?? null,
      promotion: session.promotion ?? null,
      careerInsight: session.careerInsight ?? null,
      leaderboard: session.leaderboard ?? [],
      activeTournamentInstance: session.activeTournamentInstance ?? null,
      tournamentHistory: session.tournamentHistory ?? [],
      pendingOffer: session.player.pendingOffer ?? null,
      actionsPhase: session.phase === 'action',
      error: null,
    }),

  hydrateFromStart: ({ sessionId, player, currentEvent, queuedEvents, weeklyNews, careerInsight }) =>
    set({
      sessionId,
      player,
      currentEvent,
      queuedEvents: queuedEvents ?? [],
      weeklyNews: weeklyNews ?? [],
      roundPlan: null,
      activeEventSequence: null,
      history: [],
      status: 'active',
      ending: null,
      lastResult: null,
      promotion: null,
      careerInsight: careerInsight ?? null,
      activeTournamentInstance: null,
      tournamentHistory: [],
      error: null,
    }),

  applyChoiceResponse: ({
    result,
    player,
    currentEvent,
    queuedEvents,
    weeklyNews,
    roundPlan,
    activeEventSequence,
    status,
    ending,
    promotion,
    careerInsight,
    leaderboard,
    activeTournamentInstance,
    tournamentHistory,
  }) =>
    set((state) => ({
      player,
      currentEvent,
      queuedEvents: queuedEvents ?? state.queuedEvents,
      weeklyNews: weeklyNews ?? state.weeklyNews,
      roundPlan: roundPlan ?? state.roundPlan,
      activeEventSequence: activeEventSequence ?? null,
      status,
      ending: ending ?? state.ending,
      history: [...state.history, result],
      lastResult: result,
      promotion: promotion ?? state.promotion,
      careerInsight: careerInsight ?? state.careerInsight,
      leaderboard: leaderboard ?? state.leaderboard,
      activeTournamentInstance: activeTournamentInstance === undefined
        ? state.activeTournamentInstance
        : activeTournamentInstance,
      tournamentHistory: tournamentHistory ?? state.tournamentHistory,
      actionsPhase: false,
      pendingOffer: player.pendingOffer ?? null,
      error: null,
    })),

  setAiActive: (v) => set({ aiActive: v }),
  setPlayer: (player) => set({ player, pendingOffer: player.pendingOffer ?? null }),
  setCareerInsight: (careerInsight) => set({ careerInsight }),
  setCurrentEvent: (currentEvent) => set({ currentEvent }),
  setQueuedEvents: (queuedEvents) => set({ queuedEvents }),
  setWeeklyNews: (weeklyNews) => set({ weeklyNews }),
  setRoundPlan: (roundPlan) => set({ roundPlan }),
  setActiveEventSequence: (activeEventSequence) => set({ activeEventSequence }),
  setPlayerState: ({ player, careerInsight, leaderboard }) =>
    set((state) => ({
      player,
      careerInsight: careerInsight ?? state.careerInsight,
      leaderboard: leaderboard ?? state.leaderboard,
      pendingOffer: player.pendingOffer ?? null,
    })),
  setLeaderboard: (leaderboard) => set({ leaderboard }),
  setActiveTournamentInstance: (activeTournamentInstance) => set({ activeTournamentInstance }),
  setActionsPhase: (v) => set({ actionsPhase: v }),
  clearLastResult: () => set({ lastResult: null }),
  clearOffer: () => set({ pendingOffer: null }),
  setLoading: (loading) => set({ loading }),
  setTransitioning: (v) => set({ transitioning: v }),
  setError: (error) => set({ error, loading: false }),
  reset: () =>
    set({
      sessionId: null,
      player: null,
      currentEvent: null,
      queuedEvents: [],
      weeklyNews: [],
      roundPlan: null,
      activeEventSequence: null,
      history: [],
      status: 'active',
      ending: null,
      lastResult: null,
      promotion: null,
      careerInsight: null,
      activeTournamentInstance: null,
      tournamentHistory: [],
      actionsPhase: false,
      loading: false,
      error: null,
    }),
}));
