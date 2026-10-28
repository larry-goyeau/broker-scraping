// What one round trip costs at OMS Africa (OMNI MARCHE SECURITE Africa
// Limited), a Nairobi Securities Exchange member: buy n shares or ETF units
// online (the OMS Active Trader web platform) and sell them straight back,
// in dollars.
//
// https://www.omsafrica.co.ke/investor-guide read on 2026-10-26, Section II,
// "4. Understanding Transaction Costs":
//   Brokerage Commission   1.76% (Orders/Lots <= KES 100,000)
//                          1.36% (Orders/Lots > KES 100,000)
//   CMA Transaction Levy   0.12%
//   NSE Transaction Levy   0.12%
//   CDSC Transaction Levy  0.08%
//   CMA Guarantee Fund     0.01%
//   CDSC Guarantee Fund    0.01%
//   Stamp Duty             KES 2 per 10,000
//   "Transactions up to KES 100,000 are charged at 1.76% commission.
//   Transactions above KES 100,000 benefit from a lower rate of 1.36%."
// The five levies make 0.34 % a side, so 2.10 % up to KES 100,000 and
// 1.70 % above. An order of exactly KES 100,000 takes the 1.76 % (the table
// says "<="). Each side is priced on its own amount ("Orders/Lots").
// The guide gives one table for web and e-mail orders alike; the Active
// Trader web platform is the online route.
// Stamp duty is KES 2 for each KES 10,000 or part of it, on each contract
// note: Business Daily of 18 Feb 2026 shows KES 2 of stamp duty on a
// single ABSA share at KES 30.20,
// https://www.businessdailyafrica.com/bd/markets/capital-markets/stamp-duty-hits-low-value-stock-market-transactions-5363988
// The table names no side, so it is taken on the buy and on the sell, as
// in ../abccapital.
// The ETF lines (NewGold, Satrix) take the same table: the Treasury said
// at NewGold's listing that it trades like an ordinary equity.
// OMS prints no VAT or excise line, no intraday rate and no account or
// custody fee; the FAQ says "There is no account opening fee". None is
// added.
//
// In the total: the book, the commission (brokerFees), the levies and the
// stamp duty. Remark: none.
//
// The account holds shillings (deposits.mjs): M-Pesa paybill 814355 or a
// transfer to OMS's Stanbic Bank account, no dollar account named. The two
// US-dollar REITs (ALP, TRFC) would need a conversion OMS does not price,
// so their total is N/A unless deposits.mjs lists USD for the folder.
//
//   node brokers/omsafrica/omsafrica_cost.mjs ABSA XNAI KES --shares=100 --price=25
//   node brokers/omsafrica/omsafrica_cost.mjs SCOM XNAI KES --shares=3900 --price=33.3
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "omsafrica";
const CATALOGUE = new URL("omsafrica-parsed.json", import.meta.url);
const PAGE = "https://www.omsafrica.co.ke/investor-guide";
const STAMP_PAGE =
  "https://www.businessdailyafrica.com/bd/markets/capital-markets/stamp-duty-hits-low-value-stock-market-transactions-5363988";
const READ_ON = "2026-10-26";
const BROKER = "OMS Africa";
const CASH = "KES";
const SMALL_COMMISSION = 0.0176;
const LARGE_COMMISSION = 0.0136;
const THRESHOLD = 100000;
// Statutory levies, each side: CMA 0.12, NSE 0.12, CDSC 0.08, CMA GF 0.01, CDSC GF 0.01.
const LEVIES = 0.0012 + 0.0012 + 0.0008 + 0.0001 + 0.0001;
const STAMP_PER = 10000;
const STAMP = 2;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const kes = (amount, currency) => {
  if (code(currency) === CASH) return Number(amount);
  const usd = toUsd(amount, currency);
  const per = usdPer(CASH);
  return usd == null || !per ? null : usd / per;
};

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

// One side on an amount in shillings: commission, levies, stamp duty.
function side(amountKes) {
  const commissionRate = amountKes <= THRESHOLD ? SMALL_COMMISSION : LARGE_COMMISSION;
  return {
    totalRate: Number((commissionRate + LEVIES).toFixed(6)),
    commissionRate,
    commission: amountKes * commissionRate,
    levies: amountKes * LEVIES,
    stamp: Math.ceil(amountKes / STAMP_PER) * STAMP,
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
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/omsafrica/omsafrica_scraping.mjs\`` };
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
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const cashCcy = listingCash(listing.currency);
  // Shillings are the account currency whether or not deposits.mjs lists the folder yet.
  const held = cashCcy === CASH || depositHas(FOLDER, null, cashCcy);
  const fxWhy = held
    ? null
    : `change forcé ${CASH}→${cashCcy} : le compte ne tient que des shillings et ${BROKER} ne publie aucun taux de change`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cashCcy : CASH,
    basis:
      `Investor Guide ${BROKER}, section II « Understanding Transaction Costs », lu le ${READ_ON} : ` +
      `courtage 1,76 % jusqu'à 100 000 KES inclus, 1,36 % au-delà ; prélèvements 0,34 % (CMA 0,12 %, NSE 0,12 %, ` +
      `CDSC 0,08 %, fonds de garantie CMA et CDSC 0,01 % chacun), soit 2,10 % puis 1,70 % par sens. ` +
      `Droit de timbre 2 KES par tranche de 10 000 KES entamée, à l'achat et à la vente. Chaque sens sur son montant.` +
      (held ? "" : ` Change forcé ${CASH}→${cashCcy} sans taux publié.`),
    confidence:
      `barème imprimé ligne par ligne dans le guide ${BROKER}, le même pour les ordres par la plateforme Active Trader ` +
      `et par e-mail. Le seuil est « <= KES 100,000 » : un ordre de 100 000 KES pile prend 1,76 %. ` +
      `Le timbre est compté par tranche entamée et des deux côtés, d'après l'exemple du Business Daily du 18 février 2026. ` +
      `Aucune TVA ni accise imprimée, rien n'est ajouté. ETF traités comme des actions.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: held ? 0 : null,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, stamp: STAMP_PAGE },
  };
  if (listing.mic !== "XNAI") {
    return { ...shared, why: `${BROKER} ne publie un barème que pour la Nairobi Securities Exchange ; ${listing.exchange} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const notionalKes = kes(notional, listing.currency);
  const each = notionalKes == null ? null : side(notionalKes);
  const commissionUsd = each == null ? null : dollars(each.commission * 2, CASH);
  const leviesUsd = each == null ? null : dollars(each.levies * 2, CASH);
  const stampUsd = each == null ? null : dollars(each.stamp * 2, CASH);
  const fxUsd = held ? 0 : null;
  const brokerFees = plus(commissionUsd, fxUsd);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, leviesUsd, stampUsd);
  const why = [
    fxWhy,
    ...[...new Set([listing.currency, CASH])].filter((c) => usdPer(c) == null).map((c) => `aucun taux ${c}/${QUOTE} dans fx.mjs`),
    parts.a == null || parts.b == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      notionalKes: finite(notionalKes, 8),
      currency: listing.currency,
    },
    commission: each
      ? {
          rate: each.commissionRate,
          totalRate: each.totalRate,
          aboveThreshold: each.commissionRate === LARGE_COMMISSION,
          buy: finite(each.commission, 8),
          sell: finite(each.commission, 8),
          currency: CASH,
          eachWay: true,
        }
      : null,
    market: each
      ? { levies: finite(each.levies, 8), levyRate: Number(LEVIES.toFixed(6)), stampDuty: each.stamp, eachWay: true, currency: CASH }
      : null,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      réglementaire: finite(leviesUsd, 6),
      taxe: finite(stampUsd, 6),
      change: fxUsd,
    },
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
