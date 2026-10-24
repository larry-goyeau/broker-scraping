// What one round trip costs at HSBC Yatırım Menkul Değerler: buy n shares at
// price p on Borsa İstanbul, sell them back at once, through HSBC internet or
// mobile banking, in dollars. Shares and the BIST exchange-traded funds (BYF)
// of the catalogue. VİOP, bonds, eurobonds and the Darphane gold
// certificates are not this trip.
//
// HSBC Bank A.Ş. "Ürün ve Hizmet Ücretleri", Menkul Kıymetler tab, read on
// 2026-10-24, and HSBC Yatırım's equity-market page, read the same day:
//
//   Commission     "İnternet Bankacılığı-Hisse Senedi Alım / Satım Komisyonu
//                  % 0.20", BSMV "Hariç", updated 31.08.2022: 0.2 % of the
//                  amount, each way. The phone line prints the same 0.20 %.
//                  No minimum and no maximum amount ("Asgari Tutar" and
//                  "Azami Tutar" are "-"). The equity-market page: "azami
//                  %0.2 (binde 2) oranında komisyon". No lower rate is
//                  printed. The table names shares only; the BYF trade on
//                  the same equity market through the same channels and take
//                  the same line, as at the other BIST members.
//   MKK record fee "BIST'te Gerçekleşen Hisse Senedi, ..., BYF, ... Alım Satım
//                  İşlemlerine İlişkin Kayıt Ücreti 0,2100 TL", BSMV "Hariç",
//                  updated 27.02.2026: 0.21 TL on each trade, one on the buy
//                  and one on the sale.
//   BSMV           "Yukarıda belirtilen ücretlere % 5 BSMV ilave edilir": 5 %
//                  on the commission and the MKK fee.
//   Levies         the tariff prints no BIST borsa payı or Takasbank fee on a
//                  trade (only BIST's order-cancel fees), so none is added.
//   Not this trip  MKK custody 0.008 % a year on shares and BYF, account
//                  upkeep 1.05 TL a month: negligible, out. Order-cancel
//                  commission 0.12 %, transfers, data packages. The 0 %
//                  commission for 90 days for Premier clients who open their
//                  investment account online is an opening offer, out.
//
// In the total: the book, the commission, the MKK record fee, BSMV on both,
// and any tax taxMap.mjs names (none on a BIST share). Remark: none.
// Cash is lira only (deposits.mjs), every line is lira: no conversion.
// Book: Borsa İstanbul through spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://www.hsbc.com.tr/hsbc/urun-ve-hizmet-ucretleri
//   https://www.hsbcyatirim.com.tr/hizmetlerimiz/pay-senetleri-piyasasi/hsbc-pay-senetleri-piyasasi
//
//   node brokers/hsbctr/hsbctr_cost.mjs GARAN BIST TRY --shares=300 --price=140
//   node brokers/hsbctr/hsbctr_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("hsbctr-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.hsbc.com.tr/hsbc/urun-ve-hizmet-ucretleri",
  equityPage: "https://www.hsbcyatirim.com.tr/hizmetlerimiz/pay-senetleri-piyasasi/hsbc-pay-senetleri-piyasasi",
  readOn: "2026-10-24",
  entity: "HSBC Yatırım Menkul Değerler A.Ş.",
};

const RATE = 0.002;
const MKK_RECORD = 0.21;
const BSMV = 0.05;
const CASH = "TRY";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place, currency }).venue : null;
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

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is HSBC's commission
 * with its BSMV; the MKK record fee sits in `taxes`.
 */
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
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue HSBC Yatırım n'existe pas encore : lancer `node brokers/hsbctr/hsbctr_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue HSBC Yatırım` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez HSBC Yatırım`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "hsbctr",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || CASH,
    brokerExchange: m.row.exchange || null,
  };
  if (listing.currency !== CASH) {
    return { ...answer, listing, why: `${listing.currency} n'est pas une ligne du barème hisse senedi (lire seulement)` };
  }
  const etfLine = listing.type === "ETF";
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    basis:
      `barème HSBC Bank relu le ${SCHEDULE.readOn} : İnternet Bankacılığı hisse senedi alım / satım 0,20 % par sens, sans minimum ni maximum ; ` +
      `kayıt ücreti MKK ${MKK_RECORD} TL par opération ; BSMV 5 % sur les deux ; aucun borsa payı BIST ni frais Takasbank imprimé`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const commission = notional * RATE * 2;
  const record = MKK_RECORD * 2;
  const commissionUsd = dollars(commission * (1 + BSMV), CASH);
  const recordUsd = dollars(record * (1 + BSMV), CASH);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : plus(recordUsd, notionalUsd * taxTotal);
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    shared.basis,
    "taux « azami » (maximum) : aucun taux plus bas n'est publié hors l'offre d'ouverture Premier",
    ...(etfLine ? ["BYF : le barème ne nomme que les actions, la ligne hisse senedi du marché actions leur est appliquée"] : []),
    "cash en lires : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} TRY la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: { rate: RATE, currency: CASH, eachWay: true, bsmv: BSMV, mkkRecordPerTrade: MKK_RECORD },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.ticker} sur ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

function calledDirectly() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (calledDirectly()) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, mkkRecordPerTrade: MKK_RECORD, bsmv: BSMV }, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/hsbctr/hsbctr_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}
