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
import { useState } from "react";
import { toast } from "sonner";

import { hm, hm24 } from "./format";
import { useApp } from "./store";
import { BrandButton, CallLink, TONE_TEXT, useModal, type ModalSpec, WhatsAppLink } from "./ui";
import { dayLabel, SessionSelect } from "./views";

const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mt-3"><Label className="mb-1.5 text-xs text-muted-foreground">{label}</Label>{children}</div>
);

function Pick({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(String(v ?? ""))} items={options}>
      <SelectTrigger className="h-10 w-full rounded-lg bg-white"><SelectValue /></SelectTrigger>
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
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl border-t-4 border-t-brand sm:mx-auto sm:max-w-xl"><PersonSheet pid={spec.pid} /></SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-t-4 border-t-brand sm:max-w-lg">
        {spec.kind === "personEdit" && <PersonEdit pid={spec.pid} sid={spec.sid} />}
        {spec.kind === "sessionEdit" && <SessionEdit sid={spec.sid} />}
        {spec.kind === "member" && <MemberEdit name={spec.name} />}
        {spec.kind === "incident" && <IncidentForm sid={spec.sid} pid={spec.pid} note={spec.note} />}
        {spec.kind === "autoAssign" && <AutoAssign />}
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
  if (!state || !me || !p) return <SheetHeader><SheetTitle>Removed</SheetTitle></SheetHeader>;
  const s = Core.sessionById(state, p.sid)!;
  const S = Core.STATUS[Core.personStatus(p, s, state.settings, now())];
  const d = Core.deadlines(s, state.settings);
  return (
    <div className="px-4 pb-6">
      <SheetHeader className="px-0">
        <SheetTitle className="text-lg text-navy">{p.name}</SheetTitle>
        <SheetDescription>{p.role} · {hm(s.start)} {s.title} · PR {Core.prOf(state, p) || "–"}</SheetDescription>
      </SheetHeader>
      <div className={cn("text-sm font-semibold", TONE_TEXT[S.tone])}>{S.label}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">Call by {hm(d.callBy)} (day before) · ETA call {hm(d.etaBy)} · arrive {hm(d.arriveBy)} · backstage {hm(d.backstageBy)}</div>
      <F label="Phone">
        <div className="flex gap-2"><Input type="tel" className="h-10 bg-white" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01…" /><BrandButton className="h-10" onClick={() => void act({ type: "phone", pid, phone }, "Phone saved")}>Save</BrandButton></div>
      </F>
      {p.phone && <div className="mt-2 flex gap-2"><CallLink phone={p.phone} className="w-auto gap-1.5 px-3 text-sm font-semibold">📞 Call {p.phone}</CallLink><WhatsAppLink phone={p.phone} className="w-auto px-3" /></div>}
      <F label="ETA they gave you">
        <div className="flex gap-2"><Input className="h-10 bg-white" value={eta} onChange={(e) => setEta(e.target.value)} placeholder="e.g. 12:20 / 10 min away" /><BrandButton className="h-10" onClick={() => void act({ type: "eta", pid, text: eta }, "ETA saved")}>Save</BrandButton></div>
      </F>
      <F label="Notes">
        <Textarea rows={2} className="bg-white" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Needs clicker, coming with assistant…" />
        <Button variant="outline" className="mt-2 h-9 rounded-full border-brand text-brand" onClick={() => void act({ type: "note", pid, text: note }, "Note saved")}>Save note</Button>
      </F>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button className={cn("h-10 rounded-full", p.noshow ? "" : "bg-st-urgent text-white hover:bg-st-urgent/90")} variant={p.noshow ? "outline" : "default"}
          onClick={() => { if (!p.noshow && !confirm("Mark as NO-SHOW? The Team Leader will be alerted.")) return; void act({ type: "noshow", pid, value: !p.noshow }); }}>
          {p.noshow ? "Undo no-show" : "Mark NO-SHOW"}
        </Button>
        <Button variant="outline" className="h-10 rounded-full border-brand text-brand" onClick={() => modal.open({ kind: "incident", sid: p.sid, pid: p.id, note: `${p.name}: ` })}>⚠ Report issue</Button>
        {me.admin && <Button variant="outline" className="h-10 rounded-full border-brand text-brand" onClick={() => modal.open({ kind: "personEdit", pid })}>✎ Edit</Button>}
      </div>
      {p.updatedBy && <p className="mt-3 text-[11px] text-muted-foreground">Last update by {p.updatedBy} at {hm(p.updatedAt)}</p>}
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
  const [pr, setPr] = useState(p && state ? Core.prOf(state, p) : "");
  const [session, setSession] = useState(p?.sid ?? sid ?? "");
  if (!state) return null;
  const save = async () => {
    const r = await act({ type: "savePerson", pid, sid: session, name: name.trim(), role, phone, pr }, "Saved");
    if (r.ok) modal.close();
  };
  return (
    <>
      <DialogHeader><DialogTitle className="text-navy">{pid ? "Edit person" : "Add person"}</DialogTitle></DialogHeader>
      <F label="Name"><Input className="h-10 bg-white" value={name} onChange={(e) => setName(e.target.value)} /></F>
      <F label="Role"><Pick value={role} onChange={setRole} options={Core.ROLES.map((r) => ({ value: r, label: r }))} /></F>
      <F label="Phone"><Input type="tel" className="h-10 bg-white" value={phone} onChange={(e) => setPhone(e.target.value)} /></F>
      <F label="PR for this speaker"><Pick value={pr || "__none__"} onChange={(v) => setPr(v === "__none__" ? "" : v)} options={[{ value: "__none__", label: "– no PR yet –" }, ...state.team.map((m) => ({ value: m.name, label: m.name }))]} /></F>
      <F label="Session"><SessionSelect value={session} onChange={setSession} sessions={[...state.sessions].sort((a, b) => a.start - b.start)} allowNone={false} /></F>
      <div className="mt-4 flex gap-2">
        <BrandButton className="flex-1" onClick={save}>Save</BrandButton>
        {pid && <Button className="h-11 rounded-full bg-st-urgent text-white" onClick={async () => { if (!confirm("Delete this person?")) return; const r = await act({ type: "deletePerson", pid }, "Deleted"); if (r.ok) modal.close(); }}>Delete</Button>}
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
        <DialogTitle className="text-navy">{sid ? "Edit session" : "New session"}</DialogTitle>
        <DialogDescription>{sid ? "Deadlines and the PRs' screens update automatically." : "Add a panel / talk that was added to the agenda."}</DialogDescription>
      </DialogHeader>
      <F label="Title"><Input className="h-10 bg-white" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fintech Panel" /></F>
      <div className="grid grid-cols-2 gap-3">
        <F label="Type"><Pick value={type} onChange={setType} options={types.map((x) => ({ value: x, label: x }))} /></F>
        <F label="Day"><Pick value={sday} onChange={setSday} options={[state.settings.day1, state.settings.day2].map((d) => ({ value: d, label: dayLabel(state, d) }))} /></F>
        <F label="Start"><Input type="time" className="h-10 bg-white" value={start} onChange={(e) => setStart(e.target.value)} /></F>
        <F label="End"><Input type="time" className="h-10 bg-white" value={end} onChange={(e) => setEnd(e.target.value)} /></F>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">PRs are assigned per speaker – add speakers after creating the session.</p>
      <BrandButton className="mt-4 w-full" onClick={save}>{sid ? "Save changes" : "Create session"}</BrandButton>
      {sid && (
        <Button className="mt-2 h-11 w-full rounded-full bg-st-urgent text-white" onClick={async () => {
          if (!confirm("Cancel this session? It and its speakers will be removed from everyone's screen.")) return;
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
  const [l1, setL1] = useState(m?.lunch1 ?? "");
  const [l2, setL2] = useState(m?.lunch2 ?? "");
  const [guest, setGuest] = useState(m ? m.guest : true);
  const save = async () => {
    const r = await act({ type: "saveMember", origName: name || "", name: nm, phone, pin, lunch1: l1, lunch2: l2, guest });
    if (r.ok) { const res = r.result as { name: string; pin: string }; toast.success(`${name ? "Saved" : "Added"} ${res.name} – PIN ${res.pin}`); modal.close(); }
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-navy">{name ? "Edit team member" : "Add team member"}</DialogTitle>
        <DialogDescription>They log in with this name + PIN. Guests can be removed after their sessions.</DialogDescription>
      </DialogHeader>
      <F label="Name (shown on login screen)"><Input className="h-10 bg-white" value={nm} onChange={(e) => setNm(e.target.value)} placeholder="e.g. Omar Adel" /></F>
      <F label="Phone"><Input type="tel" className="h-10 bg-white" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01…" /></F>
      <F label="PIN (4–8 digits – leave empty to auto-create)"><Input inputMode="numeric" maxLength={8} className="h-10 bg-white" value={pin} onChange={(e) => setPin(e.target.value)} /></F>
      <div className="grid grid-cols-2 gap-3">
        <F label="Lunch Sat (optional)"><Input type="time" step={900} className="h-10 bg-white" value={l1} onChange={(e) => setL1(e.target.value)} /></F>
        <F label="Lunch Sun (optional)"><Input type="time" step={900} className="h-10 bg-white" value={l2} onChange={(e) => setL2(e.target.value)} /></F>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm"><Checkbox checked={guest} onCheckedChange={(v) => setGuest(!!v)} /> Guest (helping for a few sessions)</label>
      <BrandButton className="mt-4 w-full" onClick={save}>{name ? "Save" : "Add to team"}</BrandButton>
      {name && (
        <Button className="mt-2 h-11 w-full rounded-full bg-st-urgent text-white" onClick={async () => {
          if (!confirm(`Remove ${name} from the team? Their speakers will have no PR until you reassign them.`)) return;
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
      <DialogHeader><DialogTitle className="text-navy">Report issue</DialogTitle></DialogHeader>
      <F label="What happened?"><Pick value={kind} onChange={setKind} options={Core.INCIDENT_KINDS.map((k) => ({ value: k, label: k }))} /></F>
      <F label="Session"><SessionSelect value={session} onChange={setSession} sessions={[...state.sessions].sort((a, b) => a.start - b.start)} /></F>
      <F label="Details"><Textarea rows={3} className="bg-white" value={text} onChange={(e) => setText(e.target.value)} /></F>
      <Button className="mt-4 h-11 w-full rounded-full bg-st-urgent text-white" onClick={async () => {
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
  const run = async (all: boolean) => {
    if (all && !confirm(`Re-assign ALL speakers on ${dayLabel(state, day)}? Your manual changes on this day will be replaced.`)) return;
    const r = await act({ type: "autoAssign", day, onlyUnassigned: !all });
    if (r.ok) { toast.success(`${r.result} speaker(s) assigned`); modal.close(); }
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-navy">⚡ Auto-assign PRs – {dayLabel(state, day)}</DialogTitle>
        <DialogDescription>Gives every speaker their own PR where possible, skips anyone at lunch, never puts one PR in two sessions at once, and balances the load. Repeat speakers keep the same PR when possible.</DialogDescription>
      </DialogHeader>
      <BrandButton className="mt-2 w-full" onClick={() => run(false)}>Fill only speakers without a PR</BrandButton>
      <Button variant="outline" className="h-11 w-full rounded-full border-brand text-brand" onClick={() => run(true)}>Re-balance the whole day</Button>
      <p className="text-xs text-muted-foreground">When there are more speakers than free PRs at the same time, some PRs get 2 speakers on the same panel – shown as &ldquo;×2&rdquo;.</p>
    </>
  );
}

function Menu() {
  const { me, refresh, logout } = useApp();
  const modal = useModal();
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-navy">{me?.name}</DialogTitle>
        <DialogDescription>{me?.admin ? "Team Leader · admin" : "Great Hall PR"}</DialogDescription>
      </DialogHeader>
      <div className="flex gap-2">
        <Button variant="outline" className="h-10 rounded-full border-brand text-brand" onClick={() => { refresh(); modal.close(); }}>↻ Refresh now</Button>
        <Button className="h-10 rounded-full bg-st-urgent text-white" onClick={() => { modal.close(); logout(); }}>Log out</Button>
      </div>
      <p className="text-xs text-muted-foreground">Updates every few seconds. Green dot = live, red = offline.</p>
    </>
  );
}
