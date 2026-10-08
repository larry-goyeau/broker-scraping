// What one round trip costs at DM BDM: buy n shares, sell them back, in
// dollars. The order is the internet column, "BDM onLine". The other
// column stays out.
//
// Fee table in force from 1 June 2025, read on 2026-10-06.
//   https://www.bdm.pl/files/bdm/dokumenty/Tabela_oplat_i_prowizji/ws_tabela_oplat_i_prowizji.pdf
//   https://www.bdm.pl/rynki-zagraniczne
//   https://www.bdm.pl/aktualnosci/nizsze-prowizje-etf-etc-etn-dm-bdm
//
//   Domestic share, right or other cash line
//     0.39 % of the fill, minimum 5.95 zł, or 2 EUR when the
//     order is in euro.
//   Domestic ETF, ETC, ETN
//     0.20 % of the fill. The line prints no minimum. The
//     exchange-fee notice sets that floor at 0 zł on the regulated
//     GPW market.
//   Foreign share, ETF, ETC, ETN
//     0.28 % of the fill, minimum 5 EUR, 5 USD or 5 GBP, or 25 zł
//     when the order is in zloty.
//
// Custody is 0.0029 % a month on a domestic name and 0.0125 % a month
// on a foreign name, and is not charged when the portfolio is 500,000 zł
// or less. It stays in the remark.
// Paying a foreign order in zloty adds 0.1 % plus half the Reuters
// spread, and only when cash is not the listing currency. That margin
// stays out of the total. Stamp comes from the tax map.
// The table names no SEC fee.
//
// A United States line is NYSE or Nasdaq. BDM does not name a US
// broker-dealer, so no Rule 606 mix is applied. The book is the quoted
// NBBO of the ticker.
//
//   node brokers/bdm/bdm_cost.mjs PLPKO0000016 GPW PLN --shares=10 --price=50
//   node brokers/bdm/bdm_cost.mjs AAPL NASDAQ USD --shares=10 --price=200
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("bdm-parsed.json", import.meta.url);
const PAGE = "https://www.bdm.pl/files/bdm/dokumenty/Tabela_oplat_i_prowizji/ws_tabela_oplat_i_prowizji.pdf";
const READ_ON = "2026-10-06";
const TARIFF_ON = "2025-06-01";

const DOMESTIC_SHARE = 0.0039;
const DOMESTIC_SHARE_MIN_PLN = 5.95;
const DOMESTIC_SHARE_MIN_EUR = 2;
const DOMESTIC_FUND = 0.002;
const FOREIGN = 0.0028;
const FOREIGN_MIN = 5;
const FOREIGN_MIN_PLN = 25;

function custodyRemark(exchange, currency) {
  const rate = domestic(exchange) ? "0.0029%" : "0.0125%";
  const fx = fxRemark("0.1", currency, "plus half the Reuters spread");
  return `Custody is ${rate} a month, and is not charged when the portfolio is 500,000 zł or less.\n${fx}`;
}

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function domestic(exchange) {
  const ex = loose(exchange);
  return ex === "GPW" || ex === "XWAR" || ex === "NEWCONNECT" || ex === "GLOBALCONNECT";
}

function american(exchange, currency) {
  const ex = loose(exchange);
  return currency === "USD" && (ex === "NYSE" || ex === "NASDAQ" || ex === "XNYS" || ex === "XNAS" || ex === "AMEX");
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

function scheduleOf(row) {
  const type = code(row.type);
  const fund = type === "ETF" || type === "ETC" || type === "ETN";
  if (domestic(row.exchange)) {
    if (fund) return { rate: DOMESTIC_FUND, min: 0, currency: code(row.currency), label: "ETF du pays, 0,20 %" };
    const currency = code(row.currency);
    return {
      rate: DOMESTIC_SHARE,
      min: currency === "EUR" ? DOMESTIC_SHARE_MIN_EUR : DOMESTIC_SHARE_MIN_PLN,
      currency,
      label: currency === "EUR" ? "action du pays, 0,39 % min 2 EUR" : "action du pays, 0,39 % min 5,95 zł",
    };
  }
  const currency = code(row.currency);
  const min = currency === "PLN" ? FOREIGN_MIN_PLN : currency === "USD" || currency === "EUR" || currency === "GBP" ? FOREIGN_MIN : null;
  return { rate: FOREIGN, min, currency, label: `étranger, 0,28 % min ${min == null ? "non imprimé" : min} ${currency}` };
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
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue BDM n'existe pas encore : lancer `node brokers/bdm/bdm_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BDM` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BDM`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "bdm",
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
  const schedule = scheduleOf(m.row);
  const usa = american(listing.brokerExchange, listing.currency);
  const quoted = usa ? usBookPerShare({ broker: "bdm", ticker: listing.ticker }) : null;
  const marketBp = bp ?? (usa ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? quoted ?? (usa ? null : book.leaf?.perShare ?? null);
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    remark: custodyRemark(m.row.exchange, listing.currency),
    basis: `table du ${TARIFF_ON}, relue le ${READ_ON}. ${schedule.label} par ordre`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  if (schedule.min == null) {
    return { ...shared, why: `la table n'imprime pas de minimum en ${listing.currency}` };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const one = dollars(Math.max(notional * schedule.rate, schedule.min), schedule.currency);
  const brokerFees = plus(one, one);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: usa && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: schedule.rate, min: schedule.min, currency: schedule.currency, eachWay: true },
    parts: { marché: finite(bookUsd, 6), courtage: finite(brokerFees, 6), taxes: finite(taxUsd, 6) },
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
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
