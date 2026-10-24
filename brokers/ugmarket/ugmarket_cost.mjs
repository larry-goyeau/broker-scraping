// What one round trip costs at UG Market (ИП "Юг Маркет" ЕАД, Plovdiv):
// buy n shares or ETF units on the Bulgarian Stock Exchange through UG
// MARKET TRADER and sell them back, in dollars. Two segments, both XBUL and
// both in euro: the BSE's own markets (Main Market, BaSE, BEAM) and its MTF
// BSE International (foreign shares, ETFs, ETCs, ETNs, Tradegate as market
// maker).
//
// https://ugmarket.com/wp-content/uploads/2026/09/2_Тарифа_01122025-EUR.pdf
// "ТАРИФА за таксите и комисионните на ИП "Юг Маркет" ЕАД", in force from
// 2025-12-01, read on 2026-10-23. Section "ТАКСИ И КОМИСИОННИ ЗА СИСТЕМАТА
// UG MARKET TRADER", each executed order:
//   2.1. shares, rights, compensatory instruments
//        "0,4% oт стойността на сделката + разходите, дължими на БФБ и ЦД,
//        минимум 2.00 € на изпълнена поръчка"
//   2.2. MTF BSE International
//        "0,4% oт стойността на сделката + разходите, дължими на БФБ и ЦД,
//        минимум 11.00 € на изпълнена поръчка"
//   Professional clients and clients over 50,000 € a month for three
//   months in a row: negotiated. Office orders (1.3: 2.4%, minimum 11 €;
//   16 € on BSE International) are not online and stay out.
//   Note 5: the BSE and Central Depository costs follow those two
//   institutions' tariffs. They are the figures BenchMark Finance's file
//   reads from the same tariffs (../benchmark/benchmark_cost.mjs, read
//   2026-10-20), each side:
//     BSE Main Market, shares (art. 21)           0.065%, min 0.51 €
//     BSE Main Market, exchange-traded products   0.075%, min 0.51 €
//     BSE International, shares and ETPs          0.05%,  min 1 €
//     Central Depository, Main Market (3.3.2, Variant 1)   1.00 € per T2S
//       settlement instruction
//     Central Depository, BSE International (3.3.12.1, Clearstream)
//       3.58 € up to 1,000 €, else 3.58 € + 0.1%, at most 33.23 €
//   https://download.bse-sofia.bg/BSE-Rules/BSE_Tariff_of_fees_EN.pdf
//   https://download.bse-sofia.bg/BSE-Rules/MTF-International/MTF_BSE_INT_Tariff_of_Fees_en.pdf
//   https://www.csd-bg.bg/resources/docfiles/issuers/tarifa_na_uslugite_BG.pdf
// The BaSE and BEAM lines trade on the same T7 book under the Main Market's
// rules and take its line, as at BenchMark.
// Holding, 2.4 and 2.5: 0.1% a year on securities and 0.5% a year on cash,
// monthly; that is the remark. The 3 € monthly account fee (2.6) is only
// the shortfall below 3 € of fees in the month, so a round trip covers it.
//
// Cash: two client-money accounts, both EUR (deposits.mjs), and every line
// is in euro, so nothing is converted.
//
//   node brokers/ugmarket/ugmarket_cost.mjs SFA "Bulgarian Stock Exchange" EUR --shares=100 --price=8.6
//   node brokers/ugmarket/ugmarket_cost.mjs BGX "Bulgarian Stock Exchange" EUR --shares=500 --price=1.7
//   node brokers/ugmarket/ugmarket_cost.mjs 04Q "BSE International" EUR --shares=50 --price=17
//   node brokers/ugmarket/ugmarket_cost.mjs --schedule
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

const FOLDER = "ugmarket";
const CATALOGUE = new URL("ugmarket-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://ugmarket.com/wp-content/uploads/2026/09/2_%D0%A2%D0%B0%D1%80%D0%B8%D1%84%D0%B0_01122025-EUR.pdf",
  trader: "https://ugmarket.com/en/ug-market-trader/",
  bse: "https://download.bse-sofia.bg/BSE-Rules/BSE_Tariff_of_fees_EN.pdf",
  mtf: "https://download.bse-sofia.bg/BSE-Rules/MTF-International/MTF_BSE_INT_Tariff_of_Fees_en.pdf",
  csd: "https://www.csd-bg.bg/resources/docfiles/issuers/tarifa_na_uslugite_BG.pdf",
  inForce: "2025-12-01",
  readOn: "2026-10-23",
  thirdPartyReadOn: "2026-10-20",
  entity: 'ИП "Юг Маркет" ЕАД, UG MARKET TRADER',
};

const CASH = "EUR";
// UG MARKET TRADER commission, each executed order, in euro.
const BROKER = {
  main: { rate: 0.004, min: 2 },
  intl: { rate: 0.004, min: 11 },
};
// BSE fee, each side, in euro.
const BSE_FEE = {
  main: { stock: { rate: 0.00065, min: 0.51 }, etp: { rate: 0.00075, min: 0.51 } },
  intl: { stock: { rate: 0.0005, min: 1 }, etp: { rate: 0.0005, min: 1 } },
};
// Central Depository settlement, each side, in euro.
const CSD_T2S = 1.0;
const CSD_CBL = { fixed: 3.58, upTo: 1000, pct: 0.001, cap: 33.23 };

const REMARK = "Custody 0.1%/year on securities, 0.5%/year on cash.";
const MAIN = "Bulgarian Stock Exchange";
const INTERNATIONAL = "BSE International";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

/** "main" for the BSE's own markets, "intl" for MTF BSE International. */
function segmentOf(row) {
  const c = loose(row?.exchange);
  if (c === loose(INTERNATIONAL)) return "intl";
  if (c === loose(MAIN) || /^(BSESOF|XBUL|BSE|SOFIA)$/.test(c)) return "main";
  return null;
}
const isEtp = (row) => code(row?.type || "STOCK") !== "STOCK";

function csdSide(amountEur, segment) {
  if (segment === "main") return CSD_T2S;
  if (amountEur <= CSD_CBL.upTo) return CSD_CBL.fixed;
  return Math.min(CSD_CBL.cap, CSD_CBL.fixed + amountEur * CSD_CBL.pct);
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const exact = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exact.length ? exact : named;
  const wantVenue = !exact.length && place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace || exact.length) return true;
      if (loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency)
    // A bare XBUL asks for the main board first.
    .sort((a, b) => (segmentOf(a.row) === "main" ? 0 : 1) - (segmentOf(b.row) === "main" ? 0 : 1));
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
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue UG Market n'existe pas encore : lancer `node brokers/ugmarket/ugmarket_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue UG Market` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez UG Market`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
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
  const segment = segmentOf(m.row);
  const brokerRule = segment ? BROKER[segment] : null;
  const bseRule = segment ? BSE_FEE[segment][isEtp(m.row) ? "etp" : "stock"] : null;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? (marketBp != null ? null : book.leaf?.perShare ?? null);
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    segment,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    basis: segment
      ? `tarif UG Market du ${SCHEDULE.inForce} relu le ${SCHEDULE.readOn}, UG MARKET TRADER ${segment === "main" ? "2.1" : "2.2"} : ` +
        `0,4 %, minimum ${brokerRule.min} € par ordre exécuté, plus BFB ${(bseRule.rate * 100).toFixed(3)} % (plancher ${bseRule.min} €) et ` +
        (segment === "main"
          ? `Dépositaire central ${CSD_T2S.toFixed(2)} € par instruction T2S`
          : `Dépositaire central ${CSD_CBL.fixed} € jusqu'à ${CSD_CBL.upTo} €, sinon + 0,1 %, plafond ${CSD_CBL.cap} €`) +
        `, chaque sens (tarifs BFB et DC relus le ${SCHEDULE.thirdPartyReadOn} pour BenchMark)`
      : "",
  };
  if (!segment) return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'a pas de ligne dans le tarif UG MARKET TRADER` };
  if (listing.currency !== CASH) return { ...shared, why: `UG Market ne tient que de l'euro ; ${listing.currency} n'est pas couvert` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, CASH);
  const commissionSide = Math.max(notional * brokerRule.rate, brokerRule.min);
  const bseSide = Math.max(notional * bseRule.rate, bseRule.min);
  const csd = csdSide(notional, segment);
  const brokerFees = dollars(commissionSide * 2, CASH);
  const leviesUsd = dollars((bseSide + csd) * 2, CASH);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, CASH),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, leviesUsd, taxUsd);
  const confidence = [
    shared.basis,
    notional * brokerRule.rate < brokerRule.min
      ? `le minimum de ${brokerRule.min} € mord (${(notional * brokerRule.rate).toFixed(2)} € calculés)`
      : `0,4 % de ${notional.toFixed(2)} € = ${commissionSide.toFixed(2)} € par sens`,
    `BFB ${bseSide.toFixed(2)} € et DC ${csd.toFixed(2)} € par sens`,
    "le seuil de 50 000 € par mois (négocié) n'est pas chiffré",
    "garde 0,1 % / an sur les titres et 0,5 % / an sur les espèces en remarque",
    marketBp != null ? `carnet ${marketBp} bp` : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.ticker} sur ${listing.brokerExchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    commission: { rate: brokerRule.rate, min: brokerRule.min, minCurrency: CASH, eachWay: true, currency: CASH, thirdPartyIncluded: false },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: finite(leviesUsd, 6),
      taxes: finite(taxUsd, 6),
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
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, broker: BROKER, bse: BSE_FEE, csdT2S: CSD_T2S, csdClearstream: CSD_CBL }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/ugmarket/ugmarket_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}

printCli();
