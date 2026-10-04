"use client";

import * as Core from "@great-hall-pr/core";
import { Button, buttonVariants } from "@great-hall-pr/ui/components/button";
import { DialogDescription, DialogHeader, DialogTitle } from "@great-hall-pr/ui/components/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@great-hall-pr/ui/components/dropdown-menu";
import { Label } from "@great-hall-pr/ui/components/label";
import { Textarea } from "@great-hall-pr/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@great-hall-pr/ui/components/toggle-group";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { BellRing, Copy, MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { dayOf, hm } from "./format";
import { useApp } from "./store";
import { useModal } from "./ui";

const TITLES = ["Mr.", "Mrs.", "Ms.", "Dr.", "Eng."] as const;
const NAME_ONLY = "name";
const titleKey = (name: string) => `gh_title:${Core.normName(name)}`;

/** "2 PM" or "2:15 PM" – a rounder time reads more naturally in a message */
const around = (t: number) => hm(t).replace(":00 ", " ");


/** Speaker WhatsApp button: open the chat, or start it with a ready reminder message. */
export function SpeakerWhatsApp({ p, label }: { p: Core.Person; label?: string }) {
  const modal = useModal();
  if (!p.phone) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: label ? "default" : "icon" }), "text-[#1da851]")} aria-label="WhatsApp">
        <MessageCircle />{label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem onClick={() => modal.open({ kind: "waReminder", pid: p.id })}><BellRing />Send reminder message…</DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(Core.waLink(p.phone), "_blank", "noopener")}><MessageCircle />Just open the chat</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Builds the reminder, lets the PR pick the greeting and edit it, then opens WhatsApp with it. */
export function WaReminder({ pid }: { pid: string }) {
  const { state, me, now } = useApp();
  const modal = useModal();
  const p = state ? Core.personById(state, pid) : undefined;
  const s = state && p ? Core.sessionById(state, p.sid) : undefined;
  const cleanName = (p?.name ?? "").replace(/^(Mr|Mrs|Ms|Dr|Eng)\.?\s+/i, "");
  const fromName = /^(Mr|Mrs|Ms|Dr|Eng)\.?\s/i.exec(p?.name ?? "")?.[1];
  const saved = typeof window !== "undefined" && p ? localStorage.getItem(titleKey(p.name)) : null;
  const [title, setTitle] = useState<string>(saved || (fromName ? `${fromName[0]!.toUpperCase()}${fromName.slice(1).toLowerCase()}.` : NAME_ONLY));
  const [edited, setEdited] = useState<string | null>(null);
  if (!state || !me || !p || !s) return <p className="text-sm text-muted-foreground">This speaker was removed.</p>;

  const member = Core.memberByName(state, me.name);
  const fromWho = me.admin ? state.settings.adminName : member?.fullName || me.name;
  const d = Core.deadlines(s, state.settings);
  const greeting = title === NAME_ONLY ? cleanName : `${title} ${cleanName}`;
  // short and natural, like a normal WhatsApp message (no date, no session title, no dashes)
  const when = s.day === dayOf(now()) ? "today " : "";
  const what = p.role === "Moderator" ? "you're moderating a session" : "you have a session";
  const built = [
    `Hi ${greeting},`,
    `I'm ${fromWho}, a PR from Techne team. I'm just reminding you that ${what} ${when}around ${around(s.start)}. It would be great if you could arrive by around ${around(d.arriveBy)} so we can get you ready.`,
    "Could you reply to let me know your availability? Thank you!",
  ].join("\n");
  const text = edited ?? built;

  const pick = (v: string) => { setTitle(v); setEdited(null); try { localStorage.setItem(titleKey(p.name), v); } catch {} };
  const send = () => { window.open(`${Core.waLink(p.phone)}?text=${encodeURIComponent(text)}`, "_blank", "noopener"); modal.close(); };
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast.success("Message copied"); } catch { toast.error("Couldn't copy"); } };

  return (
    <>
      <DialogHeader>
        <DialogTitle>WhatsApp reminder – {p.name}</DialogTitle>
        <DialogDescription>Pick how to greet them, check the message, then open WhatsApp – you still press send there.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label>Greeting</Label>
        <ToggleGroup value={[title]} onValueChange={(v) => { const x = (v as string[])[0]; if (x) pick(x); }} variant="outline" className="flex-wrap">
          {TITLES.map((t) => <ToggleGroupItem key={t} value={t}>{t}</ToggleGroupItem>)}
          <ToggleGroupItem value={NAME_ONLY}>Name only</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="space-y-2">
        <Label>Message</Label>
        <Textarea rows={7} value={text} onChange={(e) => setEdited(e.target.value)} className="text-sm leading-relaxed" />
        {edited !== null && <button type="button" className="text-xs text-primary underline" onClick={() => setEdited(null)}>Reset to the standard message</button>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" className="flex-1 bg-[#1da851] hover:bg-[#178a43]" onClick={send}><Send />Open in WhatsApp</Button>
        <Button size="lg" variant="outline" onClick={copy}><Copy />Copy</Button>
      </div>
    </>
  );
}
