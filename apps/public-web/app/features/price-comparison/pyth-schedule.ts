/**
 * Pyth's published market schedule for one feed, and whether that schedule
 * is open at a given instant. Pure and dependency-free.
 *
 * The schedule string is Pyth's own, copied from the feed's metadata
 * (`attributes.schedule` in the key-free Hermes `GET /v2/price_feeds` list):
 *
 *   <IANA zone>;<Mon>,<Tue>,<Wed>,<Thu>,<Fri>,<Sat>,<Sun>;<MMDD>/<day>,...
 *
 * where a day is `O` (open all day), `C` (closed all day) or one or more
 * `HHMM-HHMM` ranges joined by `&` (an end of `2400` is midnight). The
 * optional third part lists dated exceptions, such as exchange holidays.
 *
 * This states what Pyth's schedule says. Whether a price account was
 * actually updated is a separate fact: the publish time shown beside it.
 */

export type ScheduleRange = { readonly startMinute: number; readonly endMinute: number };
/** One day of a schedule: open ranges in minutes after local midnight (`[]` closed all day). */
export type ScheduleDay = readonly ScheduleRange[];

export type PythSchedule = {
  readonly timeZone: string;
  /** Monday first, as Pyth writes it. */
  readonly weekly: readonly [ScheduleDay, ScheduleDay, ScheduleDay, ScheduleDay, ScheduleDay, ScheduleDay, ScheduleDay];
  /** Dated exceptions by `MMDD`. */
  readonly exceptions: ReadonlyMap<string, ScheduleDay>;
};

export type ScheduleSession =
  | { readonly kind: "always_open" }
  | { readonly kind: "open"; readonly closesAtMs: number | null }
  | { readonly kind: "closed"; readonly opensAtMs: number | null };

const MINUTES_PER_DAY = 24 * 60;
const ALL_DAY: ScheduleDay = [{ startMinute: 0, endMinute: MINUTES_PER_DAY }];
const RANGE = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/;
const EXCEPTION = /^(\d{4})\/(.+)$/;
/** How far ahead a next opening or closing is looked for. */
const LOOKAHEAD_DAYS = 14;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function minuteOf(hours: string, minutes: string): number | null {
  const h = Number(hours);
  const m = Number(minutes);
  if (m > 59 || h > 24 || (h === 24 && m !== 0)) return null;
  return h * 60 + m;
}

function parseDay(text: string): ScheduleDay | null {
  if (text === "O") return ALL_DAY;
  if (text === "C") return [];
  const ranges: ScheduleRange[] = [];
  for (const part of text.split("&")) {
    const match = RANGE.exec(part);
    if (!match) return null;
    const startMinute = minuteOf(match[1]!, match[2]!);
    const endMinute = minuteOf(match[3]!, match[4]!);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) return null;
    ranges.push({ startMinute, endMinute });
  }
  return ranges;
}

function validTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Parse a Pyth schedule string. `null` for anything that is not exactly the documented form. */
export function parsePythSchedule(text: string): PythSchedule | null {
  const parts = text.split(";");
  if (parts.length < 2 || parts.length > 3) return null;
  const [timeZone, weeklyText, exceptionText = ""] = parts as [string, string, string?];
  if (!timeZone || !validTimeZone(timeZone)) return null;
  const days = weeklyText.split(",");
  if (days.length !== 7) return null;
  const weekly = days.map(parseDay);
  if (weekly.some((day) => day === null)) return null;
  const exceptions = new Map<string, ScheduleDay>();
  for (const item of exceptionText === "" ? [] : exceptionText.split(",")) {
    const match = EXCEPTION.exec(item);
    const day = match ? parseDay(match[2]!) : null;
    if (!match || !day) return null;
    exceptions.set(match[1]!, day);
  }
  return { timeZone, weekly: weekly as unknown as PythSchedule["weekly"], exceptions };
}

type LocalParts = { year: number; month: number; day: number; weekday: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function localParts(epochMs: number, timeZone: string): LocalParts {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(epochMs).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS.indexOf(parts.weekday as (typeof WEEKDAYS)[number]),
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function mmdd(parts: { month: number; day: number }): string {
  return `${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}`;
}

/** The instant of `minute` after local midnight on the local date `year-month-day` in `timeZone`. */
function instantOf(year: number, month: number, day: number, minute: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day, 0, minute);
  let result = guess;
  // Two passes settle the zone offset, also across a daylight-saving change.
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = localParts(result, timeZone);
    const shownAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 0, parts.minute);
    result += guess - shownAsUtc;
  }
  return result;
}

function dayFor(schedule: PythSchedule, parts: { month: number; day: number; weekday: number }): ScheduleDay {
  return schedule.exceptions.get(mmdd(parts)) ?? schedule.weekly[parts.weekday]!;
}

function alwaysOpen(schedule: PythSchedule): boolean {
  return schedule.weekly.every((day) => day.length === 1 && day[0]!.startMinute === 0 && day[0]!.endMinute === MINUTES_PER_DAY)
    && [...schedule.exceptions.values()].every((day) => day === ALL_DAY || (day.length === 1 && day[0]!.startMinute === 0 && day[0]!.endMinute === MINUTES_PER_DAY));
}

/** Local calendar dates from the one containing `epochMs` onward, with their instants of local midnight. */
function* localDays(epochMs: number, timeZone: string): Generator<{ year: number; month: number; day: number; weekday: number }> {
  const start = localParts(epochMs, timeZone);
  for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset += 1) {
    const date = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    yield { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: (date.getUTCDay() + 6) % 7 };
  }
}

/** The schedule's session at `epochMs`: always open, open (with its close), or closed (with its next opening). */
export function scheduleSessionAt(schedule: PythSchedule, epochMs: number): ScheduleSession {
  if (alwaysOpen(schedule)) return { kind: "always_open" };
  const now = localParts(epochMs, schedule.timeZone);
  const today = dayFor(schedule, now);
  const current = today.find((range) => now.minute >= range.startMinute && now.minute < range.endMinute);
  if (current) {
    // The close is the end of this range, unless the next day opens at midnight right after it.
    let closesAtMs: number | null = null;
    for (const date of localDays(epochMs, schedule.timeZone)) {
      const ranges = dayFor(schedule, date);
      const isToday = date.day === now.day && date.month === now.month && date.year === now.year;
      const range = isToday ? current : ranges[0];
      if (!isToday && (!range || range.startMinute !== 0)) break;
      if (!range) break;
      closesAtMs = instantOf(date.year, date.month, date.day, range.endMinute, schedule.timeZone);
      if (range.endMinute !== MINUTES_PER_DAY) break;
    }
    return { kind: "open", closesAtMs };
  }
  for (const date of localDays(epochMs, schedule.timeZone)) {
    const isToday = date.day === now.day && date.month === now.month && date.year === now.year;
    const next = dayFor(schedule, date).find((range) => !isToday || range.startMinute > now.minute);
    if (next) return { kind: "closed", opensAtMs: instantOf(date.year, date.month, date.day, next.startMinute, schedule.timeZone) };
  }
  return { kind: "closed", opensAtMs: null };
}
