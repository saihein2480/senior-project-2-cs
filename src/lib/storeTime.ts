/**
 * The store's clock, shared by the browser and the server.
 *
 * Promotion windows are calendar days the owner picks in the POS
 * (`<input type="date">`, stored as "YYYY-MM-DD"). They have to mean the same
 * instant everywhere: the checkout page (customer's browser), the order routes
 * (UTC on the server) and the Telegram bot all decide whether a promotion is on.
 * Evaluating them in whatever time zone the code happens to run in made those
 * three disagree for hours around every start and end date, so a customer could
 * be shown a price the server then refused, or the bot could advertise a deal
 * checkout would not apply.
 *
 * The store is in Tachileik, Shan State, Myanmar (see `deliveryArea.ts`: the
 * shop only delivers inside Tachileik), so the default zone is Myanmar Time,
 * `Asia/Yangon` (UTC+06:30, no daylight saving). Override it with
 * `NEXT_PUBLIC_STORE_TIME_ZONE` (an IANA zone name). It is read at build time
 * for the browser bundle, so change it before building.
 *
 * Rules:
 *  - A date-only value ("2026-10-02") is a store calendar day: a start date
 *    begins at 00:00:00.000 store time, an end date runs to 23:59:59.999 store
 *    time.
 *  - A timestamp with a zone ("...Z", "...+07:00") is an absolute instant.
 *  - A timestamp without a zone ("2026-10-02T18:00") is store wall-clock time.
 *  - Anything else is not a date (callers treat it as "no bound").
 *
 * Pure: only `Intl` and `Date`, no Firebase or React, and never reads the
 * process time zone, so the result does not depend on `TZ`.
 */

export const DEFAULT_STORE_TIME_ZONE = "Asia/Yangon";

/** Older ICU builds only know Myanmar Time by its previous name. */
const FALLBACK_TIME_ZONES = [DEFAULT_STORE_TIME_ZONE, "Asia/Rangoon"];

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock parts formatter for `timeZone` (cached: construction is slow). */
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** True when this runtime's `Intl` knows `timeZone`. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || !timeZone.trim()) return false;
  try {
    partsFormatter(timeZone.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * The configured zone if it is valid here, otherwise Myanmar Time. Falls back to
 * UTC only on a runtime with no time-zone data at all.
 */
export function resolveStoreTimeZone(configured?: string | null): string {
  const wanted = typeof configured === "string" ? configured.trim() : "";
  if (wanted) {
    if (isValidTimeZone(wanted)) return wanted;
    console.warn(
      `NEXT_PUBLIC_STORE_TIME_ZONE="${wanted}" is not a time zone this runtime knows; using ${DEFAULT_STORE_TIME_ZONE}.`,
    );
  }
  for (const zone of FALLBACK_TIME_ZONES) {
    if (isValidTimeZone(zone)) return zone;
  }
  return "UTC";
}

/**
 * The store's IANA time zone.
 *
 * `process.env.NEXT_PUBLIC_STORE_TIME_ZONE` must stay written out in full: Next
 * inlines public variables into the browser bundle by literal name only.
 */
export const STORE_TIME_ZONE: string = resolveStoreTimeZone(
  process.env.NEXT_PUBLIC_STORE_TIME_ZONE,
);

/** Short human name for the store's zone, for messages ("Myanmar time"). */
export function storeTimeZoneLabel(timeZone: string = STORE_TIME_ZONE): string {
  if (timeZone === "Asia/Yangon" || timeZone === "Asia/Rangoon") {
    return "Myanmar time";
  }
  return timeZone;
}

type WallTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function wallTimeAt(epochMs: number, timeZone: string): WallTime {
  const parts = partsFormatter(timeZone).formatToParts(new Date(epochMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const hour = value("hour");
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    // Some engines still print midnight as "24" despite hourCycle h23.
    hour: hour === 24 ? 0 : hour,
    minute: value("minute"),
    second: value("second"),
  };
}

/** Offset of `timeZone` from UTC at `epochMs`, in ms (Myanmar: +23,400,000). */
export function timeZoneOffsetMs(
  epochMs: number,
  timeZone: string = STORE_TIME_ZONE,
): number {
  const wholeSecond = Math.floor(epochMs / 1000) * 1000;
  const wall = wallTimeAt(wholeSecond, timeZone);
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  return wallAsUtc - wholeSecond;
}

/**
 * Epoch ms of a wall-clock time in `timeZone`. Out-of-range fields roll over the
 * way `Date.UTC` does (day 32 is the 1st of the next month).
 */
export function zonedWallTimeToEpoch(
  wall: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
    millisecond?: number;
  },
  timeZone: string = STORE_TIME_ZONE,
): number {
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour ?? 0,
    wall.minute ?? 0,
    wall.second ?? 0,
    wall.millisecond ?? 0,
  );
  // Two passes so a zone whose offset changes near this instant (DST) still
  // lands on the right side of the change.
  const firstOffset = timeZoneOffsetMs(asUtc, timeZone);
  let epoch = asUtc - firstOffset;
  const secondOffset = timeZoneOffsetMs(epoch, timeZone);
  if (secondOffset !== firstOffset) epoch = asUtc - secondOffset;
  return epoch;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?$/;
const ZONED_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/** A "YYYY-MM-DD" store day as [first ms, last ms], or null if not one. */
export function storeDayRange(
  value: string,
  timeZone: string = STORE_TIME_ZONE,
): { start: number; end: number } | null {
  const match = DATE_ONLY.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isRealCalendarDate(year, month, day)) return null;

  const start = zonedWallTimeToEpoch({ year, month, day }, timeZone);
  const nextDayStart = zonedWallTimeToEpoch({ year, month, day: day + 1 }, timeZone);
  return { start, end: nextDayStart - 1 };
}

/** A Firestore Timestamp (either SDK), a Date, or epoch ms, as epoch ms. */
function instantFromObject(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object") {
    const candidate = value as {
      toDate?: () => Date;
      seconds?: unknown;
      nanoseconds?: unknown;
    };
    if (typeof candidate.toDate === "function") {
      try {
        return instantFromObject(candidate.toDate());
      } catch {
        return null;
      }
    }
    if (typeof candidate.seconds === "number") {
      const nanos = typeof candidate.nanoseconds === "number" ? candidate.nanoseconds : 0;
      return candidate.seconds * 1000 + Math.floor(nanos / 1e6);
    }
  }
  return null;
}

const MAX_BOUNDARY_MEMO = 500;
const boundaryMemo = new Map<string, number | null>();

/**
 * The instant a promotion bound stands for, or null when `value` is empty or
 * not a date (the bound is then ignored, as it always has been).
 *
 * `edge` only matters for date-only values: "start" is the first millisecond of
 * that store day, "end" the last.
 */
export function parseStoreBoundary(
  value: unknown,
  edge: "start" | "end",
  timeZone: string = STORE_TIME_ZONE,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return instantFromObject(value);

  // Product grids ask this for every promotion on every card, and the answer
  // for a given string never changes, so keep a small memo.
  const key = `${timeZone}|${edge}|${value}`;
  const memo = boundaryMemo.get(key);
  if (memo !== undefined) return memo;

  const parsed = parseStringBoundary(value, edge, timeZone);
  if (boundaryMemo.size >= MAX_BOUNDARY_MEMO) boundaryMemo.clear();
  boundaryMemo.set(key, parsed);
  return parsed;
}

function parseStringBoundary(
  value: string,
  edge: "start" | "end",
  timeZone: string,
): number | null {
  const text = value.trim();
  if (!text) return null;

  const day = storeDayRange(text, timeZone);
  if (day) return edge === "start" ? day.start : day.end;

  const local = LOCAL_DATE_TIME.exec(text);
  if (local) {
    const [year, month, dayOfMonth] = [1, 2, 3].map((i) => Number(local[i]));
    if (!isRealCalendarDate(year, month, dayOfMonth)) return null;
    return zonedWallTimeToEpoch(
      {
        year,
        month,
        day: dayOfMonth,
        hour: Number(local[4]),
        minute: Number(local[5]),
        second: Number(local[6] || 0),
        millisecond: Number((local[7] || "0").padEnd(3, "0")),
      },
      timeZone,
    );
  }

  if (ZONED_DATE_TIME.test(text)) {
    const ms = Date.parse(text);
    return Number.isNaN(ms) ? null : ms;
  }

  // Free-form strings ("Oct 2, 2026") are parsed by `Date` in the *process*
  // time zone, which is exactly the inconsistency this module removes.
  return null;
}

/**
 * Is `now` inside [start, end] (both inclusive, both optional)? Unparseable
 * bounds are ignored.
 */
export function isWithinStoreWindow(
  startValue: unknown,
  endValue: unknown,
  now: number = Date.now(),
  timeZone: string = STORE_TIME_ZONE,
): boolean {
  const start = parseStoreBoundary(startValue, "start", timeZone);
  if (start !== null && now < start) return false;

  const end = parseStoreBoundary(endValue, "end", timeZone);
  if (end !== null && now > end) return false;

  return true;
}

/** The store calendar day `epochMs` falls on, as "YYYY-MM-DD". */
export function storeCalendarDate(
  epochMs: number = Date.now(),
  timeZone: string = STORE_TIME_ZONE,
): string {
  const wall = wallTimeAt(epochMs, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(wall.year).padStart(4, "0")}-${pad(wall.month)}-${pad(wall.day)}`;
}

/**
 * A promotion date for people: "2 Oct 2026".
 *
 * A date-only value is shown as that calendar day (never shifted by a zone); an
 * instant is shown as the store day it falls on, adding the store time when
 * `withTime` is set. Returns "" for an empty or unparseable value.
 */
export function formatStoreDate(
  value: unknown,
  options: { locale?: string; withTime?: boolean; timeZone?: string } = {},
): string {
  const timeZone = options.timeZone || STORE_TIME_ZONE;
  const locale = options.locale || "en-GB";
  const dateStyle: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  };

  if (typeof value === "string" && DATE_ONLY.test(value.trim())) {
    const day = storeDayRange(value, timeZone);
    if (!day) return "";
    const [year, month, date] = value.trim().split("-").map(Number);
    return new Intl.DateTimeFormat(locale, { ...dateStyle, timeZone: "UTC" }).format(
      new Date(Date.UTC(year, month - 1, date)),
    );
  }

  const instant = parseStoreBoundary(value, "start", timeZone);
  if (instant === null) return "";
  return new Intl.DateTimeFormat(locale, {
    ...dateStyle,
    ...(options.withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
    timeZone,
  }).format(new Date(instant));
}
