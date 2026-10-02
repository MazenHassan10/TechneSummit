// Usage: pnpm --filter @great-hall-pr/api seed   (reads DATABASE_URL from apps/web/.env)
import { createDb } from "@great-hall-pr/db";
import { readFileSync } from "node:fs";

import { loadState, seedIfEmpty } from "./store";

const envFile = new URL("../../../apps/web/.env", import.meta.url);
const url = process.env.DATABASE_URL || /^DATABASE_URL=(.+)$/m.exec(readFileSync(envFile, "utf8"))?.[1]?.trim();
if (!url) throw new Error("DATABASE_URL missing");

const db = createDb({ DATABASE_URL: url });
const seeded = await seedIfEmpty(db);
console.log(seeded ? "Seeded the Great Hall agenda." : "Database already has data – nothing changed.");
const st = await loadState(db);
console.log("\nLogin PINs (the Team Leader can also see/change them in the Team tab):");
console.log("  Team Leader (admin):", st.settings.adminPin);
for (const m of st.team) console.log(`  ${m.name}: ${m.pin}`);
