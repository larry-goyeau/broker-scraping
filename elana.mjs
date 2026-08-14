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

  const isins = [];
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const columns = line.split(",");
    // Supports both ticker,isin,name and ticker,exchange,isin,name.
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || columns.map(toIsin).find(Boolean);
    if (isin) isins.push(isin);
  }
  return isins;
}

function uniqueQueries(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

// The platform names a listing by the market's MIC; the CSV names the same
// markets its own way.
const EXCHANGE_NAMES = {
  xams: "EURONEXT",
  xbru: "EURONEXT",
  xdub: "EURONEXT",
  xlis: "EURONEXT",
  xpar: "EURONEXT",
  xosl: "EURONEXT",
  xetr: "XETR",
  xfra: "XETR",
  xlon: "LSE",
  xmil: "MIL",
  xswx: "SIX",
  xvtx: "SIX",
  xwbo: "VIE",
  xmad: "BME",
  xhel: "OMXHEX",
  xcse: "OMXCOP",
  xsto: "OMXSTO",
  xlux: "LUXSE",
  xwar: "GPW",
  xnas: "NASDAQ",
  xnys: "NYSE",
  arcx: "AMEX",
  bats: "CBOE",
  xasx: "ASX",
  xtse: "TSX",
  xhkg: "HKEX",
  xses: "SGX",
  xtks: "TSE",
};

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const TRADER_URL = "https://webtrader.elana.net/d/trading";

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("webtrader.elana.net")) ||
  (await browser.newPage());
if (!page.url().includes("webtrader.elana.net")) {
  await page.goto(TRADER_URL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific ISIN without
// throwing away progress already saved to parsed_json/elana-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const resume = process.argv.slice(2).some((arg) => /^--resume$/i.test(arg));
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return "etfs.csv";
})();

const cliQueries = positionalArgs.map(toIsin).filter(Boolean);
const queries = uniqueQueries(cliQueries.length > 0 ? cliQueries : loadIsinsFromCsv(csvPath));

const outputPath = "parsed_json/elana-parsed.json";
const results = [];
const seen = new Set();

if ((resume || startIndex > 1) && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.raw) seen.add(entry.raw.split(" ")[0].toUpperCase());
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const INSTRUMENTS_URL = "https://webtrader.elana.net/openapi/ref/v1/instruments/";

// Elana runs Saxo's platform, whose reference data the web trader reads over
// an API it signs with a token it rotates on its own. Reading that token off
// the app's traffic keeps the script in step with the rotation, and the client
// key travels with it because the search refuses to answer without one.
const session = { token: null, clientKey: null };
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  const url = event.request.url;
  if (!url.includes("/openapi/")) return;

  const sent = event.request.headers || {};
  const authorization = sent.Authorization || sent.authorization;
  if (authorization) session.token = authorization;

  const key = new URL(url).searchParams.get("ClientKey");
  if (key) session.clientKey = key;
});

// The app only signs a request when it has something to ask, so the search box
// is given something to look up.
async function nudge() {
  const input = await page
    .waitForSelector('input[placeholder*="Instrument search" i], input[placeholder*="search" i]', {
      timeout: 15000,
    })
    .catch(() => null);
  if (!input) return false;

  await input.click({ clickCount: 3 }).catch(() => {});
  await page.keyboard.press("Backspace").catch(() => {});
  await input.type("IE00B4L5Y983", { delay: 60 }).catch(() => {});
  return true;
}

async function captureSession() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (session.token && session.clientKey) return true;
    await nudge();

    for (let waited = 0; waited < 20000; waited += 250) {
      if (session.token && session.clientKey) return true;
      await sleep(250);
    }
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(5000);
  }
  return false;
}

if (!(await captureSession())) {
  throw new Error("Could not read the web trader's API token. Is webtrader.elana.net signed in?");
}
console.error("session captured");

const CONCURRENCY = 10;
const BATCH_SIZE = 200;

// Asking for the tradable info tells apart what is merely listed from what
// this account may actually buy.
function lookup(isins) {
  return page.evaluate(
    async (url, token, clientKey, terms, workers) => {
      const answers = new Array(terms.length);
      let next = 0;

      const run = async () => {
        while (next < terms.length) {
          const index = next;
          next += 1;

          const query = new URLSearchParams({
            $top: "100",
            $skip: "0",
            AssetTypes: "Etf,Etc,Etn",
            keywords: terms[index],
            ClientKey: clientKey,
            // Everything listed is asked for and the untradable sorted out
            // here, so that a fund this account cannot buy is left out on the
            // platform's own word rather than on a flag being honoured.
            includeNonTradable: "true",
            fieldGroups: "TradableInfo",
          });

          try {
            const response = await fetch(`${url}?${query}`, {
              headers: { Authorization: token, Accept: "application/json" },
            });
            if (!response.ok) {
              answers[index] = { status: response.status };
              continue;
            }
            const payload = await response.json();
            answers[index] = { status: 200, data: payload?.Data || [] };
          } catch (error) {
            answers[index] = { status: 0, error: String(error) };
          }
        }
      };

      await Promise.all(Array.from({ length: workers }, run));
      return answers;
    },
    INSTRUMENTS_URL,
    session.token,
    session.clientKey,
    isins,
    CONCURRENCY
  );
}

// The token lasts minutes rather than hours. The app renews it on its own, so
// a refusal is answered by waiting for the replacement to appear on the wire.
async function refreshToken(stale) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await nudge();
    for (let waited = 0; waited < 20000; waited += 250) {
      if (session.token && session.token !== stale) return true;
      await sleep(250);
    }
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(5000);
  }
  return false;
}

function save() {
  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

let refused = 0;
const failures = [];

function collect(isin, rows) {
  for (const row of rows) {
    // Keyword search matches more than the identifier, so the fund asked for
    // is the one whose identifier comes back.
    if ((row?.Isin || "").toUpperCase() !== isin) continue;
    if ((row.TradingStatus || "") !== "Tradable") {
      refused += 1;
      continue;
    }

    const symbol = row.Symbol || "";
    const [ticker, mic] = symbol.split(":");
    if (!ticker) continue;

    const key = symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      query: isin,
      ticker: ticker.toUpperCase(),
      name: (row.Description || "").replace(/\s+/g, " ").trim(),
      exchange: EXCHANGE_NAMES[(mic || "").toLowerCase()] || (mic || "").toLowerCase() || null,
      type: (row.AssetType || "ETF").toUpperCase(),
      raw: [symbol, row.Description, row.ExchangeName, row.CurrencyCode].filter(Boolean).join(" "),
      isin,
    });
  }
}

async function handle(batch) {
  let answers = await lookup(batch).catch(() => null);

  // A token that expired mid-batch costs the whole batch, and a fresh one is
  // cheaper than asking for all of it twice.
  if (!answers || answers.some((answer) => answer?.status === 401)) {
    await refreshToken(session.token);
    answers = (await lookup(batch).catch(() => null)) || answers;
  }

  for (const [index, isin] of batch.entries()) {
    const answer = (answers || [])[index];
    if (answer?.status !== 200) {
      failures.push(isin);
      continue;
    }
    collect(isin, answer.data || []);
  }
}

for (let offset = 0; offset < queries.length; offset += BATCH_SIZE) {
  const batch = queries.slice(offset, offset + BATCH_SIZE).filter((isin, index) => offset + index + 1 >= startIndex);
  if (batch.length === 0) continue;

  await handle(batch);
  save();
  console.error(
    `[${Math.min(offset + BATCH_SIZE, queries.length)}/${queries.length}] ${results.length} listings, ${failures.length} to retry`
  );
}

// A call that never answered says nothing about the fund, so it is asked again
// rather than being taken for an absence.
if (failures.length > 0) {
  console.error(`${failures.length} lookups failed, asking again`);
  const retries = failures.splice(0, failures.length);
  await refreshToken(session.token);
  for (let offset = 0; offset < retries.length; offset += BATCH_SIZE) {
    await handle(retries.slice(offset, offset + BATCH_SIZE));
    save();
  }
}

save();
console.error(
  `${results.length} tradable listings across ${new Set(results.map((entry) => entry.isin)).size} funds, ${refused} listings not tradable`
);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
