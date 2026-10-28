// What one round trip costs at OKB Securities (OKB証券, Ogaki Kyoritsu Bank
// group): buy n shares at price p, sell them back at once, in dollars.
// Shares are traded online only ("株式の取引は、国内・海外ともにオンライン
// トレードのみ"), so the one schedule is the online one. Odd lots (単元未満株,
// by phone) stay out.
//
// Fee page read 2026-10-26 (各種手数料):
//   Tokyo, one order    "手数料(税込) ＝ 約定代金 × 0.33％", minimum 330 ¥,
//                       maximum 141 900 ¥, tax included
//   United States       "手数料(税込) ＝ 約定代金 × 1.32％", minimum 11 USD,
//                       no maximum. Agency orders on the US market, limit
//                       only. No US charge (SEC fee) is printed on the fee
//                       page, the stock page or the fees-and-risks sheet:
//                       none is added.
//   No rounding is printed: none is applied.
//   "当社は、有価証券のお預けにかかる口座管理料はいただきません."
//
// Cash: yen and US dollars (deposits.mjs), so a US line has no conversion
// in the number. The remark is the published 為替スプレッド for the dollar,
// 40 sen each way, over the mid.
//
// US orders: OKB names no US broker-dealer, so the book is the quoted NBBO
// of the ticker (no Rule 606 mix).
//
//   https://www.okb-sec.co.jp/service/fee/
//   https://www.okb-sec.co.jp/service/products/stock/
//   https://www.okb-sec.co.jp/common/images/pdf/investment_fees_and_risks.pdf
//
//   node brokers/okb/okb_cost.mjs 7203 Tokyo JPY --shares=100 --price=3000
//   node brokers/okb/okb_cost.mjs 1306 Tokyo JPY --shares=10 --price=3000
//   node brokers/okb/okb_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/okb/okb_cost.mjs --schedule
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

const CATALOGUE = new URL("okb-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.okb-sec.co.jp/service/fee/",
  stock: "https://www.okb-sec.co.jp/service/products/stock/",
  readOn: "2026-10-26",
  entity: "OKB証券",
};

const JP = { rate: 0.0033, min: 330, cap: 141900 };
const US = { rate: 0.0132, min: 11 };
// Yen per dollar, each conversion.
const FX_SEN_USD = 0.4;

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "TXSE", "IEXG"]);

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
      if (loose(m.row.exchange) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function leg(notional, rule) {
  if (!(notional > 0)) return null;
  let fee = Math.max(notional * rule.rate, rule.min);
  if (rule.cap != null) fee = Math.min(fee, rule.cap);
  return fee;
}

function fxRemarkUsd() {
  const yen = usdPer("JPY");
  if (!(yen > 0)) return fxRemark("", "USD");
  return fxRemark(((FX_SEN_USD * yen) * 100).toFixed(3), "USD");
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
    remark: "",
    url: SCHEDULE.url,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue OKB n'existe pas encore : lancer `node brokers/okb/okb_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue OKB` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez OKB`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "okb",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? (m.row.mic || null),
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const mic = code(m.row.mic || listing.mic);
  const japan = mic === "XTKS" && listing.currency === "JPY";
  const american = US_MICS.has(mic) && listing.currency === "USD";
  if (!japan && !american) {
    return { ...answer, listing, why: `${listing.brokerExchange} ${listing.currency} n'a pas de ligne dans le barème OKB` };
  }

  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const remark = japan ? "" : fxRemarkUsd();
  const basis = japan
    ? `barème OKB, relu le ${SCHEDULE.readOn} : 0,33 % TTC par ordre, min 330 ¥, plafond 141 900 ¥`
    : `barème US OKB, relu le ${SCHEDULE.readOn} : 1,32 % TTC par ordre, min 11 USD ; aucun frais US imprimé`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    remark,
    url: SCHEDULE.url,
    basis,
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
  const marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american) {
    const quoted = usBookPerShare({ broker: "okb", ticker: listing.ticker, fallback: marketPerShare });
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

  const rule = japan ? JP : US;
  const one = leg(notional, rule);
  const commissionUsd = one == null ? null : dollars(one * 2, listing.currency);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    basis,
    japan ? "ligne en yens : pas de change" : "change hors du chiffre (dollar en dépôt)",
    american ? "aucun courtier US nommé : NBBO coté" : "",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet NBBO coté ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: { rate: rule.rate, min: rule.min, cap: rule.cap ?? null, perOrder: one, currency: listing.currency, eachWay: true },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
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
    console.log(JSON.stringify({ ...SCHEDULE, japan: JP, us: US, fxSenUsd: FX_SEN_USD, cash: ["JPY", "USD"] }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/okb/okb_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]");
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
