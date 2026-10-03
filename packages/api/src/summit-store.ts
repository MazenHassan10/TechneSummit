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
      return { id, day, start: s.start, end: s.end, title: s.title, venue: s.venue, track: s.track, format: s.format, people: JSON.stringify(s.people.map((p) => ({ name: p.name, role: p.role }))) };
    });
    if (rows.length) q.push(db.insert(summitSessions).values(rows));
    n += rows.length;
  }
  if (q.length) await db.batch(q as never);
  return { days: Object.keys(byDay), sessions: n };
}
