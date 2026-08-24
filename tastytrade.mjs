import puppeteer from "puppeteer-core";
import fs from "node:fs";

function normalizeTicker(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";

  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  return (afterExchange || "").split(/[/]/)[0].trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// tastytrade names venues by their ISO code; the CSV files NYSE Arca and Cboe
// under the exchanges that own them.
const EXCHANGE_NAMES = {
  ARCX: "AMEX",
  BATS: "CBOE",
  XNAS: "NASDAQ",
  XNYS: "NYSE",
  OTC: "OTC",
};

// An American ISIN is its CUSIP with the country in front and a check digit
// behind, so the number tastytrade files a fund under names it outright and
// spares the guesswork of comparing wordings.
function isinFromCusip(cusip) {
  const body = `US${(cusip || "").trim().toUpperCase()}`;
  if (!/^US[0-9A-Z]{9}$/.test(body)) return "";

  const digits = [...body]
    .map((character) => (/[0-9]/.test(character) ? character : String(character.charCodeAt(0) - 55)))
    .join("");

  let sum = 0;
  let double = true;
  for (let position = digits.length - 1; position >= 0; position -= 1) {
    let digit = Number(digits[position]);
    if (double) digit = digit > 4 ? digit * 2 - 9 : digit * 2;
    sum += digit;
    double = !double;
  }

  return `${body}${(10 - (sum % 10)) % 10}`;
}

// One ISIN is often listed on several venues under differently worded names
// ("SPDR S&P 500 ETF Trust" and "State Street SPDR S&P 500 ETF"), so every
// spelling is kept and the closest one decides a match.
function loadCsv(csvPath) {
  const byTicker = new Map();
  const namesByIsin = new Map();
  if (!fs.existsSync(csvPath)) return { byTicker, namesByIsin };

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

    if (!namesByIsin.has(isin)) namesByIsin.set(isin, name);

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

  return { byTicker, namesByIsin };
}

// Legal-entity suffixes are shared by unrelated funds, so counting them would
// let a same-ticker instrument pass for the one being looked up.
const GENERIC_TOKENS = new Set([
  "LTD", "LIMITED", "PLC", "INC", "CORP", "CORPORATION", "LLC", "GMBH", "THE", "CO",
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

function scoreCandidate(scrapedName, candidate) {
  let best = { score: 0, name: candidate.names[0] || "" };
  for (const name of candidate.names) {
    const score = nameScore(scrapedName, name);
    if (score > best.score) best = { score, name };
  }
  return best;
}

const MIN_NAME_SCORE = 0.5;

// Only for the handful of funds tastytrade files without a CUSIP. It carries
// American listings alone, so the US share class under the ticker is the fund
// on offer, and where a ticker covers several the venue tells them apart
// before the name has to.
function resolveByName(byTicker, listing) {
  const american = (byTicker.get(listing.ticker) || []).filter((candidate) =>
    candidate.isin.startsWith("US")
  );
  if (american.length === 0) return null;

  const venue = EXCHANGE_NAMES[listing.exchange];
  const sameVenue = venue ? american.filter((candidate) => candidate.exchanges.has(venue)) : [];
  const candidates = sameVenue.length > 0 ? sameVenue : american;

  const scored = candidates.map((candidate) => ({
    isin: candidate.isin,
    ...scoreCandidate(listing.name, candidate),
  }));

  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const shortlist = scored.filter((candidate) => candidate.score === bestScore);
  // Still tied: the name does not tell these share classes apart.
  return shortlist.length === 1 ? shortlist[0] : null;
}

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return "etfs.csv";
})();

// Naming tickers on the command line narrows a run down to those, which is
// handy for checking one fund without waiting on the whole book.
const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter(Boolean)
);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const APP_URL = "https://my.tastytrade.com/app.html";

const pages = await browser.pages();
const page =
  pages.find((candidate) => /tastytrade|tastyworks/i.test(candidate.url())) ||
  (await browser.newPage());
if (!/tastytrade|tastyworks/i.test(page.url())) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
}
await page.bringToFront();

// The web platform keeps the session token it signs its calls with in its own
// tab's storage, so it can be read without disturbing the page.
const token = await page.evaluate(() => sessionStorage.getItem("tw-session-id") || "");
if (!token) {
  throw new Error(`No tastytrade session found. Sign in at ${APP_URL} and run this again.`);
}

// The instruments are asked for from inside the page: the request then carries
// the platform's own origin, which is what api.tastytrade.com expects.
async function fetchPage(offset) {
  const answer = await page.evaluate(
    async (url, authorization) => {
      try {
        const response = await fetch(url, {
          headers: { Authorization: authorization, Accept: "application/json" },
        });
        if (!response.ok) return { status: response.status };
        return { status: 200, body: await response.json() };
      } catch (error) {
        return { status: 0, error: String(error) };
      }
    },
    `https://api.tastytrade.com/instruments/equities/active?per-page=1000&page-offset=${offset}`,
    token
  );

  if (answer?.status !== 200) {
    throw new Error(`tastytrade answered ${answer?.status} for page ${offset}: ${answer?.error || ""}`);
  }
  return answer.body;
}

// Everything tastytrade trades in shares comes down a page at a time, so the
// offer is read whole instead of a search per ticker.
const instruments = [];
for (let offset = 0; offset < 100; offset += 1) {
  const body = await fetchPage(offset);
  const items = body?.data?.items || [];
  instruments.push(...items);

  const totalPages = body?.pagination?.["total-pages"] || 0;
  console.error(`  ${instruments.length} instruments read`);
  if (items.length === 0 || offset + 1 >= totalPages) break;
}

// tastytrade flags the funds among its shares itself, and marks the ones a
// position may only be closed out of.
const etfs = instruments.filter((instrument) => instrument["is-etf"] && instrument.active);
const tradable = etfs.filter((instrument) => !instrument["is-closing-only"]);
console.error(
  `${instruments.length} instruments offered, ${etfs.length} of them funds, ` +
    `${etfs.length - tradable.length} of those closing-only`
);

const { byTicker, namesByIsin } = loadCsv(csvPath);
console.error(`${byTicker.size} tickers in the CSV`);

const results = [];
const seen = new Set();
let byCusip = 0;
let unmatched = 0;

for (const instrument of tradable.sort((left, right) =>
  String(left.symbol).localeCompare(String(right.symbol))
)) {
  const ticker = String(instrument.symbol || "").toUpperCase();
  if (!ticker || seen.has(ticker)) continue;
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker)) continue;

  const exchange = String(instrument["listed-market"] || "").toUpperCase();
  const name = String(instrument.description || instrument["short-description"] || "")
    .replace(/\s+/g, " ")
    .trim();

  const fromCusip = isinFromCusip(instrument.cusip);
  const candidate = namesByIsin.has(fromCusip)
    ? { isin: fromCusip, name: namesByIsin.get(fromCusip) }
    : resolveByName(byTicker, { ticker, name, exchange });

  if (!candidate) {
    unmatched += 1;
    continue;
  }
  if (candidate.isin === fromCusip) byCusip += 1;

  seen.add(ticker);
  results.push({
    query: ticker,
    ticker,
    name: name || candidate.name,
    exchange: EXCHANGE_NAMES[exchange] || exchange || null,
    // The active equities endpoint covers US venues only, so every line quotes
    // in dollars.
    currency: "USD",
    type: "ETF",
    raw: [ticker, name, exchange].filter(Boolean).join(" "),
    isin: candidate.isin,
  });
}

fs.mkdirSync("parsed_json", { recursive: true });
fs.writeFileSync("parsed_json/tastytrade-parsed.json", JSON.stringify(results, null, 2));

console.error(
  `${results.length} funds matched, ${byCusip} of them by their CUSIP, ${unmatched} not in the CSV`
);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
