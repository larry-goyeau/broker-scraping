// What one round trip costs at Republic Wealth Management: buy n shares on
// the Trinidad and Tobago Stock Exchange through online trading (TOP, the
// TTSE Online Platform) and sell them straight back, in dollars. Ordinary,
// Preference, Second Tier, SME and Mutual Fund lines in TTD, USD Equity
// lines in USD.
//
// Republic Wealth Management pages, read on 2026-10-26:
//   https://republicwealthmanagement.com/brokerage-services-local-equity/
//     "Are there any fees to Trade? a) Using online Trading fees are TTCD
//     fee .21% and Broker fee 0.75%". Orders go "by phone, via e-mail ... or
//     via online trading (TOP)".
//   https://republicwealthmanagement.com/wp-content/uploads/2021/08/Brokerage-FAQs.pdf
//     Same online line (question 4); "There is no minimum to trade"
//     (question 9); its transfer table prints the TTCD fee 0.21 % on the
//     buy and on the sell, each side.
//   Broker fee   0.75 % of the value traded, each side (online). No minimum
//                and no flat fee are printed for online orders.
//   TTCD fee     0.21 % of the value traded, each side.
// Each side 0.96 %, 1.92 % for the round trip.
//
// Left out: the "through a broker" scale (1.50 % on the first $50,000,
// 1.25 % on the second, 1.00 % above $100,000, flat $10 under $650) is the
// phone/e-mail channel, not online. The TTD$35,000 opening amount is an
// account minimum, not an order minimum. TTD$35 per company to deposit a
// share certificate is not a trading fee. No VAT is printed on these fees
// and Trinidad and Tobago levies no stamp duty or transaction tax on a TTSE
// trade (taxMap.mjs has no line for these ISINs); none is added.
//
// In the total: the book, the broker fee both ways (brokerFees) and the
// TTCD fee both ways. Remark: none.
//
// The book: venues.mjs has no Trinidad and Tobago Stock Exchange, so a line
// does not resolve to a venue and there is no bid and ask to read. `usd` is
// then N/A and `why` says the TTSE book is missing; `brokerFees` is still
// the broker fee.
//
// Cash: TTD and USD (TTD fees and opening amount; the USD Equity board
// trades in USD and Republic Wealth sells the whole board). Each line
// settles in its own currency, no conversion. fx.mjs has no TTD rate yet,
// so a TTD line's fees stay in TTD (`commission`, `market`) and
// `brokerFees` is N/A until it does.
//
//   node brokers/republicwealth/republicwealth_cost.mjs MASSY XTRN TTD --shares=100 --price=67.5
//   node brokers/republicwealth/republicwealth_cost.mjs MPCCEL XTRN USD --shares=1000 --price=1.05
//   node brokers/republicwealth/republicwealth_cost.mjs --schedule
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

const FOLDER = "republicwealth";
const BROKER = "Republic Wealth Management";
const CATALOGUE = new URL("republicwealth-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://republicwealthmanagement.com/brokerage-services-local-equity/",
  faq: "https://republicwealthmanagement.com/wp-content/uploads/2021/08/Brokerage-FAQs.pdf",
  readOn: "2026-10-26",
  entity: "Republic Wealth Management Limited",
};

const RATE = 0.0075; // online broker fee, each side
const TTCD = 0.0021; // TTCD fee, each side
const DEPOSITS = ["TTD", "USD"];
const REMARK = "";
const TTSE = "Trinidad and Tobago Stock Exchange";

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

const held = (ccy) => DEPOSITS.includes(ccy) || depositHas(FOLDER, null, ccy);

const board = (row) =>
  String(row.raw || "").match(/\b(Ordinary|Preference|Second Tier|SME|Mutual Fund|USD Equity) Shares\b/)?.[0] || null;

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
        ["TTSE", "TRINIDAD", "XTRN", "STOCKEX"].includes(wantPlace)
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
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/republicwealth/republicwealth_scraping.mjs\`` };
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
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? TTSE,
    currency: code(m.row.currency) || "TTD",
    brokerExchange: m.row.exchange || null,
    market: board(m.row),
  };
  const cashCcy = listingCash(listing.currency);
  const inCash = held(cashCcy);
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
    cashCurrency: inCash ? cashCcy : "",
    venueAuthoritative: false,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `pages Republic Wealth Management relues le ${SCHEDULE.readOn} : en ligne (TOP), frais TTCD 0,21 % et ` +
      `courtage 0,75 % chaque sens, sans minimum imprimé ; « There is no minimum to trade » (FAQ). ` +
      `Compte en TTD et USD : pas de change.`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: inCash ? 0 : null,
    sources: SCHEDULE,
  };
  if (!inCash) {
    return { ...shared, why: `change forcé vers ${cashCcy} : ${BROKER} ne tient que TTD et USD et ne publie aucun taux de change` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const trade = { shares: n, price: p, notional, notionalUsd: finite(dollars(notional, listing.currency), 6), currency: listing.currency };
  const notionalUsd = dollars(notional, listing.currency);
  const each = notional * RATE;
  const marketEach = notional * TTCD;
  const brokerFees = dollars(each * 2, listing.currency);
  const marketUsd = dollars(marketEach * 2, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, marketUsd, taxUsd);
  const bookWhy = m.venue
    ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
    : `aucun carnet pour ${TTSE} : Trinité-et-Tobago n'est pas dans spreads/venues.mjs, la ligne ne se rattache à aucune place`;
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
    commission: { rate: RATE, min: 0, buy: each, sell: each, currency: listing.currency, eachWay: true },
    market: { ttcd: TTCD, each: marketEach, currency: listing.currency, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(marketUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      `${pct(RATE)} de ${notional.toFixed(2)} ${listing.currency} = ${each.toFixed(4)} ${listing.currency} par sens`,
      `${pct(TTCD)} de ${notional.toFixed(2)} ${listing.currency} = ${marketEach.toFixed(4)} ${listing.currency} par sens`,
      `la page donne les frais en ligne sans dire achat ou vente ; appliqués aux deux sens, comme le tableau de transfert de la FAQ pour les frais TTCD`,
      `le forfait de 10 $ sous 650 $ ne vise que les ordres passés par le courtier, pas l'ordre en ligne`,
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, min: 0, ttcdRate: TTCD, deposits: DEPOSITS, eachWay: true }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/republicwealth/republicwealth_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
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
