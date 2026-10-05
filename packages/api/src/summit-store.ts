// Keeps a copy of the whole summit agenda (every stage and workshop room) for speaker profiles.
import type { Database } from "@great-hall-pr/db";
import { summitSessions } from "@great-hall-pr/db/schema/index";
import { eq } from "drizzle-orm";

import type { SummitSession } from "./agenda-sync";

/** Replaces each fetched day in one transaction; days that weren't fetched keep their last copy. */
export async function saveSummit(db: Database, byDay: Record<string, SummitSession[]>) {
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous drizzle queries in one batch
  const q: any[] = [];
  let n = 0;
  for (const [day, list] of Object.entries(byDay)) {
    q.push(db.delete(summitSessions).where(eq(summitSessions.day, day)));
    const seen = new Set<string>();
    const rows = list.map((s) => {
      let id = `${day}|${s.start}|${s.venue}|${s.title}`.slice(0, 300);
      while (seen.has(id)) id += "+";
      seen.add(id);
      return { id, day, start: s.start, end: s.end, title: s.title, venue: s.venue, track: s.track, format: s.format, description: s.description ?? "",
        people: JSON.stringify(s.people.map((p) => ({ name: p.name, role: p.role, headline: p.headline ?? "", photo: p.photo ?? "", url: p.profileUrl ?? "" }))) };
    });
    if (rows.length) q.push(db.insert(summitSessions).values(rows));
    n += rows.length;
  }
  if (q.length) await db.batch(q as never);
  return { days: Object.keys(byDay), sessions: n };
}

/**
 * Everyone on the summit agenda gets an Agenda profile (photo, title, company, short bio) so the
 * "All stages" view can open them – only people without one, a few per run, never overwriting.
 */
export async function fillSummitProfiles(db: Database, byDay: Record<string, SummitSession[]>, max = 40) {
  const { speakerProfiles } = await import("@great-hall-pr/db/schema/index");
  const { normName } = await import("@great-hall-pr/core");
  const { fetchSchedProfile } = await import("./agenda-profiles");
  const have = new Set((await db.select({ key: speakerProfiles.key }).from(speakerProfiles)).map((r) => r.key));
  const todo = new Map<string, { name: string; url: string; headline: string; photo: string }>();
  for (const list of Object.values(byDay)) for (const s of list) for (const p of s.people) {
    const k = normName(p.name);
    if (k && !have.has(k) && !todo.has(k) && p.profileUrl) todo.set(k, { name: p.name, url: p.profileUrl, headline: p.headline ?? "", photo: p.photo ?? "" });
  }
  const added: string[] = [];
  for (const [key, p] of [...todo].slice(0, max)) {
    const prof = await fetchSchedProfile(p.url).catch(() => null);
    const [position = "", ...rest] = (p.headline || "").split(", ");
    await db.insert(speakerProfiles).values({
      key, name: prof?.name || p.name, position: prof?.position || position, company: prof?.company || rest.join(", "),
      photo: prof?.photo || p.photo, bio: prof?.bio || "", sourceUrl: p.url,
    }).onConflictDoNothing();
    added.push(p.name);
    await new Promise((r) => setTimeout(r, 200));
  }
  return { added: added.length, waiting: Math.max(0, todo.size - added.length) };
}
