// What one round trip costs at Hargreaves Lansdown: buy n shares at price p,
// sell them back at once (online, one-off), in dollars.
//
// Fund and Share Account, re-read 2026-09-30. The same online dealing card
// covers the Stocks and Shares ISA and the SIPP. Default is 0–19 share
// deals in the previous month. `--plan=frequent` is 20 or more. Monthly
// Direct Debit deals are free and are not this ticket. Phone and post are
// £29 and are not this ticket. Junior ISA dealing is free and is not this
// account.
//
//   shares, ETF, trust, gilt, bond     £6.95 a side    frequent £3.95
//   fund                               £1.95 a side
//   FX, non-sterling line              0.99% to £10,000, then 0.50% to
//                                      £25,000, then 0.20%, each way
//
// The account holds pounds. A foreign price is converted on the deal, so
// the FX is inside the broker fee. A GBP or GBX line is not converted.
// Custody is not a trade: 0.35% a year on shares, capped at £12.50 a month,
// and 0.35% a year on the first £250,000 of funds. It stays in the remark.
// Stamp and FTT come from the tax map. PTM is £1.50 a side on a UK share
// deal above £10,000, which the tax map does not price as a flat.
//
//   https://www.hl.co.uk/investment-services/fund-and-share-account/charges-and-interest-rates
//   https://www.hl.co.uk/shares/share-dealing/dealing-charges
//   https://www.hl.co.uk/shares/share-dealing/overseas-share-dealing-service
//
//   node brokers/hargreaveslansdown/hargreaveslansdown_cost.mjs HSBA LSE GBX --shares=10 --price=700
//   node brokers/hargreaveslansdown/hargreaveslansdown_cost.mjs AAPL --shares=10 --price=230
//   node brokers/hargreaveslansdown/hargreaveslansdown_cost.mjs 0001144 --shares=10 --price=200
//   node brokers/hargreaveslansdown/hargreaveslansdown_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("hargreaveslansdown-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);

const SCHEDULE = {
  account: "https://www.hl.co.uk/investment-services/fund-and-share-account/charges-and-interest-rates",
  dealing: "https://www.hl.co.uk/shares/share-dealing/dealing-charges",
  overseas: "https://www.hl.co.uk/shares/share-dealing/overseas-share-dealing-service",
  readOn: "2026-09-30",
  entity: "Hargreaves Lansdown Asset Management Limited",
};

const CASH = "GBP";
const DEFAULT_PLAN = "online";
const PLANS = {
  online: { id: "online", label: "0–19 share deals last month", share: 6.95 },
  frequent: { id: "frequent", label: "20+ share deals last month", share: 3.95 },
};
const PLAN_ALIAS = { online: "online", standard: "online", frequent: "frequent", active: "frequent" };
const FUND_EACH = 1.95;
const PTM = { each: 1.5, above: 10000 };
// Marginal FX on the sterling value of one deal. Each band is its own rate.
const FX_BANDS = [
  { upTo: 10000, rate: 0.0099 },
  { upTo: 25000, rate: 0.005 },
  { upTo: Infinity, rate: 0.002 },
];

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

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
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);
  return { named, matches };
}

function remarkOf(type) {
  if (String(type || "").toUpperCase() === "FUND") return "Custody 0.35% / year on the first £250,000 of funds.";
  return "Custody 0.35% / year, capped at £12.50 / month.";
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the dealing charge
 * and, on a foreign line, the FX. Custody is the remark.
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
    plan: picked?.id ?? plan,
    onlineBuy: true,
    cashCurrency: CASH,
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (online|frequent)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Hargreaves Lansdown n'existe pas encore : lancer `node brokers/hargreaveslansdown/hargreaveslansdown_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Hargreaves Lansdown` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Hargreaves Lansdown`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "hargreaveslansdown",
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
  const fund = String(listing.type || "").toUpperCase() === "FUND";
  const each = fund ? FUND_EACH : picked.share;
  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    remark: remarkOf(listing.type),
    bp: marketBp,
    perShare: marketPerShare,
    url: fund ? SCHEDULE.account : sterling(listing.currency) ? SCHEDULE.dealing : SCHEDULE.overseas,
    basis: `barème Hargreaves Lansdown, ${picked.label}, relu le ${SCHEDULE.readOn}`,
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
  const fxEach = sterling(listing.currency) || fund ? 0 : fxOnDeal(pounds);
  const commissionGbp = each * 2;
  const fxGbp = fxEach == null ? null : fxEach * 2;
  const ukShare = !fund && String(listing.type || "").toUpperCase() === "STOCK" && String(listing.isin || "").startsWith("GB");
  const ptmDue = !ukShare ? false : pounds == null ? null : pounds > PTM.above;
  const ptmGbp = ptmDue ? PTM.each * 2 : ptmDue === false ? 0 : null;
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? dollars(marketPerShare * n, listing.currency)
        : null;
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
    commission: { each, currency: CASH, eachWay: true, plan: picked.id },
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
    confidence: [
      `barème ${picked.label}, relu le ${SCHEDULE.readOn}`,
      fund ? `fonds ${FUND_EACH} £ par sens` : `courtage ${each} £ par sens`,
      sterling(listing.currency) || fund ? "ligne en sterling : pas de change" : "change par paliers, les deux sens, dans les frais",
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
    console.log(
      JSON.stringify(
        { ...SCHEDULE, defaultPlan: DEFAULT_PLAN, plans: PLANS, fundEach: FUND_EACH, fx: FX_BANDS, ptm: PTM, cash: CASH },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node brokers/hargreaveslansdown/hargreaveslansdown_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=online|frequent]"
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
  console.log(`${l.exchange || ""}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}  [${out.plan}]\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    if (parts.change) console.log(`  change         : ${parts.change} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
