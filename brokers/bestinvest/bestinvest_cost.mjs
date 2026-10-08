// What one round trip costs at Bestinvest: buy n shares at price p,
// sell them back at once, online, in dollars.
//
// Fees page, read on 2026-10-08. The same dealing charges apply to an
// ISA, a Junior ISA, an Investment Account and a SIPP.
//
//   UK shares, ETF, ETC     £4.95 a side
//   US shares               £0 online, plus 0.95% FX a side
//
// The account holds pounds. A US line is a sterling CDI, so the FX is
// inside the broker fee. A GBP or GBX line is not converted. The service
// fee is 0.4% a year on UK shares and ETFs and 0.2% a year on US shares,
// on the first £250,000, and is not a trade. Regular investing on that
// page is a monthly fund purchase, not this share ticket. A dividend
// reinvestment is free and is another order. Phone dealing is £30.
// Stamp and FTT come from the tax map. PTM is £1.50 a side on a UK share deal above
// £10,000, which the tax map does not price as a flat.
//
// A London line keeps the London book. Aquis has no book here. A CDI
// quote is not the American NBBO, so that spread stays unknown.
//
//   https://www.bestinvest.co.uk/accounts/fees
//   https://www.bestinvest.co.uk/help/dealing
//
//   node brokers/bestinvest/bestinvest_cost.mjs FOUR LSE GBP --shares=10 --price=40
//   node brokers/bestinvest/bestinvest_cost.mjs AAPL --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("bestinvest-parsed.json", import.meta.url);
const PAGE = "https://www.bestinvest.co.uk/accounts/fees";
const READ_ON = "2026-10-08";
const CASH = "GBP";
const SHARE = 4.95;
const US_FX = 0.0095;
const PTM = { each: 1.5, above: 10000 };

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
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).endsWith(wantPlace);
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
    url: PAGE,
    remark:
      "The service fee is 0.4% a year on UK shares and ETFs, and 0.2% a year on US shares, on the first £250,000.",
  };

  if (!catalogue) {
    return { ...answer, why: "le catalogue Bestinvest n'existe pas encore : lancer `node brokers/bestinvest/bestinvest_scraping.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Bestinvest` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Bestinvest`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const cdi = String(m.row.exchange || "").toUpperCase().startsWith("CDI");
  const book = cdi
    ? { leaf: null, mic: null }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
        broker: "bestinvest",
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
  const leaf = book.leaf;
  const marketBp = cdi ? null : bp ?? leaf?.bp ?? null;
  const marketPerShare = cdi ? null : perShare ?? leaf?.perShare ?? null;
  const partsBook = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const each = cdi ? 0 : SHARE;
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis: cdi
      ? `barème Bestinvest en ligne, relu le ${READ_ON}. Action américaine : courtage 0, change 0,95 % par sens.`
      : `barème Bestinvest en ligne, relu le ${READ_ON}. Courtage ${SHARE} £ par sens.`,
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
  const fxEach = cdi && pounds != null ? pounds * US_FX : cdi ? null : 0;
  const commissionGbp = each * 2;
  const fxGbp = fxEach == null ? null : fxEach * 2;
  const ukShare = String(listing.type || "").toUpperCase() === "STOCK" && String(listing.isin || "").startsWith("GB");
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
    commission: { each, currency: CASH, eachWay: true, ...(cdi ? { fx: US_FX } : {}) },
    ...(bookUsd == null
      ? {
          why: cdi
            ? "CDI : Bestinvest ne publie pas les deux côtés du prix en livres, le NBBO n'est pas ce prix"
            : `aucun carnet pour ${m.unsourced?.name || listing.exchange || "cette ligne"} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
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
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  console.log(JSON.stringify(roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
  }), null, 2));
}
