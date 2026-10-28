// What one round trip costs at MCB Securities Ltd, the MCB group's
// investment dealer: buy n shares (or ETF units) on the SEM's Official
// Market or DEM, ordered online through mySEM (the SEM's app, which routes
// to the client's dealer), and sell them straight back, in dollars. The CDS
// settles each trade in the security's currency (MUR, USD, EUR or GBP),
// debited from the client's MCB account in that currency (deposits.mjs).
//
// MCB Securities trades every security listed on the SEM ("stocks, bonds,
// ETFs and other securities listed on the SEM") and its Rate Card 2025 is
// the SEM schedule "As per SEM regulations", with no minimum on equities:
//   https://www.mcbcapitalmarkets.mu/services/brokerage-investments
//   https://mcbcapitalmarkets.mu/docs/mcbcapitalmarketlibraries/brokerage-investment/common/rates-fees.pdf
// The SEM schedule, read on 2026-10-19,
// https://stockexchangeofmauritius.com/regulations-governance/transaction-fees
// "The brokerage fee claimed by an investment dealer to its client",
// equity securities, as a share of the transaction value,
// apportioned among the dealer, the SEM, the FSC and the CDS:
//   Value of the transaction (Rs)   Dealer   SEM    FSC    CDS    Total
//   not exceeding 3 million         0.75%    0.25%  0.05%  0.20%  1.25%
//   3 to 6 million                  0.70%    0.25%  0.05%  0.15%  1.15%
//   6 to 10 million                 0.60%    0.25%  0.05%  0.15%  1.05%
//   more than 10 million            0.50%    0.25%  0.05%  0.10%  0.90%
// Each buy and each sell is a transaction. The band is read on the whole
// value, which then pays that one rate. The bands are in rupees, so a USD,
// EUR or GBP line is put into rupees to find its band. The page prints no
// minimum. ETFs have their own lines: a foreign underlying that is not
// debt (NEWGOLD) 0.35 % (dealer 0.21, SEM 0.07, FSC 0.014, CDS 0.056); a
// debt underlying (ADBF) 0.10 %, or Rs 75 flat below Rs 75,000.
// A sale before the first trade settles is a "turnaround trade": 0.15 %
// (Rs 75 flat below Rs 50,000) instead. That is the same-day remark, as a
// cut of the sale's fee (1.25 % → 0.15 %: 88 % lower), not the total.
//
// Left out: no account, custody or app fee is printed. The rupee amounts
// are in `parts`. The SEM book is not stored, so the total stays unknown
// until it is.
//
//   node brokers/mcbsecurities/mcbsecurities_cost.mjs MCBG.N0000 XMAU MUR --shares=100 --price=480
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("mcbsecurities-parsed.json", import.meta.url);
const PAGE = "https://stockexchangeofmauritius.com/regulations-governance/transaction-fees";
const READ_ON = "2026-10-19";
const BASE = "MUR";
// Upper bound of the band in rupees (inclusive), then each share of it.
const BANDS = [
  { upTo: 3e6, dealer: 0.0075, sem: 0.0025, fsc: 0.0005, cds: 0.002 },
  { upTo: 6e6, dealer: 0.007, sem: 0.0025, fsc: 0.0005, cds: 0.0015 },
  { upTo: 10e6, dealer: 0.006, sem: 0.0025, fsc: 0.0005, cds: 0.0015 },
  { upTo: Infinity, dealer: 0.005, sem: 0.0025, fsc: 0.0005, cds: 0.001 },
];
const REMARK = "";
// FX: the CDS settles in the security's currency and never converts it, so
// cash held in another deposit currency is changed against rupees by the
// dealer's bank. MCB Securities, the dealer of the largest bank, is taken:
// MCB's telegraphic-transfer buy and sell rates, rupees for one unit, on
// the Bank of Mauritius indicative board of 19 October 2026,
// https://www.bom.mu/markets/foreign-exchange/indicative-exchange-rate
// (SBM, AfrAsia and Absa print the same spread to 0.02 %). The remark is
// one way against the mid: (sell - buy) / (sell + buy). A trade between two
// foreign currencies goes through rupees and pays it twice.
const BOARD = {
  USD: [46.56, 47.95],
  EUR: [52.31, 53.85],
  GBP: [62.06, 63.9],
};
const halfSpread = (ccy) => {
  const pair = BOARD[ccy];
  return pair ? ((pair[1] - pair[0]) / (pair[1] + pair[0])) * 100 : null;
};
// A rupee line converts from whichever foreign cash is held; a foreign
// line converts from rupees.
function fxNote(ccy) {
  if (!depositHas("mcbsecurities", null, ccy)) return "";
  if (ccy === BASE) {
    const gaps = Object.keys(BOARD).map(halfSpread).filter((g) => g != null);
    const lo = Math.min(...gaps).toFixed(2);
    const hi = Math.max(...gaps).toFixed(2);
    return fxRemark(lo === hi ? lo : `${Number(lo)}% to ${Number(hi)}`, ccy);
  }
  const gap = halfSpread(ccy);
  return fxRemark(gap == null ? "" : gap.toFixed(2), ccy);
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
const pct = (x) => `${Number((x * 100).toFixed(4))} %`.replace(".", ",");

/** The rupee value of an amount: itself for MUR, else through the dollar. */
function rupees(amount, currency) {
  if (currency === BASE) return amount;
  const usd = toUsd(amount, currency);
  const perMur = usdPer(BASE);
  return usd == null || perMur == null ? null : usd / perMur;
}

const bandOf = (rs) => (rs == null ? null : BANDS.find((b) => rs <= b.upTo));

// ETFs: a debt underlying pays the debt line, any other the 0.35 % line.
const DEBT_ETF = new Set(["ADBF"]);
const ETF_OTHER = { dealer: 0.0021, sem: 0.0007, fsc: 0.00014, cds: 0.00056 };
const ETF_DEBT = { dealer: 0.000725, sem: 0.000125, fsc: 0.000025, cds: 0.000125 };
const ETF_DEBT_FLAT = { below: 75000, dealer: 55, sem: 9, fsc: 2, cds: 9 };
// Turnaround (sale before settlement): 0.15 %, or Rs 75 below Rs 50,000.
const TURNAROUND = { rate: 0.0015, below: 50000, flat: 75 };

/** Shares of the transaction value for this line and size, or null. */
function scheduleOf(listing, rs) {
  if (rs == null) return null;
  if (listing.type !== "ETF") return bandOf(rs);
  if (!DEBT_ETF.has(code(listing.ticker))) return ETF_OTHER;
  if (rs >= ETF_DEBT_FLAT.below) return ETF_DEBT;
  const f = ETF_DEBT_FLAT;
  return { dealer: f.dealer / rs, sem: f.sem / rs, fsc: f.fsc / rs, cds: f.cds / rs };
}

/** "Same day sell fees are x% lower.", x = the cut of the one-side rate, at this size. */
function turnaroundNote(rate, rs) {
  if (rate == null || rs == null || !(rs > 0)) return "";
  const t = rs < TURNAROUND.below ? TURNAROUND.flat / rs : TURNAROUND.rate;
  const x = (100 * (rate - t)) / rate;
  const gap = x >= 10 ? Math.round(x) : Math.round(x * 10) / 10;
  return gap > 0 ? `Same day sell fees are ${gap}% lower.` : "";
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

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: BASE,
    url: PAGE,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue MCB Securities n'existe pas encore : lancer `node brokers/mcbsecurities/mcbsecurities_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue MCB Securities` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez MCB Securities`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "mcbsecurities",
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
  const cash = depositHas("mcbsecurities", null, listing.currency) ? listing.currency : BASE;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const fx = fxNote(listing.currency);
  const baseRemark = [REMARK, m.row.remark].filter(Boolean).join(" ");
  const remark = [baseRemark, fx].filter(Boolean).join("\n");
  const shared = {
    ...answer,
    cashCurrency: cash,
    remark,
    listing,
    basis:
      `Rate Card 2025 de MCB Securities, soit le barème des courtiers publié par la SEM, relu le ${READ_ON}. ` +
      (listing.type === "ETF"
        ? DEBT_ETF.has(code(listing.ticker))
          ? `ETF à sous-jacent obligataire : 0,10 %, ou 75 Rs fixes sous 75 000 Rs, chaque sens.`
          : `ETF à sous-jacent étranger non obligataire : 0,35 % (courtier, SEM, FSC et CDS compris), chaque sens.`
        : `Actions : 1,25 % jusqu'à 3 M Rs, 1,15 % jusqu'à 6 M, 1,05 % jusqu'à 10 M, 0,90 % au-delà (courtier, SEM, FSC et CDS compris), chaque sens.`),
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), mur: usdPer(BASE) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const notionalMur = rupees(notional, listing.currency);
  const band = scheduleOf(listing, notionalMur);
  const dealerLocal = band ? notional * band.dealer * 2 : null;
  const leviesLocal = band ? notional * (band.sem + band.fsc + band.cds) * 2 : null;
  const brokerFees = dealerLocal == null ? null : dollars(dealerLocal, listing.currency);
  const levies = leviesLocal == null ? null : dollars(leviesLocal, listing.currency);
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
  const why =
    usd != null
      ? null
      : notionalUsd == null
        ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
        : !band
          ? `aucun cours MUR dans fx.mjs : la tranche du barème se lit en roupies`
          : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;
  const confidence = [
    shared.basis,
    band ? `tranche ${pct(band.dealer + band.sem + band.fsc + band.cds)} pour ${Math.round(notionalMur)} Rs` : "tranche inconnue",
    "aucun minimum publié",
    `ligne ${listing.currency}, payée en ${cash} : aucun change`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} ${listing.currency} par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  const rateTotal = band ? band.dealer + band.sem + band.fsc + band.cds : null;
  return {
    ...shared,
    remark: [baseRemark, turnaroundNote(rateTotal, notionalMur), fx].filter(Boolean).join("\n"),
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      notionalMur: finite(notionalMur, 9),
      currency: listing.currency,
    },
    commission: band
      ? {
          buy: band.dealer + band.sem + band.fsc + band.cds,
          sell: band.dealer + band.sem + band.fsc + band.cds,
          dealer: band.dealer,
          sem: band.sem,
          fsc: band.fsc,
          cds: band.cds,
          currency: listing.currency,
        }
      : null,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(levies, 6),
      courtageLocal: finite(dealerLocal, 6),
      taxesLocal: finite(leviesLocal, 6),
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
