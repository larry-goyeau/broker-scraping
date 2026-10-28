// What one round trip costs at ViViBanca (ViViBanca S.p.A., Turin): buy n
// shares at price p on Euronext Milan, sell them back at once, online
// (MITO), in dollars. Shares of Euronext Milan and the ETFs, ETCs and ETNs
// of ETFplus, all in euros.
//
// "Foglio informativo relativo al servizio di custodia e amministrazione di
// strumenti finanziari", TRS-FIBA-CASF, "Versione 7 del 19-11-2024", read on
// 2026-10-26 (the transparency page still links this version):
//   https://vivibanca.it/public/upload/deposito_titoli.pdf
//
//   Commissioni di collocamento e raccolta ordini, each order:
//     "Azionario Italia  0,50% del valore dell'operazione (Min. Euro 5,00)"
//   Spese massime di gestione e di amministrazione:
//     "Spese per ogni ordine eseguito  Euro 10,00"      added on each leg
//     "Titoli diversi dai Titoli di Stato  Euro 75,00 annui"   custody, remark
//   The sheet has no separate ETF line: ETFplus lines take "Azionario
//   Italia" like the shares (the Milan market, Italian or foreign issuer).
//
// "Foglio informativo ... Home Banking/MITO", agg.to al 29/11/2024:
//   https://vivibanca.it/public/upload/homebanking_mito.pdf
//     "Canone trading Online  Euro 1,50" a month     remark
//   MITO prints no commission of its own: orders placed online pay the
//   custody sheet's tariff above.
//
// Formula, per leg: max(5 €, 0.50 % × amount) + 10 €; round trip = 2 legs,
// plus the book (spreads), plus the Italian FTT on the buy from taxMap.mjs
// (an IT share with no tax-map line is N/A, taxGap). The account is in
// euros and every catalogue line trades in euros: no FX.
//
// Left out: custody (75 € a year) and the trading fee (1.50 € a month),
// remark only; imposta di bollo on the statement (a state tax on holdings,
// not on the trade); market-data profiles (optional); "Azionario Estero"
// (0.70 %, min 30 €), not this place.
//
//   node brokers/vivibanca/vivibanca_cost.mjs ENI XMIL EUR --shares=70 --price=14.2
//   node brokers/vivibanca/vivibanca_cost.mjs CSSPX XMIL EUR --shares=1 --price=640
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("vivibanca-parsed.json", import.meta.url);
const PAGE = "https://vivibanca.it/public/upload/deposito_titoli.pdf";
const READ_ON = "2026-10-26";
const VERSION = "7 del 19-11-2024";
const HELD = new Set(["EUR"]);
const TARIFF = { rate: 0.005, min: 5, perOrder: 10, ccy: "EUR" };

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

// One leg, in euros: 0.50 % min 5 € commission, plus 10 € per executed order.
export function commissionEach(amount) {
  if (amount == null) return null;
  return Math.max(TARIFF.min, amount * TARIFF.rate);
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
    cashCurrency: "EUR",
    url: PAGE,
    remark: "Custody is €75 a year. Online trading fee is €1.50 a month.",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue ViViBanca n'existe pas encore : lancer `node brokers/vivibanca/vivibanca_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ViViBanca` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ViViBanca`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "vivibanca",
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
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = listing.isin ? taxesOf(listing.isin) : null;
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const basis =
    `foglio informativo custodia e amministrazione ViViBanca versione ${VERSION}, relu le ${READ_ON} : ` +
    `« Azionario Italia » 0,50 % du montant (min 5 €) par ordre, plus « spese per ogni ordine eseguito » 10 € par ordre`;
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    basis,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!HELD.has(listing.currency)) {
    return { ...shared, why: `${listing.currency} : le compte ViViBanca est en euros et la banque n'imprime aucun taux de change` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = commissionEach(notional);
  const commissionUsd = dollars(each * 2, TARIFF.ccy);
  const orderUsd = dollars(TARIFF.perOrder * 2, TARIFF.ccy);
  const brokerFees = plus(commissionUsd, orderUsd);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const unknown = [
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    commission: { each, perOrder: TARIFF.perOrder, currency: TARIFF.ccy, eachWay: true, rate: TARIFF.rate, min: TARIFF.min },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      frais: finite(orderUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      basis,
      taxTotal ? `taxe à l'achat ${(taxTotal * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe dans taxMap.mjs pour cet ISIN",
      "les montants du foglio sont des maxima (« spese e commissioni massime ») : pris tels quels",
    ].join(" ; "),
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
