// What one round trip costs at Bourse Brokers (Bourse Securities Limited, a
// TTSE member): buy n shares on the Trinidad and Tobago Stock Exchange
// through TOP, the TTSE Online Platform, and sell them straight back, in
// dollars. Ordinary, Preference, Second Tier and SME lines in TTD, USD
// Equity lines in USD.
//
// Bourse local stockbroking page, read on 2026-10-28:
//   https://bourseinvestment.com/individual-solutions/stockbroking/local-stockbroking/
//     "What are the fees/commissions charged for trading on the local stock
//     market? 1.50% on the first $50,000 1.25% on second $50,000. 1% on
//     remaining market value over $100,000." Orders go "by phone, in person,
//     or via e-mail. There is also an online option": TOP, whose features
//     include a "Reduced commission rate". That online rate is not printed.
//   Stand-in (owner's choice, 2026-10-28): the printed scale, a ceiling for
//   the online order, on the order's value in TTD ("$" on a local page),
//   each side. No minimum and no flat fee are printed.
//     1.50 % on the first TT$50,000, 1.25 % on the next TT$50,000, 1.00 %
//     above TT$100,000.
//   TTSE/TTCD    0.21 % of the value traded, each side. Bourse prints none;
//                the same charge on every TTSE trade, as Republic Wealth's
//                FAQ and First Citizens' brokerage page print it.
// Under TT$50,000 each side 1.71 %, 3.42 % for the round trip.
//
// No VAT is printed on these fees and Trinidad and Tobago levies no stamp
// duty or transaction tax on a TTSE trade (taxMap.mjs has no line for these
// ISINs); none is added.
//
// In the total: the book, the commission both ways (brokerFees) and the
// TTSE/TTCD fee both ways. Remark: the online rate is lower, and FX when
// cash ≠ the line's currency.
//
// The book: venues.mjs has no Trinidad and Tobago Stock Exchange, so a line
// does not resolve to a venue and there is no bid and ask to read. `usd` is
// then N/A and `why` says the TTSE book is missing; `brokerFees` is still
// the commission.
//
// Cash: TTD and USD (the TT$10,000 opening amount; the USD Equity board
// trades in USD, as the TTSE's TOP FAQ says, and Bourse sells the whole
// board). Each line settles in its own currency, no conversion. A USD
// line's value is put in TTD for the scale at fx.mjs's TTD rate (CBTT
// weighted average), and a TTD line's fees go to dollars at that rate.
//
//   node brokers/boursebrokers/boursebrokers_cost.mjs MASSY XTRN TTD --shares=100 --price=67.5
//   node brokers/boursebrokers/boursebrokers_cost.mjs MASSY XTRN TTD --shares=2000 --price=67.5
//   node brokers/boursebrokers/boursebrokers_cost.mjs --schedule
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

const FOLDER = "boursebrokers";
const BROKER = "Bourse Brokers";
const CATALOGUE = new URL("boursebrokers-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://bourseinvestment.com/individual-solutions/stockbroking/local-stockbroking/",
  readOn: "2026-10-28",
  entity: "Bourse Securities Limited",
};

// Commission on the order's value in TTD, each side: [up to, rate].
const SCALE = [
  [50_000, 0.015],
  [100_000, 0.0125],
  [Infinity, 0.01],
];
const TTCD = 0.0021; // TTSE/TTCD fee, each side
const DEPOSITS = ["TTD", "USD"];
const REMARK = "Online (TOP) commission is lower; its rate is not published.";
// Bourse prints no FX rate and has no bank in its group: the client converts
// at its own bank, so the remark carries no figure (owner's choice,
// 2026-10-28, over Republic Bank's 1.48 % as a stand-in).
const fxNote = (currency) => fxRemark("", currency);

const scaled = (valueTtd) => {
  let fee = 0;
  let from = 0;
  for (const [upTo, rate] of SCALE) {
    if (valueTtd > from) fee += (Math.min(valueTtd, upTo) - from) * rate;
    from = upTo;
  }
  return fee;
};
const inTtd = (amount, currency) => {
  if (code(currency) === "TTD") return amount;
  const usd = toUsd(amount, currency);
  const per = usdPer("TTD");
  return usd == null || !(per > 0) ? null : usd / per;
};
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
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/boursebrokers/boursebrokers_scraping.mjs\`` };
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
    remark: `${REMARK}\n${fxNote(listing.currency)}`,
    listing,
    cashCurrency: inCash ? cashCcy : "",
    venueAuthoritative: false,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `page Bourse relue le ${SCHEDULE.readOn} : barème 1,50 % jusqu'à 50 000 TT$, 1,25 % jusqu'à 100 000, 1,00 % au-delà, ` +
      `chaque sens ; le taux réduit de TOP n'est pas publié, le barème sert de plafond (choix du propriétaire, 2026-10-28) ; ` +
      `frais TTSE/TTCD 0,21 % chaque sens, que Bourse n'imprime pas. ` +
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
  const valueTtd = inTtd(notional, listing.currency);
  const commissionTtd = valueTtd == null ? null : scaled(valueTtd);
  const each =
    commissionTtd == null ? null : listing.currency === "TTD" ? commissionTtd : (commissionTtd / valueTtd) * notional;
  const marketEach = notional * TTCD;
  const brokerFees = each == null ? null : dollars(each * 2, listing.currency);
  const marketUsd = dollars(marketEach * 2, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, marketUsd, taxUsd);
  const bookWhy = m.venue
    ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
    : `aucun carnet pour ${TTSE} : Trinité-et-Tobago n'est pas dans spreads/venues.mjs, la ligne ne se rattache à aucune place`;
  const why = [
    each == null ? `aucun cours TTD dans fx.mjs : le barème en TTD ne s'applique pas à une ligne ${listing.currency}` : null,
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
    commission: { scale: SCALE, scaleCurrency: "TTD", min: 0, buy: each, sell: each, currency: listing.currency, eachWay: true, standIn: true },
    market: { ttcd: TTCD, each: marketEach, currency: listing.currency, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(marketUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      each == null
        ? `pas de cours TTD : barème non appliqué à ${notional.toFixed(2)} ${listing.currency}`
        : `barème 1,50/1,25/1,00 % sur ${valueTtd.toFixed(2)} TTD = ${commissionTtd.toFixed(4)} TTD par sens`,
      `${pct(TTCD)} de ${notional.toFixed(2)} ${listing.currency} = ${marketEach.toFixed(4)} ${listing.currency} par sens`,
      `la page donne le barème sans dire achat ou vente ; appliqué à chaque ordre, achat et vente`,
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
    console.log(JSON.stringify({ ...SCHEDULE, scale: SCALE, scaleCurrency: "TTD", min: 0, ttcdRate: TTCD, deposits: DEPOSITS, eachWay: true }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/boursebrokers/boursebrokers_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
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
