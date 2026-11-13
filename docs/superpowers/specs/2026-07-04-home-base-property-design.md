# Home Base and Property System Design

## Status

Approved design for implementation planning.

## Context

The current housing system already affects money, recovery, life events, travel weeks, and owned-home asset actions. It supports housing tiers, city cost multipliers, home facilities, rental income, mortgage principal, renovation, sale, and housing event tags.

The weakness is player-facing weight. Most effects are small weekly cash or fatigue/stress numbers, so housing feels like a background settlement item. Owned property does not yet strongly change career planning, training quality, review habits, recovery strategy, or the decision to keep the home as a professional base instead of monetizing it.

## Design Goal

Turn owned housing into a career-first home base system with a light asset-management layer.

The property should primarily help the player build a more stable CS career:

- Better training quality.
- Better review and tactical preparation.
- Better recovery and pressure control.
- Clearer long-term identity as a player with a professional base.

Asset management should create tradeoffs, not become the main game:

- Renting out improves cash flow but weakens base benefits.
- Mortgaging creates short-term liquidity but adds repayment and pressure risk.
- Deferred maintenance saves money now but reduces base reliability.
- Renovation raises long-term ceiling and sale value.

## Non-Goals

- Do not build a heavy real-estate market simulation.
- Do not add tax, interest-rate, market-cycle, or multi-property management.
- Do not make property directly modify match win probability.
- Do not require a new action-point economy for property management.
- Do not make weekly property micromanagement mandatory.

## Core Loop

Owned housing becomes a base with a visible operating state:

```text
Property investment
-> stronger base capability
-> better training, review, and recovery actions
-> more stable career growth

Asset monetization
-> more cash now
-> repayment, rental, and maintenance risk
-> weaker base capability
```

The central player question is:

```text
Should I keep this property as my professional base, or use it as a financial asset to solve cash-flow problems?
```

## Player-Facing Model

### Base Modes

Owned property can be in several effective states:

- `self-use`: Full base benefits.
- `rented`: Rental income is active. Base facility benefits are reduced or suspended.
- `mortgaged`: Mortgage principal is active. Weekly repayment applies, and pressure/risk events become more likely.
- `under-maintained`: Maintenance debt is high or base condition is low. Base bonuses degrade before harsh penalties appear.
- `renovated`: Renovation level raises the long-term ceiling for facility levels, base condition, and asset value.

### Base Focus

The player may set one base focus per week:

- `balanced`: Small benefit across training, review, and recovery.
- `training`: Favors mechanical and training actions.
- `review`: Favors tactical, intelligence, review, and preparation actions.
- `recovery`: Favors rest, stress control, and fatigue reduction.

Changing focus should be available only in the action phase and at most once per week.

## State Model

Extend `HomeAssetState` with:

```ts
type HomeBaseFocus = 'balanced' | 'training' | 'review' | 'recovery';

interface HomeAssetState {
  facilities: HomeFacilityState;
  renovationLevel: number;
  rentalActive?: boolean;
  mortgagePrincipal?: number;
  baseCondition?: number; // 0..100, default 80 or 100 for existing owned homes
  baseFocus?: HomeBaseFocus; // default 'balanced'
  maintenanceDebt?: number; // accumulated deferred maintenance risk
  focusSetAtRound?: number;
}
```

Compatibility rule:

- Existing owned homes without these fields initialize lazily.
- Non-owned housing never receives asset state.
- Missing `baseCondition` should not break settlement or UI; default to a healthy state.

## Facilities

Facilities expand from one level to three levels.

### Training Room

Purpose:

- Improve training action quality.
- Reduce fatigue side effects from intense training.
- Represent a stable mechanical practice environment.

Effect direction:

- Small growth multiplier for aim/reflex/technical training.
- Minor fatigue mitigation when training actions create fatigue.
- Stronger effect when `baseFocus = 'training'`.

### Review Room

Purpose:

- Improve demo review, tactics, intelligence growth, and preparation.
- Make the property matter for thoughtful career progression, not only recovery.

Effect direction:

- Small growth multiplier for intelligence/tactical actions.
- Better preparation output from review-like actions.
- Stronger effect when `baseFocus = 'review'`.

### Rest Room

Purpose:

- Improve recovery quality and reduce long-term burnout risk.
- Make stable living meaningful during dense schedules.

Effect direction:

- Better fatigue and stress reduction from rest/recovery actions.
- Slightly reduces weekly pressure from dense schedules.
- Stronger effect when `baseFocus = 'recovery'`.

### Renovation Gate

Renovation level should unlock higher facility ceilings:

- Renovation 0: facility max level 1.
- Renovation 1: facility max level 2.
- Renovation 2+: facility max level 3.

Renovation also increases asset value and may improve the maximum recoverable base condition.

## Base Effect Rules

Base effects apply to action results, not directly to match simulation.

Recommended calculation:

```text
effectiveBaseQuality =
  facilityLevel
  * conditionScale(baseCondition)
  * focusScale(baseFocus)
  * assetAvailabilityScale(rentalActive, mortgagePrincipal, maintenanceDebt)
```

Guidelines:

- Condition below 70 starts reducing bonuses.
- Condition below 40 should noticeably weaken base effects and increase event risk.
- Rental should heavily reduce or suspend most facility benefits.
- Mortgage should not remove benefits, but should increase pressure and event risk.
- Maintenance debt should first reduce bonuses, then trigger events if ignored.

Base bonuses should remain modest. A good home base should improve consistency, not replace skill growth, team systems, or tournament performance.

## Weekly Settlement

Existing living economy settlement remains the main tick point.

Owned-home settlement should include:

- Facility upkeep.
- Renovation upkeep or condition wear.
- Rental income, if rented.
- Mortgage repayment, if mortgaged.
- Base condition wear.
- Maintenance debt changes.
- Recovery benefits only if the property is available as a base.

Suggested behavior:

- Healthy self-use base: small condition wear and full base effects.
- Rented property: rental income, reduced base effects, possible rental-management risk.
- Mortgaged property: repayment, pressure-risk tags or event weight, no automatic loss of base effects.
- Skipped maintenance: increases `maintenanceDebt`, lowers `baseCondition`.
- Paid maintenance: restores `baseCondition`, reduces `maintenanceDebt`.

## Asset Actions

Keep existing asset actions, but make consequences explicit.

### Rent Out

- Starts weekly rental income.
- Suspends or sharply reduces facility action bonuses.
- Adds rental-related event tags.
- May slowly increase maintenance debt.

### Stop Rental

- Stops weekly rental income.
- Restores self-use base availability.
- May require cleanup or maintenance if debt is high.

### Mortgage

- Grants immediate money.
- Adds weekly repayment.
- Increases pressure/risk event weight.
- Does not directly disable base use.

### Renovate

- Costs money.
- Raises facility level cap.
- Raises sale value.
- Improves long-term base ceiling.

### Sell

- Grants sale value.
- Removes owned-home assets.
- Moves player back to rental housing.
- Ends home-base bonuses.

### Maintain

Add a new action:

- Costs money.
- Restores `baseCondition`.
- Reduces `maintenanceDebt`.
- Available only for owned homes.

## UI Design

Create a dedicated `HomeBasePanel`.

The shop panel may continue to show housing purchase/move options, but owned-home management should move out of the shop list because it is no longer just shopping.

### Section 1: Base Overview

Show:

- Current housing tier and city.
- Base condition.
- Base focus.
- Estimated weekly cash flow.
- Rental/mortgage/maintenance status.
- Current risks.

Actions:

- Set weekly base focus.
- Maintain base.

### Section 2: Facility Upgrades

Show each facility:

- Level 0..3.
- Next upgrade cost.
- Current effect summary.
- Renovation requirement.
- Disabled reason when unavailable.

Actions:

- Upgrade facility.
- Renovate property.

### Section 3: Asset Operations

Show existing actions with concrete consequences:

- Rent out.
- Stop rental.
- Mortgage.
- Sell.

The UI should explain impact in game terms, such as "base bonuses reduced while rented" or "weekly repayment and pressure risk".

## Event System

Expand housing events with tags and weights for:

- Low base condition.
- High maintenance debt.
- Rental disputes.
- Mortgage pressure.
- Renovation disruption.
- Professional-base identity moments.

Events should mostly create manageable tradeoffs:

- Spend money to stabilize the base.
- Accept temporary stress/fatigue.
- Lose some base condition.
- Gain a small career benefit through good preparation or stable routines.

Avoid unavoidable hard failures. Property risk should pressure the player, not randomly destroy a run.

## Backend Architecture

Recommended file boundaries:

- `backend/src/types.ts`: add `HomeBaseFocus` and new `HomeAssetState` fields.
- `backend/src/data/housing.ts`: support multi-level facility definitions, renovation gates, maintenance constants.
- `backend/src/engine/housing.ts`: own base-state initialization, maintenance, renovation, asset actions, weekly settlement, base-effect derivation.
- `backend/src/engine/action.ts` or the action settlement path: apply derived base effects to training/review/recovery actions.
- `backend/src/data/events/housing.ts`: add base-condition and asset-risk events.
- `backend/src/routes/game.ts`: add endpoints for base focus and maintenance if needed.

The match simulator should not read home-base state directly.

## Frontend Architecture

Recommended file boundaries:

- `frontend/src/components/HomeBasePanel.tsx`: new management surface.
- `frontend/src/components/ShopPanel.tsx`: keep housing tier purchase/move controls or link users to home-base management.
- `frontend/src/lib/types.ts`: mirror new state and metadata types.
- `frontend/src/lib/api.ts`: add focus, maintenance, and updated facility/asset calls.

The panel should work during the action phase and show disabled reasons during event/settlement phases.

## Balance Rules

- Early players should not be able to trivially loan into an optimal home-base path.
- Owned home should feel like a mid-to-late career investment.
- Base bonuses should be meaningful but not mandatory for success.
- Rental and mortgage should solve cash-flow problems while clearly weakening stability.
- Maintenance debt must have recovery paths and bounded downside.
- Bad base condition should reduce bonuses before causing direct negative events.

## Testing Plan

Backend tests:

- Existing owned homes lazily initialize new base fields.
- Facility levels 0..3 obey renovation gates.
- Base focus can be changed once per week in action phase.
- Maintenance restores condition and reduces debt.
- Weekly settlement adjusts rental income, mortgage repayment, upkeep, condition, and debt.
- Rented property weakens base effects.
- Mortgaged property increases risk without disabling base effects.
- Base effects modify action results for training/review/recovery actions.
- Match simulation does not read home-base state directly.

Frontend tests or focused manual checks:

- `HomeBasePanel` displays condition, focus, facility levels, and asset state.
- Disabled states explain why an action is unavailable.
- Successful operations refresh player state.
- Existing shop purchase flow still works.
- Old sessions with owned homes render without missing-field crashes.

## Implementation Defaults

The implementation plan should start from these defaults and only adjust numbers if tests or playtest math show a clear balance problem.

- Facility action bonus levels: level 1 gives a small bonus, level 2 gives a moderate bonus, level 3 gives a strong but still non-mandatory bonus. Use numeric values low enough that base effects improve consistency rather than replacing core stat growth.
- Base condition wear: self-use owned homes lose a small amount of condition each week. Rental and high maintenance debt increase wear.
- Maintenance cost: scale with renovation level and current maintenance debt, with a minimum affordable mid-career cost.
- Focus endpoint: add a dedicated home-base focus endpoint instead of overloading asset actions.
- Maintenance endpoint: add a dedicated maintenance endpoint instead of treating maintenance as a shop purchase.
- Owned-home initialization: newly bought homes start at `baseCondition = 100`, `baseFocus = 'balanced'`, and `maintenanceDebt = 0`.
- Existing-save initialization: old owned homes without base fields default to `baseCondition = 80`, `baseFocus = 'balanced'`, and `maintenanceDebt = 0`, preserving compatibility while leaving room for maintenance to matter.
- Rental scaling: rental suspends direct facility action bonuses, but owned-home baseline weekly recovery can still apply at a reduced rate if the implementation already grants it through settlement.
