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
import { ExternalLink, Globe, MapPin, Search } from "lucide-react";
import { createContext, useContext, useMemo, useState } from "react";

import { trpc } from "@/utils/trpc";

import { hm, shortName } from "./format";
import { useApp } from "./store";
import { CallLink, WhatsAppLink } from "./ui";
import { DaySwitch } from "./views";

type Profile = {
  key: string; name: string; position: string; company: string; photo: string; bio: string;
  linkedin: string; otherLink: string; sourceUrl: string; linkConfidence: string;
};

// lucide no longer ships brand logos – small inline LinkedIn mark
const LinkedInIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={cn("size-4", className)} aria-hidden>
    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
  </svg>
);

const initials = (n: string) => n.replace(/^(Eng\.|Dr\.|H\.E\.?|Mr\.|Ms\.)\s*/i, "").split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();

export function useProfiles() {
  const q = useQuery({ ...trpc.speakers.list.queryOptions(), staleTime: 10 * 60_000 });
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
                            <span className="min-w-0 leading-tight">
                              <span className="block font-medium">{p.name}</span>
                              {pr && (pr.position || pr.company) && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{[pr.position, pr.company].filter(Boolean).join(", ")}</span>}
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
                {prof?.linkedin && <LinkedInIcon className="text-[#0a66c2]" />}
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
      {!people.length && <p className="py-6 text-center text-sm text-muted-foreground">No speakers found.</p>}
    </>
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
            {prof?.linkedin && <a href={prof.linkedin} target="_blank" rel="noopener" className={cn(buttonVariants({ variant: "outline" }), "text-[#0a66c2]")}><LinkedInIcon />LinkedIn</a>}
            {prof?.otherLink && <a href={prof.otherLink} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}><Globe />Website</a>}
            {prof?.sourceUrl && <a href={prof.sourceUrl} target="_blank" rel="noopener" className={buttonVariants({ variant: "ghost" })}><ExternalLink />Official profile</a>}
          </div>
          {prof && !prof.linkedin && <p className="text-center text-xs text-muted-foreground">LinkedIn not confirmed – only verified profiles are linked.</p>}
          {prof?.linkedin && prof.linkConfidence === "medium" && <p className="text-center text-xs text-muted-foreground">LinkedIn matched by name and role (company may have changed).</p>}
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

