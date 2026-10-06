// What one round trip costs at Willis Owen: buy n shares at price p,
// sell them back at once, in dollars.
//
// Re-read 2026-10-02. One ticket. Regular saving into a share, an ETF, an
// ETC or an ETN is not offered.
//
//   shares, ETF, ETC, ETN     £7.50 a side
//   FX                        none published
//
// The account holds pounds. A GBX line is pence, not a conversion. A line
// the list prices in dollars keeps that price. No FX rate is published,
// so none is added.
// The service fee is not a trade. On an ISA, a JISA or a GIA it is 0.40%
// to £50,000, 0.30% to £100,000, 0.20% to £250,000, then 0.15%. A SIPP
// is 0.40% to £100,000, 0.25% to £250,000, then 0.15%. Cash is in the
// tier and not in the charge.
// Stamp and FTT come from the tax map. Their page exempts AIM from stamp.
// The row does not say AIM, so the tax map decides. PTM is £1.50 a side
// on a UK share above £10,000. It is not charged on an ETF, an ETC or an
// ETN. The tax map does not price that flat.
//
// The only place named is the London Stock Exchange. There is no US
// broker-dealer, so no Rule 606 mix is applied. The book is London's.
//
//   https://www.willisowen.co.uk/help/fees-and-charges
//   https://www.willisowen.co.uk/explore/
//
//   node brokers/willisowen/willisowen_cost.mjs GB0006640972 --shares=10 --price=49
//   node brokers/willisowen/willisowen_cost.mjs IE00B579F325 --shares=1 --price=400
//   node brokers/willisowen/willisowen_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("willisowen-parsed.json", import.meta.url);

const SCHEDULE = {
  charges: "https://www.willisowen.co.uk/help/fees-and-charges",
  range: "https://www.willisowen.co.uk/explore/",
  readOn: "2026-10-02",
  entity: "Willis Owen",
  custodian: "Embark Investment Services Limited",
  usBrokerDealer: null,
};

const CASH = "GBP";
const EACH = 7.5;
const PTM = { each: 1.5, above: 10000 };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

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

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the £7.50 ticket,
 * twice. The service fee is the remark.
 */
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
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Willis Owen n'existe pas encore : lancer `node brokers/willisowen/willisowen_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Willis Owen` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Willis Owen`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "willisowen",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? (String(m.row.exchange || "").toUpperCase() || null),
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };
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
    remark:
      "Annual service fee on an ISA, a JISA or a GIA is 0.40% to £50,000, 0.30% to £100,000, 0.20% to £250,000, then 0.15%. A SIPP is 0.40% to £100,000, 0.25% to £250,000, then 0.15%.",
    bp: marketBp,
    perShare: marketPerShare,
    via606: false,
    url: SCHEDULE.charges,
    basis: `barème Willis Owen, relu le ${SCHEDULE.readOn}`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
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
  const share = String(listing.type || "").toUpperCase() === "STOCK" && String(listing.isin || "").startsWith("GB");
  const ptmDue = !share ? false : pounds == null ? null : pounds > PTM.above;
  const ptmGbp = ptmDue ? PTM.each * 2 : ptmDue === false ? 0 : null;
  const bookUsd =
    partsBook.a == null || notionalUsd == null
      ? null
      : partsBook.b == null
        ? null
        : partsBook.a * notionalUsd + partsBook.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const commissionUsd = dollars(EACH * 2, CASH);
  const ptmUsd = ptmGbp == null ? null : dollars(ptmGbp, CASH);
  const brokerFees = commissionUsd;
  const usd = plus(bookUsd, brokerFees, taxUsd, ptmUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { each: EACH, currency: CASH, eachWay: true },
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
    },
    confidence: [
      `barème relu le ${SCHEDULE.readOn}`,
      `courtage ${EACH} £ par sens`,
      "pas de change publié",
      "pas de Rule 606 : pas de broker-dealer américain",
      ptmDue ? `PTM ${PTM.each} £ par sens, le montant dépassant ${PTM.above} £` : null,
      marketBp != null
        ? `carnet ${Number(marketBp.toPrecision(4))} bp`
        : marketPerShare != null
          ? `carnet ${marketPerShare} $ la part`
          : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange || "cette ligne"}`,
    ]
      .filter(Boolean)
      .join(" ; "),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, each: EACH, ptm: PTM, cash: CASH }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node brokers/willisowen/willisowen_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || ""}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
