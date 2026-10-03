"use client";

import * as Core from "@great-hall-pr/core";
import type { Person, Session } from "@great-hall-pr/core";
import { Badge } from "@great-hall-pr/ui/components/badge";
import { Button } from "@great-hall-pr/ui/components/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@great-hall-pr/ui/components/card";
import { Progress } from "@great-hall-pr/ui/components/progress";
import { Separator } from "@great-hall-pr/ui/components/separator";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { Check, ChevronDown, Ellipsis, Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { dayOf, dur, hm, shortName } from "./format";
import { ask } from "./confirm";
import { useApp } from "./store";
import { SpeakerAvatar, t12, useProfiles, useSummit, venueShort } from "./agenda";
import { CallLink, Dot, HeadsUp, PrPicker, RotaBadge, TONE_TEXT, useModal, WhatsAppLink } from "./ui";
import { SpeakerWhatsApp } from "./wa-reminder";

const FLAG: Record<Core.Readiness["flag"], { text: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  READY: { text: "Ready", variant: "secondary" },
  LIVE: { text: "Live", variant: "default" },
  AT_RISK: { text: "At risk", variant: "destructive" },
  PENDING: { text: "Pending", variant: "outline" },
  DONE: { text: "Done", variant: "outline" },
  NOPEOPLE: { text: "No names", variant: "outline" },
};

function countdown(s: Session, t: number) {
  if (t >= s.end) return "Finished";
  if (t >= s.start) return `Live · ${dur(s.end - t)} left`;
  return `Starts in ${dur(s.start - t)}`;
}

export function SessionCard({ s, manage, onlyPr, openDefault }: { s: Session; manage?: boolean; onlyPr?: string; openDefault?: boolean }) {
  const { state, me, now } = useApp();
  const modal = useModal();
  const [open, setOpen] = useState(!!openDefault);
  if (!state || !me) return null;
  const t = now();
  const r = Core.sessionReadiness(state, s, t);
  const prs = Core.prsOfSession(state, s);
  const ppl = Core.peopleOf(state, s.id);
  const unassigned = ppl.filter((p) => !Core.prOf(state, p)).length;
  const shown = onlyPr ? ppl.filter((p) => Core.prOf(state, p) === onlyPr) : ppl;
  const others = onlyPr ? ppl.filter((p) => Core.prOf(state, p) !== onlyPr) : [];

  return (
    <Card className={cn("mb-3", r.flag === "DONE" && "opacity-60", r.flag === "LIVE" && "ring-2 ring-primary", r.flag === "AT_RISK" && "ring-2 ring-destructive")}>
      <CardHeader className="cursor-pointer" onClick={() => setOpen(!open)}>
        <CardTitle className="leading-snug">
          <span className="mr-2 tabular-nums text-primary">{hm(s.start)}</span>{s.title}
        </CardTitle>
        <CardDescription>
          {hm(s.start)}–{hm(s.end)} · {s.type} · {countdown(s, t)} · {r.backstage}/{r.total} backstage
          {r.noshow > 0 && <span className="text-st-noshow"> · {r.noshow} no-show</span>}
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Badge variant={FLAG[r.flag].variant} className={r.flag === "AT_RISK" ? "gh-pulse" : ""}>{FLAG[r.flag].text}</Badge>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(prs).map(([n, c]) => (
            <Badge key={n} variant={n === me.name ? "default" : "secondary"}>{n === me.name ? "You" : shortName(n)}{c > 1 ? ` ×${c}` : ""}</Badge>
          ))}
          {unassigned > 0 && <Badge variant="destructive">{unassigned} without PR</Badge>}
          {(me.admin || me.manager) && <RotaBadge code={Core.rotaCheck(state, s) === "NO_PR" ? "OK" : Core.rotaCheck(state, s)} />}
        </div>
        <Progress value={r.total ? (100 * r.backstage) / r.total : 0} />
      </CardContent>
      {open && (
        <CardContent className="px-0">
          {shown.map((p) => (
            <div key={p.id}><Separator /><PersonRow p={p} s={s} manage={manage && me.admin} hidePr={!!onlyPr} /></div>
          ))}
          {others.length > 0 && (
            <><Separator /><div className="flex flex-wrap items-center gap-1.5 px-(--card-spacing) pt-3 text-xs text-muted-foreground">
              Also on this panel
            </div>
            <div className="grid grid-cols-2 gap-3 px-(--card-spacing) pt-2 sm:grid-cols-3">
              {others.map((p) => <PanelMate key={p.id} p={p} />)}
            </div></>
          )}
          {!ppl.length && <><Separator /><p className="px-(--card-spacing) pt-3 text-sm text-muted-foreground">No names listed yet.</p></>}
        </CardContent>
      )}
      {open && manage && me.admin && (
        <CardFooter className="flex-wrap gap-2 border-t">
          <Button variant="outline" onClick={() => modal.open({ kind: "personEdit", sid: s.id })}><Plus /> Add speaker</Button>
          <Button variant="outline" onClick={() => modal.open({ kind: "sessionEdit", sid: s.id })}><Pencil /> Edit session</Button>
        </CardFooter>
      )}
    </Card>
  );
}

/** Someone else's speaker on the same panel – picture, name and their PR only. */
function PanelMate({ p }: { p: Person }) {
  const { state } = useApp();
  const profiles = useProfiles();
  if (!state) return null;
  const pr = Core.prOf(state, p);
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <SpeakerAvatar name={p.name} photo={profiles.get(p.name)?.photo} className="size-20" />
      <div className="text-sm leading-tight font-medium">{p.name}</div>
      <div className="text-xs leading-tight text-muted-foreground">{p.role !== "Speaker" ? `${p.role} · ` : ""}PR {pr ? shortName(pr) : "–"}</div>
    </div>
  );
}

export function PersonRow({ p, s, manage, hidePr }: { p: Person; s: Session; manage?: boolean; hidePr?: boolean }) {
  const { state, me, now, act } = useApp();
  const modal = useModal();
  const profiles = useProfiles();
  const summit = useSummit();
  if (!state || !me) return null;
  const t = now();
  const code = Core.personStatus(p, s, state.settings, t);
  const S = Core.STATUS[code];
  const d = Core.deadlines(s, state.settings);
  const next = Core.nextStep(p, s, state.settings, t);

  let hint = "";
  if (code === "NOTCALLED") hint = `Call by ${hm(d.callBy)}${dayOf(d.callBy) !== s.day ? " (day before)" : ""}`;
  else if (code === "CONFIRMED") hint = `${p.eta ? `ETA ${p.eta} · ` : ""}Must arrive by ${hm(d.arriveBy)}`;
  else if (code === "CALLNOW") hint = `ETA call was due at ${hm(d.etaBy)} · arrive by ${hm(d.arriveBy)}`;
  else if (code === "LATE") hint = `Was due ${hm(d.arriveBy)} – ${dur(t - d.arriveBy)} late${p.eta ? ` · ETA ${p.eta}` : ""}`;
  else if (code === "ARRIVED") hint = `Arrived ${hm(p.arrived)} · backstage by ${hm(d.backstageBy)}`;
  else if (code === "TAKE_BACKSTAGE") hint = `Backstage was due ${hm(d.backstageBy)}`;
  else if (code === "BACKSTAGE") hint = `Backstage since ${hm(p.backstage)}`;
  else if (code === "DONE") hint = `On stage ${hm(p.onstage)}`;
  if (p.notes) hint += ` · ${p.notes}`;

  const tap = async (k: Core.Step, done: boolean) => {
    if (done && !(await ask({ title: `Undo “${Core.STEP_LABEL[k]}” for ${p.name}?`, description: `This clears the time it was ticked (${hm(p[k])}).`, confirmLabel: "Undo", destructive: true }))) return;
    void act({ type: "step", pid: p.id, step: k, value: !done });
  };
  const prName = Core.prOf(state, p);

  const viewOnly = !!me.manager && !me.admin;
  const prMember = Core.memberByName(state, prName);
  /** call / WhatsApp the speaker's PR straight from the session (Team Leader + managers) */
  const prContact = (me.admin || me.manager) && prMember?.phone ? <><CallLink phone={prMember.phone} title={`Call ${prMember.name}`} /><WhatsAppLink phone={prMember.phone} /></> : null;
  if (!me.admin && !me.manager && prName !== me.name) {
    return (
      <div className="flex items-center gap-3 px-(--card-spacing) py-3">
        <SpeakerAvatar name={p.name} photo={profiles.get(p.name)?.photo} className="size-16" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{p.name}{p.role && p.role !== "Speaker" && <span className="text-muted-foreground"> · {p.role}</span>}</div>
          {!hidePr && <Badge variant="secondary" className="mt-1">PR · {prName || "none yet"}</Badge>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 px-(--card-spacing) py-3">
      <div className="flex items-start gap-2.5">
        <div className="relative shrink-0">
          <SpeakerAvatar name={p.name} photo={profiles.get(p.name)?.photo} className="size-16" />
          <span className="absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-card"><Dot tone={S.tone} /></span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{p.name}{p.role && p.role !== "Speaker" && <span className="text-muted-foreground"> · {p.role}</span>}</div>
          <div className={cn("text-xs font-medium", TONE_TEXT[S.tone])}>{S.label}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className="flex shrink-0 gap-1.5">
          {p.phone ? (<><CallLink phone={p.phone} /><SpeakerWhatsApp p={p} /></>) : me.admin ? (
            <Button variant="outline" size="sm" onClick={() => modal.open({ kind: "person", pid: p.id })}><Plus /> Phone</Button>
          ) : <span className="self-center text-xs text-muted-foreground">No phone yet</span>}
          {!viewOnly && <Button variant="ghost" size="icon" onClick={() => modal.open({ kind: "person", pid: p.id })} aria-label="More"><Ellipsis /></Button>}
        </div>
      </div>
      <HeadsUp text={p.alert} />
      {(() => {
        const other = summit.elsewhere(p.name).filter((x) => x.day === s.day);
        return other.length > 0 && (
          <div className="rounded-md bg-muted/70 px-2.5 py-2 text-xs">
            <b className="font-semibold">Also today:</b>{" "}
            {other.map((x, i) => <span key={x.id}>{i > 0 && " · "}{x.format || "Session"} {t12(x.start)}–{t12(x.end)}, {venueShort(x.venue)}</span>)}
          </div>
        );
      })()}
      {manage ? (
        <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">PR</span><PrPicker person={p} />{prContact}<RotaBadge code={Core.personRota(state, p)} /></div>
      ) : !hidePr ? (
        <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">PR · {prName || "none yet"}</Badge>{prContact}{(me.admin || me.manager) && <RotaBadge code={Core.personRota(state, p)} />}</div>
      ) : null}
      <div className="grid grid-cols-5 gap-1.5">
        {Core.STEPS.map((k) => {
          const done = !!p[k];
          const isNext = !done && k === next;
          return (
            <Button key={k} type="button" variant="outline" disabled={viewOnly || (p.noshow && !done)} onClick={() => void tap(k, done)}
              title={Core.STEP_LABEL[k]}
              className={cn("h-auto min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden px-0.5 py-1.5 text-center text-[10.5px] leading-tight whitespace-normal sm:text-[11px]",
                done ? "border-st-done/40 bg-st-done/10 font-semibold text-st-done hover:bg-st-done/15 hover:text-st-done"
                  : isNext ? "border-2 border-primary bg-primary/10 font-semibold text-primary hover:bg-primary/15 hover:text-primary"
                    : "text-muted-foreground")}>
              <span className="block w-full truncate tracking-tight">{Core.STEP_LABEL[k]}</span>
              {done ? <span className="flex items-center justify-center gap-0.5 text-[10px] font-normal whitespace-nowrap opacity-90"><Check className="size-3 shrink-0" />{hm(p[k]).replace(" ", "\u00a0")}</span>
                : isNext && <span className="text-[9px] font-medium tracking-wide whitespace-nowrap uppercase opacity-80">tap next</span>}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
