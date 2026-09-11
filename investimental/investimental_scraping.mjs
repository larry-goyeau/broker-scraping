// Investimental's tradable book, from the two platforms the portal opens:
//
//   Arena XT   https://investimental.arenaxt.ro/#/axt     (BVB)
//   Global     https://web.global.investimental.ro/       (US / EU, dxTrade)
//
// Both tabs must be signed in on Chrome :9222. Arena dumps the in-memory
// symbol box (message 105). Global walks /api/suggest from the watchlist
// search. `--source=arena`, `--source=global`, or both (default).
//
//   node investimental/investimental_scraping.mjs
//   node investimental/investimental_scraping.mjs --source=arena
//   node investimental/investimental_scraping.mjs --source=global --fresh

import puppeteer from "puppeteer-core";
import { stampRows } from "../accepted.mjs";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").replace(/\//g, ".").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function unwrap(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if (value.value != null) return unwrap(value.value);
    if (value.some != null) return unwrap(value.some);
  }
  return value;
}

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return fallback ? new URL(fallback, import.meta.url) : "";
}

function numberArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(\\d+)$`, "i"));
    if (match) return parseInt(match[1], 10);
  }
  return fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

function flag(name) {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.split("=").slice(1).join("=") : null;
}

// The terminal names venues by their MIC; Arena prints BVB; Global's suggest
// sometimes names a MIC in `opol` / additionalFields.
const MARKET_NAMES = {
  ARCX: "AMEX",
  BATS: "CBOE",
  BATY: "CBOE",
  EDGA: "CBOE",
  EDGX: "CBOE",
  XASE: "AMEX",
  XNAS: "NASDAQ",
  XNGS: "NASDAQ",
  XNMS: "NASDAQ",
  XNYS: "NYSE",
  XAMS: "EURONEXT",
  XBRU: "EURONEXT",
  XLIS: "EURONEXT",
  XPAR: "EURONEXT",
  XDUB: "EURONEXT",
  XETR: "XETR",
  XFRA: "XETR",
  XLON: "LSE",
  XMIL: "MIL",
  MTAA: "MIL",
  XSWX: "SIX",
  XVTX: "SIX",
  XWBO: "VIE",
  XMAD: "BME",
  XBSE: "BVB",
  REGS: "BVB",
  ORDB: "BVB",
  RGSP: "BVB",
  XRS1: "BVB",
  XRSI: "BVB",
  OOTC: "OTC",
  PINX: "OTC",
  OTCQB: "OTC",
  OTCQX: "OTC",
};

function mapExchange(raw) {
  const code = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return MARKET_NAMES[code] || raw || null;
}

function symbolRoot(symbol) {
  return String(symbol || "").replace(/[a-z]+$/, "").toUpperCase();
}

function listingCurrency(value) {
  const text = String(unwrap(value) || "").toUpperCase();
  const iso = text.match(/^[A-Z]{3}/);
  return iso ? iso[0] : text || null;
}

function loadTickerIndex(csvPath, kind, map = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return map;
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;
    const isin = toIsin(columns[isinIndex]);
    const exchange = mapExchange((columns[isinIndex - 1] || "").trim());
    const name = columns.slice(isinIndex + 1).join(",").trim();
    const list = map.get(ticker) || [];
    list.push({ isin, exchange, kind, name });
    map.set(ticker, list);
  }
  return map;
}

function isinFromCsv(ticker, exchange) {
  const list = tickerIndex.get(ticker) || [];
  if (list.length === 0) return "";
  const want = mapExchange(exchange);
  const same = want ? list.filter((row) => row.exchange === want) : [];
  const pick = same[0] || (list.length === 1 ? list[0] : null);
  return pick?.isin || "";
}

function loadIsinsFromCsv(csvPath, kind, map = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return map;
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const columns = line.split(",");
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (isinIndex < 0) continue;
    const isin = toIsin(columns[isinIndex]);
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!map.has(isin)) map.set(isin, { kind, names: [] });
    const entry = map.get(isin);
    if (name && !entry.names.includes(name)) entry.names.push(name);
  }
  return map;
}

function listingType(name, kind, platformType) {
  const blob = `${name || ""} ${kind || ""} ${platformType || ""}`;
  if (/\bETNs?\b/i.test(blob) || platformType === "ETN") return "ETN";
  if (/\bETCs?\b/i.test(blob) || platformType === "ETC") return "ETC";
  if (platformType === "ETF" || kind === "ETF" || /\bETFs?\b|\bUCITS\b/i.test(blob)) return "ETF";
  if (kind === "STOCK" || /^SHARE/i.test(platformType || "")) return "STOCK";
  return kind === "ETF" ? "ETF" : "STOCK";
}

const ARENA_KEEP = /^(SHARE|SHARE-ATS|SHARE-INT|FUND-UNITS)$/i;
const GLOBAL_KEEP = new Set(["STOCK", "ETF"]);

const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const keepEverything = hasFlag("all");
const fresh = hasFlag("fresh");

const wantEtfs = !stocksOnly;
const wantStocks = !etfsOnly;

const csvIsins = new Map();
const tickerIndex = new Map();
if (wantEtfs) {
  loadIsinsFromCsv(etfsCsvPath, "ETF", csvIsins);
  loadTickerIndex(etfsCsvPath, "ETF", tickerIndex);
}
if (wantStocks) {
  loadIsinsFromCsv(stocksCsvPath, "STOCK", csvIsins);
  loadTickerIndex(stocksCsvPath, "STOCK", tickerIndex);
}

const sourceFlag = String(flag("source") || "arena,global")
  .toLowerCase()
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const sources = new Set(sourceFlag.includes("all") ? ["arena", "global", "terminal"] : sourceFlag);

const outputPath = new URL("investimental-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

function entryKey(row) {
  return `${row.exchange}:${row.ticker}:${row.isin || row.query}`.toUpperCase();
}

function addRow(row) {
  if (!row?.ticker) return false;
  if ((row.type === "ETF" || row.type === "ETC" || row.type === "ETN") && !wantEtfs) return false;
  if (row.type === "STOCK" && !wantStocks) return false;
  const key = entryKey(row);
  if (seen.has(key)) return false;
  seen.add(key);
  results.push(row);
  return true;
}

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        if (!entry?.ticker || seen.has(entryKey(entry))) continue;
        results.push(entry);
        seen.add(entryKey(entry));
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

function save() {
  fs.writeFileSync(outputPath, JSON.stringify(stampRows(results), null, 2));
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

function findPage(match) {
  return browser.pages().then((pages) => pages.find((page) => match(page.url() || "")));
}

function typedRow({ ticker, name, exchange, currency, type, isin, raw }) {
  const id = toIsin(isin);
  const csv = id ? csvIsins.get(id) : null;
  const named = normalize(name) || csv?.names[0] || ticker;
  return {
    query: ticker,
    ticker,
    name: named,
    exchange: mapExchange(exchange) || exchange || null,
    currency: String(currency || "").toUpperCase() || null,
    type: listingType(named, csv?.kind || "", type),
    raw: raw || [ticker, named, exchange, currency].filter(Boolean).join(" "),
    isin: id || "",
  };
}

async function scrapeArena(page) {
  await page.bringToFront();
  const dumped = await page.evaluate(async () => {
    const openBox = () => {
      const nodes = [...document.querySelectorAll("a,button,div,span")];
      const hit = nodes.find((el) => {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        return (
          t.length < 80 &&
          /Caseta de Instrumente|Instrument Box|Deschideti Caseta|Open Instrument/i.test(t)
        );
      });
      if (hit) hit.click();
      return Boolean(hit);
    };

    if (!Array.isArray(window.__arenaSymbols) || window.__arenaSymbols.length < 50) {
      openBox();
      await new Promise((r) => setTimeout(r, 600));
      const orig = Array.prototype.filter;
      Array.prototype.filter = function (...args) {
        if (
          this.length > 80 &&
          this[0] &&
          typeof this[0] === "object" &&
          (this[0].isin || (this[0].code && this[0].name))
        ) {
          window.__arenaSymbols = Array.from(this);
        }
        return orig.apply(this, args);
      };
      const input = [...document.querySelectorAll("input")].find((el) =>
        /simbol|symbol|ISIN|Cautati/i.test(el.placeholder || "")
      );
      if (input) {
        input.focus();
        input.value = "A";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 500));
      }
      Array.prototype.filter = orig;
    }
    return Array.isArray(window.__arenaSymbols) ? window.__arenaSymbols : [];
  });

  if (dumped.length === 0) {
    throw new Error("Arena XT returned no symbols. Is investimental.arenaxt.ro signed in with the instrument box reachable?");
  }

  let added = 0;
  for (const item of dumped) {
    const platformType = String(item.type || "");
    if (!keepEverything && !ARENA_KEEP.test(platformType)) continue;
    const ticker = normalizeTicker(item.code || item.fqn);
    if (!ticker) continue;
    const currency = /^EUR-/i.test(platformType) ? "EUR" : "RON";
    if (
      addRow(
        typedRow({
          ticker,
          name: item.name,
          exchange: item.exchange || "BVB",
          currency,
          type: platformType,
          isin: item.isin,
          raw: item.full || [item.code, item.name, item.exchange, item.isin].filter(Boolean).join(" "),
        })
      )
    ) {
      added += 1;
    }
  }
  console.error(`arena: ${dumped.length} in the box, ${added} kept`);
  return added;
}

function flattenSuggests(node, out = []) {
  if (!node) return out;
  const suggests = node.suggests || node.root?.suggests;
  if (Array.isArray(suggests)) {
    for (const row of suggests) {
      const inst = row.instrument || row.instrumentTO || row;
      if (inst && (inst.symbol || inst.name || inst.description)) out.push(inst);
    }
  }
  const children = node.childNodes || node.root?.childNodes;
  if (Array.isArray(children)) {
    for (const child of children) flattenSuggests(child, out);
  }
  return out;
}

function globalExchange(inst) {
  const extra = unwrap(inst.additionalFields) || {};
  const raw =
    unwrap(inst.exchange) ||
    extra.exchange ||
    extra.mic ||
    extra.MIC ||
    extra.venue ||
    unwrap(inst.opol) ||
    "";
  const mapped = mapExchange(raw);
  if (mapped) return mapped;
  if (listingCurrency(inst.currency) === "USD") return "USA";
  return raw || null;
}

async function scrapeGlobal(page) {
  await page.bringToFront();
  const loggedOut = await page.evaluate(() =>
    [...document.querySelectorAll("input")].some((el) => el.type === "password")
  );
  if (loggedOut) {
    throw new Error("Investimental Global shows a login form. Sign in on web.global.investimental.ro.");
  }

  const client = await page.createCDPSession();
  await client.send("Network.enable");
  await client.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/suggest*", requestStage: "Request" }] });
  client.on("Fetch.requestPaused", async (event) => {
    if (event.request.method !== "POST") {
      await client.send("Fetch.continueRequest", { requestId: event.requestId }).catch(() => {});
      return;
    }
    let parsed = {};
    try {
      parsed = JSON.parse(event.request.postData || "{}");
    } catch {
      parsed = {};
    }
    parsed.currencies = ["EUR", "USD"];
    await client
      .send("Fetch.continueRequest", {
        requestId: event.requestId,
        postData: Buffer.from(JSON.stringify(parsed)).toString("base64"),
      })
      .catch(() => client.send("Fetch.continueRequest", { requestId: event.requestId }).catch(() => {}));
  });

  const pending = [];
  const watched = new Set();
  client.on("Network.requestWillBeSent", (event) => {
    if (event.request.url.includes("/api/suggest")) watched.add(event.requestId);
  });
  client.on("Network.loadingFinished", (event) => {
    if (watched.has(event.requestId)) pending.push(event.requestId);
  });

  async function waitSuggest(timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const id = pending.shift();
      if (id) {
        watched.delete(id);
        const fetched = await client.send("Network.getResponseBody", { requestId: id }).catch(() => null);
        if (!fetched?.body) continue;
        try {
          const parsed = JSON.parse(fetched.body);
          if (parsed.root || parsed.suggests) return parsed;
        } catch {
          continue;
        }
      }
      await sleep(100);
    }
    return null;
  }

  async function typePrefix(text) {
    pending.length = 0;
    const ok = await page.evaluate(async (value) => {
      const match = (i) =>
        i.type === "text" &&
        i.offsetWidth > 0 &&
        (/Add Symbol|Cautati|Search symbol/i.test(i.placeholder || "") ||
          /symbol/i.test(i.getAttribute("aria-label") || "") ||
          /input__input___third-party/.test(i.className));
      let el = [...document.querySelectorAll("input")].find(match);
      if (!el) {
        const tab = [...document.querySelectorAll("div,span,button")].find(
          (n) => (n.textContent || "").trim() === "Watchlist"
        );
        if (tab) tab.click();
        el = [...document.querySelectorAll("input")].find(match);
      }
      if (!el) return false;
      const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      el.focus();
      proto.set.call(el, "");
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      await new Promise((r) => setTimeout(r, 80));
      proto.set.call(el, value);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value.slice(-1), inputType: "insertText" }));
      return true;
    }, text);
    if (!ok) throw new Error("Investimental Global has no symbol search. Open a watchlist with Add Symbol.");
    return waitSuggest();
  }

  const prefixes = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"];
  let added = 0;
  let asked = 0;

  async function ingest(payload) {
    const instruments = flattenSuggests(payload);
    for (const inst of instruments) {
      const platformType = String(unwrap(inst.type) || "").toUpperCase();
      if (!keepEverything && !GLOBAL_KEEP.has(platformType)) continue;
      const ticker = symbolRoot(unwrap(inst.symbol) || unwrap(inst.name));
      if (!ticker) continue;
      const exchange = globalExchange(inst);
      const isin = toIsin(unwrap(inst.isin)) || isinFromCsv(ticker, exchange);
      if (
        addRow(
          typedRow({
            ticker,
            name: unwrap(inst.description) || unwrap(inst.name),
            exchange,
            currency: listingCurrency(inst.currency),
            type: platformType,
            isin,
            raw: [unwrap(inst.symbol) || unwrap(inst.name), unwrap(inst.description), unwrap(inst.exchange), unwrap(inst.currency)]
              .filter(Boolean)
              .join(" "),
          })
        )
      ) {
        added += 1;
      }
    }
    return { n: instruments.length, overflow: Boolean(payload?.overflow) };
  }

  const first = await typePrefix("A");
  if (!first) throw new Error("Global /api/suggest never answered. Is web.global.investimental.ro signed in?");
  const firstHit = await ingest(first);
  console.error(`global: probe A → ${firstHit.n} hits, overflow=${firstHit.overflow}`);

  const queue = prefixes.filter((p) => p !== "A").map((text) => ({ text }));
  asked = 1;

  while (queue.length) {
    const job = queue.shift();
    asked += 1;
    const payload = await typePrefix(job.text);
    if (!payload) {
      console.error(`global: ${job.text} unanswered`);
      continue;
    }
    const hit = await ingest(payload);
    if (hit.overflow && hit.n > 0 && job.text.length < 2) {
      for (const next of prefixes) queue.push({ text: job.text + next });
    }
    if (asked % 15 === 0) {
      save();
      console.error(`global: ${asked} prefixes, ${added} new, ${queue.length} queued`);
    }
  }

  await client.send("Fetch.disable").catch(() => {});
  await client.detach().catch(() => {});
  console.error(`global: ${asked} prefixes, ${added} new`);
  return added;
}

const pages = await browser.pages();

if (sources.has("arena")) {
  const arena =
    pages.find((p) => (p.url() || "").includes("investimental.arenaxt.ro")) ||
    (await browser.newPage());
  if (!(arena.url() || "").includes("investimental.arenaxt.ro")) {
    await arena.goto("https://investimental.arenaxt.ro/#/axt", { waitUntil: "domcontentloaded" });
    await sleep(3000);
  }
  await scrapeArena(arena);
  save();
}

if (sources.has("global")) {
  const global =
    pages.find((p) => (p.url() || "").includes("web.global.investimental.ro")) ||
    (await browser.newPage());
  if (!(global.url() || "").includes("web.global.investimental.ro")) {
    await global.goto("https://web.global.investimental.ro/", { waitUntil: "domcontentloaded" });
    await sleep(3000);
  }
  await scrapeGlobal(global);
  save();
}

if (sources.has("terminal")) {
  console.error("terminal source: use the previous getSymbolsBriefs walk (not this default)");
}

save();

const byType = new Map();
const byEx = new Map();
for (const row of results) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  byEx.set(row.exchange || "?", (byEx.get(row.exchange || "?") || 0) + 1);
}
console.error(
  `${results.length} listed (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);
console.error(
  `exchanges: ${[...byEx].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([e, n]) => `${e} ${n}`).join(", ")}`
);

await browser.disconnect();
