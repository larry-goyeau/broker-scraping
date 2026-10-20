// What one round trip costs at Charles Stanley Direct (UK): buy n shares
// at price p, sell them back at once, online, in dollars.
//
// Online Investing rates and charges, read on 2026-10-20 (web page, and
// the PDF 96.52.01 "Nov 2025"). One card for the Investment Account, the
// Stocks & Shares ISA, the Junior ISA and the SIPP.
//
//   UK shares, ETFs, ETCs, investment trusts      £10 a trade, online
//   international shares (CDIs: Europe, Canada,   £10 a trade
//   USA), online                                  + international charge
//   international charge / FX, on the whole trade value, by band:
//     £0 – £9,999            1.00%
//     £10,000 – £49,999      0.75%
//     £50,000 – £499,999     0.50%
//     £500,000 – £999,999    0.30%
//     £1,000,000 or more     0.15%
//   "The rate you pay is the one that applies to the overall transaction
//   value": one band for the whole order, not slices (the page's own
//   example: £25,000 → £187.50).
//   platform charge   0.30% a year on everything held, all accounts
//                     together, min £60, max £600 a year (£5 – £50 a month)
//   trading credits   £50 every six months (April, October, and on opening)
//   SIPP              £100 + VAT a year (EBS Pensions), free with over
//                     £30,000 held across the accounts
//
// Online purchases (not funds) are capped at £50,000; above that it is a
// phone deal at phone rates, so the trip is not online (`onlineBuy: false`).
//
// The account holds pounds only (deposits.mjs). Every international line
// online is a CDI dealt in sterling with the international charge on each
// side. A London line priced in dollars, euros, Canadian or Hong Kong
// dollars (CSPX, …) is converted at the published FX scale (business terms
// 1.6.4: "We will exchange foreign currency for your account … in
// accordance with our published scale"), which is the same five bands. A
// GBP or GBX line pays neither.
//
// The trading credits are not taken off the ticket: £10 a trade is what an
// order costs once they are spent. The platform charge is a holding cost,
// in the remark. Phone dealing (1%, min £25, max £100), non-CDI shares
// (phone only, movement and overseas custody fees) and funds are not this
// trip.
//
// Taxes, as the card names them: SDRT 0.5% on UK share purchases
// "excluding AIM" (tax map, London and Aquis only; a GB share on AIM pays
// none, whatever the map says); "1% on Irish shares" (tax map, else the
// card's 1% on the buy of an Irish share in London); French FTT on Paris
// buys (tax map); PTM levy £1.50 "on UK trades over £10,000", a side, on a
// UK share. The card also
// says "there may be Counterparty, Exchange Fees and Financial Transaction
// Taxes levied against your transaction" on international trades without
// a rate: not printed, so they stay at 0.
//
// Plans: the platform charge and the dealing card are the same in every
// account. Only the SIPP adds its yearly administration charge, so
// `--plan=sipp` changes the remark, not the total. Default `account`
// (Investment Account, ISA, Junior ISA).
//
// The book: London (XLON, AIM) and Aquis keep their own; a US line is the
// US tape (Charles Stanley names no US dealer, so no 606 Q: quoted NBBO);
// Toronto, TSX Venture, Paris, Xetra and SIX their own venue's book.
//
//   https://www.charles-stanley.co.uk/services/invest/online-investing/rates-and-charges
//   https://assets.raymondjames.uk.com/uploads/files/Charles-Stanley/96.52.01-CSD-Rates-and-Charges-Nov24.pdf
//   https://www.charles-stanley.co.uk/help-and-contact/help/international-trading
//   https://www.charles-stanley.co.uk/services/invest/terms-conditions#fx-currency-transaction-rates
//   https://assets.raymondjames.uk.com/uploads/files/Charles-Stanley/Terms-and-charges/96.55.pdf
//     (all read on 2026-10-20; the old charles-stanley-direct.co.uk/charges
//     answers 404)
//
//   node brokers/charlesstanley/charlesstanley_cost.mjs VOD LSE GBX --shares=100 --price=110
//   node brokers/charlesstanley/charlesstanley_cost.mjs AAPL --shares=10 --price=343.46
//   node brokers/charlesstanley/charlesstanley_cost.mjs CSPX LSE USD --shares=10 --price=821.89 --plan=sipp
//   node brokers/charlesstanley/charlesstanley_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("charlesstanley-parsed.json", import.meta.url);

const SCHEDULE = {
  charges: "https://www.charles-stanley.co.uk/services/invest/online-investing/rates-and-charges",
  pdf: "https://assets.raymondjames.uk.com/uploads/files/Charles-Stanley/96.52.01-CSD-Rates-and-Charges-Nov24.pdf",
  international: "https://www.charles-stanley.co.uk/help-and-contact/help/international-trading",
  fx: "https://www.charles-stanley.co.uk/services/invest/terms-conditions#fx-currency-transaction-rates",
  terms: "https://assets.raymondjames.uk.com/uploads/files/Charles-Stanley/Terms-and-charges/96.55.pdf",
  readOn: "2026-10-20",
  pdfDated: "2025-11",
  entity: "Raymond James Wealth Management Limited (Charles Stanley)",
};

const CASH = "GBP";
const SHARE = 10;
const ONLINE_MAX = 50000;
const PTM = { each: 1.5, above: 10000 };
const IRISH_STAMP = 0.01;
// One band for the whole order: the international charge on a CDI, the FX
// on a London line in another currency.
const BANDS = [
  { below: 10000, rate: 0.01 },
  { below: 50000, rate: 0.0075 },
  { below: 500000, rate: 0.005 },
  { below: 1000000, rate: 0.003 },
  { below: Infinity, rate: 0.0015 },
];
const PLATFORM = { rate: 0.003, min: 60, max: 600 };
const CREDIT = 50;

const DEFAULT_PLAN = "account";
const PLANS = {
  account: { id: "account", label: "Investment Account / ISA", admin: null },
  sipp: { id: "sipp", label: "SIPP", admin: { yearly: 100, vat: true, freeAbove: 30000 } },
};
const PLAN_ALIAS = {
  account: "account",
  investment: "account",
  investmentaccount: "account",
  gia: "account",
  isa: "account",
  jisa: "account",
  juniorisa: "account",
  sipp: "sipp",
  pension: "sipp",
};

const UK_MICS = new Set(["XLON", "AQSE", "AQXE"]);

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

// Rate of the band the whole sterling value falls in.
export function bandRate(pounds) {
  if (!(pounds > 0)) return null;
  return BANDS.find((b) => pounds < b.below).rate;
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

function remarkOf(plan) {
  return [
    `Platform fee is 0.30% a year across accounts, min £${PLATFORM.min}, max £${PLATFORM.max}.`,
    `£${CREDIT} trading credit every six months.`,
    plan.admin ? `SIPP admin is £${plan.admin.yearly} + VAT a year, free above £${plan.admin.freeAbove.toLocaleString("en-GB")} held.` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the £10 ticket on
 * each side plus, on a line not in pounds, the international charge (CDI)
 * or the FX (London line in another currency). Stamp, FTT and PTM sit in
 * `usd` only.
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
    url: SCHEDULE.charges,
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (account|sipp)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Charles Stanley n'existe pas encore : lancer `node brokers/charlesstanley/charlesstanley_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Charles Stanley Direct` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Charles Stanley Direct`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? m.row.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "charlesstanley",
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
  const uk = UK_MICS.has(mic);
  const aim = /^AIM$/i.test(String(m.row.exchange || ""));
  // "excluding AIM" is said of UK share purchases: a GB share on AIM. An
  // Irish share on AIM still pays the card's "1% on Irish shares".
  const ukAim = aim && String(m.row.isin || "").toUpperCase().startsWith("GB");
  const sterling = listingCash(listing.currency) === CASH;
  // A non-UK line online is a CDI: international charge. A London line in
  // another currency: FX at the same scale. Pounds and pence: neither.
  const conversion = sterling ? null : uk ? "fx" : "international";
  const stock = String(listing.type || "").toUpperCase() === "STOCK";
  const isin = listing.isin || "";
  const tax = isin ? taxesOf(isin) : null;
  // UK stamp is a London/Aquis charge, and none on AIM ("excluding AIM").
  const rates = Object.fromEntries(
    Object.entries(taxRates(tax)).filter(([name]) => !/^STAMP_DUTY$/.test(name) || (uk && !ukAim))
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
    feeMarket: uk ? "uk" : "international",
    remark: remarkOf(picked),
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Charles Stanley Direct en ligne, relu le ${SCHEDULE.readOn} : ${SHARE} £ par ordre${
      conversion === "international" ? " + frais internationaux (CDI) par paliers" : conversion === "fx" ? " + change par paliers" : ""
    }`,
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
  if (pounds != null && pounds > ONLINE_MAX) {
    return {
      ...shared,
      onlineBuy: false,
      why: `achat en ligne plafonné à ${ONLINE_MAX} £ : au-delà, par téléphone seulement`,
      trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    };
  }

  const rate = conversion ? bandRate(pounds) : 0;
  const convGbp = rate == null ? null : pounds * rate * 2;
  const commissionGbp = SHARE * 2;
  const ukShare = stock && isin.startsWith("GB") && uk;
  const ptmDue = !ukShare ? false : pounds == null ? null : pounds > PTM.above;
  // "1% on Irish shares", from the card, when the tax map has no stamp line.
  const irishShare = stock && isin.startsWith("IE") && uk && rates.STAMP_DUTY == null;
  const irishStampLocal = irishShare ? notional * IRISH_STAMP : 0;
  const ptmGbp = ptmDue ? PTM.each * 2 : ptmDue === false ? 0 : null;

  const bookUsd =
    partsBook.a == null || notionalUsd == null
      ? null
      : partsBook.b == null
        ? null
        : partsBook.a * notionalUsd + partsBook.b * n;
  // AIM is outside SDRT by the card itself: no tax line is not a gap there.
  const gap = ukAim || irishShare ? null : taxGap(isin, listing.type, listing.mic);
  const taxUsd = plus(
    gap || notionalUsd == null ? null : notionalUsd * taxTotal,
    ptmGbp == null ? null : dollars(ptmGbp, CASH),
    dollars(irishStampLocal, listing.currency)
  );
  const commissionUsd = dollars(commissionGbp, CASH);
  const convUsd = convGbp == null ? null : dollars(convGbp, CASH);
  const brokerFees = plus(commissionUsd, convUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd);
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
    commission: { each: SHARE, currency: CASH, eachWay: true, plan: picked.id },
    ...(conversion ? { [conversion === "fx" ? "fxRate" : "internationalRate"]: rate } : {}),
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
      change: finite(convUsd, 6),
    },
    confidence: [
      `barème en ligne relu le ${SCHEDULE.readOn} (PDF 96.52.01 de novembre 2025)`,
      `courtage ${SHARE} £ par ordre, crédits de trading non déduits`,
      conversion === "international"
        ? `CDI : frais internationaux ${(rate * 100).toFixed(2)} % par sens, palier du montant total`
        : conversion === "fx"
          ? `ligne londonienne en ${listing.currency} : change ${(rate * 100).toFixed(2)} % par sens au barème publié (art. 1.6.4)`
          : "ligne en livres : ni change ni frais internationaux",
      ukAim ? "AIM : pas de droit de timbre (SDRT)" : null,
      irishShare ? `droit de timbre irlandais ${IRISH_STAMP * 100} % à l'achat (barème)` : null,
      ptmDue ? `PTM ${PTM.each} £ par sens, le montant dépassant ${PTM.above} £` : null,
      conversion === "international" ? "frais de contrepartie ou de bourse éventuels non chiffrés par le barème : 0" : null,
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
        { ...SCHEDULE, share: SHARE, onlineMax: ONLINE_MAX, bands: BANDS, platform: PLATFORM, credit: CREDIT, ptm: PTM, plans: PLANS, defaultPlan: DEFAULT_PLAN, cash: CASH },
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
      "usage : node brokers/charlesstanley/charlesstanley_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=account|sipp] [--json]"
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
