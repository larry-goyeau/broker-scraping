// What one round trip costs at Lloyds: buy n shares at
// price p, sell them back at once, online, in dollars.
//
// Costs and charges guide LLOP00011A (06/26), read on 2026-10-08. The same
// online share charge is what the worked examples use for the Share Dealing
// Account, the ISA and the SIPP. Default is the first seven online share
// deals of the quarter. `--plan=frequent` is eight or more. `--plan=private`
// is a Private Banking customer. A regular investment is free. A dividend
// reinvestment is 2% of the dividend, capped at £10. None of those is
// this trip.
//
//   UK share, ETF, ETC, ETN, trust     £9.50 a side     frequent £8
//                                      Private Banking £8.50
//   international line                 £0, plus 1% of the sterling value
//                                      each way
//   fund                               £1.50 a side, and funds are not in
//                                      this catalogue
//
// The account holds pounds. A foreign price is converted on the deal, so
// the FX is inside the broker fee. A GBP or GBX line is not converted.
// Irena's example is four overseas trades of £5,000 and £200 of FX, which
// is 1% once per trade. The account charge is £18 every six months and
// stays off the ticket. It is waived for Private Banking and for an Invest
// Wise account. Stamp and FTT come from the tax map. PTM is £1.50 a side
// on a UK share deal above £10,000, which the tax map does not price as a
// flat. Some trust pages still print £11; the June 2026 guide is £9.50.
//
// The order form names the market (LSE, NASDAQ, XETRA). That book is the
// spread. The visible "Trading on" line is not. A US line takes Banca IMI's
// US broker-dealer 606 (Intesa Sanpaolo IMI Securities Corp.) on the blended
// 605. A European book stays in basis points.
//
//   https://www.lloydsbank.com/investing/ways-to-invest/share-dealing-services/charges.html
//   https://www.lloydsbank.com/assets/media/pdfs/investments/direct-investments/costs_and_charges.pdf
//
//   node brokers/lloyds/lloyds_cost.mjs 1947 LSE GBX --shares=10 --price=9.75
//   node brokers/lloyds/lloyds_cost.mjs AAPL --shares=10 --price=230
//   node brokers/lloyds/lloyds_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("lloyds-parsed.json", import.meta.url);

const SCHEDULE = {
  charges: "https://www.lloydsbank.com/investing/ways-to-invest/share-dealing-services/charges.html",
  pdf: "https://www.lloydsbank.com/assets/media/pdfs/investments/direct-investments/costs_and_charges.pdf",
  readOn: "2026-10-08",
  guide: "LLOP00011A (06/26)",
  entity: "Halifax Share Dealing Limited",
};

const CASH = "GBP";
const DEFAULT_PLAN = "online";
const PLANS = {
  online: { id: "online", label: "first 7 online deals this quarter", share: 9.5 },
  frequent: { id: "frequent", label: "8 or more online deals this quarter", share: 8 },
  private: { id: "private", label: "Private Banking", share: 8.5 },
};
const PLAN_ALIAS = {
  online: "online",
  standard: "online",
  frequent: "frequent",
  active: "frequent",
  private: "private",
  privatebanking: "private",
};
const FX = 0.01;
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

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

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

function remarkOf(plan) {
  const charge =
    plan === "private"
      ? "The £18 charge every six months is waived for Private Banking."
      : "Account charge £18 every six months, waived for an Invest Wise account and for Private Banking.";
  return `${charge} A regular investment is free. Dividend reinvestment fees is 2% of the dividend, capped at £10.`;
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: picked?.id ?? plan,
    onlineBuy: true,
    cashCurrency: CASH,
    url: SCHEDULE.charges,
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (online|frequent|private)` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Lloyds n'existe pas encore : lancer `node brokers/lloyds/lloyds_scraping.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Lloyds` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Lloyds`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "lloyds",
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
  const each = foreign ? 0 : picked.share;
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
    remark: remarkOf(picked.id),
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Lloyds, ${picked.label}, guide ${SCHEDULE.guide} relu le ${SCHEDULE.readOn}`,
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
    commission: { each, currency: CASH, eachWay: true, plan: picked.id, ...(foreign ? { fx: FX } : {}) },
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
    console.log(JSON.stringify({ ...SCHEDULE, defaultPlan: DEFAULT_PLAN, plans: PLANS, fx: FX, ptm: PTM, cash: CASH }, null, 2));
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
    plan: flag("plan") || DEFAULT_PLAN,
  });
  console.log(JSON.stringify(out, null, 2));
}
