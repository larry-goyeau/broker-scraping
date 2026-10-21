// What one round trip costs at XTB Chile (XTB Agente de Valores SpA): buy
// n shares at price p, sell them back at once (online, regular hours,
// market), in dollars.
//
// The first 100 000 € of calendar-month turnover (all registered accounts
// together) pays no commission. Past it, 0.2 % of the excess, floored at
// 10 € a trade. `roundTrip` takes the size, and `--spent=` is what the
// month has already booked, in euro. Same formula as brokers/xtb, read
// on XTB Chile's own table.
//
// Tabla de Tarifas y Comisiones of 29 June 2026, section 5 (OMI) and 7
// (local taxes), and the account-and-fees page:
//   https://www.xtb.com/cl/archivos/cl-tabla-de-tarifas-y-comisiones.pdf
//   https://www.xtb.com/cl/cuenta-y-tarifas
// Read on 2026-10-20.
//
//   OMI stocks / ETFs / ETC / ETN
//                      0 % until 100 000 € monthly turnover
//                      then 0.2 % on the excess, minimum 10 €
//   FX on the trade    0.5 % of mid, each way, when cash ≠ listing
//                      ("ask EUR/USD + (0,5% * tipo de cambio medio)")
//
// Cash: a trading account is in USD or EUR (`deposits.mjs`). A listing in
// either keeps `FX 0.50% when cash ≠ CCY.` and no FX in the total. Any
// other currency (GBP, CHF, PLN, CZK, DKK, SEK, NOK) converts on the buy
// and back on the sale: 0.5 % each way, in the total.
//
// Local taxes, section 7: US SEC 0.00206 % of the sale; UK stamp reserve
// tax 0.5 % (1 % on an Irish issuer) on the buy; PTM per trade above
// £10 000; Spain FTT 0.2 %; Italy FTT 0.1 %; France FTT, printed 0.3 %.
// taxMap by ISIN comes first. The fallback uses the current statutory
// rates where the table is stale: Italian FTT 0.2 % on a market buy since
// 1 Jan 2026 (L. 199/2025), French FTT 0.4 % since 1 April 2025 and
// PTM £1.50 (the table prints 0.3 % and £1). A London IOB depositary
// receipt is not a UK issuer and pays no stamp.
//
// Custody 0.2 % a year, minimum 10 € a month, only on the part of the
// average daily portfolio above 250 000 €; inactivity 10 € a month (no
// trade in 365 days and no deposit in 90); a USD withdrawal under 100 USD
// pays 30 USD. None of that is this trip.
//
// US shares: the custody contract (29.06.2026) lets XTB S.A. hold the
// securities at KBC Securities NV and/or DriveWealth LLC; DriveWealth is
// the only US firm named. Until an alias names it, the US book is the
// quoted NBBO.
//   https://www.xtb.com/cl/archivos/contrato-de-custodia-de-valores_clcl.pdf
//
//   node brokers/xtbcl/xtbcl_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/xtbcl/xtbcl_cost.mjs VWCE XETR EUR --shares=10 --price=140
//   node brokers/xtbcl/xtbcl_cost.mjs AAF LSE GBP --shares=1000 --price=3
//   node brokers/xtbcl/xtbcl_cost.mjs AAPL NASDAQ USD --shares=500 --price=230 --spent=95000
//   node brokers/xtbcl/xtbcl_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("xtbcl-parsed.json", import.meta.url);

const SCHEDULE = {
  fees: "https://www.xtb.com/cl/cuenta-y-tarifas",
  table: "https://www.xtb.com/cl/archivos/cl-tabla-de-tarifas-y-comisiones.pdf",
  custody: "https://www.xtb.com/cl/archivos/contrato-de-custodia-de-valores_clcl.pdf",
  readOn: "2026-10-20",
  tableOn: "2026-06-29",
  entity: "XTB Agente de Valores SpA",
  rule606: "drivewealth",
};

const FREE_EUR = 100000;
const RATE = 0.002;
const MIN_EUR = 10;
const FX_EACH = 0.005;
const SEC_RATE = 0.0000206;
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
const UK_STAMP = 0.005;
const IE_STAMP = 0.01;
const OWN_FTT = {
  FR: { name: "FRENCH_TRANSACTION_TAX", rate: 0.004, mics: new Set(["XPAR"]), exchanges: /EURONEXTPARIS|PARIS|XPAR/ },
  ES: { name: "SPANISH_FTT", rate: 0.002, mics: new Set(["XMAD"]), exchanges: /BME|MADRID|XMAD/ },
  IT: { name: "ITALIAN_FTT", rate: 0.002, mics: new Set(["XMIL"]), exchanges: /MILAN|BORSA|XMIL/ },
};
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG", "TXSE", "XCHI"]);
const OMI = new Set(["STOCK", "ETF", "ETC", "ETN"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const isStock = (listing) => code(listing?.type) === "STOCK";
const iob = (listing) => /IOB/.test(loose(listing?.brokerExchange));
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  const a = listingCash(from);
  const b = listingCash(to);
  if (a === b && code(from) !== "GBX") return amount;
  const usd = toUsd(amount, from);
  const per = usdPer(b);
  return usd == null || !(per > 0) ? null : usd / per;
}

/**
 * One side, after `spentEur` of the month has already printed.
 * The floor binds the excess, not the free remainder.
 */
export function commissionSide({ notionalEur, spentEur = 0 }) {
  if (!(notionalEur > 0)) return null;
  const remaining = Math.max(0, FREE_EUR - (Number(spentEur) || 0));
  const excess = Math.max(0, notionalEur - remaining);
  if (excess <= 0) return { charged: 0, excess: 0, raw: 0, floored: false, currency: "EUR" };
  const raw = excess * RATE;
  const charged = Math.max(MIN_EUR, raw);
  return { charged, excess, raw, floored: charged > raw + 1e-8, currency: "EUR" };
}

export function taxesFor(isin, listing) {
  const tax = taxesOf(isin);
  const mapped = taxRates(tax);
  const cc = String(isin || "").slice(0, 2).toUpperCase();
  const mic = code(listing?.mic);
  const ex = loose(listing?.brokerExchange || listing?.exchange);
  if (Object.keys(mapped).length) return { tax, rates: mapped, source: "taxMap" };
  if (!isStock(listing) || iob(listing)) return { tax, rates: {}, source: null };
  if (mic === "XLON") {
    if (cc === "IE") return { tax, rates: { stamp: IE_STAMP }, source: "xtbcl" };
    if (cc === "GB") return { tax, rates: { stamp: UK_STAMP }, source: "xtbcl" };
  }
  const own = OWN_FTT[cc];
  if (own && (own.mics.has(mic) || own.exchanges.test(ex))) {
    return { tax, rates: { [own.name]: own.rate }, source: "xtbcl" };
  }
  return { tax, rates: {}, source: tax?.assumedZero ? "assumedZero" : null };
}

function ptmOf({ listing, notional }) {
  const uk = isStock(listing) && code(listing.mic) === "XLON" && !iob(listing) && /^(GB|JE|GG|IM)/.test(code(listing.isin));
  if (!uk) return { usd: 0, bites: false };
  const gbp = convert(notional, listing.currency, "GBP");
  if (gbp == null) return { usd: null, bites: false };
  if (gbp <= PTM.above) return { usd: 0, bites: false };
  return { usd: dollars(PTM.each * 2, "GBP"), bites: true };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace || exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints; `brokerFees` is XTB's ticket and,
 * when the listing currency is not held, the conversion.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, spent = 0 }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    url: SCHEDULE.table,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue XTB Chile n'existe pas encore : lancer `node brokers/xtbcl/xtbcl_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue XTB Chile` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez XTB Chile`,
      alternatives: named.slice(0, 12).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "xtbcl",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || null,
    brokerExchange: m.row.exchange || null,
  };
  if (!OMI.has(listing.type || "")) {
    return { ...answer, listing, why: `${listing.ticker || listing.isin} n'est pas un OMI chez XTB Chile (${listing.type || "type inconnu"})` };
  }

  const settle = listingCash(listing.currency);
  const held = depositHas("xtbcl", null, settle);
  const american = US_MICS.has(code(listing.mic));
  const { tax, rates, source: taxSource } = taxesFor(listing.isin, listing);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);

  let marketBp = bp ?? book.leaf?.bp ?? null;
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  if (american && bp == null && perShare == null) {
    const quoted = usBookPerShare({ broker: "xtbcl", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }

  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? settle : "",
    remark: held ? fxRemark((100 * FX_EACH).toFixed(2), listing.currency) : "",
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `table XTB Chile du ${SCHEDULE.tableOn}, relue le ${SCHEDULE.readOn} : 0 % jusqu'à ${FREE_EUR} € de volume mensuel, ` +
      `ensuite 0,2 % de l'excédent, minimum 10 €` +
      (held ? "" : ` ; change forcé vers ${settle} : 0,5 % par sens, dans le total (comptes en USD ou EUR seulement)`),
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(settle) },
    fxIfConverted: held ? FX_EACH * 2 : 0,
    spent: Number(spent) || 0,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const notionalEur = convert(notional, listing.currency, "EUR");
  const spentEur = Number(spent) || 0;
  const buy = commissionSide({ notionalEur, spentEur });
  const sell = commissionSide({ notionalEur, spentEur: spentEur + (notionalEur || 0) });
  const commissionUsd = buy && sell ? dollars(buy.charged + sell.charged, "EUR") : null;

  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const levy = ptmOf({ listing, notional });
  const secUsd = american && notionalUsd != null ? notionalUsd * SEC_RATE : 0;
  const fxUsd = held ? 0 : notionalUsd == null ? null : notionalUsd * FX_EACH * 2;
  const brokerFees = plus(commissionUsd, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd, levy.usd, secUsd);

  const side = (leg, name) =>
    !leg.excess
      ? `${name} 0`
      : leg.floored
        ? `${name} au minimum 10 € (l'excédent ${Number(leg.excess.toPrecision(4))} € ne donnerait que ${Number(leg.raw.toPrecision(3))} €)`
        : `${name} ${Number(leg.charged.toPrecision(4))} € sur ${Number(leg.excess.toPrecision(4))} €`;
  const confidence = [
    shared.basis,
    notionalEur != null
      ? `ce trajet ${Number(notionalEur.toPrecision(4))} € × 2${spentEur ? ` après ${spentEur} € déjà comptés` : ""}`
      : null,
    buy && sell ? (buy.charged + sell.charged === 0 ? "sous le seuil : commission 0" : `${side(buy, "achat")}, ${side(sell, "vente")}`) : null,
    held ? `change hors du total : un compte en ${settle} est possible` : null,
    taxTotal
      ? `taxe à l'achat ${Object.entries(rates).map(([k, v]) => `${k} ${(100 * v).toFixed(2)} %`).join(", ")}` +
        (taxSource === "xtbcl" ? ", taux légal (table XTB Chile)" : ", depuis taxMap.mjs")
      : null,
    levy.bites ? `PTM ${PTM.each} £ × 2, le montant dépasse ${PTM.above} £` : null,
    american ? "SEC 0,00206 % de la vente (table, section 7)" : null,
    american
      ? "carnet 605 × Q de DriveWealth une fois l'alias posé, sinon NBBO coté"
      : marketBp != null
        ? `carnet ${Number(marketBp.toPrecision(4))} bp`
        : null,
    "hors total : garde 0,2 %/an au-delà de 250 000 € de portefeuille moyen, inactivité 10 €/mois, retrait < 100 USD 30 USD",
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      notionalEur: finite(notionalEur, 6),
      currency: listing.currency,
    },
    commission: { rate: RATE, min: MIN_EUR, minCurrency: "EUR", freeUntil: FREE_EUR, spent: spentEur, buy, sell, currency: "EUR", eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      réglementaire: finite(secUsd, 6),
      taxes: finite(plus(taxUsd, levy.usd), 6),
    },
    ptm: levy.bites ? { gbp: PTM.each * 2, usd: finite(levy.usd, 6), above: PTM.above } : null,
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          freeEur: FREE_EUR,
          rate: RATE,
          minEur: MIN_EUR,
          fx: FX_EACH,
          sec: SEC_RATE,
          ptm: PTM,
          ownFtt: Object.fromEntries(Object.entries(OWN_FTT).map(([k, v]) => [k, { name: v.name, rate: v.rate }])),
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error(
      "usage : node brokers/xtbcl/xtbcl_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--spent=eur] [--json]",
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    spent: flag("spent") ? Number(flag("spent")) : 0,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) console.log(`\nce que XTB Chile propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }
  console.log(`XTB Chile — ${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n",
    );
  }
  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
  }
  console.log();
  for (const line of (out.confidence || out.basis || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
