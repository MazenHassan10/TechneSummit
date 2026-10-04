"use client";

import * as Core from "@great-hall-pr/core";
import type { Person, Session } from "@great-hall-pr/core";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { ArrowLeftToLine, ArrowRightFromLine, CalendarClock, CircleCheck } from "lucide-react";

import { useSummit, venueShort } from "./agenda";
import { hm } from "./format";
import { useApp } from "./store";

/** Under this many minutes between two sessions = back-to-back (red). */
const TIGHT_MIN = 60;

type Slot = { key: string; day: string; start: number; end: number; title: string; where: string; format: string; arrived?: boolean; ours: boolean };
const dayShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const mins = (ms: number) => Math.round(ms / 60_000);
const dur = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`);
/** "overlaps ours by 15 min" / "no break before ours" / "10 min before ours" */
const gap = (m: number, side: "before" | "after") => (m < 0 ? `overlaps ours by ${dur(-m)}` : m === 0 ? `no break ${side} ours` : `${dur(m)} ${side} ours`);

/** Everything else this person has at the summit: other Great Hall sessions (with our check-in data) + other stages/workshops. */
export function useSlots(name: string, exceptSid?: string): Slot[] {
  const { state } = useApp();
  const summit = useSummit();
  if (!state) return [];
  const tz = state.settings.tz;
  const k = Core.normName(name);
  const ours: Slot[] = state.people
    .filter((q) => Core.normName(q.name) === k && q.sid !== exceptSid)
    .map((q) => ({ q, s: Core.sessionById(state, q.sid) }))
    .filter((x): x is { q: Person; s: Session } => !!x.s)
    .map(({ q, s }) => ({ key: s.id, day: s.day, start: s.start, end: s.end, title: s.title, where: "Stage 01 · The Great Hall", format: s.type, arrived: !!(q.arrived || q.backstage || q.onstage), ours: true }));
  const elsewhere: Slot[] = summit.elsewhere(name).map((x) => ({
    key: x.id, day: x.day, start: Core.dayStart(x.day, x.start, tz), end: Core.dayStart(x.day, x.end, tz), title: x.title, where: venueShort(x.venue), format: x.format, ours: false,
  }));
  return [...ours, ...elsewhere].sort((a, b) => a.start - b.start);
}

/** Red when they come straight from / go straight to another session; quiet line for the rest of the day; green if already at the summit. */
export function ScheduleAlerts({ p, s }: { p: Person; s: Session }) {
  const { now } = useApp();
  const slots = useSlots(p.name, s.id);
  if (!slots.length) return null;
  const t = now();
  const sameDay = slots.filter((x) => x.day === s.day);
  const before = sameDay.filter((x) => x.start < s.start).at(-1);
  const after = sameDay.find((x) => x.start >= s.start);
  const gapBefore = before ? mins(s.start - before.end) : Infinity;
  const gapAfter = after ? mins(after.start - s.end) : Infinity;
  const tightBefore = before && gapBefore < TIGHT_MIN;
  const tightAfter = after && gapAfter < TIGHT_MIN;
  const rest = sameDay.filter((x) => !(tightBefore && x === before) && !(tightAfter && x === after));
  const been = slots.filter((x) => x.end <= t && (x.day !== s.day || x.start < s.start)).at(-1);

  return (
    <div className="space-y-1.5">
      {tightBefore && before && (
        <Line tone="red" icon={<ArrowLeftToLine />}>
          <b>Back-to-back – comes straight from</b> {before.format ? `${before.format}: ` : ""}“{before.title}” · {before.where} · ends {hm(before.end)} ({gap(gapBefore, "before")})
        </Line>
      )}
      {tightAfter && after && (
        <Line tone="red" icon={<ArrowRightFromLine />}>
          <b>Back-to-back – goes straight to</b> {after.format ? `${after.format}: ` : ""}“{after.title}” · {after.where} · starts {hm(after.start)} ({gap(gapAfter, "after")})
        </Line>
      )}
      {rest.length > 0 && (
        <Line tone="muted" icon={<CalendarClock />}>
          <b>Also today:</b> {rest.map((x, i) => <span key={x.key}>{i > 0 && " · "}{x.format || "Session"} {hm(x.start)}–{hm(x.end)}, {x.where}</span>)}
        </Line>
      )}
      {been && (
        <Line tone="green" icon={<CircleCheck />}>
          <b>Already at the summit</b> – {been.ours && been.arrived ? "checked in with us for" : "had"} “{been.title}” ({dayShort(been.day)} {hm(been.start)}, {been.where})
        </Line>
      )}
    </div>
  );
}

function Line({ tone, icon, children }: { tone: "red" | "muted" | "green"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-start gap-1.5 rounded-md px-2.5 py-1.5 text-xs [&_svg]:mt-px [&_svg]:size-3.5 [&_svg]:shrink-0",
      tone === "red" && "border border-destructive/40 bg-destructive/10 text-destructive",
      tone === "muted" && "bg-muted/70",
      tone === "green" && "border border-st-done/30 bg-st-done/10 text-st-done")}>
      {icon}<span className={tone === "muted" ? "" : "text-foreground"}>{children}</span>
    </div>
  );
}
