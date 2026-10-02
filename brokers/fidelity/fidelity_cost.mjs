// What one round trip costs at Fidelity Personal Investing: buy n shares
// at price p, sell them back at once (online, one-off), in dollars.
//
// Re-read 2026-10-01. The same online ticket covers the Investment Account,
// the Stocks and Shares ISA and the SIPP. A regular savings plan, a
// withdrawal plan and a dividend reinvestment are £1.50 and are
// `--plan=regular`. Phone dealing is £30 and is not this ticket.
//
//   shares, ETF, ETC, ETN     £7.50 a side     regular £1.50
//   FX, non-sterling line     0.75% to £10,000, then 0.50% to £20,000,
//                             then 0.25%, each way
//
// The account holds pounds. A foreign price is converted on the deal, so
// the FX is inside the broker fee. A GBP or GBX line is not converted.
// The service fee is not a trade: 0.35% a year on exchange-traded lines in
// an ISA or a SIPP, 0.20% from £250,000, capped at £7.50 a month. An
// Investment Account and a Junior account do not charge it on shares.
// Stamp and FTT come from the tax map. PTM is £1.50 a side on a UK share
// deal above £10,000, which the tax map does not price as a flat.
//
// Orders go to Winterflood Business Services or J.P. Morgan Securities Ltd.
// A US or European share is a sterling CDI. The quote is one side, for
// fifteen seconds, and Fidelity does not print the other side. That spread
// is unknown: the NBBO is not used. A London line keeps the exchange book.
//
//   https://www.fidelity.co.uk/services/charges-fees/
//   https://www.fidelity.co.uk/international-shares/
//   https://www.fidelity.co.uk/media/PI%20UK/pdf/legal/gfas-doing-business-with-fidelity.pdf
//
//   node brokers/fidelity/fidelity_cost.mjs HSBA LSE GBP --shares=10 --price=7
//   node brokers/fidelity/fidelity_cost.mjs AAPL --shares=10 --price=230
//   node brokers/fidelity/fidelity_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("fidelity-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);

const SCHEDULE = {
  charges: "https://www.fidelity.co.uk/services/charges-fees/",
  overseas: "https://www.fidelity.co.uk/international-shares/",
  execution: "https://www.fidelity.co.uk/media/PI%20UK/pdf/legal/gfas-doing-business-with-fidelity.pdf",
  readOn: "2026-10-01",
  entity: "Financial Administration Services Limited",
  dealingPartners: ["Winterflood Business Services", "J.P. Morgan Securities Ltd"],
  usBrokerDealer: null,
};

const CASH = "GBP";
const DEFAULT_PLAN = "online";
const PLANS = {
  online: { id: "online", label: "one-off online", share: 7.5 },
  regular: { id: "regular", label: "regular savings or dividend reinvestment", share: 1.5 },
};
const PLAN_ALIAS = { online: "online", standard: "online", regular: "regular", plan: "regular" };
const PTM = { each: 1.5, above: 10000 };
// Marginal FX on the sterling value of one deal. Each band is its own rate.
const FX_BANDS = [
  { upTo: 10000, rate: 0.0075 },
  { upTo: 20000, rate: 0.005 },
  { upTo: Infinity, rate: 0.0025 },
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

// A London, Aquis or Chi-X line is not a CDI. Anything else is dealt as one,
// and the two-way price is not published.
const HOME = new Set(["XLON", "AQSE", "CHIX"]);
function cdiOf(match) {
  const mic = match.venue?.mic || "";
  if (HOME.has(mic)) return false;
  const exchange = String(match.row.exchange || "").toUpperCase();
  return !HOME.has(exchange);
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
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);
  return { named, matches };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the dealing charge
 * and, on a foreign line, the FX. The service fee is the remark.
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

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (online|regular)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Fidelity n'existe pas encore : lancer `node brokers/fidelity/fidelity_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Fidelity` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Fidelity`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const cdi = cdiOf(m);
  const book = cdi
    ? { leaf: null, mic: m.venue?.mic ?? null }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
        broker: "fidelity",
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
    remark:
      "Service fee on an ISA or a SIPP is 0.35% a year, 0.20% from £250,000, capped at £7.50 a month. An Investment Account does not charge it on shares.",
    bp: marketBp,
    perShare: marketPerShare,
    via606: false,
    url: sterling(listing.currency) ? SCHEDULE.charges : SCHEDULE.overseas,
    basis: `barème Fidelity Personal Investing, ${picked.label}, relu le ${SCHEDULE.readOn}`,
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
  const fxEach = sterling(listing.currency) ? 0 : fxOnDeal(pounds);
  const commissionGbp = picked.share * 2;
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
  const usd = cdi ? null : plus(bookUsd, brokerFees, taxUsd, ptmUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { each: picked.share, currency: CASH, eachWay: true, plan: picked.id },
    ...(bookUsd == null && !cdi
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
      `courtage ${picked.share} £ par sens`,
      sterling(listing.currency) ? "ligne en sterling : pas de change" : "change par paliers, les deux sens, dans les frais",
      "pas de Rule 606 : Winterflood Business Services et J.P. Morgan Securities Ltd",
      ptmDue ? `PTM ${PTM.each} £ par sens, le montant dépassant ${PTM.above} £` : null,
      cdi
        ? "CDI : le bid et l'ask ne sont pas publiés, unknown spread"
        : marketBp != null
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
        { ...SCHEDULE, defaultPlan: DEFAULT_PLAN, plans: PLANS, fx: FX_BANDS, ptm: PTM, cash: CASH },
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
      "usage : node brokers/fidelity/fidelity_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=online|regular]"
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
    const unknown = out.usd == null && out.bp == null && out.perShare == null;
    console.log(`aller-retour     : ${unknown ? "unknown spread" : out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
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
