// What one round trip costs at Futuro Casa de Valores (FUTUROCAPITAL S.A.,
// Ecuador): buy n shares at price p, sell them back, in dollars. Ecuadorian
// shares and the two listed funds (Fiducia ETF, LegacyPrime), on the Quito
// and Guayaquil exchanges. Ecuador uses the US dollar.
//
// Read on 2026-10-21.
//   https://www.futurocasadevalores.com/assets/documentos/resolucion-aprobacion/TARIFAS_APROBADAS_FCV_2024.pdf
//     The approved tariff (annex "Tarifas", page 41): "Renta Variable: El
//     costo mínimo por cada operación será de US$ 20,00", per transaction.
//     No rate is printed; it is the floor the portal's figure sits above.
//   https://portafolio.futurocasadevalores.com/  (Acciones, "Simular")
//     Every marketplace line carries comision_casa 1, comision_bolsa 0.09,
//     va_com_casa 50, and the quote the portal prints says: "comisión para
//     la casa de valores es de 1.00% o un mínimo de $50.00, comisión para la
//     bolsa de valores es de 0.09% o un mínimo de $4.00, e inversiones
//     menores a $500 la comisión de bolsa es de valores de $0.00". Its
//     simulator (method C28, re-run on 2026-10-21 on title 5, Banco
//     Pichincha) returns the same: buying 2 shares ($382) pays $50 and $0,
//     10 shares ($1,910) $50 and $4, 1,000 shares ($191,000) $1,910 and
//     $171.90; selling 10 (postura 2, $1,851.80) also pays $50 and $4.
//     Its total is the amount plus those two commissions: no VAT on top.
//
//   House commission     1% of the amount, minimum $50, each side.
//   Exchange commission  0.09% of the amount, minimum $4, each side; $0 on
//                        an amount under $500.
//   Withholding          3% on the commissions, kept by a company client
//                        (retencion 3): not an individual's order.
//   Taxes                none in the simulator; taxMap.mjs is applied anyway
//                        (the rows carry no ISIN, so it names none).
//   Book                 Quito and Guayaquil publish no bid and offer that
//                        spreads/ reads: the total is N/A, the fees are not.
//
// In the total: the book, the house commission and the exchange commission,
// each side. Remark: none. Cash is US dollars (deposits.mjs), the only
// currency of every line, so there is no FX.
//
// Not online: the share page ends on "Solicitar reunión virtual" (a booked
// call with an adviser), and the FAQ says shares are sold by phone or
// WhatsApp. No order screen exists for shares (the portal's only order post
// is for fixed income), so every line is onlineBuy: false.
//
//   node brokers/futuro/futuro_cost.mjs 5 XQUI USD --shares=10 --price=188
//   node brokers/futuro/futuro_cost.mjs 21 XGUA USD --shares=2000 --price=2.08
//   node brokers/futuro/futuro_cost.mjs 8832 XQUI USD --shares=350 --price=1.0623
//   node brokers/futuro/futuro_cost.mjs --schedule
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

const CATALOGUE = new URL("futuro-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://portafolio.futurocasadevalores.com/",
  tariff: "https://www.futurocasadevalores.com/assets/documentos/resolucion-aprobacion/TARIFAS_APROBADAS_FCV_2024.pdf",
  readOn: "2026-10-21",
  entity: "FUTUROCAPITAL S.A., Casa de Valores Futuro (Ecuador)",
};

const HOUSE = 0.01;
const HOUSE_MIN = 50;
const EXCHANGE = 0.0009;
const EXCHANGE_MIN = 4;
const EXCHANGE_FROM = 500;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const houseFee = (amount) => Math.max(amount * HOUSE, HOUSE_MIN);
const exchangeFee = (amount) => (amount < EXCHANGE_FROM ? 0 : Math.max(amount * EXCHANGE, EXCHANGE_MIN));

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
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Futuro n'existe pas encore : lancer `node brokers/futuro/futuro_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Futuro` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Futuro`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "futuro",
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
      `cotation du portail Portafolio relue le ${SCHEDULE.readOn} : commission de la maison 1 %, minimum 50 $, par sens ; ` +
      `commission de bourse 0,09 %, minimum 4 $, nulle sous 500 $, par sens ; ` +
      `tarif approuvé 2024 : minimum 20 $ par opération en renta variable, sans taux`,
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
  const house = houseFee(notional);
  const bourseOne = exchangeFee(notional);
  const brokerFees = dollars(house * 2, listing.currency);
  const bourse = dollars(bourseOne * 2, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, bourse, taxUsd);
  const confidence = [
    shared.basis,
    notional * HOUSE < HOUSE_MIN
      ? `le minimum de 50 $ mord sous ${Math.round(HOUSE_MIN / HOUSE)} $ d'ordre`
      : `1 % de ${notional.toFixed(2)} ${listing.currency}`,
    notional < EXCHANGE_FROM
      ? "ordre sous 500 $ : pas de commission de bourse"
      : notional * EXCHANGE < EXCHANGE_MIN
        ? "le minimum de bourse de 4 $ mord"
        : `0,09 % de ${notional.toFixed(2)} ${listing.currency}`,
    "achat sur rendez-vous virtuel, vente par téléphone ou WhatsApp : pas d'ordre en ligne",
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
      rate: HOUSE,
      min: HOUSE_MIN,
      exchangeRate: EXCHANGE,
      exchangeMin: EXCHANGE_MIN,
      exchangeFrom: EXCHANGE_FROM,
      currency: listing.currency,
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
    console.log(
      JSON.stringify(
        { ...SCHEDULE, house: HOUSE, houseMin: HOUSE_MIN, exchange: EXCHANGE, exchangeMin: EXCHANGE_MIN, exchangeFrom: EXCHANGE_FROM },
        null,
        2,
      ),
    );
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/futuro/futuro_cost.mjs <ticker> [place] [devise] [--shares=n] [--price=p]");
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
    if (parts.bourse != null) console.log(`  bourse         : ${parts.bourse} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(out.why);
  }
  console.log(`achat en ligne   : ${out.onlineBuy === false ? "non" : "oui"}`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
