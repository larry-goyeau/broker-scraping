// What one round trip costs at SBI Securities: buy n shares at price p,
// sell them back at once, in dollars. Internet course, not plan C. The
// phone line, the IFA course and the face-to-face course stay out. NISA,
// the two-month debut waiver and the selected-ETF buy waiver stay out.
//
// Re-read 2026-09-27.
//
//   Japan, internet, electronic delivery switched on (zero revolution)
//     listed shares, ETF, ETN     0
//   United States, one order, tax included
//     0.495 %
//     0 at a notional of 2.02 USD or below
//     capped at 22 USD
//   Hong Kong       0.286 %   min 51.7 HKD    cap 517 HKD
//   Korea           0.99 %    min 9 900 KRW
//   Singapore       1.1 %     min 30.8 SGD
//   Thailand        1.1 %     min 837.1 THB
//   Malaysia        1.1 %     min 83.6 MYR
//   Indonesia       1.1 %     min 261 800 IDR
//   Vietnam         2.2 %     min 1 320 000 VND
//   Russia          1.32 %    min 550 RUB
//   On a sale in Singapore, Thailand, Malaysia, Indonesia or Vietnam,
//   when the proceeds are under the minimum, the fee is 55 % of the
//   notional. Indonesia and Vietnam also take 0.1 % of the sale.
//
// The internet course converts yen to dollars at a 0 yen spread plus a
// 0.02 % markup, each way. Other currencies use the published spread and
// markup. That charge is the remark, not this ticket. Yen settlement is
// the scheduled rate and stays out. The interbank bid-ask is not a
// published number.
//
// US orders go to Interactive Brokers LLC or Alpaca Securities LLC. SBI
// chooses per name. The public list does not say which, so the book uses
// the higher of the two Q factors.
//
//   https://www.sbisec.co.jp/ETGate/WPLETmgR001Control?OutSide=on&getFlg=on&burl=search_home&cat1=home&cat2=none&dir=info&file=home_info_zerocom.html
//   https://www.sbisec.co.jp/ETGate/WPLETmgR001Control?OutSide=on&getFlg=on&burl=search_home&cat1=home&cat2=price&dir=price&file=home_price.html
//   https://www.sbisec.co.jp/ETGate/WPLETmgR001Control?OutSide=on&getFlg=on&burl=search_home&cat1=home&cat2=service&dir=service&file=home_kawase.html
//   https://www.sbisec.co.jp/ETGate/WPLETmgR001Control?OutSide=on&getFlg=on&burl=search_home&cat1=home&cat2=info&dir=info&file=home_info250212_yakkan.html
//
//   node brokers/sbi/sbi_cost.mjs 1301 Tokyo JPY --shares=10 --price=3000
//   node brokers/sbi/sbi_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/sbi/sbi_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("sbi-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.sbisec.co.jp/ETGate/WPLETmgR001Control?OutSide=on&getFlg=on&burl=search_home&cat1=home&cat2=none&dir=info&file=home_info_zerocom.html",
  foreign: "https://www.sbisec.co.jp/ETGate/WPLETmgR001Control?OutSide=on&getFlg=on&burl=search_home&cat1=home&cat2=price&dir=price&file=home_price.html",
  fx: "https://www.sbisec.co.jp/ETGate/WPLETmgR001Control?OutSide=on&getFlg=on&burl=search_home&cat1=home&cat2=service&dir=service&file=home_kawase.html",
  brokers: "https://www.sbisec.co.jp/ETGate/WPLETmgR001Control?OutSide=on&getFlg=on&burl=search_home&cat1=home&cat2=info&dir=info&file=home_info250212_yakkan.html",
  readOn: "2026-09-27",
  foreignOn: "2025-03-01",
  entity: "SBI証券",
  venue: "Interactive Brokers LLC or Alpaca Securities LLC",
};

const US_RATE = 0.00495;
const US_FREE = 2.02;
const US_CAP = 22;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "OTC"]);
const JAPAN = new Set(["TOKYO", "NAGOYA", "FUKUOKA", "SAPPORO"]);

// Tax-included commission, one order. `half` replaces the minimum on a small sale.
// `levy` is a fraction of the sale the broker collects on top.
const FEE = {
  USD: { rate: US_RATE, min: 0, cap: US_CAP, freeAt: US_FREE, label: "0,495 % TTC, plafond 22 USD" },
  HKD: { rate: 0.00286, min: 51.7, cap: 517, label: "0,286 % TTC, min 51,7 HKD, plafond 517 HKD" },
  KRW: { rate: 0.0099, min: 9900, label: "0,99 % TTC, min 9 900 KRW" },
  SGD: { rate: 0.011, min: 30.8, half: 0.55, label: "1,1 % TTC, min 30,8 SGD" },
  THB: { rate: 0.011, min: 837.1, half: 0.55, label: "1,1 % TTC, min 837,1 THB" },
  MYR: { rate: 0.011, min: 83.6, half: 0.55, label: "1,1 % TTC, min 83,6 MYR" },
  IDR: { rate: 0.011, min: 261800, half: 0.55, levy: 0.001, label: "1,1 % TTC, min 261 800 IDR, 0,1 % à la vente" },
  VND: { rate: 0.022, min: 1320000, half: 0.55, levy: 0.001, label: "2,2 % TTC, min 1 320 000 VND, 0,1 % à la vente" },
  RUB: { rate: 0.0132, min: 550, label: "1,32 % TTC, min 550 RUB" },
};

// Yen per `per` units of foreign currency, each conversion, plus a fraction.
// Internet course, realtime where it exists. USD spread is 0 yen there; the
// 0.02 % markup stays. Yen settlement is the other column.
const FX = {
  USD: { yen: 0, per: 1, pct: 0.0002 },
  HKD: { yen: 0.15, per: 1, pct: 0 },
  SGD: { yen: 0.83, per: 1, pct: 0 },
  KRW: { yen: 1, per: 100, pct: 0 },
  VND: { yen: 6, per: 10000, pct: 0 },
  IDR: { yen: 0.05, per: 100, pct: 0 },
  THB: { yen: 0.16, per: 1, pct: 0 },
  MYR: { yen: 1.33, per: 1, pct: 0 },
  RUB: { yen: 0.17, per: 1, pct: 0 },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

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

function orderFee(notional, rule, side) {
  if (!(notional > 0) || !rule) return null;
  if (rule.freeAt != null && notional <= rule.freeAt) return 0;
  if (side === "sell" && rule.half != null && rule.min != null && notional < rule.min) return notional * rule.half;
  let fee = notional * rule.rate;
  if (rule.min != null) fee = Math.max(fee, rule.min);
  if (rule.cap != null) fee = Math.min(fee, rule.cap);
  return fee;
}

const US_BROKER = ["interactivebrokers", "alpaca"];

function widerUsBroker() {
  let best = null;
  let bestQ = -Infinity;
  for (const broker of US_BROKER) {
    const q = qOf(broker);
    if (q != null && q > bestQ) {
      best = broker;
      bestQ = q;
    }
  }
  return best;
}

function fxRemarkOf(currency) {
  const spec = FX[currency];
  if (!spec) return "";
  if (spec.pct && !spec.yen) {
    const pct = String(spec.pct * 100);
    return `FX ${pct}% when cash ≠ ${currency}.`;
  }
  const per = spec.per === 1 ? currency : `${spec.per} ${currency}`;
  return `FX ${spec.yen} JPY per ${per} each way when cash ≠ ${currency}.`;
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
    cashCurrency: "JPY",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue SBI n'existe pas encore : lancer `node brokers/sbi/sbi_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue SBI` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez SBI`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "sbi",
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
  const japan = JAPAN.has(market);
  const rule = japan ? null : FEE[listing.currency];
  if (!japan && !rule) {
    return { ...answer, listing, why: `${listing.currency} n'a pas de ligne dans le barème` };
  }
  const american = US_MICS.has(market) && listing.currency === "USD";
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    remark: japan ? "" : fxRemarkOf(listing.currency),
    url: japan ? SCHEDULE.url : SCHEDULE.foreign,
    basis: japan
      ? `zéro révolution SBI, relue le ${SCHEDULE.readOn} : 0 ¥ par ordre, cours internet, livraison électronique`
      : `barème étranger SBI du ${SCHEDULE.foreignOn}, relu le ${SCHEDULE.readOn} : ${rule.label} par ordre`,
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
  const usBroker = american ? widerUsBroker() : null;
  if (american) {
    const quoted = usBookPerShare({
      broker: usBroker || "sbi",
      ticker: listing.ticker,
      fallback: marketPerShare,
    });
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
  const buyLocal = japan ? 0 : orderFee(notional, rule, "buy");
  const sellLocal = japan ? 0 : orderFee(notional, rule, "sell");
  const levyLocal = japan || !rule?.levy ? 0 : notional * rule.levy;
  const commissionUsd = plus(dollars(buyLocal, listing.currency), dollars(sellLocal, listing.currency));
  const brokerFees = commissionUsd;
  const levyUsd = dollars(levyLocal, listing.currency);
  const taxUsd = notionalUsd == null ? null : plus(notionalUsd * taxTotal, levyUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    japan ? "cours internet, livraison électronique" : `exécution ${SCHEDULE.venue}`,
    shared.remark ? "change hors du chiffre" : "ligne en yens : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? usBroker
          ? `carnet 605 × Q ${usBroker === "alpaca" ? "Alpaca" : "IBKR"}, ${marketPerShare} $ la part`
          : `carnet NBBO coté ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: japan
      ? { rate: 0, currency: "JPY", eachWay: true }
      : { rate: rule.rate, min: rule.min ?? null, cap: rule.cap ?? null, currency: listing.currency, eachWay: true },
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
          japan: "0, internet course, electronic delivery",
          us: "0.495 % tax included, 0 at 2.02 USD or below, cap 22 USD",
          conversion: "remark only: USD 0.02% each way; other currencies the published yen spread",
          rule606: "max Q of interactivebrokers and alpaca",
          venue: SCHEDULE.venue,
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
    console.error("usage : node brokers/sbi/sbi_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    if (parts.change != null) console.log(`  change         : ${parts.change} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
