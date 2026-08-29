import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Legal-entity and fund-wrapper words are shared by unrelated funds, so
// counting them would let any two ETFs look alike.
const GENERIC_TOKENS = new Set([
  "UCITS", "ETF", "ETC", "THE", "FUND", "FUNDS", "SHARES", "CLASS", "ACC", "DIST",
  "PLC", "ICAV", "LTD", "LIMITED", "SECURITIES", "INDEX",
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

function nameScore(left, right) {
  const scraped = Array.isArray(left) ? left : nameTokens(left);
  const candidate = Array.isArray(right) ? right : nameTokens(right);
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

  return matched / Math.max(scraped.length, candidate.length);
}

// Names only order the guesses here; the ISIN itself is settled by asking
// Bitpanda, so the index can afford to be rough as long as it is quick.
function loadCsv(csvPath) {
  const rows = [];
  const byTicker = new Map();
  const byToken = new Map();
  if (!fs.existsSync(csvPath)) return { rows, byTicker, byToken };

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    const row = { ticker, isin: toIsin(columns[isinIndex]), name, tokens: nameTokens(name) };
    const index = rows.push(row) - 1;

    const sameTicker = byTicker.get(ticker) || [];
    sameTicker.push(row);
    byTicker.set(ticker, sameTicker);

    for (const token of new Set(row.tokens)) {
      const holders = byToken.get(token) || [];
      holders.push(index);
      byToken.set(token, holders);
    }
  }

  return { rows, byTicker, byToken };
}

// For a fund whose ticker the CSV files under another venue's symbol, the
// wording is the only way back in. Rows sharing rare words with the name are
// gathered through the index so the whole file needn't be scored.
function candidatesByName(csv, tokens) {
  const shared = new Map();
  for (const token of new Set(tokens)) {
    const holders = csv.byToken.get(token) || [];
    // A word found all over the file says nothing about which fund this is.
    if (holders.length > 400) continue;
    for (const index of holders) shared.set(index, (shared.get(index) || 0) + 1);
  }

  return [...shared.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([index]) => csv.rows[index]);
}

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return new URL("../etfs.csv", import.meta.url);
})();

// Naming ISINs on the command line narrows a run down to those.
const onlyIsins = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(toIsin)
    .filter(Boolean)
);

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9222",
  defaultViewport: null,
});

const APP_URL = "https://app.bitpanda.com/?o=modal-buy&stepId=AssetSelection&assetFilter=ALL";
const GRAPHQL_URL = "https://api.bitpanda.com/graphql-gateway/graphql";

const pages = await browser.pages();
const page =
  pages.find((candidate) => candidate.url().includes("bitpanda.com")) || (await browser.newPage());
await page.bringToFront();

// The app holds its access token in memory rather than in storage, so it is
// read off the app's own traffic. Loading the page is what makes it talk.
let token = "";
const client = await page.createCDPSession();
await client.send("Network.enable");
client.on("Network.requestWillBeSent", (event) => {
  token = (event.request.headers || {})["access-token"] || token;
});

async function captureToken() {
  const stale = token;
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  for (let waited = 0; waited < 40000; waited += 250) {
    if (token && token !== stale) return true;
    await sleep(250);
  }
  return Boolean(token);
}

if (!(await captureToken())) {
  throw new Error(`Could not read Bitpanda's access token. Is ${APP_URL} signed in?`);
}

// Renewing the token means loading the page again, which cuts short every
// request already in flight from the same page. One renewal at a time, and
// everyone else waits for it rather than starting a second one.
let renewal = null;

function renewToken() {
  if (!renewal) renewal = captureToken().finally(() => (renewal = null));
  return renewal;
}

// The gateway starts answering 429 somewhere above ten requests a second and
// stays cross at it for a while, so requests are spaced out on purpose. A
// browser cannot read that 429 — the refusal carries no CORS headers, so the
// fetch fails outright — which is why any failure at all is treated as one.
const MIN_INTERVAL_MS = 400;
const COOLDOWN_MS = 60000;
let nextSlot = 0;

async function pace() {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_INTERVAL_MS;
  if (slot > now) await sleep(slot - now);
}

async function graphql(query, variables) {
  let lastStatus = 0;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (renewal) await renewal;
    await pace();

    let answer;
    try {
      answer = await page.evaluate(
        async (url, body, auth) => {
          try {
            const response = await fetch(url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-client-app": "webapp",
                "x-currency": "EUR",
                "apollographql-client-name": "graphQLGateway",
                "access-token": auth,
              },
              body: JSON.stringify(body),
            });
            return { status: response.status, payload: await response.json() };
          } catch (error) {
            return { status: 0, error: String(error) };
          }
        },
        GRAPHQL_URL,
        { operationName: "AssetList", query, variables },
        token
      );
    } catch {
      // The page navigated under the request; ask again once it has settled.
      await sleep(1000);
      continue;
    }

    if (answer.status === 200 && answer.payload?.data) return answer.payload.data;
    if (answer.status === 200 && answer.payload?.errors) {
      throw new Error(`Bitpanda refused the query: ${JSON.stringify(answer.payload.errors).slice(0, 300)}`);
    }

    lastStatus = answer.status;
    // The token lasts half an hour; anything else means the gateway has had
    // enough for now, and only time settles that.
    if (answer.status === 401 || answer.status === 403) await renewToken();
    else {
      console.error(`  gateway unhappy (${answer.status}), pausing a minute`);
      nextSlot = Date.now() + COOLDOWN_MS;
      await sleep(COOLDOWN_MS);
    }
  }

  throw new Error(`Bitpanda answered ${lastStatus} five times over.`);
}

// Both shapes are asked for at once so the same document serves funds and the
// commodity notes that sit beside them.
const ASSET_FIELDS = `
  pid
  name
  symbol
  __typename
  ... on EquityEtfAsset { wkn issuer legalName exchange { name } }
  ... on EquityEtcAsset { wkn issuer legalName exchange { name } }`;

const LIST_QUERY = `query AssetList($facets: [FacetOptionInput!], $first: Int, $after: String) {
  assets(
    input: {filters: {settings: {buyActive: true, includeIndexOnly: false, includeHiddenFromDiscovery: false}}, facets: $facets}
    first: $first
    after: $after
  ) {
    edges { node {${ASSET_FIELDS} } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const SEARCH_QUERY = `query AssetList($query: String, $first: Int) {
  assets(
    input: {filters: {settings: {buyActive: true, includeIndexOnly: false, includeHiddenFromDiscovery: false}}, query: $query}
    first: $first
  ) {
    edges { node { pid symbol __typename } }
  }
}`;

// Everything Bitpanda offers under a heading comes down a page at a time, so
// the shelf is read whole instead of a search per ISIN.
async function loadShelf(facet) {
  const nodes = [];
  let after = null;

  for (let round = 0; round < 100; round += 1) {
    const data = await graphql(LIST_QUERY, {
      facets: [{ key: "ASSET_FILTER_OPTION", values: [facet] }],
      first: 100,
      after,
    });

    const assets = data?.assets;
    nodes.push(...(assets?.edges || []).map((edge) => edge.node));
    if (!assets?.pageInfo?.hasNextPage) break;
    after = assets.pageInfo.endCursor;
  }

  return nodes;
}

// Bitpanda's own search reads ISINs, so an identifier can be put to it and the
// answer compared against the fund in hand. That turns a likeness of names
// into a plain yes or no, which matters where a ticker covers several share
// classes.
async function confirmIsin(asset, candidates) {
  for (const candidate of candidates) {
    const data = await graphql(SEARCH_QUERY, { query: candidate.isin, first: 5 });
    const hit = (data?.assets?.edges || []).some((edge) => edge.node?.pid === asset.pid);
    if (hit) return candidate;
  }
  return null;
}

// A few requests in flight keep the run moving while the pacing above decides
// the actual rate.
async function inParallel(items, width, worker) {
  const queue = [...items.entries()];
  const runners = Array.from({ length: width }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      await worker(next[1], next[0]);
    }
  });
  await Promise.all(runners);
}

const csv = loadCsv(csvPath);
console.error(`${csv.rows.length} listings in the CSV`);

const shelf = [];
for (const facet of ["ETF", "COMMODITY"]) {
  const nodes = await loadShelf(facet);
  console.error(`${nodes.length} instruments under ${facet}`);
  shelf.push(...nodes);
}

// Where a ticker names one fund and the wording agrees, the CSV has already
// answered and there is nothing to ask. Everything else — share classes
// sharing a ticker, wordings too far apart, tickers the CSV files under
// another venue's symbol — is put to Bitpanda, which keeps the questions in
// the hundreds rather than the thousands.
const CLEAR_NAME_SCORE = 0.5;
const MOST_TO_TRY = 3;

const results = [];
const claimed = new Set();
let unmatched = 0;
let asked = 0;
let done = 0;

await inParallel(shelf, 3, async (asset) => {
  const ticker = String(asset.symbol || "").toUpperCase();
  const wording = `${asset.legalName || ""} ${asset.name || ""}`;
  const tokens = nameTokens(wording);

  // The ticker names a handful of candidates; the wording orders them so the
  // first question asked is usually the last one needed.
  const onTicker = csv.byTicker.get(ticker) || [];
  const byName = onTicker.length > 0 ? [] : candidatesByName(csv, tokens);
  const candidates = [...onTicker, ...byName]
    .filter((row) => onlyIsins.size === 0 || onlyIsins.has(row.isin))
    .map((row) => ({ ...row, score: nameScore(tokens, row.tokens) }))
    .sort((left, right) => right.score - left.score);

  // Several venues file one fund under one ISIN, and asking twice is a waste.
  const seenIsins = new Set();
  const distinct = candidates.filter((row) => {
    if (seenIsins.has(row.isin)) return false;
    seenIsins.add(row.isin);
    return true;
  });

  const settled =
    onTicker.length > 0 && distinct.length === 1 && distinct[0].score >= CLEAR_NAME_SCORE;
  if (!settled && distinct.length > 0) asked += 1;

  const found = settled
    ? distinct[0]
    : distinct.length > 0
      ? await confirmIsin(asset, distinct.slice(0, MOST_TO_TRY))
      : null;

  done += 1;
  if (done % 250 === 0) console.error(`  ${done}/${shelf.length} settled, ${asked} put to Bitpanda`);

  if (!found) {
    unmatched += 1;
    return;
  }
  if (claimed.has(found.isin)) return;
  claimed.add(found.isin);

  const name = String(asset.legalName || asset.name || "").replace(/\s+/g, " ").trim();
  results.push({
    query: found.isin,
    ticker,
    name,
    exchange: (asset.exchange?.name || "").toUpperCase() || null,
    // The whole shelf is quoted on Quotrix in euros, which is also the currency
    // the API is asked for.
    currency: "EUR",
    type: asset.__typename === "EquityEtcAsset" ? "ETC" : "ETF",
    raw: [asset.name, ticker, asset.wkn, asset.issuer].filter(Boolean).join(" "),
    isin: found.isin,
  });
});

results.sort((left, right) => left.ticker.localeCompare(right.ticker));

fs.writeFileSync(new URL("bitpanda-parsed.json", import.meta.url), JSON.stringify(results, null, 2));

console.error(
  `${results.length} instruments matched, ${unmatched} the CSV does not carry ` +
    `(${asked} put to Bitpanda, the rest settled on the CSV alone)`
);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
