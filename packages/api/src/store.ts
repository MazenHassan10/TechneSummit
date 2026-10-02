import type { Incident, LogEntry, Member, Person, Session, Settings, State, Table } from "@great-hall-pr/core";
import { autoAssign } from "@great-hall-pr/core";
import type { Database } from "@great-hall-pr/db";
import { activityLog, agendaChanges, appMeta, authTokens, incidents, members, people, sessions, settings } from "@great-hall-pr/db/schema/index";
import { desc, eq, inArray, sql } from "drizzle-orm";

import SEED from "./seed.json";

export type StoredState = State & { version: number };

const TEXT_SETTINGS = new Set(["day1", "day2", "tz", "tzName", "adminName", "adminPin", "adminPhone", "agendaLastError"]);

function parseSettings(rows: { key: string; value: string }[]): Settings {
  const out: Record<string, string | number> = {};
  for (const r of rows) out[r.key] = TEXT_SETTINGS.has(r.key) ? r.value : Number(r.value);
  return out as unknown as Settings;
}

const stripSort = <T extends { sort?: number }>({ sort: _s, ...rest }: T) => rest;

/** Reads the whole event (≈150 rows) in one round-trip. */
export async function loadState(db: Database): Promise<StoredState> {
  const [m, s, p, i, l, st, meta, ac] = await db.batch([
    db.select().from(members).orderBy(members.sort),
    db.select().from(sessions),
    db.select().from(people).orderBy(people.sort),
    db.select().from(incidents),
    db.select().from(activityLog).orderBy(desc(activityLog.id)).limit(150),
    db.select().from(settings),
    db.select().from(appMeta).where(eq(appMeta.id, 1)),
    db.select({ id: agendaChanges.id, kind: agendaChanges.kind, summary: agendaChanges.summary, warning: agendaChanges.warning, detectedAt: agendaChanges.detectedAt })
      .from(agendaChanges).where(eq(agendaChanges.status, "pending")),
  ]);
  return {
    settings: parseSettings(st),
    team: m.map(stripSort) as Member[],
    sessions: s as Session[],
    people: p.map(stripSort) as Person[],
    incidents: i as Incident[],
    log: l.reverse().map(({ ts, by, text }) => ({ ts, by, text })),
    agendaChanges: ac.sort((a, b) => a.detectedAt - b.detectedAt),
    version: meta[0]?.version ?? 0,
  };
}

export async function getVersion(db: Database) {
  const rows = await db.select({ version: appMeta.version }).from(appMeta).where(eq(appMeta.id, 1));
  return rows[0]?.version ?? 0;
}

const TABLES = {
  team: { table: members, key: "name" as const },
  sessions: { table: sessions, key: "id" as const },
  people: { table: people, key: "id" as const },
  incidents: { table: incidents, key: "id" as const },
};

type Row = Record<string, unknown>;

/**
 * Writes only what changed between `before` and `after` (row-level diff), plus new log lines,
 * and bumps the version – all in one transactional batch.
 */
export async function persist(db: Database, before: State, after: State, dirty: Table[], newLog: LogEntry[]) {
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous drizzle queries in one batch
  const queries: any[] = [];
  for (const name of new Set(dirty)) {
    const { table, key } = TABLES[name];
    const hasSort = name === "team" || name === "people";
    const prev = new Map((before[name] as unknown as Row[]).map((r, i) => [r[key] as string, { json: JSON.stringify(r), idx: i }]));
    const rows = after[name] as unknown as Row[];
    // biome-ignore lint/suspicious/noExplicitAny: dynamic key column
    const col = (table as any)[key];
    const seen = new Set<string>();
    rows.forEach((r, idx) => {
      const k = r[key] as string;
      seen.add(k);
      const row = hasSort ? { ...r, sort: idx } : r;
      const old = prev.get(k);
      if (!old) queries.push(db.insert(table).values(row as never));
      else if (old.json !== JSON.stringify(r) || (hasSort && old.idx !== idx)) queries.push(db.update(table).set(row as never).where(eq(col, k)));
    });
    const gone = [...prev.keys()].filter((k) => !seen.has(k));
    if (gone.length) queries.push(db.delete(table).where(inArray(col, gone)));
  }
  if (newLog.length) queries.push(db.insert(activityLog).values(newLog));
  queries.push(db.update(appMeta).set({ version: sql`${appMeta.version} + 1` }).where(eq(appMeta.id, 1)).returning({ version: appMeta.version }));
  const res = await db.batch(queries as [never, ...never[]]);
  const last = res[res.length - 1] as unknown as { version: number }[];
  return last[0]?.version ?? 0;
}

// ---------- auth tokens ----------
export async function createToken(db: Database, who: string) {
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  await db.insert(authTokens).values({ token, who, createdAt: Date.now() });
  return token;
}

export async function whoForToken(db: Database, token: string | null) {
  if (!token) return null;
  const rows = await db.select({ who: authTokens.who }).from(authTokens).where(eq(authTokens.token, token));
  return rows[0]?.who ?? null;
}

// ---------- seed ----------
/** Loads the Great Hall agenda + team the first time. Does nothing if data already exists. */
export async function seedIfEmpty(db: Database) {
  const existing = await db.select({ name: members.name }).from(members).limit(1);
  if (existing.length) return false;
  const s = JSON.parse(JSON.stringify(SEED)) as State;
  autoAssign(s, null, false); // one PR per speaker
  // PINs are never stored in the repo – create random ones for a brand-new database
  const rnd = (digits: number) => String(crypto.getRandomValues(new Uint32Array(1))[0]! % 10 ** digits).padStart(digits, "0");
  for (const m of s.team) if (!m.pin) m.pin = rnd(4);
  if (!s.settings.adminPin) s.settings.adminPin = rnd(6);
  const now = Date.now();
  await db.batch([
    db.insert(settings).values(Object.entries(s.settings).map(([key, value]) => ({ key, value: String(value) }))),
    db.insert(members).values(s.team.map((m, i) => ({ ...m, guest: !!m.guest, sort: i }))),
    db.insert(sessions).values(s.sessions),
    db.insert(people).values(s.people.map((p, i) => ({ ...p, sort: i }))),
    db.insert(activityLog).values({ ts: now, by: "System", text: "System set up with Great Hall agenda" }),
    db.insert(appMeta).values({ id: 1, version: 1 }).onConflictDoNothing(),
  ]);
  return true;
}
