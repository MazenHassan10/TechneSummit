import { apply, memberByName, prOf, type Actor, type State } from "@great-hall-pr/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { authedProcedure, publicProcedure, router } from "../index";
import { createToken, getVersion, loadState, persist, type StoredState } from "../store";
import { speakerProfiles } from "@great-hall-pr/db/schema/index";
import { eq } from "drizzle-orm";
import { cleanSocialUrl, socialType } from "../social";
import { decideChanges, runAgendaCheck } from "../agenda-store";

const ADMIN = "__admin__";

function actorFor(state: State, who: string): Actor {
  if (who === ADMIN) return { name: state.settings.adminName || "Team Leader", admin: true };
  // removed from the team → logged out
  if (!memberByName(state, who)) throw new TRPCError({ code: "UNAUTHORIZED", message: "SESSION_EXPIRED" });
  return { name: who, admin: false };
}

/** PINs are only visible to the Team Leader */
function publicState(state: StoredState, actor: Actor) {
  const { version: _v, _newLog: _n, ...rest } = state;
  const out = structuredClone(rest);
  if (!actor.admin) {
    out.settings.adminPin = "";
    for (const m of out.team) m.pin = "";
    // phone numbers only for the PR's own speakers
    for (const p of out.people) if (prOf(out, p) !== actor.name) { p.phone = ""; p.alert = ""; }
  }
  return out;
}

export const appRouter = router({
  healthCheck: publicProcedure.query(() => "OK"),

  auth: router({
    loginNames: publicProcedure.query(async ({ ctx }) => {
      const st = await loadState(ctx.db);
      return st.team.map((m) => m.name);
    }),
    login: publicProcedure
      .input(z.object({ name: z.string().min(1), pin: z.string().max(12) }))
      .mutation(async ({ ctx, input }) => {
        const st = await loadState(ctx.db);
        const pin = input.pin.trim();
        let who: string;
        if (input.name === ADMIN) {
          if (pin !== String(st.settings.adminPin)) throw new TRPCError({ code: "UNAUTHORIZED", message: "Wrong PIN" });
          who = ADMIN;
        } else {
          const m = memberByName(st, input.name);
          if (!m || pin !== String(m.pin)) throw new TRPCError({ code: "UNAUTHORIZED", message: "Wrong PIN" });
          who = m.name;
        }
        const token = await createToken(ctx.db, who);
        return { token, me: actorFor(st, who) };
      }),
  }),

  /** Speaker photos / bios / links for the Agenda tab – fetched once, not on every poll. */
  speakers: router({
    list: authedProcedure.query(async ({ ctx }) => ctx.db.select().from(speakerProfiles)),
    /** Team Leader adds / fixes a speaker's social links (LinkedIn, X, Instagram, Facebook, YouTube, TikTok, Behance – no websites). */
    setSocial: authedProcedure
      .input(z.object({ key: z.string().min(1), urls: z.array(z.string().max(300)).max(8) }))
      .mutation(async ({ ctx, input }) => {
        const st = await loadState(ctx.db);
        const me = actorFor(st, ctx.who);
        if (!me.admin) throw new TRPCError({ code: "FORBIDDEN", message: "Only the Team Leader can edit links." });
        const social: { type: string; url: string }[] = [];
        const bad: string[] = [];
        for (const raw of input.urls.map((u) => u.trim()).filter(Boolean)) {
          const type = socialType(raw);
          if (!type) { bad.push(raw); continue; }
          const url = cleanSocialUrl(raw);
          if (!social.some((x) => x.type === type)) social.push({ type, url });
        }
        if (bad.length) return { ok: false as const, error: `Not a social profile link: ${bad.join(", ")}` };
        const linkedin = social.find((x) => x.type === "linkedin")?.url ?? "";
        const res = await ctx.db.update(speakerProfiles)
          .set({ social: JSON.stringify(social), linkedin, linkConfidence: social.length ? "high" : "none" })
          .where(eq(speakerProfiles.key, input.key)).returning({ key: speakerProfiles.key });
        if (!res.length) return { ok: false as const, error: "Speaker profile not found" };
        return { ok: true as const, social };
      }),
  }),

  /** Official-agenda watch: proposals are decided by the Team Leader only. */
  agenda: router({
    check: authedProcedure.mutation(async ({ ctx }) => {
      const st = await loadState(ctx.db);
      if (!actorFor(st, ctx.who).admin) throw new TRPCError({ code: "FORBIDDEN", message: "Only the Team Leader can run a check." });
      return runAgendaCheck(ctx.db);
    }),
    /** approve / reject one or many pending changes (applied together in one save) */
    decide: authedProcedure
      .input(z.object({ ids: z.array(z.string()).min(1).max(500), approve: z.boolean(), prs: z.record(z.string(), z.string()).optional() }))
      .mutation(async ({ ctx, input }) => {
        const st = await loadState(ctx.db);
        return decideChanges(ctx.db, input.ids, input.approve, actorFor(st, ctx.who), input.prs ?? {});
      }),
  }),

  state: router({
    /** Cheap poll: returns `unchanged` unless the version moved. */
    get: authedProcedure.input(z.object({ since: z.number().optional() })).query(async ({ ctx, input }) => {
      if (input.since) {
        const v = await getVersion(ctx.db);
        if (v === input.since) return { unchanged: true as const, version: v, serverNow: Date.now() };
      }
      const st = await loadState(ctx.db);
      const me = actorFor(st, ctx.who);
      return { unchanged: false as const, state: publicState(st, me), me, version: st.version, serverNow: Date.now() };
    }),

    /** Every change goes through the same rules as the browser preview (packages/core). */
    act: authedProcedure
      .input(z.object({ action: z.object({ type: z.string() }).passthrough() }))
      .mutation(async ({ ctx, input }) => {
        const st = await loadState(ctx.db);
        const me = actorFor(st, ctx.who);
        const before = structuredClone(st);
        const now = Date.now();
        const res = apply(st, input.action, me, now);
        if (!res.ok) return { ok: false as const, error: res.error };
        const version = await persist(ctx.db, before, st, res.dirty, st._newLog || []);
        st.version = version;
        return { ok: true as const, result: res.result, state: publicState(st, me), version, serverNow: now };
      }),
  }),
});
export type AppRouter = typeof appRouter;
