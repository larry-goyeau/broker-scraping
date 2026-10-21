// What one round trip costs at Aviva share dealing (Aviva Investment
// Account, Stocks & Shares ISA, SIPP): buy n shares at price p, sell them
// back at once, online, in dollars.
//
// Aviva Wrap UK Limited runs the platform and deals through its "nominated
// stockbroker", which no page names. The share dealing and investment
// charges pages, read on 2026-10-20, and the Investment Account key
// features (RD03002, 09/2026) print one trading charge for every account:
//
//   UK share, ETF, investment trust   £4.99 a side
//   fund                              £0, and funds are not in this catalogue
//
// The Aviva Charge is 0.35% a year of the investments up to £500,000 and
// nothing above; it stays off the ticket and is the remark. The terms
// (RD03003, 06/2025) say every order and valuation is in sterling only. A
// line the LSE only quotes in dollars or euros (InterContinental Hotels,
// Baltic Classifieds, three SPDR ETFs) is still dealt from pounds, so a
// conversion is forced, and no Aviva document prints its rate: that total
// is N/A. Re-checked 2026-10-20 for a rate or margin anywhere else: the
// share-dealing, investment-charges and FAQ 1014 pages, the key features
// (RD03002, 09/2026) and the terms (RD03003) have no exchange-rate line;
// the terms (§9) say a non-sterling ETI is "not eligible to be held
// through the online investment service" and is sold back to sterling, so
// those lines are onlineBuy: false (hidden); the nominated stockbroker is not named, so it has no
// board to read; Which? (16 March 2026) says Aviva offers UK equities only
// and prints no FX charge. Still N/A.
//   https://www.aviva.co.uk/faq/answer/share-dealing/1014
// Stamp (SDRT 0.5%, Irish 1%) comes from the tax map; a GB or IE
// share with no tax-map line is N/A (taxGap). PTM is £1.50 a side on a
// deal above £10,000 in a share of a UK, Channel Islands or Isle of Man
// company (terms), which the tax map does not price as a flat.
//
// Everything is on the London Stock Exchange (AIM included). That book is
// the spread, in basis points.
//
//   https://www.aviva.co.uk/investments/share-dealing/
//   https://www.aviva.co.uk/investments/investment-charges/
//   https://static.aviva.io/content/dam/document-library/adviser/customerplatform/rd03002c.pdf
//   https://static.aviva.io/content/dam/document-library/adviser/customerplatform/rd03003c.pdf
//
//   node brokers/aviva/aviva_cost.mjs BARC XLON GBX --shares=100 --price=400
//   node brokers/aviva/aviva_cost.mjs AAAG XLON GBP --shares=10 --price=8.5
//   node brokers/aviva/aviva_cost.mjs IHG XLON USD --shares=10 --price=120
//   node brokers/aviva/aviva_cost.mjs --schedule
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

const FOLDER = "aviva";
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);

const SCHEDULE = {
  charges: "https://www.aviva.co.uk/investments/investment-charges/",
  dealing: "https://www.aviva.co.uk/investments/share-dealing/",
  keyFeatures: "https://static.aviva.io/content/dam/document-library/adviser/customerplatform/rd03002c.pdf",
  terms: "https://static.aviva.io/content/dam/document-library/adviser/customerplatform/rd03003c.pdf",
  readOn: "2026-10-20",
  guide: "RD03002 (09/2026)",
  entity: "Aviva Wrap UK Limited",
};

const CASH = "GBP";
const SHARE = 4.99;
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

const REMARK = "Aviva Charge 0.35% a year on investments up to £500,000.";

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
    return { ...answer, why: `le catalogue Aviva n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Aviva` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Aviva`,
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
  const each = SHARE;
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
    // Terms §9: a non-sterling ETI "is not eligible to be held through the
    // online investment service", so a dollar or euro line is not bought online.
    onlineBuy: !forcedFx,
    listing,
    remark: [REMARK, foreign && held ? fxRemark("", listing.currency) : ""].filter(Boolean).join("\n"),
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Aviva, frais de négociation en ligne, pages des frais et document d'informations clés ${SCHEDULE.guide} relus le ${SCHEDULE.readOn}. Courtage ${SHARE} £ par sens.`,
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

  const why = forcedFx && FX == null
    ? `ordres et valorisations en livres uniquement : une ligne en ${listing.currency} impose un change dont Aviva ne publie pas le taux`
    : bookUsd == null
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
    console.log(JSON.stringify({ ...SCHEDULE, share: SHARE, fx: FX, ptm: { ...PTM, countries: [...PTM.countries] }, cash: CASH }, null, 2));
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
