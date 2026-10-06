// What one round trip costs at Vanguard UK: buy n shares at
// price p, sell them back at once, in dollars.
//
// Re-read 2026-10-02. The ordinary ETF trade is the bulk window, at
// 10:15 and 14:10, with no ticket. Quote and Deal is the live London
// price, £7.50 a side, and it is `--plan=quote`.
//
//   bulk                  £0
//   Quote and Deal        £7.50 a side
//   FX                    none published
//
// The account holds pounds. Every line in the catalogue is a London
// listing in pounds. The account fee is not this ticket. Below £32,000
// it is £4 a month, except on a Junior ISA. From £32,000 it is 0.15% a
// year, capped at £375. Cash is not included.
// Stamp and FTT come from the tax map. These lines are ETFs, so UK
// stamp and the PTM levy are not charged.
//
// Orders go to Winterflood Business Services. There is no US
// broker-dealer, so no Rule 606 mix is applied. The book is London's.
//
//   https://www.vanguardinvestor.co.uk/what-we-offer/fees-explained
//   https://www.vanguardinvestor.co.uk/content/dam/intl/uk-retail-direct/documents/vanguard-self-managed-service-costs-and-charges.pdf
//   https://www.vanguardinvestor.co.uk/best-execution-etfs
//
//   node brokers/vanguarduk/vanguarduk_cost.mjs VUSA --shares=10 --price=90
//   node brokers/vanguarduk/vanguarduk_cost.mjs VUSA --plan=quote --shares=10 --price=90
//   node brokers/vanguarduk/vanguarduk_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("vanguarduk-parsed.json", import.meta.url);

const SCHEDULE = {
  charges: "https://www.vanguardinvestor.co.uk/what-we-offer/fees-explained",
  pdf: "https://www.vanguardinvestor.co.uk/content/dam/intl/uk-retail-direct/documents/vanguard-self-managed-service-costs-and-charges.pdf",
  execution: "https://www.vanguardinvestor.co.uk/best-execution-etfs",
  readOn: "2026-10-02",
  pdfDated: "2026-08-20",
  entity: "Vanguard Asset Management Limited",
  dealingPartner: "Winterflood Business Services",
  usBrokerDealer: null,
};

const CASH = "GBP";
const DEFAULT_PLAN = "bulk";
const PLANS = {
  bulk: { id: "bulk", label: "bulk dealing", each: 0 },
  quote: { id: "quote", label: "Quote and Deal", each: 7.5 },
};
const PLAN_ALIAS = { bulk: "bulk", batch: "bulk", quote: "quote", live: "quote", deal: "quote" };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
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
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);
  return { named, matches };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. The ordinary ticket is the free
 * bulk window. Quote and Deal is `--plan=quote`. The account fee is the
 * remark.
 */
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
    onlineBuy: true,
    cashCurrency: CASH,
    plan: picked?.id || String(plan || ""),
  };

  if (!picked) return { ...answer, why: `plan inconnu : ${plan}` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Vanguard UK n'existe pas encore : lancer `node brokers/vanguarduk/vanguarduk_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Vanguard UK` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Vanguard UK`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "vanguarduk",
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
      "Account fee is £4 a month below £32,000, except on a Junior ISA. From £32,000 it is 0.15% a year, capped at £375. Quote and Deal is £7.50 a trade.",
    bp: marketBp,
    perShare: marketPerShare,
    via606: false,
    url: SCHEDULE.charges,
    basis: `barème Vanguard UK, relu le ${SCHEDULE.readOn}`,
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
  const bookUsd =
    partsBook.a == null || notionalUsd == null
      ? null
      : partsBook.b == null
        ? null
        : partsBook.a * notionalUsd + partsBook.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const commissionUsd = dollars(picked.each * 2, CASH);
  const brokerFees = commissionUsd;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { each: picked.each, currency: CASH, eachWay: true, plan: picked.id },
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
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      `barème relu le ${SCHEDULE.readOn}`,
      picked.each ? `Quote and Deal ${picked.each} £ par sens` : "passage groupé sans courtage",
      "pas de change publié",
      "pas de Rule 606 : pas de broker-dealer américain",
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
    console.log(JSON.stringify({ ...SCHEDULE, defaultPlan: DEFAULT_PLAN, plans: PLANS, cash: CASH }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node brokers/vanguarduk/vanguarduk_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=bulk|quote]"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
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
