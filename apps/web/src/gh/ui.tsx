"use client";

import * as Core from "@great-hall-pr/core";
import type { Person, Tone } from "@great-hall-pr/core";
import { Button } from "@great-hall-pr/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@great-hall-pr/ui/components/select";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { MessageCircle, Phone } from "lucide-react";
import { createContext, useContext } from "react";
import { toast } from "sonner";

import { useApp } from "./store";

// ---------- status colours ----------
export const TONE_TEXT: Record<Tone, string> = {
  done: "text-st-done", ready: "text-[#b07400]", arrived: "text-st-arrived", urgent: "text-st-urgent",
  warn: "text-st-warn", ok: "text-st-ok", idle: "text-muted-foreground", noshow: "text-st-noshow",
};
export const TONE_BG: Record<Tone, string> = {
  done: "bg-st-done", ready: "bg-st-ready", arrived: "bg-st-arrived", urgent: "bg-st-urgent",
  warn: "bg-st-warn", ok: "bg-st-ok", idle: "bg-st-idle", noshow: "bg-st-noshow",
};

export const Dot = ({ tone }: { tone: Tone }) => <span className={cn("inline-block size-2.5 shrink-0 rounded-full", TONE_BG[tone])} />;

/** Small rounded label (owner, guest, "×2"…) */
export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full bg-soft px-2.5 py-0.5 text-[11px] font-semibold text-brand", className)}>{children}</span>;
}

/** Big orange Techne call-to-action */
export function BrandButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return <Button className={cn("h-11 rounded-full bg-orange px-5 text-sm font-semibold text-white hover:bg-orange-dark", className)} {...props} />;
}

// ---------- call / WhatsApp ----------
// Phones sometimes refuse tel: links – copying the number gives a fallback.
function copy(phone: string) {
  try { void navigator.clipboard?.writeText(phone); } catch {}
  toast(`📞 Calling ${phone} (number copied)`);
}

export function CallLink({ phone, className, children, title }: { phone: string; className?: string; children?: React.ReactNode; title?: string }) {
  return (
    <a href={`tel:${phone}`} onClick={() => copy(phone)} title={title || "Call"}
      className={cn("inline-flex size-9 items-center justify-center rounded-lg border border-line bg-soft text-brand", className)}>
      {children ?? <Phone className="size-4" />}
    </a>
  );
}

export function WhatsAppLink({ phone, className }: { phone: string; className?: string }) {
  return (
    <a href={Core.waLink(phone)} target="_blank" rel="noopener" title="WhatsApp"
      className={cn("inline-flex size-9 items-center justify-center rounded-lg bg-[#25d366] text-white", className)}>
      <MessageCircle className="size-4" />
    </a>
  );
}

// ---------- PR picker (per speaker) ----------
const NONE = "__none__";
export function PrPicker({ person, compact }: { person: Person; compact?: boolean }) {
  const { state, act } = useApp();
  if (!state) return null;
  const cur = Core.prOf(state, person);
  const onChange = async (v: string | null) => {
    const pr = !v || v === NONE ? "" : v;
    const r = await act({ type: "assign", pid: person.id, pr });
    if (r.ok) {
      const code = r.result as Core.RotaCode;
      if (code && code !== "OK" && code !== "NO_PR") toast.warning(`⚠ ${Core.ROTA_LABEL[code]} – pick someone else or move their lunch`);
      else toast.success(pr ? `Assigned to ${pr}` : "PR removed");
    }
  };
  const items = [{ value: NONE, label: "– no PR –" }, ...state.team.map((m) => ({ value: m.name, label: m.name }))];
  return (
    <Select value={cur || NONE} onValueChange={(v) => void onChange(v as string)} items={items}>
      <SelectTrigger className={cn("h-9 rounded-lg bg-white text-sm font-medium text-navy", compact ? "min-w-40" : "min-w-52")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((it) => <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// ---------- modal registry ----------
export type ModalSpec =
  | { kind: "person"; pid: string }
  | { kind: "personEdit"; pid?: string; sid?: string }
  | { kind: "sessionEdit"; sid?: string }
  | { kind: "member"; name?: string }
  | { kind: "incident"; sid?: string; pid?: string; note?: string }
  | { kind: "autoAssign" }
  | { kind: "menu" };

export const ModalCtx = createContext<{ open: (m: ModalSpec) => void; close: () => void }>({ open: () => {}, close: () => {} });
export const useModal = () => useContext(ModalCtx);
