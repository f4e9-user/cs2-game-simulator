import type {
  ActionResult,
  Background,
  CareerInsight,
  ChoiceResponse,
  Club,
  ClubApplicationSummary,
  GameEvent,
  GameSession,
  EventSequence,
  LeaderboardTeam,
  Loan,
  MatchStats,
  Player,
  RoleProfile,
  RoundPhase,
  SessionSummary,
  RollTraitsResponse,
  ShopItem,
  SocialPost,
  StartGameResponse,
  Stats,
  TeamActionResult,
  TournamentsResponse,
  Trait,
} from './types';

// API base resolution priority (checked in order):
//   1. NEXT_PUBLIC_API_BASE env var (explicit override)
//   2. Client-side: derive from window.location.hostname:
//        - localhost / 127.0.0.1 / LAN → http://127.0.0.1:8787
//        - host starts with "cs."     → https://cs-api.{rest}
//        - otherwise                  → https://{protocol}//api.{host} (generic fallback)
//   3. SSR fallback: http://127.0.0.1:8787
function getApiBase(): string {
  const envBase = process.env.NEXT_PUBLIC_API_BASE;
  if (envBase) return envBase;

  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:8787';
  }

  const host = window.location.hostname;
  const proto = window.location.protocol;

  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('192.168.') ||
    host.endsWith('.local')
  ) {
    return 'http://127.0.0.1:8787';
  }

  if (host.startsWith('cs.')) {
    return `${proto}//cs-api.${host.slice(3)}`;
  }

  return `${proto}//api.${host}`;
}

const API_BASE = getApiBase();

async function request<T>(
  path: string,
  init: RequestInit = {},
  apiToken?: string,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(apiToken ? { authorization: `Bearer ${apiToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: text };
  }
  if (!res.ok) {
    const err =
      (payload as { error?: string } | null)?.error ??
      `HTTP ${res.status}`;
    throw new Error(err);
  }
  return payload as T;
}

export const api = {
  getHealth: () => request<{ ok: boolean; ai: { provider: string; active: boolean } }>('/api/health'),
  listTraits: () => request<{ traits: Trait[] }>('/api/traits'),
  listBackgrounds: () =>
    request<{ backgrounds: Background[] }>('/api/backgrounds'),
  rollTraits: () =>
    request<RollTraitsResponse>('/api/game/roll-traits', { method: 'POST' }),
  startGame: (body: {
    name: string;
    traitIds: string[];
    backgroundId: string;
    originRegion?: string;
    stats?: Stats;
  }) =>
    request<StartGameResponse>('/api/game/start', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getSession: (sessionId: string) =>
    request<GameSession>(`/api/game/${sessionId}`),
  listDebugSessions: (limit = 200) =>
    request<{ sessions: SessionSummary[]; total: number }>(`/api/debug/sessions?limit=${limit}`),
  getDebugAiStatus: () =>
    request<{ provider: string; model: string | null; active: boolean; kvBound: boolean }>('/api/debug/ai-status'),
  getDebugAiEvents: (sessionId: string) =>
    request<{ events: unknown[]; message?: string; validCount?: number; invalidCount?: number }>(`/api/debug/ai-events/${sessionId}`),
  updateDebugSession: (sessionId: string, body: Record<string, unknown>) =>
    request<{ player: Player }>(`/api/debug/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  writeDebugTestLog: () =>
    request<{ ok: boolean; message: string }>('/api/debug/llm-logs/test', { method: 'POST' }),
  submitChoice: (sessionId: string, choiceId: string, customAction?: string, apiToken?: string) =>
    request<ChoiceResponse>(`/api/game/${sessionId}/choice`, {
      method: 'POST',
      body: JSON.stringify(customAction ? { choiceId, customAction } : { choiceId }),
    }, apiToken),
  listTournaments: (sessionId: string) =>
    request<TournamentsResponse>(`/api/game/${sessionId}/tournaments`),
  signup: (sessionId: string, tournamentId: string, apiToken?: string) =>
    request<{ pendingMatch: NonNullable<Player['pendingMatch']>; player: Player }>(
      `/api/game/${sessionId}/signup`,
      { method: 'POST', body: JSON.stringify({ tournamentId }) },
      apiToken,
    ),
  withdraw: (sessionId: string, apiToken?: string) =>
    request<{ player: Player; penalties: string[] }>(`/api/game/${sessionId}/withdraw`, {
      method: 'POST',
    }, apiToken),
  submitAction: (sessionId: string, actionId: string, apiToken?: string) =>
    request<{ actionResult: ActionResult; player: Player; phase: 'action' | 'event'; currentEvent: GameEvent | null; careerInsight?: CareerInsight }>(
      `/api/game/${sessionId}/action`,
      { method: 'POST', body: JSON.stringify({ actionId }) },
      apiToken,
    ),
  endActionPhase: (sessionId: string, apiToken?: string) =>
    request<{ player: Player; phase: 'event'; currentEvent: GameEvent | null; activeEventSequence?: EventSequence | null; careerInsight?: CareerInsight }>(
      `/api/game/${sessionId}/end-action-phase`,
      { method: 'POST' },
      apiToken,
    ),
  buyShopItem: (sessionId: string, itemId: string, apiToken?: string) =>
    request<{
      player: Player;
      itemName: string;
      shopNarrative?: string;
      shopNarrativePositive?: boolean;
      shopBuffLabelsAdded?: string[];
      shopBuffLabelsRemoved?: string[];
      shopTagsAdded?: string[];
      shopTagsRemoved?: string[];
    }>(
      `/api/game/${sessionId}/shop`,
      { method: 'POST', body: JSON.stringify({ itemId }) },
      apiToken,
    ),
  narrateShop: (
    sessionId: string,
    body: { itemName: string; baseNarrative: string; positive?: boolean },
    apiToken?: string,
  ) =>
    request<{ narrative: string }>(
      `/api/game/${sessionId}/narrate-shop`,
      { method: 'POST', body: JSON.stringify(body) },
      apiToken,
    ),
  listShopItems: () =>
    request<{ items: ShopItem[] }>('/api/game/meta/shop'),
  listClubs: () =>
    request<{ clubs: Club[] }>('/api/game/meta/clubs'),
  getRoleProfiles: () =>
    request<{ roleProfiles: RoleProfile[] }>('/api/game/meta/role-profiles'),
  listSessionClubs: (sessionId: string) =>
    request<{ clubs: ClubApplicationSummary[] }>(`/api/game/${sessionId}/clubs`),
  applyClub: (sessionId: string, clubId: string, apiToken?: string) =>
    request<{ player: Player }>(
      `/api/game/${sessionId}/apply-club`,
      { method: 'POST', body: JSON.stringify({ clubId }) },
      apiToken,
    ),
  respondOffer: (sessionId: string, accept: boolean, apiToken?: string) =>
    request<{
      player: Player;
      phase?: RoundPhase;
      currentEvent?: GameEvent | null;
      activeEventSequence?: EventSequence | null;
      leaderboard?: LeaderboardTeam[];
      careerInsight?: CareerInsight;
    }>(
      `/api/game/${sessionId}/team-response`,
      { method: 'POST', body: JSON.stringify({ accept }) },
      apiToken,
    ),
  leaveTeam: (sessionId: string, apiToken?: string) =>
    request<{ player: Player }>(`/api/game/${sessionId}/leave-team`, { method: 'POST' }, apiToken),
  teamPractice: (sessionId: string, teammateId: string, apiToken?: string) =>
    request<{ player: Player; result: TeamActionResult }>(
      `/api/game/${sessionId}/team-practice`,
      { method: 'POST', body: JSON.stringify({ teammateId }) },
      apiToken,
    ),
  teamMeeting: (sessionId: string, apiToken?: string) =>
    request<{ player: Player; result: TeamActionResult }>(
      `/api/game/${sessionId}/team-meeting`,
      { method: 'POST' },
      apiToken,
    ),
  lockerRoomTalk: (sessionId: string, apiToken?: string) =>
    request<{ player: Player; result: TeamActionResult }>(
      `/api/game/${sessionId}/locker-room-talk`,
      { method: 'POST' },
      apiToken,
    ),
  retainCoreTeammate: (sessionId: string, apiToken?: string) =>
    request<{ player: Player; result: TeamActionResult }>(
      `/api/game/${sessionId}/retain-core-teammate`,
      { method: 'POST' },
      apiToken,
    ),
  teamTrainingFocus: (sessionId: string, focus: string, apiToken?: string) =>
    request<{ player: Player; result: TeamActionResult }>(
      `/api/game/${sessionId}/team-training-focus`,
      { method: 'POST', body: JSON.stringify({ focus }) },
      apiToken,
    ),
  getIntro: (sessionId: string, apiToken?: string) =>
    request<{ intro: string }>(`/api/game/${sessionId}/intro`, {}, apiToken),
  getSummary: (sessionId: string, apiToken?: string) =>
    request<{ summary: string; ending?: string }>(`/api/game/${sessionId}/summary`, {}, apiToken),
  getSocialFeed: (sessionId: string, apiToken?: string) =>
    request<{ posts: SocialPost[] }>(`/api/game/${sessionId}/social-feed`, {}, apiToken),
  takeLoan: (sessionId: string, amount: number, apiToken?: string) =>
    request<{ player: Player; loan: Loan }>(
      `/api/game/${sessionId}/loan`,
      { method: 'POST', body: JSON.stringify({ amount }) },
      apiToken,
    ),
  takeFriendLoan: (sessionId: string, amount: number, apiToken?: string) =>
    request<{ player: Player; loan: Loan }>(
      `/api/game/${sessionId}/friend-loan`,
      { method: 'POST', body: JSON.stringify({ amount }) },
      apiToken,
    ),
  pawnItem: (sessionId: string, itemId: string, apiToken?: string) =>
    request<{ player: Player; pawnValue: number }>(
      `/api/game/${sessionId}/pawn`,
      { method: 'POST', body: JSON.stringify({ itemId }) },
      apiToken,
    ),
  narrateStream: async (
    sessionId: string,
    body: {
      baseNarrative: string;
      eventTitle: string;
      choiceLabel: string;
      success: boolean;
      customAction?: string;
      matchStats?: MatchStats;
    },
    apiToken: string,
    onChunk: (text: string) => void,
  ): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/game/${sessionId}/narrate-stream`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const ev = JSON.parse(data) as { text?: string };
          if (typeof ev.text === 'string') onChunk(ev.text);
        } catch {}
      }
    }
  },
};
