"use client";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@great-hall-pr/ui/components/alert";
import { Badge } from "@great-hall-pr/ui/components/badge";
import { Button } from "@great-hall-pr/ui/components/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@great-hall-pr/ui/components/dialog";
import { Separator } from "@great-hall-pr/ui/components/separator";
import { BellRing, Check, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { trpcClient } from "@/utils/trpc";

import { hm } from "./format";
import { useApp } from "./store";
import { CallLink, useModal } from "./ui";

const KIND_LABEL: Record<string, string> = {
  time: "Time change", rename: "Name spelling", role: "Role change", add_person: "New speaker",
  remove_person: "Speaker removed", new_session: "New session", removed_session: "Session removed",
};

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
          {pending.slice(0, 3).map((c) => <li key={c.id}>{c.summary}</li>)}
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

/** Team Leader: approve / reject each change, approve all, check now. */
export function AgendaChangesDialog() {
  const { state, refresh } = useApp();
  const modal = useModal();
  const [busy, setBusy] = useState<string | null>(null);
  if (!state) return null;
  const pending = state.agendaChanges ?? [];
  const decide = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      const r = await trpcClient.agenda.decide.mutate({ ids: [id], approve });
      if (!r.ok) toast.error(r.error ?? "Could not apply"); else toast.success(approve ? "Applied to the agenda" : "Rejected");
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null); refresh();
  };
  const approveAll = async () => {
    if (!confirm(`Apply all ${pending.length} changes to the agenda?`)) return;
    setBusy("all");
    try {
      const r = await trpcClient.agenda.decide.mutate({ ids: pending.map((c) => c.id), approve: true });
      if (r.applied) toast.success(`${r.applied} change(s) applied`);
      if (!r.ok) toast.error(r.error ?? "Some changes could not be applied");
      else modal.close();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null); refresh();
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Official agenda changes</DialogTitle>
        <DialogDescription>Found on technesummit2026.sched.com. Nothing changes until you approve. New speakers get a PR from the rotation.</DialogDescription>
      </DialogHeader>
      <CheckStatus />
      {pending.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No pending changes – the app matches the official agenda.</p>}
      <div className="space-y-2">
        {pending.map((c) => (
          <div key={c.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2"><Badge variant="secondary">{KIND_LABEL[c.kind] ?? c.kind}</Badge><span className="text-xs text-muted-foreground">found {hm(c.detectedAt)}</span></div>
            <p className="text-sm">{c.summary}</p>
            {c.warning && <p className="text-xs font-medium text-destructive">{c.warning}</p>}
            <div className="flex gap-2">
              <Button size="sm" disabled={!!busy} onClick={() => decide(c.id, true)}><Check />Approve</Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => decide(c.id, false)}><X />Reject</Button>
            </div>
          </div>
        ))}
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
