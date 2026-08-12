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

  return fs
    .readFileSync(csvPath, "utf8")
    .split(/\r?\n/)
    .map((line) => {
      const cols = line.split(",");
      const fromKnownColumns = toIsin(cols[2]) || toIsin(cols[1]);
      if (fromKnownColumns) return fromKnownColumns;
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

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("clientam.com")) ||
  (await browser.newPage());
await page.bringToFront();

if (!page.url().includes("clientam.com")) {
  await page.goto("https://www.clientam.com/portal/", {
    waitUntil: "domcontentloaded",
  });
  await sleep(5000);
}

// `--start=N` (1-indexed) resumes without wiping earlier progress.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return "etfs.csv";
})();

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const cliQueries = positionalArgs.map(toIsin).filter(Boolean);
const csvQueries = loadIsinsFromCsv(csvPath);
const queries = uniqueQueries(
  cliQueries.length > 0 ? cliQueries : csvQueries.length > 0 ? csvQueries : []
);

const outputPath = "parsed_json/clientam-parsed.json";
const results = [];
const seen = new Set();

if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        const key =
          entry?.exchange && entry?.ticker
            ? `${entry.exchange}:${entry.ticker}`.toUpperCase()
            : entry?.raw
              ? `RAW:${entry.raw.toUpperCase()}`
              : null;
        if (key) seen.add(key);
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const API = "/portal.proxy/v1/portal";

async function api(path, options = {}) {
  return page.evaluate(
    async (base, p, opts) => {
      const response = await fetch(`${base}/${p}`, {
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

async function searchIsin(isin) {
  const answer = await api("iserver/secdef/search", {
    method: "POST",
    body: JSON.stringify({ symbol: isin, pattern: true, referrer: "" }),
  });
  if (answer.error || !Array.isArray(answer.json)) return [];
  // Search is already keyed by ISIN, so every hit is a listing of that fund.
  return answer.json.filter((hit) => hit?.conid && hit?.symbol);
}

async function readInfo(conid) {
  const answer = await api(`iserver/secdef/info?conid=${conid}`);
  return answer.json && !answer.json.error ? answer.json : null;
}

// Field 7183 is the order-ticket "Trading Restricted" notice (KID missing, etc.).
// 7184 alone is not enough: tradable UCITS listings also come back with 7184=1.
async function tradingRestricted(conid) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const answer = await api(
      `iserver/marketdata/snapshot?conids=${conid}&fields=6509,7183,7184,31`
    );
    const row = Array.isArray(answer.json) ? answer.json[0] || {} : {};
    const notice = (row["7183"] || "").toString();
    if (notice) {
      return {
        restricted: /KID|Trading Restricted|not available|cannot be traded|Retail clients can trade packaged/i.test(
          notice
        ),
        notice,
      };
    }
    // Price or availability without a notice means the snapshot has settled.
    if (row["31"] !== undefined || row["6509"] !== undefined) {
      return { restricted: false, notice: "" };
    }
    await sleep(300);
  }
  return { restricted: false, notice: "" };
}

function save() {
  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.error(`${queries.length} ISINs to check`);

for (const [queryIndex, isin] of queries.entries()) {
  if (queryIndex + 1 < startIndex) continue;
  if (queryIndex % 20 === 0) await tickle();

  console.error(`[${queryIndex + 1}/${queries.length}] ${isin}`);

  let hits = [];
  try {
    hits = await searchIsin(isin);
  } catch (error) {
    console.error(`  search failed: ${error}`);
    continue;
  }

  if (hits.length === 0) {
    console.error("  no listings");
    continue;
  }

  for (const hit of hits) {
    const conid = String(hit.conid);
    const status = await tradingRestricted(conid);
    if (status.restricted) {
      console.error(
        `  ${hit.symbol}@${hit.description}: Trading Restricted — skipped`
      );
      continue;
    }

    const info = (await readInfo(conid)) || {};
    const ticker = (info.ticker || hit.symbol || "").toUpperCase();
    const exchange = (
      info.listingExchange ||
      hit.description ||
      ""
    ).toUpperCase();
    const name = (
      info.companyName ||
      hit.companyHeader ||
      hit.companyName ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
    const currency = info.currency || null;
    const type = (info.secType || "STK").toUpperCase() === "STK" ? "ETF" : info.secType;

    if (!ticker || !exchange) continue;

    const key = `${exchange}:${ticker}`.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query: isin,
      ticker,
      name,
      exchange,
      currency,
      type,
      raw: [ticker, name, exchange, currency].filter(Boolean).join(" "),
      isin,
      conid,
    });
  }

  save();
}

save();
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
