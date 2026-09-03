import puppeteer from "puppeteer-core";
import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function toIsin(value) {
  const text = (value || "").trim().toUpperCase();
  if (!text) return "";
  const match = text.match(/\b[A-Z]{2}[A-Z0-9]{10}\b/);
  return match ? match[0] : "";
}

// Supports both ticker,isin,name and ticker,exchange,isin,name.
function loadCsv(csvPath, kind, index = new Map()) {
  if (!fs.existsSync(csvPath)) return index;

  for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
    if (!line.trim() || /^ticker\s*,/i.test(line)) continue;

    const columns = line.split(",");
    const isin = toIsin(columns[2]) || toIsin(columns[1]) || columns.map(toIsin).find(Boolean);
    if (isin && !index.has(isin)) index.set(isin, kind);
  }
  return index;
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

// `--csv=PATH` overrides the fund list (defaults to etfs.csv) and
// `--stocks-csv=PATH` the share list. `--etfs-only` and `--stocks-only`
// answer for one shelf alone.
const etfsCsvPath = pathArg("csv", "../etfs.csv");
const stocksCsvPath = pathArg("stocks-csv", "../stocks.csv");
const etfsOnly = hasFlag("etfs-only") || hasFlag("funds-only");
const stocksOnly = hasFlag("stocks-only");
// Everything Elana quotes, and not only what the catalogues happen to carry.
const keepUnlisted = hasFlag("all");

const wantEtfs = !stocksOnly;
const wantStocks = !etfsOnly;

// Funds are read first so an ISIN two catalogues happen to carry is remembered
// as the fund it is. There is no coin list to read: Elana's own book holds no
// crypto — what it quotes of bitcoin is an ETN, which the fund catalogue carries.
const catalogue = new Map();
if (wantEtfs) loadCsv(etfsCsvPath, "ETF", catalogue);
if (wantStocks) loadCsv(stocksCsvPath, "STOCK", catalogue);

const onlyIsins = new Set(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("--"))
    .map(toIsin)
    .filter(Boolean)
);

// What Elana calls a shelf, in the platform's own words, and what this repo
// calls the same thing. MutualFund is asked for nowhere because the account is
// offered none, and the index and CFD types are not instruments to own: the
// index is a number and the CFD a contract quoted on the same line as the share.
const SHELVES = [
  { want: wantEtfs, types: ["Etf", "Etc", "Etn", "Fund"] },
  { want: wantStocks, types: ["Stock"] },
];

const TYPES = {
  STOCK: "STOCK",
  ETF: "ETF",
  ETC: "ETC",
  ETN: "ETN",
  FUND: "FUND",
};

// Saxo, whose platform this is, names a venue with an id of its own, and those
// ids cannot be passed on as they stand: "SSE" is Stockholm here and Shanghai
// in the catalogues, and the OTC books are filed under the American exchange
// whose MIC their symbols carry. So every venue is named here or not at all.
const EXCHANGES = {
  AMEX: "AMEX",
  NYSE: "NYSE",
  NYSE_ARCA: "AMEX",
  NASDAQ: "NASDAQ",
  NSC: "NASDAQ",
  BATS_BZX: "CBOE",
  // Elana quotes American over-the-counter shares under a Nasdaq MIC, which is
  // the venue they report to rather than the venue they trade on.
  OOTC: "OTC",
  OOTC_NI: "OTC",
  AMS: "EURONEXT",
  AMS_MC_ETF: "EURONEXT",
  AMS_BONDS: "EURONEXT",
  BRU: "EURONEXT",
  BRU_BONDS: "EURONEXT",
  EGB: "EURONEXT",
  PAR: "EURONEXT",
  PAR_MC_ETF: "EURONEXT",
  PAR_BONDS: "EURONEXT",
  EGP: "EURONEXT",
  LISB: "EURONEXT",
  LISB_BONDS: "EURONEXT",
  ISE: "EURONEXT",
  EGD: "EURONEXT",
  OSE: "OSL",
  EGO: "OSL",
  FSE: "XETR",
  XETR_ETF: "XETR",
  // The Frankfurt floor is not Xetra, though a listing on it carries a German
  // MIC either way.
  FFT: "FWB",
  LSE_SETS: "LSE",
  LSE_SEAQ: "LSE",
  LSE_ETF: "LSE",
  LSE_INTL: "LSIN",
  MIL: "MIL",
  MIL_ETF: "MIL",
  // Borsa Italiana's bond markets, which are the exchange itself.
  MOT: "MIL",
  EUROMOT: "MIL",
  EUROTLX: "EUROTLX",
  EUROTLX_INT: "EUROTLX",
  SWX: "SIX",
  SWX_ETF: "SIX",
  SWX_BND_ETF: "SIX",
  VX: "SIX",
  SIBE: "BME",
  VIE: "VIE",
  HKEX: "HKEX",
  HSE: "OMXHEX",
  CSE: "OMXCOP",
  CSE_BONDS: "OMXCOP",
  SSE: "OMXSTO",
  "SSE_FN-SE": "OMXSTO",
  LUX_BONDS: "LUXSE",
  LUX_MTF: "LUXSE",
};

// A venue Elana adds tomorrow will be unnamed above, and the MIC its symbols
// carry is the second chance at naming it.
const MICS = {
  xase: "AMEX",
  arcx: "AMEX",
  bats: "CBOE",
  xnas: "NASDAQ",
  xnys: "NYSE",
  xams: "EURONEXT",
  xbru: "EURONEXT",
  xdub: "EURONEXT",
  xlis: "EURONEXT",
  xpar: "EURONEXT",
  xosl: "OSL",
  xetr: "XETR",
  xfra: "FWB",
  xlon: "LSE",
  xmil: "MIL",
  xswx: "SIX",
  xvtx: "SIX",
  xmce: "BME",
  xwbo: "VIE",
  xhkg: "HKEX",
  xhel: "OMXHEX",
  xcse: "OMXCOP",
  xome: "OMXSTO",
  xlux: "LUXSE",
};

// Saxo names some books with ids of its own rather than an exchange MIC.
// Those keep Elana's name, as there is no exchange to give instead.
function exchangeOf(row) {
  const exchangeId = row.ExchangeId || "";
  if (EXCHANGES[exchangeId]) return EXCHANGES[exchangeId];

  const mic = (row.Symbol || "").split(":")[1];
  if (mic && MICS[mic.toLowerCase()]) return MICS[mic.toLowerCase()];

  return exchangeId.toUpperCase() || null;
}

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

const INSTRUMENTS_URL = "https://webtrader.elana.net/openapi/ref/v1/instruments/";

// Elana runs Saxo's platform, whose reference data the web trader reads over
// an API it signs with a token it rotates on its own. Reading that token off
// the app's traffic keeps the script in step with the rotation. The client key
// is read along with it because the app sends one, but the shelf answers the
// same without it, down to which listings it will not sell: what is refused
// below is refused of Elana's book rather than of this account.
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

// The app signs nothing while it sits idle, so a page left open will not hand
// a token over however long it is watched. What it always does is fetch its own
// start-up data, which is why the page is reloaded rather than merely listened
// to — and why a stale token is replaced the same way.
async function reload() {
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
}

// The other way to make the app sign a request is to give it something to look
// up, for the reload that somehow signs nothing.
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

async function captureSession(stale = null) {
  const signed = () => session.token && session.token !== stale;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const prod of [reload, nudge]) {
      await prod();

      for (let waited = 0; waited < 15000; waited += 250) {
        if (signed() && session.clientKey) return true;
        await sleep(250);
      }
    }
  }

  // Nothing here rests on the key, so a run is not abandoned for want of one.
  return signed();
}

if (!(await captureSession())) {
  throw new Error("Could not read the web trader's API token. Is webtrader.elana.net signed in?");
}
console.error("session captured");

// A thousand is as many as the endpoint will hand over at once.
const PAGE_SIZE = 1000;

async function fetchPage(assetType, skip) {
  return page.evaluate(
    async (url, token, clientKey, type, offset, limit) => {
      const query = new URLSearchParams({
        $top: String(limit),
        $skip: String(offset),
        AssetTypes: type,
        // Everything on the shelf is asked for and the untradable sorted out
        // here, so that a line that cannot be bought is left out on the
        // platform's own word rather than on a flag being honoured.
        includeNonTradable: "true",
        fieldGroups: "TradableInfo",
      });
      if (clientKey) query.set("ClientKey", clientKey);

      try {
        const response = await fetch(`${url}?${query}`, {
          headers: { Authorization: token, Accept: "application/json" },
        });
        if (!response.ok) return { status: response.status };
        const payload = await response.json();
        return { status: 200, data: payload?.Data || [] };
      } catch (error) {
        return { status: 0, error: String(error) };
      }
    },
    INSTRUMENTS_URL,
    session.token,
    session.clientKey,
    assetType,
    skip,
    PAGE_SIZE
  );
}

// Drop the keywords and the search endpoint enumerates the whole shelf, which
// is how the run avoids a lookup per ISIN: the catalogues name a hundred and
// twelve thousand instruments, Elana quotes twenty thousand, and reading its
// own list costs twenty-odd calls rather than a hundred and twelve thousand.
// Nothing is lost by it — searched for one at a time, the platform offers no
// listing its list does not already carry.
async function enumerate(assetType) {
  const rows = [];

  for (let skip = 0; ; skip += PAGE_SIZE) {
    let answer = await fetchPage(assetType, skip);

    // The token lasts minutes rather than hours, so a refusal part-way through
    // is answered by reading the app's next one rather than by giving up.
    if (answer.status === 401) {
      await captureSession(session.token);
      answer = await fetchPage(assetType, skip);
    }
    if (answer.status !== 200) {
      throw new Error(
        `Elana stopped handing over its ${assetType} list (HTTP ${answer.status}). Is the web trader still signed in?`
      );
    }

    rows.push(...answer.data);
    if (answer.data.length < PAGE_SIZE) break;
  }

  return rows;
}

const results = [];
const seen = new Set();
const refused = new Map();
let unlisted = 0;

for (const shelf of SHELVES) {
  if (!shelf.want) continue;

  for (const assetType of shelf.types) {
    const rows = await enumerate(assetType);

    let kept = 0;
    for (const row of rows) {
      const isin = toIsin(row.Isin);
      if (!isin) continue;
      if (onlyIsins.size > 0 && !onlyIsins.has(isin)) continue;

      // The catalogues are the shared list of instruments this repo asks every
      // broker about; what Elana quotes beyond them is left out unless asked for.
      const kind = catalogue.get(isin);
      if (!kind && !keepUnlisted) {
        unlisted += 1;
        continue;
      }

      // "ReduceOnly" is the platform refusing to open a position: the line can
      // be sold if already held but not bought, so it is not on offer.
      const status = row.TradingStatus || "";
      if (status !== "Tradable") {
        const reason = row.NonTradableReason && row.NonTradableReason !== "None"
          ? row.NonTradableReason
          : status || "unstated";
        refused.set(reason, (refused.get(reason) || 0) + 1);
        continue;
      }

      // A listing is named "<ticker>:<mic>" — "SPYY:xetr".
      const symbol = row.Symbol || "";
      const ticker = (symbol.split(":")[0] || "").toUpperCase();
      if (!ticker) continue;

      // The platform's own key for a listing, so one read twice is kept once.
      const key = String(row.Identifier || `${symbol}:${isin}`);
      if (seen.has(key)) continue;
      seen.add(key);

      const type = TYPES[(row.AssetType || "").toUpperCase()] || (row.AssetType || "").toUpperCase();
      if (type === "BND" || type === "BOND") continue;

      results.push({
        query: isin,
        ticker,
        name: normalize(row.Description),
        exchange: exchangeOf(row),
        currency: (row.CurrencyCode || "").toUpperCase() || null,
        type,
        raw: [symbol, row.Description, row.ExchangeName, row.CurrencyCode].filter(Boolean).join(" "),
        isin,
      });
      kept += 1;
    }

    console.error(`${assetType}: ${rows.length} quoted, ${kept} on offer`);
  }
}

// Written once, at the end. The whole shelf is read on every run, so there is
// nothing to resume, and a sweep the session cut short must not be left in
// place of a whole one.
const outputPath = new URL("elana-parsed.json", import.meta.url);
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);

console.error(
  `${results.length} listings over ${new Set(results.map((row) => row.isin)).size} instruments ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})` +
    (refused.size
      ? `, ${[...refused].map(([reason, count]) => `${count} ${reason}`).join(", ")}`
      : "") +
    (unlisted ? `, ${unlisted} the catalogues do not carry` : "")
);
console.log(JSON.stringify(results, null, 2));

await browser.disconnect();
