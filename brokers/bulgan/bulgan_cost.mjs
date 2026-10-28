// What one round trip costs at Bulgan Broker (member broker of the
// Mongolian Stock Exchange): buy n shares on the MSE through the broker's
// online account and sell them straight back, in dollars. Every MSE line is
// quoted in tugriks and the account is funded by Mongolian bank transfer
// in tugriks (deposits.mjs), so nothing is converted.
//
// https://bulganbroker.mn/fees read on 2026-10-26 (single-page app; the
// table is in https://bulganbroker.mn/assets/index-BA2XyeRc.js), table
// "Арилжааны шимтгэл" (trading fees), columns fee / minimum:
//   "Хувьцаа худалдан авалт / зарах"  0.50%   1,000 ₮   (share buy / sell)
//   "МХБ‑ийн шимтгэл"                 0.07%   —         (MSE fee)
//   "ҮЦТТТХ хураамж (клиринг)"        0.03%   —         (MCSD clearing fee)
//   "ETF (Биржийн сан)"                0.40%   1,000 ₮
// and "Доорх шимтгэлүүдээс өөр төлбөр байхгүй" (no charge besides these).
// The page's worked example (100 APU at 14,250 ₮: broker 7,125 ₮ + MSE
// 998 ₮ + MCSD 428 ₮) applies the three rates to the order value of one
// buy; the "buy / sell" line makes the sell pay the same. The minimum is
// on the broker commission of each order. The MSE and MCSD lines are
// printed for every trade, so ETFs pay them too. Account opening, yearly
// fee and deposits are free; a withdrawal costs 1,500 ₮ a transfer, left
// out (not a trading cost).
//
// In the total: the MSE book, the broker commission (0.50% shares, 0.40%
// ETFs, 1,000 ₮ minimum per order) on both sides, MSE 0.07% and MCSD 0.03%
// on both sides. No remark. Tax on dividends and gains is not counted.
//
// The MSE book is not stored and fx.mjs has no MNT rate yet, so the total
// stays unknown until both exist.
//
//   node brokers/bulgan/bulgan_cost.mjs APU XULA MNT --shares=1500 --price=2300
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const BROKER = "Bulgan Broker";
const FOLDER = "bulgan";
const CASH = "MNT";
const URL_FEES = "https://bulganbroker.mn/fees";
const READ_ON = "2026-10-26";
const RATE_SHARE = 0.005;
const RATE_ETF = 0.004;
const MINIMUM = 1000; // MNT, broker commission of each order
const MSE_FEE = 0.0007;
const MCSD_FEE = 0.0003;
const CATALOGUE = new URL("bulgan-parsed.json", import.meta.url);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const frPct = (rate) => `${String(Math.round(rate * 100 * 10000) / 10000).replace(".", ",")} %`;

let rowsCache;
function loadRows() {
  if (rowsCache === undefined) {
    rowsCache = null;
    if (fs.existsSync(CATALOGUE)) {
      const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
      rowsCache = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
      if (rowsCache.length) warmListingIndex(rowsCache);
    }
  }
  return rowsCache;
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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip(query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
    url: URL_FEES,
    remark: "",
  };
  const rows = loadRows();
  if (!rows) {
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing(rows, { etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${BROKER}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${BROKER}`,
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
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    remark: [answer.remark, m.row.remark].filter(Boolean).join(" "),
    listing,
    basis:
      `ordre en ligne, barème ${BROKER} relu le ${READ_ON} : ` +
      `courtage ${frPct(RATE_SHARE)} actions, ${frPct(RATE_ETF)} ETF, minimum ${MINIMUM.toLocaleString("fr-FR")} MNT par ordre, chaque sens ; ` +
      `frais MSE ${frPct(MSE_FEE)} et compensation MCSD ${frPct(MCSD_FEE)}, chaque sens.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `${BROKER} ne publie un barème que pour la bourse de Mongolie en tugriks ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const rate = listing.type === "ETF" ? RATE_ETF : RATE_SHARE;
  const perSide = Math.max(MINIMUM, notional * rate);
  const commissionMnt = perSide * 2;
  const brokerFees = dollars(commissionMnt, listing.currency);
  const feesMnt = notional * (MSE_FEE + MCSD_FEE) * 2;
  const taxes = dollars(feesMnt, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxes);
  const why = [
    notionalUsd == null ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs` : null,
    parts.a == null || parts.b == null
      ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
  ]
    .filter(Boolean)
    .join(" ; ");
  const confidence = [
    shared.basis,
    notional * rate < MINIMUM
      ? `${frPct(rate)} de ${Math.round(notional)} MNT sous le minimum : ${MINIMUM} MNT par sens`
      : `${frPct(rate)} de ${Math.round(notional)} MNT = ${Math.round(perSide)} MNT par sens`,
    `frais MSE et MCSD ${Math.round(notional * (MSE_FEE + MCSD_FEE))} MNT par sens`,
    "le barème dit qu'aucun autre frais ne s'ajoute ; retrait 1 500 MNT par virement non compté",
    "impôt sur la plus-value non compté : aller-retour au même prix, aucun gain",
    "ligne MNT, compte en tugriks : aucun change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} MNT par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: finite(perSide, 8),
      sell: finite(perSide, 8),
      rate,
      minimum: MINIMUM,
      mse: MSE_FEE,
      mcsd: MCSD_FEE,
      currency: listing.currency,
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxes, 6),
      courtageMnt: finite(commissionMnt, 6),
      taxesMnt: finite(feesMnt, 6),
    },
    confidence,
  };
}

export function printCli(callerUrl, fn) {
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
  console.log(JSON.stringify(fn({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli(import.meta.url, roundTrip);
