// Fills in Agenda profiles (official photo, title, company, bio) for speakers that were added after the
// first import – e.g. after the Team Leader approves "X added to session". Needs the full sched pages,
// so it runs from the Team Leader's Mac (watch-local.ts); never removes or overwrites existing profiles.
import { normName, type State } from "@great-hall-pr/core";
import type { Database } from "@great-hall-pr/db";
import { speakerProfiles } from "@great-hall-pr/db/schema/index";

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

/** Short bio from the official one: whole sentences, about 60 words. */
export function shortBio(bio: string, maxWords = 60) {
  const sentences = bio.match(/[^.!?]+[.!?]+/g) ?? [bio];
  let out = "";
  for (const sn of sentences) {
    if ((out + sn).split(/\s+/).length > maxWords && out) break;
    out += sn;
  }
  return out.trim();
}

export async function fillMissingProfiles(db: Database, state: State, sched: SchedSession[], fetchFn: typeof fetch = fetch) {
  const have = new Set((await db.select({ key: speakerProfiles.key }).from(speakerProfiles)).map((r) => r.key));
  const links = new Map<string, string>();
  for (const s of sched) for (const p of s.people) if (p.profileUrl) links.set(normName(p.name), p.profileUrl);
  const added: string[] = [];
  for (const person of state.people) {
    const key = normName(person.name);
    if (have.has(key) || /^TBC/i.test(person.name)) continue;
    have.add(key);
    const url = links.get(key);
    if (!url) continue;
    try {
      const res = await fetchFn(url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36" } });
      if (!res.ok) continue;
      const pr = parseSchedProfile(await res.text());
      await db.insert(speakerProfiles).values({
        key, name: person.name, position: pr.position, company: pr.company, photo: pr.photo, bio: shortBio(pr.bio),
        sourceUrl: url, linkedin: "", otherLink: "", linkConfidence: "none", social: "[]",
      }).onConflictDoNothing();
      added.push(person.name);
    } catch { /* try again next run */ }
  }
  return added;
}
