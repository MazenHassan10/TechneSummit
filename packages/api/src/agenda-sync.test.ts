// Pure tests (no database). Fixtures are saved copies of the official sched pages from 2 Oct 2026.
import { apply, autoAssign, peopleOf, type State } from "@great-hall-pr/core";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { diffAgenda, ignoredTitle, parseSchedDay, type SchedSession } from "./agenda-sync";
import SEED from "./seed.json";

const fixture = (d: string) => readFileSync(new URL(`./__fixtures__/sched-${d}.html`, import.meta.url), "utf8");
const sched: SchedSession[] = [...parseSchedDay(fixture("2026-10-03"), "2026-10-03"), ...parseSchedDay(fixture("2026-10-04"), "2026-10-04")];
const fresh = () => { const s = structuredClone(SEED) as unknown as State; autoAssign(s, null, false); return s; };
const admin = { name: "TL", admin: true };

test("parses only Great Hall sessions with times, roles and people", () => {
  expect(sched.length).toBe(32);
  const will = sched.find((s) => s.title.startsWith("Will AI"))!;
  expect([will.start, will.end]).toEqual(["13:00", "13:45"]);
  expect(will.people.find((p) => p.name === "Nour El-Shaeri")!.role).toBe("Moderator");
  expect(will.people).toHaveLength(6);
});

test("opening segments, registration and breaks are ignored", () => {
  expect(ignoredTitle("Opening Remarks")).toBe(true);
  expect(ignoredTitle("BREAK")).toBe(true);
  expect(ignoredTitle("Celebrating 25 Years of Excellence – The Silver Jubilee of DETGD")).toBe(true);
  expect(ignoredTitle("Will AI Replace Founders or Create Better Ones?")).toBe(false);
});

test("original data vs official agenda = exactly the changes found by hand on 2 Oct", () => {
  const p = diffAgenda(fresh(), sched);
  const by = (k: string) => p.filter((x) => x.kind === k);
  expect(by("time")).toHaveLength(9);
  expect(by("rename").map((x) => x.summary)).toEqual([expect.stringContaining("Abdelrahman Sleem")]);
  expect(by("add_person").map((x) => x.summary)).toEqual([expect.stringContaining("Mohamed Mounir")]);
  expect(by("remove_person").map((x) => x.summary)).toEqual([expect.stringContaining("Walid Hassouna")]);
  expect(by("removed_session").map((x) => x.summary)).toEqual([expect.stringContaining("FSC")]);
  expect(by("role").length).toBe(24);
  expect(by("new_session")).toHaveLength(0); // opening segments ignored
  expect(new Set(p.map((x) => x.id)).size).toBe(p.length); // ids unique
});

test("applying every proposal leaves nothing to propose (idempotent)", () => {
  const st = fresh();
  for (const prop of diffAgenda(st, sched)) for (const a of prop.actions) expect(apply(st, a, admin, 0).ok).toBe(true);
  expect(diffAgenda(st, sched)).toHaveLength(0);
});

test("proposal ids are stable between checks (so each change alerts once)", () => {
  expect(diffAgenda(fresh(), sched).map((x) => x.id)).toEqual(diffAgenda(fresh(), sched).map((x) => x.id));
});

test("a brand-new Great Hall session becomes a new_session proposal", () => {
  const st = fresh();
  for (const prop of diffAgenda(st, sched)) for (const a of prop.actions) apply(st, a, admin, 0);
  const extra: SchedSession = { day: "2026-10-04", start: "21:00", end: "21:30", title: "Surprise Closing Chat", people: [{ name: "New Person", role: "Speaker" }] };
  const p = diffAgenda(st, [...sched, extra]);
  expect(p).toHaveLength(1);
  expect(p[0]!.kind).toBe("new_session");
  expect(p[0]!.summary).toContain("9:00 PM");
});

test("removing a speaker who is already being tracked carries a warning", () => {
  const st = fresh();
  for (const prop of diffAgenda(st, sched)) for (const a of prop.actions) apply(st, a, admin, 0);
  const s = st.sessions.find((x) => x.title.startsWith("Will AI"))!;
  const victim = peopleOf(st, s.id)[0]!;
  victim.arrived = 123;
  const cut = sched.map((x) => (x.title === s.title ? { ...x, people: x.people.filter((pp) => pp.name !== victim.name) } : x));
  const p = diffAgenda(st, cut);
  expect(p).toHaveLength(1);
  expect(p[0]!.warning).toContain("already");
});
