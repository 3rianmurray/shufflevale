// Dates as the app says them: "Today, 2:15 PM", "Yesterday, 9:40 AM", "Nov 3, 2:15 PM", the year only when it
// isn't this one.

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** The day: "Today", "Yesterday", "Nov 3", or "Nov 3, 2025". */
export function dayText(at: number, now: number = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** The day and time: "Today, 2:15 PM", "Nov 3, 2:15 PM"… */
export function whenText(at: number, now: number = Date.now()): string {
  return `${dayText(at, now)}, ${new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}
