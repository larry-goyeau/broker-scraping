// What one round trip costs at EQi (Equiniti Financial Services Limited, UK):
// buy n shares at price p online and sell them straight back, in dollars.
// The Dealing Account, ISA and SIPP share the dealing card.
//
// Read 2026-10-21, "Pricing" (the tables are in the page's
// panelTableRowData script):
//   https://eqi.co.uk/info/how-it-works/pricing
//
//   Online dealing fee          £6.99 a trade: "Equities, Investment Trusts,
//                               Bonds, Gilts" and "Exchange Traded Products
//                               (including Exchange Traded Funds)"
//   International equities      "an additional fee on top of the standard
//                               dealing commission", by trade value:
//                               up to £25,000 0.95 %, £25,000.01-£50,000
//                               0.75 %, £50,000.01-£100,000 0.50 %,
//                               £100,000.01 and above 0.30 %. The band of
//                               the whole trade value gives the rate for the
//                               whole trade (the page prints no marginal
//                               wording). Every place other than London and
//                               Aquis is international here, ETPs included:
//                               the page says "international equities" and
//                               names no other rate for an ETF dealt abroad.
//   FX                          "the share price is converted into pounds at
//                               the prevailing interbank exchange rate, by a
//                               UK-based market maker": no FX margin, so 0.
//   Taxes & levies              UK SDRT 0.5 % and Irish stamp 1 % on the buy,
//                               Spanish FTT 0.2 % (taxMap.mjs); UK PTM £1.50
//                               a side on a UK equity trade over £10,000;
//                               Irish PTM €1.25 a side on an Irish equity
//                               trade over €12,500.
// The monthly subscription (£4.99 under £50,000, £10.99 from £50,000 with
// one free £6.99 trade a month) is the account's, not this trip; both plans
// deal at the same £6.99, so there is one row. Telephone (£49), regular
// investing (£0.99), matched-bargain venues (JP Jenkins, Asset Match: not
// in the catalogue) and the Depository Interest fees on some US/Canadian
// DIs in CREST ($150 up to $50,000, "reflected as part of the price"; the
// list of DI lines is a document, not in the catalogue) are not in the
// total.
//
// Cash is pounds only (deposits.mjs): every trade settles in sterling at
// the interbank rate. UK stamp is a London/Aquis charge here, as in the ii
// file. A US line is dealt through a UK market maker, not a named US
// broker-dealer: the book is the quoted NBBO (no 606).
//
//   node brokers/eqi/eqi_cost.mjs GB0007980591 "London Stock Exchange" GBP --shares=100 --price=4.5
//   node brokers/eqi/eqi_cost.mjs US0378331005 Nasdaq USD --shares=10 --price=230
//   node brokers/eqi/eqi_cost.mjs IE00B4L5Y983 "Börse Xetra" EUR --shares=20 --price=110
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const FOLDER = "eqi";
const CATALOGUE = new URL("eqi-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://eqi.co.uk/info/how-it-works/pricing",
  readOn: "2026-10-21",
  entity: "Equiniti Financial Services Limited",
};

const CASH = "GBP";
const TICKET = 6.99;
const INTERNATIONAL = [
  { upTo: 25000, rate: 0.0095 },
  { upTo: 50000, rate: 0.0075 },
  { upTo: 100000, rate: 0.005 },
  { upTo: Infinity, rate: 0.003 },
];
const PTM = { each: 1.5, above: 10000 };
const IRISH = { stamp: 0.01, ptmEach: 1.25, above: 12500 };
const UK_MICS = new Set(["XLON", "AQSE", "XPLU"]);
const US_MICS = new Set(["XNYS", "XNAS", "XASE", "ARCX", "BATS"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v);
};
function inCurrency(amount, from, to) {
  const usd = dollars(amount, from);
  const per = usdPer(to);
  return usd == null || !(per > 0) ? null : usd / per;
}

export function internationalRate(pounds) {
  return INTERNATIONAL.find((band) => pounds <= band.upTo).rate;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace || code(m.row.mic) === code(place))
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

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
    cashCurrency: CASH,
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) return { ...answer, why: "le catalogue EQi n'existe pas encore : lancer `node brokers/eqi/eqi_scraping.mjs`" };
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue EQi` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez EQi`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? m.row.mic ?? null,
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
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const mic = code(m.row.mic || listing.mic);
  const uk = UK_MICS.has(mic);
  const american = US_MICS.has(mic) && listing.currency === "USD";
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  let marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  if (american && bp == null && perShare == null && marketBp == null && marketPerShare == null) {
    const quoted = usBookPerShare({ broker: FOLDER, ticker: listing.ticker });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null && american ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const stock = listing.type === "STOCK";
  const isin = listing.isin || "";
  const tax = isin ? taxesOf(isin) : null;
  // UK stamp is a London/Aquis charge; a GB share dealt abroad sits on a
  // foreign register.
  const rates = Object.fromEntries(Object.entries(taxRates(tax)).filter(([name]) => uk || !/^STAMP_DUTY$/.test(name)));
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `page Pricing EQi relue le ${SCHEDULE.readOn} : 6,99 £ par ordre en ligne` +
      (uk ? "" : `, plus le frais international par tranche de montant (0,95 % jusqu'à 25 000 £)`) +
      `, conversion au cours interbancaire`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), gbp: usdPer(CASH) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }
  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const pounds = inCurrency(notional, listing.currency, CASH);
  const trade = { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency };
  if (notionalUsd == null || pounds == null) return { ...shared, trade, why: `aucun cours pour convertir ${listing.currency}` };

  const intlRate = uk ? 0 : internationalRate(pounds);
  const intlEach = pounds * intlRate;
  const each = TICKET + intlEach;
  const brokerFees = dollars(each * 2, CASH);

  const ukShare = stock && uk && /^(GB|JE|GG|IM)/.test(isin);
  const irishShare = stock && isin.startsWith("IE") && !american && rates.STAMP_DUTY == null;
  const ptmGbp = ukShare && pounds > PTM.above ? PTM.each * 2 : 0;
  const euros = irishShare ? inCurrency(notional, listing.currency, "EUR") : 0;
  const irishPtmEur = irishShare ? (euros == null ? null : euros > IRISH.above ? IRISH.ptmEach * 2 : 0) : 0;
  const irishStamp = irishShare ? notional * IRISH.stamp : 0;
  const gap = taxGap(isin, listing.type, listing.mic);
  const taxUsd = plus(
    gap ? null : notionalUsd * taxTotal,
    dollars(ptmGbp, CASH),
    irishPtmEur == null ? null : dollars(irishPtmEur, "EUR"),
    dollars(irishStamp, listing.currency),
  );
  const bookUsd = parts.a == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const why = [
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);

  const confidence = [
    shared.basis,
    `courtage ${TICKET} £ par sens`,
    uk ? null : `frais international ${(intlRate * 100).toFixed(2)} % de ${pounds.toFixed(2)} £ par sens (tranche du montant entier ; appliqué aussi aux ETP cotés hors Londres)`,
    listing.currency === "GBP" || listing.currency === "GBX" ? null : `conversion ${listing.currency}→GBP au cours interbancaire, sans marge publiée`,
    taxTotal > 0 ? `taxe ${(100 * taxTotal).toFixed(3)} % à l'achat (taxMap)` : null,
    ptmGbp ? `PTM ${PTM.each} £ par sens, le montant dépassant ${PTM.above} £` : null,
    irishShare ? `droit de timbre irlandais ${IRISH.stamp * 100} % à l'achat` : null,
    irishShare && irishPtmEur ? `PTM irlandais ${IRISH.ptmEach} € par sens` : null,
    american ? "teneur de marché britannique, pas de courtier US nommé : NBBO coté" : null,
    marketPerShare != null ? `carnet ${marketPerShare} $ la part` : marketBp != null ? `carnet ${marketBp} bp` : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(usd == null && why.length ? { why: why.join(" ; ") } : {}),
    commission: { each, ticket: TICKET, internationalEach: intlEach, internationalRate: intlRate, currency: CASH, eachWay: true },
    trade,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      change: 0,
      taxes: finite(taxUsd, 6),
    },
    confidence,
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
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage: node brokers/eqi/eqi_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} shares at ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`round trip    : ${out.usd == null ? "unknown" : `${out.usd} $`}`);
    console.log(`broker fees   : ${out.brokerFees == null ? "unknown" : `${out.brokerFees} $`}`);
    if (out.parts) for (const [k, v] of Object.entries(out.parts)) console.log(`  ${k.padEnd(12)}: ${v == null ? "unknown" : `${v} $`}`);
  }
  if (out.why) console.log(`\n${out.why}`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
