// What one round trip costs at Hellenic American Securities
// (Ελληνοαμερικανική Χρηματιστηριακή ΑΕΠΕΥ, Athens): buy n shares at price
// p on the Athens Stock Exchange (zTrade) or, through Interactive Brokers,
// on a US exchange, OTC Markets or a European or Asian exchange, sell them
// back at once, online, in dollars.
//
// Fee annex Δ2 of the client contract (ea_Σύμβαση Παροχής Επενδυτικών
// Υπηρεσιών_17.05.2024, pages 96-100, published as ΑΜΟΙΒΑΙΕΣ-ΧΡΕΩΣΕΙΣ-2.pdf;
// its text layer is garbled, read as images on 2026-10-26). Each side:
//   1. Athens shares (and the ETF), by trade value, whole order at the
//      band's rate, minimum €5.87 a contract note:
//        €0.01 to €2,934.70        1.00 %
//        €2,934.71 to €8,804.11    0.75 %
//        above €8,804.12           0.50 %
//   8. "ΜΕΤΑΒΙΒΑΣΤΙΚΑ - ΕΞΟΔΑ ΚΑΝΟΝΙΣΤΙΚΗΣ ΣΥΜ/ΣΗΣ MIFID II" (transfer,
//      HCMC and MiFID II costs, "Χρέωση ΜΤΒ - ΕΚΚ - MIFID II"), same
//      bands, minimum €6.00 a contract note: 0.25 %, 0.15 %, 0.050 %.
//      Item 11.5 says the Athens exchange's own charges follow ATHEX's
//      decisions; no other Athens figure is printed, so these two lines
//      are the Athens bill.
//   3. "Markets: US-Core Europe- Asia", shares and ETFs, "Brokerage &
//      Settlement", by trade value in dollars:
//        $0.1 to $3,500            $30
//        $3,501 to $10,000         1.00 %
//        $10,001 and above         0.75 %
//      minimum $30 on foreign markets, "για συναλλαγές στις OTC αγορές
//      60,00 $" on OTC. Custody 0.25 % a year (min €50) is not this trip.
//      No SEC or TAF figure is printed: 0, like the other files.
//   11.1 FX: "Η αμοιβή της εταιρείας για την παροχή υπηρεσιών ξένου
//      συναλλάγματος ... κατά ανώτατο ποσοστό 9% επί της αξίας συναλλαγής
//      ανάλογα με το νόμισμα και το ποσό". A rate published only as a
//      ceiling at the firm's discretion is read at its maximum (owner's
//      rule, 2026-10-24): 9 % of the amount each conversion.
//   11.4 "Φόρος Πώλησης 0,20%" on every share sale, which the seller pays
//      to the Greek tax office himself: a personal tax return item (and a
//      2024 text), not a charge on the contract note. Left out; taxes come
//      from taxMap.mjs as on the other files.
// The €5 (or €2) monthly account fee is not a trade.
//
// Cash: client-money accounts in EUR, USD, GBP and NOK (deposits.mjs). A
// line in one of those is a remark, "FX 9% when cash ≠ CCY."; any other
// currency (CHF, SEK, DKK, PLN, CZK, HUF, RON, JPY, HKD, CNH, KRW, TWD, MYR,
// SGD, CAD) converts on the buy and back on the sale at 9 %, in the total.
// Taxes on foreign lines (agoradirect_cost.mjs): stamp / FTT from
// taxMap.mjs by ISIN (UK and Irish stamp on their home books only; taxGap
// = N/A), and the statutory levies: PTM £1.50 a side above £10,000 on a
// UK-registered share in London or on a London-run MTF book; Hong Kong
// stamp 0.1 % a side on a share (HKD rounded up); Stock Connect stamp
// 0.05 % on the sale; Korea 0.2 % on a share sale; Taiwan 0.3 % on a share
// sale, 0.1 % on an ETF sale; Malaysia stamp MYR 1 per 1,000 or part a side
// (max 1,000, none on an ETF), as in ibkrca_cost.mjs.
//
// Books: each row's own book (spreads/). US lines: Hellenic American
// routes abroad through Interactive Brokers (MiFID file: execution venues
// "INTERACTIVE BROKERS"), whose US orders go to Interactive Brokers LLC;
// spreads/rule606.mjs needs `hellenicamerican: "interactivebrokers"` for
// that Q, until then the quoted NBBO. OTC lines: the OTC Markets touch.
//
//   https://www.hellenicamerican.gr/wp-content/uploads/2025/04/ΑΜΟΙΒΑΙΕΣ-ΧΡΕΩΣΕΙΣ-2.pdf
//   https://www.hellenicamerican.gr/wp-content/uploads/2023/03/MiFID23.01.2023.pdf
//   https://www.hellenicamerican.gr/ενημέρωση-πελατών/τραπεζικοι-λογαριασμοι/
//
//   node brokers/hellenicamerican/hellenicamerican_cost.mjs AETF XATH EUR --shares=100 --price=60
//   node brokers/hellenicamerican/hellenicamerican_cost.mjs ACAG XATH EUR --shares=1000 --price=12
//   node brokers/hellenicamerican/hellenicamerican_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/hellenicamerican/hellenicamerican_cost.mjs AAGAF OTCM USD --shares=1000 --price=1
//   node brokers/hellenicamerican/hellenicamerican_cost.mjs 0E5F XETR EUR --shares=100 --price=50
//   node brokers/hellenicamerican/hellenicamerican_cost.mjs 000020 XKRX KRW --shares=100 --price=10000
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "hellenicamerican";
const CATALOGUE = new URL("hellenicamerican-parsed.json", import.meta.url);
const PAGE =
  "https://www.hellenicamerican.gr/wp-content/uploads/2025/04/%CE%91%CE%9C%CE%9F%CE%99%CE%92%CE%91%CE%99%CE%95%CE%A3-%CE%A7%CE%A1%CE%95%CE%A9%CE%A3%CE%95%CE%99%CE%A3-2.pdf";
const READ_ON = "2026-10-26";
const ANNEX = "2024-05-17";

// Athens, EUR, each side: [upper bound of the trade value, rate].
const ATHENS_BANDS = [2934.7, 8804.11];
const ATHENS = { rates: [0.01, 0.0075, 0.005], min: 5.87 };
const ATHENS_MTB = { rates: [0.0025, 0.0015, 0.0005], min: 6 };
// US, Core Europe, Asia, USD, each side.
const ABROAD = { flatUpTo: 3500, flat: 30, midUpTo: 10000, mid: 0.01, high: 0.0075, min: 30, otcMin: 60 };
const FX_MAX = 0.09; // "κατά ανώτατο ποσοστό 9%", each conversion

const US_MICS = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS", "TXSE"]);
const PTM = { each: 1.5, ccy: "GBP", above: 10000 };
const HK_STAMP = 0.001;
const CONNECT_STAMP = 0.0005;
const KR_TAX = 0.002;
const TW = { stock: 0.003, etf: 0.001 };
const MY = { stampPer: 1000, stampMax: 1000 };
const UK_REGISTERED = /^(GB|GG|JE|IM)/;
const LONDON_BOOKS = new Set(["XLON", "AQXE", "CHIX", "TRQX"]);
const STAMP_HOME = {
  GB: new Set(["XLON", "AQXE", "XMSM", "CHIX", "TRQX"]),
  IE: new Set(["XMSM", "XLON", "AQXE", "CHIX", "TRQX"]),
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
// CNH is priced as CNY in fx.mjs.
const fxCode = (c) => (code(c) === "CNH" ? "CNY" : code(c));
const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const v = toUsd(amount, fxCode(currency));
  return v == null ? null : Number(v.toPrecision(12));
};
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  if (fxCode(from) === fxCode(to)) return amount;
  const usd = toUsd(amount, fxCode(from));
  const per = usdPer(fxCode(to));
  return usd == null || !(per > 0) ? null : usd / per;
}
// Cboe Europe, Turquoise and Aquis rows carry IBKR's book (CHIXUK, CHIXDE...).
const ibkrBook = (row) => code(String(row?.raw || "").split(" | ")[4]);

/** One Athens side, EUR: commission and the ΜΤΒ-ΕΚΚ-MiFID II line. */
export function athensSide(value) {
  const band = value <= ATHENS_BANDS[0] ? 0 : value <= ATHENS_BANDS[1] ? 1 : 2;
  return {
    commission: Math.max(ATHENS.min, value * ATHENS.rates[band]),
    mtb: Math.max(ATHENS_MTB.min, value * ATHENS_MTB.rates[band]),
  };
}

/** One side abroad, USD, from the trade value in USD. */
export function abroadSide(valueUsd, otc = false) {
  if (valueUsd == null) return null;
  const raw = valueUsd <= ABROAD.flatUpTo ? ABROAD.flat : valueUsd <= ABROAD.midUpTo ? valueUsd * ABROAD.mid : valueUsd * ABROAD.high;
  return Math.max(otc ? ABROAD.otcMin : ABROAD.min, raw);
}

function marketOf(row, mic, currency) {
  const m = code(mic || row?.mic);
  if (m === "XATH") return currency === "EUR" ? "athens" : null;
  if (m === "OTCM") return "otc";
  if (US_MICS.has(m)) return currency === "USD" ? "us" : null;
  return m ? "abroad" : null;
}

// Statutory levies on a foreign line, in the listing currency, both sides.
function leviesOf({ mic, row, listing, n, notional }) {
  const stock = listing.type === "STOCK";
  const etf = listing.type === "ETF";
  const ccy = listing.currency;
  let native = 0;
  const said = [];
  if (mic === "XHKG" && stock) {
    const side = notional * HK_STAMP;
    native += 2 * (ccy === "HKD" ? Math.ceil(side - 1e-9) : side);
    said.push("droit de timbre de Hong Kong 0,1 % par sens sur une action");
  }
  if ((mic === "XSHG" || mic === "XSHE") && stock) {
    native += notional * CONNECT_STAMP;
    said.push("droit de timbre chinois 0,05 % à la vente (Stock Connect)");
  }
  if (mic === "XKRX" && stock) {
    native += notional * KR_TAX;
    said.push("taxe coréenne 0,2 % sur la vente d'une action");
  }
  if (mic === "XTAI" || mic === "ROCO") {
    const rate = etf ? TW.etf : stock ? TW.stock : 0;
    native += notional * rate;
    if (rate) said.push(`taxe taïwanaise ${(100 * rate).toFixed(1).replace(".", ",")} % sur la vente`);
  }
  if (mic === "XKLS" && !etf) {
    native += 2 * Math.min(MY.stampMax, Math.ceil(notional / MY.stampPer - 1e-9));
    said.push("timbre malaisien 1 MYR par 1 000 (max 1 000) par sens");
  }
  const londonBook = mic === "XLON" || (LONDON_BOOKS.has(mic) && /UK$/.test(ibkrBook(row)));
  if (londonBook && stock && UK_REGISTERED.test(listing.isin || "")) {
    const inGbp = convert(notional, listingCash(ccy), PTM.ccy);
    if (inGbp == null) {
      native = null;
      said.push("prélèvement PTM indécidable : montant non converti en livres");
    } else if (inGbp > PTM.above) {
      const each = convert(PTM.each, PTM.ccy, listingCash(ccy));
      native = each == null ? null : native + 2 * each;
      said.push("prélèvement PTM de 1,50 £ par sens au-delà de 10 000 £");
    }
  }
  return { native, said };
}

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
      if (loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

const BASIS = {
  athens: `annexe tarifaire Hellenic American du ${ANNEX}, relue le ${READ_ON}, Athènes : commission 1 % jusqu'à 2 934,70 €, 0,75 % jusqu'à 8 804,11 €, 0,50 % au-delà (sur tout l'ordre), minimum 5,87 € ; frais « ΜΤΒ - ΕΚΚ - MIFID II » 0,25 %, 0,15 %, 0,05 % sur les mêmes tranches, minimum 6 € ; chaque sens`,
  us: `annexe tarifaire Hellenic American du ${ANNEX}, relue le ${READ_ON}, « US-Core Europe-Asia » : 30 USD jusqu'à 3 500 USD, 1 % jusqu'à 10 000 USD, 0,75 % au-delà, minimum 30 USD, chaque sens ; SEC et TAF non imprimés (0)`,
  otc: `annexe tarifaire Hellenic American du ${ANNEX}, relue le ${READ_ON}, « US-Core Europe-Asia » : 30 USD jusqu'à 3 500 USD, 1 % jusqu'à 10 000 USD, 0,75 % au-delà, minimum 60 USD sur les marchés OTC, chaque sens`,
  abroad: `annexe tarifaire Hellenic American du ${ANNEX}, relue le ${READ_ON}, « US-Core Europe-Asia » (exécution par Interactive Brokers) : 30 USD jusqu'à 3 500 USD, 1 % jusqu'à 10 000 USD, 0,75 % au-delà, minimum 30 USD, chaque sens, sur la valeur convertie en dollars`,
};

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
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Hellenic American n'existe pas encore : lancer `node brokers/hellenicamerican/hellenicamerican_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Hellenic American` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Hellenic American`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
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
  const rowMic = code(m.row.mic || m.venue?.mic);
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? rowMic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const market = marketOf(m.row, rowMic, listing.currency);
  const american = market === "us";
  const settle = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, settle);
  const fxLine = held ? fxRemark((100 * FX_MAX).toFixed(0), settle) : "";
  const basis =
    (BASIS[market] || `annexe tarifaire Hellenic American du ${ANNEX}, relue le ${READ_ON}`) +
    (held ? "" : ` ; ${settle} n'est pas une devise de dépôt : change ${100 * FX_MAX} % (plafond publié) à l'aller et au retour, dans le total`);
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? settle : "EUR",
    basis,
    remark: fxLine,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(fxCode(settle)) },
    fxIfConverted: held ? FX_MAX * 2 : 0,
  };
  if (!market) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} ${listing.currency} n'a pas de ligne dans l'annexe Hellenic American` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = code(listing.currency) === "GBX" ? (n * p) / 100 : n * p;
  const notionalUsd = dollars(notional, settle);

  let commissionUsd;
  let mtbUsd = 0;
  let side;
  if (market === "athens") {
    side = athensSide(notional);
    commissionUsd = dollars(2 * side.commission, "EUR");
    mtbUsd = dollars(2 * side.mtb, "EUR");
  } else {
    side = { commission: abroadSide(notionalUsd, market === "otc") };
    commissionUsd = side.commission == null ? null : 2 * side.commission;
  }
  // Forced conversion: cash into the listing currency on the buy, back on the sale.
  const fxUsd = held ? 0 : notionalUsd == null ? null : notionalUsd * FX_MAX * 2;
  const brokerFees = plus(commissionUsd, fxUsd);

  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const country = (listing.isin || "").slice(0, 2);
  const stampReaches = !STAMP_HOME[country] || STAMP_HOME[country].has(rowMic);
  const taxPct = stampReaches ? Object.values(rates).reduce((s, r) => s + r, 0) : 0;
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;
  const levies = market === "abroad" ? leviesOf({ mic: rowMic, row: m.row, listing, n, notional }) : { native: 0, said: [] };
  const leviesUsd = dollars(levies.native, settle);

  let marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  let marketPerShare = perShare ?? (american ? null : book.leaf?.perShare ?? null);
  if (american && bp == null && perShare == null) {
    marketPerShare = usBookPerShare({ broker: FOLDER, ticker: listing.ticker, fallback: book.leaf?.perShare ?? null });
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (v) => dollars(v, settle),
  });
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, commissionUsd, mtbUsd, fxUsd, taxUsd, leviesUsd);

  const unknown = [
    notionalUsd == null ? `aucun cours en dollars pour ${settle} dans fx.mjs` : null,
    bookUsd == null
      ? american
        ? `pas de carnet 605 pour ${listing.ticker || etf}`
        : `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: settle },
    commission: { ...side, currency: market === "athens" ? "EUR" : "USD", eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      réglementaire: finite(mtbUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(plus(taxUsd, leviesUsd), 6),
    },
    tax,
    confidence: [
      basis,
      taxPct ? `taxe ${Object.entries(rates).map(([k, v]) => `${k} ${(100 * v).toFixed(2)} %`).join(", ")} (taxMap.mjs)` : null,
      ...levies.said,
      market === "athens" ? "taxe grecque de 0,20 % sur les ventes (point 11.4) laissée de côté : à déclarer par le vendeur, pas sur l'avis d'opéré" : null,
      american ? "carnet : 605 × Q d'Interactive Brokers LLC si spreads/rule606.mjs l'associe, sinon NBBO coté" : null,
      "aucun aller-retour réel chez Hellenic American dans ce dépôt",
    ]
      .filter(Boolean)
      .join(" ; "),
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
  if (!etf) {
    console.error("usage : node brokers/hellenicamerican/hellenicamerican_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
