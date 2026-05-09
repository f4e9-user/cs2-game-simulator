## 2026-05-09 - Task 2 salary cadence

- `salaryTracker` is initialized in `initPlayer` and now on team acceptance with `lastPayRound = joinedRound = player.round`, `payCycle = 4`.
- Monthly salary uses the existing `team.weeklySalary` numeric value as the monthly amount and pays only when `player.round - lastPayRound >= payCycle`.
- Departure settlement is pro-rated against the monthly amount: `Math.floor(weeklySalary * weeksServed / payCycle)`.
- Departure settlement should only run on actual departures (fired outcome, explicit leave-team, conflict bad-blood), not every contract-renewal event.

## 2026-05-09 - Task 6 family bailout

- Bailout events use dynamic `needs-bailout` only; do not write that tag into `player.tags`, or the requireTags filter will bypass cooldown.
- `bailoutCooldown` is state-based and set in `applyChoice` after any `bailout-*` event, then decremented on later rounds.
- `consecutiveBrokeRounds` is counted from end-of-round `stats.money <= 0`, so bailout triggers after two completed broke rounds.

## 2026-05-09 - Task 10 grind actions

- `applyAction()` reuses `resolveChoice()`, so action money rewards can stay in `Outcome.statChanges.money`; resolver applies `MONEY_MAX` capping through `nextStats.money`.
- For per-use random action rewards without engine changes, an `Outcome` getter for `statChanges` can return a fresh `{ money: randomMoney(min, max) }` when `resolveChoice()` reads the chosen outcome.
- Action stress deltas are scaled by `STRESS_SCALE` in `applyAction()`, so requested +10/+20 stress maps to `stressDelta: 2/4`; non-multiples such as +8/+16 can use fractional deltas `1.6/3.2`.

## 2026-05-09 - Task 7 loan system

- Loans are stored on `player.loans` and mutate in-place during `processLoanRepayment(nextPlayer)` after round advancement but before salary payout, so due-round repayment happens before monthly salary income.
- Loan default should add permanent `loan-default` plus `transfer-ban` with `tagExpiry['transfer-ban'] = player.round + 12`; no separate credit score state is needed.
