// What one round trip costs at Maiorano & Cía. Sociedad de Bolsa S.A.
// (Montevideo corredor de bolsa): buy n shares at price p on the Bolsa de
// Valores de Montevideo (BVM, MIC XMNT), sell them back, in dollars. Every
// BVM share line trades in US dollars.
//
// Read on 2026-10-26.
//   https://www.maiorano.com.uy/files/legal/Tarifario%20MAIORANO.pdf
//     "TARIFAS MAIORANO INVERSIONES FINANCIERAS", columns Mínimo / Máximo,
//     "VIGENCIA: Octubre 2023", "Las tarifas no incluyen el IVA":
//     "Ejecución de órdenes   1% - mín. USD 100   2,50%"
//     "Ticket ejecución de órdenes   -   USD 15"
//     "Mantenimiento de cuenta, custodia y administración de valores -
//      Comisión anual*   USD 120   0,20%" (* charged quarterly on the
//     valued portfolio).
//   The order fee is a range at the firm's discretion: the maximum is taken
//   (owner's rule), 2.50% of the amount, never below the USD 100 floor of
//   the bottom of the range; the ticket is the USD 15 maximum, per order.
//
//   Execution        max(2.50% of the amount, USD 100), each side.
//   Ticket           USD 15, each side.
//   IVA              22% (Uruguay's basic rate) on both, since the tariff
//                    is printed without VAT.
//   Taxes            taxMap.mjs (it names none for UY ISINs).
//   Book             the BVM publishes no bid and offer that spreads/ reads:
//                    the total is N/A, the fees are not.
//
// Left out: the BVM's own fees (the tariff names none to the client), the
// optional advisory fee ("Comisión Asesoramiento Integral" 0.50%-1%), and
// custody, which is in the remark (0.20% a year, at least USD 120, plus
// VAT). Cash is US dollars or pesos (the firm runs plans "en pesos y
// dólares"); every BVM share line is in USD, so there is no FX.
//
// Not online: the site's "Trading online" page is a bare login form with no
// target, the client web ("Tu Portfolio") is for viewing the account, and
// orders go through the "Mesa de Operaciones" under the advisory tariff, so
// every line is onlineBuy: false.
//
//   node brokers/maioranocia/maioranocia_cost.mjs ZORZAL XMNT USD --shares=450 --price=2.2
//   node brokers/maioranocia/maioranocia_cost.mjs VALENTIN XMNT USD --shares=160 --price=6.35
//   node brokers/maioranocia/maioranocia_cost.mjs GRALAESC XMNT USD --shares=50 --price=900
//   node brokers/maioranocia/maioranocia_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("maioranocia-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.maiorano.com.uy/files/legal/Tarifario%20MAIORANO.pdf",
  readOn: "2026-10-26",
  validFrom: "2023-10",
  entity: "Maiorano & Cía. Sociedad de Bolsa S.A. (Uruguay)",
};

const RATE = 0.025; // top of "1% - mín. USD 100 … 2,50%"
const RATE_MIN = 100; // USD
const TICKET = 15; // USD, per order
const IVA = 0.22;
const FEE_CCY = "USD";

const REMARK = "Custody 0.2% a year, at least USD 120, plus VAT.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// One side, in USD, before VAT.
const executionFee = (amountUsd) => Math.max(amountUsd * RATE, RATE_MIN);

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
    onlineBuy: false,
    cashCurrency: "",
    url: SCHEDULE.url,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Maiorano n'existe pas encore : lancer `node brokers/maioranocia/maioranocia_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Maiorano` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Maiorano`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "maioranocia",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? code(m.row.mic) ?? null,
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
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `tarifaire Maiorano (vigueur octobre 2023) relu le ${SCHEDULE.readOn} : exécution d'ordres de 1 % (minimum 100 USD) à 2,50 %, ` +
      `fourchette au choix de la maison donc 2,50 % retenu, jamais sous 100 USD, par sens ; ticket d'exécution jusqu'à 15 USD par ordre ; ` +
      `tarifs hors IVA, IVA uruguayenne 22 % ajoutée`,
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
  const execOne = notionalUsd == null ? null : executionFee(notionalUsd);
  const commission = execOne == null ? null : execOne * 2;
  const ticket = TICKET * 2;
  const iva = commission == null ? null : (commission + ticket) * IVA;
  const brokerFees = commission == null ? null : commission + ticket + iva;
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    notionalUsd != null && notionalUsd * RATE < RATE_MIN
      ? `le minimum de 100 USD mord sous ${Math.round(RATE_MIN / RATE)} USD d'ordre`
      : `2,50 % de ${notional.toFixed(2)} ${listing.currency}`,
    "ordres passés par la table d'opérations (pas d'écran d'ordre en ligne) : achat hors ligne",
    "ligne en dollars, compte en dollars : pas de change",
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
    commission: {
      rate: RATE,
      min: RATE_MIN,
      ticket: TICKET,
      vat: IVA,
      currency: FEE_CCY,
      eachWay: true,
    },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commission, 6),
      ticket: finite(ticket, 6),
      iva: finite(iva, 6),
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, rateMin: RATE_MIN, ticket: TICKET, vat: IVA, currency: FEE_CCY, remark: REMARK }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/maioranocia/maioranocia_cost.mjs <ticker> [place] [devise] [--shares=n] [--price=p]");
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
    if (parts.ticket != null) console.log(`  ticket         : ${parts.ticket} $`);
    if (parts.iva != null) console.log(`  IVA            : ${parts.iva} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(out.why);
  }
  console.log(`achat en ligne   : ${out.onlineBuy === false ? "non" : "oui"}`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
