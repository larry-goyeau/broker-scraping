// What one round trip costs at NCB Capital Markets: buy n shares on the
// Jamaica Stock Exchange through NCB Capital Markets Online (Equity Online)
// and sell them straight back, in dollars. Main Market and Junior Market
// lines in JMD, USD Market lines in USD.
//
// NCB pages, read on 2026-10-21:
//   https://www.ncbcapitalmarkets.com/wealthmanagement/products/buysellstocks
//     Equity Online: trade on the Jamaica Stock Exchange "while enjoying a
//     special introductory fee of 0.5%".
//   https://www.ncbcapitalmarkets.com/wealthmanagement/products/stocks
//     A JSE purchase incurs a stock exchange fee, a trade fee and a broker
//     fee "which is a % of the amount of stocks purchased". "All stated fees
//     attract GCT charges". "You will need at least J$25,000 to purchase
//     stocks through NCB Capital Markets."
//   Broker fee        0.5 % + GCT of the value traded, each side (the page
//                     prints a percentage of the trade, no minimum).
//   Stock exchange    JSE cess, 0.32 % + GCT of the value traded, each side.
//   fee               The JSE prints "Regular Trading Transaction & Block
//                     Transaction Fees are 0.32%, that is $3.20 per $1,000
//                     of the value of the securities traded. (On each side
//                     of the transaction)" on its Junior Market page (2026
//                     schedule); the Main Market page still carries the 2015
//                     wording "0.3 of 1%". The JSE advisory of 27 Mar 2015
//                     puts the cess on all trades enacted on the JSE, USD
//                     Market included.
//   Trade fee         JCSD settlement, 4 bp + GCT of the value of the trade,
//                     each side (JMD and USD schedules effective
//                     1 January 2025). NCB says every stated fee attracts
//                     GCT, so GCT is added as NCB states it.
//   Minimum           J$25,000 to buy. A JMD order below it is not priced.
//   No custody fee, no FX rate and no intraday rate are printed.
//   https://www.jamstockex.com/investors/fee-schedule/jse-junior-market-fees/
//   https://www.jamstockex.com/investors/fee-schedule/jse-main-market-fees/
//   https://www.jamstockex.com/investors/fee-schedule/jcsd-broker-fees/
//   https://jamstockex.s3.amazonaws.com/wp-content/uploads/2024/12/JCSD-USD-Fees-2025.pdf
//   https://www.jamstockex.com/?p=22325
// GCT: standard rate 15.0 % since April 2020, Tax Administration Jamaica,
//   https://www.jamaicatax.gov.jm/general-consumption-tax1/#history_of_the_standard_rate
// Jamaica levies no stamp duty or transaction tax on a JSE trade
// (taxMap.mjs has no line for these ISINs); none is added.
//
// Each side: 0.575 % broker fee, 0.368 % cess and 0.046 % trade fee, GCT
// included: 0.989 %, 1.978 % for the round trip.
//
// In the total: the book, the broker fee both ways (brokerFees) and the
// cess plus trade fee both ways. Remark: none.
//
// The book: venues.mjs has no Jamaica Stock Exchange yet, so an NCB line
// does not resolve to a venue and there is no bid and ask to read. `usd` is
// then N/A and `why` says the JSE book is missing; `brokerFees` is still the
// broker fee.
//
// The account holds JMD and USD (deposits.mjs): each line settles in its own
// currency, no conversion. fx.mjs has no JMD rate yet, so a JMD line's fees
// stay in JMD (`commission`, `market`) and `brokerFees` is N/A until it does;
// a USD line cannot be checked against the J$25,000 minimum until then.
//
//   node brokers/ncbcm/ncbcm_cost.mjs NCBFG XJAM JMD --shares=1000 --price=70
//   node brokers/ncbcm/ncbcm_cost.mjs AMG XJAM JMD --shares=100 --price=1.71
//   node brokers/ncbcm/ncbcm_cost.mjs PROVEN XJAM USD --shares=50000 --price=0.059
//   node brokers/ncbcm/ncbcm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const FOLDER = "ncbcm";
const BROKER = "NCB Capital";
const CATALOGUE = new URL("ncbcm-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.ncbcapitalmarkets.com/wealthmanagement/products/buysellstocks",
  fees: "https://www.ncbcapitalmarkets.com/wealthmanagement/products/stocks",
  readOn: "2026-10-21",
  entity: "NCB Capital Markets Limited",
  cess: "https://www.jamstockex.com/investors/fee-schedule/jse-junior-market-fees/",
  settlement: "https://www.jamstockex.com/investors/fee-schedule/jcsd-broker-fees/",
  settlementUsd: "https://jamstockex.s3.amazonaws.com/wp-content/uploads/2024/12/JCSD-USD-Fees-2025.pdf",
  gct: "https://www.jamaicatax.gov.jm/general-consumption-tax1/#history_of_the_standard_rate",
};

const GCT = 0.15; // Jamaica standard GCT rate since April 2020
const RATE = 0.005 * (1 + GCT); // Equity Online broker fee + GCT, each side
const CESS = 0.0032 * (1 + GCT); // stock exchange fee (JSE cess) + GCT, each side
const SETTLEMENT = 0.0004 * (1 + GCT); // trade fee (JCSD settlement) + GCT, each side
const MARKET = CESS + SETTLEMENT;
const MIN_ORDER = { amount: 25000, ccy: "JMD" }; // "at least J$25,000 to purchase stocks"
const REMARK = "";
const JSE = "Jamaica Stock Exchange";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const pct = (x) => `${(x * 100).toFixed(3).replace(/\.?0+$/, "").replace(".", ",")} %`;

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// Order value in JMD, or null when fx.mjs cannot bring it there.
const inJmd = (amount, currency) => {
  if (currency === "JMD") return amount;
  const usd = toUsd(amount, currency);
  const perJmd = usdPer("JMD");
  return usd == null || !(perJmd > 0) ? null : usd / perJmd;
};

const segment = (row) => String(row.raw || "").match(/\b(Main|Junior|USD) Market\b/)?.[0] || null;

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter(
      (m) =>
        !wantPlace ||
        loose(m.row.exchange) === wantPlace ||
        loose(m.row.mic) === wantPlace ||
        ["JSE", "JAMAICA", "XJAM", "JAMSTOCKEX"].includes(wantPlace)
    )
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

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
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/ncbcm/ncbcm_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${BROKER}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${BROKER}`,
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
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? JSE,
    currency: code(m.row.currency) || "JMD",
    brokerExchange: m.row.exchange || null,
    market: segment(m.row),
  };
  const cashCcy = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, cashCcy);
  const leaf = book.leaf;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cashCcy : "",
    venueAuthoritative: false,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `pages NCB Capital relues le ${SCHEDULE.readOn} : frais Equity Online 0,5 % (tarif d'introduction) chaque sens, ` +
      `sans minimum imprimé ; frais de bourse et frais de transaction ; « All stated fees attract GCT charges ». ` +
      `Cess JSE 0,32 % et règlement JCSD 0,04 % chaque sens, GCT 15 % (Tax Administration Jamaica) sur chacun. ` +
      `Achat d'au moins 25 000 JMD. Compte en JMD et USD : pas de change.`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: held ? 0 : null,
    sources: SCHEDULE,
  };
  if (!held) {
    return { ...shared, why: `change forcé vers ${cashCcy} : ${BROKER} ne tient que JMD et USD et ne publie aucun taux de change` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalJmd = inJmd(notional, listing.currency);
  const belowMinOrder = notionalJmd == null ? null : notionalJmd < MIN_ORDER.amount;
  const minOrder = { ...MIN_ORDER, below: belowMinOrder };
  const trade = { shares: n, price: p, notional, notionalUsd: finite(dollars(notional, listing.currency), 6), currency: listing.currency };
  if (belowMinOrder) {
    return {
      ...shared,
      trade,
      minOrder,
      why: `ordre de ${notional.toFixed(2)} ${listing.currency} sous le minimum d'achat de 25 000 JMD imprimé par ${BROKER} : pas d'ordre à passer`,
    };
  }

  const notionalUsd = dollars(notional, listing.currency);
  const each = notional * RATE;
  const marketEach = notional * MARKET;
  const brokerFees = dollars(each * 2, listing.currency);
  const marketUsd = dollars(marketEach * 2, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, marketUsd, taxUsd);
  const bookWhy = m.venue
    ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
    : `aucun carnet pour ${JSE} : la Jamaïque n'est pas dans spreads/venues.mjs, la ligne ne se rattache à aucune place`;
  const why = [
    notionalUsd == null ? `aucun cours ${listing.currency}→USD dans fx.mjs : les frais ne passent pas en dollars` : null,
    bookUsd == null ? bookWhy : null,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade,
    minOrder,
    commission: { rate: RATE, min: 0, buy: each, sell: each, currency: listing.currency, eachWay: true },
    market: { cess: CESS, settlement: SETTLEMENT, each: marketEach, currency: listing.currency, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(marketUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      `${pct(RATE)} de ${notional.toFixed(2)} ${listing.currency} = ${each.toFixed(4)} ${listing.currency} par sens`,
      `${pct(MARKET)} de ${notional.toFixed(2)} ${listing.currency} = ${marketEach.toFixed(4)} ${listing.currency} par sens`,
      `NCB ne chiffre ni les frais de bourse ni les frais de transaction : cess 0,32 % (page Junior Market de la JSE, 2026) et 4 pb JCSD retenus`,
      `la page NCB décrit les frais à l'achat ; appliqués aux deux sens comme les imprime la JSE`,
      `GCT ajoutée aux trois frais comme l'écrit NCB, bien que le barème JCSD exempte les frais de règlement`,
      belowMinOrder == null ? `minimum d'achat de 25 000 JMD non vérifiable : aucun cours JMD dans fx.mjs` : null,
      marketPerShare != null
        ? `carnet ${marketPerShare} par titre`
        : marketBp != null
          ? `carnet ${marketBp} pb`
          : `pas de feuille de carnet : ${listing.exchange}`,
    ]
      .filter(Boolean)
      .join(" ; "),
  };
}

function printCli() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          gctRate: GCT,
          rate: RATE,
          min: 0,
          cessRate: CESS,
          settlementRate: SETTLEMENT,
          minOrder: MIN_ORDER,
          eachWay: true,
        },
        null,
        2
      )
    );
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/ncbcm/ncbcm_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}${l.market ? `, ${l.market}` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} shares at ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`round trip       : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`broker fees      : ${out.brokerFees ?? "N/A"} $`);
    for (const [name, v] of Object.entries(out.parts || {})) if (v) console.log(`  ${name.padEnd(15)}: ${v} $`);
  } else if (out.why) {
    console.log(out.why);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
