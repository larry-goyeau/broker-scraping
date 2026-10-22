// What one round trip costs at CB Securities: buy n shares on the Yangon
// Stock Exchange through CB Trader 2.0 (app or web) and sell them straight
// back, in dollars. Every YSX share is quoted in kyat and the account is
// held in kyat at CB Bank (deposits.mjs), so nothing is converted.
//
// https://cbsecurities.com.mm/trading-fees/ read on 2026-10-21, and the
// same table on https://cbsecurities.com.mm/stock-brokerage/. "Commission
// Fee" by trading amount (MMK):
//   Less than 1,000,000                 1.0% of trading amount
//   1,000,001 – 10,000,000              0.7%
//   10,000,001 – 100,000,000            0.5%
//   More than 100,000,000               0.4%
//   "Buy Orders have to pay additional 0.1% for Stamp Duty."
// Each buy and each sell is a transaction; the band is read on its whole
// value, which then pays that one rate (1,000,000 exactly pays 1%). No
// minimum is printed.
//
// https://cbsecurities.com.mm/wp-content/uploads/2019/10/Online_Trading_T_n_C.pdf
// (linked from https://cbsecurities.com.mm/trading-platform/), same day:
// an order through the online services is limited to MMK 20 million.
// https://cbsecurities.com.mm/block-trade/, same day: a block trade (more
// than 10,000 shares, or MMK 30 million) goes through the trading desk by
// phone. So a trip above 20 million kyat or 10,000 shares is phone-only:
// onlineBuy: false and no price.
// No opening or annual fee is printed on the account-opening or
// deposit pages.
//
// In the total: the YSX book, commission on both sides, stamp duty on the
// buy. No remark.
//
// The YSX book is not stored, so the total stays unknown until it is.
//
//   node brokers/cbsecurities/cbsecurities_cost.mjs FMI YSX MMK --shares=100 --price=18000
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("cbsecurities-parsed.json", import.meta.url);
const PAGE = "https://cbsecurities.com.mm/trading-fees/";
const READ_ON = "2026-10-21";
// Upper bound of the band in kyat (inclusive) and its rate.
const BANDS = [
  { upTo: 1e6, rate: 0.01 },
  { upTo: 10e6, rate: 0.007 },
  { upTo: 100e6, rate: 0.005 },
  { upTo: Infinity, rate: 0.004 },
];
const STAMP = 0.001;
const ONLINE_MAX_SHARES = 10000;
const ONLINE_MAX_VALUE = 20e6;
const CASH = "MMK";
const REMARK = "";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const bandOf = (kyat) => BANDS.find((b) => kyat <= b.upTo);

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
    cashCurrency: CASH,
    url: PAGE,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue CB Securities n'existe pas encore : lancer `node brokers/cbsecurities/cbsecurities_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue CB Securities` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez CB Securities`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "cbsecurities",
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
  const shared = {
    ...answer,
    remark: [REMARK, m.row.remark].filter(Boolean).join(" "),
    listing,
    basis:
      `CB Trader 2.0 (application ou web), barème relu le ${READ_ON}. ` +
      `Courtage 1 % jusqu'à 1 M MMK, 0,7 % jusqu'à 10 M, 0,5 % jusqu'à 100 M, 0,4 % au-delà, chaque sens ; droit de timbre 0,1 % à l'achat.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `CB Securities ne publie un barème que pour la bourse de Yangon en kyats ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  if (n > ONLINE_MAX_SHARES || notional > ONLINE_MAX_VALUE) {
    return {
      ...shared,
      onlineBuy: false,
      why:
        notional > ONLINE_MAX_VALUE
          ? `ordre hors ligne : un ordre en ligne est plafonné à 20 M MMK (conditions du service en ligne), au-delà par téléphone seulement`
          : `ordre hors ligne : au-delà de 10 000 titres (bloc), CB Securities ne prend l'ordre que par téléphone`,
      trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    };
  }
  const band = bandOf(notional);
  const commissionMmk = notional * band.rate * 2;
  const stampMmk = notional * STAMP;
  const brokerFees = dollars(commissionMmk, listing.currency);
  const stamp = dollars(stampMmk, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, stamp);
  const why =
    usd != null
      ? null
      : notionalUsd == null
        ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
        : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;
  const confidence = [
    shared.basis,
    `tranche ${String(band.rate * 100).replace(".", ",")} % pour ${Math.round(notional)} MMK`,
    "aucun minimum publié",
    "ligne MMK, compte en kyats : aucun change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} MMK par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: band.rate + STAMP, sell: band.rate, broker: band.rate, stampBuy: STAMP, currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(stamp, 6),
      courtageMmk: finite(commissionMmk, 6),
      taxesMmk: finite(stampMmk, 6),
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
