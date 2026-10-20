// Cash round trip on HOSE, HNX or UPCOM: buy the shares, sell them back,
// in dollars. Each broker file passes the rate its own fee sheet (biểu
// phí giao dịch) prints for a share, a fund certificate or an ETF. This
// file only adds that rate up, on both legs, plus the 0.1% personal
// income tax the broker withholds on every sale, gain or loss.
//
// A tiered sheet keys the rate on the day's matched value per account.
// The buy and the sell cannot settle the same day (T+2), so each leg is
// its own day and its own value: the rate is read at this one order's
// value. Warrants, bonds and derivatives have their own lines and are
// not priced here. The account holds dong only, so there is no FX leg.
//
// brokerFees is the commission on both legs plus the sale tax, the way
// brokers/vndirect and brokers/vietcap count it. The book is read from
// spreads/ as in those files: HOSE, HNX and UPCOM on the BSC board
// (spreads/vn-touch.mjs). A missing book stays missing.

import { rowsNamed, warmListingIndex } from "./listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "./spreads/venues.mjs";
import { spreads } from "./spreads/book.mjs";
import { bookParts, plus, finite } from "./na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "./fx.mjs";

// Personal income tax on a sale of securities: 0.1% of each sale price.
export const SALE_TAX = 0.001;
export const MILLION = 1_000_000;
export const BILLION = 1_000_000_000;

const PLACES = new Set(["HOSE", "HNX", "UPCOM"]);

export function pct(text) {
  return Number((Number(text) / 100).toPrecision(12));
}

// French percent, "0,15 %".
export function frPct(rate) {
  const v = Math.round(rate * 100 * 10000) / 10000;
  return `${String(v).replace(".", ",")} %`;
}

// A flat rate, or steps read top-down: [limit, rate, "lt" | "le"], the
// last one with no limit. "lt" is "dưới" (under the limit), "le" is "đến"
// (up to and including it).
export function tiered(steps) {
  return (notional) => {
    for (const [limit, rate, cmp] of steps) {
      if (limit == null) return rate;
      if (cmp === "le" ? notional <= limit : notional < limit) return rate;
    }
    return null;
  };
}

// A fee in dong a share on each sale, with an optional floor and cap per
// transfer: the depository transfer some sheets charge on every sale.
export function perShareOnSale(dong, { min = 0, max = Infinity } = {}) {
  const fee = (shares) => Math.min(max, Math.max(min, dong * shares));
  fee.text = `${String(dong).replace(".", ",")} đ par action vendue` +
    (min > 0 ? `, au moins ${min.toLocaleString("fr-FR")} đ` : "") +
    (Number.isFinite(max) ? `, au plus ${max.toLocaleString("fr-FR")} đ` : "");
  return fee;
}

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const loaded = new Map();
function loadRows(catalogueUrl) {
  const key = String(catalogueUrl);
  if (loaded.has(key)) return loaded.get(key);
  let rows = null;
  if (fs.existsSync(catalogueUrl)) {
    const catalogue = JSON.parse(fs.readFileSync(catalogueUrl, "utf8"));
    rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
    if (rows.length) warmListingIndex(rows);
  }
  loaded.set(key, rows);
  return rows;
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
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

// schedule: { broker, folder, catalogueUrl, url, readOn, rate(notional),
// basis, remark, saleTax?, saleFee? }. `saleFee` is a perShareOnSale().
// `remark` is a string, or a function of the rate applied to this order. `basis` names the account and the sheet's
// steps in French; the rate applied to this order is added after it.
export function vietnamRoundTrip(schedule, query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const saleTax = schedule.saleTax ?? SALE_TAX;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "VND",
    url: schedule.url,
    remark: typeof schedule.remark === "function" ? "" : schedule.remark,
  };
  const rows = loadRows(schedule.catalogueUrl);
  if (!rows) {
    return {
      ...answer,
      why: `le catalogue ${schedule.broker} n'existe pas encore : lancer \`node brokers/${schedule.folder}/${schedule.folder}_scraping.mjs\``,
    };
  }
  const { named, matches } = findListing(rows, { etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${schedule.broker}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${schedule.broker}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: schedule.folder,
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
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const head = `livraison en ligne, ${schedule.basis ? `${schedule.basis}, ` : ""}barème relu le ${schedule.readOn}.`;
  const shared = {
    ...answer,
    listing,
    basis: head,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== "VND" || !PLACES.has(code(listing.brokerExchange))) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'est pas au barème cash HOSE/HNX/UPCOM` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const rate = schedule.rate(notional);
  if (rate == null) return { ...shared, why: `aucun taux publié pour ${notional} VND` };
  const notionalUsd = dollars(notional, listing.currency);
  const saleFee = schedule.saleFee ? schedule.saleFee(n) : 0;
  const ticket = notional * (rate + rate + saleTax) + saleFee;
  const brokerFees = dollars(ticket, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);

  return {
    ...shared,
    basis: `${head} Achat ${frPct(rate)}. Vente ${frPct(rate)}, plus ${frPct(saleTax)} d'impôt sur la cession${schedule.saleFee ? ` et ${schedule.saleFee.text} (${Math.round(saleFee).toLocaleString("fr-FR")} đ)` : ""}.`,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(typeof schedule.remark === "function" ? { remark: schedule.remark(rate) } : {}),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: rate, sell: Number((rate + saleTax).toPrecision(12)), currency: listing.currency },
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
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}
