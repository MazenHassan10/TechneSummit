"use client";

import * as Core from "@great-hall-pr/core";
import type { Person, Session } from "@great-hall-pr/core";
import { Badge } from "@great-hall-pr/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@great-hall-pr/ui/components/card";
import { Tabs, TabsList, TabsTrigger } from "@great-hall-pr/ui/components/tabs";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { NotebookPen } from "lucide-react";
import { useState } from "react";

import { SpeakerAvatar, useProfiles } from "./agenda";
import { hm } from "./format";
import { useApp } from "./store";
import { CallLink, Dot, TONE_TEXT, useModal } from "./ui";
import { DaySwitch } from "./views";

type Row = { p: Person; s: Session };

/** Team Leader / managers: every PR note, grouped by panel (or newest first). */
export function NotesView() {
  const { state, day, now } = useApp();
  const [mode, setMode] = useState("panel");
  if (!state) return null;
  const rows: Row[] = state.people
    .filter((p) => p.notes)
    .map((p) => ({ p, s: Core.sessionById(state, p.sid) }))
    .filter((x): x is Row => !!x.s && x.s.day === day);
  const panels = [...new Map(rows.map((r) => [r.s.id, r.s])).values()].sort((a, b) => a.start - b.start);
  const latest = [...rows].sort((a, b) => (b.p.noteAt ?? 0) - (a.p.noteAt ?? 0));
  return (
    <>
      <DaySwitch />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">PR notes</h2>
          <p className="text-sm text-muted-foreground">{rows.length} note{rows.length === 1 ? "" : "s"} on {panels.length} panel{panels.length === 1 ? "" : "s"} · updates live</p>
        </div>
        <Tabs value={mode} onValueChange={(v) => setMode(String(v))}>
          <TabsList><TabsTrigger value="panel">By panel</TabsTrigger><TabsTrigger value="latest">Newest first</TabsTrigger></TabsList>
        </Tabs>
      </div>
      {!rows.length && <p className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">No notes yet for this day. PRs add them on each speaker card.</p>}
      {mode === "panel"
        ? panels.map((s) => (
          <Card key={s.id} size="sm" className={cn("mb-3", now() >= s.end && "opacity-70")}>
            <CardHeader>
              <CardTitle className="leading-snug"><span className="mr-2 tabular-nums text-primary">{hm(s.start)}</span>{s.title}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">{rows.filter((r) => r.s.id === s.id).map((r) => <NoteRow key={r.p.id} {...r} />)}</CardContent>
          </Card>
        ))
        : <Card size="sm"><CardContent className="divide-y">{latest.map((r) => <NoteRow key={r.p.id} {...r} showPanel />)}</CardContent></Card>}
    </>
  );
}

function NoteRow({ p, s, showPanel }: Row & { showPanel?: boolean }) {
  const { state, now } = useApp();
  const modal = useModal();
  const profiles = useProfiles();
  if (!state) return null;
  const S = Core.STATUS[Core.personStatus(p, s, state.settings, now())];
  const pr = Core.prOf(state, p);
  const prPhone = Core.memberByName(state, pr)?.phone || (pr === state.settings.adminName ? "" : "");
  return (
    <div className="flex items-start gap-3 py-3 first:pt-1 last:pb-1">
      <button type="button" className="shrink-0 rounded-full" onClick={() => modal.open({ kind: "profile", name: p.name })} aria-label={`Open ${p.name}'s profile`}>
        <SpeakerAvatar name={p.name} photo={profiles.get(p.name)?.photo} className="size-11" />
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <button type="button" className="font-medium hover:underline" onClick={() => modal.open({ kind: "profile", name: p.name })}>{p.name}</button>
          {p.role !== "Speaker" && <span className="text-xs text-muted-foreground">{p.role}</span>}
          <span className={cn("flex items-center gap-1 text-xs font-medium", TONE_TEXT[S.tone])}><Dot tone={S.tone} />{S.label}</span>
        </div>
        {showPanel && <div className="text-xs text-muted-foreground"><span className="tabular-nums text-primary">{hm(s.start)}</span> · {s.title}</div>}
        <div className="flex items-start gap-1.5 rounded-md bg-muted/60 px-2.5 py-1.5">
          <NotebookPen className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <p dir="auto" className="min-w-0 flex-1 text-sm whitespace-pre-wrap break-words">{p.notes}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {p.noteAt && <span>{hm(p.noteAt)}{p.updatedBy ? ` · ${p.updatedBy}` : ""}</span>}
          <Badge variant="secondary">PR · {pr || "none"}</Badge>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        {p.phone && <CallLink phone={p.phone} title={`Call ${p.name}`} />}
        {prPhone && <CallLink phone={prPhone} label="PR" title={`Call ${pr}`} />}
      </div>
    </div>
  );
}
