import type { Context as ApiContext } from "@great-hall-pr/api/context";
import type { NextRequest } from "next/server";

import { db } from "./services";

export async function createContext(req: NextRequest): Promise<ApiContext> {
  return {
    db,
    token: req.headers.get("x-gh-token"),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
