// What one round trip costs at EFG Hermes IFA Financial Brokerage (Kuwait):
// buy n shares at price p on Boursa Kuwait through its e-trade account and
// sell them straight back, in dollars. Every catalogue line is a dinar line
// and the account is held in dinars, so nothing is converted.
//
// The broker's own table, read on 2026-10-21 ("ما هي عـمولات التداول في
// السوق الكويتي؟", FAQ, page footer ©2022):
//   https://www.efghermesifa.com/Public/FAQsAr.aspx
//   Premier Market 0.10 %, Main Market 0.15 %, Auction Market 0.30 %, each
//   with a 250-fils minimum; KCC settlement fee 500 fils a deal.
// That table predates the market-wide restructuring of trading commissions
// that Boursa Kuwait had approved on 23/07/2026 and put in force on 4
// October 2026 (supplementary disclosure of 22/09/2026). In Kuwait the
// commission is the approved market commission, the same at every broker;
// the table in force is printed, with that disclosure, on Al Sharq's page:
//   https://www.sharqetrade.com/en/news--events/newly-restructured-trading-commission
//   Commission       0.0015 of the deal (0.15 %) on the Premier Market, the
//                    Main Market and REITs, each side.
//   Minimum          500 fils (0.5 KWD) per trade, "calculated for each trade
//                    separated" at the end of the session. One fill each way
//                    is assumed.
//   Ticket           the 500-fils fee on executed orders is cancelled.
// This file uses the table in force; EFG's FAQ has not been updated. Kuwait
// has no VAT and no stamp or transaction tax on a listed share.
//
// FX: fx.mjs has no dinar, so this file carries its own rate for the same
// day as fx.mjs, as brokers/sharq does: 0.30902359 KWD per USD on
// 2026-09-07. A price is in dinars, not fils.
//   https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-09-07/v1/currencies/usd.min.json
//
// The book is Boursa Kuwait's touch (spreads/kw-touch.json), by ISIN.
// Custody, KCC transfers and cheque fees are not this order.
//
//   node brokers/efghermeskw/efghermeskw_cost.mjs NBK XKUW KWD --shares=1000 --price=0.824
//   node brokers/efghermeskw/efghermeskw_cost.mjs AAYAN XKUW KWD --shares=500 --price=0.273
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd as fxToUsd, usdPer as fxUsdPer } from "../../fx.mjs";

const CATALOGUE = new URL("efghermeskw-parsed.json", import.meta.url);
const PAGE = "https://www.sharqetrade.com/en/news--events/newly-restructured-trading-commission";
const BROKER_PAGE = "https://www.efghermesifa.com/Public/FAQsAr.aspx";
const READ_ON = "2026-10-21";
const IN_FORCE = "2026-10-04";
const BROKER = "EFG Hermes IFA";
const RATE = 0.0015;
const MIN_KWD = 0.5;
const CASH = "KWD";
const REMARK = "";

// Dinars per dollar, 2026-09-07 (fx.mjs AS_OF), not in fx.mjs.
const KWD_PER_USD = 0.30902359;
const KWD_SOURCE = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-09-07/v1/currencies/usd.min.json";

const usdPer = (currency) => (String(currency || "").toUpperCase() === "KWD" ? 1 / KWD_PER_USD : fxUsdPer(currency));
const toUsd = (amount, currency) => {
  if (String(currency || "").toUpperCase() !== "KWD") return fxToUsd(amount, currency);
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  return Number(amount) / KWD_PER_USD;
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// One trade: 0.15 %, at least 500 fils.
const side = (notional) => Math.max(notional * RATE, MIN_KWD);

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
      if (["KSE", "KUWAIT", "BOURSA"].includes(wantPlace)) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
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
    return {
      ...answer,
      why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/efghermeskw/efghermeskw_scraping.mjs\``,
    };
  }
  const { named, matches } = findListing({ etf, place, currency });
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
    broker: "efghermeskw",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || CASH,
    brokerExchange: m.row.exchange || null,
  };
  const leaf = book.leaf;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : leaf?.bp ?? null);
  const shared = {
    ...answer,
    listing,
    venueAuthoritative: true,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `commission de marché Boursa Kuwait en vigueur depuis le ${IN_FORCE}, relue le ${READ_ON} : 0,15 % de chaque ` +
      `transaction, au moins 500 fils, chaque sens, sans frais de bon. La FAQ ${BROKER} imprime encore l'ancien ` +
      `barème (0,10 % / 0,15 % / 0,30 %, minimum 250 fils, 500 fils de règlement).`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), source: KWD_SOURCE },
    fxIfConverted: 0,
    sources: { fees: PAGE, broker: BROKER_PAGE, fx: KWD_SOURCE },
  };
  if (listing.currency !== CASH || listing.mic !== "XKUW") {
    return { ...shared, why: `${BROKER} ne traite que Boursa Kuwait en dinars ; ${listing.exchange} ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = side(notional);
  const brokerFees = dollars(each * 2, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);
  const floorBites = notional * RATE < MIN_KWD;
  const bookWhy = !listing.isin
    ? `aucun ISIN : le carnet ${listing.exchange} ne peut pas être lu`
    : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null ? { why: bookWhy } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: RATE, min: MIN_KWD, each, currency: listing.currency, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
    },
    confidence: [
      floorBites
        ? `le minimum de 500 fils s'applique sous ${(MIN_KWD / RATE).toFixed(2)} KWD par transaction`
        : `0,15 % de ${notional.toFixed(3)} KWD = ${each.toFixed(3)} KWD par sens`,
      `KWD à ${KWD_PER_USD} pour 1 USD au ${FX_AS_OF}, taux propre à ce fichier`,
      "barème de marché commun à tous les courtiers koweïtiens ; la FAQ du courtier n'est pas à jour",
      marketPerShare != null
        ? `carnet ${marketPerShare} par action`
        : marketBp != null
          ? `fourchette Boursa Kuwait ${marketBp} pb`
          : `aucune feuille de carnet : ${listing.exchange}`,
    ].join(" ; "),
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
