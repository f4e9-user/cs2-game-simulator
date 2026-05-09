## 2026-05-09 - Task 2 salary cadence

- `salaryTracker` is initialized in `initPlayer` and now on team acceptance with `lastPayRound = joinedRound = player.round`, `payCycle = 4`.
- Monthly salary uses the existing `team.weeklySalary` numeric value as the monthly amount and pays only when `player.round - lastPayRound >= payCycle`.
- Departure settlement is pro-rated against the monthly amount: `Math.floor(weeklySalary * weeksServed / payCycle)`.
- Departure settlement should only run on actual departures (fired outcome, explicit leave-team, conflict bad-blood), not every contract-renewal event.

## 2026-05-09 - Task 6 family bailout

- Bailout events use dynamic `needs-bailout` only; do not write that tag into `player.tags`, or the requireTags filter will bypass cooldown.
- `bailoutCooldown` is state-based and set in `applyChoice` after any `bailout-*` event, then decremented on later rounds.
- `consecutiveBrokeRounds` is counted from end-of-round `stats.money <= 0`, so bailout triggers after two completed broke rounds.
