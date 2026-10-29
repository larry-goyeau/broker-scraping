// What one round trip costs on BYMA (Bolsas y Mercados Argentinos, BCBA /
// XBUE), shared by the cost files of the brokers whose only place is BYMA
// and whose catalogue is ../bancogalicia/bymaBook.mjs's board: Buenos Aires
// shares and CEDEARs (ETF certificates included), in pesos, MEP dollars (D
// lines) and, where the broker keeps them, cable dollars (C lines). Each
// broker file keeps its own tariff, sources and wording; this module holds
// what every one of them repeats, and builds the same `roundTrip` /
// `printCli` the earlier BYMA files (../comafi, ../bancosantacruz,
// ../acuantoesta) write by hand, with the same output shape.
//
// Market rights. BYMA, "Derechos de Mercado sobre Operaciones", Agosto 2026
// (file dated 2026-08-14, the only table on BYMA's "Derechos y Membresías"
// page, read 2026-10-26):
//   https://www.byma.com.ar/mercado/regulacion/derechos-membresias
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   CONTADO, PPT, "Privados y Fondos Cerrados en Acciones - Cedear 0,0500"
//   (note 01), each side. "A los valores resultante de aplicar los
//   porcentajes antes indicados se les debe agregar el IVA, excepto en
//   operaciones con Valores Negociables Públicos y Obligaciones
//   Negociables": a share or a CEDEAR takes 21% IVA, 0.0605% a side.
//   Note 01: "uno correspondiente a negociación (0,03%) y otro
//   correspondiente a post trade (0,02%)"; the day-trading bonus (same
//   agent, session, client, species, settlement date and currency) is 35%
//   on a private share, 30% on a CEDEAR, of the post-trade part only:
//   0.007% / 0.006% a side, under 0.01%. Left out; the figure assumes the
//   sale is another day.
//   CONTADO BLOCK (note 04) has a minimum of ARS 300,000,000 (CEDEARs) /
//   500,000,000 (shares) and is not this order.
// BYMA assesses a dollar trade's rights on its peso equivalent at Banco
// Nación's seller close of the day before; this module applies the same
// 0.05% to the dollar notional, as the earlier files do.
//
// No stamp duty, transaction tax or levy is charged on a BYMA share or
// CEDEAR trade; taxMap.mjs names none for these ISINs (the hook stays).
// Caja de Valores bills custody, not the trade. There is no lot size: one
// share or one certificate is the unit.
//
// FX. A line settles in its own currency. When the broker holds that
// currency (deposits.mjs, or `cash` while the folder has no entry yet), no
// FX enters the number and the remark is the MEP quote's half spread (the
// CCL quote for a cable line): dolarapi.com casas "bolsa" and
// "contadoconliqui", read 2026-10-26 06:17 ART (last update 2026-10-25
// 20:58 UTC, Friday's close carried): MEP 1,557.40 / 1,563.90 (0.21%),
// CCL 1,649.20 / 1,654.00 (0.15%). When the broker does not hold it the
// conversion is forced: the total is N/A unless the broker file passes
// `forcedFx` (a one-way fraction it can source), charged twice.
//
// Use, from brokers/<folder>/<folder>_cost.mjs:
//
//   import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";
//   const file = bymaCostFile({
//     folder: "alfyinversiones",
//     name: "Alfy Inversiones",
//     catalogue: new URL("alfyinversiones-parsed.json", import.meta.url),
//     schedule: { url, readOn: "2026-10-26", inForce: "...", entity: "..." },
//     cash: ["ARS", "USD"],
//     commission: { rate: 0.004, minArs: 200 },     // or a function, below
//     basis: "tarif web : 0,40 % + IVA par sens, minimum 200 pesos + IVA ; droits BYMA 0,05 % + IVA",
//     remark: "",                                   // cost facts only, English
//   });
//   export const { roundTrip, SCHEDULE } = file;
//   file.printCli(import.meta.url);
//
// `commission` is either { rate, minArs, minUsd, maxArs, fixed } (a side,
// listing currency, before IVA; minArs is converted for a dollar line,
// minUsd is used instead on a dollar line when the tariff prints one), or
// a function ({ side, notional, n, p, currency, row, cable, cedear, plan,
// floorIn }) => ({ fee, why?, note? }) returning one side's fee in the
// listing currency (null = unknown). `vatOnCommission` (default true) adds
// 21% to it; set false when the tariff prints IVA included. `extras(ctx)`
// returns per-side fixed charges [{ label, amount, vat }] in the listing
// currency (Nación's USD 50 a cable execution, for instance). `market`
// overrides BYMA's 0.05% when the broker prints its own line (Banco Santa
// Cruz 0.08% + IVA; Navarro Viola 0.0951% IVA included, with marketVat:
// false). `plans` = { id: { label, commission, ... } } with `defaultPlan`
// gives PLANS / planOf and reads query.plan, as other plan files do.
//
//   node brokers/bancogalicia/bymaCost.mjs --selftest

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

export const IVA = 0.21;

export const BYMA = {
  name: "BYMA",
  page: "https://www.byma.com.ar/mercado/regulacion/derechos-membresias",
  url: "https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf",
  table: "2026-08-14",
  readOn: "2026-10-26",
  // Contado PPT, private share or CEDEAR, each side, before IVA.
  rate: 0.0005,
  trading: 0.0003,
  postTrade: 0.0002,
  // Day-trading bonus, on the post-trade part only (note 01).
  dayTradeBonus: { share: 0.35, cedear: 0.3 },
  vat: true,
  blockMinArs: { cedear: 300_000_000, share: 500_000_000 },
};

// Buy / sell, pesos per dollar (dolarapi.com), half the spread over the mid.
export const FX_READ = {
  source: "https://dolarapi.com/v1/dolares/bolsa ; https://dolarapi.com/v1/dolares/contadoconliqui",
  readOn: "2026-10-26 06:17 ART",
  updated: "2026-10-25T20:58:00Z",
};
export const MEP = [1557.4, 1563.9];
export const CCL = [1649.2, 1654.0];
export const halfSpread = ([buy, sell]) => (((sell - buy) / (sell + buy)) * 100).toFixed(4);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
export const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

export const BUENOS_AIRES = new Set(["BCBA", "XBUE", "BYMA", "BUENOSAIRES", "MERV", "AR"]);

/** A CEDEAR (ETF certificates included), from bymaBook.mjs's raw "BYMA | CEDEARs | ...". */
export function isCedear(row) {
  return /\|\s*CEDEARs?\s*\|/i.test(String(row?.raw || "")) || /^ARBCOM|^ARCAVA|^ARDEUT/i.test(String(row?.isin || ""));
}

/** A cable (C, contado con liquidación) line: flagged by bymaBook.mjs, "| EXT" in raw, or a peso ticker plus C. */
export function isCable(row, rows = []) {
  if (row?.cable === true) return true;
  if (code(row?.currency) !== "USD") return false;
  if (/\|\s*EXT\s*$/i.test(String(row?.raw || ""))) return true;
  // BYMA's cable symbol does not always extend the peso one (GOOGL → GOGLC,
  // PETR3 → PETRC, ALAB → ALAC): the peso line is found by ISIN.
  if (!code(row?.ticker).endsWith("C") || !row?.isin) return false;
  return rows.some((r) => code(r.currency) === "ARS" && code(r.isin) === code(row.isin));
}

/** "FX x% when cash ≠ CCY." with the MEP quote, or the CCL quote on a cable line. */
export function fxNote(row, rows = []) {
  if (code(row?.currency) === "ARS") return fxRemark(halfSpread(MEP), "ARS");
  return fxRemark(halfSpread(isCable(row, rows) ? CCL : MEP), "USD");
}

/** A peso amount (a minimum) in the listing's currency, through fx.mjs. */
export function floorIn(amountArs, currency) {
  if (amountArs == null) return null;
  if (code(currency) === "ARS") return amountArs;
  const usd = toUsd(amountArs, "ARS");
  const per = usdPer(currency);
  return usd == null || per == null ? null : usd / per;
}

/** BYMA's market rights on one side, IVA included unless the rate already carries it. */
export function marketRights(notional, { rate = BYMA.rate, vat = BYMA.vat } = {}) {
  return notional * rate * (vat ? 1 + IVA : 1);
}

/** One side's commission from a simple { rate, minArs, minUsd, maxArs, fixed } spec, before IVA. */
export function simpleCommission(spec, { notional, currency }) {
  const pct = notional * (spec.rate ?? 0) + (spec.fixed ?? 0);
  const dollarLine = code(currency) !== "ARS";
  let floor = 0;
  if (dollarLine && spec.minUsd != null) {
    const per = usdPer(currency);
    floor = per == null ? null : spec.minUsd / per;
  }
  else if (spec.minArs != null) floor = floorIn(spec.minArs, currency);
  if (floor == null) return { fee: null, why: `pas de taux pour convertir le minimum en ${currency}` };
  let fee = Math.max(pct, floor);
  if (spec.maxArs != null) {
    const cap = floorIn(spec.maxArs, currency);
    if (cap != null) fee = Math.min(fee, cap);
  }
  return { fee, floorBites: floor > pct };
}

/**
 * Build a BYMA cost file. Returns { roundTrip, printCli, SCHEDULE, PLANS, planOf }.
 */
export function bymaCostFile(config) {
  const {
    folder,
    name,
    catalogue: catalogueUrl,
    schedule,
    cash = null,
    commission,
    vatOnCommission = true,
    extras = null,
    market = BYMA.rate,
    marketVat = BYMA.vat,
    forcedFx = null,
    basis = "",
    remark = "",
    onlineBuy = true,
    plans = null,
    defaultPlan = null,
    notes = [],
  } = config;

  const SCHEDULE = { ...schedule, market: BYMA.url, marketOn: BYMA.table, entity: schedule?.entity ?? name };
  const PLANS = plans ? Object.keys(plans) : [];
  const planOf = (q) => {
    const id = String(q?.plan ?? q ?? "").trim().toLowerCase();
    return plans && plans[id] ? id : defaultPlan ?? PLANS[0] ?? "";
  };

  const catalogue = catalogueUrl && fs.existsSync(catalogueUrl) ? JSON.parse(fs.readFileSync(catalogueUrl, "utf8")) : null;
  const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
  if (rows.length) warmListingIndex(rows);

  const holds = (plan, ccy) => (cash ? cash.map(code).includes(code(ccy)) : depositHas(folder, plan, ccy));

  // The page asks by ISIN and names the line's ticker: a CEDEAR's peso, MEP
  // (D) and cable (C) lines share one ISIN, so the asked ticker comes first.
  function findListing({ etf, place, currency, ticker }) {
    const asked = loose(etf);
    const wantTicker = loose(ticker);
    const wantPlace = loose(place);
    const wantCurrency = code(currency);
    const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
    const matches = named
      .map((r) => ({ row: r, ...listingKey(r) }))
      .filter((m) => !wantPlace || BUENOS_AIRES.has(wantPlace) || loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace)
      .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
    if (wantTicker) matches.sort((a, b) => (loose(b.row.ticker) === wantTicker) - (loose(a.row.ticker) === wantTicker));
    return { named, matches };
  }

  function roundTrip({ etf, ticker = null, place, currency, shares, price, bp = null, perShare = null, plan: askedPlan = null, query = null }) {
    const plan = plans ? planOf(askedPlan ?? query?.plan ?? "") : "";
    const P = plan ? { ...config, ...plans[plan] } : config;
    const fee = P.commission ?? commission;
    const answer = {
      usd: null,
      brokerFees: null,
      ccy: QUOTE,
      etf,
      place,
      currency,
      onlineBuy: P.onlineBuy ?? onlineBuy,
      cashCurrency: "",
      url: SCHEDULE.url,
      remark: "",
      ...(plan ? { plan } : {}),
    };
    if (!catalogue) {
      return { ...answer, why: `le catalogue ${name} n'existe pas encore : lancer \`node brokers/${folder}/${folder}_scraping.mjs\`` };
    }
    const { named, matches } = findListing({ etf, place, currency, ticker });
    if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${name}` };
    if (!matches.length) {
      return {
        ...answer,
        why: `${etf} n'est pas coté sur cette place dans cette devise chez ${name}`,
        alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
      };
    }

    const m = matches[0];
    const book = spreadLeaf(spreads, {
      isin: m.row.isin,
      mic: m.venue?.mic ?? null,
      currency: m.row.currency,
      unsourced: m.unsourced,
      broker: folder,
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
    const cable = isCable(m.row, rows);
    const cedear = isCedear(m.row);
    const leaf = book.leaf;
    const marketPerShare = perShare ?? leaf?.perShare ?? null;
    const marketBp = bp ?? (marketPerShare != null ? null : leaf?.bp ?? null);
    const parts = bookParts({
      bp: marketBp,
      perShare: marketPerShare,
      venue: m.venue,
      unsourced: m.unsourced,
      toUsd: (value) => dollars(value, listing.currency),
    });
    const tax = taxesOf(listing.isin);
    const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
    const held = holds(plan, listing.currency);
    const fx = held ? 0 : (P.forcedFx ?? forcedFx);
    const extraRemark = typeof (P.remark ?? remark) === "function" ? (P.remark ?? remark)({ row: m.row, cable, cedear, plan }) : P.remark ?? remark;
    const shared = {
      ...answer,
      listing,
      remark: [held ? fxNote(m.row, rows) : "", extraRemark].filter(Boolean).join(" "),
      cashCurrency: listing.currency,
      bp: marketBp,
      perShare: marketPerShare,
      basis:
        (typeof (P.basis ?? basis) === "function" ? (P.basis ?? basis)({ row: m.row, cable, cedear, plan }) : P.basis ?? basis) +
        (listing.currency === "USD" ? (cable ? " ; ligne câble (C)" : " ; ligne MEP (D)") : ""),
      tax,
      fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
      fxIfConverted: held ? 0 : fx?.pct != null ? fx.pct * 2 : null,
    };
    if (!held && fx?.pct == null) {
      return {
        ...shared,
        why: `change obligatoire : le compte ${name} ne garde pas de ${listing.currency} et ${name} ne publie ni taux ni frais pour y passer`,
      };
    }

    const n = Number(shares);
    const p = Number(price);
    if (!(n > 0 && p > 0)) {
      return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
    }

    const notional = n * p;
    const notionalUsd = dollars(notional, listing.currency);
    const ctxOf = (side) => ({ side, notional, n, p, currency: listing.currency, row: m.row, cable, cedear, plan, floorIn });
    const sides = ["buy", "sell"].map((side) => {
      const ctx = ctxOf(side);
      const c = typeof fee === "function" ? fee(ctx) : simpleCommission(fee, ctx);
      const vatOn = P.vatOnCommission ?? vatOnCommission;
      const base = c?.fee == null ? null : c.fee * (vatOn ? 1 + IVA : 1);
      const ex = (typeof (P.extras ?? extras) === "function" ? (P.extras ?? extras)(ctx) : []) || [];
      const exTotal = ex.reduce((s, e) => (s == null || e.amount == null ? null : s + e.amount * (e.vat ? 1 + IVA : 1)), 0);
      return { side, c, commission: base, extras: exTotal, extraLines: ex };
    });
    const commissionLocal = plus(...sides.map((s) => s.commission));
    const extrasLocal = plus(...sides.map((s) => s.extras));
    const rightsLocal = marketRights(notional, { rate: P.market ?? market, vat: P.marketVat ?? marketVat }) * 2;
    const fxLocal = held ? 0 : notional * fx.pct * 2;
    const commissionUsd = commissionLocal == null ? null : dollars(commissionLocal, listing.currency);
    const extrasUsd = extrasLocal == null ? null : dollars(extrasLocal, listing.currency);
    const fxUsd = dollars(fxLocal, listing.currency);
    const brokerFees = plus(commissionUsd, extrasUsd, fxUsd);
    const bourse = dollars(rightsLocal, listing.currency);
    const bookUsd =
      parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
    const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
    const usd = plus(bookUsd, brokerFees, bourse, taxUsd);
    const whyFee = sides.find((s) => s.commission == null)?.c?.why;
    const confidence = [
      shared.basis,
      ...sides.map((s) => s.c?.note).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i),
      sides.some((s) => s.c?.floorBites) ? "le minimum s'applique à cet ordre" : `commission sur ${notional.toFixed(2)} ${listing.currency}`,
      `droits BYMA ${(100 * (P.market ?? market)).toFixed(4)} %${(P.marketVat ?? marketVat) ? " + IVA" : " IVA compris"} par sens, tableau du ${BYMA.table}`,
      held ? "ligne dans sa devise : pas de change" : `change forcé ${(100 * fx.pct).toFixed(3)} % par sens${fx.basis ? ` (${fx.basis})` : ""}`,
      ...(P.notes ?? notes),
      marketPerShare != null
        ? `carnet ${marketPerShare} $ la part`
        : marketBp != null
          ? `carnet ${marketBp} bp`
          : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
    ].join(" ; ");

    return {
      ...shared,
      usd: finite(usd, 6),
      brokerFees: finite(brokerFees, 6),
      ...(bookUsd == null
        ? { why: `aucun carnet pour ${listing.ticker} sur ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
        : {}),
      ...(commissionUsd == null ? { why: whyFee || `commission inconnue pour cette ligne chez ${name}` } : {}),
      commission:
        typeof fee === "function"
          ? { vat: (P.vatOnCommission ?? vatOnCommission) ? IVA : 0, currency: listing.currency, eachWay: true, sides: sides.map((s) => ({ side: s.side, fee: s.c?.fee ?? null })) }
          : { ...fee, minCurrency: fee.minArs != null ? "ARS" : fee.minUsd != null ? "USD" : null, vat: (P.vatOnCommission ?? vatOnCommission) ? IVA : 0, marketRights: P.market ?? market, currency: listing.currency, eachWay: true },
      trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
      parts: {
        marché: finite(bookUsd, 6),
        courtage: finite(commissionUsd, 6),
        ...(extrasLocal ? { frais: finite(extrasUsd, 6) } : {}),
        ...(fxLocal ? { change: finite(fxUsd, 6) } : {}),
        bourse: finite(bourse, 6),
        taxes: finite(taxUsd, 6),
      },
      confidence,
    };
  }

  function printCli(metaUrl) {
    let called = false;
    try {
      called = metaUrl === pathToFileURL(process.argv[1]).href;
    } catch {
      called = false;
    }
    if (!called) return;
    const flag = (k) => {
      const hit = process.argv.find((arg) => arg.startsWith(`--${k}=`));
      return hit ? hit.split("=").slice(1).join("=") : null;
    };
    if (process.argv.includes("--schedule")) {
      const spec = typeof commission === "function" ? "function" : commission;
      console.log(JSON.stringify({ ...SCHEDULE, commission: spec, plans: PLANS, iva: IVA, marketRights: market, marketVat, mep: MEP, ccl: CCL, fxRead: FX_READ }, null, 2));
      return;
    }
    const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
    if (!etf) {
      console.error(`usage : node brokers/${folder}/${folder}_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]${plans ? " [--plan=id]" : ""}`);
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
      plan: flag("plan"),
    });
    console.log(JSON.stringify(out, null, 2));
  }

  return { roundTrip, printCli, SCHEDULE, PLANS, planOf };
}

// Self-test on Banco Galicia's catalogue with made-up tariffs (not Galicia's).
if (import.meta.url === pathToFileURL(process.argv[1] || "").href && process.argv.includes("--selftest")) {
  const cat = new URL("bancogalicia-parsed.json", import.meta.url);
  const usdArs = 1 / usdPer("ARS");
  const near = (a, b) => Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(b));
  const check = (label, got, want) => {
    const ok = got === want || (typeof want === "number" && got != null && near(got, want));
    console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got} ${ok ? "" : `(want ${want})`}`);
    if (!ok) process.exitCode = 1;
  };
  const simple = bymaCostFile({
    folder: "bancogalicia",
    name: "Test",
    catalogue: cat,
    schedule: { url: "https://example.invalid", readOn: "2026-10-26" },
    cash: ["ARS", "USD"],
    commission: { rate: 0.005, minArs: 500 },
    basis: "test",
  });
  // GGAL pesos: 0.5% of 1,500,000 = 7,500 > 500; + IVA, both sides.
  let o = simple.roundTrip({ etf: "GGAL", place: "BCBA", currency: "ARS", shares: 250, price: 6000 });
  check("GGAL commission USD", o.parts.courtage, (1_500_000 * 0.005 * 1.21 * 2) / usdArs);
  check("GGAL rights USD", o.parts.bourse, (1_500_000 * 0.0005 * 1.21 * 2) / usdArs);
  check("GGAL remark", o.remark, "FX 0.21% when cash ≠ ARS.");
  check("GGAL total has book", o.usd != null, o.parts.marché != null);
  // Small order: minimum 500 pesos bites (0.5% of 20,000 = 100).
  o = simple.roundTrip({ etf: "GGAL", place: "BCBA", currency: "ARS", shares: 2, price: 10000 });
  check("GGAL min bites", o.parts.courtage, (500 * 1.21 * 2) / usdArs);
  // AAPLD MEP line, 1,000 USD: minimum converted, not binding.
  o = simple.roundTrip({ etf: "AAPLD", place: "BCBA", currency: "USD", shares: 56, price: 17.9 });
  check("AAPLD commission", o.parts.courtage, 56 * 17.9 * 0.005 * 1.21 * 2);
  check("AAPLD rights", o.parts.bourse, 56 * 17.9 * 0.0005 * 1.21 * 2);
  check("AAPLD remark", o.remark, "FX 0.21% when cash ≠ USD.");
  // Pesos only, no forced FX printed: a dollar line is N/A.
  const pesos = bymaCostFile({ folder: "bancogalicia", name: "Test", catalogue: cat, schedule: { url: "x" }, cash: ["ARS"], commission: { rate: 0.005 } });
  o = pesos.roundTrip({ etf: "AAPLD", place: "BCBA", currency: "USD", shares: 56, price: 17.9 });
  check("ARS-only dollar line N/A", o.usd, null);
  // A function tariff with a tier and a per-execution fixed fee without IVA, plus plans.
  const tiered = bymaCostFile({
    folder: "alfyinversiones",
    name: "Test",
    catalogue: new URL("../alfyinversiones/alfyinversiones-parsed.json", import.meta.url),
    schedule: { url: "x" },
    cash: ["ARS", "USD"],
    plans: { web: { commission: { rate: 0.003 } }, desk: { commission: { rate: 0.01 }, onlineBuy: false } },
    defaultPlan: "web",
    extras: ({ cable }) => (cable ? [{ label: "cable", amount: 50, vat: false }] : []),
    market: 0.000951,
    marketVat: false,
  });
  o = tiered.roundTrip({ etf: "GGAL", currency: "ARS", shares: 250, price: 6000, plan: "desk" });
  check("plan desk", o.parts.courtage, (1_500_000 * 0.01 * 1.21 * 2) / usdArs);
  check("plan desk onlineBuy", o.onlineBuy, false);
  check("market override IVA incl.", o.parts.bourse, (1_500_000 * 0.000951 * 2) / usdArs);
  const c = tiered.roundTrip({ etf: "AAPLC", currency: "USD", shares: 60, price: 17 });
  console.log(`     AAPLC cable? ${c.basis}`);
  check("cable remark CCL", c.remark, "FX 0.15% when cash ≠ USD.");
  console.log(`     planOf("") = ${tiered.planOf("")}, PLANS = ${tiered.PLANS}`);
}
