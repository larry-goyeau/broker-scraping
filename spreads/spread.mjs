// The URL that gives the spread for a listing, and the spread itself where it can be
// read. One adapter per data source, keyed on the triple (place, ISIN, devise) that
// `venues.mjs` resolves.
//
// Reporting one venue's number for another venue's book is the mistake this script
// exists to prevent, so a listing whose venue has no free source is left empty with
// a reason rather than filled from a neighbour.
//
// It describes exchanges, not brokers, so one file serves every broker parser:
// `spreads/spread.json`, holding what one round trip costs on each order book and
// nothing else. Everything derivable is derived instead of stored — the venue's name and
// hours from `venues.mjs`, the page behind the figure from `spreadUrl` — which leaves the
// file readable at a glance.
//
// Every European place is read at the touch of its own book, and the American one at the
// effective spread its brokers report, which is the same grandeur by construction; see
// `CROSSED`. Publishing two grandeurs in one field is the other mistake this script
// exists to prevent, and it took reading Xetra's book to notice it had crept back in.
//
// Two published averages are that same grandeur, the best bid against the best ask
// over the session, so they stand in for the book on the products they actually cover.
// SIX Market Quality Metrics, one trading day's time-weighted inside spread, for
// ETFs and for ETPs (ETC and ETN). Tokyo's monthly ETF file, in basis points.
// The ASX investment-products PDF, the month's weighted average bid/ask for each
// ETP. The NSE security-category file, the six-month mean impact cost of a
// ₹1 lakh order, buy side and sell side, which is the round trip once the two
// sides are added. The American NBBO stays the Rule 605 effective spread.
// Xetra's XLM prices a 100 000 € order, and London prints the average only
// for its busiest ETPs, so neither replaces a book.
//
// A touch also depends on the hour it was read, so each reading is divided by its own half
// hour's multiple before the median is taken, and what the file publishes is the cost at
// the average hour of the session. The multiples come from Deutsche Börse's intraday XLM
// and are published beside the figure, so an hour can be put back.
//
//   node spread.mjs                              -- listings from brokers/trading212/trading212-parsed.json
//   node spread.mjs --rows=xtb/xtb-parsed.json
//   node spread.mjs --rows=a.json,b.json         -- several brokers at once
//   node spread.mjs --rows=catalogues            -- every <broker>-parsed.json (alias: all)
//   node spread.mjs --refresh                    -- refetch instead of trusting the file
//   node spread.mjs --out=other.json             -- write somewhere else
//   node spread.mjs --min-gap=90                 -- minutes before a listing is resampled
//   node spread.mjs --jobs=8                     -- listings in flight at once
//   node spread.mjs --only=lse,six               -- one or more sources, the others left alone
//   node spread.mjs --only=lse,six,frankfurt --rows=catalogues
//       while London, Zurich and the Frankfurt floor are all open: every IOB,
//       every SIX currency line, every ISIN on the DFRA tape (ordinary and CDR).
//       A neighbour's book is never copied. Out of hours the run adds nothing.
//   node spread.mjs --chrome=9223                -- another Chrome (Questrade without Fortuneo / LYNX+)
//
// Run it a few times across a session and the published figure becomes a median of
// readings rather than one snapshot, which is what makes it worth costing a trade
// with. Out of hours it adds nothing and leaves the stored average alone.

import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGunzip, gunzipSync, inflateRawSync } from "node:zlib";
import { Readable } from "node:stream";
import readline from "node:readline";
import {
  CRYPTO_CCY,
  cryptoMicsFor,
  cryptoId,
  listingKey,
  norm,
  sessionState,
  spreadUrl,
  VENUES,
} from "./venues.mjs";
import { GULF_BOARDS, gulfSymbol, readGulfBoard } from "./gulf.mjs";
import { catalogueFiles, catalogueRows } from "../catalogues.mjs";
import { monthlyXlm } from "./xlm-monthly.mjs";
import { monthlyEffectiveSpread } from "./rule605-monthly.mjs";
import { fileURLToPath } from "node:url";

const arg = (name) => {
  for (const a of process.argv.slice(2)) {
    const m = a.match(new RegExp(`^--${name}=(.+)$`, "i"));
    if (m) return m[1];
  }
  return "";
};
const REFRESH = process.argv.includes("--refresh");
const STORE_PATH = arg("out") || fileURLToPath(new URL("./spread.json", import.meta.url));
const CHROME = arg("chrome") || "9222";
const CHROME_URL = /^https?:\/\//i.test(CHROME) ? CHROME : `http://127.0.0.1:${CHROME}`;
const ONLY = (arg("only") || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// ------------------------------------------------------------------- the listings

function rowFileList() {
  const raw = arg("rows") || "brokers/trading212/trading212-parsed.json";
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const part of parts) {
    if (/^(catalogues|all)$/i.test(part)) out.push(...catalogueFiles());
    else out.push(part);
  }
  return [...new Set(out)];
}
const rowFiles = rowFileList();

const listings = new Map();

// Every row that cannot be priced, attributed to the one thing that blocks it, so the
// size of each hole is visible. A place with no free source blocks a row whatever else
// it says, which is why the place is tested first; only where the exchange could have
// answered does a missing currency become the reason.
//
// Rows are counted as distinct keys, like listings, so the same fund appearing in forty
// catalogues counts once. Attributing a row to no reason at all is what went wrong
// before: rows that named neither a sourceable place nor a currency fell out of the
// accounting entirely, and the report said 160 American listings against a true
// exposure of some nine thousand.
// The catalogues agree on this much: a coin is `type: "CRYPTO"`, or an `exchange` that
// says so, and its ticker is either the base alone or a pair whose first half is.
const isCryptoRow = (row) =>
  String(row.type || "").toUpperCase() === "CRYPTO" || /^crypto$/i.test(String(row.exchange || ""));
const cryptoBase = (row) =>
  String(row.ticker || row.query || row.symbol || "")
    .split(/[/:_-]/)[0]
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const gaps = {};
const gapKeys = new Map();
function noteGap(why, key, example) {
  const gap = (gaps[why] ||= { cotations: 0, exemples: [] });
  const keys = gapKeys.get(why) || gapKeys.set(why, new Set()).get(why);
  if (keys.has(key)) return;
  keys.add(key);
  gap.cotations = keys.size;
  if (gap.exemples.length < 3) gap.exemples.push(example);
}

for (const file of rowFiles) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
  const broker = file.replace(/.*\/|-parsed\.json/g, "");
  for (const row of rows) {
    // A coin has no ISIN and the catalogues name no exchange for it, so the two
    // reference books are both read and stored side by side. Which of them a broker
    // actually executes on is its own business; what this file can say is what the
    // spot market charged to cross at that moment.
    if (isCryptoRow(row)) {
      const base = cryptoBase(row);
      if (!base) {
        noteGap("crypto sans symbole lisible", `${broker}|${row.name || "?"}`, `${row.name || "?"} chez ${broker}`);
        continue;
      }
      const id = cryptoId(base);
      // Binance and Coinbase are the two reference books every broker is read
      // against. Alpaca's own venue is only worth a request for the coins Alpaca
      // itself sells: asked about the other four hundred it answers nothing, and
      // the file would fill with empty leaves under a venue that never listed them.
      const mics = cryptoMicsFor(broker);
      for (const mic of mics) {
        const key = `${mic}|${id}|${CRYPTO_CCY}`;
        if (listings.has(key)) {
          listings.get(key).brokers.add(broker);
          continue;
        }
        const venue = VENUES.find((v) => v.mic === mic);
        listings.set(key, {
          key,
          isin: id,
          currency: CRYPTO_CCY,
          ticker: base,
          name: row.name || base,
          mic,
          path: mic,
          exchange: venue.name,
          source: venue.source,
          venue,
          venueAssumed: false,
          brokers: new Set([broker]),
        });
      }
      continue;
    }
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const { key, venue, assumed, unsourced } = listingKey(row);
    const ticker = String(row.ticker || row.symbol || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();

    if (!venue?.source) {
      const named = row.exchange || row.venue || row.exchangeName || "";
      const why = unsourced
        ? `${unsourced.name} : ${unsourced.why}`
        : `place non reconnue : "${named}"`;
      // Counted under the place's canonical name rather than the spelling the broker
      // used, or one American line would count once as "AMEX" and again as "ARCX".
      noteGap(why, `${unsourced?.name || named}|${isin}|${currency || "?"}`, `${ticker || isin} ${currency || "devise non dite"}`);
    } else if (!currency) {
      noteGap("devise absente du catalogue du broker", key, `${ticker || isin} chez ${broker}`);
    } else if (listings.has(key)) listings.get(key).brokers.add(broker);
    else {
    // The currency is half of a book's identity: the same fund on the same exchange in
    // two currencies is two order books, 1.09 bp and 0.80 bp on the LSE for one of
    // them, so a row that omits it cannot be priced from either.
    listings.set(key, {
      key,
      isin,
      currency,
      ticker,
      name: row.name || "",
      mic: venue.mic,
      path: venue.path || venue.mic,
      exchange: venue.name,
      source: venue.source,
          venue,
          venueAssumed: assumed,
          kind: String(row.type || "").toUpperCase(),
          brokers: new Set([broker]),
        });
    }
    // Quantfury files the primary in `exchange` and names Chi-X only in the
    // catalogue string. The primary book stays the row above. This is the
    // other book, the one the client actually crosses.
    if (currency && /\bCboe Europe\b/.test(String(row.raw || ""))) {
      const cxe = VENUES.find((v) => v.mic === "CHIX");
      const cxeKey = `CHIX|${isin}|${currency}`;
      const batsHint = String(row.raw).trim().split(/\s+/)[0] || "";
      if (cxe && listings.has(cxeKey)) listings.get(cxeKey).brokers.add(broker);
      else if (cxe) {
        listings.set(cxeKey, {
          key: cxeKey,
          isin,
          currency,
          ticker,
          name: row.name || "",
          mic: "CHIX",
          path: "CHIX",
          exchange: cxe.name,
          source: cxe.source,
          venue: cxe,
          venueAssumed: false,
          brokers: new Set([broker]),
          batsHint,
        });
      }
    }
  }
}

console.error(
  `${listings.size} cotations sourçables (place + ISIN + devise) dans ${rowFiles.length} fichier(s), ` +
    `${Object.values(gaps).reduce((n, g) => n + g.cotations, 0)} hors de portée`
);

// ---------------------------------------------------------------------- adapters

// The published answer: fund, place, devise, cost of one round trip. A number and
// nothing beside it, because everything else about a listing is either derivable or
// belongs in the log. A listing with no trustworthy figure is absent rather than null:
// absence cannot be mistaken for a free trade.
// The page the figure came from travels with it, in the same leaf, because a spread
// moves all day and a reader who wants to check one needs the live book. Stored rather
// than derived so that one lookup answers both questions and they cannot drift apart.
// Two passes at once cost more than twice as much: they open twice the tabs, which is how
// Boerse Frankfurt came to answer 503 to everything, and they both hold the whole file in
// memory, so the last to write silently undoes the other's readings. Both were observed.
// One writer at a time, then, enforced against the process table rather than against a
// promise to be careful.
const LOCK_PATH = `${STORE_PATH}.lock`;
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
if (fs.existsSync(LOCK_PATH) && !process.argv.includes("--force")) {
  const held = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
  if (held.pid !== process.pid && alive(held.pid)) {
    console.error(
      `une passe écrit déjà dans ${STORE_PATH} (pid ${held.pid}, depuis ${held.since}).\n` +
        `  L'attendre, ou l'arrêter : kill ${held.pid}\n` +
        `  --force pour passer outre, au risque de perdre les relevés de l'une des deux.`
    );
    process.exit(1);
  }
}
fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, since: new Date().toISOString() }));
// Released on the way out however that happens, including the interrupt that stopping a
// long pass always takes.
const unlock = () => {
  try {
    if (JSON.parse(fs.readFileSync(LOCK_PATH, "utf8")).pid === process.pid) fs.unlinkSync(LOCK_PATH);
  } catch {}
};
process.on("exit", unlock);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(130));

const store = fs.existsSync(STORE_PATH) ? JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) : {};
const spreads = (store.spreads ||= {});
const leafOf = (l) => spreads[l.isin]?.[l.mic]?.[l.currency] ?? null;
const bpOf = (l) => leafOf(l)?.bp ?? null;
// Two units, and the leaf says which. Europe publishes a percentage — XLM, or a touch
// divided by its own midpoint — so the cost scales with the amount and `bp` is the
// natural field. An American book is quoted in whole cents and its measure, the
// effective spread of Rule 605, comes in dollars per share; dividing it by a price to
// force it into basis points would mean inventing a price the source never gave, and
// would make the same book read differently after a split. So `perShare` is stored as
// published, and it is the cost scripts that fold each unit into its own coefficient.
const publish = (l, value) => {
  if (value == null) {
    delete spreads[l.isin]?.[l.mic]?.[l.currency];
    if (spreads[l.isin]?.[l.mic] && !Object.keys(spreads[l.isin][l.mic]).length) delete spreads[l.isin][l.mic];
    if (spreads[l.isin] && !Object.keys(spreads[l.isin]).length) delete spreads[l.isin];
    return;
  }
  // A caller that knows which page it read says so; one that does not gets the guess.
  (((spreads[l.isin] ||= {})[l.mic] ||= {})[l.currency] = { ...value, url: value.url ?? spreadUrl(l) });
};

// One round trip, in whichever unit the venue publishes, for a log line or a table.
const shown = (l) => {
  const leaf = leafOf(l);
  if (leaf?.bp != null) return `${leaf.bp} bp`;
  if (leaf?.perShare != null) return `${leaf.perShare} $/part`;
  return "—";
};

// What the script has to remember between runs to keep that number honest, kept apart
// from it: the readings the median is taken over, when the last one landed, and whether
// the exchange has already said it has no figure for this fund. Same file, so the
// evidence can never drift away from the conclusion it supports.
//
// Readings are kept as the exchange gave them, unconverted, so that changing the
// factors below re-derives the answer from the evidence instead of compounding on it.
const state = (store.state ||= {});
const stateKey = (l) => `${l.isin}|${l.mic}|${l.currency}`;

// The session profiles, keyed by fund and currency rather than by listing, because they
// come from the fund's own trading pattern and one copy serves its every European line.
// Kept from the previous file so that a run over a handful of listings does not drop the
// profiles of the rest.
const shapes = (store.session?.shapes && { ...store.session.shapes }) || {};

// ---------------------------------------------------------------- the one grandeur
//
// The fraction of a source's published figure that a retail order actually crosses, so
// that every venue lands on the same grandeur: the cost of one round trip at the size
// a private investor trades.
//
// Every source now publishes that grandeur directly, hence a table of ones. Four places
// are read at the touch, which is what an order crosses, and the American reports give
// an effective spread, which is twice the distance from the fill to the midpoint, so one
// leg pays half of it and a round trip pays the whole.
//
// It was not always a table of ones. Xetra used to come from the monthly XLM workbook,
// halved, and the halving was the weak point: it came from measured round trips of our
// own rather than from published data, and it stood in for a relation that is not
// constant. The workbook prices a 100 000 € order, a retail order sits inside the touch,
// and how far apart those two are depends on the depth of the book — reading 40 listings
// across the range put the touch between 0.47 and 1.00 of XLM at the quartiles, with
// EUNL, tick-bound at half a cent, down at 0.19. Measuring the touch removes both the
// private anchor and the extrapolation, at the cost of a page per listing.
//
// A source that ever needs a conversion again puts it here, where the whole table can
// be read at once. The per-share path below never multiplies by it.
const CROSSED = {
  xetra: 1,
  lse: 1,
  six: 1,
  tsej: 1,
  euronext: 1,
  eurotlx: 1,
  budapest: 1,
  luxse: 1,
  us605: 1,
  tradegate: 1,
  gettex: 1,
  munich: 1,
  lsex: 1,
  lsin: 1,
  quotrix: 1,
  vienna: 1,
  xice: 1,
  fnis: 1,
  xcse: 1,
  xsto: 1,
  fnse: 1,
  fndk: 1,
  fnfi: 1,
  athex: 1,
  xtal: 1,
  xris: 1,
  xlit: 1,
  csecy: 1,
  bsse: 1,
  set: 1,
  psx: 1,
  moex: 1,
  tase: 1,
  xcas: 1,
  direkthandel: 1,
  xhel: 1,
  xpra: 1,
  frankfurt: 1,
  hamburg: 1,
  hannover: 1,
  eix: 1,
  tib: 1,
  stuttgart: 1,
  bmv: 1,
  lima: 1,
  questrade: 1,
  pure: 1,
  binance: 1,
  coinbase: 1,
  alpaca: 1,
  kraken: 1,
  krakenx: 1,
  gpw: 1,
  cxe: 1,
  dxe: 1,
  bxswiss: 1,
  adx: 1,
  dfm: 1,
  bhb: 1,
  msx: 1,
  asx: 1,
  nse: 1,
};

const CONVENTION =
  "coût d'un aller-retour, taille d'un particulier, à la touche, ramené à la moyenne de séance";
// The generation that measured the touch but published it at whatever hour it was read.
const AT_READING_HOUR = "coût d'un aller-retour, taille d'un particulier, mesuré à la touche";
// The generation that read Xetra from the monthly workbook and halved it.
const XLM_HALVED = "coût d'un aller-retour, taille d'un particulier, avec la page du carnet";
// The generation before that, which stored a bare number with no page beside it.
const NUMBERS_ONLY = "coût d'un aller-retour, taille d'un particulier";

// Older files are brought forward rather than discarded, because discarding would leave
// the snapshot venues blank until the next open session. Three generations exist: one
// that published each source's raw figure, which put two grandeurs in one field and made
// an XLM line read twice the cost of the same trade on a touch line; one that fixed that
// but kept the leaf a number with no page beside it; and one that carried Xetra as half
// its XLM.
//
// That last one is the only case where a stored figure has to go rather than be
// converted. Half an XLM is not a touch and no arithmetic turns it into one — the two
// differ by a factor that depends on the fund — so those leaves are dropped and the next
// pass reads the book instead. Only Xetra's are affected, and only until it next opens.
if (Object.keys(spreads).length && store.convention !== CONVENTION) {
  // Only the generation that halved an XLM has Xetra values that cannot be salvaged,
  // and only its Xetra values: dropping them on any convention change would throw away
  // touches already measured, which is the opposite of the intent.
  const halved = store.convention === XLM_HALVED;
  const convert = store.convention !== NUMBERS_ONLY && store.convention !== AT_READING_HOUR && !halved;
  let moved = 0;
  let dropped = 0;
  for (const [isin, byMic] of Object.entries(spreads))
    for (const [mic, byCurrency] of Object.entries(byMic)) {
      const venue = VENUES.find((v) => v.mic === mic);
      const g = CROSSED[venue?.source];
      for (const [currency, leaf] of Object.entries(byCurrency)) {
        const was = typeof leaf === "number" ? leaf : leaf?.bp;
        if (!(was > 0) || (convert && g == null)) continue;
        if (halved && venue?.source === "xetra") {
          delete byCurrency[currency];
          dropped++;
          continue;
        }
        byCurrency[currency] = {
          bp: Number((convert ? was * g : was).toFixed(2)),
          // The London page is keyed by ticker, which a stored line does not carry, so
          // its link arrives with the next pass rather than being guessed here.
          url: spreadUrl({ isin, currency, venue }),
        };
        moved++;
      }
    }
  if (moved || dropped) {
    console.error(
      `convention : ${moved} valeurs reprises${convert ? " et converties" : ""}` +
        `${dropped ? `, ${dropped} valeurs Xetra abandonnées, à relire au carnet` : ""}\n`
    );
  }
}

// Xetra's whole table, fetched once per month rather than per listing.
const { xlm, month: xlmMonth, slots: SLOTS = [] } = await monthlyXlm({ refresh: REFRESH });

// ------------------------------------------------------------------ the hour it was read
//
// A touch read at noon and the same touch read at half past three are not the same
// number, and until now the file published whichever hour the pass happened to run. The
// intraday XLM in the same monthly workbook says how much that matters: for the median
// fund the dearest half hour costs 1.25 times the cheapest, for EUNL 1.94, the open being
// the worst and lunchtime the best. Our passes at 11h, 13h and 15h all land on cheap
// hours, so an unnormalised median reads a few per cent below the day.
//
// So a reading is divided by its own half hour's multiple, which puts every figure on one
// footing: the cost of a round trip at the average hour of the session. The shape is
// published beside the value, so a front end that knows when its user trades can put the
// hour back.
//
// One shape serves the four European places. It comes from Xetra alone, but what makes a
// tracker widen at half past three is New York opening rather than anything German, and
// London, Zurich and Euronext keep the same 9 to 17:30 as Frankfurt to the minute in
// Berlin time. The alternative was to leave three quarters of the file unnormalised.
const shapeOf = (l) =>
  xlm[`${l.isin}|${l.currency}`]?.shape ??
  // A London line in sterling has no Xetra line of its own, and the shape belongs to the
  // fund's underlying rather than to the currency it is quoted in.
  xlm[Object.keys(xlm).find((k) => k.startsWith(`${l.isin}|`))]?.shape ??
  null;

// Which half hour a moment falls in, by the workbook's own labels, in Berlin time — the
// zone all four places keep their session in. Null outside the session, which a snapshot
// venue should never be, and which therefore goes unnormalised rather than guessed.
const SLOT_STARTS = SLOTS.map((s) => {
  const [h, m] = s.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
});
const slotOf = (when = new Date()) => {
  if (!SLOT_STARTS.length) return null;
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(when);
  const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const minutes = (Number(at.hour) % 24) * 60 + Number(at.minute);
  let found = null;
  for (const [i, start] of SLOT_STARTS.entries()) if (minutes >= start) found = i;
  // Past the last bucket's end is out of session, not in the last bucket.
  return found != null && minutes < SLOT_STARTS.at(-1) + 30 ? found : null;
};
// The American one likewise: five firms' monthly reports, keyed by symbol.
const us605 = await monthlyEffectiveSpread({ refresh: REFRESH });

// A crossed book means the feed is confused, not that the trade is profitable, so it
// yields nothing rather than a negative cost.
const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  return ((ask - bid) / ((ask + bid) / 2)) * 1e4;
};

// The ASX and Cboe Australia touches are read once, at the open, into
// au-touch.json. A missing side is not stored. A monthly ETP average already
// in the file is a better figure than one morning's touch, so it stays.
function loadAuTouch() {
  const path = new URL("./au-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  // One Sydney book, in Australian dollars. A catalogue that prices the same
  // ISIN in euros or dollars is naming that book, not a second one.
  const ASX_NAMES = new Set(["xasx", "asx", "asxnationalmarket", "australia", "australiansecuritiesexchange"]);
  const extra = new Map();
  for (const row of catalogueRows()) {
    if (!ASX_NAMES.has(norm(row.exchange))) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency) || currency === "AUD") continue;
    const set = extra.get(isin) || new Set();
    set.add(currency);
    extra.set(isin, set);
  }
  let books = 0;
  for (const row of data.rows || []) {
    const bid = Number(row.bid);
    const ask = Number(row.ask);
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(bid, ask);
    if (!(bp > 0)) continue;
    const mic = row.mic === "CHIA" || row.venue === "CHIXAU" ? "CHIA" : row.mic === "XASX" || row.venue === "ASX" ? "XASX" : "";
    if (!mic) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const existing = spreads[isin]?.[mic]?.AUD;
    if (existing?.url && /asx-investment-products/.test(existing.url)) continue;
    const ticker = String(row.ticker || "").toUpperCase();
    const url =
      mic === "XASX"
        ? `https://www.asx.com.au/markets/company/${encodeURIComponent(ticker)}`
        : `https://www.cboe.com.au/company/quote/${encodeURIComponent(ticker)}`;
    const book = (spreads[isin] ||= {})[mic] ||= {};
    const figure = { bp: Number(bp.toFixed(2)), url };
    book.AUD = figure;
    books += 1;
    if (mic !== "XASX") continue;
    for (const currency of extra.get(isin) || []) {
      book[currency] = figure;
      books += 1;
    }
  }
  return { at: data.at, books };
}

// The Singapore touch is read once, during continuous matching, into
// sgx-touch.json. Each counter is its own book: the Singapore dollar
// line and the US dollar line of one ISIN are not copied onto each
// other. Renminbi is filed under both CNY and CNH, the two labels of
// that one counter. A code no catalogue lists is still kept.
function loadSgxTouch() {
  const path = new URL("./sgx-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const seen = new Map();
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const key = `${isin}|${currency}`;
    const prev = seen.get(key);
    if (prev && prev !== row.code) continue;
    seen.set(key, row.code || key);
    const url = row.url || `https://www.sgx.com/securities/equities/${encodeURIComponent(row.code || "")}`;
    const figure = { bp: Number(bp.toFixed(2)), url };
    const book = ((spreads[isin] ||= {})["XSES"] ||= {});
    book[currency] = figure;
    books += 1;
    if (currency === "CNY" || currency === "CNH") {
      const twin = currency === "CNY" ? "CNH" : "CNY";
      if (!book[twin]) {
        book[twin] = figure;
        books += 1;
      }
    }
  }
  return { at: data.at, books };
}

// The Hong Kong touch is read once, during continuous matching, into
// hk-touch.json. The Hong Kong dollar, renminbi and US dollar counters
// share an ISIN and not a book, so the currency is the counter's. A
// counter no catalogue lists is still kept. CNH and CNY are the two
// labels of the renminbi counter, so that book is filed under both.
function loadHkTouch() {
  const path = new URL("./hk-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const HK = new Set(["hkex", "sehk", "hongkong", "hks", "xhkg"]);
  const byCode = new Map();
  for (const row of catalogueRows()) {
    if (!HK.has(norm(row.exchange))) continue;
    const digits = String(row.ticker || "").replace(/\D/g, "").replace(/^0+/, "");
    if (!digits) continue;
    const code = digits.padStart(5, "0");
    if (code.length !== 5) continue;
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) continue;
    const counts = byCode.get(code) || new Map();
    counts.set(currency, (counts.get(currency) || 0) + 1);
    byCode.set(code, counts);
  }
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    const code = String(row.code || "").replace(/\D/g, "").padStart(5, "0");
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || code.length !== 5) continue;
    const named = String(row.currency || "").toUpperCase();
    let currency = /^[A-Z]{3}$/.test(named) ? named : "";
    if (!currency) {
      const counts = byCode.get(code);
      if (!counts) continue;
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue;
      currency = ranked[0][0];
    }
    const url = row.url || `https://stock.finance.sina.com.cn/hkstock/quotes/${code}.html`;
    const leaf = { bp: Number(bp.toFixed(2)), url };
    const book = (spreads[isin] ||= {})["XHKG"] ||= {};
    const currencies = currency === "CNH" || currency === "CNY" ? ["CNH", "CNY"] : [currency];
    for (const ccy of currencies) book[ccy] = leaf;
    books += 1;
  }
  return { at: data.at, books };
}

// The Bursa touch is read once, during continuous matching, into
// bursa-touch.json. The currency is the one the Bursa catalogues name
// for that ISIN. A tie is left out.
function loadBursaTouch() {
  const path = new URL("./bursa-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const MY = new Set(["myx", "xkls", "malaysia", "bursa", "bursamy", "malay", "klse"]);
  const byIsin = new Map();
  for (const row of catalogueRows()) {
    if (!MY.has(norm(row.exchange))) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const counts = byIsin.get(isin) || new Map();
    counts.set(currency, (counts.get(currency) || 0) + 1);
    byIsin.set(isin, counts);
  }
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const counts = byIsin.get(isin);
    if (!counts) continue;
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue;
    const url = row.url || `https://www.klsescreener.com/v2/stocks/view/${encodeURIComponent(row.code || "")}`;
    ((spreads[isin] ||= {})["XKLS"] ||= {})[ranked[0][0]] = { bp: Number(bp.toFixed(2)), url };
    books += 1;
  }
  return { at: data.at, books };
}

// HOSE and UPCOM touches are read once, during each board's continuous
// matching, into vn-touch.json. The currency is the one the Vietnam
// catalogues name for that ISIN on that board. A tie is left out. A
// file from another Ho Chi Minh day is left out.
function loadVnTouch() {
  const path = new URL("./vn-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const boards = { hose: "XSTC", hsx: "XSTC", xstc: "XSTC", hochiminh: "XSTC", upcom: "UPCM", hnx: "HSTC", hstc: "HSTC", hanoi: "HSTC" };
  const byIsin = new Map();
  for (const row of catalogueRows()) {
    const mic = boards[norm(row.exchange)];
    if (!mic) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const key = `${isin}|${mic}`;
    const counts = byIsin.get(key) || new Map();
    counts.set(currency, (counts.get(currency) || 0) + 1);
    byIsin.set(key, counts);
  }
  const micOf = { HOSE: "XSTC", UPCOM: "UPCM", HNX: "HSTC" };
  const url = "https://priceapi.bsc.com.vn/datafeed/instruments";
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    const mic = micOf[row.exchange];
    if (!mic || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const counts = byIsin.get(`${isin}|${mic}`);
    if (!counts) continue;
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (mic !== "HSTC" && ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue;
    const currencies = mic === "HSTC" ? [...counts.keys()] : [ranked[0][0]];
    const leaf = { bp: Number(bp.toFixed(2)), url: row.url || url };
    const book = ((spreads[isin] ||= {})[mic] ||= {});
    for (const currency of currencies) book[currency] = leaf;
    books += currencies.length;
  }
  return { at: data.at, books };
}

// Jakarta touches are read once, during continuous matching, into
// idx-touch.json. The currency is the one the quote names. A counter in
// a currency no catalogue lists is still kept. When the quote is one
// currency, that book is also filed under the other catalogue labels.
function loadIdxTouch() {
  const path = new URL("./idx-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const labels = new Map();
  for (const row of catalogueRows()) {
    if (norm(row.exchange) !== "idx") continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const set = labels.get(isin) || new Set();
    set.add(currency);
    labels.set(isin, set);
  }
  const byIsin = new Map();
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const list = byIsin.get(isin) || [];
    list.push({ currency, bp: Number(bp.toFixed(2)), url: row.url });
    byIsin.set(isin, list);
  }
  let books = 0;
  for (const [isin, rows] of byIsin) {
    const book = ((spreads[isin] ||= {})["XIDX"] ||= {});
    const currencies = new Set(rows.map((row) => row.currency));
    for (const row of rows) {
      book[row.currency] = { bp: row.bp, url: row.url };
      books += 1;
    }
    if (currencies.size !== 1) continue;
    const only = rows[0];
    for (const currency of labels.get(isin) || []) {
      if (book[currency]) continue;
      book[currency] = { bp: only.bp, url: only.url };
      books += 1;
    }
  }
  return { at: data.at, books };
}

// Kuwait touches are read once, during continuous matching, into
// kw-touch.json. The public quote is in fils; the stored book is the
// dinar. A counter named in another currency is its own book and is
// kept even when no catalogue lists it. One quote currency is also
// filed under the other catalogue labels of that ISIN.
function loadKwTouch() {
  const path = new URL("./kw-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuwait",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const labels = new Map();
  for (const row of catalogueRows()) {
    const names = [row.exchange, row.venue, row.exchangeName].filter(Boolean).map(norm);
    if (!names.some((name) => name === "kse" || name === "xkuw" || name === "kuwait" || name === "boursakuwait")) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || currency !== "KWD" && !isin.startsWith("KW")) continue;
    if (!/^[A-Z]{3}$/.test(currency)) continue;
    const set = labels.get(isin) || new Set();
    set.add(currency);
    labels.set(isin, set);
  }
  const byIsin = new Map();
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const list = byIsin.get(isin) || [];
    list.push({ currency, bp: Number(bp.toFixed(2)), url: row.url });
    byIsin.set(isin, list);
  }
  let books = 0;
  for (const [isin, rows] of byIsin) {
    const book = ((spreads[isin] ||= {})["XKUW"] ||= {});
    const currencies = new Set(rows.map((row) => row.currency));
    for (const row of rows) {
      book[row.currency] = { bp: row.bp, url: row.url };
      books += 1;
    }
    if (currencies.size !== 1) continue;
    const only = rows[0];
    for (const currency of labels.get(isin) || []) {
      if (book[currency]) continue;
      book[currency] = { bp: only.bp, url: only.url };
      books += 1;
    }
  }
  return { at: data.at, books };
}

// Ljubljana touches are read once, during continuous matching, into
// lj-touch.json. The currency is the one the quote names. A counter in
// a currency no catalogue lists is still kept. When the quote is one
// currency, that book is also filed under the other catalogue labels.
function loadLjTouch() {
  const path = new URL("./lj-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Ljubljana",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const labels = new Map();
  const lj = new Set(["ljse", "xlju", "ljubljana", "ljubljanskaborza", "ljubljanastockexchange"]);
  for (const row of catalogueRows()) {
    if (!lj.has(norm(row.exchange))) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const set = labels.get(isin) || new Set();
    set.add(currency);
    labels.set(isin, set);
  }
  const byIsin = new Map();
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const list = byIsin.get(isin) || [];
    list.push({ currency, bp: Number(bp.toFixed(2)), url: row.url });
    byIsin.set(isin, list);
  }
  let books = 0;
  for (const [isin, rows] of byIsin) {
    const book = ((spreads[isin] ||= {})["XLJU"] ||= {});
    const currencies = new Set(rows.map((row) => row.currency));
    for (const row of rows) {
      book[row.currency] = { bp: row.bp, url: row.url };
      books += 1;
    }
    if (currencies.size !== 1) continue;
    const only = rows[0];
    for (const currency of labels.get(isin) || []) {
      if (book[currency]) continue;
      book[currency] = { bp: only.bp, url: only.url };
      books += 1;
    }
  }
  return { at: data.at, books };
}

// GlobalConnect touches are read once, during continuous trading, into
// gc-touch.json. The currency is the one the catalogues name for that
// ISIN on that board. A tie is left out. A file from another Warsaw day
// is left out. The same ISIN on its home market stays under that market's MIC.
function loadGcTouch() {
  const path = new URL("./gc-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const byIsin = new Map();
  for (const row of catalogueRows()) {
    if (norm(row.exchange) !== "globalconnect") continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const counts = byIsin.get(isin) || new Map();
    counts.set(currency, (counts.get(currency) || 0) + 1);
    byIsin.set(isin, counts);
  }
  const url = "https://gpwglobalconnect.pl/etfy-pelna-wersja-notowan";
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const counts = byIsin.get(isin);
    if (!counts) continue;
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue;
    ((spreads[isin] ||= {})["XGLO"] ||= {})[ranked[0][0]] = { bp: Number(bp.toFixed(2)), url: row.url || url };
    books += 1;
  }
  return { at: data.at, books };
}

// NewConnect touches are read once, during continuous trading, into
// nc-touch.json. The book is zloty. A catalogue line in another currency
// is left out, and so is a tie. A file from another Warsaw day is left
// out. The same ISIN on the main Warsaw board stays under that board's MIC.
function loadNcTouch() {
  const path = new URL("./nc-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const byIsin = new Map();
  for (const row of catalogueRows()) {
    if (norm(row.exchange) !== "newconnect") continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const counts = byIsin.get(isin) || new Map();
    counts.set(currency, (counts.get(currency) || 0) + 1);
    byIsin.set(isin, counts);
  }
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const counts = byIsin.get(isin);
    if (!counts) continue;
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue;
    if (ranked[0][0] !== "PLN") continue;
    const url = row.url || `https://newconnect.pl/spolka?isin=${isin}`;
    ((spreads[isin] ||= {})["XNCO"] ||= {})["PLN"] = { bp: Number(bp.toFixed(2)), url };
    books += 1;
  }
  return { at: data.at, books };
}

// beQuoted touches are read once, during the session, into
// bequoted-touch.json. The book is kronor. A catalogue line in another
// currency is left out, and so is a tie. A file from another Stockholm
// day is left out.
function loadBequotedTouch() {
  const path = new URL("./bequoted-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const byIsin = new Map();
  for (const row of catalogueRows()) {
    if (norm(row.exchange) !== "xxxx") continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const counts = byIsin.get(isin) || new Map();
    counts.set(currency, (counts.get(currency) || 0) + 1);
    byIsin.set(isin, counts);
  }
  const url = "https://secure.bequoted.com/market/prices/";
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const counts = byIsin.get(isin);
    if (!counts) continue;
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue;
    if (ranked[0][0] !== "SEK") continue;
    ((spreads[isin] ||= {})["XXXX"] ||= {})["SEK"] = { bp: Number(bp.toFixed(2)), url: row.url || url };
    books += 1;
  }
  return { at: data.at, books };
}

// AQSE touches are read once, during continuous trading, into
// aqse-touch.json. The currency is the one the catalogues name. A GBX
// quote is already filed in GBP when that was the only sterling line.
// A tie is left out. A file from another London day is left out.
function loadAqseTouch() {
  const path = new URL("./aqse-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const names = new Set(["aqse", "aquis", "plusmarketsgroupformerlyofex", "plusmarkets", "ofex"]);
  const byIsin = new Map();
  for (const row of catalogueRows()) {
    if (!names.has(norm(row.exchange))) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const counts = byIsin.get(isin) || new Map();
    counts.set(currency, (counts.get(currency) || 0) + 1);
    byIsin.set(isin, counts);
  }
  const url = "https://www.aquis.eu/stock-exchange/trade-transparency";
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const counts = byIsin.get(isin);
    if (!counts || !counts.has(currency)) continue;
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue;
    if (ranked[0][0] !== currency) continue;
    ((spreads[isin] ||= {})["AQSE"] ||= {})[currency] = { bp: Number(bp.toFixed(2)), url: row.url || url };
    books += 1;
  }
  return { at: data.at, books };
}

// The Philippine touch is read once, during continuous matching, into
// pse-touch.json. The currency is the one the Manila catalogues name
// for that ISIN. A tie is left out.
function loadPseTouch() {
  const path = new URL("./pse-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const byIsin = new Map();
  for (const row of catalogueRows()) {
    const exchange = norm(row.exchange);
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    const onPse =
      exchange === "xphs" ||
      exchange.includes("philip") ||
      exchange.includes("manila") ||
      (exchange === "pse" && (currency === "PHP" || isin.startsWith("PH")));
    if (!onPse) continue;
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const counts = byIsin.get(isin) || new Map();
    counts.set(currency, (counts.get(currency) || 0) + 1);
    byIsin.set(isin, counts);
  }
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const counts = byIsin.get(isin);
    if (!counts) continue;
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue;
    const url = row.url || `https://frames.pse.com.ph/security/${encodeURIComponent(String(row.code || "").toLowerCase())}`;
    ((spreads[isin] ||= {})["XPHS"] ||= {})[ranked[0][0]] = { bp: Number(bp.toFixed(2)), url };
    books += 1;
  }
  return { at: data.at, books };
}

// The Nagoya touch is read once, during continuous matching, into
// nagoya-touch.json. The currency is the one the Nagoya catalogues name
// for that ISIN. A tie is left out. A file from another Nagoya day is
// left out. The same ISIN on Tokyo stays under Tokyo's MIC.
function loadNagoyaTouch() {
  const path = new URL("./nagoya-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const NAG = new Set(["nagoya", "nag", "xngo", "xnag"]);
  const byIsin = new Map();
  for (const row of catalogueRows()) {
    if (!NAG.has(norm(row.exchange))) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !/^[A-Z]{3}$/.test(currency)) continue;
    const counts = byIsin.get(isin) || new Map();
    counts.set(currency, (counts.get(currency) || 0) + 1);
    byIsin.set(isin, counts);
  }
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const counts = byIsin.get(isin);
    if (!counts) continue;
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue;
    const url = row.url || `https://www.tradingview.com/symbols/NAG-${encodeURIComponent(row.code || "")}/`;
    ((spreads[isin] ||= {})["XNGO"] ||= {})[ranked[0][0]] = { bp: Number(bp.toFixed(2)), url };
    books += 1;
  }
  return { at: data.at, books };
}

function loadBvbTouch() {
  const path = new URL("./bvb-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const BVB = new Set(["bvb", "xbse", "bucharest", "buchareststockexchange"]);
  const byIsin = new Map();
  for (const row of catalogueRows()) {
    if (!BVB.has(norm(row.exchange))) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || currency !== "RON") continue;
    byIsin.set(isin, true);
  }
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!byIsin.has(isin)) continue;
    const url =
      row.url ||
      `https://bvb.ro/FinancialInstruments/Details/FinancialInstrumentsDetails.aspx?s=${encodeURIComponent(row.code || "")}`;
    ((spreads[isin] ||= {})["XBSE"] ||= {}).RON = { bp: Number(bp.toFixed(2)), url };
    books += 1;
  }
  return { at: data.at, books };
}

function loadJseTouch() {
  const path = new URL("./jse-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const JSE = new Set(["jse", "xjse", "johannesburg", "johannesburgstockexchange"]);
  const byIsin = new Set();
  for (const row of catalogueRows()) {
    if (!JSE.has(norm(row.exchange))) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || currency !== "ZAR") continue;
    byIsin.add(isin);
  }
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!byIsin.has(isin)) continue;
    const url = row.url || `https://www.tradingview.com/symbols/JSE-${encodeURIComponent(row.code || "")}/`;
    ((spreads[isin] ||= {})["XJSE"] ||= {}).ZAR = { bp: Number(bp.toFixed(2)), url };
    books += 1;
  }
  return { at: data.at, books };
}

function loadBymaTouch() {
  const path = new URL("./byma-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !currency) continue;
    const url = row.url || `https://www.tradingview.com/symbols/BCBA-${encodeURIComponent(row.code || "")}/`;
    ((spreads[isin] ||= {})["XBUE"] ||= {})[currency] = { bp: Number(bp.toFixed(2)), url };
    books += 1;
  }
  return { at: data.at, books };
}

function loadBivaTouch() {
  const path = new URL("./biva-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const url = row.url || `https://www.tradingview.com/symbols/BIVA-${encodeURIComponent(row.code || "")}/`;
    ((spreads[isin] ||= {})["BIVA"] ||= {}).MXN = { bp: Number(bp.toFixed(2)), url };
    books += 1;
  }
  return { at: data.at, books };
}

function loadNairobiTouch() {
  const path = new URL("./nairobi-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const url = row.url || `https://www.tradingview.com/symbols/NSEKE-${encodeURIComponent(row.code || "")}/`;
    ((spreads[isin] ||= {})["XNAI"] ||= {}).KES = { bp: Number(bp.toFixed(2)), url };
    books += 1;
  }
  return { at: data.at, books };
}

function loadNgxTouch() {
  const path = new URL("./ngx-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const NGX = new Set(["nseng", "xngn", "nigeria", "ngx", "nigerianexchange"]);
  const byIsin = new Set();
  for (const row of catalogueRows()) {
    if (!NGX.has(norm(row.exchange))) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || currency !== "NGN") continue;
    byIsin.add(isin);
  }
  const todayIsins = new Set((data.rows || []).map((row) => String(row.isin || "").toUpperCase()));
  for (const isin of byIsin) {
    if (todayIsins.has(isin)) continue;
    const book = spreads[isin]?.XNGN;
    if (!book?.NGN) continue;
    delete book.NGN;
    if (!Object.keys(book).length) delete spreads[isin].XNGN;
  }
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!byIsin.has(isin)) continue;
    const url = row.url || `https://www.tradingview.com/symbols/NSENG-${encodeURIComponent(row.code || "")}/`;
    ((spreads[isin] ||= {})["XNGN"] ||= {}).NGN = { bp: Number(bp.toFixed(2)), url };
    books += 1;
  }
  return { at: data.at, books };
}

function loadBistTouch() {
  const path = new URL("./bist-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const BIST = new Set(["bist", "xist", "istanbul", "istanbulstockexchange", "borsaistanbul"]);
  const byIsin = new Set();
  for (const row of catalogueRows()) {
    if (!BIST.has(norm(row.exchange))) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || currency !== "TRY") continue;
    byIsin.add(isin);
  }
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!byIsin.has(isin)) continue;
    const url = row.url || `https://www.tradingview.com/symbols/BIST-${encodeURIComponent(row.code || "")}/`;
    ((spreads[isin] ||= {})["XIST"] ||= {}).TRY = { bp: Number(bp.toFixed(2)), url };
    books += 1;
  }
  return { at: data.at, books };
}

function loadBvcTouch() {
  const path = new URL("./bvc-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const BVC = new Set(["bvc", "colombia", "xbog", "bolsadevaloresdecolombia"]);
  const other = new Map();
  for (const row of catalogueRows()) {
    if (!BVC.has(norm(row.exchange))) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !currency || currency === "COP") continue;
    const set = other.get(isin) || other.set(isin, new Set()).get(isin);
    set.add(currency);
  }
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const url = row.url || `https://www.tradingview.com/symbols/BVC-${encodeURIComponent(row.code || "")}/`;
    const book = ((spreads[isin] ||= {})["XBOG"] ||= {});
    book.COP = { bp: Number(bp.toFixed(2)), url };
    books += 1;
    // BVC quotes the ISIN in pesos. A catalogue line in another currency
    // still trades that book when it is the only one.
    for (const currency of other.get(isin) || []) {
      if (book[currency]?.bp > 0) continue;
      book[currency] = { bp: Number(bp.toFixed(2)), url };
      books += 1;
    }
  }
  return { at: data.at, books };
}

function loadCsecyTouch() {
  const path = new URL("./csecy-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Nicosia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const CYPRUS = new Set(["csecy", "xcys", "cyprus", "cyprusstockexchange"]);
  const byIsin = new Set();
  for (const row of catalogueRows()) {
    if (!CYPRUS.has(norm(row.exchange))) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || currency !== "EUR") continue;
    byIsin.add(isin);
  }
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!byIsin.has(isin)) continue;
    const url = row.url || `https://www.tradingview.com/symbols/CSECY-${encodeURIComponent(row.code || "")}/`;
    ((spreads[isin] ||= {})["XCYS"] ||= {}).EUR = { bp: Number(bp.toFixed(2)), url };
    books += 1;
  }
  return { at: data.at, books };
}

function loadCurrencyTouch(file, zone, mic) {
  const path = new URL(file, import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
    const currencies = [...new Set((row.currencies || [row.currency]).map((currency) => String(currency || "").toUpperCase()))].filter((currency) => /^[A-Z]{3}$/.test(currency));
    const url = row.url;
    for (const currency of currencies) {
      ((spreads[isin] ||= {})[mic] ||= {})[currency] = { bp: Number(bp.toFixed(2)), url };
      books += 1;
    }
  }
  return { at: data.at, books };
}

function loadSetTouch() {
  return loadCurrencyTouch("./set-touch.json", "Asia/Bangkok", "XBKK");
}

function loadPsxTouch() {
  return loadCurrencyTouch("./psx-touch.json", "Asia/Karachi", "XKAR");
}

function loadMoexTouch() {
  return loadCurrencyTouch("./moex-touch.json", "Europe/Moscow", "MISX");
}

function loadTaseTouch() {
  return loadCurrencyTouch("./tase-touch.json", "Asia/Jerusalem", "XTAE");
}

function loadXcasTouch() {
  return loadCurrencyTouch("./xcas-touch.json", "Africa/Casablanca", "XCAS");
}

function loadSofiaTouch() {
  const path = new URL("./sofia-touch.json", import.meta.url);
  if (!fs.existsSync(path)) return { books: 0 };
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (data.date !== today) return { books: 0, at: data.at, stale: true };
  const SOFIA = new Set(["bsesof", "xbul", "sofia", "bulgarianstockexchange"]);
  const byIsin = new Set();
  for (const row of catalogueRows()) {
    if (!SOFIA.has(norm(row.exchange))) continue;
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.currency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || currency !== "EUR") continue;
    byIsin.add(isin);
  }
  let books = 0;
  for (const row of data.rows || []) {
    const bp = Number(row.bp) > 0 ? Number(row.bp) : bpFrom(Number(row.bid), Number(row.ask));
    if (!(bp > 0)) continue;
    const isin = String(row.isin || "").toUpperCase();
    if (!byIsin.has(isin)) continue;
    const url = row.url || `https://www.tradingview.com/symbols/BSESOF-${encodeURIComponent(row.code || "")}/`;
    ((spreads[isin] ||= {})["XBUL"] ||= {}).EUR = { bp: Number(bp.toFixed(2)), url };
    books += 1;
  }
  return { at: data.at, books };
}

// A single snapshot is a poor estimate of what a trade will cost: the same fund was
// measured moving by a factor of 1.7 within a session, and another by 3. So readings
// accumulate and the published figure is their median, which is what Deutsche Boerse
// does to build XLM. The median rather than the mean because one wide print during a
// thin minute should not move the answer.
//
// Keeping the history is also what lets the figure survive the close: an evening run
// adds nothing and leaves yesterday's average standing.
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const READING_DAYS = 90;
const READING_KEEP = 24;
const MIN_GAP_MIN = Number(arg("min-gap") || 30);

// Two of the five sources want a browser, for opposite reasons: Euronext decrypts its
// quotes in the page, one listing at a time, so it sets the pace of a run; Xetra wants one
// tab for the whole pass, to hold the origin its socket and its token service check, and
// then answers thousands of instruments through it in seconds. One connection, and one tab
// per worker, opened only if that worker ever meets a listing that needs one.
const CONCURRENCY = Math.max(1, Number(arg("jobs") || 4));
const pages = [];
// Memoising the promise rather than the connection is what makes this safe to call
// from several workers at once: the assignment happens before anyone awaits, so they
// all share one connection. Storing the resolved browser instead let four workers
// each open their own, and the three nobody closed kept the process alive for ever.
let connecting = null;
const connect = () =>
  (connecting ||= puppeteer.connect({
    browserURL: CHROME_URL,
    defaultViewport: null,
    protocolTimeout: 240000,
  }));

async function tab() {
  const p = await (await connect()).newPage();
  // Only one tab can be in front, and Chrome throttles the rest: with four working at
  // once, twelve of fifty Xetra pages ran out of time purely from being backgrounded.
  // Declaring the lifecycle state active exempts them.
  await p
    .createCDPSession()
    .then((s) => s.send("Page.setWebLifecycleState", { state: "active" }))
    .catch(() => {});
  pages.push(p);
  return p;
}

// ------------------------------------------------------- Xetra, in bulk over the socket
//
// The socket wants a token, good for seven minutes, and the service that mints it only
// answers the application: the request carries an `X-Security` digest the bundle computes,
// and without it the answer is an empty object — asked from Node, and asked with a plain
// fetch from inside the page, both times.
//
// Reproducing that digest would mean reading their minified bundle and re-reading it after
// every deployment. Reading their answer instead costs nothing and cannot go stale, so the
// page is made to ask — which it only does when it holds no valid token, hence the emptied
// storage — and the response body is taken off the wire.
//
// The socket itself is opened from inside the page too, where the origin and the handshake
// are the browser's business rather than ours.
const XETRA_WS = "wss://api.live.deutsche-boerse.com/v1/mds/ws";
const XETRA_TOKEN = "https://api.live.deutsche-boerse.com/v1/mdstokenservice/token";
const XETRA_ORIGIN = "https://live.deutsche-boerse.com";
// One instrument to land on for the origin; any product page will do.
const XETRA_ANY = "https://www.boerse-frankfurt.de/etf/IE00B4L5Y983";
// Batches, because one message carrying every instrument would be a single point of
// failure and a queue nothing can be read out of until it ends. Eight hundred answered in
// four seconds in testing, so five hundred leaves room without costing round trips.
const XETRA_BATCH = 500;

const xetraQuotes = new Map();
let xetraTrouble = null;

async function xetraToken(p, cdp) {
  let token = null;
  const onResponse = async ({ requestId, response }) => {
    if (token || !response.url.startsWith(XETRA_TOKEN) || response.status !== 200) return;
    try {
      const { body } = await cdp.send("Network.getResponseBody", { requestId });
      token = (String(body).match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/) || [])[0] || null;
    } catch {
      // The body can be gone by the time it is asked for; another load will bring another.
    }
  };
  cdp.on("Network.responseReceived", onResponse);
  try {
    for (let attempt = 0; attempt < 3 && !token; attempt++) {
      await cdp
        .send("Storage.clearDataForOrigin", { origin: XETRA_ORIGIN, storageTypes: "all" })
        .catch(() => {});
      await p.goto(XETRA_ANY, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      for (let i = 0; i < 24 && !token; i++) await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    cdp.off("Network.responseReceived", onResponse);
  }
  return token;
}

// Asks for a batch and resolves when the server says it is done. Everything happens in
// the page: `WebSocket` there carries the origin the server expects.
const xetraAsk = (p, token, queries) =>
  p.evaluate(
    (ws, token, queries, budget) =>
      new Promise((resolve) => {
        const socket = new WebSocket(ws);
        const quotes = [];
        socket.onopen = () => {
          socket.send(JSON.stringify({ subscribeAuthentication: { token }, requestId: "auth" }));
          socket.send(JSON.stringify({ heartbeat: { period: 30 }, requestId: "beat" }));
          socket.send(
            JSON.stringify({ listMarketstates: { marketstateQueries: queries }, requestId: "bulk" })
          );
        };
        socket.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.requestId !== "bulk") return;
          const d = msg.dataMarketstate;
          if (d) {
            quotes.push({
              id: d.marketstateId,
              bid: d.bid?.value ?? null,
              ask: d.ask?.value ?? null,
              currency: d.currency ?? null,
            });
          }
          if (msg.isComplete) {
            socket.close();
            resolve({ quotes, error: null });
          }
        };
        socket.onerror = () => resolve({ quotes, error: "le socket a rendu une erreur" });
        socket.onclose = () => resolve({ quotes, error: "le socket s'est fermé avant la fin" });
        setTimeout(() => {
          socket.close();
          resolve({ quotes, error: `pas de fin de réponse en ${budget / 1000} s` });
        }, budget);
      }),
    XETRA_WS,
    token,
    queries,
    60000
  );

async function xetraBulk(lines, ownTab) {
  const p = await ownTab();
  const cdp = await p.createCDPSession();
  await cdp.send("Network.enable");
  let fresh = await xetraToken(p, cdp);
  if (!fresh) {
    xetraTrouble = "le service de jeton de Boerse Frankfurt n'a rien rendu";
    console.error(`    ${xetraTrouble}\n`);
    return;
  }
  // The token dies after seven minutes; a batch takes seconds, so it is renewed between
  // batches rather than refreshed mid-flight.
  let born = Date.now();

  const batches = [];
  for (let i = 0; i < lines.length; i += XETRA_BATCH) batches.push(lines.slice(i, i + XETRA_BATCH));
  let answered = 0;
  for (const [i, batch] of batches.entries()) {
    if (Date.now() - born > 5 * 60000) {
      fresh = (await xetraToken(p, cdp)) || fresh;
      born = Date.now();
    }
    const queries = batch.map((l) => `DELAYED[${l.isin},${l.currency}@ETR>STX]`);
    const { quotes, error } = await xetraAsk(p, fresh, queries);
    for (const q of quotes) {
      // "IE00B4L5Y983,EUR@ETR" — the line asked for, echoed back, which is what makes one
      // message for hundreds of instruments safe to unpick.
      const [isin, rest] = String(q.id).split(",");
      const currency = (rest || "").split("@")[0];
      if (isin && currency) xetraQuotes.set(`${isin}|${currency}`, { ...q, currency: q.currency || currency });
    }
    answered += quotes.length;
    if (error) xetraTrouble = error;
    console.error(
      `    Xetra, lot ${i + 1}/${batches.length} : ${quotes.length}/${batch.length} cotations` +
        `${error ? ` — ${error}` : ""}`
    );
  }
  console.error(`    Xetra : ${answered} cotations sur ${lines.length} demandées\n`);
}

const xetraCurrencies = (isin) =>
  Object.keys(xlm)
    .filter((k) => k.startsWith(`${isin}|`))
    .map((k) => k.split("|")[1]);

// The currency to ask the socket for. The workbook names a fund's real lines. A share is
// not in it and has one euro book. A catalogue line in another currency uses that sole
// book. Several lines, none of them the one named, are left alone.
const xetraAskCurrency = (l) => {
  if (xlm[`${l.isin}|${l.currency}`] || l.currency === "EUR") return l.currency;
  const books = xetraCurrencies(l.isin);
  if (books.length <= 1) return books[0] || "EUR";
  return null;
};

// ------------------------------------------------------------- Euronext, finding the page
//
// The Euronext adapter long built its URL as `/product/etfs/{isin}-{mic}`, which is a page
// only for a fund on a main market, and answered "instrument not found" for everything
// else. That refused every share on the platform — around five hundred at Trading212 alone,
// Paris, Amsterdam, Brussels and Lisbon entire — for no reason to do with the book.
//
// Two things have to be known before the page can be named, and the exchange will say both
// if asked. The first is the family: shares live under `equities`, funds under `etfs`, and
// the commodity and crypto trackers under `etvs`. The second is the segment, which is not
// the MIC a broker gives: Euronext Growth Paris is ALXP and Euronext Access XMLI, and Milan
// runs its domestic shares as MTAA, its foreign GEM shares as BGEM, and its funds as ETFP
// — XMIL naming none of those.
//
// The search endpoint returns both, as a ready-made path, for one small JSON call — next to
// nothing against the page load of several seconds that follows, and it saves the load
// entirely when the answer is that the line is not there.
//
// Only segments the named exchange itself runs are accepted. The search answers about the
// security rather than the place, so for Accor it also offers Milan's MTAH, EuroTLX, and
// nine series of options: all real books, none of them what a broker means by "Euronext
// Paris", and any of them published here would file another market's spread under this one.
// A segment absent from this table is refused by name, so that a place worth adding says so
// in the log instead of disappearing.
const EURONEXT_SEGMENTS = {
  XPAR: ["XPAR", "ALXP", "XMLI"],
  XAMS: ["XAMS"],
  XBRU: ["XBRU"],
  XLIS: ["XLIS"],
  XMIL: ["MTAA", "BGEM", "ETFP"],
  ETLX: ["ETLX"],
  XOSL: ["XOSL"],
  XMSM: ["XMSM"],
};
// Families whose page carries a book. `stock-options` and the other derivative products
// come back from the same search and are not this file's subject.
const EURONEXT_FAMILIES = new Set(["equities", "etfs", "etvs", "funds"]);

const euronextSearch = new Map();
async function euronextPage(l) {
  if (!euronextSearch.has(l.isin)) {
    euronextSearch.set(
      l.isin,
      (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(`https://live.euronext.com/en/instrumentSearch/searchJSON?q=${l.isin}`, {
              headers: { "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(15000),
            });
            if (res.ok) return await res.json();
          } catch {
            /* retried below */
          }
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
        return null;
      })()
    );
  }
  const rows = await euronextSearch.get(l.isin);
  if (!rows) return { url: null, note: "recherche Euronext sans réponse" };

  const lines = rows
    .map((e) => ({ mic: e.mic, family: e.link?.split("/")[3], link: e.link }))
    .filter((e) => e.link && EURONEXT_FAMILIES.has(e.family));
  // In the exchange's own order of preference: the main market first, then the growth and
  // access segments, so that a company listed on both is read where the volume is.
  const segments = EURONEXT_SEGMENTS[l.mic] ?? [l.mic];
  const hit = segments.flatMap((mic) => lines.filter((e) => e.mic === mic))[0];
  if (!hit) {
    const others = [...new Set(lines.map((e) => e.mic))];
    return {
      url: null,
      note: others.length ? `Euronext le cote sur ${others.join(", ")}, pas sur ${l.mic}` : `non coté sur ${l.mic}`,
    };
  }
  return { url: `https://live.euronext.com${hit.link}/market-information` };
}

// -------------------------------------------------------------- Wiener Börse
//
// Delayed bid/ask on the instrument page (15 min). There is no free monthly average
// like Xetra's XLM; the published figure is the median of those delayed touches, the
// same way Paris and London are built. Pages are named `{slug}-{ISIN}` under
// stock-prime-market / stock-standard-market; the lists and the search both carry
// the path.

const VIENNA_LISTS = [
  "https://www.wienerborse.at/en/stocks-prime-market/",
  "https://www.wienerborse.at/en/stocks-standard-market/",
  "https://www.wienerborse.at/en/stocks-global-market/",
];
const viennaPages = new Map();

const viennaNumber = (s) => {
  const t = String(s || "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return n > 0 ? n : null;
};

async function viennaDiscover() {
  if (viennaPages.size) return;
  for (const list of VIENNA_LISTS) {
    try {
      const res = await fetchOk(list, 20000);
      const html = await res.text();
      for (const m of html.matchAll(/\/en\/stock-[^"'>\s]+-([A-Z]{2}[A-Z0-9]{10})\/?/g)) {
        if (!viennaPages.has(m[1])) viennaPages.set(m[1], `https://www.wienerborse.at${m[0]}`);
      }
    } catch {
      /* list optional; search still finds a single ISIN */
    }
  }
}

// The ETF price list is one row per ISIN, quoted in euro. Bid is the first number
// of that cell and the volume sits beside it. A catalogue line in another currency
// trades this same book.
const viennaEtf = new Map();
const viennaCell = (cell) => viennaNumber(String(cell || "").replace(/<[^>]+>/g, " ").match(/[0-9][0-9.,]*/)?.[0]);

async function loadViennaEtf() {
  if (viennaEtf.size) return;
  const first = "https://www.wienerborse.at/en/exchange-traded-funds/";
  const html0 = await (await fetchOk(first, 20000)).text();
  const last = Math.max(1, ...[...html0.matchAll(/c8001-page=(\d+)/g)].map((m) => Number(m[1])));
  const htmls = [html0];
  for (let page = 2; page <= last; page++) {
    const url = `https://www.wienerborse.at/en/exchange-traded-funds/?c8001-page=${page}&per-page=50`;
    htmls.push(await (await fetchOk(url, 20000)).text());
  }
  for (const html of htmls) {
    for (const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
      const row = m[1];
      const isin = row.match(/data-isin="([A-Z]{2}[A-Z0-9]{10})"/)?.[1];
      if (!isin) continue;
      const tds = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((td) => td[1]);
      const book = { bid: viennaCell(tds[5]), ask: viennaCell(tds[6]) };
      if (viennaEtf.has(isin)) viennaEtf.get(isin).dup = true;
      else viennaEtf.set(isin, book);
    }
  }
}

async function viennaPage(l) {
  await viennaDiscover();
  if (viennaPages.has(l.isin)) return { url: viennaPages.get(l.isin) };
  try {
    const res = await fetchOk(`https://www.wienerborse.at/en/search/?q=${l.isin}`, 20000);
    const html = await res.text();
    const href = [...html.matchAll(/href="(\/en\/stock-[^"]+)"/g)]
      .map((m) => m[1])
      .find((h) => h.toUpperCase().includes(l.isin));
    if (!href) return { url: null, note: "Wiener Börse n'a pas de page pour cet ISIN" };
    const url = `https://www.wienerborse.at${href}`;
    viennaPages.set(l.isin, url);
    return { url };
  } catch (e) {
    return { url: null, note: String(e.message || e).slice(0, 160) };
  }
}

// ------------------------------------------------- Tradegate, gettex, LS Exchange
//
// Three retail German books, one delayed pre-trade dump each, published because MiFID
// says they must. None of them exposes a live book without a terminal, which is why they
// were listed as unsourced: the files were never read, not because they are paid.
//
// Tradegate's minute file is a tape of every quote update, so the last two-sided print
// per ISIN and currency is the book. gettex publishes a 15-minute snapshot of MUNC
// (continuous) and MUND; the continuous book is the one a market order hits, and MUND
// only fills a hole. LS Exchange answers a CSV of the touch keyed by ISIN, in euro.

const delayedQuotes = {
  tradegate: new Map(),
  gettex: new Map(),
  munich: new Map(),
  lsex: new Map(),
  quotrix: new Map(),
  frankfurt: new Map(),
  hamburg: new Map(),
  hannover: new Map(),
  eix: new Map(),
  tib: new Map(),
  bxswiss: new Map(),
  lsin: new Map(),
  stuttgart: new Map(),
  bmv: new Map(),
  lima: new Map(),
  questrade: new Map(),
  binance: new Map(),
  coinbase: new Map(),
  alpaca: new Map(),
  kraken: new Map(),
  adx: new Map(),
  dfm: new Map(),
  bhb: new Map(),
  msx: new Map(),
};
const delayedTrouble = {
  tradegate: null,
  gettex: null,
  munich: null,
  lsex: null,
  quotrix: null,
  frankfurt: null,
  hamburg: null,
  hannover: null,
  eix: null,
  tib: null,
  bxswiss: null,
  lsin: null,
  stuttgart: null,
  bmv: null,
  lima: null,
  questrade: null,
  binance: null,
  coinbase: null,
  alpaca: null,
  kraken: null,
  adx: null,
  dfm: null,
  bhb: null,
  msx: null,
};

const UA = { "User-Agent": "Mozilla/5.0" };

async function fetchOk(url, timeout = 60000) {
  const res = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function gunzipText(url) {
  const buf = Buffer.from(await (await fetchOk(url)).arrayBuffer());
  try {
    return gunzipSync(buf).toString("utf8");
  } catch {
    return buf.toString("utf8");
  }
}

// MUND is a 15-minute tape of tens of millions of ticks, not a snapshot. Loading it as
// a string OOMs; the last two-sided print per ISIN is the book, and a stream is enough.
async function forEachGunzipLine(url, onLine, timeout = 180000) {
  const res = await fetchOk(url, timeout);
  const stream = Readable.fromWeb(res.body).pipe(createGunzip());
  for await (const line of readline.createInterface({ input: stream, crlfDelay: Infinity })) {
    if (line) onLine(line);
  }
}

async function loadMfsTape(product, dest, wanted, minutes = 1, keepIsin = false) {
  const index = await (await fetchOk(`https://mfs.deutsche-boerse.com/api/${product}`)).json();
  const files = (index.CurrentFiles || []).slice(0, minutes);
  if (!files.length) throw new Error(`index ${product} vide`);
  const isins = keepIsin ? new Set([...wanted].map((k) => k.split("|")[0])) : null;
  dest.clear();
  for (const file of files) {
    const text = await gunzipText(`https://mfs.deutsche-boerse.com/api/download/${file}`);
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      const isin = String(o.instrumentIdentificationCode || "").toUpperCase();
      const currency = String(o.priceCurrency || "").toUpperCase();
      const key = `${isin}|${currency}`;
      if (!isin || !currency) continue;
      if (wanted.size && !wanted.has(key) && !(isins && isins.has(isin))) continue;
      const bid = Number(o.bestBid ?? o.bid);
      const ask = Number(o.bestAsk ?? o.ask);
      if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
      const at = o.updateDateAndTime || o.publicationDateAndTime || "";
      const prev = dest.get(key);
      if (prev && prev.at > at) continue;
      dest.set(key, { bid, ask, currency, at });
    }
  }
  return files[0];
}

async function loadTradegate(wanted) {
  // One minute of the tape only quotes names that printed. Fifteen minutes
  // covers the evening book the way the Frankfurt floor pass does.
  return loadMfsTape("DGAT-pretrade", delayedQuotes.tradegate, wanted, 15);
}

async function loadFrankfurt(wanted) {
  // One minute of the floor tape only quotes names that moved. Fifteen minutes
  // covers the specialist book without pulling the whole day. Every currency of
  // a wanted ISIN is kept, so a catalogue line in another currency can use the
  // sole book.
  return loadMfsTape("DFRA-pretrade", delayedQuotes.frankfurt, wanted, 15, true);
}

const XSTU_INDEX =
  "https://www.boerse-stuttgart.de/en/business-solutions/reports/mifir-ii-delayed-data/xstu-pre-trade/";

async function waitForNewFile(dir, before, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const now = fs.readdirSync(dir).filter((name) => !name.endsWith(".crdownload"));
    const added = now.filter((name) => !before.has(name));
    if (added.length) return added[0];
    await new Promise((r) => setTimeout(r, 250));
  }
  return "";
}

// Cloudflare blocks the index from a bare fetch. A signed-in Chrome tab can open
// it, and each "Download" is a short-lived link on ddl.service.boerse-stuttgart.de.
// One minute of the tape is every name that printed; fifteen covers the evening
// book the way the Frankfurt floor pass does.
async function loadStuttgart(wanted, ownTab) {
  const page = await ownTab();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xstu-"));
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });

  await page.goto(XSTU_INDEX, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .map((a) => a.href)
      .filter((href) => /ddl\.service\.boerse-stuttgart\.de/.test(href))
      .slice(0, 15)
  );
  if (!hrefs.length) throw new Error("aucun fichier XSTU sur la page delayed-data");

  delayedQuotes.stuttgart.clear();
  let files = 0;
  for (const href of hrefs) {
    const before = new Set(fs.readdirSync(dir));
    await page.evaluate((url) => {
      const a = [...document.querySelectorAll("a[href]")].find((el) => el.href === url);
      if (a) a.click();
    }, href);
    const name = await waitForNewFile(dir, before);
    if (!name) continue;
    files += 1;
    let rows;
    try {
      rows = JSON.parse(gunzipSync(fs.readFileSync(path.join(dir, name))).toString("utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const isin = String(row.Isin || "").toUpperCase();
      const currency = String(row.PriceCurrency || "").toUpperCase();
      const key = `${isin}|${currency}`;
      if (!isin || !currency || (wanted.size && !wanted.has(key))) continue;
      const bid = Number(row.Bid);
      const ask = Number(row.Ask);
      if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
      const at = row.TransactionTime || "";
      const prev = delayedQuotes.stuttgart.get(key);
      if (prev && prev.at > at) continue;
      delayedQuotes.stuttgart.set(key, { bid, ask, currency, at });
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  if (!files) throw new Error("téléchargement XSTU vide");
  return files;
}

// IBKR writes the BMV series letter against the ticker (SDMXXN). The site prints
// the same line as "SDMXX N", or "AAPL *". Only a candidate that exists in the
// directory is kept, so AAPL does not become AAP L.
function bmvTickerKeys(ticker) {
  const s = String(ticker || "")
    .toUpperCase()
    .replace(/\*/g, "")
    .trim();
  const keys = [s, s.replace(/\s+/g, "")];
  const letter = s.match(/^([A-Z0-9]+?)([A-Z])$/);
  if (letter) keys.push(`${letter[1]} ${letter[2]}`);
  const digits = s.match(/^([A-Z]+)(\d+)$/);
  if (digits) keys.push(`${digits[1]} ${digits[2]}`);
  return [...new Set(keys.filter(Boolean))];
}

const BMV_HOME = "https://www.bmv.com.mx/es/mercados/mercado-global";
const BMV_HOST = "https://www.bmv.com.mx";
const BMV_JSON = `${BMV_HOST}/es/Grupo_BMV/BmvJsonGeneric`;
const BMV_CLAVES = `${BMV_HOST}/es/Grupo_BMV/BusquedaCotizacionJSON?idBusquedaCotizacion=global`;

function parseBmvJsonp(text) {
  const i = String(text).indexOf("{");
  const j = String(text).lastIndexOf("}");
  if (i < 0 || j < i) return null;
  try {
    return JSON.parse(text.slice(i, j + 1));
  } catch {
    return null;
  }
}

async function bmvGet(url, cookie, timeout = 20000) {
  const res = await fetch(url, {
    headers: {
      Cookie: cookie,
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json,text/plain,*/*",
      Referer: BMV_HOME,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseBmvJsonp(await res.text());
}

// The public quote is twenty minutes late and still the BMV's own book. A bare
// fetch is refused; the cookies from a Chrome tab that has opened the site are
// enough. The directory is one call, then one quote per distinct emission.
async function loadBmv(lines, ownTab) {
  const page = await ownTab();
  await page.goto(BMV_HOME, { waitUntil: "networkidle2", timeout: 60000 });
  const cookie = (await page.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  if (!cookie) throw new Error("session BMV sans cookie");

  const dir = await bmvGet(BMV_CLAVES, cookie, 60000);
  const claves = dir?.response?.clavesCotizacion || [];
  if (!claves.length) throw new Error("annuaire BMV vide");

  const byKey = new Map();
  for (const c of claves) {
    if (!c.target || !c.id) continue;
    const value = String(c.value || "").toUpperCase().trim();
    const stem = value.replace(/\s+\*$/, "").replace(/\*$/, "").trim();
    const rec = { id: c.id, target: String(c.target), value, stem };
    for (const k of [value, stem, stem.replace(/\s+/g, "")]) byKey.set(k, rec);
  }

  const seen = new Map();
  for (const line of lines) {
    const ticker = String(line.ticker || "").toUpperCase();
    let rec = null;
    for (const k of bmvTickerKeys(ticker)) {
      if (byKey.has(k)) {
        rec = byKey.get(k);
        break;
      }
    }
    if (!rec) continue;
    const id = `${rec.id}|${rec.target}`;
    const job = seen.get(id) || { ...rec, tickers: [] };
    job.tickers.push(ticker);
    seen.set(id, job);
  }
  const jobs = [...seen.values()];

  delayedQuotes.bmv.clear();
  let books = 0;
  let i = 0;
  const n = 8;
  const workers = Array.from({ length: n }, async () => {
    while (i < jobs.length) {
      const job = jobs[i++];
      if (i % 80 === 0 || i === jobs.length) {
        console.error(`    Bolsa Mexicana : ${i}/${jobs.length} émissions`);
      }
      let est = {};
      let cve = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const q = await bmvGet(
            `${BMV_JSON}?idSitioPagina=1&bandera=2&idEmisora=${job.id}&idEmision=${job.target}`,
            cookie
          );
          const emi = q?.response?.datosEmision || {};
          est = emi.datosEstadistica || {};
          cve = String(emi.cveCorta || job.stem.split(/\s+/)[0] || "").toUpperCase();
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      const bid = Number(est.posturaCompra);
      const ask = Number(est.posturaVenta);
      if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
      books += 1;
      const url = cve
        ? `https://www.bmv.com.mx/es/emisoras/estadisticas/${encodeURIComponent(cve)}-${job.id}`
        : BMV_HOME;
      const quote = { bid, ask, currency: "MXN", url };
      for (const key of [job.value, job.stem, job.stem.replace(/\s+/g, ""), cve, ...job.tickers]) {
        const k = String(key || "")
          .toUpperCase()
          .replace(/\*/g, "")
          .trim();
        if (k) delayedQuotes.bmv.set(k, quote);
      }
    }
  });
  await Promise.all(workers);
  return { directory: claves.length, jobs: jobs.length, books };
}

// Canada publishes no free pre-trade book of its own. TMX answers bid and ask only to a
// signed-in watchlist, Cboe Canada behind a member key and secret, and there is no Rule
// 605 here to fall back on. The portal's REST `/v1/market-data/{symbol}/quote` is
// metadata — last trade, listing, fundamentals — and has no bid or ask. The touch
// still reaches the screen of anyone holding a Questrade account, over the socket its
// trading page keeps open, and what a broker displays about an exchange is still a
// fact about that exchange rather than about the broker.
//
// The token that socket signs in with is minted for that socket alone: a second
// connection offering the same token is answered with silence rather than an error. So
// the reads ride the application's own connection. Only get_symbol_data and
// get_l1_update are sent, which read and nothing else.
//
// Frames are collected in Node via CDP. Waiting inside `page.evaluate` for the reply
// used to freeze the tab after a few hundred subscriptions (`Runtime.callFunctionOn
// timed out`); a send is a few milliseconds, the wait is not, so only the send still
// crosses into the page. The page is reloaded every few batches so the socket does
// not keep every symbol subscribed.
const QUESTRADE_APP = "https://my.questrade.com/trading/quote/XIU.TO";
// One request carries a whole list. The batch only bounds how much a silent answer costs
// before the next one is tried, and how many names stay on the socket at once.
const QUESTRADE_BATCH = 20;
const QUESTRADE_RELOAD_EVERY = 160;

// What each venue calls itself in the quote's `feed`. TSX and Cboe Canada share the `.TO`
// suffix, so this is what keeps one venue's book off the other's row.
const QUESTRADE_FEED = { XTSE: "TSX", XTSX: "TSXV", XCNQ: "CSE", NEOE: "NEO", PURE: "CSE" };
const QUESTRADE_SUFFIX = { XTSE: ".TO", XTSX: ".VN", XCNQ: ".CN", NEOE: ".TO", PURE: ".CN" };

// Questrade's own catalogue stores the symbol in the form the feed uses, suffix and share
// class included: AAA.P.VN, AAWH.U.CN. A catalogue that writes the bare ticker instead —
// IBKR and Mexem write TSE and the symbol alone — gets the venue's suffix appended.
function questradeSymbol(l) {
  const ticker = String(l.ticker || "").toUpperCase().trim();
  if (!ticker) return null;
  if (/\.(TO|VN|CN|NE)$/.test(ticker)) return ticker;
  const suffix = QUESTRADE_SUFFIX[l.venue?.mic];
  return suffix ? `${ticker}${suffix}` : null;
}

function questradeRows(raw, requestID) {
  if (typeof raw !== "string" || !raw.startsWith("42")) return [];
  let frame;
  try {
    frame = JSON.parse(raw.slice(2));
  } catch {
    return [];
  }
  if (frame?.[1]?.requestID !== requestID) return [];
  const data = frame[1].data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (data?.symbol || data?.symbolId) return [data];
  return [];
}

async function loadQuestrade(lines, ownTab) {
  const page = await ownTab();
  await page.evaluateOnNewDocument(() => {
    const Native = window.WebSocket;
    window.WebSocket = function (url, protocols) {
      const socket = new Native(url, protocols);
      if (String(url).includes("cloud-iq")) window.__qsSocket = socket;
      return socket;
    };
    window.WebSocket.prototype = Native.prototype;
    Object.assign(window.WebSocket, Native);
  });

  const incoming = [];
  const client = await page.createCDPSession();
  await client.send("Network.enable");
  const onFrame = (event) => {
    const payload = event.response?.payloadData;
    if (typeof payload === "string" && payload.startsWith("42")) incoming.push(payload);
  };
  client.on("Network.webSocketFrameReceived", onFrame);

  const openSession = async () => {
    incoming.length = 0;
    await page.goto(QUESTRADE_APP, { waitUntil: "domcontentloaded", timeout: 60000 });
    let live = false;
    for (let waited = 0; waited < 45000 && !live; waited += 500) {
      live = await page.evaluate(() => window.__qsSocket?.readyState === 1).catch(() => false);
      if (!live) await new Promise((r) => setTimeout(r, 500));
    }
    if (!live) throw new Error("aucune socket de cotation, session Questrade fermée ?");
    // The application signs the socket in before it asks anything of it, and a request
    // posted ahead of that is dropped without a word.
    await new Promise((r) => setTimeout(r, 6000));
  };

  const ask = async (method, params, requestID) => {
    await page.evaluate(
      (payload) => {
        const socket = window.__qsSocket;
        if (!socket || socket.readyState !== 1) throw new Error("socket refermée");
        socket.send(payload);
      },
      `42${JSON.stringify(["sendRequest", { method, params, requestID }])}`
    );
  };

  const reply = async (requestID, expected, ms) => {
    const held = new Map();
    const start = Date.now();
    while (Date.now() - start < ms) {
      while (incoming.length) {
        for (const row of questradeRows(incoming.shift(), requestID)) {
          if (row?.symbol) held.set(row.symbol, row);
        }
      }
      if (expected && held.size >= expected) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    return [...held.values()];
  };

  await openSession();

  const wanted = [...new Set(lines.map(questradeSymbol).filter(Boolean))];
  delayedQuotes.questrade.clear();
  let books = 0;
  let retries = 0;
  for (let offset = 0; offset < wanted.length; offset += QUESTRADE_BATCH) {
    if (offset && offset % QUESTRADE_RELOAD_EVERY === 0) {
      await openSession();
    }
    const batch = wanted.slice(offset, offset + QUESTRADE_BATCH);
    const metaId = 900001 + offset * 2;
    const quoteId = 900002 + offset * 2;
    try {
      incoming.length = 0;
      await ask("get_symbol_data", { symbols: batch }, metaId);
      const meta = await reply(metaId, batch.length, 12000);
      const ids = [...new Set(meta.map((m) => m.symbolId).filter(Boolean))];
      if (!ids.length) continue;
      incoming.length = 0;
      await ask("get_l1_update", { symbolIds: ids }, quoteId);
      const quotes = await reply(quoteId, ids.length, 12000);
      for (const q of quotes) {
        const quote = {
          symbol: q.symbol,
          bid: q.bidPrice,
          ask: q.askPrice,
          feed: q.feed,
          delay: q.delay,
          halt: q.halt,
        };
        delayedQuotes.questrade.set(quote.symbol, quote);
        if (quote.bid > 0 && quote.ask > 0) books += 1;
      }
      retries = 0;
    } catch (e) {
      console.error(`    Questrade : ${String(e.message || e).slice(0, 160)}`);
      if (++retries > 3) throw e;
      await openSession();
      offset -= QUESTRADE_BATCH;
      continue;
    }
    console.error(
      `    Questrade : ${Math.min(offset + QUESTRADE_BATCH, wanted.length)}/${wanted.length} symboles`
    );
  }
  await client.detach().catch(() => {});
  return { wanted: wanted.length, quoted: delayedQuotes.questrade.size, books };
}

async function loadGettex(wanted) {
  const html = await (await fetchOk("https://www.gettex.de/handel/delayed-data/pretrade-data")).text();
  const grab = (seg) =>
    [...html.matchAll(
      new RegExp(
        `https://erdk\\.bayerische-boerse\\.de:8000/delayed-data/MUNC-MUND/pretrade/pretrade\\.\\d+\\.\\d+\\.\\d+\\.${seg}\\.csv\\.gz`,
        "g"
      )
    )].map((m) => m[0])[0];
  const munc = grab("munc");
  const mund = grab("mund");
  if (!munc && !mund) throw new Error("aucun fichier gettex sur la page delayed-data");
  const wantedIsin = new Set([...wanted].map((key) => key.split("|")[0]));
  const ingest = async (url) => {
    if (!url) return;
    await forEachGunzipLine(url, (line) => {
      const p = line.split(",");
      if (p.length < 7) return;
      const isin = p[0].toUpperCase();
      const currency = p[2].toUpperCase();
      const key = `${isin}|${currency}`;
      // Every currency of a wanted ISIN is kept. The fetch uses the catalogue
      // line when it exists, and the sole book when gettex quotes the ISIN once.
      if (!isin || !currency || (wanted.size && !wanted.has(key) && !wantedIsin.has(isin))) return;
      const bid = Number(p[3]);
      const ask = Number(p[5]);
      if (!(bid > 0) || !(ask > 0) || ask < bid) return;
      const at = p[1] || "";
      const prev = delayedQuotes.gettex.get(key);
      if (prev && prev.at > at) return;
      delayedQuotes.gettex.set(key, { bid, ask, currency, at });
    });
  };
  delayedQuotes.gettex.clear();
  // MUND carries the international names (Trading212's gettex book); MUNC is a small
  // snapshot of the liquid German names and overwrites the overlap.
  await ingest(mund);
  await ingest(munc);
  return { munc, mund };
}

async function loadMunich(wanted) {
  const html = await (await fetchOk("https://www.boerse-muenchen.de/handel-support/kursdaten-delayed-data/")).text();
  const latest = (seg) => {
    const urls = [
      ...html.matchAll(
        new RegExp(
          `https://erdk\\.bayerische-boerse\\.de:8000/delayed-data/MUNA-MUNB/pretrade/pretrade\\.\\d+\\.\\d+\\.\\d+\\.${seg}\\.csv\\.gz`,
          "g"
        )
      ),
    ].map((match) => match[0]);
    urls.sort();
    return urls.at(-1) || null;
  };
  const muna = latest("muna");
  const munb = latest("munb");
  if (!muna && !munb) throw new Error("aucun fichier Börse München sur la page delayed-data");
  const ingest = async (url) => {
    if (!url) return;
    await forEachGunzipLine(url, (line) => {
      const p = line.split(",");
      if (p.length < 7) return;
      const isin = p[0].toUpperCase();
      const currency = p[2].toUpperCase();
      const key = `${isin}|${currency}`;
      if (!isin || !currency || (wanted.size && !wanted.has(key))) return;
      const bid = Number(p[3]);
      const ask = Number(p[5]);
      if (!(bid > 0) || !(ask > 0) || ask < bid) return;
      const at = p[1] || "";
      const prev = delayedQuotes.munich.get(key);
      if (prev && prev.at > at) return;
      delayedQuotes.munich.set(key, { bid, ask, currency, at });
    });
  };
  delayedQuotes.munich.clear();
  // MUNB is the Freiverkehr. MUNA is the regulated book and overwrites the overlap.
  await ingest(munb);
  await ingest(muna);
  return { muna, munb };
}

async function loadLsex() {
  const html = await (await fetchOk("https://www.ls-x.de/de/download")).text();
  const url = html.match(
    /https:\/\/www\.ls-x\.de\/_rpc\/json\/\.lstc\/instrument\/list\/lsxpretrades\?time=\d+/
  )?.[0];
  if (!url) throw new Error("aucun fichier LS Exchange sur la page download");
  const text = await (await fetchOk(url)).text();
  delayedQuotes.lsex.clear();
  for (const line of text.split(/\r?\n/)) {
    const p = line.split(";").map((s) => s.replace(/^"|"$/g, "").trim());
    if (p.length < 3) continue;
    const isin = p[0].toUpperCase();
    const bid = Number(String(p[1]).replace(",", "."));
    const ask = Number(String(p[2]).replace(",", "."));
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !(bid > 0) || !(ask > 0) || ask < bid) continue;
    // No currency column. Every name on this venue is quoted in euro.
    delayedQuotes.lsex.set(`${isin}|EUR`, { bid, ask, currency: "EUR" });
  }
  return url;
}

// Same RPC host as LS Exchange, the TradeCenter / LSSI book. The file is a tape of
// every quote in the last slice (tens of megabytes), so it is streamed; the last
// two-sided print per ISIN is the book, in euro.
async function loadLsin() {
  const html = await (await fetchOk("https://www.ls-tc.de/de/download")).text();
  const url = html.match(
    /https:\/\/www\.ls-x\.de\/_rpc\/json\/\.lstc\/instrument\/list\/lstcpretrades\?time=\d+/
  )?.[0];
  if (!url) throw new Error("aucun fichier LS International sur la page download");
  const res = await fetchOk(url, 180000);
  delayedQuotes.lsin.clear();
  for await (const line of readline.createInterface({ input: Readable.fromWeb(res.body), crlfDelay: Infinity })) {
    const p = line.split(";").map((s) => s.replace(/^"|"$/g, "").trim());
    if (p.length < 3) continue;
    const isin = p[0].toUpperCase();
    const bid = Number(String(p[1]).replace(",", "."));
    const ask = Number(String(p[2]).replace(",", "."));
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !(bid > 0) || !(ask > 0) || ask < bid) continue;
    delayedQuotes.lsin.set(`${isin}|EUR`, { bid, ask, currency: "EUR" });
  }
  return url;
}

// BÖAG's MiFID delayed CSVs. DUSD is Quotrix Freiverkehr (the busy book), DUSC the
// regulated segment. Files are volume-sliced tapes with a European decimal comma;
// the last two-sided print per ISIN is the book. No currency column: the venue quotes
// in euro.
const euroNum = (s) => {
  const t = String(s).trim();
  if (!t) return NaN;
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
};

async function loadBoag(wanted, dest, slices) {
  const index = await (await fetchOk("https://cld42.boersenag.de/m13data/data/m13filespt.json")).json();
  const files = (index.M13Files || []).filter((f) => f && f !== "end");
  const wantedIsin = new Set([...wanted].map((k) => k.split("|")[0]));
  dest.clear();
  const selected = [];
  // The newest slices are the liquid book. A name that last printed an hour ago has
  // already fallen out of them, so the walk keeps going until every asked-for ISIN
  // has its last two-sided print or the extra files run out.
  const EXTRA = 40;
  for (const { mic, n } of slices) {
    const mine = files.filter((f) => f.includes(`_${mic}_`));
    const limit = wantedIsin.size ? Math.min(mine.length, n + EXTRA) : Math.min(mine.length, n);
    for (let i = 0; i < limit; i++) {
      if (i >= n && wantedIsin.size && ![...wantedIsin].some((isin) => !dest.has(`${isin}|EUR`))) break;
      const file = mine[i];
      let text;
      try {
        text = await (await fetchOk(`https://cld42.boersenag.de/m13data/data/${file}`)).text();
      } catch {
        // The index lists files that rotate off the host within the walk.
        continue;
      }
      selected.push(file);
      for (const line of text.split(/\r?\n/)) {
        const p = line.split(";");
        if (p.length < 7 || p[0] === "MIC") continue;
        const isin = String(p[1] || "").toUpperCase();
        if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
        if (wantedIsin.size && !wantedIsin.has(isin)) continue;
        const bid = euroNum(p[3]);
        const ask = euroNum(p[5]);
        if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
        const at = p[2] || "";
        const key = `${isin}|EUR`;
        const prev = dest.get(key);
        if (prev && prev.at > at) continue;
        dest.set(key, { bid, ask, currency: "EUR", at });
      }
    }
  }
  if (!selected.length) throw new Error(`index pre-trade BÖAG sans ${slices.map((s) => s.mic).join("/")}`);
  return selected;
}

async function loadQuotrix(wanted) {
  return loadBoag(wanted, delayedQuotes.quotrix, [
    { mic: "DUSD", n: 5 },
    { mic: "DUSC", n: 3 },
  ]);
}

async function loadHamburg(wanted) {
  return loadBoag(wanted, delayedQuotes.hamburg, [
    { mic: "HAMQ", n: 5 },
    { mic: "HAMB", n: 3 },
    { mic: "HAMA", n: 2 },
  ]);
}

async function loadHannover(wanted) {
  return loadBoag(wanted, delayedQuotes.hannover, [
    { mic: "HANB", n: 3 },
    { mic: "HANA", n: 2 },
  ]);
}

// EIX's own 15-minute tape, not the BÖAG HANA/HANB slices. One gzip is five
// minutes of the whole book — tens of millions of ticks — so only the newest
// file is read and the last two-sided print per ISIN is kept.
const EIX_FILES = "https://european-investor-exchange.com/api/trade-files?tradeFileType=pretrade";
const eixFileUrl = (key) =>
  `https://european-investor-exchange.com/api/trade-file-contents?key=${encodeURIComponent(key)}&attachmentFilename=pretrade.csv.gz`;

async function loadEix(wanted) {
  const files = await (await fetchOk(EIX_FILES)).json();
  const newest = (Array.isArray(files) ? files : [])
    .map((f) => f?.fileName)
    .filter((n) => typeof n === "string" && /Pretrade\.\d+\.csv\.gz$/.test(n))
    .sort()
    .at(-1);
  if (!newest) throw new Error("aucun fichier pre-trade EIX");
  const wantedIsin = new Set([...wanted].map((k) => k.split("|")[0]));
  delayedQuotes.eix.clear();
  await forEachGunzipLine(
    eixFileUrl(newest),
    (line) => {
      if (line.startsWith("Trading day")) return;
      const p = line.split(",");
      if (p.length < 7) return;
      const isin = String(p[1] || "").toUpperCase();
      if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) return;
      if (wantedIsin.size && !wantedIsin.has(isin)) return;
      const bid = Number(p[4]);
      const ask = Number(p[5]);
      const currency = String(p[6] || "EUR").toUpperCase();
      if (!(bid > 0) || !(ask > 0) || ask < bid) return;
      const at = p[0] || "";
      const key = `${isin}|${currency}`;
      const prev = delayedQuotes.eix.get(key);
      if (prev && prev.at > at) return;
      delayedQuotes.eix.set(key, { bid, ask, currency, at });
    },
    400000
  );
  return newest;
}

async function loadTib() {
  const path = new URL("../brokers/traderepublic/traderepublic-touches.json", import.meta.url);
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  delayedQuotes.tib.clear();
  const venue = VENUES.find((v) => v.mic === "TIB");
  let books = 0;
  for (const [isin, q] of Object.entries(data.byIsin || {})) {
    const bid = Number(q.bid);
    const ask = Number(q.ask);
    const bp = q.bp ?? bpFrom(bid, ask);
    if (!(bid > 0) || !(ask > 0) || ask < bid || !(bp > 0)) continue;
    const currency = String(q.currency || "EUR").toUpperCase();
    delayedQuotes.tib.set(`${isin}|${currency}`, { bid, ask, currency, bp });
    // The catalogue almost never stores TIB as a place — Bestpreis is implied —
    // so the leaves are written here rather than waiting for a visit that never
    // comes. Only Trade Republic routes here.
    ((spreads[isin] ||= {})[venue.mic] ||= {})[currency] = {
      bp: Number(Number(bp).toFixed(2)),
      url: spreadUrl({ isin, ticker: q.ticker, venue, currency }),
    };
    books += 1;
  }
  return { asOf: data.asOf, books };
}

async function loadBxswiss() {
  const path = new URL("./bxswiss-touch.json", import.meta.url);
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  delayedQuotes.bxswiss.clear();
  const venue = VENUES.find((v) => v.mic === "XBRN");
  let books = 0;
  for (const [isin, byCurrency] of Object.entries(data.byIsin || {})) {
    for (const [currency, q] of Object.entries(byCurrency || {})) {
      const bid = Number(q.bid);
      const ask = Number(q.ask);
      const bp = q.bp ?? bpFrom(bid, ask);
      if (!(bid > 0) || !(ask > 0) || ask <= bid || !(bp > 0)) continue;
      const ccy = String(currency || "").toUpperCase();
      delayedQuotes.bxswiss.set(`${isin}|${ccy}`, { bid, ask, currency: ccy, bp });
      ((spreads[isin] ||= {})[venue.mic] ||= {})[ccy] = {
        bp: Number(Number(bp).toFixed(2)),
        url: spreadUrl({ isin, venue, currency: ccy }),
      };
      books += 1;
    }
  }
  return { asOf: data.asOf, books };
}

// ------------------------------------------------------------------------ le Golfe
//
// Four boards, one call each, read by `gulf.mjs` because `prices.mjs` wants the last
// price out of the same response and neither should ask twice. Only Abu Dhabi names an
// ISIN; the other three are matched on the symbol, which the catalogues spell with a
// suffix the exchange does not use — BKIC.BI in Manama, BDID.MSX in Muscat.
function gulfAdapter(key) {
  const { name, browser } = GULF_BOARDS[key];
  return {
    measure: "touche du carnet, temps réel",
    async prefetch(lines, ownTab) {
      try {
        const rows = await readGulfBoard(key, browser ? { page: await ownTab() } : {});
        for (const r of rows) {
          const quote = { bid: r.bid, ask: r.ask, currency: r.currency };
          if (r.isin) delayedQuotes[key].set(r.isin, quote);
          delayedQuotes[key].set(r.symbol, quote);
        }
        console.error(`    ${name} : ${rows.length} cotations\n`);
      } catch (e) {
        delayedTrouble[key] = String(e.message || e).slice(0, 160);
        console.error(`    ${name} : ${delayedTrouble[key]}\n`);
      }
    },
    async fetch(l) {
      const quote =
        delayedQuotes[key].get(String(l.isin).toUpperCase()) || delayedQuotes[key].get(gulfSymbol(l.ticker));
      if (!quote) return { spreadBp: null, note: delayedTrouble[key] || `absent du tableau ${name}` };
      return { spreadBp: bpFrom(quote.bid, quote.ask), tradingCurrency: quote.currency };
    },
  };
}


const gpwBook = new Map();

// Cboe Europe CXE, the Chi-X lit book. The symbol file names every live line
// by ISIN and currency; the book viewer then answers that line's touch.
// BXE and DXE are different books and are not read here.
const CXE_SYMBOLS = "https://www.cboe.com/europe/equities/market_statistics/symbols_traded/csv/?mkt=cxe";
const CXE_VIEWER = "https://ww2.cboe.com/europe/equities/market_statistics/book_viewer_2/";
const cxeQuotes = new Map();
let cxeTrouble = null;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") cur += c;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

async function cxeCookie() {
  const res = await fetch(CXE_VIEWER, {
    headers: { ...UA, Accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  const parts = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return parts.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

async function loadCxe(lines) {
  cxeQuotes.clear();
  cxeTrouble = null;
  const text = await (await fetchOk(CXE_SYMBOLS, 60000)).text();
  const table = parseCsv(text);
  const headerAt = table.findIndex((r) => r[0] === "company_name");
  if (headerAt < 0) throw new Error("annuaire CXE illisible");
  const header = table[headerAt];
  const col = (name) => header.indexOf(name);
  const batsAt = col("bats_name");
  const isinAt = col("isin");
  const ccyAt = col("currency");
  const liveAt = col("live");
  const directory = new Map();
  for (const r of table.slice(headerAt + 1)) {
    if (liveAt >= 0 && r[liveAt] !== "t") continue;
    const isin = String(r[isinAt] || "").toUpperCase();
    const currency = String(r[ccyAt] || "").toUpperCase();
    const bats = r[batsAt];
    if (!isin || !currency || !bats) continue;
    const key = `${isin}|${currency}`;
    if (!directory.has(key)) directory.set(key, []);
    directory.get(key).push(bats);
  }
  // The catalogue symbol is "AMSe.CHI" or "AMS". The directory's name is
  // "AMSe": the stem, plus one lower-case venue letter when the stem omitted it.
  // A renamed line (ALD → AYVp) matches neither and is left out.
  const pickBats = (hint, cands) => {
    if (cands.length === 1) return cands[0];
    const stem = String(hint || "").replace(/\.(CHI|BS|DXE)$/i, "").replace(/\.[A-Z]{2,3}$/i, "");
    if (cands.includes(hint)) return hint;
    if (stem && cands.includes(stem)) return stem;
    const one = cands.filter((c) => stem && c.startsWith(stem) && c.length === stem.length + 1);
    return one.length === 1 ? one[0] : null;
  };
  // Pence and pounds are one London book. The directory files that line as GBX.
  const symbolsFor = (isin, currency) => {
    const exact = directory.get(`${isin}|${currency}`) || [];
    const other = currency === "GBP" ? "GBX" : currency === "GBX" ? "GBP" : "";
    const alt = other ? directory.get(`${isin}|${other}`) || [] : [];
    return [...exact, ...alt];
  };
  const booksOf = new Map();
  for (const key of directory.keys()) {
    const [isin, currency] = key.split("|");
    const book = currency === "GBX" ? "GBP" : currency;
    if (!booksOf.has(isin)) booksOf.set(isin, new Map());
    const books = booksOf.get(isin);
    if (!books.has(book)) books.set(book, currency);
  }
  const wanted = [];
  for (const l of lines) {
    let bats = pickBats(l.batsHint || l.ticker, symbolsFor(l.isin, l.currency));
    let quoted = l.currency;
    if (!bats) {
      const books = booksOf.get(l.isin);
      // A catalogue line in another currency still trades that book when Chi-X
      // quotes the ISIN once. Two different lines are not one book.
      if (books?.size === 1) {
        quoted = [...books.values()][0];
        bats = pickBats(l.batsHint || l.ticker, symbolsFor(l.isin, quoted));
      }
    }
    if (bats) wanted.push({ ...l, bats, quoted });
  }
  const cookie = await cxeCookie();
  let next = 0;
  const take = async () => {
    while (next < wanted.length) {
      const line = wanted[next++];
      const url = `https://ww2.cboe.com/json/cxe/book/${encodeURIComponent(line.bats)}`;
      let body = null;
      try {
        for (let attempt = 0; attempt < 2 && !body; attempt++) {
          const res = await fetch(url, {
            headers: { ...UA, Accept: "application/json", Referer: CXE_VIEWER, Cookie: cookie },
            redirect: "follow",
            signal: AbortSignal.timeout(20000),
          });
          if (res.ok) body = await res.json();
          else if (attempt === 1) cxeTrouble = `HTTP ${res.status}`;
        }
      } catch (e) {
        cxeTrouble = String(e.message || e).slice(0, 160);
        continue;
      }
      const data = body?.data;
      const bids = (data?.bids || []).map((x) => Number(x[1])).filter((n) => n > 0);
      const asks = (data?.asks || []).map((x) => Number(x[1])).filter((n) => n > 0);
      if (!bids.length || !asks.length) continue;
      cxeQuotes.set(`${line.isin}|${line.currency}`, {
        bid: Math.max(...bids),
        ask: Math.min(...asks),
        currency: line.quoted || line.currency,
        bats: line.bats,
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, wanted.length) }, take));
  return { listed: directory.size, wanted: wanted.length };
}

// Cboe Europe DXE, the Dutch lit book. Same viewer as Chi-X, a different
// symbol file and a different book. A CXE touch is not written here.
const DXE_SYMBOLS = "https://www.cboe.com/europe/equities/market_statistics/symbols_traded/csv/?mkt=dxe";
const dxeQuotes = new Map();
let dxeTrouble = null;

async function loadDxe(lines) {
  dxeQuotes.clear();
  dxeTrouble = null;
  const text = await (await fetchOk(DXE_SYMBOLS, 60000)).text();
  const table = parseCsv(text);
  const headerAt = table.findIndex((r) => r[0] === "company_name");
  if (headerAt < 0) throw new Error("annuaire DXE illisible");
  const header = table[headerAt];
  const col = (name) => header.indexOf(name);
  const batsAt = col("bats_name");
  const isinAt = col("isin");
  const ccyAt = col("currency");
  const liveAt = col("live");
  const directory = new Map();
  for (const r of table.slice(headerAt + 1)) {
    if (liveAt >= 0 && r[liveAt] !== "t") continue;
    const isin = String(r[isinAt] || "").toUpperCase();
    const currency = String(r[ccyAt] || "").toUpperCase();
    const bats = r[batsAt];
    if (!isin || !currency || !bats) continue;
    const key = `${isin}|${currency}`;
    if (!directory.has(key)) directory.set(key, []);
    directory.get(key).push(bats);
  }
  const pickBats = (hint, cands) => {
    if (cands.length === 1) return cands[0];
    const stem = String(hint || "").replace(/\.(CHI|BS|DXE)$/i, "").replace(/\.[A-Z]{2,3}$/i, "");
    if (cands.includes(hint)) return hint;
    if (stem && cands.includes(stem)) return stem;
    const one = cands.filter((c) => stem && c.startsWith(stem) && c.length === stem.length + 1);
    return one.length === 1 ? one[0] : null;
  };
  const wanted = [];
  for (const l of lines) {
    const bats = pickBats(l.batsHint || l.ticker, directory.get(`${l.isin}|${l.currency}`) || []);
    if (bats) wanted.push({ ...l, bats });
  }
  const cookie = await cxeCookie();
  let next = 0;
  const take = async () => {
    while (next < wanted.length) {
      const line = wanted[next++];
      const url = `https://ww2.cboe.com/json/dxe/book/${encodeURIComponent(line.bats)}`;
      let body = null;
      try {
        for (let attempt = 0; attempt < 2 && !body; attempt++) {
          const res = await fetch(url, {
            headers: { ...UA, Accept: "application/json", Referer: CXE_VIEWER, Cookie: cookie },
            redirect: "follow",
            signal: AbortSignal.timeout(20000),
          });
          if (res.ok) body = await res.json();
          else if (attempt === 1) dxeTrouble = `HTTP ${res.status}`;
        }
      } catch (e) {
        dxeTrouble = String(e.message || e).slice(0, 160);
        continue;
      }
      const data = body?.data;
      const bids = (data?.bids || []).map((x) => Number(x[1])).filter((n) => n > 0);
      const asks = (data?.asks || []).map((x) => Number(x[1])).filter((n) => n > 0);
      if (!bids.length || !asks.length) continue;
      dxeQuotes.set(`${line.isin}|${line.currency}`, {
        bid: Math.max(...bids),
        ask: Math.min(...asks),
        currency: line.currency,
        bats: line.bats,
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, wanted.length) }, take));
  return { listed: directory.size, wanted: wanted.length };
}

// A zip of stored or deflated members. Enough for the workbooks these exchanges
// publish; a member whose size is left for a data descriptor is not one of them.
function unzip(buf) {
  const files = new Map();
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let o = 0;
  while (o + 30 <= b.length && b.readUInt32LE(o) === 0x04034b50) {
    const method = b.readUInt16LE(o + 8);
    const comp = b.readUInt32LE(o + 18);
    const nameLen = b.readUInt16LE(o + 26);
    const extra = b.readUInt16LE(o + 28);
    const name = b.slice(o + 30, o + 30 + nameLen).toString();
    const start = o + 30 + nameLen + extra;
    const data = b.slice(start, start + comp);
    files.set(name, method === 0 ? data : inflateRawSync(data));
    o = start + comp;
  }
  return files;
}

// First worksheet of an xlsx, as rows of cell values keyed by column letters.
function xlsxSheet(buf) {
  const files = unzip(buf);
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const strings = [];
  const shared = files.get("xl/sharedStrings.xml");
  if (shared) {
    const xml = shared.toString();
    for (const si of xml.match(/<si[\s\S]*?<\/si>/g) || []) {
      strings.push([...si.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]).join(""));
    }
  }
  const sheet = [...files.keys()].find((n) => /^xl\/worksheets\/sheet1\.xml$/.test(n));
  const xml = files.get(sheet).toString();
  const rows = [];
  for (const row of xml.match(/<row[\s\S]*?<\/row>/g) || []) {
    const cells = {};
    for (const c of row.match(/<c\b[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const ref = c.match(/\br="([A-Z]+)\d+"/);
      const type = c.match(/\bt="([^"]+)"/);
      const v = c.match(/<v>([^<]*)<\/v>/);
      if (!ref || !v) continue;
      cells[ref[1]] = type?.[1] === "s" ? strings[Number(v[1])] ?? "" : v[1];
    }
    rows.push(cells);
  }
  return rows;
}

// SIX Market Quality Metrics. Spread T is the time-weighted inside spread of the
// trading day, in percent, so 0.047 is 4.7 bp. One file for ETFs, one for ETPs,
// which is where the ETC and ETN lines are. The latest published day is the
// session average; it is not divided by the intraday shape afterwards.
const sixMqm = new Map();
async function loadSixMqm() {
  const day = async (kind) => {
    const year = new Date().getFullYear();
    let index = await (
      await fetchOk(`https://www.six-group.com/sheldon/mqm/v1/${kind}/${year}/daily_reports.json`)
    ).json();
    if (!index.itemList?.length && year > 2024) {
      index = await (
        await fetchOk(`https://www.six-group.com/sheldon/mqm/v1/${kind}/${year - 1}/daily_reports.json`)
      ).json();
    }
    const latest = index.itemList?.at(-1);
    if (!latest?.url) return null;
    const path = latest.url.split("/").filter((p) => !["itf", "sido", "ajax"].includes(p)).join("/");
    const csv = await (await fetchOk(`https://www.six-group.com${path}`)).text();
    return { csv, url: `https://www.six-group.com${path}`, date: latest.date };
  };
  for (const kind of ["etf", "etp"]) {
    const file = await day(kind);
    if (!file) continue;
    const [head, ...lines] = file.csv.trim().split(/\r?\n/);
    const cols = head.split(";");
    const at = (name) => cols.indexOf(name);
    const isin = at("Product ISIN");
    const ccy = at("Trading Currency Code");
    const spread = at("Spread T");
    const active = at("Spread Active Time");
    for (const line of lines) {
      const cell = line.split(";");
      const quoted = Number(cell[active]);
      const pct = Number(cell[spread]);
      if (!(pct > 0) || (Number.isFinite(quoted) && quoted < 50)) continue;
      const key = `${cell[isin]}|${cell[ccy]}`;
      sixMqm.set(key, {
        bp: Number((pct * 100).toFixed(2)),
        url: file.url,
        date: file.date,
      });
    }
  }
}

// Tokyo publishes the month's average best-bid/best-ask spread, in basis points,
// for each ETF. The 10 million yen execution cost is a deeper order and is not
// this figure. Shares are not in the workbook.
const jpxSpread = new Map();
let jpxUrl = "https://www.jpx.co.jp/english/equities/products/etfs/quoting-data/index.html";
async function loadJpxSpread() {
  const html = await (await fetchOk(jpxUrl)).text();
  const hrefs = [...html.matchAll(/href="([^"]+\.xlsx)"/gi)].map((m) => m[1]);
  const monthly = hrefs
    .map((href) => {
      const name = href.split("/").pop();
      if (/20\d{6}/.test(name)) return null;
      const month = name.match(/20\d{4}/);
      return month ? { href, month: month[0] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.month.localeCompare(b.month));
  const picked = monthly.at(-1);
  if (!picked) return;
  jpxUrl = new URL(picked.href, "https://www.jpx.co.jp").href;
  const buf = Buffer.from(await (await fetchOk(jpxUrl)).arrayBuffer());
  const rows = xlsxSheet(buf);
  const header = rows.findIndex((r) => r.B === "Code");
  const names = rows[header + 1] || {};
  const col = Object.entries(names).find(([, v]) => /Average Spread \(bps\)/.test(String(v)))?.[0];
  if (!col) return;
  for (const row of rows.slice(header + 2)) {
    const code = String(row.B || "").trim().toUpperCase();
    const bp = Number(row[col]);
    if (!code || !(bp > 0)) continue;
    jpxSpread.set(code, { bp: Number(bp.toFixed(2)), url: jpxUrl });
  }
}

// The ASX prints the month's weighted average bid/ask, as a percent of the mid,
// in the ETP pages of the investment-products PDF. The second percentage on a
// product row is that column (the first is monthly liquidity).
const asxSpread = new Map();
let asxUrl = "https://www.asx.com.au/issuers/investment-products/asx-investment-products-monthly-report";
const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
async function loadAsxSpread() {
  const html = await (await fetchOk(asxUrl)).text();
  const hrefs = [...html.matchAll(/href="([^"]*asx-investment-products-[a-z]+-20\d{2}\.pdf)"/gi)].map((m) => m[1]);
  const picked = hrefs
    .map((href) => {
      const m = href.match(/asx-investment-products-([a-z]+)-(20\d{2})\.pdf/i);
      if (!m || !MONTHS[m[1].toLowerCase()]) return null;
      return { href, key: Number(m[2]) * 100 + MONTHS[m[1].toLowerCase()] };
    })
    .filter(Boolean)
    .sort((a, b) => a.key - b.key)
    .at(-1);
  if (!picked) return;
  asxUrl = new URL(picked.href, "https://www.asx.com.au").href;
  const pdf = Buffer.from(await (await fetchOk(asxUrl)).arrayBuffer());
  const tmp = path.join(os.tmpdir(), `asx-etp-${process.pid}.pdf`);
  fs.writeFileSync(tmp, pdf);
  let text = "";
  try {
    text = execFileSync(
      "python3",
      [
        "-c",
        "from pypdf import PdfReader; import sys; print('\\n'.join((p.extract_text() or '') for p in PdfReader(sys.argv[1]).pages))",
        tmp,
      ],
      { encoding: "utf8", maxBuffer: 20_000_000 }
    );
  } finally {
    fs.unlinkSync(tmp);
  }
  const pat = /(?:^|\n)\^?\s*([A-Z][A-Z0-9]{2,5})\s+(?:ETF|Active|Complex)\s+/g;
  const starts = [...text.matchAll(pat)];
  for (let i = 0; i < starts.length; i++) {
    const chunk = text.slice(starts[i].index, starts[i + 1]?.index ?? starts[i].index + 800);
    const pcts = [...chunk.matchAll(/(\d+\.\d+)\s*%/g)].map((m) => Number(m[1]));
    if (pcts.length < 2 || !(pcts[1] > 0)) continue;
    asxSpread.set(starts[i][1], { bp: Number((pcts[1] * 100).toFixed(2)), url: asxUrl });
  }
}

// NSE mean impact cost, from the monthly security-category file. One figure is
// the average of the buy-side and the sell-side move away from the mid for a
// ₹1 lakh order, over six months of order-book snapshots. The round trip is
// both sides, so the stored basis points are twice the printed percent.
const nseImpact = new Map();
let nseUrl = "https://www.nseindia.com/static/products-services/equity-market-categorisation-stocks-imposition-of-margins";
async function loadNseImpact() {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const now = new Date();
  const candidates = [1, 0, -1].map((delta) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + delta, 1));
    return `https://nsearchives.nseindia.com/content/nsccl/C_CATG_${months[d.getUTCMonth()]}${d.getUTCFullYear()}.T01`;
  });
  let text = "";
  let lastErr = null;
  for (const url of candidates) {
    const file = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.nseindia.com/" }, signal: AbortSignal.timeout(20000) });
    if (!file.ok) {
      lastErr = new Error(`NSE impact cost ${file.status}`);
      continue;
    }
    const body = await file.text();
    if (!body.startsWith("10,")) continue;
    text = body;
    nseUrl = url;
    break;
  }
  if (!text) throw lastErr || new Error("NSE : fichier d'impact cost introuvable");
  for (const line of text.split(/\r?\n/)) {
    const cell = line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
    if (cell[0] !== "20" || cell.length < 6) continue;
    const series = cell[2].toUpperCase();
    const isin = cell[3].toUpperCase();
    const cost = Number(cell[5]);
    if (!/^IN[A-Z0-9]{10}$/.test(isin) || !(cost > 0)) continue;
    if (nseImpact.has(isin) && series !== "EQ") continue;
    nseImpact.set(isin, { bp: Number((cost * 200).toFixed(2)), url: nseUrl, series });
  }
}

const xiceQuotes = new Map();
let xiceTrouble = "";
const fnisQuotes = new Map();
let fnisTrouble = "";
const xcseQuotes = new Map();
let xcseTrouble = "";
const xstoQuotes = new Map();
let xstoTrouble = "";
const xstoCurrencies = new Set();
const fnseQuotes = new Map();
let fnseTrouble = "";
const fnseCurrencies = new Set();
const fndkQuotes = new Map();
let fndkTrouble = "";
const fndkCurrencies = new Set();
const fnfiQuotes = new Map();
let fnfiTrouble = "";
const fnfiCurrencies = new Set();
const xhelQuotes = new Map();
let xhelTrouble = "";
const xhelCurrencies = new Set();

function nordicNumber(value) {
  const text = String(value || "").replace(/,/g, "").trim();
  if (!text) return null;
  const n = Number(text);
  return n > 0 ? n : null;
}

async function loadNordic(market, books = [
  ["shares", "MAIN_MARKET", 500],
  ["etp", "ETF", 200],
]) {
  const headers = {
    "User-Agent": "Mozilla/5.0",
    Accept: "application/json",
    Origin: "https://www.nasdaq.com",
    Referer: "https://www.nasdaq.com/",
  };
  const quotes = new Map();
  const urls = books.map(
    ([kind, category, size]) =>
      `https://api.nasdaq.com/api/nordic/screener/${kind}?category=${category}&market=${market}&lang=en&size=${size}`
  );
  for (const url of urls) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Nasdaq ${market} a répondu ${response.status}`);
    const body = await response.json();
    if (body?.status?.rCode !== 200) throw new Error(`Nasdaq ${market} rCode ${body?.status?.rCode}`);
    const rows = body?.data?.instrumentListing?.rows;
    if (!Array.isArray(rows)) throw new Error(`Nasdaq ${market} n'a pas de liste`);
    for (const row of rows) {
      const isin = String(row.isin || "").trim().toUpperCase();
      const currency = String(row.currency || "").trim().toUpperCase();
      if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !currency) continue;
      quotes.set(`${isin}|${currency}`, {
        bid: nordicNumber(row.bidPrice),
        ask: nordicNumber(row.askPrice),
        symbol: String(row.symbol || "").trim().toUpperCase(),
        orderbookId: String(row.orderbookId || "").trim(),
        currency,
      });
    }
  }
  return quotes;
}

async function loadXice() {
  const quotes = await loadNordic("ICE");
  for (const [key, quote] of quotes) {
    if (quote.currency === "ISK") xiceQuotes.set(key, quote);
  }
}

async function loadFnis() {
  const quotes = await loadNordic("ICE", [["shares", "FIRST_NORTH", 100]]);
  for (const [key, quote] of quotes) {
    if (quote.currency === "ISK") fnisQuotes.set(key, quote);
  }
}

async function loadXcse() {
  const quotes = await loadNordic("CPH");
  for (const [key, quote] of quotes) {
    if (quote.currency === "DKK") xcseQuotes.set(key, quote);
  }
}

async function loadXsto() {
  const quotes = await loadNordic("STO");
  xstoCurrencies.clear();
  for (const [key, quote] of quotes) {
    xstoQuotes.set(key, quote);
    xstoCurrencies.add(quote.currency);
  }
}

async function loadFnse() {
  const quotes = await loadNordic("STO", [["shares", "FIRST_NORTH", 500]]);
  fnseCurrencies.clear();
  for (const [key, quote] of quotes) {
    if (quote.currency !== "SEK") continue;
    fnseQuotes.set(key, quote);
    fnseCurrencies.add(quote.currency);
  }
}

async function loadFndk() {
  const quotes = await loadNordic("CPH", [["shares", "FIRST_NORTH", 100]]);
  fndkCurrencies.clear();
  for (const [key, quote] of quotes) {
    if (quote.currency !== "DKK") continue;
    fndkQuotes.set(key, quote);
    fndkCurrencies.add(quote.currency);
  }
}

async function loadFnfi() {
  const quotes = await loadNordic("HEL", [["shares", "FIRST_NORTH", 100]]);
  fnfiCurrencies.clear();
  for (const [key, quote] of quotes) {
    if (quote.currency !== "EUR") continue;
    fnfiQuotes.set(key, quote);
    fnfiCurrencies.add(quote.currency);
  }
}

async function loadXhel() {
  const quotes = await loadNordic("HEL");
  xhelCurrencies.clear();
  for (const [key, quote] of quotes) {
    xhelQuotes.set(key, quote);
    xhelCurrencies.add(quote.currency);
  }
}

function nordicTouch(l, { quotes, currencies, trouble, place }) {
  if (currencies.size && !currencies.has(l.currency)) {
    const said = [...currencies].join(" ou ");
    return { spreadBp: null, note: `${place} cote en ${said}, pas en ${l.currency}` };
  }
  const quote = quotes.get(`${l.isin}|${l.currency}`);
  if (!quote) return { spreadBp: null, note: trouble || `absent du crible ${place}` };
  const bp = bpFrom(quote.bid, quote.ask);
  const symbol = quote.symbol.toLowerCase();
  return {
    spreadBp: bp,
    bid: quote.bid,
    ask: quote.ask,
    tradingCurrency: quote.currency,
    url: quote.orderbookId
      ? `https://www.nasdaq.com/european-market-activity/shares/${encodeURIComponent(symbol)}?id=${encodeURIComponent(quote.orderbookId)}`
      : undefined,
    ...(bp == null ? { note: "carnet à un seul côté" } : {}),
  };
}

// Athens delayed pre-trade file, refreshed about every fifteen minutes.
// Rank 1 is the best bid and the best ask. Derivatives (XADE) stay out.
const ATHEX_PAGE = "https://athens.euronext.com/en/market-data/data-services/delayed-feed";
const athexQuotes = new Map();
let athexTrouble = null;

async function loadAthex() {
  athexQuotes.clear();
  const html = await (await fetchOk(ATHEX_PAGE, 60000)).text();
  const files = [...html.matchAll(/\/en\/market-data\/data-services\/trade-document\/PR_DAILY\/Daily_PreTrade_\d{8}_[\d.]+\.csv/g)].map(
    (m) => m[0]
  );
  if (!files.length) throw new Error("aucun fichier pré-trade Athènes");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  const todays = files.filter((file) => file.includes(`Daily_PreTrade_${today}_`));
  if (!todays.length) throw new Error("fichier pré-trade Athènes d'un autre jour");
  const file = todays.sort().at(-1);
  const text = await (await fetchOk(`https://athens.euronext.com${file}`, 60000)).text();
  const sides = new Map();
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line) continue;
    const cell = line.split(";");
    const at = cell[0];
    const isin = String(cell[1] || "").toUpperCase();
    const side = cell[2];
    const price = Number(cell[3]);
    const currency = String(cell[4] || "").toUpperCase();
    const notation = cell[5];
    const venue = cell[9];
    const phase = cell[11];
    const rank = cell[13];
    if (phase !== "COTR" || notation !== "MONE" || rank !== "1") continue;
    if (venue !== "XATH" && venue !== "ENAX") continue;
    if (side !== "BUYI" && side !== "SELL") continue;
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !currency || !(price > 0)) continue;
    const key = `${isin}|${currency}|${venue}`;
    const prev = sides.get(key) || {};
    const was = prev[side];
    if (was && was.at > at) continue;
    prev[side] = { price, at };
    sides.set(key, prev);
  }
  const byBook = new Map();
  for (const [key, quote] of sides) {
    if (!quote.BUYI || !quote.SELL) continue;
    const bid = quote.BUYI.price;
    const ask = quote.SELL.price;
    if (!(ask >= bid)) continue;
    const [isin, currency, venue] = key.split("|");
    const id = `${isin}|${currency}`;
    if (!byBook.has(id)) byBook.set(id, []);
    byBook.get(id).push({ bid, ask, currency, venue });
  }
  for (const [id, books] of byBook) {
    const main = books.find((book) => book.venue === "XATH");
    const chosen = main || (books.length === 1 ? books[0] : null);
    if (chosen) athexQuotes.set(id, chosen);
  }
}

// Nasdaq Baltic publishes Tallinn, Riga and Vilnius on one share list.
// Home market TLN, RIG or VLN decides which book the row belongs to.
// The prices are in euro. A one-sided row is left out.
const BALTIC_PAGE = "https://nasdaqbaltic.com/statistics/en/shares";
const BALTIC_HOME = { TLN: "XTAL", RIG: "XRIS", VLN: "XLIT" };
const balticQuotes = { XTAL: new Map(), XRIS: new Map(), XLIT: new Map() };
let balticLoad = null;
let balticTrouble = null;

function balticPrice(text) {
  const raw = String(text || "").trim().replace(/\s/g, "");
  if (!raw || raw === "-") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function loadBaltic() {
  if (balticLoad) return balticLoad;
  balticLoad = (async () => {
    for (const book of Object.values(balticQuotes)) book.clear();
    const html = await (await fetchOk(BALTIC_PAGE, 60000)).text();
    const rows = html.match(/<tr[\s\S]*?<\/tr>/g) || [];
    for (const tr of rows) {
      const isin = (tr.match(/\/instrument\/([A-Z0-9]{12})\/trading/) || [])[1];
      if (!isin) continue;
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
        m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      );
      const mic = BALTIC_HOME[cells[13]];
      const bid = balticPrice(cells[5]);
      const ask = balticPrice(cells[6]);
      if (!mic || bid == null || ask == null) continue;
      balticQuotes[mic].set(`${isin}|EUR`, { bid, ask, currency: "EUR" });
    }
    const n = Object.values(balticQuotes).reduce((sum, book) => sum + book.size, 0);
    if (!n) throw new Error("aucune touche Nasdaq Baltic");
  })().catch((error) => {
    balticLoad = null;
    throw error;
  });
  return balticLoad;
}

function balticTouch(l, mic, place) {
  if (l.currency !== "EUR") return { spreadBp: null, note: `${place} cote en EUR, pas en ${l.currency}` };
  const quote = balticQuotes[mic].get(`${l.isin}|EUR`);
  if (!quote) return { spreadBp: null, note: balticTrouble || `absent du carnet de ${place}` };
  const bp = bpFrom(quote.bid, quote.ask);
  if (bp == null) return { spreadBp: null, note: "carnet à un seul côté" };
  return {
    spreadBp: bp,
    bid: quote.bid,
    ask: quote.ask,
    tradingCurrency: "EUR",
    url: `https://nasdaqbaltic.com/statistics/en/instrument/${l.isin}/trading`,
  };
}

// Bratislava publishes a delayed pre-trade file each minute, and only the
// levels that changed. Level 1 is the best bid and the best ask. A later
// file that moves another level leaves that touch in place. The currency
// is the one in the file. The MTF (EBRA) is a different book.
const BSSE_PAGE = "https://www.bsse.sk/bcpb/en/market-data/pre-trade-and-post-trade-data/";
const bsseQuotes = new Map();
let bsseTrouble = null;

async function loadBsse() {
  bsseQuotes.clear();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bratislava",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const listUrl = `${BSSE_PAGE}?tf_type=prtr&tf_market=xbra&tf_asset=equity&tf_date=${today}&tf_time_from=00:00&tf_time_to=23:59&tf_only_data=1`;
  const html = await (await fetchOk(listUrl, 60000)).text();
  const files = [...html.matchAll(/tf_download=(PRTR_E_X_\d{4}-\d{2}-\d{2}T\d{4}_EN_D\.csv)/g)].map((m) => m[1]);
  const todays = [...new Set(files.filter((name) => name.includes(today)))].sort();
  if (!todays.length) throw new Error("aucun pré-trade Bratislava aujourd'hui");
  const newest = new Map();
  for (const name of todays) {
    const buf = Buffer.from(await (await fetchOk(`${BSSE_PAGE}?tf_download=${name}&tf_type=prtr&tf_market=xbra&tf_asset=equity&tf_lang=en`, 60000)).arrayBuffer());
    const text = buf.toString("utf16le").replace(/^\uFEFF/, "");
    for (const line of text.split(/\r?\n/).slice(1)) {
      if (!line) continue;
      const cell = line.split("\t");
      const at = cell[0];
      const mic = cell[2];
      const phase = cell[4];
      const isin = String(cell[5] || "").toUpperCase();
      const currency = String(cell[6] || "").toUpperCase();
      const level = cell[7];
      const notation = cell[8];
      const bid = Number(cell[9]);
      const ask = Number(cell[12]);
      if (mic !== "XBRA" || phase !== "COTR" || level !== "1" || notation !== "MONE") continue;
      if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !currency) continue;
      if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
      const localDay = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Bratislava",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(at));
      if (localDay !== today) continue;
      const prev = newest.get(isin);
      if (prev && prev.at > at) continue;
      newest.set(isin, { bid, ask, currency, at });
    }
  }
  for (const [isin, quote] of newest) bsseQuotes.set(`${isin}|${quote.currency}`, quote);
  if (!bsseQuotes.size) throw new Error("aucune touche Bratislava");
}

// Latest best bid and best ask on the Prague MiFIR page. The feed is every
// change of the day, so one ISIN is asked for sorted by time and only the
// newest row in each currency is kept. The regulated market wins. The MTF
// is used only when that currency has no regulated quote.
const xpraCache = new Map();

async function xpraBook(isin) {
  const id = String(isin || "").toUpperCase();
  if (xpraCache.has(id)) return xpraCache.get(id);
  const book = { quotes: new Map(), trouble: "" };
  try {
    const url = new URL("https://www.pse.cz/api/mifir");
    url.searchParams.set("dataset", "pretrade_exchange");
    url.searchParams.set("isin", id);
    url.searchParams.set("page", "1");
    url.searchParams.set("perPage", "30");
    url.searchParams.set("sort", "-quoteTime");
    url.searchParams.set("lang", "en");
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Prague a répondu ${response.status}`);
    const body = await response.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const ranked = [...rows.filter((row) => String(row.venueOfExecution || "").toUpperCase() === "XPRA"), ...rows.filter((row) => String(row.venueOfExecution || "").toUpperCase() === "XPRM")];
    for (const row of ranked) {
      const currency = String(row.tradingCurrency || "").toUpperCase();
      if (!currency || book.quotes.has(currency)) continue;
      const bid = Number(row.bestBidPrice);
      const ask = Number(row.bestAskPrice);
      book.quotes.set(currency, { bid: bid > 0 ? bid : null, ask: ask > 0 ? ask : null, currency });
    }
  } catch (e) {
    book.trouble = String(e.message || e).slice(0, 120);
  }
  xpraCache.set(id, book);
  return book;
}

// The daily bulletin's propuestas are the bid and the ask. A last trade
// is not read. The sheet is the last one the exchange has published.
const LIMA_BULLETIN = "https://documents.bvl.com.pe/pubdif/boldia/stockq.htm";

function limaIsins() {
  const book = new Map();
  for (const name of ["../assets/stocks.csv", "../assets/etfs.csv"]) {
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
      if (!ticker || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) continue;
      const held = book.get(ticker) || new Set();
      held.add(isin);
      book.set(ticker, held);
    }
  }
  return book;
}

async function loadLima() {
  const res = await fetch(LIMA_BULLETIN, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const dated = (html.match(/Actualizado al\s+(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/i) || []).slice(1);
  const months = { enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06", julio: "07", agosto: "08", septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12" };
  const asOf = dated.length === 3 ? `${dated[2]}-${months[dated[1].toLowerCase()] || "??"}-${dated[0].padStart(2, "0")}` : "";
  const isins = limaIsins();
  const num = (value) => {
    const text = String(value || "").replace(/,/g, "").trim();
    if (!text || text.includes(".")) {
      if (!text || /^\.+$/.test(text)) return null;
    }
    const n = Number(text);
    return n > 0 ? n : null;
  };
  const venue = VENUES.find((v) => v.mic === "XLIM");
  delayedQuotes.lima.clear();
  let books = 0;
  for (const row of html.match(/<tr>([\s\S]*?)<\/tr>/gi) || []) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
      cell[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    );
    if (cells.length < 11) continue;
    const ticker = cells[0].replace(/\s*\(.*$/, "").trim().toUpperCase();
    const currency = cells[1] === "S/" ? "PEN" : cells[1] === "US$" ? "USD" : "";
    if (!currency) continue;
    const bid = num(cells[9]);
    const ask = num(cells[10]);
    if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
    const ids = isins.get(ticker);
    if (!ids || ids.size !== 1) continue;
    const isin = [...ids][0];
    const bp = bpFrom(bid, ask);
    if (!(bp > 0)) continue;
    const rounded = Number(bp.toFixed(2));
    delayedQuotes.lima.set(`${isin}|${currency}`, { bid, ask, currency, ticker, asOf, bp: rounded });
    ((spreads[isin] ||= {})[venue.mic] ||= {})[currency] = {
      bp: rounded,
      url: spreadUrl({ isin, ticker, venue, currency }),
    };
    books += 1;
  }
  return { books, asOf };
}

// Budapest publishes one delayed pre-trade table for the cash market and for
// BETa. Times on the page are UTC. A quote from the opening auction, or from
// another day, is not the continuous book.
const BUDAPEST_PAGE = "https://bet.hu/site/Angol/pages/mifid2";
const budapestQuotes = new Map();
let budapestTrouble = null;

function budapestContinuous(trDate, trTime) {
  const raw = String(trTime || "");
  const day = String(trDate || "");
  if (!/^\d{8}$/.test(day) || raw.length < 6) return false;
  const utc = new Date(
    `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4, 6)}Z`
  );
  if (Number.isNaN(utc.getTime())) return false;
  const partsOf = (d) =>
    Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Budapest",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(d)
        .map((p) => [p.type, p.value])
    );
  const parts = partsOf(utc);
  const today = partsOf(new Date());
  if (parts.year !== today.year || parts.month !== today.month || parts.day !== today.day) return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 9 * 60 && minutes < 17 * 60;
}

async function loadBudapest() {
  budapestQuotes.clear();
  const html = await (await fetchOk(BUDAPEST_PAGE, 60000)).text();
  const at = html.indexOf("dataSourceResults=");
  if (at < 0) throw new Error("page BÉT illisible");
  const data = JSON.parse(html.slice(at + "dataSourceResults=".length, html.indexOf("</script>", at)));
  const rows = data.BetPretradeExchangeTableDataSource || [];
  for (const row of rows) {
    const isin = String(row.isin || "").toUpperCase();
    const currency = String(row.trCurrency || "").toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !currency) continue;
    if (!budapestContinuous(row.trDate, row.trTime)) continue;
    const bid = Number(String(row.bestBidPrice ?? "").replace(/\s/g, "").replace(",", "."));
    const ask = Number(String(row.bestAskPrice ?? "").replace(/\s/g, "").replace(",", "."));
    if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
    const prev = budapestQuotes.get(`${isin}|${currency}`);
    if (prev && prev.at > `${row.trDate}${row.trTime}`) continue;
    budapestQuotes.set(`${isin}|${currency}`, { bid, ask, currency, at: `${row.trDate}${row.trTime}` });
  }
}

// Luxembourg's delayed file is one row per resting side, not a trade tape.
// A bid left from the opening call is not paired with an ask from the
// continuous book. RTS 2 is the bond file and is not read here.
const LUXSE_PRE = "https://dl.luxse.com/rts/1/pre-trade";
const luxseQuotes = new Map();
let luxseTrouble = null;

function luxseContinuous(stamp) {
  const utc = new Date(stamp);
  if (Number.isNaN(utc.getTime())) return false;
  const partsOf = (d) =>
    Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Luxembourg",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(d)
        .map((p) => [p.type, p.value])
    );
  const parts = partsOf(utc);
  const today = partsOf(new Date());
  if (parts.year !== today.year || parts.month !== today.month || parts.day !== today.day) return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= 9 * 60 && minutes < 17 * 60 + 30;
}

async function loadLuxse() {
  luxseQuotes.clear();
  const text = await (await fetchOk(LUXSE_PRE, 60000)).text();
  const table = parseCsv(text);
  const header = table[0] || [];
  const col = (name) => header.indexOf(name);
  const isinAt = col("Instrument identification code");
  const sideAt = col("Side");
  const priceAt = col("Price");
  const ccyAt = col("Price currency");
  const noteAt = col("Price notation");
  const venueAt = col("Venue");
  const phaseAt = col("Trading system phase");
  const atAt = col("Update date and time");
  if (isinAt < 0 || sideAt < 0 || priceAt < 0) throw new Error("fichier pré-trade LuxSE illisible");
  const sides = new Map();
  for (const row of table.slice(1)) {
    if (row[phaseAt] !== "COTR") continue;
    if (noteAt >= 0 && row[noteAt] && row[noteAt] !== "MONE") continue;
    if (!luxseContinuous(row[atAt])) continue;
    const isin = String(row[isinAt] || "").toUpperCase();
    const currency = String(row[ccyAt] || "").toUpperCase();
    const side = row[sideAt];
    const price = Number(row[priceAt]);
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) || !currency || !(price > 0)) continue;
    if (side !== "BUYI" && side !== "SELL") continue;
    const venue = row[venueAt] || "XLUX";
    const key = `${isin}|${currency}|${venue}`;
    const prev = sides.get(key) || {};
    const was = prev[side];
    if (was && was.at > row[atAt]) continue;
    prev[side] = { price, at: row[atAt] };
    sides.set(key, prev);
  }
  const byBook = new Map();
  for (const [key, quote] of sides) {
    if (!quote.BUYI || !quote.SELL) continue;
    const bid = quote.BUYI.price;
    const ask = quote.SELL.price;
    if (!(ask >= bid)) continue;
    const [isin, currency, venue] = key.split("|");
    const id = `${isin}|${currency}`;
    if (!byBook.has(id)) byBook.set(id, []);
    byBook.get(id).push({ bid, ask, currency, venue });
  }
  for (const [id, books] of byBook) {
    const regulated = books.find((b) => b.venue === "XLUX");
    const chosen = regulated || (books.length === 1 ? books[0] : null);
    if (chosen) luxseQuotes.set(id, chosen);
  }
}

const adapters = {
  adx: gulfAdapter("adx"),
  dfm: gulfAdapter("dfm"),
  msx: gulfAdapter("msx"),
  budapest: {
    measure: "touche du carnet Budapest",
    async prefetch() {
      try {
        await loadBudapest();
        console.error(`    Budapest : ${budapestQuotes.size} touches\n`);
      } catch (e) {
        budapestTrouble = String(e.message || e).slice(0, 160);
        console.error(`    Budapest : ${budapestTrouble}\n`);
      }
    },
    async fetch(l) {
      const quote = budapestQuotes.get(`${l.isin}|${l.currency}`);
      if (!quote) return { spreadBp: null, note: budapestTrouble || "absent du carnet de Budapest" };
      const bp = bpFrom(quote.bid, quote.ask);
      if (bp == null) return { spreadBp: null, note: "carnet à un seul côté" };
      return { spreadBp: bp, bid: quote.bid, ask: quote.ask, tradingCurrency: quote.currency };
    },
  },
  luxse: {
    measure: "touche du carnet Luxembourg",
    async prefetch() {
      try {
        await loadLuxse();
        console.error(`    Luxembourg : ${luxseQuotes.size} touches\n`);
      } catch (e) {
        luxseTrouble = String(e.message || e).slice(0, 160);
        console.error(`    Luxembourg : ${luxseTrouble}\n`);
      }
    },
    async fetch(l) {
      const exact = luxseQuotes.get(`${l.isin}|${l.currency}`);
      const books = [];
      if (!exact) {
        for (const [id, row] of luxseQuotes) {
          if (id.startsWith(`${l.isin}|`)) books.push(row);
        }
      }
      // The catalogue currency still trades that book when Luxembourg quotes the ISIN once.
      const quote = exact || (books.length === 1 ? books[0] : null);
      if (!quote) {
        const offered = [...new Set(books.map((b) => b.currency))].join(", ");
        const note = offered
          ? `pas de ligne en ${l.currency} (le Luxembourg cote ${offered})`
          : luxseTrouble || "absent du carnet du Luxembourg";
        return { spreadBp: null, note };
      }
      const bp = bpFrom(quote.bid, quote.ask);
      if (bp == null) return { spreadBp: null, note: "carnet à un seul côté" };
      return { spreadBp: bp, bid: quote.bid, ask: quote.ask, tradingCurrency: quote.currency };
    },
  },
  bhb: gulfAdapter("bhb"),
  // Xetra's own book, asked for over the socket the page itself uses. Reading it in the
  // DOM worked and was hopeless at this size: a page load and a wait for the quote to
  // stream in ran at four listings a minute, so a first pass over three thousand of them
  // needed a working day, and three overlapping passes trying to catch up had Boerse
  // Frankfurt answering 503 to everything. The same socket takes a whole array of
  // instruments in one message and answers two hundred a second, which turns the pass
  // from hours into seconds and asks the exchange for a fraction of what the pages cost
  // it.
  //
  // Every listing is asked for before the loop starts, in `prefetch`, and the per-listing
  // call below is a lookup. Quotes come fifteen minutes delayed, as they do in the page —
  // that is what a book looked like a quarter of an hour ago, and the figure published
  // here is a median over many readings.
  //
  // Asking `@ETR` names the Xetra book itself, which is better than the page could do:
  // there the Frankfurt floor and Xetra sit on two tabs and the wrong one being in front
  // would widen every German figure in the file, so the tab label had to be read back.
  //
  // The monthly workbook stays, for the one thing neither page nor socket says plainly:
  // which currency lines the fund actually has on Xetra. Ask for a line that does not
  // exist and the answer is a quote from the line that does, so without that guard a
  // broker's imaginary dollar line would be published carrying the euro book's spread.
  //
  // The workbook only covers exchange-traded products, though, and that guard was quietly
  // refusing every German share: thirteen hundred listings came back "absent des statistiques
  // Xetra" for no better reason than that a share is not a fund. What the guard protects
  // against cannot happen to them — a share has one book on Xetra and it is in euro, so
  // there is no second currency line whose figure could be borrowed by mistake. So a
  // listing the workbook does not know is asked for anyway when it is quoted in euro, and
  // still refused in any other currency, where the ambiguity is real.
  xetra: {
    measure: "touche du carnet, différé de 15 min",
    async prefetch(lines, ownTab) {
      const wanted = [];
      for (const l of lines) {
        const currency = xetraAskCurrency(l);
        if (!currency) continue;
        wanted.push(currency === l.currency ? l : { ...l, currency });
      }
      if (!wanted.length) return;
      await xetraBulk(wanted, ownTab);
    },
    async fetch(l) {
      const asked = xetraAskCurrency(l);
      if (!asked) {
        // The fund can be on Xetra without being on this line of it: another currency is
        // another order book, and borrowing one of several is the error this file prevents.
        const elsewhere = xetraCurrencies(l.isin);
        return {
          spreadBp: null,
          settled: true,
          note: `coté sur Xetra en ${elsewhere.join(" et ")}, pas en ${l.currency}`,
        };
      }

      const quote = xetraQuotes.get(`${l.isin}|${asked}`);
      if (!quote) return { spreadBp: null, note: xetraTrouble || "pas de réponse du socket Xetra" };
      const bp = bpFrom(quote.bid, quote.ask);
      // No two-sided quote is a book with one side or none — before the open, or a line
      // nobody is making a price in. Neither is a cost, and both come back tomorrow.
      if (bp == null) return { spreadBp: null, note: "carnet à un seul côté" };
      // The register that decides the guard above also names the page: it lists the
      // exchange-traded products and nothing else, so a line it does not carry is a share,
      // and Frankfurt files those under `aktie` and answers 404 under `etf`.
      return {
        spreadBp: bp,
        tradingCurrency: quote.currency || asked,
        family: xlm[`${l.isin}|${asked}`] ? "etf" : "share",
      };
    },
  },

  // The American reports say what a retail order actually paid rather than what the book
  // was showing, price improvement included, which on these funds applied to 95% of the
  // shares filled. Keyed by symbol, in dollars per share, and averaged over a month, so
  // like Xetra it costs no request per listing and survives the close.
  //
  // The size bucket the figure comes from is 100 to 499 shares — the smallest the legacy
  // format has. Orders below a hundred shares became reportable only with the 2024
  // amendments, which this host has yet to publish, so a twenty-share order is outside
  // the sample rather than inside it at a different price.
  us605: {
    measure: "spread effectif 605, aller-retour, moyenne mensuelle",
    local: true,
    unit: "perShare",
    async fetch(l) {
      if (!l.ticker) return { perShare: null, note: "symbole manquant, clé de la table 605" };
      // The table is keyed by symbol. A European line a broker labelled "NASDAQ" in
      // euros must not pick up the American namesake. The venue is already a US
      // book (us605); USD is what keeps TTE / ASML / SHEL — French or Dutch ISIN,
      // New York listing — from being treated as a foreign book.
      if (l.currency !== "USD") {
        return {
          perShare: null,
          settled: true,
          note: `605 est en USD, pas en ${l.currency}`,
        };
      }
      const line = us605.symbols[l.ticker.toUpperCase()];
      if (!line) {
        return {
          perShare: null,
          settled: true,
          note: `absent des rapports 605 de ${us605.month}`,
        };
      }
      return { perShare: line.perShare };
    },
  },

  // The LSE answers on a plain unauthenticated endpoint keyed by TIDM, and the TIDM is
  // per currency line, which is exactly the granularity a spread needs.
  lse: {
    dataUrl: (ticker) =>
      `https://api.londonstockexchange.com/api/gw/lse/instruments/alldata/${encodeURIComponent(ticker)}`,
    searchUrl: (isin) =>
      `https://api.londonstockexchange.com/api/gw/lse/search/autocomplete?q=${encodeURIComponent(isin)}`,
    measure: "touche du carnet, différé 15 min",
    cache: new Map(),
    async linesFor(isin) {
      if (!isin) return [];
      if (this.cache.has(isin)) return this.cache.get(isin);
      const pending = (async () => {
        const found = await fetch(this.searchUrl(isin), {
          headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        });
        if (!found.ok) return [];
        const hits = (await found.json()).instruments || [];
        const rows = [];
        for (const hit of hits) {
          if (!hit?.tidm) continue;
          const res = await fetch(this.dataUrl(hit.tidm), {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) continue;
          const row = await res.json();
          if (row.isin && row.isin.toUpperCase() !== isin) continue;
          rows.push(row);
        }
        return rows;
      })();
      this.cache.set(isin, pending);
      return pending;
    },
    async fetch(l) {
      const sterling = new Set(["GBP", "GBX"]);
      const sameBook = (said, wanted) => said === wanted || (sterling.has(said) && sterling.has(wanted));
      const bookOf = (said) => (said === "GBX" ? "GBP" : said);
      let rows = await this.linesFor(l.isin);
      if (!rows.length && l.ticker) {
        const res = await fetch(this.dataUrl(l.ticker), {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          const row = await res.json();
          if (!row.isin || row.isin.toUpperCase() === l.isin) rows = [row];
        }
      }
      if (!rows.length) return { spreadBp: null, note: `${l.isin} est absent du LSE` };
      const wanted = String(l.currency || "").toUpperCase();
      const match = rows.find((r) => sameBook(String(r.currency || "").toUpperCase(), wanted));
      // A catalogue line in another currency still trades the London book when the
      // venue quotes that ISIN in one currency only. Two different lines are not one book.
      const currencies = new Set(rows.map((r) => bookOf(String(r.currency || "").toUpperCase())));
      const sole = !match && currencies.size === 1 ? rows.find((r) => Number(r.bid) > 0 && Number(r.offer) > 0) || rows[0] : null;
      const picked = match || sole;
      if (!picked) {
        const offered = [...currencies].filter(Boolean).join(", ");
        return { spreadBp: null, note: `pas de ligne en ${l.currency} (le LSE cote ${offered})` };
      }
      const said = String(picked.currency || "").toUpperCase();
      const bid = Number(picked.bid);
      const ask = Number(picked.offer);
      if (!(bid > 0) || !(ask > 0)) {
        const where = picked.segment === "SSX4" ? "SETSqx, entre les enchères" : "un seul côté";
        return { spreadBp: null, note: `pas de bid ni d'offer (${where})`, tradingCurrency: said || null };
      }
      return { spreadBp: bpFrom(bid, ask), bid, ask, tradingCurrency: said || null };
    },
  },

  // SIX returns one row per trading currency for a given ISIN, so the currency picks
  // the line without needing a symbol at all. An ETF, ETC or ETN that the day's
  // Market Quality Metrics file prices is that average, not this touch. A share
  // is not in the file and stays here.
  six: {
    dataUrl: (l) =>
      `https://www.six-group.com/fqs/snap.json?select=ISIN,ValorSymbol,BidPrice,AskPrice,TradingCurrency,ValorId,ProductLine&where=ISIN=${l.isin}`,
    measure: "touche du carnet, différé 15 min",
    async prefetch() {
      if (!sixMqm.size) await loadSixMqm();
    },
    averageOf(l) {
      return sixMqm.get(`${l.isin}|${l.currency}`) || null;
    },
    async fetch(l) {
      const avg = adapters.six.averageOf(l);
      if (avg) {
        return {
          spreadBp: avg.bp,
          tradingCurrency: l.currency,
          family: "etf",
          url: avg.url,
          published: true,
        };
      }
      const res = await fetch(adapters.six.dataUrl(l), {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { spreadBp: null, note: `SIX a répondu ${res.status}` };
      const j = await res.json();
      const cols = j.colNames || [];
      const rows = (j.rowData || []).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
      const wanted = String(l.currency || "").toUpperCase();
      const line = rows.find((r) => String(r.TradingCurrency).toUpperCase() === wanted);
      // SIX quotes each ISIN in the currencies it actually lists. A catalogue line in
      // another currency still trades that book when the venue has only one.
      const sole = !line && rows.length === 1 ? rows[0] : null;
      const picked = line || sole;
      if (!picked) {
        return {
          spreadBp: null,
          note: rows.length
            ? `pas de ligne en ${l.currency} (SIX propose ${[...new Set(rows.map((r) => r.TradingCurrency))].join(", ")})`
            : "ISIN absent de SIX",
        };
      }
      return {
        spreadBp: bpFrom(Number(picked.BidPrice), Number(picked.AskPrice)),
        bid: Number(picked.BidPrice) || null,
        ask: Number(picked.AskPrice) || null,
        tradingCurrency: picked.TradingCurrency,
        // The book is read the same way either way; this only says which page shows it.
        // Blue chips and domestic shares belong to the share explorer, exchange-traded
        // products to the fund one, and anything else is left to the default.
        family: { BC: "share", DS: "share", ET: "etf" }[picked.ProductLine],
      };
    },
  },

  // August's investment-products PDF (and whichever month is newest) prints, for
  // each ETP, the weighted average of the bid/ask spread over the continuous
  // session, as a percentage of the mid. That is the round trip. LICs and
  // A-REITs are other sections and are not read. A share is not in the table.
  asx: {
    measure: "spread moyen du mois, meilleur bid contre meilleur ask",
    async prefetch() {
      if (!asxSpread.size) await loadAsxSpread();
    },
    async fetch(l) {
      if (l.currency !== "AUD") {
        return { spreadBp: null, note: `le rapport ASX est en AUD, pas en ${l.currency}` };
      }
      const code = String(l.ticker || "").split(":").pop().trim().toUpperCase();
      const hit = asxSpread.get(code);
      if (!hit) return { spreadBp: null, note: "pas dans le rapport mensuel des ETP de l'ASX" };
      return { spreadBp: hit.bp, url: hit.url, tradingCurrency: "AUD", family: "etf", published: true };
    },
  },

  // The monthly category file, not the live book. A name it does not price
  // stays empty rather than borrowing the touch.
  nse: {
    measure: "impact cost moyen sur six mois, aller-retour d'un ordre de 1 lakh",
    async prefetch() {
      if (!nseImpact.size) await loadNseImpact();
    },
    async fetch(l) {
      if (l.currency !== "INR") {
        return { spreadBp: null, note: `l'impact cost NSE est en INR, pas en ${l.currency}` };
      }
      const hit = nseImpact.get(l.isin);
      if (!hit) return { spreadBp: null, note: "pas dans le fichier d'impact cost de la NSE" };
      return { spreadBp: hit.bp, url: hit.url, tradingCurrency: "INR", published: true };
    },
  },

  // The monthly quoting file is the session average for each Tokyo ETF. There is
  // no book to read here; a share, or an ETF the file does not list, stays empty.
  tsej: {
    measure: "spread moyen du mois, meilleur bid contre meilleur ask",
    async prefetch() {
      if (!jpxSpread.size) await loadJpxSpread();
    },
    async fetch(l) {
      if (l.currency !== "JPY") {
        return { spreadBp: null, note: `Tokyo cote ses ETF en JPY, pas en ${l.currency}` };
      }
      const code = String(l.ticker || "").split(":").pop().trim().toUpperCase();
      const hit = jpxSpread.get(code);
      if (!hit) {
        return { spreadBp: null, note: "pas dans la moyenne mensuelle des ETF de Tokyo" };
      }
      return { spreadBp: hit.bp, url: hit.url, tradingCurrency: "JPY", family: "etf", published: true };
    },
  },

  // Euronext encrypts its quote endpoint and decrypts it in the page, so the rendered
  // book is the accessible form. One adapter covers Paris, Amsterdam, Brussels, Lisbon
  // and Milan, which share the platform. Oslo (XOSL) and Dublin (XMSM) sit on it too.
  euronext: {
    measure: "touche du carnet, clôture ou différé",
    async fetch(l, ownTab) {
      const found = await euronextPage(l);
      if (!found.url) return { spreadBp: null, note: found.note };
      const p = await ownTab();
      try {
        await p.goto(found.url, { waitUntil: "networkidle2", timeout: 60000 });
        await new Promise((r) => setTimeout(r, 3000));
      } catch {
        return { spreadBp: null, note: "page Euronext non chargée" };
      }
      const book = await p.evaluate(() => {
        const text = (document.body?.innerText || "").replace(/\u00a0/g, " ");
        const grab = (label) => {
          const m = text.match(new RegExp(`${label}\\s*([\\d.,]+)`, "i"));
          return m?.[1] ? Number(m[1].replace(/,/g, "")) : null;
        };
        return { bid: grab("Best Bid"), ask: grab("Best Ask"), notFound: /instrument not found/i.test(text) };
      });
      if (book.notFound) return { spreadBp: null, note: `non coté sur ${l.mic}` };
      return {
        spreadBp: bpFrom(book.bid, book.ask),
        bid: book.bid,
        ask: book.ask,
        // The search already named the page, so it travels back rather than being guessed
        // again: only it knows that this ISIN is an `etvs` on ALXP rather than an `etfs`.
        url: found.url,
      };
    },
  },

  // EuroTLX only. The search also offers this book for a Paris or Milan
  // name; those adapters keep refusing it, and this one never reads them.
  eurotlx: {
    measure: "touche du carnet EuroTLX",
    async fetch(l, ownTab) {
      if (l.currency !== "EUR") {
        return { spreadBp: null, note: `EuroTLX cote en EUR, pas en ${l.currency}` };
      }
      const found = await euronextPage({ ...l, mic: "ETLX" });
      if (!found.url) return { spreadBp: null, note: found.note };
      const p = await ownTab();
      try {
        await p.goto(found.url, { waitUntil: "networkidle2", timeout: 60000 });
        await new Promise((r) => setTimeout(r, 2500));
      } catch {
        return { spreadBp: null, note: "page EuroTLX non chargée" };
      }
      const book = await p.evaluate(() => {
        const text = (document.body?.innerText || "").replace(/\u00a0/g, " ");
        const grab = (label) => {
          const m = text.match(new RegExp(`${label}\\s*([\\d.,]+)`, "i"));
          return m?.[1] ? Number(m[1].replace(/,/g, "")) : null;
        };
        return { bid: grab("Best Bid"), ask: grab("Best Ask"), notFound: /instrument not found/i.test(text) };
      });
      if (book.notFound) return { spreadBp: null, note: "non coté sur ETLX" };
      const bp = bpFrom(book.bid, book.ask);
      return {
        spreadBp: bp,
        bid: book.bid,
        ask: book.ask,
        tradingCurrency: "EUR",
        url: found.url,
        ...(bp == null ? { note: "carnet à un seul côté" } : {}),
      };
    },
  },

  xice: {
    measure: "touche du carnet",
    async prefetch() {
      try {
        await loadXice();
        console.error(`    Nasdaq Iceland : ${xiceQuotes.size} cotations\n`);
      } catch (e) {
        xiceTrouble = String(e.message || e).slice(0, 160);
        console.error(`    Nasdaq Iceland : ${xiceTrouble}\n`);
      }
    },
    async fetch(l) {
      if (l.currency !== "ISK") return { spreadBp: null, note: `Nasdaq Iceland cote en ISK, pas en ${l.currency}` };
      const quote = xiceQuotes.get(`${l.isin}|ISK`);
      if (!quote) return { spreadBp: null, note: xiceTrouble || "absent du crible Nasdaq Iceland" };
      const bp = bpFrom(quote.bid, quote.ask);
      const symbol = quote.symbol.toLowerCase();
      return {
        spreadBp: bp,
        bid: quote.bid,
        ask: quote.ask,
        tradingCurrency: "ISK",
        url: quote.orderbookId
          ? `https://www.nasdaq.com/european-market-activity/shares/${encodeURIComponent(symbol)}?id=${encodeURIComponent(quote.orderbookId)}`
          : undefined,
        ...(bp == null ? { note: "carnet à un seul côté" } : {}),
      };
    },
  },

  fnis: {
    measure: "touche du carnet",
    async prefetch() {
      try {
        await loadFnis();
        console.error(`    First North Iceland : ${fnisQuotes.size} cotations\n`);
      } catch (e) {
        fnisTrouble = String(e.message || e).slice(0, 160);
        console.error(`    First North Iceland : ${fnisTrouble}\n`);
      }
    },
    async fetch(l) {
      if (l.currency !== "ISK") return { spreadBp: null, note: `First North Iceland cote en ISK, pas en ${l.currency}` };
      const quote = fnisQuotes.get(`${l.isin}|ISK`);
      if (!quote) return { spreadBp: null, note: fnisTrouble || "absent du crible First North Iceland" };
      const bp = bpFrom(quote.bid, quote.ask);
      const symbol = quote.symbol.toLowerCase();
      return {
        spreadBp: bp,
        bid: quote.bid,
        ask: quote.ask,
        tradingCurrency: "ISK",
        url: quote.orderbookId
          ? `https://www.nasdaq.com/european-market-activity/shares/${encodeURIComponent(symbol)}?id=${encodeURIComponent(quote.orderbookId)}`
          : undefined,
        ...(bp == null ? { note: "carnet à un seul côté" } : {}),
      };
    },
  },

  xcse: {
    measure: "touche du carnet",
    async prefetch() {
      try {
        await loadXcse();
        console.error(`    Nasdaq Copenhagen : ${xcseQuotes.size} cotations\n`);
      } catch (e) {
        xcseTrouble = String(e.message || e).slice(0, 160);
        console.error(`    Nasdaq Copenhagen : ${xcseTrouble}\n`);
      }
    },
    async fetch(l) {
      if (l.currency !== "DKK") return { spreadBp: null, note: `Nasdaq Copenhagen cote en DKK, pas en ${l.currency}` };
      const quote = xcseQuotes.get(`${l.isin}|DKK`);
      if (!quote) return { spreadBp: null, note: xcseTrouble || "absent du crible Nasdaq Copenhagen" };
      const bp = bpFrom(quote.bid, quote.ask);
      const symbol = quote.symbol.toLowerCase();
      return {
        spreadBp: bp,
        bid: quote.bid,
        ask: quote.ask,
        tradingCurrency: "DKK",
        url: quote.orderbookId
          ? `https://www.nasdaq.com/european-market-activity/shares/${encodeURIComponent(symbol)}?id=${encodeURIComponent(quote.orderbookId)}`
          : undefined,
        ...(bp == null ? { note: "carnet à un seul côté" } : {}),
      };
    },
  },

  xtal: {
    measure: "touche du carnet Tallinn",
    async prefetch() {
      try {
        await loadBaltic();
        console.error(`    Nasdaq Tallinn : ${balticQuotes.XTAL.size} touches\n`);
      } catch (e) {
        balticTrouble = String(e.message || e).slice(0, 160);
        console.error(`    Nasdaq Tallinn : ${balticTrouble}\n`);
      }
    },
    async fetch(l) {
      return balticTouch(l, "XTAL", "Nasdaq Tallinn");
    },
  },

  xris: {
    measure: "touche du carnet Riga",
    async prefetch() {
      try {
        await loadBaltic();
        console.error(`    Nasdaq Riga : ${balticQuotes.XRIS.size} touches\n`);
      } catch (e) {
        balticTrouble = String(e.message || e).slice(0, 160);
        console.error(`    Nasdaq Riga : ${balticTrouble}\n`);
      }
    },
    async fetch(l) {
      return balticTouch(l, "XRIS", "Nasdaq Riga");
    },
  },

  xlit: {
    measure: "touche du carnet Vilnius",
    async prefetch() {
      try {
        await loadBaltic();
        console.error(`    Nasdaq Vilnius : ${balticQuotes.XLIT.size} touches\n`);
      } catch (e) {
        balticTrouble = String(e.message || e).slice(0, 160);
        console.error(`    Nasdaq Vilnius : ${balticTrouble}\n`);
      }
    },
    async fetch(l) {
      return balticTouch(l, "XLIT", "Nasdaq Vilnius");
    },
  },

  bsse: {
    measure: "touche du carnet Bratislava",
    async prefetch() {
      try {
        await loadBsse();
        console.error(`    Bratislava : ${bsseQuotes.size} touches\n`);
      } catch (e) {
        bsseTrouble = String(e.message || e).slice(0, 160);
        console.error(`    Bratislava : ${bsseTrouble}\n`);
      }
    },
    async fetch(l) {
      const book = bsseQuotes.get(`${l.isin}|${l.currency}`);
      if (!book) {
        const other = [...bsseQuotes.keys()].find((key) => key.startsWith(`${l.isin}|`));
        if (other) return { spreadBp: null, note: `Bratislava cote en ${other.split("|")[1]}, pas en ${l.currency}` };
        return { spreadBp: null, note: bsseTrouble || "absent du carnet de Bratislava" };
      }
      const bp = bpFrom(book.bid, book.ask);
      if (bp == null) return { spreadBp: null, note: "carnet à un seul côté" };
      return {
        spreadBp: bp,
        bid: book.bid,
        ask: book.ask,
        tradingCurrency: book.currency,
        url: BSSE_PAGE,
      };
    },
  },

  athex: {
    measure: "touche du carnet Athènes",
    async prefetch() {
      try {
        await loadAthex();
        console.error(`    Athènes : ${athexQuotes.size} touches\n`);
      } catch (e) {
        athexTrouble = String(e.message || e).slice(0, 160);
        console.error(`    Athènes : ${athexTrouble}\n`);
      }
    },
    async fetch(l) {
      const quote = athexQuotes.get(`${l.isin}|${l.currency}`);
      if (!quote) return { spreadBp: null, note: athexTrouble || "absent du carnet d'Athènes" };
      const bp = bpFrom(quote.bid, quote.ask);
      if (bp == null) return { spreadBp: null, note: "carnet à un seul côté" };
      return { spreadBp: bp, bid: quote.bid, ask: quote.ask, tradingCurrency: quote.currency };
    },
  },

  xsto: {
    measure: "touche du carnet",
    async prefetch() {
      try {
        await loadXsto();
        console.error(`    Nasdaq Stockholm : ${xstoQuotes.size} cotations\n`);
      } catch (e) {
        xstoTrouble = String(e.message || e).slice(0, 160);
        console.error(`    Nasdaq Stockholm : ${xstoTrouble}\n`);
      }
    },
    async fetch(l) {
      return nordicTouch(l, {
        quotes: xstoQuotes,
        currencies: xstoCurrencies,
        trouble: xstoTrouble,
        place: "Nasdaq Stockholm",
      });
    },
  },

  fnse: {
    measure: "touche du carnet",
    async prefetch() {
      try {
        await loadFnse();
        console.error(`    First North Stockholm : ${fnseQuotes.size} cotations\n`);
      } catch (e) {
        fnseTrouble = String(e.message || e).slice(0, 160);
        console.error(`    First North Stockholm : ${fnseTrouble}\n`);
      }
    },
    async fetch(l) {
      return nordicTouch(l, {
        quotes: fnseQuotes,
        currencies: fnseCurrencies,
        trouble: fnseTrouble,
        place: "First North Stockholm",
      });
    },
  },

  fndk: {
    measure: "touche du carnet",
    async prefetch() {
      try {
        await loadFndk();
        console.error(`    First North Danemark : ${fndkQuotes.size} cotations\n`);
      } catch (e) {
        fndkTrouble = String(e.message || e).slice(0, 160);
        console.error(`    First North Danemark : ${fndkTrouble}\n`);
      }
    },
    async fetch(l) {
      return nordicTouch(l, {
        quotes: fndkQuotes,
        currencies: fndkCurrencies,
        trouble: fndkTrouble,
        place: "First North Danemark",
      });
    },
  },

  fnfi: {
    measure: "touche du carnet",
    async prefetch() {
      try {
        await loadFnfi();
        console.error(`    First North Helsinki : ${fnfiQuotes.size} cotations\n`);
      } catch (e) {
        fnfiTrouble = String(e.message || e).slice(0, 160);
        console.error(`    First North Helsinki : ${fnfiTrouble}\n`);
      }
    },
    async fetch(l) {
      return nordicTouch(l, {
        quotes: fnfiQuotes,
        currencies: fnfiCurrencies,
        trouble: fnfiTrouble,
        place: "First North Helsinki",
      });
    },
  },

  xpra: {
    measure: "touche du carnet, différé 15 min",
    async prefetch() {
      console.error("    Prague : meilleure offre et meilleure demande, page MiFIR\n");
    },
    async fetch(l) {
      const book = await xpraBook(l.isin);
      if (book.trouble && !book.quotes.size) return { spreadBp: null, note: book.trouble };
      const quote = book.quotes.get(l.currency);
      if (!quote) {
        const said = [...book.quotes.keys()];
        if (said.length) return { spreadBp: null, note: `Prague cote en ${said.join(" ou ")}, pas en ${l.currency}` };
        return { spreadBp: null, note: book.trouble || "absent de la publication MiFIR de Prague" };
      }
      const bp = bpFrom(quote.bid, quote.ask);
      return {
        spreadBp: bp,
        bid: quote.bid,
        ask: quote.ask,
        tradingCurrency: quote.currency,
        url: "https://www.pse.cz/en/mifir",
        ...(bp == null ? { note: "carnet à un seul côté" } : {}),
      };
    },
  },

  xhel: {
    measure: "touche du carnet",
    async prefetch() {
      try {
        await loadXhel();
        console.error(`    Nasdaq Helsinki : ${xhelQuotes.size} cotations\n`);
      } catch (e) {
        xhelTrouble = String(e.message || e).slice(0, 160);
        console.error(`    Nasdaq Helsinki : ${xhelTrouble}\n`);
      }
    },
    async fetch(l) {
      return nordicTouch(l, {
        quotes: xhelQuotes,
        currencies: xhelCurrencies,
        trouble: xhelTrouble,
        place: "Nasdaq Helsinki",
      });
    },
  },

  vienna: {
    measure: "touche du carnet, différé 15 min",
    async prefetch(lines) {
      await viennaDiscover();
      if (lines?.some((l) => l.currency !== "EUR")) {
        await loadViennaEtf();
        console.error(`    Wiener Börse : ${viennaEtf.size} ETF sur la liste\n`);
      }
      console.error(`    Wiener Börse : ${viennaPages.size} pages d'instruments\n`);
    },
    async fetch(l) {
      if (l.currency !== "EUR") {
        const book = viennaEtf.get(l.isin);
        if (!book || book.dup) {
          return {
            spreadBp: null,
            note: book?.dup ? "plusieurs lignes pour cet ISIN" : "absent de la liste ETF de la Wiener Börse",
          };
        }
        const bp = bpFrom(book.bid, book.ask);
        if (bp == null) {
          return { spreadBp: null, note: "carnet à un seul côté", url: "https://www.wienerborse.at/en/exchange-traded-funds/" };
        }
        return {
          spreadBp: bp,
          tradingCurrency: l.currency,
          url: `https://www.wienerborse.at/en/search/exchange-traded-funds/?q=${l.isin}`,
        };
      }
      const found = await viennaPage(l);
      if (!found.url) return { spreadBp: null, note: found.note };
      let html;
      try {
        html = await (await fetchOk(found.url, 20000)).text();
      } catch {
        return { spreadBp: null, note: "page Wiener Börse non chargée", url: found.url };
      }
      const row = html.match(/Bid\/Ask<\/th><td[^>]*>([\s\S]*?)<\/td>/i);
      const nums = [...(row?.[1] || "").matchAll(/>([0-9][0-9.,]*)<\/span>/g)].map((m) => viennaNumber(m[1]));
      const [bid, ask] = nums;
      return {
        spreadBp: bpFrom(bid, ask),
        bid,
        ask,
        tradingCurrency: "EUR",
        url: found.url,
        ...(bid == null || ask == null ? { note: "carnet à un seul côté" } : {}),
      };
    },
  },

  // Deutsche Börse's delayed file service: one gzipped NDJSON tape per minute, every
  // instrument Tradegate makes a price in. Looked up, not visited.
  tradegate: {
    measure: "touche du carnet, différé MiFID",
    async prefetch(lines) {
      try {
        const wanted = new Set(lines.map((l) => `${l.isin}|${l.currency}`));
        const file = await loadTradegate(wanted);
        console.error(`    Tradegate : ${delayedQuotes.tradegate.size} cotations dans ${file}\n`);
      } catch (e) {
        delayedTrouble.tradegate = String(e.message || e).slice(0, 160);
        console.error(`    Tradegate : ${delayedTrouble.tradegate}\n`);
      }
    },
    async fetch(l) {
      const quote = delayedQuotes.tradegate.get(`${l.isin}|${l.currency}`);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.tradegate || "absent du fichier pre-trade Tradegate" };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), tradingCurrency: quote.currency };
    },
  },

  // Cboe Europe CXE, the Chi-X lit book. One touch per symbol from the
  // public book viewer. The symbol file says which ISIN that symbol is.
  cxe: {
    measure: "touche du carnet CXE",
    async prefetch(lines) {
      try {
        const n = await loadCxe(lines);
        console.error(`    Cboe Europe (Chi-X) : ${cxeQuotes.size} touches sur ${n.wanted} demandées\n`);
      } catch (e) {
        cxeTrouble = String(e.message || e).slice(0, 160);
        console.error(`    Cboe Europe (Chi-X) : ${cxeTrouble}\n`);
      }
    },
    async fetch(l) {
      const quote = cxeQuotes.get(`${l.isin}|${l.currency}`);
      if (!quote) return { spreadBp: null, note: cxeTrouble || "absent du carnet CXE" };
      const bp = bpFrom(quote.bid, quote.ask);
      if (bp == null) return { spreadBp: null, note: "carnet à un seul côté" };
      return { spreadBp: bp, tradingCurrency: quote.currency };
    },
  },

  // Cboe Europe DXE. One touch per symbol from the same public viewer as
  // Chi-X, read off the DXE book. A CXE figure is never stored here.
  dxe: {
    measure: "touche du carnet DXE",
    async prefetch(lines) {
      try {
        const n = await loadDxe(lines);
        console.error(`    Cboe Europe DXE : ${dxeQuotes.size} touches sur ${n.wanted} demandées\n`);
      } catch (e) {
        dxeTrouble = String(e.message || e).slice(0, 160);
        console.error(`    Cboe Europe DXE : ${dxeTrouble}\n`);
      }
    },
    async fetch(l) {
      const quote = dxeQuotes.get(`${l.isin}|${l.currency}`);
      if (!quote) return { spreadBp: null, note: dxeTrouble || "absent du carnet DXE" };
      const bp = bpFrom(quote.bid, quote.ask);
      if (bp == null) return { spreadBp: null, note: "carnet à un seul côté" };
      return { spreadBp: bp, tradingCurrency: quote.currency };
    },
  },

  // Bayerische Börse's 15-minute MUNC/MUND snapshots. Continuous book first.
  gettex: {
    measure: "touche du carnet, différé MiFID",
    async prefetch(lines) {
      try {
        const wanted = new Set(lines.map((l) => `${l.isin}|${l.currency}`));
        await loadGettex(wanted);
        console.error(`    gettex : ${delayedQuotes.gettex.size} cotations\n`);
      } catch (e) {
        delayedTrouble.gettex = String(e.message || e).slice(0, 160);
        console.error(`    gettex : ${delayedTrouble.gettex}\n`);
      }
    },
    async fetch(l) {
      const exact = delayedQuotes.gettex.get(`${l.isin}|${l.currency}`);
      const books = [];
      if (!exact) {
        for (const [id, row] of delayedQuotes.gettex) {
          if (id.startsWith(`${l.isin}|`)) books.push(row);
        }
      }
      const quote = exact || (books.length === 1 ? books[0] : null);
      if (!quote) {
        const offered = [...new Set(books.map((b) => b.currency))].join(", ");
        const note = offered
          ? `pas de ligne en ${l.currency} (gettex cote ${offered})`
          : delayedTrouble.gettex || "absent du fichier pre-trade gettex";
        return { spreadBp: null, note };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), tradingCurrency: quote.currency };
    },
  },

  // Börse München floor. MUNB fills the Freiverkehr; MUNA overwrites it.
  munich: {
    measure: "touche du carnet, différé MiFID",
    async prefetch(lines) {
      try {
        const wanted = new Set(lines.map((l) => `${l.isin}|${l.currency}`));
        await loadMunich(wanted);
        console.error(`    Börse München : ${delayedQuotes.munich.size} cotations\n`);
      } catch (e) {
        delayedTrouble.munich = String(e.message || e).slice(0, 160);
        console.error(`    Börse München : ${delayedTrouble.munich}\n`);
      }
    },
    async fetch(l) {
      const quote = delayedQuotes.munich.get(`${l.isin}|${l.currency}`);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.munich || "absent du fichier pre-trade Börse München" };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), tradingCurrency: quote.currency };
    },
  },

  // LS Exchange's own delayed CSV, one row per ISIN, euro only.
  lsex: {
    measure: "touche du carnet, différé MiFID",
    async prefetch() {
      try {
        const url = await loadLsex();
        console.error(`    LS Exchange : ${delayedQuotes.lsex.size} cotations (${url.split("time=")[1] || url})\n`);
      } catch (e) {
        delayedTrouble.lsex = String(e.message || e).slice(0, 160);
        console.error(`    LS Exchange : ${delayedTrouble.lsex}\n`);
      }
    },
    async fetch(l) {
      // The venue quotes the ISIN in euro only. A catalogue line in another
      // currency is that same book, so the euro touch is its spread.
      const quote = delayedQuotes.lsex.get(`${l.isin}|EUR`);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.lsex || "absent du fichier pre-trade LS Exchange" };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), tradingCurrency: l.currency || "EUR" };
    },
  },

  // Lang & Schwarz TradeCenter (LSSI). Same CSV shape as LS Exchange, different book.
  lsin: {
    measure: "touche du carnet, différé MiFID",
    async prefetch() {
      try {
        const url = await loadLsin();
        console.error(`    LS International : ${delayedQuotes.lsin.size} cotations (${url.split("time=")[1] || url})\n`);
      } catch (e) {
        delayedTrouble.lsin = String(e.message || e).slice(0, 160);
        console.error(`    LS International : ${delayedTrouble.lsin}\n`);
      }
    },
    async fetch(l) {
      // The venue quotes the ISIN in euro only. A catalogue line in another currency
      // still trades that book, so it gets the euro touch.
      const quote = delayedQuotes.lsin.get(`${l.isin}|EUR`);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.lsin || "absent du fichier pre-trade LS International" };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), tradingCurrency: l.currency || "EUR" };
    },
  },

  // BÖAG delayed CSVs for Düsseldorf Quotrix (DUSC + DUSD). Looked up, not visited.
  quotrix: {
    measure: "touche du carnet, différé MiFID",
    async prefetch(lines) {
      try {
        const wanted = new Set(lines.map((l) => `${l.isin}|${l.currency}`));
        const files = await loadQuotrix(wanted);
        console.error(`    Quotrix : ${delayedQuotes.quotrix.size} cotations (${files.length} fichiers)\n`);
      } catch (e) {
        delayedTrouble.quotrix = String(e.message || e).slice(0, 160);
        console.error(`    Quotrix : ${delayedTrouble.quotrix}\n`);
      }
    },
    async fetch(l) {
      if (l.currency !== "EUR") {
        return { spreadBp: null, note: `Quotrix cote en EUR, pas en ${l.currency}` };
      }
      const quote = delayedQuotes.quotrix.get(`${l.isin}|EUR`);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.quotrix || "absent du fichier pre-trade Quotrix" };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), tradingCurrency: "EUR" };
    },
  },

  // Börse Frankfurt floor (XFRA). Same MFS tape as Tradegate; the fields are bestBid /
  // bestAsk rather than bid / ask.
  frankfurt: {
    measure: "touche du carnet, différé MiFID",
    async prefetch(lines) {
      try {
        const wanted = new Set(lines.map((l) => `${l.isin}|${l.currency}`));
        const file = await loadFrankfurt(wanted);
        console.error(`    Börse Frankfurt : ${delayedQuotes.frankfurt.size} cotations dans ${file}\n`);
      } catch (e) {
        delayedTrouble.frankfurt = String(e.message || e).slice(0, 160);
        console.error(`    Börse Frankfurt : ${delayedTrouble.frankfurt}\n`);
      }
    },
    async fetch(l) {
      const exact = delayedQuotes.frankfurt.get(`${l.isin}|${l.currency}`);
      const books = [];
      if (!exact) {
        for (const [id, row] of delayedQuotes.frankfurt) {
          if (id.startsWith(`${l.isin}|`)) books.push(row);
        }
      }
      // The catalogue currency still trades that book when Frankfurt quotes the ISIN once.
      const quote = exact || (books.length === 1 ? books[0] : null);
      if (!quote) {
        const offered = [...new Set(books.map((b) => b.currency))].join(", ");
        const note = offered
          ? `pas de ligne en ${l.currency} (Francfort cote ${offered})`
          : delayedTrouble.frankfurt || "absent du fichier pre-trade Francfort";
        return { spreadBp: null, note };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), tradingCurrency: quote.currency };
    },
  },

  hamburg: {
    measure: "touche du carnet, différé MiFID",
    async prefetch(lines) {
      try {
        const wanted = new Set(lines.map((l) => `${l.isin}|${l.currency}`));
        const files = await loadHamburg(wanted);
        console.error(`    Börse Hamburg : ${delayedQuotes.hamburg.size} cotations (${files.length} fichiers)\n`);
      } catch (e) {
        delayedTrouble.hamburg = String(e.message || e).slice(0, 160);
        console.error(`    Börse Hamburg : ${delayedTrouble.hamburg}\n`);
      }
    },
    async fetch(l) {
      if (l.currency !== "EUR") {
        return { spreadBp: null, note: `Hambourg cote en EUR, pas en ${l.currency}` };
      }
      const quote = delayedQuotes.hamburg.get(`${l.isin}|EUR`);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.hamburg || "absent du fichier pre-trade Hambourg" };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), tradingCurrency: "EUR" };
    },
  },

  hannover: {
    measure: "touche du carnet, différé MiFID",
    async prefetch(lines) {
      try {
        const wanted = new Set(lines.map((l) => `${l.isin}|${l.currency}`));
        const files = await loadHannover(wanted);
        console.error(`    Börse Hannover : ${delayedQuotes.hannover.size} cotations (${files.length} fichiers)\n`);
      } catch (e) {
        delayedTrouble.hannover = String(e.message || e).slice(0, 160);
        console.error(`    Börse Hannover : ${delayedTrouble.hannover}\n`);
      }
    },
    async fetch(l) {
      if (l.currency !== "EUR") {
        return { spreadBp: null, note: `Hanovre cote en EUR, pas en ${l.currency}` };
      }
      const quote = delayedQuotes.hannover.get(`${l.isin}|EUR`);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.hannover || "absent du fichier pre-trade Hanovre" };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), tradingCurrency: "EUR" };
    },
  },

  eix: {
    measure: "touche du carnet, différé 15 min",
    async prefetch(lines) {
      try {
        const wanted = new Set(lines.map((l) => `${l.isin}|${l.currency}`));
        const file = await loadEix(wanted);
        console.error(`    EIX : ${delayedQuotes.eix.size} cotations (${file})\n`);
      } catch (e) {
        delayedTrouble.eix = String(e.message || e).slice(0, 160);
        console.error(`    EIX : ${delayedTrouble.eix}\n`);
      }
    },
    async fetch(l) {
      if (l.currency !== "EUR") {
        return { spreadBp: null, note: `EIX cote en EUR, pas en ${l.currency}` };
      }
      const quote = delayedQuotes.eix.get(`${l.isin}|EUR`);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.eix || "absent du fichier pre-trade EIX" };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), tradingCurrency: "EUR" };
    },
  },

  tib: {
    measure: "touche Bestpreis TIB, temps réel",
    local: true,
    async prefetch() {
      try {
        const stats = await loadTib();
        console.error(`    TIB : ${stats.books} carnets (${stats.asOf || "sans date"})\n`);
      } catch (e) {
        delayedTrouble.tib = String(e.message || e).slice(0, 160);
        console.error(`    TIB : ${delayedTrouble.tib}\n`);
      }
    },
    async fetch(l) {
      const quote = delayedQuotes.tib.get(`${l.isin}|${l.currency}`) || delayedQuotes.tib.get(`${l.isin}|EUR`);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.tib || `${l.isin} absent des touches TIB` };
      }
      return {
        spreadBp: quote.bp ?? bpFrom(quote.bid, quote.ask),
        bid: quote.bid,
        ask: quote.ask,
        tradingCurrency: quote.currency,
      };
    },
  },

  bxswiss: {
    measure: "touche du carnet public BX Swiss, temps réel",
    local: true,
    async prefetch() {
      try {
        const stats = await loadBxswiss();
        console.error(`    BX Swiss : ${stats.books} carnets (${stats.asOf || "sans date"})\n`);
      } catch (e) {
        delayedTrouble.bxswiss = String(e.message || e).slice(0, 160);
        console.error(`    BX Swiss : ${delayedTrouble.bxswiss}\n`);
      }
    },
    async fetch(l) {
      const quote = delayedQuotes.bxswiss.get(`${l.isin}|${l.currency}`);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.bxswiss || `${l.isin} absent du carnet BX Swiss` };
      }
      return {
        spreadBp: quote.bp ?? bpFrom(quote.bid, quote.ask),
        bid: quote.bid,
        ask: quote.ask,
        tradingCurrency: quote.currency,
      };
    },
  },

  stuttgart: {
    measure: "touche du carnet, différé MiFID",
    async prefetch(lines, ownTab) {
      try {
        const wanted = new Set(lines.map((l) => `${l.isin}|${l.currency}`));
        const files = await loadStuttgart(wanted, ownTab);
        console.error(`    Börse Stuttgart : ${delayedQuotes.stuttgart.size} cotations (${files} fichiers)\n`);
      } catch (e) {
        delayedTrouble.stuttgart = String(e.message || e).slice(0, 160);
        console.error(`    Börse Stuttgart : ${delayedTrouble.stuttgart}\n`);
      }
    },
    async fetch(l) {
      const quote = delayedQuotes.stuttgart.get(`${l.isin}|${l.currency}`);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.stuttgart || "absent du fichier pre-trade Stuttgart" };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), tradingCurrency: quote.currency };
    },
  },

  bmv: {
    measure: "touche du carnet, différé 20 min",
    async prefetch(lines, ownTab) {
      try {
        const stats = await loadBmv(lines, ownTab);
        console.error(
          `    Bolsa Mexicana : ${stats.books} carnets / ${stats.jobs} émissions (${stats.directory} clés)\n`
        );
      } catch (e) {
        delayedTrouble.bmv = String(e.message || e).slice(0, 160);
        console.error(`    Bolsa Mexicana : ${delayedTrouble.bmv}\n`);
      }
    },
    async fetch(l) {
      if (l.currency !== "MXN") {
        return { spreadBp: null, note: `la BMV cote en MXN, pas en ${l.currency}` };
      }
      let quote = null;
      for (const k of bmvTickerKeys(l.ticker)) {
        quote = delayedQuotes.bmv.get(k);
        if (quote) break;
      }
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.bmv || "absent de la cote BMV" };
      }
      return {
        spreadBp: bpFrom(quote.bid, quote.ask),
        bid: quote.bid,
        ask: quote.ask,
        tradingCurrency: "MXN",
        url: quote.url,
      };
    },
  },

  lima: {
    measure: "propositions du bulletin quotidien",
    async prefetch() {
      try {
        const stats = await loadLima();
        console.error(`    Lima : ${stats.books} carnets, bulletin du ${stats.asOf || "?"}\n`);
      } catch (e) {
        delayedTrouble.lima = String(e.message || e).slice(0, 160);
        console.error(`    Lima : ${delayedTrouble.lima}\n`);
      }
    },
    async fetch(l) {
      const quote = delayedQuotes.lima.get(`${l.isin}|${l.currency}`);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.lima || "absent du bulletin de Lima" };
      }
      return {
        spreadBp: bpFrom(quote.bid, quote.ask),
        bid: quote.bid,
        ask: quote.ask,
        tradingCurrency: quote.currency,
      };
    },
  },

  // The four Canadian books, read through a Questrade session. TSX and TSX Venture come
  // live, the CSE and Cboe Canada fifteen minutes late, which the quote says itself.
  questrade: {
    measure: "touche du carnet, temps réel ou différé 15 min",
    async prefetch(lines, ownTab) {
      try {
        const stats = await loadQuestrade(lines, ownTab);
        console.error(
          `    Questrade : ${stats.books} carnets / ${stats.quoted} cotations (${stats.wanted} symboles)\n`
        );
      } catch (e) {
        delayedTrouble.questrade = String(e.message || e).slice(0, 160);
        console.error(`    Questrade : ${delayedTrouble.questrade}\n`);
      }
    },
    async fetch(l) {
      const symbol = questradeSymbol(l);
      if (!symbol) return { spreadBp: null, note: "ticker manquant, clé du symbole Questrade" };
      const quote = delayedQuotes.questrade.get(symbol);
      if (!quote) {
        return {
          spreadBp: null,
          note: delayedTrouble.questrade || `${symbol} absent de la cote Questrade`,
        };
      }
      // The suffix does not name the venue — TSX and Cboe Canada share `.TO` — so the feed
      // the quote arrived under has to agree with the place the row claims. Without this
      // the two would swap books silently, which is the one thing this file is for.
      const want = QUESTRADE_FEED[l.venue.mic];
      if (quote.feed && want && quote.feed !== want) {
        return { spreadBp: null, note: `${symbol} cote sur ${quote.feed}, pas sur ${want}` };
      }
      // A halted book has a touch, and it is not the one a trade would meet.
      if (quote.halt) return { spreadBp: null, note: "titre suspendu" };
      return { spreadBp: bpFrom(quote.bid, quote.ask), bid: quote.bid, ask: quote.ask };
    },
  },

  // Pure Trading, the book brokers label PURE. The same Questrade session
  // as Toronto, but only a .CN symbol whose feed is CSE. A TSX quote is
  // refused here.
  pure: {
    measure: "touche du carnet Pure Trading",
    async prefetch(lines, ownTab) {
      try {
        const stats = await loadQuestrade(lines, ownTab);
        console.error(
          `    Pure Trading : ${stats.books} carnets / ${stats.quoted} cotations (${stats.wanted} symboles)\n`
        );
      } catch (e) {
        delayedTrouble.questrade = String(e.message || e).slice(0, 160);
        console.error(`    Pure Trading : ${delayedTrouble.questrade}\n`);
      }
    },
    async fetch(l) {
      const symbol = questradeSymbol(l);
      if (!symbol) return { spreadBp: null, note: "ticker manquant, clé du symbole Questrade" };
      const quote = delayedQuotes.questrade.get(symbol);
      if (!quote) {
        return {
          spreadBp: null,
          note: delayedTrouble.questrade || `${symbol} absent de la cote Questrade`,
        };
      }
      if (quote.feed && quote.feed !== "CSE") {
        return { spreadBp: null, note: `${symbol} cote sur ${quote.feed}, pas sur CSE` };
      }
      if (quote.halt) return { spreadBp: null, note: "titre suspendu" };
      const bp = bpFrom(quote.bid, quote.ask);
      if (bp == null) return { spreadBp: null, note: "carnet à un seul côté" };
      return { spreadBp: bp, bid: quote.bid, ask: quote.ask };
    },
  },

  // The whole Binance touch arrives in one call, some three thousand seven hundred
  // pairs, so the coins are free of charge once the file is in hand.
  binance: {
    measure: "touche du carnet, temps réel",
    digits: 4,
    async prefetch() {
      try {
        const n = await loadBinance();
        console.error(`    Binance : ${delayedQuotes.binance.size} carnets sur ${n} paires\n`);
      } catch (e) {
        delayedTrouble.binance = String(e.message || e).slice(0, 160);
        console.error(`    Binance : ${delayedTrouble.binance}\n`);
      }
    },
    async fetch(l) {
      const quote = delayedQuotes.binance.get(l.ticker);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.binance || `${l.ticker} non coté contre le dollar chez Binance` };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), bid: quote.bid, ask: quote.ask, tradingCurrency: CRYPTO_CCY };
    },
  },

  // Coinbase names every product in one call but serves the touch one product at a time,
  // so only the coins this run actually wants are asked for, and slowly enough that the
  // exchange does not start refusing.
  coinbase: {
    measure: "touche du carnet, temps réel",
    digits: 4,
    async prefetch(lines) {
      try {
        const stats = await loadCoinbase(lines);
        console.error(
          `    Coinbase : ${delayedQuotes.coinbase.size} carnets / ${stats.listed} paires en dollar (${stats.wanted} demandées)\n`
        );
      } catch (e) {
        delayedTrouble.coinbase = String(e.message || e).slice(0, 160);
        console.error(`    Coinbase : ${delayedTrouble.coinbase}\n`);
      }
    },
    async fetch(l) {
      const quote = delayedQuotes.coinbase.get(l.ticker);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.coinbase || `${l.ticker} non coté contre le dollar chez Coinbase` };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), bid: quote.bid, ask: quote.ask, tradingCurrency: CRYPTO_CCY };
    },
  },

  // Alpaca's own venue. The quote endpoint takes a hundred pairs at a time and
  // needs no key, so the whole shelf costs a handful of calls.
  alpaca: {
    measure: "touche du carnet, temps réel",
    digits: 4,
    async prefetch(lines) {
      try {
        const stats = await loadAlpaca(lines);
        console.error(
          `    Alpaca : ${delayedQuotes.alpaca.size} carnets / ${stats.wanted} paires demandées\n`
        );
      } catch (e) {
        delayedTrouble.alpaca = String(e.message || e).slice(0, 160);
        console.error(`    Alpaca : ${delayedTrouble.alpaca}\n`);
      }
    },
    async fetch(l) {
      const quote = delayedQuotes.alpaca.get(l.ticker);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.alpaca || `${l.ticker} non coté contre le dollar chez Alpaca` };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), bid: quote.bid, ask: quote.ask, tradingCurrency: CRYPTO_CCY };
    },
  },

  // Lightyear's named tape. One AssetPairs call maps XXBT / XDG onto BTC / DOGE,
  // then one Ticker call returns the touch for every USD pair this run wants.
  kraken: {
    measure: "touche du carnet, temps réel",
    digits: 4,
    async prefetch(lines) {
      try {
        const stats = await loadKraken(lines);
        console.error(
          `    Kraken : ${delayedQuotes.kraken.size} carnets / ${stats.listed} paires en dollar (${stats.wanted} demandées)\n`
        );
      } catch (e) {
        delayedTrouble.kraken = String(e.message || e).slice(0, 160);
        console.error(`    Kraken : ${delayedTrouble.kraken}\n`);
      }
    },
    async fetch(l) {
      const quote = delayedQuotes.kraken.get(l.ticker);
      if (!quote) {
        return { spreadBp: null, note: delayedTrouble.kraken || `${l.ticker} non coté contre le dollar chez Kraken` };
      }
      return { spreadBp: bpFrom(quote.bid, quote.ask), bid: quote.bid, ask: quote.ask, tradingCurrency: CRYPTO_CCY };
    },
  },
  // The main board publishes best bid and best ask on one table. The ETF board on the
  // same site publishes the last trade only, so a fund with no two-sided touch is left
  // empty rather than priced from that print. NewConnect is a different market.
  gpw: {
    measure: "touche du carnet",
    async prefetch(_lines, ownTab) {
      const page = await ownTab();
      await page.goto("https://www.gpw.pl/akcje", { waitUntil: "networkidle0", timeout: 40000 });
      const rows = await page.evaluate(() => {
        const out = [];
        for (const tr of document.querySelectorAll("tr")) {
          const cells = [...tr.querySelectorAll("td")].map((td) => (td.textContent || "").replace(/\s+/g, " ").trim());
          const isinAt = cells.findIndex((c) => /^[A-Z]{2}[A-Z0-9]{10}$/.test(c));
          if (isinAt < 0) continue;
          out.push({
            isin: cells[isinAt],
            ticker: cells[isinAt + 1] || "",
            currency: cells[isinAt + 2] || "",
            bid: cells[isinAt + 14] || "",
            ask: cells[isinAt + 15] || "",
          });
        }
        return out;
      });
      const num = (s) => {
        const t = String(s || "").replace(/\s/g, "").replace(",", ".");
        if (!/^\d+(\.\d+)?$/.test(t)) return null;
        const n = Number(t);
        return n > 0 ? n : null;
      };
      gpwBook.clear();
      for (const row of rows) {
        const bid = num(row.bid);
        const ask = num(row.ask);
        const bp = bpFrom(bid, ask);
        if (bp == null || row.currency !== "PLN") continue;
        gpwBook.set(row.isin, { bp, bid, ask, currency: row.currency });
      }
      console.error(`    GPW : ${gpwBook.size} carnets sur ${rows.length} lignes\n`);
    },
    async fetch(l) {
      const quote = gpwBook.get(l.isin);
      if (!quote) return { spreadBp: null, note: `${l.isin} absent du tableau GPW`, url: "https://www.gpw.pl/akcje" };
      if (l.currency !== "PLN") {
        return { spreadBp: null, tradingCurrency: "PLN", note: `${l.isin} est en PLN sur la GPW` };
      }
      return { spreadBp: quote.bp, bid: quote.bid, ask: quote.ask, tradingCurrency: "PLN", url: "https://www.gpw.pl/akcje" };
    },
  },
};

// -------------------------------------------------------------------------- crypto

const BINANCE_BOOK = "https://api.binance.com/api/v3/ticker/bookTicker";
const COINBASE_PRODUCTS = "https://api.coinbase.com/api/v3/brokerage/market/products?limit=1000";
const COINBASE_BOOK = (id) =>
  `https://api.coinbase.com/api/v3/brokerage/market/product_book?product_id=${encodeURIComponent(id)}&limit=1`;

// Binance settles in its own dollar token rather than in dollars. USDT is the deep leg
// and USDC the thin one, so the first is taken and the second only stands in where the
// first does not exist. Either way the pair is read as a dollar book, which is what the
// market itself means by it.
async function loadBinance() {
  const rows = await (await fetchOk(BINANCE_BOOK, 60000)).json();
  const best = new Map();
  for (const r of rows) {
    const symbol = String(r.symbol || "");
    const quote = symbol.endsWith("USDT") ? "USDT" : symbol.endsWith("USDC") ? "USDC" : null;
    if (!quote) continue;
    const base = symbol.slice(0, -4);
    if (!base || (quote === "USDC" && best.has(base))) continue;
    const bid = Number(r.bidPrice);
    const ask = Number(r.askPrice);
    if (!(bid > 0) || !(ask > 0)) continue;
    best.set(base, { bid, ask, pair: symbol });
  }
  delayedQuotes.binance = best;
  return rows.length;
}

// One request per coin, which is why the directory is read first: asking for a product
// Coinbase does not list would spend a round trip to learn nothing. The pause is what
// keeps four hundred calls from looking like an attack.
async function loadCoinbase(lines) {
  const products = (await (await fetchOk(COINBASE_PRODUCTS, 60000)).json()).products || [];
  const usd = new Map();
  for (const p of products) {
    if (p.status !== "online" || p.trading_disabled || p.is_disabled) continue;
    if (String(p.quote_display_symbol || "").toUpperCase() !== CRYPTO_CCY) continue;
    usd.set(String(p.base_display_symbol || "").toUpperCase(), p.product_id);
  }
  const wanted = [...new Set(lines.map((l) => l.ticker))].filter((t) => usd.has(t));
  for (const base of wanted) {
    try {
      const book = (await (await fetchOk(COINBASE_BOOK(usd.get(base)), 20000)).json()).pricebook;
      const bid = Number(book?.bids?.[0]?.price);
      const ask = Number(book?.asks?.[0]?.price);
      if (bid > 0 && ask > 0) delayedQuotes.coinbase.set(base, { bid, ask, pair: usd.get(base) });
    } catch {
      // One coin's silence is not the exchange's: the others are still worth asking for.
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return { listed: usd.size, wanted: wanted.length };
}

// Alpaca quotes its own book in dollars outright, a hundred symbols per call and
// no key needed. A pair it does not list simply comes back absent, so nothing has
// to be read first the way Coinbase's directory does.
const ALPACA_BOOK = (pairs) =>
  `https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=${encodeURIComponent(pairs.join(","))}`;

async function loadAlpaca(lines) {
  const bases = [...new Set(lines.map((l) => l.ticker))];
  for (let i = 0; i < bases.length; i += 100) {
    const slice = bases.slice(i, i + 100);
    try {
      const quotes = (await (await fetchOk(ALPACA_BOOK(slice.map((b) => `${b}/${CRYPTO_CCY}`)), 30000)).json()).quotes || {};
      for (const [pair, q] of Object.entries(quotes)) {
        const base = pair.split("/")[0].toUpperCase();
        const bid = Number(q.bp);
        const ask = Number(q.ap);
        if (bid > 0 && ask > 0) delayedQuotes.alpaca.set(base, { bid, ask, pair });
      }
    } catch {
      // One batch's silence is not the venue's.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { wanted: bases.length };
}

// Kraken writes bitcoin as XBT and dogecoin as XDG. The catalogues and this
// file name them BTC and DOGE, so the directory is translated before the
// ticker is asked for. USD is the deep leg; USDT / USDC are not stored.
const KRAKEN_PAIRS = "https://api.kraken.com/0/public/AssetPairs";
const KRAKEN_TICKER = "https://api.kraken.com/0/public/Ticker";
const KRAKEN_BASE = { XBT: "BTC", XXBT: "BTC", XDG: "DOGE", XXDG: "DOGE" };

function krakenBase(wsname, base) {
  const raw = String(wsname || "").split("/")[0] || String(base || "");
  const u = raw.toUpperCase();
  return KRAKEN_BASE[u] || u;
}

async function loadKraken(lines) {
  const pairs = (await (await fetchOk(KRAKEN_PAIRS, 60000)).json()).result || {};
  const usd = new Map();
  for (const [id, p] of Object.entries(pairs)) {
    const quote = String(p.wsname || "").split("/")[1] || "";
    if (quote !== "USD") continue;
    const base = krakenBase(p.wsname, p.base);
    if (base && !usd.has(base)) usd.set(base, { id, alt: p.altname || id });
  }
  const wanted = [...new Set(lines.map((l) => l.ticker))].filter((t) => usd.has(t));
  if (!wanted.length) return { listed: usd.size, wanted: 0 };
  const tickers =
    (
      await (
        await fetchOk(`${KRAKEN_TICKER}?pair=${wanted.map((t) => usd.get(t).alt).join(",")}`, 30000)
      ).json()
    ).result || {};
  for (const [id, q] of Object.entries(tickers)) {
    const ask = Number(q.a?.[0]);
    const bid = Number(q.b?.[0]);
    if (!(bid > 0) || !(ask > 0)) continue;
    const base = [...usd].find(([, v]) => v.id === id || v.alt === id)?.[0];
    if (base && wanted.includes(base)) delayedQuotes.kraken.set(base, { bid, ask, pair: id });
  }
  return { listed: usd.size, wanted: wanted.length };
}

// ------------------------------------------------------------------------- resolve

// Worth visiting when there is no figure yet, or when the last reading is old enough
// that another one would add something. Xetra publishes an average already, so once
// read it needs no resampling.
const jpxCode = (l) => String(l.ticker || "").split(":").pop().trim().toUpperCase();
function worthVisiting(l) {
  if (!l.source || !adapters[l.source]) return false;
  // The Tokyo file only prices ETFs. A share is not a missing touch.
  if (l.source === "tsej") {
    const hit = l.currency === "JPY" ? jpxSpread.get(jpxCode(l)) : null;
    if (!hit) return false;
    const leaf = leafOf(l);
    return REFRESH || leaf?.url !== hit.url;
  }
  if (l.source === "asx") {
    const hit = l.currency === "AUD" ? asxSpread.get(jpxCode(l)) : null;
    if (!hit) return false;
    const leaf = leafOf(l);
    return REFRESH || leaf?.url !== hit.url;
  }
  if (l.source === "nse") {
    const hit = l.currency === "INR" ? nseImpact.get(l.isin) : null;
    if (!hit) return false;
    const leaf = leafOf(l);
    return REFRESH || leaf?.url !== hit.url;
  }
  // An ETF or ETP whose day's average is already stored is not read again as a touch.
  if (l.source === "six") {
    const avg = sixMqm.get(`${l.isin}|${l.currency}`);
    if (avg) {
      const leaf = leafOf(l);
      return REFRESH || leaf?.url !== avg.url;
    }
  }
  // A place can be off limits for reasons outside this file — a page that has started
  // answering 503, say — and then the others should still be readable without it.
  if (ONLY.length && !ONLY.includes(l.source)) return false;
  if (REFRESH) return true;
  // A table already in hand costs nothing to consult, so it is consulted every run.
  // That is how a new month's figures reach the file without anyone asking.
  if (adapters[l.source].local) return true;
  const seen = state[stateKey(l)];
  if (!seen) return true;
  // A previous pass marked Xetra shares "settled" because the ETF workbook did not list
  // them. That was a false end: the socket quotes them, and an empty settled leaf must
  // not block the retry. A leaf that already holds a figure stays settled.
  if (seen.settled) {
    const leaf = leafOf(l);
    if (leaf?.bp != null || leaf?.perShare != null) return false;
    return true;
  }
  return Date.now() - (Date.parse(seen.at) || 0) > MIN_GAP_MIN * 60000;
}

if (!ONLY.length || ONLY.includes("six")) {
  await loadSixMqm();
  console.error(`SIX : moyenne de séance pour ${sixMqm.size} ETF et ETP`);
}
if (!ONLY.length || ONLY.includes("tsej")) {
  await loadJpxSpread();
  console.error(`Tokyo : moyenne mensuelle pour ${jpxSpread.size} ETF`);
}
if (!ONLY.length || ONLY.includes("asx")) {
  await loadAsxSpread();
  console.error(`ASX : moyenne mensuelle pour ${asxSpread.size} ETP`);
}
const auTouchOnly = ONLY.length === 1 && ONLY[0] === "au-touch";
let auTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("asx") || ONLY.includes("chia") || auTouchOnly) {
  auTouchStats = loadAuTouch();
  console.error(`Australie : ${auTouchStats.books} touches du carnet (${auTouchStats.at || "sans date"})`);
}
const sgxTouchOnly = ONLY.length === 1 && ONLY[0] === "sgx-touch";
let sgxTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("sgx") || sgxTouchOnly) {
  sgxTouchStats = loadSgxTouch();
  console.error(`Singapour : ${sgxTouchStats.books} touches du carnet (${sgxTouchStats.at || "sans date"})`);
}
const hkTouchOnly = ONLY.length === 1 && ONLY[0] === "hk-touch";
let hkTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("hk") || hkTouchOnly) {
  hkTouchStats = loadHkTouch();
  console.error(`Hong Kong : ${hkTouchStats.books} touches du carnet (${hkTouchStats.at || "sans date"})`);
}
const bursaTouchOnly = ONLY.length === 1 && ONLY[0] === "bursa-touch";
let bursaTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("bursa") || bursaTouchOnly) {
  bursaTouchStats = loadBursaTouch();
  console.error(`Bursa : ${bursaTouchStats.books} touches du carnet (${bursaTouchStats.at || "sans date"})`);
}
const pseTouchOnly = ONLY.length === 1 && ONLY[0] === "pse-touch";
let pseTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("pse") || pseTouchOnly) {
  pseTouchStats = loadPseTouch();
  console.error(`Manille : ${pseTouchStats.books} touches du carnet (${pseTouchStats.at || "sans date"})`);
}
const nagoyaTouchOnly = ONLY.length === 1 && ONLY[0] === "nagoya-touch";
let nagoyaTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("nagoya") || nagoyaTouchOnly) {
  nagoyaTouchStats = loadNagoyaTouch();
  console.error(`Nagoya : ${nagoyaTouchStats.books} touches du carnet (${nagoyaTouchStats.at || "sans date"})`);
}
const bvbTouchOnly = ONLY.length === 1 && ONLY[0] === "bvb-touch";
let bvbTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("bvb") || bvbTouchOnly) {
  bvbTouchStats = loadBvbTouch();
  console.error(`Bucarest : ${bvbTouchStats.books} touches du carnet (${bvbTouchStats.at || "sans date"})`);
}
const jseTouchOnly = ONLY.length === 1 && ONLY[0] === "jse-touch";
let jseTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("jse") || jseTouchOnly) {
  jseTouchStats = loadJseTouch();
  console.error(`Johannesburg : ${jseTouchStats.books} touches du carnet (${jseTouchStats.at || "sans date"})`);
}
const bymaTouchOnly = ONLY.length === 1 && ONLY[0] === "byma-touch";
let bymaTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("byma") || bymaTouchOnly) {
  bymaTouchStats = loadBymaTouch();
  console.error(`BYMA : ${bymaTouchStats.books} touches du carnet (${bymaTouchStats.at || "sans date"})`);
}
const bivaTouchOnly = ONLY.length === 1 && ONLY[0] === "biva-touch";
let bivaTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("biva") || bivaTouchOnly) {
  bivaTouchStats = loadBivaTouch();
  console.error(`BIVA : ${bivaTouchStats.books} touches du carnet (${bivaTouchStats.at || "sans date"})`);
}
const nairobiTouchOnly = ONLY.length === 1 && ONLY[0] === "nairobi-touch";
let nairobiTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("nairobi") || nairobiTouchOnly) {
  nairobiTouchStats = loadNairobiTouch();
  console.error(`Nairobi : ${nairobiTouchStats.books} touches du carnet (${nairobiTouchStats.at || "sans date"})`);
}
const ngxTouchOnly = ONLY.length === 1 && ONLY[0] === "ngx-touch";
let ngxTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("ngx") || ngxTouchOnly) {
  ngxTouchStats = loadNgxTouch();
  console.error(`Nigeria : ${ngxTouchStats.books} touches du carnet (${ngxTouchStats.at || "sans date"})`);
}
const bistTouchOnly = ONLY.length === 1 && ONLY[0] === "bist-touch";
let bistTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("bist") || bistTouchOnly) {
  bistTouchStats = loadBistTouch();
  console.error(`Istanbul : ${bistTouchStats.books} touches du carnet (${bistTouchStats.at || "sans date"})`);
}
const bvcTouchOnly = ONLY.length === 1 && ONLY[0] === "bvc-touch";
let bvcTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("bvc") || bvcTouchOnly) {
  bvcTouchStats = loadBvcTouch();
  console.error(`Colombie : ${bvcTouchStats.books} touches du carnet (${bvcTouchStats.at || "sans date"})`);
}
const setTouchOnly = ONLY.length === 1 && ONLY[0] === "set-touch";
let setTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("set") || setTouchOnly) {
  setTouchStats = loadSetTouch();
  console.error(`Thaïlande : ${setTouchStats.books} touches du carnet (${setTouchStats.at || "sans date"})`);
}
const xcasTouchOnly = ONLY.length === 1 && ONLY[0] === "xcas-touch";
let xcasTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("xcas") || xcasTouchOnly) {
  xcasTouchStats = loadXcasTouch();
  console.error(`Casablanca : ${xcasTouchStats.books} touches du carnet (${xcasTouchStats.at || "sans date"})`);
}
const taseTouchOnly = ONLY.length === 1 && ONLY[0] === "tase-touch";
let taseTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("tase") || taseTouchOnly) {
  taseTouchStats = loadTaseTouch();
  console.error(`Tel-Aviv : ${taseTouchStats.books} touches du carnet (${taseTouchStats.at || "sans date"})`);
}
const moexTouchOnly = ONLY.length === 1 && ONLY[0] === "moex-touch";
let moexTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("moex") || moexTouchOnly) {
  moexTouchStats = loadMoexTouch();
  console.error(`Moscou : ${moexTouchStats.books} touches du carnet (${moexTouchStats.at || "sans date"})`);
}
const psxTouchOnly = ONLY.length === 1 && ONLY[0] === "psx-touch";
let psxTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("psx") || psxTouchOnly) {
  psxTouchStats = loadPsxTouch();
  console.error(`Pakistan : ${psxTouchStats.books} touches du carnet (${psxTouchStats.at || "sans date"})`);
}
const csecyTouchOnly = ONLY.length === 1 && ONLY[0] === "csecy-touch";
let csecyTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("csecy") || csecyTouchOnly) {
  csecyTouchStats = loadCsecyTouch();
  console.error(`Chypre : ${csecyTouchStats.books} touches du carnet (${csecyTouchStats.at || "sans date"})`);
}
const sofiaTouchOnly = ONLY.length === 1 && ONLY[0] === "sofia-touch";
let sofiaTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("sofia") || sofiaTouchOnly) {
  sofiaTouchStats = loadSofiaTouch();
  console.error(`Sofia : ${sofiaTouchStats.books} touches du carnet (${sofiaTouchStats.at || "sans date"})`);
}
const vnTouchOnly = ONLY.length === 1 && ONLY[0] === "vn-touch";
let vnTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("hose") || ONLY.includes("upcom") || ONLY.includes("hnx") || vnTouchOnly) {
  vnTouchStats = loadVnTouch();
  console.error(`Vietnam : ${vnTouchStats.books} touches du carnet (${vnTouchStats.at || "sans date"})`);
}
const aqseTouchOnly = ONLY.length === 1 && ONLY[0] === "aqse-touch";
let aqseTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("aqse") || ONLY.includes("aquis") || aqseTouchOnly) {
  aqseTouchStats = loadAqseTouch();
  console.error(`AQSE : ${aqseTouchStats.books} touches du carnet (${aqseTouchStats.at || "sans date"})`);
}
const bequotedTouchOnly = ONLY.length === 1 && ONLY[0] === "bequoted-touch";
let bequotedTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("bequoted") || bequotedTouchOnly) {
  bequotedTouchStats = loadBequotedTouch();
  console.error(`beQuoted : ${bequotedTouchStats.books} touches du carnet (${bequotedTouchStats.at || "sans date"})`);
}
const ncTouchOnly = ONLY.length === 1 && ONLY[0] === "nc-touch";
let ncTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("newconnect") || ncTouchOnly) {
  ncTouchStats = loadNcTouch();
  console.error(`NewConnect : ${ncTouchStats.books} touches du carnet (${ncTouchStats.at || "sans date"})`);
}
const gcTouchOnly = ONLY.length === 1 && ONLY[0] === "gc-touch";
let gcTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("globalconnect") || ONLY.includes("xglo") || gcTouchOnly) {
  gcTouchStats = loadGcTouch();
  console.error(`GlobalConnect : ${gcTouchStats.books} touches du carnet (${gcTouchStats.at || "sans date"})`);
}
if (!ONLY.length || ONLY.includes("nse")) {
  await loadNseImpact();
  console.error(`NSE : impact cost moyen pour ${nseImpact.size} titres`);
}
const idxTouchOnly = ONLY.length === 1 && ONLY[0] === "idx-touch";
let idxTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("idx") || ONLY.includes("xidx") || idxTouchOnly) {
  idxTouchStats = loadIdxTouch();
  console.error(`Jakarta : ${idxTouchStats.books} touches du carnet (${idxTouchStats.at || "sans date"})`);
}
const kwTouchOnly = ONLY.length === 1 && ONLY[0] === "kw-touch";
let kwTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("kuwait") || ONLY.includes("xkuw") || kwTouchOnly) {
  kwTouchStats = loadKwTouch();
  console.error(`Koweït : ${kwTouchStats.books} touches du carnet (${kwTouchStats.at || "sans date"})`);
}
const ljTouchOnly = ONLY.length === 1 && ONLY[0] === "lj-touch";
let ljTouchStats = { books: 0 };
if (!ONLY.length || ONLY.includes("ljubljana") || ONLY.includes("xlju") || ONLY.includes("ljse") || ljTouchOnly) {
  ljTouchStats = loadLjTouch();
  console.error(`Ljubljana : ${ljTouchStats.books} touches du carnet (${ljTouchStats.at || "sans date"})`);
}

const todo =
  auTouchOnly || sgxTouchOnly || hkTouchOnly || bursaTouchOnly || pseTouchOnly || vnTouchOnly || idxTouchOnly || kwTouchOnly || ljTouchOnly || gcTouchOnly || nagoyaTouchOnly || bvbTouchOnly || jseTouchOnly || nairobiTouchOnly || bivaTouchOnly || bymaTouchOnly || ngxTouchOnly || bistTouchOnly || bvcTouchOnly || sofiaTouchOnly || csecyTouchOnly || setTouchOnly || psxTouchOnly || moexTouchOnly || taseTouchOnly || xcasTouchOnly || ncTouchOnly || bequotedTouchOnly || aqseTouchOnly
    ? []
    : [...listings.values()].filter(worthVisiting);
console.error(`${todo.length} à visiter, ${listings.size - todo.length} à jour\n`);

// The profiles come from a table already in hand, so every listing that has a value gets
// one, whether or not this run visits it. Nothing is pruned: a run given one broker's
// rows knows nothing about the funds only the other broker sells.
for (const l of listings.values()) {
  const shape = leafOf(l) && shapeOf(l);
  if (shape) shapes[`${l.isin}|${l.currency}`] = shape;
}

// Rewriting thousands of entries after every single listing costs more than the lookups
// do, so it lands in batches and once more at the end.
let done = 0;
const notes = new Map();
const flush = () => {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(
    STORE_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        unit: "spreads[ISIN][place][devise] = { bp, url } ou { perShare, url } : le coût d'un achat suivi d'une revente immédiate, pour un ordre de particulier. bp -> montant * bp / 10000 (places européennes, mesure en pourcentage). perShare -> parts * perShare (places américaines, spread effectif des rapports 605, en dollars par part, amélioration de prix comprise). url mène à la source. Le double pour le cas pessimiste (ordre internalisé, ou fonds peu liquide).",
        convention: CONVENTION,
        // The value above is the cost at the average hour of the session. Multiply it by
        // `session.shapes[ISIN|devise][i]` to get the cost during `session.slots[i]`,
        // which for a fund tracking American shares is worth doing: the last hours of the
        // German session overlap New York's open and cost half again as much.
        session: {
          slots: SLOTS,
          note: "multiple du coût moyen de la séance, par tranche de trente minutes, heure de Berlin. Source : iXLM mensuel de Deutsche Börse, mesuré sur Xetra et appliqué aux places européennes. Hors de la séance Xetra (soirée Tradegate / gettex / LS Exchange) le relevé n'est pas normalisé. null quand le mois n'a pas assez de transactions dans la tranche.",
          shapes,
        },
        spreads,
        state,
      },
      null,
      2
    )
  );
};

if (auTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${auTouchStats.books} touches australiennes écrites.`);
  process.exit(0);
}
if (sgxTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${sgxTouchStats.books} touches de Singapour écrites.`);
  process.exit(0);
}
if (hkTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${hkTouchStats.books} touches de Hong Kong écrites.`);
  process.exit(0);
}
if (bursaTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${bursaTouchStats.books} touches de Bursa écrites.`);
  process.exit(0);
}
if (pseTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${pseTouchStats.books} touches de Manille écrites.`);
  process.exit(0);
}
if (nagoyaTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${nagoyaTouchStats.books} touches de Nagoya écrites.`);
  process.exit(0);
}
if (bvbTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${bvbTouchStats.books} touches de Bucarest écrites.`);
  process.exit(0);
}
if (jseTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${jseTouchStats.books} touches de Johannesburg écrites.`);
  process.exit(0);
}
if (bymaTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${bymaTouchStats.books} touches de BYMA écrites.`);
  process.exit(0);
}
if (bivaTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${bivaTouchStats.books} touches de BIVA écrites.`);
  process.exit(0);
}
if (nairobiTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${nairobiTouchStats.books} touches de Nairobi écrites.`);
  process.exit(0);
}
if (ngxTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${ngxTouchStats.books} touches du Nigeria écrites.`);
  process.exit(0);
}
if (bistTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${bistTouchStats.books} touches d'Istanbul écrites.`);
  process.exit(0);
}
if (bvcTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${bvcTouchStats.books} touches de Colombie écrites.`);
  process.exit(0);
}
if (sofiaTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${sofiaTouchStats.books} touches de Sofia écrites.`);
  process.exit(0);
}
if (csecyTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${csecyTouchStats.books} touches de Chypre écrites.`);
  process.exit(0);
}
if (setTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${setTouchStats.books} touches de Thaïlande écrites.`);
  process.exit(0);
}
if (psxTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${psxTouchStats.books} touches du Pakistan écrites.`);
  process.exit(0);
}
if (moexTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${moexTouchStats.books} touches de Moscou écrites.`);
  process.exit(0);
}
if (taseTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${taseTouchStats.books} touches de Tel-Aviv écrites.`);
  process.exit(0);
}
if (xcasTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${xcasTouchStats.books} touches de Casablanca écrites.`);
  process.exit(0);
}
if (vnTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${vnTouchStats.books} touches du Vietnam écrites.`);
  process.exit(0);
}
if (idxTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${idxTouchStats.books} touches de Jakarta écrites.`);
  process.exit(0);
}
if (kwTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${kwTouchStats.books} touches du Koweït écrites.`);
  process.exit(0);
}
if (ljTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${ljTouchStats.books} touches de Ljubljana écrites.`);
  process.exit(0);
}
if (gcTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${gcTouchStats.books} touches de GlobalConnect écrites.`);
  process.exit(0);
}
if (ncTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${ncTouchStats.books} touches de NewConnect écrites.`);
  process.exit(0);
}
if (bequotedTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${bequotedTouchStats.books} touches de beQuoted écrites.`);
  process.exit(0);
}
if (aqseTouchOnly) {
  flush();
  console.error(`${STORE_PATH} : ${aqseTouchStats.books} touches d'AQSE écrites.`);
  process.exit(0);
}

async function visit(l, ownTab) {
  const adapter = adapters[l.source];
  console.error(`[${++done}/${todo.length}] ${l.ticker || l.isin} ${l.currency} @ ${l.exchange}`);

  const seen = state[stateKey(l)] || {};
  // A published average is already the cost at the average hour, so it is read with
  // the book shut and is not divided by the intraday shape. A touch snapshot only
  // means something while the book is open.
  const session = sessionState(l.venue);
  const touch = adapter.measure.startsWith("touche");
  const published = touch ? adapter.averageOf?.(l) : null;

  let measured;
  if (published) {
    measured = {
      spreadBp: published.bp,
      url: published.url,
      tradingCurrency: l.currency,
      family: "etf",
      published: true,
    };
  } else if (touch && session.open === false) {
    measured = { spreadBp: null, note: `marché fermé (${session.why}), non interrogé` };
  } else {
    try {
      measured = await adapter.fetch(l, ownTab);
    } catch (e) {
      measured = { spreadBp: null, note: `échec : ${String(e.message || e).slice(0, 80)}` };
    }
  }
  const snapshot = touch && !measured.published;
  // A currency the exchange disagrees with means the line measured is not the line
  // the broker sells. Pence and pounds are the same book quoted two ways, so only a
  // real disagreement counts.
  const said = measured.tradingCurrency?.toUpperCase();
  const sterling = new Set(["GBP", "GBX"]);
  const mismatch =
    said && said !== l.currency && !(sterling.has(said) && sterling.has(l.currency)) ? said : null;

  // Per-share sources are rounded finer because their whole range lives in thousandths
  // of a dollar: two decimals would round IAU's 0.0018 to nothing.
  // A crypto book is finer still: bitcoin's tick is a cent on seventy-seven thousand
  // dollars, which is thirteen ten-thousandths of a basis point. Two decimals turn that
  // into a zero, and the guard below then throws it out as a locked book.
  // A published percentage (the 30-day median, the ASX column) is basis points
  // even when the venue's other listings are stored in dollars per share.
  const quoted = measured.published && measured.spreadBp != null;
  const byShare = !quoted && adapter.unit === "perShare";
  const digits = adapter.digits ?? (byShare ? 5 : 2);
  const raw = byShare ? measured.perShare : measured.spreadBp;
  const reading = raw == null ? null : Number(raw.toFixed(digits));
  // A zero spread is an auction or a locked book, not a free trade, so it is not
  // allowed into the history. A non-positive effective spread says the month's fills
  // averaged at or better than the midpoint, which is a real thing to observe and still
  // not a cost to publish.
  const keep = reading != null && reading > 0;

  // Snapshot readings are values without dates, and only the last few are kept: enough
  // for a steady median, cheap enough to carry for thousands of listings. Their span is
  // bounded from the other end instead — a history nobody has added to in months
  // describes a book that has moved on, so it goes rather than averaging stale prints
  // into today's answer. An exchange that publishes its own average needs none of this.
  //
  // The half hour each reading came from travels beside it, in a parallel array rather
  // than folded into the value, so that the evidence stays as the exchange gave it and a
  // change to the shape re-derives the answer instead of compounding on it.
  const stale = Date.parse(seen.at) < Date.now() - READING_DAYS * 86400000;
  const readings = snapshot && !stale ? [...(seen.bp || [])] : [];
  const slots = snapshot && !stale ? [...(seen.slot || [])] : [];
  // A history from before the slots were recorded gets nulls rather than a guess, which
  // simply leaves those readings unnormalised.
  while (slots.length < readings.length) slots.unshift(null);
  if (snapshot && keep) {
    readings.push(reading);
    slots.push(slotOf());
  }
  while (readings.length > READING_KEEP) {
    readings.shift();
    slots.shift();
  }

  // What the source says: a median of in-session readings for the snapshot venues, the
  // published average for the monthly ones. Each reading is first brought back to the
  // average hour of the session by its own half hour's multiple, so that three readings
  // taken at noon and one at half past three describe the same day rather than four
  // different ones. Converted on the way out and only there, so the history above stays
  // comparable with the exchange's own page.
  const shape = snapshot ? shapeOf(l) : null;
  const atAverageHour = (v, i) => {
    const factor = shape?.[slots[i]];
    return factor > 0 ? v / factor : v;
  };
  const average = snapshot
    ? readings.length
      ? median(readings.map(atAverageHour))
      : null
    : reading;
  // The page is built from what the fetch found out about the line, not from the ISIN
  // alone, because a share and a fund live in different sections of the same site.
  const page = measured.url ?? spreadUrl({ ...l, family: measured.family });
  const cost =
    average == null || average <= 0
      ? null
      : byShare
        ? { perShare: Number(average.toFixed(5)), url: page }
        : { bp: Number((average * CROSSED[l.source]).toFixed(digits)), url: page };
  publish(l, cost ?? (stale ? null : leafOf(l)));
  if (shape) shapes[`${l.isin}|${l.currency}`] = shape;

  const remember = {
    bp: readings.length ? readings : undefined,
    // Parallel to `bp`: which half hour of the session each of those readings came from.
    slot: slots.some((s) => s != null) ? slots : undefined,
    // Dates the reading, not the attempt: stamping this with the moment a fetch failed
    // would both read as freshness and hold off the retry that is due.
    at: keep ? new Date().toISOString() : seen.at,
    // Marks an empty answer the venue itself gave, as opposed to one we failed to
    // obtain, so no retry is spent on it.
    settled: measured.settled || seen.settled || undefined,
  };
  // A listing there is nothing to remember about — asked while the book was shut, say —
  // leaves no trace, rather than an empty object to be scrolled past.
  if (Object.values(remember).some((v) => v !== undefined)) state[stateKey(l)] = remember;
  else delete state[stateKey(l)];

  // Notes belong to the attempt, so they are reported and not written: kept in the file
  // they would sit beside a good average describing something else entirely.
  if (measured.note) notes.set(l.key, measured.note);
  console.error(
    `    ${shown(l)}` +
      `${snapshot && readings.length ? ` (médiane de ${readings.length} relevé${readings.length > 1 ? "s" : ""})` : ""}` +
      `  ${measured.note || ""}${mismatch ? ` (la bourse dit ${mismatch})` : ""}`
  );

  if (done % 500 === 0) flush();
}

// A source that can answer for many listings at once does so here, before the loop, and
// its per-listing call becomes a lookup. Xetra is the only one so far, and the difference
// is a pass of seconds against a pass of hours.
const prepared = new Set();
for (const l of todo) {
  const adapter = adapters[l.source];
  if (!adapter.prefetch || prepared.has(l.source)) continue;
  prepared.add(l.source);
  const mine = todo.filter((x) => x.source === l.source);
  console.error(`${l.venue.name} : ${mine.length} cotations demandées d'un coup`);
  let bulkTab = null;
  await adapter.prefetch(mine, async () => (bulkTab ||= await tab()));
}

// Each worker keeps its own tab, opened on first need, so a run that touches only the
// HTTP sources never starts a browser at all.
const queue = todo[Symbol.iterator]();
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async () => {
    let mine = null;
    const ownTab = async () => (mine ||= await tab());
    for (const l of queue) await visit(l, ownTab);
  })
);
flush();

for (const p of pages) await p.close().catch(() => {});
if (connecting) await (await connecting).disconnect();

// -------------------------------------------------------------------- the summary

const sourced = [...listings.values()];
const withBp = sourced.filter((l) => leafOf(l) != null);
const thin = sourced.filter((l) => state[stateKey(l)]?.bp?.length === 1);

console.log(
  `\n${withBp.length}/${sourced.length} cotations sourçables ont une valeur` +
    `${thin.length ? `, dont ${thin.length} sur un seul relevé` : ""}\n`
);
console.log("ticker   dev   place                       coût a-r relevés  source");
console.log("-".repeat(118));
for (const l of sourced.sort((a, b) => a.exchange.localeCompare(b.exchange))) {
  const leaf = leafOf(l);
  console.log(
    `${String(l.ticker || l.isin).padEnd(8)} ${l.currency.padEnd(5)} ` +
      `${l.exchange.slice(0, 24).padEnd(25)} ` +
      `${shown(l).padStart(13)}  ` +
      `${String(state[stateKey(l)]?.bp?.length ?? "moy.").padStart(7)}  ` +
      `${leaf ? leaf.url : notes.get(l.key) || "jamais relevé"}`
  );
}

const unsourced = Object.values(gaps).reduce((n, g) => n + g.cotations, 0);
if (unsourced) {
  console.log(`\nsans source (${unsourced}) :`);
  for (const [why, g] of Object.entries(gaps).sort((a, b) => b[1].cotations - a[1].cotations)) {
    console.log(`  ${String(g.cotations).padStart(4)}x  ${why}   ex. ${g.exemples.join(", ")}`);
  }
}

console.log(
  `\n${STORE_PATH} : ${Object.keys(spreads).length} ISIN, ` +
    `${(fs.statSync(STORE_PATH).size / 1024).toFixed(0)} Ko`
);
