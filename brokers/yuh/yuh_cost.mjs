// What one round trip costs at Yuh: buy n shares at price p in the app,
// sell them straight back, in dollars. Yuh is an app only (no branch, no
// phone desk); the account, custody and execution are Swissquote Bank
// Ltd's, a Swiss securities dealer.
//
// Price list read on 2026-10-21:
//   https://www.yuh.com/en/pricing/
//   https://www.yuh.com/en/app/invest/          (same table, "An investment
//                                                app without hidden fees")
//   https://www.yuh.com/en/app/invest/etfs/     (FAQ: "a transaction fee of
//                                                0.5% (0.35% or 0.25%
//                                                depending on the order
//                                                amount) will be applied to
//                                                your order", 1 000 CHF ->
//                                                5 CHF, minimum 1 CHF)
//   https://www.yuh.com/en/app/invest/etf-savings-plan/
//
//   Securities (shares, ETFs including ETPs, Themes), each order, buy and
//   sell. The band is set by the order's amount in CHF ("Trading volumes
//   and fees are calculated in CHF or the equivalent value in other
//   currencies") and its rate applies to the whole order:
//     up to 10 000 CHF                 0.50 %
//     10 000.01 to 20 000 CHF          0.35 %
//     above 20 000 CHF                 0.25 %
//     minimum                          1 CHF an order
//   Custody                            free
//   Currency exchange                  0.95 % on the interbank rate
//   Recurring buy orders on the eligible ETFs (the savings-plan list):
//                                      no buy commission; stamp and the
//                                      sell commission stay.
//
// Swiss federal transfer stamp (Umsatzabgabe), StG art. 13, 16 and 19:
// 1.5 per mille on Swiss documents and 3 per mille on foreign ones; the
// dealer owes half for each party that is not a dealer, so the client pays
// 0.075 % (CH ISIN) or 0.15 % (any other ISIN) on the buy and on the sell,
// whatever the exchange. Yuh's table says stamp duties "may still apply";
// the rate is the law's.
//   https://www.fedlex.admin.ch/eli/cc/1974/11_11_11/en
// Other transaction taxes (UK stamp, French, Italian and Spanish FTT) come
// from taxMap.mjs by ISIN; a share of a taxing country with no tax line is
// N/A (taxGap). US SEC / TAF and other "government fees" are not printed
// with a rate and stay at 0, as in the other files.
//
// FX: the account holds the 13 currencies of the app (CHF, USD, EUR, GBP,
// JPY, AUD, CAD, SEK, HKD, NOK, DKK, AED, SGD; deposits.mjs). Every
// listing in the catalogue is in one of them, so the 0.95 % is a remark,
// not in the total. A listing outside them would convert both ways and
// carries the 0.95 % in the total.
//
// US book: Yuh and Swissquote name no US dealer and there is no Rule 606
// for them, so a US line takes the quoted NBBO (spreadLeaf with no Q).
//
// In the total: the book, the commission each way, the Swiss stamp each
// way, the taxMap tax. Remarks: FX 0.95 % when cash is not the listing
// currency; for an eligible ETF, how much lower a recurring buy is.
//
//   node brokers/yuh/yuh_cost.mjs NESN XSWX CHF --shares=10 --price=80
//   node brokers/yuh/yuh_cost.mjs VWRL XSWX CHF --shares=200 --price=130
//   node brokers/yuh/yuh_cost.mjs AAPL XNAS USD --shares=1 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { isListedUsTape, listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "yuh";
const LABEL = "Yuh";
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);
const PAGE = "https://www.yuh.com/en/pricing/";
const READ_ON = "2026-10-21";
const FEE_CCY = "CHF";

// Rate for the whole order, by its amount in CHF.
const BANDS = [
  { upTo: 10000, rate: 0.005 },
  { upTo: 20000, rate: 0.0035 },
  { upTo: Infinity, rate: 0.0025 },
];
const MIN_CHF = 1;
const FX_RATE = 0.0095;
const STAMP_CH = 0.00075;
const STAMP_FOREIGN = 0.0015;

// The savings-plan list (etf-savings-plan page, 2026-10-21): the
// TradingView symbols it prints, plus IWDC and CSSMI, named in its list
// on SIX in francs. The Leonteq / FuW ETPs (BRENT, WTIU, COPC, FUW50) and
// the crypto ETPs are not in the catalogue.
const PLAN_FREE = new Set(
  [
    "XSWX:VWRL:CHF", "XSWX:IWDC:CHF", "XSWX:EQCH:CHF", "XSWX:VHYL:CHF", "XSWX:CSSMI:CHF",
    "XSWX:BCHE:CHF", "XSWX:V3AA:CHF", "XSWX:FWCA:CHF", "XSWX:VAGX:CHF", "XSWX:ZGLD:CHF",
    "XSWX:ZSIL:CHF", "XSWX:SWCSS:CHF", "XSWX:VWRA:CHF", "XSWX:VHYA:CHF", "XSWX:SWCSW:CHF",
    "XSWX:XDPU:CHF", "XSWX:XMME:CHF", "XSWX:XDUE:CHF", "XSWX:XAIX:CHF", "XSWX:NCLR:USD",
    "XSWX:WMGT:USD", "XSWX:SWCSU:USD", "XSWX:SWCSE:EUR", "XETR:XDEF:EUR",
  ]
);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const pctText = (rate) => `${Number((rate * 100).toFixed(3))}`.replace(".", ",");

function convert(amount, from, to) {
  if (code(from) === code(to)) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
}

export function bandOf(amountChf) {
  if (!(amountChf > 0)) return null;
  return BANDS.find((b) => amountChf <= b.upTo) || null;
}

// One order's commission in CHF.
export function commissionChf(amountChf) {
  const band = bandOf(amountChf);
  if (!band) return null;
  return Math.max(MIN_CHF, amountChf * band.rate);
}

export function stampOf(isin) {
  return code(isin).startsWith("CH") ? STAMP_CH : STAMP_FOREIGN;
}

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
      if (loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

const converts = (currency) => !depositHas(FOLDER, null, listingCash(currency));

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${LABEL} n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${LABEL}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${LABEL}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const mic = m.venue?.mic ?? (code(m.row.mic) || null);
  const usTape = isListedUsTape(mic) && code(m.row.currency) === "USD";
  // No US dealer named by Yuh or Swissquote: no Q, the quoted NBBO.
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: FOLDER,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? mic,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const cash = listingCash(listing.currency);
  const forced = converts(listing.currency);
  const stamp = stampOf(listing.isin);
  const planFree = PLAN_FREE.has(`${code(m.row.mic)}:${code(m.row.ticker)}:${listing.currency}`);
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    cashCurrency: forced ? FEE_CCY : cash,
    basis:
      `${LABEL}, tarif en ligne (yuh.com/en/pricing) relu le ${READ_ON} : 0,50 % jusqu'à 10 000 CHF, ` +
      `0,35 % de 10 000,01 à 20 000 CHF, 0,25 % au-delà, sur tout l'ordre, minimum 1 CHF, à l'achat et à la vente. ` +
      `Droit de timbre fédéral ${pctText(stamp)} % par sens (${stamp === STAMP_CH ? "titre suisse" : "titre étranger"}).` +
      (forced ? " Change 0,95 % dans les deux sens." : ""),
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: FX_RATE,
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const amountChf = convert(notional, listing.currency, FEE_CCY);
  const each = amountChf == null ? null : commissionChf(amountChf);
  const band = bandOf(amountChf);
  const commissionUsd = each == null ? null : dollars(each * 2, FEE_CCY);
  const fxUsd = forced ? (notionalUsd == null ? null : notionalUsd * FX_RATE * 2) : 0;
  const brokerFees = plus(commissionUsd, fxUsd);

  const stampUsd = notionalUsd == null ? null : notionalUsd * stamp * 2;
  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxPct = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const mapTaxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;
  const taxUsd = plus(stampUsd, mapTaxUsd);

  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: usTape && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: usTape ? null : m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const unknown = [
    notionalUsd == null || amountChf == null ? `aucun cours en dollars pour ${listing.currency} ou CHF dans fx.mjs` : null,
    bookUsd == null && notionalUsd != null
      ? usTape
        ? "pas de relevé NBBO pour cette ligne"
        : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    gap,
  ].filter(Boolean);

  const remarks = [];
  if (!forced) remarks.push(fxRemark((100 * FX_RATE).toFixed(2), listing.currency));
  if (planFree && each != null && amountChf > 0) {
    remarks.push(`Recurring buy is ${Number(((each / amountChf) * 100).toFixed(2))}% lower.`);
  }

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency, amountChf: finite(amountChf, 6) },
    remark: remarks.join(" "),
    commission: {
      each: finite(each, 6),
      eachWay: true,
      currency: FEE_CCY,
      rate: band?.rate ?? null,
      min: MIN_CHF,
      stamp,
      planFree,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      each != null ? `${Number(each.toFixed(2))} CHF par sens${each === MIN_CHF ? " (minimum)" : ` (${pctText(band.rate)} %)`}` : null,
      forced ? "devise hors des 13 du compte : change 0,95 % dans les deux sens" : `ligne en ${cash}, devise du compte : change en remarque`,
      usTape ? "carnet NBBO coté : aucun courtier américain nommé, pas de 606" : null,
      taxPct ? `taxe à l'achat ${(taxPct * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune autre taxe dans taxMap.mjs pour cet ISIN",
      planFree ? "ETF du plan d'épargne : achat récurrent sans courtage (remarque)" : null,
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
