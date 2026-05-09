## 2026-05-09 - Task 2 salary cadence

- `salaryTracker` is initialized in `initPlayer` and now on team acceptance with `lastPayRound = joinedRound = player.round`, `payCycle = 4`.
- Monthly salary uses the existing `team.weeklySalary` numeric value as the monthly amount and pays only when `player.round - lastPayRound >= payCycle`.
- Departure settlement is pro-rated against the monthly amount: `Math.floor(weeklySalary * weeksServed / payCycle)`.
- Departure settlement should only run on actual departures (fired outcome, explicit leave-team, conflict bad-blood), not every contract-renewal event.
