// One round trip at a Longbridge entity: buy n shares, sell them back, in
// dollars. Long Bridge HK Limited, Long Bridge Securities Pte. Ltd. and Long
// Bridge Securities Limited (NZ) share one quote platform, one catalogue
// reader and one shape of bill; each prints its own rates. Each broker file
// passes the rates its own pricing page prints. This file only finds the
// listing, adds those rates up and puts the book beside them.
//
// brokerFees is the broker's own bill: commission and platform fee, with
// GST where the entity names it. The exchange, clearing, regulator and
// stamp lines sit in the total beside the book, as at futu. A missing book
// stays missing.
//
// Market lines every entity shares, read on the Long Bridge HK rate page
// (https://longbridge.com/hk/en/rate, "Learn More", read on 2026-10-18):
//   Hong Kong, each side   CCASS 0.0042 %
//                          stamp 0.1 %, rounded up to the next Hong Kong
//                          dollar (the worked example on
//                          https://longbridge.com/hk/en/support/topics/hkmarket/rpop8q.md
//                          rounds 2.01 HKD to 3 HKD). An ETF pays no stamp.
//                          trading fee 0.00565 %, minimum 0.01 HKD
//                          SFC levy 0.0027 %, minimum 0.01 HKD
//                          AFRC levy 0.00015 %, minimum 0.01 HKD
//   United States          settlement 0.003 USD a share, at most 7 % of the
//                          order, each side, when the entity names it
//                          SEC 0.00206 % on the sale, minimum 0.01 USD
//                          TAF 0 USD
//                          CAT 0.000003 USD a share, minimum 0.01 USD, each side
// A Hong Kong line is priced in Hong Kong dollars whatever its trading
// currency, then brought back to that currency.

import { rowsNamed, warmListingIndex } from "./listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "./spreads/venues.mjs";
import { spreads } from "./spreads/book.mjs";
import { bookParts, plus, finite } from "./na.mjs";
import { usBookPerShare } from "./spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "./fx.mjs";

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
// The ledger names the offshore yuan CNH; the catalogue writes CNY.
const cashOf = (currency) => {
  const c = listingCash(currency);
  return c === "CNY" ? "CNH" : c;
};

export const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

export function ceilDollar(amount) {
  return Math.ceil(amount - 1e-6);
}

// Amount in `from` expressed in `to`, at the fx table.
export function convert(amount, from, to) {
  if (cashOf(from) === cashOf(to)) return amount;
  const a = usdPer(from);
  const b = usdPer(to);
  return a == null || b == null ? null : (amount * a) / b;
}

export function marketOf(listing) {
  const mic = listing.mic;
  if (mic === "XHKG") return "HK";
  if (US_MICS.has(mic)) return "US";
  if (mic === "XSES") return "SG";
  if (mic === "XSHG" || mic === "XSHE") return "CN";
  const place = loose(listing.brokerExchange);
  if (place === "HKEX") return "HK";
  if (/^(NYSE|NASDAQ|AMEX)/.test(place)) return "US";
  if (place === "SGX") return "SG";
  if (place === "SSE" || place === "SZSE") return "CN";
  return "";
}

// Hong Kong, one side, in HKD. `r` is the entity's own line: commission
// rate and minimum, platform fee per order, GST on those two.
export function hkSide(notionalHkd, etf, r) {
  const commission = Math.max(r.min, notionalHkd * r.rate);
  const broker = (commission + r.platform) * (1 + (r.gst || 0));
  const levy =
    notionalHkd * 0.000042 +
    (etf ? 0 : ceilDollar(notionalHkd * 0.001)) +
    Math.max(0.01, notionalHkd * 0.0000565) +
    Math.max(0.01, notionalHkd * 0.000027) +
    Math.max(0.01, notionalHkd * 0.0000015);
  return { broker, levy };
}

// United States, the round trip, in USD. A cap below the minimum gives
// way to the minimum, as the Long Bridge HK page says.
export function usTrip(shares, notional, r) {
  const capped = (perShare, min, cap) => {
    let fee = shares * perShare;
    if (cap != null) fee = Math.min(fee, notional * cap);
    return Math.max(min, fee);
  };
  const commission = r.perShare ? capped(r.perShare, r.min, r.cap) : 0;
  const platform = r.platformPerShare ? capped(r.platformPerShare, r.platformMin, r.platformCap) : 0;
  const side = (commission + platform) * (1 + (r.gst || 0));
  const settlement = r.settlement ? Math.min(shares * 0.003, notional * 0.07) * 2 : 0;
  const sec = Math.max(0.01, notional * 0.0000206);
  const cat = Math.max(0.01, shares * 0.000003) * 2;
  return { broker: side * 2, levy: settlement + sec + cat };
}

// Singapore, one side, in the listing currency. Minimums are SGD and are
// brought to the listing currency. GST applies to every line of the table.
// `instruction` is a flat SGX clearing-instruction fee in SGD, when the
// entity's table prints one.
export function sgSide(notional, currency, moneyMarket, r) {
  const min = convert(r.min, "SGD", currency);
  const platformMin = convert(r.platformMin || 0, "SGD", currency);
  const instruction = convert(r.instruction || 0, "SGD", currency);
  if (min == null || platformMin == null || instruction == null) return null;
  const vat = 1 + (r.gst || 0);
  const broker = (Math.max(min, notional * r.rate) + Math.max(platformMin, notional * (r.platformRate || 0))) * vat;
  const levy = (notional * (0.000075 + (moneyMarket ? 0.00001 : 0.000325)) + instruction) * vat;
  return { broker, levy };
}

function findListing(rows, { etf, place, currency }) {
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
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency || cashOf(m.row.currency) === cashOf(wantCurrency));
  return { named, matches };
}

// entity = {
//   folder, label, page, pages: { HK, US, SG, CN }, cash: [...],
//   rates: { HK?, US?, SG? }, basis: { HK?, US?, SG? },
//   missing: { market: why }, remark(market) → string,
// }
export function makeRoundTrip(entity, catalogueUrl) {
  const catalogue = fs.existsSync(catalogueUrl) ? JSON.parse(fs.readFileSync(catalogueUrl, "utf8")) : null;
  const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
  if (rows.length) warmListingIndex(rows);
  const cashList = entity.cash.join(", ");

  return function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
    const answer = {
      usd: null,
      brokerFees: null,
      ccy: QUOTE,
      etf,
      place,
      currency,
      onlineBuy: true,
      cashCurrency: "",
      url: entity.page,
      remark: "",
    };
    if (!catalogue) {
      return { ...answer, why: `le catalogue ${entity.folder} n'existe pas encore : lancer \`node brokers/${entity.folder}/${entity.folder}_scraping.mjs\`` };
    }
    const { named, matches } = findListing(rows, { etf, place, currency });
    if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${entity.folder}` };
    if (!matches.length) {
      return {
        ...answer,
        why: `${etf} n'est pas coté sur cette place dans cette devise chez ${entity.label}`,
        alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
      };
    }

    const m = matches[0];
    const book = spreadLeaf(spreads, {
      isin: m.row.isin,
      mic: m.venue?.mic ?? null,
      currency: m.row.currency,
      unsourced: m.unsourced,
      broker: entity.folder,
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
    const market = marketOf(listing);
    const cash = cashOf(listing.currency);
    const shared = {
      ...answer,
      listing,
      cashCurrency: entity.cash.includes(cash) ? cash : "",
      url: entity.pages[market] || entity.page,
      remark: entity.remark ? entity.remark(market) : "",
      fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    };
    if (!market || !entity.rates[market]) {
      return { ...shared, why: entity.missing?.[market] || `${listing.brokerExchange} n'a pas de ligne dans le barème de ${entity.label}` };
    }
    if (!entity.cash.includes(cash)) {
      return {
        ...shared,
        why: `la ligne est en ${listing.currency} : le compte tient ${cashList} et la conversion de l'application ne propose que ces devises`,
      };
    }

    const basis = entity.basis[market];
    const n = Number(shares);
    const p = Number(price);
    if (!(n > 0)) return { ...shared, basis, why: "aucun nombre de parts" };
    if (!(p > 0)) return { ...shared, basis, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

    const notional = n * p;
    const notionalUsd = dollars(notional, listing.currency);
    const etfLike = listing.type === "ETF";
    let brokerLocal = null;
    let levyLocal = null;
    if (market === "HK") {
      const notionalHkd = convert(notional, listing.currency, "HKD");
      if (notionalHkd != null) {
        const side = hkSide(notionalHkd, etfLike, entity.rates.HK);
        brokerLocal = convert(side.broker * 2, "HKD", listing.currency);
        levyLocal = convert(side.levy * 2, "HKD", listing.currency);
      }
    } else if (market === "US") {
      const trip = usTrip(n, notional, entity.rates.US);
      brokerLocal = trip.broker;
      levyLocal = trip.levy;
    } else if (market === "SG") {
      const side = sgSide(notional, listing.currency, /money market/i.test(listing.name || ""), entity.rates.SG);
      if (side) {
        brokerLocal = side.broker * 2;
        levyLocal = side.levy * 2;
      }
    }
    if (brokerLocal == null || levyLocal == null) {
      return { ...shared, basis, why: `pas de cours de change pour ${listing.currency}` };
    }

    brokerLocal = Number(brokerLocal.toPrecision(12));
    levyLocal = Number(levyLocal.toPrecision(12));
    const brokerFees = dollars(brokerLocal, listing.currency);
    const levyUsd = dollars(levyLocal, listing.currency);
    const marketBp = bp ?? book.leaf?.bp ?? null;
    let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
    if (market === "US") {
      const quoted = usBookPerShare({ broker: entity.folder, ticker: listing.ticker, fallback: marketPerShare });
      if (quoted != null) marketPerShare = quoted;
    }
    const parts = bookParts({
      bp: marketBp,
      perShare: marketPerShare,
      venue: market === "US" && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
      unsourced: m.unsourced,
      toUsd: (amount) => dollars(amount, listing.currency),
    });
    const bookUsd =
      parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
    const usd = plus(bookUsd, brokerFees, levyUsd);

    return {
      ...shared,
      basis,
      usd: finite(usd, 6),
      brokerFees: finite(brokerFees, 6),
      bp: marketBp,
      perShare: marketPerShare,
      ...(bookUsd == null
        ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
        : {}),
      trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
      commission: { buy: brokerLocal / 2, sell: brokerLocal / 2, currency: listing.currency },
      levy: { amount: levyLocal, currency: listing.currency },
    };
  };
}

export function printCli(callerUrl, roundTrip) {
  let called = false;
  try {
    called = callerUrl === pathToFileURL(process.argv[1]).href;
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
    shares: Number(arg("shares", "10")),
    price: Number(arg("price", "0")),
  }), null, 2));
}
