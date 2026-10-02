"use client";

import { Badge } from "@great-hall-pr/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@great-hall-pr/ui/components/card";
import { Separator } from "@great-hall-pr/ui/components/separator";
import { buttonVariants } from "@great-hall-pr/ui/components/button";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { ArrowDown, Phone, Siren } from "lucide-react";
import { Fragment } from "react";

import { useApp } from "./store";
import { CallLink, WhatsAppLink } from "./ui";

type Contact = { name: string; phone: string };
type Level = { title: string; note?: string; people: Contact[] };
/** settings.contacts (JSON, kept in the database only): who to escalate to, in order, plus other useful numbers */
type Contacts = { chain: Level[]; other: Level[] };

function parse(raw?: string): Contacts {
  try {
    const c = JSON.parse(raw || "") as Partial<Contacts>;
    const ok = (ls: unknown) => (Array.isArray(ls) ? ls : []).filter((l): l is Level => !!l && typeof l === "object").map((l) => ({ ...l, title: String(l.title ?? ""), people: (Array.isArray(l.people) ? l.people : []).filter((x) => x && x.phone) }));
    return { chain: ok(c.chain), other: ok(c.other) };
  }
  catch { return { chain: [], other: [] }; }
}

function Person({ c }: { c: Contact }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1"><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground tabular-nums">{c.phone}</div></div>
      <div className="flex shrink-0 gap-1.5"><CallLink phone={c.phone} title={`Call ${c.name}`} /><WhatsAppLink phone={c.phone} /></div>
    </div>
  );
}

function LevelCard({ l, step }: { l: Level; step?: number }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{step && <Badge className="size-6 justify-center rounded-full p-0 tabular-nums">{step}</Badge>}{l.title}</CardTitle>
        {l.note && <CardDescription>{l.note}</CardDescription>}
      </CardHeader>
      <CardContent className="divide-y">{l.people.map((c) => <Person key={c.name} c={c} />)}</CardContent>
    </Card>
  );
}

/** Important phone numbers – the escalation chain from the Team Leader up, then other useful contacts. */
export function ContactsView() {
  const { state } = useApp();
  if (!state) return null;
  const c = parse(state.settings.contacts);
  const lead = state.settings.adminPhone ? { name: state.settings.adminName, phone: state.settings.adminPhone } : null;
  const chain = c.chain;
  return (
    <div className="mx-auto max-w-xl space-y-2">
      <div className="mb-3"><h2 className="text-lg font-semibold">Important numbers</h2><p className="text-sm text-muted-foreground">Any problem: call the Team Leader first. Only go further up if they ask you to or can't be reached.</p></div>
      {lead && (
        <Card className="bg-primary text-primary-foreground ring-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Siren className="size-5" />Your direct call – any problem</CardTitle>
            <CardDescription className="text-primary-foreground/85">Team Leader · call or WhatsApp straight away</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <div className="min-w-0 flex-1"><div className="text-lg font-semibold">{lead.name}</div><div className="text-sm tabular-nums opacity-85">{lead.phone}</div></div>
            <a href={`tel:${lead.phone}`} className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "shrink-0")}><Phone />Call</a>
            <WhatsAppLink phone={lead.phone} />
          </CardContent>
        </Card>
      )}
      {lead && chain.length > 0 && <p className="pt-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Escalation, after the Team Leader</p>}
      {chain.map((l, i) => (
        <Fragment key={l.title}>
          {i > 0 && <div className="flex justify-center text-muted-foreground"><ArrowDown className="size-4" /></div>}
          <LevelCard l={l} step={i + 1} />
        </Fragment>
      ))}
      {c.other.length > 0 && (<><Separator className="my-4" /><h3 className="text-sm font-semibold text-muted-foreground">Other numbers</h3>{c.other.map((l) => <LevelCard key={l.title} l={l} />)}</>)}
      {!lead && !chain.length && !c.other.length && <p className="py-8 text-center text-sm text-muted-foreground">No numbers yet.</p>}
    </div>
  );
}
