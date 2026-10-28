// What one round trip costs at first direct Sharedealing (HSBC UK; the
// Sharedealing account and the Stocks & Shares ISA): buy n shares at price
// p, sell them back at once, online, in dollars.
//
// The charges page and the "Interest rates and charges" sheet (G909,
// 24/09/26), read on 2026-10-26, print one online commission a trade:
//
//   "UK Equities"                 £10.50 a trade online (telephone £25)
//   "Transactions in Euro"        €30.00 a trade online (telephone €45)
//   "Frequent Trades - the first 9 trades within a calendar quarter are
//    subject to the standard online or telephone charge ... All subsequent
//    online trades (in UK equities only) during that calendar quarter will
//    be subject to the frequent user charge" of £7.95: the remark.
//   "Account Fee £10.50 per quarter (inclusive of VAT)", the ISA "at no
//    additional cost": the remark.
//   "Trading in Irish equities listed on the London Stock Exchange will
//    attract commission in Euros."
//
// The account is a sterling account; the sheet prints no exchange rate, no
// margin and no euro or dollar cash account for Sharedealing (the 2.99%
// "Foreign usage" on the same sheet is the debit card's, not a dealing
// rate, and HSBC InvestDirect's rates sheet prints none either). A line the
// LSE quotes in euros (Kerry, Glanbia, PTSB...) or dollars (Compass, IHG)
// forces a conversion whose rate is not published: that total is N/A.
// GBP and GBX lines are not converted.
//
// Stamp (SDRT 0.5%, Irish 1%) comes from the tax map; a GB or IE share with
// no tax-map line is N/A (taxGap). PTM is "£1.50" on "UK equity trades
// where the total consideration ... is greater than £10,000", a side, in a
// share of a UK, Channel Islands or Isle of Man company.
//
// Left out: stamp duty is charged on "consideration plus commission", the
// 0.5% of the £10.50 (5p) is not added; the £15 transfer-out fee.
//
//   https://www.firstdirect.com/savings-and-investments/sharedealing/sharedealing-services/
//   https://www.firstdirect.com/rates-and-charges/charges/
//   https://www.firstdirect.com/content/dam/wpb/fsdt/en/documents/pdf/rates-and-charges.pdf
//
//   node brokers/firstdirect/firstdirect_cost.mjs BP. XLON GBX --shares=115 --price=638.5
//   node brokers/firstdirect/firstdirect_cost.mjs KYGA XLON EUR --shares=9 --price=99
//   node brokers/firstdirect/firstdirect_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "firstdirect";
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);

const SCHEDULE = {
  charges: "https://www.firstdirect.com/rates-and-charges/charges/",
  service: "https://www.firstdirect.com/savings-and-investments/sharedealing/sharedealing-services/",
  pdf: "https://www.firstdirect.com/content/dam/wpb/fsdt/en/documents/pdf/rates-and-charges.pdf",
  readOn: "2026-10-26",
  guide: "G909 (24/09/26)",
  entity: "HSBC UK Bank plc (first direct)",
};

const CASH = "GBP";
const SHARE = 10.5;
const EURO = { each: 30, currency: "EUR" };
// No published conversion rate: a forced conversion is unknown.
const FX = null;
const PTM = { each: 1.5, above: 10000, countries: new Set(["GB", "JE", "GG", "IM"]) };
const UK_BOOKS = new Set(["XLON", "AQXE", "XMSM"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const toGbp = (amount, currency) => {
  const usd = toUsd(amount, currency);
  const perPound = usdPer(CASH);
  if (usd == null || !(perPound > 0)) return null;
  return usd / perPound;
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? listingKey({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);
  return { named, matches };
}

const REMARK = "Account fee £10.50 a quarter.\nFrom the 10th online trade in a quarter: £7.95 a trade.";

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
    url: SCHEDULE.charges,
  };

  if (!catalogue) {
    return { ...answer, why: `le catalogue first direct n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue first direct` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez first direct`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: FOLDER,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };
  const tradeCcy = listingCash(listing.currency);
  // The account holds pounds only: a held currency other than the pound
  // would be a remark, any other one is converted on both legs.
  const held = depositHas(FOLDER, null, tradeCcy);
  const foreign = tradeCcy !== CASH;
  const forcedFx = foreign && !held;
  // A euro deal pays the euro commission; any other line the sterling one.
  const euro = tradeCcy === EURO.currency;
  const each = euro ? EURO.each : SHARE;
  const commissionCcy = euro ? EURO.currency : CASH;
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const partsBook = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const mic = String(m.row.mic || listing.mic || "").toUpperCase();
  const tax = listing.isin ? taxesOf(listing.isin) : null;
  // UK stamp is a London charge: a GB share dealt abroad pays none here.
  const rates = Object.fromEntries(
    Object.entries(taxRates(tax)).filter(([name]) => UK_BOOKS.has(mic) || !/^STAMP_DUTY$/.test(name))
  );
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const gap = taxGap(listing.isin, listing.type, mic);
  const shared = {
    ...answer,
    listing,
    remark: [REMARK, foreign && held ? fxRemark("", listing.currency) : ""].filter(Boolean).join("\n"),
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème first direct Sharedealing, en ligne, page des frais et fiche ${SCHEDULE.guide} relues le ${SCHEDULE.readOn}. Courtage ${euro ? `${EURO.each} € par ordre (« Transactions in Euro »)` : `${SHARE} £ par ordre (9 premiers ordres du trimestre)`}.`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  if (notional == null) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs",
    };
  }

  const notionalUsd = dollars(notional, listing.currency);
  const pounds = toGbp(notional, listing.currency);
  const fxEach = !forcedFx ? 0 : FX == null || pounds == null ? null : pounds * FX;
  const commissionUsd = dollars(each * 2, commissionCcy);
  const fxGbp = fxEach == null ? null : fxEach * 2;
  const ptmShare = String(listing.type || "").toUpperCase() === "STOCK" && PTM.countries.has((listing.isin || "").slice(0, 2));
  const ptmDue = !ptmShare ? false : pounds == null ? null : pounds > PTM.above;
  const ptmGbp = ptmDue ? PTM.each * 2 : ptmDue === false ? 0 : null;
  const bookUsd =
    partsBook.a == null || notionalUsd == null
      ? null
      : partsBook.b == null
        ? null
        : partsBook.a * notionalUsd + partsBook.b * n;
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const fxUsd = fxGbp == null ? null : dollars(fxGbp, CASH);
  const ptmUsd = ptmGbp == null ? null : dollars(ptmGbp, CASH);
  const brokerFees = plus(commissionUsd, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd, ptmUsd);

  const why = forcedFx && FX == null
    ? `compte en livres : une ligne en ${listing.currency} impose un change dont first direct ne publie pas le taux`
    : bookUsd == null
      ? `aucun carnet pour ${m.unsourced?.name || listing.exchange || "cette ligne"} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : gap || null;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { each, currency: commissionCcy, eachWay: true, ...(forcedFx ? { fx: FX } : {}) },
    ...(why ? { why } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(plus(taxUsd, ptmUsd), 6),
      change: finite(fxUsd, 6),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, share: SHARE, euro: EURO, fx: FX, ptm: { ...PTM, countries: [...PTM.countries] }, cash: CASH }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}
