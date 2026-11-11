// Dates are stored as 'YYYY-MM-DD' (the phone's local date).

const pad = (n: number) => String(n).padStart(2, '0');

export const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromIsoDate = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayIso = () => toIsoDate(new Date());

export const addDaysIso = (iso: string, days: number) => {
  const d = fromIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
};

/** Whole days from a to b (b - a). */
export const daysBetween = (a: string, b: string) =>
  Math.round((fromIsoDate(b).getTime() - fromIsoDate(a).getTime()) / 86_400_000);

export const formatDate = (iso: string) =>
  fromIsoDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** For timestamps (e.g. returned_at): shows the date in the phone's time zone. */
export const formatTimestamp = (ts: string) => formatDate(toIsoDate(new Date(ts)));

/** e.g. "due in 3 days", "due today", "5 days overdue" */
export function dueLabel(dueIso: string): string {
  const d = daysBetween(todayIso(), dueIso);
  if (d > 1) return `due in ${d} days`;
  if (d === 1) return 'due tomorrow';
  if (d === 0) return 'due today';
  if (d === -1) return '1 day overdue';
  return `${-d} days overdue`;
}
