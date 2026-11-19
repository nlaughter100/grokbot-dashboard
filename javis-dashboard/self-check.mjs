import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ROSTER, scrub, validate, isNoDataYear, orderBots, summarize, coreTiles,
  linkState, resolveWeek, mentions, weekWord, sourceUrl
} from "./app.js";

const now = Date.parse("2026-11-09T02:30:00Z");
assert.equal(linkState({ updated: "2026-11-08T11:15:00-07:00", now, hasData: true }).key, "current");
assert.equal(linkState({ updated: "2026-11-06T11:15:00-07:00", now, hasData: true }).key, "stale");
assert.equal(linkState({ fetchError: "HTTP 404", hasData: false }).key, "nodata");
assert.equal(linkState({ fetchError: "HTTP 404", hasData: true, updated: "2026-11-08T11:15:00-07:00", now }).key, "offline");
assert.equal(linkState({ fetchError: "HTTP 404", hasData: true, updated: "2026-11-06T11:15:00-07:00", now }).label, "OFFLINE · STALE");
assert.equal(linkState({ schemaError: "bad", hasData: false }).key, "unknown");
assert.equal(linkState({ updated: "not-a-date", hasData: true }).key, "unknown");
assert.equal(linkState({ updated: "2026-11-09T06:00:00Z", now, hasData: true }).key, "unknown");
assert.equal(linkState({ loading: true, hasData: false }).key, "loading");

assert.equal(scrub("write me at nick@example.com today"), "write me at [email] today");
assert.equal(scrub("password: hunter2"), "password: [redacted]");
assert.equal(scrub("call 303-555-1212"), "call [phone]");
assert.match(scrub("30 leads and store IDs 212-216"), /30 leads/);

const week = resolveWeek("2026-11-08T11:15:00-07:00", ["Mon 2", "Tue 3", "Sun 8"]);
assert.deepEqual(week.map((slot) => slot.text), ["Nov 2", "Nov 3", "Nov 8"]);
assert.equal(mentions("Nov 8: dashboard refreshed", week[2]), true);
assert.equal(mentions("Nov 18: later", week[2]), false);
assert.equal(mentions("Nov 7 briefing", week[2]), false);

const boundary = resolveWeek("2026-01-02T15:00:00-07:00", ["Mon 29", "Thu 1", "Fri 2"]);
assert.equal(boundary[0].text, "Dec 29");
assert.equal(boundary[1].text, "Jan 1");
assert.equal(boundary[2].text, "Jan 2");
assert.equal(weekWord(null), "no data");
assert.equal(weekWord(0.5), "partial");
assert.match(weekWord(0.25), /unrecognized/);

assert.equal(sourceUrl("https://nlaughter100.github.io/grokbot-javis-dashboard/"), "https://nlaughter100.github.io/grokbot-dashboard/data.json");
assert.equal(
  sourceUrl("https://example.test/?source=https://nlaughter100.github.io/grokbot-dashboard/data.json"),
  "https://nlaughter100.github.io/grokbot-dashboard/data.json"
);
assert.equal(
  sourceUrl("https://example.test/?source=https://evil.example/data.json"),
  "https://nlaughter100.github.io/grokbot-dashboard/data.json"
);

const fixture = summarize([
  { status: "ok", needs: [], routines: ["Daily — 11 AM MT"], week: [1, null], year: "no data" },
  { status: "attention", needs: ["Review"], routines: ["No routines left"], week: [0.5], year: "no data" },
  { status: "blocked", needs: [], routines: [], week: [], year: "no data" }
]);
assert.equal(fixture.agents, 3);
assert.equal(fixture.status.ok, 1);
assert.equal(fixture.needs, 1);
assert.equal(fixture.routines, 1);
assert.equal(fixture.logged, 2);
assert.equal(fixture.cells, 3);
assert.equal(fixture.yearAllEmpty, true);
assert.equal(coreTiles(fixture).find((tile) => tile.k === "YEAR").v, "—");
assert.equal(coreTiles(null)[0].v, "—");
assert.ok(!coreTiles(fixture).some((tile) => /cpu|ram|connection/i.test(tile.k)));

const ordered = orderBots([{ name: "Burpee" }, { name: "Merlin" }, { name: "Newcomer" }]);
assert.deepEqual(ordered.map((bot) => bot.name), ["Merlin", "Burpee", "Newcomer"]);
assert.equal(ROSTER.length, 8);

const response = await fetch(`https://nlaughter100.github.io/grokbot-dashboard/data.json?t=${Date.now()}`, { cache: "no-store" });
assert.equal(response.status, 200);
assert.equal(response.headers.get("access-control-allow-origin"), "*");
const data = await response.json();
assert.equal(validate(data), "");
const summary = summarize(data.bots);
const names = orderBots(data.bots).map((bot) => bot.name);
for (const name of ROSTER) assert.ok(names.includes(name), `missing ${name}`);
assert.equal(summary.agents, data.bots.length);
for (const bot of data.bots) {
  assert.ok(bot.name && bot.id);
  for (const value of bot.week || []) assert.ok(value === null || value === 0 || value === 0.5 || value === 1, `${bot.name} week ${value}`);
  assert.equal(Object.hasOwn(bot, "cpu") || Object.hasOwn(bot, "ram"), false);
}
const yearTile = coreTiles(summary).find((tile) => tile.k === "YEAR");
if (summary.yearAllEmpty) assert.equal(yearTile.v, "—");
else assert.equal(yearTile.v, "SEE");
const slots = resolveWeek(data.updated, data.weekDays);
assert.equal(slots.length, data.weekDays.length);
assert.ok(slots.every((slot) => slot.date));

const sources = await Promise.all(["index.html", "styles.css", "app.js"].map((file) => readFile(new URL(file, import.meta.url), "utf8")));
const joined = sources.join("\n");
for (const banned of ["CPU", "RAM", "microphone", "LLM provider"]) {
  assert.equal(joined.includes(banned), false, banned);
}

console.log(JSON.stringify({
  agents: names,
  updated: data.updated,
  source: data.source,
  summary,
  yearTile,
  week: slots.map((slot) => slot.text),
  link: linkState({ updated: data.updated, now: Date.now(), hasData: true })
}, null, 2));
