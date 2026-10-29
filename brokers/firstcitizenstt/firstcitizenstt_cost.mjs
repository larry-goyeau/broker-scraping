// What one round trip costs at First Citizens Brokerage and Advisory
// Services (FCBAS, First Citizens group, a TTSE member): buy n shares on the
// Trinidad and Tobago Stock Exchange through TOP, the TTSE Online Platform,
// and sell them straight back, in dollars. Ordinary, Preference, Second
// Tier and SME lines in TTD, USD Equity lines in USD.
//
// First Citizens pages, read on 2026-10-28 (firstcitizensgroup.com answers
// 403 to scripts; read in a local Chrome):
//   https://www.firstcitizensgroup.com/tt/first-citizens-investment-services/brokerage-account/
//     "Fees Commissions – 1.25% of the trade value TTSE/TTCD – 0.21% of the
//     trade value".
//   https://www.firstcitizensgroup.com/tt/wp-content/uploads/sites/2/2025/10/TOP-Frequently-Asked-Questions.pdf
//     Question 28: "Is there a fee for using the Online Trading Platform?
//     The service is free of charge, however as per usual, TTSE, TTCD and
//     broker fees will be applied to each transaction." So a TOP order pays
//     the same commission as any other. Question 21: trading is "in the
//     currency of the market in which the security is listed, i.e. Trinidad
//     and Tobago Dollar (TTD) or United States Dollar (USD)".
//   Commission   1.25 % of the trade value, each side. No minimum and no
//                flat fee are printed.
//   TTSE/TTCD    0.21 % of the trade value, each side (Republic Wealth's
//                FAQ prints the same 0.21 % on the buy and on the sell).
// Each side 1.46 %, 2.92 % for the round trip.
//
// No VAT is printed on these fees and Trinidad and Tobago levies no stamp
// duty or transaction tax on a TTSE trade (taxMap.mjs has no line for these
// ISINs); none is added.
//
// In the total: the book, the commission both ways (brokerFees) and the
// TTSE/TTCD fee both ways. Remark: FX when cash ≠ the line's currency.
//
// The book: venues.mjs has no Trinidad and Tobago Stock Exchange, so a line
// does not resolve to a venue and there is no bid and ask to read. `usd` is
// then N/A and `why` says the TTSE book is missing; `brokerFees` is still
// the commission.
//
// Cash: TTD and USD (the TOP FAQ's two trading currencies; FCBAS sells the
// whole board, the USD Equity board included). Each line settles in its own
// currency, no conversion.
//
//   node brokers/firstcitizenstt/firstcitizenstt_cost.mjs MASSY XTRN TTD --shares=100 --price=67.5
//   node brokers/firstcitizenstt/firstcitizenstt_cost.mjs MPCCEL XTRN USD --shares=1000 --price=1.05
//   node brokers/firstcitizenstt/firstcitizenstt_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const FOLDER = "firstcitizenstt";
const BROKER = "First Citizens Brokerage and Advisory Services";
const CATALOGUE = new URL("firstcitizenstt-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.firstcitizensgroup.com/tt/first-citizens-investment-services/brokerage-account/",
  faq: "https://www.firstcitizensgroup.com/tt/wp-content/uploads/sites/2/2025/10/TOP-Frequently-Asked-Questions.pdf",
  readOn: "2026-10-28",
  entity: "First Citizens Brokerage and Advisory Services Limited",
};

const RATE = 0.0125; // commission, each side
const TTCD = 0.0021; // TTSE/TTCD fee, each side
const DEPOSITS = ["TTD", "USD"];
const REMARK = "";
// A client converting TTD and USD does it at the group bank's rate; none
// is printed for the brokerage, so the remark takes First Citizens Bank's
// board half-spread, "USD … Buying 6.5767 … Selling 6.7493" (non-cash buying, 28.10.2026).
// https://www.firstcitizensgroup.com/tt/tt-exchange-rates/
const BANK_FX_URL = "https://www.firstcitizensgroup.com/tt/tt-exchange-rates/";
const BANK_FX = { USD: [6.5767, 6.7493] }; // TTD per USD: [buy, sell]
const halfSpread = ([buy, sell]) => ((sell - buy) / (sell + buy)) * 100;
const fxNote = (currency) => fxRemark(halfSpread(BANK_FX.USD).toFixed(2), currency);
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
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/firstcitizenstt/firstcitizenstt_scraping.mjs\`` };
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
    remark: fxNote(listing.currency),
    listing,
    cashCurrency: inCash ? cashCcy : "",
    venueAuthoritative: false,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `pages First Citizens relues le ${SCHEDULE.readOn} : commission 1,25 % et frais TTSE/TTCD 0,21 % ` +
      `chaque sens, sans minimum imprimé ; la FAQ TOP (question 28) applique les frais habituels à l'ordre en ligne. ` +
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
      `la page donne les frais sans dire achat ou vente ; appliqués aux deux sens, comme la FAQ de Republic Wealth pour les 0,21 % TTCD`,
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, min: 0, ttcdRate: TTCD, deposits: DEPOSITS, eachWay: true, bankFx: { url: BANK_FX_URL, rates: BANK_FX } }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/firstcitizenstt/firstcitizenstt_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
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
