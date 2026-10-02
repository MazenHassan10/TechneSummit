// Ported 1:1 from the Apps Script test-suite (great-hall-app/test/run.js) – same assertions, same expectations.
// @ts-nocheck
import assert from "node:assert";
import { test } from "bun:test";
import * as Core from "./index";
import SEED from "../../api/src/seed.json";

const clone = (x) => JSON.parse(JSON.stringify(x));
const at = (d, hhmm) => Core.dayStart(d, hhmm, '+03:00');
const D1 = SEED.settings.day1, D2 = SEED.settings.day2;

const st0 = clone(SEED);
const sWill = st0.sessions.find((s: any) => s.title.startsWith('Will AI'))!;
const pWill = Core.peopleOf(st0, sWill.id)[0];

test('seed has 26 sessions / 103 people (no Opening) / 7 PRs', () => {
  assert.strictEqual(st0.sessions.length, 26); assert.strictEqual(st0.people.length, 103); assert.strictEqual(st0.team.length, 7);
});
test('session times are Cairo time', () => { assert.strictEqual(sWill.start, at(D1, '13:00')); });
test('status timeline for one speaker', () => {
  const S = st0.settings, p = clone(pWill);
  assert.strictEqual(Core.personStatus(p, sWill, S, at(D1, '09:00')), 'NOTCALLED');
  assert.strictEqual(Core.personStatus(p, sWill, S, at(D1, '11:05')), 'CALLNOW');
  p.etaCall = 1; assert.strictEqual(Core.personStatus(p, sWill, S, at(D1, '11:05')), 'CONFIRMED');
  assert.strictEqual(Core.personStatus(p, sWill, S, at(D1, '12:16')), 'LATE');
  p.arrived = 1; assert.strictEqual(Core.personStatus(p, sWill, S, at(D1, '12:30')), 'ARRIVED');
  assert.strictEqual(Core.personStatus(p, sWill, S, at(D1, '12:50')), 'TAKE_BACKSTAGE');
  p.backstage = 1; assert.strictEqual(Core.personStatus(p, sWill, S, at(D1, '12:50')), 'BACKSTAGE');
  p.onstage = 1; assert.strictEqual(Core.personStatus(p, sWill, S, at(D1, '13:05')), 'DONE');
});
test('unarrived after session end = no-show', () => {
  assert.strictEqual(Core.personStatus(clone(pWill), sWill, st0.settings, at(D1, '14:00')), 'NOSHOW');
});
test('no lunch / break logic: PR state is only "with speaker" or free', () => {
  const st = clone(SEED);
  const s = st.sessions.find((x) => x.title.startsWith('Will AI'));
  Core.peopleOf(st, s.id)[0].pr = 'Karim Hamed';
  assert.strictEqual(Core.prStateAt(st, 'Karim Hamed', at(D1, '12:30'), D1), 'S');
  assert.strictEqual(Core.prStateAt(st, 'Karim Hamed', at(D1, '11:00'), D1), '');
});
test('two speakers of the same panel with one PR is flagged', () => {
  const st = clone(SEED);
  const s = st.sessions.find((x) => x.title.startsWith('Will AI')), [p1, p2] = Core.peopleOf(st, s.id);
  Core.apply(st, { type: 'assign', pid: p1.id, pr: 'Karim Hamed' }, { name: 'TL', admin: true }, 0);
  const r = Core.apply(st, { type: 'assign', pid: p2.id, pr: 'Karim Hamed' }, { name: 'TL', admin: true }, 0);
  assert.strictEqual(r.result, 'SAME_PANEL');
  assert.strictEqual(Core.rotaCheck(st, s), 'SAME_PANEL');
});
test('same PR on two different (even overlapping) panels is allowed – no break rules', () => {
  const st = clone(SEED);
  const a = st.sessions.find((x) => x.title.startsWith('The Myth')), b = st.sessions.find((x) => x.title.startsWith('Building AI'));
  Core.apply(st, { type: 'assign', pid: Core.peopleOf(st, a.id)[0].id, pr: 'Karim Hamed' }, { name: 'TL', admin: true }, 0);
  assert.strictEqual(Core.apply(st, { type: 'assign', pid: Core.peopleOf(st, b.id)[0].id, pr: 'Karim Hamed' }, { name: 'TL', admin: true }, 0).result, 'OK');
});
test('rotation: in order, wraps around, continues across sessions, never 2 on one panel, even load', () => {
  const st = clone(SEED);
  Core.autoAssign(st, null, false);
  const names = st.team.map((m) => m.name);
  const order = st.sessions.slice().sort((a, b) => a.start - b.start || a.title.localeCompare(b.title)).flatMap((s) => Core.peopleOf(st, s.id));
  // strict rotation: speaker i gets member i mod 7 (no panel has more than 7 speakers, so no skips needed)
  order.forEach((p, i) => assert.strictEqual(p.pr, names[i % names.length], p.name));
  assert.ok(st.people.every((p) => Core.personRota(st, p) === 'OK'));
  const load = {}; st.people.forEach((p) => { load[p.pr] = (load[p.pr] || 0) + 1; });
  const v = Object.values(load); assert.ok(Math.max(...v) - Math.min(...v) <= 1, JSON.stringify(load));
});
test('rotation skips a member already on the panel', () => {
  const st = clone(SEED);
  st.team = st.team.slice(0, 3); // 3 members, 6-speaker panel → each gets 2, but never adjacent duplicates beyond need
  const s = st.sessions.find((x) => x.title.startsWith('Will AI'));
  Core.peopleOf(st, s.id)[0].pr = st.team[1].name;
  Core.autoAssign(st, s.day, true);
  const prs = Core.peopleOf(st, s.id).map((p) => p.pr);
  assert.ok(prs.every(Boolean));
});
test('auto-assign "fill only" keeps manual choices', () => {
  const st = clone(SEED); Core.autoAssign(st, null, false);
  const p = st.people[10]; p.pr = 'Fayrouz Yassin'; const q = st.people[20]; q.pr = '';
  Core.apply(st, { type: 'autoAssign', day: Core.sessionById(st, q.sid).day, onlyUnassigned: true }, { name: 'TL', admin: true }, 0);
  assert.strictEqual(p.pr, 'Fayrouz Yassin'); assert.ok(q.pr);
});
test('PR busy only until their speaker walks on stage', () => {
  const st = clone(SEED); st.team.forEach((m) => { m.lunch1 = ''; });
  const s = st.sessions.find((x) => x.title.startsWith('Will AI')), p = Core.peopleOf(st, s.id)[0];
  p.pr = 'Karim Hamed';
  assert.strictEqual(Core.prStateAt(st, 'Karim Hamed', at(D1, '12:30'), D1), 'S');
  assert.strictEqual(Core.prStateAt(st, 'Karim Hamed', at(D1, '13:10'), D1), '');
});
test('PRs cannot do admin actions', () => {
  const st = clone(SEED);
  const r = Core.apply(st, { type: 'owner', sid: st.sessions[0].id, owner: '' }, { name: 'Karim Hamed', admin: false }, 0);
  assert.strictEqual(r.ok, false);
});
test('backstage tick auto-fills arrived; log written', () => {
  const st = clone(SEED), p = st.people[5], pr = Core.prOf(st, p) || 'Karim Hamed';
  p.pr = pr;
  const r = Core.apply(st, { type: 'step', pid: p.id, step: 'backstage', value: true }, { name: pr }, 1000);
  assert.ok(r.ok); assert.strictEqual(p.arrived, 1000); assert.strictEqual(p.backstage, 1000); assert.strictEqual(p.updatedBy, pr);
  assert.ok(st.log[st.log.length - 1].text.includes(p.name));
});
test('PRs cannot change speakers that are not theirs', () => {
  const st = clone(SEED), p = st.people[5];
  p.pr = 'Karim Hamed';
  for (const a of [{ type: 'step', pid: p.id, step: 'called', value: true }, { type: 'phone', pid: p.id, phone: '0100' }, { type: 'noshow', pid: p.id, value: true }, { type: 'eta', pid: p.id, text: '5 min' }]) {
    const r = Core.apply(st, a as Core.Action, { name: 'Fayrouz Yassin', admin: false }, 1);
    assert.strictEqual(r.ok, false);
  }
  assert.strictEqual(p.called, null); assert.strictEqual(p.noshow, false);
  assert.ok(Core.apply(st, { type: 'step', pid: p.id, step: 'called', value: true }, { name: 'Leader', admin: true }, 2).ok);
});
test('undo a step', () => {
  const st = clone(SEED), p = st.people[5];
  p.pr = 'x';
  Core.apply(st, { type: 'step', pid: p.id, step: 'called', value: true }, { name: 'x' }, 5);
  Core.apply(st, { type: 'step', pid: p.id, step: 'called', value: false }, { name: 'x' }, 6);
  assert.strictEqual(p.called, null);
});
test('no-show creates incident', () => {
  const st = clone(SEED), p = st.people[3];
  p.pr = 'x';
  Core.apply(st, { type: 'noshow', pid: p.id, value: true }, { name: 'x' }, 5);
  assert.strictEqual(st.incidents.length, 1); assert.strictEqual(st.incidents[0].status, 'open');
});
test('phone parsing handles common formats', () => {
  const rows = Core.parsePhoneList('Maged Ghoneima, 01001234567\nAlison Cossette\t+20 100 765 4321\nSaid Baaghil 0122-333-4444\nNo Number Here');
  assert.deepStrictEqual(rows.map((r) => r.phone), ['01001234567', '01007654321', '01223334444', '']);
  assert.strictEqual(rows[1].name, 'Alison Cossette');
});
test('phone matching: exact, case/accents, repeat speakers', () => {
  const st = clone(SEED);
  assert.strictEqual(Core.matchPerson(st, 'maged ghoneima').length, 2);
  assert.strictEqual(Core.matchPerson(st, 'Barbara Adolehoume').length, 1);
  assert.strictEqual(Core.matchPerson(st, 'Ghoneima Maged').length, 2);
  assert.strictEqual(Core.matchPerson(st, 'Someone Unknown').length, 0);
  assert.strictEqual(Core.matchPerson(st, 'Karim Wasim')[0].name, 'Karim Wassim');
  assert.strictEqual(Core.matchPerson(st, 'Maged Ghonima').length, 2);
});
test('next step skips calls once late', () => {
  assert.strictEqual(Core.nextStep(clone(pWill), sWill, st0.settings, at(D1, '09:00')), 'called');
  assert.strictEqual(Core.nextStep(clone(pWill), sWill, st0.settings, at(D1, '11:30')), 'etaCall');
  assert.strictEqual(Core.nextStep(clone(pWill), sWill, st0.settings, at(D1, '12:30')), 'arrived');
});
test('WhatsApp link uses +20', () => { assert.strictEqual(Core.waLink('01287415931'), 'https://wa.me/201287415931'); });
test('PR state follows speaker arrival → walk-on window', () => {
  const st = clone(SEED); st.people.forEach((p) => { p.pr = 'Nobody'; });
  const s = st.sessions.find((x) => x.title.startsWith('Will AI')), n = 'Karim Hamed';
  Core.peopleOf(st, s.id)[0].pr = n;
  assert.strictEqual(Core.prStateAt(st, n, s.start - 30 * 60000, D1), 'S');
  assert.strictEqual(Core.prStateAt(st, n, s.start + 60000, D1), '');
});
test('readiness flags', () => {
  const st = clone(SEED), s = st.sessions.find((x) => x.title.startsWith('Will AI'));
  Core.peopleOf(st, s.id).forEach((p) => { p.arrived = 1; p.backstage = 1; });
  assert.strictEqual(Core.sessionReadiness(st, s, at(D1, '12:50')).flag, 'READY');
  Core.peopleOf(st, s.id)[0].backstage = null; Core.peopleOf(st, s.id)[0].arrived = null;
  assert.strictEqual(Core.sessionReadiness(st, s, at(D1, '12:50')).flag, 'AT_RISK');
  assert.strictEqual(Core.sessionReadiness(st, s, at(D1, '13:10')).flag, 'LIVE');
});
test('session time edit moves deadlines', () => {
  const st = clone(SEED), s = st.sessions[3];
  Core.apply(st, { type: 'saveSession', sid: s.id, startHHMM: '14:05', endHHMM: '14:50' }, { name: 'TL', admin: true }, 0);
  assert.strictEqual(s.start, at(s.day, '14:05'));
});

const ADM = { name: 'TL', admin: true };
test('admin adds a guest member who can then own a session', () => {
  const st = clone(SEED);
  const r = Core.apply(st, { type: 'saveMember', name: 'Omar Adel', phone: '+20 111 222 3333', pin: '', lunch1: '', lunch2: '', guest: true }, ADM, 0);
  assert.ok(r.ok, r.error); assert.match(r.result.pin, /^\d{4}$/);
  const m = Core.memberByName(st, 'Omar Adel'); assert.strictEqual(m.phone, '01112223333'); assert.strictEqual(m.guest, true);
  const p = st.people[5];
  assert.strictEqual(Core.apply(st, { type: 'assign', pid: p.id, pr: 'Omar Adel' }, ADM, 0).result, 'OK');
});
test('duplicate member name rejected; bad PIN rejected', () => {
  const st = clone(SEED);
  assert.strictEqual(Core.apply(st, { type: 'saveMember', name: 'Karim Hamed' }, ADM, 0).ok, false);
  assert.strictEqual(Core.apply(st, { type: 'saveMember', name: 'X Y', pin: '12' }, ADM, 0).ok, false);
});
test('renaming a member moves their sessions', () => {
  const st = clone(SEED), n = st.sessions[3].owner, count = st.sessions.filter((s) => s.owner === n).length;
  const m = Core.memberByName(st, n);
  assert.ok(Core.apply(st, { type: 'saveMember', origName: n, name: 'Renamed Person', pin: m.pin, lunch1: m.lunch1, lunch2: m.lunch2 }, ADM, 0).ok);
  assert.strictEqual(st.sessions.filter((s) => s.owner === 'Renamed Person').length, count);
});
test('removing a member frees their speakers', () => {
  const st = clone(SEED); Core.autoAssign(st, null, false);
  const n = st.team[0].name, count = st.people.filter((p) => p.pr === n).length;
  const r = Core.apply(st, { type: 'removeMember', name: n }, ADM, 0);
  assert.strictEqual(r.result, count); assert.ok(!Core.memberByName(st, n));
  assert.ok(st.people.every((p) => Core.prOf(st, p) !== n));
});
test('admin creates, edits and cancels a session', () => {
  const st = clone(SEED);
  const r = Core.apply(st, { type: 'saveSession', title: 'Surprise Panel', stype: 'Panel', day: D2, startHHMM: '21:00', endHHMM: '21:30', owner: 'Karim Hamed' }, ADM, 0);
  assert.ok(r.ok, r.error); const s = Core.sessionById(st, r.result.sid);
  assert.strictEqual(s.start, at(D2, '21:00'));
  Core.apply(st, { type: 'savePerson', sid: s.id, name: 'New Speaker', role: 'Speaker' }, ADM, 0);
  assert.ok(Core.apply(st, { type: 'saveSession', sid: s.id, title: 'Surprise Panel 2', stype: 'Keynote', day: D1, startHHMM: '9:30', endHHMM: '10:00', owner: '' }, ADM, 0).ok);
  assert.strictEqual(s.day, D1); assert.strictEqual(s.type, 'Keynote'); assert.strictEqual(s.owner, '');
  Core.apply(st, { type: 'deleteSession', sid: s.id }, ADM, 0);
  assert.ok(!Core.sessionById(st, s.id)); assert.ok(!st.people.some((p) => p.sid === s.id));
});
test('bad session edit changes nothing', () => {
  const st = clone(SEED), s = st.sessions[2], before = JSON.stringify(s);
  assert.strictEqual(Core.apply(st, { type: 'saveSession', sid: s.id, title: 'X', startHHMM: '14:00', endHHMM: '13:00' }, ADM, 0).ok, false);
  assert.strictEqual(JSON.stringify(s), before);
});
test('PRs cannot add members or sessions', () => {
  const st = clone(SEED), pr = { name: 'Karim Hamed', admin: false };
  assert.strictEqual(Core.apply(st, { type: 'saveMember', name: 'Z' }, pr, 0).ok, false);
  assert.strictEqual(Core.apply(st, { type: 'saveSession', title: 'Z', startHHMM: '10:00', endHHMM: '11:00' }, pr, 0).ok, false);
});

test('clear all PRs, pick some by hand, fill the rest fairly', () => {
  const st = clone(SEED); Core.autoAssign(st, null, false);
  const day = st.sessions[0].day;
  const r = Core.apply(st, { type: 'clearPrs', day }, { name: 'TL', admin: true }, 0);
  assert.ok(r.ok);
  const dayPeople = st.people.filter((p) => Core.sessionById(st, p.sid).day === day);
  assert.ok(dayPeople.every((p) => !Core.prOf(st, p)));
  assert.ok(st.people.some((p) => Core.sessionById(st, p.sid).day !== day && p.pr), 'other day untouched');
  // three requests picked by hand
  const picks = [[dayPeople[0], 'Fayrouz Yassin'], [dayPeople[8], 'Fayrouz Yassin'], [dayPeople[15], 'Karim Hamed']];
  for (const [p, n] of picks) Core.apply(st, { type: 'assign', pid: p.id, pr: n }, { name: 'TL', admin: true }, 0);
  Core.apply(st, { type: 'autoAssign', day, onlyUnassigned: true }, { name: 'TL', admin: true }, 0);
  for (const [p, n] of picks) assert.strictEqual(p.pr, n);
  assert.ok(dayPeople.every((p) => p.pr));
  assert.ok(dayPeople.every((p) => Core.personRota(st, p) === 'OK'), 'never two on one panel');
  const load = {}; dayPeople.forEach((p) => { load[p.pr] = (load[p.pr] || 0) + 1; });
  const v = Object.values(load); assert.ok(Math.max(...v) - Math.min(...v) <= 1, JSON.stringify(load));
});
test('PRs cannot clear PRs', () => {
  const st = clone(SEED);
  assert.strictEqual(Core.apply(st, { type: 'clearPrs', day: null }, { name: 'Karim Hamed', admin: false }, 0).ok, false);
});
