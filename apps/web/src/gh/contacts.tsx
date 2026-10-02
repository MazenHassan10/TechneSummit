"use client";

import { Badge } from "@great-hall-pr/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@great-hall-pr/ui/components/card";
import { Separator } from "@great-hall-pr/ui/components/separator";
import { ArrowDown } from "lucide-react";
import { Fragment } from "react";

import { useApp } from "./store";
import { CallLink, WhatsAppLink } from "./ui";

type Contact = { name: string; phone: string };
type Level = { title: string; note?: string; people: Contact[] };
/** settings.contacts (JSON, kept in the database only): who to escalate to, in order, plus other useful numbers */
type Contacts = { chain: Level[]; other: Level[] };

function parse(raw?: string): Contacts {
  try { const c = JSON.parse(raw || "") as Partial<Contacts>; return { chain: c.chain ?? [], other: c.other ?? [] }; }
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
  const leader: Level | null = state.settings.adminPhone ? { title: "Team Leader", note: "Always call first", people: [{ name: state.settings.adminName, phone: state.settings.adminPhone }] } : null;
  const chain = [...(leader ? [leader] : []), ...c.chain];
  return (
    <div className="mx-auto max-w-xl space-y-2">
      <div className="mb-3"><h2 className="text-lg font-semibold">Important numbers</h2><p className="text-sm text-muted-foreground">If you can't solve it, go up one step at a time.</p></div>
      {chain.map((l, i) => (
        <Fragment key={l.title}>
          {i > 0 && <div className="flex justify-center text-muted-foreground"><ArrowDown className="size-4" /></div>}
          <LevelCard l={l} step={i + 1} />
        </Fragment>
      ))}
      {c.other.length > 0 && (<><Separator className="my-4" /><h3 className="text-sm font-semibold text-muted-foreground">Other numbers</h3>{c.other.map((l) => <LevelCard key={l.title} l={l} />)}</>)}
      {!chain.length && !c.other.length && <p className="py-8 text-center text-sm text-muted-foreground">No numbers yet.</p>}
    </div>
  );
}
