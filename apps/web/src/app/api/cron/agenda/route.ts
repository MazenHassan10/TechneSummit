// Called every 30 minutes by .github/workflows/agenda-watch.yml (and safe to call by hand).
// Only records proposals for the Team Leader – it never changes the agenda by itself.
import { runAgendaCheck } from "@great-hall-pr/api/agenda-store";
import { NextResponse, type NextRequest } from "next/server";

import { ENV } from "@/env";
import { db } from "@/services";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = ENV.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await runAgendaCheck(db);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
