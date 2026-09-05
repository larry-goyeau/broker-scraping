import crypto from "node:crypto";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTicker(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const firstColumn = text.split(",")[0].trim();
  const afterExchange = firstColumn.includes(":") ? firstColumn.split(":").pop() : firstColumn;
  // Class shares arrive as BRK.B or BRK/B. The catalogues keep the dot.
  return (afterExchange || "").replace(/[\s/]+/g, ".").trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

function pathArg(flag, fallback) {
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(new RegExp(`^--${flag}=(.+)$`, "i"));
    if (match) return match[1];
  }
  return fallback ? new URL(fallback, import.meta.url) : "";
}

function hasFlag(name) {
  return process.argv.slice(2).some((arg) => new RegExp(`^--${name}$`, "i").test(arg));
}

// The app key is issued per region and carries that region as a prefix, which
// is also what says which host will accept it.
const HOSTS = {
  sg: "api.webull.com.sg",
  us: "api.webull.com",
  hk: "api.webull.hk",
  jp: "api.webull.co.jp",
};

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

const TOKEN_FILE = new URL(".webull-token.json", import.meta.url);

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
  console.error(`access token saved to ${TOKEN_FILE.pathname}`);
}

// Webull names a listing after the venue it is quoted on. PSE is NYSE Arca
// under its old Pacific name, NMS/NAS/NSQ are Nasdaq tiers, BAT is Cboe BZX,
// and CCC is the crypto book.
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
  OTCQ: "OTC",
  OTCB: "OTC",
  HKG: "HKEX",
  XGEM: "HKEX",
  CCC: "CRYPTO",
};

function loadTickerCandidatesFromCsv(csvPath, kind, map = new Map()) {
  if (!csvPath || !fs.existsSync(csvPath)) return map;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const ticker = normalizeTicker(columns[0]);
    const isinIndex = columns.findIndex((column) => Boolean(toIsin(column)));
    if (!ticker || isinIndex < 0) continue;

    const isin = toIsin(columns[isinIndex]);
    const exchange = normalize(isinIndex >= 1 ? columns[isinIndex - 1] : columns[1]).toUpperCase();
    const name = columns.slice(isinIndex + 1).join(",").trim();
    if (!name) continue;

    const candidates = map.get(ticker) || [];
    map.set(ticker, candidates);

    const existing = candidates.find((candidate) => candidate.isin === isin);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
      if (exchange) existing.exchanges.add(exchange);
      if (!existing.kind) existing.kind = kind;
    } else {
      candidates.push({
        isin,
        kind,
        names: [name],
        exchanges: new Set(exchange ? [exchange] : []),
      });
    }
  }

  return map;
}

function loadCryptoTickers(csvPath) {
  const tickers = new Set();
  if (!csvPath || !fs.existsSync(csvPath)) return tickers;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
    const ticker = normalizeTicker(line.split(",")[0]);
    if (ticker) tickers.add(ticker);
  }
  return tickers;
}

const GENERIC_TOKENS = new Set([
  "LTD", "LIMITED", "PLC", "INC", "CORP", "CORPORATION", "LLC", "GMBH", "THE",
  "CO", "COMMON", "STOCK", "SHARES", "CLASS", "TRUST", "FUND", "ETF", "ETC",
  "ETN", "ETP", "UCITS", "ISHARES",
]);

function nameTokens(value) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1 && !GENERIC_TOKENS.has(token));
}

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

function resolveListing(tickerCandidates, listing, type) {
  const kind = type === "STOCK" ? "STOCK" : "ETF";
  let candidates = (tickerCandidates.get(listing.ticker) || []).filter(
    (candidate) => !candidate.kind || candidate.kind === kind
  );
  if (candidates.length === 0) return null;

  if (listing.market === "HK") {
    const hk = candidates.filter((candidate) => candidate.isin.startsWith("HK"));
    if (hk.length) candidates = hk;
  } else {
    const us = candidates.filter((candidate) => candidate.isin.startsWith("US"));
    if (us.length) candidates = us;
  }

  const venue = EXCHANGE_NAMES[listing.exchange] || listing.exchange;
  const sameVenue = venue
    ? candidates.filter((candidate) => candidate.exchanges.has(venue))
    : [];
  const shortlist = sameVenue.length > 0 ? sameVenue : candidates;

  const scored = shortlist.map((candidate) => ({
    ...candidate,
    ...scoreCandidate(listing.name, candidate),
  }));

  if (scored.length === 1) return scored[0];

  const bestScore = Math.max(0, ...scored.map((candidate) => candidate.score));
  if (bestScore < MIN_NAME_SCORE) return null;

  const winners = scored.filter((candidate) => candidate.score === bestScore);
  return winners.length === 1 ? winners[0] : null;
}

function listingType(listing) {
  const category = normalize(listing.category).toUpperCase();
  const sub = normalize(listing.sub_category).toUpperCase();
  const name = normalize(listing.name);
  if (category === "US_CRYPTO" || sub === "CRYPTO") return "CRYPTO";
  if (sub === "WARRANT" || sub === "UNITS" || sub === "RIGHT") return "";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  const withoutParens = name.replace(/\([^)]*\)/g, " ");
  if (/\bETCs?\b/i.test(withoutParens) && !/\bETFs?\b/i.test(name) && !/^ETC\b/i.test(name)) {
    return "ETC";
  }
  if (sub === "ETF" || listing.crypto_etf) return "ETF";
  if (sub === "COMMON_STOCK" || sub === "PREFERRED_STOCK") return "STOCK";
  if (!sub && /STOCK$/.test(category)) {
    return /\bETFs?\b|\bUCITS\b/i.test(name) ? "ETF" : "STOCK";
  }
  return "";
}

// Hong Kong pads its numbers out to five digits and the CSV does not, so the
// Tracker Fund is 02800 on Webull and 2800 in the file.
function csvTicker(symbol, exchange) {
  const text = normalizeTicker(symbol);
  return exchange === "HKG" ? text.replace(/^0+/, "") || "0" : text;
}

function cryptoBase(symbol) {
  const text = normalizeTicker(symbol);
  return text.replace(/[-/]?(USD|USDT|USDC)$/i, "") || text;
}

function listingCurrency(listing, exchange) {
  const code = normalize(listing.currency).toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) return code;
  if (exchange === "HKG") return "HKD";
  if (exchange === "CCC") return "USD";
  return "USD";
}

// `--csv=PATH` overrides the fund list, `--stocks-csv=PATH` the share list,
// `--cryptos-csv=PATH` the coin list. `--etfs-only` / `--stocks-only` /
// `--crypto-only` answer for one shelf. `--all` keeps lines the catalogues
// do not carry. `--fresh` starts the file over.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const cryptosCsvPath = pathArg("cryptos-csv", "../cryptos.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
const cryptoOnly = hasFlag("crypto-only") || hasFlag("cryptos-only");
const keepUnlisted = hasFlag("all");
const fresh = hasFlag("fresh");

const wantEtfs = !stocksOnly && !cryptoOnly;
const wantStocks = !etfsOnly && !cryptoOnly;
const wantCrypto = !etfsOnly && !stocksOnly;

const tickerCandidates = new Map();
if (wantEtfs) loadTickerCandidatesFromCsv(etfsCsvPath, "ETF", tickerCandidates);
if (wantStocks) loadTickerCandidatesFromCsv(stocksCsvPath, "STOCK", tickerCandidates);
const cryptoTickers = wantCrypto ? loadCryptoTickers(cryptosCsvPath) : new Set();

const onlyTickers = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(normalizeTicker)
    .filter((ticker) => ticker && !toIsin(ticker))
);

const outputPath = new URL("webull-parsed.json", import.meta.url);
const results = [];
const seen = new Set();

if (!fresh && fs.existsSync(outputPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (Array.isArray(existing)) {
      for (const entry of existing) {
        results.push(entry);
        if (entry?.ticker) {
          seen.add(`${entry.ticker}:${entry.type || ""}:${entry.exchange || ""}`.toUpperCase());
        }
      }
    }
  } catch {
    // Ignore malformed prior output and start fresh.
  }
}

await authorise();

// The instrument list is 10 calls / 30s. A short pause keeps a long walk
// from being dropped mid-page.
const PAGE_DELAY_MS = 3200;

async function loadShelf(path, query) {
  const listings = [];
  let paginationKey = "";

  for (let page = 0; page < 200; page += 1) {
    const next = { ...query };
    if (paginationKey) next.pagination_key = paginationKey;

    if (page > 0) await sleep(PAGE_DELAY_MS);
    const answer = await api("GET", path, { query: next });
    if (answer.status === 429) {
      console.error("  Webull asked to wait");
      await sleep(8000);
      page -= 1;
      continue;
    }
    if (answer.status !== 200) {
      throw new Error(
        `Webull answered ${answer.status} for ${path}: ${JSON.stringify(answer.json || answer.text)}`
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

const listed = [];
if (wantStocks || wantEtfs) {
  for (const market of ["US_STOCK", "HK_STOCK"]) {
    console.error(`${market}:`);
    listed.push(
      ...(await loadShelf("/trading/instruments/stocks/profiles/list", {
        category: market,
        status: "OC",
      }))
    );
  }
}
if (wantCrypto) {
  console.error("US_CRYPTO:");
  listed.push(
    ...(await loadShelf("/trading/instruments/crypto/profiles/list", {
      category: "US_CRYPTO",
      status: "OC",
    }))
  );
}

console.error(`${listed.length} instruments on Webull's shelf`);

let unlisted = 0;
const skipped = new Map();
const unknownVenues = new Set();

function skip(reason) {
  skipped.set(reason, (skipped.get(reason) || 0) + 1);
}

for (const listing of listed) {
  // CO closes a position out only, NT cannot be traded at all.
  if ((listing.status || "OC") !== "OC") {
    skip(listing.status || "unknown");
    continue;
  }

  const type = listingType(listing);
  if (!type) {
    skip(String(listing.sub_category || listing.category || "unknown").toLowerCase());
    continue;
  }
  if ((type === "ETF" || type === "ETC" || type === "ETN") && !wantEtfs) continue;
  if (type === "STOCK" && !wantStocks) continue;
  if (type === "CRYPTO" && !wantCrypto) continue;

  const exchangeCode = normalize(listing.exchange_code).toUpperCase();
  if (exchangeCode && !EXCHANGE_NAMES[exchangeCode]) unknownVenues.add(exchangeCode);

  const ticker =
    type === "CRYPTO" ? cryptoBase(listing.symbol) : csvTicker(listing.symbol, exchangeCode);
  if (!ticker) {
    skip("no ticker");
    continue;
  }
  if (onlyTickers.size > 0 && !onlyTickers.has(ticker) && !onlyTickers.has(normalizeTicker(listing.symbol))) {
    continue;
  }

  const exchange = type === "CRYPTO" ? "CRYPTO" : EXCHANGE_NAMES[exchangeCode] || exchangeCode;
  if (!exchange) {
    skip("no exchange");
    continue;
  }

  const currency = listingCurrency(listing, exchangeCode);
  const name = normalize(listing.name);
  const market = listing.category === "HK_STOCK" || exchangeCode === "HKG" ? "HK" : "US";

  let match = null;
  if (type === "CRYPTO") {
    if (!cryptoTickers.has(ticker) && !keepUnlisted) {
      unlisted += 1;
      continue;
    }
  } else {
    match = resolveListing(tickerCandidates, { ticker, name, exchange: exchangeCode, market }, type);
    if (!match && !keepUnlisted) {
      unlisted += 1;
      continue;
    }
  }

  const key = `${ticker}:${type}:${exchange}`.toUpperCase();
  if (seen.has(key)) continue;
  seen.add(key);

  results.push({
    query: ticker,
    ticker,
    name: name || match?.names?.[0] || ticker,
    exchange,
    currency,
    type,
    raw: [listing.symbol, name, exchange, currency].filter(Boolean).join(" "),
    isin: match?.isin || "",
  });
}

results.sort((left, right) => {
  const byType = String(left.type).localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = String(left.exchange).localeCompare(String(right.exchange));
  if (byExchange !== 0) return byExchange;
  return String(left.ticker).localeCompare(String(right.ticker));
});

fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const byCurrency = new Map();
for (const row of results) byCurrency.set(row.currency, (byCurrency.get(row.currency) || 0) + 1);

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin || row.ticker)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ") || "none"}; ` +
    `${[...byCurrency].map(([currency, count]) => `${count} ${currency}`).join(", ") || "no currency"})` +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "") +
    (skipped.size ? `, left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : "") +
    (unknownVenues.size ? `, venue codes unaccounted for: ${[...unknownVenues].join(", ")}` : "")
);
