// What one round trip costs at Webull Securities (Japan) (ウィブル証券): buy n
// shares at price p, sell them back at once, in dollars. App and web cash
// orders. Margin, options, the 24-hour session's own rules and odd lots
// stay out.
//
// Read 2026-10-23.
//
//   Tokyo, cash, one order, tax included
//     up to 50 000 ¥            55 ¥
//     up to 100 000 ¥           99 ¥
//     up to 200 000 ¥          115 ¥
//     up to 1 000 000 ¥        275 ¥
//     up to 1 500 000 ¥        535 ¥
//     up to 30 000 000 ¥       640 ¥
//     above                  1 070 ¥
//     Orders go to the TSE itself, no SOR (best-execution policy).
//   United States, one order
//     commission 0 ("委託手数料は無料です")
//     local fees passed on, as the pre-contract document (別紙 手数料一覧,
//     2026-10-19 edition) prints them:
//       SEC   on the sale, 0.0000206 USD per dollar, rounded up to the cent,
//             minimum 0.01 USD
//       FINRA on the sale, 0.000195 USD a share, min 0.01, max 9.79 USD;
//             not charged on fills from 2026-10-01 to 2026-12-31 ("2026年10月
//             1日から2026年12月31日までの間の約定に関して、当該費用が課される
//             ことはありません"), so it is 0 until then and back from 2027
//       CAT   both sides, 0.000003 USD a share, rounded to the cent
//
// Cash: yen and dollars (deposits.mjs), so a US line settles in dollars and
// the conversion is a remark. The FX fee is 15 sen a dollar each way over
// QUICK's rate ("日本円から米ドルに、米ドルから日本円に両替する時の為替手数料
// (スプレッド)は15銭です"). The remark is that 15 sen over the dollar mid.
//
// US orders are passed to Webull Financial LLC ("米国株式につきましては、
// 現地注文委託先であるWebull Financial LLCにお客様の注文をお取次ぎします"),
// which files a Rule 606, so a US line uses that mix (spreads/rule606.mjs
// key "webull"). A Tokyo line uses the TSE book.
//
//   https://www.webull.co.jp/pricing
//   https://www.webull.co.jp/products/us-stocks/service
//   https://www.webull.co.jp/policy?code=IMPORTANT_TRANSACTION_THINGS  (契約締結前交付書面)
//   https://www.webull.co.jp/policy?code=BEST_EXECUTION
//
//   node brokers/webulljp/webulljp_cost.mjs 1306 Tokyo JPY --shares=50 --price=3000
//   node brokers/webulljp/webulljp_cost.mjs AAPL NASDAQ USD --shares=4 --price=250
//   node brokers/webulljp/webulljp_cost.mjs --schedule
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

const CATALOGUE = new URL("webulljp-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.webull.co.jp/pricing",
  us: "https://www.webull.co.jp/products/us-stocks/service",
  contract: "https://www.webull.co.jp/policy?code=IMPORTANT_TRANSACTION_THINGS",
  bestExecution: "https://www.webull.co.jp/policy?code=BEST_EXECUTION",
  readOn: "2026-10-23",
  entity: "ウィブル証券",
  venue: "Webull Financial LLC",
};

// Tokyo, tax included: [upper bound in yen, fee in yen].
const JP_STEPS = [
  [50_000, 55],
  [100_000, 99],
  [200_000, 115],
  [1_000_000, 275],
  [1_500_000, 535],
  [30_000_000, 640],
];
const JP_TOP = 1_070;
const SEC_RATE = 0.0000206;
const SEC_MIN = 0.01;
const TAF_PER_SHARE = 0.000195;
const TAF_MIN = 0.01;
const TAF_CAP = 9.79;
// FINRA fee not charged on fills in this window (pre-contract document).
const TAF_OFF = ["2026-10-01", "2026-12-31"];
const CAT_PER_SHARE = 0.000003;
// Yen per dollar over the reference rate, each way.
const FX_YEN = 0.15;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const cents = (x) => Math.round(x * 100) / 100;

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function tokyoYen(notional) {
  if (!(notional > 0)) return null;
  for (const [upTo, fee] of JP_STEPS) if (notional <= upTo) return fee;
  return JP_TOP;
}

function secUsd(notional) {
  return Math.max(SEC_MIN, Math.ceil(notional * SEC_RATE * 100 - 1e-9) / 100);
}

function tafOn(day) {
  return !(day >= TAF_OFF[0] && day <= TAF_OFF[1]);
}

function tafUsd(n, day) {
  if (!tafOn(day)) return 0;
  return Math.min(TAF_CAP, Math.max(TAF_MIN, cents(n * TAF_PER_SHARE)));
}

function catUsd(n) {
  return cents(n * CAT_PER_SHARE + 1e-12);
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
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Webull Japon n'existe pas encore : lancer `node brokers/webulljp/webulljp_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Webull Japon` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Webull Japon`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "webulljp",
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
  const japan = loose(listing.brokerExchange) === "TOKYO" && listing.currency === "JPY";
  const american = US_MICS.has(listing.mic) && listing.currency === "USD";
  if (!japan && !american) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
  }
  const day = new Date().toISOString().slice(0, 10);
  const taf = american && tafOn(day);
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const remark = american ? fxRemarkUsd() : "";
  const shared = {
    ...answer,
    listing,
    cashCurrency: japan ? "JPY" : "USD",
    remark,
    url: japan ? SCHEDULE.url : SCHEDULE.contract,
    basis: japan
      ? `barème Webull Japon, lu le ${SCHEDULE.readOn} : 55 ¥ à 640 ¥ par ordre jusqu'à 30 000 000 ¥, 1 070 ¥ au-delà, TTC`
      : `barème Webull Japon, lu le ${SCHEDULE.readOn} : commission 0 ; SEC ${SEC_RATE} du montant à la vente (arrondi au cent supérieur, minimum ${SEC_MIN} $), CAT ${CAT_PER_SHARE} $ la part à l'achat et à la vente, ` +
        (taf
          ? `FINRA ${TAF_PER_SHARE} $ la part à la vente (minimum ${TAF_MIN} $, plafond ${TAF_CAP} $)`
          : `FINRA non perçu sur les exécutions du ${TAF_OFF[0]} au ${TAF_OFF[1]}`),
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
    const quoted = usBookPerShare({ broker: "webull", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;

  let commissionUsd;
  let regulatoryUsd = 0;
  let commission;
  let regulatory = null;
  if (japan) {
    const one = tokyoYen(notional);
    commissionUsd = one == null ? null : dollars(one * 2, "JPY");
    commission = { perOrder: one, currency: "JPY", eachWay: true };
  } else {
    commissionUsd = 0;
    const sec = secUsd(notional);
    const finra = tafUsd(n, day);
    const cat = catUsd(n) * 2;
    regulatoryUsd = Number((sec + finra + cat).toFixed(2));
    commission = { rate: 0, currency: "USD", eachWay: true };
    regulatory = { sec, taf: finra, cat, tafWaived: !taf };
  }
  const brokerFees = plus(commissionUsd, regulatoryUsd);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    japan ? "ordre transmis au TSE, sans SOR" : `exécution ${SCHEDULE.venue}`,
    remark ? "change hors du chiffre : compte en dollars" : "ligne en yens : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet 605 × Q Webull Financial, ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission,
    ...(regulatory ? { regulatory } : {}),
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      réglementaire: finite(regulatoryUsd, 6),
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
          japan: "55 / 99 / 115 / 275 / 535 / 640 JPY up to 50k / 100k / 200k / 1M / 1.5M / 30M, 1070 above, tax included, per order",
          usFee: "0 commission; SEC 0.0000206 of the sale, rounded up to the cent, min 0.01; FINRA 0.000195 a share on the sale, min 0.01, max 9.79, not charged 2026-10-01..2026-12-31; CAT 0.000003 a share each side, rounded to the cent",
          conversion: "remark only: 0.15 JPY per USD each way; the account holds USD",
          rule606: "webull",
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
    console.error("usage : node brokers/webulljp/webulljp_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]");
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
    if (parts.réglementaire) console.log(`  réglementaire  : ${parts.réglementaire} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
