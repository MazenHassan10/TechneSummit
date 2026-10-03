"use client";

import { Button } from "@great-hall-pr/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@great-hall-pr/ui/components/card";
import { Input } from "@great-hall-pr/ui/components/input";
import { Label } from "@great-hall-pr/ui/components/label";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { Badge } from "@great-hall-pr/ui/components/badge";
import { useQuery } from "@tanstack/react-query";
import { BookUser, CalendarClock, CalendarDays, ClipboardList, Contact, Landmark, MoreHorizontal, Radio, Star, TriangleAlert, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { trpc } from "@/utils/trpc";

import { hm } from "./format";
import { AgendaView } from "./agenda";
import { AgendaWatchBanner } from "./agenda-watch";
import { ScreenBoundary } from "./boundary";
import { ConfirmHost } from "./confirm";
import { ContactsView } from "./contacts";
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
      <ConfirmHost />
    </ModalCtx.Provider>
  );
}

/** The app logo (same file as the browser-tab icon). */
function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/icon.svg" alt="Great Hall PR logo" className={cn("shrink-0 rounded-[22%] shadow-md ring-2 ring-white/70", className)} />;
}

function Wordmark({ big }: { big?: boolean }) {
  return (
    <div className={cn("leading-none font-bold text-white", big ? "text-center" : "")}>
      <div className={cn(big ? "text-4xl tracking-[6px]" : "text-[15px] tracking-[1.5px] sm:text-[17px] sm:tracking-[2px]")}>TECHNE</div>
      {big && <div className="mt-1.5 text-[15px] font-medium tracking-[6px]">SUMMIT</div>}
      <span className={cn("mt-1 inline-block bg-orange font-semibold text-white", big ? "px-2.5 py-0.5 text-[11px] tracking-[4px]" : "px-1 py-px text-[7.5px] tracking-[1.5px] sm:px-1.5 sm:text-[8.5px] sm:tracking-[2.5px]")}>ALEXANDRIA</span>
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
        <Logo className="mx-auto mb-4 size-20" />
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
  { key: "contacts", label: "Contacts", icon: BookUser, view: ContactsView },
];
const MANAGER_TABS = (): Tab[] => ADMIN_TABS.filter((t) => t.key !== "phones");
const ADMIN_TABS: Tab[] = [
  { key: "live", label: "Live", icon: Radio, view: LiveView },
  { key: "agenda", label: "Agenda", icon: CalendarDays, view: AgendaView },
  { key: "sessions", label: "Sessions", icon: ClipboardList, view: SessionsView },
  { key: "team", label: "Team", icon: Users, view: TeamAdminView },
  { key: "phones", label: "Phones", icon: Contact, view: PhonesView },
  { key: "contacts", label: "Contacts", icon: BookUser, view: ContactsView },
  { key: "issues", label: "Issues", icon: TriangleAlert, view: IssuesView },
  { key: "log", label: "Log", icon: ClipboardList, view: LogView },
];

function Shell() {
  const { me, state, online, busy, now } = useApp();
  useTick(1000);
  const tabs = me?.admin ? ADMIN_TABS : me?.manager ? MANAGER_TABS() : PR_TABS;
  const [tab, setTab] = useState(tabs[0]!.key);
  // the side menu (laptop) sits right under the header – measure its real height so nothing hides behind it
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--toph", `${el.getBoundingClientRect().height}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (!tabs.some((x) => x.key === tab)) setTab(tabs[0]!.key); }, [tabs, tab]);
  if (!me || !state) return null;
  const View = (tabs.find((x) => x.key === tab) ?? tabs[0]!).view;
  const openIssues = state.incidents.filter((i) => i.status === "open").length;
  const mineAlerts = me.admin || me.manager ? 0 : myAlertCount(state, me.name, now());
  return (
    <ModalCtx.Consumer>
      {(modal) => (
        <div className="min-h-svh">
          <header ref={headerRef} className="sticky top-0 z-30 flex items-center gap-2 bg-primary px-3 py-2 text-primary-foreground shadow-sm sm:gap-3 sm:px-4 sm:py-2.5">
            <div className="flex shrink-0 items-center gap-2"><Logo className="size-9 sm:size-10" /><div><Wordmark /><div className="mt-0.5 text-[10px] font-medium opacity-85 sm:text-[10.5px]">Great Hall PR</div></div></div>
            <div className="min-w-0 flex-1" />
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-sm font-semibold whitespace-nowrap tabular-nums sm:text-base md:text-lg">{hm(now())}</span>
              <span title={online ? "Live" : "Offline"} className={cn("size-2 shrink-0 rounded-full sm:size-2.5", !online ? "bg-[#ff6b5e]" : busy ? "bg-amber" : "bg-[#3ddc84]")} />
            </div>
            <div className="min-w-0 max-w-24 text-right text-[11px] leading-tight sm:max-w-none sm:text-xs">
              <b className="block truncate text-xs sm:text-[13px]"><span className="sm:hidden">{me.name.split(" ")[0]}</span><span className="hidden sm:inline">{me.name}</span></b>
              <span className="opacity-80">{me.admin ? "Admin" : me.manager ? "Manager" : "PR"}</span>
            </div>
            <Button variant="secondary" size="icon" className="shrink-0" onClick={() => modal.open({ kind: "menu" })} aria-label="Menu"><MoreHorizontal /></Button>
          </header>
          <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:top-[var(--toph,66px)] md:right-auto md:bottom-0 md:w-24 md:flex-col md:border-t-0 md:border-r">
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
            <ScreenBoundary key={`banner`}><AgendaWatchBanner /></ScreenBoundary>
            <ScreenBoundary key={tab}><View /></ScreenBoundary>
          </main>
        </div>
      )}
    </ModalCtx.Consumer>
  );
}
