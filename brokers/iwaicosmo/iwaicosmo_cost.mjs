// What one round trip costs at IwaiCosmo Securities (岩井コスモ証券), online
// channel コスモ・ネットレ: buy n shares at price p, sell them back at once,
// in dollars. Phone orders, odd lots, margin, NISA (free) and the 18-25
// cashback stay out. China and Vietnam are phone-only and are not in the
// catalogue.
//
// The live site is in maintenance since 2026-10-21: the tariff below is the
// Wayback copy of 2026-10-12 (commission page) and 2026-08-10 (US rule page).
//
// Japan has three fee courses the client picks (`plan`), one row each:
//   active    アクティブコース (1日定額), on the day's total, cash and margin
//             together. The default.
//               up to 100 000 ¥ 88 ¥, then 88 ¥ per further 100 000 ¥ up to
//               1 000 000 ¥ (880 ¥); 1 760 ¥ up to 2 000 000 ¥, then 880 ¥
//               per further 1 000 000 ¥; above 124 000 000 ¥ 110 000 ¥
//             A buy and a sale of the same name on the same day count once:
//             the smaller leg is taken out of the day's total ("デイトレード
//             を行った場合、買いと売りの約定金額のうち、少ないほうを手数料計算
//             の対象から除外"). Each leg here is its own day; the remark gives
//             the same-day saving.
//   standard  スタンダードコース (1約定ごと), cash, one order
//               up to 5 000 000 ¥ 1 100 ¥, up to 10 000 000 ¥ 1 650 ¥, then
//               550 ¥ per further 5 000 000 ¥; above 240 000 000 ¥ 27 500 ¥
//   monthly   マンスリーコース 50回, 11 000 ¥ a month for 50 executed trades
//             (220 ¥ each), then the active course for the rest of the
//             month. The trade itself pays 0; the remark carries the fee.
//             The 100-trade course (22 000 ¥) prices a trade the same and
//             only adds subscription, so it is left out.
//   all fees tax included.
//
// United States, every course, one order: 0.4 % + 10 % tax = 0.44 %,
// minimum 0, capped at 22 USD tax included. Orders go to Interactive
// Brokers LLC's SOR ("注文の取次先であるインタラクティブ・ブローカーズ
// (Interactive Brokers LLC)"), so a US line uses that firm's Rule 606.
// The tariff names no SEC fee.
//
// Conversion: 25 sen per dollar each way (為替手数料, 円貨決済約定時、為替振替
// 時). Cash is yen only (../../deposits.mjs: "米ドルでの入金は承っておりま
// せん"), so a US trip converts both ways inside the number.
//
//   https://web.archive.org/web/20261012030043/https://www.iwaicosmo.net/commission/
//   https://web.archive.org/web/20260810162856/https://www.iwaicosmo.net/commission/attention/index.html
//   https://web.archive.org/web/20260810163607/https://www.iwaicosmo.net/products/foreign/us/rule.html
//
//   node brokers/iwaicosmo/iwaicosmo_cost.mjs 7203 Tokyo JPY --shares=52 --price=2975
//   node brokers/iwaicosmo/iwaicosmo_cost.mjs 7203 Tokyo JPY --shares=52 --price=2975 --plan=standard
//   node brokers/iwaicosmo/iwaicosmo_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/iwaicosmo/iwaicosmo_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("iwaicosmo-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://web.archive.org/web/20261012030043/https://www.iwaicosmo.net/commission/",
  notes: "https://web.archive.org/web/20260810162856/https://www.iwaicosmo.net/commission/attention/index.html",
  us: "https://web.archive.org/web/20260810163607/https://www.iwaicosmo.net/products/foreign/us/rule.html",
  live: "https://www.iwaicosmo.net/commission/",
  archivedOn: "2026-10-12",
  readOn: "2026-10-23",
  entity: "岩井コスモ証券 コスモ・ネットレ",
  venue: "Interactive Brokers LLC",
};

const PLANS = [
  { id: "active", name: "アクティブコース (1日定額)" },
  { id: "standard", name: "スタンダードコース (1約定ごと)" },
  { id: "monthly", name: "マンスリーコース 50回" },
];

const MONTHLY_FEE = 11_000;
const MONTHLY_TRADES = 50;
const US_PRETAX = 0.004;
const US_VAT = 0.1;
const US_CAP = 22;
// Yen per dollar inside the rate, each way.
const FX_YEN = 0.25;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const JAPAN = new Set(["TOKYO", "NAGOYA", "FUKUOKA", "SAPPORO"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// Active course, on the day's total.
function activeYen(dayTotal) {
  if (!(dayTotal > 0)) return 0;
  if (dayTotal > 124_000_000) return 110_000;
  if (dayTotal <= 1_000_000) return Math.ceil(dayTotal / 100_000 - 1e-9) * 88;
  return Math.ceil(dayTotal / 1_000_000 - 1e-9) * 880;
}

// Standard course, one cash order.
function standardYen(notional) {
  if (!(notional > 0)) return null;
  if (notional > 240_000_000) return 27_500;
  if (notional <= 5_000_000) return 1_100;
  return 1_100 + (Math.ceil(notional / 5_000_000 - 1e-9) - 1) * 550;
}

function legYen(notional, plan) {
  if (plan === "standard") return standardYen(notional);
  if (plan === "monthly") return 0;
  return activeYen(notional);
}

// 0.4 % plus 10 % tax, cap 22 USD tax included.
function usLeg(notional) {
  if (!(notional > 0)) return null;
  return Math.min(US_CAP, notional * US_PRETAX * (1 + US_VAT));
}

const pct2 = (x) => Number((x * 100).toFixed(2));

function japanRemark(plan, notional) {
  if (plan === "monthly") return `¥${MONTHLY_FEE.toLocaleString("en-US")} a month for ${MONTHLY_TRADES} trades.`;
  if (plan === "active") {
    const saved = activeYen(notional);
    return saved > 0 ? `Same day sell is ${pct2(saved / notional)}% lower.` : "";
  }
  return "";
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
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
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
  const picked = PLANS.find((p) => p.id === String(plan || PLANS[0].id));
  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (${PLANS.map((p) => p.id).join("|")})` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue IwaiCosmo n'existe pas encore : lancer `node brokers/iwaicosmo/iwaicosmo_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue IwaiCosmo` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez IwaiCosmo`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "iwaicosmo",
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
  const japan = JAPAN.has(loose(listing.brokerExchange)) && listing.currency === "JPY";
  const american = US_MICS.has(code(m.row.mic || listing.mic)) && listing.currency === "USD";
  if (!japan && !american) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
  }
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const archived = `copie Wayback du ${SCHEDULE.archivedOn} (site en maintenance depuis le 2026-10-21), relue le ${SCHEDULE.readOn}`;
  const shared = {
    ...answer,
    listing,
    url: japan ? SCHEDULE.url : SCHEDULE.us,
    basis: japan
      ? picked.id === "active"
        ? `barème コスモ・ネットレ, ${archived} : アクティブコース, 88 ¥ par tranche de 100 000 ¥ du total du jour jusqu'à 1 000 000 ¥, puis 880 ¥ par million, TTC`
        : picked.id === "standard"
          ? `barème コスモ・ネットレ, ${archived} : スタンダードコース, 1 100 ¥ par ordre jusqu'à 5 000 000 ¥, TTC`
          : `barème コスモ・ネットレ, ${archived} : マンスリーコース 50回, 11 000 ¥ par mois pour 50 ordres, 0 ¥ par ordre dans le forfait`
      : `barème US コスモ・ネットレ, ${archived} : 0,44 % TTC par ordre, minimum 0, plafond 22 USD, change 25 sen par dollar`,
    tax,
    ccy: QUOTE,
    plan: picked.id,
    planName: picked.name,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return {
      ...shared,
      remark: japan && picked.id === "monthly" ? japanRemark("monthly", 0) : "",
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs",
    };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
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
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;

  let commissionUsd;
  let commission;
  let fxUsd = 0;
  let remark = "";
  if (japan) {
    const one = legYen(notional, picked.id);
    commissionUsd = one == null ? null : dollars(one * 2, "JPY");
    commission = { perOrder: one, currency: "JPY", eachWay: true, plan: picked.id };
    remark = japanRemark(picked.id, notional);
  } else {
    const one = usLeg(notional);
    commissionUsd = one == null ? null : one * 2;
    commission = { rate: US_PRETAX * (1 + US_VAT), min: 0, cap: US_CAP, currency: "USD", eachWay: true };
    const jpy = usdPer("JPY");
    fxUsd = notionalUsd == null || !(jpy > 0) ? null : notionalUsd * FX_YEN * jpy * 2;
  }
  const brokerFees = commissionUsd;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, fxUsd, taxUsd);
  const confidence = [
    shared.basis,
    japan
      ? picked.id === "active"
        ? "chaque jambe un jour à part ; le même jour la plus petite jambe sort du total (remarque)"
        : picked.id === "monthly"
          ? "forfait mensuel hors de cet aller-retour (remarque)"
          : "ordre au comptant, pas de remise le même jour"
      : `exécution ${SCHEDULE.venue}`,
    japan ? "ligne en yens : pas de change" : "compte en yens seulement : change 25 sen par dollar dans chaque sens, dans le chiffre",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet 605 × Q IBKR, ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    cashCurrency: "JPY",
    remark,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission,
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
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
      ...(american ? { change: finite(fxUsd, 6) } : {}),
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
          plans: PLANS,
          active: "88 JPY per 100k of the day's total up to 1M, then 880 JPY per 1M, 110000 above 124M; same-day round trip counts the larger leg only",
          standard: "1100 JPY per order up to 5M, 1650 up to 10M, +550 per 5M, 27500 above 240M",
          monthly: "11000 JPY a month for 50 trades, 0 per trade inside",
          us: "0.44 % tax included per order, min 0, cap 22 USD, every plan",
          conversion: "in the number: 0.25 JPY per USD each way; cash is JPY only",
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
      "usage : node brokers/iwaicosmo/iwaicosmo_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=active|standard|monthly]"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    plan: flag("plan"),
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
  console.log(`${l.ticker || l.isin} — ${l.name || ""} [${out.planName}]`);
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
