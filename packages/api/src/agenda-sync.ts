// Watches the official sched agenda and turns differences into proposals the Team Leader approves.
// Pure functions (parse + diff) are unit-tested in agenda-sync.test.ts; nothing here writes to the DB.
import { normName, peopleOf, type Action, type State } from "@great-hall-pr/core";

export const SCHED_BASE = "https://technesummit2026.sched.com/";

export type SchedPerson = { name: string; role: "Moderator" | "Speaker" };
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

/** Parses one day of `/<day>/list/descriptions/` and keeps only Great Hall sessions. */
export function parseSchedDay(html: string, day: string): SchedSession[] {
  const out: SchedSession[] = [];
  for (const block of html.split('<span class="event ev_').slice(1)) {
    const loc = /list-single__location">\s*<a[^>]*>\s*([\s\S]*?)\s*<\/a>/.exec(block);
    if (!loc || !/Great Hall/i.test(loc[1]!)) continue;
    const title = decode(/session-title">([\s\S]*?)<\/span>/.exec(block)?.[1] ?? "");
    const when = decode(/list-single__date">([\s\S]*?)<span/.exec(block)?.[1] ?? "");
    const [a, b] = when.replace(/^.*?\d{4}\s*/, "").split(/\s+-\s+/);
    const people: SchedPerson[] = [];
    const roles = /<strong>(Moderators?|Speakers?)<\/strong>([\s\S]*?)(?=<strong>|$)/g;
    for (let rm = roles.exec(block); rm; rm = roles.exec(block)) {
      const role = rm[1]!.startsWith("Moderator") ? "Moderator" : "Speaker";
      const names = /<h2><a [^>]*title="([^"]+)"/g;
      for (let pm = names.exec(rm[2]!); pm; pm = names.exec(rm[2]!)) people.push({ name: decode(pm[1]!), role });
    }
    if (title) out.push({ day, start: to24(a ?? ""), end: to24(b ?? ""), title, people });
  }
  return out;
}

export async function fetchSchedGreatHall(days: string[], fetchFn: typeof fetch = fetch): Promise<SchedSession[]> {
  const all: SchedSession[] = [];
  for (const day of days) {
    const res = await fetchFn(`${SCHED_BASE}${day}/list/descriptions/`, { headers: { "User-Agent": "Mozilla/5.0 (GreatHallPR agenda watch)" }, cache: "no-store" });
    if (!res.ok) throw new Error(`sched ${day}: HTTP ${res.status}`);
    const html = await res.text();
    const parsed = parseSchedDay(html, day);
    // sanity check: if the page layout changed we must not propose deleting everything
    if (!parsed.length && html.length < 20000) throw new Error(`sched ${day}: unexpected page (${html.length} bytes)`);
    all.push(...parsed);
  }
  return all;
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

/** Differences between the official agenda and ours, as approvable proposals. */
export function diffAgenda(state: State, sched: SchedSession[]): Proposal[] {
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
    const ours = peopleOf(state, o.id);
    const used = new Set<string>();
    for (const sp of s.people) {
      const hit = ours.find((p) => !used.has(p.id) && samePerson(p.name, sp.name));
      if (hit) {
        used.add(hit.id);
        if (normName(hit.name) !== normName(sp.name))
          out.push({ id: `rename|${hit.id}|${normName(sp.name)}`, kind: "rename", summary: `Name spelling in “${o.title}”: ${hit.name} → ${sp.name}`,
            actions: [{ type: "savePerson", pid: hit.id, sid: o.id, name: sp.name, role: hit.role, phone: hit.phone }] });
        else if (hit.role !== sp.role && (hit.role === "Speaker" || hit.role === "Moderator"))
          out.push({ id: `role|${hit.id}|${sp.role}`, kind: "role", summary: `${hit.name} is now ${sp.role} in “${o.title}”`,
            actions: [{ type: "savePerson", pid: hit.id, sid: o.id, name: hit.name, role: sp.role, phone: hit.phone }] });
      } else {
        out.push({ id: `add_person|${o.id}|${normName(sp.name)}`, kind: "add_person", summary: `${sp.name} (${sp.role}) added to “${o.title}”`,
          actions: [{ type: "savePerson", sid: o.id, name: sp.name, role: sp.role }] });
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
