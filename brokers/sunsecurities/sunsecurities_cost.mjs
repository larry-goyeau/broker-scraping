// What one round trip costs at Sun Securities (Kathmandu, NEPSE broker no.
// 64): buy n shares on the Nepal Stock Exchange through NEPSE's online
// Trade Management System (TMS) and sell them straight back, in dollars.
// Every NEPSE line is quoted in rupees and the account settles in rupees
// (deposits.mjs), so nothing is converted.
//
// https://sunsecurities.com/fees read on 2026-10-21, "Fees & Commission",
// effective from 13 May 2024 (the SEBON 10 % cut of Jestha 1, 2081).
// Broker commission on equity shares, by transaction amount (NPR):
//   Rs 0 to Rs 50,000                   0.36 %
//   Rs 50,000 to Rs 500,000             0.33 %
//   Rs 500,000 to Rs 2,000,000          0.306 %
//   Rs 2,000,000 to Rs 10,000,000       0.27 %
//   Above Rs 10,000,000                 0.243 %
//   Minimum charge Rs 10 per transaction.
//   SEBON fee      0.015 % of turnover, per trade (equity)
//   DP charge      Rs 25 per scrip per settlement day
//   Capital gains tax  7.5 % or 10 % of the gain, sell side only
// The fee schedule the page embeds (and its share calculator) prints each
// line with side "Both": commission, SEBON fee and DP charge are paid on
// the buy and on the sell. The commission band is read on the whole
// turnover of the transaction, upper bounds inclusive (Rs 50,000 exactly
// pays 0.36 %), and that one rate applies to the whole amount, floored at
// Rs 10. Ordinary, promoter and preference shares all take the equity
// table.
// https://sunsecurities.com/services/securities-trading, same day: orders
// can be placed online through TMS; the trading desk and the office are
// other routes and change nothing in the rates.
// https://sunsecurities.com/faqs, same day: demat and MeroShare renew each
// year "with a small fee", a negligible holding cost left out.
//
// In the total: the NEPSE book, the commission on both sides (brokerFees,
// with the DP charge), the SEBON fee on both sides. No remark. Capital
// gains tax is on the gain, not the trade: a round trip at one price has
// no gain, so it is not counted.
//
// The NEPSE book is not stored and fx.mjs has no NPR rate yet, so the
// total stays unknown until both exist.
//
//   node brokers/sunsecurities/sunsecurities_cost.mjs NABIL XNEP NPR --shares=100 --price=500
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const FOLDER = "sunsecurities";
const BROKER = "Sun Securities";
const CATALOGUE = new URL("sunsecurities-parsed.json", import.meta.url);
const PAGE = "https://sunsecurities.com/fees";
const SERVICE_PAGE = "https://sunsecurities.com/services/securities-trading";
const READ_ON = "2026-10-21";
// Upper bound of the band in rupees (inclusive) and its rate.
const BANDS = [
  { upTo: 50_000, rate: 0.0036 },
  { upTo: 500_000, rate: 0.0033 },
  { upTo: 2_000_000, rate: 0.00306 },
  { upTo: 10_000_000, rate: 0.0027 },
  { upTo: Infinity, rate: 0.00243 },
];
const MINIMUM = 10;
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
const pct = (rate) => String(Number((rate * 100).toFixed(4))).replace(".", ",");

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

// One side on an amount in rupees: commission (band rate, Rs 10 floor), SEBON fee, DP charge.
function side(rupees) {
  const band = bandOf(rupees);
  const raw = rupees * band.rate;
  return {
    rate: band.rate,
    commission: Math.max(raw, MINIMUM),
    minimum: raw < MINIMUM,
    sebon: rupees * SEBON,
    dp: DP,
  };
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
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
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
    remark: [REMARK, m.row.remark].filter(Boolean).join(" "),
    listing,
    basis:
      `ordre en ligne par TMS, barème actions ${BROKER} relu le ${READ_ON} (en vigueur depuis le 13 mai 2024). ` +
      `Commission 0,36 % jusqu'à 50 000 NPR, 0,33 % jusqu'à 5 lakh, 0,306 % jusqu'à 20 lakh, 0,27 % jusqu'à 1 crore, 0,243 % au-delà, ` +
      `minimum 10 NPR par transaction, chaque sens ; frais SEBON 0,015 % et frais DP 25 NPR, chaque sens.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, trading: SERVICE_PAGE },
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `${BROKER} ne publie un barème que pour la bourse du Népal en roupies ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = side(notional);
  const commissionNpr = (each.commission + each.dp) * 2;
  const sebonNpr = each.sebon * 2;
  const brokerFees = dollars(commissionNpr, listing.currency);
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
    `tranche ${pct(each.rate)} % pour ${Math.round(notional)} NPR, appliquée au montant entier (bornes supérieures incluses)`,
    each.minimum ? "minimum de 10 NPR atteint" : null,
    "commission, SEBON et DP marqués « Both » dans le barème de la page : achat et vente",
    "ligne NPR, compte en roupies : aucun change",
    "impôt sur la plus-value non compté : aller-retour au même prix, aucun gain",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} NPR par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: finite(each.commission, 8),
      sell: finite(each.commission, 8),
      rate: each.rate,
      minimum: MINIMUM,
      floored: each.minimum,
      sebon: SEBON,
      dpPerSide: DP,
      currency: listing.currency,
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(sebon, 6),
      courtageNpr: finite(commissionNpr, 6),
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
