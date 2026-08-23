import crypto from "node:crypto";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// `--csv=PATH` overrides the default ETF list CSV (defaults to etfs.csv).
const csvPath = (() => {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--csv=(.+)$/i);
    if (match) return match[1];
  }
  return "etfs.csv";
})();

// The app key is issued per region and carries that region as a prefix, which
// is also what says which host will accept it. Signing against the wrong one
// answers "invalid credentials" rather than saying so.
const HOSTS = {
  sg: "api.webull.com.sg",
  us: "api.webull.com",
  hk: "api.webull.hk",
  jp: "api.webull.co.jp",
};

// Credentials belong outside the repository, so they are read from the
// environment or from a .env file that .gitignore keeps out.
function loadCredentials() {
  const fromFile = {};
  if (fs.existsSync(".env")) {
    for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match) fromFile[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }

  const appKey = process.env.WEBULL_APP_KEY || fromFile.WEBULL_APP_KEY || "";
  const appSecret = process.env.WEBULL_APP_SECRET || fromFile.WEBULL_APP_SECRET || "";
  if (!appKey || !appSecret) {
    throw new Error(
      "Set WEBULL_APP_KEY and WEBULL_APP_SECRET, in the environment or in a .env file."
    );
  }

  const region = (appKey.split(".")[0] || "").toLowerCase();
  const host = HOSTS[region];
  if (!host) throw new Error(`The app key names a region this script has no host for: ${region}`);
  return { appKey, appSecret, host };
}

const { appKey, appSecret, host } = loadCredentials();

// Webull signs the path, the query and the signing headers together, sorted by
// name, and hashes the body in separately. Documented at
// developer.webull.com/apis/docs/authentication/signature.
function signature({ path, query, body, timestamp, nonce }) {
  const parts = {
    ...query,
    "x-app-key": appKey,
    "x-timestamp": timestamp,
    "x-signature-algorithm": "HMAC-SHA1",
    "x-signature-version": "1.0",
    "x-signature-nonce": nonce,
    host,
  };

  const joined = Object.keys(parts)
    .sort()
    .map((name) => `${name}=${parts[name]}`)
    .join("&");
  const digest = body ? crypto.createHash("md5").update(body).digest("hex").toUpperCase() : "";
  const signed = body ? `${path}&${joined}&${digest}` : `${path}&${joined}`;

  return crypto
    .createHmac("sha1", `${appSecret}&`)
    .update(encodeURIComponent(signed))
    .digest("base64");
}

let accessToken = "";

async function api(method, path, { query = {}, payload } = {}) {
  const body = payload ? JSON.stringify(payload) : undefined;
  const search = new URLSearchParams(query).toString();
  const url = `https://${host}${path}${search ? `?${search}` : ""}`;

  // A page of a thousand instruments sometimes takes longer than Webull's own
  // patience, and a dropped call is worth asking again rather than losing the
  // run. A signature covers the timestamp it was made with, so each attempt is
  // signed afresh.
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const timestamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const nonce = crypto.randomUUID().replace(/-/g, "");

    const headers = {
      "x-app-key": appKey,
      "x-timestamp": timestamp,
      "x-signature": signature({ path, query, body, timestamp, nonce }),
      "x-signature-algorithm": "HMAC-SHA1",
      "x-signature-version": "1.0",
      "x-signature-nonce": nonce,
      "x-version": "v2",
      Accept: "application/json",
    };
    if (accessToken) headers["x-access-token"] = accessToken;
    if (body) headers["Content-Type"] = "application/json";

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(45000),
      });
      const text = await response.text();
      try {
        return { status: response.status, json: JSON.parse(text) };
      } catch {
        return { status: response.status, text };
      }
    } catch (error) {
      lastError = error;
      await sleep(2000 * (attempt + 1));
    }
  }

  throw lastError;
}

// A token outlives a run, so it is kept on disk and only replaced once the
// server stops accepting it. .gitignore keeps *.json out of the repository.
const TOKEN_FILE = ".webull-token.json";

function rememberedToken() {
  if (!fs.existsSync(TOKEN_FILE)) return "";
  try {
    const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
    return saved.appKey === appKey ? saved.token || "" : "";
  } catch {
    return "";
  }
}

async function tokenStatus(token) {
  const answer = await api("POST", "/auth/tokens/check", { payload: { token } });
  return answer.status === 200 ? answer.json?.status || "" : "";
}

// Two-factor accounts mint a token that only becomes usable once the code sent
// by SMS is typed into the Webull app, and the offer is five minutes wide.
async function authorise() {
  const remembered = rememberedToken();
  if (remembered && (await tokenStatus(remembered)) === "NORMAL") {
    accessToken = remembered;
    console.error("reusing the saved access token");
    return;
  }

  const created = await api("POST", "/auth/tokens/create");
  if (created.status !== 200 || !created.json?.token) {
    throw new Error(`Webull refused to create a token: ${JSON.stringify(created.json || created.text)}`);
  }

  const token = created.json.token;
  if (created.json.status === "NORMAL") {
    accessToken = token;
  } else {
    console.error(
      "Webull has texted a code to the phone on the account.\n" +
        "  Open the Webull app → Menu → Messages → OpenAPI Notifications → Check Now,\n" +
        "  type the code, and this run will carry on by itself. Five minutes are allowed."
    );

    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(5000);
      const status = await tokenStatus(token);
      if (status === "NORMAL") break;
      if (status === "EXPIRED" || status === "INVALID") {
        throw new Error(`The token went ${status} before it was verified.`);
      }
    }

    if ((await tokenStatus(token)) !== "NORMAL") {
      throw new Error("The token was never verified in the app.");
    }
    accessToken = token;
  }

  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ appKey, token: accessToken }, null, 2));
  console.error(`access token saved to ${TOKEN_FILE}`);
}

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

// Webull names a listing after the venue it is quoted on, in codes of its own:
// PSE is NYSE Arca under its old Pacific name, NMS and NAS are the two Nasdaq
// tiers, BAT is Cboe BZX, and the last five are rungs of the over-the-counter
// market. The CSV files each under the exchange that owns it.
const EXCHANGE_NAMES = {
  NMS: "NASDAQ",
  NAS: "NASDAQ",
  NSQ: "NASDAQ",
  NYSE: "NYSE",
  PSE: "AMEX",
  ASE: "AMEX",
  ARCA: "AMEX",
  BAT: "CBOE",
  BATS: "CBOE",
  PSGM: "OTC",
  EXPM: "OTC",
  OTCID: "OTC",
  PINL: "OTC",
  PK: "OTC",
  HKG: "HKEX",
};

// Hong Kong pads its numbers out to five digits and the CSV does not, so the
// Tracker Fund is 02800 on Webull and 2800 in the file.
function csvTicker(symbol, exchange) {
  const text = String(symbol || "").toUpperCase().trim();
  return exchange === "HKG" ? text.replace(/^0+/, "") : text;
}

// One ISIN is often listed on several venues under differently worded names
// ("SPDR S&P 500 ETF Trust" and "State Street SPDR S&P 500 ETF"), so every
// spelling is kept and the closest one decides a match.
function loadTickerCandidatesFromCsv(path) {
  if (!fs.existsSync(path)) return new Map();

  const map = new Map();
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const exchange = (columns[isinIndex - 1] || "").trim().toUpperCase();
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
      if (exchange) existing.exchanges.add(exchange);
    } else {
      candidates.push({ isin, names: [name], exchanges: new Set(exchange ? [exchange] : []) });
    }
  }

  return map;
}

// Legal-entity suffixes are shared by unrelated funds, so counting them would
// let a same-ticker instrument pass for the one being looked up.
const GENERIC_TOKENS = new Set([
  "LTD", "LIMITED", "PLC", "INC", "CORP", "CORPORATION", "LLC", "GMBH", "THE",
  "CO", "COMMON", "STOCK", "SHARES", "CLASS", "TRUST", "FUND",
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

// An American ticker belongs to one instrument apiece, so the fund Webull
// quotes under it is the one the CSV files on that same venue. Where a ticker
// covers several share classes the venue tells them apart before the name has
// to, and the name only has to settle what is left.
function resolveIsin(tickerCandidates, listing) {
  const candidates = tickerCandidates.get(listing.ticker) || [];
  if (candidates.length === 0) return null;

  const venue = EXCHANGE_NAMES[listing.exchange];
  const sameVenue = venue ? candidates.filter((candidate) => candidate.exchanges.has(venue)) : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;

  const scored = shortlist.map((candidate) => ({
    isin: candidate.isin,
    ...scoreCandidate(listing.name, candidate),
  }));

  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const winners = scored.filter((candidate) => candidate.score === bestScore);
  // Still tied: the name does not tell these share classes apart.
  return winners.length === 1 ? winners[0] : null;
}

// A Singapore account reaches the American and the Hong Kong shelves; asking
// for Singapore or Japan is refused outright.
const MARKETS = ["US_STOCK", "HK_STOCK"];

// The whole ETF shelf comes down a page at a time, so nothing has to be
// searched for ticker by ticker.
async function loadEtfs(category) {
  const listings = [];
  let paginationKey = "";

  for (let page = 0; page < 200; page += 1) {
    const query = { category, sub_category: "ETF" };
    if (paginationKey) query.pagination_key = paginationKey;

    const answer = await api("GET", "/trading/instruments/stocks/profiles/list", { query });
    if (answer.status !== 200) {
      throw new Error(
        `Webull answered ${answer.status} for the instrument list: ${JSON.stringify(answer.json || answer.text)}`
      );
    }

    const rows = Array.isArray(answer.json?.data) ? answer.json.data : [];
    listings.push(...rows);
    console.error(`  ${listings.length} listings read`);

    paginationKey = answer.json?.pagination_key || "";
    if (!paginationKey || rows.length === 0) break;
  }

  return listings;
}

await authorise();

const tickerCandidates = loadTickerCandidatesFromCsv(csvPath);
console.error(`${tickerCandidates.size} tickers in the CSV`);

const listings = [];
for (const market of MARKETS) {
  console.error(`${market}:`);
  listings.push(...(await loadEtfs(market)));
}
if (listings.length === 0) throw new Error("Webull returned no ETFs.");

// Webull keeps instruments in the book that an account may no longer buy: CO
// closes a position out only, NT cannot be traded at all.
const tradable = listings.filter((listing) => (listing.status || "OC") === "OC");
console.error(
  `${listings.length} ETFs on Webull's shelf, ${listings.length - tradable.length} of them not tradable`
);

const results = [];
const seen = new Set();
const unknownVenues = new Set();
let unmatched = 0;

for (const listing of tradable.sort((left, right) =>
  String(left.symbol).localeCompare(String(right.symbol))
)) {
  const exchange = String(listing.exchange_code || "").toUpperCase();
  if (exchange && !EXCHANGE_NAMES[exchange]) unknownVenues.add(exchange);

  const ticker = csvTicker(listing.symbol, exchange);
  if (!ticker) continue;

  const name = String(listing.name || "").replace(/\s+/g, " ").trim();
  const candidate = resolveIsin(tickerCandidates, { ticker, name, exchange });
  if (!candidate) {
    unmatched += 1;
    continue;
  }

  // A fund cross-listed in Hong Kong keeps the ISIN of its American line, so
  // the ticker, not the ISIN, is what tells two listings apart.
  if (seen.has(ticker)) continue;
  seen.add(ticker);

  results.push({
    query: ticker,
    ticker,
    name: name || candidate.name,
    exchange: EXCHANGE_NAMES[exchange] || exchange,
    type: "ETF",
    raw: [listing.symbol, name, exchange].filter(Boolean).join(" "),
    isin: candidate.isin,
  });
}

fs.mkdirSync("parsed_json", { recursive: true });
fs.writeFileSync("parsed_json/webull-parsed.json", JSON.stringify(results, null, 2));

console.error(
  `${results.length} funds matched, ${unmatched} not in the CSV` +
    (unknownVenues.size > 0 ? `, venue codes unaccounted for: ${[...unknownVenues].join(", ")}` : "")
);
console.log(JSON.stringify(results, null, 2));
