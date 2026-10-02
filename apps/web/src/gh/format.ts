const TZ = "Africa/Cairo";
const fmt12 = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const fmt24 = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fmtDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** 1:05 PM */
export const hm = (t?: number | null) => (t ? fmt12.format(new Date(t)) : "");
/** 13:05 – for <input type="time"> */
export const hm24 = (t?: number | null) => (t ? fmt24.format(new Date(t)) : "");
export const dayOf = (t: number) => fmtDay.format(new Date(t));
export function hourLabel(t: number) {
  const h = +hm24(t).slice(0, 2);
  return `${h % 12 || 12}${h < 12 ? "a" : "p"}`;
}
export function dur(ms: number) {
  const m = Math.round(Math.abs(ms) / 60000);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}
export function shortName(n: string) {
  const x = String(n || "").split(" ");
  return x[0] + (x[1] ? ` ${x[1][0]}.` : "");
}
