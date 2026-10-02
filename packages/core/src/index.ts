// Shared logic for the Great Hall PR system – runs on the server (tRPC) and in the browser.
// Ported from the Apps Script version; behaviour is kept identical and covered by core.test.ts.

export const MIN = 60_000;
export const HOUR = 3_600_000;

export const STEPS = ["called", "etaCall", "arrived", "backstage", "onstage"] as const;
export type Step = (typeof STEPS)[number];
export const STEP_LABEL: Record<Step, string> = {
  called: "Called",
  etaCall: "ETA call",
  arrived: "Arrived",
  backstage: "Backstage",
  onstage: "On stage",
};

export type Tone = "done" | "ready" | "urgent" | "arrived" | "noshow" | "warn" | "ok" | "idle";
export const STATUS = {
  DONE: { label: "On stage / done", tone: "done", rank: 9 },
  BACKSTAGE: { label: "Backstage – ready", tone: "ready", rank: 8 },
  TAKE_BACKSTAGE: { label: "Arrived – take backstage NOW", tone: "urgent", rank: 2 },
  ARRIVED: { label: "Arrived", tone: "arrived", rank: 7 },
  NOSHOW: { label: "No-show", tone: "noshow", rank: 1 },
  LATE: { label: "LATE – not arrived", tone: "urgent", rank: 0 },
  CALLNOW: { label: "Call now – no ETA", tone: "warn", rank: 3 },
  CONFIRMED: { label: "Confirmed – en route", tone: "ok", rank: 6 },
  NOTCALLED: { label: "Not called yet", tone: "idle", rank: 5 },
} as const satisfies Record<string, { label: string; tone: Tone; rank: number }>;
export type StatusCode = keyof typeof STATUS;

export const SESSION_TYPES = ["Panel", "Keynote", "Fireside Chat", "Workshop", "Opening", "Closing", "Pitching", "Award", "Other"];
export const ROLES = ["Speaker", "Moderator", "VIP", "Minister", "Host / MC", "TBC"];
export const INCIDENT_KINDS = [
  "Speaker late", "Speaker no-show", "Moderator missing", "Session overrunning", "Mic / AV problem",
  "VIP arrival / protocol", "Medical / safety", "Speaker complaint", "Schedule change", "Other",
];

// ---------- types ----------
export type Settings = {
  day1: string;
  day2: string;
  tz: string;
  tzName: string;
  call1Hours: number;
  call2Hours: number;
  arriveMin: number;
  backstageMin: number;
  lunchMin: number;
  stageMin?: number;
  adminName: string;
  adminPin: string;
  /** Team Leader's phone – shown to every PR for urgent calls / WhatsApp */
  adminPhone?: string;
  /** last time the official agenda was checked (epoch ms) and any error from that check */
  agendaLastCheck?: number;
  agendaLastError?: string;
  /** full check incl. speakers (needs a normal device – the site blocks cloud servers) / times-only check from the cloud */
  agendaLastFullCheck?: number;
  agendaLastTimesCheck?: number;
};
/** A difference with the official agenda waiting for the Team Leader's approval */
export type AgendaChange = { id: string; kind: string; summary: string; warning: string; detectedAt: number };
export type Member = { name: string; fullName: string; phone: string; pin: string; lunch1: string; lunch2: string; guest: boolean };
export type Session = { id: string; day: string; start: number; end: number; title: string; type: string; owner: string; notes: string };
export type Person = {
  id: string; sid: string; pr: string; name: string; role: string; phone: string;
  called: number | null; etaCall: number | null; eta: string; arrived: number | null; backstage: number | null; onstage: number | null;
  noshow: boolean; notes: string; updatedBy: string; updatedAt: number | null;
};
export type Incident = {
  id: string; ts: number; by: string; sid: string; pid: string; kind: string; note: string;
  status: "open" | "resolved"; resolvedBy: string; resolvedAt: number | null;
};
export type LogEntry = { ts: number; by: string; text: string };
export type State = {
  settings: Settings;
  team: Member[];
  sessions: Session[];
  people: Person[];
  incidents: Incident[];
  log: LogEntry[];
  /** pending official-agenda changes (read-only here – decided through the agenda router) */
  agendaChanges?: AgendaChange[];
  _newLog?: LogEntry[];
};
export type Actor = { name: string; admin: boolean };
export type Table = "team" | "sessions" | "people" | "incidents";
export type RotaCode = "OK" | "NO_PR" | "UNKNOWN_PR" | "SAME_PANEL";

// Actions are validated here (not by the transport), so every field is optional/loose.
export type Action = { type: string } & Record<string, unknown>;
export type ApplyResult = { ok: true; dirty: Table[]; result?: unknown } | { ok: false; error: string };

// ---------- time ----------
export function dayStart(day: string, hhmm: string, tz?: string) {
  return Date.parse(`${day}T${hhmm}:00${tz || "+03:00"}`);
}

export function deadlines(session: Session, st: Settings) {
  return {
    callBy: session.start - st.call1Hours * HOUR,
    etaBy: session.start - st.call2Hours * HOUR,
    arriveBy: session.start - st.arriveMin * MIN,
    backstageBy: session.start - st.backstageMin * MIN,
  };
}

export function personStatus(p: Person, session: Session, st: Settings, now: number): StatusCode {
  if (p.onstage) return "DONE";
  if (p.backstage) return "BACKSTAGE";
  if (p.noshow) return "NOSHOW";
  const d = deadlines(session, st);
  if (p.arrived) return now > d.backstageBy ? "TAKE_BACKSTAGE" : "ARRIVED";
  if (now > session.end) return "NOSHOW";
  if (now > d.arriveBy) return "LATE";
  if (!p.etaCall && now > d.etaBy) return "CALLNOW";
  if (p.called || p.etaCall) return "CONFIRMED";
  return "NOTCALLED";
}

/** Which button to highlight: after the ETA-call deadline skip the D-1 call; once late, skip calls entirely. */
export function nextStep(p: Person, session?: Session, st?: Settings, now = 0): Step | null {
  if (p.noshow) return null;
  const d = session && st ? deadlines(session, st) : null;
  const from = d && now > d.arriveBy ? 2 : d && now > d.etaBy ? 1 : 0;
  for (let i = from; i < STEPS.length; i++) if (!p[STEPS[i]!]) return STEPS[i]!;
  return null;
}

// ---------- lookups ----------
export const peopleOf = (state: State, sid: string) => state.people.filter((p) => p.sid === sid);
export const sessionById = (state: State, sid: string) => state.sessions.find((s) => s.id === sid) ?? null;
export const personById = (state: State, pid: string) => state.people.find((p) => p.id === pid) ?? null;
export const memberByName = (state: State, name: string) => state.team.find((m) => m.name === name) ?? null;

export type Readiness = { total: number; arrived: number; backstage: number; onstage: number; late: number; noshow: number; flag: "PENDING" | "NOPEOPLE" | "DONE" | "LIVE" | "AT_RISK" | "READY" };
export function sessionReadiness(state: State, s: Session, now: number): Readiness {
  const ppl = peopleOf(state, s.id);
  const r: Readiness = { total: 0, arrived: 0, backstage: 0, onstage: 0, late: 0, noshow: 0, flag: "PENDING" };
  for (const p of ppl) {
    const code = personStatus(p, s, state.settings, now);
    if (code === "NOSHOW") { r.noshow++; continue; }
    r.total++;
    if (p.arrived || p.backstage || p.onstage) r.arrived++;
    if (p.backstage || p.onstage) r.backstage++;
    if (p.onstage) r.onstage++;
    if (code === "LATE" || code === "TAKE_BACKSTAGE") r.late++;
  }
  if (!ppl.length) r.flag = "NOPEOPLE";
  else if (now >= s.end) r.flag = "DONE";
  else if (now >= s.start || r.onstage) r.flag = "LIVE";
  else if (r.late) r.flag = "AT_RISK";
  else if (r.total && r.backstage === r.total) r.flag = "READY";
  return r;
}

// ---------- rota ----------
type Win = [number, number];

/** A PR is with a speaker from arrival (start − arriveMin) until the speaker walks on stage. */
export function busyWindow(s: Session, st: Settings): Win {
  return [s.start - st.arriveMin * MIN, s.start + (st.stageMin || 0) * MIN];
}

/** Each speaker has their own PR (p.pr); older data only had one PR per session (s.owner) – used as a fallback. */
export function prOf(state: State, p: Person) {
  if (p.pr) return p.pr;
  const s = sessionById(state, p.sid);
  return s?.owner || "";
}

export function prsOfSession(state: State, s: Session) {
  const out: Record<string, number> = {};
  for (const p of peopleOf(state, s.id)) {
    const n = prOf(state, p);
    if (n) out[n] = (out[n] || 0) + 1;
  }
  return out;
}

export function sessionsOfPr(state: State, name: string, day?: string) {
  return state.sessions.filter((s) => (!day || s.day === day) && peopleOf(state, s.id).some((p) => prOf(state, p) === name));
}

/** The only rule: a PR never has two speakers on the same panel. (No breaks – free time = no speaker.) */
export function personRota(state: State, p: Person): RotaCode {
  const name = prOf(state, p);
  if (!name) return "NO_PR";
  if (!memberByName(state, name)) return "UNKNOWN_PR";
  return peopleOf(state, p.sid).filter((q) => prOf(state, q) === name).length > 1 ? "SAME_PANEL" : "OK";
}

const ROTA_RANK: Record<RotaCode, number> = { UNKNOWN_PR: 0, SAME_PANEL: 1, NO_PR: 2, OK: 9 };
/** Worst problem among the session's speakers */
export function rotaCheck(state: State, s: Session): RotaCode {
  let worst: RotaCode = "OK";
  for (const p of peopleOf(state, s.id)) {
    const r = personRota(state, p);
    if (ROTA_RANK[r] < ROTA_RANK[worst]) worst = r;
  }
  return worst;
}

export const ROTA_LABEL: Record<RotaCode, string> = {
  OK: "OK",
  NO_PR: "No PR assigned",
  UNKNOWN_PR: "Unknown PR",
  SAME_PANEL: "PR has 2 speakers on this panel",
};

/** 'S' = with a speaker, '' = free */
export function prStateAt(state: State, name: string, t: number, day: string): "S" | "" {
  return sessionsOfPr(state, name, day).some((s) => { const w = busyWindow(s, state.settings); return t >= w[0] && t < w[1]; }) ? "S" : "";
}

export function prCurrentSession(state: State, name: string, t: number) {
  let best: Session | null = null;
  for (const s of sessionsOfPr(state, name)) {
    const w = busyWindow(s, state.settings);
    if (t >= w[0] && t < w[1]) best = s;
  }
  return best;
}

/**
 * Rotation: walk the speakers in agenda order and hand them to the team in order
 * (1st member, 2nd, 3rd … then back to the 1st), continuing across sessions.
 * A member already used on the same panel is skipped, so nobody gets two speakers on one panel.
 * `onlyUnassigned` keeps existing choices and continues the rotation for the empty ones.
 */
export function autoAssign(state: State, day: string | null, onlyUnassigned: boolean) {
  const names = state.team.map((m) => m.name);
  if (!names.length) return 0;
  const sessions = state.sessions.filter((s) => !day || s.day === day).sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
  let next = 0;
  let changed = 0;
  for (const s of sessions) {
    const ppl = peopleOf(state, s.id);
    const used = new Set<string>();
    if (onlyUnassigned) for (const p of ppl) if (p.pr && names.includes(p.pr)) used.add(p.pr);
    for (const p of ppl) {
      if (onlyUnassigned && p.pr && names.includes(p.pr)) {
        // keep it, and continue the rotation after this member
        next = (names.indexOf(p.pr) + 1) % names.length;
        continue;
      }
      let pick = names[next % names.length]!;
      // skip members already on this panel (only possible to avoid when the panel is smaller than the team)
      for (let i = 0; i < names.length && used.has(pick); i++) { next++; pick = names[next % names.length]!; }
      next = (next + 1) % names.length;
      used.add(pick);
      if (p.pr !== pick) changed++;
      p.pr = pick;
    }
  }
  return changed;
}

// ---------- phones ----------
export function normName(s: string) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z؀-ۿ]+/g, " ").trim();
}

export function normPhone(s: unknown) {
  let d = String(s || "").replace(/[^\d+]/g, "");
  if (/^\+?20\d{10}$/.test(d)) d = "0" + d.replace(/^\+?20/, "");
  return d;
}

export function waLink(phone: string) {
  let d = normPhone(phone).replace(/^\+/, "");
  if (/^0\d{10}$/.test(d)) d = "20" + d.slice(1);
  return "https://wa.me/" + d;
}

/** Lines like "Name, 0100..." / "Name<TAB>0100..." / "Name 0100..." */
export function parsePhoneList(text: string) {
  const out: { raw: string; name: string; phone: string }[] = [];
  for (let line of String(text || "").split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)[\s,;:|\t-]*((?:\+|00)?\d[\d\s\-()]{6,}\d)\s*$/);
    if (!m) { out.push({ raw: line, name: line, phone: "" }); continue; }
    out.push({ raw: line, name: m[1]!.replace(/[\s,;:|\t-]+$/, "").trim(), phone: normPhone(m[2]) });
  }
  return out;
}

function lev(a: string, b: string) {
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}

export function matchPerson(state: State, name: string) {
  const n = normName(name);
  if (!n) return [];
  const exact = state.people.filter((p) => normName(p.name) === n);
  if (exact.length) return exact;
  const toks = n.split(" ");
  const byTok = state.people.filter((p) => {
    const pt = normName(p.name).split(" ");
    const hit = toks.filter((t) => t.length > 1 && pt.includes(t)).length;
    return hit >= Math.min(2, toks.length) && hit >= Math.min(2, pt.length);
  });
  if (byTok.length) return byTok;
  // typo tolerance: "Karim Wasim" → "Karim Wassim"
  let best = 3;
  let out: Person[] = [];
  for (const p of state.people) {
    const d = lev(n, normName(p.name));
    if (d < best) { best = d; out = [p]; } else if (d === best) out.push(p);
  }
  return n.length >= 6 && best <= 2 ? out.filter((p, _i, arr) => arr.every((q) => normName(q.name) === normName(p.name))) : [];
}

export function previewPhones(state: State, text: string) {
  return parsePhoneList(text).map((row) => {
    const m = row.phone ? matchPerson(state, row.name) : [];
    return { name: row.name, phone: row.phone, matches: m.map((p) => p.id), raw: row.raw };
  });
}

// ---------- mutations ----------
export function uid(prefix: string) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function addLog(state: State, by: string, text: string, now: number) {
  const e = { ts: now, by, text };
  state.log.push(e);
  if (state.log.length > 150) state.log.splice(0, state.log.length - 150);
  state._newLog = [...(state._newLog || []), e];
}

const ADMIN_ONLY = new Set(["assign", "autoAssign", "owner", "importPhones", "savePerson", "deletePerson", "saveSession", "deleteSession", "saveMember", "removeMember", "pin", "settings"]);
const str = (v: unknown) => (v == null ? "" : String(v));
const isHHMM = (v: unknown) => /^\d{1,2}:\d{2}$/.test(str(v));
const pad5 = (v: unknown) => ("0" + str(v)).slice(-5);

/** Mutates state. Returns {ok, error?, dirty:[tables], result?} */
export function apply(state: State, a: Action, actor: Actor, now: number): ApplyResult {
  const by = actor.name;
  if (ADMIN_ONLY.has(a.type) && actor.admin !== true) return { ok: false, error: "Only the Team Leader can do that." };
  const dirty: Table[] = [];
  const needP = () => {
    const p = personById(state, str(a.pid));
    if (!p) throw new Error("Speaker not found – refresh.");
    const s = sessionById(state, p.sid);
    if (!s) throw new Error("Session not found – refresh.");
    return { p, s };
  };
  const touch = (x: Person) => { x.updatedBy = by; x.updatedAt = now; };
  try {
    switch (a.type) {
      case "step": {
        const { p, s } = needP();
        const step = str(a.step) as Step;
        if (!STEPS.includes(step)) throw new Error("Bad step");
        p[step] = a.value ? now : null;
        if (a.value) {
          // ticking a later step implies the earlier (non-call) ones
          for (let i = 0; i < STEPS.indexOf(step); i++) {
            const k = STEPS[i]!;
            if (!p[k] && k !== "called" && k !== "etaCall") p[k] = now;
          }
          p.noshow = false;
        }
        touch(p); dirty.push("people");
        addLog(state, by, `${a.value ? "" : "Undo: "}${STEP_LABEL[step]} – ${p.name} (${s.title})`, now);
        break;
      }
      case "eta": {
        const { p } = needP();
        p.eta = str(a.text).slice(0, 60);
        if (a.text && !p.etaCall) p.etaCall = now;
        touch(p); dirty.push("people");
        addLog(state, by, `ETA ${p.eta} – ${p.name}`, now);
        break;
      }
      case "note": {
        const { p } = needP();
        p.notes = str(a.text).slice(0, 500);
        touch(p); dirty.push("people");
        addLog(state, by, `Note on ${p.name}: ${p.notes}`, now);
        break;
      }
      case "phone": {
        const { p } = needP();
        p.phone = normPhone(a.phone);
        touch(p); dirty.push("people");
        addLog(state, by, `Phone updated – ${p.name}`, now);
        break;
      }
      case "noshow": {
        const { p, s } = needP();
        p.noshow = !!a.value;
        touch(p); dirty.push("people");
        addLog(state, by, `${a.value ? "NO-SHOW marked – " : "No-show cleared – "}${p.name} (${s.title})`, now);
        if (a.value) {
          state.incidents.push({ id: uid("I"), ts: now, by, sid: s.id, pid: p.id, kind: "Speaker no-show", note: p.name, status: "open", resolvedBy: "", resolvedAt: null });
          dirty.push("incidents");
        }
        break;
      }
      case "incident": {
        if (!a.kind) throw new Error("Choose what happened.");
        const inc: Incident = { id: uid("I"), ts: now, by, sid: str(a.sid), pid: str(a.pid), kind: str(a.kind), note: str(a.note).slice(0, 500), status: "open", resolvedBy: "", resolvedAt: null };
        state.incidents.push(inc); dirty.push("incidents");
        addLog(state, by, `Issue: ${inc.kind}${inc.note ? " – " + inc.note : ""}`, now);
        break;
      }
      case "resolveIncident": {
        const it = state.incidents.find((x) => x.id === a.id);
        if (!it) throw new Error("Incident not found");
        it.status = a.reopen ? "open" : "resolved";
        it.resolvedBy = a.reopen ? "" : by;
        it.resolvedAt = a.reopen ? null : now;
        dirty.push("incidents");
        addLog(state, by, `${a.reopen ? "Reopened: " : "Resolved: "}${it.kind}`, now);
        break;
      }
      case "owner": {
        const os = sessionById(state, str(a.sid));
        if (!os) throw new Error("Session not found");
        const prev = os.owner;
        os.owner = str(a.owner);
        dirty.push("sessions");
        addLog(state, by, `Reassigned "${os.title}" ${prev || "–"} → ${os.owner || "–"}`, now);
        return { ok: true, dirty, result: rotaCheck(state, os) };
      }
      case "assign": {
        const { p, s } = needP();
        if (a.pr && !memberByName(state, str(a.pr))) throw new Error("PR not found");
        const was = prOf(state, p);
        p.pr = str(a.pr);
        touch(p); dirty.push("people");
        addLog(state, by, `Assigned ${p.name} (${s.title}): ${was || "–"} → ${p.pr || "–"}`, now);
        return { ok: true, dirty, result: personRota(state, p) };
      }
      case "autoAssign": {
        const n = autoAssign(state, a.day ? str(a.day) : null, !!a.onlyUnassigned);
        dirty.push("people");
        addLog(state, by, `Assigned PRs in rotation${a.day ? " for " + str(a.day) : ""} (${n} changed)`, now);
        return { ok: true, dirty, result: n };
      }
      case "pin": {
        const m = memberByName(state, str(a.name));
        if (!m) throw new Error("PR not found");
        if (!/^\d{4,8}$/.test(str(a.pin))) throw new Error("PIN must be 4–8 digits");
        m.pin = str(a.pin);
        dirty.push("team");
        break;
      }
      case "importPhones": {
        let applied = 0;
        for (const r of (Array.isArray(a.rows) ? a.rows : []) as { phone?: string; pids?: string[] }[]) {
          for (const pid of r.pids || []) {
            const pp = personById(state, pid);
            if (pp && r.phone) { pp.phone = normPhone(r.phone); touch(pp); applied++; }
          }
        }
        dirty.push("people");
        addLog(state, by, `Imported ${applied} speaker phone numbers`, now);
        return { ok: true, dirty, result: applied };
      }
      case "savePerson": {
        const name = str(a.name).trim();
        const sid = str(a.sid);
        if (!name || !sid) throw new Error("Name and session are required");
        const target = sessionById(state, sid);
        if (!target) throw new Error("Session not found");
        if (a.pr && !memberByName(state, str(a.pr))) throw new Error("PR not found");
        if (a.pid) {
          const { p } = needP();
          p.name = name; p.role = str(a.role) || "Speaker"; p.phone = normPhone(a.phone); p.sid = sid;
          if (a.pr !== undefined) p.pr = str(a.pr);
          touch(p);
          addLog(state, by, `Edited ${p.name}`, now);
        } else {
          const np: Person = {
            id: uid("P"), sid, pr: str(a.pr), name, role: str(a.role) || "Speaker", phone: normPhone(a.phone),
            called: null, etaCall: null, eta: "", arrived: null, backstage: null, onstage: null, noshow: false, notes: "", updatedBy: by, updatedAt: now,
          };
          state.people.push(np);
          addLog(state, by, `Added ${np.name} to ${target.title}`, now);
        }
        dirty.push("people");
        break;
      }
      case "deletePerson": {
        const { p, s } = needP();
        state.people.splice(state.people.indexOf(p), 1);
        dirty.push("people");
        addLog(state, by, `Removed ${p.name} from ${s.title}`, now);
        break;
      }
      case "saveSession": {
        // add (no sid) or edit; validate everything before touching state
        const cur = a.sid ? sessionById(state, str(a.sid)) : null;
        if (a.sid && !cur) throw new Error("Session not found");
        const title = (str(a.title) || cur?.title || "").trim();
        const sday = str(a.day) || cur?.day || state.settings.day1;
        const fmt24 = (ms: number) => {
          const tzm = /^([+-])(\d\d):(\d\d)$/.exec(state.settings.tz || "+03:00")!;
          const off = (tzm[1] === "-" ? -1 : 1) * (+tzm[2]! * HOUR + +tzm[3]! * MIN);
          const d = new Date(ms + off);
          return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
        };
        const startHHMM = str(a.startHHMM) || (cur ? fmt24(cur.start) : "");
        const endHHMM = str(a.endHHMM) || (cur ? fmt24(cur.end) : "");
        if (!title) throw new Error("Session title is required");
        if (!isHHMM(startHHMM) || !isHHMM(endHHMM)) throw new Error("Start and end times are required");
        const st0 = dayStart(sday, pad5(startHHMM), state.settings.tz);
        const en0 = dayStart(sday, pad5(endHHMM), state.settings.tz);
        if (en0 <= st0) throw new Error("End must be after start");
        if (a.owner && !memberByName(state, str(a.owner))) throw new Error("PR not found");
        let ns: Session;
        if (cur) {
          ns = cur;
          ns.title = title; ns.day = sday; ns.start = st0; ns.end = en0;
          if (a.stype) ns.type = str(a.stype);
          if (a.owner !== undefined) ns.owner = str(a.owner);
          addLog(state, by, `Session updated: ${ns.title}`, now);
        } else {
          ns = { id: uid("S"), day: sday, start: st0, end: en0, title, type: str(a.stype) || "Panel", owner: str(a.owner), notes: "" };
          state.sessions.push(ns);
          addLog(state, by, `New session: ${ns.title}`, now);
        }
        dirty.push("sessions");
        return { ok: true, dirty, result: { sid: ns.id, rota: rotaCheck(state, ns) } };
      }
      case "deleteSession": {
        const ds = sessionById(state, str(a.sid));
        if (!ds) throw new Error("Session not found");
        state.sessions.splice(state.sessions.indexOf(ds), 1);
        const removed = state.people.filter((x) => x.sid === ds.id).length;
        state.people = state.people.filter((x) => x.sid !== ds.id);
        dirty.push("sessions", "people");
        addLog(state, by, `Cancelled session: ${ds.title}${removed ? ` (${removed} people removed)` : ""}`, now);
        break;
      }
      case "saveMember": {
        const nm = str(a.name).trim().replace(/\s+/g, " ");
        if (!nm) throw new Error("Name is required");
        const pinv = str(a.pin).trim() || String(1000 + Math.floor(Math.random() * 9000));
        if (!/^\d{4,8}$/.test(pinv)) throw new Error("PIN must be 4–8 digits");
        const clash = memberByName(state, nm);
        let mem = a.origName ? memberByName(state, str(a.origName)) : null;
        if (a.origName && !mem) throw new Error("Member not found");
        if (clash && clash !== mem) throw new Error(`Someone called "${nm}" already exists`);
        if (!mem) {
          mem = { name: nm, fullName: "", phone: "", pin: "", lunch1: "", lunch2: "", guest: false };
          state.team.push(mem);
        } else if (mem.name !== nm) {
          const old = mem.name;
          for (const x of state.sessions) if (x.owner === old) { x.owner = nm; if (!dirty.includes("sessions")) dirty.push("sessions"); }
          for (const x of state.people) if (x.pr === old) { x.pr = nm; if (!dirty.includes("people")) dirty.push("people"); }
        }
        const wasNew = !a.origName;
        mem.name = nm; mem.phone = normPhone(a.phone); mem.pin = pinv; mem.guest = !!a.guest;
        if (a.fullName !== undefined) mem.fullName = str(a.fullName);
        dirty.push("team");
        addLog(state, by, `${wasNew ? "Added team member " : "Updated team member "}${nm}${mem.guest ? " (guest)" : ""}`, now);
        return { ok: true, dirty, result: { name: nm, pin: pinv } };
      }
      case "removeMember": {
        const rm = memberByName(state, str(a.name));
        if (!rm) throw new Error("Member not found");
        let freed = 0;
        for (const x of state.people) if (prOf(state, x) === rm.name) { x.pr = ""; freed++; }
        for (const x of state.sessions) if (x.owner === rm.name) x.owner = "";
        state.team.splice(state.team.indexOf(rm), 1);
        dirty.push("team", "sessions", "people");
        addLog(state, by, `Removed team member ${rm.name}${freed ? ` – ${freed} speaker(s) now have no PR` : ""}`, now);
        return { ok: true, dirty, result: freed };
      }
      default:
        throw new Error("Unknown action " + a.type);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true, dirty };
}

export function counts(state: State, day: string | null, now: number) {
  const c = Object.fromEntries(Object.keys(STATUS).map((k) => [k, 0])) as Record<StatusCode, number> & { total?: number };
  let total = 0;
  for (const s of state.sessions) {
    if (day && s.day !== day) continue;
    for (const p of peopleOf(state, s.id)) { c[personStatus(p, s, state.settings, now)]++; total++; }
  }
  return { ...c, total };
}
