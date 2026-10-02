import type { Database } from "@great-hall-pr/db";

export type Context = {
  db: Database;
  /** Login token sent by the app in the `x-gh-token` header */
  token: string | null;
};
