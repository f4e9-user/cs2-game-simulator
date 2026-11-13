export function advanceWeek(year: number, week: number): { year: number; week: number } {
  const WEEKS = 48;
  if (week >= WEEKS) return { year: year + 1, week: 1 };
  return { year, week: week + 1 };
}

export function weekToMonth(week: number): number {
  return Math.min(12, Math.max(1, Math.ceil(week / 4)));
}
