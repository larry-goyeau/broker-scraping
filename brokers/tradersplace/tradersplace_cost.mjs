// What one round trip costs at Traders Place: buy n shares at price p,
// sell them back at once, in dollars. A single order, not a savings
// plan. Derivatives, bonds and crypto are other lines.
//
// Price card read on 2026-10-14.
//   https://tradersplace.de/konditionen/deine-konditionen
//
// gettex and Baader Trading (Direkthandel), shares, ETFs, funds:
//   order value of at least €500     €0 a side (the €3.15 is rebated)
//   order value under €500           €0.95 a side
// Tradegate                            €5 a side
// Lang & Schwarz Exchange              €6 a side
// Xetra                                €2 + 0.01% of the order, and that
//                                      0.01% is at least €3, each side,
//                                      plus the exchange fee Baader
//                                      rebills: another 0.01%, at least
//                                      €1.50
// Other German venues                  €5.50 a side, plus the exchange's
//                                      own fee. Baader is the member, so
//                                      Frankfurt uses High Volume.
//   High Volume on the Frankfurt floor is 0.960 bp, minimum €0.60, plus
//   the specialist (5.04 bp, minimum €2.52). Düsseldorf, Munich, Hamburg
//   and Hannover publish one order fee, not four models, so that single
//   fee is used. Stuttgart prices the order, n times the price, in three
//   bands.
//   https://www.boerse-stuttgart.de/media/xdklhyiu/20022024bersicht-gebhren-und-entgeltstruktur.pdf
// A foreign venue is €3 plus the Baader line, each side. The Baader
// line is a percentage of the order with a minimum in the listing
// currency. A venue the card does not name is billed from Baader's own
// price list, document 45.000 of 1 May 2023. OTC Markets is that case:
// the USA line, 0.40% of the order, minimum $40.
// https://www.datocms-assets.com/146209/1746170961-plv.pdf
// FX, when the cash is not euros, is the maximum bid-ask span on the
// card. Under €50,000 that span is 30 pips on EUR against USD, CHF, GBP,
// CAD, AUD, NZD and JPY, and 200 pips against HKD, SEK, NOK and DKK. From
// €50,000 to €500,000 it is 20 and 100 pips, and above €500,000 it is 10
// and 50. The remark is half that span over the euro mid, because the
// customer is filled on one side: "FX 0.129% when cash ≠ USD" for a dollar
// order under €50,000. A currency the card does not name is on request, so
// the remark names no rate. The spread stays out of the total: a currency
// account can hold the listing currency.
// https://tradersplace.de/konditionen/deine-konditionen
//
//   node brokers/tradersplace/tradersplace_cost.mjs AAPL Nasdaq USD --shares=10 --price=230
//   node brokers/tradersplace/tradersplace_cost.mjs SAP Xetra EUR --shares=10 --price=200
//   node brokers/tradersplace/tradersplace_cost.mjs SAP gettex EUR --shares=1 --price=200
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf, VENUES } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("tradersplace-parsed.json", import.meta.url);
const PAGE = "https://tradersplace.de/konditionen/deine-konditionen";
const READ_ON = "2026-10-14";
const CASH = "EUR";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) =>
  String(s || "")
    .toUpperCase()
    .replaceAll("Ä", "AE")
    .replaceAll("Ö", "OE")
    .replaceAll("Ü", "UE")
    .replaceAll("ß", "SS")
    .replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const euros = (amount, currency) => {
  if (code(currency) === "EUR") return amount;
  const usd = dollars(amount, currency);
  const per = usdPer("EUR");
  if (usd == null || !(per > 0)) return null;
  return usd / per;
};

// Baader's percentage, with its minimum, then Traders Place's flat euros.
const FOREIGN = {
  us: { rate: 0.00015, min: 4.25, ccy: "USD" },
  ch: { rate: 0.00025, min: 6.5, ccy: "CHF" },
  au: { rate: 0.001, min: 40, ccy: "AUD" },
  be: { rate: 0.001, min: 11.5, ccy: "EUR" },
  dk: { rate: 0.001, min: 315, ccy: "DKK" },
  fi: { rate: 0.001, min: 31.5, ccy: "EUR" },
  fr: { rate: 0.001, min: 11.5, ccy: "EUR" },
  gr: { rate: 0.002, min: 80, ccy: "EUR" },
  hk: { rate: 0.001, min: 500, ccy: "HKD" },
  it: { rate: 0.001, min: 11.5, ccy: "EUR" },
  ie: { rate: 0.001, min: 21.5, ccy: "EUR" },
  jp: { rate: 0.001, min: 3000, ccy: "JPY" },
  ca: { rate: 0.001, min: 25, ccy: "CAD" },
  nz: { rate: 0.0015, min: 150, ccy: "NZD" },
  nl: { rate: 0.001, min: 11.5, ccy: "EUR" },
  no: { rate: 0.001, min: 315, ccy: "NOK" },
  at: { rate: 0.0006, min: 12, ccy: "EUR" },
  pt: { rate: 0.001, min: 11.5, ccy: "EUR" },
  se: { rate: 0.001, min: 315, ccy: "SEK" },
  sg: { rate: 0.0015, min: 150, ccy: "SGD" },
  es: { rate: 0.001, min: 21.5, ccy: "EUR" },
  za: { rate: 0.0015, min: 500, ccy: "ZAR" },
  uk: { rate: 0.00025, min: 11.5, ccy: "GBP" },
};

const FLOOR = {
  FRANKFURT: "frankfurt",
  STUTTGART: "stuttgart",
  DUSSELDORF: "dusseldorf",
  DUESSELDORF: "dusseldorf",
  MUNCHEN: "munich",
  MUENCHEN: "munich",
  HAMBURG: "hamburg",
  HANNOVER: "hannover",
};

export function scheduleOf(exchange) {
  const key = loose(exchange);
  if (key === "GETTEX" || key === "BAADERBANK" || key === "DIREKTHANDEL") return { id: "gettex" };
  if (key === "TRADEGATE" || key === "TRADEGATEBSX" || key === "XGAT") return { id: "tradegate" };
  if (key === "LANGSCHWARZ" || key === "LSEXCHANGE" || key === "LSEX" || key === "LSX") return { id: "lsx" };
  if (key === "XETRA" || key === "XETR") return { id: "xetra" };
  if (FLOOR[key]) return { id: FLOOR[key] };
  if (key === "OTCMARKETS") return { id: "otc" };
  if (key === "NASDAQ" || key === "NYSE" || key === "NYSEMKTCTAAMEX" || key === "AMEX" || key === "ARCA") return { id: "us" };
  if (key === "SIX" || key === "SIXSWISSEXCHANGE" || key === "XSWX") return { id: "ch" };
  if (key === "TORONTO" || key === "TSX" || key === "XTSE") return { id: "ca" };
  if (key === "WIEN" || key === "XWBO" || key === "VIENNA") return { id: "at" };
  return FOREIGN[key] ? { id: key } : null;
}

// Place fee on top of the €5.50 ticket. Baader chooses one Deutsche Börse
// model for Xetra and the Frankfurt floor. High Volume is the one that
// pays at its size: 0.960 bp, minimum €0.60. The other floors do not sell
// four volume models; each line below is the single order fee that
// exchange prints. VAT is added only where that price list says the fee
// is plus VAT. Stuttgart's range has no named step.
const VAT = 1.19;
const clamp = (value, min, cap) => Math.min(cap, Math.max(value, min));
const FLOOR_FEE = {
  // Deutsche Börse price list, 1 July 2026, MIC XFRA. Transaction fee,
  // High Volume, equities quoted per unit, capped at a €750,000 order.
  // Specialist fee has no model. No VAT since 1 July 2021.
  frankfurt(eur) {
    const txn = Math.max(Math.min(eur, 750000) * 0.000096, 0.6);
    const specialist = Math.max(eur * 0.000504, 2.52);
    return txn + specialist;
  },
  // BÖAG price list, Düsseldorf, 1 January 2024. Shares: 3.8 bp,
  // minimum €1.30. The share row prints no cap. Plus VAT.
  dusseldorf: (eur) => Math.max(eur * 0.00038, 1.3) * VAT,
  // Börse München, 2026 fee model: 0.029%, minimum €1.30, maximum €14,
  // plus VAT. Specialist courtage 0.8‰, minimum €0.75, and that one
  // is a maximum the specialist may charge.
  munich(eur) {
    const txn = clamp(eur * 0.00029, 1.3, 14) * VAT;
    const courtage = Math.max(eur * 0.0008, 0.75);
    return txn + courtage;
  },
  // BÖAG price list for a bank's order, Hamburg and Hannover.
  // 0.25‰, minimum €1.30, maximum €11, plus VAT.
  hamburg: (eur) => clamp(eur * 0.00025, 1.3, 11) * VAT,
  hannover: (eur) => clamp(eur * 0.00025, 1.3, 11) * VAT,
  // Börse Stuttgart, price overview of 19 Feb 2024, MIC XSTU. The band
  // is the order, shares times price. A DAX share is a cheaper table;
  // the row does not say DAX, so a share uses the other-share line.
  stuttgart(eur, row) {
    const kind = code(row?.type);
    const steps = kind === "ETF" || kind === "ETP" || kind === "ETC" || kind === "ETN" ? STUTTGART_ETP : STUTTGART_SHARE;
    const hit = steps.find((step) => eur <= step.to);
    let fee = eur * hit.rate;
    if (hit.min != null) fee = Math.max(fee, hit.min);
    if (hit.max != null) fee = Math.min(fee, hit.max);
    return fee;
  },
};

const STUTTGART_SHARE = [
  { to: 15000, rate: 0.00095, min: 2.73, max: 63 },
  { to: 50000, rate: 0.00075, min: 14.25, max: 63 },
  { to: Infinity, rate: 0.0007, min: 37.5, max: 63 },
];
const STUTTGART_ETP = [
  { to: 12100, rate: 0.001, min: null, max: null },
  { to: 100000, rate: 0.0004, min: 12.1, max: null },
  { to: Infinity, rate: 0.0001, min: 40, max: null },
];

// Maximum bid-ask span, in pips, for an order of this many euros.
// The card's three bands. An unknown size uses the widest.
const FX_TIGHT = new Set(["USD", "CHF", "GBP", "CAD", "AUD", "NZD", "JPY"]);
const FX_WIDE = new Set(["HKD", "SEK", "NOK", "DKK"]);

function fxPips(currency, notionalEur) {
  const wide = FX_WIDE.has(currency);
  if (!wide && !FX_TIGHT.has(currency)) return null;
  const small = wide ? 200 : 30;
  if (!(notionalEur > 0) || notionalEur < 50000) return small;
  if (notionalEur <= 500000) return wide ? 100 : 20;
  return wide ? 50 : 10;
}

function fxNote(currency, notionalEur) {
  const cash = listingCash(currency);
  if (!cash || cash === "EUR") return "";
  const pips = fxPips(cash, notionalEur);
  const per = usdPer(cash);
  const eur = usdPer("EUR");
  if (pips == null || !(per > 0) || !(eur > 0)) return fxRemark("", currency);
  // Units of the listing currency for one euro. A yen pip is a hundredth.
  const spot = eur / per;
  const pip = cash === "JPY" ? 0.01 : 0.0001;
  const half = ((pips * pip) / 2 / spot) * 100;
  return fxRemark(half.toFixed(3), currency);
}

function sideEuro(id, notional, currency, row) {
  if (id === "gettex") {
    const eur = euros(notional, currency);
    if (eur == null) return null;
    return eur < 500 ? 0.95 : 0;
  }
  if (id === "tradegate") return 5;
  if (id === "lsx") return 6;
  if (id === "otc") {
    const pctUsd = dollars(notional * 0.004, currency);
    if (pctUsd == null) return null;
    return euros(Math.max(pctUsd, 40), "USD");
  }
  if (FLOOR_FEE[id]) {
    const eur = euros(notional, currency);
    if (eur == null) return null;
    const place = FLOOR_FEE[id](eur, row);
    if (place == null) return 5.5;
    return 5.5 + place;
  }
  if (id === "xetra") {
    const variable = euros(notional * 0.0001, currency);
    if (variable == null) return null;
    // The 0.01% with a €3 floor is Baader's commission. The same 0.01%
    // with a €1.50 floor is the exchange fee Baader rebills.
    // Sonderkonditionen, Baader Bank, May 2023, line XETRA Frankfurt.
    // Smartbroker+, still at Baader, prints the same floor in 2026.
    return 2 + Math.max(variable, 3) + Math.max(variable, 1.5);
  }
  const rule = FOREIGN[id];
  if (!rule) return null;
  const baader = Math.max(notional * rule.rate, rule.min);
  const baaderEuro = euros(baader, rule.ccy);
  if (baaderEuro == null) return null;
  return 3 + baaderEuro;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? listingKey({ exchange: place, mic: place }).venue : null;
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
  if (wantPlace) {
    matches.sort((a, b) => (loose(a.row.exchange) === wantPlace ? 0 : 1) - (loose(b.row.exchange) === wantPlace ? 0 : 1));
  }
  return { named, matches };
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
    cashCurrency: CASH,
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Traders Place n'existe pas encore : lancer `node brokers/tradersplace/tradersplace_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Traders Place` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Traders Place`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const schedule = scheduleOf(m.row.exchange);
  // "Frankfurt" resolves to Xetra. Traders Place means the floor.
  const floorMic = loose(m.row.exchange) === "FRANKFURT" ? "XFRA" : null;
  const floor = floorMic ? VENUES.find((v) => v.mic === floorMic) : null;
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: floorMic || m.venue?.mic || null,
    currency: m.row.currency,
    unsourced: floorMic ? null : m.unsourced,
    broker: "tradersplace",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? floorMic ?? m.venue?.mic ?? null,
    exchange: floor?.name ?? m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const sized = Number(shares) > 0 && Number(price) > 0 ? euros(Number(shares) * Number(price), listing.currency) : null;
  const remark = fxNote(listing.currency, sized);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    feeMarket: schedule?.id || null,
    venueAuthoritative: Boolean(floorMic),
    remark,
    bp: marketBp,
    perShare: marketPerShare,
    basis: schedule
      ? `barème relu le ${READ_ON}, ${listing.brokerExchange}`
      : "pas de ticket Traders Place pour cette place",
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!schedule) return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'a pas de tarif Traders Place` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = sideEuro(schedule.id, notional, listing.currency, m.row);
  const brokerFees = side == null ? null : dollars(side * 2, CASH);
  const bookUsd =
    marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null ? { why: `aucun carnet pour ${listing.exchange}` } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { sideEuro: side, currency: CASH, eachWay: true },
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
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  console.log(JSON.stringify(roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : 0,
  }), null, 2));
}

printCli();
