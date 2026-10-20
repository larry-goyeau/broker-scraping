// What one round trip costs at AYA Trust Securities: buy n shares on the
// Yangon Stock Exchange through the AYA Trust Securities mobile app and
// sell them straight back, in dollars. Every YSX share is quoted in kyat
// and the account is held in kyat (deposits.mjs), so nothing is converted.
//
// https://www.ayatrustsc.com/how-to-start-trading
// read on 2026-10-19. The "Commission Fee" table is an image
// (userfiles/media/default/commission-fee.png); brokerage fees by
// transaction amount (MMK):
//   Less than 1,000,000                 1%
//   1,000,001 – 10,000,000              0.7%
//   10,000,001 – 100,000,000            0.5%
//   More than 100,000,000               0.4%
//   "Buy Orders also have to pay additional 0.1% for Stamp Duty."
// Each buy and each sell is a transaction; the band is read on its whole
// value, which then pays that one rate (1,000,000 exactly pays 1%). No
// minimum is printed.
//
// https://www.ayatrustsc.com/equity, same day: orders of 1 to 9,999
// shares can go through the app or the phone; a trade of MMK 20 million
// or more, and a block trade (10,000 shares or more), only by phone. So a
// trip above either limit is not online and has no price here.
// https://www.ayatrustsc.com/ac-opening: no opening or annual fee.
//
// The YSX book is not stored, so the total stays unknown until it is.
//
//   node brokers/aya/aya_cost.mjs FMI YSX MMK --shares=100 --price=9000
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("aya-parsed.json", import.meta.url);
const PAGE = "https://www.ayatrustsc.com/how-to-start-trading";
const READ_ON = "2026-10-19";
// Upper bound of the band in kyat (inclusive) and its rate.
const BANDS = [
  { upTo: 1e6, rate: 0.01 },
  { upTo: 10e6, rate: 0.007 },
  { upTo: 100e6, rate: 0.005 },
  { upTo: Infinity, rate: 0.004 },
];
const STAMP = 0.001;
const APP_MAX_SHARES = 9999;
const APP_MAX_VALUE = 20e6;
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
    return { ...answer, why: "le catalogue AYA n'existe pas encore : lancer `node brokers/aya/aya_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue AYA` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez AYA`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "aya",
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
      `application mobile AYA Trust Securities, barème relu le ${READ_ON}. ` +
      `Courtage 1 % jusqu'à 1 M MMK, 0,7 % jusqu'à 10 M, 0,5 % jusqu'à 100 M, 0,4 % au-delà, chaque sens ; droit de timbre 0,1 % à l'achat.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `AYA ne publie un barème que pour la bourse de Yangon en kyats ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  if (n > APP_MAX_SHARES || notional >= APP_MAX_VALUE) {
    return {
      ...shared,
      why: `ordre hors application : au-delà de 9 999 titres ou à partir de 20 M MMK, AYA ne prend l'ordre que par téléphone`,
      trade: { shares: n, price: p, notional, currency: listing.currency },
    };
  }
  const notionalUsd = dollars(notional, listing.currency);
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
