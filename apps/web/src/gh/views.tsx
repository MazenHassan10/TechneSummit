"use client";

import * as Core from "@great-hall-pr/core";
import type { Incident, Session } from "@great-hall-pr/core";
import { Badge } from "@great-hall-pr/ui/components/badge";
import { Button } from "@great-hall-pr/ui/components/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@great-hall-pr/ui/components/card";
import { Input } from "@great-hall-pr/ui/components/input";
import { Label } from "@great-hall-pr/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@great-hall-pr/ui/components/select";
import { Separator } from "@great-hall-pr/ui/components/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@great-hall-pr/ui/components/table";
import { Tabs, TabsList, TabsTrigger } from "@great-hall-pr/ui/components/tabs";
import { Textarea } from "@great-hall-pr/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@great-hall-pr/ui/components/toggle-group";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { Ellipsis, Pencil, Plus, Repeat, Send, ShieldUser, UserPlus } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { dayOf, dur, hm, hourLabel, hm24, shortName } from "./format";
import { SessionCard } from "./session-card";
import { useApp } from "./store";
import { CheckStatus } from "./agenda-watch";
import { Banner, CallLink, DayTabs, Dot, RotaBadge, TONE_TEXT, useModal, WhatsAppLink } from "./ui";

// ---------- shared ----------
export function dayLabel(state: Core.State, d: string) {
  return d === state.settings.day1 ? "Sat 3 Oct" : d === state.settings.day2 ? "Sun 4 Oct" : d;
}

export function DaySwitch() {
  const { state, day, setDay } = useApp();
  if (!state) return null;
  return <DayTabs value={day} onChange={setDay} days={[state.settings.day1, state.settings.day2].map((d) => ({ value: d, label: dayLabel(state, d) }))} />;
}

function SectionTitle({ children, count, action }: { children: React.ReactNode; count?: number | string; action?: React.ReactNode }) {
  return (
    <div className="mt-6 mb-3 flex items-center gap-2">
      <h2 className="text-base font-semibold">{children}</h2>
      {count !== undefined && <Badge variant="secondary">{count}</Badge>}
      <div className="flex-1" />
      {action}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <Card><CardContent className="text-center text-sm text-muted-foreground">{children}</CardContent></Card>
);

/** Card with separated rows */
function ListCard({ children }: { children: React.ReactNode[] }) {
  return (
    <Card className="gap-0 py-0">
      {children.map((c, i) => <Fragment key={i}>{i > 0 && <Separator />}<div className="flex items-center gap-3 px-(--card-spacing) py-3">{c}</div></Fragment>)}
    </Card>
  );
}

const Time = ({ t }: { t?: number | null }) => <span className="w-16 shrink-0 text-xs font-medium tabular-nums text-primary">{hm(t)}</span>;

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

// ---------- Team Leader contact ----------
export function LeaderCard({ compact }: { compact?: boolean }) {
  const { state } = useApp();
  const phone = state?.settings.adminPhone;
  if (!state || !phone) return null;
  return (
    <Card size="sm" className="mb-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldUser className="size-4 text-primary" />Team Leader · {state.settings.adminName}</CardTitle>
        <CardDescription>{compact ? "For anything urgent" : "Call or WhatsApp for anything urgent"} · {phone}</CardDescription>
        <CardAction className="flex gap-1.5"><CallLink phone={phone} title="Call Team Leader" /><WhatsAppLink phone={phone} /></CardAction>
      </CardHeader>
    </Card>
  );
}

// ---------- PR views ----------
function PrBanner({ name }: { name: string }) {
  const { state, day, now } = useApp();
  if (!state) return null;
  const t = now();
  if (dayOf(t) !== day) return null;
  const cur = Core.prCurrentSession(state, name, t);
  const nextBusy = Core.sessionsOfPr(state, name, day).map((s) => Core.busyWindow(s, state.settings)[0]).filter((x) => x > t).sort((a, b) => a - b)[0];
  if (cur) return <Banner kind="busy" title={`On duty: ${cur.title}`}>Speaker on stage at {hm(cur.start)}</Banner>;
  return <Banner kind="free" title={nextBusy ? `Free for ${dur(nextBusy - t)}` : "You're free"}>{nextBusy ? `Your next speaker arrives at ${hm(nextBusy)}` : "No more speakers today."}</Banner>;
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
      {alerts > 0 && <Banner kind="alert" title={`${alerts} speaker(s) need action now`}>See the red statuses below. Can't reach them? Call the Team Leader.</Banner>}
      <LeaderCard compact />
      {mine.length > 0 && <p className="mb-3 text-sm text-muted-foreground">You have <b className="text-foreground">{nMine} speaker{nMine === 1 ? "" : "s"}</b> in {mine.length} session{mine.length === 1 ? "" : "s"} on {dayLabel(state, day)}.</p>}
      {!mine.length && <Empty>No speakers assigned to you on {dayLabel(state, day)}.</Empty>}
      {up.map((s, i) => <SessionCard key={s.id} s={s} onlyPr={me.name} openDefault={i < 3} />)}
      {past.length > 0 && (<><SectionTitle count={past.length}>Finished</SectionTitle>{past.map((s) => <SessionCard key={s.id} s={s} onlyPr={me.name} />)}</>)}
    </>
  );
}

export function HallView() {
  const { state, day, now } = useApp();
  const [filter, setFilter] = useState("all");
  if (!state) return null;
  const t = now();
  let list = sessionsOfDay(state, day);
  if (filter === "next") list = list.filter((s) => s.end > t);
  return (
    <>
      <DaySwitch />
      <Tabs value={filter} onValueChange={(v) => setFilter(String(v))} className="mb-3">
        <TabsList variant="line"><TabsTrigger value="all">All sessions</TabsTrigger><TabsTrigger value="next">Upcoming &amp; live</TabsTrigger></TabsList>
      </Tabs>
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
      <LeaderCard />
      <Card>
        <CardHeader>
          <CardTitle>Report an issue</CardTitle>
          <CardDescription>The Team Leader gets an instant alert.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>What happened?</Label>
            <ToggleGroup variant="outline" value={kind ? [kind] : []} onValueChange={(v: string[]) => setKind(v[0] ?? "")} className="flex-wrap justify-start">
              {Core.INCIDENT_KINDS.map((k) => <ToggleGroupItem key={k} value={k} className="data-pressed:bg-primary data-pressed:text-primary-foreground">{k}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <div className="space-y-2"><Label>Session (optional)</Label><SessionSelect value={sid} onChange={setSid} sessions={opts} /></div>
          <div className="space-y-2"><Label>Details</Label><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who / what / where" /></div>
          <Button variant="destructive" size="lg" className="w-full" onClick={send}><Send /> Send to Team Leader</Button>
        </CardContent>
      </Card>
      <SectionTitle count={state.incidents.filter((i) => i.status === "open").length}>Open issues</SectionTitle>
      <IncidentList admin={false} />
    </>
  );
}

export function SessionSelect({ value, onChange, sessions, allowNone = true }: { value: string; onChange: (v: string) => void; sessions: Session[]; allowNone?: boolean }) {
  const { state } = useApp();
  if (!state) return null;
  const items = [...(allowNone ? [{ value: "__none__", label: "None" }] : []), ...sessions.map((s) => ({ value: s.id, label: `${dayLabel(state, s.day).slice(0, 3)} ${hm(s.start)} · ${s.title}` }))];
  return (
    <Select value={value || "__none__"} onValueChange={(v) => onChange(!v || v === "__none__" ? "" : String(v))} items={items}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function IncidentList({ admin }: { admin: boolean }) {
  const { state, act } = useApp();
  if (!state) return null;
  let list = [...state.incidents].sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.ts - a.ts);
  if (!admin) list = list.filter((i) => i.status === "open");
  if (!list.length) return <Empty>No issues.</Empty>;
  return (
    <ListCard>
      {list.map((i: Incident) => {
        const s = i.sid ? Core.sessionById(state, i.sid) : null;
        const p = i.pid ? Core.personById(state, i.pid) : null;
        const owner = p ? Core.memberByName(state, Core.prOf(state, p)) : null;
        return (
          <Fragment key={i.id}>
            <Time t={i.ts} />
            <div className={cn("min-w-0 flex-1", i.status !== "open" && "opacity-60")}>
              <div className="flex items-center gap-2 font-medium">{i.kind}<Badge variant={i.status === "open" ? "destructive" : "secondary"}>{i.status === "open" ? "Open" : "Resolved"}</Badge></div>
              {i.note && <div className="text-sm">{i.note}</div>}
              <div className="text-xs text-muted-foreground">by {i.by}{s ? ` · ${hm(s.start)} ${s.title}` : ""}{p ? ` · ${p.name}` : ""}{i.status !== "open" ? ` · resolved by ${i.resolvedBy} ${hm(i.resolvedAt)}` : ""}</div>
            </div>
            {admin && owner?.phone && <CallLink phone={owner.phone} title={`Call ${owner.name}`} />}
            {admin && <Button size="sm" variant={i.status === "open" ? "default" : "outline"} onClick={() => void act({ type: "resolveIncident", id: i.id, reopen: i.status !== "open" })}>{i.status === "open" ? "Resolve" : "Reopen"}</Button>}
          </Fragment>
        );
      })}
    </ListCard>
  );
}

// ---------- team timeline (with a speaker / free) ----------
export function RotaBoard() {
  const { state, day, now } = useApp();
  if (!state) return null;
  const t = now();
  const ss = state.sessions.filter((s) => s.day === day);
  if (!ss.length) return <Empty>No sessions on this day.</Empty>;
  let from = Math.min(...ss.map((s) => Core.busyWindow(s, state.settings)[0]));
  let to = Math.max(...ss.map((s) => s.end));
  from = Math.floor(from / 900000) * 900000;
  const slots: number[] = [];
  for (let x = from; x < to; x += 900000) slots.push(x);
  const nowIdx = slots.findIndex((s) => t >= s && t < s + 900000);
  const free = slots.map(() => 0);
  const rows = state.team.map((m) => ({ m, cells: slots.map((s, i) => { const v = Core.prStateAt(state, m.name, s + 1000, day); if (!v) free[i]!++; return v; }) }));
  const cellCls = (v: string) => (v === "S" ? "bg-primary" : "");
  const nowCls = "shadow-[inset_2px_0_0_var(--color-orange),inset_-2px_0_0_var(--color-orange)]";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Team timeline</CardTitle>
        <CardDescription>15-minute blocks. Blue = with a speaker (from {state.settings.arriveMin} min before the session until they walk on stage). Empty = free time.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline"><i className="size-2.5 rounded-sm bg-primary" />With speakers</Badge>
          <Badge variant="outline"><i className="size-2.5 rounded-sm border" />Free</Badge>
          {nowIdx >= 0 && <Badge variant="outline"><i className="size-2.5 rounded-sm bg-orange" />Now</Badge>}
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-24 bg-card px-2 text-left font-medium text-muted-foreground md:min-w-40">PR</th>
                {slots.map((s, i) => { const top = hm24(s).slice(3) === "00"; return <th key={s} className={cn("h-7 min-w-5 font-medium text-muted-foreground", top && "border-l", i === nowIdx && nowCls)}>{top ? hourLabel(s) : ""}</th>; })}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, cells }) => (
                <tr key={m.name} className="border-t">
                  <td className="sticky left-0 z-10 bg-card px-2 text-xs font-medium whitespace-nowrap"><span className="md:hidden">{shortName(m.name)}</span><span className="hidden md:inline">{m.name}</span></td>
                  {cells.map((v, i) => <td key={i} title={hm(slots[i])} className={cn("h-8 min-w-5 border-r border-border/40", cellCls(v), hm24(slots[i]).slice(3) === "00" && "border-l", i === nowIdx && nowCls)} />)}
                </tr>
              ))}
              <tr className="border-t">
                <td className="sticky left-0 z-10 bg-card px-2 text-xs font-semibold">Free</td>
                {free.map((f, i) => <td key={i} className="text-center text-muted-foreground">{f}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- admin views ----------
function Stat({ n, label, hot }: { n: number; label: string; hot?: boolean }) {
  const alarm = hot && n > 0;
  return (
    <Card size="sm" className={cn(alarm && "ring-2 ring-destructive")}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("text-2xl tabular-nums", alarm && "text-destructive")}>{n}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export function LiveView() {
  const { state, day, now } = useApp();
  const modal = useModal();
  if (!state) return null;
  const t = now();
  const c = Core.counts(state, day, t);
  const openInc = state.incidents.filter((i) => i.status === "open");
  const clashes = state.sessions.filter((s) => s.day === day && !["OK", "NO_PR"].includes(Core.rotaCheck(state, s))).length;
  const noPr = state.people.filter((p) => Core.sessionById(state, p.sid)?.day === day && !Core.prOf(state, p)).length;
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Stat n={c.LATE + c.TAKE_BACKSTAGE} label="Late" hot /><Stat n={c.CALLNOW} label="Call now" hot /><Stat n={openInc.length} label="Issues" hot /><Stat n={clashes + noPr} label="PR problems" hot />
        <Stat n={c.NOTCALLED} label="Not called" /><Stat n={c.CONFIRMED} label="En route" /><Stat n={c.ARRIVED + c.BACKSTAGE} label="Arrived" /><Stat n={c.DONE} label="Done" />
      </div>
      <div className="grid gap-x-4 lg:grid-cols-2">
        <div>
          <SectionTitle count={att.length}>Needs attention</SectionTitle>
          {att.length ? (
            <ListCard>
              {att.slice(0, 25).map(({ p, s, code }) => {
                const S = Core.STATUS[code];
                const prName = Core.prOf(state, p);
                const owner = Core.memberByName(state, prName);
                return (
                  <Fragment key={p.id}>
                    <Dot tone={S.tone} /><Time t={s.start} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{p.name}</div>
                      <div className={cn("text-xs font-medium", TONE_TEXT[S.tone])}>{S.label}{p.eta ? ` · ETA ${p.eta}` : ""}</div>
                      <div className="truncate text-xs text-muted-foreground">{s.title} · PR {prName || "–"}</div>
                    </div>
                    {p.phone && <CallLink phone={p.phone} title="Call speaker" />}
                    {owner?.phone && <CallLink phone={owner.phone} label="PR" title={`Call ${owner.name}`} />}
                    <Button variant="ghost" size="icon" onClick={() => modal.open({ kind: "person", pid: p.id })}><Ellipsis /></Button>
                  </Fragment>
                );
              })}
            </ListCard>
          ) : <Empty>All good – nobody late or unreached.</Empty>}
          <SectionTitle count={openInc.length}>Open issues</SectionTitle>
          <IncidentList admin={false} />
        </div>
        <div>
          <SectionTitle>Now &amp; next</SectionTitle>
          {upcoming.length ? upcoming.map((s) => <SessionCard key={s.id} s={s} manage />) : <Empty>No more sessions today.</Empty>}
          <SectionTitle>Team {today ? "right now" : ""}</SectionTitle>
          <ListCard>
            {state.team.map((m) => {
              const cur = today ? Core.prCurrentSession(state, m.name, t) : null;
              const n = state.people.filter((p) => Core.sessionById(state, p.sid)?.day === day && Core.prOf(state, p) === m.name).length;
              const label = cur ? `On duty · ${cur.title}` : today ? `Free · ${n} speakers today` : `${n} speakers`;
              return (
                <Fragment key={m.name}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-medium">{m.name}{m.guest && <Badge variant="outline">Guest</Badge>}</div>
                    <div className={cn("truncate text-xs text-muted-foreground", !cur && today && "text-st-ok")}>{label}</div>
                  </div>
                  {m.phone && <><CallLink phone={m.phone} /><WhatsAppLink phone={m.phone} /></>}
                </Fragment>
              );
            })}
          </ListCard>
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
      <Card className="mb-3">
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>Each speaker has their own PR, given out in rotation. Open a session to change a PR with the menu under the speaker.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => modal.open({ kind: "sessionEdit" })}><Plus /> New session</Button>
            <Button variant="outline" onClick={() => modal.open({ kind: "autoAssign" })}><Repeat /> Assign in rotation</Button>
          </div>
          <CheckStatus />
        </CardContent>
      </Card>
      {sessionsOfDay(state, day).map((s) => <SessionCard key={s.id} s={s} manage />)}
    </>
  );
}

export function TeamAdminView() {
  const { state, day } = useApp();
  const modal = useModal();
  if (!state) return null;
  return (
    <>
      <DaySwitch />
      <RotaBoard />
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Team · {dayLabel(state, day)}</CardTitle>
          <CardDescription>{state.team.length} people · rotation goes in this order. Admin PIN: <code className="rounded bg-muted px-1.5 py-0.5">{state.settings.adminPin}</code></CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => modal.open({ kind: "member" })}><UserPlus /> Add member</Button>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Order</TableHead><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Speakers</TableHead><TableHead>PIN</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {state.team.map((m, idx) => {
                const mp = state.people.filter((p) => Core.sessionById(state, p.sid)?.day === day && Core.prOf(state, p) === m.name);
                const clash = mp.some((p) => Core.personRota(state, p) === "SAME_PANEL");
                return (
                  <TableRow key={m.name}>
                    <TableCell className="text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                    <TableCell className="font-medium"><div className="flex items-center gap-1.5">{m.name}{m.guest && <Badge variant="outline">Guest</Badge>}{clash && <Badge variant="destructive">2 on a panel</Badge>}</div></TableCell>
                    <TableCell className="tabular-nums">{m.phone || "–"}</TableCell>
                    <TableCell>{mp.length}</TableCell>
                    <TableCell><code className="rounded bg-muted px-1.5 py-0.5">{m.pin}</code></TableCell>
                    <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => modal.open({ kind: "member", name: m.name })}><Pencil /> Edit</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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
  const save = async () => {
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
      <Card>
        <CardHeader>
          <CardTitle>Paste today&apos;s speaker phone list</CardTitle>
          <CardDescription>One per line: name and number – straight from Excel or WhatsApp. Typos are fine.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Maged Ghoneima, 01001234567\nAlison Cossette\t+20 100 765 4321"} />
          <div className="flex gap-2">
            <Button onClick={() => setPreview(Core.previewPhones(state, text))}>Check matches</Button>
            {preview && <Button variant="outline" onClick={save}>Save {preview.filter((r) => r.matches.length && r.phone).length} matched</Button>}
          </div>
          {preview && (
            <Table>
              <TableHeader><TableRow><TableHead>Pasted name</TableHead><TableHead>Phone</TableHead><TableHead>Matched to</TableHead></TableRow></TableHeader>
              <TableBody>
                {preview.map((r, i) => {
                  const items = [{ value: "__none__", label: "Not matched" }, ...sorted.map((p) => { const s = Core.sessionById(state, p.sid)!; return { value: p.id, label: `${p.name} · ${hm(s.start)} ${dayLabel(state, s.day).slice(0, 3)}` }; })];
                  return (
                    <TableRow key={i}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.phone || <Badge variant="destructive">No number</Badge>}</TableCell>
                      <TableCell>
                        <Select value={r.matches[0] || "__none__"} items={items} onValueChange={(v) => setPreview(preview.map((x, j) => (j === i ? { ...x, matches: v && v !== "__none__" ? [String(v)] : [] } : x)))}>
                          <SelectTrigger className={cn("w-full", !r.matches.length && "border-destructive")}><SelectValue /></SelectTrigger>
                          <SelectContent>{items.map((it) => <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>)}</SelectContent>
                        </Select>
                        {r.matches.length > 1 && <p className="mt-1 text-xs text-muted-foreground">In {r.matches.length} sessions – saved to all</p>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <div className="mt-6"><DaySwitch /></div>
      <SectionTitle count={missing.length}>Still missing a phone</SectionTitle>
      {missing.length ? (
        <ListCard>
          {missing.map((p) => {
            const s = Core.sessionById(state, p.sid)!;
            return (
              <Fragment key={p.id}>
                <Time t={s.start} />
                <div className="min-w-0 flex-1"><div className="font-medium">{p.name}</div><div className="truncate text-xs text-muted-foreground">{s.title} · PR {Core.prOf(state, p) || "–"}</div></div>
                <Input type="tel" placeholder="01…" className="w-36" value={inline[p.id] ?? ""} onChange={(e) => setInline({ ...inline, [p.id]: e.target.value })} />
                <Button onClick={() => { if (inline[p.id]) void act({ type: "phone", pid: p.id, phone: inline[p.id] }, "Saved"); }}>Save</Button>
              </Fragment>
            );
          })}
        </ListCard>
      ) : <Empty>Everyone has a number.</Empty>}
    </>
  );
}

export function IssuesView() {
  const modal = useModal();
  return (
    <>
      <SectionTitle action={<Button variant="destructive" onClick={() => modal.open({ kind: "incident" })}><Plus /> Log issue</Button>}>Issues</SectionTitle>
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
      <SectionTitle count={log.length}>Activity</SectionTitle>
      {log.length ? (
        <ListCard>
          {log.map((e, i) => (
            <Fragment key={i}><Time t={e.ts} /><div className="min-w-0 flex-1 text-sm">{e.text}</div><Badge variant="outline">{e.by}</Badge></Fragment>
          ))}
        </ListCard>
      ) : <Empty>Nothing yet.</Empty>}
    </>
  );
}
