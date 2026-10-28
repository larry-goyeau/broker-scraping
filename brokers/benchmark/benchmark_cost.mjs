// What one round trip costs at BenchMark Finance: buy n shares at price p,
// sell them back at once, online on BG Trader, retail, in dollars.
//
// BENCHMARK FINANCE AD (BG), "Тарифа на БенчМарк Финанс", euro-only since
// the Board decision of 11 August 2026, read on 2026-10-20, with its
// Приложение 1 for 1 January – 31 December 2026. BG Trader is the only
// online channel; office orders (Section I.2: 2 %, min 10.23 €) and the
// MetaTrader CFD account are not this trip. Catalogue 540 lines, all EUR,
// all XBUL — 270 on the BSE Main Market (254 shares, 16 ETFs / national
// funds), 270 on MTF BSE International (240 shares, 19 ETFs, 9 ETC, 2 ETN).
//
//   BG Trader, Section I.1 / Annex 1 point 1.1   0.70 %, min 0.51 €
//     (Annex 1: 0.35 % only for clients who traded over 51 129.19 € in
//     January 2026; a client opening now is on 0.70 %)
//   Expat Bulgaria SOFIX (BGX) and Short SOFIX (BGXS), point 1.6
//                                                 0.40 %, min 0.51 €
//   over 51 129.19 € traded in a calendar year, point 1.2   0.60 %
//   over 511 291.88 €, point 1.3                  negotiated
//
// "В комисионите по Раздел I ... не са включени комисионите на БФБ АД и
// Централен Депозитар АД": the exchange and depository fees are passed on,
// so they are added each way from their own published tariffs:
//
//   BSE, regulated market (Main market), Tariff in force 1 October 2025
//     shares (art. 21)                0.065 % of the executed order, min 0.51 €
//     exchange traded products (art. 24)  0.075 %, min 0.51 €
//   BSE as MTF operator (BSE International), Tariff in force 1 January 2023
//     shares and ETPs (art. 4–5)      0.05 % of the day's executed value, min 1 €
//   Central Depository, tariff read on 2026-10-20 (same figures in the one
//   in force from 2 November 2026)
//     Main market: point 3.3.2, Variant 1 (the default since 1 July 2026),
//       1.00 € per settlement instruction in T2S
//     BSE International: point 3.3.12.1, settlement in Clearstream Banking
//       Luxembourg, 3.58 € up to 1 000 €, else 3.58 € + 0.1 %, at most
//       33.23 €. BSE International trades settle in Clearstream between
//       the CD and Tradegate, the market maker on every line.
//
// The CD 0.10 € message fee (3.2) runs only from the day after a failed
// settlement and the monthly packages (Variant 2) are the member's choice,
// so neither is in the number. VAT on the BSE fees is not added.
//
// Custody 0.1 % / year on securities and 0.5 % / year on cash (Section II,
// points 1–2) is a holding cost, in the remark.
//
// FX: every line is EUR and deposits.mjs holds EUR and USD. A USD deposit is
// converted "по текущите курсове на БенчМарк", no rate printed, so there is
// no FX remark.
//
//   https://www.benchmark.bg/pics/editor/PDFBG/Tariff_v_sila_ot_11.08.2026.pdf   read on 2026-10-20
//   https://bse-sofia.bg/en/trading-fees                                           read on 2026-10-20
//   https://download.bse-sofia.bg/BSE-Rules/BSE_Tariff_of_fees_EN.pdf              read on 2026-10-20
//   https://download.bse-sofia.bg/BSE-Rules/MTF-International/MTF_BSE_INT_Tariff_of_Fees_en.pdf   read on 2026-10-20
//   https://www.csd-bg.bg/resources/docfiles/issuers/tarifa_na_uslugite_BG.pdf     read on 2026-10-20
//   https://www.csd-bg.bg/resources/docfiles/issuers/tarifa_na_uslugite_BG_new.pdf read on 2026-10-20
//   https://www.benchmark.bg/Внос-на-средства_545.html                             read on 2026-10-20
//
//   node brokers/benchmark/benchmark_cost.mjs 11C BSESOF EUR --shares=100 --price=8.7
//   node brokers/benchmark/benchmark_cost.mjs BGX BSESOF EUR --shares=1000 --price=1.074
//   node brokers/benchmark/benchmark_cost.mjs 04Q "BSE International" EUR --shares=100 --price=16.965
//   node brokers/benchmark/benchmark_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const FOLDER = "benchmark";
const CATALOGUE = new URL("benchmark-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.benchmark.bg/pics/editor/PDFBG/Tariff_v_sila_ot_11.08.2026.pdf",
  bse: "https://download.bse-sofia.bg/BSE-Rules/BSE_Tariff_of_fees_EN.pdf",
  bsePage: "https://bse-sofia.bg/en/trading-fees",
  mtf: "https://download.bse-sofia.bg/BSE-Rules/MTF-International/MTF_BSE_INT_Tariff_of_Fees_en.pdf",
  csd: "https://www.csd-bg.bg/resources/docfiles/issuers/tarifa_na_uslugite_BG.pdf",
  csdNext: "https://www.csd-bg.bg/resources/docfiles/issuers/tarifa_na_uslugite_BG_new.pdf",
  deposits: "https://www.benchmark.bg/Внос-на-средства_545.html",
  readOn: "2026-10-20",
  revised: "2026-08-11",
  bseInForce: "2025-10-01",
  mtfInForce: "2023-01-01",
  entity: "BenchMark Finance AD (BG), BG Trader",
};

// BG Trader commission, each way, in euro.
const BROKER = {
  standard: { rate: 0.007, min: 0.51 },
  expat: { rate: 0.004, min: 0.51 },
};
// Point 1.2: over 51 129.19 € traded in a calendar year.
const YEAR_TIER = { rate: 0.006, min: 0.51, above: 51129.19 };
// Point 1.6 names these two only.
const EXPAT_ISINS = new Set(["BG9000011163", "BG9000002196"]);
const EXPAT_TICKERS = new Set(["BGX", "BGXS"]);

// Exchange fee, each way, in euro.
const BSE_FEE = {
  main: { stock: { rate: 0.00065, min: 0.51 }, etp: { rate: 0.00075, min: 0.51 } },
  intl: { stock: { rate: 0.0005, min: 1 }, etp: { rate: 0.0005, min: 1 } },
};

// Central Depository settlement, each way, in euro.
const CSD_T2S = 1.0;
const CSD_CBL = { fixed: 3.58, upTo: 1000, pct: 0.001, cap: 33.23 };

const MAIN = "Bulgarian Stock Exchange";
const INTERNATIONAL = "BSE International";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// A relative cut in percent: whole when 10 or more, one decimal below.
const roundPct = (x) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10);

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const toCcy = (amount, from, to) => {
  if (String(from || "").toUpperCase() === String(to || "").toUpperCase()) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

/** "main" for the BSE Main Market, "intl" for MTF BSE International. */
export function segmentOf(row) {
  const code = loose(row?.exchange);
  if (code === loose(INTERNATIONAL)) return "intl";
  if (code === loose(MAIN) || /^(BSESOF|XBUL|BSE|SOFIA)$/.test(code)) return "main";
  return null;
}

const isEtp = (row) => String(row?.type || "STOCK").toUpperCase() !== "STOCK";
const isExpat = (row) => EXPAT_ISINS.has(loose(row?.isin)) || EXPAT_TICKERS.has(loose(row?.ticker));

const brokerRuleOf = (row) => (isExpat(row) ? BROKER.expat : BROKER.standard);

function bseRuleOf(row, segment) {
  return BSE_FEE[segment]?.[isEtp(row) ? "etp" : "stock"] ?? null;
}

/** One side of the CD settlement fee, in euro. */
export function csdSide(amountEur, segment) {
  if (segment === "main") return CSD_T2S;
  if (segment !== "intl" || amountEur == null) return null;
  if (amountEur <= CSD_CBL.upTo) return CSD_CBL.fixed;
  return Math.min(CSD_CBL.cap, CSD_CBL.fixed + amountEur * CSD_CBL.pct);
}

const floored = (amountEur, rule) => {
  if (!rule || amountEur == null || !Number.isFinite(Number(amountEur))) return null;
  const raw = Number(amountEur) * rule.rate;
  const charged = Math.max(rule.min, raw);
  return { charged, raw, floored: raw < rule.min, rate: rule.rate, min: rule.min, currency: "EUR" };
};

/** One side of the BG Trader commission, in euro. */
export function commissionSide({ amountEur, row }) {
  return floored(amountEur, brokerRuleOf(row));
}

/** One side of the BSE trading fee, in euro. */
export function exchangeSide({ amountEur, row, segment }) {
  return floored(amountEur, bseRuleOf(row, segment));
}

// The yearly-turnover tier as "x% lower", the cut of the commission itself
// at this order's amount with the minimums, or at the bare rates when no
// amount is known.
function tierRemark(row, amountEur) {
  if (isExpat(row)) return "";
  const base = BROKER.standard;
  const fee = (r) => Math.max(r.min, amountEur * r.rate);
  const gap = amountEur > 0 ? ((fee(base) - fee(YEAR_TIER)) / fee(base)) * 100 : ((base.rate - YEAR_TIER.rate) / base.rate) * 100;
  const v = roundPct(gap);
  return v > 0 ? `Over €51,129.19 traded in a calendar year, commission is ${v}% lower.` : "";
}

function remarkOf(row, amountEur, cashCcy) {
  const lines = [];
  const tier = tierRemark(row, amountEur);
  if (tier) lines.push(tier);
  lines.push("Custody 0.1%/year on securities, 0.5%/year on cash.");
  return lines.join("\n");
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantUnsourced = resolved.unsourced || null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rowsNamed(rows, asked,
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      if (wantUnsourced && m.unsourced) return m.unsourced.name === wantUnsourced.name;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
      ticker: r.ticker,
    });
    const segment = segmentOf(r) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, bySegment: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const sg = (slot.bySegment[segment] ||= { n: 0, withBook: 0 });
    sg.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) sg.withBook += 1;
  }
  return out;
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `brokerFees` is the BG Trader ticket; BSE and CD fees go under
 * `réglementaire`.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EUR",
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue BenchMark n'existe pas encore : lancer `node brokers/benchmark/benchmark_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BenchMark` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BenchMark`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const segment = segmentOf(m.row);
  if (!segment) {
    return {
      ...answer,
      listing,
      why: `${listing.brokerExchange || listing.exchange} n'a pas de palier publié sur BG Trader`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const brokerRule = brokerRuleOf(m.row);
  const bseRule = bseRuleOf(m.row, segment);

  // A deposit currency is never converted; BenchMark prints no rate for
  // anything else, so that leg has no figure.
  const cashCcy = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, cashCcy);
  const fxWhy = held ? null : `change forcé vers ${cashCcy} : taux de change BenchMark non publié`;

  const basis =
    `tarif BenchMark Finance du ${SCHEDULE.revised} lu le ${SCHEDULE.readOn}, BG Trader ` +
    `${(brokerRule.rate * 100).toFixed(2)} %, plancher ${brokerRule.min} € ; ` +
    `BFB ${segment === "main" ? "marché principal" : "MTF BSE International"} ` +
    `${(bseRule.rate * 100).toFixed(3)} %, plancher ${bseRule.min} € ; ` +
    (segment === "main"
      ? `Dépositaire central ${CSD_T2S.toFixed(2)} € par instruction T2S (3.3.2 variante 1)`
      : `Dépositaire central, règlement Clearstream ${CSD_CBL.fixed} € jusqu'à ${CSD_CBL.upTo} €, sinon + 0,1 %, plafond ${CSD_CBL.cap} € (3.3.12.1)`) +
    (held ? "" : ` ; change forcé EUR→${cashCcy} sans taux publié`);

  const n = Number(shares);
  const p = Number(price);
  const shared = {
    ...answer,
    cashCurrency: held ? cashCcy : "EUR",
    listing,
    segment,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
  };

  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      remark: remarkOf(m.row, null, cashCcy),
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs",
      confidence: confidenceOf({ segment, brokerRule, bseRule, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct }),
    };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const notionalEur = toCcy(notional, listing.currency, "EUR");
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buy = commissionSide({ amountEur: notionalEur, row: m.row });
  const sell = commissionSide({ amountEur: notionalEur, row: m.row });
  const bse = exchangeSide({ amountEur: notionalEur, row: m.row, segment });
  const csd = csdSide(notionalEur, segment);
  const buyUsd = buy ? dollars(buy.charged, "EUR") : null;
  const sellUsd = sell ? dollars(sell.charged, "EUR") : null;
  const commissionUsd = plus(buyUsd, sellUsd);
  const bseUsd = bse ? dollars(bse.charged * 2, "EUR") : null;
  const csdUsd = csd == null ? null : dollars(csd * 2, "EUR");
  const fxUsd = held ? 0 : null;
  const brokerFees = plus(commissionUsd, fxUsd);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, taxUsd, bseUsd, csdUsd);
  const why = [
    fxWhy,
    bookUsd == null
      ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de source de spread"}`
      : null,
  ].filter(Boolean);

  return {
    ...shared,
    remark: remarkOf(m.row, notionalEur, cashCcy),
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why.length ? { why: why.join(" ; ") } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      notionalEur: finite(notionalEur, 6),
      currency: listing.currency,
    },
    buy: {
      commission: finite(buyUsd, 6),
      native: buy ? { ...buy, charged: finite(buy.charged, 6), raw: finite(buy.raw, 6) } : null,
      bse: bse ? finite(bse.charged, 6) : null,
      csd: finite(csd, 6),
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
    },
    sell: {
      commission: finite(sellUsd, 6),
      native: sell ? { ...sell, charged: finite(sell.charged, 6), raw: finite(sell.raw, 6) } : null,
      bse: bse ? finite(bse.charged, 6) : null,
      csd: finite(csd, 6),
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
      réglementaire: finite(plus(bseUsd, csdUsd), 6),
    },
    commission: {
      rate: brokerRule.rate,
      min: brokerRule.min,
      currency: "EUR",
      eachWay: true,
      thirdPartyIncluded: false,
    },
    basis,
    confidence: confidenceOf({
      segment,
      brokerRule,
      bseRule,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      buy,
      bse,
      csd,
    }),
  };
}

function confidenceOf({ segment, brokerRule, bseRule, listing, leaf, marketBp, marketPerShare, unsourced, taxPct, buy, bse, csd }) {
  const said = [];
  said.push(
    `BenchMark Finance BG Trader, tarif en euro du ${SCHEDULE.revised} et annexe 1 pour 2026, lus le ${SCHEDULE.readOn} ` +
      `— un client ouvert aujourd'hui est à 0,7 % (le 0,35 % de l'annexe vise le chiffre de janvier 2026)`
  );
  said.push(
    buy?.floored
      ? `le plancher mord : ${Number(buy.raw.toPrecision(3))} € calculés, ${brokerRule.min} € facturés par sens`
      : `courtage ${(brokerRule.rate * 100).toFixed(2)} % par sens` + (buy ? `, ${Number(buy.charged.toPrecision(4))} €` : "")
  );
  said.push(
    `frais BFB et Dépositaire central hors courtage (Section I) : ajoutés depuis leurs tarifs — ` +
      `BFB ${(bseRule.rate * 100).toFixed(3)} % plancher ${bseRule.min} €` +
      (bse ? ` (${Number(bse.charged.toPrecision(4))} € par sens)` : "") +
      (segment === "main"
        ? `, tarif du marché réglementé en vigueur le ${SCHEDULE.bseInForce} — DC ${CSD_T2S} € par instruction T2S, variante 1 par défaut`
        : `, tarif MTF en vigueur le ${SCHEDULE.mtfInForce} — DC règlement Clearstream 3.3.12.1` +
          (csd != null ? ` (${Number(csd.toPrecision(4))} € par sens)` : "")) +
      `. TVA sur les frais BFB non ajoutée, la façon dont BenchMark refacture n'est pas imprimée`
  );
  if (taxPct) said.push(`taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant, depuis taxMap.mjs`);
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet, ${marketPerShare} $ la part`);
  else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    `hors total : garde 0,1 % / an sur les titres et 0,5 % / an sur les espèces, change BenchMark sans taux publié, ` +
      `ordres en agence (Section I.2). Aucun aller-retour réel dans ce dépôt`
  );
  return said.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        { ...SCHEDULE, broker: BROKER, yearTier: YEAR_TIER, bse: BSE_FEE, csdT2S: CSD_T2S, csdClearstream: CSD_CBL, coverage: coverage() },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node benchmark_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node benchmark_cost.mjs --schedule\n" +
        "  ex.   node benchmark_cost.mjs 11C BSESOF EUR --shares=100 --price=8.7\n" +
        '        node benchmark_cost.mjs 04Q "BSE International" EUR --shares=100 --price=16.965'
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce que BenchMark propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.brokerExchange || l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  if (out.trade?.notional != null) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
    );
    console.log();
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
