// Social profile links only (no websites) – used when the Team Leader edits a speaker's links.
const NETWORKS: [string, RegExp][] = [
  ["linkedin", /^(?:[a-z]{2,3}\.)?linkedin\.com\/in\//],
  ["x", /^(?:mobile\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]+/],
  ["instagram", /^instagram\.com\/[A-Za-z0-9_.]+/],
  ["facebook", /^(?:m\.|web\.)?facebook\.com\/[^/?#]+/],
  ["youtube", /^(?:m\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)/],
  ["tiktok", /^tiktok\.com\/@/],
  ["behance", /^behance\.net\/[^/?#]+/],
];

const host = (u: string) => u.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");

export function socialType(url: string): string | null {
  const h = host(url);
  return NETWORKS.find(([, re]) => re.test(h))?.[0] ?? null;
}

/** https, no tracking/query part (e.g. LinkedIn's ?isSelfProfile=false) */
export function cleanSocialUrl(url: string) {
  const h = host(url).split(/[?#]/)[0]!;
  return `https://www.${h.replace(/^(?:[a-z]{2,3}\.)?linkedin\.com/, "linkedin.com")}`.replace(/^https:\/\/www\.(m\.|mobile\.|web\.)/, "https://");
}
