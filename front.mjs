// A search over every broker catalogue at once: type a ticker, an ISIN or a name
// and see who actually lists it. The page lives at the root because the answer is
// a fact about the instrument, not about any one broker.
//
//   node front.mjs
//   node front.mjs --port=3470

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { catalogueFiles } from "./catalogues.mjs";
import { resolveVenue } from "./venues.mjs";
import { accepts, countryOptions, listingAccepts, stampResidency, EEA, EU, GCC } from "./accepted.mjs";
import { toUsd, usdPer } from "./fx.mjs";
import { prices, ensureFresh } from "./prices.mjs";

const PORT = (() => {
  const m = process.argv.find((a) => a.startsWith("--port="));
  return m ? Number(m.split("=")[1]) : 3470;
})();

const HTML = new URL("front.html", import.meta.url);
const LIST = new URL("broker-list.txt", import.meta.url);

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function prettyFolder(folder) {
  return folder
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\d+)/g, " $1 ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function loadBrokerMeta() {
  const rows = [];
  if (fs.existsSync(LIST)) {
    for (const line of fs.readFileSync(LIST, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [name, country, type, , url] = line.split("\t");
      if (!name || name === "name") continue;
      rows.push({
        name,
        country: country || "",
        type: type || "",
        url: url || "",
      });
    }
  }
  return rows;
}

const FOLDER_NAME = {
  saxo: "Saxo Bank",
  bhmuae: "BHM Capital",
  bunq: "Bunq",
  century: "Century Financial",
  boursobank: "BoursoBank",
  alramz: "Al Ramz Capital",
  tastytrade: "Tastytrade",
  bux: "BUX",
  davy: "Davy Select",
  oanda: "OANDA TMS",
  plum: "Plum",
  easyequities: "EasyEquities",
  efocs: "EuroFinance",
  elana: "Elana Trading",
  siebert: "Siebert Financial",
  sogotrade: "SogoTrade",
  swissquote: "Swissquote",
  thndr: "Thndr",
  tiger: "Tiger Brokers",
  traderepublic: "Trade Republic",
  tradestation: "TradeStation",
  tradeup: "TradeUP",
  tradezero: "TradeZero",
  tradier: "Tradier",
  vested: "Vested Finance",
  vivid: "Vivid Money",
  webull: "Webull",
  WHSelfInvest: "WH SelfInvest",
  xtb: "XTB",
  fortuneo: "Fortuneo",
  lynx: "LYNX+",
};

function metaFor(folder, list) {
  const aliased = FOLDER_NAME[folder];
  if (aliased) {
    const hit = list.find((row) => row.name === aliased) || list.find((row) => slug(row.name) === slug(aliased));
    if (hit) return { ...hit, name: aliased };
    return { name: aliased, country: "", type: "", url: "" };
  }
  const s = slug(folder);
  const exact = list.find((row) => slug(row.name) === s);
  if (exact) return exact;
  // Prefix only: "boursobank" contains "sob" (from ČSOB) and "tiger" contains "ig".
  let best = null;
  for (const row of list) {
    const n = slug(row.name);
    if (n.length < 4 && s.length < 4) continue;
    if (n.startsWith(s) || (s.startsWith(n) && n.length >= 4)) {
      if (!best || n.length < slug(best.name).length) best = row;
    }
  }
  return best || { name: prettyFolder(folder), country: "", type: "", url: "" };
}

const list = loadBrokerMeta();
const brokers = new Map();
const instruments = new Map();

function cryptoPair(ticker, currency) {
  const raw = String(ticker || "").trim().toUpperCase();
  const quote = String(currency || "").trim().toUpperCase();
  const m = raw.match(/^([A-Z0-9]+)[/:_-]([A-Z0-9]+)$/);
  if (m) return { base: m[1], quote: quote || m[2], raw };
  return { base: raw, quote, raw };
}

function instrumentKey(row) {
  const type = String(row.type || "").trim().toUpperCase() || "OTHER";
  if (type === "CRYPTO") {
    const { base } = cryptoPair(row.ticker || row.query, row.currency);
    return base ? `CRYPTO:${base}` : "";
  }
  const isin = String(row.isin || "").trim().toUpperCase();
  if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) return isin;
  const ticker = String(row.ticker || row.query || "").trim().toUpperCase();
  if (!ticker) return "";
  return `${type}:${ticker}`;
}

const UNSOURCED_EN = {
  "Euronext, place non précisée": "Euronext",
  "places américaines, sans précision": "US (unspecified)",
  "ATS canadiennes": "Canadian ATS",
  "B3 São Paulo": "B3 São Paulo",
  B3: "B3 São Paulo",
  "TSE (Toronto ou Tokyo)": "TSE (Toronto or Tokyo)",
};

function displayExchange(raw, extra = {}) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const { venue, unsourced } = resolveVenue({ exchange: text, ...extra });
  if (venue) return venue.name;
  if (unsourced?.name) return UNSOURCED_EN[unsourced.name] || unsourced.name;
  return text;
}

function addName(set, counts, value) {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  if (!name || name === "0" || name.length <= 1) return;
  set.add(name);
  counts.set(name, (counts.get(name) || 0) + 1);
}

// Which currency a coin is paid in, per broker. Most impose one — eToro's account
// is a dollar account, Trade Republic's a euro one — and that is a fact the row
// should state. A broker whose crypto shelf is quoted in several currencies is not
// imposing any, and naming one of them would read as a restriction it does not have.
const cryptoCcys = new Map();

// Revolut quotes its whole shelf in euro and still takes any balance the account
// holds: the €100 USDC ticket of 2026-09-12 was paid in euro on a coin quoted in
// dollars. The catalogue cannot show that, so it is declared.
const ANY_CURRENCY = new Set(["revolut"]);
const imposesCurrency = (folder) =>
  !ANY_CURRENCY.has(folder) && (cryptoCcys.get(folder)?.size ?? 0) === 1;

console.error("indexation des catalogues…");
const t0 = Date.now();
let listings = 0;
for (const file of catalogueFiles()) {
  const folder = file.split("/").slice(-2, -1)[0];
  if (!brokers.has(folder)) brokers.set(folder, { folder, ...metaFor(folder, list) });
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows || parsed.instruments || [];
  for (const row of rows) {
    const key = instrumentKey(row);
    if (!key) continue;
    listings += 1;
    let inst = instruments.get(key);
    if (!inst) {
      inst = {
        key,
        isin: /^[A-Z]{2}[A-Z0-9]{10}$/.test(key) ? key : "",
        isins: new Set(/^[A-Z]{2}[A-Z0-9]{10}$/.test(key) ? [key] : []),
        tickers: new Set(),
        tickerCounts: new Map(),
        names: new Set(),
        nameCounts: new Map(),
        types: new Set(),
        byBroker: new Map(),
      };
      instruments.set(key, inst);
    }
    const type = String(row.type || "").trim().toUpperCase();
    const pair = type === "CRYPTO" ? cryptoPair(row.ticker || row.query, row.currency) : null;
    if (pair?.quote) {
      if (!cryptoCcys.has(folder)) cryptoCcys.set(folder, new Set());
      cryptoCcys.get(folder).add(pair.quote);
    }
    const ticker = pair ? pair.base : String(row.ticker || "").trim().toUpperCase();
    const rowIsin = String(row.isin || "").trim().toUpperCase();
    if (ticker) {
      inst.tickers.add(ticker);
      inst.tickerCounts.set(ticker, (inst.tickerCounts.get(ticker) || 0) + 1);
    }
    if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(rowIsin)) inst.isins.add(rowIsin);
    addName(inst.names, inst.nameCounts, row.name);
    addName(inst.names, inst.nameCounts, row.label);
    if (row.type) inst.types.add(String(row.type).toUpperCase());
    const exchangeRaw = String(row.exchange || "").trim();
    const listing = {
      ticker: ticker || String(row.query || ""),
      query: pair?.raw || String(row.ticker || row.query || ""),
      name: String(row.name || row.label || "").trim(),
      exchange: displayExchange(exchangeRaw, { currency: row.currency, isin: row.isin }),
      exchangeRaw,
      currency: pair ? pair.quote || String(row.currency || "").trim() : String(row.currency || "").trim(),
      type: String(row.type || "").trim(),
      isin: rowIsin,
    };
    if (row.nonEuResident) listing.nonEuResident = true;
    if (row.nonUkResident) listing.nonUkResident = true;
    // Robinhood's catalogue marks with `usOnly` the lines missing from Robinhood
    // Europe's stock-token list. That is not "US residents only": the British
    // company sells the same American share. It is `nonEuResident` (EEA). A
    // packaged US/AU/CH line also gets `nonUkResident` in `stampResidency`.
    if (row.usOnly) listing.nonEuResident = true;
    stampResidency(listing);
    if (row.usResidentsOnly) listing.usResidentsOnly = true;
    if (row.indianOnly) listing.indianOnly = true;
    if (row.cfd) listing.cfd = true;
    if (Array.isArray(row.supportedCountries)) listing.supportedCountries = row.supportedCountries;
    const held = inst.byBroker.get(folder) || [];
    const dup = held.some(
      (h) =>
        h.ticker === listing.ticker &&
        h.exchange === listing.exchange &&
        h.currency === listing.currency
    );
    if (!dup) held.push(listing);
    inst.byBroker.set(folder, held);
  }
}
console.error(
  `${instruments.size} instruments, ${listings} cotations, ${brokers.size} brokers en ${Date.now() - t0} ms`
);

const NA = "N/A";
// Two contracts live side by side while the shelf is walked broker by broker.
// `roundTrip` is the one the page prints: it takes the size of the trade and
// answers one number, so a rule that is not affine — a cap, a tier, a ticket
// that only bites past a threshold — is the estimator's business and not the
// page's. `roundTripCost` is the old affine triple, still read here for what it
// says about the listing itself (the place, the settlement currency, whether
// the line can be bought online at all) but no longer for a price. A broker
// with no `roundTrip` yet answers N/A in the cost column and keeps every other
// column it had.
const estimators = new Map();
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
for (const folder of brokers.keys()) {
  const file = path.join(ROOT_DIR, folder, `${folder}_cost.mjs`);
  if (!fs.existsSync(file)) continue;
  try {
    const mod = await import(pathToFileURL(file));
    const entry = {
      total: typeof mod.roundTrip === "function" ? mod.roundTrip : null,
      abc: typeof mod.roundTripCost === "function" ? mod.roundTripCost : null,
    };
    if (entry.total || entry.abc) estimators.set(folder, entry);
  } catch (err) {
    console.error(`estimateur ${folder} : ${err.message}`);
  }
}
const migrated = [...estimators].filter(([, e]) => e.total).map(([folder]) => folder);
console.error(
  `estimateurs : ${[...estimators.keys()].join(", ") || "aucun"}`
);
console.error(
  `coût total : ${migrated.length ? migrated.join(", ") : "aucun broker migré"}` +
    ` (${estimators.size - migrated.length} encore en N/A)`
);

// How many of the thing the reader is buying. Shares for anything with a share
// price, dollars for a coin — a coin has no unit worth naming, and ten bitcoin
// is not a question anyone asks.
const SHARES_DEFAULT = 10;
const AMOUNT_DEFAULT = 1000;

// A price is not a fact about a broker, so it sits at the root with the other
// facts about the market. Unlike the spread it barely moves from one venue to
// the next — arbitrage sees to that — so the key is the ISIN and the currency
// it is quoted in, which the page knows before it calls anyone. That the venue
// is absent from the key is also what keeps this lookup out of the circle: the
// MIC is resolved inside each cost file, after this.
// The store belongs to `prices.mjs`, which is also the only thing that writes it, so
// the page reads the same live object rather than a copy of the file taken at boot —
// a copy would go stale the moment a lookup refreshed something.
console.error(
  Object.keys(prices).length
    ? `${Object.keys(prices).length} ISIN ont déjà un prix en cache`
    : "aucun prix en cache : le premier affichage de chaque instrument ira le chercher"
);

// A price read in euros is the same price as the one asked for in dollars, at a rate
// this repository already applies to every fee it prints. So a Nasdaq line with no
// American reading is answered from the euro book that quotes the same ISIN in
// Frankfurt — which is most of the large American names, and none of the small ones.
// `fx.mjs` knows pence apart from pounds, so London converts without a factor of a
// hundred going astray. Where several currencies were read, the most corroborated wins:
// seven German books agreeing beats one thin foreign print.
function priceOf(isin, currency) {
  const byCcy = prices[String(isin || "").trim().toUpperCase()];
  const ccy = String(currency || "").trim().toUpperCase();
  if (!byCcy) return null;
  const exact = Number(byCcy[ccy]?.price);
  if (Number.isFinite(exact) && exact > 0) return exact;
  const per = usdPer(ccy);
  if (!(per > 0)) return null;
  const ranked = Object.entries(byCcy).sort(
    (a, b) => Object.keys(b[1]?.from || {}).length - Object.keys(a[1]?.from || {}).length
  );
  for (const [had, leaf] of ranked) {
    const usd = toUsd(Number(leaf?.price), had);
    if (usd > 0) return usd / per;
  }
  return null;
}

function fmtUsd(n) {
  if (n == null || !Number.isFinite(Number(n))) return NA;
  const x = Number(n);
  if (x === 0) return "0";
  return String(Number(x.toFixed(2)));
}

// What the page keeps from a cost object once the three affine columns are
// gone: the total when the estimator can give one, and the facts about the
// listing that no catalogue carries. The remark is passed through whole —
// `min fees` used to be lifted out of it into a column of its own, and with
// that column gone the sentence belongs back where its author wrote it.
function formatTotal(cost, usd) {
  return {
    total: fmtUsd(usd),
    // The same trip, counting only what the broker bills. Printed beside the
    // total so that a remark cannot be misread: « 3 free trades » waives the
    // commission and leaves the spread, the stamp duty and the regulator's
    // levies exactly where they were. A broker still on the old contract has no
    // such figure and says N/A here as it does for the total.
    fees: fmtUsd(cost?.brokerFees),
    remark: String(cost?.remark || "").trim(),
    buyable: cost?.onlineBuy !== false,
    venueExchange: displayExchange(cost?.listing?.exchange || "", {
      mic: cost?.listing?.mic,
      currency: cost?.listing?.currency,
      isin: cost?.listing?.isin,
    }),
    venueCurrency: String(cost?.listing?.currency || "").trim().toUpperCase(),
    // Normally the catalogue names the venue and the estimator only fills a gap.
    // An estimator may know better: N26's catalogue venue is a csv pick made by
    // its own scraper, while Upvest publishes the four places it can actually
    // reach. Where a cost file says so, its venue wins — a false venue is worse
    // than an absent one.
    venueAuthoritative: cost?.venueAuthoritative === true,
    cashCurrency: String(cost?.cashCurrency || "").trim().toUpperCase(),
  };
}

// `nat` travels with the rest. Most brokers are one company and ignore it;
// Robinhood is three, and which one serves the reader is decided by residency
// alone — an American share, a British one plus its conversion, or a Lithuanian
// derivative over the same line.
const EMPTY_ROW = { total: NA, fees: NA, remark: "", buyable: true, venueExchange: "", venueCurrency: "", cashCurrency: "", venueAuthoritative: false };

function estimateListing(folder, listing, inst, extra = {}, size = {}) {
  const entry = estimators.get(folder);
  if (!entry) return { ...EMPTY_ROW };
  const crypto = inst.key.startsWith("CRYPTO:");
  const ask = {
    etf: crypto ? listing.query || listing.ticker : listing.isin || inst.isin || listing.ticker,
    place: listing.exchangeRaw || listing.exchange || "",
    currency: listing.currency || "",
    ...extra,
  };
  // A coin is bought by the dollar, a share by the unit at a price. The
  // estimator is handed whichever pair describes the trade, and nothing else:
  // how the two turn into a bill is the whole point of moving it in there.
  const trade = crypto
    ? { amount: size.amount ?? AMOUNT_DEFAULT }
    : {
        shares: size.shares ?? SHARES_DEFAULT,
        price: priceOf(listing.isin || inst.isin, listing.currency),
      };
  try {
    if (entry.total) {
      let cost = entry.total({ ...ask, ...trade });
      // OCR catalogues (Plum) name no currency. The estimator still knows the
      // tape, so a first call without a price is enough to learn it and look
      // the quote up under the right key — otherwise the row stays N/A.
      if (!crypto && !(trade.price > 0) && cost?.listing?.currency) {
        const price = priceOf(listing.isin || inst.isin, cost.listing.currency);
        if (price > 0) {
          cost = entry.total({ ...ask, shares: trade.shares, price });
        }
      }
      return formatTotal(cost, cost?.usd);
    }
    // Not migrated yet: the old file still knows where the line trades and in
    // what, which is three of the columns. Only the price is withheld.
    return formatTotal(entry.abc ? entry.abc(ask) : null, null);
  } catch {
    return { ...EMPTY_ROW };
  }
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = "";
  let n = 0;
  for (const [v, c] of counts) {
    if (c > n || (c === n && v.length > best.length)) {
      best = v;
      n = c;
    }
  }
  return best;
}

function preferredName(inst) {
  let best = "";
  let n = 0;
  for (const [name, count] of inst.nameCounts) {
    // Frequency first. On a tie, the shorter name: one mislabelled listing
    // ("Morgan Stanley Emerging Markets Fund" on Microsoft's ISIN) must not win.
    if (count > n || (count === n && (!best || name.length < best.length))) {
      best = name;
      n = count;
    }
  }
  return best;
}

function preferredTicker(inst, hint) {
  const H = String(hint || "").trim().toUpperCase();
  if (H && inst.tickers.has(H)) return H;
  let best = "";
  let n = 0;
  for (const [ticker, count] of inst.tickerCounts) {
    const bare = !ticker.includes(".");
    const bestBare = !best.includes(".");
    if (count > n || (count === n && bare && !bestBare) || (count === n && ticker.length < best.length)) {
      best = ticker;
      n = count;
    }
  }
  return best;
}

// A share listed in Paris and the same name on Alpha are one instrument.
// Brokers file a local ISIN (CDR, CUSIP wrapper) per venue; grouping by
// ISIN alone split them. Stocks that share a ticker stem and an issuer
// name — after stripping CDR / legal suffix — are folded together. Funds
// stay on their ISIN: two VWCE share classes must not collapse.
// A B3 class code (EMBJ3) is a different security from the NYSE ADR (EMBJ):
// another ISIN and another price, not the same line in another currency.
function issuerStem(name) {
  return String(name || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(
      /\b(CDR|GDR|ADR|ADS|INC|INCORPORATED|SA|S A|SE|NV|N V|PLC|LTD|LIMITED|CORP|CORPORATION|CO|AG|SPA|S P A|THE|AND|CLASS|CL|ORD|REGISTERED|COMMON|STOCK|SHARES)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function tickerStem(ticker) {
  return String(ticker || "")
    .toUpperCase()
    .replace(/\.[A-Z]{1,4}$/, "");
}

function clusterTokens(inst) {
  const type = mostCommon(inst.types);
  if (type !== "STOCK") return [];
  const issuer = issuerStem(preferredName(inst));
  if (issuer.length < 2) return [];
  const out = [];
  for (const ticker of inst.tickers) {
    const stem = tickerStem(ticker);
    if (stem) out.push(`${type}:${stem}:${issuer}`);
  }
  return out;
}

function absorbInstrument(into, from) {
  for (const [ticker, count] of from.tickerCounts) {
    into.tickers.add(ticker);
    into.tickerCounts.set(ticker, (into.tickerCounts.get(ticker) || 0) + count);
  }
  for (const [name, count] of from.nameCounts) {
    into.names.add(name);
    into.nameCounts.set(name, (into.nameCounts.get(name) || 0) + count);
  }
  for (const type of from.types) into.types.add(type);
  for (const id of from.isins) into.isins.add(id);
  for (const [folder, listingsOf] of from.byBroker) {
    const held = into.byBroker.get(folder) || [];
    for (const listing of listingsOf) {
      const dup = held.some(
        (h) =>
          h.ticker === listing.ticker &&
          h.exchange === listing.exchange &&
          h.currency === listing.currency
      );
      if (!dup) held.push(listing);
    }
    into.byBroker.set(folder, held);
  }
}

const aliases = new Map();

{
  const parent = new Map();
  const find = (k) => {
    const p = parent.get(k);
    if (!p || p === k) return k;
    const root = find(p);
    parent.set(k, root);
    return root;
  };
  const unite = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const buckets = new Map();
  for (const inst of instruments.values()) {
    parent.set(inst.key, inst.key);
    for (const token of clusterTokens(inst)) {
      const held = buckets.get(token) || [];
      held.push(inst.key);
      buckets.set(token, held);
    }
  }
  for (const keys of buckets.values()) {
    for (let i = 1; i < keys.length; i += 1) unite(keys[0], keys[i]);
  }

  const members = new Map();
  for (const inst of instruments.values()) {
    const root = find(inst.key);
    const list = members.get(root) || [];
    list.push(inst);
    members.set(root, list);
  }

  let folded = 0;
  for (const group of members.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.byBroker.size - a.byBroker.size || b.isins.size - a.isins.size || a.key.localeCompare(b.key));
    const primary = group[0];
    for (const extra of group.slice(1)) {
      absorbInstrument(primary, extra);
      aliases.set(extra.key, primary.key);
      instruments.delete(extra.key);
      folded += 1;
    }
    if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(primary.key)) primary.isin = primary.key;
  }
  if (folded) console.error(`${folded} stock ISINs folded into a shared listing`);
}

function brokerFolder(folder) {
  return String(folder || "").split(":")[0];
}

function acceptsNat(folder, nat) {
  const meta = brokers.get(brokerFolder(folder));
  return accepts(brokerFolder(folder), nat, meta?.country);
}

function listingOpen(listing, nat) {
  return listingAccepts(listing, nat);
}

function visibleBrokers(inst, nat) {
  let n = 0;
  for (const [folder, listingsOf] of inst.byBroker) {
    if (!acceptsNat(folder, nat)) continue;
    if (listingsOf.some((listing) => listingOpen(listing, nat))) n += 1;
  }
  return n;
}

function summarize(inst, hint = "", nat = "") {
  return {
    key: inst.key,
    isin: inst.isin,
    ticker: preferredTicker(inst, hint),
    name: preferredName(inst),
    type: mostCommon(inst.types),
    brokers: visibleBrokers(inst, nat),
  };
}

function isWholeWord(text, q, i) {
  const after = i + q.length;
  if (i > 0 && /[A-Z0-9]/.test(text[i - 1])) return false;
  if (after < text.length && /[A-Z0-9]/.test(text[after])) return false;
  return true;
}

// Everything scoring needs that does not depend on the query, worked out once.
// Every keystroke walks all sixty-odd thousand instruments, so rebuilding a Set
// and upper-casing a name inside that walk was most of what a search cost.
function searchable(inst) {
  if (!inst.searchKeys) {
    inst.searchKeys = {
      isins: inst.isins?.size ? [...inst.isins] : inst.isin ? [inst.isin] : [],
      tickers: [...inst.tickers],
      name: preferredName(inst).toUpperCase(),
    };
  }
  return inst.searchKeys;
}

function score(inst, Q) {
  const { isins, tickers, name: N } = searchable(inst);
  let s = 0;
  for (const id of isins) {
    if (id === Q) s = Math.max(s, 120);
    else if (Q.length >= 3 && id.startsWith(Q)) s = Math.max(s, 85);
    // Length first: a substring scan of every ISIN is wasted on a query too
    // short to earn the points anyway.
    else if (Q.length >= 6 && id.includes(Q)) s = Math.max(s, 55);
  }
  for (const t of tickers) {
    if (t === Q) s = Math.max(s, 110);
    else if (Q.length >= 3 && t.startsWith(Q)) s = Math.max(s, 75);
  }
  if (Q.length >= 2) {
    if (N === Q) s = Math.max(s, 100);
    else if (Q.length >= 3 && N.startsWith(Q)) s = Math.max(s, 50);
    else if (Q.length >= 3) {
      let i = 0;
      while ((i = N.indexOf(Q, i)) !== -1) {
        if (isWholeWord(N, Q, i)) {
          s = Math.max(s, 35);
          break;
        }
        i += 1;
      }
    }
  }
  return s;
}

function search(q, limit = 20, nat = "") {
  const query = String(q || "").trim();
  if (query.length < 1) return [];
  // Normalised once rather than once per instrument.
  const raw = query.toUpperCase();
  const { base } = cryptoPair(raw, "");
  const Q = base && base !== raw ? base : raw;
  const hits = [];
  for (const inst of instruments.values()) {
    const s = score(inst, Q);
    if (s <= 0) continue;
    const n = visibleBrokers(inst, nat);
    if (n <= 0) continue;
    hits.push({ s, brokers: n, inst });
  }
  hits.sort((a, b) => b.s - a.s || b.brokers - a.brokers);
  return hits.slice(0, limit).map((h) => summarize(h.inst, query, nat));
}

function resolve(key) {
  const k = String(key || "").trim().toUpperCase();
  if (!k) return null;
  const exact = instruments.get(k) || instruments.get(aliases.get(k));
  if (exact) return exact;
  let best = null;
  let bestScore = 0;
  for (const inst of instruments.values()) {
    if (!inst.tickers.has(k) && inst.isin !== k && !inst.isins?.has(k)) continue;
    const s = (inst.tickers.has(k) ? 10 : 0) + inst.byBroker.size;
    if (s > bestScore) {
      best = inst;
      bestScore = s;
    }
  }
  return best;
}

const EASYBOURSE_PLANS = [
  { id: "premium", name: "EasyBourse Découverte / Premium" },
  { id: "expert", name: "EasyBourse Expert" },
  { id: "intense", name: "EasyBourse Intense" },
];

// Core is left out: it trades at the same 0,99 % as Free and only adds a
// subscription, so it can never be the cheaper row. Pro and Elite earn their
// place by cutting the rate.
const BUNQ_PLANS = [
  { id: "free", name: "Bunq Free" },
  { id: "pro", name: "Bunq Pro" },
  { id: "elite", name: "Bunq Elite" },
];

const BOURSOBANK_PLANS = [
  { id: "decouverte", name: "BoursoBank Découverte" },
  { id: "classic", name: "BoursoBank Classic" },
  { id: "trader", name: "BoursoBank Trader" },
  { id: "ultimate", name: "BoursoBank Ultimate Trader" },
];

const FORTUNEO_PLANS = [
  { id: "starter", name: "Fortuneo Starter" },
  { id: "progress", name: "Fortuneo Progress" },
  { id: "traderpro", name: "Fortuneo Trader Pro" },
];

const ETORO_PLANS = [
  { id: "us", name: "eToro US" },
  { id: "standard", name: "eToro" },
  { id: "anz", name: "eToro Australia / New Zealand" },
  { id: "uk", name: "eToro UK / Ireland" },
];

function etoroOpen(plan, nat) {
  const n = String(nat || "").trim().toUpperCase();
  if (!n) return true;
  if (n === "US") return plan === "us";
  if (n === "CA") return false;
  if (n === "AU" || n === "NZ") return plan === "anz";
  if (n === "GB" || n === "IE") return plan === "uk";
  return plan === "standard";
}

function collapseEtoro(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find(
      (g) =>
        sameTripListings(g.listings, row.listings) &&
        g.listings.every((l, i) => l.remark === row.listings[i].remark)
    );
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    const ids = g.members.map((m) => m.plan);
    return {
      ...g.members[0],
      folder: `etoro:${ids.join("-")}`,
      family: "eToro",
      name: "eToro",
      plan: "",
      planRank: 0,
    };
  });
}

const BUX_PLANS = [
  { id: "basic", name: "BUX Basic" },
  { id: "plus", name: "BUX Plus" },
  { id: "prime", name: "BUX Prime" },
];

const DAVY_PLANS = [
  { id: "pia", name: "Davy Select PIA" },
  { id: "io", name: "Davy Select Investment Only" },
  { id: "tradingplus", name: "Davy Select Trading Plus" },
];

const FREEDOM24_PLANS = [
  { id: "smart", name: "Freedom24 Smart" },
  { id: "allinc", name: "Freedom24 All-inclusive" },
];

const LIGHTYEAR_PLANS = [
  { id: "eu", name: "Lightyear Europe" },
  { id: "uk", name: "Lightyear UK" },
];

// Crypto is the shelf where the plan changes the fill: Metal is 1 % / 2 %,
// the others are 1,5 % / 2,5 %. Smart and Go do not cut that rate, so they
// are not a third and fourth row. Shares stay one N26 line — only the
// monthly free-trade allowance differs, and that is not a trip.
const N26_CRYPTO_PLANS = [
  { id: "standard", name: "N26 Standard" },
  { id: "metal", name: "N26 Metal" },
];

// Ordered by what the subscription costs, so the cheapest plan reads first and
// the trade-off between the monthly fee and the commission runs down the page.
//
// Trading Pro is absent on purpose. It is an add-on bought on top of one of
// these, and it buys a share rate, not a crypto one: a Metal holder who takes it
// still exchanges at Metal's 0.99 %. A row of its own would have to pick an
// underlying plan and would then state that price as Trading Pro's own.
const REVOLUT_PLANS = [
  { id: "standard", name: "Revolut Standard" },
  { id: "plus", name: "Revolut Plus" },
  { id: "premium", name: "Revolut Premium" },
  { id: "metal", name: "Revolut Metal" },
  { id: "ultra", name: "Revolut Ultra" },
];

const SAXO_PLANS = [
  { id: "classic", name: "Saxo Classic" },
  { id: "platinum", name: "Saxo Platinum" },
  { id: "vip", name: "Saxo VIP" },
];

const SCALABLE_PLANS = [
  { id: "free", name: "Scalable FREE" },
  { id: "prime", name: "Scalable PRIME+" },
];

const TRADEREPUBLIC_PLANS = [
  { id: "best", name: "Trade Republic Best" },
  { id: "direct", name: "Trade Republic Direct" },
];

const TRADESTATION_PLANS = [
  { id: "tier1", name: "TradeStation (Tier 1)" },
  { id: "tier4", name: "TradeStation (Tier 4)" },
  { id: "intl", name: "TradeStation (outside the US)" },
];

const TRADEUP_PLANS = [
  { id: "us", name: "TradeUP" },
  { id: "nra-us", name: "TradeUP (non-US, US address)" },
  { id: "foreign", name: "TradeUP (non-US, foreign address)" },
];

function tradeupOpen(plan, nat) {
  const n = String(nat || "").trim().toUpperCase();
  if (!n) return true;
  if (n === "US") return plan === "us";
  return plan !== "us";
}

const TRADIER_PLANS = [
  { id: "lite", name: "Tradier Lite" },
  { id: "pro", name: "Tradier Pro" },
  { id: "proplus", name: "Tradier Pro Plus" },
];

const VESTED_PLANS = [
  { id: "basic", name: "Vested Basic" },
  { id: "premium", name: "Vested Premium" },
];

const VIVID_PLANS = [
  { id: "standard", name: "Vivid Standard" },
  { id: "plus", name: "Vivid Plus" },
  { id: "prime", name: "Vivid Prime" },
];

const WEBULL_PLANS = [
  { id: "us", name: "Webull US" },
  { id: "uk-go", name: "Webull UK Go" },
  { id: "uk-meridian", name: "Webull UK Meridian" },
  { id: "eu", name: "Webull Europe" },
  { id: "sg", name: "Webull Singapore" },
  { id: "ca", name: "Webull Canada" },
  { id: "au", name: "Webull Australia" },
  { id: "hk", name: "Webull Hong Kong" },
];

const WEBULL_EU = new Set([
  "NL", "BE", "DK", "DE", "EE", "FI", "FR", "GR", "HU", "IE", "IT", "HR", "LV",
  "LT", "LU", "NO", "AT", "PL", "PT", "RO", "SI", "SK", "ES", "CZ", "SE",
]);

function webullOpen(plan, nat) {
  const n = String(nat || "").trim().toUpperCase();
  if (!n) return true;
  if (n === "US") return plan === "us";
  if (n === "CA") return plan === "ca";
  if (n === "GB") return plan === "uk-go" || plan === "uk-meridian";
  if (n === "AU") return plan === "au";
  if (n === "HK") return plan === "hk";
  if (n === "SG") return plan === "sg";
  if (WEBULL_EU.has(n)) return plan === "eu";
  return false;
}

function collapseWebull(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameTripListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    const ids = g.members.map((m) => m.plan);
    return {
      ...g.members[0],
      folder: `webull:${ids.join("-")}`,
      family: "Webull",
      name: g.members.map((m) => m.name).join(" / "),
      plan: "",
      planRank: 0,
    };
  });
}

const TRADEZERO_PLANS = [
  { id: "tza", name: "TradeZero America" },
  { id: "tzi", name: "TradeZero International" },
  { id: "tzeu", name: "TradeZero Europe" },
];

function tradezeroOpen(plan, nat) {
  const n = String(nat || "").trim().toUpperCase();
  if (!n) return true;
  if (n === "US") return plan === "tza";
  if (EEA.includes(n)) return plan === "tzeu";
  return plan === "tzi";
}

function collapseVivid(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameTripListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    const ids = g.members.map((m) => m.plan);
    return {
      ...g.members[0],
      folder: `vivid:${ids.join("-")}`,
      family: "Vivid Money",
      name: g.members.map((m) => m.name).join(" / "),
      plan: "",
      planRank: 0,
    };
  });
}

function collapseVested(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameTripListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    const ids = g.members.map((m) => m.plan);
    return {
      ...g.members[0],
      folder: `vested:${ids.join("-")}`,
      family: "Vested Finance",
      name: g.members.map((m) => m.name).join(" / "),
      plan: "",
      planRank: 0,
    };
  });
}

function collapseTradier(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameTripListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    const ids = g.members.map((m) => m.plan);
    const paidOnly = ids.every((id) => id !== "lite");
    return {
      ...g.members[0],
      folder: `tradier:${ids.join("-")}`,
      family: "Tradier",
      name: paidOnly ? "Tradier Pro" : g.members.map((m) => m.name).join(" / "),
      plan: "",
      planRank: 0,
    };
  });
}

function collapseTradezero(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameTripListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    const ids = g.members.map((m) => m.plan);
    return {
      ...g.members[0],
      folder: `tradezero:${ids.join("-")}`,
      family: "TradeZero",
      name: g.members.length === TRADEZERO_PLANS.length ? "TradeZero" : g.members.map((m) => m.name).join(" / "),
      plan: "",
      planRank: 0,
    };
  });
}

function collapseTradeup(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameTripListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    const ids = g.members.map((m) => m.plan);
    return {
      ...g.members[0],
      folder: `tradeup:${ids.join("-")}`,
      family: "TradeUP",
      name: g.members.length === TRADEUP_PLANS.length ? "TradeUP" : g.members.map((m) => m.name).join(" / "),
      plan: "",
      planRank: 0,
    };
  });
}

function collapseTradestation(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameTripListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    const ids = g.members.map((m) => m.plan);
    const allUs = ids.every((id) => id !== "intl");
    return {
      ...g.members[0],
      folder: `tradestation:${ids.join("-")}`,
      family: "TradeStation",
      name: allUs || g.members.length === TRADESTATION_PLANS.length ? "TradeStation" : g.members.map((m) => m.name).join(" / "),
      plan: "",
      planRank: 0,
    };
  });
}

function collapseTraderepublic(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameTripListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `traderepublic:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      family: "Trade Republic",
      name: "Trade Republic",
      plan: "",
      planRank: 0,
    };
  });
}

const SWISSQUOTE_PLANS = [
  { id: "ch", name: "Swissquote" },
  { id: "lu", name: "Swissquote Europe" },
];

const TIGER_PLANS = [
  { id: "sg", name: "Tiger Brokers SG" },
  { id: "au", name: "Tiger Brokers AU" },
  { id: "hk", name: "Tiger Brokers HK" },
  { id: "nz", name: "Tiger Brokers NZ" },
];

function tigerOpen(plan, nat) {
  const n = String(nat || "").trim().toUpperCase();
  if (!n) return true;
  if (n === "AU") return plan === "au";
  if (n === "NZ") return plan === "nz";
  if (n === "HK") return plan === "hk";
  return plan === "sg";
}

// XTB prints one formula. The trip changes with the cash a company can
// hold (and, past 100 000 € of monthly turnover, with the UK pound
// floor). A visitor who names a country sees only that company's row.
// With no country, each company is priced on the names it actually
// lists; rows whose totals match are folded back into one line.
const XTB_SA = new Set(["CA", "CZ", "DE", "ES", "FR", "PL", "PT", "RO", "SK"]);
const XTB_INTL = new Set([
  "AO", "BM", "GE", "MK", "MY", "MR", "MD", "ME", "PH", "KN", "RS", "ZA", "TT",
  "TH", "VN", "ZM",
]);
const XTB_MENA = new Set(GCC);
const XTB_CY = new Set(EU.filter((code) => code !== "BE" && !XTB_SA.has(code)));
const XTB_PLANS = [
  { id: "sa", name: "XTB S.A.", probe: "FR" },
  { id: "uk", name: "XTB UK", probe: "GB" },
  { id: "cy", name: "XTB Cyprus", probe: "IT" },
  { id: "mena", name: "XTB MENA", probe: "AE" },
  { id: "int", name: "XTB International", probe: "ZA" },
];

function xtbEntityFor(nat) {
  const code = String(nat || "").trim().toUpperCase();
  if (!code) return "";
  if (code === "GB") return "uk";
  if (XTB_MENA.has(code)) return "mena";
  if (XTB_INTL.has(code)) return "int";
  if (XTB_SA.has(code)) return "sa";
  if (XTB_CY.has(code)) return "cy";
  return "";
}

function xtbOpen(plan, nat) {
  const who = xtbEntityFor(nat);
  if (!String(nat || "").trim()) return true;
  return plan === who;
}

const XTB_PLAN_LABEL = Object.fromEntries(XTB_PLANS.map((p) => [p.id, p.name]));

function xtbName(planIds, allIds) {
  const order = XTB_PLANS.map((p) => p.id);
  const ids = [...new Set(planIds)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (ids.length === allIds.length) return "XTB";
  return ids.map((id) => XTB_PLAN_LABEL[id] || id).join(" / ");
}

// One venue stays on one line when every company that lists it bills the
// same trip. A company drops onto its own line only for the venue where
// its total or its fees move.
function collapseXtb(built) {
  if (built.length <= 1) return built;
  const allIds = built.map((r) => r.plan);
  const places = new Map();
  for (const row of built) {
    for (const listing of row.listings) {
      const place = `${listing.exchange}\0${listing.currency}`;
      const list = places.get(place) || [];
      list.push({ plan: row.plan, listing, row });
      places.set(place, list);
    }
  }

  const buckets = new Map();
  for (const items of places.values()) {
    const clusters = [];
    for (const item of items) {
      const hit = clusters.find(
        (c) => c.listing.total === item.listing.total && c.listing.fees === item.listing.fees
      );
      if (hit) hit.plans.push(item.plan);
      else clusters.push({ listing: item.listing, plans: [item.plan], row: item.row });
    }
    for (const c of clusters) {
      const key = [...c.plans].sort().join(",");
      const bucket = buckets.get(key);
      if (bucket) bucket.listings.push(c.listing);
      else buckets.set(key, { plans: c.plans, listings: [c.listing], row: c.row });
    }
  }

  const rankOf = (id) => {
    const i = XTB_PLANS.findIndex((p) => p.id === id);
    return i < 0 ? 99 : i + 1;
  };

  return [...buckets.values()].map((b) => {
    const name = xtbName(b.plans, allIds);
    const all = b.plans.length === allIds.length;
    return {
      ...b.row,
      folder: `xtb:${[...b.plans].join("-")}`,
      family: name,
      name,
      plan: all ? "" : [...b.plans].join("-"),
      planRank: all ? 0 : Math.min(...b.plans.map(rankOf)),
      listings: b.listings,
    };
  });
}

function collapseTiger(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameTripListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `tiger:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      family: "Tiger Brokers",
      name: g.members.length === TIGER_PLANS.length ? "Tiger Brokers" : g.members.map((m) => m.name).join(" / "),
      plan: "",
      planRank: 0,
    };
  });
}

const PLUM_PLANS = [
  { id: "basic", name: "Plum UK Basic" },
  { id: "plus", name: "Plum UK Plus" },
  { id: "boost", name: "Plum UK Boost" },
  { id: "max", name: "Plum UK Max" },
  { id: "eu", name: "Plum UE Basic" },
  { id: "pro", name: "Plum UE Pro" },
  { id: "eu-boost", name: "Plum UE Boost" },
  { id: "premium", name: "Plum UE Premium" },
  { id: "eu-max", name: "Plum UE Max" },
];

function plumEntity(plan) {
  const id = String(plan || "");
  if (id === "eu" || id === "pro" || id === "premium" || id.startsWith("eu-")) return "eu";
  return "uk";
}

// The two Plum entities are not two price lists for one account: the UK one is a
// British ISA and stocks account, the European one is passported from Greece into
// the EEA, which Britain left. Each has its own residents and neither can sell to
// the other's. `accepted.mjs` opens the broker to ten countries, which is the union
// of the two, so the split has to be made here. A visitor who names no country
// still sees everything.
function plumOpen(plan, nat) {
  const code = String(nat || "").trim().toUpperCase();
  if (!code) return true;
  return plumEntity(plan) === "uk" ? code === "GB" : code !== "GB";
}

// Robinhood is three companies behind one name, and they do not sell the same
// thing at the same price: the American one prices a real share against three
// regulators and routes crypto to a market maker, the British one adds a currency
// conversion and sells neither crypto nor any exchange-traded fund, the European
// one sells a derivative on the share and takes a percent. So the broker gets a
// row per company, and `collapseRobinhood` puts back together any that a given
// instrument happens to price alike.
const ROBINHOOD_PLANS = [
  { id: "us", name: "Robinhood US" },
  { id: "uk", name: "Robinhood UK" },
  { id: "eu", name: "Robinhood UE" },
];

// The country each company is built for when the visitor named none, so that a
// line withheld from the EEA still shows on the American and British rows.
const ROBINHOOD_NAT = { us: "US", uk: "GB", eu: "FR" };

const EEA_SET = new Set(EEA);

function robinhoodEntity(nat) {
  const code = String(nat || "").trim().toUpperCase();
  if (code === "GB") return "uk";
  return EEA_SET.has(code) ? "eu" : "us";
}

function robinhoodOpen(plan, nat) {
  const code = String(nat || "").trim().toUpperCase();
  if (!code) return true;
  return plan === robinhoodEntity(code);
}

function plumSubscription(row) {
  const text = row.listings?.[0]?.remark || "";
  const match = text.match(/^(\d+(?:\.\d+)? [£€]\/month)/);
  return match ? match[1] : "";
}

function lightyearPlansFor(nat) {
  const n = String(nat || "").toUpperCase();
  if (n === "GB") return LIGHTYEAR_PLANS.filter((p) => p.id === "uk");
  if (n) return LIGHTYEAR_PLANS.filter((p) => p.id === "eu");
  return LIGHTYEAR_PLANS;
}

function revolutEntitiesFor(nat) {
  const n = String(nat || "").toUpperCase();
  if (n === "GB") return [{ id: "uk" }];
  if (n) return [{ id: "eu" }];
  return [{ id: "eu" }, { id: "uk" }];
}

function revolutEquityName(entityId, plan, showHouse) {
  const house = showHouse ? (entityId === "uk" ? "UK " : "UE ") : "";
  return `Revolut ${house}${plan === "ultra" ? "Ultra" : "Standard"}`;
}

function revolutHouse(row) {
  return /:uk(?:-|$)/.test(String(row.folder || "")) ? "uk" : "eu";
}

function collapseSwissquote(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameTripListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `swissquote:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      family: "Swissquote",
      name: "Swissquote",
      plan: "",
      planRank: 0,
    };
  });
}

function collapseScalable(built) {
  const groups = [];
  for (const row of built) {
    // gettex / Xetra bill the same ticket on both plans; the 4.99 €/month
    // sits in the remark and must not keep two identical totals on the page.
    const hit = groups.find((g) => sameTripListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `scalablecapital:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      family: "Scalable Capital",
      name: "Scalable Capital",
      plan: "",
      planRank: 0,
    };
  });
}

const SAXO_PLAN_LABEL = { classic: "Classic", platinum: "Platinum", vip: "VIP" };

function saxoName(planIds, allIds) {
  const order = SAXO_PLANS.map((p) => p.id);
  const ids = [...new Set(planIds)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (ids.length === allIds.length) return "Saxo";
  return `Saxo ${ids.map((id) => SAXO_PLAN_LABEL[id] || id).join(" / ")}`;
}

function collapseSaxo(built) {
  if (built.length <= 1) return built;
  const allIds = built.map((r) => r.plan);
  const places = new Map();
  for (const row of built) {
    for (const listing of row.listings) {
      const place = `${listing.exchange}\0${listing.currency}`;
      const list = places.get(place) || [];
      list.push({ plan: row.plan, listing, row });
      places.set(place, list);
    }
  }

  const buckets = new Map();
  for (const items of places.values()) {
    const clusters = [];
    for (const item of items) {
      const hit = clusters.find(
        (c) => c.listing.total === item.listing.total && c.listing.fees === item.listing.fees
      );
      if (hit) hit.plans.push(item.plan);
      else clusters.push({ listing: item.listing, plans: [item.plan], row: item.row });
    }
    for (const c of clusters) {
      const key = [...c.plans].sort().join(",");
      const bucket = buckets.get(key);
      if (bucket) bucket.listings.push(c.listing);
      else buckets.set(key, { plans: c.plans, listings: [c.listing], row: c.row });
    }
  }

  const rankOf = (id) => {
    const i = SAXO_PLANS.findIndex((p) => p.id === id);
    return i < 0 ? 99 : i + 1;
  };

  return [...buckets.values()].map((b) => {
    const name = saxoName(b.plans, allIds);
    const all = b.plans.length === allIds.length;
    return {
      ...b.row,
      folder: `saxo:${[...b.plans].join("-")}`,
      family: name,
      name,
      plan: all ? "" : [...b.plans].join("-"),
      planRank: all ? 0 : Math.min(...b.plans.map(rankOf)),
      listings: b.listings,
    };
  });
}

function collapseRevolut(built) {
  const bothHouses = new Set(built.map(revolutHouse)).size > 1;
  const groups = [];
  for (const row of built) {
    const plan = String(row.plan || "").includes("ultra") ? "ultra" : "standard";
    const hit = groups.find((g) => g.plan === plan && sameTripListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ plan, listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    const entities = new Set(g.members.map(revolutHouse));
    const showHouse = entities.size === 1 && bothHouses;
    const name = revolutEquityName([...entities][0], g.plan, showHouse);
    return {
      ...g.members[0],
      folder: `revolut:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      family: name,
      name,
      plan: g.plan,
      planRank: g.plan === "ultra" ? 2 : 1,
    };
  });
}

// Two plans of one broker are one row when they cost the same. While a broker
// is unmigrated its total is N/A on every plan, so the comparison rests on the
// remark alone — which is what used to separate them anyway.
function sameAbcListings(a, b) {
  if (a.length !== b.length) return false;
  return a.every((l, i) => {
    const r = b[i];
    return l.exchange === r.exchange && l.currency === r.currency && l.total === r.total;
  });
}

function sameCostListings(a, b) {
  if (a.length !== b.length) return false;
  return a.every((l, i) => {
    const r = b[i];
    return (
      l.exchange === r.exchange &&
      l.currency === r.currency &&
      l.total === r.total &&
      l.remark === r.remark
    );
  });
}

function sameTripListings(a, b) {
  if (a.length !== b.length) return false;
  return a.every((l, i) => {
    const r = b[i];
    return l.exchange === r.exchange && l.currency === r.currency && l.total === r.total && l.fees === r.fees;
  });
}

function collapseEasyBourse(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameCostListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `easybourse:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      name: g.members[0].family,
      plan: "",
      planRank: 0,
    };
  });
}

function collapseBunq(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameCostListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `bunq:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      name: g.members[0].family,
      plan: "",
      planRank: 0,
    };
  });
}

function collapseBux(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameCostListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `bux:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      name: g.members[0].family,
      plan: "",
      planRank: 0,
    };
  });
}

function collapseDavy(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameCostListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `davy:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      name: g.members[0].family,
      plan: "",
      planRank: 0,
    };
  });
}

function collapsePlum(built) {
  const groups = [];
  for (const row of built) {
    const sub = plumSubscription(row);
    const hit = groups.find((g) => sameAbcListings(g.listings, row.listings) && g.sub === sub);
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, sub, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    const entities = new Set(g.members.map((m) => plumEntity(m.plan)));
    const name = entities.size === 2 ? g.members[0].family : entities.has("eu") ? "Plum UE" : "Plum UK";
    return {
      ...g.members[0],
      folder: `plum:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      name,
      plan: "",
      planRank: 0,
    };
  });
}

function collapseBoursobank(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameCostListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `boursobank:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      name: g.members[0].family,
      plan: "",
      planRank: 0,
    };
  });
}

function collapseFortuneo(built) {
  const groups = [];
  for (const row of built) {
    const hit = groups.find((g) => sameCostListings(g.listings, row.listings));
    if (hit) hit.members.push(row);
    else groups.push({ listings: row.listings, members: [row] });
  }
  return groups.map((g) => {
    if (g.members.length === 1) return g.members[0];
    return {
      ...g.members[0],
      folder: `fortuneo:${g.members.map((m) => m.folder.split(":")[1]).join("-")}`,
      name: g.members[0].family,
      plan: "",
      planRank: 0,
    };
  });
}

// Keeps the first of any run of rows the reader could not tell apart. The
// signature is the columns the page prints and nothing else: a listing may well
// differ in its name or its query and still be, on screen, the same line twice.
// A coin never prints its place, and prints its currency only where one is
// imposed — in which case every row of that broker carries the same one. Neither
// can tell two rows apart, so neither enters the signature: WH SelfInvest names
// three venues for bitcoin, in dollars, and quotes no price for any of them.
function sameShown(crypto) {
  const seen = new Set();
  return (l) => {
    const sign = [
      crypto ? "" : l.exchange,
      crypto ? "" : l.currency,
      l.total,
      l.remark,
    ].join("\u0000");
    if (seen.has(sign)) return false;
    seen.add(sign);
    return true;
  };
}

function detail(key, nat = "", size = {}) {
  const inst = resolve(key);
  if (!inst) return null;
  const rows = [];
  const easy = [];
  const isCrypto = inst.key.startsWith("CRYPTO:");
  for (const [folder, listingsOf] of inst.byBroker) {
    if (!acceptsNat(folder, nat)) continue;
    const meta = brokers.get(folder);
    // The quote leg still travels into the estimators, which need it to price the
    // conversion; only the column goes blank, and only where nothing is imposed.
    const anyCurrency = isCrypto && !imposesCurrency(folder);
    // `asNat` is the audience a row is built for, which is the visitor's country
    // except where one broker is several companies: each then has to be filtered
    // for its own residents, including when the visitor named no country at all
    // and sees them side by side.
    const listings = (extra, asNat = nat) =>
      listingsOf
        .filter((listing) => listingOpen(listing, asNat))
        .slice()
        .sort((a, b) => a.exchange.localeCompare(b.exchange, "en") || a.currency.localeCompare(b.currency))
        .map((listing) => {
          const cost = estimateListing(folder, listing, inst, { nat, ...extra }, size);
          return {
            ...listing,
            ...cost,
            exchange: (cost.venueAuthoritative && cost.venueExchange) || listing.exchange || cost.venueExchange || "",
            // A coin is not quoted in a currency the way a share is: the column
            // names the cash the account settles in, which the estimator knows
            // and the catalogue does not. Robinhood's book was read in dollars
            // and its European company trades the same coins in euros.
            currency: anyCurrency
              ? ""
              : (isCrypto && cost.cashCurrency) ||
                (cost.venueAuthoritative && cost.venueCurrency) ||
                listing.currency ||
                cost.venueCurrency ||
                "",
          };
        })
        .filter((listing) => listing.buyable !== false)
        .map(
          ({
            buyable,
            nonEuResident,
            nonUkResident,
            usResidentsOnly,
            indianOnly,
            cfd,
            supportedCountries,
            exchangeRaw,
            venueExchange,
            venueCurrency,
            cashCurrency,
            venueAuthoritative,
            ...listing
          }) => listing
        )
        // Quantfury carries bitcoin three times, against the dollar, the real and
        // tether. The quote leg was the whole of what the currency column said, so
        // with it blank the three print the same line. Only rows that agree on
        // every visible field are merged, which leaves a pair priced differently
        // from its neighbours standing on its own.
        .filter(isCrypto ? sameShown(true) : () => true);
    const base = {
      folder,
      family: meta?.name || prettyFolder(folder),
      country: meta?.country || "",
      kind: meta?.type || "",
      url: meta?.url || "",
      plan: "",
      planRank: 0,
    };
    const asPlan = (plan, i, listed) => ({
      ...base,
      folder: `${folder}:${plan.id}`,
      // The page merges rows that share a `family`. If that stays the broker
      // name, Revolut Standard and Ultra both print as "Revolut" the moment
      // the two companies happen to cost the same.
      family: plan.name || base.family,
      name: plan.name,
      plan: plan.id,
      planRank: i + 1,
      listings: listed,
    });
    if (folder === "easybourse") {
      const built = [];
      EASYBOURSE_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      easy.push(...collapseEasyBourse(built));
      continue;
    }
    if (folder === "bunq") {
      const built = [];
      BUNQ_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseBunq(built)) rows.push(row);
      continue;
    }
    if (folder === "boursobank") {
      const built = [];
      BOURSOBANK_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseBoursobank(built)) rows.push(row);
      continue;
    }
    if (folder === "fortuneo") {
      const built = [];
      FORTUNEO_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseFortuneo(built)) rows.push(row);
      continue;
    }
    if (folder === "etoro") {
      const built = [];
      ETORO_PLANS.forEach((plan, i) => {
        if (!etoroOpen(plan.id, nat)) return;
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseEtoro(built)) rows.push(row);
      continue;
    }
    if (folder === "bux") {
      const built = [];
      BUX_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseBux(built)) rows.push(row);
      continue;
    }
    if (folder === "davy") {
      const built = [];
      DAVY_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseDavy(built)) rows.push(row);
      continue;
    }
    if (folder === "freedom24") {
      FREEDOM24_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) rows.push(asPlan(plan, i, listed));
      });
      continue;
    }
    if (folder === "lightyear") {
      lightyearPlansFor(nat).forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) rows.push(asPlan(plan, i, listed));
      });
      continue;
    }
    // Same reason as Revolut below: Metal cuts the crypto percentage, so the
    // two tariffs are two rows. Shares stay one N26 line.
    if (folder === "N26" && inst.key.startsWith("CRYPTO:")) {
      N26_CRYPTO_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) rows.push(asPlan(plan, i, listed));
      });
      continue;
    }
    // Crypto is the one shelf where every plan changes the fill, 1.49 % down
    // to 0.49 %, so it gets a row each. A share is 0.25 % on four plans and
    // 0.12 % on Ultra: Standard stands for the first four, Ultra is added
    // only when that cut actually moves the total (it does not on an ETF,
    // nor on a stock still sitting on the €1 floor). UK and UE merge when
    // they price alike; they only split on the Lithuanian €1 floor.
    if (folder === "revolut") {
      if (inst.key.startsWith("CRYPTO:")) {
        const built = [];
        REVOLUT_PLANS.forEach((plan, i) => {
          const listed = listings({ plan: plan.id });
          if (listed.length) built.push(asPlan(plan, i, listed));
        });
        // Stablecoins are 0 on every plan when paid in their own currency, so
        // five rows would print the same 0. One Revolut line carries the note.
        const same = built.length > 1 && built.every((r) => sameTripListings(r.listings, built[0].listings));
        if (same) {
          rows.push({
            ...built[0],
            folder: `revolut:${built.map((m) => m.folder.split(":")[1]).join("-")}`,
            family: "Revolut",
            name: "Revolut",
            plan: "",
            planRank: 0,
          });
        } else {
          for (const row of built) rows.push(row);
        }
      } else {
        const built = [];
        revolutEntitiesFor(nat).forEach((ent, i) => {
          // Trading Ltd only sells to Britain. A line Britain cannot buy is
          // one that house sells to nobody, so it stays off the UK rows even
          // when the visitor named no country. The Lithuanian house still
          // shows it: a Swiss client buys there.
          const houseNat = ent.id === "uk" && !nat ? "GB" : nat;
          const standard = listings({ entity: ent.id, plan: "standard" }, houseNat);
          if (standard.length) {
            built.push(asPlan({ id: ent.id, name: revolutEquityName(ent.id, "standard", false) }, i * 2, standard));
          }
          const ultra = listings({ entity: ent.id, plan: "ultra" }, houseNat);
          if (ultra.length && !sameTripListings(standard, ultra)) {
            built.push(
              asPlan({ id: `${ent.id}-ultra`, name: revolutEquityName(ent.id, "ultra", false) }, i * 2 + 1, ultra)
            );
          }
        });
        for (const row of collapseRevolut(built)) rows.push(row);
      }
      continue;
    }
    // A listing that costs the same on every plan is one "Saxo" line. Nasdaq
    // still splits Classic / Platinum / VIP once the 1 $ floor no longer binds.
    if (folder === "saxo") {
      const built = [];
      SAXO_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseSaxo(built)) rows.push(row);
      continue;
    }
    if (folder === "swissquote") {
      const built = [];
      SWISSQUOTE_PLANS.forEach((plan, i) => {
        const listed = listings({ entity: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseSwissquote(built)) rows.push(row);
      continue;
    }
    if (folder === "tiger") {
      const built = [];
      TIGER_PLANS.forEach((plan, i) => {
        if (!tigerOpen(plan.id, nat)) return;
        const listed = listings({ entity: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseTiger(built)) rows.push(row);
      continue;
    }
    if (folder === "scalablecapital") {
      const built = [];
      SCALABLE_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseScalable(built)) rows.push(row);
      continue;
    }
    if (folder === "webull") {
      const built = [];
      WEBULL_PLANS.forEach((plan, i) => {
        if (!webullOpen(plan.id, nat)) return;
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseWebull(built)) rows.push(row);
      continue;
    }
    if (folder === "vivid") {
      const built = [];
      VIVID_PLANS.forEach((plan, i) => {
        const listed = listings({ entity: "personal", plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseVivid(built)) rows.push(row);
      continue;
    }
    if (folder === "vested") {
      const built = [];
      VESTED_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseVested(built)) rows.push(row);
      continue;
    }
    if (folder === "tradier") {
      const built = [];
      TRADIER_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseTradier(built)) rows.push(row);
      continue;
    }
    if (folder === "tradezero") {
      const built = [];
      TRADEZERO_PLANS.forEach((plan, i) => {
        if (!tradezeroOpen(plan.id, nat)) return;
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseTradezero(built)) rows.push(row);
      continue;
    }
    if (folder === "tradeup") {
      const built = [];
      TRADEUP_PLANS.forEach((plan, i) => {
        if (!tradeupOpen(plan.id, nat)) return;
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseTradeup(built)) rows.push(row);
      continue;
    }
    if (folder === "tradestation") {
      const built = [];
      TRADESTATION_PLANS.forEach((plan, i) => {
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseTradestation(built)) rows.push(row);
      continue;
    }
    if (folder === "traderepublic") {
      if (isCrypto) {
        const listed = listings({ plan: "best" });
        if (listed.length) {
          rows.push({
            ...asPlan({ id: "best", name: "Trade Republic" }, 0, listed),
            folder: "traderepublic",
            family: "Trade Republic",
            plan: "",
            planRank: 0,
          });
        }
        continue;
      }
      const built = [];
      const all = listings({ plan: "best" });
      if (all.length) built.push(asPlan(TRADEREPUBLIC_PLANS[0], 0, all.slice(0, 1)));
      const direct = listings({ plan: "direct" }).filter((listing) => String(listing.exchange || "").toUpperCase() !== "TIB");
      if (direct.length) built.push(asPlan(TRADEREPUBLIC_PLANS[1], 1, direct));
      for (const row of collapseTraderepublic(built)) rows.push(row);
      continue;
    }
    if (folder === "robinhood") {
      ROBINHOOD_PLANS.forEach((plan, i) => {
        if (!robinhoodOpen(plan.id, nat)) return;
        const listed = listings({ entity: plan.id }, nat || ROBINHOOD_NAT[plan.id]);
        if (listed.length) rows.push(asPlan(plan, i, listed));
      });
      continue;
    }
    if (folder === "plum") {
      const built = [];
      PLUM_PLANS.forEach((plan, i) => {
        if (!plumOpen(plan.id, nat)) return;
        const listed = listings({ plan: plan.id });
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapsePlum(built)) rows.push(row);
      continue;
    }
    if (folder === "xtb") {
      const built = [];
      XTB_PLANS.forEach((plan, i) => {
        if (!xtbOpen(plan.id, nat)) return;
        const listed = listings({ entity: plan.id }, nat || plan.probe);
        if (listed.length) built.push(asPlan(plan, i, listed));
      });
      for (const row of collapseXtb(built)) rows.push(row);
      continue;
    }
    const listed = listings({});
    if (!listed.length) continue;
    rows.push({
      ...base,
      name: meta?.name || prettyFolder(folder),
      listings: listed,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, "en"));
  const at = rows.findIndex((r) => r.name.localeCompare("EasyBourse", "en") > 0);
  rows.splice(at === -1 ? rows.length : at, 0, ...easy);
  // The page prints the size back, so a reader who changed it sees what the
  // column answers for, and learns when the price behind it is missing.
  const trade = isCrypto
    ? { amount: size.amount ?? AMOUNT_DEFAULT }
    : {
        shares: size.shares ?? SHARES_DEFAULT,
        price: priceOf(inst.isin, mostCommon([...inst.byBroker.values()].flat().map((l) => l.currency))),
      };
  return {
    ...summarize(inst, "", nat),
    // Plans and extra venues are extra rows, not extra brokers.
    brokers: new Set(rows.map((r) => brokerFolder(r.folder))).size,
    // Same universe as the header, so "51 of 53" is readable against it.
    brokersTotal: brokers.size,
    trade,
    soldBy: rows,
  };
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

// The estimators read the price synchronously, and a price that is not there yet is
// indistinguishable from one that does not exist — both end up N/A. So the fetching is
// done first, for the one instrument on screen, and only then are the rows built.
// Crypto is sized in dollars and needs no price at all.
async function warmPrices(key) {
  const inst = resolve(key);
  if (!inst || inst.key.startsWith("CRYPTO:")) return;
  const isins = new Set();
  if (inst.isin) isins.add(inst.isin);
  for (const listings of inst.byBroker.values()) {
    for (const l of listings) if (l.isin) isins.add(l.isin);
  }
  // A handful at most: one instrument quoted under a dozen ISINs is a catalogue error,
  // not a reason to spend a dozen requests on one page view.
  await Promise.all([...isins].slice(0, 8).map((isin) => ensureFresh(isin)));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/search") {
    return json(res, 200, search(url.searchParams.get("q") || "", 20, url.searchParams.get("nat") || ""));
  }
  if (url.pathname === "/api/instrument") {
    const size = {};
    const shares = Number(url.searchParams.get("shares"));
    const amount = Number(url.searchParams.get("amount"));
    if (Number.isFinite(shares) && shares > 0) size.shares = shares;
    if (Number.isFinite(amount) && amount > 0) size.amount = amount;
    const key = url.searchParams.get("key") || "";
    await warmPrices(key);
    const found = detail(key, url.searchParams.get("nat") || "", size);
    return found ? json(res, 200, found) : json(res, 404, { error: "unknown" });
  }
  if (url.pathname === "/api/countries") return json(res, 200, countryOptions());
  if (url.pathname === "/api/stats") {
    return json(res, 200, {
      instruments: instruments.size,
      listings,
      brokers: brokers.size,
    });
  }
  if (url.pathname === "/" || url.pathname === "/front.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(HTML));
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.error(`http://127.0.0.1:${PORT}`);
});
