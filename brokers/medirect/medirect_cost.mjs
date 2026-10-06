// What one round trip costs at MeDirect: buy n shares at price p, sell
// them back at once, in dollars. Online only. The over-the-counter and
// advisory lines stay out. A name on both books is priced on the Belgian
// schedule for a resident of Belgium, and on the Malta schedule for any
// other residence Malta accepts. With no country named, a name on the
// Belgian book uses that schedule.
//
// Belgium, tariff in force 1 July 2026, read on 2026-10-05. The rate is
// on the consideration, then the minimum.
//   ETF on the listed European, UK, Swiss and Nordic venues   0
//   Share on those same euro venues                           0.15%, min 2.50 EUR
//   Nasdaq, NYSE, NYSE Arca, NYSE American                    0.15%, min 2.50 USD
//   London                                                    0.15%, min 2.50 GBP
//   SIX                                                       0.15%, min 2.50 CHF
//   Oslo                                                      0.15%, min 30 NOK
//   Stockholm                                                 0.15%, min 30 SEK
//   Copenhagen                                                0.15%, min 20 DKK
//   A US ETF is not in the ETF table, and neither is the pink
//   sheet. No figure is invented. Changing cash is 0.8% and stays
//   in the remark. Nasdaq and NYSE use the quoted NBBO. MeDirect
//   names no US broker-dealer, so no Rule 606 mix is applied.
//
// Malta, schedule dated 27 April 2026, read on 2026-10-05. Online
// execution, shares and ETFs, the same 0.10% on the listed venues.
//   EUR 2.50, GBP 2.50, USD 3, CHF 2.50, NOK 25, SEK 25, DKK 20
//   A currency the table does not name is agreed case by case.
//   Cash can be left in EUR, USD, GBP, AUD, NOK, CAD or JPY. The order
//   preview of 2026-10-06 charges FxMarginFee at 1.5% of the
//   consideration plus the commission, each way, when that cash is not
//   the listing currency. The client can hold the listing currency, so
//   the margin stays in the remark. No exchange fee appeared beside it.
//   A stamp or a transaction tax the shared tax file has read for the
//   ISIN is added. The Malta Stock Exchange's own notice bills its
//   member, not the client: 0.03% of monthly turnover and €4.50 a
//   contract note. MeDirect does not reprint that as a client charge,
//   so it stays out of the ticket.
//
//   https://www.medirect.be/wp-content/uploads/Tariffs-charges-EN.pdf
//   https://www.medirect.com.mt/wp-content/uploads/Tariffs-Charges-for-Investment-Services.pdf
//
//   node brokers/medirect/medirect_cost.mjs US0378331005 NAS USD --shares=10 --price=100 --nat=BE
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import { EEA } from "../../accepted.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("medirect-parsed.json", import.meta.url);
const READ_ON = "2026-10-05";
const BE_URL = "https://www.medirect.be/wp-content/uploads/Tariffs-charges-EN.pdf";
const MT_URL = "https://www.medirect.com.mt/wp-content/uploads/Tariffs-Charges-for-Investment-Services.pdf";
const BE_RATE = 0.0015;
const MT_RATE = 0.001;
const MALTA = new Set([...EEA, "CH", "GB"]);

const BE_EQUITY = {
  euronext: { min: 2.5, ccy: "EUR" },
  xetra: { min: 2.5, ccy: "EUR" },
  milan: { min: 2.5, ccy: "EUR" },
  lisbon: { min: 2.5, ccy: "EUR" },
  madrid: { min: 2.5, ccy: "EUR" },
  helsinki: { min: 2.5, ccy: "EUR" },
  nasdaq: { min: 2.5, ccy: "USD" },
  nyse: { min: 2.5, ccy: "USD" },
  arca: { min: 2.5, ccy: "USD" },
  amex: { min: 2.5, ccy: "USD" },
  lse: { min: 2.5, ccy: "GBP" },
  six: { min: 2.5, ccy: "CHF" },
  oslo: { min: 30, ccy: "NOK" },
  stockholm: { min: 30, ccy: "SEK" },
  copenhagen: { min: 20, ccy: "DKK" },
};
const BE_ETF = new Set(["euronext", "xetra", "milan", "lisbon", "madrid", "helsinki", "lse", "six", "oslo", "stockholm", "copenhagen"]);
const MT_MIN = { EUR: 2.5, GBP: 2.5, USD: 3, CHF: 2.5, NOK: 25, SEK: 25, DKK: 20 };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function venueOf(exchange) {
  const raw = code(exchange);
  const text = raw.replace(/[^A-Z0-9]+/g, " ").trim();
  if (raw === "BRU" || raw === "PAR" || raw === "AMS" || raw === "TAA" || text.includes("EURONEXT")) return "euronext";
  if (raw === "ETR" || text === "XETRA" || text.includes("XETRA") || text.includes("FRANKFURT")) return "xetra";
  if (raw === "MIL" || text.includes("BORSA ITALIANA") || text.includes("ITALIANA")) return "milan";
  if (raw === "LIS" || text.includes("LISBON")) return "lisbon";
  if (raw === "XMAD" || raw === "MCE" || text.includes("MADRID")) return "madrid";
  if (raw === "HEL" || text.includes("HELSINKI")) return "helsinki";
  if (raw === "STO" || text.includes("STOCKHOLM") || text.includes("NORDIC")) return "stockholm";
  if (raw === "CSE" || text.includes("COPENHAGEN")) return "copenhagen";
  if (raw === "NAS" || raw === "NMS" || text.includes("NASDAQ")) return "nasdaq";
  if (raw === "NYS" || text === "NYSE") return "nyse";
  if (text.includes("ARCA")) return "arca";
  if (raw === "ASE" || text.includes("AMEX") || text.includes("NYSE MKT")) return "amex";
  if (raw === "LON" || text.includes("LONDON") || text.includes("LSE")) return "lse";
  if (raw === "SWX" || text.includes("SIX") || text.includes("SWISS")) return "six";
  if (raw === "OSL" || text.includes("OSLO")) return "oslo";
  if (raw === "MAL" || text.includes("MALTA")) return "malta";
  return "";
}

function bankOf(books, nat) {
  const hasBe = books.includes("BE");
  const hasMt = books.includes("MT");
  const who = code(nat);
  if (who === "BE" && hasBe) return "BE";
  if (who && MALTA.has(who) && hasMt) return "MT";
  if (!who && hasBe) return "BE";
  if (!who && hasMt) return "MT";
  return "";
}

function quoteOf(bank, listing) {
  const venue = venueOf(listing.brokerExchange);
  if (bank === "BE") {
    if (listing.type === "ETF") {
      if (!BE_ETF.has(venue)) return null;
      return { rate: 0, min: 0, ccy: "EUR" };
    }
    return BE_EQUITY[venue] ? { rate: BE_RATE, ...BE_EQUITY[venue] } : null;
  }
  if (!venue || venue === "pink") return null;
  const min = MT_MIN[listing.currency];
  if (min == null) return null;
  return { rate: MT_RATE, min, ccy: listing.currency };
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

function sideUsd(notional, listingCcy, quote) {
  if (!quote) return null;
  if (!(quote.rate > 0) && !(quote.min > 0)) return 0;
  const variable = dollars(notional * quote.rate, listingCcy);
  const floor = quote.min > 0 ? dollars(quote.min, quote.ccy) : 0;
  if (variable == null || floor == null) return null;
  return Math.max(variable, floor);
}

export function roundTrip({ etf, place, currency, shares, price, nat = "", bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue MeDirect n'existe pas encore : lancer `node brokers/medirect/medirect_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue MeDirect` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez MeDirect`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const open = matches.filter((item) => bankOf(item.row.books || [], nat));
  const pool = open.length ? open : matches;
  const exact = pool.filter((item) => loose(item.row.exchange) === loose(place));
  const m = (exact.length ? exact : pool)[0];
  const books = Array.isArray(m.row.books) ? m.row.books : [];
  const bank = bankOf(books, nat);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "medirect",
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
  const quote = bank ? quoteOf(bank, listing) : null;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const belgian = bank === "BE";
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxPct = Object.values(rates).reduce((sum, rate) => sum + rate, 0);
  const maltaExchange =
    "The Malta Stock Exchange bills its member 0.03% of monthly turnover and €4.50 a contract note. MeDirect does not reprint that as a client charge.";
  const remark = belgian
    ? fxRemark("0.8", listing.currency)
    : bank === "MT"
      ? venueOf(listing.brokerExchange) === "malta"
        ? `${fxRemark("1.5", listing.currency)} ${maltaExchange}`
        : fxRemark("1.5", listing.currency)
      : "";
  const freeEtf = quote && !(quote.rate > 0);
  const basis = belgian
    ? `MeDirect Belgique, barème du 2026-07-01, relu le ${READ_ON}.${quote ? (freeEtf ? " ETF 0." : " Action 0,15 %.") : ""}`
    : bank === "MT"
      ? `MeDirect Malte, barème du 2026-04-27, relu le ${READ_ON}.${quote ? " 0,10 %." : ""}`
      : "";
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    url: belgian ? BE_URL : bank === "MT" ? MT_URL : BE_URL,
    remark,
    basis,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  if (!bank) return { ...shared, why: "ce nom n'est pas vendu à ce pays de résidence" };
  if (!quote) return { ...shared, why: "pas de commission publiée pour cette place" };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const one = sideUsd(notional, listing.currency, quote);
  const brokerFees = one == null ? null : one + one;
  const taxUsd = !tax.known || notionalUsd == null ? 0 : notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: quote.rate, min: quote.min, currency: quote.ccy, bank },
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({
    etf,
    place,
    currency,
    nat: arg("nat", ""),
    shares: Number(arg("shares", "10")),
    price: Number(arg("price", "0")),
  }), null, 2));
}

printCli();
