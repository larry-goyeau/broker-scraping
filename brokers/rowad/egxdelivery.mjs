// Cash round trip on the Egyptian Exchange for the TEA Computers e-trade
// brokers (Al Rowad today): buy n shares, sell
// them straight back, in dollars. Each broker file passes the execution
// commission its own site prints, or null with the page it checked when
// the rate is not published. This file adds the market's own lines on
// top, both legs, the way brokers/thndr/thndr_cost.mjs counts them.
//
// The market lines are the third-party card Thndr Securities Brokerage
// prints for every EGX order, "collected by government and market
// bodies, passed through at cost", re-read on 2026-10-18:
//   https://support.thndr.app/en/articles/638558-thndr-order-fees
//     EGX              0.01 % a side, cap EGP 5,000
//     MCDR             0.01 % a side, cap EGP 5,000
//     FRA              0.005 % a fill, min EGP 1, cap EGP 250
//     risk insurance   0.005 % a side, cap EGP 5,000
//     stamp (T0)       0.025 % a side; T1/T2 is 0.05 %
// They are the same for every member of the exchange, so they are not
// re-printed by these brokers. One fill is assumed, so FRA bites once a
// side. The trip is sold on another day, as delivery is elsewhere, so the
// T1/T2 stamp is used; the same-session saving is the remark, as a cut on
// the stamp itself: 0.05 % → 0.025 %, "Same day sell tax is 50% lower."
// (owner's rule, 2026-10-27).
//
// Every line is a pound line except Nile Sat (EGSA), which the EGX quotes
// in dollars. That line pays the same rates in dollars; the EGP floor and
// caps are converted at fx.mjs. The account holds the listing's cash, so
// there is no FX leg. MCDR custody (0.01 % a year) is not per trip and
// stays in the remark.
//
// brokerFees is the broker's commission on both legs only. usd adds the
// market lines and the book. The EGX book is read from spreads/ as in
// thndr; a missing book stays missing.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

export const MARKET_CARD = "https://support.thndr.app/en/articles/638558-thndr-order-fees";
export const MARKET_READ_ON = "2026-10-18";
export const EG_EXCHANGE = 0.0001;
export const EG_EXCHANGE_CAP = 5000;
export const EG_FRA = 0.00005;
export const EG_FRA_MIN = 1;
export const EG_FRA_CAP = 250;
export const EG_RISK = 0.00005;
export const EG_STAMP_T0 = 0.00025;
export const EG_STAMP_T1 = 0.0005;
export const EG_CUSTODY = 0.0001;

const CASH = new Set(["EGP", "USD"]);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// EGP floor and caps in the listing's currency.
function inListing(egp, currency) {
  if (currency === "EGP") return egp;
  const usd = toUsd(egp, "EGP");
  const per = usdPer(currency);
  return usd == null || !per ? null : usd / per;
}

// The market's lines on one side, in the listing's currency.
export function egyptMarket(notional, currency = "EGP") {
  if (!(Number(notional) > 0)) return null;
  const n = Number(notional);
  const cap = inListing(EG_EXCHANGE_CAP, currency);
  const fraMin = inListing(EG_FRA_MIN, currency);
  const fraCap = inListing(EG_FRA_CAP, currency);
  if (cap == null || fraMin == null || fraCap == null) return null;
  return {
    egx: clamp(n * EG_EXCHANGE, 0, cap),
    mcdr: clamp(n * EG_EXCHANGE, 0, cap),
    fra: clamp(n * EG_FRA, fraMin, fraCap),
    risk: clamp(n * EG_RISK, 0, cap),
    stamp: n * EG_STAMP_T1,
  };
}

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

const frPct = (rate) => `${String(Number((rate * 100).toPrecision(6))).replace(".", ",")} %`;

// schedule: { broker, folder, catalogueUrl, url, readOn, rate (a side,
// a fraction of the fill) or null, unpublished (why, when rate is null),
// basis, remark }.
export function egyptRoundTrip(schedule, query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const remark = [
    schedule.remark,
    `Same day sell tax is ${Math.round((100 * (EG_STAMP_T1 - EG_STAMP_T0)) / EG_STAMP_T1)}% lower.`,
    `MCDR custody ${Number((EG_CUSTODY * 100).toFixed(2))}% a year.`,
  ]
    .filter(Boolean)
    .join("\n");
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EGP",
    url: schedule.url,
    remark,
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
  const market =
    `EGX et MCDR ${frPct(EG_EXCHANGE)} chacun (plafond ${EG_EXCHANGE_CAP} EGP), FRA ${frPct(EG_FRA)} ` +
    `(min ${EG_FRA_MIN} EGP, max ${EG_FRA_CAP} EGP), assurance ${frPct(EG_RISK)}, timbre T1/T2 ${frPct(EG_STAMP_T1)}, ` +
    `chaque sens, carte tiers Thndr relue le ${MARKET_READ_ON}`;
  const head =
    schedule.rate == null
      ? `barème ${schedule.broker} non publié (page vue le ${schedule.readOn}). ${market}.`
      : `ordre en ligne, ${schedule.basis ? `${schedule.basis}, ` : ""}barème relu le ${schedule.readOn} : ` +
        `${frPct(schedule.rate)} chaque sens. ${market}.`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: CASH.has(listing.currency) ? listing.currency : "EGP",
    basis: head,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: schedule.url, market: MARKET_CARD },
  };
  if (!CASH.has(listing.currency) || !/^(EGX|CASE)$/.test(code(listing.brokerExchange))) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'est pas au barème EGX` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const egypt = egyptMarket(notional, listing.currency);
  const thirdEach = egypt == null ? null : egypt.egx + egypt.mcdr + egypt.fra + egypt.risk;
  const levies = egypt == null ? null : dollars((thirdEach + egypt.stamp) * 2, listing.currency);
  const trade = { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency };

  if (schedule.rate == null) {
    return {
      ...shared,
      why: schedule.unpublished,
      trade,
      egypt,
      parts: {
        marché: null,
        courtage: null,
        réglementaire: finite(egypt == null ? null : dollars(thirdEach * 2, listing.currency), 6),
        taxes: finite(egypt == null ? null : dollars(egypt.stamp * 2, listing.currency), 6),
      },
    };
  }

  const each = notional * schedule.rate;
  const brokerFees = dollars(each * 2, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levies);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade,
    commission: { rate: schedule.rate, each, buy: each, sell: each, currency: listing.currency, eachWay: true },
    egypt,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(dollars(thirdEach * 2, listing.currency), 6),
      taxes: finite(dollars(egypt.stamp * 2, listing.currency), 6),
    },
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
  console.log(
    JSON.stringify(
      roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }),
      null,
      2
    )
  );
}
