// What one round trip costs at JMMB Securities (T&T): buy n shares and sell
// them straight back, in dollars, on the two places of its catalogue:
// - the Trinidad and Tobago Stock Exchange (Ordinary, Preference, Second
//   Tier and SME lines in TTD, USD Equity lines in USD);
// - the New York Stock Exchange (MIC XNYS, in USD), traded online through
//   JMMB International Access, the Interactive Brokers platform.
//
// JMMB Trinidad and Tobago pages, read on 2026-10-28:
//   https://tt.jmmb.com/investment-products
//     "you can also buy and sell stocks online, through our Interactive
//     platform powered by Interactive Brokers".
//   https://tt.jmmb.com/jmmb-interactive
//     JMMB International Access: "No minimum amount"; "Interactive Brokers
//     provides execution and clearing services to customers". No
//     commission is printed.
//   https://tt.jmmb.com/equities   (Business > Investments > Equities)
//     "The trading fee structure comprises of two parts, a fixed portion
//     ($25 ticket charge) and a variable portion (7.5 cents per share). For
//     example, a trade of 1000 shares has a total charge of $100";
//     "Minimum account size: US $100,000.00".
//   tt.jmmb.com prints no retail commission, for TTSE orders nor for the
//   International Access platform. The owner chose group stand-ins
//   (2026-10-28):
//   TTSE   JMMB Jamaica's online (Moneyline) commission, "0.70% (0.61% plus
//          GCT) of the value of the stocks bought or sold", each side, no
//          minimum (JMMB fee schedule 2026, read for ../jmmb on 2026-10-26),
//          plus the TTSE/TTCD fee 0.21 % each side that every TTSE trade
//          pays (Republic Wealth's FAQ, First Citizens' brokerage page).
//          Each side 0.91 %, 1.82 % for the round trip.
//            https://jm.jmmb.com/sites/default/files/Jamaica/Attachments/Fees/2026/JMMB-investments_Fees_2026.pdf
//   NYSE   The Business equities page: US$25 ticket plus US$0.075 a share,
//          each order, so each side. US SEC/TAF/CAT are not printed and
//          stay at 0.
//
// No VAT is printed on these fees and Trinidad and Tobago levies no stamp
// duty or transaction tax on a TTSE trade; a US line takes taxMap.mjs's
// rate, if any.
//
// In the total: the book, the commission both ways (brokerFees), on the
// TTSE the TTSE/TTCD fee both ways, and taxes. Remark: FX when cash ≠ the line's currency.
//
// The book: venues.mjs has no Trinidad and Tobago Stock Exchange, so a TTSE
// line does not resolve to a venue and there is no bid and ask to read: its
// `usd` is N/A and `why` says the TTSE book is missing; `brokerFees` is
// still the commission. A NYSE line takes the NBBO half-spread of the US
// book with the Rule 606 of Interactive Brokers LLC, the platform's
// executing broker (spreads/rule606.mjs alias jmmbsecuritiestt).
//
// Cash: TTD and USD (the investment-products page: products "Available in
// two (2) currencies TT$ and US$", the equities minimum "US $10,000"; the
// USD Equity board and the NYSE trade in USD). Each line settles in its own
// currency, no conversion.
//
//   node brokers/jmmbsecuritiestt/jmmbsecuritiestt_cost.mjs MASSY XTRN TTD --shares=100 --price=67.5
//   node brokers/jmmbsecuritiestt/jmmbsecuritiestt_cost.mjs MPCCEL XTRN USD --shares=1000 --price=1.05
//   node brokers/jmmbsecuritiestt/jmmbsecuritiestt_cost.mjs KO XNYS USD --shares=100 --price=70
//   node brokers/jmmbsecuritiestt/jmmbsecuritiestt_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { isListedUsTape, listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const FOLDER = "jmmbsecuritiestt";
const BROKER = "JMMB Securities (T&T)";
const CATALOGUE = new URL("jmmbsecuritiestt-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://tt.jmmb.com/investment-products",
  platform: "https://tt.jmmb.com/jmmb-interactive",
  usTariff: "https://tt.jmmb.com/equities",
  ttseStandIn: "https://jm.jmmb.com/sites/default/files/Jamaica/Attachments/Fees/2026/JMMB-investments_Fees_2026.pdf",
  readOn: "2026-10-28",
  entity: "JMMB Securities (T&T) Limited",
  rule606: "Rule 606 d'Interactive Brokers LLC (courtier d'exécution de JMMB International Access)",
};

const TTSE_RATE = 0.007; // JMMB Jamaica online commission, stand-in, each side
const TTCD = 0.0021; // TTSE/TTCD fee, each side
const US_TICKET = 25; // USD a side
const US_PER_SHARE = 0.075; // USD a share, each side
const DEPOSITS = ["TTD", "USD"];
const REMARK = "";
// A client converting TTD and USD does it at the group bank's rate; none
// is printed for the brokerage, so the remark takes JMMB Bank (T&T)'s
// board half-spread, "US DOLLAR USD Sell 6.7493 Buy 6.7000" (non-cash buy; cash buy 6.3), 28.10.2026.
// https://tt.jmmb.com/forex-rates
const BANK_FX_URL = "https://tt.jmmb.com/forex-rates";
const BANK_FX = { USD: [6.7, 6.7493] }; // TTD per USD: [buy, sell]
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

const isTtse = (row) => code(row?.mic) === "XTRN" || /trinidad/i.test(String(row?.exchange || ""));
const TTSE_CODES = ["TTSE", "TRINIDAD", "XTRN", "STOCKEX"];

const board = (row) =>
  String(row.raw || "").match(/\b(Ordinary|Preference|Second Tier|SME|Mutual Fund|USD Equity) Shares\b/)?.[0] || null;

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace) return true;
      if (isTtse(m.row)) return TTSE_CODES.includes(wantPlace);
      return Boolean(wantVenue && m.venue && m.venue.mic === wantVenue.mic);
    })
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
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/jmmbsecuritiestt/jmmbsecuritiestt_scraping.mjs\`` };
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
  const ttse = isTtse(m.row);
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
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? (ttse ? TTSE : null),
    currency: code(m.row.currency) || (ttse ? "TTD" : "USD"),
    brokerExchange: m.row.exchange || null,
    ...(ttse ? { market: board(m.row) } : {}),
  };
  const us = !ttse && isListedUsTape(listing.mic);
  const cashCcy = listingCash(listing.currency);
  const inCash = held(cashCcy);
  const leaf = book.leaf;
  const quoted = us ? usBookPerShare({ broker: FOLDER, ticker: listing.ticker, fallback: leaf?.perShare ?? null }) : null;
  const marketPerShare = perShare ?? (us ? quoted : leaf?.perShare ?? null);
  const marketBp = bp ?? (marketPerShare != null ? null : leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: us && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, us ? "USD" : listing.currency),
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
    basis: ttse
      ? `pages JMMB T&T relues le ${SCHEDULE.readOn} : aucune commission TTSE publiée ; repli du groupe (choix du propriétaire, 2026-10-28) : ` +
        `0,70 % en ligne de JMMB Jamaïque (Moneyline) et frais TTSE/TTCD 0,21 %, chaque sens, sans minimum. Compte en TTD et USD : pas de change.`
      : `pages JMMB T&T relues le ${SCHEDULE.readOn} : International Access (Interactive Brokers) sans commission publiée ; ` +
        `repli (choix du propriétaire, 2026-10-28) : page Business Equities, 25 $ par ordre + 7,5 cents par titre, chaque sens ; ` +
        `SEC/TAF/CAT non publiés, laissés à 0 ; ${SCHEDULE.rule606}. Compte en USD : pas de change.`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: inCash ? 0 : null,
    sources: SCHEDULE,
  };
  if (!ttse && !us) {
    return { ...shared, why: `${listing.exchange || "cette place"} n'est pas une place de ${BROKER}` };
  }
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
  const each = ttse ? notional * TTSE_RATE : US_TICKET + US_PER_SHARE * n;
  const marketEach = ttse ? notional * TTCD : 0;
  const brokerFees = dollars(each * 2, listing.currency);
  const marketUsd = dollars(marketEach * 2, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, marketUsd, taxUsd);
  const bookWhy = ttse
    ? `aucun carnet pour ${TTSE} : Trinité-et-Tobago n'est pas dans spreads/venues.mjs, la ligne ne se rattache à aucune place`
    : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;
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
    commission: ttse
      ? { rate: TTSE_RATE, min: 0, buy: each, sell: each, currency: listing.currency, eachWay: true, standIn: true }
      : { ticket: US_TICKET, perShare: US_PER_SHARE, buy: each, sell: each, currency: "USD", eachWay: true, standIn: true },
    ...(ttse ? { market: { ttcd: TTCD, each: marketEach, currency: listing.currency, eachWay: true } } : {}),
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(marketUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      ttse
        ? `${pct(TTSE_RATE)} de ${notional.toFixed(2)} ${listing.currency} = ${each.toFixed(4)} ${listing.currency} par sens`
        : `25 $ + 0,075 $ × ${n} = ${each.toFixed(2)} $ par sens`,
      ttse ? `${pct(TTCD)} de ${notional.toFixed(2)} ${listing.currency} = ${marketEach.toFixed(4)} ${listing.currency} par sens` : null,
      taxTotal ? `taxe ${(taxTotal * 100).toFixed(2)} % depuis taxMap.mjs` : null,
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
        { ...SCHEDULE, ttseRate: TTSE_RATE, ttcdRate: TTCD, usTicket: US_TICKET, usPerShare: US_PER_SHARE, deposits: DEPOSITS, eachWay: true, bankFx: { url: BANK_FX_URL, rates: BANK_FX } },
        null,
        2
      )
    );
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/jmmbsecuritiestt/jmmbsecuritiestt_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
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
