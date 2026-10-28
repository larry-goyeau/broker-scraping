// What one round trip costs at SBG Securities, the Standard Bank group
// stockbroker in Kenya and a Nairobi Securities Exchange member: buy n
// shares or ETF units online (iTrader: the Active Lite web platform, the
// SBGS iTrader app or Mshares on USSD *209#) and sell them straight back,
// in dollars.
//
// https://www.sbgsecurities.co.ke/sbgsecurities/securities/products-and-services/sbgsecurites-FAQs
// read on 2026-10-26:
//   39. "For a consideration over Kshs 100,000 - 1.85%", "For a
//   consideration below Kshs 100, 000 - 2.12%", "These charges include
//   brokerage commission and statutory charges."
//   38. "There are no additional charges for trading online."
// The General Terms and Conditions, condition 6(b), say what the statutory
// part is: CMA, NSE and CDSC fees and levies and "Stamp Duty amounting to
// a total of approximately 0.36% of the Consideration for equities",
// https://www.sbgsecurities.co.ke/sbgsecurities/securities/General-Terms-&-Conditions
// So the two rates are all-in, stamp duty included: 2.12 = 1.76 commission
// + 0.36, 1.85 = 1.49 + 0.36. They are used as printed; the 0.36 % is split
// as the five statutory levies, 0.34 % (CMA 0.12, NSE 0.12, CDSC 0.08, CMA
// and CDSC guarantee funds 0.01 each, as in ../abccapital), and 0.02 % of
// stamp duty (KES 2 per KES 10,000), and the commission is the rest. An
// order of exactly KES 100,000 is neither "over" nor "below"; it takes the
// 2.12 %, as at ../faida. Each side is priced on its own consideration.
// The ETF lines (NewGold, Satrix) take the same rates: the Treasury said
// at NewGold's listing that it trades like an ordinary equity.
// SBG prints no VAT or excise line, no intraday rate and no account or
// custody fee for iTrader. None is added. The FAQ's "minimum number of
// shares ... is 100" is not applied.
//
// In the total: the book, the commission (brokerFees), the levies and the
// stamp duty. Remark: none.
//
// The account holds shillings (deposits.mjs): deposits go to SBG's single
// Stanbic Bank account (FAQ 31), no dollar account named, and the terms
// call any currency other than Kenya shillings "Foreign Currency". The two
// US-dollar REITs (ALP, TRFC) would need a conversion SBG does not price,
// so their total is N/A unless deposits.mjs lists USD for the folder.
//
//   node brokers/sbg/sbg_cost.mjs ABSA XNAI KES --shares=100 --price=25
//   node brokers/sbg/sbg_cost.mjs SCOM XNAI KES --shares=3900 --price=33.3
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

const FOLDER = "sbg";
const CATALOGUE = new URL("sbg-parsed.json", import.meta.url);
const PAGE = "https://www.sbgsecurities.co.ke/sbgsecurities/securities/products-and-services/sbgsecurites-FAQs";
const TERMS_PAGE = "https://www.sbgsecurities.co.ke/sbgsecurities/securities/General-Terms-&-Conditions";
const READ_ON = "2026-10-26";
const BROKER = "SBG Securities";
const CASH = "KES";
// All-in rates (commission and statutory charges, stamp duty included).
const SMALL_TOTAL = 0.0212;
const LARGE_TOTAL = 0.0185;
const THRESHOLD = 100000;
// Statutory levies, each side: CMA 0.12, NSE 0.12, CDSC 0.08, CMA GF 0.01, CDSC GF 0.01.
const LEVIES = 0.0012 + 0.0012 + 0.0008 + 0.0001 + 0.0001;
// Stamp duty inside the terms' "approximately 0.36%": KES 2 per KES 10,000.
const STAMP_RATE = 0.0002;

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
  const total = amountKes <= THRESHOLD ? SMALL_TOTAL : LARGE_TOTAL;
  const commissionRate = Number((total - LEVIES - STAMP_RATE).toFixed(6));
  return {
    totalRate: total,
    commissionRate,
    commission: amountKes * commissionRate,
    levies: amountKes * LEVIES,
    stamp: amountKes * STAMP_RATE,
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
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/sbg/sbg_scraping.mjs\`` };
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
      `FAQ ${BROKER} (questions 38 et 39), lue le ${READ_ON} : 2,12 % par sens jusqu'à 100 000 KES, 1,85 % au-delà, ` +
      `« courtage et frais réglementaires compris », sans frais de plus en ligne. Conditions générales, article 6(b) : ` +
      `prélèvements CMA, NSE, CDSC et droit de timbre « environ 0,36 % ». Taux tout compris retenus tels quels, ` +
      `ventilés en prélèvements 0,34 %, timbre 0,02 % et courtage 1,76 % ou 1,49 %. Chaque sens sur son montant.` +
      (held ? "" : ` Change forcé ${CASH}→${cashCcy} sans taux publié.`),
    confidence:
      `taux tout compris imprimés dans la FAQ ${BROKER} ; les conditions générales confirment que le timbre est dans ` +
      `les 0,36 % de frais réglementaires (2,12 − 0,36 = 1,76 %, le courtage usuel à la NSE). Un ordre de 100 000 KES pile ` +
      `n'est ni « over » ni « below » : 2,12 % retenu. Aucune TVA ni accise imprimée, rien n'est ajouté. ` +
      `ETF traités comme des actions. Le minimum de 100 actions de la FAQ n'est pas appliqué au calcul.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: held ? 0 : null,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, terms: TERMS_PAGE },
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
          aboveThreshold: each.totalRate === LARGE_TOTAL,
          buy: finite(each.commission, 8),
          sell: finite(each.commission, 8),
          currency: CASH,
          eachWay: true,
        }
      : null,
    market: each
      ? { levies: finite(each.levies, 8), levyRate: Number(LEVIES.toFixed(6)), stampDuty: finite(each.stamp, 8), stampRate: STAMP_RATE, eachWay: true, currency: CASH }
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
