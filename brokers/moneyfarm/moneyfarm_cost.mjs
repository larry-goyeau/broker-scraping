// What one round trip costs at Moneyfarm Share Investing (UK DIY account,
// General Investment Account or Stocks & Shares ISA): buy n shares at
// price p, sell them back at once, online, in dollars.
//
// The Share Investing and pricing pages, read on 2026-10-26, print one
// flat fee a trade, "Regardless of the size of your trade":
//
//   "Trades on US and UK Shares, ETFs & Mutual Funds"   £3.95 a trade
//   "Trades on Bonds and EU Shares"                     £5.95 a trade
//   "Currency conversion fees"   0.70%   "Foreign currency exchange"
//
// The page's own £15,000 example charges the £3.95 and the 0.70% (£105)
// on the one trade, so both are a side. Every line here is a London line;
// a share of an EU issuer (Kerry, Glanbia, PTSB, Greencoat Renewables...,
// ISIN of an EU state) is read as an "EU Share" and takes the £5.95, the
// higher of the two readings; any other share, ETF or ETC takes £3.95.
//
// The account is funded in pounds only (bank transfer or Direct Debit
// from a UK account in the client's name): a line quoted in dollars or
// euros (Compass, IHG, Kerry, SPY5...) is converted on both legs, so the
// 0.70% is in the total. A GBP or GBX line is not converted.
//
// Stamp (SDRT 0.5%, Irish 1%) comes from the tax map; a GB or IE share with
// no tax-map line is N/A (taxGap). PTM: the page says "£1" on a buy or sell
// "for over £10,000", but its own cost table shows £1.50, the levy's
// current rate; £1.50 a side on a deal above £10,000 in a share of a UK,
// Channel Islands or Isle of Man company.
//
// Left out: the ISA custody fee, "0.35% applies (capped at £45 a year)"
// (none on the GIA), which is the remark; fund ongoing charges.
//
//   https://www.moneyfarm.com/uk/share-investing/
//   https://www.moneyfarm.com/uk/pricing/
//
//   node brokers/moneyfarm/moneyfarm_cost.mjs BP. XLON GBX --shares=200 --price=400
//   node brokers/moneyfarm/moneyfarm_cost.mjs KYGA XLON EUR --shares=10 --price=85
//   node brokers/moneyfarm/moneyfarm_cost.mjs --schedule
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

const FOLDER = "moneyfarm";
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);

const SCHEDULE = {
  charges: "https://www.moneyfarm.com/uk/share-investing/",
  pricing: "https://www.moneyfarm.com/uk/pricing/",
  readOn: "2026-10-26",
  entity: "MFM Investment Ltd (Moneyfarm)",
};

const CASH = "GBP";
const SHARE = 3.95;
const EU_SHARE = 5.95;
const FX = 0.007;
const PTM = { each: 1.5, above: 10000, countries: new Set(["GB", "JE", "GG", "IM"]) };
const UK_BOOKS = new Set(["XLON", "AQXE", "XMSM"]);
const EU = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);

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

const REMARK = "ISA custody fee 0.35% a year, capped at £45.";

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
    return { ...answer, why: `le catalogue Moneyfarm n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Moneyfarm` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Moneyfarm`,
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
  const euShare = String(listing.type || "").toUpperCase() === "STOCK" && EU.has((listing.isin || "").slice(0, 2));
  const each = euShare ? EU_SHARE : SHARE;
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
    remark: [REMARK, foreign && held ? fxRemark((100 * FX).toFixed(2), listing.currency) : ""].filter(Boolean).join("\n"),
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Moneyfarm Share Investing, en ligne, pages des frais relues le ${SCHEDULE.readOn}. Courtage ${each} £ par ordre${euShare ? " (action d'un émetteur de l'UE, ligne « EU Shares »)" : ""}, change ${100 * FX} % par sens sur une ligne hors livre.`,
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
  const fxEach = !forcedFx ? 0 : pounds == null ? null : pounds * FX;
  const commissionGbp = each * 2;
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
  const commissionUsd = dollars(commissionGbp, CASH);
  const fxUsd = fxGbp == null ? null : dollars(fxGbp, CASH);
  const ptmUsd = ptmGbp == null ? null : dollars(ptmGbp, CASH);
  const brokerFees = plus(commissionUsd, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd, ptmUsd);

  const why =
    bookUsd == null
      ? `aucun carnet pour ${m.unsourced?.name || listing.exchange || "cette ligne"} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : gap || null;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { each, currency: CASH, eachWay: true, ...(forcedFx ? { fx: FX } : {}) },
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
    console.log(JSON.stringify({ ...SCHEDULE, share: SHARE, euShare: EU_SHARE, fx: FX, ptm: { ...PTM, countries: [...PTM.countries] }, cash: CASH }, null, 2));
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
