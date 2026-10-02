"use client";

import * as Core from "@great-hall-pr/core";
import type { Incident, Session } from "@great-hall-pr/core";
import { Button } from "@great-hall-pr/ui/components/button";
import { Card } from "@great-hall-pr/ui/components/card";
import { Input } from "@great-hall-pr/ui/components/input";
import { Label } from "@great-hall-pr/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@great-hall-pr/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@great-hall-pr/ui/components/table";
import { Textarea } from "@great-hall-pr/ui/components/textarea";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { Pencil, Plus, UserPlus, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { dayOf, dur, hm, hourLabel, hm24, shortName } from "./format";
import { PersonRow, SessionCard } from "./session-card";
import { useApp } from "./store";
import { BrandButton, CallLink, Chip, Dot, TONE_TEXT, useModal, WhatsAppLink } from "./ui";

// ---------- shared ----------
export function DaySwitch() {
  const { state, day, setDay } = useApp();
  if (!state) return null;
  const label = (d: string) => (d === state.settings.day1 ? "Sat 3 Oct" : d === state.settings.day2 ? "Sun 4 Oct" : d);
  return (
    <div className="mb-3 flex gap-2 overflow-x-auto">
      {[state.settings.day1, state.settings.day2].map((d) => (
        <button type="button" key={d} onClick={() => setDay(d)}
          className={cn("rounded-full border-[1.5px] px-4 py-1.5 text-sm font-semibold whitespace-nowrap",
            day === d ? "border-brand bg-brand text-white" : "border-line bg-white text-brand")}>{label(d)}</button>
      ))}
    </div>
  );
}

export function dayLabel(state: Core.State, d: string) {
  return d === state.settings.day1 ? "Sat 3 Oct" : d === state.settings.day2 ? "Sun 4 Oct" : d;
}

const H2 = ({ children, count }: { children: React.ReactNode; count?: number | string }) => (
  <h2 className="mx-0.5 mt-5 mb-2.5 flex items-center gap-2 text-[17px] font-bold text-navy">{children}{count !== undefined && <span className="text-xs font-medium text-muted-foreground">{count}</span>}</h2>
);

const Banner = ({ kind, icon, children }: { kind: "lunch" | "free" | "busy" | "alert"; icon: string; children: React.ReactNode }) => (
  <div className={cn("mb-3 flex items-center gap-3 rounded-2xl border px-4 py-3 font-medium",
    kind === "lunch" && "border-[#f9c66a] bg-[#fff3dc] text-[#7a4b00]",
    kind === "free" && "border-[#9fd8b6] bg-[#e8f6ee] text-[#0d5c2c]",
    kind === "busy" && "border-[#b8cfee] bg-soft text-navy",
    kind === "alert" && "border-[#f5a99f] bg-[#fff0ee] text-[#9b1c12]")}>
    <span className="text-2xl">{icon}</span><div>{children}</div>
  </div>
);

const Empty = ({ children }: { children: React.ReactNode }) => <div className="px-3 py-7 text-center text-muted-foreground">{children}</div>;

function sessionsOfDay(state: Core.State, day: string, f?: (s: Session) => boolean) {
  return state.sessions.filter((s) => s.day === day && (!f || f(s))).sort((a, b) => a.start - b.start);
}

export function myAlertCount(state: Core.State, name: string, t: number) {
  let n = 0;
  for (const s of state.sessions)
    for (const p of Core.peopleOf(state, s.id)) {
      if (Core.prOf(state, p) !== name) continue;
      const c = Core.personStatus(p, s, state.settings, t);
      if (c === "LATE" || c === "CALLNOW" || c === "TAKE_BACKSTAGE") n++;
    }
  return n;
}

// ---------- PR views ----------
function PrBanner({ name }: { name: string }) {
  const { state, day, now } = useApp();
  if (!state) return null;
  const t = now();
  const l = Core.lunchWindow(state, name, day);
  if (dayOf(t) !== day) return l ? <Banner kind="busy" icon="🍽">Lunch on {dayLabel(state, day)}: {hm(l[0])}–{hm(l[1])}</Banner> : null;
  const st = Core.prStateAt(state, name, t, day);
  const cur = Core.prCurrentSession(state, name, t);
  const nextBusy = Core.sessionsOfPr(state, name, day).map((s) => Core.busyWindow(s, state.settings)[0]).filter((x) => x > t).sort((a, b) => a - b)[0];
  if ((st === "L" || st === "!") && l) return <Banner kind="lunch" icon="🍽">Lunch break until {hm(l[1])}{st === "!" && <b> – CLASH with a session, tell the Team Leader</b>}</Banner>;
  if (st === "S" && cur) return <Banner kind="busy" icon="🎤">On duty: <b>{cur.title}</b> · on stage {hm(cur.start)}</Banner>;
  const parts = [l && t < l[0] ? `lunch ${hm(l[0])}–${hm(l[1])}` : "", nextBusy ? `next speakers arrive ${hm(nextBusy)}` : ""].filter(Boolean);
  return <Banner kind="free" icon="☕">You&apos;re free{nextBusy ? ` for ${dur(nextBusy - t)}` : ""}. {parts.length ? `Coming up: ${parts.join(" · ")}` : "No more sessions today."}</Banner>;
}

export function MineView() {
  const { state, me, day, now } = useApp();
  if (!state || !me) return null;
  const t = now();
  const mine = Core.sessionsOfPr(state, me.name, day).sort((a, b) => a.start - b.start);
  const up = mine.filter((s) => s.end > t);
  const past = mine.filter((s) => s.end <= t);
  const alerts = myAlertCount(state, me.name, t);
  const nMine = state.people.filter((p) => Core.sessionById(state, p.sid)?.day === day && Core.prOf(state, p) === me.name).length;
  return (
    <>
      <DaySwitch />
      <PrBanner name={me.name} />
      {alerts > 0 && <Banner kind="alert" icon="🔴">{alerts} speaker(s) need action now – see red below.</Banner>}
      {mine.length > 0 && <p className="mx-0.5 mb-2 text-xs text-muted-foreground">You have <b>{nMine} speaker{nMine === 1 ? "" : "s"}</b> in {mine.length} session{mine.length === 1 ? "" : "s"} on {dayLabel(state, day)}.</p>}
      {!mine.length && <Empty>No speakers assigned to you on {dayLabel(state, day)}.</Empty>}
      {up.map((s, i) => <SessionCard key={s.id} s={s} onlyPr={me.name} openDefault={i < 3} />)}
      {past.length > 0 && (<><H2 count={past.length}>Finished</H2>{past.map((s) => <SessionCard key={s.id} s={s} onlyPr={me.name} />)}</>)}
    </>
  );
}

export function HallView() {
  const { state, day, now } = useApp();
  const [filter, setFilter] = useState<"all" | "next">("all");
  if (!state) return null;
  const t = now();
  let list = sessionsOfDay(state, day);
  if (filter === "next") list = list.filter((s) => s.end > t);
  return (
    <>
      <DaySwitch />
      <div className="mb-3 flex gap-2">
        {(["all", "next"] as const).map((f) => (
          <button type="button" key={f} onClick={() => setFilter(f)} className={cn("rounded-full border-[1.5px] px-3.5 py-1 text-[13px] font-semibold", filter === f ? "border-brand bg-brand text-white" : "border-line bg-white text-brand")}>
            {f === "all" ? "All sessions" : "Upcoming & live"}
          </button>
        ))}
      </div>
      {list.length ? list.map((s) => <SessionCard key={s.id} s={s} />) : <Empty>Nothing here.</Empty>}
    </>
  );
}

export function TeamBoardView() {
  return (<><DaySwitch /><RotaBoard /></>);
}

export function ReportView() {
  const { state, day, act, now } = useApp();
  const [kind, setKind] = useState("");
  const [sid, setSid] = useState("");
  const [note, setNote] = useState("");
  if (!state) return null;
  const opts = state.sessions.filter((s) => s.day === day || s.day === dayOf(now())).sort((a, b) => a.start - b.start);
  const send = async () => {
    if (!kind) { toast.error("Choose what happened"); return; }
    const r = await act({ type: "incident", kind, sid, note }, "Sent to Team Leader");
    if (r.ok) { setKind(""); setSid(""); setNote(""); }
  };
  return (
    <>
      <Card className="gap-0 px-4 py-4">
        <h3 className="text-lg font-bold text-navy">Report an issue</h3>
        <p className="text-xs text-muted-foreground">The Team Leader gets an instant alert.</p>
        <Label className="mt-3 mb-1.5 text-xs text-muted-foreground">What happened?</Label>
        <div className="flex flex-wrap gap-1.5">
          {Core.INCIDENT_KINDS.map((k) => (
            <button type="button" key={k} onClick={() => setKind(k)} className={cn("rounded-full border-[1.5px] px-3 py-1 text-[13px] font-semibold", kind === k ? "border-orange bg-orange text-white" : "border-line bg-white text-brand")}>{k}</button>
          ))}
        </div>
        <Label className="mt-3 mb-1.5 text-xs text-muted-foreground">Session (optional)</Label>
        <SessionSelect value={sid} onChange={setSid} sessions={opts} />
        <Label className="mt-3 mb-1.5 text-xs text-muted-foreground">Details</Label>
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who / what / where" className="bg-white" />
        <Button className="mt-3 h-11 rounded-full bg-st-urgent text-white hover:bg-st-urgent/90" onClick={send}>Send to Team Leader</Button>
      </Card>
      <H2 count={state.incidents.filter((i) => i.status === "open").length}>Open issues</H2>
      <IncidentList admin={false} />
    </>
  );
}

export function SessionSelect({ value, onChange, sessions, allowNone = true }: { value: string; onChange: (v: string) => void; sessions: Session[]; allowNone?: boolean }) {
  const { state } = useApp();
  if (!state) return null;
  const items = [...(allowNone ? [{ value: "__none__", label: "–" }] : []), ...sessions.map((s) => ({ value: s.id, label: `${dayLabel(state, s.day).slice(0, 3)} ${hm(s.start)} · ${s.title}` }))];
  return (
    <Select value={value || "__none__"} onValueChange={(v) => onChange(!v || v === "__none__" ? "" : String(v))} items={items}>
      <SelectTrigger className="h-10 w-full rounded-lg bg-white"><SelectValue /></SelectTrigger>
      <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function IncidentList({ admin }: { admin: boolean }) {
  const { state, act } = useApp();
  if (!state) return null;
  let list = [...state.incidents].sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.ts - a.ts);
  if (!admin) list = list.filter((i) => i.status === "open");
  if (!list.length) return <Empty>No issues 🎉</Empty>;
  return (
    <Card className="gap-0 py-0">
      {list.map((i: Incident) => {
        const s = i.sid ? Core.sessionById(state, i.sid) : null;
        const p = i.pid ? Core.personById(state, i.pid) : null;
        const owner = p ? Core.memberByName(state, Core.prOf(state, p)) : null;
        return (
          <div key={i.id} className={cn("flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0", i.status !== "open" && "opacity-55")}>
            <div className="min-w-16 text-xs font-semibold whitespace-nowrap text-brand tabular-nums">{hm(i.ts)}</div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{i.status === "open" ? "🔴 " : "✅ "}{i.kind}</div>
              {i.note && <div className="text-xs">{i.note}</div>}
              <div className="text-[11px] text-muted-foreground">by {i.by}{s ? ` · ${hm(s.start)} ${s.title}` : ""}{p ? ` · ${p.name}` : ""}{i.status !== "open" ? ` · resolved by ${i.resolvedBy} ${hm(i.resolvedAt)}` : ""}</div>
            </div>
            {admin && owner?.phone && <CallLink phone={owner.phone} title={`Call ${owner.name}`} />}
            {admin && (
              <Button size="sm" className={cn("h-8 rounded-full px-3", i.status === "open" ? "bg-orange text-white hover:bg-orange-dark" : "")} variant={i.status === "open" ? "default" : "outline"}
                onClick={() => void act({ type: "resolveIncident", id: i.id, reopen: i.status !== "open" })}>{i.status === "open" ? "Resolve" : "Reopen"}</Button>
            )}
          </div>
        );
      })}
    </Card>
  );
}

// ---------- break / lunch board ----------
export function RotaBoard() {
  const { state, day, now } = useApp();
  if (!state) return null;
  const t = now();
  const ss = state.sessions.filter((s) => s.day === day);
  if (!ss.length) return <Empty>No sessions on this day.</Empty>;
  let from = Math.min(...ss.map((s) => Core.busyWindow(s, state.settings)[0]));
  let to = Math.max(...ss.map((s) => s.end));
  for (const m of state.team) { const l = Core.lunchWindow(state, m.name, day); if (l) { from = Math.min(from, l[0]); to = Math.max(to, l[1]); } }
  from = Math.floor(from / 900000) * 900000;
  const slots: number[] = [];
  for (let x = from; x < to; x += 900000) slots.push(x);
  const nowIdx = slots.findIndex((s) => t >= s && t < s + 900000);
  const free = slots.map(() => 0);
  const rows = state.team.map((m) => ({ m, cells: slots.map((s, i) => { const v = Core.prStateAt(state, m.name, s + 1000, day); if (!v) free[i]!++; return v; }) }));
  const cellCls = (v: string) => (v === "S" ? "bg-brand" : v === "L" ? "bg-amber" : v === "!" ? "bg-st-urgent" : "");
  return (
    <>
      <div className="mx-0.5 mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span><i className="mr-1 inline-block size-3 rounded-sm bg-brand align-[-2px]" />With speakers</span>
        <span><i className="mr-1 inline-block size-3 rounded-sm bg-amber align-[-2px]" />Lunch</span>
        <span><i className="mr-1 inline-block size-3 rounded-sm bg-st-urgent align-[-2px]" />Clash</span>
        <span><i className="mr-1 inline-block size-3 rounded-sm border border-line bg-white align-[-2px]" />Free / break</span>
        {nowIdx >= 0 && <span><i className="mr-1 inline-block size-3 rounded-sm bg-orange align-[-2px]" />Now</span>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-24 bg-white px-2 text-left font-semibold text-muted-foreground md:min-w-40">PR</th>
              {slots.map((s, i) => { const top = hm24(s).slice(3) === "00"; return (
                <th key={s} className={cn("h-7 min-w-5 font-semibold text-muted-foreground", top && "border-l border-line", i === nowIdx && "shadow-[inset_2px_0_0_var(--color-orange),inset_-2px_0_0_var(--color-orange)]")}>{top ? hourLabel(s) : ""}</th>
              ); })}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, cells }) => (
              <tr key={m.name} className="border-t border-line">
                <td className="sticky left-0 z-10 bg-white px-2 text-xs font-semibold whitespace-nowrap text-navy"><span className="md:hidden">{shortName(m.name)}</span><span className="hidden md:inline">{m.name}</span></td>
                {cells.map((v, i) => <td key={i} title={hm(slots[i])} className={cn("h-8 min-w-5 border-r border-[#eef2f8]", cellCls(v), hm24(slots[i]).slice(3) === "00" && "border-l border-line", i === nowIdx && "shadow-[inset_2px_0_0_var(--color-orange),inset_-2px_0_0_var(--color-orange)]")} />)}
              </tr>
            ))}
            <tr className="border-t border-line">
              <td className="sticky left-0 z-10 bg-white px-2 text-xs font-bold text-navy">Free PRs</td>
              {free.map((f, i) => <td key={i} className={cn("text-center", f < 2 ? "font-bold text-st-urgent" : "text-muted-foreground")}>{f}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mx-0.5 mt-2 text-xs text-muted-foreground">Blocks = 15 min. &ldquo;With speakers&rdquo; = from {state.settings.arriveMin} min before a session until the speaker walks on stage. Red number = fewer than 2 PRs free → no breaks then.</p>
    </>
  );
}

// ---------- admin views ----------
export function LiveView() {
  const { state, day, now } = useApp();
  const modal = useModal();
  if (!state) return null;
  const t = now();
  const c = Core.counts(state, day, t);
  const openInc = state.incidents.filter((i) => i.status === "open");
  const clashes = state.sessions.filter((s) => s.day === day && !["OK", "NO_PR"].includes(Core.rotaCheck(state, s))).length;
  const Tile = ({ n, label, hot }: { n: number; label: string; hot?: boolean }) => (
    <div className={cn("rounded-xl border bg-white px-2 py-2.5 text-center", hot && n ? "border-st-urgent bg-[#fff0ee]" : "border-line")}>
      <b className={cn("block text-2xl leading-tight tabular-nums", hot && n ? "text-st-urgent" : "text-brand")}>{n}</b>
      <span className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
    </div>
  );
  const att: { p: Core.Person; s: Session; code: Core.StatusCode }[] = [];
  for (const s of state.sessions) {
    if (s.day !== day || s.end <= t) continue;
    for (const p of Core.peopleOf(state, s.id)) {
      const code = Core.personStatus(p, s, state.settings, t);
      if (["LATE", "CALLNOW", "TAKE_BACKSTAGE", "NOSHOW"].includes(code)) att.push({ p, s, code });
    }
  }
  att.sort((a, b) => Core.STATUS[a.code].rank - Core.STATUS[b.code].rank || a.s.start - b.s.start);
  const upcoming = sessionsOfDay(state, day, (s) => s.end > t).slice(0, 4);
  const today = dayOf(t) === day;
  return (
    <>
      <DaySwitch />
      <div className="grid grid-cols-4 gap-2 lg:grid-cols-8">
        <Tile n={c.LATE + c.TAKE_BACKSTAGE} label="Late" hot /><Tile n={c.CALLNOW} label="Call now" hot /><Tile n={openInc.length} label="Issues" hot /><Tile n={clashes} label="Rota clash" hot />
        <Tile n={c.NOTCALLED} label="Not called" /><Tile n={c.CONFIRMED} label="En route" /><Tile n={c.ARRIVED + c.BACKSTAGE} label="Arrived" /><Tile n={c.DONE} label="Done" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <H2 count={att.length}>Needs attention</H2>
          {att.length ? (
            <Card className="gap-0 py-0">
              {att.slice(0, 25).map(({ p, s, code }) => {
                const S = Core.STATUS[code];
                const prName = Core.prOf(state, p);
                const owner = Core.memberByName(state, prName);
                return (
                  <div key={p.id} className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
                    <Dot tone={S.tone} />
                    <div className="min-w-16 text-xs font-semibold whitespace-nowrap text-brand">{hm(s.start)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-navy">{p.name}</div>
                      <div className={cn("text-xs font-semibold", TONE_TEXT[S.tone])}>{S.label}{p.eta ? ` · ETA ${p.eta}` : ""}</div>
                      <div className="text-[11px] text-muted-foreground">{s.title} · PR {prName || "–"}</div>
                    </div>
                    {p.phone && <CallLink phone={p.phone} title="Call speaker" />}
                    {owner?.phone && <CallLink phone={owner.phone} title="Call PR" className="flex-col text-[10px] font-bold leading-none">📞<span>PR</span></CallLink>}
                    <Button variant="outline" size="icon" className="size-9 rounded-lg border-line bg-soft text-brand" onClick={() => modal.open({ kind: "person", pid: p.id })}>⋯</Button>
                  </div>
                );
              })}
            </Card>
          ) : <Card className="px-4 py-3 text-sm text-muted-foreground">All good – nobody late or unreached. ✅</Card>}
          <H2 count={openInc.length}>Open issues</H2>
          <IncidentList admin={false} />
        </div>
        <div>
          <H2>Now &amp; next</H2>
          {upcoming.length ? upcoming.map((s) => <SessionCard key={s.id} s={s} manage />) : <Card className="px-4 py-3 text-sm text-muted-foreground">No more sessions today.</Card>}
          <H2>Team {today ? "right now" : ""}</H2>
          <Card className="gap-0 py-0">
            {state.team.map((m) => {
              const stt = today ? Core.prStateAt(state, m.name, t, day) : "";
              const cur = today ? Core.prCurrentSession(state, m.name, t) : null;
              const l = Core.lunchWindow(state, m.name, day);
              const label = stt === "L" && l ? `🍽 Lunch until ${hm(l[1])}` : stt === "S" ? `🎤 ${cur?.title ?? "On duty"}` : stt === "!" ? "⚠ CLASH" : today ? "☕ Free" : l ? `Lunch ${hm(l[0])}` : "";
              return (
                <div key={m.name} className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-navy">{m.name}{m.guest && <Chip className="ml-1.5">guest</Chip>}</div>
                    <div className={cn("text-xs", stt === "" && today && "text-st-ok", stt === "L" && "text-st-warn")}>{label}</div>
                  </div>
                  {m.phone && <><CallLink phone={m.phone} /><WhatsAppLink phone={m.phone} /></>}
                </div>
              );
            })}
          </Card>
        </div>
      </div>
    </>
  );
}

export function SessionsView() {
  const { state, day } = useApp();
  const modal = useModal();
  if (!state) return null;
  return (
    <>
      <DaySwitch />
      <div className="mb-3 flex items-start gap-3">
        <p className="flex-1 text-xs text-muted-foreground">Tap a session to see its speakers and their PRs.</p>
        <BrandButton className="h-9" onClick={() => modal.open({ kind: "sessionEdit" })}><Plus /> New session</BrandButton>
      </div>
      <Card className="mb-3 flex-row flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 text-sm"><b>Each speaker has their own PR.</b> Open a session and use the <b>PR</b> dropdown under each speaker.</div>
        <Button variant="outline" className="h-9 rounded-full border-brand text-brand" onClick={() => modal.open({ kind: "autoAssign" })}><Zap /> Auto-assign</Button>
      </Card>
      {sessionsOfDay(state, day).map((s) => <SessionCard key={s.id} s={s} manage />)}
    </>
  );
}

export function TeamAdminView() {
  const { state, day, act } = useApp();
  const modal = useModal();
  if (!state) return null;
  const isD1 = day === state.settings.day1;
  return (
    <>
      <DaySwitch />
      <RotaBoard />
      <div className="mt-5 flex items-center gap-3">
        <h2 className="flex-1 text-[17px] font-bold text-navy">Team – {dayLabel(state, day)} <span className="text-xs font-medium text-muted-foreground">{state.team.length} people</span></h2>
        <BrandButton className="h-9" onClick={() => modal.open({ kind: "member" })}><UserPlus /> Add member</BrandButton>
      </div>
      <Card className="mt-2.5 gap-0 overflow-x-auto py-0">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Name</TableHead><TableHead>Lunch ({state.settings.lunchMin} min)</TableHead><TableHead>Speakers</TableHead><TableHead>PIN</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {state.team.map((m) => {
              const mp = state.people.filter((p) => Core.sessionById(state, p.sid)?.day === day && Core.prOf(state, p) === m.name);
              const clash = mp.some((p) => ["CLASH_LUNCH", "CLASH_DOUBLE"].includes(Core.personRota(state, p)));
              return (
                <TableRow key={m.name}>
                  <TableCell className="font-semibold text-navy">{m.name}{m.guest && <Chip className="ml-1.5">guest</Chip>}{clash && <Chip className="ml-1.5 bg-st-urgent text-white">clash</Chip>}</TableCell>
                  <TableCell>
                    <Input type="time" step={900} className="h-9 w-32 bg-white" defaultValue={isD1 ? m.lunch1 : m.lunch2} key={`${m.name}-${day}-${isD1 ? m.lunch1 : m.lunch2}`}
                      onBlur={(e) => { const v = e.target.value; if (v && v !== (isD1 ? m.lunch1 : m.lunch2)) void act({ type: "lunch", name: m.name, day, hhmm: v }, "Lunch updated"); }} />
                  </TableCell>
                  <TableCell>{mp.length}</TableCell>
                  <TableCell><code className="rounded-md border border-line bg-soft px-1.5 py-0.5 text-navy">{m.pin}</code></TableCell>
                  <TableCell><Button variant="outline" className="h-8 rounded-full border-brand text-brand" onClick={() => modal.open({ kind: "member", name: m.name })}><Pencil /> Edit</Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <p className="mt-2 text-xs text-muted-foreground">Admin PIN: <code className="rounded-md border border-line bg-soft px-1.5 py-0.5">{state.settings.adminPin}</code></p>
    </>
  );
}

export function PhonesView() {
  const { state, day, act, now } = useApp();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof Core.previewPhones> | null>(null);
  const [inline, setInline] = useState<Record<string, string>>({});
  if (!state) return null;
  const t = now();
  const sorted = [...state.people].sort((a, b) => a.name.localeCompare(b.name));
  const apply = async () => {
    if (!preview) return;
    const rows = preview.filter((r) => r.phone && r.matches.length).map((r) => {
      const pers = Core.personById(state, r.matches[0]!)!;
      // same person in several sessions → save to all of them
      return { phone: r.phone, pids: state.people.filter((x) => Core.normName(x.name) === Core.normName(pers.name)).map((x) => x.id) };
    });
    const res = await act({ type: "importPhones", rows });
    if (res.ok) { toast.success(`Saved ${res.result} numbers`); setPreview(null); setText(""); }
  };
  const missing = state.people.filter((p) => { const s = Core.sessionById(state, p.sid); return !p.phone && s?.day === day && s.end > t; })
    .sort((a, b) => Core.sessionById(state, a.sid)!.start - Core.sessionById(state, b.sid)!.start);
  return (
    <>
      <Card className="gap-0 px-4 py-4">
        <h3 className="text-lg font-bold text-navy">Paste today&apos;s speaker phone list</h3>
        <p className="text-xs text-muted-foreground">One per line: <code>Name, phone</code> – also works straight from Excel / WhatsApp. Typos are fine.</p>
        <Textarea rows={7} className="mt-3 bg-white" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Maged Ghoneima, 01001234567\nAlison Cossette\t+20 100 765 4321"} />
        <div className="mt-3 flex gap-2">
          <BrandButton className="h-10" onClick={() => setPreview(Core.previewPhones(state, text))}>Check matches</BrandButton>
          {preview && <Button variant="outline" className="h-10 rounded-full border-brand text-brand" onClick={apply}>Save {preview.filter((r) => r.matches.length && r.phone).length} matched</Button>}
        </div>
        {preview && (
          <Table className="mt-3">
            <TableHeader><TableRow><TableHead>Pasted name</TableHead><TableHead>Phone</TableHead><TableHead>Matched to</TableHead></TableRow></TableHeader>
            <TableBody>
              {preview.map((r, i) => {
                const items = [{ value: "__none__", label: "– not matched –" }, ...sorted.map((p) => { const s = Core.sessionById(state, p.sid)!; return { value: p.id, label: `${p.name} · ${hm(s.start)} ${dayLabel(state, s.day).slice(0, 3)}` }; })];
                return (
                  <TableRow key={i}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.phone || "⚠ no number"}</TableCell>
                    <TableCell>
                      <Select value={r.matches[0] || "__none__"} items={items} onValueChange={(v) => setPreview(preview.map((x, j) => (j === i ? { ...x, matches: v && v !== "__none__" ? [String(v)] : [] } : x)))}>
                        <SelectTrigger className={cn("h-9 w-full rounded-lg bg-white", !r.matches.length && "border-st-warn")}><SelectValue /></SelectTrigger>
                        <SelectContent>{items.map((it) => <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>)}</SelectContent>
                      </Select>
                      {r.matches.length > 1 && <div className="text-[11px] text-muted-foreground">Appears in {r.matches.length} sessions – number saved to all</div>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
      <div className="mt-4"><DaySwitch /></div>
      <H2 count={missing.length}>Still missing a phone</H2>
      {missing.length ? (
        <Card className="gap-0 py-0">
          {missing.map((p) => {
            const s = Core.sessionById(state, p.sid)!;
            return (
              <div key={p.id} className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
                <div className="min-w-16 text-xs font-semibold whitespace-nowrap text-brand">{hm(s.start)}</div>
                <div className="min-w-0 flex-1"><div className="font-semibold text-navy">{p.name}</div><div className="text-[11px] text-muted-foreground">{s.title} · PR {Core.prOf(state, p) || "–"}</div></div>
                <Input type="tel" placeholder="01…" className="h-9 w-36 bg-white" value={inline[p.id] ?? ""} onChange={(e) => setInline({ ...inline, [p.id]: e.target.value })} />
                <BrandButton className="h-9 px-4" onClick={() => { if (inline[p.id]) void act({ type: "phone", pid: p.id, phone: inline[p.id] }, "Saved"); }}>Save</BrandButton>
              </div>
            );
          })}
        </Card>
      ) : <Card className="px-4 py-3 text-sm text-muted-foreground">Everyone has a number ✅</Card>}
    </>
  );
}

export function IssuesView() {
  const modal = useModal();
  return (
    <>
      <div className="flex items-center"><H2>Issues</H2><span className="flex-1" /><Button className="h-9 rounded-full bg-st-urgent text-white hover:bg-st-urgent/90" onClick={() => modal.open({ kind: "incident" })}><Plus /> Log issue</Button></div>
      <IncidentList admin />
    </>
  );
}

export function LogView() {
  const { state } = useApp();
  if (!state) return null;
  const log = [...state.log].reverse();
  return (
    <>
      <H2 count={`last ${log.length}`}>Activity</H2>
      {log.length ? (
        <Card className="gap-0 py-0">
          {log.map((e, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
              <div className="min-w-16 text-xs font-semibold whitespace-nowrap text-brand">{hm(e.ts)}</div>
              <div className="min-w-0 flex-1 text-sm">{e.text}</div>
              <div className="text-[11px] text-muted-foreground">{e.by}</div>
            </div>
          ))}
        </Card>
      ) : <Empty>Nothing yet.</Empty>}
    </>
  );
}

export { PersonRow };
