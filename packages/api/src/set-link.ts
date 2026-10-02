// Add / replace one social link for a speaker (same rules as "Edit links" in the app) and keep
// scripts/speaker-profiles.json in sync.  Usage (from packages/api):
//   bun src/set-link.ts "Speaker Name" "https://www.linkedin.com/in/…"
import { normName } from "@great-hall-pr/core";
import { createDb } from "@great-hall-pr/db";
import { speakerProfiles } from "@great-hall-pr/db/schema/index";
import { eq } from "drizzle-orm";
import { readFileSync, writeFileSync } from "node:fs";

import { cleanSocialUrl, socialType } from "./social";

const [name, raw] = process.argv.slice(2);
if (!name || !raw) throw new Error('usage: bun src/set-link.ts "Name" "url"');
const type = socialType(raw);
if (!type) throw new Error(`Not a social profile link: ${raw}`);
const url = cleanSocialUrl(raw);
const key = normName(name);
const db = createDb({ DATABASE_URL: process.env.DATABASE_URL || /^DATABASE_URL=(.+)$/m.exec(readFileSync(new URL("../../../apps/web/.env", import.meta.url), "utf8"))![1]! });
const [row] = await db.select().from(speakerProfiles).where(eq(speakerProfiles.key, key));
if (!row) throw new Error(`No speaker profile for "${name}"`);
const social = [{ type, url }, ...(JSON.parse(row.social) as { type: string; url: string }[]).filter((x) => x.type !== type)];
const linkedin = social.find((x) => x.type === "linkedin")?.url ?? "";
await db.update(speakerProfiles).set({ social: JSON.stringify(social), linkedin, linkConfidence: "high" }).where(eq(speakerProfiles.key, key));

const file = new URL("../../../scripts/speaker-profiles.json", import.meta.url);
const rows = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>[];
const r = rows.find((x) => x.key === key);
if (r) { r.social = social; r.linkedin = linkedin; r.linkConfidence = "high"; r._evidence = `${r._evidence ?? ""} | ${type} provided by Team Leader ${new Date().toISOString().slice(0, 10)}`; writeFileSync(file, JSON.stringify(rows, null, 1)); }
console.log(`${row.name} (${row.position} @ ${row.company}) | before: ${row.social} | now: ${JSON.stringify(social)}`);
