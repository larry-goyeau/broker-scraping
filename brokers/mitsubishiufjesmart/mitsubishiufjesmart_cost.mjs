// What one round trip costs at Mitsubishi UFJ eSmart Securities (kabu.com,
// formerly au Kabucom): buy n shares at price p, sell them back at once, in
// dollars. Internet orders, the plan a new account gets (通常). The large-
// order plan (大口優遇) is judged daily on past business and stays out. The
// phone line adds 2 200 ¥ an order and stays out. NISA is free and stays out.
//
// Read 2026-10-18.
//
//   Japan, cash, one order, tax included
//     SOR order                    0, whatever the amount
//     Tokyo is SOR. Nagoya, Fukuoka and Sapporo are outside the free SOR
//     line and pay the non-SOR table:
//     up to 50 000 ¥               55 ¥
//     up to 100 000 ¥              99 ¥
//     up to 200 000 ¥             115 ¥
//     up to 500 000 ¥             275 ¥
//     up to 1 000 000 ¥           535 ¥
//     above                       0.099 % + 99 ¥, capped at 4 059 ¥
//     fractions of a yen are dropped
//   United States, one order
//     0.45 % plus 10 % tax, each truncated to the cent (0.495 % tax included)
//     minimum 0 USD
//     capped at 22 USD tax included
//
// The account holds dollars (外国株預り金（米ドル）), so a US line settles in
// dollars. Yen settlement puts 20 sen per dollar inside the rate, each way.
// The remark is that 20 sen over the dollar mid. The 為替取引 page that
// converts yen to dollars ahead of time prints no spread. The tariff names
// no SEC fee. These rows carry no stamp in the tax map.
//
// US cash orders are passed to Interactive Brokers LLC (rule page), which
// files a Rule 606, so a US line uses that mix. OTC names are not taken on
// (取扱銘柄, rule page): two catalogue rows still say OTC. They answer N/A,
// since a round trip starts with a buy.
//
//   https://kabu.com/item/stock/cost.html
//   https://kabu.com/item/foreign_stock/us_stock/stock/cost.html
//   https://kabu.com/item/foreign_stock/us_stock/stock/rule.html
//   https://kabu.com/item/foreign_stock/us_stock/caution.html
//
//   node brokers/mitsubishiufjesmart/mitsubishiufjesmart_cost.mjs 1301 Tokyo JPY --shares=100 --price=4000
//   node brokers/mitsubishiufjesmart/mitsubishiufjesmart_cost.mjs 1401 Fukuoka JPY --shares=100 --price=1200
//   node brokers/mitsubishiufjesmart/mitsubishiufjesmart_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/mitsubishiufjesmart/mitsubishiufjesmart_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("mitsubishiufjesmart-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://kabu.com/item/stock/cost.html",
  us: "https://kabu.com/item/foreign_stock/us_stock/stock/cost.html",
  rules: "https://kabu.com/item/foreign_stock/us_stock/stock/rule.html",
  fx: "https://kabu.com/item/foreign_stock/us_stock/caution.html",
  readOn: "2026-10-18",
  entity: "三菱UFJ eスマート証券",
  venue: "Interactive Brokers LLC",
};

// Non-SOR table, tax included: [upper bound in yen, fee in yen].
const JP_STEPS = [
  [50_000, 55],
  [100_000, 99],
  [200_000, 115],
  [500_000, 275],
  [1_000_000, 535],
];
const JP_RATE = 0.00099;
const JP_ADD = 99;
const JP_CAP = 4_059;
const US_PRETAX = 0.0045;
const US_VAT = 0.1;
const US_CAP = 22;
// Yen per dollar inside the yen-settlement rate, each way.
const FX_YEN = 0.2;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "US"]);
const SOR_FREE = new Set(["TOKYO"]);
const REGIONAL = new Set(["NAGOYA", "FUKUOKA", "SAPPORO"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// One order outside the free SOR line.
function regionalYen(notional) {
  if (!(notional > 0)) return null;
  for (const [upTo, fee] of JP_STEPS) if (notional <= upTo) return fee;
  return Math.min(JP_CAP, Math.floor(notional * JP_RATE + JP_ADD));
}

// 0.45 % truncated to the cent, plus 10 % tax truncated to the cent, cap 22.
function usLeg(notional) {
  if (!(notional > 0)) return null;
  const base = Math.floor(notional * US_PRETAX * 100 + 1e-9) / 100;
  const vat = Math.floor(base * US_VAT * 100 + 1e-9) / 100;
  return Math.min(US_CAP, base + vat);
}

function fxRemarkUsd() {
  const jpy = usdPer("JPY");
  if (!(jpy > 0)) return fxRemark("", "USD");
  return fxRemark((FX_YEN * jpy * 100).toFixed(3), "USD");
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the ticket.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
  };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue eスマート n'existe pas encore : lancer `node brokers/mitsubishiufjesmart/mitsubishiufjesmart_scraping.mjs`",
    };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue eスマート` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez eスマート`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "mitsubishiufjesmart",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const market = loose(listing.brokerExchange);
  const tokyo = SOR_FREE.has(market);
  const regional = REGIONAL.has(market);
  const japan = tokyo || regional;
  const american = US_MICS.has(market) && listing.currency === "USD";
  if (market === "OTC") {
    return {
      ...answer,
      listing,
      cashCurrency: "USD",
      url: SCHEDULE.rules,
      why: "les titres du gré à gré américain (OTC) ne sont pas pris en charge (règle US eスマート) : pas d'achat, donc pas d'aller-retour",
    };
  }
  if (!japan && !american) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
  }
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const remark = american ? fxRemarkUsd() : "";
  const shared = {
    ...answer,
    listing,
    cashCurrency: japan ? "JPY" : "USD",
    remark,
    url: japan ? SCHEDULE.url : SCHEDULE.us,
    basis: tokyo
      ? `barème eスマート, lu le ${SCHEDULE.readOn} : 0 ¥ par ordre SOR`
      : regional
        ? `barème eスマート hors SOR, lu le ${SCHEDULE.readOn} : 55 ¥ à 535 ¥ jusqu'à 1 000 000 ¥, puis 0,099 % + 99 ¥, plafond 4 059 ¥ ; Nagoya, Fukuoka et Sapporo sont exclus du 0 SOR`
        : `barème US eスマート, lu le ${SCHEDULE.readOn} : 0,495 % TTC par ordre, minimum 0, plafond 22 USD`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leaf = book.leaf;
  let marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american && marketBp == null) {
    const quoted = usBookPerShare({ broker: "interactivebrokers", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * n;
  let commissionUsd;
  let commission;
  if (tokyo) {
    commissionUsd = 0;
    commission = { rate: 0, currency: "JPY", eachWay: true, sor: true };
  } else if (regional) {
    const one = regionalYen(notional);
    commissionUsd = one == null ? null : dollars(one * 2, "JPY");
    commission = { perOrder: one, currency: "JPY", eachWay: true, sor: false };
  } else {
    commissionUsd = plus(usLeg(notional), usLeg(notional));
    commission = { rate: US_PRETAX * (1 + US_VAT), min: 0, cap: US_CAP, currency: "USD", eachWay: true };
  }
  const brokerFees = commissionUsd;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    tokyo ? "ordre SOR, plan normal" : regional ? "marché régional, hors SOR, plan normal" : `exécution ${SCHEDULE.venue}`,
    remark ? "change hors du chiffre : compte en dollars" : "ligne en yens : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet 605 × Q IBKR, ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission,
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
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
    confidence,
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
        {
          ...SCHEDULE,
          japan: "SOR order 0 (Tokyo); Nagoya, Fukuoka, Sapporo non-SOR: 55 / 99 / 115 / 275 / 535 JPY up to 50k / 100k / 200k / 500k / 1M, then 0.099 % + 99 JPY, cap 4059, tax included, per order",
          usFee: "0.45 % + 10 % tax, each truncated to the cent, per order, min 0 USD, cap 22 USD tax included",
          conversion: "remark only: 0.20 JPY per USD each way inside the yen-settlement rate; the account holds USD",
          otc: "not taken on (rule page): N/A",
          rule606: "interactivebrokers",
        },
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
      "usage : node brokers/mitsubishiufjesmart/mitsubishiufjesmart_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
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
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
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
