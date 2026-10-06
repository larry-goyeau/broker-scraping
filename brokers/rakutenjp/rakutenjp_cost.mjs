// What one round trip costs at Rakuten Securities: buy n shares at price p,
// sell them back at once, in dollars. Internet orders on the zero course.
// The phone line, the IFA schedule, the super-discount course, the daily
// box and NISA stay out. The named-US-ETF buy waiver is a subset and stays
// out. Odd-lot spreads stay out. Point rebates stay out.
//
// Re-read 2026-09-28.
//
//   Japan, zero course (SOR consent required)
//     listed shares, ETF, ETN     0
//   United States, one order, tax included
//     0.495 %
//     0 at a notional of 2.22 USD or below
//     capped at 22 USD
//     a sale also pays the SEC fee, 0.0000206 of the dollar notional
//     (the figure published as of 2026-04-02)
//   Hong Kong and Shanghai A, one order, tax included, on the yen value
//     0.275 %
//     minimum 550 ¥
//     capped at 5 500 ¥
//     Hong Kong ETFs use the same line
//     local stamp and exchange fees are borne by Rakuten
//   ASEAN, one order, tax included, on the yen value, Singapore ETFs included
//     1.1 %
//     minimum 550 ¥
//     no cap
//     local exchange fees are borne by Rakuten
//
// The yen value of a China or ASEAN order is their own morning rate. This
// file uses the shared rate. Yen settlement of a US order is 0.25 ¥ per
// dollar inside the fill. China is 0.15 ¥ per Hong Kong dollar and 0.20 ¥
// per yuan. Singapore stocks are 0.83 ¥ per dollar, Singapore ETFs 0.25 ¥.
// Thailand is 0.08 ¥ per baht, Malaysia 0.43 ¥ per ringgit, Indonesia
// 0.0003 ¥ per rupiah (the page writes 0.03 sen, in the same sentence as
// the other currencies). That charge is the remark, not this ticket.
//
// The cash-rule page sends the US order to a local correspondent and does
// not name the firm. A 9 December 2020 report of an outage said that
// correspondent was Interactive Brokers, the same pipe as SBI and DMM.
// The current page still does not name it, so this file does not apply
// that firm's Rule 606. A US line uses the quoted NBBO.
//
//   https://www.rakuten-sec.co.jp/web/domestic/stock/commission.html
//   https://www.rakuten-sec.co.jp/web/us/stock/commission.html
//   https://www.rakuten-sec.co.jp/web/foreign/china/commission.html
//   https://www.rakuten-sec.co.jp/web/foreign/asean/commission.html
//   https://www.rakuten-sec.co.jp/web/foreign/asean/rule/ground_rules.html
//   https://www.rakuten-sec.co.jp/web/us/stock/rule/ground_rules.html
//
//   node brokers/rakutenjp/rakutenjp_cost.mjs 1305 Tokyo JPY --shares=10 --price=400
//   node brokers/rakutenjp/rakutenjp_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/rakutenjp/rakutenjp_cost.mjs --schedule
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

const CATALOGUE = new URL("rakutenjp-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.rakuten-sec.co.jp/web/domestic/stock/commission.html",
  us: "https://www.rakuten-sec.co.jp/web/us/stock/commission.html",
  china: "https://www.rakuten-sec.co.jp/web/foreign/china/commission.html",
  asean: "https://www.rakuten-sec.co.jp/web/foreign/asean/commission.html",
  fx: "https://www.rakuten-sec.co.jp/web/foreign/asean/rule/ground_rules.html",
  rules: "https://www.rakuten-sec.co.jp/web/us/stock/rule/ground_rules.html",
  readOn: "2026-09-28",
  secOn: "2026-04-02",
  entity: "楽天証券",
  venue: "local correspondent, unnamed on the cash-rule page",
};

const US_RATE = 0.00495;
const US_FREE = 2.22;
const US_CAP = 22;
const SEC_RATE = 0.0000206;
const CN_RATE = 0.00275;
const CN_MIN = 550;
const CN_CAP = 5500;
const ASEAN_RATE = 0.011;
const ASEAN_MIN = 550;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const JAPAN = new Set(["TOKYO", "NAGOYA", "FUKUOKA", "SAPPORO"]);

// Yen per one unit of the listing currency, each way, inside the settlement rate.
const FX_YEN = {
  USD: 0.25,
  HKD: 0.15,
  CNY: 0.2,
  SGD: 0.83,
  SGD_ETF: 0.25,
  THB: 0.08,
  MYR: 0.43,
  IDR: 0.0003,
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

function yenOf(amount, currency) {
  if (code(currency) === "JPY") return Number(amount);
  const usd = toUsd(amount, currency);
  const per = usdPer("JPY");
  if (usd == null || per == null) return null;
  return usd / per;
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

function usLeg(notional) {
  if (!(notional > 0)) return null;
  if (notional <= US_FREE) return 0;
  return Math.min(notional * US_RATE, US_CAP);
}

function yenLeg(yen, rate, min, cap) {
  if (!(yen > 0)) return null;
  let fee = Math.max(yen * rate, min);
  if (cap != null) fee = Math.min(fee, cap);
  return fee;
}

function fxRemarkOf(market, type) {
  let yen = null;
  let currency = "";
  if (US_MICS.has(market)) {
    yen = FX_YEN.USD;
    currency = "USD";
  } else if (market === "HONGKONG") {
    yen = FX_YEN.HKD;
    currency = "HKD";
  } else if (market === "SSE") {
    yen = FX_YEN.CNY;
    currency = "CNY";
  } else if (market === "SINGAPORE") {
    yen = type === "ETF" || type === "ETN" ? FX_YEN.SGD_ETF : FX_YEN.SGD;
    currency = "SGD";
  } else if (market === "SET") {
    yen = FX_YEN.THB;
    currency = "THB";
  } else if (market === "MALAYSIA") {
    yen = FX_YEN.MYR;
    currency = "MYR";
  } else if (market === "IDX") {
    yen = FX_YEN.IDR;
    currency = "IDR";
  }
  if (yen == null) return "";
  return `FX ${yen} JPY per ${currency} each way when cash ≠ ${currency}.`;
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
    return { ...answer, why: "le catalogue Rakuten n'existe pas encore : lancer `node brokers/rakutenjp/rakutenjp_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Rakuten` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Rakuten`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "rakutenjp",
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
  const american = US_MICS.has(market) && listing.currency === "USD";
  const china = market === "HONGKONG" || market === "SSE";
  const asean = market === "SINGAPORE" || market === "SET" || market === "MALAYSIA" || market === "IDX";
  if (!japan && !american && !china && !asean) {
    return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
  }
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const remark = japan ? "" : fxRemarkOf(market, listing.type);
  const shared = {
    ...answer,
    listing,
    cashCurrency: american ? "USD" : "JPY",
    remark,
    url: japan ? SCHEDULE.url : american ? SCHEDULE.us : china ? SCHEDULE.china : SCHEDULE.asean,
    basis: japan
      ? `cours zéro Rakuten, relu le ${SCHEDULE.readOn} : 0 ¥ par ordre`
      : american
        ? `barème US Rakuten, relu le ${SCHEDULE.readOn} : 0,495 % TTC par ordre, 0 jusqu'à 2,22 USD, plafond 22 USD ; SEC ${SEC_RATE} à la vente (${SCHEDULE.secOn})`
        : china
          ? `barème Chine Rakuten, relu le ${SCHEDULE.readOn} : 0,275 % TTC par ordre, min 550 ¥, plafond 5 500 ¥`
          : `barème ASEAN Rakuten, relu le ${SCHEDULE.readOn} : 1,1 % TTC par ordre, min 550 ¥`,
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
  if (american) {
    const quoted = usBookPerShare({
      broker: "rakutenjp",
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

  let buyUsd = 0;
  let sellUsd = 0;
  let commission = { rate: 0, currency: "JPY", eachWay: true };
  if (american) {
    buyUsd = usLeg(notional);
    sellUsd = usLeg(notional);
    commission = { rate: US_RATE, cap: US_CAP, freeAt: US_FREE, currency: "USD", eachWay: true };
  } else if (china || asean) {
    const yen = yenOf(notional, listing.currency);
    const buyYen = china ? yenLeg(yen, CN_RATE, CN_MIN, CN_CAP) : yenLeg(yen, ASEAN_RATE, ASEAN_MIN, null);
    const sellYen = buyYen;
    buyUsd = dollars(buyYen, "JPY");
    sellUsd = dollars(sellYen, "JPY");
    commission = china
      ? { rate: CN_RATE, min: CN_MIN, cap: CN_CAP, currency: "JPY", eachWay: true }
      : { rate: ASEAN_RATE, min: ASEAN_MIN, currency: "JPY", eachWay: true };
  }
  const commissionUsd = japan ? 0 : plus(buyUsd, sellUsd);
  const brokerFees = commissionUsd;
  const secUsd = american ? notional * SEC_RATE : 0;
  const taxUsd = notionalUsd == null ? null : plus(notionalUsd * taxTotal, secUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    japan ? "cours zéro, accord SOR" : american ? "NBBO coté : la page ne nomme pas le courtier américain" : "frais locaux pris en charge par Rakuten",
    remark ? "change hors du chiffre" : "ligne en yens : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet NBBO coté ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: japan ? { rate: 0, currency: "JPY", eachWay: true } : commission,
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
          japan: "0, zero course",
          us: "0.495 % tax included, 0 at 2.22 USD or below, cap 22 USD, SEC 0.0000206 on the sale",
          china: "0.275 % tax included on the yen value, min 550 JPY, cap 5500 JPY",
          asean: "1.1 % tax included on the yen value, min 550 JPY, Singapore ETFs included",
          conversion: "remark only",
          rule606: null,
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
    console.error("usage : node brokers/rakutenjp/rakutenjp_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
