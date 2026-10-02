// Official-agenda watch. Only records proposals for the Team Leader – it never changes the agenda by itself.
//
// The official sched site blocks cloud servers (Cloudflare challenge), so the 30-minute GitHub Actions job
// downloads the pages itself and POSTs them here. The POST is only accepted with a GitHub Actions OIDC token
// issued to this repository – no shared secret to manage.
// GET tries to fetch sched directly (works when not blocked) – used by "Check now".
import { runAgendaCheck } from "@great-hall-pr/api/agenda-store";
import { parseSchedDay } from "@great-hall-pr/api/agenda-sync";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

import { ENV } from "@/env";
import { db } from "@/services";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REPO = "MazenHassan10/TechneSummit";
const AUDIENCE = "great-hall-pr";
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

async function fromOurGitHubRepo(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: "https://token.actions.githubusercontent.com", audience: AUDIENCE });
    return payload.repository === REPO;
  } catch {
    return ENV.CRON_SECRET ? token === ENV.CRON_SECRET : false;
  }
}

export async function GET(req: NextRequest) {
  if (ENV.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${ENV.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await runAgendaCheck(db);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

/** Body: { pages: { "2026-10-03": "<html…>", "2026-10-04": "<html…>" } } */
export async function POST(req: NextRequest) {
  if (!(await fromOurGitHubRepo(req))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { pages?: Record<string, string> } | null;
  const pages = body?.pages ?? {};
  const days = Object.keys(pages);
  if (!days.length) return NextResponse.json({ ok: false, error: "no pages" }, { status: 400 });
  const sched = days.flatMap((d) => parseSchedDay(pages[d] ?? "", d));
  const blocked = days.some((d) => /Just a moment|challenges\.cloudflare\.com/i.test((pages[d] ?? "").slice(0, 3000)) || !parseSchedDay(pages[d] ?? "", d).length);
  if (blocked) {
    const result = await runAgendaCheck(db, { sched: [], error: "Official site blocked the automatic download (security check)" });
    return NextResponse.json(result, { status: 502 });
  }
  const result = await runAgendaCheck(db, { sched });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
