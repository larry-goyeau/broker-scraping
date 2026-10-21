// What one round trip costs at AJ Bell Dodl: buy n shares at price p, sell
// them back at once, in the app, in dollars.
//
// Dodl (AJ Bell Securities Limited) charges no commission to buy or sell
// ("Dodl doesn't charge you a platform fee to buy or sell investments").
// Charges page and FX help article read on 2026-10-20:
//
//   UK share, ETF, ETC (London)   £0
//   US share (NYSE, Nasdaq)       £0, plus FX on each buy and each sell:
//                                 0.75% of the first £10,000, 0.50% of the
//                                 next £10,000, 0.25% above £20,000
//
// The account holds pounds only (deposits.mjs), so the US FX is in the
// total, on both legs, tiered on the sterling value of each leg. A dividend
// in dollars is converted at 0.5%; not this trip. The account charge is
// 0.15% a year of the investments, at least £1 a month; it stays off the
// ticket and is the remark. Stamp (0.5% on a UK share bought) comes from
// the tax map; a GB or IE share with no tax-map line is N/A (taxGap). PTM
// is £1.50 a side on a deal above £10,000 in a share of a UK, Channel
// Islands or Isle of Man company, which the tax map does not price as a
// flat.
//
// London lines take the London book. Dodl aggregates the day's orders and
// polls UK retail service providers; its order execution policy names
// Peel Hunt, Winterflood and Canaccord Genuity for US equities, none of
// which files a US 606, so a US line keeps the quoted NBBO (no alias).
//
//   https://dodl.co.uk/charges
//   https://help.dodl.co.uk/en/articles/6655200-what-are-foreign-exchange-fx-charges
//   https://dodl.co.uk/regulatory/order-execution
//
//   node brokers/dodl/dodl_cost.mjs BARC XLON GBX --shares=100 --price=400
//   node brokers/dodl/dodl_cost.mjs VMID XLON GBP --shares=10 --price=35
//   node brokers/dodl/dodl_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/dodl/dodl_cost.mjs KO XNYS USD --shares=300 --price=70
//   node brokers/dodl/dodl_cost.mjs --schedule
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

const FOLDER = "dodl";
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);

const SCHEDULE = {
  charges: "https://dodl.co.uk/charges",
  fxHelp: "https://help.dodl.co.uk/en/articles/6655200-what-are-foreign-exchange-fx-charges",
  execution: "https://dodl.co.uk/regulatory/order-execution",
  readOn: "2026-10-20",
  entity: "AJ Bell Securities Limited",
};

const CASH = "GBP";
const SHARE = 0;
// FX on each leg, by slices of its sterling value.
const FX_TIERS = [
  { upTo: 10000, rate: 0.0075 },
  { upTo: 20000, rate: 0.005 },
  { upTo: null, rate: 0.0025 },
];
const fxOn = (pounds) => {
  let fee = 0;
  let from = 0;
  for (const { upTo, rate } of FX_TIERS) {
    if (pounds <= from) break;
    const top = upTo ?? Infinity;
    fee += (Math.min(pounds, top) - from) * rate;
    from = top;
  }
  return fee;
};
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

const REMARK = "Account charge 0.15% a year, minimum £1 a month.";

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
    return { ...answer, why: `le catalogue Dodl n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Dodl` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Dodl`,
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
    remark: [REMARK, foreign && held ? fxRemark("0.25-0.75", listing.currency) : ""].filter(Boolean).join("\n"),
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Dodl, page des frais et article d'aide sur le change relus le ${SCHEDULE.readOn}. Aucun courtage ; change sur les actions US 0,75 % jusqu'à 10 000 £, 0,50 % jusqu'à 20 000 £, 0,25 % au-delà, par sens.`,
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
  const fxEach = !forcedFx ? 0 : pounds == null ? null : fxOn(pounds);
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
    commission: { each, currency: CASH, eachWay: true, ...(forcedFx ? { fx: FX_TIERS } : {}) },
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
    console.log(JSON.stringify({ ...SCHEDULE, share: SHARE, fx: FX_TIERS, ptm: { ...PTM, countries: [...PTM.countries] }, cash: CASH }, null, 2));
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
