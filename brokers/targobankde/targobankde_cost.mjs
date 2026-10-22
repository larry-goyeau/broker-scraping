// What one round trip costs at TARGOBANK (Germany): buy n shares at price p,
// sell them back at once, online, in dollars. The Direkt-Depot, the depot
// TARGOBANK opens online for a new client (no TARGOBANK depot in the last
// 12 months), custody free with the online mailbox.
//
// Read 2026-10-21:
//   Preisübersicht (Preis- und Leistungsverzeichnis), "5. Wertpapier-
//   geschäfte", Stand 30. April 2026, pp. 19-21:
//   https://www.targobank.de/de/download/Preisubersicht.pdf
//   Direkt-Depot page and the depot-model page with the place table:
//   https://www.targobank.de/de/vermoegen/direkt-depot.html
//   https://www.targobank.de/de/vermoegen/depot-modelle.html
//
//   Direkthandel (gettex, LS Exchange, Tradegate BSX, TradeREBEL, the
//   cats-Direct MTF issuers and Société Générale): 4.90 € an order,
//   "Für die Orderaufgabe fallen über die Direkthandelsplätze neben der
//   Orderprovision keine weiteren Orderkosten wie Börsenplatzentgelte oder
//   fremde Kosten der Börsen an." (depot-modelle page; PLV B.I: "beträgt
//   die Orderprovision beim An- und Verkauf von Wertpapieren über den
//   Direkthandel 4,90 EUR", depots opened from 1 June 2023).
//   Exchange trading (Xetra and the floors): the Klassik-Depot terms (PLV
//   C.I.1), 0.25 % of the order, floor 8.90 €, cap 34.90 €, plus the
//   Börsenplatzentgelt, Xetra 2.00 € and "alle sonstigen inländischen
//   Parkettbörsen" 3.50 € (Düsseldorf, Frankfurt, Hamburg, Hannover,
//   München, Stuttgart are the "Parkettbörsen" of the place table), plus
//   the exchange's own charges ("fremde Kosten": Courtage, Handels- und
//   Transaktionsentgelte), which TARGOBANK names but does not print. "Ist
//   das Ordervolumen geringer als die Orderprovision, wird die
//   Orderprovision auf die Höhe des Ordervolumens reduziert."
//
// The exchange's own charges, priced from each exchange's list (the same
// lists and the same reading as brokers/consorsbank/consorsbank_cost.mjs,
// which has the URLs), an amount a side:
//   Xetra: Transaktionsentgelt, standard order. TARGOBANK's fee model at
//     Deutsche Börse is not published and no TARGOBANK Xetra statement was
//     found (Portfolio Performance's TARGOBANK samples are all off
//     exchange), so the dearest model, Basic Volume, is used: 0.72 bp,
//     at least 0.90 € (High Volume would be 0.48 bp, at least 0.60 €).
//     ETF fee base capped at 1,000,000 €. Deutsche Börse price list T7,
//     Stand 01.07.2026, §2.1 Tabelle 4, §2.2.1.1/2/4:
//     https://www.cashmarket.deutsche-boerse.com/resource/blob/2689120/b36a095ff6636e83ca1e3bd00ce5688f/data/2026_07_27_dbag_preisv_t7_xontro.pdf
//   Frankfurt floor: TARGOBANK's page says the FWB bills the Handelsentgelt
//     "zusätzlich zum Transaktionsentgelt", so both: Transaktionsentgelt
//     1.44 bp, at least 0.90 € (Basic Volume, §2.3.1.1, base capped at
//     750,000 €) plus Handelsentgelt 5.04 bp, at least 2.52 € (§2.3.2.1).
//   Stuttgart, München, Düsseldorf, Hamburg, Hannover: as in the
//     Consorsbank file (Stuttgart's value bands; München order fee plus
//     specialist courtage; Düsseldorf order fee, courtage on funds/ETPs
//     only; Hamburg/Hannover BÖAG order fee plus courtage, waived on DAX
//     shares to 50,000 € and foreign shares to 25,000 €). A German share
//     outside the DAX up to 25,000 € on Hamburg or Hannover is N/A: the
//     MDAX/SDAX/TecDAX waiver needs index membership the catalogue lacks.
//
// Cash is euro only (deposits.mjs). Every catalogue line is a German place;
// a line in another currency would settle in euro at TARGOBANK's own rate,
// which is not printed: N/A. Partial fills, branch and phone orders, the
// Plus-Depot (volume fee) and Klassik/Starter/Junior are not this trip.
// Taxes (French, Italian, Spanish FTT on the buy) come from taxMap.mjs.
// No US place: no 606.
//
//   node brokers/targobankde/targobankde_cost.mjs DE000A1EWWW0 gettex EUR --shares=10 --price=150
//   node brokers/targobankde/targobankde_cost.mjs DE000A1EWWW0 "Börse Xetra" EUR --shares=10 --price=150
//   node brokers/targobankde/targobankde_cost.mjs IE00B4L5Y983 "Börse Frankfurt" EUR --shares=20 --price=110
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const FOLDER = "targobankde";
const CATALOGUE = new URL("targobankde-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.targobank.de/de/download/Preisubersicht.pdf",
  places: "https://www.targobank.de/de/vermoegen/depot-modelle.html",
  readOn: "2026-10-21",
  entity: "TARGOBANK AG",
};

const DIREKT_EUR = 4.9;
const EXCHANGE = { rate: 0.0025, min: 8.9, max: 34.9 };
const PLACE_FEE = { xetra: 2, floor: 3.5 };

// Place as the catalogue stores it: the order route, the Börsenplatzentgelt
// and the exchange-fee table.
const PLACES = {
  GETTEX: { route: "direkt", label: "gettex" },
  LSEXCHANGE: { route: "direkt", label: "LS Exchange" },
  TRADEGATE: { route: "direkt", label: "Tradegate" },
  TRADEREBEL: { route: "direkt", label: "TradeREBEL" },
  BORSEXETRA: { route: "exchange", label: "Xetra", placeFee: PLACE_FEE.xetra, exchange: "xetra" },
  BORSEFRANKFURT: { route: "exchange", label: "Frankfurt", placeFee: PLACE_FEE.floor, exchange: "frankfurt" },
  BORSESTUTTGART: { route: "exchange", label: "Stuttgart", placeFee: PLACE_FEE.floor, exchange: "stuttgart" },
  BORSEMUNCHEN: { route: "exchange", label: "München", placeFee: PLACE_FEE.floor, exchange: "munich" },
  BORSEDUSSELDORF: { route: "exchange", label: "Düsseldorf", placeFee: PLACE_FEE.floor, exchange: "dusseldorf" },
  BORSEHAMBURG: { route: "exchange", label: "Hamburg", placeFee: PLACE_FEE.floor, exchange: "boag" },
  BORSEHANNOVER: { route: "exchange", label: "Hannover", placeFee: PLACE_FEE.floor, exchange: "boag" },
};

const VAT = 1.19;
const clamp = (value, min, max) => Math.min(max ?? Infinity, Math.max(min ?? 0, value));
const euro = (x) => x.toFixed(2).replace(".", ",");

// DAX 40 on 22 June 2026 (as in the Consorsbank file).
const DAX40 = new Set(
  `
  DE000A1EWWW0 NL0000235190 DE0008404005 DE000BASF111 DE000BAY0017 DE0005200000
  DE0005190003 DE000A1DAHH0 DE000CBK1001 DE0005439004 DE000DTR0CK8 DE0005140008
  DE0005810055 DE0005557508 DE0005552004 DE000ENAG999 DE000FRE5EN2 DE0005785802
  DE0006602006 DE0008402215 DE0006047004 DE0006048432 DE0006070006 DE0006231004
  DE0007100000 DE0006599905 DE000A0D9PT0 DE0008430026 NL0015002SN0 DE0007030009
  DE0007037129 DE0007164600 DE000A12DM80 DE0007236101 DE000ENER6Y0 DE000SHL1006
  DE000SYM9999 DE0007664039 DE000A1ML7J1 DE000ZAL1111
`.split(/\s+/).filter(Boolean),
);

// Börse Stuttgart, Stand 10.07.2026: bands of the order value.
const STUTTGART_DAX = [
  { to: 15000, rate: 0.00062, min: 2.09, max: 63 },
  { to: 50000, rate: 0.00042, min: 9.3, max: 63 },
  { to: Infinity, rate: 0.00036, min: 21, max: 63 },
];
const STUTTGART_SHARE = [
  { to: 15000, rate: 0.00095, min: 2.73, max: 63 },
  { to: 50000, rate: 0.00075, min: 14.25, max: 63 },
  { to: Infinity, rate: 0.0007, min: 37.5, max: 63 },
];
const STUTTGART_ETP = [
  { to: 12100, rate: 0.001 },
  { to: 100000, rate: 0.0004, min: 12.1 },
  { to: Infinity, rate: 0.0001, min: 40 },
];

function kindOf(listing) {
  if (listing.type === "STOCK") return DAX40.has(listing.isin) ? "dax" : "share";
  // FUND here is a listed US closed-end fund, traded as a foreign share.
  if (listing.type === "FUND") return "share";
  if (["ETF", "ETC", "ETN", "ETP"].includes(listing.type)) return "etp";
  return null;
}

// { eur, note } for one side, or { eur: null, why }.
const EXCHANGE_FEE = {
  xetra(v, kind) {
    const base = kind === "etp" ? Math.min(v, 1000000) : v;
    const eur = Math.max(0.9, base * 0.000072);
    return { eur, note: `Transaktionsentgelt Xetra ${euro(eur)} € (0,72 pb, min 0,90 €, modèle Basic Volume)` };
  },
  frankfurt(v) {
    const transaction = Math.max(0.9, Math.min(v, 750000) * 0.000144);
    const trading = Math.max(2.52, v * 0.000504);
    return {
      eur: transaction + trading,
      note: `Francfort : Transaktionsentgelt ${euro(transaction)} € (1,44 pb, min 0,90 €, Basic Volume) + Handelsentgelt ${euro(trading)} € (5,04 pb, min 2,52 €)`,
    };
  },
  stuttgart(v, kind) {
    const steps = kind === "etp" ? STUTTGART_ETP : kind === "dax" ? STUTTGART_DAX : STUTTGART_SHARE;
    const hit = steps.find((s) => v <= s.to);
    const eur = clamp(v * hit.rate, hit.min, hit.max);
    const table = kind === "etp" ? "ETP" : kind === "dax" ? "action du DAX" : "autre action";
    return { eur, note: `Transaktionsentgelt Stuttgart ${euro(eur)} € (${table}, ${(hit.rate * 1000).toFixed(2).replace(".", ",")} ‰, hors TVA)` };
  },
  munich(v, kind) {
    const fee = clamp(v * 0.00029, 1.3, 14) * VAT;
    const courtage = Math.max(0.75, v * (kind === "dax" ? 0.0004 : 0.0008));
    return {
      eur: fee + courtage,
      note: `Munich : entgelt ${euro(fee)} € TTC (0,029 %, min 1,30 €, max 14 €) + courtage ${euro(courtage)} € (${kind === "dax" ? "0,4" : "0,8"} ‰, min 0,75 €)`,
    };
  },
  dusseldorf(v, kind) {
    const fee = (kind === "etp" ? clamp(v * 0.00038, 1, 19) : Math.max(1.3, v * 0.00038)) * VAT;
    const courtage = kind === "etp" ? Math.max(0.75, v * 0.0008) : 0;
    return {
      eur: fee + courtage,
      note:
        `Düsseldorf : entgelt ${euro(fee)} € TTC (3,8 pb, ${kind === "etp" ? "min 1,00 €, max 19 €" : "min 1,30 €"}) + ` +
        (kind === "etp" ? `courtage ${euro(courtage)} € (0,8 ‰, min 0,75 €)` : "courtage 0 (Quality Trading, actions)"),
    };
  },
  boag(v, kind, listing, label) {
    const fee = clamp(v * 0.00025, kind === "etp" ? 1.4 : 1.3, 11) * VAT;
    let courtage;
    if (kind === "etp") courtage = Math.max(0.75, v * 0.0008);
    else if (kind === "dax") courtage = v <= 50000 ? 0 : Math.max(0.75, v * 0.0004);
    else if (!String(listing.isin || "").startsWith("DE")) courtage = v <= 25000 ? 0 : Math.max(0.75, v * 0.0008);
    else if (v > 25000) courtage = Math.max(0.75, v * 0.0008);
    else {
      return {
        eur: null,
        why:
          `${label} : courtage nulle jusqu'à 25 000 € pour une action du MDAX, du TecDAX ou du SDAX, 0,8 ‰ sinon ; ` +
          `l'appartenance à ces indices n'est pas dans le catalogue`,
      };
    }
    return {
      eur: fee + courtage,
      note:
        `${label} : entgelt ${euro(fee)} € TTC (0,25 ‰, min ${kind === "etp" ? "1,40" : "1,30"} €, max 11 €) + ` +
        (courtage > 0
          ? `courtage ${euro(courtage)} €`
          : `courtage 0 (${kind === "dax" ? "action du DAX jusqu'à 50 000 €" : "action étrangère jusqu'à 25 000 €"})`),
    };
  },
};

export function exchangeFeeEur(where, notionalEur, listing) {
  if (!where?.exchange) return { eur: 0 };
  const kind = kindOf(listing);
  if (!kind) return { eur: null, why: `${where.label} : aucune grille de la bourse pour le type ${listing.type || "?"}` };
  return EXCHANGE_FEE[where.exchange](notionalEur, kind, listing, where.label);
}

// The commission of one order in euro, before the place fee.
export function commissionEur(notionalEur, route) {
  const fee = route === "direkt" ? DIREKT_EUR : clamp(notionalEur * EXCHANGE.rate, EXCHANGE.min, EXCHANGE.max);
  return Math.min(fee, notionalEur);
}

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v);
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace || code(m.row.mic) === code(place))
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan,
    onlineBuy: true,
    cashCurrency: "EUR",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue TARGOBANK n'existe pas encore : lancer `node brokers/targobankde/targobankde_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue TARGOBANK` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez TARGOBANK`,
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
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const where = PLACES[loose(listing.brokerExchange)] || null;
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `Preisübersicht TARGOBANK relue le ${SCHEDULE.readOn} (Stand 30. April 2026), Direkt-Depot : ` +
      `Direkthandel 4,90 € par ordre ; bourse 0,25 %, plancher 8,90 €, plafond 34,90 €, ` +
      `plus Börsenplatzentgelt (Xetra 2,00 €, parquets 3,50 €) et frais de la bourse selon sa grille 2026`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), eur: usdPer("EUR") },
  };

  if (!where) return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'est pas une place du barème TARGOBANK` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }
  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const trade = { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency };
  if (listing.currency !== "EUR") {
    return {
      ...shared,
      trade,
      why:
        `une place allemande règle en euro et TARGOBANK convertit ${listing.currency} à son propre cours, ` +
        `non publié pour les titres : change forcé inconnu`,
    };
  }

  const commission = commissionEur(notional, where.route);
  const placeFee = where.placeFee ?? 0;
  const bourse = exchangeFeeEur(where, notional, listing);
  const each = bourse.eur == null ? null : commission + placeFee + bourse.eur;
  const brokerFees = each == null ? null : dollars(each * 2, "EUR");
  const bookUsd = parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const confidence = [
    shared.basis,
    where.route === "direkt"
      ? `Direkthandel ${where.label} : ${euro(commission)} € par ordre, sans Börsenplatzentgelt ni frais de bourse (page des places)`
      : `commission ${euro(commission)} € + Börsenplatzentgelt ${where.label} ${euro(placeFee)} €, par ordre`,
    bourse.note ? `${bourse.note}, par ordre ; modèle d'entgelt de TARGOBANK non publié` : null,
    bourse.why ? `${bourse.why} : total inconnu` : null,
    taxTotal > 0 ? `taxe ${(100 * taxTotal).toFixed(3)} % à l'achat (taxMap)` : null,
    gap ? `${gap} : total inconnu` : null,
    marketPerShare != null ? `carnet ${marketPerShare} $ la part` : marketBp != null ? `carnet ${marketBp} bp` : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  const why = [
    bourse.why || null,
    gap || null,
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(usd == null && why.length ? { why: why.join(" ; ") } : {}),
    commission: {
      route: where.route,
      ...(where.route === "direkt" ? { flat: DIREKT_EUR } : { rate: EXCHANGE.rate, min: EXCHANGE.min, cap: EXCHANGE.max }),
      commissionEach: commission,
      placeEach: placeFee,
      exchangeEach: bourse.eur,
      each,
      currency: "EUR",
      eachWay: true,
    },
    trade,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
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
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage: node brokers/targobankde/targobankde_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} shares at ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`round trip    : ${out.usd == null ? "unknown" : `${out.usd} $`}`);
    console.log(`broker fees   : ${out.brokerFees == null ? "unknown" : `${out.brokerFees} $`}`);
    if (out.parts) for (const [k, v] of Object.entries(out.parts)) console.log(`  ${k.padEnd(12)}: ${v == null ? "unknown" : `${v} $`}`);
  }
  if (out.why) console.log(`\n${out.why}`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
