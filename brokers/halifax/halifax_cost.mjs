// What one round trip costs at Halifax: buy n shares at
// price p, sell them back at once, online, in dollars.
//
// Costs and charges guide HX00068A (09/24), read on 2026-10-08. The same
// online share charge is what the worked examples use for the Share Dealing
// Account, the ISA and the SIPP. A regular investment is free. A dividend
// reinvestment is 2% of the dividend, capped at £9.50. A TradePlan takes
// £2 off the dealing commission. None of those is
// this trip. There is no frequent-trader rate and no Private Banking rate.
//
//   UK share, ETF, ETC, ETN, trust, fund   £9.50 a side
//   international line                     £0, plus 1.25% of the sterling
//                                          value each way
//
// Funds are in that £9.50 line and are not in this catalogue. The account
// holds pounds. A foreign price is converted on the deal, so the FX is
// inside the broker fee. A GBP or GBX line is not converted. Inga's example
// is four overseas trades of £5,000 and £250 of FX, which is 1.25% once per
// trade. The account charge is £36 a year, free for an 18–25 year old, and
// stays off the ticket. Stamp and FTT come from the tax map. PTM is £1.50
// a side on a UK share deal above £10,000, which the tax map does not price
// as a flat.
//
// The order form names the market (LSE, NASDAQ, XETRA). That book is the
// spread. The visible "Trading on" line is not. A US line takes Banca IMI's
// US broker-dealer 606 (Intesa Sanpaolo IMI Securities Corp.) on the blended
// 605. A European book stays in basis points.
//
//   https://www.halifax.co.uk/investing/start-investing/share-dealing-services/charges.html
//   https://www.halifax.co.uk/assets/pdf/filestore/costandcharges.pdf
//
//   node brokers/halifax/halifax_cost.mjs 1947 LSE GBX --shares=10 --price=9.75
//   node brokers/halifax/halifax_cost.mjs AAPL --shares=10 --price=230
//   node brokers/halifax/halifax_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("halifax-parsed.json", import.meta.url);

const SCHEDULE = {
  charges: "https://www.halifax.co.uk/investing/start-investing/share-dealing-services/charges.html",
  pdf: "https://www.halifax.co.uk/assets/pdf/filestore/costandcharges.pdf",
  readOn: "2026-10-08",
  guide: "HX00068A (09/24)",
  entity: "Halifax Share Dealing Limited",
};

const CASH = "GBP";
const SHARE = 9.5;
const FX = 0.0125;
const PTM = { each: 1.5, above: 10000 };
const REMARK =
  "Account charge £36 a year, free for an 18–25 year old. A regular investment is free. Dividend reinvestment fees is 2% of the dividend, capped at £9.50.";

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

const sterling = (currency) => {
  const c = String(currency || "").toUpperCase();
  return c === "GBP" || c === "GBX";
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
    remark: REMARK,
  };

  if (!catalogue) {
    return { ...answer, why: "le catalogue Halifax n'existe pas encore : lancer `node brokers/halifax/halifax_scraping.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Halifax` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Halifax`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "halifax",
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
  const foreign = !sterling(listing.currency);
  const each = foreign ? 0 : SHARE;
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
  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Halifax en ligne, guide ${SCHEDULE.guide} relu le ${SCHEDULE.readOn}. Courtage ${SHARE} £ par sens.`,
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
  const fxEach = !foreign ? 0 : pounds == null ? null : pounds * FX;
  const commissionGbp = each * 2;
  const fxGbp = fxEach == null ? null : fxEach * 2;
  const ukShare = !foreign && String(listing.type || "").toUpperCase() === "STOCK" && String(listing.isin || "").startsWith("GB");
  const ptmDue = !ukShare ? false : pounds == null ? null : pounds > PTM.above;
  const ptmGbp = ptmDue ? PTM.each * 2 : ptmDue === false ? 0 : null;
  const bookUsd =
    partsBook.a == null || notionalUsd == null
      ? null
      : partsBook.b == null
        ? null
        : partsBook.a * notionalUsd + partsBook.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const commissionUsd = dollars(commissionGbp, CASH);
  const fxUsd = fxGbp == null ? null : dollars(fxGbp, CASH);
  const ptmUsd = ptmGbp == null ? null : dollars(ptmGbp, CASH);
  const brokerFees = plus(commissionUsd, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd, ptmUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { each, currency: CASH, eachWay: true, ...(foreign ? { fx: FX } : {}) },
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange || "cette ligne"} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
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
    console.log(JSON.stringify({ ...SCHEDULE, share: SHARE, fx: FX, ptm: PTM, cash: CASH }, null, 2));
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
