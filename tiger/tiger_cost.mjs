// What one round trip costs at Tiger Brokers: buy n shares at price p, sell
// them back at once, in dollars.
//
// The affine triple hid the US share floors, the 0.5 % caps, GST and the
// AU $2 / 200-share step. `roundTrip` is given the size and charges what
// is charged.
//
// Four companies, re-read 2026-09-17. Default is Tiger Brokers (Singapore)
// Pte Ltd (`--entity=sg`), which is also the catalogue's SGP token.
// `--entity=au` is Tiger Brokers (AU) Pty Ltd, `--entity=hk` Tiger Brokers
// (HK) Global Ltd, `--entity=nz` Tiger Fintech (NZ) Ltd. The four cards
// are not the same grid.
//
//   SG US     0.005 $/share comm (min 0.99, cap 0.5 %)
//             + 0.005 $/share platform (min 1, cap 0.5 %)
//             + 0.003 $/share settlement (cap 0.5 %)
//             + SEC / TAF / CAT ; GST 9 % on those lines
//   HK US     0.0049 $/share comm (min 0.99, cap 0.5 %)
//             + 0.005 $/share platform (min 1, cap 0.5 %)
//             + 0.003 $/share settlement (cap 7 %)
//             + SEC / TAF / CAT
//   AU US     $2 up to 200 shares, then $0.01 / extra share
//             + 0.003 $/share settlement (cap 7 %)
//             AU prints SEC and CAT at $0 ; TAF uses the current levy
//   NZ US     $2 up to 200 shares ; above, the lesser of $0.01 / share
//             and 1 % of value (min $2) + settlement / SEC / TAF / CAT
//
// HKEX, ASX, SGX and Stock Connect sit on the same cards with their own
// floors. HK's $0 commission + HKD 15 platform is the printed live
// schedule (standard 0.029 % stays in the remark). AU / NZ first-funding
// four free trades stay in the remark. Fractional under one share is not
// this trip (the page asks for ten).
//
// SEC / TAF use the current levies where the card names them. AU's US
// card prints SEC $0 and CAT $0 and those stay $0. Stamp / FTT from
// taxMap by ISIN sit on top of the published HK / China stamps only when
// taxMap has a different levy — HKEX and STA stamps come from the card.
//
// The account holds USD, HKD, SGD, AUD and CNH. FX stays out when the
// listing is already that cash. Funding a wallet is not per order.
//
// Tickets already in the number stay out of the remark.
//
//   https://www.itiger.com/sg/commissions/fees/stocks_etf
//   https://www.itiger.com/au/commissions/fees/stocks_etf
//   https://www.itiger.com/hk/commissions/fees/stocks_etf
//   https://www.itiger.com/nz/commissions/brokerage/stocks_etf
//
//   node tiger/tiger_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node tiger/tiger_cost.mjs AAPL NASDAQ USD --entity=au --shares=10 --price=230
//   node tiger/tiger_cost.mjs 700 HKEX HKD --shares=10 --price=400
//   node tiger/tiger_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("tiger-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  sg: "https://www.itiger.com/sg/commissions/fees/stocks_etf",
  au: "https://www.itiger.com/au/commissions/fees/stocks_etf",
  auUs: "https://www.itiger.com/au/invest/us-stocks",
  hk: "https://www.itiger.com/hk/commissions/fees/stocks_etf",
  nz: "https://www.itiger.com/nz/commissions/brokerage/stocks_etf",
  readOn: "2026-09-17",
  entities: {
    sg: "Tiger Brokers (Singapore) Pte Ltd",
    au: "Tiger Brokers (AU) Pty Limited",
    hk: "Tiger Brokers (HK) Global Limited",
    nz: "Tiger Fintech (NZ) Limited",
  },
};

const DEFAULT_ENTITY = "sg";
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const TAF_MIN = 0.01;
const CAT_NMS = 0.000003;
const CAT_OTC = 0.00000003;
const CENT = 0.01;
const GST = 0.09;
const US_SETTLE = 0.003;

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG", "OTCM"]);
const US_EX = /^(NASDAQ|NYSE|AMEX|ARCA|NYSEARCA|BATS|BZX|CBOE|IEX|OTC)$/;
const CHINA_EX = /^(SSE|SZSE|BSE|SH|SZ|BJ)$/;
const HOLD = new Set(["USD", "HKD", "SGD", "AUD", "CNY", "CNH", "NZD"]);

const ENTITY_ALIAS = {
  sg: "sg",
  sgp: "sg",
  singapore: "sg",
  tbsg: "sg",
  au: "au",
  aus: "au",
  australia: "au",
  tbau: "au",
  hk: "hk",
  hongkong: "hk",
  nz: "nz",
  newzealand: "nz",
  tfnz: "nz",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const up = (value) =>
  value == null || Number.isNaN(value) ? null : value > 0 ? Math.ceil(value / CENT - 1e-9) * CENT : 0;
const isCrypto = (row) => code(row?.type) === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const isEtf = (row) => /^(ETF|ETC|ETN|REIT)$/i.test(String(row?.type || ""));
const settleCcy = (ccy) => (code(ccy) === "CNH" ? "CNY" : code(ccy));

const dollars = (amount, currency) => {
  const v = toUsd(amount, settleCcy(currency));
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(settleCcy(currency)),
});

export function entityOf(name = DEFAULT_ENTITY) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return ENTITY_ALIAS[key] || ENTITY_ALIAS[key.slice(0, 2)] || null;
}

export function feeMarketOf(row, mic) {
  if (isCrypto(row)) return "crypto";
  const raw = code(row?.exchange);
  const m = code(mic);
  if (US_MICS.has(m) || US_EX.test(raw)) return raw === "OTC" || m === "OTCM" ? "otc" : "us";
  if (raw === "HKEX" || m === "XHKG") return "hk";
  if (raw === "ASX" || m === "XASX") return "asx";
  if (raw === "SGX" || m === "XSES") return "sgx";
  if (raw === "NZX" || m === "XNZE") return "nzx";
  if (CHINA_EX.test(raw) || m === "XSHG" || m === "XSHE" || m === "XBEI") return "cn";
  return null;
}

function perShareMinCap(shares, notional, perShare, min, capPct) {
  if (!(Number(shares) > 0) || !(Number(notional) > 0)) return null;
  const raw = Number(shares) * perShare;
  const cap = Number(notional) * capPct;
  return Math.max(min, Math.min(raw, cap));
}

function pctMin(notional, rate, min) {
  if (!(Number(notional) > 0)) return null;
  return Math.max(min, Number(notional) * rate);
}

function usPassThrough({ shares, notional, otc, sec, taf, cat, settleCap }) {
  const n = Number(shares);
  const amt = Number(notional);
  const settle = Math.min(n * US_SETTLE, amt * settleCap);
  const secUsd = sec ? Math.max(0.01, up(amt * SEC_RATE)) : 0;
  const tafRaw = taf ? Math.min(Math.max(up(n * TAF_PER_SHARE), TAF_MIN), TAF_CAP) : 0;
  const catUsd = cat ? n * (otc ? CAT_OTC : CAT_NMS) : 0;
  return { settle, sec: secUsd, taf: tafRaw, cat: catUsd };
}

export function usBroker(entity, { shares, notional }) {
  const n = Number(shares);
  const amt = Number(notional);
  if (!(n > 0) || !(amt > 0)) return null;
  if (entity === "sg") {
    return {
      comm: perShareMinCap(n, amt, 0.005, 0.99, 0.005),
      plat: perShareMinCap(n, amt, 0.005, 1, 0.005),
      currency: "USD",
    };
  }
  if (entity === "hk") {
    return {
      comm: perShareMinCap(n, amt, 0.0049, 0.99, 0.005),
      plat: perShareMinCap(n, amt, 0.005, 1, 0.005),
      currency: "USD",
    };
  }
  if (entity === "au") {
    const extra = n > 200 ? 0.01 * (n - 200) : 0;
    return { comm: 2 + extra, plat: 0, currency: "USD" };
  }
  if (entity === "nz") {
    if (n <= 200) return { comm: 2, plat: 0, currency: "USD" };
    const perShare = 0.01 * n;
    const pct = Math.max(2, 0.01 * amt);
    return { comm: Math.min(perShare, pct), plat: 0, currency: "USD" };
  }
  return null;
}

function hkBroker(entity, notional) {
  const amt = Number(notional);
  if (!(amt > 0)) return null;
  if (entity === "sg") {
    return { comm: pctMin(amt, 0.0003, 7), plat: pctMin(amt, 0.0003, 8), currency: "HKD" };
  }
  if (entity === "hk") return { comm: 0, plat: 15, currency: "HKD" };
  if (entity === "au" || entity === "nz") {
    return { comm: amt <= 25000 ? 15 : amt * 0.0006, plat: 0, currency: "HKD" };
  }
  return null;
}

function asxBroker(entity, notional) {
  const amt = Number(notional);
  if (!(amt > 0)) return null;
  if (entity === "sg") {
    return { comm: pctMin(amt, 0.0003, 2), plat: pctMin(amt, 0.0007, 6), currency: "AUD" };
  }
  if (entity === "au") {
    return { comm: amt <= 10000 ? 3 : amt * 0.0003, plat: 0, currency: "AUD" };
  }
  if (entity === "nz") {
    return { comm: amt <= 20000 ? 5 : amt * 0.00025, plat: 0, currency: "AUD" };
  }
  return null;
}

function sgxBroker(entity, notional) {
  const amt = Number(notional);
  if (!(amt > 0)) return null;
  if (entity === "sg") {
    return { comm: pctMin(amt, 0.0003, 0.99), plat: pctMin(amt, 0.0003, 1), currency: "SGD" };
  }
  if (entity === "nz") {
    return { comm: pctMin(amt, 0.0006, 3.5), plat: amt * 0.0006, currency: "SGD" };
  }
  return null;
}

function cnBroker(entity, notional) {
  const amt = Number(notional);
  if (!(amt > 0)) return null;
  if (entity === "sg" || entity === "nz" || entity === "hk") {
    return { comm: pctMin(amt, 0.0003, 7), plat: pctMin(amt, 0.0003, 8), currency: "CNH" };
  }
  if (entity === "au") {
    return { comm: amt <= 25000 ? 15 : amt * 0.0006, plat: 0, currency: "CNH" };
  }
  return null;
}

function hkPass(notional, { stamp }) {
  const amt = Number(notional);
  const trading = Math.max(0.01, amt * 0.0000565);
  const settle = amt * 0.000042;
  const levy = Math.max(0.01, amt * 0.000027);
  const afrc = amt * 0.0000015;
  const duty = stamp ? Math.max(1, Math.ceil(amt * 0.001 - 1e-9)) : 0;
  return { trading, settle, levy, afrc, stamp: duty };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const priced = named.filter((r) => feeMarketOf(r) != null);
  const pool = exactCode.length ? exactCode : priced.length ? priced : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r, book.mic ?? venue?.mic) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

function remarkOf(entity, market) {
  const lines = [];
  if (entity === "au" || entity === "nz") {
    lines.push("Four free US/ASX trades a month after first funding (new clients).");
  }
  if (entity === "hk" && market === "hk") {
    lines.push("HK commission 0 is a limited offer; standard is 0.029%.");
  }
  if (entity === "sg" && market === "sgx") {
    lines.push("SGX custody SGD 2/quarter, waived.");
  }
  return lines.join("\n");
}

function gstOn(entity, amount) {
  if (entity !== "sg" || amount == null) return amount;
  return amount * (1 + GST);
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight
 * back. `usd` is the number the page prints; `brokerFees` is only Tiger's
 * commission and platform (plus SG GST on those two).
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  amount = null,
  entity: entityName = DEFAULT_ENTITY,
  bp = null,
  perShare = null,
}) {
  const entity = entityOf(entityName) || DEFAULT_ENTITY;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    entity,
    onlineBuy: true,
    cashCurrency: "USD",
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Tiger n'existe pas encore : lancer `node tiger/tiger_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Tiger` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Tiger`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
  });
  const market = feeMarketOf(m.row, book.mic ?? m.venue?.mic);
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || "USD",
    brokerExchange: m.row.exchange || null,
  };

  const leaf = book.leaf;
  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = { ...taxRates(tax) };
  delete rates.PTM_LEVY;
  delete rates.PTM;
  // HKEX and STA stamps are on the Tiger card. taxMap would count them twice.
  if (market === "hk" || market === "cn") {
    for (const name of Object.keys(rates)) {
      if (/STAMP|FTT|DUTY/i.test(name)) delete rates[name];
    }
  }
  const taxPct = Object.values(rates).reduce((sum, rate) => sum + rate, 0);
  const cashCurrency = HOLD.has(listing.currency) ? listing.currency : "USD";

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency,
    remark: market ? remarkOf(entity, market) : "",
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE[entity],
    basis: `barème Tiger ${entity} ${market || "?"}, relu le ${SCHEDULE.readOn}`,
    tax,
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
  };

  if (!market) {
    return {
      ...shared,
      why: `pas de barème Tiger ${entity} pour ${m.row.exchange || "cette place"}`,
      confidence: confidenceOf({ entity, market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct }),
    };
  }

  if (notional == null) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({ entity, market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct }),
    };
  }

  const billed = bill(entity, market, { shares: n, notional, row: m.row });
  if (!billed) {
    return {
      ...shared,
      why: `pas de barème Tiger ${entity} pour ${market}`,
      confidence: confidenceOf({ entity, market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct }),
    };
  }

  const notionalUsd = dollars(notional, listing.currency);
  const bookUsd =
    marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const mapTaxUsd = notionalUsd == null ? 0 : notionalUsd * taxPct;
  const brokerFees = dollars(gstOn(entity, billed.broker), billed.ccy);
  const thirdUsd = dollars(gstOn(entity, billed.third), billed.ccy);
  const stampUsd = dollars(billed.stamp, billed.ccy);
  const usd = plus(bookUsd, brokerFees, thirdUsd, stampUsd, mapTaxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
            m.unsourced?.why || "pas de feuille de carnet"
          }`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      amount: null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    commission: {
      each: billed.broker,
      currency: billed.ccy,
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(thirdUsd, 6),
      taxes: finite(plus(stampUsd, mapTaxUsd), 6),
    },
    confidence: confidenceOf({
      entity,
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      n,
      notional,
      billed,
    }),
  };
}

function bill(entity, market, { shares, notional, row }) {
  const n = Number(shares);
  const amt = Number(notional);
  const otc = market === "otc";
  const us = market === "us" || otc;

  if (us) {
    const b = usBroker(entity, { shares: n, notional: amt });
    if (!b) return null;
    const pass = usPassThrough({
      shares: n,
      notional: amt,
      otc,
      sec: entity !== "au",
      taf: true,
      cat: entity !== "au",
      settleCap: entity === "sg" ? 0.005 : 0.07,
    });
    return {
      broker: (b.comm + b.plat) * 2,
      third: (pass.settle * 2 + pass.sec + pass.taf + pass.cat * 2),
      stamp: 0,
      ccy: "USD",
    };
  }

  if (market === "hk") {
    const b = hkBroker(entity, amt);
    if (!b) return null;
    const stamp = !isEtf(row);
    const pass = hkPass(amt, { stamp });
    return {
      broker: (b.comm + b.plat) * 2,
      third: (pass.trading + pass.settle + pass.levy + pass.afrc) * 2,
      stamp: pass.stamp * 2,
      ccy: "HKD",
    };
  }

  if (market === "asx") {
    const b = asxBroker(entity, amt);
    if (!b) return null;
    const settle = entity === "nz" ? amt * 0.0003 : 0;
    return {
      broker: (b.comm + b.plat) * 2,
      third: settle * 2,
      stamp: 0,
      ccy: "AUD",
    };
  }

  if (market === "sgx") {
    const b = sgxBroker(entity, amt);
    if (!b) return null;
    return {
      broker: (b.comm + b.plat) * 2,
      third: amt * (0.000075 + 0.000325) * 2,
      stamp: 0,
      ccy: "SGD",
    };
  }

  if (market === "cn") {
    const b = cnBroker(entity, amt);
    if (!b) return null;
    const etf = isEtf(row);
    const handling = amt * (etf ? 0.00004 : 0.0000341);
    const manage = etf ? 0 : amt * 0.00002;
    const settle = amt * (etf ? 0.00002 : 0.00003);
    const stamp = etf ? 0 : amt * 0.0005;
    return {
      broker: (b.comm + b.plat) * 2,
      third: (handling + manage + settle) * 2,
      stamp,
      ccy: "CNH",
    };
  }

  if (market === "nzx") {
    if (entity !== "nz") return null;
    return {
      broker: (pctMin(amt, 0.001, 2) + pctMin(amt, 0.002, 2)) * 2,
      third: 0,
      stamp: 0,
      ccy: "NZD",
    };
  }

  return null;
}

function confidenceOf({
  entity,
  market,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  billed,
}) {
  const said = [];
  said.push(
    `barème ${SCHEDULE.entities[entity] || entity}, marché ${market || "?"}, relu le ${SCHEDULE.readOn}`
  );
  if (entity === "sg") said.push(`TPS singapourienne ${100 * GST} % sur commission, plateforme et tiers nommés`);
  if (entity === "au" && (market === "us" || market === "otc")) {
    said.push(`SEC et CAT imprimés 0 $ sur la carte AU ; TAF au taux courant`);
  }
  if (billed) {
    said.push(`ticket ${Number(billed.broker.toPrecision(4))} ${billed.ccy} l'aller-retour (courtage)`);
  }
  if (taxPct) said.push(`taxe de transfert ${(100 * taxPct).toFixed(2)} % prise dans taxMap.mjs`);
  if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part`);
  else if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${
        unsourced?.why || "pas de source"
      }`
    );
  }
  if (!leaf) said.push(`carnet absent pour cette ligne`);
  said.push(
    `compte multi-devises, la ligne est déjà en ${listing.currency}, pas de change. ` +
      `Aucun aller-retour réel dans ce dépôt`
  );
  return said.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          gst: GST,
          sec: SEC_RATE,
          taf: { perShare: TAF_PER_SHARE, cap: TAF_CAP, min: TAF_MIN },
          cat: { nms: CAT_NMS, otc: CAT_OTC },
          coverage: coverage(),
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node tiger/tiger_cost.mjs <ticker|ISIN> [place] [devise] [--entity=sg|au|hk|nz] [--shares=n] [--price=p]\n" +
        "        node tiger/tiger_cost.mjs --schedule\n" +
        "  ex.   node tiger/tiger_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node tiger/tiger_cost.mjs AAPL NASDAQ USD --entity=au --shares=10 --price=230"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    entity: flag("entity") || DEFAULT_ENTITY,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que Tiger propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.entity}/${out.feeMarket}]\n`
  );

  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n"
    );
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.réglementaire) console.log(`  réglementaire  : ${parts.réglementaire} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
