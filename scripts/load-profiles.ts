// Upsert speaker profiles (photo, bio, verified links) into Neon.
// Only social profiles (LinkedIn, X, Instagram, Facebook…) confirmed as the right person are stored – no websites
// (see speaker-profiles.json _evidence for how each was confirmed).
// Usage: bun scripts/load-profiles.ts
import { createDb } from "@great-hall-pr/db";
import { speakerProfiles } from "@great-hall-pr/db/schema/index";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL || /^DATABASE_URL=(.+)$/m.exec(readFileSync(new URL("../apps/web/.env", import.meta.url), "utf8"))![1]!;
const db = createDb({ DATABASE_URL: url });
const rows = (JSON.parse(readFileSync(new URL("./speaker-profiles.json", import.meta.url), "utf8")) as (Record<string, string> & { social?: { type: string; url: string }[] })[])
  .map(({ key, name, position, company, photo, bio, linkedin, sourceUrl, linkConfidence, social }) => ({ key: key!, name: name!, position: position ?? "", company: company ?? "", photo: photo ?? "", bio: bio ?? "", linkedin: linkedin ?? "", otherLink: "", sourceUrl: sourceUrl ?? "", linkConfidence: linkConfidence ?? "none", social: JSON.stringify(social ?? []) }));
await db.delete(speakerProfiles);
await db.insert(speakerProfiles).values(rows);
console.log(`Loaded ${rows.length} speaker profiles.`);
