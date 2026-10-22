// What one round trip costs at AIB-AXYS Africa (formerly Axys Investment
// Bank), a Nairobi Securities Exchange member: buy n shares or ETF units
// online (the NSE's Dosikaa app, the AIB DigiTrader app or the ActiveTrader
// web platform) and sell them straight back, in dollars.
//
// https://ww2.aib-axysafrica.com/_files/ugd/af94b6_1bd1a2fa6c9e403cac4ffe5e561c58f0.pdf
// ("AIB-AXYS FEE TARIFF" on https://ww2.aib-axysafrica.com/downloads,
// headed "Fee Tariff, 2024"), read on 2026-10-22, table 1 "Shares trades on
// Nairobi Securities Exchange", column "Online and Mobile Trading":
//   Brokerage Commission above Kes 100,000   1.3 %
//   Brokerage Commission below Kes 100,000   1.3 %
//   CMA Guarantee Fund                       0.01 %
//   CMA Transaction Levy                     0.12 %
//   NSE Transaction Levy                     0.12 %
//   CDSC guarantee Fund                      0.01 %
//   CDSC                                     0.08 %
//   Stamp Duty Charges Kes 2.00 for every Kes 10,000.00
// So 1.64 % a side, whatever the size. The "Normal Trade" column (1.76 %
// below and 1.38 % above KES 100,000) is for orders given to the dealers,
// not online, and is not used. Each side is priced on its own amount.
// The FAQ (menu "FAQ'S", read on 2026-10-22) says the same: an account
// opened remotely, with no paperwork, pays "KES 200 annual fee and 1.64%
// trading fee" (commission 1.30 % plus the five levies); accounts opened
// on paper pay 2.1 % below and 1.8 % above KES 100,000, stamp duty apart.
// A Dosikaa account is opened in the app with no paperwork, so the 1.64 %
// is used.
// https://ww2.aib-axysafrica.com/_files/ugd/af94b6_7132bbfc5dcc4d60a47245382c86f42c.pdf
// Stamp duty is KES 2 for each KES 10,000 or part of it, on each contract
// note: Business Daily of 18 Feb 2026 shows KES 2 of stamp duty on a
// single ABSA share at KES 30.20,
// https://www.businessdailyafrica.com/bd/markets/capital-markets/stamp-duty-hits-low-value-stock-market-transactions-5363988
// The tariff names no side, so it is taken on the buy and on the sell.
// The ETF lines (NewGold, Satrix) take the same table: the Treasury said
// at NewGold's listing that it trades like an ordinary equity.
// The tariff and the FAQ print no VAT or excise line and no intraday rate
// (the FAQ describes intraday orders but gives them no price of their
// own), so none is added.
// The terms in force since 1 April 2025, clause 11, say only that fees are
// subject to VAT and other taxes "where applicable".
// https://ww2.aib-axysafrica.com/_files/ugd/af94b6_fd8b40c777ef4d42bca6c4525f62bc88.pdf
//
// In the total: the book, the commission (brokerFees), the levies and the
// stamp duty. Remark: none. The tariff's KES 200 a year for electronic
// accounts is a small holding fee and stays out.
//
// The online account holds shillings (deposits.mjs): the DigiTrader terms
// restrict deposits to M-Pesa. The two US-dollar REITs (ALP, TRFC) would
// need a conversion AIB-AXYS does not price, so their total is N/A unless
// deposits.mjs lists USD for the folder.
//
//   node brokers/aibaxys/aibaxys_cost.mjs ABSA XNAI KES --shares=100 --price=25
//   node brokers/aibaxys/aibaxys_cost.mjs SCOM XNAI KES --shares=10000 --price=28
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

const FOLDER = "aibaxys";
const CATALOGUE = new URL("aibaxys-parsed.json", import.meta.url);
const PAGE = "https://ww2.aib-axysafrica.com/_files/ugd/af94b6_1bd1a2fa6c9e403cac4ffe5e561c58f0.pdf";
const FAQ_PAGE = "https://ww2.aib-axysafrica.com/_files/ugd/af94b6_7132bbfc5dcc4d60a47245382c86f42c.pdf";
const TERMS_PAGE = "https://ww2.aib-axysafrica.com/_files/ugd/af94b6_fd8b40c777ef4d42bca6c4525f62bc88.pdf";
const STAMP_PAGE =
  "https://www.businessdailyafrica.com/bd/markets/capital-markets/stamp-duty-hits-low-value-stock-market-transactions-5363988";
const READ_ON = "2026-10-22";
const BROKER = "AIB-AXYS Africa";
const CASH = "KES";
// Online and Mobile Trading commission, above and below KES 100,000 alike.
const COMMISSION = 0.013;
// Statutory levies, each side: CMA GF 0.01, CMA 0.12, NSE 0.12, CDSC GF 0.01, CDSC 0.08.
const LEVIES = 0.0001 + 0.0012 + 0.0012 + 0.0001 + 0.0008;
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
  return {
    commission: amountKes * COMMISSION,
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
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/aibaxys/aibaxys_scraping.mjs\`` };
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
  const fxWhy = held ? null : `change forcé ${CASH}→${cashCcy} : le compte en ligne ne tient que des shillings et ${BROKER} ne publie aucun taux de change`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cashCcy : CASH,
    basis:
      `Barème ${BROKER} « Fee Tariff, 2024 » relu le ${READ_ON}, colonne « Online and Mobile Trading » : courtage 1,3 % ` +
      `au-dessus comme au-dessous de 100 000 KES, prélèvements 0,34 % (CDSC 0,08 %, CMA 0,12 %, NSE 0,12 %, fonds de ` +
      `garantie CDSC et CMA 0,01 % chacun), soit 1,64 % par sens. Droit de timbre 2 KES par tranche de 10 000 KES ` +
      `entamée, à l'achat et à la vente. Chaque sens sur son montant.` +
      (held ? "" : ` Change forcé ${CASH}→${cashCcy} sans taux publié.`),
    confidence:
      `barème PDF de la page Downloads de ${BROKER} ; la colonne « Online and Mobile Trading » est retenue pour les ordres ` +
      `passés par le client dans Dosikaa, DigiTrader ou ActiveTrader (la colonne « Normal Trade », 1,76 %/1,38 %, vise ` +
      `les ordres aux opérateurs) ; la FAQ donne le même 1,64 % pour un compte ouvert à distance sans papier, ce qui est ` +
      `le cas d'un compte ouvert dans Dosikaa (2,1 %/1,8 % pour un compte ouvert sur papier). Timbre par tranche entamée ` +
      `et des deux côtés, d'après l'exemple du Business Daily du 18 février 2026. Aucune TVA ni accise imprimée dans le ` +
      `barème ni la FAQ (les conditions, clause 11, disent « where applicable »), rien n'est ajouté. ETF traités comme ` +
      `des actions (même tableau).`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: held ? 0 : null,
    bp: marketBp,
    perShare: marketPerShare,
    sources: { fees: PAGE, faq: FAQ_PAGE, terms: TERMS_PAGE, stamp: STAMP_PAGE },
  };
  if (listing.mic !== "XNAI") {
    return { ...shared, why: `${BROKER} ne publie un barème en ligne que pour la Nairobi Securities Exchange ; ${listing.exchange} n'est pas couvert` };
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
          rate: COMMISSION,
          totalRate: Number((COMMISSION + LEVIES).toFixed(6)),
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
