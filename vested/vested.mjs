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

// One ISIN is often listed on several venues under differently worded names
// ("SPDR S&P 500 ETF Trust" and "State Street SPDR S&P 500 ETF"), so every
// spelling is kept and the closest one decides a match.
function loadTickerCandidatesFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return new Map();

  const map = new Map();
  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
    } else {
      candidates.push({ isin, names: [name] });
    }
  }

  return map;
}

// Legal-entity suffixes are shared by unrelated funds, so counting them would
// let a same-ticker instrument pass for the one being looked up.
const GENERIC_TOKENS = new Set([
  "LTD",
  "LIMITED",
  "PLC",
  "INC",
  "CORP",
  "CORPORATION",
  "LLC",
  "GMBH",
  "THE",
  "CO",
]);

function nameTokens(value) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token));
}

// Fund names are shortened inconsistently between sources ("Small Cap" against
// "Small-Ca"), so tokens are compared by prefix rather than equality.
function tokensMatch(left, right) {
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 2 && longer.startsWith(shorter);
}

function nameScore(scrapedName, candidateName) {
  const scraped = nameTokens(scrapedName);
  const candidate = nameTokens(candidateName);
  if (scraped.length === 0 || candidate.length === 0) return 0;

  const used = new Set();
  let matched = 0;
  for (const token of scraped) {
    const index = candidate.findIndex(
      (other, position) => !used.has(position) && tokensMatch(token, other)
    );
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }

  // Dividing by the longer name keeps a terser wording from outscoring the fund
  // actually named just by leaving words out.
  return matched / Math.max(scraped.length, candidate.length);
}

// Picks the wording of a candidate that reads closest to what was scraped.
function scoreCandidate(scrapedName, candidate) {
  let best = { score: 0, name: candidate.names[0] || "" };
  for (const name of candidate.names) {
    const score = nameScore(scrapedName, name);
    if (score > best.score) best = { score, name };
  }
  return best;
}

const MIN_NAME_SCORE = 0.5;

// Vested only carries US listings, so the US share class trading under the
// ticker is the fund on offer. Names are left to separate several US share
// classes, which is just as well: the instrument list abbreviates them past
// recognition ("VS PIONEER AST-BASD INC ETF").
function resolveIsin(tickerCandidates, ticker, scrapedName) {
  const candidates = (tickerCandidates.get(ticker) || []).filter((candidate) =>
    candidate.isin.startsWith("US")
  );
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return { isin: candidates[0].isin, name: candidates[0].names[0] };
  }

  const scored = candidates.map((candidate) => ({
    isin: candidate.isin,
    ...scoreCandidate(scrapedName, candidate),
  }));

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const shortlist = scored.filter((candidate) => candidate.score === bestScore);
  // Still tied: the name does not tell these share classes apart.
  return shortlist.length === 1 ? shortlist[0] : null;
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("vestedfinance.com")) ||
  (await browser.newPage());
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific instrument without
// throwing away progress already saved to parsed_json/vested-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
// Reading every instrument page takes long enough to be interrupted, so
// `--resume` picks up whatever the last run managed to save.
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

const tickerCandidates = loadTickerCandidatesFromCsv(csvPath);
const onlyTickers = new Set(positionalArgs.map(normalizeTicker).filter(Boolean));

const outputPath = "parsed_json/vested-parsed.json";
const results = [];
const seen = new Set();

// When resuming, load already-saved entries so earlier progress is preserved.
if ((resume || startIndex > 1) && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) seen.add(entry.ticker.toUpperCase());
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const APP_URL = "https://app.vestedfinance.com/en/global";
const INSTRUMENTS_URL = "https://vested-api-prod-ga.vestedfinance.com/instruments";
const OVERVIEW_BASE = "https://vested-woodpecker-prod-ga.vestedfinance.com/instrument";

// The search box filters in the browser rather than asking a server, which it
// can do because the app downloads every instrument it offers as it starts.
// That list is read off the wire, along with the credentials the app signs its
// calls with, since the instrument pages will not answer without them.
async function captureSession() {
  const client = await page.createCDPSession();
  await client.send("Network.enable");

  let body = null;
  let authorization = null;
  let csrf = null;
  const watched = new Set();

  client.on("Network.requestWillBeSent", (event) => {
    const url = event.request.url;
    if (!url.includes("vestedfinance.com")) return;

    const sent = event.request.headers || {};
    const value = sent.Authorization || sent.authorization;
    if (value) {
      authorization = value;
      csrf = sent["x-csrf-token"] || sent["X-Csrf-Token"] || csrf;
    }

    if (url.split("?")[0] === INSTRUMENTS_URL) watched.add(event.requestId);
  });

  client.on("Network.loadingFinished", async (event) => {
    if (!watched.has(event.requestId) || body) return;
    const fetched = await client
      .send("Network.getResponseBody", { requestId: event.requestId })
      .catch(() => null);
    if (fetched?.body) body = fetched.body;
  });

  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  for (let waited = 0; waited < 90000; waited += 250) {
    if (body && authorization) break;
    await sleep(250);
  }
  await client.detach().catch(() => {});

  if (!body || !authorization) {
    throw new Error(
      "Could not read the instrument list. Is app.vestedfinance.com signed in?"
    );
  }

  const instruments = JSON.parse(body);
  return {
    instruments: Array.isArray(instruments) ? instruments : [],
    // The token is checked; the CSRF value is not, but the call is refused when
    // the header is missing altogether.
    headers: { Authorization: authorization, "x-csrf-token": csrf || "" },
  };
}

const session = await captureSession();

const etfs = session.instruments
  .filter((instrument) => (instrument?.type || "").toLowerCase() === "etf")
  .map((instrument) => ({
    ticker: (instrument.symbol || "").toUpperCase(),
    name: (instrument.name || "").replace(/\s+/g, " ").trim(),
  }))
  .filter((instrument) => instrument.ticker)
  .filter((instrument) => onlyTickers.size === 0 || onlyTickers.has(instrument.ticker));

console.error(`${etfs.length} ETFs offered`);

// Only the funds the CSV can name are worth an instrument page.
const pending = [];
for (const [index, etf] of etfs.entries()) {
  if (index + 1 < startIndex) continue;
  if (seen.has(etf.ticker)) continue;

  const candidate = resolveIsin(tickerCandidates, etf.ticker, etf.name);
  if (!candidate) continue;

  pending.push({
    ticker: etf.ticker,
    listName: etf.name,
    csvName: candidate.name,
    isin: candidate.isin,
  });
}

console.error(`${pending.length} matched to an ISIN, reading their exchanges`);

// The exchange lives on the instrument page rather than in the list, so each
// fund costs a call. Roughly a thousand of them exhausts a quota that then
// refuses everything, whatever the pace, until several minutes have passed.
const BATCH_SIZE = 60;
const CONCURRENCY = 6;
const COOLDOWN_MS = 300000;
const MAX_ROUNDS = 12;

function requestBatch(batch) {
  return page.evaluate(
    async (base, headers, symbols, workers) => {
      const answers = new Array(symbols.length);
      let next = 0;

      const run = async () => {
        while (next < symbols.length) {
          const index = next;
          next += 1;

          try {
            const response = await fetch(`${base}/${symbols[index]}/overview`, { headers });
            if (!response.ok) {
              answers[index] = { status: response.status };
              continue;
            }
            const payload = await response.json();
            const data = payload?.data || {};
            answers[index] = {
              status: 200,
              name: data.name,
              type: data.type,
              exchange: data.exchange,
            };
          } catch (error) {
            answers[index] = { status: 0, error: String(error) };
          }
        }
      };

      await Promise.all(Array.from({ length: workers }, run));
      return answers;
    },
    OVERVIEW_BASE,
    session.headers,
    batch.map((entry) => entry.ticker),
    CONCURRENCY
  );
}

function save() {
  fs.mkdirSync("parsed_json", { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

// While the quota is exhausted the app cannot load its own instrument list
// either, so a refusal here says nothing about the credentials being held.
async function refreshSession() {
  const refreshed = await captureSession().catch(() => null);
  if (refreshed) session.headers = refreshed.headers;
}

// Funds whose page could not be read are kept for another round rather than
// dropped, since a refusal says nothing about the fund itself.
let queue = pending;
for (let round = 1; queue.length > 0 && round <= MAX_ROUNDS; round += 1) {
  const retry = [];

  if (round > 1) {
    console.error(`round ${round}: ${queue.length} left, waiting out the quota`);
    await sleep(COOLDOWN_MS);
    await refreshSession();
  }

  for (let offset = 0; offset < queue.length; offset += BATCH_SIZE) {
    const batch = queue.slice(offset, offset + BATCH_SIZE);

    let answers = await requestBatch(batch).catch(() => null);
    // A token that expired mid-run costs the whole batch, and a fresh one is
    // cheap next to reading these pages again.
    if (!answers || answers.some((answer) => answer?.status === 401)) {
      await sleep(1000);
      await refreshSession();
      answers = (await requestBatch(batch).catch(() => null)) || answers;
    }

    let answered = 0;
    for (const [index, entry] of batch.entries()) {
      const answer = (answers || [])[index];
      if (answer?.status !== 200) {
        retry.push(entry);
        continue;
      }

      answered += 1;
      if (seen.has(entry.ticker)) continue;
      seen.add(entry.ticker);

      // The instrument page spells the fund out ("iShares MSCI Brazil ETF")
      // where the list only carries a shorthand ("Brazil Capped ETF MSCI
      // iShares").
      const name =
        (answer.name || "").replace(/\s+/g, " ").trim() || entry.listName || entry.csvName;
      results.push({
        query: entry.ticker,
        ticker: entry.ticker,
        name,
        exchange: (answer.exchange || "").trim() || null,
        // Vested gives Indian investors US listings, quoted in dollars.
        currency: "USD",
        type: (answer.type || "ETF").toUpperCase(),
        raw: [entry.ticker, entry.listName, answer.exchange].filter(Boolean).join(" "),
        isin: entry.isin,
      });
    }

    save();
    console.error(
      `round ${round} [${offset + batch.length}/${queue.length}] ${batch[batch.length - 1].ticker}, ${results.length} saved, ${retry.length} to retry`
    );

    // Every refusal in a batch means the quota is spent, and it stays spent
    // until the calls stop for a while.
    if (answered === 0) {
      console.error("  quota spent, pausing");
      await sleep(COOLDOWN_MS);
      await refreshSession();
    }
  }

  queue = retry;
}

for (const entry of queue) {
  console.error(`  ${entry.ticker}: instrument page never answered`);
}

save();

console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
