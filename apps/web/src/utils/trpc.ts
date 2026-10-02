import type { AppRouter } from "@great-hall-pr/api/routers/index";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";

export const TOKEN_KEY = "gh_token";

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      // bad signal in the hall: give up after 12 s so the app shows "offline" instead of hanging
      // (plain AbortController + timer – works on older iPhones too)
      fetch: (input, init) => {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 12000);
        const outer = init?.signal as AbortSignal | undefined | null;
        if (outer) { if (outer.aborted) ctl.abort(); else outer.addEventListener("abort", () => ctl.abort(), { once: true }); }
        return fetch(input, { ...init, signal: ctl.signal }).finally(() => clearTimeout(timer));
      },
      headers() {
        const token = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
        return token ? { "x-gh-token": token } : {};
      },
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
