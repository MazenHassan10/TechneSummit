"use client";

import { Badge } from "@great-hall-pr/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@great-hall-pr/ui/components/card";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { trpc } from "@/utils/trpc";

import { SpeakerAvatar, t12, useProfiles, venueShort } from "./agenda";
import { dayOf } from "./format";
import { useApp } from "./store";
import { useModal } from "./ui";

type SP = { name: string; role: string; headline?: string; photo?: string };
type SS = { id: string; day: string; start: string; end: string; title: string; venue: string; track: string; format: string; description?: string; people: SP[] };

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const stageNo = (v: string) => Number(/Stage (\d+)/.exec(v)?.[1] ?? 99);
/** "(ALX) Stage 05: Multipurpose Room - Workshops A" → "Workshops A" style short tab label */
const tabLabel = (v: string) => {
  const name = v.replace(/^\([A-Z]+\)\s*/, "").replace(/^Stage \d+:\s*/, "");
  return (/Workshops [A-Z]/.exec(name)?.[0] ?? name).replace(/^The /, "");
};

/** Every stage of the summit, one tab per stage – from the official agenda (refreshed by the Mac watcher every 30 min). */
export function AllStages() {
  const { now } = useApp();
  const modal = useModal();
  const profiles = useProfiles();
  const q = useQuery({ ...trpc.speakers.summit.queryOptions(), staleTime: 5 * 60_000, refetchInterval: 10 * 60_000 });
  const all = (q.data ?? []) as SS[];
  const days = useMemo(() => [...new Set(all.map((s) => s.day))].sort(), [all]);
  const today = dayOf(now());
  const [day, setDay] = useState("");
  const d = day || (days.includes(today) ? today : days[0] ?? "");
  const ofDay = all.filter((s) => s.day === d && !/^(break|networking and refreshment break)$/i.test(s.title.trim()));
  const stages = [...new Set(ofDay.map((s) => s.venue))].sort((a, b) => stageNo(a) - stageNo(b));
  const [stage, setStage] = useState("");
  const st = stages.includes(stage) ? stage : stages[0] ?? "";
  useEffect(() => { if (stage && !stages.includes(stage)) setStage(""); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = ofDay.filter((s) => s.venue === st).sort((a, b) => a.start.localeCompare(b.start));
  const nowHM = new Date(now()).toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hour12: false });

  if (q.isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading the full summit agenda…</p>;
  if (!all.length) return <p className="py-8 text-center text-sm text-muted-foreground">The full agenda hasn't been loaded yet.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {days.map((x) => (
          <button key={x} type="button" onClick={() => { setDay(x); setStage(""); }}
            className={cn("rounded-full border px-3 py-1.5 text-sm font-medium", x === d ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
            {dayLabel(x)}{x === today ? " · today" : ""}
          </button>
        ))}
      </div>
      {/* one tab per stage – scrolls sideways on phones */}
      <div className="-mx-3 overflow-x-auto px-3 pb-1">
        <div className="flex w-max gap-1.5">
          {stages.map((v) => (
            <button key={v} type="button" onClick={() => setStage(v)}
              className={cn("flex flex-col items-start rounded-lg border px-3 py-1.5 text-left", v === st ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground")}>
              <span className="text-[10px] font-medium tracking-wide uppercase">Stage {String(stageNo(v)).padStart(2, "0")}</span>
              <span className="text-sm font-semibold whitespace-nowrap">{tabLabel(v)}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{venueShort(st)} · {list.length} session{list.length === 1 ? "" : "s"} · from the official agenda</p>
      {list.map((s) => {
        const live = d === today && nowHM >= s.start && nowHM < s.end;
        const past = d < today || (d === today && nowHM >= s.end);
        const workshop = /workshop/i.test(s.format);
        const mods = s.people.filter((p) => p.role === "Moderator");
        const spk = s.people.filter((p) => p.role !== "Moderator");
        return (
          <Card key={s.id} size="sm" className={cn(past && "opacity-60", live && "ring-2 ring-orange")}>
            <CardHeader>
              <CardDescription className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium tabular-nums text-primary">{t12(s.start)} – {t12(s.end)}</span>
                {s.format && <Badge variant={workshop ? "default" : "outline"}>{s.format}</Badge>}
                {s.track && s.track !== s.format && <Badge variant="secondary">{s.track}</Badge>}
                {live && <Badge className="bg-orange">Live now</Badge>}
              </CardDescription>
              <CardTitle className="leading-snug">{s.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {s.description && <Desc text={s.description} />}
              {[["Moderator", mods], ["Speakers", spk]].map(([label, group]) => (group as SP[]).length > 0 && (
                <div key={label as string}>
                  <p className="mb-1.5 text-xs text-muted-foreground">{label as string}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(group as SP[]).map((p) => (
                      <button key={p.name} type="button" onClick={() => modal.open({ kind: "profile", name: p.name })}
                        className="flex items-center gap-3 rounded-xl border bg-background p-2 text-left transition-colors hover:bg-muted">
                        <SpeakerAvatar name={p.name} photo={profiles.get(p.name)?.photo || p.photo} className="size-14" />
                        <span className="min-w-0 leading-tight">
                          <span className="block font-medium">{p.name}</span>
                          {p.headline && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{p.headline}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Session topic – 3 lines, tap to read all. */
function Desc({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" onClick={() => setOpen(!open)} className="block w-full text-left">
      <p className={cn("text-sm whitespace-pre-line text-muted-foreground", !open && "line-clamp-3")}>{text}</p>
      {text.length > 180 && <span className="text-xs font-medium text-primary">{open ? "Show less" : "Read more"}</span>}
    </button>
  );
}
