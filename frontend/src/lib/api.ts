import type {
  ActionResult,
  Background,
  ChoiceResponse,
  Club,
  GameSession,
  LeaderboardTeam,
  Player,
  RollTraitsResponse,
  ShopItem,
  StartGameResponse,
  Stats,
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
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
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
  listTraits: () => request<{ traits: Trait[] }>('/api/traits'),
  listBackgrounds: () =>
    request<{ backgrounds: Background[] }>('/api/backgrounds'),
  rollTraits: () =>
    request<RollTraitsResponse>('/api/game/roll-traits', { method: 'POST' }),
  startGame: (body: {
    name: string;
    traitIds: string[];
    backgroundId: string;
    stats?: Stats;
  }) =>
    request<StartGameResponse>('/api/game/start', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getSession: (sessionId: string) =>
    request<GameSession>(`/api/game/${sessionId}`),
  submitChoice: (sessionId: string, choiceId: string) =>
    request<ChoiceResponse>(`/api/game/${sessionId}/choice`, {
      method: 'POST',
      body: JSON.stringify({ choiceId }),
    }),
  listTournaments: (sessionId: string) =>
    request<TournamentsResponse>(`/api/game/${sessionId}/tournaments`),
  signup: (sessionId: string, tournamentId: string) =>
    request<{ pendingMatch: NonNullable<Player['pendingMatch']>; player: Player }>(
      `/api/game/${sessionId}/signup`,
      { method: 'POST', body: JSON.stringify({ tournamentId }) },
    ),
  withdraw: (sessionId: string) =>
    request<{ player: Player; penalties: string[] }>(`/api/game/${sessionId}/withdraw`, {
      method: 'POST',
    }),
  submitAction: (sessionId: string, actionId: string) =>
    request<{ actionResult: ActionResult; player: Player }>(
      `/api/game/${sessionId}/action`,
      { method: 'POST', body: JSON.stringify({ actionId }) },
    ),
  buyShopItem: (sessionId: string, itemId: string) =>
    request<{ player: Player; itemName: string }>(
      `/api/game/${sessionId}/shop`,
      { method: 'POST', body: JSON.stringify({ itemId }) },
    ),
  listShopItems: () =>
    request<{ items: ShopItem[] }>('/api/game/meta/shop'),
  listClubs: () =>
    request<{ clubs: Club[] }>('/api/game/meta/clubs'),
  applyClub: (sessionId: string, clubId: string) =>
    request<{ player: Player }>(
      `/api/game/${sessionId}/apply-club`,
      { method: 'POST', body: JSON.stringify({ clubId }) },
    ),
  respondOffer: (sessionId: string, accept: boolean) =>
    request<{ player: Player; leaderboard?: LeaderboardTeam[] }>(
      `/api/game/${sessionId}/team-response`,
      { method: 'POST', body: JSON.stringify({ accept }) },
    ),
};
