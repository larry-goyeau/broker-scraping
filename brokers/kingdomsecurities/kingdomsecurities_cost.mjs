// What one round trip costs at Kingdom Securities (KSL), the Nairobi
// Securities Exchange member of the Co-operative Bank of Kenya group: buy n
// shares or ETF units online (the NSE's Dosikaa app, the KSL Trader app or
// the TradeWeb online share trading platform) and sell them straight back,
// in dollars.
//
// http://kingdomsecurities.co.ke/wp-content/uploads/2021/09/KSL-TERMS-AND-CONDITIONS.pdf
// ("KSL Terms and Conditions" in the site footer), read on 2026-10-22,
// section 6 "Fees and Charges", table FEES, column Equities:
//                              under 100,000   over 100,000
//   Brokerage Commission           1.78 %         1.50 %
//   CDSC Transaction levy          0.08 %         0.08 %
//   CMA Transaction levy           0.12 %         0.12 %
//   CDSC Guarantee Fund            0.01 %         0.01 %
//   NSE transaction Levy           0.12 %         0.12 %
//   CMA guarantee fund             0.01 %         0.01 %
//   Stamp duty               KES 2 per 10,000   KES 2 per 10,000
//   VAT                            16 %           16 %
// Section 6(b) says the commission is "1.5% or 1.78% of the Consideration
// of each transaction". The five levies add up to 0.34 % a side (the prose
// says "approximately 0.32%", an older figure; the table is used). The
// Investor Protection Fund and Clearing member fee rows are for bonds and
// derivatives only. The table has no column for exactly KES 100,000; it
// takes the 1.78 % (the Business Daily table of 2 Mar 2026 reads the NSE
// band as "up to Sh100,000"). Each side is priced on its own amount.
// Stamp duty is KES 2 for each KES 10,000 or part of it, on each contract
// note: Business Daily of 18 Feb 2026 shows KES 2 of stamp duty on a
// single ABSA share at KES 30.20,
// https://www.businessdailyafrica.com/bd/markets/capital-markets/stamp-duty-hits-low-value-stock-market-transactions-5363988
// The tariff names no side, so it is taken on the buy and on the sell.
// The VAT row dates from the 2020 amendment that made securities brokerage
// taxable; the High Court struck it down on 16 Dec 2021, three months after
// this PDF was uploaded, and the service is VAT-exempt again,
// https://taxnews.ey.com/news/2022-0058-kenya-high-court-rules-that-insurance-agencies-insurance-brokerage-and-securities-brokerage-services-should-remain-as-vat-exempt
// So VAT is set to 0 below (set VAT = 0.16 to charge the printed row on
// the commission). The ETF lines (NewGold, Satrix) take the same table:
// the Treasury said at NewGold's listing that it trades like an ordinary
// equity. KSL prints no intraday rate.
//
// In the total: the book, the commission (brokerFees), the levies and the
// stamp duty. Remark: none. The FAQ says there is no maintenance fee on a
// CDS account held with KSL (https://kingdomsecurities.co.ke/faqs/).
//
// The account holds shillings only (deposits.mjs). The two US-dollar
// REITs (ALP, TRFC) would need a conversion KSL does not price, so their
// total is N/A unless deposits.mjs lists USD for the folder.
//
//   node brokers/kingdomsecurities/kingdomsecurities_cost.mjs ABSA XNAI KES --shares=100 --price=25
//   node brokers/kingdomsecurities/kingdomsecurities_cost.mjs SCOM XNAI KES --shares=10000 --price=28
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

const FOLDER = "kingdomsecurities";
const CATALOGUE = new URL("kingdomsecurities-parsed.json", import.meta.url);
const PAGE = "http://kingdomsecurities.co.ke/wp-content/uploads/2021/09/KSL-TERMS-AND-CONDITIONS.pdf";
const FAQ_PAGE = "https://kingdomsecurities.co.ke/faqs/";
const STAMP_PAGE =
  "https://www.businessdailyafrica.com/bd/markets/capital-markets/stamp-duty-hits-low-value-stock-market-transactions-5363988";
const VAT_PAGE =
  "https://taxnews.ey.com/news/2022-0058-kenya-high-court-rules-that-insurance-agencies-insurance-brokerage-and-securities-brokerage-services-should-remain-as-vat-exempt";
const READ_ON = "2026-10-22";
const BROKER = "Kingdom Securities";
const CASH = "KES";
// Statutory levies, each side: CDSC 0.08, CMA 0.12, CDSC GF 0.01, NSE 0.12, CMA GF 0.01.
const LEVIES = 0.0008 + 0.0012 + 0.0001 + 0.0012 + 0.0001;
const SMALL_COMMISSION = 0.0178;
const LARGE_COMMISSION = 0.015;
const THRESHOLD = 100000;
const STAMP_PER = 10000;
const STAMP = 2;
// Printed 16 % on the commission, void since the High Court ruling of 16 Dec 2021 (see header).
const VAT = 0;

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

// One side on an amount in shillings: commission, VAT on it, levies, stamp duty.
function side(amountKes) {
  const commissionRate = amountKes <= THRESHOLD ? SMALL_COMMISSION : LARGE_COMMISSION;
  const commission = amountKes * commissionRate;
  return {
    commissionRate,
    totalRate: Number((commissionRate * (1 + VAT) + LEVIES).toFixed(6)),
    commission,
    vat: commission * VAT,
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
    return {
      ...answer,
      why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/kingdomsecurities/kingdomsecurities_scraping.mjs\``,
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
  const held = depositHas(FOLDER, null, cashCcy);
  const fxWhy = held ? null : `change forcé ${CASH}→${cashCcy} : le compte ne tient que des shillings et ${BROKER} ne publie aucun taux de change`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cashCcy : CASH,
    basis:
      `conditions générales ${BROKER} (section 6, tableau FEES, colonne Equities) relues le ${READ_ON} : courtage 1,78 % ` +
      `jusqu'à 100 000 KES et 1,50 % au-delà, prélèvements 0,34 % (CDSC 0,08 %, CMA 0,12 %, NSE 0,12 %, fonds de garantie ` +
      `CDSC et CMA 0,01 % chacun). Droit de timbre 2 KES par tranche de 10 000 KES entamée, à l'achat et à la vente. ` +
      `Chaque sens sur son montant.` +
      (VAT ? ` TVA ${VAT * 100} % sur le courtage.` : ` Ligne TVA 16 % non appliquée.`) +
      (held ? "" : ` Change forcé ${CASH}→${cashCcy} sans taux publié.`),
    confidence:
      `barème imprimé dans les conditions générales mises en ligne en septembre 2021, seule grille publiée ; la FAQ ne ` +
      `donne aucun taux (« Commissions will be charged on each trade ») et aucun frais de tenue de compte. Le texte dit ` +
      `« approximately 0.32% » de prélèvements, le tableau en fait 0,34 % : tableau retenu. 1,78 % + 0,34 % = 2,12 %, ` +
      `au-dessus des 2,1 % affichés par ABC Capital : chiffre imprimé retenu. Exactement 100 000 KES pris au taux de 1,78 %. ` +
      `La ligne TVA 16 % date de l'assujettissement de 2020, annulé par la High Court le 16 décembre 2021 : non ajoutée. ` +
      `Timbre par tranche entamée et des deux côtés, d'après l'exemple du Business Daily du 18 février 2026. ` +
      `ETF traités comme des actions (même tableau).`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: held ? 0 : null,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, faq: FAQ_PAGE, stamp: STAMP_PAGE, vat: VAT_PAGE },
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
  const taxUsd = each == null ? null : dollars((each.stamp + each.vat) * 2, CASH);
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
  const usd = plus(bookUsd, brokerFees, leviesUsd, taxUsd);
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
          large: each.commissionRate === LARGE_COMMISSION,
          buy: finite(each.commission, 8),
          sell: finite(each.commission, 8),
          currency: CASH,
          eachWay: true,
        }
      : null,
    market: each
      ? {
          levies: finite(each.levies, 8),
          levyRate: Number(LEVIES.toFixed(6)),
          stampDuty: each.stamp,
          vat: finite(each.vat, 8),
          vatRate: VAT,
          eachWay: true,
          currency: CASH,
        }
      : null,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      réglementaire: finite(leviesUsd, 6),
      taxe: finite(taxUsd, 6),
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
