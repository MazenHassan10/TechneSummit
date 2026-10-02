"use client";

import { Button } from "@great-hall-pr/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@great-hall-pr/ui/components/card";
import { Input } from "@great-hall-pr/ui/components/input";
import { Label } from "@great-hall-pr/ui/components/label";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { Badge } from "@great-hall-pr/ui/components/badge";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, ClipboardList, Contact, Landmark, MoreHorizontal, Radio, Star, TriangleAlert, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { trpc } from "@/utils/trpc";

import { hm } from "./format";
import { AgendaView } from "./agenda";
import { AgendaWatchBanner } from "./agenda-watch";
import { Modals } from "./modals";
import { AppProvider, useApp, useTick } from "./store";
import { ModalCtx, type ModalSpec } from "./ui";
import { HallView, IssuesView, LiveView, LogView, MineView, myAlertCount, PhonesView, ReportView, SessionsView, TeamAdminView, TeamBoardView } from "./views";

export function GreatHallApp() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}

function Root() {
  const { me, state } = useApp();
  const [modal, setModal] = useState<ModalSpec | null>(null);
  if (!me) return <Login />;
  return (
    <ModalCtx.Provider value={{ open: setModal, close: () => setModal(null) }}>
      {state ? <Shell /> : <div className="grid h-svh place-items-center text-muted-foreground">Loading Great Hall…</div>}
      <Modals spec={modal} />
    </ModalCtx.Provider>
  );
}

function Wordmark({ big }: { big?: boolean }) {
  return (
    <div className={cn("leading-none font-bold text-white", big ? "text-center" : "")}>
      <div className={cn(big ? "text-4xl tracking-[6px]" : "text-[17px] tracking-[2px]")}>TECHNE</div>
      {big && <div className="mt-1.5 text-[15px] font-medium tracking-[6px]">SUMMIT</div>}
      <span className={cn("mt-1 inline-block bg-orange font-semibold text-white", big ? "px-2.5 py-0.5 text-[11px] tracking-[4px]" : "px-1.5 py-px text-[8.5px] tracking-[2.5px]")}>ALEXANDRIA</span>
    </div>
  );
}

function Login() {
  const { login } = useApp();
  const names = useQuery(trpc.auth.loginNames.queryOptions());
  const [who, setWho] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setErr(""); setBusy(true);
    try { await login(who, pin); } catch (e) { setErr(String((e as Error).message).includes("Wrong PIN") ? "Wrong PIN – try again" : (e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="min-h-svh">
      <div className="bg-primary px-5 pt-9 pb-10 text-center text-primary-foreground">
        <Wordmark big />
        <p className="mt-3 text-sm opacity-85">Great Hall PR · Bibliotheca Alexandrina</p>
      </div>
      <div className="mx-auto -mt-4 max-w-md px-4 pb-10">
        <Card>
          <CardHeader>
            <CardTitle>Log in</CardTitle>
            <CardDescription>Choose your name, then enter your PIN.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {names.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {names.error && <p className="text-sm text-destructive">Cannot reach the server: {names.error.message}</p>}
            <div className="grid grid-cols-2 gap-2">
              {names.data?.map((n) => (
                <Button key={n} type="button" variant={who === n ? "default" : "outline"} size="lg" className="h-11" onClick={() => setWho(n)}>{n}</Button>
              ))}
              <Button type="button" variant={who === "__admin__" ? "default" : "secondary"} size="lg" className="col-span-2 h-11" onClick={() => setWho("__admin__")}>Team Leader (admin)</Button>
            </div>
            {who && (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void go(); }}>
                <div className="space-y-2">
                  <Label htmlFor="pin">PIN</Label>
                  <Input id="pin" autoFocus type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value)} className="h-12 text-center text-xl tracking-[8px]" />
                </div>
                <Button type="submit" size="lg" disabled={busy || !pin} className="h-11 w-full">{busy ? "Checking…" : "Log in"}</Button>
              </form>
            )}
            {err && <p className="text-sm font-medium text-destructive">{err}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type Tab = { key: string; label: string; icon: React.ComponentType<{ className?: string }>; view: React.ComponentType };
const PR_TABS: Tab[] = [
  { key: "mine", label: "My speakers", icon: Star, view: MineView },
  { key: "agenda", label: "Agenda", icon: CalendarDays, view: AgendaView },
  { key: "hall", label: "Great Hall", icon: Landmark, view: HallView },
  { key: "team", label: "Team", icon: CalendarClock, view: TeamBoardView },
  { key: "report", label: "Report", icon: TriangleAlert, view: ReportView },
];
const ADMIN_TABS: Tab[] = [
  { key: "live", label: "Live", icon: Radio, view: LiveView },
  { key: "agenda", label: "Agenda", icon: CalendarDays, view: AgendaView },
  { key: "sessions", label: "Sessions", icon: ClipboardList, view: SessionsView },
  { key: "team", label: "Team", icon: Users, view: TeamAdminView },
  { key: "phones", label: "Phones", icon: Contact, view: PhonesView },
  { key: "issues", label: "Issues", icon: TriangleAlert, view: IssuesView },
  { key: "log", label: "Log", icon: ClipboardList, view: LogView },
];

function Shell() {
  const { me, state, online, busy, now } = useApp();
  useTick(1000);
  const tabs = me?.admin ? ADMIN_TABS : PR_TABS;
  const [tab, setTab] = useState(tabs[0]!.key);
  useEffect(() => { if (!tabs.some((x) => x.key === tab)) setTab(tabs[0]!.key); }, [tabs, tab]);
  if (!me || !state) return null;
  const View = (tabs.find((x) => x.key === tab) ?? tabs[0]!).view;
  const openIssues = state.incidents.filter((i) => i.status === "open").length;
  const mineAlerts = me.admin ? 0 : myAlertCount(state, me.name, now());
  return (
    <ModalCtx.Consumer>
      {(modal) => (
        <div className="min-h-svh">
          <header className="sticky top-0 z-30 flex items-center gap-3 bg-primary px-4 py-2.5 text-primary-foreground shadow-sm">
            <div><Wordmark /><div className="mt-0.5 text-[10.5px] font-medium opacity-85">Great Hall PR</div></div>
            <div className="flex-1" />
            <div className="text-base font-semibold whitespace-nowrap tabular-nums md:text-lg">{hm(now())}</div>
            <span title={online ? "Live" : "Offline"} className={cn("size-2.5 rounded-full", !online ? "bg-[#ff6b5e]" : busy ? "bg-amber" : "bg-[#3ddc84]")} />
            <div className="text-right text-xs leading-tight"><b className="block text-[13px]">{me.name}</b><span className="opacity-80">{me.admin ? "Admin" : "PR"}</span></div>
            <Button variant="secondary" size="icon" onClick={() => modal.open({ kind: "menu" })} aria-label="Menu"><MoreHorizontal /></Button>
          </header>
          <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:top-[66px] md:right-auto md:bottom-0 md:w-24 md:flex-col md:border-t-0 md:border-r">
            {tabs.map((x) => {
              const badge = (x.key === "issues" || x.key === "report") && openIssues ? openIssues : x.key === "mine" && mineAlerts ? mineAlerts : 0;
              const on = tab === x.key;
              const Icon = x.icon;
              return (
                <Button type="button" variant="ghost" key={x.key} onClick={() => { setTab(x.key); window.scrollTo(0, 0); }}
                  className={cn("relative h-auto flex-1 flex-col gap-1 rounded-none px-1 pt-2 pb-2.5 text-[11px] md:flex-none md:py-4", on ? "text-primary" : "text-muted-foreground")}>
                  {on && <span className="absolute top-0 left-[22%] h-0.5 w-[56%] rounded-b bg-primary md:top-[20%] md:left-0 md:h-[60%] md:w-0.5 md:rounded-r" />}
                  <Icon className="size-5" />{x.label}
                  {badge > 0 && <Badge variant="destructive" className="absolute top-1 left-1/2 ml-2 h-4 min-w-4 px-1 text-[10px]">{badge}</Badge>}
                </Button>
              );
            })}
          </nav>
          <main className="mx-auto max-w-6xl px-3 pt-3 pb-28 md:pr-4 md:pb-10 md:pl-28">
            <AgendaWatchBanner />
            <View />
          </main>
        </div>
      )}
    </ModalCtx.Consumer>
  );
}
