# Rival Club Materialization Design

## Background

The current world-club simulation keeps rival-mapped clubs in `CLUBS` as static placeholders:

- `club-rival-semi`
- `club-rival-pro`
- `club-rival-top`

Those entries use placeholder display values such as `（对手映射）` and `???`. They are intended to map to `session.player.rivals[rivalIndex]`, but many event-level systems still read club display data through `getClub(clubId)`. As a result, tournament-level surfaces can leak placeholder names instead of showing the actual generated rival team.

This design implements option 3: materialize rival-mapped clubs into session-level world club state, so event-level simulation reads a concrete per-session club identity instead of a placeholder.

## Goals

- Rival-mapped clubs have real `name`, `tag`, and `region` inside the session world-club state.
- Tournament-level systems can treat rival clubs like normal clubs after initialization.
- Existing stable club ids remain unchanged for save compatibility and result tracking.
- Static `CLUBS` remains the template source for tier, salary, requirements, and rival mapping metadata.
- Placeholder display values must not appear in leaderboard, social feed, club summaries, or debug world-club views once `worldClubs` is initialized.

## Non-Goals

- Do not create a full dynamic club registry replacing `CLUBS`.
- Do not change the generated rival system itself.
- Do not add full rival transfer history, economy, or complete roster management.
- Do not change tournament eligibility rules beyond display identity resolution.
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
  // existing fields...
}
```

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

## Runtime Creation

Update `createClubRuntimeState(session, clubId)` so rival templates are materialized at creation time.

The runtime still uses static template values for:

- `clubId`
- `tier`
- roster generation tier and profile lookup
- eligible tournament tiers
- salary and application requirements outside runtime state

Only display identity is copied from the generated rival.

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

Compatibility rules:

- `ensureWorldClubPool` must not discard valid existing pools solely because display fields are missing.
- `previewClubRuntime` and `activateClubRuntime` should backfill display fields when they touch a rival runtime.
- `resolveClubDisplayInfo` must handle missing display fields by consulting `session.player.rivals`.

The `WORLD_CLUBS_VERSION` can remain unchanged if backfill is lazy and non-destructive. Bump it only if implementation chooses to rebuild pools globally, which is not recommended because it can erase accumulated runtime state.

## UI Behavior

After materialization:

- Leaderboard rows show real rival team names and tags.
- Social feed posts use real rival team names.
- Debug views show the stable `clubId` separately from display identity.
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

Leaderboard tests:

- `buildLeaderboard` uses materialized rival display values instead of `???`.
- Stable `clubId` remains `club-rival-semi` or equivalent.

Route or helper tests:

- World-club social display helper resolves rival names from runtime or player rivals.
- Static non-rival clubs still resolve from `CLUBS`.

Regression assertion:

- No leaderboard entry produced from initialized `worldClubs` has `name === '（对手映射）'`, `tag === '???'`, or `region === '???'`.

## Implementation Order

1. Add tests covering rival runtime materialization and leaderboard display.
2. Extend `ClubRuntimeState` types in backend, frontend, and shared types.
3. Add materialization/backfill helpers in `worldClubs.ts`.
4. Add `resolveClubDisplayInfo`.
5. Update leaderboard and route display call sites.
6. Update debug UI if it reads static club names for world-club rows.
7. Run backend tests, then targeted frontend type checks if available.

## Risks

- Some call sites may still use `getClub` for display. Mitigation: search all `getClub(` usage and classify each as display or metadata.
- Type definitions are duplicated across backend, frontend, and shared files. Mitigation: update all three in one pass.
- Existing sessions with old runtime state could keep placeholders if only creation is updated. Mitigation: resolver and lazy backfill both handle old sessions.

