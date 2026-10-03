import { bigint, boolean, integer, pgTable, serial, text } from "drizzle-orm/pg-core";

// Times are stored as epoch milliseconds (bigint) – the app works in Cairo time on top of that.
const ms = (name: string) => bigint(name, { mode: "number" });

export const members = pgTable("members", {
  name: text("name").primaryKey(),
  fullName: text("full_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  pin: text("pin").notNull(),
  lunch1: text("lunch1").notNull().default(""),
  lunch2: text("lunch2").notNull().default(""),
  guest: boolean("guest").notNull().default(false),
  sort: integer("sort").notNull().default(0),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  day: text("day").notNull(),
  start: ms("start").notNull(),
  end: ms("end").notNull(),
  title: text("title").notNull(),
  type: text("type").notNull().default("Panel"),
  owner: text("owner").notNull().default(""),
  notes: text("notes").notNull().default(""),
});

export const people = pgTable("people", {
  id: text("id").primaryKey(),
  sid: text("sid").notNull(),
  pr: text("pr").notNull().default(""),
  name: text("name").notNull(),
  role: text("role").notNull().default("Speaker"),
  phone: text("phone").notNull().default(""),
  called: ms("called"),
  etaCall: ms("eta_call"),
  eta: text("eta").notNull().default(""),
  arrived: ms("arrived"),
  backstage: ms("backstage"),
  onstage: ms("onstage"),
  noshow: boolean("noshow").notNull().default(false),
  notes: text("notes").notNull().default(""),
  /** heads-up from the Team Leader shown to the speaker's PR (e.g. "WhatsApp only", "reach via Sara") */
  alert: text("alert").notNull().default(""),
  updatedBy: text("updated_by").notNull().default(""),
  updatedAt: ms("updated_at"),
  sort: integer("sort").notNull().default(0),
});

export const incidents = pgTable("incidents", {
  id: text("id").primaryKey(),
  ts: ms("ts").notNull(),
  by: text("by").notNull(),
  sid: text("sid").notNull().default(""),
  pid: text("pid").notNull().default(""),
  kind: text("kind").notNull(),
  note: text("note").notNull().default(""),
  status: text("status").notNull().default("open"),
  resolvedBy: text("resolved_by").notNull().default(""),
  resolvedAt: ms("resolved_at"),
});

export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  ts: ms("ts").notNull(),
  by: text("by").notNull(),
  text: text("text").notNull(),
});

// Key/value settings (event days, timing rules, admin PIN)
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Single row (id = 1). `version` bumps on every change so phones only re-download when something changed.
export const appMeta = pgTable("app_meta", {
  id: integer("id").primaryKey(),
  version: integer("version").notNull().default(1),
});

// Login sessions: random token → who (member name or "__admin__")
export const authTokens = pgTable("auth_tokens", {
  token: text("token").primaryKey(),
  who: text("who").notNull(),
  createdAt: ms("created_at").notNull(),
});

// Public speaker profiles shown in the Agenda tab (photo/bio/links). Keyed by normalised name so
// the same person in several sessions shares one profile.
export const speakerProfiles = pgTable("speaker_profiles", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  position: text("position").notNull().default(""),
  company: text("company").notNull().default(""),
  photo: text("photo").notNull().default(""),
  bio: text("bio").notNull().default(""),
  linkedin: text("linkedin").notNull().default(""),
  otherLink: text("other_link").notNull().default(""),
  sourceUrl: text("source_url").notNull().default(""),
  /** high = name + company confirmed, medium = name + role confirmed, none = no link found */
  linkConfidence: text("link_confidence").notNull().default("none"),
  /** verified social profiles: JSON array of { type: linkedin|x|instagram|facebook|youtube|tiktok|behance, url } */
  social: text("social").notNull().default("[]"),
});

// Differences found between the official sched agenda and ours, waiting for the Team Leader.
// status: pending → approved | rejected | obsolete (the official site went back) | failed
export const agendaChanges = pgTable("agenda_changes", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  warning: text("warning").notNull().default(""),
  payload: text("payload").notNull(),
  status: text("status").notNull().default("pending"),
  detectedAt: ms("detected_at").notNull(),
  decidedBy: text("decided_by").notNull().default(""),
  decidedAt: ms("decided_at"),
  error: text("error").notNull().default(""),
});

// Every session at the summit (all stages, workshop rooms…) so a speaker's profile can list everything
// they're doing. Refreshed from the official agenda by the agenda watcher; one row per session.
export const summitSessions = pgTable("summit_sessions", {
  id: text("id").primaryKey(),
  day: text("day").notNull(),
  start: text("start").notNull(),
  end: text("end").notNull(),
  title: text("title").notNull(),
  venue: text("venue").notNull().default(""),
  track: text("track").notNull().default(""),
  format: text("format").notNull().default(""),
  /** JSON array of { name, role } */
  people: text("people").notNull().default("[]"),
});
