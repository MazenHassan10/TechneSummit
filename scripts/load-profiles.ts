// Upsert speaker profiles (photo, bio, verified links) into Neon.
// Only LinkedIn links where name AND company were confirmed are stored (see speaker-profiles.json _evidence).
// Usage: bun scripts/load-profiles.ts
import { createDb } from "@great-hall-pr/db";
import { speakerProfiles } from "@great-hall-pr/db/schema/index";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL || /^DATABASE_URL=(.+)$/m.exec(readFileSync(new URL("../apps/web/.env", import.meta.url), "utf8"))![1]!;
const db = createDb({ DATABASE_URL: url });
const rows = (JSON.parse(readFileSync(new URL("./speaker-profiles.json", import.meta.url), "utf8")) as Record<string, string>[])
  .map(({ key, name, position, company, photo, bio, linkedin, otherLink, sourceUrl, linkConfidence }) => ({ key: key!, name: name!, position: position ?? "", company: company ?? "", photo: photo ?? "", bio: bio ?? "", linkedin: linkedin ?? "", otherLink: otherLink ?? "", sourceUrl: sourceUrl ?? "", linkConfidence: linkConfidence ?? "none" }));
await db.delete(speakerProfiles);
await db.insert(speakerProfiles).values(rows);
console.log(`Loaded ${rows.length} speaker profiles.`);
