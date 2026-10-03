// Watches the official sched agenda and turns differences into proposals the Team Leader approves.
// Pure functions (parse + diff) are unit-tested in agenda-sync.test.ts; nothing here writes to the DB.
import { normName, peopleOf, type Action, type State } from "@great-hall-pr/core";

export const SCHED_BASE = "https://technesummit2026.sched.com/";

export type SchedPerson = {
  name: string; role: "Moderator" | "Speaker"; profileUrl?: string;
  /** photo + "title, company" as shown on the agenda page – used to spot profile changes cheaply */
  photo?: string; headline?: string;
};
export type SchedSession = { day: string; start: string; end: string; title: string; people: SchedPerson[] };

export type ChangeKind = "time" | "rename" | "role" | "add_person" | "remove_person" | "new_session" | "removed_session";
export type Proposal = {
  /** stable id – the same difference always gets the same id, so it is only alerted once */
  id: string;
  kind: ChangeKind;
  summary: string;
  /** actions applied on approval; for new_session the session is created first and `{sid}` is filled in */
  actions: Action[];
  newSession?: { day: string; start: string; end: string; title: string; people: SchedPerson[] };
  /** add_person: who is being added (with their official profile link) */
  person?: SchedPerson;
  warning?: string;
};

/** Registration, breaks and the Opening segments are not handled by the Great Hall PR team. */
export const ignoredTitle = (t: string) =>
  /^(registration|break|lunch break|networking break)$/i.test(t.trim()) || /^opening/i.test(t.trim()) || /^celebrating 25 years/i.test(t.trim());

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;|&#8217;/g, "’").replace(/&lsquo;/g, "‘")
    .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—").replace(/&nbsp;/g, " ").replace(/&bull;/g, "•").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

const to24 = (s: string) => {
  const m = /(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(s);
  if (!m) return "";
  return `${String((+m[1]! % 12) + (m[3]!.toLowerCase() === "pm" ? 12 : 0)).padStart(2, "0")}:${m[2]}`;
};

/** One session anywhere at the summit (any stage, workshop room, meet & greet…). */
export type SummitSession = SchedSession & { venue: string; track: string; format: string };

/** Parses one day of `/<day>/list/descriptions/` – every venue. */
export function parseSchedDayAll(html: string, day: string): SummitSession[] {
  const out: SummitSession[] = [];
  for (const block of html.split('<span class="event ev_').slice(1)) {
    const venue = decode(/list-single__location">\s*<a[^>]*>\s*([\s\S]*?)\s*<\/a>/.exec(block)?.[1] ?? "");
    const title = decode(/session-title">([\s\S]*?)<\/span>/.exec(block)?.[1] ?? "");
    const when = decode(/list-single__date">([\s\S]*?)<span/.exec(block)?.[1] ?? "");
    const [a, b] = when.replace(/^.*?\d{4}\s*/, "").split(/\s+-\s+/);
    // "Money Made Simple, Panel" → track + format
    const types = [...(/sched-event-type">([\s\S]*?)<\/div>/.exec(block)?.[1] ?? "").matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map((m) => decode(m[1]!)).filter(Boolean);
    const people: SchedPerson[] = [];
    const roles = /<strong>(Moderators?|Speakers?)<\/strong>([\s\S]*?)(?=<strong>|$)/g;
    for (let rm = roles.exec(block); rm; rm = roles.exec(block)) {
      const role = rm[1]!.startsWith("Moderator") ? "Moderator" : "Speaker";
      for (const chunk of rm[2]!.split("sched-person-session").slice(1)) {
        const pm = /<h2><a href="([^"]+)"[^>]*title="([^"]+)"/.exec(chunk);
        if (!pm) continue;
        let photo = /<img src="([^"]+)"/.exec(chunk)?.[1] ?? "";
        if (photo.startsWith("//")) photo = "https:" + photo;
        if (/avatar-empty/.test(photo)) photo = "";
        const headline = decode(/sched-event-details-role-company">([\s\S]*?)<\/div>/.exec(chunk)?.[1] ?? "");
        people.push({ name: decode(pm[2]!), role, profileUrl: SCHED_BASE + pm[1]!.replace(/^\//, ""), photo, headline });
      }
    }
    if (title) out.push({ day, start: to24(a ?? ""), end: to24(b ?? ""), title, people, venue, track: types[0] ?? "", format: types.length > 1 ? types[types.length - 1]! : "" });
  }
  return out;
}

/** Parses one day of `/<day>/list/descriptions/` and keeps only Great Hall sessions. */
export function parseSchedDay(html: string, day: string): SchedSession[] {
  return parseSchedDayAll(html, day).filter((s) => /Great Hall/i.test(s.venue)).map(({ day: d, start, end, title, people }) => ({ day: d, start, end, title, people }));
}

/** Every session of the given summit days (all venues) – Mac only (the site blocks cloud servers). Days that fail are left out. */
export async function fetchSchedSummit(days: string[], fetchFn: typeof fetch = fetch) {
  const headers = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36", Accept: "text/html" };
  const byDay: Record<string, SummitSession[]> = {};
  for (const day of days) {
    try {
      const res = await fetchFn(`${SCHED_BASE}${day}/list/descriptions/`, { headers, cache: "no-store" });
      if (!res.ok) continue;
      const list = parseSchedDayAll(await res.text(), day);
      if (list.length >= 10) byDay[day] = list; // bot-check page or half page → keep yesterday's copy
    } catch {}
  }
  return byDay;
}

/**
 * The calendar feed (all.ics) is not behind the site's bot check, so cloud servers can read it.
 * It has titles, times and rooms but NO speakers – good enough to catch time changes, new and cancelled sessions.
 */
export function parseSchedIcs(ics: string, days: string[], tzOffsetHours = 3): SchedSession[] {
  const text = ics.replace(/\r?\n[ \t]/g, "");
  const out: SchedSession[] = [];
  const unescape = (v: string) => v.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, " ").replace(/\\\\/g, "\\").trim();
  for (const ev of text.split("BEGIN:VEVENT").slice(1)) {
    const field = (k: string) => new RegExp(`^${k}(?:;[^:\\r\\n]*)?:(.*)$`, "m").exec(ev)?.[1]?.trim() ?? "";
    if (!/Great Hall/i.test(unescape(field("LOCATION")))) continue;
    const toLocal = (v: string) => {
      const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(v);
      if (!m) return null;
      const utc = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) + (v.endsWith("Z") ? tzOffsetHours * 3_600_000 : 0);
      const d = new Date(utc);
      return { day: d.toISOString().slice(0, 10), hm: d.toISOString().slice(11, 16) };
    };
    const a = toLocal(field("DTSTART")), b = toLocal(field("DTEND"));
    const title = decode(unescape(field("SUMMARY")));
    if (!a || !b || !title || !days.includes(a.day)) continue;
    out.push({ day: a.day, start: a.hm, end: b.hm, title, people: [] });
  }
  return out;
}

export type SchedFetch = { sessions: SchedSession[]; mode: "full" | "times" };

/** Full pages when reachable (speakers included); otherwise the calendar feed (times only). */
export async function fetchSchedGreatHall(days: string[], fetchFn: typeof fetch = fetch): Promise<SchedFetch> {
  const headers = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36", Accept: "text/html" };
  try {
    const all: SchedSession[] = [];
    for (const day of days) {
      const res = await fetchFn(`${SCHED_BASE}${day}/list/descriptions/`, { headers, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const parsed = parseSchedDay(html, day);
      // the site's bot check returns a tiny "Just a moment…" page – never treat that as an empty agenda
      if (!parsed.length) throw new Error(`no sessions on page (${html.length} bytes)`);
      all.push(...parsed);
    }
    return { sessions: all, mode: "full" };
  } catch {
    const res = await fetchFn(`${SCHED_BASE}all.ics`, { headers: { ...headers, Accept: "text/calendar" }, cache: "no-store" });
    if (!res.ok) throw new Error(`official calendar feed: HTTP ${res.status}`);
    const sessions = parseSchedIcs(await res.text(), days);
    if (!sessions.length) throw new Error("official calendar feed had no Great Hall sessions");
    return { sessions, mode: "times" };
  }
}

const nt = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const compact = (s: string) => normName(s).replace(/ /g, "");
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}
const samePerson = (a: string, b: string) => { const x = compact(a), y = compact(b); return x === y || (Math.min(x.length, y.length) >= 6 && lev(x, y) <= 2); };

const fmt24 = (ms: number) => { const d = new Date(ms + 3 * 3_600_000); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const to12 = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return `${h! % 12 || 12}:${String(m).padStart(2, "0")} ${h! < 12 ? "AM" : "PM"}`; };
const dayName = (state: State, d: string) => (d === state.settings.day1 ? "Sat" : d === state.settings.day2 ? "Sun" : d);
const started = (p: { called: unknown; etaCall: unknown; arrived: unknown; backstage: unknown; onstage: unknown }) => !!(p.called || p.etaCall || p.arrived || p.backstage || p.onstage);

/** Kinds that can be detected from the calendar feed alone (no speaker data). */
export const TIME_ONLY_KINDS: ChangeKind[] = ["time", "new_session", "removed_session"];

/** Differences between the official agenda and ours, as approvable proposals.
 *  `timesOnly`: the source has no speaker data, so speaker-level differences are not computed. */
export function diffAgenda(state: State, sched: SchedSession[], opts: { timesOnly?: boolean } = {}): Proposal[] {
  const out: Proposal[] = [];
  const matched = new Set<string>();
  for (const s of sched) {
    if (ignoredTitle(s.title)) continue;
    const o = state.sessions.find((x) => x.day === s.day && nt(x.title) === nt(s.title));
    if (!o) {
      if (!s.start || !s.end) continue;
      out.push({
        id: `new_session|${s.day}|${nt(s.title)}`, kind: "new_session",
        summary: `New session ${dayName(state, s.day)} ${to12(s.start)}–${to12(s.end)}: “${s.title}”${s.people.length ? ` with ${s.people.map((p) => p.name).join(", ")}` : ""}`,
        actions: [], newSession: { day: s.day, start: s.start, end: s.end, title: s.title, people: s.people },
      });
      continue;
    }
    matched.add(o.id);
    if (s.start && s.end && (fmt24(o.start) !== s.start || fmt24(o.end) !== s.end)) {
      out.push({
        id: `time|${o.id}|${s.start}-${s.end}`, kind: "time",
        summary: `“${o.title}” moved: ${to12(fmt24(o.start))}–${to12(fmt24(o.end))} → ${to12(s.start)}–${to12(s.end)}`,
        actions: [{ type: "saveSession", sid: o.id, startHHMM: s.start, endHHMM: s.end }],
      });
    }
    if (opts.timesOnly) continue;
    const ours = peopleOf(state, o.id);
    const used = new Set<string>();
    for (const sp of s.people) {
      const hit = ours.find((p) => !used.has(p.id) && samePerson(p.name, sp.name));
      if (hit) {
        used.add(hit.id);
        if (normName(hit.name) !== normName(sp.name))
          out.push({ id: `rename|${hit.id}|${normName(sp.name)}`, kind: "rename", summary: `Name spelling in “${o.title}”: ${hit.name} → ${sp.name}`,
            actions: [{ type: "savePerson", pid: hit.id, sid: o.id, name: sp.name, role: hit.role }] });
        else if (hit.role !== sp.role && (hit.role === "Speaker" || hit.role === "Moderator"))
          out.push({ id: `role|${hit.id}|${sp.role}`, kind: "role", summary: `${hit.name} is now ${sp.role} in “${o.title}”`,
            actions: [{ type: "savePerson", pid: hit.id, sid: o.id, name: hit.name, role: sp.role }] });
      } else {
        out.push({ id: `add_person|${o.id}|${normName(sp.name)}`, kind: "add_person", summary: `${sp.name} (${sp.role}) added to “${o.title}”`,
          actions: [{ type: "savePerson", sid: o.id, name: sp.name, role: sp.role }], person: sp });
      }
    }
    for (const p of ours) if (!used.has(p.id) && !/^TBC/i.test(p.name)) {
      out.push({ id: `remove_person|${p.id}`, kind: "remove_person", summary: `${p.name} no longer listed in “${o.title}”`,
        actions: [{ type: "deletePerson", pid: p.id }], warning: started(p) ? "Their PR already started tracking them." : undefined });
    }
  }
  for (const o of state.sessions) if (!matched.has(o.id)) {
    const ppl = peopleOf(state, o.id);
    out.push({ id: `removed_session|${o.id}`, kind: "removed_session", summary: `“${o.title}” (${dayName(state, o.day)} ${to12(fmt24(o.start))}) is no longer in the official agenda`,
      actions: [{ type: "deleteSession", sid: o.id }], warning: ppl.some(started) ? "Tracking already started for this session." : undefined });
  }
  return out;
}
