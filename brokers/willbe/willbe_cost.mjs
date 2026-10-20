// What one round trip costs at willbe (LLB, Liechtenstein): buy n units of
// an ETFselect line at price p, sell them back, in dollars.
//
// Pricing page and FAQ, read on 2026-10-18 (the page prints no date).
// The fees are charged in the reference currency, EUR or CHF, picked at
// registration and fixed. Default is EUR. `--plan=chf` is the CHF account.
// `--plan=eur-plan|chf-plan` buys through the savings plan, whose buy pays
// no trading fee; the sell is still a one-off order.
//
//   trading fee, one-off order      EUR 2 / CHF 2 per transaction
//   trading fee, savings plan buy   free
//   volume fee                      0.25% of the part of an order above
//                                   EUR/CHF 25,000
//   Swiss stamp duty                0.075% (CH or LI ETF), 0.15% (foreign
//                                   ETF), passed on, each side
//   FX                              0.30% on the converted amount
//   exchange fees                   "occasionally" passed on, no amount:
//                                   the venue's own tariff, each side
//                                   (below)
//
// Exchange fees, looked for again on 2026-10-18, no amount at willbe:
//   - FAQ (en and de): "Occasionally, exchange fees may be charged that we
//     must pass on"; "their amount can vary"; the amount shows only in the
//     order's own cost breakdown, in the app.
//   - pricing page (en and de, /de/preisuebersicht/gebuehren): ticket,
//     volume fee, stamp, FX; no exchange-fee row.
//   - willbe AGB (agb-de.pdf, depot rules, MiFID info, execution policy):
//     LLB is a member of SIX only and forwards every other order to a
//     third-party broker (smart order routing); no fee table.
//   - LLB "Preisübersicht im Anlagegeschäft" (issued 1 January 2026):
//     "Allfällige fremde Courtagen, Lieferspesen, Börsen- oder
//     Meldegebühren, Steuern, Umsatzabgaben etc. sind nicht enthalten."
//     Named again, priced nowhere; the international price list is "on
//     request" only.
//   https://llb.li/-/media/downloads/llb/anlegen/llbpreisuebersichtanlagewertschriften.pdf
//   https://willbe-invest.com/-/media/willbe/downloads/agb-de.pdf
// So the venue's own ETF tariff, per executed order, is what is passed on,
// once a side. It bills the member, here the forwarding broker; willbe
// pools orders, so the client's share may be less. A retail order is under
// both thresholds and pays the minimum.
//   Euronext (Paris, Milan)  0.60 bp, min EUR 1.20 (Option 1, the default;
//                            the size is taken in euros at the ECB rate)
//     Euronext Cash Markets Trading Fee Guide, effective 1 April 2026, 2.2.2
//     https://www.euronext.com/sites/default/files/2026-03/Euronext%20Cash%20Markets%20Trading%20Fee%20Guide_Effective%2001APR2026.pdf
//   London Stock Exchange    0.45 bp, min 10p (first band of the standard
//                            ETF/ETP value-traded scheme)
//     LSE Trading Services Price List 2026, p. 7
//     https://docs.londonstockexchange.com/sites/default/files/documents/trading-services-price-list-january-2026.pdf
//
// The cash accounts that buy ETFselect hold CHF, EUR, USD and GBP
// (deposits.mjs). Every line in the catalogue is in one of them, so it is
// not converted: FX is 0 and `fxIfConverted` carries 0.30% × 2.
// Custody is 0.30% a year to 25,000, 0.25% from 25,000, 0.20% from
// 100,000, 0.15% from 500,000 (the tier reached applies to the whole
// holding), none on the savings plan. That is the remark, not this
// ticket. The CHF 162 transfer-out is not this trip.
//
// Orders are pooled and sent at 11:00 on banking days to "the best stock
// exchanges"; willbe names no venue per line. The catalogue gives each ETF
// one row per Milan, Paris or London listing as a stand-in, and the book
// is that venue's. An ETF line with no listing has no book: N/A. The LLB,
// iNdx and UBS funds are not exchange-traded and are not in the catalogue
// (willbe_scraping.mjs). Stamp and FTT of the
// listing's own market come from the tax map; a GB/IE/FR/IT/ES share with
// no tax-map line is N/A (taxGap).
//
//   https://mobilep.willbe-invest.com/en/pricing/pricing
//   https://mobilep.willbe-invest.com/en/about-willbe/faq
//
//   node brokers/willbe/willbe_cost.mjs C40 XPAR EUR --shares=10 --price=141.7
//   node brokers/willbe/willbe_cost.mjs IWDA LSE USD --shares=10 --price=147.05
//   node brokers/willbe/willbe_cost.mjs C40 XPAR EUR --shares=10 --price=141.7 --plan=chf-plan
//   node brokers/willbe/willbe_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("willbe-parsed.json", import.meta.url);

const SCHEDULE = {
  pricing: "https://mobilep.willbe-invest.com/en/pricing/pricing",
  faq: "https://mobilep.willbe-invest.com/en/about-willbe/faq",
  readOn: "2026-10-18",
  entity: "Liechtensteinische Landesbank AG (willbe)",
};

// Copied into deposits.mjs: the cash accounts ETFselect buys from.
const HOLD = new Set(["CHF", "EUR", "USD", "GBP", "GBX"]);

const DEFAULT_PLAN = "eur";
const PLANS = {
  eur: { id: "eur", label: "compte de référence EUR", ref: "EUR", savingsBuy: false },
  chf: { id: "chf", label: "compte de référence CHF", ref: "CHF", savingsBuy: false },
  "eur-plan": { id: "eur-plan", label: "compte EUR, achat par plan d'épargne", ref: "EUR", savingsBuy: true },
  "chf-plan": { id: "chf-plan", label: "compte CHF, achat par plan d'épargne", ref: "CHF", savingsBuy: true },
};
const PLAN_ALIAS = {
  eur: "eur",
  chf: "chf",
  eurplan: "eur-plan",
  eursavings: "eur-plan",
  chfplan: "chf-plan",
  chfsavings: "chf-plan",
  savings: "eur-plan",
};

const TICKET = 2;
const VOLUME = { above: 25000, rate: 0.0025 };
const STAMP = { domestic: 0.00075, foreign: 0.0015 };
const FX_RATE = 0.003;
// Venue ETF trading fee per executed order, by MIC.
const EXCHANGE_FEE = {
  XPAR: { name: "Euronext", rate: 0.00006, min: 1.2, ccy: "EUR" },
  XMIL: { name: "Euronext", rate: 0.00006, min: 1.2, ccy: "EUR" },
  XLON: { name: "LSE", rate: 0.000045, min: 0.1, ccy: "GBP" },
};
const CUSTODY = [
  { from: 0, rate: 0.003 },
  { from: 25000, rate: 0.0025 },
  { from: 100000, rate: 0.002 },
  { from: 500000, rate: 0.0015 },
];

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

// The venue's fee on one order worth `notional` in `currency`, in the venue's currency.
function venueFee(rule, notional, currency) {
  const size = inCurrency(notional, currency, rule.ccy);
  return size == null ? null : Math.max(rule.min, size * rule.rate);
}

// Trading fee plus volume fee for one order worth `ref` in the reference currency.
function orderFee(ref, ticket) {
  if (ref == null) return null;
  return ticket + Math.max(0, ref - VOLUME.above) * VOLUME.rate;
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

function remarkOf() {
  return "Custody is 0.30% a year to 25,000, 0.25% from 25,000, 0.20% from 100,000 and 0.15% from 500,000 (EUR or CHF), on the whole holding. None on the savings plan.";
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is willbe's trading and
 * volume fees and, on a line the account cannot hold, the FX. The Swiss
 * stamp and any tax-map tax sit in `usd` only.
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
    cashCurrency: picked?.ref ?? "EUR",
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (eur|chf|eur-plan|chf-plan)` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue willbe n'existe pas encore : lancer `node brokers/willbe/willbe_scraping.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue willbe` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez willbe`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "sans place"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? m.row.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "willbe",
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
  const held = HOLD.has(listing.currency);
  const isin = listing.isin || "";
  const stampRate = /^(CH|LI)/.test(isin) ? STAMP.domestic : STAMP.foreign;
  const tax = isin ? taxesOf(isin) : null;
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
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
    cashCurrency: held ? (listing.currency === "GBX" ? "GBP" : listing.currency) : picked.ref,
    remark:
      held && listingCash(listing.currency) !== picked.ref
        ? `${remarkOf()} ${fxRemark((100 * FX_RATE).toFixed(2), listing.currency)}`
        : remarkOf(),
    bp: marketBp,
    perShare: marketPerShare,
    url: SCHEDULE.pricing,
    basis: `barème willbe ETFselect, ${picked.label}, relu le ${SCHEDULE.readOn}`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: held ? FX_RATE * 2 : 0,
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
  const ref = inCurrency(notional, listing.currency, picked.ref);
  const buyTicket = picked.savingsBuy ? 0 : TICKET;
  const sellTicket = TICKET;
  const feesRef = plus(orderFee(ref, buyTicket), orderFee(ref, sellTicket));
  const fxLocal = held ? 0 : notional * FX_RATE * 2;
  const stampLocal = notional * stampRate * 2;

  const bookUsd =
    partsBook.a == null || notionalUsd == null
      ? null
      : partsBook.b == null
        ? null
        : partsBook.a * notionalUsd + partsBook.b * n;
  const gap = taxGap(isin, listing.type, listing.mic);
  const taxUsd = plus(gap || notionalUsd == null ? null : notionalUsd * taxTotal, dollars(stampLocal, listing.currency));
  const commissionUsd = feesRef == null ? null : dollars(feesRef, picked.ref);
  const fxUsd = dollars(fxLocal, listing.currency);
  // Exchange fees willbe passes on "occasionally", with no amount: the
  // venue's own tariff, each side.
  const onExchange = Boolean(m.row.exchange || m.row.mic);
  const venueRule = onExchange ? EXCHANGE_FEE[listing.mic] || EXCHANGE_FEE[m.row.mic] || null : null;
  const venueEach = venueRule ? venueFee(venueRule, notional, listing.currency) : null;
  const exchangeUsd = !onExchange ? 0 : venueEach == null ? null : dollars(venueEach * 2, venueRule.ccy);
  const brokerFees = plus(commissionUsd, fxUsd, exchangeUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const unknown = [
    bookUsd == null
      ? `aucun carnet pour ${m.unsourced?.name || listing.exchange || "cette ligne"} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    onExchange && exchangeUsd == null
      ? `frais de bourse ${listing.exchange || ""} refacturés « occasionnellement », sans montant chez willbe ni tarif de place relevé pour cette bourse`
      : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { buy: buyTicket, sell: sellTicket, currency: picked.ref, volume: VOLUME, plan: picked.id },
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
      bourse: finite(exchangeUsd, 6),
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
    },
    confidence: [
      `barème relu le ${SCHEDULE.readOn}`,
      `frais de transaction ${TICKET} ${picked.ref}${picked.savingsBuy ? " à la vente seulement (achat par plan d'épargne)" : " par sens"}`,
      ref != null && ref > VOLUME.above ? `frais de volume ${VOLUME.rate * 100} % au-delà de ${VOLUME.above} ${picked.ref}, par sens` : null,
      stampRate ? `droit de timbre suisse ${stampRate * 100} % par sens` : null,
      held ? `devise détenue (${listing.currency}) : pas de change` : `change ${FX_RATE * 100} % par sens`,
      venueRule
        ? `frais de bourse ${venueRule.name} ${Number((venueRule.rate * 1e4).toFixed(2))} bp, min ${venueRule.min} ${venueRule.ccy} par ordre, par sens (tarif de la place)`
        : onExchange
          ? "frais de bourse refacturés occasionnellement, sans montant : N/A"
          : null,
      marketBp != null
        ? `carnet ${Number(marketBp.toPrecision(4))} bp (place prise pour celle de willbe)`
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
        { ...SCHEDULE, defaultPlan: DEFAULT_PLAN, plans: PLANS, ticket: TICKET, volume: VOLUME, stamp: STAMP, fx: FX_RATE, exchangeFee: EXCHANGE_FEE, custody: CUSTODY, hold: [...HOLD] },
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
      "usage : node brokers/willbe/willbe_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=eur|chf|eur-plan|chf-plan] [--json]"
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
  console.log(`${l.exchange || "sans place"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}  [${out.plan}]\n`);
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
