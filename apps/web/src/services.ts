import { createDb } from "@great-hall-pr/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
