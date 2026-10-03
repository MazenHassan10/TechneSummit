"use client";

import * as Core from "@great-hall-pr/core";
import { Button } from "@great-hall-pr/ui/components/button";
import { Checkbox } from "@great-hall-pr/ui/components/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@great-hall-pr/ui/components/dialog";
import { Input } from "@great-hall-pr/ui/components/input";
import { Label } from "@great-hall-pr/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@great-hall-pr/ui/components/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@great-hall-pr/ui/components/sheet";
import { Textarea } from "@great-hall-pr/ui/components/textarea";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { Separator } from "@great-hall-pr/ui/components/separator";
import { Eraser, Flag, Pencil, Repeat, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { dayOf, hm, hm24 } from "./format";
import { useApp } from "./store";
import { CallLink, prOptions, TONE_TEXT, useModal, type ModalSpec } from "./ui";
import { ask } from "./confirm";
import { dayLabel, LeaderCard, SessionSelect } from "./views";
import { AgendaChangesDialog, NotificationToggle } from "./agenda-watch";
import { SpeakerWhatsApp, WaReminder } from "./wa-reminder";

const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2"><Label>{label}</Label>{children}</div>
);

function Pick({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(String(v ?? ""))} items={options}>
      <SelectTrigger className="w-full min-w-0"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function Modals({ spec }: { spec: ModalSpec | null }) {
  const modal = useModal();
  if (!spec) return null;
  const onOpenChange = (o: boolean) => { if (!o) modal.close(); };
  if (spec.kind === "person") {
    return (
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto sm:mx-auto sm:max-w-xl"><PersonSheet pid={spec.pid} /></SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        {spec.kind === "personEdit" && <PersonEdit pid={spec.pid} sid={spec.sid} />}
        {spec.kind === "sessionEdit" && <SessionEdit sid={spec.sid} />}
        {spec.kind === "member" && <MemberEdit name={spec.name} />}
        {spec.kind === "incident" && <IncidentForm sid={spec.sid} pid={spec.pid} note={spec.note} />}
        {spec.kind === "autoAssign" && <AutoAssign />}
        {spec.kind === "waReminder" && <WaReminder pid={spec.pid} />}
        {spec.kind === "agendaChanges" && <AgendaChangesDialog />}
        {spec.kind === "menu" && <Menu />}
      </DialogContent>
    </Dialog>
  );
}

function PersonSheet({ pid }: { pid: string }) {
  const { state, me, act, now } = useApp();
  const modal = useModal();
  const p = state ? Core.personById(state, pid) : null;
  const [phone, setPhone] = useState(p?.phone ?? "");
  const [eta, setEta] = useState(p?.eta ?? "");
  const [note, setNote] = useState(p?.notes ?? "");
  const s = state && p ? Core.sessionById(state, p.sid) : undefined;
  if (!state || !me || !p || !s) return <SheetHeader><SheetTitle>Removed</SheetTitle></SheetHeader>;
  const S = Core.STATUS[Core.personStatus(p, s, state.settings, now())];
  const d = Core.deadlines(s, state.settings);
  return (
    <div className="space-y-4 px-4 pb-6">
      <SheetHeader className="px-0">
        <SheetTitle>{p.name}</SheetTitle>
        <SheetDescription>{p.role} · {hm(s.start)} {s.title} · PR {Core.prOf(state, p) || "–"}</SheetDescription>
      </SheetHeader>
      <div className={cn("text-sm font-semibold", TONE_TEXT[S.tone])}>{S.label}</div>
      <div className="text-xs text-muted-foreground">Call by {hm(d.callBy)}{dayOf(d.callBy) !== s.day ? " (day before)" : ""} · ETA call {hm(d.etaBy)} · arrive {hm(d.arriveBy)} · backstage {hm(d.backstageBy)}</div>
      {me.admin && <F label="Phone">
        <div className="flex gap-2"><Input type="tel"  value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01…" /><Button onClick={() => void act({ type: "phone", pid, phone }, "Phone saved")}>Save</Button></div>
      </F>}
      {p.phone && <div className="flex gap-2"><CallLink phone={p.phone} label={`Call ${p.phone}`} /><SpeakerWhatsApp p={p} label="WhatsApp" /></div>}
      <F label="ETA they gave you">
        <div className="flex gap-2"><Input  value={eta} onChange={(e) => setEta(e.target.value)} placeholder="e.g. 12:20 / 10 min away" /><Button onClick={() => void act({ type: "eta", pid, text: eta }, "ETA saved")}>Save</Button></div>
      </F>
      <F label="Notes">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Needs clicker, coming with assistant…" />
        <Button variant="outline" size="sm" onClick={() => void act({ type: "note", pid, text: note }, "Note saved")}>Save note</Button>
      </F>
      <div className="flex flex-wrap gap-2">
        <Button variant={p.noshow ? "outline" : "destructive"}
          onClick={async () => { if (!p.noshow && !(await ask({ title: `Mark ${p.name} as NO-SHOW?`, description: "The Team Leader will be alerted.", confirmLabel: "Mark no-show", destructive: true }))) return; void act({ type: "noshow", pid, value: !p.noshow }); }}>
          {p.noshow ? "Undo no-show" : "Mark NO-SHOW"}
        </Button>
        <Button variant="outline" onClick={() => modal.open({ kind: "incident", sid: p.sid, pid: p.id, note: `${p.name}: ` })}><Flag /> Report issue</Button>
        {me.admin && <Button variant="outline" onClick={() => modal.open({ kind: "personEdit", pid })}><Pencil /> Edit</Button>}
      </div>
      {p.updatedBy && <p className="text-xs text-muted-foreground">Last update by {p.updatedBy} at {hm(p.updatedAt)}</p>}
    </div>
  );
}

function PersonEdit({ pid, sid }: { pid?: string; sid?: string }) {
  const { state, act } = useApp();
  const modal = useModal();
  const p = pid && state ? Core.personById(state, pid) : null;
  const [name, setName] = useState(p?.name ?? "");
  const [role, setRole] = useState(p?.role ?? "Speaker");
  const [phone, setPhone] = useState(p?.phone ?? "");
  const [alert, setAlert] = useState(p?.alert ?? "");
  const [pr, setPr] = useState(p && state ? Core.prOf(state, p) : "");
  const [session, setSession] = useState(p?.sid ?? sid ?? "");
  if (!state) return null;
  const save = async () => {
    const r = await act({ type: "savePerson", pid, sid: session, name: name.trim(), role, phone, pr, alert: alert.trim() }, "Saved");
    if (r.ok) modal.close();
  };
  return (
    <>
      <DialogHeader><DialogTitle>{pid ? "Edit person" : "Add person"}</DialogTitle></DialogHeader>
      <F label="Name"><Input  value={name} onChange={(e) => setName(e.target.value)} /></F>
      <F label="Role"><Pick value={role} onChange={setRole} options={Core.ROLES.map((r) => ({ value: r, label: r }))} /></F>
      <F label="Phone"><Input type="tel"  value={phone} onChange={(e) => setPhone(e.target.value)} /></F>
      <F label="Heads-up for the PR (optional)"><Input value={alert} onChange={(e) => setAlert(e.target.value)} placeholder="e.g. WhatsApp only – UK number" /></F>
      <F label="PR for this speaker"><Pick value={pr || "__none__"} onChange={(v) => setPr(v === "__none__" ? "" : v)} options={prOptions(state, "– no PR yet –", "__none__")} /></F>
      <F label="Session"><SessionSelect value={session} onChange={setSession} sessions={[...state.sessions].sort((a, b) => a.start - b.start)} allowNone={false} /></F>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={save}>Save</Button>
        {pid && <Button variant="destructive" size="lg" onClick={async () => { if (!(await ask({ title: `Delete ${name || "this person"}?`, description: "They will be removed from the session on everyone's screen.", confirmLabel: "Delete", destructive: true }))) return; const r = await act({ type: "deletePerson", pid }, "Deleted"); if (r.ok) modal.close(); }}>Delete</Button>}
      </div>
    </>
  );
}

function SessionEdit({ sid }: { sid?: string }) {
  const { state, day, setDay, act } = useApp();
  const modal = useModal();
  const s = sid && state ? Core.sessionById(state, sid) : null;
  const [title, setTitle] = useState(s?.title ?? "");
  const [type, setType] = useState(s?.type ?? "Panel");
  const [sday, setSday] = useState(s?.day ?? day);
  const [start, setStart] = useState(s ? hm24(s.start) : "");
  const [end, setEnd] = useState(s ? hm24(s.end) : "");
  if (!state) return null;
  const types = Core.SESSION_TYPES.includes(type) ? Core.SESSION_TYPES : [type, ...Core.SESSION_TYPES];
  const save = async () => {
    const r = await act({ type: "saveSession", sid: sid || "", title, stype: type, day: sday, startHHMM: start, endHHMM: end }, sid ? "Session updated" : "Session created");
    if (r.ok) { if (!sid) setDay(sday); modal.close(); }
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>{sid ? "Edit session" : "New session"}</DialogTitle>
        <DialogDescription>{sid ? "Deadlines and the PRs' screens update automatically." : "Add a panel / talk that was added to the agenda."}</DialogDescription>
      </DialogHeader>
      <F label="Title"><Input  value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fintech Panel" /></F>
      <div className="grid grid-cols-2 gap-4">
        <F label="Type"><Pick value={type} onChange={setType} options={types.map((x) => ({ value: x, label: x }))} /></F>
        <F label="Day"><Pick value={sday} onChange={setSday} options={[state.settings.day1, state.settings.day2].map((d) => ({ value: d, label: dayLabel(state, d) }))} /></F>
        <F label="Start"><Input type="time"  value={start} onChange={(e) => setStart(e.target.value)} /></F>
        <F label="End"><Input type="time"  value={end} onChange={(e) => setEnd(e.target.value)} /></F>
      </div>
      <p className="text-xs text-muted-foreground">PRs are assigned per speaker – add speakers after creating the session.</p>
      <Button className="w-full" size="lg" onClick={save}>{sid ? "Save changes" : "Create session"}</Button>
      {sid && (
        <Button variant="destructive" size="lg" className="w-full" onClick={async () => {
          if (!(await ask({ title: "Cancel this session?", description: "It and its speakers will be removed from everyone's screen.", confirmLabel: "Cancel session", cancelLabel: "Keep it", destructive: true }))) return;
          const r = await act({ type: "deleteSession", sid }, "Session cancelled");
          if (r.ok) modal.close();
        }}>Cancel this session</Button>
      )}
    </>
  );
}

function MemberEdit({ name }: { name?: string }) {
  const { state, act } = useApp();
  const modal = useModal();
  const m = name && state ? Core.memberByName(state, name) : null;
  const [nm, setNm] = useState(m?.name ?? "");
  const [phone, setPhone] = useState(m?.phone ?? "");
  const [pin, setPin] = useState(m?.pin ?? "");
  const [guest, setGuest] = useState(m ? m.guest : true);
  const [role, setRole] = useState<string>(m?.role ?? "pr");
  const save = async () => {
    const r = await act({ type: "saveMember", origName: name || "", name: nm, phone, pin, guest: role === "manager" ? false : guest, role });
    if (r.ok) { const res = r.result as { name: string; pin: string }; toast.success(`${name ? "Saved" : "Added"} ${res.name} – PIN ${res.pin}`); modal.close(); }
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>{name ? "Edit team member" : "Add team member"}</DialogTitle>
        <DialogDescription>They log in with this name + PIN. Guests can be removed after their sessions.</DialogDescription>
      </DialogHeader>
      <F label="Name (shown on login screen)"><Input  value={nm} onChange={(e) => setNm(e.target.value)} placeholder="e.g. Omar Adel" /></F>
      <F label="Phone"><Input type="tel"  value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01…" /></F>
      <F label="PIN (4–8 digits – leave empty to auto-create)"><Input inputMode="numeric" maxLength={8}  value={pin} onChange={(e) => setPin(e.target.value)} /></F>
      <F label="Role"><Pick value={role} onChange={setRole} options={[{ value: "pr", label: "PR (in the rotation)" }, { value: "manager", label: "Manager (view only)" }]} /></F>
      {role === "manager"
        ? <p className="text-xs text-muted-foreground">Managers see the dashboard, sessions, agenda, team and issues like you, but every button that changes something is off. They are never given speakers.</p>
        : <label className="flex items-center gap-2 text-sm"><Checkbox checked={guest} onCheckedChange={(v) => setGuest(!!v)} /> Guest (helping for a few sessions)</label>}
      <Button className="w-full" size="lg" onClick={save}>{name ? "Save" : "Add to team"}</Button>
      {name && (
        <Button variant="destructive" size="lg" className="w-full" onClick={async () => {
          if (!(await ask({ title: `Remove ${name} from the team?`, description: "Their speakers will have no PR until you reassign them.", confirmLabel: "Remove", destructive: true }))) return;
          const r = await act({ type: "removeMember", name });
          if (r.ok) { const n = r.result as number; n ? toast.warning(`${n} speaker(s) need a new PR – check Sessions`) : toast.success("Removed"); modal.close(); }
        }}>Remove from team</Button>
      )}
    </>
  );
}

function IncidentForm({ sid, pid, note }: { sid?: string; pid?: string; note?: string }) {
  const { state, act } = useApp();
  const modal = useModal();
  const [kind, setKind] = useState(Core.INCIDENT_KINDS[0]!);
  const [session, setSession] = useState(sid ?? "");
  const [text, setText] = useState(note ?? "");
  if (!state) return null;
  return (
    <>
      <DialogHeader><DialogTitle>Report issue</DialogTitle></DialogHeader>
      <F label="What happened?"><Pick value={kind} onChange={setKind} options={Core.INCIDENT_KINDS.map((k) => ({ value: k, label: k }))} /></F>
      <F label="Session"><SessionSelect value={session} onChange={setSession} sessions={[...state.sessions].sort((a, b) => a.start - b.start)} /></F>
      <F label="Details"><Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} /></F>
      <Button variant="destructive" size="lg" className="w-full" onClick={async () => {
        const r = await act({ type: "incident", kind, sid: session, pid: pid || "", note: text }, "Sent to Team Leader");
        if (r.ok) modal.close();
      }}>Send</Button>
    </>
  );
}

function AutoAssign() {
  const { state, day, act } = useApp();
  const modal = useModal();
  if (!state) return null;
  const label = dayLabel(state, day);
  const assigned = state.people.filter((p) => Core.sessionById(state, p.sid)?.day === day && Core.prOf(state, p)).length;
  const total = state.people.filter((p) => Core.sessionById(state, p.sid)?.day === day).length;
  const clear = async () => {
    if (!(await ask({ title: `Clear all PRs on ${label}?`, description: `${assigned} speaker(s) lose their PR. Then pick the special requests by hand and press “Fill the rest”.`, confirmLabel: "Clear all", destructive: true }))) return;
    const r = await act({ type: "clearPrs", day });
    if (r.ok) toast.success(`Cleared ${r.result} speaker(s)`);
  };
  const run = async (all: boolean) => {
    if (all && !(await ask({ title: `Re-assign all speakers on ${label}?`, description: "Every speaker gets a PR in strict rotation again – choices made by hand on this day are replaced.", confirmLabel: "Re-assign", destructive: true }))) return;
    const r = await act({ type: "autoAssign", day, onlyUnassigned: !all });
    if (r.ok) { toast.success(`${r.result} speaker(s) assigned`); modal.close(); }
  };
  const order = Core.prTeam(state).map((m, i) => `${i + 1}. ${m.name}`).join("  ");
  return (
    <>
      <DialogHeader>
        <DialogTitle>Assign PRs – {label}</DialogTitle>
        <DialogDescription>{assigned} of {total} speakers have a PR.</DialogDescription>
      </DialogHeader>
      <ol className="space-y-1.5 text-sm">
        <li><b>1.</b> Clear all PRs for the day.</li>
        <li><b>2.</b> Pick the PRs who asked for a specific speaker – open the session and use the PR menu under the speaker.</li>
        <li><b>3.</b> Fill the rest: your picks stay, nobody gets two speakers on one panel, PRs busy with another speaker at that time are skipped, then the PR with the fewest speakers gets the next one (in team order).</li>
      </ol>
      <Button variant="destructive" size="lg" className="w-full" disabled={!assigned} onClick={clear}><Eraser />1. Clear all PRs</Button>
      <Button size="lg" className="w-full" disabled={assigned === total} onClick={() => run(false)}><Repeat />3. Fill the rest ({total - assigned})</Button>
      <Separator />
      <Button variant="outline" size="lg" className="w-full" onClick={() => run(true)}>Re-assign the whole day in strict rotation</Button>
      <p className="text-xs text-muted-foreground">Team order: {order}</p>
    </>
  );
}

function Menu() {
  const { me, refresh, logout } = useApp();
  const modal = useModal();
  return (
    <>
      <DialogHeader>
        <DialogTitle>{me?.name}</DialogTitle>
        <DialogDescription>{me?.admin ? "Team Leader · admin" : me?.manager ? "Manager · view only" : "Great Hall PR"}</DialogDescription>
      </DialogHeader>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => { refresh(); modal.close(); }}>↻ Refresh now</Button>
        <Button variant="destructive" onClick={() => { modal.close(); logout(); }}>Log out</Button>
      </div>
      <NotificationToggle />
      {!me?.admin && <LeaderCard />}
      <p className="text-xs text-muted-foreground">Updates every few seconds. Green dot = live, red = offline.</p>
    </>
  );
}
