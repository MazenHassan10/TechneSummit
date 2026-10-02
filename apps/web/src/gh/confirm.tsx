"use client";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@great-hall-pr/ui/components/alert-dialog";
import { useEffect, useState } from "react";

type Ask = { title: string; description?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean };
type Pending = Ask & { resolve: (ok: boolean) => void };

let show: ((p: Pending) => void) | null = null;

/** shadcn confirmation dialog – `if (!(await ask({ title: "Undo Called?" }))) return;` */
export function ask(opts: Ask): Promise<boolean> {
  return new Promise((resolve) => (show ? show({ ...opts, resolve }) : resolve(window.confirm(opts.title))));
}

/** Mount once near the root. */
export function ConfirmHost() {
  const [cur, setCur] = useState<Pending | null>(null);
  useEffect(() => { show = setCur; return () => { show = null; }; }, []);
  const close = (ok: boolean) => { cur?.resolve(ok); setCur(null); };
  return (
    <AlertDialog open={!!cur} onOpenChange={(o) => { if (!o) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{cur?.title}</AlertDialogTitle>
          {cur?.description && <AlertDialogDescription>{cur.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>{cur?.cancelLabel ?? "Cancel"}</AlertDialogCancel>
          <AlertDialogAction variant={cur?.destructive ? "destructive" : "default"} onClick={() => close(true)}>{cur?.confirmLabel ?? "Confirm"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
