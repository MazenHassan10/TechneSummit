# Great Hall PR – Techne Summit

Next.js + tRPC + Drizzle + Neon Postgres + shadcn/ui (Better-T-Stack monorepo).

```
apps/web          Next.js app (screens in src/gh/, tRPC endpoint at /api/trpc)
packages/core     All event rules (statuses, deadlines, PR assignment, rota) – shared by server & browser
packages/api      tRPC routers, Neon read/write (store.ts), seed data + seed script
packages/db       Drizzle schema (members, sessions, people, incidents, activity_log, settings, app_meta, auth_tokens)
packages/ui       shadcn components
```

## Put it online with Vercel (≈10 min, free)

1. Push this folder to a **private** GitHub repo (`apps/web/.env` is git-ignored – the database password is NOT uploaded).
2. Go to **vercel.com → Add New → Project → import the repo**.
3. Settings on the import screen:
   - **Root Directory:** `apps/web`
   - **Framework:** Next.js (auto-detected)
   - **Environment Variables:**
     - `DATABASE_URL` = your Neon connection string (the same one as in `apps/web/.env`)
     - `ENABLE_EXPERIMENTAL_COREPACK` = `1` (lets Vercel use the pnpm version this repo pins)
4. **Deploy** → you get a link like `https://great-hall-pr.vercel.app`. Send that to the team.

Without GitHub: `npx vercel` from this folder (asks you to log in), then add `DATABASE_URL` in the Vercel dashboard and run `npx vercel --prod`.

## Run locally

```bash
pnpm install
pnpm dev:web            # http://localhost:3001
```

## Database

- Tables are already created and the Great Hall agenda is loaded in Neon.
- Change schema → `cd packages/db && pnpm exec drizzle-kit push`
- Load the agenda into an EMPTY database → `pnpm --filter @great-hall-pr/api seed` (never overwrites existing data; prints the PINs)

## Tests

```bash
cd packages/core && bun test                    # 30 rule tests (same as the Google version)
cd packages/api  && ALLOW_DB_TESTS=1 bun test   # 13 API tests against Neon – ⚠ WIPES and re-seeds the database
```

Never run the API tests once the event has started – they erase live data.

## Logins

Same PINs as before (Team Leader + 7 PRs). The Team Leader sees and changes all PINs in **Team** tab.
