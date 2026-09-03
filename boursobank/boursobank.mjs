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
      // Supports both: ticker,isin,name and ticker,exchange,isin,name.
      const columns = line.split(",");
      const fromKnownColumns = toIsin(columns[2]) || toIsin(columns[1]);
      if (fromKnownColumns) return fromKnownColumns;

      for (const column of columns) {
        const isin = toIsin(column);
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

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return new URL(fallback, import.meta.url);
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

// The feed names a share `STK`; the catalogues already speak STOCK.
function mapType(category) {
  const text = (category || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (text === "STK") return "STOCK";
  return text || "ETF";
}

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("tradingboard.boursobank.com")) ||
  (await browser.newPage());
await page.bringToFront();

// `--start=N` (1-indexed) lets a run resume from a specific query without
// throwing away progress already saved to boursobank-parsed.json.
const startIndex = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--start=(\d+)$/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
  }
  return 1;
})();
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const defaultQueries = ["IE00B4L5Y983", "US0378331005", "FR0000121014"];
const cliQueries = positionalArgs.filter(Boolean).map(toIsin).filter(Boolean);

// `--csv=PATH` the fund list (defaults to etfs.csv) and `--stocks-csv=PATH`
// the share list (defaults to stocks.csv). The trading board answers an ISIN
// with every listing it quotes — funds, notes and shares on the same feed.
// Spot crypto is quoted (CryptoCompare) but not tradable; BoursoBank sells
// crypto only as listed ETNs, which already sit in the fund file.
// `--funds-only` / `--etfs-only` answer for the funds; `--stocks-only` for
// the shares.
const csvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const fundsOnly = hasFlag("funds-only") || hasFlag("etfs-only");
const stocksOnly = hasFlag("stocks-only");

const fundQueries = stocksOnly ? [] : loadIsinsFromCsv(csvPath);
const stockQueries = fundsOnly ? [] : loadIsinsFromCsv(stocksCsvPath);
const csvQueries = [...fundQueries, ...stockQueries];
const rawQueries =
  cliQueries.length > 0
    ? cliQueries
    : csvQueries.length > 0
      ? csvQueries
      : defaultQueries;
const queries = uniqueQueries(rawQueries);
if (!cliQueries.length) {
  const fundCount = uniqueQueries(fundQueries).length;
  const shareCount = queries.length - fundCount;
  console.error(
    `${queries.length} ISINs to look up` +
      (stocksOnly ? " (shares)" : fundsOnly ? " (funds)" : ` (${fundCount} funds, ${shareCount} shares)`)
  );
}

const outputPath = new URL("boursobank-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

const entryKey = (query, row) =>
  `${query}:${row.ticker}:${row.exchange}:${row.currency || ""}`.toUpperCase();

// When resuming, load already-saved entries so earlier progress is preserved.
if (startIndex > 1 && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.query && entry?.ticker) seen.add(entryKey(entry.query, entry));
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

const BOARD_URL = "https://tradingboard.boursobank.com/";
const SEARCH_INPUT = 'input[name="valueSelection"]';

// The search box only ever asks for six suggestions; going straight to the feed
// it reads keeps the venues the dropdown would have hidden.
const RESULT_LIMIT = 50;

async function openBoard() {
  if (!page.url().includes("tradingboard.boursobank.com")) {
    await page.goto(BOARD_URL, { waitUntil: "domcontentloaded" });
  }
  await page.waitForSelector(SEARCH_INPUT, { timeout: 60000 });
}

// The feed URL carries a token tied to the signed-in session, so it has to be
// taken from a real search rather than assembled by hand.
async function captureSearchEndpoint() {
  await openBoard();

  const client = await page.createCDPSession();
  await client.send("Network.enable");

  const captured = new Promise((resolve) => {
    client.on("Network.requestWillBeSent", (event) => {
      if (event.request.url.includes("feedinstruments")) resolve(event.request.url);
    });
  });

  // Searches are cached per term, so a throwaway one guarantees a fresh request.
  const probe = `ZZ${Date.now().toString().slice(-8)}`;
  const input = await page.$(SEARCH_INPUT);
  await input.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await sleep(300);
  await page.keyboard.type(probe, { delay: 40 });

  // The timer has to be cleared explicitly, or it holds the process open long
  // after the endpoint has been seen.
  let timer;
  const expiry = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), 20000);
  });
  const endpoint = await Promise.race([captured, expiry]);
  clearTimeout(timer);
  await client.detach().catch(() => {});

  if (!endpoint) {
    throw new Error(
      "Could not capture the search endpoint. Is the trading board signed in?"
    );
  }

  await input.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  return endpoint;
}

let searchEndpoint = await captureSearchEndpoint();

// Queries run a few at a time from inside the page: the feed answers four in
// parallel as fast as it answers one, and more than that buys nothing.
const BATCH_SIZE = 40;
const CONCURRENCY = 4;

function requestBatch(batchQueries) {
  return page.evaluate(
    async (template, wanted, limit, workers) => {
      const answers = new Array(wanted.length);
      let next = 0;

      const run = async () => {
        while (next < wanted.length) {
          const index = next;
          next += 1;

          const url = new URL(template);
          url.searchParams.set("query", wanted[index]);
          url.searchParams.set("limit", String(limit));

          try {
            const response = await fetch(url.toString(), { credentials: "include" });
            if (!response.ok) {
              answers[index] = { status: response.status, count: 0, instruments: [] };
              continue;
            }

            const payload = await response.json();
            answers[index] = {
              status: 200,
              count: payload?.count ?? 0,
              // Each entry also carries quotes and trading links; only the
              // identifying fields need to cross back out of the page.
              instruments: (payload?.instruments || []).map((entry) => ({
                isin: entry.isin,
                code2: entry.code2,
                symbol: entry.symbol,
                label: entry.label,
                exchangeLabel: entry.exchangeLabel,
                currency: entry.currency,
                category: entry.category,
                tradable: entry.tradable,
                boursoramaTradable: entry.boursoramaTradable,
                eligibilite: entry.eligibilite,
              })),
            };
          } catch (error) {
            answers[index] = { status: 0, count: 0, instruments: [], error: String(error) };
          }
        }
      };

      await Promise.all(Array.from({ length: workers }, run));
      return answers;
    },
    searchEndpoint,
    batchQueries,
    RESULT_LIMIT,
    CONCURRENCY
  );
}

async function fetchBatch(batchQueries) {
  let answers = await requestBatch(batchQueries).catch(() => null);

  // A stale token or a dropped connection is worth one retry on a fresh
  // endpoint, since a whole batch would otherwise be recorded as missing.
  if (!answers || answers.some((answer) => answer?.status !== 200)) {
    await sleep(1000);
    searchEndpoint = await captureSearchEndpoint();
    const retried = await requestBatch(batchQueries).catch(() => null);
    if (retried) answers = retried;
  }

  return (answers || []).map((answer, index) => {
    if (answer?.status !== 200) {
      console.error(`  ${batchQueries[index]}: search failed (status ${answer?.status ?? "none"})`);
      return [];
    }
    if (answer.count > answer.instruments.length) {
      console.error(
        `  ${batchQueries[index]}: ${answer.count} listings, kept ${answer.instruments.length}`
      );
    }
    return answer.instruments;
  });
}

function parseInstrument(entry, query) {
  const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();

  // The feed matches whole ISINs exactly, and the payload repeats the ISIN it
  // matched, so anything else that comes back is not the instrument asked for.
  if (toIsin(entry?.isin) !== query) return null;

  // The board quotes many tapes. The order ticket still answers
  // "Cette valeur n'est pas disponible à l'achat" unless the listing is
  // eligible on a retail account: `AVIELUX` on the eligibility list.
  // `FR_TRADABLE` alone is not enough — the Amsterdam line of this UBS ETF
  // carries it, and the ticket refuses the order. OPCVM rows never qualify.
  const exchange = normalize(entry?.exchangeLabel);
  const tags = Array.isArray(entry?.eligibilite) ? entry.eligibilite : [];
  if (entry?.tradable !== true || !tags.includes("AVIELUX")) return null;
  if (!exchange || exchange === "OPCVM") return null;
  if (String(entry?.category || "").toUpperCase() === "FND") return null;

  const ticker = normalize(entry?.code2).toUpperCase();
  const name = normalize(entry?.label);
  if (!ticker || !name) return null;

  return {
    ticker,
    name,
    exchange,
    currency: normalize(entry?.currency).toUpperCase() || null,
    type: mapType(entry?.category),
    raw: [name, entry?.symbol, ticker, exchange].filter(Boolean).join(" "),
  };
}

function selectListings(instruments, query) {
  return instruments.map((entry) => parseInstrument(entry, query)).filter(Boolean);
}

const pending = queries.slice(startIndex - 1);

for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
  const batchQueries = pending.slice(offset, offset + BATCH_SIZE);
  const first = startIndex + offset;
  console.error(
    `[${first}-${first + batchQueries.length - 1}/${queries.length}] ${batchQueries[0]}…`
  );

  const batchInstruments = await fetchBatch(batchQueries);

  for (const [index, query] of batchQueries.entries()) {
    for (const row of selectListings(batchInstruments[index] || [], query)) {
      const key = entryKey(query, row);
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        query,
        ...row,
        isin: query,
      });
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`
);

await browser.disconnect();
