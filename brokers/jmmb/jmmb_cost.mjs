// What one round trip costs at JMMB (Jamaica): buy n shares on the Jamaica
// Stock Exchange through JMMB Moneyline, the online channel of the JMMB
// EMMA stock account (JMMB Securities Limited, a JSE member dealer), and
// sell them straight back, in dollars. Main Market and Junior Market lines
// in JMD, USD Market lines in USD, and the two Sagicor Select index funds.
//
// JMMB fee schedule 2026, "Fee Schedule - Personal & Business Clients",
// read on 2026-10-26:
//   https://jm.jmmb.com/sites/default/files/Jamaica/Attachments/Fees/2026/JMMB-investments_Fees_2026.pdf
// "All fees include GCT". "*Digital channels are defined as Moneyline,
// **Assisted channels are other channels except Moneyline".
//   JMMB SL Commission - Digital Channels*   "0.70% (0.61% plus GCT) of the
//                                            value of the stocks bought or
//                                            sold", each side. No minimum.
//   JMMB SL Commission - Assisted Channels** 2.00 %, minimum JA$100: an
//                                            order placed in branch or by
//                                            phone, not online. Not used.
//   Wires, cheques, transfers and statements are not this order. No equity
//   custody fee is printed (the US$19.73 custodial fee is per bond). No FX
//   rate is printed ("Fees quoted in a foreign currency may be collected in
//   JA$ at the exchange rate on the date of the transaction").
//   https://jm.jmmb.com/ja-equities
//     "Open a JMMB EMMA with as little as J$25,000 and you can buy and sell
//     stocks online, through our intuitive Moneyline platform." An account
//     opening sum, not an order minimum: not applied.
//
// Market charges, each side, on every JSE equity trade, reflected on the
// broker's contract note (JMMB prints none of them; same reading as the
// GK Capital file):
//   JSE cess        0.32 % of the value traded. The JSE fee schedule
//                   prints "Regular Trading Transaction & Block Transaction
//                   Fees are 0.32%, that is $3.20 per $1,000 of the value of
//                   the securities traded. (On each side of the
//                   transaction)" on its Junior Market page (2026 schedule);
//                   the Main Market page still carries the 2015 wording
//                   "0.3 of 1%". The Jamaica Observer of 9 Feb 2025 reports
//                   the total cess/trade fee rising "from 0.35 per cent to
//                   0.36 per cent per equity trade" from 1 Jan 2025, all of
//                   it the JCSD's 3 to 4 bp move, so the JSE share is
//                   0.32 % on every equity market. The JSE investor
//                   advisory of 27 Mar 2015 puts the cess on "all trades
//                   (including Block Transactions) enacted on the JSE", USD
//                   Market included.
//   JCSD settlement 4 bp of the value of the trade on each side, JMD and USD
//                   schedules effective 1 Jan 2025. Settlement fees do not
//                   attract GCT.
//   https://www.jamstockex.com/investors/fee-schedule/jse-junior-market-fees/
//   https://www.jamstockex.com/investors/fee-schedule/jse-main-market-fees/
//   https://www.jamstockex.com/investors/fee-schedule/jcsd-broker-fees/
//   https://jamstockex.s3.amazonaws.com/wp-content/uploads/2024/12/JCSD-USD-Fees-2025.pdf
//   https://www.jamstockex.com/?p=22325
//   https://www.jamaicaobserver.com/value-added-section/2025/02/09/jse-increases-fees-across-board/
// Jamaica levies no stamp duty or transaction tax on a JSE trade
// (taxMap.mjs has no line for these ISINs); none is added.
//
// Each side: 0.70 % commission and 0.36 % cess plus settlement: 1.06 %,
// 2.12 % for the round trip.
//
// In the total: the book, the commission both ways (brokerFees) and the
// cess plus settlement fee both ways. Remark: none.
//
// The book: venues.mjs has no Jamaica Stock Exchange yet, so a JMMB line
// does not resolve to a venue and there is no bid and ask to read. `usd` is
// then N/A and `why` says the JSE book is missing; `brokerFees` is still the
// commission.
//
// The EMMA account holds JMD and USD ("with as little as J$25,000 or
// US$200", deposits.mjs): each line settles in its own currency, no
// conversion. A JMD line's fees go to dollars at fx.mjs's JMD rate.
//
//   node brokers/jmmb/jmmb_cost.mjs NCBFG XJAM JMD --shares=1000 --price=70
//   node brokers/jmmb/jmmb_cost.mjs GK XJAM JMD --shares=2000 --price=80
//   node brokers/jmmb/jmmb_cost.mjs PROVEN XJAM USD --shares=5000 --price=0.2
//   node brokers/jmmb/jmmb_cost.mjs SELECTF XJAM JMD --shares=300000 --price=0.5
//   node brokers/jmmb/jmmb_cost.mjs --schedule
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

const FOLDER = "jmmb";
const BROKER = "JMMB";
const CATALOGUE = new URL("jmmb-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://jm.jmmb.com/sites/default/files/Jamaica/Attachments/Fees/2026/JMMB-investments_Fees_2026.pdf",
  account: "https://jm.jmmb.com/ja-equities",
  year: "2026",
  readOn: "2026-10-26",
  entity: "JMMB Securities Limited",
  cess: "https://www.jamstockex.com/investors/fee-schedule/jse-junior-market-fees/",
  settlement: "https://www.jamstockex.com/investors/fee-schedule/jcsd-broker-fees/",
  settlementUsd: "https://jamstockex.s3.amazonaws.com/wp-content/uploads/2024/12/JCSD-USD-Fees-2025.pdf",
  total: "https://www.jamaicaobserver.com/value-added-section/2025/02/09/jse-increases-fees-across-board/",
};

const RATE = 0.007; // Moneyline (digital channel) commission, GCT included, each side
const CESS = 0.0032; // JSE cess, each side
const SETTLEMENT = 0.0004; // JCSD settlement, each side
const MARKET = CESS + SETTLEMENT;
const REMARK = "";
// EMMA account cash ("J$25,000 or US$200"); used until deposits.mjs has a jmmb entry.
const CASH = ["JMD", "USD"];
const JSE = "Jamaica Stock Exchange";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
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
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/jmmb/jmmb_scraping.mjs\`` };
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
  const held = depositHas(FOLDER, null, cashCcy) || CASH.includes(cashCcy);
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
      `barème JMMB ${SCHEDULE.year}, relu le ${SCHEDULE.readOn} : commission JMMB SL Digital Channels (Moneyline) 0,70 % chaque sens, ` +
      `GCT comprise, sans minimum imprimé ; le canal assisté (2 %, minimum 100 JMD) n'est pas en ligne. Cess JSE 0,32 % et règlement JCSD 0,04 % chaque sens (0,36 % au total, ` +
      `Jamaica Observer du 9 février 2025). Compte en JMD et USD : pas de change.`,
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
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
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
      `0,70 % de ${notional.toFixed(2)} ${listing.currency} = ${each.toFixed(4)} ${listing.currency} par sens`,
      `0,36 % de ${notional.toFixed(2)} ${listing.currency} = ${marketEach.toFixed(4)} ${listing.currency} par sens`,
      `JMMB n'imprime ni cess ni frais JCSD : barème de la JSE retenu ; la page Main Market de la JSE garde « 0.3 of 1% » (2015) ; 0,32 % retenu d'après la page Junior Market et le total 0,36 % de 2025`,
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, min: 0, cessRate: CESS, settlementRate: SETTLEMENT, eachWay: true }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/jmmb/jmmb_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
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
