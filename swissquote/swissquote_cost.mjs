// What one round trip costs at Swissquote: buy n shares at price p, sell them
// back at once (online), in dollars.
//
// The affine triple hid the grid. A $2,300 Nasdaq ticket is 29 CHF a side,
// not the 3 CHF of the ≤ 500 row that `c` used to carry. `roundTrip` is
// given the size and charges the printed step.
//
// Two banks, two cards, re-read 2026-09-17. The catalogue is
// trade.swissquote.ch (Swissquote Bank SA). `--entity=lu` is Swissquote
// Bank Europe. Default is `ch`.
//
// CH — fee in CHF, notional in the product currency (Scandinavia in EUR).
//   Switzerland, USA, UK                         3 / 5 / 10 / 29 / …
//   Germany                                      5 / 5 / 10 / 29 / …
//   Euronext (incl. Norway), Canada             10 / 10 / 10 / 29 / …
//   Italy, Austria, Scandinavia, Spain, SG, AU  20 until 2 000, then the same
//   Hong Kong / Tokyo                            own HKD / JPY grids
//   OTC                                          0.5 %, min 100 (listing ccy
//                                                or CHF if that ccy is not
//                                                AUD CAD CHF EUR GBP USD)
//   + 0.85 in the listing currency, each way
//   FX at the interbank mid, no markup. Cash can sit in the listing
//   currency, so conversion stays out.
//   Swiss federal stamp on SIX / BX (0.075 % CH ISIN, 0.15 % foreign),
//   both sides: a Swiss dealer is a party. Other stamps from taxMap by
//   ISIN. The card names “local taxes” without rates — Xetra / Euronext /
//   SEC / TAF / PTM are not borrowed from the Europe page.
//
// LU — 0.1 %, min 14.95 € (Tokyo 24.95 €; Dubai 0.25 %, min 24.95 €).
//   OTC / off-exchange min 250 €. Realtime free. Custody free.
//   Auto-forex 0.9 % on settlement when the listing is not already EUR.
//   Exchange lines they print (Euronext €0.15 + 0.63 bp, Xetra 0.0038 %
//   min 0.60 / max 18 €, SIX CHF 1, HK 0.1 %, SG 0.0325 %, Dubai
//   AED 10.5 + 18 bp) stay in the number. FTT from taxMap.
//
// Crypto. CH: Standard I, 1 % taker, measured 2026-09-08 (50 € BTC →
// 0.50 € a side). LU: 1 % under 10 000 €, 0.75 % to 50 000, 0.5 % above.
// The 1 % is the cost; there is no book.
//
//   https://www.swissquote.com/en-ch/private/trade/pricing/securities/stocks
//   https://www.swissquote.com/en-ch/private/trade/pricing/cryptocurrencies
//   https://www.swissquote.com/en-ch/private/trade/pricing/account-fees
//   https://www.swissquote.com/en-lu/private/trade/pricing/securities/stocks-etfs
//   https://www.swissquote.com/en-lu/private/trade/pricing/cryptocurrencies
//   https://www.swissquote.com/en-lu/private/trade/pricing/account-fees
//
//   node swissquote/swissquote_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node swissquote/swissquote_cost.mjs AAPL NASDAQ USD --shares=10 --price=230 --entity=lu
//   node swissquote/swissquote_cost.mjs NESN SIX CHF --shares=10 --price=100
//   node swissquote/swissquote_cost.mjs BTC CRYPTO USD --amount=1000
//   node swissquote/swissquote_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("swissquote-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  ch: {
    source: "https://www.swissquote.com/en-ch/private/trade/pricing/securities/stocks",
    crypto: "https://www.swissquote.com/en-ch/private/trade/pricing/cryptocurrencies",
    account: "https://www.swissquote.com/en-ch/private/trade/pricing/account-fees",
    readOn: "2026-09-17",
    previouslyRead: "2026-09-08",
    exampleRateOn: "2026-03-13",
    entity: "Swissquote Bank SA",
  },
  lu: {
    source: "https://www.swissquote.com/en-lu/private/trade/pricing/securities/stocks-etfs",
    crypto: "https://www.swissquote.com/en-lu/private/trade/pricing/cryptocurrencies",
    account: "https://www.swissquote.com/en-lu/private/trade/pricing/account-fees",
    readOn: "2026-09-17",
    previouslyRead: "2026-09-08",
    entity: "Swissquote Bank Europe",
  },
};

const REALTIME_EACH = 0.85;
const OTC_RATE = 0.005;
const OTC_MIN = 100;
const OTC_CCY = new Set(["AUD", "CAD", "CHF", "EUR", "GBP", "USD"]);
const LU_RATE = 0.001;
const LU_MIN = 14.95;
const LU_MIN_TOKYO = 24.95;
const LU_DUBAI_RATE = 0.0025;
const LU_DUBAI_MIN = 24.95;
const LU_OTC_MIN = 250;
const LU_FX = 0.009;
const LU_CASH = "EUR";
const CRYPTO_TAKER = 0.01;
const CRYPTO_CHECK = {
  pair: "BTC/EUR",
  amount: 50,
  paid: 1,
  measured: 0.02,
  published: 0.02,
  commissionEach: 0.5,
  on: "2026-09-08",
};
const SIX_STAMP_CH = 0.00075;
const SIX_STAMP_FOREIGN = 0.0015;
const CUSTODY = { low: 20, high: 50, period: "quarter", vat: 0.081, ccy: "CHF" };

const GRID = [
  { upTo: 500, ch: 3, de: 5, eu: 10, other: 20 },
  { upTo: 1000, ch: 5, de: 5, eu: 10, other: 20 },
  { upTo: 2000, ch: 10, de: 10, eu: 10, other: 20 },
  { upTo: 10000, ch: 29, de: 29, eu: 29, other: 29 },
  { upTo: 15000, ch: 49, de: 49, eu: 49, other: 49 },
  { upTo: 25000, ch: 79, de: 79, eu: 79, other: 79 },
  { upTo: 50000, ch: 129, de: 129, eu: 129, other: 129 },
  { upTo: Infinity, ch: 190, de: 190, eu: 190, other: 190 },
];

const HK_GRID = [
  { upTo: 16000, chf: 29 },
  { upTo: 80000, chf: 39 },
  { upTo: 120000, chf: 49 },
  { upTo: 200000, chf: 79 },
  { upTo: 400000, chf: 129 },
  { upTo: Infinity, chf: 190 },
];

const JP_GRID = [
  { upTo: 250000, chf: 20 },
  { upTo: 1000000, chf: 29 },
  { upTo: 2000000, chf: 39 },
  { upTo: 3000000, chf: 49 },
  { upTo: 6000000, chf: 129 },
  { upTo: Infinity, chf: 190 },
];

const MARKET_COL = {
  ch: "ch",
  us: "ch",
  uk: "ch",
  de: "de",
  euronext: "eu",
  ca: "eu",
  other: "other",
};

const CH_BY_CODE = {
  SIX: "ch",
  BX: "ch",
  NASDAQ: "us",
  NYSE: "us",
  AMEX: "us",
  CBOE: "us",
  LSE: "uk",
  AQUIS: "uk",
  XETR: "de",
  FWB: "de",
  SWB: "de",
  DUS: "de",
  MUN: "de",
  HAM: "de",
  HAN: "de",
  GETTEX: "de",
  TRADEGATE: "de",
  LS: "de",
  LSIN: "de",
  LSX: "de",
  EURONEXT: "euronext",
  OSL: "euronext",
  TSX: "ca",
  TSXV: "ca",
  NEO: "ca",
  HKEX: "hk",
  TSE: "jp",
  NAG: "jp",
  OTC: "otc",
  MIL: "other",
  EUROTLX: "other",
  VIE: "other",
  BME: "other",
  OMX: "other",
  SGX: "other",
  ASX: "other",
};

const LU_ONLY = { DFM: "dubai" };

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const EURONEXT_MIC = new Set(["XPAR", "XAMS", "XBRU", "XLIS", "XMSM", "XDUB", "XOSL"]);
const EURONEXT_FEE_MIC = new Set(["XPAR", "XAMS", "XBRU"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const settleCcy = (ccy) => (code(ccy) === "GBX" ? "GBP" : code(ccy));

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v);
};

function amountIn(amount, from, to) {
  const src = settleCcy(from);
  const dst = settleCcy(to);
  if (!(Number(amount) >= 0) || !src || !dst) return null;
  if (src === dst) return Number(amount);
  const usd = toUsd(amount, src);
  const per = usdPer(dst);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
}

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(settleCcy(currency)),
  chf: usdPer("CHF"),
  eur: usdPer("EUR"),
});

export function entityOf(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "lu" || raw === "europe" || raw === "eu") return "lu";
  return "ch";
}

export function feeMarketOf(exchange, mic) {
  const raw = code(exchange);
  const m = code(mic);
  if (raw === "CRYPTO" || m === "CRYPTO") return "crypto";
  if (CH_BY_CODE[raw]) return CH_BY_CODE[raw];
  if (LU_ONLY[raw]) return LU_ONLY[raw];
  if (US_MICS.has(m)) return "us";
  if (m === "XSWX" || m === "XBRN") return "ch";
  if (m === "XLON") return "uk";
  if (m === "XETR" || m === "XFRA" || m === "XSTU" || m === "XMUN" || m === "XDUS" || m === "XHAM" || m === "XHAN" || m === "XGAT" || m === "XQTX") {
    return "de";
  }
  if (EURONEXT_MIC.has(m)) return "euronext";
  if (m === "XHKG") return "hk";
  if (m === "XJPX" || m === "XTKS") return "jp";
  if (m === "XTSE" || m === "XTSX") return "ca";
  if (m === "XMAD" || m === "XMCE" || m === "XWBO" || m === "MTAA" || m === "XSTO" || m === "XCSE" || m === "XHEL" || m === "XSES" || m === "XASX") {
    return "other";
  }
  if (m === "XDFM") return "dubai";
  return null;
}

function gridChf(amount, market) {
  if (market === "hk") return (HK_GRID.find((t) => amount <= t.upTo) || HK_GRID.at(-1)).chf;
  if (market === "jp") return (JP_GRID.find((t) => amount <= t.upTo) || JP_GRID.at(-1)).chf;
  const col = MARKET_COL[market];
  if (!col) return null;
  const row = GRID.find((t) => amount <= t.upTo) || GRID.at(-1);
  return row[col];
}

function bracketAmount(notional, currency, market, exchange) {
  if (market === "hk") return amountIn(notional, currency, "HKD");
  if (market === "jp") return amountIn(notional, currency, "JPY");
  if (code(exchange) === "OMX" && settleCcy(currency) !== "EUR") return amountIn(notional, currency, "EUR");
  return notional;
}

export function commissionEach(bank, { market, notional, currency, exchange }) {
  if (market === "crypto") {
    if (!(notional > 0)) return null;
    if (bank === "lu") {
      const eur = amountIn(notional, currency, "EUR");
      if (eur == null) return null;
      const rate = eur >= 50000 ? 0.005 : eur >= 10000 ? 0.0075 : CRYPTO_TAKER;
      return { charged: notional * rate, currency: settleCcy(currency), rate };
    }
    return { charged: notional * CRYPTO_TAKER, currency: settleCcy(currency), rate: CRYPTO_TAKER };
  }
  if (bank === "lu") {
    if (market === "otc") return { charged: LU_OTC_MIN, currency: "EUR", rate: null };
    if (market === "dubai") {
      const eur = amountIn(notional, currency, "EUR");
      if (eur == null) return null;
      return { charged: Math.max(LU_DUBAI_MIN, eur * LU_DUBAI_RATE), currency: "EUR", rate: LU_DUBAI_RATE };
    }
    if (!market || market === "dubai") return null;
    const priced = new Set(["ch", "us", "uk", "de", "euronext", "ca", "other", "hk", "jp"]);
    if (!priced.has(market)) return null;
    const eur = amountIn(notional, currency, "EUR");
    if (eur == null) return null;
    const min = market === "jp" ? LU_MIN_TOKYO : LU_MIN;
    return { charged: Math.max(min, eur * LU_RATE), currency: "EUR", rate: LU_RATE };
  }
  if (market === "otc") {
    const ccy = OTC_CCY.has(settleCcy(currency)) ? settleCcy(currency) : "CHF";
    const amt = ccy === settleCcy(currency) ? notional : amountIn(notional, currency, "CHF");
    if (amt == null) return null;
    return { charged: Math.max(OTC_MIN, amt * OTC_RATE), currency: ccy, rate: OTC_RATE };
  }
  if (market === "dubai") return null;
  const bracket = bracketAmount(notional, currency, market, exchange);
  if (bracket == null) return null;
  const chf = gridChf(bracket, market);
  if (chf == null) return null;
  return { charged: chf, currency: "CHF", rate: null };
}

function luVenueEach({ market, listing, notional, hkAlreadyTaxed }) {
  const flat = [];
  let pct = 0;
  if (EURONEXT_FEE_MIC.has(listing.mic)) {
    flat.push({ amount: 0.15, currency: "EUR" });
    pct += 0.000063;
  }
  if (listing.mic === "XETR") {
    const eur = amountIn(notional, listing.currency, "EUR");
    if (eur != null) flat.push({ amount: Math.min(18, Math.max(0.6, eur * 0.000038)), currency: "EUR" });
  }
  if (market === "ch") flat.push({ amount: 1, currency: "CHF" });
  if (market === "hk" && !hkAlreadyTaxed) pct += 0.001;
  if (code(listing.brokerExchange) === "SGX" || listing.mic === "XSES") pct += 0.000325;
  if (market === "dubai") {
    flat.push({ amount: 10.5, currency: "AED" });
    pct += 0.0018;
  }
  return { flat, pct };
}

function remarkOf(bank) {
  if (bank === "ch") {
    return `Custody ${CUSTODY.low}–${CUSTODY.high} ${CUSTODY.ccy}/${CUSTODY.period} (+ ${100 * CUSTODY.vat}% VAT).`;
  }
  return "";
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(rows, asked, (r) => {
    if (code(r.type) === "CRYPTO" && loose(r.ticker) === asked) return true;
    return loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked;
  });

  const crypto = named.filter((r) => code(r.type) === "CRYPTO");
  if (crypto.length && (!place || /crypto/i.test(String(place)))) {
    const row =
      (wantCurrency && crypto.find((r) => code(r.currency) === wantCurrency)) ||
      crypto.find((r) => code(r.currency) === "USD") ||
      crypto[0];
    return { named, matches: [{ row, venue: null, unsourced: { match: "crypto" } }] };
  }

  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named.filter((r) => code(r.type) !== "CRYPTO");
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const market = feeMarketOf(r.exchange, venue?.mic) || "?";
    const slot = (out[type] ||= { n: 0, priced: 0, byMarket: {} });
    slot.n += 1;
    if (market !== "?") slot.priced += 1;
    const mk = (slot.byMarket[market] ||= { n: 0 });
    mk.n += 1;
    if (unsourced && !venue) slot.unsourced = (slot.unsourced || 0) + 1;
  }
  return out;
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight
 * back. `usd` is the number the page prints; `brokerFees` is only
 * Swissquote's ticket (grid / 0.1 % / OTC / 1 % crypto, plus the 0.85
 * realtime on CH and the 0.9 % auto-forex on LU).
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  amount = null,
  bp = null,
  perShare = null,
  entity = "ch",
}) {
  const bank = entityOf(entity);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    entity: bank,
    onlineBuy: true,
    cashCurrency: bank === "lu" ? LU_CASH : "",
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Swissquote n'existe pas encore : lancer `node swissquote/swissquote_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Swissquote` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Swissquote`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = code(m.row.type) === "CRYPTO";
  const book = crypto
    ? { leaf: null, mic: null }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
      });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || (crypto ? "USD" : ""),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row.exchange, listing.mic);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = crypto ? { rates: {} } : taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const swissEach =
    !crypto && bank === "ch" && market === "ch"
      ? listing.isin?.startsWith("CH")
        ? SIX_STAMP_CH
        : SIX_STAMP_FOREIGN
      : 0;
  const hkAlreadyTaxed = market === "hk" && taxPct > 0;

  const cashCurrency = bank === "lu" ? LU_CASH : settleCcy(listing.currency);
  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency,
    remark: remarkOf(bank),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? (crypto ? SCHEDULE[bank].crypto : SCHEDULE[bank].source),
    basis: `barème Swissquote ${bank === "lu" ? "Europe" : "Suisse"}, palier ${market || "?"}, relu le ${SCHEDULE[bank].readOn}`,
    tax,
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: bank === "lu" ? LU_FX : 0,
  };

  if (!market) {
    return {
      ...shared,
      remark: remarkOf(bank),
      why: `${listing.brokerExchange || listing.exchange} n'a pas de palier publié chez Swissquote ${bank === "lu" ? "Europe" : "Suisse"}`,
    };
  }

  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  const notional = crypto && cash > 0 ? cash : n > 0 && p > 0 ? n * p : null;

  if (notional == null) {
    return {
      ...shared,
      commission: { currency: bank === "lu" ? "EUR" : "CHF", eachWay: true },
      why: crypto
        ? "aucun montant pour cette ligne crypto"
        : !(n > 0)
          ? "aucun nombre de parts"
          : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({ bank, market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct, swissEach }),
    };
  }

  const ticket = commissionEach(bank, {
    market,
    notional,
    currency: listing.currency,
    exchange: m.row.exchange,
  });
  if (!ticket) {
    return {
      ...shared,
      why: `${listing.brokerExchange || listing.exchange} n'a pas de palier publié chez Swissquote ${bank === "lu" ? "Europe" : "Suisse"}`,
      confidence: confidenceOf({ bank, market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct, swissEach }),
    };
  }

  const notionalUsd = dollars(notional, listing.currency);
  const ticketUsd = dollars(ticket.charged, ticket.currency);
  const realtimeUsd = crypto || bank === "lu" ? 0 : dollars(REALTIME_EACH, settleCcy(listing.currency));
  const convert = bank === "lu" && !crypto && settleCcy(listing.currency) !== LU_CASH;
  const fxUsd = convert ? notionalUsd * LU_FX : 0;
  const commissionUsd = plus(ticketUsd, ticketUsd);
  const extrasUsd = plus(realtimeUsd, realtimeUsd, fxUsd, fxUsd);
  const brokerFees = plus(commissionUsd, extrasUsd);

  const bookUsd = crypto
    ? 0
    : marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const taxUsd = crypto || notionalUsd == null ? 0 : notionalUsd * taxPct;
  const swissUsd = swissEach && notionalUsd != null ? notionalUsd * swissEach * 2 : 0;

  let venueUsd = 0;
  if (bank === "lu" && !crypto) {
    const venue = luVenueEach({ market, listing, notional, hkAlreadyTaxed });
    const flatUsd = venue.flat.reduce((s, line) => plus(s, dollars(line.amount, line.currency)), 0);
    venueUsd = plus(flatUsd, flatUsd, notionalUsd == null ? null : notionalUsd * venue.pct * 2);
  }

  const usd = plus(bookUsd, brokerFees, taxUsd, swissUsd, venueUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
            m.unsourced?.why || "pas de feuille de carnet"
          }`,
        }
      : {}),
    trade: {
      shares: crypto ? null : n,
      price: crypto ? null : p,
      amount: crypto ? notional : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    commission: {
      each: ticket.charged,
      currency: ticket.currency,
      eachWay: true,
      rate: ticket.rate,
      realtimeEach: crypto || bank === "lu" ? 0 : REALTIME_EACH,
      fxEach: convert ? LU_FX : 0,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(plus(taxUsd, swissUsd), 6),
      place: finite(venueUsd, 6),
    },
    check: crypto && bank === "ch" ? CRYPTO_CHECK : null,
    confidence: confidenceOf({
      bank,
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      swissEach,
      ticket,
      convert,
      n,
      notional,
    }),
  };
}

function confidenceOf({
  bank,
  market,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  swissEach,
  ticket,
  convert,
  n,
  notional,
}) {
  const said = [];
  said.push(
    bank === "lu"
      ? `commission Europe ${market === "dubai" ? "0,25 %" : market === "otc" ? "250 €" : "0,1 %"}, plancher ${
          market === "jp" || market === "dubai" ? "24,95" : market === "otc" ? "250" : "14,95"
        } €, lue le ${SCHEDULE.lu.readOn}`
      : `commission Suisse palier ${market}, lue le ${SCHEDULE.ch.readOn}` +
        (ticket?.currency === "CHF" ? ` : ${ticket.charged} CHF par sens` : "")
  );
  if (bank === "ch" && market !== "crypto") {
    said.push(`0,85 de temps réel par jambe en ${settleCcy(listing.currency)}`);
  }
  if (convert) said.push(`auto-forex Europe ${Number((100 * LU_FX).toPrecision(2))} % par règlement, listing ≠ ${LU_CASH}`);
  if (swissEach) said.push(`timbre fédéral suisse ${(100 * swissEach).toFixed(3)} % par sens sur SIX/BX`);
  if (taxPct) said.push(`taxe de transfert ${(100 * taxPct).toFixed(2)} % prise dans taxMap.mjs`);
  if (market === "crypto") {
    said.push(`pas de carnet : le ${100 * CRYPTO_TAKER} % est le coût, pas N/A`);
    if (bank === "ch") {
      said.push(
        `mesuré le ${CRYPTO_CHECK.on} : ${CRYPTO_CHECK.amount} € sur ${CRYPTO_CHECK.pair} → ${CRYPTO_CHECK.paid} €`
      );
    }
  } else if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part`);
  else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}`
    );
  }
  if (!leaf && market !== "crypto") said.push(`carnet absent pour cette ligne`);
  said.push(
    bank === "ch"
      ? `hors trajet : garde ${CUSTODY.low}–${CUSTODY.high} CHF / trimestre + TVA. Change au mid, sans marge. SEC / TAF / PTM / frais Xetra non nommés sur la carte Suisse`
      : `hors trajet : garde 0. Frais de place allemands hors Xetra non tarifés. SEC / TAF / PTM non nommés`
  );
  if (n && notional) said.push(`${n} parts, ${Number(notional).toFixed(2)} ${listing.currency}`);
  return said.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ch: { ...SCHEDULE.ch, grid: GRID, hk: HK_GRID, jp: JP_GRID, realtimeEach: REALTIME_EACH, otc: { rate: OTC_RATE, min: OTC_MIN } },
          lu: {
            ...SCHEDULE.lu,
            rate: LU_RATE,
            min: LU_MIN,
            tokyo: LU_MIN_TOKYO,
            dubai: { rate: LU_DUBAI_RATE, min: LU_DUBAI_MIN },
            otc: LU_OTC_MIN,
            fx: LU_FX,
            cash: LU_CASH,
          },
          crypto: { taker: CRYPTO_TAKER, check: CRYPTO_CHECK },
          custody: CUSTODY,
          coverage: coverage(),
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node swissquote/swissquote_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--entity=ch|lu]\n" +
        "        node swissquote/swissquote_cost.mjs --schedule\n" +
        "  ex.   node swissquote/swissquote_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node swissquote/swissquote_cost.mjs AAPL NASDAQ USD --shares=10 --price=230 --entity=lu\n" +
        "        node swissquote/swissquote_cost.mjs NESN SIX CHF --shares=10 --price=100"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    entity: flag("entity") || "ch",
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que Swissquote propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.entity === "lu" ? SCHEDULE.lu.entity : SCHEDULE.ch.entity}]\n`
  );

  if (out.trade) {
    const t = out.trade;
    console.log(
      (t.shares
        ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}`
        : `${t.notional.toFixed(2)} ${t.currency}`) +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n"
    );
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.place) console.log(`  place          : ${parts.place} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
