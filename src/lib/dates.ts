// ---------------------------------------------------------------------------
// Date tokens embedded in bullet text. Format: !(YYYY-MM-DD) with an optional
// time and optional repeat rule, e.g. !(2026-07-10 14:30 +1w).
// ---------------------------------------------------------------------------

export interface ParsedDate {
  date: Date;
  hasTime: boolean;
  /** Repeat rule such as "1d", "2w", "1m", "1y", or null for one-off. */
  repeat: string | null;
}

const TOKEN_RE = /!\(([^)]+?)\)/g;
const INNER_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?(?:\s*\+(\d+)([dwmy]))?$/;

/** Parse the inner content of a !( … ) token. */
export function parseDateToken(inner: string): ParsedDate | null {
  const m = INNER_RE.exec(inner.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm, rn, ru] = m;
  const year = Number(y);
  const month = Number(mo) - 1;
  const day = Number(d);
  const hasTime = hh !== undefined;
  const date = new Date(year, month, day, hasTime ? Number(hh) : 0, hasTime ? Number(mm) : 0, 0, 0);
  if (isNaN(date.getTime())) return null;
  const repeat = rn && ru ? `${rn}${ru}` : null;
  return { date, hasTime, repeat };
}

/** Serialize a date back into a token string like "!(2026-07-10 14:30 +1w)". */
export function toToken(date: Date, hasTime: boolean, repeat?: string | null): string {
  const p = (n: number) => String(n).padStart(2, '0');
  let s = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  if (hasTime) s += ` ${p(date.getHours())}:${p(date.getMinutes())}`;
  if (repeat) s += ` +${repeat}`;
  return `!(${s})`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole-day difference (b - a) ignoring time. */
function dayDiff(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / 86400000);
}

/** A short, human-friendly label: "Today", "Tomorrow", "Mon", "Jul 10". */
export function relativeLabel(date: Date, hasTime: boolean, now = currentTime()): string {
  const diff = dayDiff(now, date);
  let label: string;
  if (diff === 0) label = 'Today';
  else if (diff === 1) label = 'Tomorrow';
  else if (diff === -1) label = 'Yesterday';
  else if (diff > 1 && diff < 7) label = DAYS[date.getDay()];
  else if (diff < 0 && diff > -7) label = `${DAYS[date.getDay()]} (${-diff}d ago)`;
  else {
    label = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
    if (date.getFullYear() !== now.getFullYear()) label += ` ${date.getFullYear()}`;
  }
  if (hasTime) {
    const p = (n: number) => String(n).padStart(2, '0');
    label += ` ${p(date.getHours())}:${p(date.getMinutes())}`;
  }
  return label;
}

export function isOverdue(date: Date, hasTime: boolean, now = currentTime()): boolean {
  if (hasTime) return date.getTime() < now.getTime();
  // A date-only deadline is overdue only once the day is fully past.
  return dayDiff(now, date) < 0;
}

export function isToday(date: Date, now = currentTime()): boolean {
  return dayDiff(now, date) === 0;
}

/** Advance a date by its repeat rule, returning the next occurrence. */
export function nextOccurrence(date: Date, repeat: string): Date | null {
  const m = /^(\d+)([dwmy])$/.exec(repeat);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  const d = new Date(date);
  switch (unit) {
    case 'd':
      d.setDate(d.getDate() + n);
      break;
    case 'w':
      d.setDate(d.getDate() + n * 7);
      break;
    case 'm':
      d.setMonth(d.getMonth() + n);
      break;
    case 'y':
      d.setFullYear(d.getFullYear() + n);
      break;
    default:
      return null;
  }
  return d;
}

/**
 * `Date.now()`-free "now". Reads the wall clock lazily so the module stays
 * pure at import time (matters for deterministic tooling / SSR).
 */
export function currentTime(): Date {
  return new Date();
}

/** Extract every date token found in a string with its position. */
export function findDateTokens(text: string): { raw: string; inner: string; index: number }[] {
  const out: { raw: string; inner: string; index: number }[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text))) {
    out.push({ raw: m[0], inner: m[1], index: m.index });
  }
  return out;
}
