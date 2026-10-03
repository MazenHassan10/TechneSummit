"use client";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@great-hall-pr/ui/components/alert";
import { Badge } from "@great-hall-pr/ui/components/badge";
import { Button } from "@great-hall-pr/ui/components/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@great-hall-pr/ui/components/dialog";
import { Separator } from "@great-hall-pr/ui/components/separator";
import { BellRing, CalendarDays, Check, Clock, MapPin, RefreshCw, UserCog, X } from "lucide-react";
import * as Core from "@great-hall-pr/core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@great-hall-pr/ui/components/select";
import type { AgendaChange, State } from "@great-hall-pr/core";
import { useState } from "react";
import { toast } from "sonner";

import { trpcClient } from "@/utils/trpc";

import { hm } from "./format";
import { useApp } from "./store";
import { SpeakerAvatar, useProfiles } from "./agenda";
import { ask } from "./confirm";
import { CallLink, prOptions, useModal } from "./ui";

const KIND_LABEL: Record<string, string> = {
  time: "Time change", rename: "Name spelling", role: "Role change", add_person: "New speaker",
  remove_person: "Speaker removed", new_session: "New session", removed_session: "Session removed",
};

const to12 = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return `${h! % 12 || 12}:${String(m).padStart(2, "0")} ${h! < 12 ? "AM" : "PM"}`; };
const dayName = (st: State, d: string) => (d === st.settings.day1 ? "Sat 3 Oct" : d === st.settings.day2 ? "Sun 4 Oct" : d);

/** Where the change happens: day · time · stage (current times from our agenda). */
function sessionWhere(st: State, c: AgendaChange) {
  const s = c.sid ? st.sessions.find((x) => x.id === c.sid) : null;
  if (s) return { day: dayName(st, s.day), time: `${hm(s.start)} – ${hm(s.end)}`, title: s.title };
  if (c.newSession) return { day: dayName(st, c.newSession.day), time: `${to12(c.newSession.start)} – ${to12(c.newSession.end)}`, title: c.newSession.title };
  return null;
}

export function ChangeWhere({ change, compact }: { change: AgendaChange; compact?: boolean }) {
  const { state } = useApp();
  if (!state) return null;
  const w = sessionWhere(state, change);
  if (!w) return null;
  if (compact) return <span className="block text-xs opacity-80">{w.day} · {w.time} · Stage 01 · The Great Hall</span>;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1"><CalendarDays className="size-3.5" />{w.day}</span>
      <span className="flex items-center gap-1"><Clock className="size-3.5" />{w.time}</span>
      <span className="flex items-center gap-1"><MapPin className="size-3.5" />Stage 01 · The Great Hall</span>
    </div>
  );
}

/** Shown at the top of every screen while official-agenda changes are waiting. */
export function AgendaWatchBanner() {
  const { state, me } = useApp();
  const modal = useModal();
  const pending = state?.agendaChanges ?? [];
  if (!state || !me || !pending.length) return null;
  return (
    <Alert variant="destructive" className="mb-3 border-destructive/40 bg-destructive/5">
      <BellRing />
      <AlertTitle>Official agenda changed – {pending.length} update{pending.length === 1 ? "" : "s"} {me.admin ? "need your approval" : "waiting for the Team Leader"}</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 list-disc pl-4">
          {pending.slice(0, 3).map((c) => <li key={c.id} className="mb-1">{c.summary}<ChangeWhere change={c} compact /></li>)}
          {pending.length > 3 && <li>and {pending.length - 3} more…</li>}
        </ul>
        {!me.admin && <p className="mt-1">Nothing changes in the app until {state.settings.adminName} approves. If they haven&apos;t seen it, call them.</p>}
      </AlertDescription>
      <AlertAction>
        {me.admin
          ? <Button size="sm" onClick={() => modal.open({ kind: "agendaChanges" })}>Review</Button>
          : state.settings.adminPhone ? <CallLink phone={state.settings.adminPhone} title="Call Team Leader" /> : null}
      </AlertAction>
    </Alert>
  );
}

type Advice = { lines: string[]; picks: { key: string; label: string; suggestion: Core.PrSuggestion | null }[] };

/** PR suggestion for every kind of change – the Team Leader decides. */
function prAdvice(state: State, c: AgendaChange, pending: AgendaChange[]): Advice {
  const s = c.sid ? Core.sessionById(state, c.sid) : null;
  const prsOn = s ? [...new Set(Core.peopleOf(state, s.id).map((p) => Core.prOf(state, p)).filter(Boolean))] : [];
  if (c.kind === "add_person" && s) {
    const out = pending.find((x) => x.kind === "remove_person" && x.sid === c.sid);
    const gone = out?.pid ? Core.personById(state, out.pid) : null;
    const goneTo = gone ? Core.prOf(state, gone) : "";
    if (gone && goneTo) {
      return { lines: [`Replaces ${gone.name} on this panel – suggested to keep their PR.`], picks: [{ key: c.id, label: c.person?.name ?? "New speaker", suggestion: { name: goneTo, reason: `was ${gone.name}'s PR on this panel` } }] };
    }
    return { lines: ["Brand-new addition to this panel."], picks: [{ key: c.id, label: c.person?.name ?? "New speaker", suggestion: Core.suggestPr(state, s, [], c.person?.name) }] };
  }
  if (c.kind === "remove_person") {
    const p = c.pid ? Core.personById(state, c.pid) : null;
    const pr = p ? Core.prOf(state, p) : "";
    const inn = pending.find((x) => x.kind === "add_person" && x.sid === c.sid);
    if (inn) return { lines: [`Replaced by ${inn.person?.name ?? "a new speaker"}${pr ? ` – suggested to give ${pr} to them` : ""}.`], picks: [] };
    return { lines: [pr ? `${pr} (${p?.name}'s PR) becomes free for this slot.` : "This speaker had no PR."], picks: [] };
  }
  if (c.kind === "new_session" && c.newSession) {
    const ns = c.newSession;
    const fake: Core.Session = { id: `new:${c.id}`, day: ns.day, start: Core.dayStart(ns.day, ns.start, state.settings.tz), end: Core.dayStart(ns.day, ns.end, state.settings.tz), title: ns.title, type: "Panel", owner: "", notes: "" };
    const used: string[] = [];
    const picks = (ns.people ?? []).map((p) => {
      const sug = Core.suggestPr(state, fake, used, p.name);
      if (sug) used.push(sug.name);
      return { key: `${c.id}|${Core.normName(p.name)}`, label: `${p.name} (${p.role})`, suggestion: sug };
    });
    return { lines: [picks.length ? "Suggested PR for each speaker:" : "No speakers listed yet – add PRs when names are announced."], picks };
  }
  if (c.kind === "time") return { lines: [prsOn.length ? `PRs on this panel: ${prsOn.join(", ")} – make sure they know the new time.` : "No PRs assigned yet."], picks: [] };
  if (c.kind === "removed_session") return { lines: [prsOn.length ? `Frees: ${prsOn.join(", ")}.` : "No PRs were assigned."], picks: [] };
  if ((c.kind === "rename" || c.kind === "role") && c.pid) {
    const p = Core.personById(state, c.pid);
    const pr = p ? Core.prOf(state, p) : "";
    return { lines: [pr ? `PR stays: ${pr}.` : "No PR yet."], picks: [] };
  }
  return { lines: [], picks: [] };
}

const NONE = "__none__";

/** Team Leader: approve / reject each change (with PR suggestions), approve all, check now. */
export function AgendaChangesDialog() {
  const { state, refresh } = useApp();
  const modal = useModal();
  const profiles = useProfiles();
  const [busy, setBusy] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  if (!state) return null;
  const pending = state.agendaChanges ?? [];
  const advice = new Map(pending.map((c) => [c.id, prAdvice(state, c, pending)]));
  const chosen = (key: string, sug: Core.PrSuggestion | null) => (key in choice ? choice[key]! : sug?.name ?? "");
  const prsFor = (ids: string[]) => {
    const out: Record<string, string> = {};
    for (const id of ids) for (const pk of advice.get(id)?.picks ?? []) out[pk.key] = chosen(pk.key, pk.suggestion);
    return out;
  };
  const decide = async (ids: string[], approve: boolean) => {
    setBusy(ids.length > 1 ? "all" : ids[0]!);
    try {
      const r = await trpcClient.agenda.decide.mutate({ ids, approve, prs: approve ? prsFor(ids) : undefined });
      if (r.applied) toast.success(ids.length > 1 ? `${r.applied} change(s) applied` : "Applied to the agenda");
      else if (r.ok) toast.success(approve ? "Applied to the agenda" : "Rejected");
      if (!r.ok) toast.error(r.error ?? "Could not apply");
      else if (ids.length > 1) modal.close();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null); refresh();
  };
  const approveAll = async () => {
    if (!(await ask({ title: `Apply all ${pending.length} changes?`, description: "Each new speaker gets the PR shown on their card.", confirmLabel: "Apply all" }))) return;
    await decide(pending.map((c) => c.id), true);
  };
  const items = prOptions(state, "No PR yet", NONE);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Official agenda changes</DialogTitle>
        <DialogDescription>Found on technesummit2026.sched.com. Nothing changes until you approve. Suggested PRs are pre-selected – change them if you like.</DialogDescription>
      </DialogHeader>
      <CheckStatus />
      {pending.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No pending changes – the app matches the official agenda.</p>}
      <div className="space-y-2">
        {pending.map((c) => {
          const adv = advice.get(c.id)!;
          const removed = c.pid ? Core.personById(state, c.pid) : null;
          const who = c.person ?? (removed ? { name: removed.name, role: removed.role, photo: profiles.get(removed.name)?.photo, position: profiles.get(removed.name)?.position, company: profiles.get(removed.name)?.company } : null);
          return (
            <div key={c.id} className="space-y-2.5 rounded-lg border p-3">
              <div className="flex items-center gap-2"><Badge variant="secondary">{KIND_LABEL[c.kind] ?? c.kind}</Badge><span className="text-xs text-muted-foreground">found {hm(c.detectedAt)}</span></div>
              {who && (
                <div className="flex items-center gap-3">
                  <SpeakerAvatar name={who.name} photo={who.photo || profiles.get(who.name)?.photo} className="size-12" />
                  <div className="min-w-0 text-sm leading-tight"><div className="font-medium">{who.name} <span className="font-normal text-muted-foreground">· {who.role}</span></div>
                    {(who.position || who.company) && <div className="text-xs text-muted-foreground">{[who.position, who.company].filter(Boolean).join(", ")}</div>}</div>
                </div>
              )}
              <p className="text-sm">{c.summary}</p>
              <ChangeWhere change={c} />
              {c.warning && <p className="text-xs font-medium text-destructive">{c.warning}</p>}
              {(adv.lines.length > 0 || adv.picks.length > 0) && (
                <div className="space-y-2 rounded-md bg-muted/60 p-2.5">
                  {adv.lines.map((l) => <p key={l} className="flex gap-1.5 text-xs"><UserCog className="mt-px size-3.5 shrink-0 text-primary" />{l}</p>)}
                  {adv.picks.map((pk) => (
                    <div key={pk.key} className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-medium">PR for {pk.label}</span>
                        <Select value={chosen(pk.key, pk.suggestion) || NONE} items={items} onValueChange={(v) => setChoice({ ...choice, [pk.key]: !v || v === NONE ? "" : String(v) })}>
                          <SelectTrigger size="sm" className="min-w-44 bg-background"><SelectValue /></SelectTrigger>
                          <SelectContent>{items.map((it) => <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      {pk.suggestion && <p className="text-[11px] text-muted-foreground">Suggested {pk.suggestion.name}: {pk.suggestion.reason}</p>}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={!!busy} onClick={() => decide([c.id], true)}><Check />Approve</Button>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => decide([c.id], false)}><X />Reject</Button>
              </div>
            </div>
          );
        })}
      </div>
      {pending.length > 1 && (<><Separator /><Button size="lg" className="w-full" disabled={!!busy} onClick={approveAll}>Approve all {pending.length}</Button></>)}
    </>
  );
}

/** "Last checked … · Check now" */
export function CheckStatus() {
  const { state, me, refresh } = useApp();
  const [busy, setBusy] = useState(false);
  if (!state || !me) return null;
  const err = state.settings.agendaLastError;
  const full = state.settings.agendaLastFullCheck;
  // a full check (from the Mac) also covers times, so show whichever is more recent
  const times = Math.max(state.settings.agendaLastTimesCheck ?? 0, full ?? 0) || undefined;
  const stale = (t?: number) => !t || Date.now() - t > 75 * 60_000;
  const check = async () => {
    setBusy(true);
    try {
      const r = await trpcClient.agenda.check.mutate();
      if (!r.ok) toast.error(`Check failed: ${r.error}`);
      else toast.success(`${r.newProposals ? `${r.newProposals} new change(s) found` : "No new changes on the official agenda"}${r.mode === "times" ? " (times only – speakers are checked from your Mac)" : ""}`);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false); refresh();
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="w-full sm:w-auto">Official agenda · times checked {times ? hm(times) : "–"} · speakers checked {full ? hm(full) : "–"} · every 30 min</span>
      {err && <Badge variant="destructive" title={err}>Last check failed</Badge>}
      {me.admin && stale(full) && <Badge variant="outline" title="Speaker changes are checked from the Team Leader's Mac – keep it on and online">Mac check overdue</Badge>}
      {me.admin && <Button size="xs" variant="outline" disabled={busy} onClick={check}><RefreshCw className={busy ? "animate-spin" : ""} />Check now</Button>}
    </div>
  );
}

/** Menu button to allow system notifications on this device. */
export function NotificationToggle() {
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  if (perm === "unsupported") return null;
  if (perm === "granted") return <p className="text-xs text-muted-foreground">Notifications are on for this device.</p>;
  return (
    <Button variant="outline" onClick={async () => setPerm(await Notification.requestPermission())} disabled={perm === "denied"}>
      <BellRing />{perm === "denied" ? "Notifications blocked in browser settings" : "Turn on notifications"}
    </Button>
  );
}
