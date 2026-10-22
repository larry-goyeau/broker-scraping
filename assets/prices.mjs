// What one share costs, so that a fee expressed in percent can be turned into money.
// A fact about the instrument and not about any broker, so it sits in `assets/`
// beside the lists, and every `*_cost.mjs` reads the same figure.
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
// again. The four Gulf boards still publish their own last through `gulf.mjs`. The
// Zimbabwe sheet publishes its own last, in cents of a ZiG. VNDirect publishes
// the session close for HOSE, HNX and UPCoM, in thousands of dong. Lima's daily
// bulletin publishes the session close in soles or in dollars. Amman's
// daily bulletin publishes the session close in dinars. The Pakistan Stock
// Exchange's closing file publishes the session close in rupees. TradingView's
// Nigeria scanner publishes the NSENG session close in naira, at any hour.
// Everywhere else, a miss falls through to Yahoo's chart last, built from the
// catalogues' ticker and MIC (`F.TO`, `1111.SR`, `3565.T`). Enough to size an
// order, not to fill one. That keeps this file the only writer of `prices.json`
// while letting the lines no vendor sells stop being N/A.
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
//   node assets/prices.mjs                   balaie tout le catalogue
//   node assets/prices.mjs --limit=200       s'arrête après deux cents instruments
//   node assets/prices.mjs --isin=IE00B4L5Y983  un seul, pour voir
//   node assets/prices.mjs --refresh         réinterroge même ce qui est frais
//   node assets/prices.mjs --out=/tmp/p.json pour essayer sans écraser le vrai fichier
//   node assets/prices.mjs --dry-run         dit ce que ça coûterait et ne demande rien
//   node assets/prices.mjs --budget=50       ne dépense pas plus de cinquante appels
//   node assets/prices.mjs --use-reserve     autorise à entamer la réserve non renouvelable
//   node assets/prices.mjs --gulf            lit les carnets du Golfe, sans clé et sans quota
//   node assets/prices.mjs --amman           clôtures du bulletin quotidien d'Amman, sans clé
//   node assets/prices.mjs --psx             clôtures du fichier quotidien de la PSX, sans clé
//   node assets/prices.mjs --brvm            cours de clôture publiés par la BRVM, sans clé
//   node assets/prices.mjs --frontier        clôtures des bourses lues chez elles (frontierBoards.mjs), sans clé
//   node assets/prices.mjs --yahoo           clôtures Yahoo pour tout ISIN encore sans prix, sans clé
//
// The key lives in `.env` as EODHD_API_KEY, which `.gitignore` already keeps out of the
// repository.
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveVenue } from "../spreads/venues.mjs";

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
const STORE_PATH = (IS_CLI && arg("out")) || path.join(HERE, "prices.json");

// ---------------------------------------------------------------- the key

// Missing on the front is not fatal: the page then serves whatever is already on disk
// and simply stops refreshing. Missing on a sweep is, since a sweep has nothing else
// to do.
function readKey() {
  if (process.env.EODHD_API_KEY) return process.env.EODHD_API_KEY.trim();
  const env = path.join(HERE, "..", ".env");
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

// Johannesburg and Tel Aviv quote in the minor unit: cents of a rand (ZAC),
// agorot of a shekel (ILA). The listings are in rand and shekels, and only
// London's pence have their own key (GBX) that fx.mjs knows.
const MINOR = { ZAC: "ZAR", ILA: "ILS" };

/** One leaf's `price` from its sources: the primary one, else the first. */
function settle(leaf) {
  const best = Object.values(leaf.from || {}).find((x) => x.primary) || Object.values(leaf.from || {})[0];
  leaf.price = best ? best.price : null;
  leaf.at = best ? best.at : null;
}

// Stored before the minor units were known: Johannesburg lasts in cents
// filed as rand (Cashbuild 9750 for R97.50), and vendor quotes left under
// ZAC or ILA, which no listing asks for. Run once; the store remembers it.
store.migrations ||= [];
if (!store.migrations.includes("minor-units")) {
  for (const byCcy of Object.values(prices)) {
    const zar = byCcy.ZAR;
    if (zar?.from) {
      for (const [key, x] of Object.entries(zar.from)) if (key.startsWith("XJSE:")) x.price = Number((x.price / 100).toPrecision(8));
      settle(zar);
    }
    for (const [minor, major] of Object.entries(MINOR)) {
      const leaf = byCcy[minor];
      if (!leaf?.from) continue;
      const into = (byCcy[major] ||= { price: null, at: null, from: {} });
      for (const [key, x] of Object.entries(leaf.from)) into.from[key] = { ...x, price: Number((x.price / 100).toPrecision(8)) };
      delete byCcy[minor];
      settle(into);
    }
  }
  store.migrations.push("minor-units");
  scheduleSave();
}
function save() {
  if (!dirty) return;
  dirty = false;
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(
    STORE_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "EODHD, les bourses du Golfe, KASE pour un last en tenge, la clôture VNDirect pour une action ou un ETF du Vietnam, le bulletin de Lima pour une clôture en soles ou en dollars, le bulletin d'Amman pour une clôture en dinars, le fichier de clôture de la PSX pour une clôture en roupies, la clôture NSENG pour un last en naira, et Yahoo pour un last quand le vendeur n'a rien",
        unit: UNIT,
        migrations: store.migrations,
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
  // KASE and the PSE publish the last for nothing, the same way the Gulf
  // boards do. A miss from the vendor must not sit on that page for a day.
  if (GULF_COUNTRIES.has(key.slice(0, 2)) || key.startsWith("KZ") || key.startsWith("ZW") || key.startsWith("VN") || key.startsWith("PH") || key.startsWith("BD")) return false;
  const fb = Date.parse(fallback[key] || 0);
  // A miss from before the ISIN search never asked Yahoo for the identifier.
  if (!(fb >= YAHOO_BOARDS_AT) || !(fb >= YAHOO_OTC_AT) || !(fb >= YAHOO_ISIN_AT)) return false;
  if (key.startsWith("CN") && !(fb >= YAHOO_CONNECT_AT)) return false;
  if ((key.startsWith("ZA") || key.startsWith("IL")) && !(fb >= YAHOO_MINOR_AT)) return false;
  return Date.now() - fb < maxAge;
}

// ---------------------------------------------------------------- the vendor

const API = "https://eodhd.com/api";
let spent = 0;
let budget = Infinity;
// Set when the vendor answers 402/403: no call until then.
let quotaOutUntil = 0;

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
      // EODHD takes about 28 s to say so, and a page view waited that long
      // for every instrument: stop asking until the next day.
      if (r.status === 402 || r.status === 403) {
        quotaOutUntil = Date.now() + DAY;
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
    const quoted = String(r.Currency || "").trim().toUpperCase();
    const ccy = MINOR[quoted] || quoted;
    const px = Number(r.previousClose) / (MINOR[quoted] ? 100 : 1);
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
      import("../catalogues.mjs"),
      import("../spreads/venues.mjs"),
      import("../spreads/gulf.mjs"),
    ]);
    const mics = new Set(Object.values(GULF_BOARDS).map((b) => b.mic));
    const { gulfSymbol } = await import("../spreads/gulf.mjs");
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
    const { readGulfBoard } = await import("../spreads/gulf.mjs");
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
  const { GULF_BOARDS } = await import("../spreads/gulf.mjs");
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
  XTKS: ".T",
  XASX: ".AX",
  XSES: ".SI",
  XKRX: ".KS",
  XKOS: ".KQ",
  XMAD: ".MC",
  XWAR: ".WA",
  XSAU: ".SR",
  // Pakistan Stock Exchange. Yahoo's last is the ticker plus .KA, in rupees.
  // This is the same listing's last, not a book.
  XKAR: ".KA",
  // Johannesburg. Yahoo charts it in cents of a rand (ZAc); yahooChart
  // turns that into rand.
  XJSE: ".JO",
  // Shanghai and Shenzhen A-shares. Yahoo's last is the six-digit code.
  XSHG: ".SS",
  XSHE: ".SZ",
  XBUD: ".BD",
  XPRA: ".PR",
  // Yahoo charts a US OTC name as the bare ticker. There is no suffix.
  OTCM: "",
};
// Venues with no adapter still name themselves in the catalogue. The suffix is
// Yahoo's, so a last can be read where the vendor's search is empty.
const YAHOO_EXCHANGE = {
  SGX: ".SI",
  SGXST: ".SI",
  HKEX: ".HK",
  SEHK: ".HK",
  SSE: ".SS",
  CNSGSE: ".SS",
  SEHKNTL: ".SS",
  SEHKSTAR: ".SS",
  XSHE: ".SZ",
  SZSE: ".SZ",
  SEHKSZSE: ".SZ",
  CHINEXT: ".SZ",
  BUX: ".BD",
  PRA: ".PR",
  PURE: ".CN",
  SGX: ".SI",
  SGXST: ".SI",
  TWSE: ".TW",
  TPEX: ".TWO",
  SET: ".BK",
  IDX: ".JK",
  MYX: ".KL",
  JSE: ".JO",
  NZX: ".NZ",
  TASE: ".TA",
  BIST: ".IS",
  QSE: ".QA",
  QATAR: ".QA",
  PSE: ".PS",
  PSX: ".KA",
  PAKISTANSTOCKEXCHANGE: ".KA",
  // Bucharest. EODHD's search is empty for the small names. Yahoo's last
  // is the ticker plus .RO, the same listing, not a book.
  BVB: ".RO",
  ASX: ".AX",
  TYO: ".T",
  HOSE: ".VN",
  HNX: ".HN",
  // Tadawul sells the book and publishes the last. Yahoo's suffix is .SR, for a
  // numeric code (4015.SR) and for a name (FLYNAS) once the search has found the code.
  TADAWUL: ".SR",
  TDWL: ".SR",
  SAUDI: ".SR",
  SAUDIEXCHANGE: ".SR",
  XSAU: ".SR",
};
// A miss recorded before these suffixes existed never asked Tokyo, Hong Kong,
// Shanghai or the other boards above. It does not count as a try.
const YAHOO_BOARDS_AT = Date.parse("2026-09-29T19:12:00Z");
// OTC was not asked at all until the bare ticker was added. A miss from
// before that is not a try.
const YAHOO_OTC_AT = Date.parse("2026-09-30T15:50:00Z");
// VALUE and the other unnamed boards had no suffix, so the ISIN was never
// searched. A miss from before that search is not a try.
const YAHOO_ISIN_AT = Date.parse("2026-10-02T23:28:00Z");
// Stock Connect had no Yahoo suffix, so a Chinese miss never asked 600519.SS.
// A miss from before that is not a try.
const YAHOO_CONNECT_AT = Date.parse("2026-10-13T15:05:00Z");
// Johannesburg had no Yahoo suffix by MIC, and a last in cents (ZAc) or
// agorot (ILA) was thrown away as another currency. A miss from before
// that is not a try.
const YAHOO_MINOR_AT = Date.parse("2026-10-18T22:40:00Z");
const YAHOO_US = new Set(["XNYS", "XNAS", "ARCX", "XASE", "BATS"]);
const YAHOO_ALREADY = /\.[A-Z]{1,3}$/;

function yahooCurrency(raw) {
  const s = String(raw || "");
  if (s === "GBp" || s.toUpperCase() === "GBX") return "GBX";
  return s.toUpperCase();
}

function yahooBody(stem, suffix) {
  if (suffix === ".HK" && /^\d+$/.test(stem)) return stem.padStart(4, "0");
  return stem;
}

function yahooSymbol(ticker, mic, isin, exchange) {
  let stem = String(ticker || "")
    .toUpperCase()
    .replace(/\*/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!stem) return null;
  stem = stem.replace(/\.+$/, "");
  if (!stem) return null;
  // Colombo writes the voting class after a dot (JKH.N0000); Yahoo charts it
  // as JKH-N0000.CM. The catalogues say CSE, which Toronto's Canadian
  // Securities Exchange also uses, so the ISIN tells them apart.
  if (/^(CSE|XCOL)$/.test(String(exchange || mic || "").toUpperCase()) && String(isin || "").toUpperCase().startsWith("LK")) {
    return `${stem.replace(/\./g, "-")}.CM`;
  }
  if (YAHOO_ALREADY.test(stem)) return stem;
  if (/^\d{4}$/.test(stem) && String(isin || "").startsWith("SA")) return `${stem}.SR`;
  if (mic && mic in YAHOO_SUFFIX) return `${yahooBody(stem, YAHOO_SUFFIX[mic])}${YAHOO_SUFFIX[mic]}`;
  // EODHD does not carry the small BSE names. Yahoo's own BSE and NSE lasts
  // use .BO and .NS. The series tail (-EQ, -X, …) is not part of that symbol.
  // This is the same listing's last, not a book and not another venue's tape.
  const ex = String(exchange || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const id = String(isin || "").toUpperCase();
  // EODHD does not carry the newer KRX codes. Yahoo's KOSPI and KOSDAQ lasts
  // use .KS and .KQ. This is the same listing's last, not a book.
  if (ex === "KOSPI" || ex === "XKRX") return `${stem}.KS`;
  if (ex === "KOSDAQ" || ex === "XKOS") return `${stem}.KQ`;
  // stocks.csv writes TSE with no currency. The ISIN is what splits Tokyo from Toronto.
  if ((ex === "TSE" || ex === "TYO") && id.startsWith("JP")) return `${stem}.T`;
  if (ex === "TSE" && id.startsWith("CA")) return `${stem}.TO`;
  if (YAHOO_EXCHANGE[ex]) return `${yahooBody(stem, YAHOO_EXCHANGE[ex])}${YAHOO_EXCHANGE[ex]}`;
  const india = id.startsWith("IN");
  const suffix = india && (ex === "BSE" || ex === "XBOM") ? ".BO" : india && (ex === "NSE" || ex === "XNSE") ? ".NS" : "";
  if (!suffix) return null;
  stem = stem.replace(/-(EQ|BE|BZ|SM|ST|IV|RR|XT|ZP|MT|TS|MS|A|B|T|X|Z|M|P|R|E)$/, "");
  return stem ? `${stem}${suffix}` : null;
}

function yahooCandidates(ticker, mic, isin, exchange) {
  const found = [];
  const primary = yahooSymbol(ticker, mic, isin, exchange);
  if (primary) found.push(primary);
  const ex = String(exchange || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // The catalogue writes KRX for both boards. Ask each suffix; a miss is not stored.
  if (ex === "KRX") {
    const stem = String(ticker || "")
      .toUpperCase()
      .replace(/\*/g, "")
      .replace(/\s+/g, "")
      .trim();
    if (stem && !YAHOO_ALREADY.test(stem)) found.push(`${stem}.KS`, `${stem}.KQ`);
  }
  return [...new Set(found)];
}

let yahooIndexPromise = null;
/** ISIN -> [{ symbol, currency, mic }], one row per distinct Yahoo symbol. */
function yahooIndex() {
  return (yahooIndexPromise ||= (async () => {
    const [{ catalogueRows }, { resolveVenue }] = await Promise.all([
      import("../catalogues.mjs"),
      import("../spreads/venues.mjs"),
    ]);
    const index = new Map();
    for (const row of catalogueRows()) {
      const isin = String(row.isin || "").trim().toUpperCase();
      if (!ISIN.test(isin)) continue;
      const mic = resolveVenue(row).venue?.mic || "";
      const symbols = yahooCandidates(row.ticker || row.symbol, mic, isin, row.exchange || row.venue);
      if (!symbols.length) continue;
      const currency = String(row.currency || "").trim().toUpperCase();
      const name = String(row.name || "").trim();
      const ticker = String(row.ticker || row.symbol || "").trim();
      const seen = index.get(isin) || index.set(isin, []).get(isin);
      for (const symbol of symbols) {
        const prev = seen.find((s) => s.symbol === symbol);
        // The same Yahoo symbol can be filed under two catalogue currencies.
        // Keeping only the first one dropped a riyal last because one row said EUR.
        if (!prev) seen.push({ symbol, currency, mic, name, ticker });
        else if (currency && currency !== prev.currency && !seen.some((s) => s.symbol === symbol && s.currency === currency)) {
          seen.push({ symbol, currency, mic, name, ticker });
        }
      }
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

async function yahooChart(symbol, tries = 0) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
    { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) }
  );
  if (res.status === 429 && tries < 3) {
    await new Promise((s) => setTimeout(s, 2000 * (tries + 1)));
    return yahooChart(symbol, tries + 1);
  }
  if (!res.ok) return null;
  const j = await res.json();
  const meta = j?.chart?.result?.[0]?.meta;
  const last = Number(meta?.regularMarketPrice ?? meta?.chartPreviousClose);
  // Tadawul sometimes prints the last and leaves the currency blank. The board
  // quotes riyals, and a blank is not a different currency.
  let currency = yahooCurrency(meta?.currency);
  if (!currency && String(symbol).endsWith(".SR")) currency = "SAR";
  if (!(last > 0) || !currency) return null;
  // Johannesburg and Tel Aviv chart in the minor unit: cents of a rand,
  // agorot of a shekel. The listings are in rand and shekels.
  if (MINOR[currency]) return { last: last / 100, currency: MINOR[currency] };
  return { last, currency };
}

// A Tadawul name (FLYNAS, AZM) is not the code Yahoo charts. The search answer
// on the Saudi board is the numeric symbol, and only that board is kept.
async function yahooSaudiCode(ticker, name) {
  const stem = String(ticker || "")
    .toUpperCase()
    .replace(/\.+$/, "")
    .trim();
  if (/^\d{4}$/.test(stem)) return `${stem}.SR`;
  const queries = [stem, stem && `Saudi ${stem}`, name].filter(Boolean);
  for (const q of queries) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`,
        { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) continue;
      const hit = ((await res.json()).quotes || []).find(
        (row) => row?.exchange === "SAU" && String(row.symbol || "").endsWith(".SR")
      );
      if (hit) return hit.symbol;
    } catch {
      /* the chart miss stands */
    }
  }
  return null;
}

// VALUE and the other unnamed boards build no Yahoo symbol: there is no
// suffix for a place the catalogue does not name. The ISIN search returns
// the equity Yahoo charts (6274 on VALUE is 6274.TWO). A last in a currency
// no listing of this ISIN uses is still refused by the caller.
async function yahooIsinSymbols(isin) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=6&newsCount=0`,
      { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) return [];
    const quotes = (await res.json()).quotes || [];
    const symbols = [];
    for (const row of quotes) {
      const kind = String(row?.quoteType || "").toUpperCase();
      const symbol = String(row?.symbol || "").trim();
      if (!symbol || (kind !== "EQUITY" && kind !== "ETF")) continue;
      if (!symbols.includes(symbol)) symbols.push(symbol);
    }
    return symbols.slice(0, 4);
  } catch {
    return [];
  }
}

function currenciesOf(listings) {
  const set = new Set();
  for (const row of listings || []) {
    const ccy = String(row.currency || "").trim().toUpperCase();
    if (ccy) set.add(ccy);
  }
  return set;
}

// Rows the front already holds for this ISIN. Building them here avoids
// reading every catalogue again: that second copy is what ran the page out
// of memory the first time a Chinese line missed the vendor.
function rowsFromListings(isin, listings) {
  const seen = [];
  for (const row of listings || []) {
    // The page's listing names the place as the catalogue wrote it ("LSE") and
    // does not carry the MIC. Without that, Yahoo never hears of RR.L.
    const place = row.exchangeRaw || row.exchange || row.venue || "";
    const mic = row.mic || resolveVenue({ exchange: place, isin, currency: row.currency }).venue?.mic || "";
    const symbols = yahooCandidates(row.ticker || row.symbol, mic, isin, place);
    const currency = String(row.currency || "").trim().toUpperCase();
    const name = String(row.name || "").trim();
    const ticker = String(row.ticker || row.symbol || "").trim();
    for (const symbol of symbols) {
      if (!seen.some((s) => s.symbol === symbol && s.currency === currency)) {
        seen.push({ symbol, currency, mic: row.mic || "", name, ticker });
      }
    }
  }
  return seen;
}

async function yahooFresh(isin, prepared, currencies = null) {
  // A page that already handed over its rows must not walk every catalogue.
  // An empty list means those rows named no board. The sweep passes nothing
  // and still uses the index.
  const rows = [...(prepared != null ? prepared : (await yahooIndex()).get(isin) || [])].sort((a, b) => yahooRank(a) - yahooRank(b));
  const wanted = new Set(rows.map((r) => r.currency).filter(Boolean));
  if (currencies) for (const ccy of currencies) wanted.add(ccy);
  let found = false;
  let asked = 0;
  const known = new Set();
  for (const row of rows.slice(0, 6)) {
    try {
      let symbol = row.symbol;
      known.add(symbol);
      asked += 1;
      let quote = await yahooChart(symbol);
      if (!quote && symbol.endsWith(".SR") && !/^\d{4}\.SR$/.test(symbol)) {
        const code = await yahooSaudiCode(row.ticker, row.name);
        if (code && code !== symbol) {
          symbol = code;
          quote = await yahooChart(symbol);
        }
      }
      if (!quote) continue;
      // Shanghai and Shenzhen print the close in onshore yuan. A Stock
      // Connect line is the same share in offshore yuan, the same unit.
      const currency = quote.currency === "CNY" && wanted.has("CNH") ? "CNH" : quote.currency;
      // A last in a currency no listing of this ISIN uses is a different
      // instrument that happens to share a ticker (OR Royalties vs L'Oréal).
      if (wanted.size && !wanted.has(currency)) continue;
      noteBoard(isin, { symbol, last: quote.last, currency }, "YAHOO");
      found = true;
      if (hasPrice(isin) && [...wanted].every((ccy) => Number(prices[isin]?.[ccy]?.price) > 0)) break;
    } catch (e) {
      console.error(`prix ${isin} chez Yahoo ${row.symbol} : ${e.message}`);
    }
  }
  // The venue named no board, or the suffix it implied was a miss. The ISIN
  // is the same question for every country Yahoo files.
  if (!found) {
    for (const symbol of await yahooIsinSymbols(isin)) {
      if (known.has(symbol)) continue;
      asked += 1;
      try {
        const quote = await yahooChart(symbol);
        if (!quote) continue;
        if (wanted.size && !wanted.has(quote.currency)) continue;
        noteBoard(isin, { symbol, last: quote.last, currency: quote.currency }, "YAHOO");
        found = true;
        if (hasPrice(isin) && [...wanted].every((ccy) => Number(prices[isin]?.[ccy]?.price) > 0)) break;
      } catch (e) {
        console.error(`prix ${isin} chez Yahoo ${symbol} : ${e.message}`);
      }
    }
  }
  return { found, asked };
}

const inflight = new Map();

/**
 * Make sure this ISIN has been priced within `maxAge`, asking the vendor if not.
 * Never throws at the caller: a page that cannot refresh still has to render.
 * Returns the per-currency map, which may be undefined if nothing is known.
 */
// Yahoo has no Nagoya suffix. The touch file keeps the session's last
// trade beside the book. A name the vendor does not carry is priced from
// that print, and only while the file is from today's session.
let nagoyaRows = null;
function nagoyaTouch() {
  if (nagoyaRows) return nagoyaRows;
  nagoyaRows = new Map();
  const path = new URL("../spreads/nagoya-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return nagoyaRows;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return nagoyaRows;
  for (const row of data.rows || []) {
    const isin = String(row.isin || "").toUpperCase();
    if (isin) nagoyaRows.set(isin, row);
  }
  return nagoyaRows;
}

function nagoyaFresh(isin) {
  const row = nagoyaTouch().get(isin);
  const last = Number(row?.last);
  if (!(last > 0)) return false;
  noteBoard(isin, { currency: "JPY", last, symbol: row.code || isin }, "XNGO");
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

// Yahoo does not chart these seven names. The prices page prints the last
// beside the book. A name is priced from that print only while the file
// is from today's session.
let bequotedRows = null;
function bequotedTouch() {
  if (bequotedRows) return bequotedRows;
  bequotedRows = new Map();
  const path = new URL("../spreads/bequoted-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return bequotedRows;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return bequotedRows;
  for (const row of data.rows || []) {
    const isin = String(row.isin || "").toUpperCase();
    if (isin) bequotedRows.set(isin, row);
  }
  return bequotedRows;
}

function bequotedFresh(isin) {
  const row = bequotedTouch().get(isin);
  const last = Number(row?.last);
  if (!(last > 0)) return false;
  noteBoard(isin, { currency: "SEK", last, symbol: row.name || isin }, "XXXX");
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

// Yahoo has no Lagos suffix for these names. The touch file is today's
// NSENG book and only exists during the Lagos session. A last trade prices
// the line; a name that did not print is priced at the mid of the same
// two-sided book. Overnight, the Nigeria scanner's session close does the
// same job. It sizes the order. It is not a book.
const NGX_SCAN = "https://scanner.tradingview.com/nigeria/scan";
let ngxClosePromise = null;

function nsengCodes() {
  const codes = new Set();
  for (const file of ["stocks.csv", "etfs.csv"]) {
    const csvPath = new URL(`./${file}`, import.meta.url);
    if (!fs.existsSync(csvPath)) continue;
    for (const line of fs.readFileSync(csvPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^NSENG:([^,]+),/i);
      if (match) codes.add(match[1].toUpperCase());
    }
  }
  return [...codes];
}

function keepNgx(map, row) {
  const [code, close, currency, isin] = row?.d || [];
  const id = String(isin || "").trim().toUpperCase();
  const ccy = String(currency || "").trim().toUpperCase();
  const last = Number(close);
  const symbol = String(code || "").trim().toUpperCase();
  if (!ISIN.test(id) || ccy !== "NGN" || !(last > 0) || !symbol) return;
  map.set(id, { symbol, last });
}

function ngxCloses() {
  if (ngxClosePromise && Date.now() - ngxClosePromise.at < BOARD_TTL) return ngxClosePromise.rows;
  const rows = (async () => {
    const map = new Map();
    let start = 0;
    for (;;) {
      const response = await fetch(NGX_SCAN, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://www.tradingview.com",
          "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify({
          symbols: { query: { types: [] }, tickers: [] },
          columns: ["name", "close", "currency", "isin"],
          sort: { sortBy: "name", sortOrder: "asc" },
          range: [start, start + 500],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`${response.status}`);
      const data = await response.json();
      const page = Array.isArray(data.data) ? data.data : [];
      for (const row of page) keepNgx(map, row);
      const total = Number(data.totalCount) || page.length;
      start += page.length;
      if (!page.length || start >= total) break;
    }
    const seen = new Set([...map.values()].map((row) => row.symbol));
    const missing = nsengCodes().filter((code) => !seen.has(code));
    for (let i = 0; i < missing.length; i += 80) {
      const tickers = missing.slice(i, i + 80).map((code) => `NSENG:${code}`);
      const response = await fetch(NGX_SCAN, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://www.tradingview.com",
          "User-Agent": "Mozilla/5.0",
        },
        body: JSON.stringify({
          symbols: { tickers },
          columns: ["name", "close", "currency", "isin"],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`${response.status}`);
      const data = await response.json();
      for (const row of data.data || []) keepNgx(map, row);
    }
    return map;
  })().catch((error) => {
    ngxClosePromise = null;
    console.error(`clôture NSENG : ${error.message}`);
    return new Map();
  });
  ngxClosePromise = { at: Date.now(), rows };
  return rows;
}

async function ngxClose(isin) {
  const row = (await ngxCloses()).get(isin);
  if (!row) return false;
  noteBoard(isin, { currency: "NGN", last: row.last, symbol: row.symbol }, "XNGN");
  fallback[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

async function sweepNgx() {
  const board = await ngxCloses();
  let priced = 0;
  for (const isin of board.keys()) if (await ngxClose(isin)) priced++;
  save();
  console.error(`${priced} clôtures NSENG. Écrit dans ${STORE_PATH}.`);
}
let ngxRows = null;
function ngxTouch() {
  if (ngxRows) return ngxRows;
  ngxRows = new Map();
  const path = new URL("../spreads/ngx-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return ngxRows;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return ngxRows;
  for (const row of data.rows || []) {
    const isin = String(row.isin || "").toUpperCase();
    if (isin) ngxRows.set(isin, row);
  }
  return ngxRows;
}

function ngxFresh(isin) {
  const row = ngxTouch().get(isin);
  const last = Number(row?.last);
  const bid = Number(row?.bid);
  const ask = Number(row?.ask);
  const price = last > 0 ? last : bid > 0 && ask >= bid ? (bid + ask) / 2 : 0;
  if (!(price > 0)) return false;
  noteBoard(isin, { currency: "NGN", last: price, symbol: row.code || isin }, "XNGN");
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

// Yahoo's .IS suffix misses these three Istanbul lines. The touch file is
// today's BIST book, in lira.
let bistRows = null;
function bistTouch() {
  if (bistRows) return bistRows;
  bistRows = new Map();
  const path = new URL("../spreads/bist-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return bistRows;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return bistRows;
  for (const row of data.rows || []) {
    const isin = String(row.isin || "").toUpperCase();
    if (isin) bistRows.set(isin, row);
  }
  return bistRows;
}

function bistFresh(isin) {
  const row = bistTouch().get(isin);
  const last = Number(row?.last);
  const bid = Number(row?.bid);
  const ask = Number(row?.ask);
  const price = last > 0 ? last : bid > 0 && ask >= bid ? (bid + ask) / 2 : 0;
  if (!(price > 0)) return false;
  noteBoard(isin, { currency: "TRY", last: price, symbol: row.code || isin }, "XIST");
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

// Yahoo has no Bogota suffix for this name. The touch file is today's
// BVC book, in pesos.
let bvcRows = null;
function bvcTouch() {
  if (bvcRows) return bvcRows;
  bvcRows = new Map();
  const path = new URL("../spreads/bvc-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return bvcRows;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return bvcRows;
  for (const row of data.rows || []) {
    const isin = String(row.isin || "").toUpperCase();
    if (isin) bvcRows.set(isin, row);
  }
  return bvcRows;
}

function bvcFresh(isin) {
  const row = bvcTouch().get(isin);
  const last = Number(row?.last);
  const bid = Number(row?.bid);
  const ask = Number(row?.ask);
  const price = last > 0 ? last : bid > 0 && ask >= bid ? (bid + ask) / 2 : 0;
  if (!(price > 0)) return false;
  noteBoard(isin, { currency: "COP", last: price, symbol: row.code || isin }, "XBOG");
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

// Yahoo has no Sofia suffix for these names. The touch file is today's
// BSESOF book, in euro.
let sofiaRows = null;
function sofiaTouch() {
  if (sofiaRows) return sofiaRows;
  sofiaRows = new Map();
  const path = new URL("../spreads/sofia-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return sofiaRows;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return sofiaRows;
  for (const row of data.rows || []) {
    const isin = String(row.isin || "").toUpperCase();
    if (isin) sofiaRows.set(isin, row);
  }
  return sofiaRows;
}

let csecyRows = null;
function csecyTouch() {
  if (csecyRows) return csecyRows;
  csecyRows = new Map();
  const path = new URL("../spreads/csecy-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return csecyRows;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Nicosia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return csecyRows;
  for (const row of data.rows || []) {
    const isin = String(row.isin || "").toUpperCase();
    if (isin) csecyRows.set(isin, row);
  }
  return csecyRows;
}

let setRows = null;
function setTouch() {
  if (setRows) return setRows;
  setRows = new Map();
  const path = new URL("../spreads/set-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return setRows;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return setRows;
  for (const row of data.rows || []) {
    const isin = String(row.isin || "").toUpperCase();
    if (isin && (row.currencies || []).includes("THB")) setRows.set(isin, row);
  }
  return setRows;
}

// Singapore's public book is the session touch. The mid sizes an order
// when the vendor has no last in that counter. A second currency on the
// same ISIN is its own price and is not copied.
let sgxRows = null;
function sgxTouch() {
  if (sgxRows) return sgxRows;
  sgxRows = new Map();
  const path = new URL("../spreads/sgx-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return sgxRows;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  for (const row of data.rows || []) {
    if (!String(row.stamp || "").startsWith(today)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!ISIN.test(isin)) continue;
    const list = sgxRows.get(isin) || [];
    list.push(row);
    sgxRows.set(isin, list);
  }
  return sgxRows;
}

function sgxFresh(isin) {
  const rows = sgxTouch().get(isin);
  if (!rows) return false;
  let wrote = false;
  for (const row of rows) {
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) continue;
    if (Number(prices[isin]?.[currency]?.price) > 0) continue;
    const bid = Number(row.bid);
    const ask = Number(row.ask);
    const price = bid > 0 && ask >= bid ? (bid + ask) / 2 : 0;
    if (!(price > 0)) continue;
    noteBoard(isin, { currency, last: price, symbol: row.code || isin }, "XSES");
    wrote = true;
  }
  if (!wrote) return false;
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

// FSMOne publishes a last close for every US OTC line it sells. That
// close sizes the broker fee. It is not a bid and an ask, so it is
// never written as a spread.
const FSM_OTC = "https://www.fsmone.com.my/rest/stock/stock-data/security-type/read";
let fsmOtcPromise = null;
function fsmOtcSheet() {
  return (fsmOtcPromise ||= (async () => {
    const sheet = new Map();
    const headers = {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://www.fsmone.com.my",
      Referer: "https://www.fsmone.com.my/stocks/tools/stocks-screener",
    };
    let page = 1;
    let total = Infinity;
    while (page <= total) {
      const url = `${FSM_OTC}?page=${page}&size=2000&exchange=USOTC&lastPrice=true&sort=stockCode,asc`;
      const response = await fetch(url, { method: "POST", headers, body: "{}", signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`FSMOne OTC ${response.status}`);
      const payload = await response.json();
      const data = payload.data || {};
      const batch = data.result;
      total = Number(data.totalCounts) || 0;
      if (!Array.isArray(batch) || !batch.length) break;
      for (const row of batch) {
        const isin = String(row.isin || "").trim().toUpperCase();
        const currency = String(row.stockCurrency || "").trim().toUpperCase();
        const last = Number(row.lastPrice);
        if (!ISIN.test(isin) || !/^[A-Z]{3}$/.test(currency) || !(last > 0)) continue;
        if (!sheet.has(isin)) sheet.set(isin, { currency, last, symbol: row.ifastTicker || row.stockCode || isin });
      }
      if (batch.length < 2000) break;
      page += batch.length;
    }
    return sheet;
  })());
}

async function fsmOtcFresh(isin) {
  const row = (await fsmOtcSheet()).get(isin);
  if (!row) return false;
  if (Number(prices[isin]?.[row.currency]?.price) > 0) return false;
  noteBoard(isin, row, "USOTC");
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

async function sweepFsmOtc() {
  const sheet = await fsmOtcSheet();
  let hit = 0;
  for (const isin of sheet.keys()) if (await fsmOtcFresh(isin)) hit += 1;
  save();
  console.error(`${hit} cours OTC écrits. ${Object.keys(prices).length} ISIN ont un prix en tout.`);
}

function sweepSgx() {
  let hit = 0;
  for (const isin of sgxTouch().keys()) if (sgxFresh(isin)) hit += 1;
  save();
  console.error(`${hit} cours de Singapour écrits. ${Object.keys(prices).length} ISIN ont un prix en tout.`);
}

function setFresh(isin) {
  const row = setTouch().get(isin);
  const last = Number(row?.last);
  const bid = Number(row?.bid);
  const ask = Number(row?.ask);
  const price = last > 0 ? last : bid > 0 && ask >= bid ? (bid + ask) / 2 : 0;
  if (!(price > 0)) return false;
  noteBoard(isin, { currency: "THB", last: price, symbol: row.code || isin }, "XBKK");
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

// Nxchange and NPEX: the last each venue prints beside its standing order
// book (spreads/nxchange-touch.mjs, spreads/npex-touch.mjs). The book rests
// between sessions, so a reading up to a week old still names the last.
const MTF_TOUCH = { XNXC: "../spreads/nxchange-touch.json", NPEX: "../spreads/npex-touch.json" };
const mtfRows = new Map();
function mtfTouch(mic) {
  if (mtfRows.has(mic)) return mtfRows.get(mic);
  const rows = new Map();
  mtfRows.set(mic, rows);
  const path = new URL(MTF_TOUCH[mic], import.meta.url);
  if (!fs.existsSync(path)) return rows;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const age = (Date.now() - Date.parse(`${data.date}T00:00:00Z`)) / DAY;
  if (!(age >= -1 && age <= 7)) return rows;
  for (const row of data.rows || []) if (Number(row.last) > 0) rows.set(String(row.isin || "").toUpperCase(), row);
  return rows;
}

function mtfFresh(isin) {
  for (const mic of Object.keys(MTF_TOUCH)) {
    const row = mtfTouch(mic).get(isin);
    if (!row) continue;
    noteBoard(isin, { currency: "EUR", last: Number(row.last), symbol: row.code || isin }, mic);
    fetched[isin] = new Date().toISOString();
    scheduleSave();
    return true;
  }
  return false;
}

let psxRows = null;
function psxTouch() {
  if (psxRows) return psxRows;
  psxRows = new Map();
  const path = new URL("../spreads/psx-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return psxRows;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return psxRows;
  for (const row of data.rows || []) {
    const isin = String(row.isin || "").toUpperCase();
    if (isin && (row.currencies || []).includes("PKR")) psxRows.set(isin, row);
  }
  return psxRows;
}

let moexRows = null;
function moexTouch() {
  if (moexRows) return moexRows;
  moexRows = new Map();
  const path = new URL("../spreads/moex-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return moexRows;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return moexRows;
  for (const row of data.rows || []) {
    const isin = String(row.isin || "").toUpperCase();
    if (isin && (row.currencies || []).includes("RUB") && !moexRows.has(isin)) moexRows.set(isin, row);
  }
  return moexRows;
}

let taseRows = null;
function taseTouch() {
  if (taseRows) return taseRows;
  taseRows = new Map();
  const path = new URL("../spreads/tase-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return taseRows;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return taseRows;
  for (const row of data.rows || []) {
    const isin = String(row.isin || "").toUpperCase();
    if (isin && !taseRows.has(isin)) taseRows.set(isin, row);
  }
  return taseRows;
}

let xcasRows = null;
function xcasTouch() {
  if (xcasRows) return xcasRows;
  xcasRows = new Map();
  const path = new URL("../spreads/xcas-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return xcasRows;
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return xcasRows;
  for (const row of data.rows || []) {
    const isin = String(row.isin || "").toUpperCase();
    if (isin && (row.currencies || []).includes("MAD") && !xcasRows.has(isin)) xcasRows.set(isin, row);
  }
  return xcasRows;
}

function xcasFresh(isin) {
  const row = xcasTouch().get(isin);
  const last = Number(row?.last);
  const bid = Number(row?.bid);
  const ask = Number(row?.ask);
  const price = last > 0 ? last : bid > 0 && ask >= bid ? (bid + ask) / 2 : 0;
  if (!(price > 0)) return false;
  noteBoard(isin, { currency: "MAD", last: price, symbol: row.code || isin }, "XCAS");
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

function taseFresh(isin) {
  const row = taseTouch().get(isin);
  const scale = String(row?.unit || "ILA").toUpperCase() === "ILS" ? 1 : 100;
  const last = Number(row?.last) / scale;
  const bid = Number(row?.bid) / scale;
  const ask = Number(row?.ask) / scale;
  const price = last > 0 ? last : bid > 0 && ask >= bid ? (bid + ask) / 2 : 0;
  if (!(price > 0)) return false;
  noteBoard(isin, { currency: "ILS", last: price, symbol: row.code || isin }, "XTAE");
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

function moexFresh(isin) {
  const row = moexTouch().get(isin);
  const last = Number(row?.last);
  const bid = Number(row?.bid);
  const ask = Number(row?.ask);
  const price = last > 0 ? last : bid > 0 && ask >= bid ? (bid + ask) / 2 : 0;
  if (!(price > 0)) return false;
  noteBoard(isin, { currency: "RUB", last: price, symbol: row.code || isin }, "MISX");
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

function psxFresh(isin) {
  const row = psxTouch().get(isin);
  const last = Number(row?.last);
  const bid = Number(row?.bid);
  const ask = Number(row?.ask);
  const price = last > 0 ? last : bid > 0 && ask >= bid ? (bid + ask) / 2 : 0;
  if (!(price > 0)) return false;
  noteBoard(isin, { currency: "PKR", last: price, symbol: row.code || isin }, "XKAR");
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

function dseTicker(isin, listings) {
  const scored = [];
  for (const row of listings || []) {
    if (String(row.isin || "").toUpperCase() !== isin && listings?.length && row.isin) continue;
    const ticker = String(row.ticker || row.symbol || "").trim().toUpperCase();
    if (!/^[A-Z0-9().]{1,16}$/.test(ticker)) continue;
    const place = String(row.exchange || row.exchangeRaw || "").toUpperCase();
    const rank = place === "DSE" || place.includes("DHAKA") ? 0 : 1;
    scored.push([rank, ticker]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  return scored[0]?.[1] || null;
}

// The Dhaka company page prints lastPrice in taka. One read prices the
// Chittagong line of the same ISIN. A name that exists only in Chittagong
// is asked here too; a miss leaves the price missing.
async function dseFresh(isin, listings) {
  let ticker = dseTicker(isin, listings);
  if (!ticker) {
    const { catalogueRows } = await import("../catalogues.mjs");
    ticker = dseTicker(
      isin,
      catalogueRows().filter((row) => String(row.isin || "").toUpperCase() === isin),
    );
  }
  if (!ticker) return false;
  const response = await fetch(`https://www.dse.com.bd/company/${encodeURIComponent(ticker)}`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return false;
  const price = Number((await response.text()).match(/lastPrice\\*":([0-9]+(?:\.[0-9]+)?)/)?.[1]);
  if (!(price > 0)) return false;
  noteBoard(isin, { currency: "BDT", last: price, symbol: ticker }, "XDHA");
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

function csecyFresh(isin) {
  const row = csecyTouch().get(isin);
  const last = Number(row?.last);
  const bid = Number(row?.bid);
  const ask = Number(row?.ask);
  const price = last > 0 ? last : bid > 0 && ask >= bid ? (bid + ask) / 2 : 0;
  if (!(price > 0)) return false;
  noteBoard(isin, { currency: "EUR", last: price, symbol: row.code || isin }, "XCYS");
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

function sofiaFresh(isin) {
  const row = sofiaTouch().get(isin);
  const last = Number(row?.last);
  const bid = Number(row?.bid);
  const ask = Number(row?.ask);
  const price = last > 0 ? last : bid > 0 && ask >= bid ? (bid + ask) / 2 : 0;
  if (!(price > 0)) return false;
  noteBoard(isin, { currency: "EUR", last: price, symbol: row.code || isin }, "XBUL");
  fetched[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

export async function ensureFresh(isin, maxAge = DAY, listings = null) {
  const key = String(isin || "").trim().toUpperCase();
  if (!ISIN.test(key)) return undefined;
  if (!hasPrice(key)) nagoyaFresh(key);
  if (!hasPrice(key)) bequotedFresh(key);
  if (!hasPrice(key)) ngxFresh(key);
  if (!hasPrice(key) && key.startsWith("NG")) await ngxClose(key);
  if (!hasPrice(key)) bistFresh(key);
  if (!hasPrice(key)) bvcFresh(key);
  if (!hasPrice(key)) sofiaFresh(key);
  if (!hasPrice(key)) csecyFresh(key);
  if (!(Number(prices[key]?.THB?.price) > 0)) setFresh(key);
  if (!(Number(prices[key]?.PKR?.price) > 0)) psxFresh(key);
  if (key.startsWith("NL") && !(Number(prices[key]?.EUR?.price) > 0)) mtfFresh(key);
  // The Pakistan Stock Exchange's closing file prints every symbol's session
  // close, in rupees. It is asked whenever no Karachi figure is held, fresh
  // stamp or not: Yahoo's .KA last can be months old (OGDC at 131.87 rupees
  // against a 299.10 close).
  if (key.startsWith("PK") && !Object.keys(prices[key]?.PKR?.from || {}).some((k) => k.startsWith("XKAR:"))) {
    await psxCloseFresh(key);
  }
  if (!(Number(prices[key]?.RUB?.price) > 0)) moexFresh(key);
  if (!(Number(prices[key]?.ILS?.price) > 0)) taseFresh(key);
  if (!(Number(prices[key]?.MAD?.price) > 0)) xcasFresh(key);
  sgxFresh(key);
  if (isFresh(key, maxAge)) return prices[key];
  // Two readers asking for the same instrument at once is one request, not two.
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    try {
      // A vendor out of quota throws, and that must not carry off the Gulf lookup with
      // it: the boards below cost nothing and answer exactly where the vendor cannot.
      const eodhdAt = Date.parse(fetched[key] || 0);
      const eodhdFresh = Number.isFinite(eodhdAt) && Date.now() - eodhdAt < maxAge;
      if (KEY && spent + 1 <= budget && !eodhdFresh && Date.now() >= quotaOutUntil) {
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
      if (!hasPrice(key) && key.startsWith("PH")) {
        await pseFresh(key, listings);
      }
      // The vendor does not carry the Zimbabwe Stock Exchange. The published
      // price sheet is the last, in cents of a ZiG, for every line on the board.
      if (!hasPrice(key) && key.startsWith("ZW")) {
        await zseFresh(key);
      }
      // The vendor does not carry HOSE, HNX or UPCoM. VNDirect's session
      // file prints the close for every listed share and fund, in
      // thousands of dong.
      if (!hasPrice(key) && key.startsWith("VN")) {
        await vnFresh(key);
      }
      // The vendor does not carry the Bolsa de Valores de Lima. The daily
      // bulletin prints the session close, in soles or in dollars.
      if (key.startsWith("PE") && !(Number(prices[key]?.PEN?.price) > 0) && !(Number(prices[key]?.USD?.price) > 0)) {
        await limaFresh(key);
      }
      // EODHD does not carry the Amman Stock Exchange. The daily bulletin
      // prints the last session's close, in dinars.
      if (key.startsWith("JO") && !(Number(prices[key]?.JOD?.price) > 0)) {
        await ammanFresh(key);
      }
      // EODHD does not carry the Dhaka Stock Exchange. The company page
      // prints the last trade in taka. The same ISIN prices Chittagong.
      if (key.startsWith("BD") && !(Number(prices[key]?.BDT?.price) > 0)) {
        await dseFresh(key, listings);
      }
      // EODHD does not carry the BRVM. Its own page prints every share's
      // close, in francs CFA.
      if (BRVM_COUNTRIES.has(key.slice(0, 2)) && !(Number(prices[key]?.XOF?.price) > 0)) {
        await brvmFresh(key);
      }
      // Boards no vendor carries, read from the exchange itself
      // (frontierBoards.mjs). The board is cached, so this is asked on every
      // refresh and the close follows the session.
      await frontierFresh(key);
      if (!hasPrice(key)) {
        // `listings` is the page's own rows. Without them the sweep still
        // walks the catalogues; with them a single view must not.
        const prepared = listings ? rowsFromListings(key, listings) : null;
        const yahoo = await yahooFresh(key, prepared, listings ? currenciesOf(listings) : null);
        // A line with no symbol was not asked. Stamping it would hide it
        // until tomorrow, which is how a whole class of prices stayed missing.
        if (yahoo.asked) {
          fallback[key] = new Date().toISOString();
          scheduleSave();
        }
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

// ---------------------------------------------------------------- Vietnam

// One session file for HOSE, HNX and UPCoM. `close` is in thousands of dong:
// VNM's 57.3 is the 57,300 VND Yahoo prints for the same close. The file
// names a ticker, and the catalogues say which ISIN that ticker is.
const VN_PRICES = "https://api-finfo.vndirect.com.vn/v4/stock_prices";
let vnSheetPromise = null;
let vnIndexPromise = null;

function vnIndex() {
  return (vnIndexPromise ||= (async () => {
    const { catalogueRows } = await import("../catalogues.mjs");
    const index = new Map();
    const banned = new Set();
    for (const row of catalogueRows()) {
      const isin = String(row.isin || "").trim().toUpperCase();
      const exchange = String(row.exchange || "").trim().toUpperCase();
      const ticker = String(row.ticker || row.symbol || "").trim().toUpperCase();
      if (!ISIN.test(isin) || !isin.startsWith("VN") || !ticker) continue;
      if (exchange !== "HOSE" && exchange !== "HNX" && exchange !== "UPCOM") continue;
      const prev = index.get(ticker);
      if (prev && prev !== isin) banned.add(ticker);
      else index.set(ticker, isin);
    }
    for (const ticker of banned) index.delete(ticker);
    return index;
  })());
}

function vnSheet() {
  if (vnSheetPromise && Date.now() - vnSheetPromise.at < BOARD_TTL) return vnSheetPromise.rows;
  const rows = (async () => {
    const headers = { Accept: "application/json", "User-Agent": "Mozilla/5.0" };
    const probe = await fetch(`${VN_PRICES}?sort=date&size=1`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!probe.ok) throw new Error(`${probe.status}`);
    const day = String((await probe.json())?.data?.[0]?.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("aucune séance");
    const response = await fetch(`${VN_PRICES}?q=date:${day}&size=5000`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`${response.status}`);
    const body = await response.json();
    const map = new Map();
    for (const row of Array.isArray(body?.data) ? body.data : []) {
      const kind = String(row.type || "").toUpperCase();
      if (kind !== "STOCK" && kind !== "ETF") continue;
      const ticker = String(row.code || "").trim().toUpperCase();
      const close = Number(row.close);
      if (!ticker || !(close > 0)) continue;
      map.set(ticker, {
        price: close * 1000,
        at: day,
        floor: String(row.floor || "").trim().toUpperCase() || "VN",
      });
    }
    return map;
  })().catch((error) => {
    vnSheetPromise = null;
    console.error(`séance Vietnam : ${error.message}`);
    return new Map();
  });
  vnSheetPromise = { at: Date.now(), rows };
  return rows;
}

async function vnFresh(isin) {
  const [sheet, index] = await Promise.all([vnSheet(), vnIndex()]);
  let found = false;
  for (const [ticker, row] of sheet) {
    const id = index.get(ticker);
    if (!id) continue;
    const price = Number(row.price.toPrecision(8));
    const leaf = ((prices[id] ||= {})["VND"] ||= { price: null, at: null, from: {} });
    leaf.from[`${row.floor}:${ticker}`] = { price, at: row.at, primary: true };
    leaf.price = price;
    leaf.at = row.at;
    fallback[id] = new Date().toISOString();
    if (id === isin) found = true;
  }
  if (sheet.size) scheduleSave();
  return found;
}

// ---------------------------------------------------------------- ZSE

// One sheet for the whole board. `closePrice` is ZiG cents: Delta's previous
// close of 3150.482 cents is the 31.50 ZWG printed elsewhere for that day.
const ZSE_SHEET = "https://ds88jcmqc11je.cloudfront.net/api/fetch/price-sheet?exchange=ZSE";
let zseSheetPromise = null;

function zseDay(parts) {
  if (!Array.isArray(parts) || parts.length < 3) return null;
  const [year, month, day] = parts;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function zseSheet() {
  if (zseSheetPromise && Date.now() - zseSheetPromise.at < BOARD_TTL) return zseSheetPromise.rows;
  const rows = (async () => {
    const response = await fetch(ZSE_SHEET, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`${response.status}`);
    const body = await response.json();
    const map = new Map();
    for (const row of Array.isArray(body?.data) ? body.data : []) {
      const isin = String(row.isin || "").trim().toUpperCase();
      const cents = Number(row.closePrice ?? row.prevClosingPrice);
      if (!ISIN.test(isin) || !(cents > 0)) continue;
      map.set(isin, { price: cents / 100, at: zseDay(row.statsDate) });
    }
    return map;
  })().catch((error) => {
    zseSheetPromise = null;
    console.error(`feuille ZSE : ${error.message}`);
    return new Map();
  });
  zseSheetPromise = { at: Date.now(), rows };
  return rows;
}

async function zseFresh(isin) {
  const map = await zseSheet();
  let found = false;
  for (const [id, row] of map) {
    const leaf = ((prices[id] ||= {})["ZWG"] ||= { price: null, at: null, from: {} });
    const price = Number(row.price.toPrecision(8));
    leaf.from["ZSE"] = { price, at: row.at, primary: true };
    leaf.price = price;
    leaf.at = row.at;
    fallback[id] = new Date().toISOString();
    if (id === isin) found = true;
  }
  if (map.size) scheduleSave();
  return found;
}

// ---------------------------------------------------------------- KASE

// The vendor's search comes back empty for a Kazakh ISIN. KASE's own share page
// prints the last trade (`price`) and the currency. One page per ticker the
// catalogues already name; the first view builds that index.
let kaseIndexPromise = null;
function kaseIndex() {
  return (kaseIndexPromise ||= (async () => {
    const { catalogueRows } = await import("../catalogues.mjs");
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

// The vendor does not carry the Philippine Stock Exchange, and Yahoo's
// .PS suffix answers 404. The stock page prints the last traded price,
// and the previous close when the session has not printed one.
const PSE_STOCK = "https://edge.pse.com.ph/companyPage/stockData.do";
const PSE_FIND = "https://edge.pse.com.ph/autoComplete/searchCompanyNameSymbol.ax";

function pseField(html, label) {
  const match = html.match(new RegExp(`<th>\\s*${label}\\s*</th>\\s*<td[^>]*>\\s*([^<]*)`, "i"));
  return match ? match[1].replace(/,/g, "").trim() : "";
}

function pseLast(html) {
  const raw = pseField(html, "Last Traded Price") || pseField(html, "Previous Close and Date").split("(")[0];
  const last = Number(raw);
  return last > 0 ? last : null;
}

async function pseQuote(ticker) {
  const found = await fetch(`${PSE_FIND}?term=${encodeURIComponent(ticker)}`, {
    headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!found.ok) return null;
  const rows = await found.json();
  const hit = (Array.isArray(rows) ? rows : []).find((row) => String(row.symbol || "").toUpperCase() === ticker);
  if (!hit?.cmpyId) return null;
  const page = await fetch(`${PSE_STOCK}?cmpy_id=${encodeURIComponent(hit.cmpyId)}`, {
    headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
    signal: AbortSignal.timeout(20000),
  });
  if (!page.ok) return null;
  let html = await page.text();
  const options = [...html.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/gi)];
  const selected = options.find((match) => /\bselected\b/i.test(match[1]));
  const shown = String(selected?.[2] || "").trim().toUpperCase();
  if (shown && shown !== ticker) {
    const other = options.find((match) => String(match[2] || "").trim().toUpperCase() === ticker);
    const id = other && (other[1].match(/value="(\d+)"/) || [])[1];
    if (!id) return null;
    const next = await fetch(`${PSE_STOCK}?cmpy_id=${encodeURIComponent(hit.cmpyId)}&security_id=${id}`, {
      headers: { "user-agent": "Mozilla/5.0", accept: "text/html" },
      signal: AbortSignal.timeout(20000),
    });
    if (!next.ok) return null;
    html = await next.text();
  }
  const last = pseLast(html);
  return last == null ? null : { symbol: ticker, last };
}

async function pseFresh(isin, listings) {
  const tickers = [];
  for (const row of listings || []) {
    const ticker = String(row.ticker || row.symbol || "").trim().toUpperCase();
    const place = String(row.exchangeRaw || row.exchange || "").toUpperCase();
    if (!ticker || tickers.includes(ticker)) continue;
    if (place === "PSE" || place.includes("PHILIPPINE") || String(row.isin || isin).startsWith("PH")) tickers.push(ticker);
  }
  for (const ticker of tickers.slice(0, 4)) {
    try {
      const quote = await pseQuote(ticker);
      if (!quote) continue;
      const currency = String((listings || []).find((row) => String(row.ticker || "").toUpperCase() === ticker)?.currency || "PHP").toUpperCase();
      noteBoard(isin, { ...quote, currency }, "XPHS");
      fetched[isin] = new Date().toISOString();
      scheduleSave();
      return true;
    } catch (e) {
      console.error(`prix ${isin} chez PSE ${ticker} : ${e.message}`);
    }
  }
  return false;
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

// ---------------------------------------------------------------- Lima

// One bulletin for the whole board. The close is the session's own print;
// when that cell is blank the previous close is the last figure the sheet
// still shows. Soles and dollars stay apart. A ticker is kept only when the
// shared list names exactly one Lima ISIN for it.
const LIMA_BULLETIN = "https://documents.bvl.com.pe/pubdif/boldia/stockq.htm";
let limaSheetPromise = null;

function limaNum(value) {
  const text = String(value || "").replace(/,/g, "").trim();
  if (!text || /^\.+$/.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n : null;
}

function limaDay(value) {
  const parts = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (!parts) return null;
  const year = Number(parts[3]);
  return `${year >= 70 ? 1900 + year : 2000 + year}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
}

function limaIsins() {
  const book = new Map();
  for (const name of ["./stocks.csv", "./etfs.csv"]) {
    let text = "";
    try {
      text = fs.readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
      const columns = line.split(",");
      if (String(columns[1] || "").trim().toUpperCase() !== "BVL") continue;
      const ticker = String(columns[0] || "").split(":").pop().trim().toUpperCase();
      const isin = String(columns[2] || "").trim().toUpperCase();
      if (!ticker || !ISIN.test(isin)) continue;
      const held = book.get(ticker) || new Set();
      held.add(isin);
      book.set(ticker, held);
    }
  }
  return book;
}

function limaSheet() {
  if (limaSheetPromise && Date.now() - limaSheetPromise.at < BOARD_TTL) return limaSheetPromise.rows;
  const rows = (async () => {
    const response = await fetch(LIMA_BULLETIN, {
      headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(40_000),
    });
    if (!response.ok) throw new Error(`${response.status}`);
    const html = await response.text();
    const dated = (html.match(/Actualizado al\s+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/i) || []).slice(1);
    const months = { enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06", julio: "07", agosto: "08", septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12" };
    const sheetDay = dated.length === 3 ? `${dated[2]}-${months[dated[1].toLowerCase()] || "01"}-${dated[0].padStart(2, "0")}` : null;
    const isins = limaIsins();
    const map = new Map();
    for (const row of html.match(/<tr>([\s\S]*?)<\/tr>/gi) || []) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
        cell[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
      );
      if (cells.length < 6) continue;
      const ticker = cells[0].replace(/\s*\(.*$/, "").trim().toUpperCase();
      const currency = cells[1] === "S/" ? "PEN" : cells[1] === "US$" ? "USD" : "";
      const close = limaNum(cells[5]) ?? limaNum(cells[2]);
      if (!ticker || !currency || !(close > 0)) continue;
      const ids = isins.get(ticker);
      if (!ids || ids.size !== 1) continue;
      map.set([...ids][0], {
        ticker,
        currency,
        price: close,
        at: limaDay(cells[3]) || sheetDay,
      });
    }
    return map;
  })().catch((error) => {
    limaSheetPromise = null;
    console.error(`bulletin de Lima : ${error.message}`);
    return new Map();
  });
  limaSheetPromise = { at: Date.now(), rows };
  return rows;
}

async function limaFresh(isin) {
  const row = (await limaSheet()).get(isin);
  if (!row) return false;
  const price = Number(row.price.toPrecision(8));
  const leaf = ((prices[isin] ||= {})[row.currency] ||= { price: null, at: null, from: {} });
  const taken = Object.values(leaf.from).some((x) => x.primary);
  leaf.from[`XLIM:${row.ticker}`] = { price, at: row.at, primary: !taken };
  if (!taken || !(Number(leaf.price) > 0)) {
    leaf.price = price;
    leaf.at = row.at;
  }
  fallback[isin] = new Date().toISOString();
  scheduleSave();
  return Number(leaf.price) > 0;
}

async function sweepLima() {
  const sheet = await limaSheet();
  let priced = 0;
  for (const isin of sheet.keys()) if (await limaFresh(isin)) priced++;
  save();
  console.error(`${priced} clôtures de Lima, bulletin de ${sheet.size ? [...sheet.values()][0].at : "?"}. Écrit dans ${STORE_PATH}.`);
}

// ---------------------------------------------------------------- Amman

// One bulletin for the board (spreads/ase.mjs). The close is the session's
// own print; a share that traded without a close keeps the last close. A
// symbol is kept only when the shared list names exactly one Amman ISIN.
let ammanSheetPromise = null;

function ammanIsins() {
  const book = new Map();
  for (const name of ["./stocks.csv", "./etfs.csv"]) {
    let text = "";
    try {
      text = fs.readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
      const columns = line.split(",");
      if (String(columns[1] || "").trim().toUpperCase() !== "XAMM") continue;
      const ticker = String(columns[0] || "").split(":").pop().trim().toUpperCase();
      const isin = String(columns[2] || "").trim().toUpperCase();
      if (!ticker || !ISIN.test(isin)) continue;
      const held = book.get(ticker) || new Set();
      held.add(isin);
      book.set(ticker, held);
    }
  }
  return book;
}

function ammanSheet() {
  if (ammanSheetPromise && Date.now() - ammanSheetPromise.at < BOARD_TTL) return ammanSheetPromise.rows;
  const rows = (async () => {
    const { readAseBulletin } = await import("../spreads/ase.mjs");
    const { date, rows: lines } = await readAseBulletin();
    const isins = ammanIsins();
    const map = new Map();
    for (const line of lines) {
      const close = line.close ?? line.lastClose;
      const ids = isins.get(line.symbol);
      if (!(close > 0) || !ids || ids.size !== 1) continue;
      map.set([...ids][0], { ticker: line.symbol, price: close, at: date });
    }
    return map;
  })().catch((error) => {
    ammanSheetPromise = null;
    console.error(`bulletin d'Amman : ${error.message}`);
    return new Map();
  });
  ammanSheetPromise = { at: Date.now(), rows };
  return rows;
}

async function ammanFresh(isin) {
  const row = (await ammanSheet()).get(isin);
  if (!row) return false;
  const price = Number(row.price.toPrecision(8));
  const leaf = ((prices[isin] ||= {}).JOD ||= { price: null, at: null, from: {} });
  const taken = Object.values(leaf.from).some((x) => x.primary);
  leaf.from[`XAMM:${row.ticker}`] = { price, at: row.at, primary: !taken };
  if (!taken || !(Number(leaf.price) > 0)) {
    leaf.price = price;
    leaf.at = row.at;
  }
  fallback[isin] = new Date().toISOString();
  scheduleSave();
  return Number(leaf.price) > 0;
}

async function sweepAmman() {
  const sheet = await ammanSheet();
  let priced = 0;
  for (const isin of sheet.keys()) if (await ammanFresh(isin)) priced++;
  save();
  console.error(`${priced} clôtures d'Amman, séance du ${sheet.size ? [...sheet.values()][0].at : "?"}. Écrit dans ${STORE_PATH}.`);
}

// ---------------------------------------------------------------- Karachi

// The PSX's closing file for a session: a zip holding one pipe-separated
// list, date|symbol|sector|name|open|high|low|close|volume|previous close.
// The newest one of the last week is taken. A futures line (DEC, NOV, a
// hyphen in the symbol) is not the share. A symbol that did not trade
// prints 0 for its close, and its previous close is the last figure. A
// symbol is kept only when the shared list names exactly one PSX ISIN.
const PSX_CLOSING = "https://dps.psx.com.pk/download/mkt_summary/";
let psxSheetPromise = null;

function psxIsins() {
  const book = new Map();
  for (const name of ["./stocks.csv", "./etfs.csv"]) {
    let text = "";
    try {
      text = fs.readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || /^ticker\s*,/i.test(line)) continue;
      const columns = line.split(",");
      if (String(columns[1] || "").trim().toUpperCase() !== "PSX") continue;
      const ticker = String(columns[0] || "").split(":").pop().trim().toUpperCase();
      const isin = String(columns[2] || "").trim().toUpperCase();
      if (!ticker || !ISIN.test(isin)) continue;
      const held = book.get(ticker) || new Set();
      held.add(isin);
      book.set(ticker, held);
    }
  }
  return book;
}

async function psxClosingFile() {
  for (let back = 0; back < 8; back++) {
    const day = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
    const response = await fetch(`${PSX_CLOSING}${day}.Z`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(40_000),
    });
    if (!response.ok) continue;
    const zip = Buffer.from(await response.arrayBuffer());
    if (zip.readUInt32LE(0) !== 0x04034b50) continue;
    const start = 30 + zip.readUInt16LE(26) + zip.readUInt16LE(28);
    return { day, text: zlib.inflateRawSync(zip.subarray(start)).toString("latin1") };
  }
  throw new Error("aucun fichier de clôture sur les huit derniers jours");
}

function psxSheet() {
  if (psxSheetPromise && Date.now() - psxSheetPromise.at < BOARD_TTL) return psxSheetPromise.rows;
  const rows = (async () => {
    const { day, text } = await psxClosingFile();
    const isins = psxIsins();
    const map = new Map();
    for (const line of text.split(/\r?\n/)) {
      const cells = line.split("|");
      if (cells.length < 10) continue;
      const ticker = cells[1].trim().toUpperCase();
      if (!ticker || ticker.includes("-")) continue;
      const close = Number(cells[7]) > 0 ? Number(cells[7]) : Number(cells[9]);
      const ids = isins.get(ticker);
      if (!(close > 0) || !ids || ids.size !== 1) continue;
      map.set([...ids][0], { ticker, price: close, at: day });
    }
    return map;
  })().catch((error) => {
    psxSheetPromise = null;
    console.error(`clôtures de la PSX : ${error.message}`);
    return new Map();
  });
  psxSheetPromise = { at: Date.now(), rows };
  return rows;
}

async function psxCloseFresh(isin) {
  const row = (await psxSheet()).get(isin);
  if (!row) return false;
  const price = Number(row.price.toPrecision(8));
  const leaf = ((prices[isin] ||= {}).PKR ||= { price: null, at: null, from: {} });
  const taken = Object.values(leaf.from).some((x) => x.primary);
  leaf.from[`XKAR:${row.ticker}`] = { price, at: row.at, primary: !taken };
  if (!taken || !(Number(leaf.price) > 0)) {
    leaf.price = price;
    leaf.at = row.at;
  }
  fallback[isin] = new Date().toISOString();
  scheduleSave();
  return Number(leaf.price) > 0;
}

async function sweepPsx() {
  const sheet = await psxSheet();
  let priced = 0;
  for (const isin of sheet.keys()) if (await psxCloseFresh(isin)) priced++;
  save();
  console.error(`${priced} clôtures de la PSX, séance du ${sheet.size ? [...sheet.values()][0].at : "?"}. Écrit dans ${STORE_PATH}.`);
}

// ---------------------------------------------------------------- Abidjan

// The BRVM prints every share's session on one page: symbol, name, volume,
// previous close, open, close, change. A share that did not trade prints its
// previous close. The symbol is joined to its ISIN through the BRVM lines of
// the shared stock list. Prices are in francs CFA (XOF).
const BRVM_COURS = "https://www.brvm.org/fr/cours-actions/0";
const BRVM_COUNTRIES = new Set(["CI", "SN", "BF", "ML", "NE", "TG", "BJ", "GW"]);
let brvmSheetPromise = null;

function brvmIsins() {
  const book = new Map();
  let text = "";
  try {
    text = fs.readFileSync(fileURLToPath(new URL("./stocks.csv", import.meta.url)), "utf8");
  } catch {
    return book;
  }
  for (const line of text.split(/\r?\n/)) {
    const columns = line.split(",");
    const place = String(columns[1] || "").trim().toUpperCase();
    if (place !== "BRVM" && place !== "XBRV") continue;
    const ticker = String(columns[0] || "").split(":").pop().trim().toUpperCase();
    const isin = String(columns[2] || "").trim().toUpperCase();
    if (ticker && ISIN.test(isin)) book.set(ticker, isin);
  }
  return book;
}

function brvmSheet() {
  if (brvmSheetPromise && Date.now() - brvmSheetPromise.at < BOARD_TTL) return brvmSheetPromise.rows;
  const rows = (async () => {
    const response = await fetch(BRVM_COURS, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(40_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const isins = brvmIsins();
    const day = new Date().toISOString().slice(0, 10);
    const number = (cell) => Number(String(cell || "").replace(/<[^>]*>/g, "").replace(/[\s  ]/g, "").replace(",", "."));
    const map = new Map();
    for (const tr of html.split(/<tr[\s>]/i).slice(1)) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
      if (cells.length < 6) continue;
      const ticker = cells[0].replace(/<[^>]*>/g, "").trim().toUpperCase();
      const isin = isins.get(ticker);
      const close = number(cells[5]) > 0 ? number(cells[5]) : number(cells[3]);
      if (!isin || !(close > 0)) continue;
      map.set(isin, { ticker, price: close, at: day });
    }
    return map;
  })().catch((error) => {
    brvmSheetPromise = null;
    console.error(`cours de la BRVM : ${error.message}`);
    return new Map();
  });
  brvmSheetPromise = { at: Date.now(), rows };
  return rows;
}

async function brvmFresh(isin) {
  const row = (await brvmSheet()).get(isin);
  if (!row) return false;
  const leaf = ((prices[isin] ||= {}).XOF ||= { price: null, at: null, from: {} });
  leaf.from[`XBRV:${row.ticker}`] = { price: row.price, at: row.at, primary: true };
  leaf.price = row.price;
  leaf.at = row.at;
  fallback[isin] = new Date().toISOString();
  scheduleSave();
  return true;
}

// ---------------------------------------------------------------- frontier boards

async function frontierFresh(isin) {
  const { boardsFor, boardRows } = await import("./frontierBoards.mjs");
  let found = false;
  for (const mic of boardsFor(isin)) {
    let row;
    try {
      row = (await boardRows(mic)).get(isin);
    } catch (e) {
      console.error(`prix ${isin} sur ${mic} : ${e.message}`);
      continue;
    }
    if (!row) continue;
    const leaf = ((prices[isin] ||= {})[row.currency] ||= { price: null, at: null, from: {} });
    leaf.from[`${mic}:${row.ticker}`] = { price: row.price, at: row.at, primary: true };
    leaf.price = row.price;
    leaf.at = row.at;
    fallback[isin] = new Date().toISOString();
    found = true;
  }
  if (found) scheduleSave();
  return found;
}

async function sweepFrontier() {
  const { BOARDS, boardRows } = await import("./frontierBoards.mjs");
  let priced = 0;
  for (const mic of Object.keys(BOARDS)) {
    let rows;
    try {
      rows = await boardRows(mic);
    } catch (e) {
      console.error(`${mic} : ${e.message}`);
      continue;
    }
    let n = 0;
    for (const isin of rows.keys()) if (await frontierFresh(isin)) n++;
    console.error(`${mic} : ${n} cours.`);
    priced += n;
  }
  save();
  console.error(`${priced} cours des bourses sans vendeur. Écrit dans ${STORE_PATH}.`);
}

async function sweepBrvm() {
  const sheet = await brvmSheet();
  let priced = 0;
  for (const isin of sheet.keys()) if (await brvmFresh(isin)) priced++;
  save();
  console.error(`${priced} cours de la BRVM. Écrit dans ${STORE_PATH}.`);
}

// ---------------------------------------------------------------- the sweep

// Every Gulf line at once, which is four requests rather than one per instrument. Manama
// needs a tab; without one the other three are still swept and the gap is said out loud
// rather than passed off as an empty board.
async function sweepGulf() {
  const { GULF_BOARDS } = await import("../spreads/gulf.mjs");
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

// The lines the vendor does not sell: the Gulf, which its search leaves empty,
// and any ISIN already asked of it that came back without a price. Yahoo's last
// sizes those. The rest of the catalogue stays on the vendor, one view at a time.
// A miss stamped today is left alone, except a Saudi ISIN: Tadawul was asked
// under the wrong symbol before the .SR map existed.
async function sweepYahoo() {
  const index = await yahooIndex();
  const todo = [];
  for (const isin of index.keys()) {
    if (hasPrice(isin)) continue;
    const gulf = GULF_COUNTRIES.has(isin.slice(0, 2));
    const vendorMiss = Boolean(fetched[isin]);
    if (!gulf && !vendorMiss) continue;
    const fb = Date.parse(fallback[isin] || 0);
    const rested = fb >= YAHOO_ISIN_AT && Date.now() - fb < DAY;
    if (rested && !isin.startsWith("SA")) continue;
    todo.push(isin);
  }
  console.error(`${todo.length} ISIN sans prix que le vendeur ne cote pas, à demander à Yahoo.`);
  if (has("dry-run")) return;
  if (arg("limit")) todo.length = Math.min(todo.length, Number(arg("limit")));

  let done = 0;
  let hit = 0;
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const isin = queue.shift();
      try {
        if ((await yahooFresh(isin)).found) hit++;
      } catch (e) {
        console.error(`prix ${isin} chez Yahoo : ${e.message}`);
      }
      fallback[isin] = new Date().toISOString();
      scheduleSave();
      done++;
      if (done % 100 === 0) console.error(`  ${done}/${todo.length}, ${hit} cotés`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  save();
  console.error(`${hit} cotés sur ${done}. ${Object.keys(prices).length} ISIN ont un prix en tout. Écrit dans ${STORE_PATH}.`);
}

async function main() {
  if (has("gulf")) return sweepGulf();
  if (has("lima")) return sweepLima();
  if (has("amman")) return sweepAmman();
  if (has("psx")) return sweepPsx();
  if (has("brvm")) return sweepBrvm();
  if (has("frontier")) return sweepFrontier();
  if (has("ngx")) return sweepNgx();
  if (has("yahoo")) return sweepYahoo();
  if (has("sgx")) return sweepSgx();
  if (has("fsm-otc")) return sweepFsmOtc();
  if (!KEY) {
    console.error("Pas de clé : mettre EODHD_API_KEY dans .env ou dans l'environnement.");
    process.exit(1);
  }
  const { catalogueRows } = await import("../catalogues.mjs");
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
      `\nLe quota du jour couvre ${budget} des ${todo.length} instruments.\n` +
        `Les places absentes du vendeur sont cotées chez Yahoo dans la même passe.`
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
  if (!one) await sweepYahoo();
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
