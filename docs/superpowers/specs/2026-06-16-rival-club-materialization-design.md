# Rival Club Materialization Design

## Background

The current world-club simulation keeps rival-mapped clubs in `CLUBS` as static placeholders:

- `club-rival-semi`
- `club-rival-pro`
- `club-rival-top`

Those entries use placeholder display values such as `（对手映射）` and `???`. They are intended to map to `session.player.rivals[rivalIndex]`, but many event-level systems still read club display data through `getClub(clubId)`. As a result, tournament-level surfaces can leak placeholder names instead of showing the actual generated rival team.

The same lazy-runtime problem also affects non-rival world clubs. If a player spends a long time in a semi-pro team, builds that team's VRS score through A/B tournaments, then promotes into a newly activated pro club such as `club-dragon-corp`, the new club can appear with a near-zero VRS score. That makes S-tier signup fail even though the assigned pro club should already exist in the world ecosystem. This design therefore treats materialization as both display identity and baseline competitive identity.

This design implements option 3: materialize world clubs into session-level world club state, so event-level simulation reads a concrete per-session club identity and a plausible world ranking profile instead of a placeholder or empty runtime.

## Goals

- Rival-mapped clubs have real `name`, `tag`, and `region` inside the session world-club state.
- Tournament-level systems can treat rival clubs like normal clubs after initialization.
- Existing stable club ids remain unchanged for save compatibility and result tracking.
- Static `CLUBS` remains the template source for tier, salary, requirements, and rival mapping metadata.
- Placeholder display values must not appear in leaderboard, social feed, club summaries, or debug world-club views once `worldClubs` is initialized.
- Newly activated pro/top clubs must not start with zero competitive presence. They need a tier-appropriate VRS baseline so promotion into a real club does not lock the player out of the club's expected tournament ecosystem.
- Player transfers and promotions should switch to the new team's VRS instead of carrying the old team's VRS, but the new team's VRS must come from its materialized world profile, not from an empty runtime.
- Non-player clubs must participate in the tournament ecosystem through scheduled abstract results, not only slow passive ticks.
- Player tournament matches must resolve against a concrete opponent club selected before the match, with the opponent affecting preview, match power, result text, and world-club result writeback.

## Non-Goals

- Do not create a full dynamic club registry replacing `CLUBS`.
- Do not change the generated rival system itself.
- Do not add full rival transfer history, economy, or complete roster management.
- Do not change tournament eligibility rules beyond making VRS source data credible.
- Do not transfer old-team VRS points to the player's new team. VRS remains a team property.
- Do not build a full bracket simulator for every non-player match. The first implementation can use abstract tournament results and concrete player-facing opponents.
- Do not migrate existing storage with an offline script; use runtime fallback compatibility.

## Data Model

Add display identity fields to `ClubRuntimeState`:

```ts
interface ClubRuntimeState {
  clubId: string;
  tier: ClubTier;
  displayName?: string;
  displayTag?: string;
  displayRegion?: string;
  baselineVrsScore?: number;
  // existing fields...
}
```

Add a concrete opponent snapshot to pending tournament state. The exact type can live beside `PendingMatch`:

```ts
interface PendingMatchOpponent {
  clubId: string;
  name: string;
  tag: string;
  region: string;
  tier: ClubTier;
  vrsScore: number;
  power: number;
  form: number;
}

interface PendingMatch {
  // existing fields...
  opponent?: PendingMatchOpponent;
}
```

The snapshot prevents UI and match resolution from changing if the opponent runtime later ticks before the match resolves. The runtime is still updated after the result.

For normal clubs, these fields may be omitted because the static `CLUBS` entry is authoritative.

For rival-mapped clubs, these fields are required when runtime state is created:

- `displayName = session.player.rivals[rivalIndex].name`
- `displayTag = session.player.rivals[rivalIndex].tag`
- `displayRegion = session.player.rivals[rivalIndex].region`

If a legacy or malformed session lacks the rival at that index, runtime creation falls back to deterministic non-placeholder values derived from the club tier, for example:

- semi-pro: `Regional Rival`
- pro: `Pro Rival`
- top: `Elite Rival`

The fallback must not use `???`.

`baselineVrsScore` represents the club's pre-existing world standing when the runtime is first materialized. It is separate from `seasonPoints`, which tracks current-season tournament results produced by the simulation.

Suggested deterministic ranges:

- youth: 0-8
- semi-pro: 8-40
- pro: 45-120
- top: 120-220

The value should be seeded by `session.id`, `clubId`, and season so it is stable for a session but not identical across every save. Named static clubs may also receive small profile-specific offsets later, but that is optional for this implementation.

## Identity Resolution

Introduce a small resolver in the world-club layer:

```ts
interface ClubDisplayInfo {
  clubId: string;
  name: string;
  tag: string;
  region: string;
  tier: ClubTier;
}

function resolveClubDisplayInfo(session: GameSession, clubId: string): ClubDisplayInfo | null
```

Resolution order:

1. If `session.worldClubs.runtimeByClubId[clubId]` has `displayName/displayTag/displayRegion`, use those values.
2. Else if `getClub(clubId)` is a rival template and the matching `session.player.rivals[rivalIndex]` exists, use the generated rival values.
3. Else use the static `CLUBS` values.
4. If no club exists, return `null`.

This gives compatibility for sessions created before materialization and prevents display callers from each reimplementing rival mapping.

## Competitive Identity and VRS

VRS must describe a team's world position, not only results generated after the runtime was first touched.

Update `computeClubVrsScore` so it includes `baselineVrsScore`:

```ts
score =
  baselineVrsScore
  + seasonPoints * 1.3
  + form/chemistry/trust/stability modifiers
  + recent result modifiers
  + storyline modifiers
  + path bonuses
```

Rules:

- `baselineVrsScore` is set once when a runtime is created or lazily backfilled.
- `seasonPoints` remains the simulation's current-season output and can still reset on season rollover.
- Season rollover must not reset `baselineVrsScore`.
- Promotions/relegations can adjust baseline slightly, but should not collapse it to zero.
- A pro club assigned through promotion should naturally meet low S-open thresholds when its baseline and current state justify it.
- A weak pro club may still fail high S-class or Major thresholds, but should not fail because its runtime was just created.

This fixes the promotion scenario:

1. Player builds 172 VRS with a semi-pro team.
2. Player promotes and accepts a pro offer from Dragon Corp.
3. The old semi-pro team's VRS stays with the old team.
4. Dragon Corp runtime is activated or backfilled with a pro baseline, for example 65-100 plus modifiers.
5. S-tier eligibility uses Dragon Corp's real VRS instead of zero.

Passive world ticks should not be the main source of VRS growth. They can adjust form, chemistry, and storylines, but meaningful VRS movement should come from tournament participation:

- C/B tournaments produce small but frequent movement for youth and semi-pro clubs.
- A tournaments produce moderate movement for semi-pro and lower pro clubs.
- S-open/S-closed/S-class tournaments produce large movement for pro and top clubs.
- Major results produce the largest leaderboard shifts.

This prevents a season where top clubs sit at 2 VRS only because they were not directly touched by player actions.

## World Tournament Participation and Head-to-Head Matches

World clubs must be real tournament participants, not only leaderboard rows.

### Non-Player Tournament Results

When the calendar reaches a tournament signup or resolution window, the world simulation should produce abstract results for eligible non-player clubs. This can run during `tickWorldClubRuntimes` or a dedicated tournament tick invoked from the same round-advance path.

Candidate selection:

- Start from active and relevant world clubs, then include enough static clubs to make the tournament ecosystem feel populated.
- Materialize runtimes before considering a club for a result.
- Filter by tournament tier, club tier, `qualificationState.eligibleTiers`, and VRS thresholds when applicable.
- Weight selection by `calculateClubPower`, VRS score, current form, and storyline modifiers.
- Exclude the player's current club from non-player autonomous results for a tournament stage the player is actively playing.

Result shape:

```ts
interface WorldTournamentEntryResult {
  clubId: string;
  tournamentId: string;
  stageIndex?: number;
  result: 'win' | 'deep-run' | 'early-exit' | 'loss';
  vrsDelta: number;
  note: string;
}
```

The implementation does not need to simulate every match. It only needs to produce enough structured results for rankings, qualification progress, recent results, and social feed context.

VRS rewards should use tournament tier and result depth. Example direction:

- C: win +2 to +4, deep-run +1
- B: win +5 to +8, deep-run +2 to +4
- A: win +10 to +16, deep-run +5 to +9
- S-open/S-closed: win +16 to +28, deep-run +8 to +16
- S-class: win +25 to +40, deep-run +12 to +24
- Major: win +45 to +70, deep-run +20 to +40

The exact numbers should be tuned against current `pointsRequired`, but the expected outcome is that top teams naturally occupy high VRS positions through abstract S/Major results even when the player never faces them.

### Player-Facing Opponent Selection

When the player signs up for a tournament or advances to a new tournament stage, assign a concrete opponent club and store it on `pendingMatch.opponent`.

Selection rules:

- Build the opponent pool from materialized world clubs eligible for the tournament tier.
- Exclude the player's current club.
- Prefer clubs near the tournament's competitive level, but increase difficulty in later bracket stages.
- Use VRS and `calculateClubPower` to weight stronger clubs into later stages.
- For C/B open events where no club opponent is appropriate, materialize a temporary free-agent or mix-team style opponent with a stable snapshot, but still store it as an opponent object.

Match simulation should then use the opponent snapshot:

- Pre-match preview shows opponent name, tag, region, VRS, form, and rough strength.
- Match event text names the opponent.
- `simulateMatch` combines tournament base difficulty with opponent `power`, VRS, form, and stage modifiers.
- Result writeback updates both player club runtime and opponent runtime.
- Social feed and history can refer to the actual opponent instead of generic tournament text.

For multi-stage tournaments, the next stage should assign a new opponent after the player advances. The previous opponent remains in the match result/history.

### Result Writeback

`recordWorldTournamentResult` should no longer pick a random opponent after the match. It should consume the opponent stored on `pendingMatch.opponent`.

Rules:

- Player win: player club gets the appropriate stage result; opponent gets `loss` or `early-exit`.
- Player loss: player club gets `early-exit`; opponent gets `deep-run` or continues as an abstract contender depending on stage.
- Final win: player club gets `win`; opponent gets final loss.
- Free-agent player: player points remain personal, but opponent runtime still receives its result.

This makes the match a real team-vs-team outcome instead of a post-hoc story attachment.

## Runtime Creation

Update `createClubRuntimeState(session, clubId)` so every runtime receives a materialized competitive profile. Rival templates additionally receive materialized display identity.

The runtime still uses static template values for:

- `clubId`
- `tier`
- roster generation tier and profile lookup
- eligible tournament tiers
- salary and application requirements outside runtime state

For rival templates, display identity is copied from the generated rival.

For all clubs, competitive identity is initialized from tier and deterministic session seed:

- `baselineVrsScore`
- initial `seasonPoints` if needed for already-established clubs, usually low or zero because baseline carries historical standing
- initial `qualificationState.eligibleTiers`
- optional initial `activeStorylines` for high or low baseline outliers

`ensureWorldClubPool(session)` should still place rival template ids in `activeClubIds` when the player has generated rivals. It should not create a separate dynamic id. Keeping stable ids avoids rewriting result tracking, processed tick keys, leaderboard rows, and older saves.

## Call Site Changes

Replace direct display reads from `getClub(clubId)` in tournament-level world-club surfaces with `resolveClubDisplayInfo`.

Required call sites:

- `backend/src/data/leaderboard.ts`
  - leaderboard `name/tag/region`
  - fallback player team row if relevant
- `backend/src/routes/game.ts`
  - `displayClubName`
  - world-club social posts
  - world storyline context
  - club application summaries where rival templates can appear
- Debug session page if it renders world-club names from static clubs.

Keep static `getClub` use where the code needs non-display template metadata such as tier, requirements, `isRival`, or `rivalIndex`.

## Save Compatibility

Existing sessions may have:

- no `worldClubs`
- `worldClubs` with empty `runtimeByClubId`
- rival runtimes created before display fields existed
- non-rival pro/top runtimes created before `baselineVrsScore` existed
- pending matches created before opponent snapshots existed

Compatibility rules:

- `ensureWorldClubPool` must not discard valid existing pools solely because display fields are missing.
- `previewClubRuntime` and `activateClubRuntime` should backfill display fields when they touch a rival runtime.
- `previewClubRuntime`, `activateClubRuntime`, and VRS computation should backfill `baselineVrsScore` for any runtime that lacks it.
- `resolveClubDisplayInfo` must handle missing display fields by consulting `session.player.rivals`.
- Backfill must preserve accumulated fields such as `seasonPoints`, `recentResults`, `qualificationState`, and `activeStorylines`.
- If a pending match lacks an opponent snapshot, assign one lazily before rendering match preview or resolving the match. Do not rewrite already completed history.

The `WORLD_CLUBS_VERSION` can remain unchanged if backfill is lazy and non-destructive. Bump it only if implementation chooses to rebuild pools globally, which is not recommended because it can erase accumulated runtime state.

## UI Behavior

After materialization:

- Leaderboard rows show real rival team names and tags.
- Social feed posts use real rival team names.
- Debug views show the stable `clubId` separately from display identity.
- Match preview and match result surfaces show the concrete opponent club.
- No user-facing surface should show `（对手映射）` or `???` for an initialized world-club rival.

Debug UI may show both values:

```text
club-rival-pro · Phantom Lions [PHL] · Europe
```

This keeps the stable id visible without leaking placeholder identity as the display name.

## Testing

Add focused tests before implementation.

World club tests:

- Creating a runtime for `club-rival-semi` materializes `displayName/displayTag/displayRegion` from `session.player.rivals[0]`.
- Missing rival data falls back to non-placeholder display identity.
- Activating an old rival runtime without display fields backfills identity without changing accumulated fields like `seasonPoints` or `recentResults`.
- Creating a runtime for a pro club sets a non-zero tier-appropriate `baselineVrsScore`.
- Creating a runtime for a top club sets a higher baseline than a pro club under the same deterministic seed.
- Season rollover resets or decays `seasonPoints` but preserves `baselineVrsScore`.
- Backfilling an old runtime adds `baselineVrsScore` without erasing existing `seasonPoints`, `recentResults`, or storylines.
- Abstract non-player tournament results give eligible clubs meaningful VRS movement by tournament tier.
- Top clubs accumulate S/Major-level VRS movement through world tournament participation even when the player never faces them.

Leaderboard tests:

- `buildLeaderboard` uses materialized rival display values instead of `???`.
- Stable `clubId` remains `club-rival-semi` or equivalent.
- A newly activated pro club appears with VRS above zero.
- A player who switches from a high-scoring semi-pro team to a pro club uses the pro club's materialized VRS, not the old team's VRS and not zero.

Eligibility tests:

- After promotion into a pro club with a materialized baseline, low S-open tournament `pointsRequired` checks use the new club's VRS and can pass when other requirements are met.
- The old semi-pro team's accumulated VRS remains on the old club runtime and is not copied to the new club.

Opponent tests:

- Signing up for a tournament assigns `pendingMatch.opponent` with a concrete `clubId`, display identity, VRS, and power.
- Later bracket stages assign stronger opponents on average than early stages.
- Match simulation reads opponent power instead of only tournament base difficulty.
- `recordWorldTournamentResult` updates the stored opponent runtime and does not pick a different random opponent after the match.
- Legacy pending matches without an opponent receive one lazily before match resolution.

Route or helper tests:

- World-club social display helper resolves rival names from runtime or player rivals.
- Static non-rival clubs still resolve from `CLUBS`.

Regression assertion:

- No leaderboard entry produced from initialized `worldClubs` has `name === '（对手映射）'`, `tag === '???'`, or `region === '???'`.
- Player match history and result text for club tournaments include the concrete opponent identity.

## Implementation Order

1. Add tests covering pro-club baseline VRS, transfer VRS continuity, rival runtime materialization, opponent assignment, world tournament VRS movement, and leaderboard display.
2. Extend `ClubRuntimeState` types in backend, frontend, and shared types.
3. Extend pending match types with an opponent snapshot.
4. Add materialization/backfill helpers in `worldClubs.ts` for display identity and `baselineVrsScore`.
5. Update `computeClubVrsScore` to include baseline VRS while preserving season and recent-result modifiers.
6. Add `resolveClubDisplayInfo`.
7. Add world tournament participation helpers that produce abstract non-player tournament results.
8. Add opponent selection helpers for signup and bracket advancement.
9. Update match simulation and result writeback to use the stored opponent.
10. Update leaderboard, route display call sites, match preview, result UI, and debug UI.
11. Run backend tests, then targeted frontend type checks if available.

## Risks

- Some call sites may still use `getClub` for display. Mitigation: search all `getClub(` usage and classify each as display or metadata.
- Type definitions are duplicated across backend, frontend, and shared files. Mitigation: update all three in one pass.
- Existing sessions with old runtime state could keep placeholders if only creation is updated. Mitigation: resolver and lazy backfill both handle old sessions.
- Baseline VRS can inflate the whole leaderboard if ranges are too high. Mitigation: tune ranges against current `pointsRequired` values and assert S-open, S-class, and Major thresholds still separate weak pro, strong pro, and top teams.
- Adding baseline VRS without preserving old team ownership could accidentally copy points during transfer. Mitigation: explicit tests must assert old-team VRS remains with the old `clubId`.
- Abstract non-player tournament results can overrun the player story if too many updates are shown. Mitigation: persist structured results, but surface only high-signal summaries in social feed and debug views.
- Opponent assignment can make difficulty spike if VRS weighting is too aggressive. Mitigation: stage-based weighting should cap early-round opponent strength and reserve top-weighted teams for late bracket stages.
