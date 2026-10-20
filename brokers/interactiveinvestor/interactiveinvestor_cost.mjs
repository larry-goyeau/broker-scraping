// What one round trip costs at interactive investor (ii): buy n shares at
// price p, sell them back at once, online, in dollars.
//
// Rates and charges, "Last updated 1 October 2026", read on 2026-10-18.
// The same card covers the Trading Account, the Stocks & Shares ISA and
// the SIPP. Three plans, a fixed monthly fee each. Default is Core, the
// entry plan (a portfolio up to £100,000). `--plan=plus|premium` switch.
//
//                               Core      Plus      Premium
//   monthly                     £5.99     £14.99    £39.99
//   UK & US shares, ETF, trust  £3.99     £3.99     £2.99     a side
//   other international shares  £9.99     £7.99     £5.99     a side
//   funds                       £3.99     £1.49     free      (not in the catalogue)
//   FX                          0.75%     0.75% to £50,000,   0.25%
//                                         0.25% above
//
// "UK" is London and Aquis; "US" is NYSE, Nasdaq and NYSE American. Every
// other market (Toronto, TSX Venture, ASX, Hong Kong, Singapore, Xetra,
// Euronext, Milan, Madrid, Stockholm, SIX) is "other international".
// Large deals: UK shares above £500,000 are £40, US shares above £100,000
// are 0.04% of the trade value, international shares above £25,000 are
// 0.1% of the trade value. The card prints these under "Other trading
// costs" next to "subject to the minimum and maximum charges shown", and
// does not say "in addition", so they replace the flat ticket here.
//
// The Trading Account and the SIPP hold nine currencies (deposits.mjs):
// a line in one of them is not converted, so FX is 0 and `fxIfConverted`
// carries the plan rate × 2. A line in any other currency pays the plan FX
// on both legs. The ISA holds pounds only: that is the remark.
// Plus and Premium give a monthly trade credit (£3.99 / £29.90, 31 days,
// no roll-over); a credit is prepaid by the monthly fee, so it stays out.
//
// Taxes and levies the card names, priced here:
//   UK stamp, French FTT          tax map (taxMap.mjs), on the buy; UK
//                                 stamp only on a London or Aquis line
//   UK PTM levy                   £1.50 a side on a UK share deal > £10,000
//   Irish stamp duty              1% on the buy of an Irish share
//   ITP levy                      €1.25 a side on an Irish share deal > €12,500
//   Hong Kong stamp duty          0.1% a side, rounded up to the next HKD
//   Hong Kong transaction levy    0.0027% a side
//   Hong Kong trading fee         0.005% a side
//   Singapore clearing fee        0.0325% a side
// Italian and Spanish FTT (0.20% on "eligible" buys) are named: a line the
// tax map covers is priced from it; a GB/IE/FR/IT/ES share with no tax-map
// line is N/A (taxGap).
// Telephone (£49), extended settlement (£5), dividend reinvestment and the
// monthly fee are not this trip.
//
// The book: London and Aquis keep their own; a US line is the US tape
// times a 606 Q: by user decision the highest Q among the US
// broker-dealers ii's best-execution disclosure names that file a 606
// (ALIASES in ../../spreads/rule606.mjs); any other place is its own
// venue's book.
//
//   https://www.ii.co.uk/our-charges
//   https://ii.co.uk/plans
//   https://media-prod.ii.co.uk/s3fs-public/pdfs/rates-and-charges.pdf
//   https://www.ii.co.uk/investing-with-ii/international-investing
//
//   node brokers/interactiveinvestor/interactiveinvestor_cost.mjs HSBA LSE GBX --shares=10 --price=1430.8
//   node brokers/interactiveinvestor/interactiveinvestor_cost.mjs AAPL NASDAQ USD --shares=10 --price=343.46
//   node brokers/interactiveinvestor/interactiveinvestor_cost.mjs D05 SGX SGD --shares=10 --price=73.36 --plan=premium
//   node brokers/interactiveinvestor/interactiveinvestor_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("interactiveinvestor-parsed.json", import.meta.url);

const SCHEDULE = {
  charges: "https://www.ii.co.uk/our-charges",
  plans: "https://ii.co.uk/plans",
  pdf: "https://media-prod.ii.co.uk/s3fs-public/pdfs/rates-and-charges.pdf",
  international: "https://www.ii.co.uk/investing-with-ii/international-investing",
  readOn: "2026-10-18",
  pdfDated: "2026-10-01",
  entity: "Interactive Investor Services Limited",
};

const CASH = "GBP";
// Copied into deposits.mjs: the Trading Account and SIPP cash balances.
const HOLD = new Set(["GBP", "GBX", "EUR", "USD", "CAD", "AUD", "HKD", "SGD", "SEK", "CHF"]);

const DEFAULT_PLAN = "core";
const PLANS = {
  core: {
    id: "core",
    label: "Core",
    monthly: 5.99,
    ukUs: 3.99,
    intl: 9.99,
    fund: 3.99,
    fx: [{ upTo: Infinity, rate: 0.0075 }],
  },
  plus: {
    id: "plus",
    label: "Plus",
    monthly: 14.99,
    ukUs: 3.99,
    intl: 7.99,
    fund: 1.49,
    fx: [
      { upTo: 50000, rate: 0.0075 },
      { upTo: Infinity, rate: 0.0025 },
    ],
  },
  premium: {
    id: "premium",
    label: "Premium",
    monthly: 39.99,
    ukUs: 2.99,
    intl: 5.99,
    fund: 0,
    fx: [{ upTo: Infinity, rate: 0.0025 }],
  },
};
const PLAN_ALIAS = { core: "core", investor: "core", plus: "plus", premium: "premium", superinvestor: "premium" };

// Above these sterling values the flat ticket gives way to the large-deal line.
const LARGE = {
  uk: { above: 500000, flat: 40 },
  us: { above: 100000, rate: 0.0004 },
  intl: { above: 25000, rate: 0.001 },
};

const UK_MICS = new Set(["XLON", "AQSE", "NEXX"]);
const US_MICS = new Set(["XNYS", "XNAS", "XASE", "ARCX", "BATS", "IEXG", "MEMX"]);

const PTM = { each: 1.5, above: 10000 };
const IRISH = { stamp: 0.01, itpEach: 1.25, itpAbove: 12500 };
const HK = { stamp: 0.001, levy: 0.000027, trading: 0.00005 };
const SG = { clearing: 0.000325 };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const inCurrency = (amount, from, to) => {
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
};

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

function marketOf(mic) {
  if (UK_MICS.has(mic)) return "uk";
  if (US_MICS.has(mic)) return "us";
  return "intl";
}

// Sterling commission for one side of a deal worth `pounds`.
export function commissionEach(pounds, plan = DEFAULT_PLAN, market = "uk") {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked || !(pounds > 0)) return null;
  const big = LARGE[market];
  if (pounds > big.above) return big.flat ?? pounds * big.rate;
  return market === "intl" ? picked.intl : picked.ukUs;
}

function fxOnDeal(pounds, bands) {
  if (!(pounds > 0)) return null;
  let fee = 0;
  let floor = 0;
  for (const band of bands) {
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
      if (loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);
  return { named, matches };
}

function remarkOf(plan, currency) {
  return [
    `${plan.label} is £${plan.monthly} a month.`,
    plan.id === "plus" ? "Monthly credit £3.99, one UK/US trade." : null,
    plan.id === "premium" ? "Monthly credit £29.90, ten UK/US trades." : null,
    listingCash(currency) !== CASH ? "The ISA holds pounds only, so a foreign line there pays the FX on both legs." : null,
  ]
    .filter(Boolean)
    .join(" ");
}

// A held line in a currency other than pounds is not converted: the plan's
// FX rate goes in the remark.
function fxRemarkOf(plan, currency) {
  const [first, next] = plan.fx;
  const extra = next ? `to £${first.upTo.toLocaleString("en-GB")}, ${(100 * next.rate).toFixed(2)}% above` : "";
  return fxRemark((100 * first.rate).toFixed(2), currency, extra);
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is ii's ticket and, on
 * a line the account cannot hold, the FX. Stamp, levies and the Hong Kong
 * and Singapore exchange fees sit in `usd` only.
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

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (core|plus|premium)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue interactive investor n'existe pas encore : lancer `node brokers/interactiveinvestor/interactiveinvestor_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue interactive investor` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez interactive investor`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? m.row.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "interactiveinvestor",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };
  const mic = String(m.row.mic || listing.mic || "").toUpperCase();
  const market = marketOf(mic);
  const held = HOLD.has(listing.currency);
  const stock = String(listing.type || "").toUpperCase() === "STOCK";
  const isin = listing.isin || "";
  const tax = isin ? taxesOf(isin) : null;
  // UK stamp is a London charge here: a GB share dealt in Hong Kong or New
  // York sits on a foreign register and pays that market's stamp instead.
  const rates = Object.fromEntries(
    Object.entries(taxRates(tax)).filter(([name]) => market === "uk" || !/^STAMP_DUTY$/.test(name))
  );
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
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
  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: held ? (listing.currency === "GBX" ? "GBP" : listing.currency) : CASH,
    remark: held && listingCash(listing.currency) !== CASH ? `${remarkOf(picked, listing.currency)} ${fxRemarkOf(picked, listing.currency)}` : remarkOf(picked, listing.currency),
    bp: marketBp,
    perShare: marketPerShare,
    url: SCHEDULE.charges,
    basis: `barème interactive investor ${picked.label}, ${market === "intl" ? "autres marchés internationaux" : market === "us" ? "actions US" : "actions UK"}, relu le ${SCHEDULE.readOn}`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: held ? picked.fx[0].rate * 2 : 0,
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
  const pounds = inCurrency(notional, listing.currency, CASH);
  const each = commissionEach(pounds, picked, market);
  const commissionGbp = each == null ? null : each * 2;
  const fxEach = held ? 0 : fxOnDeal(pounds, picked.fx);
  const fxGbp = fxEach == null ? null : fxEach * 2;

  // Taxes and levies, in the listing currency unless said otherwise.
  const hk = mic === "XHKG";
  const sg = mic === "XSES";
  const ukShare = stock && isin.startsWith("GB") && market === "uk";
  const irishShare = stock && isin.startsWith("IE") && market !== "us" && rates.STAMP_DUTY == null;
  const ptmDue = !ukShare ? false : pounds == null ? null : pounds > PTM.above;
  const ptmGbp = ptmDue ? PTM.each * 2 : ptmDue === false ? 0 : null;
  const euros = irishShare ? inCurrency(notional, listing.currency, "EUR") : 0;
  const itpEur = irishShare ? (euros == null ? null : euros > IRISH.itpAbove ? IRISH.itpEach * 2 : 0) : 0;
  const irishStampLocal = irishShare ? notional * IRISH.stamp : 0;
  const hkStampLocal = hk && stock ? Math.ceil(notional * HK.stamp) * 2 : 0;
  const exchangeLocal = hk ? notional * (HK.levy + HK.trading) * 2 : sg ? notional * SG.clearing * 2 : 0;

  const bookUsd =
    partsBook.a == null || notionalUsd == null
      ? null
      : partsBook.b == null
        ? null
        : partsBook.a * notionalUsd + partsBook.b * n;
  const gap = taxGap(isin, listing.type, listing.mic);
  const taxUsd = plus(
    gap || notionalUsd == null ? null : notionalUsd * taxTotal,
    ptmGbp == null ? null : dollars(ptmGbp, CASH),
    itpEur == null ? null : dollars(itpEur, "EUR"),
    dollars(irishStampLocal + hkStampLocal, listing.currency)
  );
  const exchangeUsd = dollars(exchangeLocal, listing.currency);
  const commissionUsd = commissionGbp == null ? null : dollars(commissionGbp, CASH);
  const fxUsd = fxGbp == null ? null : dollars(fxGbp, CASH);
  const brokerFees = plus(commissionUsd, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd, exchangeUsd);
  const unknown = [
    bookUsd == null
      ? `aucun carnet pour ${m.unsourced?.name || listing.exchange || "cette ligne"} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { each, currency: CASH, eachWay: true, plan: picked.id, market },
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
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
      bourse: finite(exchangeUsd, 6),
      change: finite(fxUsd, 6),
    },
    confidence: [
      `barème ${picked.label}, relu le ${SCHEDULE.readOn} (PDF du ${SCHEDULE.pdfDated})`,
      each == null
        ? null
        : pounds > LARGE[market].above
          ? `ordre au-delà de ${LARGE[market].above} £ : ${LARGE[market].flat != null ? `${LARGE[market].flat} £` : `${LARGE[market].rate * 100} % du montant`} par sens, au lieu du forfait`
          : `courtage ${each} £ par sens`,
      held ? `devise détenue sur le compte (${listing.currency}) : pas de change` : "change par paliers, les deux sens, dans les frais",
      ptmDue ? `PTM ${PTM.each} £ par sens, le montant dépassant ${PTM.above} £` : null,
      irishShare ? `droit de timbre irlandais ${IRISH.stamp * 100} % à l'achat` : null,
      irishShare && itpEur ? `ITP ${IRISH.itpEach} € par sens` : null,
      hk ? "Hong Kong : timbre 0,1 % arrondi au HKD supérieur, prélèvement 0,0027 % et frais de bourse 0,005 %, les deux sens" : null,
      sg ? "Singapour : frais de compensation 0,0325 %, les deux sens" : null,
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
        { ...SCHEDULE, defaultPlan: DEFAULT_PLAN, plans: PLANS, large: LARGE, ptm: PTM, irish: IRISH, hk: HK, sg: SG, cash: CASH, hold: [...HOLD] },
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
      "usage : node brokers/interactiveinvestor/interactiveinvestor_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=core|plus|premium] [--json]"
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
    if (parts.bourse) console.log(`  bourse         : ${parts.bourse} $`);
    if (parts.change) console.log(`  change         : ${parts.change} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
