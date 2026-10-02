"use client";

import { Input } from "@great-hall-pr/ui/components/input";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ClipboardList, Contact, Landmark, MoreHorizontal, Radio, Star, TriangleAlert, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { trpc } from "@/utils/trpc";

import { hm } from "./format";
import { Modals } from "./modals";
import { AppProvider, useApp, useTick } from "./store";
import { BrandButton, ModalCtx, type ModalSpec } from "./ui";
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
      <div className="bg-brand px-5 pt-9 pb-7 text-center text-white">
        <Wordmark big />
        <p className="mt-3 text-sm opacity-85">Great Hall PR · Bibliotheca Alexandrina</p>
      </div>
      <div className="mx-auto max-w-md px-5 pt-6 pb-10">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Who are you?</p>
        {names.isLoading && <p className="text-muted-foreground">Loading…</p>}
        {names.error && <p className="text-st-urgent">Cannot reach the server: {names.error.message}</p>}
        <div className="grid grid-cols-2 gap-2">
          {names.data?.map((n) => (
            <button type="button" key={n} onClick={() => setWho(n)}
              className={cn("rounded-xl border-[1.5px] px-2 py-3 text-sm font-semibold", who === n ? "border-orange bg-[#fff1eb] text-orange-dark" : "border-line bg-white text-navy")}>{n}</button>
          ))}
          <button type="button" onClick={() => setWho("__admin__")}
            className={cn("col-span-2 rounded-xl border-[1.5px] px-2 py-3 text-sm font-semibold text-brand", who === "__admin__" ? "border-solid border-brand bg-soft" : "border-dashed border-brand bg-white")}>Team Leader (admin)</button>
        </div>
        {who && (
          <form className="mt-4" onSubmit={(e) => { e.preventDefault(); void go(); }}>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">PIN</p>
            <Input autoFocus type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value)} className="h-14 bg-white text-center text-2xl tracking-[10px]" />
            <BrandButton type="submit" disabled={busy || !pin} className="mt-3 w-full">{busy ? "Checking…" : "Log in"}</BrandButton>
          </form>
        )}
        <p className="mt-3 min-h-5 text-sm font-semibold text-st-urgent">{err}</p>
      </div>
    </div>
  );
}

type Tab = { key: string; label: string; icon: React.ComponentType<{ className?: string }>; view: React.ComponentType };
const PR_TABS: Tab[] = [
  { key: "mine", label: "My speakers", icon: Star, view: MineView },
  { key: "hall", label: "Great Hall", icon: Landmark, view: HallView },
  { key: "team", label: "Team", icon: CalendarClock, view: TeamBoardView },
  { key: "report", label: "Report", icon: TriangleAlert, view: ReportView },
];
const ADMIN_TABS: Tab[] = [
  { key: "live", label: "Live", icon: Radio, view: LiveView },
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
          <header className="sticky top-0 z-30 flex items-center gap-3 bg-brand px-4 py-2.5 text-white shadow-md">
            <div><Wordmark /><div className="mt-0.5 text-[10.5px] font-medium opacity-85">Great Hall PR</div></div>
            <div className="flex-1" />
            <div className="text-base font-semibold whitespace-nowrap tabular-nums md:text-lg">{hm(now())}</div>
            <span title={online ? "Live" : "Offline"} className={cn("size-2.5 rounded-full", !online ? "bg-[#ff6b5e]" : busy ? "bg-amber" : "bg-[#3ddc84]")} />
            <div className="text-right text-xs leading-tight"><b className="block text-[13px]">{me.name}</b><span className="opacity-80">{me.admin ? "Admin" : "PR"}</span></div>
            <button type="button" onClick={() => modal.open({ kind: "menu" })} className="rounded-lg border-[1.5px] border-white/75 p-1.5" aria-label="Menu"><MoreHorizontal className="size-4" /></button>
          </header>
          <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(12,23,54,.06)] md:top-[66px] md:right-auto md:bottom-0 md:w-24 md:flex-col md:border-t-0 md:border-r">
            {tabs.map((x) => {
              const badge = (x.key === "issues" || x.key === "report") && openIssues ? openIssues : x.key === "mine" && mineAlerts ? mineAlerts : 0;
              const on = tab === x.key;
              const Icon = x.icon;
              return (
                <button type="button" key={x.key} onClick={() => { setTab(x.key); window.scrollTo(0, 0); }}
                  className={cn("relative flex flex-1 flex-col items-center gap-0.5 px-1 pt-2 pb-2.5 text-[11px] md:flex-none md:py-4", on ? "font-bold text-brand" : "font-medium text-muted-foreground")}>
                  {on && <span className="absolute top-0 left-[22%] h-[3px] w-[56%] rounded-b bg-orange md:top-[20%] md:left-0 md:h-[60%] md:w-[3px] md:rounded-r" />}
                  <Icon className="size-5" />{x.label}
                  {badge > 0 && <span className="absolute top-1 left-1/2 ml-2 min-w-[18px] rounded-full bg-orange px-1.5 text-[11px] font-bold text-white">{badge}</span>}
                </button>
              );
            })}
          </nav>
          <main className="mx-auto max-w-6xl px-3 pt-3 pb-28 md:pr-4 md:pb-10 md:pl-28">
            <View />
          </main>
        </div>
      )}
    </ModalCtx.Consumer>
  );
}
