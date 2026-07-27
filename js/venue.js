/**
 * venue.js — real-world data about the venue: its local clock, tonight's event,
 * and the weather over Phoenix.
 *
 * Everything here is REAL, unlike the crowd sim in life.js. Two sources:
 *
 *   Events  — Stacy's own /api/events, mirrored into data/events.json by the
 *             refresh-events GitHub Action. The live endpoint sends no
 *             Access-Control-Allow-Origin header, so a browser on github.io
 *             cannot call it; the mirror is same-origin and works.
 *   Weather — Open-Meteo. No API key, and it does send `allow-origin: *`, so this
 *             one is fetched live from the page.
 */

/** 4343 N 7th Ave, Phoenix AZ. */
export const VENUE = {
  lat: 33.4942,
  lon: -112.0819,
  tz: "America/Phoenix", // no DST, ever
};

// ---------------------------------------------------------------- venue clock
/**
 * The venue's wall-clock parts, regardless of where the phone is. Using the
 * viewer's own timezone would light the neon at the wrong time if you ever check
 * in from another state.
 */
export function venueNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: VENUE.tz,
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    hourCycle: "h12",
  }).formatToParts(date);

  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";

  // 24h hour for the night curve — h12 above is only for display
  const h24 = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: VENUE.tz,
      hour: "numeric",
      hour12: false,
      hourCycle: "h23",
    }).format(date)
  );
  const minute = Number(get("minute"));

  return {
    weekday: get("weekday"), // "Sunday"
    month: get("month").toUpperCase(), // "JUL"
    day: get("day"), // "26"
    year: get("year"),
    clock: `${get("hour")}:${get("minute")} ${get("dayPeriod")}`, // "8:04 PM"
    hour: h24,
    minute,
    hourFloat: h24 + minute / 60,
    /** YYYY-MM-DD in venue-local terms, for matching event instance_date. */
    isoDate: new Intl.DateTimeFormat("en-CA", {
      timeZone: VENUE.tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date),
  };
}

// ---------------------------------------------------------------- events
/** "20:00:00" -> "8:00 PM" */
function fmtTime(hms) {
  if (!hms) return "";
  const [h, m] = hms.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

/** Minutes past midnight, for ordering events within a day. */
function toMinutes(hms) {
  if (!hms) return 0;
  const [h, m] = hms.split(":").map(Number);
  return h * 60 + m;
}

let cache = null;

export async function loadEvents() {
  if (cache) return cache;
  try {
    // Relative so it works at /stacys-model/ on Pages and at / locally
    const res = await fetch("data/events.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`events.json ${res.status}`);
    const data = await res.json();
    cache = Array.isArray(data.events) ? data.events : [];
  } catch (err) {
    console.warn("[venue] could not load events", err);
    cache = [];
  }
  return cache;
}

/**
 * Events on the venue's current date, earliest first.
 *
 * Matches on `instance_date`, not `recurrence_day` — the API's casing for that
 * field is inconsistent ("Friday" vs "sunday") and one-off events have none.
 * Days can hold more than one event: 2026-08-02 has the noon drag brunch and the
 * 8pm karaoke.
 */
export function eventsOn(events, isoDate) {
  return events
    .filter((e) => (e.instance_date || "").slice(0, 10) === isoDate)
    .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
}

/**
 * What to show right now: whatever hasn't ended yet today, else the last one of
 * the day (so a finished event still reads as "tonight" rather than vanishing).
 */
export function currentEvent(events, now) {
  const today = eventsOn(events, now.isoDate);
  if (!today.length) return null;
  const mins = now.hour * 60 + now.minute;
  const live =
    today.find((e) => {
      const start = toMinutes(e.start_time);
      let end = toMinutes(e.end_time);
      if (end <= start) end += 24 * 60; // wraps past midnight
      return mins < end;
    }) || today[today.length - 1];
  return decorate(live, now);
}

/**
 * Open/closed state, derived from the REAL event schedule.
 *
 * Stacy's publishes no opening hours anywhere I could find — not on their site,
 * and Yelp blocks scraping — so this deliberately reports what the schedule
 * actually supports rather than guessing hours. It is not the sim's crowd curve;
 * that one is invented and must not drive anything presented as fact.
 *
 * @returns {{label: string, tone: "open"|"soon"|"closed"}}
 */
export function venueState(events, now) {
  const today = eventsOn(events, now.isoDate);
  const mins = now.hour * 60 + now.minute;

  for (const e of today) {
    const start = toMinutes(e.start_time);
    let end = toMinutes(e.end_time);
    if (end <= start) end += 24 * 60;
    if (mins >= start && mins < end) return { label: "Open", tone: "open" };
  }
  const next = today.find((e) => toMinutes(e.start_time) > mins);
  if (next) {
    return { label: `Opens ${fmtTime(next.start_time)}`, tone: "soon" };
  }
  return { label: "Closed", tone: "closed" };
}

function decorate(e, now) {
  const start = toMinutes(e.start_time);
  const mins = now.hour * 60 + now.minute;
  return {
    name: e.name,
    description: e.description || "",
    tags: e.tags || [],
    ageRestriction: e.age_restriction || "",
    startLabel: fmtTime(e.start_time),
    endLabel: fmtTime(e.end_time),
    /** "TONIGHT" for evening events, "TODAY" for daytime ones. */
    when: start >= 17 * 60 ? "TONIGHT" : "TODAY",
    started: mins >= start,
    coverAmount: e.cover_charge_enabled ? e.cover_charge_amount : null,
  };
}

// ---------------------------------------------------------------- weather
/** WMO weather codes -> short label + glyph. */
const WMO = [
  [[0], "Clear", "☀"],
  [[1], "Mostly clear", "☀"],
  [[2], "Partly cloudy", "⛅"],
  [[3], "Overcast", "☁"],
  [[45, 48], "Fog", "░"],
  [[51, 53, 55, 56, 57], "Drizzle", "☔"],
  [[61, 63, 65, 66, 67], "Rain", "☔"],
  [[71, 73, 75, 77], "Snow", "❄"],
  [[80, 81, 82], "Showers", "☔"],
  [[85, 86], "Snow showers", "❄"],
  [[95, 96, 99], "Storms", "⚡"],
];

function describeCode(code, isDay) {
  for (const [codes, label, glyph] of WMO) {
    if (!codes.includes(code)) continue;
    // A sun next to "9:20 PM" reads as a bug. Clear skies get a moon after dark;
    // rain and storms look the same at any hour.
    if (!isDay && (code === 0 || code === 1)) return { label, glyph: "☾" };
    return { label, glyph };
  }
  return { label: "", glyph: "" };
}

/**
 * Current conditions over the venue. Returns null on failure — the caller should
 * treat weather as optional garnish and never block on it.
 */
export async function fetchWeather() {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${VENUE.lat}&longitude=${VENUE.lon}` +
    "&current=temperature_2m,weather_code,is_day" +
    `&temperature_unit=fahrenheit&timezone=${encodeURIComponent(VENUE.tz)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const d = await res.json();
    const c = d.current;
    if (!c || typeof c.temperature_2m !== "number") throw new Error("no current");
    const { label, glyph } = describeCode(c.weather_code, c.is_day === 1);
    return {
      tempF: Math.round(c.temperature_2m),
      label,
      glyph,
      isDay: c.is_day === 1,
    };
  } catch (err) {
    console.warn("[venue] weather unavailable", err);
    return null;
  }
}
