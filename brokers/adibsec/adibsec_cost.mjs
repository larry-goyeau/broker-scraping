// What one round trip costs at ADIB Securities (Abu Dhabi Islamic Bank's
// brokerage, SCA licence 604041): buy n shares at price p, sell them back
// at once, in dollars. Shari'a-compliant shares and ETFs on ADX, DFM and
// Nasdaq Dubai, Tadawul and Nomu, and the US (NYSE, Nasdaq, NYSE American,
// Texas SE, OTC Markets), online.
//
// Read on 2026-10-28:
//   https://www.adibsecurities.ae/en/Pages/pricing_services.aspx#fees
//     ADX and DFM in text; KSA and US as two images:
//   https://www.adibsecurities.ae/en/PublishingImages/Fees-KSA-EN-2.jpg  (Last-Modified 14 Jan 2026)
//   https://www.adibsecurities.ae/en/PublishingImages/Fees-US-EN-2.jpg   (Last-Modified 6 Jan 2026)
//   https://www.adibsecurities.ae/en/SiteAssets/terms-and-conditions-of-the-trading-account-agreement.pdf
//     "TERMS AND CONDITIONS V11 October 2025", Schedule of fees (pp. 18-19)
//     and the Global Markets (International) terms.
//
// Each side, on the trade value:
//   DFM (AED)    broker 0.125 % ("No minimum fees applied on shares"),
//                market 0.05 % plus a transaction fee of AED 10, ESCA
//                0.05 %, CDS 0.05 %. The page's "Order Fees AED 10 (Fixed)
//                ... collected by the market from both the seller and the
//                buyer" is that same AED 10 (the only AED 10.00 in the
//                Schedule's Transaction Fees column), charged once.
//   ADX (AED)    "The total commission is a maximum 0.150% of the value of
//                each executed order": broker 0.125 % + market 0.025 %. No
//                order fee. The Schedule adds ADX's market incentive
//                program, on accumulated value traded: market and CDS
//                0.025 % to AED 500M, 0.02 % to 750M, 0.015 % to 1B, 0.01 %
//                above (remark).
//   Tadawul,     "Minimum Per Trade" SAR 50 + VAT and "All in KSA Market
//   Nomu (SAR)   Fees" 22 bps + VAT, the same for Online and Landline on
//                the January 2026 image. The October 2025 Schedule still
//                prints Online at SAR 25 and 18 bps; the newer image is
//                charged. One table for both boards. The "TDWL Live Price
//                Feeds + Market Depth" line bills an individual SAR 31.5 +
//                VAT a month at Level 1 ("Charges without live price feeds
//                and market depth") and SAR 52.5 at Level 2 (remark).
//   US (USD)     share price above $1: 1.5 cents a share, minimum $15;
//                below $1: $30 an order up to $2,000, 0.25 % of the order
//                above (minimum $30). "+ Vat" on each. A price of exactly
//                $1 is on neither row and takes the first.
//   VAT          "5% Value Added Tax will be applicable on all of the above
//                schedule of fees (1,2,3 and 4)", section 1 being the
//                commission tables (UAE VAT, Law No. 8 of 2017). Not on the
//                ESCA line, a regulator's levy, as in alwathbah_cost.mjs and
//                Al Ramz's card ("VAT 5% on broker comm., market comm., order
//                fees & CDS"); ADIB's own calculator script (below) taxes
//                0.225 % of DFM's 0.275 % and the AED 10, i.e. all but ESCA.
//
// Nasdaq Dubai is tradable ("What you can trade") but has no fee line on
// the page or in the Schedule. Stand-in: ADIB's UAE broker commission
// 0.125 % (its rate on both ADX and DFM) plus Nasdaq Dubai's own charges
// as BHM Capital prints them (bhmuae_cost.mjs: DIFX 0.10 %, order fee USD 3
// or AED 10), VAT 5 % on all. ADIB's BrokerageFeeCalculator page (content
// "Access denied", script still served) carries an unlabelled third column
// at 0.23 % + 3 with VAT on all, the same shape. NASDAQ_DUBAI_STAND_IN
// switches it off (N/A).
//
// US: the Global Markets terms route orders through an unnamed
// "International Broker" on a pooled account; art. 6.1: "All fees related
// to Trades execution shall be inclusive in such Fees as disclosed in Fees
// table". So SEC, TAF and CAT are inside the table (0 here), and with no
// US broker-dealer named the book is the quoted NBBO
// (../wellstrade/usCost.mjs). OTC lines pay the same table and keep the OTC
// touch. No custody fee on foreign holdings is printed (the "Portfolio
// Holding statement [Total Custody] fees AED 25" is a statement request).
//
// Cash: AED, SAR and USD (deposits.mjs), so every line is in a deposit
// currency and no FX enters the total; FX is a remark. ADIB Securities
// prints no conversion rate (neither the pricing page nor the V11 terms).
// Stand-in: its parent Abu Dhabi Islamic Bank's board, read 2026-10-28,
//   https://www.adib.com/en/pages/currency-rates.aspx
//     "Transfer Buy Rate / Transfer Sell Rate", AED per unit:
//     USD 3.635000 / 3.709500, SAR 0.958798 / 0.998337
//     ("Rates are indicative and for illustrative purposes only").
// The trading account is funded from the client's ADIB bank account (terms
// 3.2-3.5), so a conversion runs at the bank's transfer rate. Half the
// spread is the margin over the mid: USD 1.01 %, SAR 2.02 % (the board's
// mids, 3.67225 and 0.97857, sit on the pegs 3.6725 and 3.6725/3.75). An
// AED line paid from USD or SAR cash takes that currency's margin: 1.01-2.02 %.
// Left out: AED 150 a quarter for platform access, charged only in a
// quarter with no order; account opening and NIN fees.
//
//   node brokers/adibsec/adibsec_cost.mjs ADIB ADX AED --shares=1000 --price=14
//   node brokers/adibsec/adibsec_cost.mjs DIB DFM AED --shares=1000 --price=7
//   node brokers/adibsec/adibsec_cost.mjs DEPA "Nasdaq Dubai" AED --shares=1000 --price=2
//   node brokers/adibsec/adibsec_cost.mjs 4001 Tadawul SAR --shares=100 --price=10
//   node brokers/adibsec/adibsec_cost.mjs 9549 Nomu SAR --shares=100 --price=20
//   node brokers/adibsec/adibsec_cost.mjs FLWS XNAS USD --shares=100 --price=6
//   node brokers/adibsec/adibsec_cost.mjs ABBNY "OTC Markets" USD --shares=20 --price=60
//   node brokers/adibsec/adibsec_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { usRoundTrip } from "../wellstrade/usCost.mjs";

const FOLDER = "adibsec";
const CATALOGUE = new URL("adibsec-parsed.json", import.meta.url);
const PAGE = "https://www.adibsecurities.ae/en/Pages/pricing_services.aspx";
const PAGES = {
  KSA: "https://www.adibsecurities.ae/en/PublishingImages/Fees-KSA-EN-2.jpg",
  US: "https://www.adibsecurities.ae/en/PublishingImages/Fees-US-EN-2.jpg",
  TERMS: "https://www.adibsecurities.ae/en/SiteAssets/terms-and-conditions-of-the-trading-account-agreement.pdf",
};
const READ_ON = "2026-10-28";
const VAT = 0.05;
const DEPOSITS = ["AED", "SAR", "USD"];
const NASDAQ_DUBAI_STAND_IN = true;
// Abu Dhabi Islamic Bank, transfer rates [buy, sell] in AED per unit, read 2026-10-28.
const BANK_FX_URL = "https://www.adib.com/en/pages/currency-rates.aspx";
const BANK_FX = { USD: [3.635, 3.7095], SAR: [0.958798, 0.998337] };
const halfSpread = ([buy, sell]) => ((sell - buy) / (sell + buy)) * 100;

/** "FX x% when cash ≠ CCY." from ADIB's transfer spread against the dirham. */
function fxNote(currency) {
  const ccy = listingCash(currency);
  if (BANK_FX[ccy]) return fxRemark(halfSpread(BANK_FX[ccy]).toFixed(2), currency);
  if (ccy === "AED") {
    const all = Object.values(BANK_FX).map(halfSpread).sort((a, b) => a - b);
    return fxRemark(`${all[0].toFixed(2)}–${all[all.length - 1].toFixed(2)}`, currency);
  }
  return fxRemark("", currency);
}

// Each side, fraction of the trade value; `vat` rides on the line. `ticket`
// is a flat fee each order, in the listing currency, VAT on top. `min` is a
// floor on the sum of the lines (before VAT).
const MARKETS = {
  ADX: {
    lines: [
      { name: "BROKER", rate: 0.00125, vat: VAT },
      { name: "MARKET", rate: 0.00025, vat: VAT },
    ],
  },
  DFM: {
    lines: [
      { name: "BROKER", rate: 0.00125, vat: VAT },
      { name: "MARKET", rate: 0.0005, vat: VAT },
      { name: "ESCA", rate: 0.0005, vat: 0 },
      { name: "CDS", rate: 0.0005, vat: VAT },
    ],
    ticket: { AED: 10 },
  },
  NASDAQDUBAI: {
    standIn: true,
    lines: [
      { name: "BROKER", rate: 0.00125, vat: VAT },
      { name: "DIFX", rate: 0.001, vat: VAT },
    ],
    ticket: { USD: 3, AED: 10 },
  },
  KSA: {
    lines: [{ name: "ALLIN", rate: 0.0022, vat: VAT }],
    min: 50,
  },
};

// ADX market incentive program: market + CDS by accumulated value traded.
const ADX_TIERS = [
  { over: "AED 500M", market: 0.0002 },
  { over: "750M", market: 0.00015 },
  { over: "1B", market: 0.0001 },
];
const KSA_DATA = "Saudi market: SAR 31.5 + VAT a month (SAR 52.5 with live prices).";

// US, each side, USD, before VAT.
const US = { perShare: 0.015, min: 15, cheapFlat: 30, cheapUpTo: 2000, cheapRate: 0.0025, cheapMin: 30, pivot: 1 };

const BASIS = {
  ADX: `barème ADIB Securities relu le ${READ_ON} (page Pricing & Services, Schedule of fees V11 oct. 2025) : ADX, chaque sens, courtage 0,125 % + marché 0,025 % (« maximum 0.150% »), sans frais d'ordre ni minimum ; TVA 5 % sur les deux lignes`,
  DFM: `barème ADIB Securities relu le ${READ_ON} (page Pricing & Services, Schedule of fees V11 oct. 2025) : DFM, chaque sens, courtage 0,125 % sans minimum, marché 0,05 % + 10 AED de frais de transaction, ESCA 0,05 %, CDS 0,05 % ; TVA 5 % sur tout sauf l'ESCA`,
  NASDAQDUBAI: `Nasdaq Dubai : aucun barème ADIB publié. Substitut : courtage ADIB 0,125 % (son taux ADX et DFM) + frais Nasdaq Dubai tels que BHM Capital les imprime (DIFX 0,10 %, frais d'ordre 3 USD ou 10 AED), TVA 5 % sur tout, chaque sens`,
  KSA: `barème ADIB Securities relu le ${READ_ON} (image KSA de janvier 2026) : Tadawul et Nomu, chaque sens, « All in KSA Market Fees » 0,22 %, minimum 50 SAR par ordre, TVA 5 % (TVA émiratie, Schedule section 3)`,
  US: `barème ADIB Securities relu le ${READ_ON} (image USA de janvier 2026) : au-dessus de 1 $, 1,5 cent l'action, minimum 15 $ ; sous 1 $, 30 $ l'ordre jusqu'à 2 000 $, 0,25 % au-delà (minimum 30 $) ; TVA 5 %, chaque sens`,
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const US_MICS = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS", "TXSE", "OTCM"]);

function marketOf(row) {
  const mic = code(row.mic);
  const place = loose(row.exchange);
  if (US_MICS.has(mic) || place.startsWith("OTC")) return "US";
  if (place === "TADAWUL" || place === "NOMU" || mic === "XSAU") return "KSA";
  if (place === "ADX" || mic === "XADS") return "ADX";
  if (place === "DFM" || mic === "XDFM") return "DFM";
  if (place === "NASDAQDUBAI" || mic === "DIFX" || mic === "XDUB") return "NASDAQDUBAI";
  return "";
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
      // Tadawul and Nomu share the XSAU book: the board name decides.
      if (wantPlace === "NOMU" || wantPlace === "TADAWUL") return loose(m.row.exchange) === wantPlace;
      if (loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange).startsWith(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

/** One side, in the listing currency: the lines, the ticket, the VAT. */
export function sideOf(market, notional, currency) {
  const spec = MARKETS[market];
  const lines = {};
  let net = 0;
  let vat = 0;
  for (const l of spec.lines) {
    lines[l.name] = notional * l.rate;
    net += lines[l.name];
  }
  if (spec.min != null && net < spec.min) {
    // The floor is on the whole all-in line (KSA has one line).
    const scale = net > 0 ? spec.min / net : 0;
    for (const l of spec.lines) lines[l.name] = net > 0 ? lines[l.name] * scale : spec.min / spec.lines.length;
    net = spec.min;
  }
  for (const l of spec.lines) vat += lines[l.name] * l.vat;
  const ticket = spec.ticket ? spec.ticket[currency] ?? null : 0;
  if (ticket == null) return null;
  vat += ticket * VAT;
  const broker = market === "KSA" ? net * (1 + VAT) : lines.BROKER * (1 + VAT);
  const total = net + ticket + vat;
  return { lines, ticket, vat, total, broker, market: total - broker };
}

/** US, one side in USD before VAT. */
export function usSide(shares, price) {
  const notional = shares * price;
  if (price >= US.pivot) return Math.max(shares * US.perShare, US.min);
  if (notional <= US.cheapUpTo) return US.cheapFlat;
  return Math.max(notional * US.cheapRate, US.cheapMin);
}

function adxRemark() {
  const spec = MARKETS.ADX.lines;
  const total = spec.reduce((s, l) => s + l.rate * (1 + l.vat), 0);
  const base = spec.find((l) => l.name === "MARKET");
  const parts = ADX_TIERS.map((t, i) => {
    const cut = ((base.rate - t.market) * (1 + base.vat) * 100) / total;
    const x = Number(cut.toFixed(1));
    return i === 0 ? `Over ${t.over} traded: fees are ${x}% lower` : `over ${t.over}: ${x}% lower`;
  });
  return `${parts.join("; ")}.`;
}

const US_SCHEDULE = {
  broker: "ADIB Securities",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGES.US,
  readOn: READ_ON,
  entity: "ADIB Securities LLC (AE, SCA 604041), International Broker non nommé (pooled account)",
  rule606: null,
  cash: "USD",
  deposits: DEPOSITS,
  feeCurrency: "USD",
  ticket: (ctx) => Number((usSide(ctx.shares, ctx.price) * (1 + VAT)).toFixed(6)),
  levies: { sec: false, taf: false, cat: false },
  remark: () => fxNote("USD"),
  basis: BASIS.US,
  notes: (ctx) => [
    ctx.price === US.pivot ? "prix de 1 $ exactement : ni « greater » ni « less than 1$ », ligne au-dessus de 1 $ retenue" : null,
    "SEC, TAF et CAT à 0 : art. 6.1 des conditions Global Markets, « All fees related to Trades execution shall be inclusive in such Fees as disclosed in Fees table »",
    "courtier international non nommé : NBBO coté, sans Q 606",
    ctx.otc ? "OTC : même table que la cote, carnet OTC Markets" : null,
  ].filter(Boolean),
};

export function roundTrip(query = {}) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue ADIB Securities n'existe pas encore : lancer `node brokers/adibsec/adibsec_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ADIB Securities` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ADIB Securities`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const market = marketOf(m.row);
  if (market === "US") {
    const out = usRoundTrip(US_SCHEDULE, {
      ...query,
      etf: m.row.isin || m.row.ticker || etf,
      place: m.row.mic || m.row.exchange,
      currency: m.row.currency,
    });
    return { ...out, etf, place, currency };
  }

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
  const cash = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, cash) || DEPOSITS.includes(cash);
  const remark = [
    m.row.remark,
    market === "ADX" ? adxRemark() : "",
    market === "KSA" ? KSA_DATA : "",
    held ? fxNote(listing.currency) : "",
  ]
    .filter(Boolean)
    .join("\n");
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cash : "",
    url: market === "KSA" ? PAGES.KSA : PAGE,
    remark,
    bp: marketBp,
    perShare: marketPerShare,
    basis: BASIS[market] || "",
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!market) return { ...shared, why: `${listing.brokerExchange} n'a pas de ligne dans le barème ADIB Securities` };
  if (market === "NASDAQDUBAI" && !NASDAQ_DUBAI_STAND_IN) {
    return { ...shared, why: "Nasdaq Dubai : ADIB Securities n'imprime aucun frais pour cette place" };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = sideOf(market, notional, listing.currency);
  if (!side) return { ...shared, why: `pas de frais d'ordre ${market} en ${listing.currency}` };
  const feesUsd = dollars(side.total * 2, listing.currency);
  const brokerFees = dollars(side.broker * 2, listing.currency);
  const marketFees = dollars(side.market * 2, listing.currency);
  // A conversion would only come from a currency the account does not hold.
  const fxUsd = held ? 0 : null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, feesUsd, taxUsd, fxUsd);
  const unknown = [
    held ? null : `change forcé vers ${listing.currency} : ADIB Securities n'imprime pas de taux de change`,
    bookUsd == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      lines: MARKETS[market].lines,
      each: side.lines,
      ticket: side.ticket,
      vat: side.vat,
      eachTotal: side.total,
      currency: listing.currency,
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      marketFees: finite(marketFees, 6),
      taxes: taxTotal ? finite(taxUsd, 6) : null,
    },
    confidence: [
      shared.basis,
      `${side.total.toFixed(2)} ${listing.currency} par sens sur ${notional.toFixed(2)} ${listing.currency}`,
      market === "KSA" ? "barème de janvier 2026 (en ligne = téléphone) retenu contre le Schedule V11 d'oct. 2025 (en ligne 0,18 %, min 25 SAR) ; un seul tableau pour Tadawul et Nomu" : null,
      market === "NASDAQDUBAI" ? "substitut à confirmer ; le script du calculateur ADIB (page refusée) porte une colonne sans titre à 0,23 % + 3, TVA sur tout" : null,
      marketPerShare != null
        ? `carnet ${marketPerShare} par part`
        : marketBp != null
          ? `carnet ${marketBp} pb`
          : `pas de feuille de carnet : ${listing.exchange}`,
      "aucun aller-retour réel ADIB Securities dans ce dépôt",
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
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        { url: PAGE, pages: PAGES, readOn: READ_ON, vat: VAT, markets: MARKETS, adxTiers: ADX_TIERS, us: US, nasdaqDubaiStandIn: NASDAQ_DUBAI_STAND_IN, bankFx: { url: BANK_FX_URL, rates: BANK_FX } },
        null,
        2
      )
    );
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage: node brokers/adibsec/adibsec_cost.mjs <ticker|ISIN> [place] [currency] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(
    JSON.stringify(
      roundTrip({
        etf,
        place,
        currency,
        shares: Number(flag("shares") ?? 10),
        price: Number(flag("price") ?? 0),
        bp: flag("bp") ? Number(flag("bp")) : null,
        perShare: flag("per-share") ? Number(flag("per-share")) : null,
      }),
      null,
      2
    )
  );
}

printCli();
