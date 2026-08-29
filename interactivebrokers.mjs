import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function loadIsinsFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];

  const content = fs.readFileSync(csvPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => {
      // Supports both: ticker,isin,name and ticker,exchange,isin,name
      const cols = line.split(",");
      const fromKnownColumns = toIsin(cols[2]) || toIsin(cols[1]);
      if (fromKnownColumns) return fromKnownColumns;

      // Fallback: find the first ISIN-looking token in the row.
      for (const col of cols) {
        const isin = toIsin(col);
        if (isin) return isin;
      }
      return "";
    })
    .filter(Boolean);
}

function uniqueQueries(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

// The page is only there to lend its signed-in session to the calls below. Any
// of IBKR's regional domains will do: the calls are relative, so they follow
// whichever one the session was opened on.
const pages = await browser.pages();
const page =
  pages.find((candidate) => /interactivebrokers|ibkr/i.test(candidate.url())) ||
  (await browser.newPage());

if (!/interactivebrokers|ibkr/i.test(page.url())) {
  await page.goto("https://www.interactivebrokers.ie/portal/", {
    waitUntil: "domcontentloaded",
  });
  await sleep(5000);
}

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to parsed_json/interactivebrokers-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--start=(\d+)$/i);
    if (m) return Math.max(1, parseInt(m[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["IE00B44Z5B48", "IE00BK5BQT80", "IE00BFMXXD54"];
const cliQueries = positionalArgs.filter(Boolean).map(toIsin).filter(Boolean);
// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--csv=(.+)$/i);
    if (m) return m[1];
  }
  return "etfs.csv";
})();
const csvQueries = loadIsinsFromCsv(csvPath);
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);

const outputPath = "parsed_json/interactivebrokers-parsed.json";
const results = [];
const seen = new Set();

// The same ticker on the same venue can trade in more than one currency, so
// the currency belongs in the key that tells two listings apart.
const entryKey = (row) =>
  `${row.exchange}:${row.ticker}:${row.type}:${row.currency || ""}`.toUpperCase();

// When resuming, load already-saved entries so we don't overwrite them and so
// the dedup `seen` set knows about rows from earlier queries.
if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.exchange && entry?.ticker) seen.add(entryKey(entry));
      }
    }
  } catch {
    // Ignore parse errors -- treat as a fresh run.
  }
}

const API = "/portal.proxy/v1/portal";

async function api(path, options = {}) {
  return page.evaluate(
    async (base, target, opts) => {
      try {
        const response = await fetch(`${base}/${target}`, {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: opts.method || "GET",
          body: opts.body || undefined,
        });
        const text = await response.text();
        try {
          return { status: response.status, json: JSON.parse(text) };
        } catch {
          return { status: response.status, error: text.slice(0, 200) };
        }
      } catch (error) {
        return { error: String(error) };
      }
    },
    API,
    path,
    options
  );
}

// Keeps the Client Portal bridge awake; without it, later calls start failing.
async function tickle() {
  await api("tickle").catch(() => null);
}

// The lookup the portal's own search box runs. `pattern: true` is what makes an
// ISIN acceptable as the term; an exact search only answers to symbols.
async function searchIsin(isin) {
  const answer = await api("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol: isin, pattern: true, referrer: "" }),
  });
  // A signed-out session answers 401 with an empty body, or serves the login
  // page itself, so anything that is not JSON counts as no answer at all.
  if (answer.status === 401 || !answer.json) return null;
  // An ISIN that IBKR does not list answers `{ error: "No symbol found" }`.
  if (!Array.isArray(answer.json)) return [];
  // The search is keyed by ISIN, so every hit is a listing of that same fund.
  return answer.json.filter((hit) => hit?.conid && hit?.symbol);
}

// The search says nothing about the currency, which is what separates the two
// London lines of one fund. The contract details do.
async function readInfo(conid) {
  const answer = await api(`iserver/secdef/info?conid=${conid}`);
  return answer.json && !answer.json.error ? answer.json : null;
}

const RESTRICTED_NOTICE =
  /KID|Trading Restricted|not available|cannot be traded|Retail clients can trade packaged/i;

// Field 7183 is the order-ticket "Trading Restricted" notice (KID missing, etc.),
// which is the only place IBKR admits a listing it quotes cannot be bought.
// 7184 alone is not enough: tradable UCITS listings also come back with 7184=1.
//
// A snapshot answers empty until the subscription warms up, so it has to be
// asked repeatedly. Every listing of one fund is asked for at once, which keeps
// that waiting to once per ISIN rather than once per listing.
async function tradingRestricted(conids) {
  const pending = new Set(conids);
  const status = new Map();

  for (let attempt = 0; attempt < 10 && pending.size > 0; attempt += 1) {
    const answer = await api(
      `iserver/marketdata/snapshot?conids=${[...pending].join(",")}&fields=6509,7183,7184,31`
    );

    for (const row of Array.isArray(answer.json) ? answer.json : []) {
      const conid = String(row?.conid ?? "");
      if (!pending.has(conid)) continue;

      const notice = (row["7183"] || "").toString();
      if (notice) {
        status.set(conid, { restricted: RESTRICTED_NOTICE.test(notice), notice });
        pending.delete(conid);
      } else if (row["31"] !== undefined || row["6509"] !== undefined) {
        // Price or availability without a notice means the snapshot settled.
        status.set(conid, { restricted: false, notice: "" });
        pending.delete(conid);
      }
    }

    if (pending.size > 0) await sleep(300);
  }

  // A listing the snapshot never settled on is kept rather than guessed away.
  for (const conid of pending) status.set(conid, { restricted: false, notice: "" });
  return status;
}

function save() {
  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.error(`${queries.length} ISINs to check`);

let silences = 0;

for (const [queryIndex, query] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  if (queryIndex % 20 === 0) await tickle();
  console.error(`[${queryIndex + 1}/${queries.length}] ${query}`);

  const hits = await searchIsin(query);
  if (hits === null) {
    silences += 1;
    console.error("  no answer");
    if (silences >= 5) {
      throw new Error("IBKR stopped answering. Is the portal session still signed in?");
    }
    continue;
  }
  silences = 0;

  const restrictions = await tradingRestricted(hits.map((hit) => String(hit.conid)));

  for (const hit of hits) {
    const conid = String(hit.conid);
    if (restrictions.get(conid)?.restricted) {
      console.error(`  ${hit.symbol}@${hit.description}: Trading Restricted — skipped`);
      continue;
    }

    const info = (await readInfo(conid)) || {};

    const ticker = (info.ticker || hit.symbol || "").toUpperCase();
    const exchange = (info.listingExchange || hit.description || "").toUpperCase();
    const name = (info.companyName || hit.companyHeader || hit.companyName || "")
      .replace(/\s+/g, " ")
      .trim();
    const currency = info.currency || null;
    // Funds are carried as ordinary stock contracts on IBKR.
    const type = (info.secType || "STK").toUpperCase() === "STK" ? "ETF" : info.secType;
    if (!ticker || !exchange) continue;

    const row = { ticker, name, exchange, currency, type };
    const key = entryKey(row);
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      ...row,
      raw: [ticker, name, exchange, currency].filter(Boolean).join(" "),
      query,
      isin: query,
      conid,
    });
  }

  // Persist progress after every query so an interruption keeps prior work.
  save();
}

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
