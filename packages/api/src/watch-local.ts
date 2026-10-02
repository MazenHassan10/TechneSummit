// Full official-agenda check (incl. speaker changes) run from a normal computer, because the official
// site blocks cloud servers. Installed on the Team Leader's Mac as a LaunchAgent (every 30 min while awake).
// Usage (from packages/api):  bun src/watch-local.ts
import { createDb } from "@great-hall-pr/db";
import { readFileSync } from "node:fs";

import { runAgendaCheck } from "./agenda-store";
import { fetchSchedGreatHall } from "./agenda-sync";
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
console.log(new Date().toISOString(), JSON.stringify({ ...result, profiles }));
if (!result.ok) process.exitCode = 1;
