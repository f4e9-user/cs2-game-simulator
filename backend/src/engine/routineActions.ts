import type { ActionResult, GameSession, Player, TeamActionResult } from '../types.js';
import { applyAction } from './action.js';
import {
  applyLockerRoomTalk,
  applyTeamMeeting,
  applyTeamTrainingFocus,
} from './team.js';

export interface ReplayRoutineActionsResult {
  player: Player;
  actionResults: ActionResult[];
  teamActionResults: TeamActionResult[];
  stopped?: {
    index: number;
    actionId: string;
    reason: string;
  };
}

function applyReplayAction(
  session: GameSession,
  actionId: string,
  aiEventCache?: unknown,
): { player: Player; actionResult?: ActionResult; teamActionResult?: TeamActionResult } {
  if (actionId === 'team-meeting') {
    const result = applyTeamMeeting(session);
    return { player: result.player, teamActionResult: result.result };
  }
  if (actionId === 'locker-room-talk') {
    const result = applyLockerRoomTalk(session);
    return { player: result.player, teamActionResult: result.result };
  }
  if (actionId.startsWith('team-training-focus:')) {
    const focus = actionId.slice('team-training-focus:'.length);
    const result = applyTeamTrainingFocus(session, focus);
    return { player: result.player, teamActionResult: result.result };
  }

  const result = applyAction(session, actionId, undefined, aiEventCache);
  return { player: result.player, actionResult: result.actionResult };
}

export function recordRoutineAction(player: Player, actionId: string): Player {
  return {
    ...player,
    currentWeekRoutineActions: [
      ...(player.currentWeekRoutineActions ?? []),
      actionId,
    ],
  };
}

export function rolloverRoutineActions(player: Player): Player {
  return {
    ...player,
    lastWeekRoutineActions: [...(player.currentWeekRoutineActions ?? [])],
    currentWeekRoutineActions: [],
  };
}

export function replayLastWeekRoutineActions(
  session: GameSession,
  aiEventCache?: unknown,
): ReplayRoutineActionsResult {
  const actionIds = session.player.lastWeekRoutineActions ?? [];
  if (actionIds.length === 0) {
    throw new Error('上周没有可重复的行动');
  }

  let workingSession: GameSession = {
    ...session,
    phase: 'action',
    currentEvent: null,
  };
  const actionResults: ActionResult[] = [];
  const teamActionResults: TeamActionResult[] = [];

  for (let index = 0; index < actionIds.length; index += 1) {
    const actionId = actionIds[index]!;
    try {
      const applied = applyReplayAction(workingSession, actionId, aiEventCache);
      if (applied.actionResult) actionResults.push(applied.actionResult);
      if (applied.teamActionResult) teamActionResults.push(applied.teamActionResult);
      workingSession = {
        ...workingSession,
        player: applied.player,
        phase: 'action',
        currentEvent: null,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (actionResults.length === 0 && teamActionResults.length === 0) {
        throw new Error(`重复上周行动失败：${reason}`);
      }
      return {
        player: workingSession.player,
        actionResults,
        teamActionResults,
        stopped: { index, actionId, reason },
      };
    }
  }

  return {
    player: workingSession.player,
    actionResults,
    teamActionResults,
  };
}
