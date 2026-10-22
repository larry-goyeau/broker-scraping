// What one round trip costs at Banco Hipotecario (Búho Inversor, the bank's
// own ALyC, agent no. 40): buy n shares at price p, sell them back at once,
// in dollars. Buenos Aires shares and CEDEARs (ETF certificates included),
// in pesos, MEP dollars ("Dólar efectivo", D lines) or cable dollars ("Dólar
// cable o transferencia", C lines), ordered online in Home Banking or the
// app. Bonds, letters, cauciones, options and futures stay out.
//
// Read on 2026-10-21. The fee page "Comisiones, cargos y tasas" (dated
// 2026-10-13 on the page), section "Cuenta comitente", the same table under
// every client segment (cartera general, plan sueldo, packs).
//   https://www.hipotecario.com.ar/personas/comisiones-cargos-y-tasas/
//   https://www.hipotecario.com.ar/buhobank/buho-inversor/
//
//   Shares and CEDEARs   "Acciones - Operaciones de Compra/Venta":
//                        "INTERNET 0.60%", minimum "$ 75.00", each side.
//                        The page has no separate CEDEAR line; Búho
//                        Inversor prices "compra/ venta de Acciones y
//                        Cedears" together. The minimum is in pesos; a
//                        dollar line takes its peso equivalent (the page:
//                        a dollar order's fee is debited in pesos at the
//                        official rate).
//   IVA                  "Las comisiones indicadas incluyen IVA, excepto
//                        las que estén expresadas en % se deberá adicionar
//                        IVA." The 0.60% takes 21% IVA; the 75-peso
//                        minimum already includes it.
//   Market rights        Printed by the bank under the same table:
//                        "DERECHOS DE MERCADO: ACCIONES - TÍTULOS PRIVADOS
//                        - OBLIG. NEG. - CEDEAR: 0.08%", each side. A
//                        percentage, so plus 21% IVA by the page's rule.
//   Custody              "Custodia Acciones 0.1% anual sobre la posición
//                        valuada promedio del mes", plus IVA (0.121% a
//                        year): the remark.
//   Welcome offer        Búho Inversor: "Comisión 0% por un año" (shown when
//                        ordering, not debited at settlement). Footnote
//                        (1): from 2026-05-10 to 2027-05-10, for a person
//                        not a client of the bank in the last 12 months who
//                        opens Búho Inversor through Búho Bank; 12 months
//                        from opening; buy/sell commissions only, on
//                        digital channels (shares and CEDEARs included).
//                        Market rights are not named in the offer. The
//                        total is the standing rate; the offer is the
//                        remark.
//   The page prints no same-session waiver; the figure assumes another
//   day. A dividend (1.00%), a transfer out to another custodian or abroad
//   (0.60%) and a Caja de Valores certificate are not this order.
//
// In the total: the book, 0.60% + IVA (minimum 75 pesos) each side, market
// rights 0.08% + IVA each side, and a tax when taxMap.mjs names one.
// Remarks: the first-year 0% commission, custody, and the MEP or CCL
// conversion.
//
// Cash: a peso and a dollar caja de ahorro at the bank (deposits.mjs ARS
// and USD), so a line settles in its own currency and no FX enters the
// number. Paying a peso line from dollars, or a dollar line from pesos, is
// the MEP quote (a cable line: the CCL quote). Half the buy/sell spread,
// 2026-10-20 16:01 ART (dolarapi.com, casas "bolsa" and
// "contadoconliqui", as for Comafi and GIO), is the remark: MEP
// 1,543.50 / 1,545.30, CCL 1,628.10 / 1,629.10.
//
//   node brokers/hipotecario/hipotecario_cost.mjs GGAL BCBA ARS --shares=10 --price=5940
//   node brokers/hipotecario/hipotecario_cost.mjs SPY BCBA ARS --shares=20 --price=20990
//   node brokers/hipotecario/hipotecario_cost.mjs AAPLD BCBA USD --shares=10 --price=17.90
//   node brokers/hipotecario/hipotecario_cost.mjs SPYC BCBA USD --shares=100 --price=13.60
//   node brokers/hipotecario/hipotecario_cost.mjs SPYD BCBA USD --shares=1 --price=13.60
//   node brokers/hipotecario/hipotecario_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("hipotecario-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.hipotecario.com.ar/personas/comisiones-cargos-y-tasas/",
  offer: "https://www.hipotecario.com.ar/buhobank/buho-inversor/",
  readOn: "2026-10-21",
  inForce: "2026-10-13",
  entity: "Banco Hipotecario S.A. (ALyC n° 40)",
};

const IVA = 0.21;
const RATE = 0.006;
const MIN_ARS = 75; // IVA included
const MARKET = 0.0008;
const CUSTODY = "Custody is 0.1% a year plus VAT.";
const OFFER = "Commission is 0% the first year for a new client.";
// Buy / sell, pesos per dollar, 2026-10-20 16:01 ART. Half the spread over the mid.
const MEP = [1543.5, 1545.3];
const CCL = [1628.1, 1629.1];
const half = ([buy, sell]) => (((sell - buy) / (sell + buy)) * 100).toFixed(3);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

// The bank's board names the settlement of each line: "Dólar cable o
// transferencia" is the cable line (a peso ticker can itself end in C or D).
const isCable = (row) => code(row.currency) === "USD" && /cable/i.test(String(row.raw || ""));
function fxNote(row) {
  if (code(row.currency) === "ARS") return fxRemark(half(MEP), "ARS");
  return fxRemark(half(isCable(row) ? CCL : MEP), "USD");
}

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const withIva = (amount) => amount * (1 + IVA);

// The peso floor in the listing's currency (a MEP or cable line is in dollars).
const floorIn = (currency) => {
  if (code(currency) === "ARS") return MIN_ARS;
  const usd = toUsd(MIN_ARS, "ARS");
  const per = usdPer(currency);
  return usd == null || per == null ? null : usd / per;
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace)
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
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
    cashCurrency: "",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Hipotecario n'existe pas encore : lancer `node brokers/hipotecario/hipotecario_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Hipotecario` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Hipotecario`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
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
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
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
  const cable = isCable(m.row);
  const shared = {
    ...answer,
    listing,
    remark: [OFFER, CUSTODY, fxNote(m.row)].join(" "),
    cashCurrency: listing.currency,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `page « Comisiones, cargos y tasas » du ${SCHEDULE.inForce}, relue le ${SCHEDULE.readOn}, cuenta comitente : ` +
      `actions et CEDEAR 0,60 % + IVA par exécution sur Internet, minimum 75 pesos IVA compris ; ` +
      `droits de marché 0,08 % + IVA, imprimés par la banque` +
      (listing.currency === "USD" ? (cable ? " ; ligne câble (C)" : " ; ligne MEP (D)") : ""),
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const floor = floorIn(listing.currency);
  const each = floor == null ? null : Math.max(withIva(notional * RATE), floor);
  const commission = each == null ? null : each * 2;
  const rights = withIva(notional * MARKET) * 2;
  const brokerFees = commission == null ? null : dollars(commission, listing.currency);
  const bourse = dollars(rights, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, bourse, taxUsd);
  const floorBites = floor != null && withIva(notional * RATE) < floor;
  const confidence = [
    shared.basis,
    floorBites
      ? `le minimum de 75 pesos mord sous ${Math.round(MIN_ARS / withIva(RATE))} pesos d'ordre`
      : `0,60 % + IVA de ${notional.toFixed(2)} ${listing.currency}`,
    "taux standard : la gratuité de la première année (Búho Inversor) est en remarque ; les droits de marché ne sont pas nommés dans l'offre",
    "ligne dans sa devise : pas de change ; sur une ligne en dollars la commission est débitée en pesos au taux officiel",
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
    commission: { rate: RATE, min: MIN_ARS, minCurrency: "ARS", vat: IVA, minIncludesVat: true, currency: listing.currency, eachWay: true },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    ...(brokerFees == null ? { why: `pas de taux pour convertir le minimum de 75 pesos en ${listing.currency}` } : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      bourse: finite(bourse, 6),
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, minArs: MIN_ARS, marketRights: MARKET, iva: IVA, mep: MEP, ccl: CCL }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/hipotecario/hipotecario_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    return;
  }
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.bourse) console.log(`  marché         : ${parts.bourse} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(out.why);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
