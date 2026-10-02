"use client";

import * as Core from "@great-hall-pr/core";
import type { Action, Actor, State } from "@great-hall-pr/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { TOKEN_KEY, trpcClient } from "@/utils/trpc";

import { dayOf } from "./format";

type ActResult = { ok: true; result?: unknown } | { ok: false; error?: string };

type Ctx = {
  me: Actor | null;
  state: State | null;
  online: boolean;
  busy: number;
  day: string;
  setDay: (d: string) => void;
  now: () => number;
  login: (name: string, pin: string) => Promise<void>;
  logout: () => void;
  act: (action: Action, okMsg?: string) => Promise<ActResult>;
  refresh: () => void;
};

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

const ME_KEY = "gh_me";
const isExpired = (e: unknown) => String((e as Error)?.message || e).includes("SESSION_EXPIRED");

/** System notification (works while the app is open or in a background tab, once allowed in the menu). */
export function notify(title: string, body: string) {
  try { if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, tag: "gh-agenda" }); } catch {}
}

function buzz() {
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
  try {
    const ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ac.destination); g.gain.value = 0.08; o.start(); o.stop(ac.currentTime + 0.25);
  } catch {}
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Actor | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(0);
  const [day, setDay] = useState("");
  const version = useRef(0);
  const skew = useRef(0);
  const polling = useRef(false);
  const seenIncidents = useRef<string[] | null>(null);
  const seenLate = useRef<string[] | null>(null);
  const seenChanges = useRef<string[] | null>(null);
  const stateRef = useRef<State | null>(null);
  const meRef = useRef<Actor | null>(null);
  stateRef.current = state;
  meRef.current = me;

  const now = useCallback(() => Date.now() + skew.current, []);

  // restore session
  useEffect(() => {
    const raw = localStorage.getItem(ME_KEY);
    if (raw && localStorage.getItem(TOKEN_KEY)) setMe(JSON.parse(raw));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ME_KEY);
    version.current = 0;
    seenIncidents.current = null;
    seenLate.current = null;
    seenChanges.current = null;
    setMe(null);
    setState(null);
  }, []);

  const accept = useCallback((res: { version: number; serverNow: number; state?: State; me?: Actor; unchanged?: boolean }) => {
    skew.current = res.serverNow - Date.now();
    if (res.me) { setMe(res.me); localStorage.setItem(ME_KEY, JSON.stringify(res.me)); }
    if (res.unchanged || !res.state) return;
    version.current = res.version;
    setState(res.state);
    setDay((d) => {
      if (d) return d;
      const today = dayOf(Date.now() + skew.current);
      return today === res.state!.settings.day2 ? res.state!.settings.day2 : res.state!.settings.day1;
    });
  }, []);

  const checkAlerts = useCallback((st: State, who: Actor) => {
    const t = Date.now() + skew.current;
    const open = st.incidents.filter((i) => i.status === "open").map((i) => i.id);
    if (seenIncidents.current && who.admin) {
      const fresh = open.filter((id) => !seenIncidents.current!.includes(id));
      const inc = st.incidents.find((i) => i.id === fresh[0]);
      if (inc) { toast.error(`${inc.kind} – reported by ${inc.by}`); buzz(); }
    }
    seenIncidents.current = open;
    const late: string[] = [];
    for (const s of st.sessions)
      for (const p of Core.peopleOf(st, s.id)) {
        if (!who.admin && Core.prOf(st, p) !== who.name) continue;
        const c = Core.personStatus(p, s, st.settings, t);
        if (c === "LATE" || c === "CALLNOW" || c === "TAKE_BACKSTAGE") late.push(p.id + c);
      }
    if (seenLate.current) {
      const n = late.filter((x) => !seenLate.current!.includes(x)).length;
      if (n) { toast.error(`${n} speaker(s) need action now`); buzz(); }
    }
    seenLate.current = late;
    // official agenda changes: alert EVERYONE once per new change (only the Team Leader can approve)
    const ch = (st.agendaChanges ?? []).map((c) => c.id);
    if (seenChanges.current) {
      const fresh = (st.agendaChanges ?? []).filter((c) => !seenChanges.current!.includes(c.id));
      if (fresh.length) {
        const msg = fresh.length === 1 ? fresh[0]!.summary : `${fresh.length} changes on the official agenda`;
        toast.warning(`Official agenda changed – ${msg}`, { duration: 15000 });
        notify("Great Hall agenda changed", who.admin ? `${msg} – review and approve in the app` : `${msg} – waiting for the Team Leader`);
        buzz();
      }
    }
    seenChanges.current = ch;
  }, []);

  const poll = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY) || polling.current || document.hidden) return;
    polling.current = true;
    try {
      const res = await trpcClient.state.get.query({ since: version.current || undefined });
      setOnline(true);
      accept(res);
      const st = res.unchanged ? stateRef.current : res.state;
      const who = res.unchanged ? meRef.current : res.me;
      if (st && who) checkAlerts(st, who);
    } catch (e) {
      if (isExpired(e)) { logout(); toast.error("Please log in again"); } else setOnline(false);
    } finally {
      polling.current = false;
    }
  }, [accept, checkAlerts, logout]);

  // polling loop: admin every 5s, PRs every 8s, paused while the screen is off
  useEffect(() => {
    if (!me) return;
    poll();
    const id = setInterval(poll, me.admin ? 5000 : 8000);
    const vis = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [me, poll]);

  const login = useCallback(async (name: string, pin: string) => {
    const r = await trpcClient.auth.login.mutate({ name, pin });
    localStorage.setItem(TOKEN_KEY, r.token);
    localStorage.setItem(ME_KEY, JSON.stringify(r.me));
    version.current = 0;
    setMe(r.me);
  }, []);

  const act = useCallback(async (action: Action, okMsg?: string): Promise<ActResult> => {
    const cur = stateRef.current;
    const who = meRef.current;
    if (!cur || !who) return { ok: false };
    // optimistic: apply the same rules locally so the tap feels instant; roll back if the server disagrees
    const local = structuredClone(cur);
    const pre = Core.apply(local, structuredClone(action), who, Date.now() + skew.current);
    if (!pre.ok) { toast.error(pre.error); return pre; }
    delete local._newLog;
    setState(local);
    setBusy((b) => b + 1);
    try {
      const res = await trpcClient.state.act.mutate({ action });
      setOnline(true);
      if (!res.ok) { setState(cur); toast.error(res.error); return res; }
      accept({ ...res, me: undefined });
      if (okMsg) toast.success(okMsg);
      return { ok: true, result: res.result };
    } catch (e) {
      setState(cur);
      if (isExpired(e)) { logout(); toast.error("Please log in again"); } else { setOnline(false); toast.error("Connection problem – try again"); }
      return { ok: false };
    } finally {
      setBusy((b) => b - 1);
    }
  }, [accept, logout]);

  const refresh = useCallback(() => { version.current = 0; poll(); }, [poll]);

  const value = useMemo<Ctx>(() => ({ me, state, online, busy, day, setDay, now, login, logout, act, refresh }), [me, state, online, busy, day, now, login, logout, act, refresh]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/** Re-render every `ms` so countdowns / LATE flags stay current. */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => { const id = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(id); }, [ms]);
}
