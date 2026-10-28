// What one round trip costs through mySEM, the Stock Exchange of
// Mauritius's own web app: buy n shares (or ETF units) on the SEM's
// Official Market or DEM, ordered online in mySEM, which routes the order
// to the client's SEM investment dealer (stockbroker), and sell them
// straight back, in dollars. The CDS settles each trade in the security's
// currency (MUR, USD, EUR or GBP); the account holds MUR, USD, EUR, GBP and
// ZAR (deposits.mjs).
//
// mySEM itself prints no fee. The SEM investor FAQ and "Trade on SEM in 2
// Steps" send every fee question to the SEM transaction-fee page, and the
// mySEM manual (mySEM Specification, 61 pages) shows only "Consideration
// Less Cost" on the order ticket, with no platform or subscription charge.
// All read on 2026-10-24:
//   https://www.stockexchangeofmauritius.com/regulations-governance/transaction-fees
//   https://www.stockexchangeofmauritius.com/education-investor-services/investor-education/investor-education-faqs
//   https://www.stockexchangeofmauritius.com/education-investor-services/investor-education/trade-on-sem-in-2-steps
//   https://www.stockexchangeofmauritius.com/media/7323/mysem-specification.pdf
//
// The SEM schedule, "The brokerage fee claimed by an investment dealer
// (stockbroking company) to its client", as a share of the transaction
// value, apportioned among the dealer, the SEM, the FSC and the CDS.
// Equity securities:
//   Value of the transaction (Rs)   Dealer   SEM    FSC    CDS    Total
//   not exceeding 3 million         0.75%    0.25%  0.05%  0.20%  1.25%
//   3 to 6 million                  0.70%    0.25%  0.05%  0.15%  1.15%
//   6 to 10 million                 0.60%    0.25%  0.05%  0.15%  1.05%
//   more than 10 million            0.50%    0.25%  0.05%  0.10%  0.90%
// ETFs whose foreign underlying is not a debt security (NGLD.N0001,
// NewGold): 0.35% (dealer 0.21, SEM 0.07, FSC 0.014, CDS 0.056).
// ETFs with debt securities as foreign underlying (ADBF.N0002, African
// Domestic Bond Fund): 0.10% from Rs 75,000 (dealer 0.0725, SEM 0.0125,
// FSC 0.0025, CDS 0.0125); below Rs 75,000, Rs 75 flat (dealer 55, SEM 9,
// FSC 2, CDS 9).
// Each buy and each sell is a transaction. The band is read on the whole
// value, which then pays that one rate. The bands are in rupees, so a USD,
// EUR or GBP line is put into rupees (through the dollar, fx.mjs) to find
// its band, and the Rs 75 flat is put back into the line's currency. The
// page prints no minimum and names no VAT; the FAQ says the 1.25% "includes
// Brokerage charges, SEM fees, CDS fees, and FSC charges".
// Turnaround trades (a sale before the first trade settles): 0.15% from
// Rs 50,000, Rs 75 flat below. That is a remark ("Sell before 3 day
// settlement is x% lower.", a cut of the sale's whole fee: 1.25% → 0.15%
// = 88% lower), not the total.
//
// In the total: the SEM book crossed, the dealer's share (brokerFees) and
// the SEM, FSC and CDS shares (parts.taxes), both ways. Remark: the
// turnaround delta and FX. No account, custody or app fee is printed. The
// SEM book is not stored yet, so the total stays unknown until it is.
//
// The tickers are SEM security codes (MCBG.N0000, ADBF.N0002, NGLD.N0001).
// The names other catalogues print for the two ETFs (ADBF, NEWGOLD) also
// find them here.
//
//   node brokers/mysem/mysem_cost.mjs MCBG.N0000 XMAU MUR --shares=100 --price=480
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

const FOLDER = "mysem";
const CATALOGUE = new URL("mysem-parsed.json", import.meta.url);
const PAGE = "https://www.stockexchangeofmauritius.com/regulations-governance/transaction-fees";
const READ_ON = "2026-10-24";
const BASE = "MUR";
// Upper bound of the band in rupees (inclusive), then each share of it.
const BANDS = [
  { upTo: 3e6, dealer: 0.0075, sem: 0.0025, fsc: 0.0005, cds: 0.002 },
  { upTo: 6e6, dealer: 0.007, sem: 0.0025, fsc: 0.0005, cds: 0.0015 },
  { upTo: 10e6, dealer: 0.006, sem: 0.0025, fsc: 0.0005, cds: 0.0015 },
  { upTo: Infinity, dealer: 0.005, sem: 0.0025, fsc: 0.0005, cds: 0.001 },
];
const REMARK = "";
// ETFs, by SEM code root and ISIN. A new ETF line is not guessed: its
// underlying decides the line, so it answers N/A until it is named here.
const ETF_KIND = {
  ADBF: "debt",
  MU0607S00004: "debt",
  NGLD: "other",
  ZAE000060067: "other",
};
// Names the same ETFs carry in other catalogues (mcbsecurities).
const ALIAS = { ADBF: "ADBF.N0002", NEWGOLD: "NGLD.N0001" };
const ETF_OTHER = { dealer: 0.0021, sem: 0.0007, fsc: 0.00014, cds: 0.00056 };
const ETF_DEBT = { dealer: 0.000725, sem: 0.000125, fsc: 0.000025, cds: 0.000125 };
const ETF_DEBT_FLAT = { below: 75000, dealer: 55, sem: 9, fsc: 2, cds: 9 };
// Turnaround (sale before settlement): 0.15 %, or Rs 75 below Rs 50,000.
const TURNAROUND = { rate: 0.0015, below: 50000, flat: 75 };

// FX: the CDS settles in the security's currency and never converts it, so
// cash held in another deposit currency is changed against rupees by the
// client's bank. mySEM serves the clients of every SEM dealer, so the four
// largest banks are taken: telegraphic-transfer buy and sell rates, rupees
// for one unit, on the Bank of Mauritius indicative board of 23 October
// 2026 (read 2026-10-24),
// https://www.bom.mu/markets/foreign-exchange/indicative-exchange-rate
// The remark is one way against the mid, (sell - buy) / (sell + buy), as
// the lowest to the highest of the four. A trade between two foreign
// currencies goes through rupees and pays it twice.
const BOARD = {
  // MCB, SBM, AfrAsia, Absa
  USD: [
    [46.47, 47.85],
    [46.4734, 47.8624],
    [46.47, 47.85],
    [46.46, 47.86],
  ],
  EUR: [
    [52.11, 53.65],
    [52.0934, 53.65],
    [52.1, 53.66],
    [52.11, 53.69],
  ],
  GBP: [
    [62.24, 64.09],
    [62.2426, 64.0992],
    [62.23, 64.09],
    [62.23, 64.11],
  ],
};
const gapsOf = (ccy) => (BOARD[ccy] || []).map(([buy, sell]) => ((sell - buy) / (sell + buy)) * 100);
function rangeLabel(gaps) {
  if (!gaps.length) return "";
  const lo = Number(Math.min(...gaps).toFixed(2));
  const hi = Number(Math.max(...gaps).toFixed(2));
  return lo === hi ? String(lo) : `${lo}% to ${hi}`;
}
// A rupee line converts from whichever foreign cash is held; a foreign
// line converts from rupees.
function fxNote(ccy) {
  if (!depositHas(FOLDER, null, ccy)) return "";
  if (ccy === BASE) return fxRemark(rangeLabel(Object.keys(BOARD).flatMap(gapsOf)), ccy);
  return fxRemark(rangeLabel(gapsOf(ccy)), ccy);
}

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const root = (ticker) => code(ticker).split(".")[0];
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
const etfKind = (listing) => ETF_KIND[code(listing.isin)] ?? ETF_KIND[root(listing.ticker)] ?? null;

/** Shares of the transaction value for this line and size, or null. */
function scheduleOf(listing, rs) {
  if (rs == null || !(rs > 0)) return null;
  if (listing.type !== "ETF") return bandOf(rs);
  const kind = etfKind(listing);
  if (kind === "other") return ETF_OTHER;
  if (kind !== "debt") return null;
  if (rs >= ETF_DEBT_FLAT.below) return ETF_DEBT;
  const f = ETF_DEBT_FLAT;
  return { dealer: f.dealer / rs, sem: f.sem / rs, fsc: f.fsc / rs, cds: f.cds / rs };
}

/** "Sell before 3 day settlement fees are x% lower.", a cut of the one-side fee. */
function turnaroundNote(rate, rs) {
  if (rate == null || rs == null || !(rs > 0) || !(rate > 0)) return "";
  const t = rs < TURNAROUND.below ? TURNAROUND.flat / rs : TURNAROUND.rate;
  const x = ((rate - t) / rate) * 100;
  const gap = x >= 10 ? Math.round(x) : Number(x.toFixed(1));
  return gap > 0 ? `Sell before 3 day settlement fees are ${gap}% lower.` : "";
}

function findListing({ etf, place, currency }) {
  const askedRaw = loose(etf);
  const asked = loose(ALIAS[askedRaw] ?? etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  void plan;
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
    return { ...answer, why: "le catalogue mySEM n'existe pas encore : lancer `node brokers/mysem/mysem_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue mySEM` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez mySEM`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
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
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const cash = depositHas(FOLDER, null, listing.currency) ? listing.currency : BASE;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const fx = fxNote(listing.currency);
  const baseRemark = [REMARK, m.row.remark].filter(Boolean).join(" ");
  const remark = [baseRemark, fx].filter(Boolean).join("\n");
  const kind = listing.type === "ETF" ? etfKind(listing) : null;
  const shared = {
    ...answer,
    cashCurrency: cash,
    remark,
    listing,
    basis:
      `mySEM ne publie aucun frais propre ; barème des courtiers publié par la SEM, relu le ${READ_ON}. ` +
      (listing.type === "ETF"
        ? kind === "debt"
          ? `ETF à sous-jacent obligataire : 0,10 % dès 75 000 Rs, 75 Rs fixes en dessous (courtier, SEM, FSC et CDS compris), chaque sens.`
          : kind === "other"
            ? `ETF à sous-jacent étranger non obligataire : 0,35 % (courtier, SEM, FSC et CDS compris), chaque sens.`
            : `ETF au sous-jacent non identifié : la ligne du barème est inconnue.`
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
        : listing.type === "ETF" && !kind
          ? `ETF ${listing.ticker} : sous-jacent (obligataire ou non) non identifié, la ligne du barème SEM est inconnue`
          : !band
            ? `aucun cours MUR dans fx.mjs : la tranche du barème se lit en roupies`
            : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;
  const confidence = [
    shared.basis,
    band ? `tranche ${pct(band.dealer + band.sem + band.fsc + band.cds)} pour ${Math.round(notionalMur)} Rs` : "tranche inconnue",
    "aucun minimum publié, aucune TVA nommée",
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
          buy: rateTotal,
          sell: rateTotal,
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
