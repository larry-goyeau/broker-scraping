// What one round trip costs at Siprabi Securities (NEPSE broker no. 22):
// buy n shares on the Nepal Stock Exchange through NEPSE's Trade
// Management System (TMS, web and mobile) and sell them straight back, in
// dollars. Every NEPSE line is quoted in rupees and the account settles in
// rupees (deposits.mjs), so nothing is converted.
//
// https://www.siprabi.com/pages/services/brokerage read on 2026-10-21,
// "Charges", tab "Equity". Brokerage fee by transaction amount (NPR):
//   Rs 50,000 or less                   0.36 %
//   50,001 to 5,00,000                  0.33 %
//   5,00,001 to 20,00,000               0.31 %
//   20,00,001 to 1,00,00,000            0.27 %
//   Above 1,00,00,000                   0.24 %
//   "additional of 0.015% SEBON transaction fee and Rs 25 DP charges is
//   applicable"
// Each buy and each sell is a transaction; the band is read on its whole
// value, which then pays that one rate. No minimum is printed for equity
// (the Rs 10 floor on the page is for bonds and funds only). The SEBON fee
// and the Rs 25 DP charge are paid on each side, as the table prints them
// under the brokerage fee of every transaction. Ordinary, promoter and
// preference shares all take the equity tab.
// https://www.siprabi.com/pages/brokers/learn/faq, same day: no fee to open
// the broker account; Mero Share costs Rs 50 a year, a negligible holding
// cost left out. Orders go online through TMS.
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted.
//
// The NEPSE book is not stored and fx.mjs has no NPR rate yet, so the
// total stays unknown until both exist.
//
//   node brokers/siprabi/siprabi_cost.mjs NABIL XNEP NPR --shares=100 --price=500
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("siprabi-parsed.json", import.meta.url);
const PAGE = "https://www.siprabi.com/pages/services/brokerage";
const READ_ON = "2026-10-21";
// Upper bound of the band in rupees (inclusive) and its rate.
const BANDS = [
  { upTo: 50_000, rate: 0.0036 },
  { upTo: 500_000, rate: 0.0033 },
  { upTo: 2_000_000, rate: 0.0031 },
  { upTo: 10_000_000, rate: 0.0027 },
  { upTo: Infinity, rate: 0.0024 },
];
const SEBON = 0.00015;
const DP = 25;
const CASH = "NPR";
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
const bandOf = (rupees) => BANDS.find((b) => rupees <= b.upTo);

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
    return { ...answer, why: "le catalogue Siprabi n'existe pas encore : lancer `node brokers/siprabi/siprabi_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Siprabi` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Siprabi`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "siprabi",
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
    remark: [REMARK, m.row.remark].filter(Boolean).join(" "),
    listing,
    basis:
      `ordre en ligne par TMS, barème actions Siprabi relu le ${READ_ON}. ` +
      `Courtage 0,36 % jusqu'à 50 000 NPR, 0,33 % jusqu'à 5 lakh, 0,31 % jusqu'à 20 lakh, 0,27 % jusqu'à 1 crore, 0,24 % au-delà, chaque sens ; ` +
      `frais SEBON 0,015 % et frais DP 25 NPR, chaque sens.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `Siprabi ne publie un barème que pour la bourse du Népal en roupies ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const band = bandOf(notional);
  const commissionNpr = notional * band.rate * 2;
  const dpNpr = DP * 2;
  const sebonNpr = notional * SEBON * 2;
  const brokerFees = dollars(commissionNpr + dpNpr, listing.currency);
  const sebon = dollars(sebonNpr, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, sebon);
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
    `tranche ${String(Number((band.rate * 100).toFixed(4))).replace(".", ",")} % pour ${Math.round(notional)} NPR, appliquée au montant entier (bornes supérieures incluses)`,
    "aucun minimum publié pour les actions (le plancher de 10 NPR de la page vaut pour les obligations et les fonds)",
    "impôt sur la plus-value non compté : aller-retour au même prix, aucun gain",
    "ligne NPR, compte en roupies : aucun change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} NPR par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: finite(notional * band.rate, 8),
      sell: finite(notional * band.rate, 8),
      rate: band.rate,
      sebon: SEBON,
      dpPerSide: DP,
      currency: listing.currency,
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(sebon, 6),
      courtageNpr: finite(commissionNpr + dpNpr, 6),
      taxesNpr: finite(sebonNpr, 6),
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
