// Bring the app's Great Hall sessions in line with the official sched agenda.
// - updates times of matched sessions, swaps changed speakers, sets Moderator/Speaker roles
// - removes sessions that are no longer in the agenda (unless someone already started tracking them)
// - new speakers get a PR via rotation (existing assignments are kept)
// Opening segments, registration and breaks are not handled by the PR team and are ignored.
// Usage: bun scripts/sync-agenda.ts /tmp/sched/greathall.json [--apply]
import { apply, normName, peopleOf, type Action, type State } from "@great-hall-pr/core";
import { createDb } from "@great-hall-pr/db";
import { readFileSync } from "node:fs";
import { loadState, persist } from "../packages/api/src/store";

type SchedSession = { day: string; when: string; title: string; people: { name: string; role: string }[] };
const [file, flag] = process.argv.slice(2);
const doApply = flag === "--apply";
const sched = JSON.parse(readFileSync(file!, "utf8")) as SchedSession[];
const url = process.env.DATABASE_URL || /^DATABASE_URL=(.+)$/m.exec(readFileSync(new URL("../apps/web/.env", import.meta.url), "utf8"))![1]!;
const db = createDb({ DATABASE_URL: url });
const st = await loadState(db);
const admin = { name: st.settings.adminName || "Team Leader", admin: true };

const ignore = (t: string) => /^(Registration|BREAK)$/i.test(t) || /^Opening Remarks/i.test(t) || /^Celebrating 25 Years/i.test(t);
const nt = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const to24 = (s: string) => { const m = /(\d+):(\d+)\s*(am|pm)/i.exec(s)!; return `${String((+m[1]! % 12) + (m[3]!.toLowerCase() === "pm" ? 12 : 0)).padStart(2, "0")}:${m[2]}`; };
const lev = (a: string, b: string) => { const d = [...Array(a.length + 1)].map((_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0]![j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length]![b.length]!; };
const same = (a: string, b: string) => { const x = normName(a).replace(/ /g, ""), y = normName(b).replace(/ /g, ""); return x === y || lev(x, y) <= 2; };

const actions: Action[] = [];
const log: string[] = [];
const matched = new Set<string>();
for (const s of sched) {
  if (ignore(s.title)) continue;
  const o = st.sessions.find((x) => x.day === s.day && nt(x.title) === nt(s.title));
  const [a, b] = s.when.split(/\s+-\s+/);
  const start = to24(a!), end = to24(b!);
  if (!o) { log.push(`NEW SESSION (not added automatically): ${s.day} ${start} ${s.title}`); continue; }
  matched.add(o.id);
  const fmt = (t: number) => new Date(t + 3 * 3600e3).toISOString().slice(11, 16);
  if (fmt(o.start) !== start || fmt(o.end) !== end) { actions.push({ type: "saveSession", sid: o.id, startHHMM: start, endHHMM: end }); log.push(`time  ${o.title.slice(0, 45)}: ${fmt(o.start)}-${fmt(o.end)} → ${start}-${end}`); }
  const ours = peopleOf(st, o.id);
  const used = new Set<string>();
  for (const sp of s.people) {
    const hit = ours.find((p) => !used.has(p.id) && same(p.name, sp.name));
    if (hit) {
      used.add(hit.id);
      // keep our spelling when the official one only differs in case / spacing / punctuation
      const rename = normName(hit.name) !== normName(sp.name);
      const name = rename ? sp.name : hit.name;
      if (rename || hit.role !== sp.role) { actions.push({ type: "savePerson", pid: hit.id, sid: o.id, name, role: sp.role, phone: hit.phone }); log.push(rename ? `rename ${hit.name} → ${sp.name}` : `role  ${hit.name}: ${hit.role} → ${sp.role}`); }
    } else { actions.push({ type: "savePerson", sid: o.id, name: sp.name, role: sp.role }); log.push(`add   ${sp.name} (${sp.role}) → ${o.title.slice(0, 45)}`); }
  }
  for (const p of ours) if (!used.has(p.id)) {
    if (p.called || p.etaCall || p.arrived || p.backstage || p.onstage) { log.push(`KEEP  ${p.name} (already being tracked) – check manually`); continue; }
    actions.push({ type: "deletePerson", pid: p.id }); log.push(`remove ${p.name} from ${o.title.slice(0, 45)}`);
  }
}
for (const o of st.sessions) if (!matched.has(o.id)) {
  const started = peopleOf(st, o.id).some((p) => p.called || p.etaCall || p.arrived || p.backstage || p.onstage);
  if (started) { log.push(`KEEP SESSION ${o.title} (already being tracked) – not in official agenda`); continue; }
  actions.push({ type: "deleteSession", sid: o.id }); log.push(`remove session ${o.title} (not in official agenda)`);
}
actions.push({ type: "autoAssign", onlyUnassigned: true });

console.log(log.join("\n") || "Already in sync.");
if (!doApply) { console.log(`\n(dry run – ${actions.length - 1} change(s); add --apply to save)`); process.exit(0); }
const before = structuredClone(st) as State;
const dirty = new Set<string>();
for (const a of actions) { const r = apply(st, a, admin, Date.now()); if (!r.ok) throw new Error(`${a.type}: ${r.error}`); r.dirty.forEach((d) => dirty.add(d)); }
await persist(db, before, st, [...dirty] as never, st._newLog || []);
console.log(`\nSaved ${actions.length} change(s).`);
