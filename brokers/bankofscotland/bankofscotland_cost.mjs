// What one round trip costs at Bank of Scotland Share Dealing: buy n shares
// at price p, sell them back at once, online, in dollars.
//
// Bank of Scotland Share Dealing is run by Halifax Share Dealing Limited,
// like brokers/lloyds and brokers/halifax. Its charges page, read on
// 2026-10-20, prints the Halifax tariff. Default is the online deal. The
// `--plan=private` is a Private Banking customer. A regular investment is
// free. A dividend reinvestment is 2% of the dividend, capped at £9.50. A
// TradePlan costs £2 and takes £2 off the commission when it executes. A
// telephone deal is £25. None of those is this trip. There is no
// frequent-trader rate.
//
//   UK share, ETF, investment trust, fund   £9.50 a side
//                                           Private Banking £8.50
//   international line                      £0, plus 1.25% FX each way
//
// The account holds pounds (deposits.mjs). A price in dollars or euros is
// converted on the deal, so the 1.25% is in the total, on both legs. A GBP
// or GBX line is not converted. The customer admin fee is £36 a year for the
// ISA and the dealing account together, free for an 18 to 25 year old and
// waived for Private Banking; it stays off the ticket and is the remark.
// Stamp and FTT come from the tax map; a GB, IE, FR, IT or ES share with
// no tax-map line is N/A (taxGap). PTM is £1.50 a side on a deal above
// £10,000 in a share of a UK, Channel Islands or Isle of Man company, which
// the tax map does not price as a flat.
//
// The costs and charges PDF linked from the page is encrypted and was not
// read; the HTML page is the source.
//
// The order form names the market (LSE, NASDAQ, XETRA). That book is the
// spread. A US line takes the 606 Q of the folder (spreads/rule606.mjs);
// Halifax Share Dealing sends international orders to Banca IMI like
// Lloyds and Halifax, which is the "bimi" alias those two use. A European
// book stays in basis points.
//
//   https://www.bankofscotland.co.uk/investing/ways-to-invest/share-dealing-services/charges.html
//   https://www.bankofscotland.co.uk/assets/pdf/sharedealing/filestore/costsandcharges.pdf
//
//   node brokers/bankofscotland/bankofscotland_cost.mjs BP. XLON GBX --shares=100 --price=450
//   node brokers/bankofscotland/bankofscotland_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/bankofscotland/bankofscotland_cost.mjs MC XPAR EUR --shares=10 --price=600
//   node brokers/bankofscotland/bankofscotland_cost.mjs BP. XLON GBX --shares=100 --price=450 --plan=private
//   node brokers/bankofscotland/bankofscotland_cost.mjs --schedule
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

const FOLDER = "bankofscotland";
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);

const SCHEDULE = {
  charges: "https://www.bankofscotland.co.uk/investing/ways-to-invest/share-dealing-services/charges.html",
  pdf: "https://www.bankofscotland.co.uk/assets/pdf/sharedealing/filestore/costsandcharges.pdf",
  readOn: "2026-10-20",
  entity: "Halifax Share Dealing Limited",
};

const CASH = "GBP";
const DEFAULT_PLAN = "online";
const PLANS = {
  online: { id: "online", label: "online deal", share: 9.5 },
  private: { id: "private", label: "Private Banking", share: 8.5 },
};
const PLAN_ALIAS = {
  online: "online",
  standard: "online",
  private: "private",
  privatebanking: "private",
};
const FX = 0.0125;
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

function remarkOf(plan) {
  const charge =
    plan === "private"
      ? "The £36 account charge a year is waived for Private Banking."
      : "Account charge £36 a year, free for an 18–25 year old.";
  return `${charge} Dividend reinvestment fee is 2% of the dividend, capped at £9.50.`;
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

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (online|private)` };
  if (!catalogue) {
    return { ...answer, why: `le catalogue Bank of Scotland n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Bank of Scotland` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Bank of Scotland`,
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
    remark: [remarkOf(picked.id), foreign && held ? fxRemark((100 * FX).toFixed(2), listing.currency) : ""].filter(Boolean).join("\n"),
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Bank of Scotland (Halifax Share Dealing), ${picked.label}, page des frais relue le ${SCHEDULE.readOn}. Courtage ${picked.share} £ par sens au Royaume-Uni, 0 £ à l'international plus ${100 * FX} % de change par sens.`,
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
  const fxEach = !forcedFx ? 0 : pounds == null ? null : pounds * FX;
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
    commission: { each, currency: CASH, eachWay: true, plan: picked.id, ...(forcedFx ? { fx: FX } : {}) },
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
    console.log(JSON.stringify({ ...SCHEDULE, defaultPlan: DEFAULT_PLAN, plans: PLANS, fx: FX, ptm: { ...PTM, countries: [...PTM.countries] }, cash: CASH }, null, 2));
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
