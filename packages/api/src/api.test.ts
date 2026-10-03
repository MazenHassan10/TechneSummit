// Integration tests against a real Postgres (Neon). They WIPE the database, so they only run with
// ALLOW_DB_TESTS=1 – never run them against the live event database once real data exists.
import { createDb } from "@great-hall-pr/db";
import { activityLog, appMeta, authTokens, incidents, members, people, sessions, settings } from "@great-hall-pr/db/schema/index";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { appRouter } from "./routers/index";
import { loadState, seedIfEmpty } from "./store";

const allowed = process.env.ALLOW_DB_TESTS === "1";
const url = process.env.DATABASE_URL || /^DATABASE_URL=(.+)$/m.exec(readFileSync(new URL("../../../apps/web/.env", import.meta.url), "utf8"))?.[1]?.trim();
const db = createDb({ DATABASE_URL: url! });
const caller = (token: string | null) => appRouter.createCaller({ db, token });

async function wipe() {
  await db.batch([
    db.delete(people), db.delete(sessions), db.delete(members), db.delete(incidents),
    db.delete(activityLog), db.delete(settings), db.delete(appMeta), db.delete(authTokens),
  ]);
}

// PINs come from the database (they are not in the repo)
let PINS: Record<string, string> = {};
const pin = (n: string) => PINS[n]!;
let admin = "";
let karim = "";

beforeAll(async () => {
  if (!allowed) return;
  await wipe();
  await seedIfEmpty(db);
  const st = await loadState(db);
  PINS = Object.fromEntries(st.team.map((m) => [m.name, m.pin]));
  PINS.__admin__ = st.settings.adminPin;
});
afterAll(async () => {
  if (!allowed) return;
  await wipe();
  await seedIfEmpty(db); // leave a clean, freshly seeded database behind
});

const t = allowed ? test : test.skip;

t("seed: agenda, team, one PR per speaker", async () => {
  const names = await caller(null).auth.loginNames();
  expect(names).toHaveLength(7);
  admin = (await caller(null).auth.login({ name: "__admin__", pin: pin("__admin__") })).token;
  const r = await caller(admin).state.get({});
  if (r.unchanged) throw new Error("expected state");
  expect(r.state.sessions).toHaveLength(26);
  expect(r.state.people).toHaveLength(103);
  expect(r.state.people.every((p) => p.pr)).toBe(true);
});

t("login: wrong PIN rejected, right PIN accepted", async () => {
  await expect(caller(null).auth.login({ name: "Karim Hamed", pin: "0000" })).rejects.toThrow("Wrong PIN");
  karim = (await caller(null).auth.login({ name: "Karim Hamed", pin: pin("Karim Hamed") })).token;
  expect(karim.length).toBeGreaterThan(40);
});

t("no token / bad token → SESSION_EXPIRED", async () => {
  await expect(caller(null).state.get({})).rejects.toThrow("SESSION_EXPIRED");
  await expect(caller("nope").state.get({})).rejects.toThrow("SESSION_EXPIRED");
});

t("PRs never see PINs; admin does", async () => {
  const r = await caller(karim).state.get({});
  if (r.unchanged) throw new Error();
  expect(r.state.team.every((m) => m.pin === "")).toBe(true);
  expect(r.state.settings.adminPin).toBe("");
  const a = await caller(admin).state.get({});
  if (a.unchanged) throw new Error();
  expect(a.state.team[0]!.pin).toMatch(/^\d{4}$/);
});

t("poll is cheap when nothing changed", async () => {
  const r = await caller(karim).state.get({});
  const again = await caller(karim).state.get({ since: r.version });
  expect(again.unchanged).toBe(true);
});

t("a PR's tap is saved in Postgres and visible to everyone", async () => {
  const r = await caller(karim).state.get({});
  if (r.unchanged) throw new Error();
  const p = r.state.people.find((x) => x.pr === "Karim Hamed")!;
  const res = await caller(karim).state.act({ action: { type: "step", pid: p.id, step: "arrived", value: true } });
  expect(res.ok).toBe(true);
  const fresh = await caller(admin).state.get({});
  if (fresh.unchanged) throw new Error();
  const saved = fresh.state.people.find((x) => x.id === p.id)!;
  expect(typeof saved.arrived).toBe("number");
  expect(saved.updatedBy).toBe("Karim Hamed");
  expect(fresh.state.log.at(-1)!.text).toContain(p.name);
  expect(fresh.version).toBeGreaterThan(r.version);
});

t("phone keeps the leading zero", async () => {
  const r = await caller(karim).state.get({});
  if (r.unchanged) throw new Error();
  const p = r.state.people.find((x) => x.pr === "Karim Hamed")!;
  // PRs can't change phones any more – only the Team Leader
  expect((await caller(karim).state.act({ action: { type: "phone", pid: p.id, phone: "0100" } })).ok).toBe(false);
  await caller(admin).state.act({ action: { type: "phone", pid: p.id, phone: "+20 100 123 4567" } });
  const fresh = await caller(karim).state.get({});
  if (fresh.unchanged) throw new Error();
  expect(fresh.state.people.find((x) => x.id === p.id)!.phone).toBe("01001234567");
});

t("PR cannot tick another PR's speaker; their screen never gets other speakers' phones", async () => {
  const r = await caller(karim).state.get({});
  if (r.unchanged) throw new Error();
  const other = r.state.people.find((x) => x.pr && x.pr !== "Karim Hamed")!;
  const res = await caller(karim).state.act({ action: { type: "step", pid: other.id, step: "called", value: true } });
  expect(res.ok).toBe(false);
  expect(r.state.people.filter((x) => x.pr !== "Karim Hamed").every((x) => !x.phone && !x.alert)).toBe(true);
});

t("Team Leader edit and a PR tap on the same speaker at the same moment both survive", async () => {
  const r = await caller(admin).state.get({});
  if (r.unchanged) throw new Error();
  const p = r.state.people.find((x) => x.pr === "Karim Hamed" && !x.arrived)!;
  await Promise.all([
    caller(karim).state.act({ action: { type: "step", pid: p.id, step: "arrived", value: true } }),
    caller(admin).state.act({ action: { type: "savePerson", pid: p.id, sid: p.sid, name: p.name, role: p.role, alert: "test heads-up" } }),
  ]);
  const fresh = await caller(admin).state.get({});
  if (fresh.unchanged) throw new Error();
  const saved = fresh.state.people.find((x) => x.id === p.id)!;
  expect(saved.arrived).toBeTruthy();
  expect(saved.alert).toBe("test heads-up");
  expect(saved.phone).toBe(p.phone); // phone not sent → kept
});

t("manager: logs in, sees every speaker's phone, cannot change anything, never gets speakers", async () => {
  const add = await caller(admin).state.act({ action: { type: "saveMember", name: "Test Manager", phone: "", pin: "4321", role: "manager" } });
  expect(add.ok).toBe(true);
  const mgr = (await caller(null).auth.login({ name: "Test Manager", pin: "4321" })).token;
  const r = await caller(mgr).state.get({});
  if (r.unchanged) throw new Error();
  expect(r.me.manager).toBe(true);
  expect(r.me.admin).toBe(false);
  const full = await caller(admin).state.get({});
  if (full.unchanged) throw new Error();
  const withPhone = full.state.people.filter((p) => p.phone).length;
  expect(r.state.people.filter((p) => p.phone).length).toBe(withPhone); // nothing hidden from a manager
  expect(r.state.team.every((m) => !m.pin)).toBe(true); // but no PINs
  const p = r.state.people[0]!;
  for (const action of [{ type: "step", pid: p.id, step: "called", value: true }, { type: "incident", kind: "Other", note: "x" }, { type: "assign", pid: p.id, pr: "Karim Hamed" }])
    expect((await caller(mgr).state.act({ action })).ok).toBe(false);
  await caller(admin).state.act({ action: { type: "autoAssign", day: "2026-10-03" } });
  const after = await caller(admin).state.get({});
  if (after.unchanged) throw new Error();
  expect(after.state.people.some((x) => x.pr === "Test Manager")).toBe(false);
  await caller(admin).state.act({ action: { type: "removeMember", name: "Test Manager" } });
});

t("Team Leader can be picked as a speaker's PR by hand", async () => {
  const r = await caller(admin).state.get({});
  if (r.unchanged) throw new Error();
  const p = r.state.people[0]!;
  const res = await caller(admin).state.act({ action: { type: "assign", pid: p.id, pr: r.state.settings.adminName } });
  expect(res.ok).toBe(true);
  expect(res.result).toBe("OK");
});

t("PR cannot do admin actions", async () => {
  const r = await caller(karim).state.act({ action: { type: "autoAssign", day: "2026-10-03" } });
  expect(r.ok).toBe(false);
});

t("admin: reassign one speaker's PR", async () => {
  const r = await caller(admin).state.get({});
  if (r.unchanged) throw new Error();
  const p = r.state.people[3]!;
  const res = await caller(admin).state.act({ action: { type: "assign", pid: p.id, pr: "Fayrouz Yassin" } });
  expect(res.ok).toBe(true);
  const fresh = await caller(admin).state.get({});
  if (fresh.unchanged) throw new Error();
  expect(fresh.state.people.find((x) => x.id === p.id)!.pr).toBe("Fayrouz Yassin");
});

t("admin: new session + speaker, then cancel – all persisted", async () => {
  const res = await caller(admin).state.act({ action: { type: "saveSession", title: "Extra Talk", stype: "Keynote", day: "2026-10-04", startHHMM: "10:00", endHHMM: "10:30" } });
  if (!res.ok) throw new Error(res.error);
  const sid = (res.result as { sid: string }).sid;
  await caller(admin).state.act({ action: { type: "savePerson", sid, name: "Guest Speaker", role: "Speaker", pr: "Karim Hamed" } });
  let fresh = await caller(admin).state.get({});
  if (fresh.unchanged) throw new Error();
  expect(fresh.state.sessions.find((s) => s.id === sid)!.title).toBe("Extra Talk");
  expect(fresh.state.people.find((p) => p.sid === sid)!.pr).toBe("Karim Hamed");
  await caller(admin).state.act({ action: { type: "deleteSession", sid } });
  fresh = await caller(admin).state.get({});
  if (fresh.unchanged) throw new Error();
  expect(fresh.state.sessions.some((s) => s.id === sid)).toBe(false);
  expect(fresh.state.people.some((p) => p.sid === sid)).toBe(false);
});

t("admin: guest member can log in; removing them logs them out and frees their speakers", async () => {
  const add = await caller(admin).state.act({ action: { type: "saveMember", name: "Guest One", pin: "4321", guest: true } });
  expect(add.ok).toBe(true);
  expect(await caller(null).auth.loginNames()).toContain("Guest One");
  const g = (await caller(null).auth.login({ name: "Guest One", pin: "4321" })).token;
  const st = await caller(admin).state.get({});
  if (st.unchanged) throw new Error();
  const p = st.state.people[7]!;
  await caller(admin).state.act({ action: { type: "assign", pid: p.id, pr: "Guest One" } });
  await caller(admin).state.act({ action: { type: "removeMember", name: "Guest One" } });
  await expect(caller(g).state.get({})).rejects.toThrow("SESSION_EXPIRED");
  const fresh = await caller(admin).state.get({});
  if (fresh.unchanged) throw new Error();
  expect(fresh.state.people.find((x) => x.id === p.id)!.pr).toBe("");
  expect(fresh.state.team.map((m) => m.name)).not.toContain("Guest One");
});

t("team order is preserved after removing someone", async () => {
  const before = await caller(admin).state.get({});
  if (before.unchanged) throw new Error();
  const names = before.state.team.map((m) => m.name);
  expect(names[0]).toBe("Iten Khalil");
  expect(names.at(-1)).toBe("Fayrouz Yassin");
});

t("two PRs tapping at the same time don't overwrite each other", async () => {
  const seif = (await caller(null).auth.login({ name: "Seif Eldein Mahmoud", pin: pin("Seif Eldein Mahmoud") })).token;
  const r = await caller(admin).state.get({});
  if (r.unchanged) throw new Error();
  const a = r.state.people.find((x) => x.pr === "Karim Hamed" && !x.called)!;
  const b = r.state.people.find((x) => x.pr === "Seif Eldein Mahmoud" && !x.called)!;
  await Promise.all([
    caller(karim).state.act({ action: { type: "step", pid: a.id, step: "called", value: true } }),
    caller(seif).state.act({ action: { type: "step", pid: b.id, step: "called", value: true } }),
  ]);
  const fresh = await caller(admin).state.get({});
  if (fresh.unchanged) throw new Error();
  expect(fresh.state.people.find((x) => x.id === a.id)!.called).toBeTruthy();
  expect(fresh.state.people.find((x) => x.id === b.id)!.called).toBeTruthy();
});
