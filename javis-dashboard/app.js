const DEFAULT_SOURCE = "https://nlaughter100.github.io/grokbot-dashboard/data.json";
const POLL_MS = 60_000;
const STALE_MS = 40 * 60 * 60 * 1000;
const TZ = "America/Denver";

export const ROSTER = ["Merlin", "Codey", "Argento", "Accelero", "Breezy", "Cha-Ching", "Hommie", "Burpee"];

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function scrub(value) {
  return String(value ?? "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:\+?1[-.\s])?(?:\(?\d{3}\)?[-.\s])\d{3}[-.\s]\d{4}\b/g, "[phone]")
    .replace(/\b((?:password|passcode|api[_-]?key|token|secret)\s*[:=]\s*)(\S+)/gi, "$1[redacted]");
}

export function validate(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "Snapshot was not an object";
  if (!Array.isArray(data.bots)) return "Snapshot has no bots list";
  if (!Array.isArray(data.weekDays)) return "Snapshot has no weekDays list";
  return "";
}

export function isNoDataYear(value) {
  if (value == null) return true;
  const text = String(value).trim();
  return text === "" || /^no data\b/i.test(text);
}

export function orderBots(bots) {
  const rank = (name) => {
    const index = ROSTER.findIndex((entry) => entry.toLowerCase() === String(name || "").toLowerCase());
    return index === -1 ? ROSTER.length : index;
  };
  return [...(bots || [])].sort((a, b) => rank(a.name) - rank(b.name) || String(a.name).localeCompare(String(b.name)));
}

export function summarize(bots) {
  const list = bots || [];
  const status = { ok: 0, attention: 0, blocked: 0, unknown: 0 };
  let needs = 0;
  let routines = 0;
  let logged = 0;
  let cells = 0;
  let withNeeds = 0;
  for (const bot of list) {
    const needCount = Array.isArray(bot.needs) ? bot.needs.length : 0;
    needs += needCount;
    if (needCount > 0) withNeeds += 1;
    routines += (Array.isArray(bot.routines) ? bot.routines : []).filter((line) => !/^no\b/i.test(String(line).trim())).length;
    const week = Array.isArray(bot.week) ? bot.week : [];
    cells += week.length;
    logged += week.filter((value) => value !== null && value !== undefined).length;
    if (bot.status === "ok" || bot.status === "attention" || bot.status === "blocked") status[bot.status] += 1;
    else status.unknown += 1;
  }
  return {
    agents: list.length,
    needs,
    routines,
    logged,
    cells,
    withNeeds,
    status,
    yearAllEmpty: list.length > 0 && list.every((bot) => isNoDataYear(bot.year))
  };
}

export function coreTiles(summary) {
  if (!summary) {
    return ["AGENTS", "ON TRACK", "ATTENTION", "WAITING", "NEEDS", "ROUTINES", "WEEK LOG", "YEAR"].map((key) => ({
      k: key, v: "—", s: "NO DATA"
    }));
  }
  return [
    { k: "AGENTS", v: String(summary.agents), s: "IN FILE" },
    { k: "ON TRACK", v: String(summary.status.ok), s: "STATUS OK" },
    { k: "ATTENTION", v: String(summary.status.attention), s: "REPORTED" },
    { k: "WAITING", v: String(summary.status.blocked), s: "ON NICK" },
    { k: "NEEDS", v: String(summary.needs), s: "OPEN ITEMS" },
    { k: "ROUTINES", v: String(summary.routines), s: "LISTED" },
    { k: "WEEK LOG", v: summary.cells ? `${summary.logged}/${summary.cells}` : "NO DATA", s: summary.cells ? "CELLS FILED" : "NO DATA" },
    { k: "YEAR", v: summary.yearAllEmpty || !summary.agents ? "—" : "SEE", s: summary.yearAllEmpty || !summary.agents ? "NO DATA" : "IN FILE" }
  ];
}

export function linkState({ updated, now = Date.now(), fetchError = "", schemaError = "", hasData = false, loading = false }) {
  if (loading && !hasData && !fetchError) return { key: "loading", label: "READING SOURCE" };
  if (fetchError && !hasData) return { key: "nodata", label: "NO SNAPSHOT" };
  const parsed = Date.parse(updated || "");
  const timeKnown = Boolean(updated) && !Number.isNaN(parsed);
  const future = timeKnown && parsed - now > 5 * 60 * 1000;
  const stale = timeKnown && !future && now - parsed > STALE_MS;
  if (fetchError && hasData) return { key: "offline", label: stale || !timeKnown ? "OFFLINE · STALE" : "LINK OFFLINE" };
  if (schemaError || !timeKnown || future) return { key: "unknown", label: "SOURCE UNKNOWN" };
  if (stale) return { key: "stale", label: "STALE SNAPSHOT" };
  return { key: "current", label: "SNAPSHOT CURRENT" };
}

export function resolveWeek(updatedIso, weekDays) {
  const labels = Array.isArray(weekDays) ? weekDays : [];
  const updated = new Date(updatedIso || "");
  if (Number.isNaN(updated.getTime())) {
    return labels.map((label) => ({ label: String(label), dow: String(label).split(/\s+/)[0] || "", day: null, date: null, text: "" }));
  }
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(updated);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return labels.map((label) => {
    const bits = String(label).trim().split(/\s+/);
    const dow = bits[0] || "";
    const dayNum = Number.parseInt(bits[1], 10);
    if (!dayNum) return { label: String(label), dow, day: null, date: null, text: "" };
    let useMonth = month;
    let useYear = year;
    if (dayNum > day + 1) {
      useMonth -= 1;
      if (useMonth < 1) { useMonth = 12; useYear -= 1; }
    }
    const date = new Date(Date.UTC(useYear, useMonth - 1, dayNum));
    const text = `${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
    return { label: String(label), dow, day: dayNum, date, text };
  });
}

export function mentions(text, slot) {
  if (!slot?.date) return false;
  const month = slot.date.getUTCMonth();
  const day = slot.date.getUTCDate();
  const pattern = new RegExp(`\\b(?:${SHORT_MONTHS[month]}|${LONG_MONTHS[month]})\\.?\\s+${day}\\b`, "i");
  return pattern.test(String(text || ""));
}

export function weekWord(value) {
  if (value === 1) return "done";
  if (value === 0.5) return "partial";
  if (value === 0) return "missed";
  if (value == null) return "no data";
  return `unrecognized (${value})`;
}

export function sourceUrl(href = "") {
  const query = new URL(href || "https://local.invalid/", "https://local.invalid/").searchParams.get("source");
  if (!query) return DEFAULT_SOURCE;
  try {
    const url = new URL(query);
    if (url.protocol === "https:" && url.hostname === "nlaughter100.github.io" && url.pathname.endsWith("data.json")) return url.toString();
  } catch { /* keep the public file */ }
  return DEFAULT_SOURCE;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function denverParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "short", day: "2-digit", weekday: "short",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return get;
}

function clockText(date) {
  const get = denverParts(date);
  return `${get("hour")}:${get("minute")}:${get("second")}`;
}

function dateText(date) {
  const get = denverParts(date);
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")} · DENVER`;
}

function stampText(iso) {
  const date = new Date(iso || "");
  if (Number.isNaN(date.getTime())) return "UNKNOWN";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short"
  }).format(date);
}

function ageText(iso, now) {
  const parsed = Date.parse(iso || "");
  if (!iso || Number.isNaN(parsed)) return "UNKNOWN";
  const delta = now - parsed;
  if (delta < 0) return "IN THE FUTURE";
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function statusMeta(status) {
  if (status === "ok") return { label: "ON TRACK", cls: "ok" };
  if (status === "attention") return { label: "ATTENTION", cls: "attn" };
  if (status === "blocked") return { label: "WAITING", cls: "wait" };
  return { label: "UNKNOWN", cls: "unk" };
}

function cellClass(value) {
  if (value === 1) return "c1";
  if (value === 0.5) return "c5";
  if (value === 0) return "c0";
  if (value == null) return "cn";
  return "cu";
}

function routineKind(text) {
  const value = String(text || "");
  if (/^no\b/i.test(value.trim())) return "NONE";
  if (/paused/i.test(value)) return "PAUSED";
  if (/every\s+\d+/i.test(value)) return "REPEAT";
  if (/weekday/i.test(value)) return "WEEKDAY";
  if (/\bmonday\b|\bmon\b/i.test(value)) return "WEEKLY";
  if (/daily|am\b|pm\b/i.test(value)) return "DAILY";
  return "LISTED";
}

function routineSort(text) {
  const match = String(text).match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return 99_999;
  let hour = Number(match[1]) % 12;
  if (/pm/i.test(match[3])) hour += 12;
  return hour * 60 + (Number(match[2]) || 0);
}

function safeLink(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
  } catch { /* drop unsafe links */ }
  return "";
}

function portraitUrl(img) {
  if (!/^img\/[a-z0-9._-]+$/i.test(String(img || ""))) return "";
  return `https://nlaughter100.github.io/grokbot-dashboard/${img}`;
}

const ICONS = {
  needs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 12 12 21 3 12Z" stroke-width="1.4"/></svg>',
  pending: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke-width="1.4"/><path d="M12 8v5l3 2" stroke-width="1.4"/></svg>',
  done: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.2 17 19 7" stroke-width="1.4"/></svg>'
};

const S = {
  view: "command",
  data: null,
  raw: "",
  fetchedAt: null,
  fetchError: "",
  schemaError: "",
  loading: true,
  fetching: false,
  agentId: null,
  query: "",
  statusFilter: "all",
  dayIndex: null,
  focus: false,
  days: [],
  detailKey: ""
};

function currentLink() {
  return linkState({
    updated: S.data?.updated,
    fetchError: S.fetchError,
    schemaError: S.schemaError,
    hasData: Boolean(S.data),
    loading: S.loading
  });
}

function fieldsOf(bot) {
  return [bot.name, bot.role, bot.headline, bot.status, bot.year,
    ...(bot.routines || []), ...(bot.done || []), ...(bot.pending || []), ...(bot.needs || []),
    ...(bot.metrics || []).flatMap((metric) => [metric.label, metric.value])]
    .map((value) => scrub(value).toLowerCase());
}

function identityMatch(bot) {
  const query = S.query.trim().toLowerCase();
  if (!query) return false;
  return scrub(`${bot.name} ${bot.role || ""} ${bot.headline || ""}`).toLowerCase().includes(query);
}

function agentVisible(bot) {
  if (S.statusFilter === "ok" || S.statusFilter === "attention" || S.statusFilter === "blocked") {
    if (bot.status !== S.statusFilter) return false;
  }
  if (S.statusFilter === "needs" && !(bot.needs || []).length) return false;
  const query = S.query.trim().toLowerCase();
  if (!query) return true;
  return fieldsOf(bot).some((field) => field.includes(query));
}

function daySlot() {
  if (S.dayIndex == null) return null;
  return S.days[S.dayIndex] || null;
}

function dayAllows(text) {
  const slot = daySlot();
  if (!slot) return true;
  if (!slot.date) return true;
  return mentions(text, slot);
}

function feedLineVisible(bot, text) {
  if (!agentVisible(bot)) return false;
  if (!dayAllows(text)) return false;
  const query = S.query.trim().toLowerCase();
  if (!query || identityMatch(bot)) return true;
  return scrub(text).toLowerCase().includes(query);
}

function visibleBots() {
  if (!S.data) return [];
  return orderBots(S.data.bots).filter(agentVisible);
}

function lineMark(bot, text) {
  const query = S.query.trim().toLowerCase();
  const slot = daySlot();
  if (!query && !slot) return "";
  const dayHit = !slot?.date || mentions(text, slot);
  const queryHit = !query || identityMatch(bot) || scrub(text).toLowerCase().includes(query);
  return dayHit && queryHit ? "hit" : "dim";
}

function brackets() {
  return '<i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i>';
}

function shell(title, index, sub, body, extra = "") {
  return `<div class="shell"><section class="panel">${brackets()}
    <header class="ph"><span class="idx">${index}</span><h2>${esc(title)}</h2>${extra}</header>
    <p class="psub">${esc(sub)}</p>
    <div class="body">${body}</div>
  </section></div>`;
}

function tileHtml(tiles) {
  return `<div class="tiles">${tiles.map((tile) => `<div class="tile" title="${esc(tile.k)} · ${esc(tile.s)}"><b>${esc(tile.v)}</b><span>${esc(tile.k)}</span><small>${esc(tile.s)}</small></div>`).join("")}</div>`;
}

function dotRow(bot) {
  const days = S.days.length || (bot.week || []).length;
  let html = "";
  for (let index = 0; index < days; index += 1) {
    const value = Array.isArray(bot.week) ? bot.week[index] : undefined;
    html += `<i class="cell ${cellClass(value)}" title="${esc(weekWord(value))}"></i>`;
  }
  return `<span class="dots" aria-hidden="true">${html}</span>`;
}

function agentButton(bot) {
  const meta = statusMeta(bot.status);
  return `<button type="button" class="agent" data-agent="${esc(bot.id)}" title="${esc(scrub(bot.role || ""))} — ${esc(scrub(bot.headline || ""))}">
    <span class="nm">${esc(scrub(bot.name || "UNNAMED"))}</span>
    <span class="st"><i class="sdot ${esc(bot.status || "")}"></i>${esc(meta.label)}</span>
    ${dotRow(bot)}
  </button>`;
}

function feedItems() {
  if (!S.data) return [];
  const items = [];
  for (const bot of orderBots(S.data.bots)) {
    for (const kind of ["needs", "pending", "done"]) {
      for (const text of bot[kind] || []) {
        if (feedLineVisible(bot, text)) items.push({ bot, kind, text: scrub(text) });
      }
    }
  }
  return items;
}

function feedHtml(items) {
  if (!S.data) return emptyBlock(S.fetchError ? "NO SNAPSHOT" : "READING SOURCE", S.fetchError || "Waiting for the public daily file.");
  if (!items.length) return emptyBlock("NO MATCHING LINES", "Nothing in the current filter is in the snapshot lists.");
  const groups = ["needs", "pending", "done"];
  const labels = { needs: "NEEDS NICK", pending: "PENDING LIST", done: "DONE LIST" };
  return groups.map((kind) => {
    const rows = items.filter((item) => item.kind === kind);
    if (!rows.length) return "";
    return `<div class="group-label">${labels[kind]} · ${rows.length}</div>` + rows.map((item) => `<button type="button" class="feed-item ${kind}" data-agent="${esc(item.bot.id)}">
      <span class="ico">${ICONS[kind]}</span>
      <span><span class="fr"><span class="who">${esc(scrub(item.bot.name))}</span><span class="badge ${kind}" title="Line from the snapshot ${kind} list">${kind === "needs" ? "NEEDS" : kind.toUpperCase()}</span></span>
      <span class="fx">${esc(item.text)}</span></span>
    </button>`).join("");
  }).join("");
}

function emptyBlock(title, detail) {
  return `<div class="empty"><strong>${esc(title)}</strong><p>${esc(detail)}</p></div>`;
}

function timelineHtml() {
  if (!S.data) return emptyBlock("NO ROUTINES", "Routine text appears after the snapshot loads.");
  const rows = [];
  for (const bot of visibleBots()) {
    for (const text of bot.routines || []) rows.push({ bot, text: scrub(text), kind: routineKind(text), sort: routineSort(text) });
  }
  rows.sort((a, b) => a.sort - b.sort || a.bot.name.localeCompare(b.bot.name));
  if (!rows.length) return emptyBlock("NO ROUTINES IN VIEW", "No listed routine matches the current filter.");
  const note = S.dayIndex != null ? `<p class="note">The day filter applies to log lines. Routine text stays listed as written.</p>` : "";
  return note + `<ul class="tl">${rows.map((row) => `<li class="${row.kind === "NONE" ? "none" : ""}">
    <div class="rm"><span class="who">${esc(scrub(row.bot.name))}</span><span class="badge ${row.kind === "PAUSED" || row.kind === "NONE" ? "paused" : "listed"}">${esc(row.kind)}</span></div>
    <div class="rt">${esc(row.text)}</div>
  </li>`).join("")}</ul>`;
}

function ringFigure(fraction, tone, center, label, sub) {
  const radius = 26;
  const circ = 2 * Math.PI * radius;
  const dash = fraction == null ? 0 : Math.max(0, Math.min(1, fraction)) * circ;
  const toneClass = fraction == null ? "none" : tone;
  return `<figure class="ring"><div class="ring-viz"><svg viewBox="0 0 72 72" aria-hidden="true">
      <circle class="ring-track" cx="36" cy="36" r="${radius}"></circle>
      <circle class="ring-val ${toneClass}" cx="36" cy="36" r="${radius}" stroke-dasharray="${dash} ${circ - dash}" transform="rotate(-90 36 36)"></circle>
    </svg><b>${esc(center)}</b></div><figcaption>${esc(label)}<br>${esc(sub)}</figcaption></figure>`;
}

function ringsHtml() {
  if (!S.data) return emptyBlock("NO FILE COUNTS", "Rings stay empty until a snapshot loads. Missing data is not drawn as zero.");
  const summary = summarize(S.data.bots);
  const agents = summary.agents;
  const onTrack = agents ? summary.status.ok / agents : null;
  const filed = summary.cells ? summary.logged / summary.cells : null;
  const needs = agents ? summary.withNeeds / agents : null;
  const year = summary.yearAllEmpty || !agents
    ? "YEAR TOTALS · NO DATA"
    : "YEAR NOTES · SEE YEAR VIEW";
  return `<div class="rings">
    ${ringFigure(onTrack, "teal", agents ? `${summary.status.ok}/${agents}` : "—", "ON TRACK", "STATUS OK")}
    ${ringFigure(filed, "violet", summary.cells ? `${summary.logged}/${summary.cells}` : "—", "WEEK FILED", "NONEMPTY CELLS")}
    ${ringFigure(needs, "amber", agents ? `${summary.withNeeds}/${agents}` : "—", "HAS NEEDS", `${summary.needs} OPEN ITEMS`)}
  </div><p class="year-line" title="Year fields are shown only as written in the file. This board does not estimate an annual total.">${esc(year)}</p>`;
}

function heatmapHtml(compact = false) {
  if (!S.data) return emptyBlock("NO WEEK", "Weekly cells appear after the snapshot loads.");
  const days = S.days;
  const bots = orderBots(S.data.bots);
  const hidden = bots.filter((bot) => !agentVisible(bot)).length;
  const mismatched = bots.filter((bot) => !Array.isArray(bot.week) || bot.week.length !== days.length).map((bot) => bot.name);
  const today = denverYmd(new Date());
  const head = days.map((slot, index) => {
    const isToday = slot.date && slot.date.getUTCFullYear() === today.year && slot.date.getUTCMonth() + 1 === today.month && slot.date.getUTCDate() === today.day;
    const pressed = S.dayIndex === index;
    return `<button type="button" class="dayhead${isToday ? " is-today" : ""}" data-day="${index}" aria-pressed="${pressed ? "true" : "false"}" aria-label="Filter logs to ${esc(slot.label)} ${esc(slot.text)}${isToday ? ", Denver calendar today" : ""}">${esc(slot.dow.slice(0, 3).toUpperCase())} ${esc(slot.day ?? "")}</button>`;
  }).join("");
  const rows = bots.map((bot) => {
    const dim = agentVisible(bot) ? "" : " dim";
    const cells = days.map((slot, index) => {
      const value = Array.isArray(bot.week) && index < bot.week.length ? bot.week[index] : undefined;
      return `<button type="button" class="cellbtn${dim}" data-agent="${esc(bot.id)}" data-day="${index}" aria-label="${esc(scrub(bot.name))} ${esc(slot.label)} ${esc(slot.text)}: ${esc(weekWord(value))}"><i class="cell ${cellClass(value)}"></i></button>`;
    }).join("");
    return `<button type="button" class="rownm${dim}" data-agent="${esc(bot.id)}">${esc(scrub(bot.name))}</button>${cells}`;
  }).join("");
  const legend = compact ? "" : `<ul class="legend">
    <li><i class="cell c1"></i> DONE 1</li>
    <li><i class="cell c5"></i> PARTIAL 0.5</li>
    <li><i class="cell c0"></i> MISSED 0</li>
    <li><i class="cell cn"></i> NO DATA</li>
  </ul>`;
  const mismatch = mismatched.length ? `<p class="note">${esc(mismatched.join(", "))} ${mismatched.length === 1 ? "has a" : "have"} week array length that does not match the day labels. Missing cells stay no data.</p>` : "";
  const dimNote = hidden ? `<p class="note">${hidden} dimmed ${hidden === 1 ? "row is" : "rows are"} outside the current filter and still in the file.</p>` : "";
  const legendText = compact || !S.data.legend ? "" : `<p class="note">${esc(scrub(S.data.legend))}</p>`;
  return `${mismatch}${dimNote}<div class="heat" style="--days:${days.length || 1}"><span></span>${head}${rows}</div>${legend}${legendText}`;
}

function denverYmd(date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value)
  };
}

function sideStatusHtml() {
  const link = currentLink();
  const now = Date.now();
  const bot = (S.data?.bots || []).find((entry) => entry.id === S.agentId);
  const rows = [
    ["LINK", link.label],
    ["SOURCE TIME", S.data ? stampText(S.data.updated) : "NO DATA"],
    ["LAST FETCH", S.fetchedAt ? stampText(S.fetchedAt.toISOString()) : "NOT YET"],
    ["SNAPSHOT AGE", S.data ? ageText(S.data.updated, now) : "NO DATA"],
    ["STALE AFTER", "40h"]
  ];
  const source = S.data?.source ? `<p class="source">${esc(scrub(S.data.source))}</p>` : `<p class="empty-line">Source note has not loaded.</p>`;
  const selected = bot ? `<p class="note">SELECTED · ${esc(scrub(bot.name))}</p>
    <p>${esc(scrub(bot.role || ""))}</p>
    <p>${esc(scrub(bot.headline || ""))}</p>
    <button type="button" class="text-btn" data-agent="${esc(bot.id)}" style="margin:8px 0 0">OPEN RECORD</button>`
    : `<p class="note">Select an agent to open its snapshot record.</p>`;
  return rows.map(([key, value]) => `<div class="kv"><span>${esc(key)}</span><b>${esc(value)}</b></div>`).join("") + source + selected;
}

function listSection(title, sourceItems, bot, kind, emptyText) {
  const items = sourceItems || [];
  if (!items.length) return `<h3>${esc(title)}</h3><p class="empty-line">${esc(emptyText)}</p>`;
  return `<h3>${esc(title)} · ${items.length}</h3><ul class="lines ${kind}">${items.map((line) => {
    const clean = scrub(line);
    return `<li class="${lineMark(bot, line)}">${esc(clean)}</li>`;
  }).join("")}</ul>`;
}

function detailHtml(bot) {
  const meta = statusMeta(bot.status);
  const metrics = Array.isArray(bot.metrics) ? bot.metrics : [];
  const yearEmpty = isNoDataYear(bot.year);
  const link = safeLink(bot.link);
  const photo = portraitUrl(bot.img);
  const initial = esc(scrub(bot.name || "?").slice(0, 1).toUpperCase());
  const filterNote = (S.query.trim() || daySlot())
    ? `<p class="note">Full snapshot record. Highlighted lines match the current search or day. Dimmed lines stay visible so nothing is hidden.</p>`
    : `<p class="note">Full snapshot record. Lists are copied from the daily file, not from a live run.</p>`;
  const metricHtml = metrics.length ? `<div class="metrics">${metrics.map((metric) => {
    const value = metric && metric.value != null && metric.value !== "" ? metric.value : "NO DATA";
    return `<div><b>${esc(value)}</b><span>${esc(scrub(metric?.label || "Untitled"))}</span></div>`;
  }).join("")}</div>` : `<p class="empty-line">No metrics in the file.</p>`;
  const weekBits = (S.days.length ? S.days : (bot.week || []).map((_, index) => ({ label: `Day ${index + 1}`, text: "" }))).map((slot, index) => {
    const value = Array.isArray(bot.week) ? bot.week[index] : undefined;
    return `<span class="st"><i class="cell ${cellClass(value)}"></i> ${esc(slot.label)} ${esc(weekWord(value))}</span>`;
  }).join(" ");
  return `<div class="sheet record">
    <div class="headrow">
      <div class="avatar">${photo ? `<img alt="" src="${esc(photo)}" onerror="this.remove()">` : ""}${initial}</div>
      <div>
        <p class="psub" style="padding-left:0">AGENT RECORD · SNAPSHOT</p>
        <h2 id="detail-title">${esc(scrub(bot.name || "UNNAMED"))} <span class="badge ${meta.cls}">${esc(meta.label)}</span></h2>
        <p>${esc(scrub(bot.role || "Role not in file"))}</p>
        <p>${esc(scrub(bot.headline || ""))}</p>
      </div>
      <button type="button" class="close" data-cmd="close-detail">CLOSE</button>
    </div>
    ${filterNote}
    <h3>METRICS IN FILE</h3>
    ${metricHtml}
    <h3>ROUTINES AS WRITTEN</h3>
    ${(bot.routines || []).length ? `<ul class="lines">${(bot.routines || []).map((line) => `<li class="${lineMark(bot, line)}"><span class="badge listed">${esc(routineKind(line))}</span> ${esc(scrub(line))}</li>`).join("")}</ul>` : `<p class="empty-line">No routine text in the file.</p>`}
    <h3>WEEK CELLS</h3>
    <p>${weekBits || "No week array."}</p>
    ${listSection("DONE LIST", bot.done, bot, "done", "Nothing recorded.")}
    ${listSection("PENDING LIST", bot.pending, bot, "pending", "Nothing outstanding.")}
    ${listSection("NEEDS NICK", bot.needs, bot, "needs", "Nothing waiting on Nick.")}
    <h3>YEAR TO DATE</h3>
    <p class="empty-line">${yearEmpty ? "No data — yearly history isn’t tracked yet." : esc(scrub(bot.year))}</p>
    ${link ? `<p><a class="linkish" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open linked dashboard</a></p>` : ""}
  </div>`;
}

function stageHtml() {
  if (!S.data) {
    return shell("NO SNAPSHOT", "00", S.fetchError || "The public file has not loaded", emptyBlock("NO DATA", S.fetchError || "Refresh to try the public snapshot again."));
  }
  if (S.view === "agents") return agentsStage();
  if (S.view === "daily") return dailyStage();
  if (S.view === "weekly") return weeklyStage();
  if (S.view === "yearly") return yearlyStage();
  if (S.view === "feed") return shell("INTELLIGENCE FEED", "03", "Every matching snapshot line. Not a live stream.", feedHtml(feedItems()));
  if (S.view === "needs") return needsStage();
  return "";
}

function agentsStage() {
  const bots = visibleBots();
  const all = S.data.bots.length;
  const cards = bots.map((bot) => {
    const meta = statusMeta(bot.status);
    return `<button type="button" class="agent tall" data-agent="${esc(bot.id)}">
      <span class="nm">${esc(scrub(bot.name))}</span>
      <span class="st"><i class="sdot ${esc(bot.status || "")}"></i>${esc(meta.label)}</span>
      <span class="fx">${esc(scrub(bot.role || ""))}</span>
      <span class="fx">${esc(scrub(bot.headline || ""))}</span>
      ${dotRow(bot)}
    </button>`;
  }).join("");
  const body = `<p class="agent-count">SHOWING ${bots.length} OF ${all} SNAPSHOT AGENTS</p>` +
    (bots.length ? `<div class="stage-grid">${cards}</div>` : emptyBlock("NO MATCH", "No agent matches the current filter."));
  return shell("ACTIVE AGENTS", "04", "Roster in the snapshot. Not a process count.", body);
}

function dailyStage() {
  const bots = visibleBots();
  const cards = bots.map((bot) => {
    const meta = statusMeta(bot.status);
    const done = (bot.done || []).length;
    const pending = (bot.pending || []).length;
    const needs = (bot.needs || []).length;
    const total = done + pending + needs;
    const conic = total ? `conic-gradient(var(--teal) 0 ${done / total * 100}%, var(--violet) ${done / total * 100}% ${(done + pending) / total * 100}%, var(--amber) ${(done + pending) / total * 100}% 100%)` : "none";
    return `<article class="card">
      <div class="headrow"><div><button type="button" class="linkbtn" data-agent="${esc(bot.id)}">${esc(scrub(bot.name))}</button>
        <span class="badge ${meta.cls}">${meta.label}</span>
        <p>${esc(scrub(bot.headline || ""))}</p></div>
        <div class="conic" style="background:${conic}" title="Share of list lines, not a live completion rate"><span>${done}/${pending}/${needs}</span></div></div>
      <p class="note">Ring shares are done, pending, and needs list lengths in the file.</p>
      ${listSection("DONE LIST", bot.done, bot, "done", "Nothing recorded.")}
      ${listSection("PENDING LIST", bot.pending, bot, "pending", "Nothing outstanding.")}
      ${listSection("NEEDS NICK", bot.needs, bot, "needs", "Nothing waiting on Nick.")}
    </article>`;
  }).join("");
  const body = bots.length ? `<div class="stage-grid">${cards}</div>` : emptyBlock("NO MATCH", "No agent matches the current filter.");
  return shell("DAILY SNAPSHOT", "10", `File time ${stampText(S.data.updated)}. List lines can mention earlier days.`, body);
}

function weeklyStage() {
  const body = heatmapHtml() + `<div class="stage-grid" style="margin-top:8px">${orderBots(S.data.bots).map((bot) => {
    const cells = (S.days.length ? S.days : []).map((slot, index) => {
      const value = Array.isArray(bot.week) ? bot.week[index] : undefined;
      return `<li>${esc(slot.text || slot.label)} · ${esc(weekWord(value))}</li>`;
    }).join("");
    return `<article class="card"><button type="button" class="linkbtn" data-agent="${esc(bot.id)}">${esc(scrub(bot.name))}</button><ul class="lines">${cells}</ul></article>`;
  }).join("")}</div>`;
  return shell("WEEKLY HISTORY", "08", "Logged day results from the snapshot. A blank cell is no data, not a zero.", body);
}

function yearlyStage() {
  const bots = orderBots(S.data.bots);
  const allEmpty = bots.every((bot) => isNoDataYear(bot.year));
  const banner = allEmpty
    ? `<div class="banner"><strong>NO ANNUAL TOTAL</strong><p>Every agent year field is “no data”. Nothing is summed or estimated. Filters do not hide a year field.</p></div>`
    : `<div class="banner"><strong>YEAR NOTES ON FILE</strong><p>Shown as written for every agent. This board does not roll them into a total.</p></div>`;
  const cards = bots.map((bot) => `<article class="card"><h3>${esc(scrub(bot.name))}</h3><p>${isNoDataYear(bot.year) ? "No data — yearly history isn’t tracked yet." : esc(scrub(bot.year))}</p></article>`).join("");
  return shell("YEAR TO DATE", "11", "Only the year field from the snapshot.", banner + `<div class="stage-grid" style="margin-top:8px">${cards}</div>`);
}

function needsStage() {
  const bots = visibleBots();
  const blocks = bots.map((bot) => {
    const items = bot.needs || [];
    const visible = items.map((line, index) => ({ line, index })).filter(({ line }) => feedLineVisible(bot, line));
    return `<article class="card"><button type="button" class="linkbtn" data-agent="${esc(bot.id)}">${esc(scrub(bot.name))}</button>
      ${items.length ? (visible.length ? `<ul class="lines needs">${visible.map(({ line }) => `<li>${esc(scrub(line))}</li>`).join("")}</ul>` : `<p class="empty-line">Needs are on file, and none match the current search or day.</p>`) : `<p class="empty-line">Nothing waiting on Nick.</p>`}
    </article>`;
  }).join("");
  const body = bots.length ? `<div class="stage-grid">${blocks}</div>` : emptyBlock("NO MATCH", "No agent matches the current filter.");
  return shell("NEEDS NICK", "12", "Open items copied from the snapshot needs lists.", body);
}

function renderFilters() {
  const bar = document.getElementById("filterbar");
  const chips = [];
  if (S.fetchError && S.data) {
    chips.push(`<span class="alert">LAST FETCH FAILED (${esc(S.fetchError)}). SHOWING THE LAST GOOD SNAPSHOT. <button type="button" data-cmd="refresh">RETRY</button></span>`);
  }
  if (S.schemaError) chips.push(`<span class="alert">${esc(S.schemaError)}</span>`);
  if (!S.data && S.fetchError) chips.push(`<span class="alert">${esc(S.fetchError)}</span>`);
  if (S.query) chips.push(`<span class="chip"><span>SEARCH</span> ${esc(S.query)} <button type="button" data-clear="query" aria-label="Clear search">×</button></span>`);
  if (S.statusFilter !== "all") chips.push(`<span class="chip"><span>STATUS</span> ${esc(S.statusFilter.toUpperCase())} <button type="button" data-clear="status" aria-label="Clear status filter">×</button></span>`);
  const slot = daySlot();
  if (slot) {
    const label = slot.date ? `${slot.label} · ${slot.text}` : `${slot.label} · date unresolved`;
    chips.push(`<span class="chip"><span>DAY</span> ${esc(label)} <button type="button" data-clear="day" aria-label="Clear day filter">×</button></span>`);
    if (!slot.date) chips.push(`<span class="alert">This day has no resolved calendar date, so log lines were not guessed.</span>`);
  }
  if (S.query || S.statusFilter !== "all" || S.dayIndex != null) chips.push(`<button type="button" class="chip clear" data-clear="all">CLEAR ALL</button>`);
  bar.hidden = chips.length === 0;
  bar.innerHTML = chips.join("");
}

function renderFreshness() {
  const link = currentLink();
  const dot = document.getElementById("status-dot");
  const label = document.getElementById("status-label");
  dot.className = `dot ${link.key}`;
  label.textContent = link.label;
  const summary = S.data ? summarize(S.data.bots) : null;
  const wave = document.getElementById("wave-stat");
  wave.textContent = summary && summary.agents ? `${summary.status.ok}/${summary.agents}` : "NO DATA";
  S.waveRatio = summary && summary.agents ? summary.status.ok / summary.agents : null;
  const pip = document.getElementById("needs-pip");
  if (summary && summary.needs > 0) {
    pip.hidden = false;
    pip.textContent = String(summary.needs);
  } else pip.hidden = true;
  document.querySelectorAll("[data-nav]").forEach((button) => {
    if (button.dataset.nav === S.view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll('[data-cmd="focus"]').forEach((button) => {
    button.textContent = S.focus ? button.dataset.on : button.dataset.label;
    button.setAttribute("aria-pressed", S.focus ? "true" : "false");
  });
  document.querySelectorAll('[data-cmd="attention"]').forEach((button) => {
    button.setAttribute("aria-pressed", S.statusFilter === "attention" ? "true" : "false");
  });
  const refresh = document.getElementById("refresh-btn");
  refresh.classList.toggle("busy", S.fetching);
  refresh.setAttribute("aria-label", S.fetching ? "Refreshing snapshot" : "Refresh snapshot");
  const now = new Date();
  const sourceAge = S.data ? ageText(S.data.updated, now.getTime()) : "NO DATA";
  const fetchAt = S.fetchedAt ? stampText(S.fetchedAt.toISOString()) : "NOT YET";
  const sourceAt = S.data ? stampText(S.data.updated) : "NO DATA";
  const source = S.data?.source ? scrub(S.data.source) : "No source note loaded";
  document.getElementById("footer").innerHTML = `<span>${esc(link.label)}</span><span>SRC ${esc(sourceAt)}</span><span>FETCH ${esc(fetchAt)}</span><span>AGE ${esc(sourceAge)}</span><span>POLL 60s</span><span>LOG ≠ LIVE</span><span class="src" title="${esc(source)}">${esc(source)}</span> · <a href="https://nlaughter100.github.io/grokbot-dashboard/" target="_blank" rel="noopener noreferrer">SOURCE SITE</a>`;
  document.body.dataset.view = S.view;
  document.body.dataset.ready = S.data ? "yes" : (S.fetchError ? "error" : "loading");
  document.body.classList.toggle("focus", S.focus);
}

function renderDynamic() {
  S.days = S.data ? resolveWeek(S.data.updated, S.data.weekDays) : [];
  const summary = S.data ? summarize(S.data.bots) : null;
  document.getElementById("tiles").innerHTML = tileHtml(S.data ? coreTiles(summary) : coreTiles(null).map((tile) => ({ ...tile, s: S.loading ? "LOADING" : "NO DATA", v: S.loading ? "…" : "—" })));
  const items = feedItems();
  document.getElementById("feed-meta").textContent = S.data ? `· ${items.length} LINES` : "";
  document.getElementById("feed").innerHTML = feedHtml(items);
  const bots = visibleBots();
  const all = S.data ? S.data.bots.length : 0;
  document.getElementById("agent-grid").innerHTML = S.data
    ? `<p class="agent-count">SHOWING ${bots.length} OF ${all} SNAPSHOT AGENTS</p><div class="agent-grid">${bots.map(agentButton).join("") || ""}</div>${bots.length ? "" : emptyBlock("NO MATCH", "No agent matches the current filter.")}`
    : emptyBlock(S.loading ? "READING SOURCE" : "NO SNAPSHOT", S.fetchError || "The public daily file has not loaded.");
  document.getElementById("timeline").innerHTML = timelineHtml();
  document.getElementById("rings").innerHTML = ringsHtml();
  document.getElementById("heatmap").innerHTML = heatmapHtml(true);
  document.getElementById("side-status").innerHTML = sideStatusHtml();
  document.getElementById("stage").innerHTML = S.view === "command" ? "" : stageHtml();
  const detail = document.getElementById("detail");
  const detailKey = `${S.raw}|${S.query}|${S.dayIndex}|${S.agentId}|${S.view}`;
  if (detail.open && detailKey !== S.detailKey) {
    const sheet = detail.querySelector(".sheet");
    const top = sheet ? sheet.scrollTop : 0;
    fillDetail();
    const next = detail.querySelector(".sheet");
    if (next) next.scrollTop = top;
  }
}

function fillDetail() {
  const detail = document.getElementById("detail");
  const bot = (S.data?.bots || []).find((entry) => entry.id === S.agentId);
  detail.innerHTML = bot ? detailHtml(bot) : `<div class="sheet"><button type="button" class="close" data-cmd="close-detail">CLOSE</button><h2 id="detail-title">NO RECORD</h2><p>That agent is not in the current snapshot.</p></div>`;
  S.detailKey = `${S.raw}|${S.query}|${S.dayIndex}|${S.agentId}|${S.view}`;
}

function render() {
  renderFilters();
  renderFreshness();
  renderDynamic();
}

function openAgent(id) {
  S.agentId = id;
  render();
  const detail = document.getElementById("detail");
  fillDetail();
  if (!detail.open) detail.showModal();
  detail.querySelector(".close")?.focus();
}

function clearFilters(which) {
  if (which === "query" || which === "all") {
    S.query = "";
    const input = document.getElementById("q");
    if (input) input.value = "";
  }
  if (which === "status" || which === "all") S.statusFilter = "all";
  if (which === "day" || which === "all") S.dayIndex = null;
}

function runCmd(cmd) {
  if (cmd === "refresh") { refresh(); return; }
  if (["daily", "weekly", "yearly", "feed", "agents", "needs", "command"].includes(cmd)) {
    S.view = cmd;
    S.focus = false;
  } else if (cmd === "attention") {
    S.focus = false;
    if (S.statusFilter === "attention") S.statusFilter = "all";
    else { S.statusFilter = "attention"; S.view = "agents"; }
  } else if (cmd === "focus") {
    S.focus = !S.focus;
    if (S.focus) S.view = "command";
  } else if (cmd === "clear") clearFilters("all");
  else if (cmd === "help") { document.getElementById("help").showModal(); return; }
  else if (cmd === "close-help") { document.getElementById("help").close(); return; }
  else if (cmd === "close-detail") { document.getElementById("detail").close(); return; }
  render();
}

let inflight = 0;
async function refresh() {
  const id = ++inflight;
  S.fetching = true;
  renderFreshness();
  const live = document.getElementById("live");
  try {
    const endpoint = new URL(sourceUrl(location.href));
    endpoint.searchParams.set("t", String(Date.now()));
    const response = await fetch(endpoint.toString(), { cache: "no-store" });
    if (id !== inflight) return;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const schemaError = validate(json);
    S.fetchedAt = new Date();
    S.fetchError = "";
    S.loading = false;
    if (schemaError) {
      S.schemaError = schemaError;
      if (!S.data) render();
      else renderFreshness();
      live.textContent = schemaError;
      return;
    }
    S.schemaError = "";
    const raw = JSON.stringify(json);
    const changed = raw !== S.raw;
    S.data = json;
    S.raw = raw;
    document.title = `JARVIS · Snapshot ${stampText(json.updated)}`;
    if (changed) render();
    else { renderFreshness(); renderFilters(); }
    live.textContent = `Snapshot loaded. Source time ${stampText(json.updated)}.`;
  } catch (error) {
    if (id !== inflight) return;
    S.fetchedAt = new Date();
    S.loading = false;
    S.fetchError = error.message || "Fetch failed";
    render();
    live.textContent = S.data ? `Refresh failed. ${S.fetchError}. Showing the last good snapshot.` : `No snapshot. ${S.fetchError}.`;
  } finally {
    if (id === inflight) { S.fetching = false; renderFreshness(); }
  }
}

function cycleAgent(step) {
  const bots = visibleBots();
  if (!bots.length) return;
  let index = bots.findIndex((bot) => bot.id === S.agentId);
  if (index < 0) index = 0;
  else index = (index + step + bots.length) % bots.length;
  openAgent(bots[index].id);
}

function prep(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let next = value;
    next = Math.imul(next ^ next >>> 15, next | 1);
    next ^= next + Math.imul(next ^ next >>> 7, next | 61);
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}

const stars = [];
function ensureStars(width, height) {
  const key = `${width}x${height}`;
  if (stars.key === key) return;
  stars.key = key;
  stars.points = [];
  const random = mulberry32(42);
  const count = Math.round((width * height) / 14000);
  for (let index = 0; index < count; index += 1) {
    stars.points.push({ x: random() * width, y: random() * height, r: random() * 1.2 + 0.2, p: random() * Math.PI * 2, s: 0.4 + random() * 1.4 });
  }
}

function drawStars(ctx, width, height, time, reduce) {
  ctx.clearRect(0, 0, width, height);
  ensureStars(width, height);
  for (const star of stars.points) {
    const alpha = reduce ? 0.45 : 0.2 + 0.55 * (0.5 + 0.5 * Math.sin(time * star.s + star.p));
    ctx.fillStyle = `rgba(190, 236, 255, ${alpha})`;
    ctx.fillRect(star.x, star.y, star.r, star.r);
  }
}

let heroStarField = null;
function heroStars(width, height) {
  const key = `${Math.round(width)}x${Math.round(height)}`;
  if (heroStarField?.key === key) return heroStarField.points;
  const random = mulberry32(9);
  const points = Array.from({ length: 46 }, () => ({
    x: random() * width,
    y: random() * height,
    r: random() * 1.25 + 0.35,
    p: random() * Math.PI * 2,
    s: 0.45 + random() * 1.3
  }));
  heroStarField = { key, points };
  return points;
}

function project(lat, lon, tilt) {
  let x = Math.cos(lat) * Math.sin(lon);
  let y = Math.sin(lat);
  let z = Math.cos(lat) * Math.cos(lon);
  const y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
  const z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
  return { x, y: y2, z: z2 };
}

function drawGlobe(ctx, width, height, time, reduce) {
  ctx.clearRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height * 0.52;
  const radius = Math.min(width, height) * 0.34;
  const spin = reduce ? 0.7 : time * 0.22;
  const tilt = reduce ? 0.35 : 0.32 + Math.sin(time * 0.18) * 0.08;
  const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.35);
  glow.addColorStop(0, "rgba(36, 120, 150, 0.2)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  for (const star of heroStars(width, height)) {
    const alpha = reduce ? 0.45 : 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(time * star.s + star.p));
    ctx.fillStyle = `rgba(190, 245, 255, ${alpha})`;
    ctx.fillRect(star.x, star.y, star.r, star.r);
  }
  const drawOrbit = (rx, ry, rotation, alpha) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(130, 230, 245, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  };
  drawOrbit(radius * 1.42, radius * 0.28, -0.7, 0.28);
  drawOrbit(radius * 1.18, radius * 0.46, 0.45, 0.22);
  const lats = 9;
  const lons = 14;
  const rows = [];
  for (let i = 0; i <= lats; i += 1) {
    const lat = -Math.PI / 2 + (Math.PI * i) / lats;
    const row = [];
    for (let j = 0; j <= lons; j += 1) {
      const point = project(lat, (Math.PI * 2 * j) / lons + spin, tilt);
      const scale = 0.78 + 0.22 * ((point.z + 1) / 2);
      row.push({ x: cx + point.x * radius * scale, y: cy - point.y * radius * scale, z: point.z });
    }
    rows.push(row);
  }
  for (let i = 0; i < lats; i += 1) {
    for (let j = 0; j < lons; j += 1) {
      const a = rows[i][j];
      const b = rows[i][j + 1];
      const c = rows[i + 1][j];
      const d = rows[i + 1][j + 1];
      strokeTri(ctx, a, b, c);
      strokeTri(ctx, b, d, c);
    }
  }
  for (const row of rows) {
    for (const point of row) {
      if (point.z < -0.05) continue;
      ctx.fillStyle = `rgba(170, 246, 255, ${0.2 + 0.8 * Math.max(0, point.z)})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.z > 0.55 ? 1.7 : 1.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.98, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(150, 236, 255, 0.38)";
  ctx.stroke();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(1.05);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.28, radius * 0.34, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(150, 240, 255, 0.55)";
  ctx.stroke();
  const angle = reduce ? 0.4 : time * 0.55;
  ctx.fillStyle = "rgba(220, 255, 255, 0.95)";
  ctx.beginPath();
  ctx.arc(Math.cos(angle) * radius * 1.28, Math.sin(angle) * radius * 0.34, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function strokeTri(ctx, a, b, c) {
  const z = (a.z + b.z + c.z) / 3;
  if (z < -0.25) return;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.closePath();
  const front = Math.max(0, z);
  ctx.strokeStyle = `rgba(126, 226, 240, ${0.08 + front * 0.55})`;
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function drawWave(ctx, width, height, ratio, time, reduce) {
  ctx.clearRect(0, 0, width, height);
  const mid = height / 2;
  const amp = ratio == null ? 0 : height * 0.28 * (0.2 + 0.8 * ratio);
  ctx.beginPath();
  for (let x = 0; x <= width; x += 2) {
    const phase = reduce ? 0.6 : time * 1.4;
    const y = mid + Math.sin(x * 0.08 + phase) * amp * (0.65 + 0.35 * Math.sin(x * 0.02));
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = ratio == null ? "rgba(140, 170, 190, 0.45)" : "rgba(120, 235, 250, 0.9)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function boot() {
  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clock = document.getElementById("clock");
  const date = document.getElementById("date");
  const tick = () => {
    const now = new Date();
    clock.textContent = clockText(now);
    date.textContent = dateText(now);
  };
  tick();
  setInterval(tick, 1000);
  document.getElementById("searchform").addEventListener("submit", (event) => event.preventDefault());
  document.getElementById("q").addEventListener("input", (event) => {
    S.query = event.target.value;
    render();
  });
  document.addEventListener("click", (event) => {
    const clear = event.target.closest("[data-clear]");
    if (clear) { clearFilters(clear.dataset.clear); render(); return; }
    const command = event.target.closest("[data-cmd]");
    if (command) { runCmd(command.dataset.cmd); return; }
    const nav = event.target.closest("[data-nav]");
    if (nav) {
      S.view = nav.dataset.nav;
      S.focus = false;
      const detail = document.getElementById("detail");
      if (detail.open) detail.close();
      render();
      return;
    }
    const agent = event.target.closest("[data-agent]");
    if (agent) {
      const day = event.target.closest("[data-day]");
      if (day) S.dayIndex = Number(day.dataset.day);
      openAgent(agent.dataset.agent);
      return;
    }
    const day = event.target.closest("[data-day]");
    if (day) {
      const index = Number(day.dataset.day);
      S.dayIndex = S.dayIndex === index ? null : index;
      render();
    }
  });
  document.addEventListener("keydown", (event) => {
    const typing = event.target.matches("input, textarea");
    if (event.key === "/" && !typing) {
      event.preventDefault();
      document.getElementById("q").focus();
      document.getElementById("q").select();
      return;
    }
    const detailOpen = document.getElementById("detail").open;
    const helpOpen = document.getElementById("help").open;
    if (event.key === "Escape" && !detailOpen && !helpOpen) {
      if (S.focus) { S.focus = false; render(); return; }
      if (S.query || S.statusFilter !== "all" || S.dayIndex != null) { clearFilters("all"); render(); }
      return;
    }
    if (detailOpen && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      event.preventDefault();
      cycleAgent(event.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (typing || detailOpen || helpOpen || event.metaKey || event.ctrlKey || event.altKey) return;
    const views = { "1": "command", "2": "agents", "3": "daily", "4": "weekly", "5": "yearly", "6": "feed", "7": "needs" };
    if (views[event.key]) { S.view = views[event.key]; S.focus = false; render(); }
    if (event.key === "f" || event.key === "F") { S.focus = !S.focus; if (S.focus) S.view = "command"; render(); }
    if (event.key === "r" || event.key === "R") { event.preventDefault(); refresh(); }
  });
  const globe = document.getElementById("globe");
  const wave = document.getElementById("wave");
  const starCanvas = document.getElementById("stars");
  let started = performance.now();
  const frame = (now) => {
    const time = (now - started) / 1000;
    const reduce = reduceQuery.matches;
    const starBox = prep(starCanvas);
    drawStars(starBox.ctx, starBox.width, starBox.height, time, reduce);
    if (globe.getBoundingClientRect().width > 2) {
      const box = prep(globe);
      drawGlobe(box.ctx, box.width, box.height, time, reduce);
    }
    const waveBox = prep(wave);
    drawWave(waveBox.ctx, waveBox.width, waveBox.height, S.waveRatio, time, reduce);
    if (!reduce) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  reduceQuery.addEventListener?.("change", () => requestAnimationFrame(frame));
  window.addEventListener("resize", () => requestAnimationFrame(frame));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && S.fetchedAt && Date.now() - S.fetchedAt.getTime() > POLL_MS) refresh();
  });
  setInterval(() => {
    if (document.visibilityState === "visible") refresh();
  }, POLL_MS);
  render();
  refresh();
}

if (typeof document !== "undefined") boot();
