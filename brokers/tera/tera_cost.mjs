// What one round trip costs at Tera Yatırım: buy n shares at price p on
// Borsa İstanbul, sell them back at once, through Tera Trader (web and
// mobile), in dollars. Shares and the BIST exchange-traded funds (BYF) of the
// catalogue. VİOP, bonds, eurobonds and swaps are not this trip.
//
// "Tera Yatırım 2026 Yılı Masraf, Ücret ve Komisyon Tablosu" (a scanned PDF),
// read on 2026-10-23:
//
//   Commission     "Pay Piyasası Alım Satım Komisyonu: %0,0005 (onbinde beş)
//                  işlem bazlı oran": five in ten thousand, 0.05 %, each way
//                  (the "%" sign is a slip, "onbinde beş" is the rate). No
//                  minimum and no volume band are printed.
//   Levies         "Pay Piyasası Borsa Payı + Pay Piyasası Takas Komisyonu":
//                  the BIST and Takasbank tariffs, linked. BIST borsa payı
//                  0.25 bps of the amount each way, shares and BYF alike.
//                  "Pay Piyasası Takas İşlem Komisyonu: 0,0007% (Milyonda
//                  yedi)": the clearing line Tera prints, taken as the
//                  Takasbank fee itself (not added a second time), each way.
//   BSMV           "%5 BSMV (BSMV komisyon oranı, BSMV hariç tanımlananlar
//                  için)": 5 % on top of the commission and the levies.
//   Not this trip  MKK account upkeep 0.08340 TL a day on balances of 1,000
//                  TL or more, MKK custody 0.008 % a year, EFT fees.
//
// Cash is lira, dollars or euros (deposits.mjs); every line is lira, which is
// a deposit currency, so nothing is converted. No stamp or transaction tax
// applies to a BIST share; the tax map is still read.
// Book: Borsa İstanbul through spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://www.terayatirim.com/dosyalar/kurumsal/Tera_Yatirim__2026__Yili_Masraf%2C_U%CC%88cret_ve_Komisyon_Tablosu.pdf
//   https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf
//
//   node brokers/tera/tera_cost.mjs GARAN BIST TRY --shares=300 --price=140
//   node brokers/tera/tera_cost.mjs --schedule
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

const CATALOGUE = new URL("tera-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.terayatirim.com/dosyalar/kurumsal/Tera_Yatirim__2026__Yili_Masraf%2C_U%CC%88cret_ve_Komisyon_Tablosu.pdf",
  borsaPayi: "https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf",
  readOn: "2026-10-23",
  entity: "Tera Yatırım Menkul Değerler A.Ş.",
};

const RATE = 0.0005;
const BSMV = 0.05;
const BORSA_PAYI = 0.000025;
const TAKAS = 0.000007;
const CASH = "TRY";
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
 * `usd` is the number the page prints. `brokerFees` is Tera's commission
 * with its BSMV.
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
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Tera n'existe pas encore : lancer `node brokers/tera/tera_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Tera Yatırım` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Tera Yatırım`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "tera",
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
    return { ...answer, listing, why: `${listing.currency} n'est pas une ligne du barème pay piyasası (lire seulement)` };
  }
  const takas = TAKAS;
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
      `barème Tera 2026 relu le ${SCHEDULE.readOn} : onbinde beş (0,05 %) par sens, sans minimum imprimé ; ` +
      `borsa payı BIST 0,25 bps et takas işlem komisyonu 7 par million chaque sens ; BSMV 5 % sur la commission et ces frais`,
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
  const levies = notional * (BORSA_PAYI + takas) * 2;
  const commissionUsd = dollars(commission * (1 + BSMV), CASH);
  const leviesUsd = dollars(levies * (1 + BSMV), CASH);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : plus(leviesUsd, notionalUsd * taxTotal);
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    shared.basis,
    "le « %0,0005 » imprimé se lit onbinde beş, soit 0,05 %",
    "takas : la ligne de Tera (7 par million) remplace le tarif Takasbank, pas en plus",
    "ligne en lires, devise de dépôt : pas de change",
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
    commission: { rate: RATE, currency: CASH, eachWay: true, bsmv: BSMV, borsaPayi: BORSA_PAYI, takas },
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, bsmv: BSMV, borsaPayi: BORSA_PAYI, takas: TAKAS }, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/tera/tera_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
