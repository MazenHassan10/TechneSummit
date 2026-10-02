import { apply, normName, type Actor, type State, type Table } from "@great-hall-pr/core";
import type { Database } from "@great-hall-pr/db";
import { agendaChanges, appMeta, settings, speakerProfiles } from "@great-hall-pr/db/schema/index";
import { and, eq, inArray, sql } from "drizzle-orm";

import { diffAgenda, fetchSchedGreatHall, TIME_ONLY_KINDS, type Proposal, type SchedSession } from "./agenda-sync";
import { fetchSchedProfile, type OfficialProfile } from "./agenda-profiles";
import { loadState, persist } from "./store";

async function setSetting(db: Database, key: string, value: string) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}
const bump = (db: Database) => db.update(appMeta).set({ version: sql`${appMeta.version} + 1` }).where(eq(appMeta.id, 1));

/**
 * Compares the official agenda with ours and records new differences as pending proposals.
 * - a difference that was already recorded (pending, approved or rejected) is not alerted again
 * - pending proposals that disappeared from the official site are marked obsolete
 * Never changes the agenda itself.
 */
export async function runAgendaCheck(db: Database, opts: { fetchFn?: typeof fetch; sched?: SchedSession[]; mode?: "full" | "times"; error?: string } = {}) {
  const now = Date.now();
  const state = await loadState(db);
  let proposals: Proposal[];
  let mode: "full" | "times" = opts.mode ?? "full";
  try {
    if (opts.error) throw new Error(opts.error);
    let sched = opts.sched;
    if (!sched) { const got = await fetchSchedGreatHall([state.settings.day1, state.settings.day2], opts.fetchFn); sched = got.sessions; mode = got.mode; }
    proposals = diffAgenda(state, sched, { timesOnly: mode === "times" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setSetting(db, "agendaLastCheck", String(now));
    await setSetting(db, "agendaLastError", msg);
    await bump(db);
    return { ok: false as const, error: msg };
  }
  const known = await db.select({ id: agendaChanges.id, status: agendaChanges.status, kind: agendaChanges.kind }).from(agendaChanges);
  const knownIds = new Set(known.map((k) => k.id));
  const fresh = proposals.filter((p) => !knownIds.has(p.id));
  const currentIds = new Set(proposals.map((p) => p.id));
  // a times-only check can't see speakers, so it must not retire pending speaker proposals
  const gone = known.filter((k) => k.status === "pending" && !currentIds.has(k.id) && (mode === "full" || TIME_ONLY_KINDS.includes(k.kind as never))).map((k) => k.id);

  // new speakers: grab their official profile now (photo, title, bio) so it can be shown and saved on approval
  const profiles = new Map<string, Record<string, OfficialProfile>>();
  if (mode === "full")
    for (const p of fresh) {
      const ppl = p.kind === "add_person" && p.person ? [p.person] : p.kind === "new_session" ? (p.newSession?.people ?? []) : [];
      const got: Record<string, OfficialProfile> = {};
      for (const sp of ppl) if (sp.profileUrl) { const prof = await fetchSchedProfile(sp.profileUrl, opts.fetchFn).catch(() => null); if (prof) got[normName(sp.name)] = { ...prof, name: prof.name || sp.name }; }
      if (Object.keys(got).length) profiles.set(p.id, got);
    }
  if (fresh.length)
    await db.insert(agendaChanges).values(fresh.map((p) => ({
      id: p.id, kind: p.kind, summary: p.summary, warning: p.warning ?? "", status: "pending", detectedAt: now,
      payload: JSON.stringify({ actions: p.actions, newSession: p.newSession ?? null, person: p.person ?? null, profiles: profiles.get(p.id) ?? {} }),
    })));
  if (gone.length) await db.update(agendaChanges).set({ status: "obsolete", decidedAt: now, decidedBy: "official site" }).where(inArray(agendaChanges.id, gone));
  await setSetting(db, "agendaLastCheck", String(now));
  await setSetting(db, "agendaLastError", "");
  await setSetting(db, mode === "full" ? "agendaLastFullCheck" : "agendaLastTimesCheck", String(now));
  await bump(db); // phones pick up the new check time / proposals on their next poll
  return { ok: true as const, mode, differences: proposals.length, newProposals: fresh.length, resolved: gone.length };
}

/** Approve (apply) or reject pending proposals – all in one load and one save. */
/** `prs`: the PR chosen for each new speaker – key = change id (add_person) or `${changeId}|${normalised name}` (new_session). */
export async function decideChanges(db: Database, ids: string[], approve: boolean, actor: Actor, prs: Record<string, string> = {}) {
  if (!actor.admin) throw new Error("Only the Team Leader can approve agenda changes.");
  const rows = ids.length ? await db.select().from(agendaChanges).where(and(inArray(agendaChanges.id, ids), eq(agendaChanges.status, "pending"))) : [];
  if (!rows.length) return { ok: false as const, error: "Already decided – refresh.", applied: 0, failed: [] as string[] };
  const now = Date.now();
  if (!approve) {
    await db.update(agendaChanges).set({ status: "rejected", decidedBy: actor.name, decidedAt: now }).where(inArray(agendaChanges.id, rows.map((r) => r.id)));
    await bump(db);
    return { ok: true as const, applied: 0, failed: [] as string[] };
  }
  const state = await loadState(db);
  const before = structuredClone(state) as State;
  const dirty = new Set<Table>();
  const done: string[] = [];
  const failed: { id: string; error: string }[] = [];
  // apply in the order they were found; each change is all-or-nothing on a scratch copy
  for (const row of rows.sort((a, b) => a.detectedAt - b.detectedAt)) {
    const scratch = structuredClone(state) as State;
    const localDirty = new Set<Table>();
    const run = (a: { type: string } & Record<string, unknown>) => {
      const r = apply(scratch, a, actor, now);
      if (!r.ok) throw new Error(r.error);
      r.dirty.forEach((d) => localDirty.add(d));
      return r.result;
    };
    try {
      const payload = JSON.parse(row.payload) as { actions: ({ type: string } & Record<string, unknown>)[]; newSession: { day: string; start: string; end: string; title: string; people: { name: string; role: string }[] } | null };
      if (payload.newSession) {
        const ns = payload.newSession;
        const res = run({ type: "saveSession", title: ns.title, day: ns.day, startHHMM: ns.start, endHHMM: ns.end, stype: "Panel" }) as { sid: string };
        for (const p of ns.people) run({ type: "savePerson", sid: res.sid, name: p.name, role: p.role, pr: prs[`${row.id}|${normName(p.name)}`] ?? "" });
      }
      for (const a of payload.actions) run(row.kind === "add_person" && a.type === "savePerson" ? { ...a, pr: prs[row.id] ?? "" } : a);
      Object.assign(state, scratch);
      localDirty.forEach((d) => dirty.add(d));
      done.push(row.id);
    } catch (e) {
      failed.push({ id: row.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (done.length) await persist(db, before, state, [...dirty], state._newLog || []);
  // official profiles of newly added speakers go straight into the Agenda (existing social links are kept)
  for (const row of rows.filter((r) => done.includes(r.id))) {
    const profs = (JSON.parse(row.payload) as { profiles?: Record<string, OfficialProfile> }).profiles ?? {};
    for (const [key, pr] of Object.entries(profs)) await upsertOfficialProfile(db, key, pr);
  }
  if (done.length) await db.update(agendaChanges).set({ status: "approved", decidedBy: actor.name, decidedAt: now }).where(inArray(agendaChanges.id, done));
  for (const f of failed) await db.update(agendaChanges).set({ status: "failed", decidedBy: actor.name, decidedAt: now, error: f.error }).where(eq(agendaChanges.id, f.id));
  if (failed.length && !done.length) await bump(db);
  return {
    ok: failed.length === 0,
    applied: done.length,
    failed: failed.map((f) => f.id),
    ...(failed.length ? { error: `${failed.length} change(s) could not be applied: ${failed[0]!.error}` } : {}),
  } as { ok: boolean; applied: number; failed: string[]; error?: string };
}

/** Insert or refresh a speaker's official data (photo, title, company, bio) – never touches their social links. */
export async function upsertOfficialProfile(db: Database, key: string, pr: OfficialProfile) {
  const fields = { name: pr.name, position: pr.position, company: pr.company, photo: pr.photo, bio: pr.bio, sourceUrl: pr.sourceUrl };
  await db.insert(speakerProfiles).values({ key, ...fields, linkedin: "", otherLink: "", linkConfidence: "none", social: "[]" })
    .onConflictDoUpdate({ target: speakerProfiles.key, set: fields });
}
