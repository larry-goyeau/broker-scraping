// What one round trip costs at AJ Bell: buy n shares at price p, sell
// them back at once, online, in dollars.
//
// Dealing account charges, read on 2026-10-08. The same online share
// charge is what the international page uses for the SIPP, the ISA and
// the Lifetime ISA.
//
//   shares, ETF, ETC, ETN     £5 a side
//   frequent dealer           £3.50 a side, after 10 online share deals
//                             in the previous calendar month
//   FX, non-sterling line     0.75% to £10,000, then 0.50% to £20,000,
//                             then 0.25%, each way
//
// The account holds pounds. A foreign price is converted on the deal, so
// the FX is inside the broker fee. A GBP or GBX line is not converted.
// The shares account charge is 0.25% a year, capped at £3.50 a month, and
// stays off the ticket. A regular investment is free. A dividend
// reinvestment is £1.50. Phone dealing is £25. None of those is this trip.
// Stamp and FTT come from the tax map. PTM is £1.50 a side on a UK share
// deal above £10,000, which the tax map does not price as a flat.
//
// London, Aquis and Chi-X keep their book. Any other line is a sterling
// CDI: one side of the quote, for about fifteen seconds. That spread is
// unknown. The foreign book and the American NBBO are not used.
//
//   https://www.ajbell.co.uk/dealing-account/charges
//   https://www.ajbell.co.uk/investment/international
//
//   node brokers/ajbell/ajbell_cost.mjs HSBA XLON GBP --shares=10 --price=7
//   node brokers/ajbell/ajbell_cost.mjs AAPL --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("ajbell-parsed.json", import.meta.url);
const PAGE = "https://www.ajbell.co.uk/dealing-account/charges";
const READ_ON = "2026-10-08";
const CASH = "GBP";
const SHARE = 5;
const PTM = { each: 1.5, above: 10000 };
const FX_BANDS = [
  { upTo: 10000, rate: 0.0075 },
  { upTo: 20000, rate: 0.005 },
  { upTo: Infinity, rate: 0.0025 },
];

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

const HOME = new Set(["XLON", "LSE", "AQSE", "CHIX"]);
function cdiOf(match) {
  const exchange = String(match.row.exchange || "").toUpperCase();
  if (exchange.startsWith("CDI")) return true;
  const mic = match.venue?.mic || "";
  if (HOME.has(mic) || HOME.has(exchange)) return false;
  return true;
}

function fxOnDeal(pounds) {
  if (!(pounds > 0)) return null;
  let fee = 0;
  let floor = 0;
  for (const band of FX_BANDS) {
    const slice = Math.min(pounds, band.upTo) - floor;
    if (slice > 0) fee += slice * band.rate;
    floor = band.upTo;
    if (pounds <= band.upTo) break;
  }
  return fee;
}

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
      "Frequent dealing is -£1.50 a side after 10 online share deals in the previous month. A regular investment is free. The shares account charge is 0.25% a year, capped at £3.50 a month.",
  };

  if (!catalogue) {
    return { ...answer, why: "le catalogue AJ Bell n'existe pas encore : lancer `node brokers/ajbell/ajbell_scraping.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue AJ Bell` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez AJ Bell`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const cdi = cdiOf(m);
  const book = cdi
    ? { leaf: null, mic: null }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
        broker: "ajbell",
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
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème AJ Bell en ligne, relu le ${READ_ON}. Courtage ${SHARE} £ par sens.`,
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
  const fxEach = sterling(listing.currency) ? 0 : fxOnDeal(pounds);
  const commissionGbp = SHARE * 2;
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
    commission: { each: SHARE, currency: CASH, eachWay: true },
    ...(bookUsd == null
      ? {
          why: cdi
            ? "CDI : AJ Bell ne publie qu'un côté du prix en livres, le carnet de la place n'est pas ce prix"
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
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}
