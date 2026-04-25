import type { GameSession } from '../types.js';

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
      return JSON.parse(row.data) as GameSession;
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
