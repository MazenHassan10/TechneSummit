// Fills in Agenda profiles (official photo, title, company, bio) for speakers that were added after the
// first import – e.g. after the Team Leader approves "X added to session". Needs the full sched pages,
// so it runs from the Team Leader's Mac (watch-local.ts); never removes or overwrites existing profiles.
import { normName, type State } from "@great-hall-pr/core";
import type { Database } from "@great-hall-pr/db";
import { speakerProfiles } from "@great-hall-pr/db/schema/index";
import { eq } from "drizzle-orm";

import type { SchedSession } from "./agenda-sync";

const decode = (s: string) =>
  s.replace(/<br\s*\/?>|<\/p>/gi, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;/g, "’")
    .replace(/&nbsp;/g, " ").replace(/&ndash;/g, "–").replace(/&mdash;/g, "—").replace(/\s+/g, " ").trim();

/** Parses an official sched profile page. */
export function parseSchedProfile(html: string) {
  const g = (re: RegExp) => re.exec(html)?.[1] ?? "";
  let photo = g(/id="myavatar"[^>]*?src="([^"]+)"/) || g(/<img src="([^"]+)"[^>]*id="myavatar"/);
  if (photo.startsWith("//")) photo = "https:" + photo;
  if (/avatar-empty/.test(photo)) photo = "";
  return {
    photo,
    company: decode(g(/user-profile__company">([\s\S]*?)<\/div>/)),
    position: decode(g(/user-profile__position">([\s\S]*?)<\/div>/)),
    bio: decode(g(/user-profile__about-content">([\s\S]*?)<\/div>\s*<\/div>/)),
  };
}

export type OfficialProfile = { name: string; position: string; company: string; photo: string; bio: string; sourceUrl: string };

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

/** Downloads + parses one official profile page (needs a normal device – the site blocks cloud servers). */
export async function fetchSchedProfile(url: string, fetchFn: typeof fetch = fetch): Promise<OfficialProfile | null> {
  const res = await fetchFn(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const html = await res.text();
  const pr = parseSchedProfile(html);
  const name = decode(/user-profile__name">([\s\S]*?)<\/h2>/.exec(html)?.[1] ?? "");
  if (!name && !pr.photo && !pr.position) return null; // bot-check page
  return { name, ...pr, bio: shortBio(pr.bio), sourceUrl: url };
}

/** Short bio from the official one: whole sentences, about 60 words. */
export function shortBio(bio: string, maxWords = 60) {
  // don't end a sentence on titles or initials ("Mr. Salah", "Osama M. Hijji", "Dr.")
  const safe = bio.replace(/\b(Mr|Mrs|Ms|Dr|Eng|Prof|St|Jr|Sr|Co|Inc|Ltd|vs|e\.g|i\.e|[A-Z])\.(?=\s)/g, "$1\u2024");
  const sentences = (safe.match(/[^.!?]+[.!?]+/g) ?? [safe]).map((x) => x.replace(/\u2024/g, "."));
  if (!safe.match(/[.!?]/)) return bio.trim();
  let out = "";
  for (const sn of sentences) {
    if ((out + sn).split(/\s+/).length > maxWords && out) break;
    out += sn;
  }
  return out.trim();
}

/**
 * Keeps Agenda profiles in line with the official site (runs on the Mac with each full check):
 * - speakers without a profile get one
 * - if a speaker's photo or "title, company" on the agenda page changed, their profile is refreshed
 * Social links (LinkedIn etc.) are never touched.
 */
export async function syncProfiles(db: Database, state: State, sched: SchedSession[], fetchFn: typeof fetch = fetch) {
  const rows = await db.select().from(speakerProfiles);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const seen = new Map<string, SchedSession["people"][number]>();
  for (const s of sched) for (const p of s.people) seen.set(normName(p.name), p);
  const ours = new Set(state.people.map((p) => normName(p.name)));
  const photoPath = (u: string) => u.replace(/^https?:/, "").split("?")[0];
  const added: string[] = [];
  const updated: string[] = [];
  for (const [key, sp] of seen) {
    if (!ours.has(key) || !sp.profileUrl) continue;
    const cur = byKey.get(key);
    const changed = cur && ((sp.photo && photoPath(sp.photo) !== photoPath(cur.photo)) ||
      (sp.headline && normName(sp.headline) !== normName([cur.position, cur.company].filter(Boolean).join(", "))));
    if (cur && !changed) continue;
    const prof = await fetchSchedProfile(sp.profileUrl, fetchFn).catch(() => null);
    if (!prof) continue;
    const fields = { name: prof.name || sp.name, position: prof.position, company: prof.company, photo: prof.photo, bio: prof.bio, sourceUrl: prof.sourceUrl };
    if (cur) { await db.update(speakerProfiles).set(fields).where(eq(speakerProfiles.key, key)); updated.push(fields.name); }
    else { await db.insert(speakerProfiles).values({ key, ...fields, linkedin: "", otherLink: "", linkConfidence: "none", social: "[]" }).onConflictDoNothing(); added.push(fields.name); }
  }
  return { added, updated };
}
