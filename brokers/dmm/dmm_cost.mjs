// What one round trip costs at DMM.com Securities (DMM 株): buy n shares at
// price p, sell them back at once, in dollars. Online cash orders. NISA
// (free), the one-month free trading after registration, つみたてかぶ, margin
// (free in Japan, VIP and member courses) and the 1 % point rebate stay out.
// The cash schedule has no plan.
//
// Read 2026-10-20. kabu.dmm.com answered 403 (Akamai "Access Denied") from
// this machine, the browser and the fetch service alike (all left from
// France), and its Wayback capture of 2026-10-04 is that same 403. The
// figures below are the newest Wayback captures that answered 200; the
// capture date follows each URL.
//
//   Japan, one order, tax included, on that order's notional
//     up to 50 000 ¥            55
//     up to 100 000 ¥           88
//     up to 200 000 ¥          106
//     up to 500 000 ¥          198
//     up to 1 000 000 ¥        374
//     up to 1 500 000 ¥        440
//     up to 3 000 000 ¥        660
//     above                    880
//   Domestic cash trading is not free: only domestic margin is (since
//   2025-04-01).
//
//   United States, one order, tax included
//     0.495 % of the dollar notional
//     0 at a notional of 2.22 USD or below
//     capped at 22 USD (reached at 4 444.45 USD)
//     fractions are cut. The two thresholds printed only hold when the
//     0.45 % before tax is cut to the cent and then the 10 % tax, so the
//     ticket is built that way.
//   DMM's US commission is not 0: the 2019 release that made it 0 no
//   longer holds, the page and the pre-contract document print 0.495 %
//   ("0ドル～" is the free threshold).
//
// Yen settlement (円貨決済) buys at TTS and sells at TTB, each 25 sen per
// dollar from the mid (為替コスト 1ドルあたり25銭, 片道). The account only
// takes yen (../../deposits.mjs), and a dollar balance is itself bought
// at the same 25 sen, so a US round trip pays 0.25 ¥ per dollar twice.
// That is in the total. The buy converts the notional plus the ticket and
// the sale the notional less the ticket, so the conversion is 0.25 ¥ on
// twice the notional.
//
// The pre-contract document names the local agent: "当社での現地委託先会社は
// Interactive Brokers LLC". A listed US book uses that firm's Rule 606 Q.
// The same document says US trades bear local charges and taxes whose
// amount it cannot print ("本書面上その金額等をあらかじめ記載することは
// できません"). No page prints an SEC fee or TAF, so both stay at 0.
//
// Fukuoka and Sapporo publish no bid and offer: the fees are computed and
// the total is N/A. A name listed on several Japanese exchanges is one row,
// on the main market DMM routes to (see dmm_scraping.mjs).
//
//   https://kabu.dmm.com/commission/                       (Wayback 2026-07-19)
//   https://kabu.dmm.com/us/stock/outline/                 (Wayback 2026-04-20)
//   https://kabu.dmm.com/us/settlement/                    (Wayback 2026-06-15)
//   https://kabu.dmm.com/us/exchange_trading/              (Wayback 2026-07-12)
//   https://kabu.dmm.com/_pdf/ls_brokerage_account.pdf     (Wayback 2025-12-19, revised 2025-11-01)
//   https://kyodonewsprwire.jp/release/202504026783        (domestic margin free from 2025-04-01)
//
//   node brokers/dmm/dmm_cost.mjs 7203 Tokyo JPY --shares=100 --price=3011
//   node brokers/dmm/dmm_cost.mjs AAPL XNAS USD --shares=10 --price=343.46
//   node brokers/dmm/dmm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { isListedUsTape, listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("dmm-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://kabu.dmm.com/commission/",
  us: "https://kabu.dmm.com/us/stock/outline/",
  settlement: "https://kabu.dmm.com/us/settlement/",
  fx: "https://kabu.dmm.com/us/exchange_trading/",
  contract: "https://kabu.dmm.com/_pdf/ls_brokerage_account.pdf",
  readOn: "2026-10-20",
  capturedOn: "2026-07-19",
  contractOn: "2025-11-01",
  entity: "DMM.com証券",
  venue: "Interactive Brokers LLC",
};

// Tax-included yen ticket per order, by the order's notional.
const JP_TIERS = [
  [50_000, 55],
  [100_000, 88],
  [200_000, 106],
  [500_000, 198],
  [1_000_000, 374],
  [1_500_000, 440],
  [3_000_000, 660],
  [Infinity, 880],
];
const US_RATE = 0.00495;
const US_NET = 0.0045;
const VAT = 1.1;
const US_FREE = 2.22;
const US_CAP = 22;
// Yen per dollar, each way, between the mid and TTS or TTB.
const FX_YEN = 0.25;
const US_BROKER = "interactivebrokers";
const US_MARKETS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "OTCMARKETS", "OTC"]);
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

function jpLeg(yen) {
  if (!(yen > 0)) return null;
  return JP_TIERS.find(([upTo]) => yen <= upTo)[1];
}

// 0.45 % cut to the cent, then 10 % tax cut to the cent: 2.22 USD gives 0,
// 4 444.45 USD gives 22.
const cents = (x) => Math.floor(x * 100 + 1e-7) / 100;
function usLeg(notional) {
  if (!(notional > 0)) return null;
  if (notional <= US_FREE) return 0;
  return Math.min(cents(cents(notional * US_NET) * VAT), US_CAP);
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the ticket and, on a
 * US line, the yen conversion.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan,
    onlineBuy: true,
    cashCurrency: "JPY",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue DMM n'existe pas encore : lancer `node brokers/dmm/dmm_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue DMM` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez DMM`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "dmm",
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
  const japan = JAPAN.has(market) && listing.currency === "JPY";
  const american = US_MARKETS.has(market) && listing.currency === "USD";
  if (!japan && !american) {
    return { ...answer, listing, why: `${listing.brokerExchange} ${listing.currency} n'a pas de ligne dans le barème DMM` };
  }
  const listedTape = american && isListedUsTape(listing.mic);
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    remark: "",
    url: japan ? SCHEDULE.url : SCHEDULE.us,
    basis: japan
      ? `barème DMM 株 du ${SCHEDULE.capturedOn} (copie Wayback, site refusé hors du Japon le ${SCHEDULE.readOn}) : 55 à 880 ¥ TTC par ordre selon le montant`
      : `barème US DMM 株 du ${SCHEDULE.capturedOn} (copie Wayback, site refusé hors du Japon le ${SCHEDULE.readOn}) : 0,495 % TTC par ordre, 0 jusqu'à 2,22 USD, plafond 22 USD ; règlement en yens à 0,25 ¥ par dollar dans chaque sens ; SEC et TAF non publiées, à 0`,
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
  if (listedTape && perShare == null) {
    const quoted = usBookPerShare({ broker: US_BROKER, ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: listedTape && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;

  let buyUsd;
  let sellUsd;
  let commission;
  if (japan) {
    buyUsd = dollars(jpLeg(notional), "JPY");
    sellUsd = buyUsd;
    commission = { tiers: JP_TIERS.map(([upTo, fee]) => ({ upTo: Number.isFinite(upTo) ? upTo : null, fee })), currency: "JPY", eachWay: true };
  } else {
    buyUsd = usLeg(notional);
    sellUsd = usLeg(notional);
    commission = { rate: US_RATE, cap: US_CAP, freeAt: US_FREE, currency: "USD", eachWay: true };
  }
  const commissionUsd = plus(buyUsd, sellUsd);
  const yenPerDollar = usdPer("JPY");
  const fxUsd = japan ? 0 : yenPerDollar == null ? null : notional * FX_YEN * 2 * yenPerDollar;
  const brokerFees = plus(commissionUsd, fxUsd);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const q = listedTape ? qOf(US_BROKER) : null;
  const confidence = [
    shared.basis,
    japan
      ? "pas de SOR : un titre multi-coté va au marché principal choisi par DMM"
      : `exécution ${SCHEDULE.venue} (document précontractuel révisé le ${SCHEDULE.contractOn})`,
    japan ? "ligne en yens : pas de change" : "change compris : le compte n'accepte que des yens",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? listedTape
          ? q != null
            ? `carnet 605 × Q IBKR, ${marketPerShare} $ la part`
            : `carnet NBBO coté ${marketPerShare} $ la part`
          : `carnet ${marketPerShare} $ la part`
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
    buy: { fee: finite(buyUsd, 6), ...(american ? { fxYen: FX_YEN } : {}) },
    sell: { fee: finite(sellUsd, 6), ...(american ? { fxYen: FX_YEN } : {}) },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
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
          japan: JP_TIERS.map(([upTo, fee]) => `${Number.isFinite(upTo) ? `≤ ${upTo}` : "above"} JPY: ${fee} JPY`),
          us: "0.495 % tax included, 0 at 2.22 USD or below, cap 22 USD; SEC and TAF not published, 0",
          conversion: "in the total: 0.25 JPY per USD each way (yen-only account)",
          rule606: US_BROKER,
          q: qOf(US_BROKER),
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
    console.error("usage : node brokers/dmm/dmm_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    if (parts.change) console.log(`  change         : ${parts.change} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
