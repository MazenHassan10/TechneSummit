"use client";

import type { Person } from "@great-hall-pr/core";
import { Button } from "@great-hall-pr/ui/components/button";
import { Textarea } from "@great-hall-pr/ui/components/textarea";
import { cn } from "@great-hall-pr/ui/lib/utils";
import { NotebookPen, Pencil, Reply } from "lucide-react";
import { useState } from "react";

import { hm } from "./format";
import { useApp } from "./store";

/** One-tap starters – PRs can still type anything, in Arabic or English. */
const QUICK = ["Not answering", "Wrong number", "Phone off", "Called – on the way", "Will be late", "Stuck in traffic", "At the gate", "In Techne (on site)", "In the speaker lounge", "In the café", "At another stage"];

/** The PR's live note about where the speaker is / what happened. Shown to the PR, the Team Leader and managers. */
export function PrNote({ p, canEdit, compact }: { p: Person; canEdit: boolean; compact?: boolean }) {
  const { act } = useApp();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(p.notes);
  const [busy, setBusy] = useState(false);
  const open = () => { setText(p.notes); setEditing(true); };
  const save = async (v: string) => {
    setBusy(true);
    const r = await act({ type: "note", pid: p.id, text: v }, v.trim() ? "Note saved" : "Note cleared");
    setBusy(false);
    if (r.ok) setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2.5">
        <Textarea dir="auto" autoFocus rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="What happened? Tap a button or type anything (English or Arabic)" className="bg-background text-sm" />
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => setText((t) => (t.trim() ? `${t.trim()} · ${q}` : q))}
              className="rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted">{q}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => void save(text)}>Save note</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
          {p.notes && <Button size="sm" variant="ghost" className="ml-auto text-destructive" disabled={busy} onClick={() => void save("")}>Clear</Button>}
        </div>
      </div>
    );
  }
  if (!p.notes) {
    return canEdit ? (
      <Button size="sm" variant="outline" className="h-8 w-full justify-start border-dashed text-muted-foreground" onClick={open}><NotebookPen />Add a note – where are they, what happened?</Button>
    ) : null;
  }
  return (
    <div className="space-y-1.5">
    <div className={cn("flex items-start gap-2 rounded-md border bg-muted/50 px-2.5 py-2", compact && "py-1.5")}>
      <NotebookPen className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p dir="auto" className="text-sm whitespace-pre-wrap break-words">{p.notes}</p>
        <p className="text-[11px] text-muted-foreground">PR note{p.noteAt ? ` · ${hm(p.noteAt)}` : ""}{p.updatedBy && p.noteAt ? ` · ${p.updatedBy}` : ""}</p>
      </div>
      {canEdit && <Button size="icon-sm" variant="ghost" onClick={open} aria-label="Edit note"><Pencil /></Button>}
    </div>
    <NoteReply p={p} />
    </div>
  );
}

/** The Team Leader's answer to this note (blue, so it stands out from the PR's own text). */
export function NoteReply({ p }: { p: Person }) {
  const { state } = useApp();
  if (!p.noteReply) return null;
  return (
    <div className="ml-4 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-2">
      <Reply className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p dir="auto" className="text-sm font-medium whitespace-pre-wrap break-words">{p.noteReply}</p>
        <p className="text-[11px] text-muted-foreground">{state?.settings.adminName || "Team Leader"} (Team Leader){p.noteReplyAt ? ` · ${hm(p.noteReplyAt)}` : ""}</p>
      </div>
    </div>
  );
}
