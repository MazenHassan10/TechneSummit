"use client";

import * as Core from "@great-hall-pr/core";
import type { Person, Session } from "@great-hall-pr/core";
import { Badge } from "@great-hall-pr/ui/components/badge";
import { Button } from "@great-hall-pr/ui/components/button";
import { Card } from "@great-hall-pr/ui/components/card";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { dayOf, dur, hm, shortName } from "./format";
import { useApp } from "./store";
import { CallLink, Chip, Dot, PrPicker, TONE_TEXT, useModal, WhatsAppLink } from "./ui";

const FLAG: Record<Core.Readiness["flag"], { text: string; cls: string }> = {
  READY: { text: "READY", cls: "bg-[#e8f6ee] text-st-done" },
  LIVE: { text: "LIVE", cls: "bg-orange text-white" },
  AT_RISK: { text: "AT RISK", cls: "bg-st-urgent text-white gh-pulse" },
  PENDING: { text: "PENDING", cls: "bg-soft text-brand" },
  DONE: { text: "DONE", cls: "border border-line bg-transparent text-muted-foreground" },
  NOPEOPLE: { text: "NO NAMES", cls: "bg-soft text-muted-foreground" },
};

function Countdown({ s, t }: { s: Session; t: number }) {
  if (t >= s.end) return <span>Finished</span>;
  if (t >= s.start) return <b className="text-orange">LIVE · {dur(s.end - t)} left</b>;
  return <span>starts in {dur(s.start - t)}</span>;
}

export function SessionCard({ s, manage, onlyPr, openDefault }: { s: Session; manage?: boolean; onlyPr?: string; openDefault?: boolean }) {
  const { state, me, now } = useApp();
  const modal = useModal();
  const [open, setOpen] = useState(!!openDefault);
  if (!state || !me) return null;
  const t = now();
  const r = Core.sessionReadiness(state, s, t);
  const rota = Core.rotaCheck(state, s);
  const prs = Core.prsOfSession(state, s);
  const ppl = Core.peopleOf(state, s.id);
  const unassigned = ppl.filter((p) => !Core.prOf(state, p)).length;
  const tot = r.total || 1;
  const shown = onlyPr ? ppl.filter((p) => Core.prOf(state, p) === onlyPr) : ppl;

  return (
    <Card className={cn("mb-3 gap-0 overflow-hidden py-0",
      r.flag === "DONE" && "opacity-60", r.flag === "LIVE" && "ring-2 ring-orange", r.flag === "AT_RISK" && "ring-2 ring-st-urgent")}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 px-4 pt-3 pb-2.5 text-left">
        <div className="min-w-16 whitespace-nowrap text-sm font-bold tabular-nums text-brand">
          {hm(s.start)}
          <div className="text-[11px] font-medium text-muted-foreground">{hm(s.end)}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-snug text-navy">{s.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{s.type}</span>·<Countdown s={s} t={t} />·<span>{r.backstage}/{r.total} backstage</span>
            {r.noshow > 0 && <span className="text-st-noshow">{r.noshow} no-show</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(prs).map(([n, c]) => (
              <Chip key={n} className={n === me.name ? "bg-orange text-white" : ""}>👤 {n === me.name ? "You" : shortName(n)}{c > 1 ? ` ×${c}` : ""}</Chip>
            ))}
            {unassigned > 0 && <Chip className="bg-[#fff0ee] text-st-urgent">{unassigned} without PR</Chip>}
            {!Object.keys(prs).length && !unassigned && <Chip>No PR yet</Chip>}
            {me.admin && rota !== "OK" && rota !== "NO_PR" && <Badge className="bg-st-urgent text-white">{Core.ROTA_LABEL[rota]}</Badge>}
          </div>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-soft">
            <i className="block bg-st-ready" style={{ width: `${(100 * r.backstage) / tot}%` }} />
            <i className="block bg-st-arrived" style={{ width: `${(100 * (r.arrived - r.backstage)) / tot}%` }} />
          </div>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide whitespace-nowrap", FLAG[r.flag].cls)}>{FLAG[r.flag].text}</span>
      </button>
      {open && (
        <div>
          {shown.map((p) => <PersonRow key={p.id} p={p} s={s} manage={manage && me.admin} hidePr={!!onlyPr} />)}
          {onlyPr && shown.length < ppl.length && (
            <div className="border-t border-line px-4 py-2.5 text-xs text-muted-foreground">
              Also on this panel:{" "}
              {ppl.filter((p) => Core.prOf(state, p) !== onlyPr).map((p, i) => (
                <span key={p.id}>{i > 0 && " · "}{p.name} <Chip>👤 {shortName(Core.prOf(state, p) || "no PR")}</Chip></span>
              ))}
            </div>
          )}
          {!ppl.length && <div className="border-t border-line px-4 py-3 text-sm text-muted-foreground">No names listed yet.</div>}
          {manage && me.admin && (
            <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
              <Button variant="outline" className="h-9 rounded-full border-brand text-brand" onClick={() => modal.open({ kind: "personEdit", sid: s.id })}><Plus /> Add speaker / moderator</Button>
              <Button variant="outline" className="h-9 rounded-full border-brand text-brand" onClick={() => modal.open({ kind: "sessionEdit", sid: s.id })}><Pencil /> Edit session</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function PersonRow({ p, s, manage, hidePr }: { p: Person; s: Session; manage?: boolean; hidePr?: boolean }) {
  const { state, me, now, act } = useApp();
  const modal = useModal();
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
  if (p.notes) hint += ` · 📝 ${p.notes}`;

  const tap = (k: Core.Step, done: boolean) => {
    if (done && !confirm(`Undo "${Core.STEP_LABEL[k]}"?`)) return;
    void act({ type: "step", pid: p.id, step: k, value: !done });
  };
  const rota = Core.personRota(state, p);
  const prName = Core.prOf(state, p);

  return (
    <div className="border-t border-line px-4 pt-2.5 pb-3">
      <div className="flex items-center gap-2.5">
        <Dot tone={S.tone} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-navy">{p.name}{p.role && p.role !== "Speaker" && <span className="text-xs font-normal text-muted-foreground"> · {p.role}</span>}</div>
          <div className={cn("text-xs font-semibold", TONE_TEXT[S.tone])}>{S.label}</div>
          {hint && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{hint}</div>}
        </div>
        <div className="flex shrink-0 gap-1.5">
          {p.phone ? (<><CallLink phone={p.phone} /><WhatsAppLink phone={p.phone} /></>) : (
            <Button variant="outline" className="h-9 rounded-lg border-[#f8b89c] bg-[#fff1eb] px-2.5 text-xs font-semibold text-orange-dark" onClick={() => modal.open({ kind: "person", pid: p.id })}>+ phone</Button>
          )}
          <Button variant="outline" size="icon" className="size-9 rounded-lg border-line bg-soft text-brand" onClick={() => modal.open({ kind: "person", pid: p.id })} aria-label="More"><MoreHorizontal /></Button>
        </div>
      </div>
      {manage ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">PR:</span><PrPicker person={p} />
          {rota !== "OK" && <Badge className="bg-st-urgent text-white">{Core.ROTA_LABEL[rota]}</Badge>}
        </div>
      ) : !hidePr ? (
        <div className="mt-1.5 flex items-center gap-2"><Chip>👤 {prName || "No PR yet"}</Chip>{me.admin && rota !== "OK" && <Badge className="bg-st-urgent text-white">{Core.ROTA_LABEL[rota]}</Badge>}</div>
      ) : null}
      <div className="mt-2.5 grid grid-cols-5 gap-1.5">
        {Core.STEPS.map((k) => {
          const done = !!p[k];
          const isNext = !done && k === next;
          return (
            <button type="button" key={k} disabled={p.noshow && !done} onClick={() => tap(k, done)}
              className={cn("min-h-11 rounded-lg border-[1.5px] px-0.5 py-1.5 text-center text-[11px] leading-tight font-semibold transition-colors disabled:opacity-35",
                done ? "border-[#9fd8b6] bg-[#e8f6ee] text-st-done"
                  : isNext ? "border-orange bg-[#fff1eb] text-orange-dark shadow-[inset_0_0_0_1px_var(--color-orange)]"
                    : "border-line bg-white text-navy")}>
              {done && "✓ "}{Core.STEP_LABEL[k]}
              <small className="block text-[10px] font-medium opacity-80">{done ? hm(p[k]) : " "}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
