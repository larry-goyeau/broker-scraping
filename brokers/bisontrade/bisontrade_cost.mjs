// What one round trip costs at BisonTrade (Miralta Finance Bank): buy n
// shares at price p, sell them back at once, online, in dollars. Shares,
// ETFs, ETCs and ETNs — the "Renta Variable" table. CFDs, futures, options
// and bonds are other tables.
//
// Read on 2026-10-18. The tariffs page says the "BisonTrade 2022" tariff
// applies to every client who opened from 15/06/2022; its brochure is the
// file uploaded with the 24/02/2025 tariff set (titled "Folleto Tarifas
// 2022" inside).
//   https://www.miraltabank.com/tarifas-2/
//   https://www.miraltabank.com/wp-content/uploads/2025/02/Tarifas-BisonTrade-2025.pdf
//   https://www.miraltabank.com/wp-content/uploads/2023/02/Condiciones-para-operar-acciones.pdf
//
//   Commission, per order, each way
//     Spain, Germany, France, Portugal, Belgium, Netherlands, Italy, Finland
//                    0 – 6 000 €        6 €
//                    > 6 000,01 €       0.08 %
//     United Kingdom 0 – 6 000 £        5 £      > 6 000,01 £   0.08 %
//     Switzerland    0 – 6 000 CHF      6 CHF    > 6 000,01 CHF 0.08 %
//     AMEX / NYSE / NASDAQ
//                    < 20 000 $         6 $      > 20 000,1 $   0.10 %
//     Sweden 0.08 %, min 55 SEK. Denmark 0.08 %, min 55 DKK.
//     Norway 0.08 %, min 55 NOK. Hong Kong 0.08 %, min 150 HKD.
//   The table is printed as written: above the threshold the percentage is
//   the whole charge, so 6 001 € pays 4.80 €, less than 6 000 € does. No
//   minimum is printed for that band. NYSE Arca and Cboe BZX take the US
//   line. Dublin, Vienna and Toronto are tradable but not in the table
//   ("see the platform"): N/A.
//
//   Canon (Spain)  "Cánones de Bolsas y Mercados no incluidos." The
//                  conditions print the BME scale for shares (Tarifas BME
//                  2023): up to 300 € 1.10 €; 300–3 000 € 2.45 € + 2.4 bp;
//                  3 000–35 000 € 4.65 € + 1.2 bp; 35 000–70 000 €
//                  6.40 € + 0.7 bp; 70 000–140 000 € 9.20 € + 0.3 bp; above
//                  13.40 €. IBEX 35 names with a free float above 10 bn €
//                  pay 0.30 bp, min 1 €, instead — the catalogue cannot tell
//                  them apart, so the scale is used. No ETF canon is printed.
//   FX             conversions at the real-time rate ± 0.35 %. The account
//                  holds euros and, with the sub-account, dollars
//                  (deposits.mjs); any other currency pays it on each leg.
//   Taxes          stamp / FTT from taxMap.mjs. When the map has no line
//                  for the ISIN, the conditions' own pass-through: UK stamp
//                  0.5 % on a UK share bought, PTM 1 £ a side above
//                  10 000 £; Irish stamp 1 % on a purchase, ITP 1.25 € a side
//                  above 12 500 €. A GB/IE/FR/IT/ES share with no tax-map
//                  line is N/A (taxGap), so these UK and Irish stamp
//                  fallbacks no longer reach `usd`.
//   Hong Kong      the conditions print 0.13 % stamp and 0.00785 %, both
//                  outdated. Today's statutory charges are used instead, each
//                  side: stamp 0.1 % rounded up to the next HKD (none on an
//                  ETF, and not when the tax map has a line), SFC levy
//                  0.0027 %, AFRC levy 0.00015 %, HKEX trading fee 0.00565 %
//                  (minimum 0.01 HKD each, as in longbridgeFees.mjs).
//   SEC fee        charged on a US sale. The conditions print two superseded
//                  rates (23.10 $ and 5.10 $ per million); the current
//                  statutory 0.0000206 of the sale value is used.
//
// Custody 0.0133 % a month (min 1.66 €), 0.005 % in a month with one trade,
// none with two; telephone orders +20 €: remark only.
//
//   node brokers/bisontrade/bisontrade_cost.mjs SAN XMAD EUR --shares=500 --price=12.5
//   node brokers/bisontrade/bisontrade_cost.mjs AAPL XNAS USD --shares=10 --price=343
//   node brokers/bisontrade/bisontrade_cost.mjs HSBA XLON GBP --shares=100 --price=14.3
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("bisontrade-parsed.json", import.meta.url);
const PAGE = "https://www.miraltabank.com/wp-content/uploads/2025/02/Tarifas-BisonTrade-2025.pdf";
const CONDITIONS = "https://www.miraltabank.com/wp-content/uploads/2023/02/Condiciones-para-operar-acciones.pdf";
const READ_ON = "2026-10-18";
const HELD = new Set(["EUR", "USD"]);
const FX_EACH_WAY = 0.0035;

// Up to `upTo` a flat ticket, above it the percentage of the whole amount.
const band = (label, ccy, upTo, flat, rate) => ({ label, ccy, upTo, flat, rate });
// The percentage with a floor.
const floor = (label, ccy, rate, min) => ({ label, ccy, rate, min });

const EURO = (label) => band(label, "EUR", 6000, 6, 0.0008);
const SPAIN = EURO("España");
const US = band("AMEX/NYSE/NASDAQ", "USD", 20000, 6, 0.001);
const MARKETS = {
  XMAD: SPAIN,
  XETR: EURO("Alemania"),
  XFRA: EURO("Alemania"),
  XPAR: EURO("Francia"),
  XLIS: EURO("Portugal"),
  XBRU: EURO("Bélgica"),
  XAMS: EURO("Holanda"),
  XMIL: EURO("Italia"),
  XHEL: EURO("Finlandia"),
  XLON: band("Reino Unido", "GBP", 6000, 5, 0.0008),
  XSWX: band("Suiza", "CHF", 6000, 6, 0.0008),
  XSTO: floor("Suecia", "SEK", 0.0008, 55),
  XCSE: floor("Dinamarca", "DKK", 0.0008, 55),
  XOSL: floor("Noruega", "NOK", 0.0008, 55),
  XHKG: floor("Hong Kong", "HKD", 0.0008, 150),
  XNAS: US,
  XNYS: US,
  XASE: US,
  ARCX: US,
  BATS: US,
};

// BME share canon, Tarifas BME 2023 as printed in the conditions.
const BME_SCALE = [
  { upTo: 300, fixed: 1.1, bp: 0 },
  { upTo: 3000, fixed: 2.45, bp: 2.4 },
  { upTo: 35000, fixed: 4.65, bp: 1.2 },
  { upTo: 70000, fixed: 6.4, bp: 0.7 },
  { upTo: 140000, fixed: 9.2, bp: 0.3 },
  { upTo: Infinity, fixed: 13.4, bp: 0 },
];

const PASS_THROUGH = {
  ukStamp: 0.005,
  ptm: { each: 1, ccy: "GBP", above: 10000 },
  ieStamp: 0.01,
  itp: { each: 1.25, ccy: "EUR", above: 12500 },
};
// Statutory, today. Hong Kong: each side, in HKD. US: SEC on the sale.
const HK = { stamp: 0.001, sfc: 0.000027, afrc: 0.0000015, trading: 0.0000565, min: 0.01 };
const SEC = 0.0000206;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const ceilDollar = (amount) => Math.ceil(amount - 1e-6);
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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

// One side, in the market's currency.
export function commissionEach(amount, market) {
  if (amount == null) return null;
  if (market.min != null) return Math.max(market.min, amount * market.rate);
  return amount <= market.upTo ? market.flat : amount * market.rate;
}

export function bmeCanon(amountEur) {
  if (amountEur == null) return null;
  const row = BME_SCALE.find((r) => amountEur <= r.upTo);
  return row.fixed + (amountEur * row.bp) / 1e4;
}

// Stamp and levies, as fractions of the amount and flats in dollars.
function taxesFor({ listing, market, tax, notional }) {
  const fromMap = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const stock = listing.type === "STOCK";
  const country = String(listing.isin || "").slice(0, 2);
  const out = { pct: fromMap, flatUsd: 0, said: [] };
  if (fromMap) out.said.push(`taxe à l'achat ${(fromMap * 100).toFixed(2)} % depuis taxMap.mjs`);
  if (stock && country === "GB" && market?.ccy === "GBP") {
    const pounds = convert(notional, listing.currency, "GBP");
    if (!tax?.known) {
      out.pct += PASS_THROUGH.ukStamp;
      out.said.push("stamp duty 0,5 % à l'achat, répercuté selon les conditions (ISIN absent de taxMap.mjs)");
    }
    if (pounds == null) out.flatUsd = null;
    else if (pounds > PASS_THROUGH.ptm.above) {
      out.flatUsd = dollars(PASS_THROUGH.ptm.each * 2, PASS_THROUGH.ptm.ccy);
      out.said.push(`PTM ${PASS_THROUGH.ptm.each} £ par sens au-delà de ${PASS_THROUGH.ptm.above} £, tel qu'imprimé`);
    }
  }
  if (stock && country === "IE") {
    const euros = convert(notional, listing.currency, "EUR");
    if (!tax?.known) {
      out.pct += PASS_THROUGH.ieStamp;
      out.said.push("stamp duty irlandais 1 % à l'achat, selon les conditions (ISIN absent de taxMap.mjs)");
    }
    if (euros == null) out.flatUsd = null;
    else if (euros > PASS_THROUGH.itp.above && out.flatUsd != null) {
      out.flatUsd += dollars(PASS_THROUGH.itp.each * 2, PASS_THROUGH.itp.ccy);
      out.said.push(`ITP ${PASS_THROUGH.itp.each} € par sens au-delà de ${PASS_THROUGH.itp.above} €`);
    }
  }
  if (listing.mic === "XHKG") {
    const hkd = convert(notional, listing.currency, "HKD");
    const stamp = listing.type !== "ETF" && !fromMap;
    const side =
      hkd == null
        ? null
        : (stamp ? ceilDollar(hkd * HK.stamp) : 0) +
          Math.max(HK.min, hkd * HK.sfc) +
          Math.max(HK.min, hkd * HK.afrc) +
          Math.max(HK.min, hkd * HK.trading);
    const usd = side == null ? null : dollars(side * 2, "HKD");
    out.flatUsd = out.flatUsd == null || usd == null ? null : out.flatUsd + usd;
    out.said.push(
      `Hong Kong, barème légal actuel à chaque sens : ${stamp ? "timbre 0,1 % arrondi au HKD supérieur, " : ""}SFC 0,0027 %, AFRC 0,00015 %, frais HKEX 0,00565 %`
    );
  }
  if (market === US) {
    const sec = dollars(notional, listing.currency);
    out.flatUsd = out.flatUsd == null || sec == null ? null : out.flatUsd + sec * SEC;
    out.said.push("SEC 0,0000206 du montant à la vente (taux légal actuel)");
  }
  if (!out.said.length) out.said.push("aucune taxe dans taxMap.mjs pour cet ISIN");
  return out;
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
      "Custody is 0.0133% a month (min €1.66), 0.005% in a month with one trade, waived with two.",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue BisonTrade n'existe pas encore : lancer `node brokers/bisontrade/bisontrade_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BisonTrade` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BisonTrade`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "bisontrade",
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
  const market = MARKETS[code(m.venue?.mic || m.row.mic)] || null;
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
  const ticketText = !market
    ? ""
    : market.min != null
      ? `${(market.rate * 100).toLocaleString("fr-FR")} %, min ${market.min} ${market.ccy}`
      : `${market.flat} ${market.ccy} jusqu'à ${market.upTo.toLocaleString("fr-FR")} ${market.ccy}, ${(market.rate * 100).toLocaleString("fr-FR")} % au-delà`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: converts ? "EUR" : listing.currency,
    remark: converts || listing.currency === "EUR" ? answer.remark : `${answer.remark}\n${fxRemark((100 * FX_EACH_WAY).toFixed(2), listing.currency)}`,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    basis: market
      ? `tarif BisonTrade 2022 (brochure 2025), relu le ${READ_ON}, ${market.label} : ${ticketText} par ordre` +
        (spain && listing.type === "STOCK" ? ", plus le canon BME imprimé dans les conditions" : "") +
        (converts ? ", change ± 0,35 % par sens" : "")
      : `tarif BisonTrade 2022 (brochure 2025), relu le ${READ_ON}`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!market) {
    return {
      ...shared,
      why: `${listing.exchange} n'est pas dans la grille BisonTrade (« voir la plateforme ») : aucun courtage publié`,
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
  const canonEach = spain && listing.type === "STOCK" ? bmeCanon(convert(notional, listing.currency, "EUR")) : 0;
  const canonUsd = canonEach == null ? null : dollars(canonEach * 2, "EUR");
  const fxUsd = !converts ? 0 : notionalUsd == null ? null : notionalUsd * FX_EACH_WAY * 2;
  const brokerFees = plus(commissionUsd, canonUsd, fxUsd);
  const levies = taxesFor({ listing, market, tax, notional });
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null || levies.flatUsd == null ? null : notionalUsd * levies.pct + levies.flatUsd;
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
    commission: { each, currency: market.ccy, eachWay: true, schedule: market },
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
      ...levies.said,
      spain && listing.type === "STOCK"
        ? `canon BME ${finite(canonEach, 4)} € par sens (barème général ; les grandes valeurs de l'IBEX paient 0,30 pb, min 1 €)`
        : spain
          ? "canon BME des ETF non imprimé : hors total"
          : null,
      `conditions : ${CONDITIONS}`,
    ]
      .filter(Boolean)
      .join(" ; "),
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
