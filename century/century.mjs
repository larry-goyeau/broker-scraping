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
  return (afterExchange || "").split(/[/]/)[0].trim();
}

// Century quotes American products as "EZA.EQ" and its foreign ones under a
// house symbol carrying the market, "ISHARETECH.HK.EQ", which is no ticker at
// all — only the plain two-part form is read as one.
function symbolTicker(symbol) {
  const parts = (symbol || "").toUpperCase().split(".");
  if (parts.length !== 2 || parts[1] !== "EQ") return "";
  return /^[A-Z0-9]{1,6}$/.test(parts[0]) ? parts[0] : "";
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// Century names no venue, only the currency a product settles in, so the
// currency is what says which listings in the CSV a product could be. Its
// offer is American but for one Hong Kong fund; the rest is here so that a
// European listing, were one added, could not be matched against an American
// one that happens to share a ticker.
const CURRENCY_EXCHANGES = {
  USD: ["AMEX", "CBOE", "NASDAQ", "NYSE", "BATS", "ARCA"],
  HKD: ["HKEX"],
  GBP: ["LSE"],
  GBX: ["LSE"],
  EUR: ["EURONEXT", "XETR", "MIL", "BME", "VIE", "LUXSE"],
  CHF: ["SIX"],
  SEK: ["OMXSTO"],
  NOK: ["EURONEXT", "OSL"],
  DKK: ["OMXCOP"],
  JPY: ["TSE"],
};

// One ISIN is often listed on several venues under differently worded names
// ("SPDR S&P 500 ETF Trust" and "State Street SPDR S&P 500 ETF"), so every
// spelling is kept and the closest one decides a match.
function loadCsv(csvPath) {
  const byTicker = new Map();
  const rows = [];
  if (!fs.existsSync(csvPath)) return { byTicker, rows };

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const exchange = (columns[isinIndex - 1] || "").trim().toUpperCase();
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    rows.push({ ticker, isin, exchange, name });

    const candidates = byTicker.get(ticker) || [];
    byTicker.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
      if (exchange) existing.exchanges.add(exchange);
    } else {
      candidates.push({ isin, names: [name], exchanges: new Set(exchange ? [exchange] : []) });
    }
  }

  return { byTicker, rows };
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

function allowedExchanges(currency) {
  return CURRENCY_EXCHANGES[(currency || "").toUpperCase()] || null;
}

// Century's shares and its funds sit in one list and its own labelling is not
// to be trusted with the difference — it files the Energy Select Sector SPDR
// Fund under shares — so the CSV decides what counts as a fund and a product
// is kept only when a listing there answers to both its ticker and its name.
function resolveByTicker(byTicker, product) {
  const candidates = byTicker.get(product.ticker) || [];
  if (candidates.length === 0) return null;

  const venues = allowedExchanges(product.currency);
  const local = venues
    ? candidates.filter((candidate) => venues.some((venue) => candidate.exchanges.has(venue)))
    : candidates;
  if (local.length === 0) return null;

  const scored = local.map((candidate) => ({
    isin: candidate.isin,
    ...scoreCandidate(product.name, candidate),
  }));

  // American tickers belong to one instrument apiece, so a ticker Century
  // quotes that names a single US fund is that fund however the two sources
  // word it — Century writes SOXX as "iShares Semiconductor ETF" where the CSV
  // still calls it "iShares PHLX SOX Semiconductor Sector Index Fund".
  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  // Century lists American shares whose tickers are European funds' tickers
  // too — ESAB is a welding company here and an Irish bond fund there — so a
  // ticker alone is never enough, the name has to agree as well.
  if (bestScore < MIN_NAME_SCORE) return null;

  const shortlist = scored.filter((candidate) => candidate.score === bestScore);
  // Still tied: the name does not tell these share classes apart.
  return shortlist.length === 1 ? shortlist[0] : null;
}

// Every word of the shorter name has to appear in the longer one. Scoring
// alone is too forgiving where fund names differ by a single word: iShares MSCI
// South Africa and iShares MSCI South Korea share four words out of five.
function nameCovers(scrapedName, candidateName) {
  const scraped = nameTokens(scrapedName);
  const candidate = nameTokens(candidateName);
  if (scraped.length === 0 || candidate.length === 0) return false;

  const used = new Set();
  return scraped.every((token) => {
    const index = candidate.findIndex(
      (other, position) => !used.has(position) && tokensMatch(token, other)
    );
    if (index < 0) return false;
    used.add(index);
    return true;
  });
}

// A handful of products, the Hong Kong fund among them, are quoted under a
// house symbol with no ticker attached, so the name alone has to find them
// among the listings the product's currency allows.
function resolveByName(rows, product) {
  const venues = allowedExchanges(product.currency);
  if (!venues) return null;

  const covering = [];
  for (const row of rows) {
    if (!venues.includes(row.exchange)) continue;
    if (!nameCovers(product.name, row.name)) continue;
    if (!covering.some((found) => found.isin === row.isin)) covering.push(row);
  }

  // Either nothing is named that way or several funds are, and with no ticker
  // to separate them there is nothing left to choose on.
  if (covering.length !== 1) return null;
  return { isin: covering[0].isin, name: covering[0].name, ticker: covering[0].ticker };
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const APP_URL = "https://liveapp.century.ae/";

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("liveapp.century.ae")) ||
  (await browser.newPage());
if (!page.url().includes("liveapp.century.ae")) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific instrument without
// throwing away progress already saved to parsed_json/century-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return "etfs.csv";
})();

const { byTicker, rows: csvRows } = loadCsv(csvPath);
const onlyTickers = new Set(positionalArgs.map(normalizeTicker).filter(Boolean));

const outputPath = "parsed_json/century-parsed.json";
const results = [];
const seen = new Set();

if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query) seen.add(entry.query);
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

// The platform talks to its server over a socket in pipe-delimited commands,
// which the app keeps open and signed in; borrowing it avoids logging in again.
// An open socket is no promise of an answer, though: the server goes quiet on a
// session it has dropped, and the app only notices some seconds later and
// signs in afresh. So readiness is judged by asking it something.
async function isAnswering() {
  return page
    .evaluate(
      () =>
        new Promise((resolve) => {
          const socket = window.SERVERSocket;
          if (socket?.readyState !== 1 || !(window.map_productDescriptionNameKey?.size > 0)) {
            resolve(false);
            return;
          }
          const listener = (event) => {
            if (String(event.data || "").startsWith("GETACCOUNTSTATE")) finish(true);
          };
          const finish = (answered) => {
            clearTimeout(timer);
            socket.removeEventListener("message", listener);
            resolve(answered);
          };
          const timer = setTimeout(() => finish(false), 5000);
          socket.addEventListener("message", listener);
          socket.send("GETACCOUNTSTATE");
        })
    )
    .catch(() => false);
}

async function ensureSession() {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    // A session that has just dropped comes back on its own once the app has
    // reloaded and signed in again, which takes the better part of a minute.
    for (let waited = 0; waited < 90000; waited += 3000) {
      if (await isAnswering()) return true;
      await sleep(3000);
    }
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
    await sleep(10000);
  }
  return false;
}

if (!(await ensureSession())) {
  throw new Error("Century's trading session never answered. Is liveapp.century.ae signed in?");
}

// The server answers a whole batch of detail requests at once, so they are sent
// together and collected until every product has replied.
async function fetchDetails(products, timeout = 30000) {
  return page.evaluate(
    (list, wait) =>
      new Promise((resolve) => {
        const socket = window.SERVERSocket;
        const answers = {};
        const finish = () => {
          socket.removeEventListener("message", listener);
          resolve(answers);
        };
        const listener = (event) => {
          const text = String(event.data || "");
          if (!text.startsWith("GETPRODUCTDETAILS|")) return;
          try {
            const detail = JSON.parse(text.slice(text.indexOf("|") + 1))?.ProductDetail;
            if (detail?.Name) answers[detail.Name] = detail;
          } catch {
            // A half-formed frame tells us nothing; the timeout covers it.
          }
          if (Object.keys(answers).length >= list.length) finish();
        };
        socket.addEventListener("message", listener);
        for (const product of list) {
          socket.send(`GETPRODUCTDETAILS|${JSON.stringify({ Product: product })}`);
        }
        setTimeout(finish, wait);
      }),
    products,
    timeout
  );
}

// The app asks for the product list once at sign-in and keeps it, so it is read
// from there rather than asked for again — the server answers that particular
// command only the once per session.
const catalogue = await page.evaluate(() => [...(window.map_productDescriptionNameKey || new Map()).values()]);
if (!Array.isArray(catalogue) || catalogue.length === 0) {
  throw new Error("Century's product list was not there to read.");
}
console.error(`${catalogue.length} products quoted`);

const universe = catalogue.filter((product) => {
  if (onlyTickers.size === 0) return true;
  const ticker = (product.I || symbolTicker(product.N) || "").toUpperCase();
  return onlyTickers.has(ticker);
});

const BATCH_SIZE = 120;
const details = {};
for (let index = 0; index < universe.length; index += BATCH_SIZE) {
  const batch = universe.slice(index, index + BATCH_SIZE).map((product) => product.N);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answers = await fetchDetails(batch).catch(() => ({}));
    Object.assign(details, answers);
    if (Object.keys(answers).length >= batch.length) break;

    // A silent batch means the session went with it, so wait for the app to
    // come back before asking again.
    await ensureSession();
  }
}
console.error(`${Object.keys(details).length} of them described in full`);

let refused = 0;
let missing = 0;

for (const [index, product] of universe.entries()) {
  if (index + 1 < startIndex) continue;
  if (seen.has(product.N)) continue;

  const detail = details[product.N];
  if (!detail) {
    missing += 1;
    continue;
  }

  // "CLOSE ONLY" is the platform refusing to open a position in a product: it
  // can be sold if already held but not bought, so it is not on offer. "LONG
  // ONLY" is no such bar — it only forbids shorting, which is how a fund is
  // bought anyway.
  if ((detail.TradeMode || "").toUpperCase().includes("CLOSE")) {
    refused += 1;
    continue;
  }

  const candidate = {
    ticker: (detail.International || product.I || symbolTicker(product.N) || "").toUpperCase(),
    name: (detail.Description || product.D || "").replace(/\s+/g, " ").trim(),
    currency: detail.Currency || "",
  };

  const match = candidate.ticker
    ? resolveByTicker(byTicker, candidate)
    : resolveByName(csvRows, candidate);
  if (!match) continue;

  seen.add(product.N);
  results.push({
    query: product.N,
    ticker: candidate.ticker || match.ticker || "",
    name: candidate.name || match.name,
    currency: candidate.currency || null,
    type: "ETF",
    raw: [product.N, candidate.name, candidate.currency].filter(Boolean).join(" "),
    isin: match.isin,
  });
}

fs.mkdirSync("parsed_json", { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

console.error(`${results.length} funds matched, ${refused} close-only skipped${missing ? `, ${missing} undescribed` : ""}`);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
