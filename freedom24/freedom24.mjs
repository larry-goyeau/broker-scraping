import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":")
    ? firstColumn.split(":").pop()
    : firstColumn;
  return (afterExchange || "").split(/[./]/)[0].trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// Freedom24 files an instrument under the market it trades on rather than the
// exchange, so a London listing is VUAA.EU and a New York one SPY.US.
const MARKET_SUFFIX = new Map(
  Object.entries({
    LSE: "EU",
    EURONEXT: "EU",
    XETR: "EU",
    SIX: "EU",
    VIE: "EU",
    AQUIS: "EU",
    BX: "EU",
    LSIN: "EU",
    LUXSE: "EU",
    GPW: "EU",
    BET: "EU",
    OMXCOP: "EU",
    OMXHEX: "EU",
    BME: "EU",
    MIL: "EU",
    LJSE: "EU",
    BVB: "EU",
    ATHEX: "EU",
    PSECZ: "EU",
    AMEX: "US",
    NASDAQ: "US",
    NYSE: "US",
    CBOE: "US",
  })
);

// Tickers are only guesses at what Freedom24 calls an instrument, so the ISINs
// it answers with are checked against the ones the CSV knows about.
function loadCsv(csvPath) {
  const candidates = new Set();
  const names = new Map();
  if (!fs.existsSync(csvPath)) return { candidates: [], names };

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (name && !names.has(isin)) names.set(isin, name);

    const ticker = normalizeTicker(columns[0]);
    const suffix = MARKET_SUFFIX.get((columns[1] || "").trim().toUpperCase());
    if (ticker && suffix) candidates.add(`${ticker}.${suffix}`);
  }

  return { candidates: [...candidates], names };
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("freedom24.com")) ||
  (await browser.newPage());
await page.bringToFront();
if (!page.url().includes("freedom24.com/terminal")) {
  await page.goto("https://freedom24.com/terminal", { waitUntil: "domcontentloaded" });
  await sleep(5000);
}

// `--start=N` (1-indexed) resumes from a given candidate, `--csv=PATH` points
// at another ETF list (defaults to etfs.csv).
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();

const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return new URL("../etfs.csv", import.meta.url);
})();

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const { candidates, names } = loadCsv(csvPath);
const wanted = positionalArgs.length > 0
  ? positionalArgs.map((arg) => arg.toUpperCase())
  : candidates;

const outputPath = new URL("../parsed_json/freedom24-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query) seen.add(entry.query.toUpperCase());
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

// Every terminal command is rate limited on its own budget, so one being
// refused says nothing about the next.
async function call(cmd, params) {
  return page.evaluate(
    async (command, args) => {
      const form = new FormData();
      form.append("q", JSON.stringify({ cmd: command, params: args }));
      const response = await fetch(`https://freedom24.com/api?cmd=${command}`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        return { error: text.slice(0, 120) };
      }
    },
    cmd,
    params
  );
}

async function callWithRetry(cmd, params, attempts = 6) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const answer = await call(cmd, params).catch(() => null);
    // "Request limit exceeded" arrives as a normal answer, and reading it as a
    // result would quietly turn a throttled call into an empty one.
    if (answer && !answer.error) return answer;
    if (attempt < attempts) await sleep(attempt * 15000);
  }
  return null;
}

const queue = wanted.filter((ticker, index) => index + 1 >= startIndex && !seen.has(ticker));
console.error(`${queue.length} candidate tickers to check`);

// One call answers for hundreds of tickers at a time, and it answers for
// tickers that do not exist too, so it doubles as the existence check.
const PERMISSION_BATCH = 300;
// Instrument details are not rate limited, so these can go out in parallel.
const DETAIL_CONCURRENCY = 12;

function readDetails(batch) {
  return page.evaluate(
    async (tickers, workers) => {
      const answers = new Array(tickers.length);
      let next = 0;

      const run = async () => {
        while (next < tickers.length) {
          const index = next;
          next += 1;
          try {
            const form = new FormData();
            form.append("q", JSON.stringify({ cmd: "getSecurityInfo", params: { ticker: tickers[index] } }));
            const response = await fetch("https://freedom24.com/api?cmd=getSecurityInfo", {
              method: "POST",
              body: form,
              credentials: "include",
            });
            answers[index] = await response.json();
          } catch (error) {
            answers[index] = { error: String(error) };
          }
        }
      };

      await Promise.all(Array.from({ length: workers }, run));
      return answers;
    },
    batch,
    DETAIL_CONCURRENCY
  );
}

function save() {
  fs.mkdirSync(new URL("../parsed_json/", import.meta.url), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

let checked = 0;
let tradable = 0;

for (let offset = 0; offset < queue.length; offset += PERMISSION_BATCH) {
  const candidates = queue.slice(offset, offset + PERMISSION_BATCH);
  checked += candidates.length;

  const permissions = await callWithRetry("checkAllowedTickerAndBanOnTrade", {
    checkBan: false,
    checkInstrumentUserAgreementLog: true,
    tickers: candidates,
  });

  if (!permissions) {
    console.error(`  [${offset + 1}-${offset + candidates.length}] permission check failed`);
    continue;
  }

  // "This instrument is not available to you" is what allowed = 0 looks like on
  // screen, so anything but 1 is dropped here.
  const batch = candidates.filter((ticker) => permissions[ticker]?.allowed === 1);
  tradable += batch.length;

  const answers = batch.length > 0 ? (await readDetails(batch).catch(() => null)) || [] : [];

  for (const [index, ticker] of batch.entries()) {
    const info = answers[index];
    if (!info || info.error) {
      console.error(`  ${ticker}: details unavailable`);
      continue;
    }

    const isin = toIsin(info.issue_nb);
    // A guessed ticker can land on a different instrument than the CSV row it
    // came from, so the fund is only kept when the ISIN it reports is one of
    // the ETFs being looked for.
    if (!isin || !names.has(isin)) continue;
    if (info.kind !== 7) continue;
    if (seen.has(ticker)) continue;
    seen.add(ticker);

    const name = (info.name || "").replace(/\s+/g, " ").trim() || names.get(isin);
    results.push({
      query: ticker,
      // Freedom24 writes the market into the ticker it trades under (VUAA.EU),
      // which the exchange field already says.
      ticker: (info.code_nm || "").trim() || ticker.split(".")[0],
      name,
      exchange: (info.codesub_nm || info.ltr || "").trim() || null,
      currency: info.x_curr || null,
      type: "ETF",
      raw: [info.c, info.name, info.codesub_nm, info.issue_nb].filter(Boolean).join(" "),
      isin,
    });
  }

  save();
  console.error(
    `[${checked}/${queue.length}] ${tradable} tradable, ${results.length} saved`
  );
}

save();
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
