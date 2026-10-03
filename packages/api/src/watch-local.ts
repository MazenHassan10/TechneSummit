// Full official-agenda check (incl. speaker changes) run from a normal computer, because the official
// site blocks cloud servers. Installed on the Team Leader's Mac as a LaunchAgent (every 30 min while awake).
// Usage (from packages/api):  bun src/watch-local.ts
import { createDb } from "@great-hall-pr/db";
import { readFileSync } from "node:fs";

import { runAgendaCheck } from "./agenda-store";
import { fetchSchedGreatHall, fetchSchedSummit } from "./agenda-sync";
import { saveSummit } from "./summit-store";
import { syncProfiles } from "./agenda-profiles";
import { loadState } from "./store";

const env = readFileSync(new URL("../../../apps/web/.env", import.meta.url), "utf8");
const url = process.env.DATABASE_URL || /^DATABASE_URL=(.+)$/m.exec(env)?.[1]?.trim();
if (!url) throw new Error("DATABASE_URL missing");
const db = createDb({ DATABASE_URL: url });
const state = await loadState(db);
const got = await fetchSchedGreatHall([state.settings.day1, state.settings.day2]);
const result = await runAgendaCheck(db, { sched: got.sessions, mode: got.mode });
const profiles = got.mode === "full" ? await syncProfiles(db, await loadState(db), got.sessions) : null;
// whole-summit copy for speaker profiles (other stages + workshops); never blocks the Great Hall check
let summit: unknown = null;
try {
  const d2 = state.settings.day2;
  const d3 = new Date(Date.parse(`${d2}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10); // closing day
  summit = await saveSummit(db, await fetchSchedSummit([state.settings.day1, d2, d3]));
} catch (e) { summit = { error: String(e).slice(0, 200) }; }
console.log(new Date().toISOString(), JSON.stringify({ ...result, profiles, summit }));
if (!result.ok) process.exitCode = 1;
