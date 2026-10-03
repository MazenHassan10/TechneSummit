"use client";

import * as Core from "@great-hall-pr/core";
import type { Person, Tone } from "@great-hall-pr/core";
import { Alert, AlertDescription, AlertTitle } from "@great-hall-pr/ui/components/alert";
import { Badge } from "@great-hall-pr/ui/components/badge";
import { buttonVariants } from "@great-hall-pr/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@great-hall-pr/ui/components/select";
import { Tabs, TabsList, TabsTrigger } from "@great-hall-pr/ui/components/tabs";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { Coffee, MessageCircle, Mic, Phone, TriangleAlert } from "lucide-react";
import { createContext, useContext } from "react";
import { toast } from "sonner";

import { useApp } from "./store";

// ---------- status colours (semantic, used only for text + small dots) ----------
export const TONE_TEXT: Record<Tone, string> = {
  done: "text-st-done", ready: "text-[#b07400]", arrived: "text-st-arrived", urgent: "text-st-urgent",
  warn: "text-st-warn", ok: "text-st-ok", idle: "text-muted-foreground", noshow: "text-st-noshow",
};
export const TONE_BG: Record<Tone, string> = {
  done: "bg-st-done", ready: "bg-st-ready", arrived: "bg-st-arrived", urgent: "bg-st-urgent",
  warn: "bg-st-warn", ok: "bg-st-ok", idle: "bg-st-idle", noshow: "bg-st-noshow",
};

export const Dot = ({ tone }: { tone: Tone }) => <span className={cn("inline-block size-2 shrink-0 rounded-full", TONE_BG[tone])} />;

// ---------- shadcn-based building blocks ----------
export function DayTabs({ value, onChange, days }: { value: string; onChange: (d: string) => void; days: { value: string; label: string }[] }) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(String(v))} className="mb-3">
      <TabsList>
        {days.map((d) => <TabsTrigger key={d.value} value={d.value} className="px-4">{d.label}</TabsTrigger>)}
      </TabsList>
    </Tabs>
  );
}

const BANNER = {
  free: { icon: Coffee, cls: "border-st-done/40 bg-st-done/10" },
  busy: { icon: Mic, cls: "border-primary/30 bg-secondary" },
  alert: { icon: TriangleAlert, cls: "" },
} as const;

/** Team Leader's heads-up about reaching a speaker (only sent to that speaker's PR and the admin). */
export function HeadsUp({ text, compact, className }: { text?: string; compact?: boolean; className?: string }) {
  if (!text) return null;
  return (
    <div className={cn("flex items-start gap-1.5 rounded-md border border-amber/50 bg-amber/15 text-foreground", compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-2 text-xs", className)}>
      <TriangleAlert className={cn("mt-px shrink-0 text-amber", compact ? "size-3" : "size-3.5")} />
      <span><b className="font-semibold">Heads-up:</b> {text}</span>
    </div>
  );
}

export function Banner({ kind, title, children }: { kind: keyof typeof BANNER; title: React.ReactNode; children?: React.ReactNode }) {
  const B = BANNER[kind];
  const Icon = B.icon;
  return (
    <Alert variant={kind === "alert" ? "destructive" : "default"} className={cn("mb-3", B.cls)}>
      <Icon />
      <AlertTitle>{title}</AlertTitle>
      {children && <AlertDescription>{children}</AlertDescription>}
    </Alert>
  );
}

// ---------- call / WhatsApp (real links, styled as shadcn buttons) ----------
// Phones sometimes refuse tel: links – copying the number gives a fallback.
function copy(phone: string) {
  try { void navigator.clipboard?.writeText(phone); } catch {}
  toast(`Calling ${phone} (number copied)`);
}

export function CallLink({ phone, label, title }: { phone: string; label?: string; title?: string }) {
  return (
    <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} onClick={() => copy(phone)} title={title || "Call"}
      className={buttonVariants({ variant: "outline", size: label ? "default" : "icon" })}>
      <Phone />{label}
    </a>
  );
}

export function WhatsAppLink({ phone, label }: { phone: string; label?: string }) {
  return (
    <a href={Core.waLink(phone)} target="_blank" rel="noopener" title="WhatsApp"
      className={cn(buttonVariants({ variant: "outline", size: label ? "default" : "icon" }), "text-[#1da851]")}>
      <MessageCircle />{label}
    </a>
  );
}

// ---------- PR picker (per speaker) ----------
const NONE = "__none__";
export function PrPicker({ person }: { person: Person }) {
  const { state, act } = useApp();
  if (!state) return null;
  const cur = Core.prOf(state, person);
  const onChange = async (v: string | null) => {
    const pr = !v || v === NONE ? "" : v;
    const r = await act({ type: "assign", pid: person.id, pr });
    if (r.ok) {
      const code = r.result as Core.RotaCode;
      if (code && code !== "OK" && code !== "NO_PR") toast.warning(`${Core.ROTA_LABEL[code]} – pick someone else`);
      else toast.success(pr ? `Assigned to ${pr}` : "PR removed");
    }
  };
  const items = prOptions(state, "No PR");
  return (
    <Select value={cur || NONE} onValueChange={(v) => void onChange(v as string)} items={items}>
      <SelectTrigger className="min-w-48"><SelectValue /></SelectTrigger>
      <SelectContent>{items.map((it) => <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function RotaBadge({ code }: { code: Core.RotaCode }) {
  if (code === "OK") return null;
  return <Badge variant="destructive">{Core.ROTA_LABEL[code]}</Badge>;
}

/** PR choices for pickers: the PR team, then the Team Leader (only ever picked by hand). */
export function prOptions(state: Core.State, none: string, noneValue = NONE) {
  return [
    { value: noneValue, label: none },
    ...Core.prTeam(state).map((m) => ({ value: m.name, label: m.name })),
    ...(state.settings.adminName ? [{ value: state.settings.adminName, label: `${state.settings.adminName} (Team Leader)` }] : []),
  ];
}

// ---------- modal registry ----------
export type ModalSpec =
  | { kind: "person"; pid: string }
  | { kind: "personEdit"; pid?: string; sid?: string }
  | { kind: "sessionEdit"; sid?: string }
  | { kind: "member"; name?: string }
  | { kind: "incident"; sid?: string; pid?: string; note?: string }
  | { kind: "autoAssign" }
  | { kind: "waReminder"; pid: string }
  | { kind: "agendaChanges" }
  | { kind: "menu" };

export const ModalCtx = createContext<{ open: (m: ModalSpec) => void; close: () => void }>({ open: () => {}, close: () => {} });
export const useModal = () => useContext(ModalCtx);
