// What one share costs, so that a fee expressed in percent can be turned into money.
// A fact about the instrument and not about any broker, so it sits at the root beside
// `fx.mjs` and `taxes.mjs`, and every `*_cost.mjs` reads the same figure.
//
// The source is EODHD, one vendor for most of the world, because the alternative is one
// scraper per venue and a price that only exists while that venue is open. Here the
// last close is served at any hour: a lookup at midnight in Paris answers for Tokyo,
// and nothing has to be timed against a session. The day's close is enough — these
// prices size an order, they do not fill one.
//
// Most of the world and not all of it: the vendor carries nothing in the Gulf, and it
// also misses lines it should know — a Canadian CDR, a local share class — then answers
// an empty list. A miss used to stamp `fetched` and look fresh, so the front never asked
// again. The four Gulf boards still publish their own last through `gulf.mjs`. Everywhere
// else, a miss falls through to Yahoo's chart last, built from the catalogues' ticker and
// MIC (`F.TO`, `1111.SR`). Enough to size an order, not to fill one. That keeps this file
// the only writer of `prices.json` while letting the lines no vendor sells stop being N/A.
//
// One request per ISIN buys every listing of it at once: `/api/search/{ISIN}` answers
// with each venue, its currency and its last close, so a single call fills the euro
// line, the pence line and the dollar line together. That is why there is no symbol
// map here and no per-exchange download: the ISIN is the only key needed.
//
// The front calls `ensureFresh` on the instrument being looked at, so the repository
// pays for what somebody actually reads rather than for a catalogue of sixty-six
// thousand. `prices.mjs` run on its own sweeps the whole catalogue instead.
//
//   node prices.mjs                   balaie tout le catalogue
//   node prices.mjs --limit=200       s'arrête après deux cents instruments
//   node prices.mjs --isin=IE00B4L5Y983  un seul, pour voir
//   node prices.mjs --refresh         réinterroge même ce qui est frais
//   node prices.mjs --out=/tmp/p.json pour essayer sans écraser le vrai fichier
//   node prices.mjs --dry-run         dit ce que ça coûterait et ne demande rien
//   node prices.mjs --budget=50       ne dépense pas plus de cinquante appels
//   node prices.mjs --use-reserve     autorise à entamer la réserve non renouvelable
//   node prices.mjs --gulf            lit les carnets du Golfe, sans clé et sans quota
//
// The key lives in `.env` as EODHD_API_KEY, which `.gitignore` already keeps out of the
// repository.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const arg = (name) => {
  for (const a of process.argv.slice(2)) {
    if (a === `--${name}`) return "";
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return null;
};
const has = (name) => arg(name) !== null;

const HERE = fileURLToPath(new URL("./", import.meta.url));
const IS_CLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
// `--out` is a thing the sweep is given; imported into the front there is no such flag
// and the real file is the only one meant.
const STORE_PATH = (IS_CLI && arg("out")) || path.join(HERE, "parsed_json/prices.json");

// ---------------------------------------------------------------- the key

// Missing on the front is not fatal: the page then serves whatever is already on disk
// and simply stops refreshing. Missing on a sweep is, since a sweep has nothing else
// to do.
function readKey() {
  if (process.env.EODHD_API_KEY) return process.env.EODHD_API_KEY.trim();
  const env = path.join(HERE, ".env");
  if (fs.existsSync(env)) {
    const m = fs.readFileSync(env, "utf8").match(/^\s*EODHD_API_KEY\s*=\s*(.+?)\s*$/m);
    if (m) return m[1].trim();
  }
  return null;
}
const KEY = readKey();

// ---------------------------------------------------------------- the store

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
export const DAY = 86400000;

const UNIT =
  "prices[ISIN][devise] = { price, at, from } : la clôture du dernier jour de bourse, " +
  "dans la devise de cotation, pour convertir un nombre de parts en montant. Une même " +
  "ligne cotée sur plusieurs places dans la même devise garde sous `from` toutes ses " +
  "cotations ; `price` retient la place principale. Londres cote en pence, donc GBX et " +
  "GBP sont deux entrées, que `fx.mjs` sait distinguer. Ce n'est pas un prix temps " +
  "réel : il sert à dimensionner un ordre, pas à l'exécuter. `fetched` date la dernière " +
  "interrogation EODHD, y compris un miss, pour ne pas brûler le quota. `fallback` date " +
  "le last Yahoo (ou le constat qu'il n'y en a pas), pour ne pas le redemander chaque vue.";

const store = fs.existsSync(STORE_PATH) ? JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) : {};
/** prices[ISIN][CCY] = { price, at, from } */
export const prices = (store.prices ||= {});
/** When each ISIN was last asked about, hit or miss. */
const fetched = (store.fetched ||= {});
/** When the free last (Yahoo, after a vendor miss) was last tried. */
const fallback = (store.fallback ||= {});

// Rewriting the whole file on every lookup would cost more than the lookups do, so it
// lands on a timer and once more on the way out.
let dirty = false;
let timer = null;
function save() {
  if (!dirty) return;
  dirty = false;
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(
    STORE_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "EODHD, les bourses du Golfe, KASE pour un last en tenge, et Yahoo pour un last quand le vendeur n'a rien",
        unit: UNIT,
        fetched,
        fallback,
        prices,
      },
      null,
      2
    )
  );
}
function scheduleSave() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    save();
  }, 2000);
  timer.unref?.();
}
process.on("exit", save);

function hasPrice(isin) {
  return Object.values(prices[isin] || {}).some((leaf) => Number(leaf?.price) > 0);
}

/** True when this ISIN was asked about recently enough to be worth trusting. */
export function isFresh(isin, maxAge = DAY) {
  const key = String(isin || "").toUpperCase();
  if (hasPrice(key)) {
    const at = Date.parse(fetched[key] || fallback[key] || 0);
    return Number.isFinite(at) && Date.now() - at < maxAge;
  }
  // A dated EODHD miss must not count as a price. The Gulf boards are retried
  // every view (their tape is free). Elsewhere a miss is fresh only after the
  // Yahoo last has been tried, so a CDR the vendor never heard of still gets
  // one shot and then rests for the day.
  // KASE publishes the last for nothing, the same way the Gulf boards do. A miss
  // from the vendor must not sit on that page for a day.
  if (GULF_COUNTRIES.has(key.slice(0, 2)) || key.startsWith("KZ")) return false;
  const fb = Date.parse(fallback[key] || 0);
  return Number.isFinite(fb) && Date.now() - fb < maxAge;
}

// ---------------------------------------------------------------- the vendor

const API = "https://eodhd.com/api";
let spent = 0;
let budget = Infinity;

async function get(url, { tries = 3 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (r.status === 429 || r.status >= 500) {
        await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
        continue;
      }
      // Out of quota or outside the plan: worth saying once and out loud, since every
      // later call will fail the same way and the page would otherwise look merely slow.
      if (r.status === 402 || r.status === 403) {
        throw new Error(`HTTP ${r.status} — quota épuisé ou hors formule`);
      }
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      if (/quota/.test(e.message)) throw e;
      if (i === tries - 1) return null;
      await new Promise((s) => setTimeout(s, 1000 * (i + 1)));
    }
  }
  return null;
}

// ---------------------------------------------------------------- one instrument

// Every venue the vendor knows for this ISIN, recorded under the currency each quotes
// in. The chosen figure is the primary listing where the vendor names one, otherwise
// the first it returns, which is its own order of relevance. The others stay under
// `from` so that a suspect price can be argued with rather than merely replaced.
function noteSearch(isin, rows) {
  for (const r of rows) {
    const ccy = String(r.Currency || "").trim().toUpperCase();
    const px = Number(r.previousClose);
    if (!ccy || !(px > 0)) continue;
    const leaf = ((prices[isin] ||= {})[ccy] ||= { price: null, at: null, from: {} });
    leaf.from[`${r.Exchange}:${r.Code}`] = {
      price: Number(px.toPrecision(8)),
      at: r.previousCloseDate || null,
      primary: !!r.isPrimary,
    };
    const best = Object.values(leaf.from).find((x) => x.primary) || Object.values(leaf.from)[0];
    leaf.price = best.price;
    leaf.at = best.at;
  }
}

// ---------------------------------------------------------------- le Golfe

// The vendor does not carry the Gulf. Asked for GFH Bank it answers nothing at all, and
// across the five Gulf ISINs the front has put to it since the boards were wired, it has
// answered none — against two out of two for the American ones. That is coverage and not
// quota: a bigger plan would return the same nothing.
//
// The exchanges themselves publish the last price, in the same response that carries the
// touch `spread.mjs` reads, so `gulf.mjs` fetches it once and both take what they need.
// This stays the only file that writes `prices.json`.
//
// Only Abu Dhabi names an ISIN. The other three board rows carry a symbol, and the thing
// that knows which ISIN a symbol means on a given board is the brokers' catalogues — so
// they are read for that and for nothing else, once, on the first Gulf lookup.
const GULF_COUNTRIES = new Set(["AE", "BH", "KW", "OM", "QA", "SA"]);
const GULF_HEADLESS = ["adx", "dfm", "msx"];
const BOARD_TTL = 15 * 60 * 1000;

let gulfIndexPromise = null;
/** ISIN -> [{ mic, symbol }], for the boards that name no ISIN of their own. */
function gulfIndex() {
  return (gulfIndexPromise ||= (async () => {
    const [{ catalogueRows }, { resolveVenue }, { GULF_BOARDS }] = await Promise.all([
      import("./catalogues.mjs"),
      import("./venues.mjs"),
      import("./gulf.mjs"),
    ]);
    const mics = new Set(Object.values(GULF_BOARDS).map((b) => b.mic));
    const { gulfSymbol } = await import("./gulf.mjs");
    const index = new Map();
    for (const row of catalogueRows()) {
      const isin = String(row.isin || "").trim().toUpperCase();
      if (!ISIN.test(isin) || !GULF_COUNTRIES.has(isin.slice(0, 2))) continue;
      const mic = resolveVenue(row).venue?.mic;
      if (!mics.has(mic)) continue;
      const symbol = gulfSymbol(row.ticker || row.symbol);
      if (!symbol) continue;
      const seen = index.get(isin) || index.set(isin, []).get(isin);
      if (!seen.some((s) => s.mic === mic && s.symbol === symbol)) seen.push({ mic, symbol });
    }
    return index;
  })());
}

const boards = new Map();
/** One board, cached for a quarter of an hour: the front asks per instrument. */
function gulfBoard(key, page = null) {
  const held = boards.get(key);
  if (held && Date.now() - held.at < BOARD_TTL) return held.rows;
  const rows = (async () => {
    const { readGulfBoard } = await import("./gulf.mjs");
    const list = await readGulfBoard(key, page ? { page } : {});
    return new Map(list.filter((r) => r.last != null).map((r) => [r.isin || r.symbol, r]));
  })().catch((e) => {
    boards.delete(key);
    console.error(`carnet ${key} : ${e.message}`);
    return new Map();
  });
  boards.set(key, { at: Date.now(), rows });
  return rows;
}

function noteBoard(isin, row, mic) {
  const leaf = ((prices[isin] ||= {})[row.currency] ||= { price: null, at: null, from: {} });
  leaf.from[`${mic}:${row.symbol}`] = {
    price: Number(row.last.toPrecision(8)),
    at: new Date().toISOString().slice(0, 10),
    primary: false,
  };
  const best = Object.values(leaf.from).find((x) => x.primary) || Object.values(leaf.from)[0];
  leaf.price = best.price;
  leaf.at = best.at;
}

/**
 * Price one ISIN off the Gulf boards. `keys` limits which boards are asked — the front
 * cannot drive a browser, so it never asks Manama.
 */
async function gulfFresh(isin, { keys = GULF_HEADLESS, page = null } = {}) {
  const { GULF_BOARDS } = await import("./gulf.mjs");
  const where = (await gulfIndex()).get(isin) || [];
  let found = false;
  for (const key of keys) {
    const { mic } = GULF_BOARDS[key];
    const rows = await gulfBoard(key, GULF_BOARDS[key].browser ? page : null);
    // Abu Dhabi files its own rows under the ISIN, so it answers even for a line no
    // catalogue in this repository has ever named.
    const row = rows.get(isin) || where.filter((w) => w.mic === mic).map((w) => rows.get(w.symbol)).find(Boolean);
    if (!row) continue;
    noteBoard(isin, row, mic);
    found = true;
  }
  if (found) {
    fetched[isin] = new Date().toISOString();
    scheduleSave();
  }
  return found;
}

// Yahoo's last close, one chart call per symbol. The vendor's search is the
// normal path; this is what runs when that search comes back empty. The symbol
// is the catalogues' ticker plus the suffix the MIC uses on Yahoo — F on TSX
// is F.TO, 1111 on Tadawul is 1111.SR — or the ticker already written that way
// (Questrade's F.TO). A last in the wrong currency is not stored: the figure
// sizes the listing the broker named, not a neighbour.
const YAHOO_SUFFIX = {
  XTSE: ".TO",
  XTSX: ".V",
  XCNQ: ".CN",
  NEOE: ".NE",
  XNYS: "",
  XNAS: "",
  ARCX: "",
  XASE: "",
  BATS: "",
  XLON: ".L",
  XETR: ".DE",
  XFRA: ".F",
  XSTU: ".SG",
  XMUN: ".MU",
  XHAM: ".HM",
  XHAN: ".HA",
  XQTX: ".DU",
  XPAR: ".PA",
  XAMS: ".AS",
  XBRU: ".BR",
  XLIS: ".LS",
  XMIL: ".MI",
  XMSM: ".IR",
  XOSL: ".OL",
  XWBO: ".VI",
  XSWX: ".SW",
  XMEX: ".MX",
  XADS: ".AD",
  XDFM: ".AE",
  XBAH: ".BH",
  XMUS: ".OM",
  XCAI: ".CA",
};
const YAHOO_US = new Set(["XNYS", "XNAS", "ARCX", "XASE", "BATS"]);
const YAHOO_ALREADY = /\.[A-Z]{1,3}$/;

function yahooCurrency(raw) {
  const s = String(raw || "");
  if (s === "GBp" || s.toUpperCase() === "GBX") return "GBX";
  return s.toUpperCase();
}

function yahooSymbol(ticker, mic, isin) {
  const stem = String(ticker || "")
    .toUpperCase()
    .replace(/\*/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!stem) return null;
  if (YAHOO_ALREADY.test(stem)) return stem;
  if (/^\d{4}$/.test(stem) && String(isin || "").startsWith("SA")) return `${stem}.SR`;
  if (!mic || !(mic in YAHOO_SUFFIX)) return null;
  return `${stem}${YAHOO_SUFFIX[mic]}`;
}

let yahooIndexPromise = null;
/** ISIN -> [{ symbol, currency, mic }], one row per distinct Yahoo symbol. */
function yahooIndex() {
  return (yahooIndexPromise ||= (async () => {
    const [{ catalogueRows }, { resolveVenue }] = await Promise.all([
      import("./catalogues.mjs"),
      import("./venues.mjs"),
    ]);
    const index = new Map();
    for (const row of catalogueRows()) {
      const isin = String(row.isin || "").trim().toUpperCase();
      if (!ISIN.test(isin)) continue;
      const mic = resolveVenue(row).venue?.mic || "";
      const symbol = yahooSymbol(row.ticker || row.symbol, mic, isin);
      if (!symbol) continue;
      const currency = String(row.currency || "").trim().toUpperCase();
      const seen = index.get(isin) || index.set(isin, []).get(isin);
      if (!seen.some((s) => s.symbol === symbol)) seen.push({ symbol, currency, mic });
    }
    return index;
  })());
}

function yahooRank(row) {
  if (row.mic === "XTSE" || row.mic === "XTSX" || row.mic === "XCNQ" || row.mic === "NEOE") return 0;
  if (row.symbol.endsWith(".SR") || row.symbol.endsWith(".AD") || row.symbol.endsWith(".AE")) return 0;
  if (YAHOO_US.has(row.mic)) return 2;
  return 1;
}

async function yahooChart(symbol) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
    { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const meta = j?.chart?.result?.[0]?.meta;
  const last = Number(meta?.regularMarketPrice ?? meta?.chartPreviousClose);
  const currency = yahooCurrency(meta?.currency);
  if (!(last > 0) || !currency) return null;
  return { last, currency };
}

async function yahooFresh(isin) {
  const rows = [...((await yahooIndex()).get(isin) || [])].sort((a, b) => yahooRank(a) - yahooRank(b));
  const wanted = new Set(rows.map((r) => r.currency).filter(Boolean));
  let found = false;
  for (const row of rows.slice(0, 6)) {
    try {
      const quote = await yahooChart(row.symbol);
      if (!quote) continue;
      // A last in a currency no listing of this ISIN uses is a different
      // instrument that happens to share a ticker (OR Royalties vs L'Oréal).
      if (wanted.size && !wanted.has(quote.currency)) continue;
      noteBoard(isin, { symbol: row.symbol, last: quote.last, currency: quote.currency }, "YAHOO");
      found = true;
      if (hasPrice(isin) && [...wanted].every((ccy) => Number(prices[isin]?.[ccy]?.price) > 0)) break;
    } catch (e) {
      console.error(`prix ${isin} chez Yahoo ${row.symbol} : ${e.message}`);
    }
  }
  return found;
}

const inflight = new Map();

/**
 * Make sure this ISIN has been priced within `maxAge`, asking the vendor if not.
 * Never throws at the caller: a page that cannot refresh still has to render.
 * Returns the per-currency map, which may be undefined if nothing is known.
 */
export async function ensureFresh(isin, maxAge = DAY) {
  const key = String(isin || "").trim().toUpperCase();
  if (!ISIN.test(key)) return undefined;
  if (isFresh(key, maxAge)) return prices[key];
  // Two readers asking for the same instrument at once is one request, not two.
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    try {
      // A vendor out of quota throws, and that must not carry off the Gulf lookup with
      // it: the boards below cost nothing and answer exactly where the vendor cannot.
      const eodhdAt = Date.parse(fetched[key] || 0);
      const eodhdFresh = Number.isFinite(eodhdAt) && Date.now() - eodhdAt < maxAge;
      if (KEY && spent + 1 <= budget && !eodhdFresh) {
        try {
          spent++;
          const rows = await get(`${API}/search/${encodeURIComponent(key)}?api_token=${KEY}&fmt=json&limit=30`);
          // A miss is dated too. Without that, an ISIN the vendor does not carry would
          // be asked about on every single page view. The stamp is not a price: an
          // empty leaf still falls through to the Gulf boards and to Yahoo.
          fetched[key] = new Date().toISOString();
          if (Array.isArray(rows)) noteSearch(key, rows.filter((r) => String(r.ISIN || "").toUpperCase() === key));
          scheduleSave();
        } catch (e) {
          console.error(`prix ${key} chez EODHD : ${e.message}`);
        }
      }
      // The vendor knows nothing east of Suez. Only a Gulf ISIN is worth the catalogue
      // read this costs the first time, and only when the vendor has come back empty.
      if (!hasPrice(key) && GULF_COUNTRIES.has(key.slice(0, 2))) {
        await gulfFresh(key);
      }
      // EODHD does not carry the Kazakhstan Stock Exchange. The share page prints
      // the last in tenge; the bid and offer beside it are the day's extremes and
      // are not a book, so only the last is kept.
      if (!hasPrice(key) && key.startsWith("KZ")) {
        await kaseFresh(key);
      }
      if (!hasPrice(key)) {
        await yahooFresh(key);
        fallback[key] = new Date().toISOString();
        scheduleSave();
      }
      return prices[key];
    } catch (e) {
      console.error(`prix ${key} : ${e.message}`);
      return prices[key];
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}

// ---------------------------------------------------------------- KASE

// The vendor's search comes back empty for a Kazakh ISIN. KASE's own share page
// prints the last trade (`price`) and the currency. One page per ticker the
// catalogues already name; the first view builds that index.
let kaseIndexPromise = null;
function kaseIndex() {
  return (kaseIndexPromise ||= (async () => {
    const { catalogueRows } = await import("./catalogues.mjs");
    const index = new Map();
    for (const row of catalogueRows()) {
      const isin = String(row.isin || "").trim().toUpperCase();
      if (!ISIN.test(isin) || !isin.startsWith("KZ")) continue;
      const ex = String(row.exchange || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      if (ex !== "KASE" && ex !== "XKAZ") continue;
      const symbol = String(row.ticker || row.symbol || "").trim();
      if (!symbol) continue;
      const seen = index.get(isin) || index.set(isin, []).get(isin);
      if (!seen.includes(symbol)) seen.push(symbol);
    }
    return index;
  })());
}

function kaseQuote(state, symbol) {
  const want = String(symbol || "").toUpperCase();
  let hit = null;
  const walk = (node) => {
    if (hit || !node || typeof node !== "object") return;
    if (String(node.code || "").toUpperCase() === want && Number(node.price) > 0) {
      hit = node;
      return;
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(state);
  if (!hit) return null;
  return {
    symbol: want,
    last: Number(hit.price),
    currency: String(hit.currency_type || "KZT").toUpperCase(),
  };
}

async function kaseFresh(isin) {
  const symbols = (await kaseIndex()).get(isin) || [];
  for (const symbol of symbols.slice(0, 3)) {
    try {
      const res = await fetch(`https://kase.kz/en/investors/shares/${encodeURIComponent(symbol)}`, {
        headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const embedded = html.match(/<script id="ng-state" type="application\/json">(.*?)<\/script>/);
      if (!embedded) continue;
      const quote = kaseQuote(JSON.parse(embedded[1]), symbol);
      if (!quote) continue;
      noteBoard(isin, quote, "XKAZ");
      fetched[isin] = new Date().toISOString();
      scheduleSave();
      return true;
    } catch (e) {
      console.error(`prix ${isin} chez KASE ${symbol} : ${e.message}`);
    }
  }
  return false;
}

// ---------------------------------------------------------------- the sweep

// Every Gulf line at once, which is four requests rather than one per instrument. Manama
// needs a tab; without one the other three are still swept and the gap is said out loud
// rather than passed off as an empty board.
async function sweepGulf() {
  const { GULF_BOARDS } = await import("./gulf.mjs");
  let page = null;
  let browser = null;
  try {
    const { default: puppeteer } = await import("puppeteer-core");
    browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
    page = await browser.newPage();
  } catch (e) {
    console.error(`Manama sera sautée : pas de navigateur sur 9222 (${e.message.slice(0, 60)}).`);
  }
  const keys = Object.keys(GULF_BOARDS).filter((k) => !GULF_BOARDS[k].browser || page);
  const index = await gulfIndex();
  console.error(`${index.size} ISIN du Golfe dans les catalogues, ${keys.length} carnets à lire.`);

  let priced = 0;
  const wanted = new Set(index.keys());
  // Abu Dhabi names its own ISINs, so its board can price a line no catalogue lists.
  for (const key of keys) {
    const rows = await gulfBoard(key, GULF_BOARDS[key].browser ? page : null);
    for (const id of rows.keys()) if (ISIN.test(id)) wanted.add(id);
  }
  for (const isin of wanted) if (await gulfFresh(isin, { keys, page })) priced++;

  save();
  await page?.close();
  await browser?.disconnect();
  console.error(`${priced} ISIN du Golfe cotés. Écrit dans ${STORE_PATH}.`);
}

async function main() {
  if (has("gulf")) return sweepGulf();
  if (!KEY) {
    console.error("Pas de clé : mettre EODHD_API_KEY dans .env ou dans l'environnement.");
    process.exit(1);
  }
  const { catalogueRows } = await import("./catalogues.mjs");
  const one = arg("isin");
  const wanted = one
    ? [one.trim().toUpperCase()]
    : [
        ...new Set(
          catalogueRows()
            .map((r) => String(r.isin || "").trim().toUpperCase())
            .filter((i) => ISIN.test(i))
        ),
      ];
  const todo = has("refresh") ? wanted : wanted.filter((i) => !isFresh(i));
  console.error(`${wanted.length} ISIN au catalogue, ${todo.length} à interroger.`);

  const who = await get(`${API}/user?api_token=${KEY}&fmt=json`);
  if (who) {
    const used = Number(who.apiRequests) || 0;
    const daily = Math.max(0, (Number(who.dailyRateLimit) || 0) - used);
    const reserve = Number(who.extraLimit) || 0;
    // Two allowances that do not behave alike, and the vendor prints them side by side
    // as though they did. The daily one refills; the reserve drains and never comes
    // back, so spending it has to be asked for.
    budget = daily + (has("use-reserve") ? reserve : 0);
    console.error(
      `Formule « ${who.subscriptionType} » : ${daily} appels restants aujourd'hui ` +
        `(${used} sur ${who.dailyRateLimit} déjà faits), plus une réserve non renouvelable de ${reserve}` +
        (has("use-reserve") ? ", que --use-reserve autorise à entamer." : ", gardée intacte sans --use-reserve.")
    );
  }
  if (arg("budget")) budget = Math.min(budget, Number(arg("budget")));
  if (arg("limit")) todo.length = Math.min(todo.length, Number(arg("limit")));

  console.error(`Un appel par ISIN, soit ${todo.length} au total.`);
  if (todo.length > budget) {
    console.error(
      `\nLe quota n'y suffit pas : ${budget} appels disponibles pour ${todo.length} nécessaires.\n` +
        `La formule « EOD Historical Data — All World » (19,99 $/mois) porte la limite à 100 000 par jour.\n` +
        `Sinon le front se sert tout seul, un instrument à la fois, à mesure qu'on les consulte.`
    );
  }
  if (has("dry-run")) return;

  let done = 0;
  let hit = 0;
  const queue = [...todo];
  const worker = async () => {
    while (queue.length && spent < budget) {
      const isin = queue.shift();
      const got = await ensureFresh(isin, has("refresh") ? 0 : DAY);
      done++;
      if (got && Object.keys(got).length) hit++;
      if (done % 200 === 0) console.error(`  ${done}/${todo.length}, ${hit} cotés`);
    }
  };
  // Six at a time: enough to keep the link busy, far under what the vendor allows.
  await Promise.all(Array.from({ length: 6 }, worker));
  save();

  const priced = Object.keys(prices).length;
  console.error(
    `\n${hit} cotés sur ${done} interrogés. ${priced} ISIN ont un prix en tout. ` +
      `${spent} appels dépensés. Écrit dans ${STORE_PATH}.`
  );
}

if (IS_CLI) {
  main().catch((e) => {
    save();
    console.error(`\nArrêt : ${e.message}`);
    process.exit(1);
  });
}
