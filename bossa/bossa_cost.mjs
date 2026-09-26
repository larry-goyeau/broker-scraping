// What one round trip costs at DM BOŚ: buy n shares at price p, sell
// them back at once (internet, regular hours), in dollars.
//
// Foreign cash market, table in force from 10 July 2026. Internet orders,
// shares and ETP alike, 0.29 % of the order each way. The floor depends
// on the venue and is quoted in the four wallets they keep:
//   NYSE, NASDAQ, NYSE American, LSE, Xetra   4 € / 4 $ / 4 £ / 14 zł
//   Euronext Paris, Brussels, Amsterdam       5 € / 5 $ / 5 £ / 19 zł
//   SIX                                        18 € / 20 $ / 16 £ / 76 zł
//   Toronto                                    36 € / 40 $ / 32 £ / 152 zł
// A same-day reversing trade is the same 0.29 % on those venues.
// Phone and branch orders add an offline fee that is not in this number.
//
// Warsaw is the domestic table on the fees page, not that PDF.
//   shares                 0.38 % min 5 zł, or 0.15 % min 5 zł when the
//                          position is closed the same day (this trip)
//   ETF, ETC, ETN, ETP     0.25 % min 5 zł, promotion through 2026-12-30
//   Beta ETF TBSP and
//   Beta ETF Obligacji 6M  0.10 % min 3 zł, same promotion
// The rate after that date is not printed, so a later run says so.
//
// Wallets named on every line of the foreign table: PLN, EUR, USD, GBP.
// GBX settles in GBP. Anything else is converted. A conversion is a flat
// 49 zł / 11 € / 11 $ / 9 £, taken in the currency being exchanged, each
// time. It stays out of the number while the listing currency is one of
// the four, and is charged twice (out and back) when it is not.
//
// Stamp, Irish stamp, French FTT and PTM are the levies the foreign
// table names. The ISIN map supplies the rate when it has the line.
// SEC on a US sale is 0.00206 %, from the same table. TAF is not named.
// IKE and IKZE pay 0 % on ETF, ETP, ETN and ETC through February 2027.
// That account is not this number.
//
//   https://bossa.pl/oferta/oplaty-i-prowizje
//   https://bossa.pl/oferta/rynek-zagraniczny/oplaty-i-dokumenty
//   https://online.bossa.pl/bossa/pdfdocument?name=APXPDF103
//
//   node bossa/bossa_cost.mjs PLPKO0000016 GPW PLN --shares=10 --price=50
//   node bossa/bossa_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { QUOTE, toUsd, listingCash } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("bossa-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  domestic: "https://bossa.pl/oferta/oplaty-i-prowizje",
  foreign: "https://bossa.pl/oferta/rynek-zagraniczny/oplaty-i-dokumenty",
  table: "https://online.bossa.pl/bossa/pdfdocument?name=APXPDF103",
  readOn: "2026-09-25",
  tableOn: "2026-07-10",
  gpwPromoUntil: "2026-12-30",
};

const FOREIGN_RATE = 0.0029;
const GPW_DAY = 0.0015;
const GPW_FUND = 0.0025;
const GPW_BETA = 0.001;
const GPW_MIN = 5;
const GPW_BETA_MIN = 3;
const SEC_RATE = 0.0000206;
const UK_STAMP = 0.005;
const IE_STAMP = 0.01;
const PTM_GBP = 1.5;
const PTM_ABOVE_GBP = 10000;
const HOLD = new Set(["PLN", "EUR", "USD", "GBP"]);
const FX_FLAT = { PLN: 49, EUR: 11, USD: 11, GBP: 9 };

// Floor of one internet order, in each wallet. PLN is the published złoty
// figure, already the NBP rounding of the euro floor.
const FLOOR = {
  us: { EUR: 4, USD: 4, GBP: 4, PLN: 14 },
  euronext: { EUR: 5, USD: 5, GBP: 5, PLN: 19 },
  ch: { EUR: 18, USD: 20, GBP: 16, PLN: 76 },
  ca: { EUR: 36, USD: 40, GBP: 32, PLN: 152 },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function feeMarketOf(exchange) {
  const ex = code(exchange);
  if (ex === "GPW") return "gpw";
  if (ex === "NASDAQ" || ex === "NYSE" || ex === "AMEX") return "us";
  if (ex === "LSE") return "uk";
  if (ex === "XETR") return "de";
  if (ex === "EURONEXT") return "euronext";
  if (ex === "SIX") return "ch";
  if (ex === "TSX") return "ca";
  return "";
}

function floorMarket(market) {
  if (market === "us" || market === "uk" || market === "de") return "us";
  if (market === "euronext") return "euronext";
  if (market === "ch") return "ch";
  if (market === "ca") return "ca";
  return "";
}

function isFund(type) {
  return type === "ETF" || type === "ETC" || type === "ETN" || type === "ETP";
}

function betaFund(row) {
  const name = String(row?.name || "");
  const ticker = code(row?.ticker);
  return /beta etf tbsp/i.test(name) || /obligacji 6\s*m/i.test(name) || ticker === "ETFBCASH";
}

function gpwRule(row) {
  const today = new Date().toISOString().slice(0, 10);
  if (today > SCHEDULE.gpwPromoUntil && (isFund(code(row?.type)) || betaFund(row))) return null;
  if (betaFund(row)) return { rate: GPW_BETA, min: GPW_BETA_MIN, label: "0.10 % min 3 zł" };
  if (isFund(code(row?.type))) return { rate: GPW_FUND, min: GPW_MIN, label: "0.25 % min 5 zł" };
  if (code(row?.type) === "STOCK") return { rate: GPW_DAY, min: GPW_MIN, label: "0.15 % min 5 zł" };
  return null;
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
      if (wantVenue && ["XPAR", "XAMS", "XBRU", "XLIS"].includes(wantVenue.mic) && code(m.row.exchange) === "EURONEXT") return true;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function sideUsd(notional, listingCcy, rate, minAmount, minCcy) {
  const raw = dollars(notional * rate, listingCcy);
  const floor = dollars(minAmount, minCcy);
  if (raw == null || floor == null) return null;
  return Math.max(raw, floor);
}

function ptmEach(listing, notional) {
  if (code(listing.type) !== "STOCK" || feeMarketOf(listing.brokerExchange) !== "uk") return 0;
  const gbp = dollars(notional, listing.currency);
  const line = dollars(PTM_ABOVE_GBP, "GBP");
  if (gbp == null || line == null) return null;
  return gbp > line ? dollars(PTM_GBP, "GBP") : 0;
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
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Bossa n'existe pas encore : lancer `node bossa/bossa_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Bossa` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Bossa`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
  });
  const listing = {
    isin: code(m.row.isin),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type),
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const market = feeMarketOf(listing.brokerExchange);
  const cash = listingCash(listing.currency);
  const held = HOLD.has(cash);
  const pay = held ? cash : "PLN";
  const n = Number(shares);
  const p = Number(price);

  let rate = null;
  let min = null;
  let label = "";
  if (market === "gpw") {
    const rule = gpwRule(m.row);
    if (!rule) {
      return {
        ...answer,
        listing,
        cashCurrency: pay,
        why: `la promotion GPW sur les ETF s'arrête le ${SCHEDULE.gpwPromoUntil} et le tarif d'après n'est pas publié`,
      };
    }
    rate = rule.rate;
    min = rule.min;
    label = rule.label;
  } else {
    const band = floorMarket(market);
    const floors = FLOOR[band];
    if (!floors) {
      return { ...answer, listing, why: `${listing.brokerExchange || listing.exchange} n'a pas de palier dans la table étrangère` };
    }
    rate = FOREIGN_RATE;
    min = floors[pay];
    label = `0.29 % min ${min} ${pay}`;
  }

  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  let taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  if (!tax.known && listing.type === "STOCK") {
    const prefix = listing.isin.slice(0, 2);
    if (market === "uk" && prefix === "GB") taxPct += UK_STAMP;
    if (market === "uk" && prefix === "IE") taxPct += IE_STAMP;
  }

  const remark = [
    held ? `FX ${FX_FLAT.PLN} PLN / ${FX_FLAT.EUR} EUR / ${FX_FLAT.USD} USD / ${FX_FLAT.GBP} GBP if cash ≠ ${cash}.` : "",
    isFund(listing.type) ? "IKE and IKZE: 0 % on ETF, ETP, ETN and ETC through February 2027." : "",
  ]
    .filter(Boolean)
    .join(" ");

  const shared = {
    ...answer,
    listing,
    cashCurrency: pay,
    url: market === "gpw" ? SCHEDULE.domestic : SCHEDULE.table,
    remark,
  };
  const basis =
    market === "gpw"
      ? `barème GPW, page relue le ${SCHEDULE.readOn} : ${label} par ordre. Clôture dans la séance pour une action.`
      : `table étrangère du ${SCHEDULE.tableOn}, relue le ${SCHEDULE.readOn}, internet : ${label} par ordre`;

  if (!(n > 0) || !(p > 0)) {
    return { ...shared, basis, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const one = sideUsd(notional, listing.currency, rate, min, pay);
  const brokerCommission = plus(one, one);
  const fxUsd = held ? 0 : plus(dollars(FX_FLAT.PLN, "PLN"), dollars(FX_FLAT.PLN, "PLN"));
  const brokerFees = plus(brokerCommission, fxUsd);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const secUsd = market === "us" && notionalUsd != null ? notionalUsd * SEC_RATE : market === "us" ? null : 0;
  const ptm = ptmEach(listing, notional);
  const ptmUsd = ptm == null ? null : plus(ptm, ptm);
  const usd = plus(bookUsd, brokerFees, taxUsd, secUsd, ptmUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    basis,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de source de spread"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate, min, currency: pay, eachWay: true },
  };
}

function arg(flag, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return hit ? hit.slice(flag.length + 3) : fallback;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: Number(arg("shares", "10")),
    price: Number(arg("price", "0")),
  });
  console.log(JSON.stringify(out, null, 2));
}
