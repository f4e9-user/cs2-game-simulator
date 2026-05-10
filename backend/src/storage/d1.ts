import type { GameSession } from '../types.js';

// Migrate legacy session data after loading from storage.
// Handles schema changes that would otherwise silently produce undefined/NaN.
function migrateSession(session: GameSession): GameSession {
  const p = session.player as Record<string, unknown>;

  // weeklySalary → monthlySalary (renamed; multiply by 4 to approximate monthly)
  const team = p['team'] as Record<string, unknown> | null;
  if (team && 'weeklySalary' in team && !('monthlySalary' in team)) {
    team['monthlySalary'] = (team['weeklySalary'] as number) * 4;
    delete team['weeklySalary'];
  }
  const pendingOffer = p['pendingOffer'] as Record<string, unknown> | null;
  if (pendingOffer && 'weeklySalary' in pendingOffer && !('monthlySalary' in pendingOffer)) {
    pendingOffer['monthlySalary'] = (pendingOffer['weeklySalary'] as number) * 4;
    delete pendingOffer['weeklySalary'];
  }

  // star/veteran stage removed — remap to nearest valid stage
  const stage = p['stage'] as string;
  if (stage === 'star' || stage === 'veteran') {
    p['stage'] = 'pro';
  }

  // Ensure new fields have safe defaults when loading old sessions
  if (!('feelCap' in p)) p['feelCap'] = 3;
  if (!('peripheralTier' in p)) p['peripheralTier'] = 0;
  if (!('qualificationSlots' in p)) p['qualificationSlots'] = {};
  if (!('teamQualificationSlots' in p)) p['teamQualificationSlots'] = {};
  if (!('ownedItems' in p)) p['ownedItems'] = [];
  if (!('loans' in p)) p['loans'] = [];
  if (!('pawnedItemIds' in p)) p['pawnedItemIds'] = [];
  if (!('consecutiveBrokeRounds' in p)) p['consecutiveBrokeRounds'] = 0;
  if (!('bailoutCooldown' in p)) p['bailoutCooldown'] = 0;
  if (!('teamBailoutCooldown' in p)) p['teamBailoutCooldown'] = 0;
  if (!('forceNextEvent' in p)) p['forceNextEvent'] = null;
  if (!('forceMatchResult' in p)) p['forceMatchResult'] = null;
  if (!('salaryTracker' in p)) p['salaryTracker'] = null;

  // Ensure apiToken exists (sessions created before apiToken was added)
  if (!session.apiToken) {
    (session as Record<string, unknown>)['apiToken'] = `legacy-${session.id}`;
  }

  return session;
}

export class SessionRepo {
  constructor(private db: D1Database) {}

  async save(session: GameSession): Promise<void> {
    const data = JSON.stringify(session);
    await this.db
      .prepare(
        `INSERT INTO sessions (id, name, stage, round, status, ending, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           stage = excluded.stage,
           round = excluded.round,
           status = excluded.status,
           ending = excluded.ending,
           data = excluded.data,
           updated_at = excluded.updated_at`,
      )
      .bind(
        session.id,
        session.player.name,
        session.player.stage,
        session.player.round,
        session.status,
        session.ending ?? null,
        data,
        session.createdAt,
        session.updatedAt,
      )
      .run();
  }

  async load(id: string): Promise<GameSession | null> {
    const row = await this.db
      .prepare(`SELECT data FROM sessions WHERE id = ?`)
      .bind(id)
      .first<{ data: string }>();
    if (!row) return null;
    try {
      const session = JSON.parse(row.data) as GameSession;
      return migrateSession(session);
    } catch {
      return null;
    }
  }

  async appendRound(
    sessionId: string,
    round: number,
    eventId: string,
    eventType: string,
    choiceId: string,
    success: boolean,
    data: unknown,
    createdAt: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO round_results
         (session_id, round, event_id, event_type, choice_id, success, data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        sessionId,
        round,
        eventId,
        eventType,
        choiceId,
        success ? 1 : 0,
        JSON.stringify(data),
        createdAt,
      )
      .run();
  }
}
