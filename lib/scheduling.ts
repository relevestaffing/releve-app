/* ============================================================
   SCHEDULING
   Weekly recurring availability on both sides, projected forward
   into bookable slots. Everything is stored and compared in UTC;
   everything is displayed in the viewer's own timezone.
   ============================================================ */
export type Window = { weekday: number; start_min: number; end_min: number };  // in the person's own tz
export type Availability = { user_id: string; timezone: string; windows: Window[] };
export type Slot = { startISO: string; endISO: string };

export const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export const SLOT_MIN = 45;

/** Minutes a timezone is offset from UTC at a given instant (positive = ahead of UTC). */
export function tzOffsetMinutes(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map(x => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUTC - at.getTime()) / 60000);
}

/** The UTC instant for a wall-clock time on a given day in a given timezone. */
function wallToUtc(y: number, m: number, d: number, minutes: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(y, m, d, Math.floor(minutes / 60), minutes % 60));
  const off = tzOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - off * 60000);
}

/** Every slot where both people are free, over the next `days` days. */
export type Interval = { start: string; end: string };

export function overlappingSlots(
  a: Availability, b: Availability, from: Date, days = 10, slotMin = SLOT_MIN,
  busy: string[] = [], calendarBusy: Interval[] = []
): Slot[] {
  const blocked = calendarBusy.map(i => ({ s: Date.parse(i.start), e: Date.parse(i.end) }));
  const clashes = (t: number) => blocked.some(b => t < b.e && t + slotMin * 60000 > b.s);
  const out: Slot[] = [];
  const taken = new Set(busy);
  for (let i = 0; i < days; i++) {
    const day = new Date(from.getTime() + i * 86400000);
    const y = day.getUTCFullYear(), m = day.getUTCMonth(), d = day.getUTCDate();
    const spans: { s: number; e: number }[] = [];
    /* a person's windows can land on the previous or next UTC day once converted */
    for (const side of [a, b]) {
      const ranges: { s: number; e: number }[] = [];
      for (let shift = -1; shift <= 1; shift++) {
        const probe = new Date(Date.UTC(y, m, d + shift));
        const localWeekday = Number(new Intl.DateTimeFormat('en-US', { timeZone: side.timezone, weekday: 'short' })
          .formatToParts(probe).length ? weekdayIn(probe, side.timezone) : probe.getUTCDay());
        side.windows.filter(w => w.weekday === localWeekday).forEach(w => {
          const s = wallToUtc(probe.getUTCFullYear(), probe.getUTCMonth(), probe.getUTCDate(), w.start_min, side.timezone);
          const e = wallToUtc(probe.getUTCFullYear(), probe.getUTCMonth(), probe.getUTCDate(), w.end_min, side.timezone);
          ranges.push({ s: s.getTime(), e: e.getTime() });
        });
      }
      spans.push(...merge(ranges).map(r => ({ s: r.s, e: r.e, side: side === a ? 0 : 1 })) as any);
    }
    const aSpans = (spans as any).filter((x: any) => x.side === 0);
    const bSpans = (spans as any).filter((x: any) => x.side === 1);
    aSpans.forEach((x: any) => bSpans.forEach((z: any) => {
      const s = Math.max(x.s, z.s), e = Math.min(x.e, z.e);
      for (let t = s; t + slotMin * 60000 <= e; t += slotMin * 60000) {
        const startISO = new Date(t).toISOString();
        if (t < from.getTime() || taken.has(startISO) || clashes(t)) continue;
        if (!out.some(o => o.startISO === startISO))
          out.push({ startISO, endISO: new Date(t + slotMin * 60000).toISOString() });
      }
    }));
  }
  return out.sort((x, y) => x.startISO.localeCompare(y.startISO)).slice(0, 60);
}

function weekdayIn(at: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at);
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(name);
}
function merge(ranges: { s: number; e: number }[]) {
  const sorted = [...ranges].sort((a, b) => a.s - b.s), out: { s: number; e: number }[] = [];
  sorted.forEach(r => {
    const last = out[out.length - 1];
    if (last && r.s <= last.e) last.e = Math.max(last.e, r.e); else out.push({ ...r });
  });
  return out;
}

export function formatSlot(iso: string, timeZone: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true
  }).format(d);
}
export function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}
export const minutesToLabel = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60;
  const ampm = h >= 12 ? 'pm' : 'am', hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${mm ? ':' + String(mm).padStart(2, '0') : ''}${ampm}`;
};

/* a sensible default so nobody starts from an empty grid */
export const DEFAULT_WINDOWS: Window[] = [1, 2, 3, 4, 5].map(weekday => ({ weekday, start_min: 9 * 60, end_min: 17 * 60 }));
