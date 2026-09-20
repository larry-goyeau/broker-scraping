// What one round trip costs at Trading 212 Invest: buy n shares at price p,
// sell them back at once, in dollars. Coins are bought by the amount.
//
// The affine triple hid the PTM cliff. £1.50 each way above £10,000 lived
// only in `threshold`, which the page never added. `roundTrip` is given the
// size and charges what is charged.
//
// Trading 212 UK Ltd / Trading 212 Markets Ltd / Trading 212 EU GmbH.
// Invest, Stocks ISA and SIPP print the same card, re-read 2026-09-18 —
// commission 0, custody 0, FX 0.15 % when cash has to cross. CFD (0.5 %
// FX on the result, overnight swap) is a different product and is not in
// this catalogue. Default is that Invest card; there is no second plan.
//
//   stocks / ETFs     0
//   crypto            T212's own bid/ask (no ticket)
//   FX                0.15 % each way, only if converted
//
// Cash can be GBP, USD, EUR, CHF, DKK, NOK, PLN, SEK, CZK, RON, HUF, CAD
// and AUD. Every listing currency in this catalogue is one of those, with
// GBX settling in GBP, so FX stays out of `usd` and `brokerFees`. The
// 0.15 % sits in the remark. Pies convert in the primary currency at the
// same rate; that is not this trip.
//
// Stamp / FTT come from the tax map, which is this broker's own ex-ante
// sweep. London share buys pay 0.50 % stamp when the map has the ISIN
// (ETFs and most AIM names do not). French FTT is 0.40 % on the names
// the disclosure taxed. Borsa Italiana is ETFs only here; Madrid was
// swept in full and came back clean — no Italian, Spanish, Irish or
// Belgian levy is invented. PTM £1.50 each way on an LSE / AIM stock
// above £10,000 of consideration, in pounds, both legs.
//
// SEC 0.00206 % of the sale and TAF $0.000195 / $9.79 on NASDAQ, NYSE,
// the other US tapes and OTC. One Invest article drops the % on the SEC
// line ($0.00206 of value); the exchange-fees page and the live
// disclosure keep the current levy, which is what is used. CAT is not
// named. NSCC is not named.
//
// What is in the number: the book (European bp, each US / OTC 605 ×
// Q of Interactive Brokers LLC, the US BD the order-execution policy
// names, or T212's crypto review); stamp / FTT from the map; PTM when
// it bites; SEC and TAF on a US / OTC sale. brokerFees is 0 — they
// bill no ticket. FX is only in the number if a listing currency they
// cannot hold appears later.
//
// Invest does not publish a bid/ask on equities — last only, empty
// added-costs. A US tape uses IBKR's 606, the same rule as the other
// brokers that name that correspondent. The Apple Invest fill of
// 8 September 2026 (0.133 $ against 0.01154 $ in 605) stays as the
// error bar, not a second scale. A missing 605 is N/A. CFD quotes
// are another product and are not this file.
//
// Card deposits above the free allowance, withdrawals, the card itself
// and ADR pass-through stay out. ADR is named as a third-party charge
// with no printed dollar, so it is a remark on those names only.
//
// Real trips kept as the error bar, never folded in: EUNL / IWDA /
// CSPX / IS3N / GC40 / VWCE on Xetra, ETL on Paris, HSBA on London,
// Apple on Nasdaq, and €50 of BTC/EUR.
//
//   https://helpcentre.trading212.com/hc/en-us/articles/11471996799517-What-are-the-fees-in-the-Invest-ISAs-and-SIPP
//   https://helpcentre.trading212.com/hc/en-us/articles/360007081637-What-are-the-applicable-stock-exchange-fees
//   https://helpcentre.trading212.com/hc/en-us/articles/360018909758-What-is-the-FX-fee-Invest-Stocks-ISA
//   https://helpcentre.trading212.com/hc/en-us/articles/11669719976093-What-is-a-multi-currency-account
//
//   node trading212/trading212_cost.mjs IUSQ "Deutsche Börse Xetra" EUR --shares=20 --price=10
//   node trading212/trading212_cost.mjs HSBA "London Stock Exchange" GBX --shares=100 --price=1578
//   node trading212/trading212_cost.mjs AAPL NASDAQ USD --shares=100 --price=320
//   node trading212/trading212_cost.mjs BTC/EUR --amount=50
//   node trading212/trading212_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("trading212-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);
const CRYPTO = new URL("t212-crypto.json", import.meta.url);

const SCHEDULE = {
  invest: "https://helpcentre.trading212.com/hc/en-us/articles/11471996799517-What-are-the-fees-in-the-Invest-ISAs-and-SIPP",
  exchange: "https://helpcentre.trading212.com/hc/en-us/articles/360007081637-What-are-the-applicable-stock-exchange-fees",
  fx: "https://helpcentre.trading212.com/hc/en-us/articles/360018909758-What-is-the-FX-fee-Invest-Stocks-ISA",
  cash: "https://helpcentre.trading212.com/hc/en-us/articles/11669719976093-What-is-a-multi-currency-account",
  readOn: "2026-09-18",
  previouslyRead: "2026-09-08",
  entity: "Trading 212 UK Ltd / Trading 212 Markets Ltd / Trading 212 EU GmbH",
};

const FX_EACH_WAY = 0.0015;
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
const NARROW_BP = 2.5;
const ADR_NAMED = /\bADRs?\b|american deposit|depositary receipt/i;

const HOLD = new Set([
  "GBP",
  "USD",
  "EUR",
  "CHF",
  "DKK",
  "NOK",
  "PLN",
  "SEK",
  "CZK",
  "RON",
  "HUF",
  "CAD",
  "AUD",
]);

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

const CHECKS = {
  "IE00B4L5Y983|XETR|EUR": { bp: 0.99, trips: 6, range: [0.79, 1.18], on: "2026-08-26" },
  "FR0010221234|XPAR|EUR": {
    bp: 5.6,
    trips: 1,
    range: [5.6, 5.6],
    on: "2026-09-07",
    note: "après déduction des 0,40 % de taxe française",
  },
  "IE00B6R52259|XETR|EUR": { bp: 1.87, trips: 6, range: [1.87, 1.87], on: "2026-08-26" },
  "IE00B5BMR087|XETR|EUR": { bp: 1.12, trips: 3, range: [1.12, 1.12], on: "2026-08-27" },
  "LU1681046931|XETR|EUR": { bp: 5.42, trips: 6, range: [3.74, 8.01], on: "2026-08-27" },
  "IE00BKM4GZ66|XETR|EUR": { bp: 2.1, trips: 4, range: [1.47, 2.73], on: "2026-08-27" },
  "LU2196472984|XETR|EUR": { bp: 2.66, trips: 2, range: [2.66, 2.66], on: "2026-08-27" },
  "GB0005405286|XLON|GBX": {
    bp: 1.0,
    trips: 1,
    range: [1.0, 1.0],
    on: "2026-09-07",
    note: "après déduction du timbre et du change",
  },
  "US0378331005|XNAS|USD": {
    perShare: 0.133,
    bp: 4.2,
    trips: 1,
    range: [0.12, 0.12],
    on: "2026-09-08",
    note: "1 part, 0,12 € tout compris (compte déjà en dollars) ; barre d'erreur, pas une échelle",
  },
};

const TAX_CHECK = {
  pair: "ETL",
  venue: "Euronext Paris",
  amount: 184.05,
  paid: 0.84,
  tax: 0.004,
  residual: 5.6,
  on: "2026-09-07",
};

const CRYPTO_CHECK = {
  pair: "BTC/EUR",
  amount: 50,
  paid: 0.96,
  measured: 0.0192,
  quoted: 0.0201,
  on: "2026-09-07",
};

const US_CHECK = {
  pair: "AAPL",
  venue: "NASDAQ",
  n: 1,
  paid: 0.12,
  price: 316.4,
  perShare: 0.133,
  published: 0.01154,
  ratio: 11.5,
  on: "2026-09-08",
};
const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};
const cryptoFile = fs.existsSync(CRYPTO) ? JSON.parse(fs.readFileSync(CRYPTO, "utf8")) : null;

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const cryptoBase = (ticker) => String(ticker || "").split("/")[0].toUpperCase();
const isAdr = (row) =>
  ADR_NAMED.test(String(row?.name || "")) ||
  ADR_NAMED.test(String(row?.label || "")) ||
  /DEPOSITARY_RECEIPT/i.test(String(row?.subclasses || ""));

const cashOf = (currency) => {
  const ccy = String(currency || "").toUpperCase();
  if (ccy === "GBX" || ccy === "GBPENCE") return "GBP";
  return ccy;
};

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const toCcy = (amount, from, to) => {
  if (String(from || "").toUpperCase() === String(to || "").toUpperCase()) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

const isAmerican = (row, mic) => US_MICS.has(String(mic || "").toUpperCase()) || /OTC/i.test(row?.exchange || "");

const isUkStock = (row, mic) => {
  if (String(row?.type || "").toUpperCase() !== "STOCK") return false;
  if (String(mic || "").toUpperCase() === "XLON") return true;
  return /LONDONSTOCKEXCHANGE/i.test(loose(row?.exchange));
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();
  const wantAim = wantPlace.includes("AIM");

  const named = rows.filter((r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked || loose(r.code) === asked) {
      return true;
    }
    return isCrypto(r) && loose(cryptoBase(r.ticker)) === asked;
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => String(r.currency).toUpperCase() === wantCurrency)) ||
      crypto.find((r) => String(r.currency).toUpperCase() === "EUR") ||
      crypto.find((r) => String(r.currency).toUpperCase() === "USD") ||
      crypto[0];
    return { named, matches: [{ row, venue: null, unsourced: null }], wantVenue: null };
  }

  const matches = named
    .filter((r) => !isCrypto(r))
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantAim) return /AIM/i.test(m.row.exchange || "");
      if (/AIM/i.test(m.row.exchange || "") && wantVenue?.mic === "XLON") return false;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches, wantVenue };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

function ptmOf({ row, mic, notional, currency }) {
  if (!isUkStock(row, mic)) return { gbp: 0, usd: 0, bites: false };
  if (notional == null) return { gbp: null, usd: null, bites: false };
  const gbp = toCcy(notional, currency, "GBP");
  if (gbp == null) return { gbp: null, usd: null, bites: false };
  if (gbp < PTM.above) return { gbp: 0, usd: 0, bites: false };
  return { gbp: PTM.each * 2, usd: dollars(PTM.each * 2, "GBP"), bites: true };
}

function remarkOf({ crypto, ukStock, ptmBites, adr, currency, holdable }) {
  const lines = [];
  if (!crypto && holdable) lines.push(fxRemark("0.15", currency));
  if (ukStock && !ptmBites) {
    lines.push("UK takeover levy (PTM) £1.50 each way above £10,000.");
  }
  if (adr) lines.push("ADR pass-through billed as incurred.");
  return lines.join("\n");
}

const checkFor = (listing, used) => {
  const check = CHECKS[`${listing.isin}|${listing.mic}|${listing.currency}`];
  if (!check) return null;
  const sameShare = check.perShare != null && used?.perShare != null;
  const published = sameShare ? used.perShare : used?.bp;
  const measured = sameShare ? check.perShare : check.bp;
  return { ...check, ratio: published ? Number((measured / published).toFixed(2)) : null };
};

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0 });
    slot.n += 1;
    if (isCrypto(r)) {
      if (cryptoFile?.quotes?.[r.code]?.roundTrip != null) slot.withBook += 1;
      continue;
    }
    const { venue, unsourced } = listingKey(r);
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
      ticker: r.ticker,
      broker: "trading212",
    });
    if (isAmerican(r, venue?.mic)) {
      if (book.leaf?.perShare > 0) slot.withBook += 1;
      continue;
    }
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
  }
  return out;
}

/**
 * The whole bill for buying `shares` at `price` (or putting `amount` into
 * a coin) and selling straight back. `usd` is the number the page prints;
 * `brokerFees` is only what Trading 212 bills — the ticket is 0, and FX
 * is out while the listing currency is one they hold.
 */
export function roundTrip({ etf, place, currency, shares, price, amount, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Trading212 n'existe pas encore : lancer `node trading212/trading212_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Trading212` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Trading212`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  if (isCrypto(m.row)) return cryptoCost(m.row, answer, amount);

  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    ticker: m.row.ticker,
    broker: "trading212",
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    code: m.row.code || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
    adr: isAdr(m.row),
  };

  const cash = cashOf(listing.currency);
  const holdable = HOLD.has(cash);
  const american = isAmerican(m.row, listing.mic);
  const ukStock = isUkStock(m.row, listing.mic);
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const leaf = book.leaf;
  const marketBp = bp ?? (american ? null : leaf?.bp) ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const fxPct = holdable ? 0 : FX_EACH_WAY;

  const shared = {
    ...answer,
    listing,
    cashCurrency: holdable ? cash : "",
    onlineBuy: true,
    bp: marketBp,
    perShare: marketPerShare,
    url: american ? SCHEDULE.invest : leaf?.url ?? SCHEDULE.invest,
    basis: `barème Trading 212 Invest, relu le ${SCHEDULE.readOn} : commission 0, garde 0`,
    tax,
    commission: { each: 0, roundTrip: 0, currency: cash || listing.currency, eachWay: true },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: holdable ? FX_EACH_WAY * 2 : 0,
    check: checkFor(listing, { bp: marketBp, perShare: marketPerShare }),
  };

  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  const levy = ptmOf({ row: m.row, mic: listing.mic, notional, currency: listing.currency });

  shared.remark = remarkOf({
    crypto: false,
    ukStock,
    ptmBites: levy.bites,
    adr: listing.adr,
    currency: listing.currency,
    holdable,
  });

  if (notional == null) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        listing,
        leaf,
        marketBp,
        marketPerShare,
        via606: book.via606,
        unsourced: m.unsourced,
        tax,
        taxTotal,
        american,
        ukStock,
        holdable,
        fxPct,
        type: listing.type,
      }),
    };
  }

  const notionalUsd = dollars(notional, listing.currency);
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? american || listing.currency === "USD"
          ? marketPerShare * n
          : dollars(marketPerShare * n, listing.currency)
        : null;
  const secUsd = american && notionalUsd != null ? notionalUsd * SEC_RATE : 0;
  const tafUsd = american && n > 0 ? Math.min(n * TAF_PER_SHARE, TAF_CAP) : 0;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const fxUsd = fxPct && notionalUsd != null ? notionalUsd * fxPct * 2 : 0;
  const usd = plus(bookUsd, 0, secUsd, tafUsd, taxUsd, levy.usd, fxUsd);
  const brokerFees = plus(0, fxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why: american
            ? `aucun 605 pour ${listing.isin || listing.ticker}`
            : `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
                m.unsourced?.why || "pas de feuille de carnet"
              }`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: 0,
      réglementaire: american ? finite(plus(secUsd, tafUsd), 6) : null,
      taxes: finite(plus(taxUsd, levy.usd), 6),
      change: finite(fxUsd, 6),
    },
    sell: american
      ? { sec: finite(secUsd, 6), taf: finite(tafUsd, 6), tafCapped: tafUsd >= TAF_CAP }
      : null,
    ptm: levy.bites ? { gbp: levy.gbp, usd: finite(levy.usd, 6), above: PTM.above } : null,
    confidence: confidenceOf({
      listing,
      leaf,
      marketBp,
      marketPerShare,
      via606: book.via606,
      unsourced: m.unsourced,
      tax,
      taxTotal,
      american,
      ukStock,
      holdable,
      fxPct,
      type: listing.type,
      ptmBites: levy.bites,
    }),
  };
}

function cryptoCost(row, answer, amount) {
  const quote = cryptoFile?.quotes?.[row.code] ?? null;
  const listing = {
    isin: null,
    ticker: row.ticker,
    name: row.name,
    code: row.code,
    type: "CRYPTO",
    mic: null,
    exchange: "Trading 212 (teneur de marché)",
    currency: String(row.currency || "").toUpperCase(),
    brokerExchange: row.exchange || "CRYPTO",
  };
  const cash = cashOf(listing.currency);
  const holdable = HOLD.has(cash);
  const shared = {
    ...answer,
    listing,
    cashCurrency: holdable ? cash : "",
    onlineBuy: true,
    remark: "",
    url: SCHEDULE.invest,
    basis: "écart relevé sur la revue d'ordre Trading 212, les deux sens au même instant",
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    commission: { each: 0, roundTrip: 0, currency: listing.currency, eachWay: true },
  };

  if (!quote?.roundTrip) {
    return {
      ...shared,
      why: `aucun écart relevé pour ${row.ticker} : lancer trading212/t212-crypto.mjs`,
    };
  }

  const cashAmount = Number(amount);
  const a = Number(quote.roundTrip.toPrecision(4));
  shared.parts = { marché: a, taxes: null, réglementaire: null };
  shared.quote = { achat: quote.ask, vente: quote.bid, milieu: quote.mid, relevé: quote.at };
  shared.confidence =
    `l'écart est celui que le courtier cotait au moment du relevé et il bouge avec le marché ; ` +
    `un aller-retour réel de ${CRYPTO_CHECK.amount} € sur ${CRYPTO_CHECK.pair} a payé ` +
    `${(100 * CRYPTO_CHECK.measured).toFixed(2)} % contre ${(100 * CRYPTO_CHECK.quoted).toFixed(2)} % annoncés, ` +
    `soit ×${(CRYPTO_CHECK.measured / CRYPTO_CHECK.quoted).toFixed(2)}` +
    (quote.roundTrip < 0.001
      ? ` — attention, un écart aussi petit sur un prix à ${quote.mid} tient à l'arrondi et n'est pas fiable`
      : "");
  shared.check = {
    bp: Number((1e4 * CRYPTO_CHECK.measured).toFixed(0)),
    trips: 1,
    range: [CRYPTO_CHECK.paid, CRYPTO_CHECK.paid],
    on: CRYPTO_CHECK.on,
    ratio: Number((CRYPTO_CHECK.measured / CRYPTO_CHECK.quoted).toFixed(2)),
    note: row.ticker === CRYPTO_CHECK.pair ? null : `mesuré sur ${CRYPTO_CHECK.pair}, pas sur cette paire`,
  };

  if (!(cashAmount > 0)) {
    return { ...shared, a, why: "aucun montant" };
  }

  const notionalUsd = dollars(cashAmount, listing.currency);
  const bookUsd = notionalUsd == null ? null : notionalUsd * a;
  return {
    ...shared,
    usd: finite(bookUsd, 6),
    brokerFees: 0,
    trade: {
      shares: null,
      price: null,
      amount: cashAmount,
      notional: cashAmount,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: 0,
      réglementaire: null,
      taxes: 0,
      change: 0,
    },
  };
}

function confidenceOf({
  listing,
  leaf,
  marketBp,
  marketPerShare,
  via606,
  unsourced,
  tax,
  taxTotal,
  american,
  ukStock,
  holdable,
  fxPct,
  type,
  ptmBites,
}) {
  const said = [];
  said.push(
    `barème Trading 212 Invest / ISA / SIPP, relu le ${SCHEDULE.readOn} (inchangé depuis le ${SCHEDULE.previouslyRead}) : commission 0, garde 0`
  );

  if (taxTotal > 0) {
    said.push(
      `la taxe est lue sur la divulgation de coûts du courtier pour cet ISIN : ` +
        `${(100 * taxTotal).toFixed(2)} % du montant` +
        (marketBp ? `, ${((1e4 * taxTotal) / marketBp).toFixed(0)} fois le carnet` : "")
    );
    said.push(
      `et elle est bien prélevée : ${TAX_CHECK.amount} € de ${TAX_CHECK.pair} achetés puis revendus ` +
        `le ${TAX_CHECK.on} ont coûté ${TAX_CHECK.paid} €, soit les ${(100 * TAX_CHECK.tax).toFixed(2)} % de taxe plus ${TAX_CHECK.residual} pb de carnet ; ` +
        `le timbre britannique a été vérifié de la même façon, à 0,5 % près du centime`
    );
  } else if (tax?.assumedZero && !american) {
    said.push(tax.why);
  } else if (tax && !tax.known && !american) {
    said.push(`fiscalité non établie pour cette ligne : ${tax.why}`);
  }

  if (ukStock) {
    said.push(
      ptmBites
        ? `PTM ${PTM.each} £ × 2, le montant dépasse ${PTM.above} £`
        : `PTM ${PTM.each} £ par jambe au-delà de ${PTM.above} £, hors du chiffre à cette taille`
    );
  }

  if (fxPct) {
    said.push(`change ${(FX_EACH_WAY * 100).toFixed(2)} % × 2 : ${listing.currency} n'est pas tenue, donc dans le total`);
  } else if (holdable) {
    said.push(
      `change hors du total : le compte peut tenir ${cashOf(listing.currency)} (${(FX_EACH_WAY * 100).toFixed(2)} % seulement si le cash doit traverser)`
    );
  }

  if (american && marketPerShare != null) {
    said.push(
      via606
        ? `carnet 605 × Q IBKR, ${marketPerShare} $ la part`
        : `carnet NBBO reconstitué, ${marketPerShare} $ la part`
    );
    said.push(
      `barre d'erreur : ${US_CHECK.n} ${US_CHECK.pair} Invest le ${US_CHECK.on} a payé ${US_CHECK.perShare} $ de carnet ` +
        `contre ${US_CHECK.published} $ de 605, hors du chiffre`
    );
  } else if (marketBp != null) {
    const onFunds =
      type === "ETF"
        ? ""
        : ` — l'écart-type vient de fonds, deux actions seulement ont été tradées, et toutes deux sont tombées à un point de base près`;
    said.push(
      marketBp <= NARROW_BP
        ? `carnet serré : sur les trois fonds de ce régime qui ont été tradés, l'estimation est tombée à 6 % près${onFunds}`
        : `carnet large (plus de ${NARROW_BP} bp) : dans ce régime l'estimation s'est trompée d'un facteur deux dans les deux sens, compter de ${(marketBp * 0.5).toFixed(1)} à ${(marketBp * 1.8).toFixed(1)} bp${onFunds}`
    );
  } else if (marketPerShare != null) {
    said.push(
      `le carnet vient des rapports Rule 605, moyenne mensuelle des ordres de 100 à 499 parts` +
        (marketPerShare > 0.01
          ? ` ; à ${marketPerShare} $ par part ce bucket est déjà large`
          : ` ; à ${marketPerShare} $ par part ce bucket est serré`)
    );
  } else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }

  if (american) {
    said.push(
      `SEC ${SEC_RATE} du montant et TAF ${TAF_PER_SHARE} $/part à la vente, plafonnée à ${TAF_CAP} $ ; ` +
        `arrondis au cent, donc nuls en dessous d'une trentaine de parts. CAT n'est pas nommé`
    );
  }

  if (!american && !leaf && type !== "CRYPTO") said.push(`pas de feuille de carnet pour ${listing.isin}`);
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
          ...SCHEDULE,
          commission: 0,
          fxEachWay: FX_EACH_WAY,
          hold: [...HOLD],
          sec: SEC_RATE,
          taf: { perShare: TAF_PER_SHARE, cap: TAF_CAP },
          ptm: PTM,
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
      "usage : node trading212_cost.mjs <ticker|ISIN|code> [place] [devise] [--shares=n] [--price=p] [--amount=usd] [--json]\n" +
        "        node trading212_cost.mjs --schedule\n" +
        '  ex.   node trading212_cost.mjs IUSQ "Deutsche Börse Xetra" EUR --shares=20 --price=10\n' +
        '        node trading212_cost.mjs HSBA "London Stock Exchange" GBX --shares=100 --price=1578\n' +
        "        node trading212_cost.mjs AAPL NASDAQ USD --shares=100 --price=320\n" +
        "        node trading212_cost.mjs BTC/EUR --amount=50"
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
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce que Trading212 propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  if (out.trade) {
    const t = out.trade;
    if (t.amount != null) {
      console.log(`${t.amount} ${t.currency} aller-retour\n`);
    } else {
      console.log(
        `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
          (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
          "\n"
      );
    }
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const p = out.parts || {};
    if (p.marché != null) console.log(`  carnet         : ${p.marché} $`);
    if (p.courtage != null) console.log(`  courtage       : ${p.courtage} $`);
    if (p.réglementaire) console.log(`  réglementaire  : ${p.réglementaire} $`);
    if (p.taxes) console.log(`  taxes          : ${p.taxes} $`);
    if (p.change) console.log(`  change         : ${p.change} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.check) {
    console.log(
      `  vérification : ${out.check.trips} aller${out.check.trips > 1 ? "s" : ""}-retour${
        out.check.trips > 1 ? "s" : ""
      } réel${out.check.trips > 1 ? "s" : ""} le ${out.check.on}` +
        `${out.check.ratio ? ` soit ×${out.check.ratio}` : ""}${out.check.note ? ` (${out.check.note})` : ""}`
    );
  }
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
