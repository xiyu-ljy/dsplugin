// dsh-usage-ledger host half.
//
// Why this exists: the Context Insights page (dsh-context) reads each session's
// own log and projection cache, so deleting a session erases the only record of
// how many tokens it billed — dsh-archived removes the artifact directory, the
// projection cache document and the archive index entry together.
//
// This plugin keeps a separate, cross-session ledger under
//   $DSH_HOME/dsh-usage-ledger/ledger.json
// that a session delete never touches, fed by two sources:
//
//   1. live: `session/event` — every committed `assistant/message` carries the
//      provider-reported usage for its (turn, step);
//   2. backfill: the projection cache document of each session on disk
//      (`tokenUsage.totals` + `contextTimeline.requests`), read once per session.
//
// A session whose cache document stops existing while the ledger still holds it
// is marked `deleted`; its record and its tokens stay.
//
// A session's lifecycle in this ledger has three states, decided by what is
// still on disk plus the workspace registry's archive index:
//
//   active   — cache document present, not archived   (still growing)
//   archived — cache document present, archived       (frozen)
//   deleted  — cache document gone                    (frozen, ledger only)
//
// The page (and the delete route) also treats "current" as active + archived:
// everything that still exists. Deleting an archived session happens here, and
// it snapshots that session's cache into the ledger before anything is moved.
//
// Deliberately imports only `node:` builtins: this bundle is developed in a
// workspace and linked into the profile, so a bare `@deepseek-ai/*` import would
// not resolve from its real path (the same reason dsh-archived inlines its path
// helpers).

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import zlib from "node:zlib";

const API_BASE = "/api/usage-ledger";
const HEADER = "x-dsh-usage-ledger";
const LEDGER_VERSION = 2;
const WRITE_DEBOUNCE_MS = 800;
const CACHE_READ_LIMIT = 4 * 1024 * 1024;

const DEFAULT_CONFIG = {
  /** Read every session's projection cache once, to seed history. */
  backfill: true,
  /** Minutes between "which cache documents still exist" sweeps. */
  sweepMinutes: 10,
  /** Count subagent sessions too (they bill real tokens). */
  includeSubagents: true,
  /** Days of per-session daily buckets kept in the payload; 0 keeps all. */
  payloadDays: 120,
  /** Days a deleted session's files stay recoverable in this plugin's trash. */
  trashRetentionDays: 30,
  /**
   * Cost estimate. Prices are models.dev list prices in USD per 1M tokens
   * (deepseek provider, read 2026-11). DeepSeek publishes an off-peak price and
   * bills peak hours at 2×; everything else is billed at the listed price.
   * Override any field through the plugin config.
   */
  pricing: {
    usdToCny: 7.2,
    peakMultiplier: 2,
    /** Local-clock minutes [start, end) billed at the off-peak price. */
    offPeakMinutes: [30, 510],
    models: {
      "deepseek-flash": { input: 0.15, cacheRead: 0.003, output: 0.6 },
      "deepseek-v4-flash": { input: 0.15, cacheRead: 0.003, output: 0.6 },
      "deepseek-chat": { input: 0.15, cacheRead: 0.003, output: 0.6 },
      "deepseek-reasoner": { input: 0.66, cacheRead: 0.022, output: 1.98 },
      "deepseek-v4-pro": { input: 0.66, cacheRead: 0.022, output: 1.98 },
    },
  },
};

// ---------------------------------------------------------------------------
// Paths (mirrors the documented rule: $DSH_HOME when non-blank, else ~/.dsh)
// ---------------------------------------------------------------------------

function dshHome() {
  const configured = process.env.DSH_HOME;
  if (typeof configured === "string" && configured.trim() !== "") return resolve(configured.trim());
  return join(homedir(), ".dsh");
}

function pluginStateDir() {
  return join(dshHome(), "dsh-usage-ledger");
}

function ledgerFile() {
  return join(pluginStateDir(), "ledger.json");
}

function projectionCacheDir() {
  return join(dshHome(), "storages", "session_projcache", "sessions");
}

/** Root holding one directory per encoded workspace, each with session dirs. */
function sessionsRoot() {
  return join(dshHome(), "sessions");
}

/** Where a deleted session's log directory and cache document are parked. */
function trashRoot() {
  return join(pluginStateDir(), "trash");
}

function trashEntry(sessionId) {
  return join(trashRoot(), sessionId);
}

/** The workspace registry store, read only as a fallback for the archive set. */
function workspaceStoreFile() {
  return join(dshHome(), "storages", "workspace.json");
}

// ---------------------------------------------------------------------------
// Session id forms
// ---------------------------------------------------------------------------
//
// Three spellings name the same session: the archive index is namespaced
// (`session-<uuid>`, `import-<uuid>`), the log directory and the projection
// cache use the store shape (usually the bare uuid), and the live event feed
// carries whichever the Session was created with. Every comparison normalizes
// first.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PREFIXES = ["import-session-", "import-", "session-"];
const SESSION_ID = new RegExp(`^(?:import-session-|import-|session-)?${UUID}$`, "i");

function normalizeId(raw) {
  let text = String(raw);
  for (const prefix of PREFIXES) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length);
      break;
    }
  }
  return text;
}

/** Every spelling the store, the archive index, and the cache may file an id under. */
function idCandidates(raw) {
  const bare = normalizeId(raw);
  const out = [String(raw), bare, `session-${bare}`, `import-${bare}`, `import-session-${bare}`];
  return Array.from(new Set(out));
}

/** Inverse of DSH's `encodeSegment`: `~XXXX` back to a code unit. */
function decodeSegment(name) {
  let out = "";
  for (let index = 0; index < name.length; index += 1) {
    const character = name[index];
    if (character !== "~") {
      out += character;
      continue;
    }
    out += String.fromCharCode(parseInt(name.slice(index + 1, index + 5), 16));
    index += 4;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Local calendar day of one epoch millisecond value, as `YYYY-MM-DD`. */
function dayKey(ms) {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numberOr(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function emptyBuckets() {
  return { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
}

function emptyRecord(id) {
  return {
    id,
    title: "",
    cwd: "",
    model: "",
    provider: "",
    subagent: "",
    totals: emptyBuckets(),
    cost: 0,
    lastCost: 0,
    days: {},
    turns: 0,
    steps: 0,
    last: null,
    lastAt: 0,
    // Session lineage, learned from the log header (the projection cache does
    // not carry it). `parent` is empty for a top-level session.
    parent: "",
    origin: "",
    // Per-category context composition and the skills this session injected.
    // Both come from the context timeline projection when a context plugin has
    // written it; sessions without one simply carry no composition.
    composition: null,
    skills: [],
    toolCalls: 0,
    toolsMs: 0,
    modelCalls: 0,
    wallMs: 0,
    ttftMs: 0,
    reasoningMs: 0,
    textMs: 0,
    toolArgMs: 0,
    foldedThroughSeq: -1,
    createdAt: 0,
    firstSeenAt: 0,
    lastSeenAt: 0,
    status: "live",
    deletedAt: null,
    // True once this record was seen alongside a projection-cache document.
    // Only such a record may be flagged deleted: a brand-new live session may
    // not have written its cache yet, and absence is not proof of deletion.
    seeded: false,
  };
}

/** Add one usage sample's buckets into a record's totals and its day bucket. */
function addToDay(rec, atMs, buckets, requests = 1) {
  const key = dayKey(atMs);
  if (key === "") return;
  const day = rec.days[key] ?? { tokens: 0, requests: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  day.input += buckets.input;
  day.cacheRead += buckets.cacheRead;
  day.cacheWrite += buckets.cacheWrite;
  day.output += buckets.output;
  day.tokens = day.input + day.cacheRead + day.cacheWrite + day.output;
  day.requests += requests;
  rec.days[key] = day;
}

function addBuckets(target, buckets) {
  target.input += buckets.input;
  target.cacheRead += buckets.cacheRead;
  target.cacheWrite += buckets.cacheWrite;
  target.output += buckets.output;
}

function subtractBuckets(target, buckets) {
  target.input -= buckets.input;
  target.cacheRead -= buckets.cacheRead;
  target.cacheWrite -= buckets.cacheWrite;
  target.output -= buckets.output;
}

function bucketsEqual(left, right) {
  return (
    left !== null &&
    right !== null &&
    left.input === right.input &&
    left.cacheRead === right.cacheRead &&
    left.cacheWrite === right.cacheWrite &&
    left.output === right.output
  );
}

/** Provider usage → ledger buckets. `inputTokens` is the uncached part. */
function bucketsOfUsage(usage) {
  return {
    input: numberOr(usage?.inputTokens),
    cacheRead: numberOr(usage?.cacheReadTokens),
    cacheWrite: numberOr(usage?.cacheWriteTokens),
    output: numberOr(usage?.outputTokens),
  };
}

/** List price for one model; unknown models fall back to the flash table. */
function priceOf(model) {
  const table = runtime.pricing?.models ?? {};
  const entry = table[model] ?? table["deepseek-flash"];
  return entry ?? { input: 0.15, cacheRead: 0.003, output: 0.6 };
}

/** DeepSeek bills peak hours at a multiple of its listed (off-peak) price. */
function peakFactor(at) {
  const pricing = runtime.pricing ?? {};
  const window = Array.isArray(pricing.offPeakMinutes) ? pricing.offPeakMinutes : [30, 510];
  const date = new Date(at);
  const minutes = date.getHours() * 60 + date.getMinutes();
  const start = numberOr(window[0], 30);
  const end = numberOr(window[1], 510);
  const offPeak = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  return offPeak ? 1 : numberOr(pricing.peakMultiplier, 2);
}

/** Estimated USD cost of one usage sample at a given time. */
function costOf(buckets, model, at) {
  const price = priceOf(model);
  const usd =
    (buckets.input * numberOr(price.input) +
      buckets.cacheRead * numberOr(price.cacheRead) +
      buckets.cacheWrite * numberOr(price.input) +
      buckets.output * numberOr(price.output)) /
    1e6;
  return usd * peakFactor(at);
}

// ---------------------------------------------------------------------------
// Ledger state
// ---------------------------------------------------------------------------

const runtime = {
  ctx: null,
  config: { ...DEFAULT_CONFIG },
  pricing: null,
  registry: undefined,
  state: null,
  loading: null,
  writeTimer: null,
  writeChain: Promise.resolve(),
  dirty: false,
  misses: new Map(),
  presentIds: null,
  sweeps: 0,
};

async function readLedger() {
  try {
    const text = await readFile(ledgerFile(), "utf8");
    const parsed = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object" && parsed.sessions !== null && typeof parsed.sessions === "object") {
      return { version: LEDGER_VERSION, updatedAt: numberOr(parsed.updatedAt), sessions: parsed.sessions };
    }
  } catch {
    // A missing or unreadable ledger is an empty ledger: nothing is lost that
    // this file held, and the backfill re-seeds what is still on disk.
  }
  return { version: LEDGER_VERSION, updatedAt: 0, sessions: {} };
}

async function writeLedger() {
  const state = runtime.state;
  if (state === null) return;
  state.updatedAt = Date.now();
  const target = ledgerFile();
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(state), "utf8");
  await rename(temporary, target);
}

function scheduleWrite() {
  runtime.dirty = true;
  if (runtime.writeTimer !== null) return;
  runtime.writeTimer = setTimeout(() => {
    runtime.writeTimer = null;
    flushWrite().catch((error) => runtime.ctx?.logger?.warn?.("[dsh-usage-ledger] write failed:", error));
  }, WRITE_DEBOUNCE_MS);
  runtime.writeTimer.unref?.();
}

function flushWrite() {
  const chain = runtime.writeChain.then(async () => {
    if (!runtime.dirty) return;
    runtime.dirty = false;
    await writeLedger();
  });
  runtime.writeChain = chain.catch(() => {});
  return chain;
}

async function ensureState() {
  if (runtime.state !== null) return runtime.state;
  if (runtime.loading === null) {
    runtime.loading = (async () => {
      const state = await readLedger();
      runtime.state = state;
      for (const rec of Object.values(state.sessions)) {
        // Records written before `seeded` existed: only one folded from a cache
        // document (foldedThroughSeq >= 0) may be judged by cache absence.
        if (rec.seeded === undefined) rec.seeded = numberOr(rec.foldedThroughSeq, -1) >= 0;
        // A record that never had a cache document cannot be proven deleted.
        if (rec.seeded !== true && rec.status === "deleted") {
          rec.status = "live";
          rec.deletedAt = null;
        }
      }
      if (runtime.config.backfill) await backfill(state);
      markMissing(state);
      return state;
    })();
  }
  return runtime.loading;
}

function recordFor(state, id) {
  let rec = state.sessions[id];
  if (rec === undefined) {
    rec = emptyRecord(id);
    rec.firstSeenAt = Date.now();
    state.sessions[id] = rec;
  }
  return rec;
}

// ---------------------------------------------------------------------------
// Backfill from the projection cache
// ---------------------------------------------------------------------------

function cacheRows(document) {
  return document?.record?.rows ?? {};
}

function rowValue(rows, name) {
  const row = rows?.[name];
  return row !== null && typeof row === "object" ? row.val : undefined;
}

/** Creation facts of one cache document, or `null` when it is not one. */
function readCacheFacts(id, document, stats) {
  if (document === null || typeof document !== "object") return null;
  const rows = cacheRows(document);
  if (Object.keys(rows).length === 0) return null;
  const identity = document.record?.identity ?? {};
  const usage = rowValue(rows, "tokenUsage");
  const timeline = rowValue(rows, "contextTimeline") ?? {};
  const catalog = rowValue(rows, "sessionStats") ?? {};
  const selection = rowValue(rows, "modelSelection") ?? {};
  const title = rowValue(rows, "title");
  const subagent = rowValue(rows, "subagent") ?? {};
  const lastUsed = selection?.lastUsed ?? {};

  const rec = emptyRecord(id);
  rec.title = typeof title === "string" ? title : "";
  rec.cwd = typeof identity.cwd === "string" ? identity.cwd : "";
  rec.model = typeof timeline.model === "string" ? timeline.model : typeof lastUsed.model === "string" ? lastUsed.model : "";
  rec.provider =
    typeof timeline.provider === "string" ? timeline.provider : typeof lastUsed.provider === "string" ? lastUsed.provider : "";
  rec.subagent = typeof subagent?.identity?.label === "string" ? subagent.identity.label : "";
  rec.createdAt = numberOr(identity.createdAt, stats.mtimeMs);
  rec.firstSeenAt = rec.createdAt;
  rec.lastSeenAt = Math.round(stats.mtimeMs);
  rec.seeded = true;
  rec.turns = numberOr(catalog.turns);
  rec.steps = numberOr(catalog.steps);

  const sums = timeline !== null && typeof timeline === "object" ? timeline.sums : undefined;
  const timing = timeline !== null && typeof timeline === "object" ? timeline.timing : undefined;
  if (timing !== null && typeof timing === "object") {
    rec.toolCalls = numberOr(timing.toolCalls);
    rec.toolsMs = numberOr(timing.toolsMs);
    rec.modelCalls = numberOr(timing.calls);
    rec.wallMs = numberOr(timing.wallMs);
    rec.ttftMs = numberOr(timing.ttftMs);
    rec.reasoningMs = numberOr(timing.reasoningMs);
    rec.textMs = numberOr(timing.textMs);
    rec.toolArgMs = numberOr(timing.toolArgMs);
  }
  if (sums !== null && typeof sums === "object") {
    rec.composition = {
      system: numberOr(timeline.systemTokens),
      tools: numberOr(timeline.toolsTokens),
      user: numberOr(sums.user),
      inject: numberOr(sums.inject),
      skill: numberOr(sums.skill),
      assistant: numberOr(sums.assistant),
      tool: numberOr(sums.tool),
    };
  }
  if (Array.isArray(timeline.surface)) {
    const skills = new Map();
    for (const entry of timeline.surface) {
      if (entry === null || typeof entry !== "object" || entry.cat !== "skill") continue;
      const name = typeof entry.skill === "string" ? entry.skill : "";
      if (name === "") continue;
      const item = skills.get(name) ?? { name, count: 0, tokens: 0, lastAt: 0 };
      item.count += 1;
      item.tokens += numberOr(entry.tokens);
      item.lastAt = Math.max(item.lastAt, numberOr(entry.time));
      skills.set(name, item);
    }
    rec.skills = Array.from(skills.values());
  }

  const totals = usage?.totals;
  if (totals !== null && typeof totals === "object") {
    rec.totals = {
      input: numberOr(totals.uncachedInputTokens),
      cacheRead: numberOr(totals.cacheReadTokens),
      cacheWrite: numberOr(totals.cacheWriteTokens),
      output: numberOr(totals.outputTokens),
    };
  }

  const last = usage?.last;
  if (last !== null && typeof last === "object" && typeof last.turn === "number" && typeof last.step === "number") {
    rec.last = { turn: last.turn, step: last.step, buckets: bucketsOfUsage(last.buckets) };
  }

  const folded = rows?.tokenUsage?.seq;
  if (typeof folded === "number") rec.foldedThroughSeq = folded;

  // Daily buckets come from the per-request timeline when the session carries
  // one (each request records its own moment and provider price), otherwise from
  // the plugin-agnostic daily tally if a context plugin wrote it.
  const requests = Array.isArray(timeline.requests) ? timeline.requests : null;
  if (requests !== null && requests.length > 0) {
    const composition = { system: 0, tools: 0, user: 0, inject: 0, skill: 0, assistant: 0, tool: 0 };
    for (const request of requests) {
      const at = numberOr(request?.time);
      if (at > 0) {
        const cacheRead = numberOr(request?.cacheRead);
        const output = numberOr(request?.output);
        const prompt = numberOr(request?.prompt);
        const buckets = {
          input: Math.max(0, prompt - cacheRead),
          cacheRead,
          cacheWrite: numberOr(request?.cacheWrite),
          output,
        };
        addToDay(rec, at, buckets, 1);
        const cost = costOf(buckets, rec.model, at);
        rec.cost += cost;
        const day = rec.days[dayKey(at)];
        if (day !== undefined) day.cost = numberOr(day.cost) + cost;
      }
      // Composition is cumulative across requests: each request reports how
      // many tokens of each category its prompt carried.
      composition.system += numberOr(request?.system);
      composition.tools += numberOr(request?.tools);
      composition.user += numberOr(request?.user);
      composition.inject += numberOr(request?.inject);
      composition.skill += numberOr(request?.skill);
      composition.assistant += numberOr(request?.assistant);
      composition.tool += numberOr(request?.tool);
    }
    rec.composition = composition;
  } else {
    const activity = rowValue(rows, "contextActivity");
    const days = activity?.days;
    if (days !== null && typeof days === "object") {
      for (const [key, value] of Object.entries(days)) {
        if (value === null || typeof value !== "object") continue;
        const tokens = numberOr(value.tokens);
        rec.days[key] = {
          tokens,
          requests: numberOr(value.requests),
          input: 0,
          cacheRead: 0,
          cacheWrite: 0,
          // No split is known from a bare daily tally; the total stays
          // authoritative and the input side is reported as output so that
          // billed tokens still add up.
          output: tokens,
        };
      }
    }
  }

  return rec;
}

async function listCacheFiles() {
  let names;
  try {
    names = await readdir(projectionCacheDir());
  } catch {
    return [];
  }
  const files = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    // The document is filed under whichever id form the session was created
    // with: the bare uuid, or the namespaced `session-<uuid>`.
    const bare = normalizeId(id);
    if (!new RegExp(`^${UUID}$`, "i").test(bare)) continue;
    files.push({ id, bare, path: join(projectionCacheDir(), name) });
  }
  return files;
}

async function backfill(state) {
  const files = await listCacheFiles();
  const directories = files.length > 0 ? await sessionDirIndex() : new Map();
  let seeded = 0;
  let lineage = 0;
  for (const file of files) {
    let stats;
    try {
      stats = await stat(file.path);
    } catch {
      continue;
    }
    if (stats.size > CACHE_READ_LIMIT) continue;
    const existing = state.sessions[file.id] ?? state.sessions[file.bare] ?? findRecord(state, file.id);
    // Totals are seeded exactly once. Later visits only refresh metadata, so a
    // live session's post-install events are never overwritten by a stale cache.
    let text;
    try {
      text = await readFile(file.path, "utf8");
    } catch {
      continue;
    }
    let document;
    try {
      document = JSON.parse(text);
    } catch {
      continue;
    }
    const facts = readCacheFacts(file.id, document, stats);
    if (facts === null) continue;
    if (existing === undefined) {
      await fillLineage(facts, directories);
      state.sessions[file.id] = facts;
      seeded += 1;
      lineage += 1;
      continue;
    }
    existing.title = facts.title || existing.title;
    existing.cwd = facts.cwd || existing.cwd;
    existing.model = facts.model || existing.model;
    existing.provider = facts.provider || existing.provider;
    existing.subagent = facts.subagent || existing.subagent;
    existing.lastSeenAt = Math.max(existing.lastSeenAt, facts.lastSeenAt);
    if (facts.composition !== null) existing.composition = facts.composition;
    if (facts.skills.length > 0) existing.skills = facts.skills;
    // Cost is derived from the cache's request timeline, so a record seeded
    // before costing existed gains it here without waiting for a total change.
    existing.cost = Math.max(numberOr(existing.cost), numberOr(facts.cost));
    existing.toolCalls = Math.max(numberOr(existing.toolCalls), numberOr(facts.toolCalls));
    existing.toolsMs = Math.max(numberOr(existing.toolsMs), numberOr(facts.toolsMs));
    existing.modelCalls = Math.max(numberOr(existing.modelCalls), numberOr(facts.modelCalls));
    existing.wallMs = Math.max(numberOr(existing.wallMs), numberOr(facts.wallMs));
    existing.ttftMs = Math.max(numberOr(existing.ttftMs), numberOr(facts.ttftMs));
    existing.reasoningMs = Math.max(numberOr(existing.reasoningMs), numberOr(facts.reasoningMs));
    existing.textMs = Math.max(numberOr(existing.textMs), numberOr(facts.textMs));
    existing.toolArgMs = Math.max(numberOr(existing.toolArgMs), numberOr(facts.toolArgMs));
    // The cache is a fold of every committed event, so it can only be ahead:
    // a reload gap (events emitted while this plugin was off) shows up here as
    // the cache billing more than the ledger. Adopt it instead of drifting.
    if (billedOf(facts.totals) > billedOf(existing.totals)) {
      existing.totals = facts.totals;
      existing.days = facts.days;
      existing.last = facts.last;
      existing.cost = Math.max(numberOr(existing.cost), numberOr(facts.cost));
      existing.foldedThroughSeq = Math.max(existing.foldedThroughSeq, facts.foldedThroughSeq);
      existing.steps = Math.max(existing.steps, facts.steps);
      existing.turns = Math.max(existing.turns, facts.turns);
    }
    // Records seeded before lineage was tracked read it once, then keep it.
    if (existing.parent === undefined) {
      await fillLineage(existing, directories);
      lineage += 1;
    }
    if (existing.status === "deleted") {
      existing.status = "live";
      existing.deletedAt = null;
    }
  }
  runtime.ctx?.logger?.info?.(
    `[dsh-usage-ledger] backfill seeded ${seeded} of ${files.length} session(s), lineage for ${lineage}`,
  );
  runtime.dirty = true;
  await flushWrite();
}

/** Copy `parentSession` / `origin` from the log header onto a record. */
async function fillLineage(record, directories) {
  const header = await readSessionHeader(directories.get(normalizeId(record.id).toLowerCase()));
  record.parent = typeof header?.parentSession === "string" ? normalizeId(header.parentSession) : "";
  record.origin = typeof header?.origin === "string" ? header.origin : "";
}

/**
 * Flag records whose cache document is gone.
 *
 * Two consecutive misses are required so a session that is merely being written
 * (cache flushed on checkpoint, not on every event) is not mistaken for a
 * deleted one.
 */
function markMissing(state) {
  const present = runtime.presentIds;
  if (present === undefined || present === null) return;
  let changed = 0;
  for (const [id, rec] of Object.entries(state.sessions)) {
    if (present.has(normalizeId(id))) {
      runtime.misses.delete(id);
      if (rec.status === "deleted" || rec.status === "forgotten") {
        rec.status = "live";
        rec.deletedAt = null;
        changed += 1;
      }
      continue;
    }
    if (rec.status === "deleted" || rec.status === "forgotten") continue;
    // A record that never had a cache document is a live-only one: it is not
    // evidence of a deletion, only of a session the cache has not reached yet.
    if (rec.seeded !== true) continue;
    const misses = (runtime.misses.get(id) ?? 0) + 1;
    runtime.misses.set(id, misses);
    if (misses >= 2) {
      rec.status = "deleted";
      rec.deletedAt = Date.now();
      changed += 1;
    }
  }
  if (changed > 0) {
    runtime.dirty = true;
    scheduleWrite();
  }
}

async function sweep(state) {
  const files = await listCacheFiles();
  runtime.presentIds = new Set(files.map((file) => file.bare));
  for (const bare of runtime.presentIds) {
    const rec = state.sessions[bare] ?? findRecord(state, bare);
    if (rec !== undefined && rec.seeded !== true) {
      rec.seeded = true;
      runtime.dirty = true;
    }
  }
  markMissing(state);
  runtime.sweeps += 1;
}

// ---------------------------------------------------------------------------
// Live feed
// ---------------------------------------------------------------------------

function applySample(state, id, turn, step, buckets, at) {
  const rec = recordFor(state, id);
  const last = rec.last;
  const sameStep = last !== null && typeof last === "object" && last.turn === turn && last.step === step;
  if (sameStep && bucketsEqual(last.buckets, buckets)) return;
  const sampleCost = costOf(buckets, rec.model, at);
  if (sameStep) {
    // Retried or re-settled step: the newest sample replaces the earlier one.
    subtractBuckets(rec.totals, last.buckets);
    rec.cost = Math.max(0, rec.cost - numberOr(rec.lastCost));
    const day = rec.days[dayKey(rec.lastAt ?? at)];
    if (day !== undefined) {
      day.input -= last.buckets.input;
      day.cacheRead -= last.buckets.cacheRead;
      day.cacheWrite -= last.buckets.cacheWrite;
      day.output -= last.buckets.output;
      day.tokens = day.input + day.cacheRead + day.cacheWrite + day.output;
      day.requests = Math.max(0, day.requests - 1);
      day.cost = Math.max(0, numberOr(day.cost) - numberOr(rec.lastCost));
    }
  } else {
    rec.steps += 1;
    if (last === null || last.turn !== turn) rec.turns += 1;
  }
  addBuckets(rec.totals, buckets);
  addToDay(rec, at, buckets, 1);
  const today = rec.days[dayKey(at)];
  if (today !== undefined) today.cost = numberOr(today.cost) + sampleCost;
  rec.last = { turn, step, buckets };
  rec.cost += sampleCost;
  rec.lastCost = sampleCost;
  rec.lastAt = at;
  rec.lastSeenAt = Math.max(rec.lastSeenAt, at);
  scheduleWrite();
}

function handleSessionEvent(session, event) {
  if (event === null || typeof event !== "object") return;
  const id = session?.id;
  if (typeof id !== "string") return;
  const cfg = runtime.config;
  if (!cfg.includeSubagents && session?.header?.parent !== undefined) return;
  const header = session?.header;
  ensureState()
    .then((state) => {
      // Lineage is cheap to keep current while the Session is live: the header
      // is already in hand, and the projection cache does not carry it.
      const known = state.sessions[id];
      if (known !== undefined) rememberLineage(known, header);
      if (event.type === "session/title") {
        const title = event.data?.title;
        if (typeof title === "string" && title !== "") {
          const rec = recordFor(state, id);
          rememberLineage(rec, header);
          if (rec.title !== title) {
            rec.title = title;
            scheduleWrite();
          }
        }
        return;
      }
      if (event.type === "request/header") {
        const requestHeader = event.data?.header;
        const model = requestHeader?.model;
        if (typeof model === "string" && model !== "") {
          const rec = recordFor(state, id);
          if (rec.model !== model) {
            rec.model = model;
            if (typeof requestHeader?.provider === "string") rec.provider = requestHeader.provider;
            scheduleWrite();
          }
        }
        return;
      }
      if (event.type !== "assistant/message") return;
      const usage = event.data?.usage;
      if (usage === null || typeof usage !== "object") return;
      const seq = numberOr(event.seq, -1);
      const rec = recordFor(state, id);
      rememberLineage(rec, header);
      if (seq >= 0 && rec.foldedThroughSeq >= seq) return;
      const turn = numberOr(event.data?.turn);
      const step = numberOr(event.data?.step);
      applySample(state, id, turn, step, bucketsOfUsage(usage), Date.now());
    })
    .catch((error) => runtime.ctx?.logger?.warn?.("[dsh-usage-ledger] live sample failed:", error));
}

/** Copy the live Session header's lineage onto a record that lacks it. */
function rememberLineage(record, header) {
  if (header === undefined || header === null) return;
  const parent = typeof header.parentSession === "string" ? normalizeId(header.parentSession) : "";
  if (record.parent === parent) return;
  record.parent = parent;
  record.origin = typeof header.origin === "string" ? header.origin : "";
  scheduleWrite();
}

// ---------------------------------------------------------------------------
// Archive state, deletion, and this plugin's own recycle bin
// ---------------------------------------------------------------------------

function refuse(code, extra) {
  return { ok: false, error: code, ...(extra ?? {}) };
}

function billedOf(buckets) {
  return buckets.input + buckets.cacheRead + buckets.cacheWrite + buckets.output;
}

function registryOf(ctx) {
  try {
    const service = ctx?.get?.("workspaceRegistry");
    if (service !== undefined && service !== null) return service;
  } catch {
    // Fall through to the absent-service answer.
  }
  return undefined;
}

/** The archived id set as the registry sees it, with the store file as a fallback. */
async function archivedIdSet() {
  const registry = runtime.registry;
  const fromRegistry = registry?.archivedSessionIds;
  if (Array.isArray(fromRegistry)) return { ids: new Set(fromRegistry.map(normalizeId)), source: "registry" };
  try {
    const parsed = JSON.parse(await readFile(workspaceStoreFile(), "utf8"));
    const ids = parsed?.global?.archivedSessionIds;
    if (Array.isArray(ids)) return { ids: new Set(ids.map(normalizeId)), source: "store" };
  } catch {
    // No registry store is a profile without workspaces; nothing is archived.
  }
  return { ids: new Set(), source: "none" };
}

function findRecord(state, rawId) {
  for (const candidate of idCandidates(rawId)) {
    const record = state.sessions[candidate];
    if (record !== undefined) return record;
  }
  const wanted = normalizeId(rawId);
  for (const record of Object.values(state.sessions)) {
    if (normalizeId(record.id) === wanted) return record;
  }
  return undefined;
}

/** Artifact directories of one session, matched on the decoded directory name. */
async function locateArtifactDirs(rawId) {
  const wanted = new Set(idCandidates(rawId).map((id) => normalizeId(id).toLowerCase()));
  const found = [];
  let buckets;
  try {
    buckets = await readdir(sessionsRoot(), { withFileTypes: true });
  } catch {
    return found;
  }
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) continue;
    const directory = join(sessionsRoot(), bucket.name);
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!wanted.has(normalizeId(decodeSegment(entry.name)).toLowerCase())) continue;
      found.push(join(directory, entry.name));
    }
  }
  return found;
}

/** One pass over the sessions root: normalized id → artifact directory. */
async function sessionDirIndex() {
  const index = new Map();
  let buckets;
  try {
    buckets = await readdir(sessionsRoot(), { withFileTypes: true });
  } catch {
    return index;
  }
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) continue;
    const directory = join(sessionsRoot(), bucket.name);
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      index.set(normalizeId(decodeSegment(entry.name)).toLowerCase(), join(directory, entry.name));
    }
  }
  return index;
}

/**
 * The durable session header — the first frame of the log, which carries
 * `parentSession` and `origin`. The projection cache does not keep them, and the
 * first frame is tiny, so only that frame is decompressed.
 */
async function readSessionHeader(directory) {
  if (directory === undefined) return null;
  if (typeof zlib.zstdDecompressSync !== "function") return null;
  const file = join(directory, "session.v4.jsonl.zstd");
  let buffer;
  try {
    buffer = await readFile(file);
  } catch {
    return null;
  }
  try {
    const text = zlib.zstdDecompressSync(buffer).toString("utf8");
    const firstLine = text.split("\n", 1)[0].trim();
    if (firstLine === "") return null;
    return JSON.parse(firstLine);
  } catch {
    return null;
  }
}

function isRunning(rawId) {
  for (const candidate of idCandidates(rawId)) {
    try {
      if (runtime.ctx?.agents?.get?.(candidate)?.status === "running") return true;
    } catch {
      // An unresolvable agent read is not evidence of a running session.
    }
  }
  return false;
}

/** Whether the host still holds the Session in memory (a delete would leave a ghost row). */
function isHeldByHost(rawId) {
  for (const candidate of idCandidates(rawId)) {
    try {
      if (runtime.ctx?.sessions?.get?.(candidate) !== undefined) return true;
    } catch {
      // A throwing store read is not evidence of a live session.
    }
  }
  return false;
}

/** Ancestor ids of one live agent, from the durable header chain. */
function lineageOf(ctx, agent) {
  const chain = [];
  const seen = new Set();
  let header = agent?.session?.header;
  while (header !== undefined && header !== null && !seen.has(header.id)) {
    chain.push(header.id);
    seen.add(header.id);
    if (header.origin !== "subagent" || header.parentSession === undefined) break;
    const parent = ctx.sessions?.get?.(header.parentSession);
    if (parent === undefined || parent === null) {
      chain.push(header.parentSession);
      break;
    }
    header = parent.header;
  }
  return chain;
}

/** Running subagents that would be orphaned by deleting this session. */
function runningDescendants(rawId) {
  const wanted = normalizeId(rawId);
  const found = [];
  let agents;
  try {
    agents = runtime.ctx?.agents?.list?.() ?? [];
  } catch {
    return found;
  }
  for (const agent of agents) {
    if (agent?.status !== "running") continue;
    if (normalizeId(agent?.id ?? "") === wanted) continue;
    if (lineageOf(runtime.ctx, agent).some((id) => normalizeId(id) === wanted)) found.push(agent.id);
  }
  return found;
}

/**
 * Fold one session's latest projection cache into its ledger record.
 *
 * The live feed already counts every settled step, so this is a safety net: it
 * only ever grows the record, and never lowers a figure the live feed produced.
 */
async function refreshFromCache(rec) {
  let cacheFile = null;
  for (const candidate of idCandidates(rec.id)) {
    const path = join(projectionCacheDir(), candidate + ".json");
    try {
      await stat(path);
      cacheFile = path;
      break;
    } catch {
      continue;
    }
  }
  if (cacheFile === null) return false;
  let stats;
  try {
    stats = await stat(cacheFile);
  } catch {
    return false;
  }
  if (stats.size > CACHE_READ_LIMIT) return false;
  let document;
  try {
    document = JSON.parse(await readFile(cacheFile, "utf8"));
  } catch {
    return false;
  }
  const facts = readCacheFacts(rec.id, document, stats);
  if (facts === null) return false;
  if (billedOf(facts.totals) > billedOf(rec.totals)) {
    rec.totals = facts.totals;
    rec.days = facts.days;
    rec.last = facts.last;
    rec.cost = Math.max(numberOr(rec.cost), numberOr(facts.cost));
    rec.foldedThroughSeq = facts.foldedThroughSeq;
    rec.steps = Math.max(rec.steps, facts.steps);
    rec.turns = Math.max(rec.turns, facts.turns);
  }
  rec.title = facts.title || rec.title;
  rec.cwd = facts.cwd || rec.cwd;
  rec.model = facts.model || rec.model;
  rec.provider = facts.provider || rec.provider;
  if (facts.composition !== null) rec.composition = facts.composition;
  if (facts.skills.length > 0) rec.skills = facts.skills;
  rec.cost = Math.max(numberOr(rec.cost), numberOr(facts.cost));
  rec.toolCalls = Math.max(numberOr(rec.toolCalls), numberOr(facts.toolCalls));
  rec.toolsMs = Math.max(numberOr(rec.toolsMs), numberOr(facts.toolsMs));
  rec.modelCalls = Math.max(numberOr(rec.modelCalls), numberOr(facts.modelCalls));
  rec.wallMs = Math.max(numberOr(rec.wallMs), numberOr(facts.wallMs));
  rec.ttftMs = Math.max(numberOr(rec.ttftMs), numberOr(facts.ttftMs));
  rec.reasoningMs = Math.max(numberOr(rec.reasoningMs), numberOr(facts.reasoningMs));
  rec.textMs = Math.max(numberOr(rec.textMs), numberOr(facts.textMs));
  rec.toolArgMs = Math.max(numberOr(rec.toolArgMs), numberOr(facts.toolArgMs));
  return true;
}

/**
 * Archive or unarchive one session through the workspace registry.
 *
 * Archiving is the ordinary sidebar operation, not a ledger concept: it only
 * moves the session into the archive set, and the next snapshot picks the new
 * state up from the registry.
 */
async function setArchived(ctx, rawId, archived) {
  if (typeof rawId !== "string" || !SESSION_ID.test(rawId)) return refuse("invalid-session-id", { sessionId: rawId });
  const registry = runtime.registry;
  if (registry === undefined) return refuse("no-registry");
  const method = archived ? registry.archiveSession : registry.unarchiveSession;
  if (typeof method !== "function") return refuse("no-registry");
  const key = normalizeId(rawId);
  const current = Array.isArray(registry.archivedSessionIds) ? registry.archivedSessionIds : [];
  const entry = current.find((id) => normalizeId(id) === key);
  if (archived && entry !== undefined) return refuse("already-archived", { sessionId: key });
  if (!archived && entry === undefined) return refuse("not-archived", { sessionId: key });
  if (isRunning(key) || runningDescendants(key).length > 0) return refuse("session-running", { sessionId: key });
  // The registry files a Session under its canonical `session-<uuid>` id while
  // this ledger may hold either spelling; try every form instead of guessing.
  const candidates = [];
  if (entry !== undefined) candidates.push(entry);
  for (const candidate of idCandidates(rawId)) if (!candidates.includes(candidate)) candidates.push(candidate);
  let lastError = null;
  let accepted = null;
  for (const candidate of candidates) {
    try {
      await method.call(registry, candidate);
      accepted = candidate;
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError !== null) {
    // A registry write can land and still reject (a post-write broadcast, for
    // instance). Believe the state over the promise: if it changed as asked,
    // the operation succeeded from the user's point of view.
    const after = Array.isArray(registry.archivedSessionIds) ? registry.archivedSessionIds : [];
    if (after.some((id) => normalizeId(id) === key) === archived) {
      ctx.logger?.warn?.(`[dsh-usage-ledger] ${archived ? "archive" : "unarchive"} ${key} rejected after taking effect`);
      return { ok: true, sessionId: key, archived };
    }
    ctx.logger?.warn?.(`[dsh-usage-ledger] ${archived ? "archive" : "unarchive"} ${key} failed:`, lastError);
    return refuse("registry-failed", { sessionId: key, detail: String(lastError?.message ?? lastError).slice(0, 200) });
  }
  ctx.logger?.info?.(`[dsh-usage-ledger] ${archived ? "archived" : "unarchived"} ${key} as ${accepted}`);
  return { ok: true, sessionId: key, archived };
}

const deleting = new Set();

/**
 * Account balance for the header chip.
 *
 * `getBalance` is a network call, so it is cached for a minute and refreshed in
 * the background: a snapshot never waits on the platform.
 */
const balance = { at: 0, value: null, pending: false, error: null, service: "unknown" };

function summarizeBalance(result) {
  if (result === null || result === undefined || result.status !== "ready") return null;
  const wallets = Array.isArray(result.value) ? result.value : [];
  const wallet = wallets.find((entry) => entry.currency === "CNY") ?? wallets[0];
  if (wallet === undefined) return null;
  return { currency: wallet.currency, amount: wallet.balance };
}

/**
 * Balance through the API key.
 *
 * The platform account service reports `signed-out` on an API-key profile, so
 * the wallet is read the way the provider itself bills: resolve the configured
 * key, ask the provider's balance endpoint, and keep the number locally. The
 * key never leaves this machine except towards the provider it already calls.
 */
async function readApiKeyBalance(ctx) {
  const settings = ctx?.get?.("settings");
  const credentials = ctx?.get?.("credentials");
  if (typeof settings?.describe !== "function" || typeof credentials?.resolve !== "function") return null;

  let described;
  try {
    described = settings.describe({ redactSecrets: true });
  } catch {
    return null;
  }
  const byNs = new Map();
  for (const entry of Array.isArray(described) ? described : []) {
    if (entry === null || typeof entry !== "object" || typeof entry.ns !== "string") continue;
    if (entry.value === null || typeof entry.value !== "object" || byNs.has(entry.ns)) continue;
    byNs.set(entry.ns, entry.value);
  }

  const namespaces = [];
  try {
    const providers = ctx?.get?.("llm")?.listConfigurableProviders?.() ?? [];
    for (const provider of providers) {
      if (provider?.provider !== "deepseek-official") continue;
      const ns = provider?.settingsNs;
      if (typeof ns === "string" && ns !== "" && !namespaces.includes(ns)) namespaces.push(ns);
    }
  } catch {
    // A host without the list falls back to the well-known namespaces.
  }
  for (const ns of ["llm-deepseek", "web-deepseek-api", "web-search-deepseek"]) {
    if (!namespaces.includes(ns)) namespaces.push(ns);
  }

  for (const ns of namespaces) {
    const settingsValue = byNs.get(ns);
    if (settingsValue === undefined) continue;
    const envName = settingsValue.apiKeyEnv;
    if (typeof envName !== "string" || envName === "") continue;
    let apiKey = "";
    try {
      const resolved = await credentials.resolve(envName);
      apiKey = typeof resolved?.value === "string" ? resolved.value : "";
    } catch {
      continue;
    }
    if (apiKey === "") continue;

    let base = "https://api.deepseek.com";
    try {
      const url = new URL(settingsValue.baseURL);
      if (url.protocol === "https:" || url.protocol === "http:") base = url.origin;
    } catch {
      // Keep the public endpoint when the configured base is not a URL.
    }

    try {
      const response = await fetch(`${base}/user/balance`, {
        headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) continue;
      const payload = await response.json();
      const wallets = Array.isArray(payload?.balance_infos) ? payload.balance_infos : [];
      const parsed = [];
      for (const wallet of wallets) {
        const granted = Number(wallet?.granted_balance);
        const toppedUp = Number(wallet?.topped_up_balance);
        if (typeof wallet?.currency !== "string" || !Number.isFinite(granted) || !Number.isFinite(toppedUp)) continue;
        parsed.push({ currency: wallet.currency, total: granted + toppedUp, granted, toppedUp });
      }
      if (parsed.length > 0) return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

async function readBalance(ctx) {
  const account = ctx?.get?.("deepseekAccount");
  if (account !== undefined && typeof account.getBalance === "function") {
    try {
      const result = await account.getBalance({
        version: "0.1.0",
        locale: "zh",
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
      });
      const summarized = summarizeBalance(result);
      if (summarized !== null) return summarized;
    } catch {
      // Fall through to the API-key path.
    }
  }
  const wallets = await readApiKeyBalance(ctx);
  if (wallets === null || wallets.length === 0) return null;
  const wallet = wallets.find((entry) => entry.currency === "CNY") ?? wallets[0];
  return { currency: wallet.currency, amount: wallet.total.toFixed(2) };
}

function currentBalance(ctx) {
  if (!balance.pending && Date.now() - balance.at > 60000) {
    balance.pending = true;
    balance.at = Date.now();
    Promise.resolve()
      .then(() => readBalance(ctx))
      .then((value) => {
        balance.value = value;
      })
      .catch(() => {
        balance.value = null;
      })
      .finally(() => {
        balance.pending = false;
      });
  }
  return balance.value;
}

/** Move a file or directory, reporting rather than throwing on a vanished source. */
async function movePath(from, to) {
  await mkdir(dirname(to), { recursive: true });
  try {
    await rename(from, to);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    // A different volume cannot be renamed across; fall back to remove+skip.
    throw error;
  }
}

/**
 * Delete one archived session: snapshot, park its files, drop its archive index
 * entry, and keep its ledger record.
 */
async function deleteArchived(ctx, rawId) {
  if (typeof rawId !== "string" || !SESSION_ID.test(rawId)) return refuse("invalid-session-id", { sessionId: rawId });
  const state = await ensureState();
  const key = normalizeId(rawId);
  const rec = findRecord(state, rawId);
  if (rec === undefined) return refuse("not-tracked", { sessionId: key });
  if (rec.status === "deleted") return refuse("already-deleted", { sessionId: key });

  const registry = runtime.registry;
  if (registry === undefined || typeof registry.unarchiveSession !== "function") return refuse("no-registry");
  const archived = Array.isArray(registry.archivedSessionIds) ? registry.archivedSessionIds : [];
  const archivedId = archived.find((entry) => normalizeId(entry) === key);
  if (archivedId === undefined) return refuse("not-archived", { sessionId: key });

  if (isRunning(key)) return refuse("session-running", { sessionId: key });
  const descendants = runningDescendants(key);
  if (descendants.length > 0) return refuse("subagent-running", { sessionId: key, descendants });
  if (deleting.has(key)) return refuse("busy", { sessionId: key });
  deleting.add(key);
  try {
    // 1. Snapshot first: the cache is about to stop existing.
    await refreshFromCache(rec);

    // 2. Park the log directory and the cache document in this plugin's trash.
    const directories = await locateArtifactDirs(key);
    let entry = trashEntry(key);
    try {
      await stat(entry);
      entry = `${entry}-${Date.now()}`;
    } catch {
      // No earlier trash entry for this session.
    }
    await mkdir(entry, { recursive: true });
    const parked = { directories: 0, cache: false };
    const moved = [];
    try {
      for (const directory of directories) {
        const target = join(entry, `session-${parked.directories}`);
        if (await movePath(directory, target)) {
          moved.push({ from: target, to: directory });
          parked.directories += 1;
        }
      }
    } catch (error) {
      // Put back whatever already moved: a half-parked session with an intact
      // archive index would look archived while its log had vanished.
      for (const item of moved.reverse()) {
        try {
          await movePath(item.from, item.to);
        } catch {
          // The rollback is best effort; the log below is the operator's record.
        }
      }
      runtime.ctx?.logger?.warn?.(`[dsh-usage-ledger] could not park ${key}; rolled back:`, error);
      return refuse("park-failed", { sessionId: key });
    }
    for (const candidate of idCandidates(key)) {
      const cacheFile = join(projectionCacheDir(), candidate + ".json");
      try {
        if (await movePath(cacheFile, join(entry, "cache.json"))) {
          parked.cache = true;
          break;
        }
      } catch (error) {
        // The cache document is regenerable; the session log is what matters.
        runtime.ctx?.logger?.warn?.(`[dsh-usage-ledger] cache document not parked for ${key}:`, error);
        break;
      }
    }
    await writeFile(
      join(entry, "meta.json"),
      JSON.stringify({ sessionId: key, archivedId, title: rec.title, cwd: rec.cwd, deletedAt: Date.now(), parked }, null, 2),
      "utf8",
    );

    // 3. Drop the archive index entry — or defer it while the host still holds
    //    the Session, otherwise its summary would bring the row straight back.
    if (isHeldByHost(key)) {
      state.pendingIndexDrops = (Array.isArray(state.pendingIndexDrops) ? state.pendingIndexDrops : []).filter(
        (item) => normalizeId(item.sessionId) !== key,
      );
      state.pendingIndexDrops.push({ sessionId: archivedId, at: Date.now() });
    } else {
      await registry.unarchiveSession(archivedId);
      ctx.emit?.("api-session/removed", archivedId);
    }

    // 4. The ledger record stays, now frozen.
    rec.status = "deleted";
    rec.deletedAt = Date.now();
    runtime.presentIds?.delete(normalizeId(rec.id));
    runtime.dirty = true;
    await flushWrite();
    ctx.logger?.info?.(`[dsh-usage-ledger] deleted ${key}: ${parked.directories} dir(s), cache ${parked.cache ? "parked" : "absent"}`);
    return { ok: true, sessionId: key, parked };
  } finally {
    deleting.delete(key);
  }
}

/** Retry index drops that were deferred because the host still held the Session. */
async function retryPendingDrops(state) {
  const pending = Array.isArray(state.pendingIndexDrops) ? state.pendingIndexDrops : [];
  if (pending.length === 0) return;
  const registry = runtime.registry;
  if (registry === undefined || typeof registry.unarchiveSession !== "function") return;
  const keep = [];
  let changed = false;
  for (const item of pending) {
    if (isHeldByHost(item.sessionId)) {
      keep.push(item);
      continue;
    }
    try {
      await registry.unarchiveSession(item.sessionId);
      runtime.ctx?.emit?.("api-session/removed", item.sessionId);
      changed = true;
    } catch (error) {
      runtime.ctx?.logger?.warn?.("[dsh-usage-ledger] deferred index drop failed:", error);
      keep.push(item);
    }
  }
  if (keep.length !== pending.length) state.pendingIndexDrops = keep;
  if (changed) runtime.dirty = true;
}

/**
 * Stop listing a deleted session while keeping its spend in the totals.
 *
 * The record stays in the ledger — only its presentation changes from
 * `deleted` (one card) to `forgotten` (folded into a single summary row).
 */
async function forgetDeleted(ctx, rawId) {
  if (typeof rawId !== "string" || !SESSION_ID.test(rawId)) return refuse("invalid-session-id", { sessionId: rawId });
  const state = await ensureState();
  const key = normalizeId(rawId);
  const rec = findRecord(state, rawId);
  if (rec === undefined) return refuse("not-tracked", { sessionId: key });
  if (rec.status === "forgotten") return refuse("already-forgotten", { sessionId: key });
  if (rec.status !== "deleted") return refuse("not-deleted", { sessionId: key });
  rec.status = "forgotten";
  runtime.dirty = true;
  await flushWrite();
  ctx.logger?.info?.(`[dsh-usage-ledger] stopped listing ${key}`);
  return { ok: true, sessionId: key, forgotten: true };
}

/** Remove trash entries older than the configured retention. */
async function purgeTrash() {
  const days = numberOr(runtime.config.trashRetentionDays, 30);
  if (days <= 0) return 0;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let entries;
  try {
    entries = await readdir(trashRoot(), { withFileTypes: true });
  } catch {
    return 0;
  }
  let purged = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(trashRoot(), entry.name);
    try {
      const info = await stat(path);
      if (info.mtimeMs < cutoff) {
        await rm(path, { recursive: true, force: true });
        purged += 1;
      }
    } catch {
      continue;
    }
  }
  if (purged > 0) runtime.ctx?.logger?.info?.(`[dsh-usage-ledger] purged ${purged} expired trash entr(ies)`);
  return purged;
}

// ---------------------------------------------------------------------------
// Snapshot for the browser
// ---------------------------------------------------------------------------

function trimDays(rec, keepDays) {
  if (keepDays <= 0) return rec.days;
  const cutoff = dayKey(Date.now() - keepDays * 24 * 60 * 60 * 1000);
  const days = {};
  for (const [key, value] of Object.entries(rec.days)) if (key >= cutoff) days[key] = value;
  return days;
}

function snapshot(state, archivedSet) {
  const cfg = runtime.config;
  const archived = archivedSet ?? new Set();
  const summary = {
    active: { sessions: 0, totals: emptyBuckets() },
    archived: { sessions: 0, totals: emptyBuckets() },
    deleted: { sessions: 0, totals: emptyBuckets() },
    forgotten: { sessions: 0, totals: emptyBuckets() },
    current: { sessions: 0, totals: emptyBuckets() },
    total: { sessions: 0, totals: emptyBuckets() },
  };
  const sessions = [];
  for (const rec of Object.values(state.sessions)) {
    if (!cfg.includeSubagents && rec.subagent !== "") continue;
    const stateOf =
      rec.status === "deleted"
        ? "deleted"
        : rec.status === "forgotten"
          ? "forgotten"
          : archived.has(normalizeId(rec.id))
            ? "archived"
            : "active";
    summary[stateOf].sessions += 1;
    addBuckets(summary[stateOf].totals, rec.totals);
    summary.total.sessions += 1;
    addBuckets(summary.total.totals, rec.totals);
    if (stateOf !== "deleted" && stateOf !== "forgotten") {
      summary.current.sessions += 1;
      addBuckets(summary.current.totals, rec.totals);
    }
    sessions.push({
      id: rec.id,
      title: rec.title,
      cwd: rec.cwd,
      model: rec.model,
      provider: rec.provider,
      subagent: rec.subagent,
      totals: rec.totals,
      cost: numberOr(rec.cost),
      toolCalls: numberOr(rec.toolCalls),
      toolsMs: numberOr(rec.toolsMs),
      modelCalls: numberOr(rec.modelCalls),
      wallMs: numberOr(rec.wallMs),
      ttftMs: numberOr(rec.ttftMs),
      reasoningMs: numberOr(rec.reasoningMs),
      textMs: numberOr(rec.textMs),
      toolArgMs: numberOr(rec.toolArgMs),
      days: trimDays(rec, cfg.payloadDays),
      turns: rec.turns,
      steps: rec.steps,
      parent: rec.parent ?? "",
      origin: rec.origin ?? "",
      composition: rec.composition ?? null,
      skills: rec.skills ?? [],
      createdAt: rec.createdAt,
      firstSeenAt: rec.firstSeenAt,
      lastSeenAt: rec.lastSeenAt,
      state: stateOf,
      status: rec.status,
      deletedAt: rec.deletedAt,
    });
  }
  sessions.sort((left, right) => right.lastSeenAt - left.lastSeenAt);
  const registry = runtime.registry;
  return {
    ok: true,
    generatedAt: Date.now(),
    summary,
    sessions,
    canDelete: typeof registry?.unarchiveSession === "function",
    canArchive: typeof registry?.archiveSession === "function",
    usdToCny: numberOr(runtime.pricing?.usdToCny, 7.2),
    balance: currentBalance(runtime.ctx),
    // How many ids the archive index holds at all — including index-only rows
    // that have no cache document and therefore no usage to report.
    archivedIndex: archived.size,
    trashRoot: trashRoot(),
  };
}

// ---------------------------------------------------------------------------
// Request gate (loopback + same-origin, same rule dsh-archived applies)
// ---------------------------------------------------------------------------

function headerOf(request, key) {
  const value = request.headers?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function isLoopback(value) {
  const address = String(value || "").toLowerCase().replace(/^\[|\]$/g, "");
  return (
    address === "localhost" ||
    address === "localhost." ||
    address === "::1" ||
    address.startsWith("127.") ||
    address.startsWith("::ffff:127.")
  );
}

function originMatchesHost(origin, host) {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && isLoopback(url.hostname) && url.host === host;
  } catch {
    return false;
  }
}

function isTrusted(request) {
  const origin = headerOf(request, "origin");
  const host = headerOf(request, "host");
  const site = headerOf(request, "sec-fetch-site");
  const marker = headerOf(request, HEADER);
  const loopback = isLoopback(request.socket?.remoteAddress);
  const originOk = origin === undefined || originMatchesHost(origin, host);
  const siteOk = site === undefined || site === "same-origin";
  const provenSameOrigin = (origin !== undefined && originOk) || site === "same-origin";
  return loopback && Boolean(host) && originOk && siteOk && (marker === "1" || provenSameOrigin);
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve({});
      }
    });
    request.on("error", () => resolve({}));
  });
}

function route(ctx, path, method, handle) {
  return ctx.effect(
    () =>
      ctx.webServer.register({
        kind: "exact",
        path,
        handler: async (request, response) => {
          if (request.method !== method) {
            sendJson(response, 405, { ok: false, error: "method-not-allowed" });
            return;
          }
          if (!isTrusted(request)) {
            sendJson(response, 403, { ok: false, error: "forbidden" });
            return;
          }
          try {
            const body = method === "POST" ? await readBody(request) : {};
            sendJson(response, 200, await handle(request, body));
          } catch (error) {
            ctx.logger?.warn?.(`[dsh-usage-ledger] ${path} failed:`, error);
            sendJson(response, 500, { ok: false, error: "internal" });
          }
        },
      }),
    `dsh-usage-ledger: ${path}`,
  );
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const inject = ["webServer"];

export function apply(ctx, config) {
  runtime.ctx = ctx;
  runtime.config = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  const givenPricing = runtime.config.pricing ?? {};
  runtime.pricing = {
    ...DEFAULT_CONFIG.pricing,
    ...givenPricing,
    models: { ...DEFAULT_CONFIG.pricing.models, ...(givenPricing.models ?? {}) },
  };
  runtime.registry = registryOf(ctx);

  const work = async () => {
    currentBalance(ctx); // warm the header chip; the value lands in the background
    runtime.registry = runtime.registry ?? registryOf(ctx);
    const state = await ensureState();
    await sweep(state);
    await retryPendingDrops(state);
    await purgeTrash();
    scheduleWrite();
  };

  work().catch((error) => ctx.logger?.warn?.("[dsh-usage-ledger] startup failed:", error));

  ctx.on("session/event", (session, event) => handleSessionEvent(session, event));
  ctx.on("session/flush", () => flushWrite().catch((error) => ctx.logger?.warn?.("[dsh-usage-ledger] flush failed:", error)));

  const sweepMs = Math.max(1, numberOr(runtime.config.sweepMinutes, 10)) * 60 * 1000;
  const timer = setInterval(() => {
    work().catch((error) => ctx.logger?.warn?.("[dsh-usage-ledger] sweep failed:", error));
  }, sweepMs);
  timer.unref?.();
  ctx.effect(() => () => clearInterval(timer), "dsh-usage-ledger: sweep timer");

  route(ctx, `${API_BASE}/state`, "GET", async (request) => {
    const state = await ensureState();
    const url = new URL(request.url ?? API_BASE, "http://localhost");
    if (url.searchParams.get("scan") === "1") await sweep(state);
    const archived = await archivedIdSet();
    return snapshot(state, archived.ids);
  });

  route(ctx, `${API_BASE}/delete`, "POST", async (_request, body) => {
    const result = await deleteArchived(ctx, body?.sessionId);
    if (result.ok !== true) return result;
    const state = await ensureState();
    const archived = await archivedIdSet();
    return { ...result, state: snapshot(state, archived.ids) };
  });

  route(ctx, `${API_BASE}/archive`, "POST", async (_request, body) => {
    const result = await setArchived(ctx, body?.sessionId, true);
    if (result.ok !== true) return result;
    const state = await ensureState();
    const archived = await archivedIdSet();
    return { ...result, state: snapshot(state, archived.ids) };
  });

  route(ctx, `${API_BASE}/unarchive`, "POST", async (_request, body) => {
    const result = await setArchived(ctx, body?.sessionId, false);
    if (result.ok !== true) return result;
    const state = await ensureState();
    const archived = await archivedIdSet();
    return { ...result, state: snapshot(state, archived.ids) };
  });

  route(ctx, `${API_BASE}/forget`, "POST", async (_request, body) => {
    const result = await forgetDeleted(ctx, body?.sessionId);
    if (result.ok !== true) return result;
    const state = await ensureState();
    const archived = await archivedIdSet();
    return { ...result, state: snapshot(state, archived.ids) };
  });

  ctx.effect(
    () => () => {
      if (runtime.writeTimer !== null) {
        clearTimeout(runtime.writeTimer);
        runtime.writeTimer = null;
      }
      runtime.dirty = true;
      return flushWrite().catch(() => {});
    },
    "dsh-usage-ledger: final flush",
  );

  ctx.logger?.info?.("[dsh-usage-ledger] host loaded");
}
