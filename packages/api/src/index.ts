import { initTRPC, TRPCError } from "@trpc/server";

import type { Context } from "./context";
import { whoForToken } from "./store";

export const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

/** Requires a valid login token; resolves who is calling. */
export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const who = await whoForToken(ctx.db, ctx.token);
  if (!who) throw new TRPCError({ code: "UNAUTHORIZED", message: "SESSION_EXPIRED" });
  return next({ ctx: { ...ctx, who } });
});
