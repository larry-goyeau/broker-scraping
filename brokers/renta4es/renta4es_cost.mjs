// What one round trip costs at Renta 4 Banco: buy n shares at price p, sell
// them back at once, online, in dollars. Shares and ETFs (and the ETCs, ETNs
// and listed funds the catalogue keeps with them).
//
// Hoja de tarifas, "Versión 1/7/26", read on 2026-10-18.
//   https://www.r4.com/tarifas
//   https://www.r4.com/resources/pdf/tablonanuncios/hoja_tarifas.pdf
//
//   Bolsa (acciones y ETFs), per order, each way, internet:
//     Spain (continuous market, BME Growth, Latibex)
//                     up to 6 000 €       4 €
//                     6 000 to 50 000 €   9 €
//                     above 50 000 €      0.10 % of the amount
//     Frankfurt, Amsterdam, Brussels, Helsinki, Lisbon, Milan, Paris
//                     up to 30 000 €      15 €, then 0.15 %
//     London          up to 30 000 £      15 £, then 0.15 %
//     Stockholm       up to 300 000 SEK   150 SEK, then 0.15 %
//     Switzerland     up to 30 000 CHF    25 CHF, then 0.25 %
//     USA             up to 30 000 $      15 $, then 0.15 %
//     USA OTC         up to 30 000 $      50 $, then 0.20 %
//     Other markets   0.45 %, by telephone or at the office only, so not an
//                     online order: those lines answer N/A.
//   Xetra is Deutsche Börse's Frankfurt book and takes the Frankfurt line.
//   A line quoted in another currency than its market's (a dollar ETF in
//   London, a euro ETF in Zurich) is sized in the market's currency first.
//
//   Canon (Spain)     BME charges a retail order a flat 1 € on shares and
//                     ETFs, whatever the transaction type. Added each way.
//                     Abroad, the sheet says the exchange fees are inside
//                     Renta 4's commission.
//   FX                a foreign trade on the euro account is converted with
//                     a 0.30 % spread, minimum 10 € per operation. The
//                     multi-currency account (deposits.mjs) holds EUR, USD,
//                     GBP, SEK, JPY and CHF, so only a line in another
//                     currency converts, on each leg.
//   Taxes             the sheet names the Spanish FTT and foreign transaction
//                     taxes without rates; stamp and FTT come from
//                     taxMap.mjs. A GB/IE/FR/IT/ES share with no tax-map
//                     line is N/A (taxGap).
//
// Left out: the intraday tariff (50 % off the commission on a same-session
// round trip, "solo a: valores de los mercados nacionales, valores Euro
// Stoxx 50, valores S&P 500") — this trip is a holding bought and later
// sold. The remark names it on those lines only (indexMembers.mjs). Custody (0.0125 % a month, min 1.25 € national;
// 0.017 % a month international), account keeping (3 € a month, 5 € with
// multi-currency settlement), dividend collection: remark only.
//
//   node brokers/renta4es/renta4es_cost.mjs SAN XMAD EUR --shares=500 --price=12.5
//   node brokers/renta4es/renta4es_cost.mjs AAPL XNAS USD --shares=10 --price=343
//   node brokers/renta4es/renta4es_cost.mjs HSBA XLON GBP --shares=100 --price=14.3
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { inEuroStoxx50, inSp500 } from "../../indexMembers.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("renta4es-parsed.json", import.meta.url);
const PAGE = "https://www.r4.com/resources/pdf/tablonanuncios/hoja_tarifas.pdf";
const READ_ON = "2026-10-18";
const VERSION = "1/7/26";
const HELD = new Set(["EUR", "USD", "GBP", "SEK", "JPY", "CHF"]);
const FX = { rate: 0.003, min: 10, ccy: "EUR" };
const CANON = { each: 1, ccy: "EUR" };

// A flat ticket up to `upTo`, then a share of the whole amount.
const step = (label, ccy, tiers) => ({ label, ccy, tiers });
const SPAIN = step("España", "EUR", [
  { upTo: 6000, flat: 4 },
  { upTo: 50000, flat: 9 },
  { upTo: Infinity, rate: 0.001 },
]);
const EUROPE = step("Europa (Fráncfort, Ámsterdam, Bruselas, Helsinki, Lisboa, Milán, París)", "EUR", [
  { upTo: 30000, flat: 15 },
  { upTo: Infinity, rate: 0.0015 },
]);
const MARKETS = {
  XMAD: SPAIN,
  XETR: EUROPE,
  XFRA: EUROPE,
  XAMS: EUROPE,
  XBRU: EUROPE,
  XHEL: EUROPE,
  XLIS: EUROPE,
  XMIL: EUROPE,
  XPAR: EUROPE,
  XLON: step("Londres", "GBP", [{ upTo: 30000, flat: 15 }, { upTo: Infinity, rate: 0.0015 }]),
  XSTO: step("Estocolmo", "SEK", [{ upTo: 300000, flat: 150 }, { upTo: Infinity, rate: 0.0015 }]),
  XSWX: step("Suiza", "CHF", [{ upTo: 30000, flat: 25 }, { upTo: Infinity, rate: 0.0025 }]),
  XNAS: step("EE.UU.", "USD", [{ upTo: 30000, flat: 15 }, { upTo: Infinity, rate: 0.0015 }]),
  XNYS: step("EE.UU.", "USD", [{ upTo: 30000, flat: 15 }, { upTo: Infinity, rate: 0.0015 }]),
  XASE: step("EE.UU.", "USD", [{ upTo: 30000, flat: 15 }, { upTo: Infinity, rate: 0.0015 }]),
  ARCX: step("EE.UU.", "USD", [{ upTo: 30000, flat: 15 }, { upTo: Infinity, rate: 0.0015 }]),
  BATS: step("EE.UU.", "USD", [{ upTo: 30000, flat: 15 }, { upTo: Infinity, rate: 0.0015 }]),
  OTCM: step("EE.UU. OTC", "USD", [{ upTo: 30000, flat: 50 }, { upTo: Infinity, rate: 0.002 }]),
};
// Spanish segments the venue table has no MIC for.
const BY_NAME = { BMEGROWTH: SPAIN, LATIBEX: SPAIN, BOLSADEMADRID: SPAIN, OTCMARKETS: MARKETS.OTCM };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const convert = (amount, from, to) => {
  if (code(from) === code(to)) return amount;
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  return usd == null || !per ? null : usd / per;
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function marketOf(m) {
  return BY_NAME[loose(m.row.exchange)] || MARKETS[code(m.venue?.mic || m.row.mic)] || null;
}

// One side, in the market's currency.
export function commissionEach(amount, market) {
  if (amount == null) return null;
  const tier = market.tiers.find((t) => amount <= t.upTo);
  return tier.flat != null ? tier.flat : amount * tier.rate;
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EUR",
    url: PAGE,
    remark:
      "Custody is 0.0125% a month (min €1.25) in Spain, 0.017% a month abroad. Account fee is €3 a month, €5 with multi-currency settlement.",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Renta 4 n'existe pas encore : lancer `node brokers/renta4es/renta4es_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Renta 4` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Renta 4`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "renta4es",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const market = marketOf(m);
  const spain = market === SPAIN;
  const converts = !HELD.has(listing.currency);
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  // The intraday tariff: Spanish markets, Euro Stoxx 50 names on a euro
  // line (the index's own), S&P 500 names in the US.
  const sameDay =
    spain ||
    (inEuroStoxx50(listing.isin) && listing.currency === "EUR") ||
    (market?.label === "EE.UU." && inSp500(listing.ticker));
  const shared = {
    ...answer,
    listing,
    cashCurrency: converts ? "EUR" : listing.currency,
    remark: [
      sameDay ? "Same day sell commission is 50% lower." : null,
      answer.remark,
      converts || listing.currency === FX.ccy ? null : fxRemark((100 * FX.rate).toFixed(2), listing.currency, `min ${FX.min} €`),
    ]
      .filter(Boolean)
      .join("\n"),
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    basis: market
      ? `hoja de tarifas Renta 4 version ${VERSION}, relue le ${READ_ON}, internet, ${market.label} : ` +
        market.tiers
          .map((t) => (t.flat != null ? `${t.flat} ${market.ccy}` : `${(t.rate * 100).toLocaleString("fr-FR")} %`) + (t.upTo < Infinity ? ` jusqu'à ${t.upTo.toLocaleString("fr-FR")} ${market.ccy}` : " au-delà"))
          .join(", ") +
        " par ordre" +
        (spain ? ", plus le canon BME de 1 € par ordre de détail" : "") +
        (converts ? ", change 0,30 % min 10 € par sens" : "")
      : `hoja de tarifas Renta 4 version ${VERSION}, relue le ${READ_ON}`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!market) {
    return {
      ...shared,
      why: `${listing.exchange} : « otros mercados » 0,45 %, par téléphone ou en agence seulement — pas d'ordre en ligne à ce barème`,
    };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = commissionEach(convert(notional, listing.currency, market.ccy), market);
  const commissionUsd = each == null ? null : dollars(each * 2, market.ccy);
  const canonUsd = spain ? dollars(CANON.each * 2, CANON.ccy) : 0;
  const notionalEur = convert(notional, listing.currency, FX.ccy);
  const fxEach = !converts ? 0 : notionalEur == null ? null : Math.max(FX.min, notionalEur * FX.rate);
  const fxUsd = fxEach == null ? null : dollars(fxEach * 2, FX.ccy);
  const brokerFees = plus(commissionUsd, canonUsd, fxUsd);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const unknown = [
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    commission: { each, currency: market.ccy, eachWay: true, tiers: market.tiers },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      bourse: finite(canonUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      taxTotal ? `taxe à l'achat ${(taxTotal * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe dans taxMap.mjs pour cet ISIN",
      spain ? "canon BME 1 € par ordre de détail, actions et ETF" : "cánones inclus dans la commission à l'étranger",
    ].join(" ; "),
  };
}

function printCli() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
