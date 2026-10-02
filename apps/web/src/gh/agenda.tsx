"use client";

import * as Core from "@great-hall-pr/core";
import type { Session } from "@great-hall-pr/core";
import { Avatar, AvatarFallback, AvatarImage } from "@great-hall-pr/ui/components/avatar";
import { Badge } from "@great-hall-pr/ui/components/badge";
import { buttonVariants } from "@great-hall-pr/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@great-hall-pr/ui/components/card";
import { Input } from "@great-hall-pr/ui/components/input";
import { Separator } from "@great-hall-pr/ui/components/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@great-hall-pr/ui/components/sheet";
import { Tabs, TabsList, TabsTrigger } from "@great-hall-pr/ui/components/tabs";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPin, Pencil, Search } from "lucide-react";
import { Button } from "@great-hall-pr/ui/components/button";
import { Textarea } from "@great-hall-pr/ui/components/textarea";
import { toast } from "sonner";
import { createContext, useContext, useMemo, useState } from "react";

import { queryClient, trpc, trpcClient } from "@/utils/trpc";

import { hm, shortName } from "./format";
import { useApp } from "./store";
import { CallLink, HeadsUp, WhatsAppLink } from "./ui";
import { DaySwitch } from "./views";

type Profile = {
  key: string; name: string; position: string; company: string; photo: string; bio: string;
  linkedin: string; otherLink: string; sourceUrl: string; linkConfidence: string; social: string;
};
type Social = { type: string; url: string };

/** Verified social profiles only (no websites). */
function socials(p?: Profile): Social[] {
  if (!p) return [];
  let list: Social[] = [];
  try { list = JSON.parse(p.social || "[]") as Social[]; } catch {}
  if (p.linkedin && !list.some((x) => x.type === "linkedin")) list.unshift({ type: "linkedin", url: p.linkedin });
  const order = ["linkedin", "x", "instagram", "facebook", "youtube", "tiktok", "behance"];
  return list.filter((x) => order.includes(x.type) && /^https:\/\//.test(x.url)).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}


const BRAND: Record<string, { label: string; color: string; path: string }> = {
  linkedin: { label: "LinkedIn", color: "#0a66c2", path: "M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" },
  x: { label: "X", color: "#000000", path: "M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.4l-5.8-7.58-6.63 7.58H.48l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.48 3.24H4.3l13.31 17.41z" },
  instagram: { label: "Instagram", color: "#d62976", path: "M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z" },
  facebook: { label: "Facebook", color: "#1877f2", path: "M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" },
  youtube: { label: "YouTube", color: "#ff0000", path: "M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z" },
  tiktok: { label: "TikTok", color: "#000000", path: "M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" },
  behance: { label: "Behance", color: "#1769ff", path: "M7.8 11.27c.83-.4 1.27-1.04 1.27-2.03 0-1.94-1.45-2.42-3.12-2.42H1.36v9.75h4.72c1.77 0 3.43-.85 3.43-2.83 0-1.22-.58-2.13-1.71-2.47zM3.5 8.48h2c.78 0 1.47.22 1.47 1.12 0 .84-.54 1.17-1.31 1.17H3.5V8.48zm2.29 6.43H3.5v-2.68h2.33c.94 0 1.54.39 1.54 1.39 0 .99-.71 1.29-1.58 1.29zM15.65 7.76h4.62V9.1h-4.62V7.76zm1.92 1.98c-2.3 0-3.88 1.73-3.88 4.01 0 2.36 1.48 3.98 3.88 3.98 1.81 0 2.98-.81 3.55-2.55h-1.84c-.2.65-1.01.99-1.64.99-1.22 0-1.86-.71-1.86-1.93h5.47c.09-2.43-1.27-4.5-3.68-4.5zm-1.78 3.12c.07-.99.73-1.61 1.72-1.61 1.04 0 1.56.61 1.65 1.61h-3.37z" },
};
function BrandIcon({ type, className }: { type: string; className?: string }) {
  const b = BRAND[type];
  if (!b) return null;
  return <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-4", className)} style={{ color: b.color }} aria-hidden><path d={b.path} /></svg>;
}

const initials = (n: string) => n.replace(/^(Eng\.|Dr\.|H\.E\.?|Mr\.|Ms\.)\s*/i, "").split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();

export function useProfiles() {
  const q = useQuery({ ...trpc.speakers.list.queryOptions(), staleTime: 2 * 60_000, refetchInterval: 5 * 60_000 });
  return useMemo(() => {
    const map = new Map<string, Profile>();
    for (const p of (q.data ?? []) as Profile[]) map.set(p.key, p);
    return { map, loading: q.isLoading, get: (name: string) => map.get(Core.normName(name)) };
  }, [q.data, q.isLoading]);
}

const OpenCtx = createContext<(name: string) => void>(() => {});

export function SpeakerAvatar({ name, photo, size = "default", className }: { name: string; photo?: string; size?: "sm" | "default" | "lg"; className?: string }) {
  return (
    <Avatar size={size} className={className}>
      {photo && <AvatarImage src={photo} alt={name} />}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

export function AgendaView() {
  const { state } = useApp();
  const profiles = useProfiles();
  const [mode, setMode] = useState("timeline");
  const [open, setOpen] = useState<string | null>(null);
  if (!state) return null;
  return (
    <OpenCtx.Provider value={setOpen}>
      <DaySwitch />
      <Tabs value={mode} onValueChange={(v) => setMode(String(v))} className="mb-3">
        <TabsList variant="line"><TabsTrigger value="timeline">Timeline</TabsTrigger><TabsTrigger value="speakers">Speakers</TabsTrigger></TabsList>
      </Tabs>
      {mode === "timeline" ? <Timeline profiles={profiles} /> : <Directory profiles={profiles} />}
      <ProfileSheet name={open} profiles={profiles} onClose={() => setOpen(null)} />
    </OpenCtx.Provider>
  );
}

function Timeline({ profiles }: { profiles: ReturnType<typeof useProfiles> }) {
  const { state, day, now } = useApp();
  const openProfile = useContext(OpenCtx);
  if (!state) return null;
  const t = now();
  const list = state.sessions.filter((s) => s.day === day).sort((a, b) => a.start - b.start);
  const nextId = list.find((s) => s.start > t)?.id;
  return (
    <ol className="relative ml-2 border-l pl-5">
      {list.map((s: Session) => {
        const live = t >= s.start && t < s.end;
        const past = t >= s.end;
        const ppl = Core.peopleOf(state, s.id);
        const mods = ppl.filter((p) => p.role === "Moderator");
        const spk = ppl.filter((p) => p.role !== "Moderator");
        return (
          <li key={s.id} className={cn("relative mb-4", past && "opacity-60")}>
            <span className={cn("absolute top-5 -left-[27px] size-3 rounded-full border-2 border-background", live ? "bg-orange" : past ? "bg-muted-foreground/40" : "bg-primary")} />
            <Card size="sm">
              <CardHeader>
                <CardDescription className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums text-primary">{hm(s.start)} – {hm(s.end)}</span>
                  <Badge variant="outline">{s.type}</Badge>
                  {live && <Badge>Live now</Badge>}
                  {s.id === nextId && <Badge variant="secondary">Up next</Badge>}
                </CardDescription>
                <CardTitle className="leading-snug">{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[["Moderator", mods], ["Speakers", spk]].map(([label, group]) => (group as typeof ppl).length > 0 && (
                  <div key={label as string}>
                    <p className="mb-1.5 text-xs text-muted-foreground">{label as string}</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {(group as typeof ppl).map((p) => {
                        const pr = profiles.get(p.name);
                        return (
                          <button key={p.id} type="button" onClick={() => openProfile(p.name)}
                            className="flex items-center gap-3 rounded-xl border bg-background p-2 text-left transition-colors hover:bg-muted">
                            <SpeakerAvatar name={p.name} photo={pr?.photo} className="size-16" />
                            <span className="min-w-0 flex-1 leading-tight">
                              <span className="block font-medium">{p.name}</span>
                              {pr && (pr.position || pr.company) && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{[pr.position, pr.company].filter(Boolean).join(", ")}</span>}
                              <HeadsUp text={p.alert} compact className="mt-1.5" />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {!ppl.length && <p className="text-sm text-muted-foreground">Speakers to be announced.</p>}
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" />Stage 01 · The Great Hall</p>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

function Directory({ profiles }: { profiles: ReturnType<typeof useProfiles> }) {
  const { state, day } = useApp();
  const openProfile = useContext(OpenCtx);
  const [q, setQ] = useState("");
  if (!state) return null;
  const seen = new Set<string>();
  const people = state.people
    .filter((p) => Core.sessionById(state, p.sid)?.day === day)
    .filter((p) => { const k = Core.normName(p.name); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((p) => ({ p, prof: profiles.get(p.name) }))
    .filter(({ p, prof }) => !q || `${p.name} ${prof?.company ?? ""} ${prof?.position ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.p.name.localeCompare(b.p.name));
  return (
    <>
      <div className="relative mb-3">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or company" className="pl-8" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {people.map(({ p, prof }) => (
          <button key={p.id} type="button" onClick={() => openProfile(p.name)} className="text-left">
            <Card size="sm" className="h-full transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center gap-3">
                <SpeakerAvatar name={p.name} photo={prof?.photo} className="size-16" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{prof ? [prof.position, prof.company].filter(Boolean).join(", ") : p.role}</div>
                </div>
                <span className="flex gap-1">{socials(prof).slice(0, 3).map((x) => <BrandIcon key={x.type} type={x.type} />)}</span>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
      {!people.length && <p className="py-6 text-center text-sm text-muted-foreground">No speakers found.</p>}
    </>
  );
}

function EditLinks({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(socials(profile).map((x) => x.url).join("\n"));
  const [busy, setBusy] = useState(false);
  if (!open) return <div className="flex justify-center"><Button variant="ghost" size="sm" onClick={() => setOpen(true)}><Pencil />Edit links</Button></div>;
  const save = async () => {
    setBusy(true);
    try {
      const r = await trpcClient.speakers.setSocial.mutate({ key: profile.key, urls: text.split(/\s+/).filter(Boolean) });
      if (!r.ok) toast.error(r.error);
      else { toast.success("Links saved"); setOpen(false); await queryClient.invalidateQueries({ queryKey: trpc.speakers.list.queryKey() }); }
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">One link per line – LinkedIn, X, Instagram, Facebook, YouTube, TikTok or Behance. Only add profiles you're sure are this person.</p>
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="https://www.linkedin.com/in/…" />
      <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={save}>Save links</Button><Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
    </div>
  );
}

function ProfileSheet({ name, profiles, onClose }: { name: string | null; profiles: ReturnType<typeof useProfiles>; onClose: () => void }) {
  const { state, me } = useApp();
  if (!state || !me || !name) return null;
  const prof = profiles.get(name);
  const entries = state.people.filter((p) => Core.normName(p.name) === Core.normName(name));
  const sessions = entries.map((p) => ({ p, s: Core.sessionById(state, p.sid)! })).filter((x) => x.s).sort((a, b) => a.s.start - b.s.start);
  const phone = entries.find((p) => p.phone)?.phone;
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto sm:mx-auto sm:max-w-xl">
        <SheetHeader className="items-center text-center">
          <Avatar className="size-40">{prof?.photo && <AvatarImage src={prof.photo} alt={name} />}<AvatarFallback className="text-4xl">{initials(name)}</AvatarFallback></Avatar>
          <SheetTitle className="text-lg">{name}</SheetTitle>
          <SheetDescription>{prof ? [prof.position, prof.company].filter(Boolean).join(" · ") : ""}</SheetDescription>
          <div className="flex flex-wrap justify-center gap-1.5">{[...new Set(entries.map((p) => p.role))].map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}</div>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          <div className="flex flex-wrap justify-center gap-2">
            {socials(prof).map((x) => (
              <a key={x.url} href={x.url} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}><BrandIcon type={x.type} />{BRAND[x.type]?.label}</a>
            ))}
            {prof?.sourceUrl && <a href={prof.sourceUrl} target="_blank" rel="noopener" className={buttonVariants({ variant: "ghost" })}><ExternalLink />Official profile</a>}
          </div>
          {prof && !socials(prof).length && <p className="text-center text-xs text-muted-foreground">No social profile confirmed yet – only profiles we verified are linked.</p>}
          {me.admin && prof && <EditLinks profile={prof} />}
          <Separator />
          <div>
            <h3 className="mb-1.5 text-sm font-semibold">About</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{prof?.bio || "No bio available yet."}</p>
          </div>
          <Separator />
          <div>
            <h3 className="mb-2 text-sm font-semibold">In the Great Hall</h3>
            <div className="space-y-2">
              {sessions.map(({ p, s }) => {
                const pr = Core.prOf(state, p);
                return (
                  <div key={p.id} className="flex items-start gap-3 rounded-lg border p-3">
                    <span className="w-24 shrink-0 text-xs font-medium tabular-nums text-primary">{s.day === state.settings.day1 ? "Sat" : "Sun"} {hm(s.start)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug">{s.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{p.role}<Badge variant={pr === me.name ? "default" : "secondary"}>PR · {pr === me.name ? "You" : pr ? shortName(pr) : "none"}</Badge></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {[...new Set(entries.map((p) => p.alert).filter(Boolean))].map((a) => <HeadsUp key={a} text={a} />)}
          {phone && (
            <>
              <Separator />
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Event contact number</span>
                <div className="flex gap-1.5"><CallLink phone={phone} /><WhatsAppLink phone={phone} /></div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

