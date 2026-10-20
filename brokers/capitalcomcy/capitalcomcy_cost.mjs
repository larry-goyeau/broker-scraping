// What one round trip costs at Capital.com (EU), real share dealing: buy n
// shares at price p, sell them back at once, online, in dollars.
//
// Capital Com Group Ltd (Cyprus, CySEC 463/25). Stocks and ETFs only, not
// the CFD or knock-out book. Read on 2026-10-20:
//
//   commission        none: "The spread is the only cost the client pays
//                     when they actively open or close a trade" and "The
//                     Company does not charge any additional commissions
//                     or entry/exit fees" (Order Execution Policy V2.1,
//                     Sept 2026, §7); the stocks fee page lists no ticket
//   FX markup         0.4% of spot when the instrument's currency is not
//                     the account's, on the buy and on the sell
//   deposit / withdrawal / opening / closing   no fee
//
// The account holds EUR, USD, GBP or PLN (deposits.mjs). A line in one of
// those (GBX settles in GBP) is bought from a matching account, and the
// remark says "FX 0.4% when cash ≠ CCY." Copenhagen, Stockholm, Oslo and
// SIX trade in DKK, SEK, NOK and CHF, which no account holds, so the 0.4%
// is forced on each side and sits in the total.
//
// Pass-throughs, "set by the relevant exchange or regulator, not by
// Capital.com" (Regulatory Taxes on Equities, EU clients):
//
//   US SEC            $20.60 per $1,000,000 sold
//   FINRA TAF         $0.00 on trades executed 1 Oct – 31 Dec 2026; from
//                     1 January 2027 $0.000195 a share sold, min $0.01,
//                     max $9.79 a trade (applied by date below)
//   CAT               $0.000009 a share, buy and sell
//   UK stamp / SDRT   0.5% on the buy of a UK-incorporated share, not on
//                     ETFs, AIM, ADRs or shares listed under 3 years
//   PTM levy          £1.50 a side on a UK-listed stock trade over £10,000
//   ITP levy          €1.25 a side on an Irish-listed stock trade over
//                     €12,500
//   Irish stamp       1% on the buy of an Irish-incorporated share
//   French FTT        0.40% on the buy, official list (> €1bn)
//   Italian FTT       0.20% on the buy, unless on the exempt list
//   Spanish FTT       0.20% on the buy, official list (> €1bn)
//
// The tax map (Trading212's ex-ante) gives the French and UK lines by ISIN.
// It measured zero on every Spanish and Italian line and holds no Irish
// one, so Capital.com's printed Spanish 0.20%, Italian 0.20% and Irish 1%
// are charged on a share of that country bought on its home book (Madrid,
// Milan, Euronext Dublin), the same way bux, bunq, oandapl and xtb carry
// the rate their broker prints. The exempt / official lists are not in
// this repository: a small Spanish or Italian cap is charged as a large
// one.
//
// Execution. Every order goes to GTN Europe Financial Services Limited
// (FCA 1003343). A share with an EEA ISIN is executed by GTN on regulated
// markets, MTFs or SIs; every other share, and every fractional order, is
// filled OTC with GTN. The OTC price is the venue's: "the spreads quoted
// on the Company's trading platform will be provided directly by the
// relevant trading venues" (§7), and a fraction is priced "by reference to
// the prevailing market price of the corresponding full unit instrument on
// the most relevant trading venue" (§6.2). So an OTC fill keeps the
// listing venue's book, as bux (internaliser, proxy book) and revolut
// (fractions OTC, Tradegate book) do; N26's sterling line goes N/A only
// because its bank fill has no venue book at all.
//
// The US book. Neither Capital.com's policy nor GTN Europe's (Sept 2024,
// §1.14: international equities "via a DMA platform and/or transmission to
// a brokerage firm in the local market") names a US executing dealer.
// GTN's US affiliate, GTN Americas Financial Services, Inc. (CRD 315499),
// does file a Rule 606 (2026 Q2: Citadel 39.8%, Jane Street 36.9%, Two
// Sigma 23.3% of market and marketable-limit flow), but no document says
// Capital.com's US orders go through it. The owner chose that 606
// (2026-10-20): the alias capitalcomcy → gtnamericas in spreads/rule606.mjs
// gives the US book that Q. Texas Stock Exchange lines are the same NBBO
// and read the US tape.
//
// No plan, no custody fee printed for stocks.
//
//   https://capital.com/en-eu/ways-to-trade/fees-and-charges/stocks
//   https://capital.com/fees-and-charges-stocks-cysec
//     -> https://img.capital.com/docs/Capital_com_Regulatory_Taxes_Equities.pdf
//   https://capital.com/order-execution-policy-cceu
//     -> https://img.capital.com/docs/Order-Execution-Policy-V2.1.pdf
//   https://gtngroup.com/wp-content/uploads/2024/09/GTN-Europe-Order-Execution-Policy-Sep-24.pdf
//   https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip (315499_…)
//     (all read on 2026-10-20)
//
//   node brokers/capitalcomcy/capitalcomcy_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/capitalcomcy/capitalcomcy_cost.mjs ALV XETR EUR --shares=10 --price=340
//   node brokers/capitalcomcy/capitalcomcy_cost.mjs NOVO-B XCSE DKK --shares=10 --price=400
//   node brokers/capitalcomcy/capitalcomcy_cost.mjs --schedule
//   node brokers/capitalcomcy/capitalcomcy_cost.mjs --check
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, spreadLeaf, isListedUsTape } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "capitalcomcy";
const CATALOGUE = new URL(`${FOLDER}-parsed.json`, import.meta.url);

const SCHEDULE = {
  fees: "https://capital.com/en-eu/ways-to-trade/fees-and-charges/stocks",
  taxes: "https://img.capital.com/docs/Capital_com_Regulatory_Taxes_Equities.pdf",
  execution: "https://img.capital.com/docs/Order-Execution-Policy-V2.1.pdf",
  gtnEurope: "https://gtngroup.com/wp-content/uploads/2024/09/GTN-Europe-Order-Execution-Policy-Sep-24.pdf",
  gtnAmericas606: "https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip",
  readOn: "2026-10-20",
  policy: "Order Execution Policy V2.1, September 2026",
  entity: "Capital Com Group Ltd (CySEC 463/25)",
  executingBroker: "GTN Europe Financial Services Limited (FCA 1003343)",
  usAffiliate: "GTN Americas Financial Services, Inc. (CRD 315499)",
};

const COMMISSION = 0;
const FX_EACH = 0.004;
const SEC_RATE = 20.6 / 1e6;
const CAT_PER_SHARE = 0.000009;
const TAF = { perShare: 0.000195, min: 0.01, max: 9.79, from: "2027-01-01" };
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
const ITP = { each: 1.25, currency: "EUR", above: 12500 };
// Printed by Capital.com; charged where the tax map measured nothing, on a
// share of that country on its home book.
const OWN_TAX = {
  IE: { name: "IRISH_STAMP", rate: 0.01, mics: new Set(["XMSM"]) },
  IT: { name: "ITALIAN_FTT", rate: 0.002, mics: new Set(["XMIL"]) },
  ES: { name: "SPANISH_FTT", rate: 0.002, mics: new Set(["XMAD"]) },
};
const UK_MICS = new Set(["XLON"]);
const IE_MICS = new Set(["XMSM"]);
// Same NBBO as the listed tape. Its own name has no book here.
const US_ALSO = new Set(["TXSE", "XCHI"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const isStock = (row) => code(row?.type) === "STOCK";

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

function convert(amount, from, to) {
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  return usd == null || !(per > 0) ? null : usd / per;
}

const today = () => new Date().toISOString().slice(0, 10);

/** FINRA TAF on one sale of `n` shares, on `date`. Zero before 2027. */
export function tafOf(n, date = today()) {
  if (!(n > 0) || date < TAF.from) return 0;
  const raw = Math.round(n * TAF.perShare * 100) / 100;
  return Math.min(TAF.max, Math.max(TAF.min, raw));
}

/** Stamp and FTT on the buy: the map's rates, plus Capital.com's printed one where the map has none. */
export function taxesFor(isin, row, mic) {
  const id = code(isin);
  const tax = id ? taxesOf(id) : null;
  const rates = { ...taxRates(tax) };
  const own = OWN_TAX[id.slice(0, 2)];
  const homeStock = Boolean(own && isStock(row) && own.mics.has(code(mic)));
  const added = [];
  if (homeStock && !Object.keys(rates).some((k) => k.includes(own.name.split("_")[0]))) {
    rates[own.name] = own.rate;
    added.push(own.name);
  }
  // A printed rate settles the line; otherwise an unknown tax is unknown.
  const gap = added.length ? null : taxGap(id, row?.type, mic);
  return { tax, rates, added, gap };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? listingKey({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function remarkOf({ holdable, currency, ukStock, ieStock, ptmBites, itpBites }) {
  return [
    holdable ? fxRemark((100 * FX_EACH).toFixed(2), currency) : null,
    ukStock && !ptmBites ? `UK takeover levy (PTM) £${PTM.each.toFixed(2)} each way above £10,000.` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function bookOf(m) {
  const mic = code(m.venue?.mic ?? m.row.mic);
  const usTape = isListedUsTape(mic) || US_ALSO.has(mic);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    // A Texas line reads the one US tape under the listed MIC set.
    mic: US_ALSO.has(mic) ? "XNYS" : m.venue?.mic ?? m.row.mic ?? null,
    currency: m.row.currency,
    unsourced: US_ALSO.has(mic) ? null : m.unsourced,
    broker: FOLDER,
    ticker: m.row.ticker,
  });
  return { book, usTape, mic };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is Capital.com's own
 * charge: nothing, or the forced 0.4% FX each way on a DKK / SEK / NOK /
 * CHF line. SEC, CAT, TAF, stamp, FTT, PTM and ITP sit in `usd` only.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, date = today() }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    url: SCHEDULE.fees,
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue Capital.com n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Capital.com` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Capital.com`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const { book, usTape, mic } = bookOf(m);
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: usTape ? mic : book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const settle = listingCash(listing.currency);
  const holdable = depositHas(FOLDER, null, settle);
  const eea = /^(AT|BE|BG|HR|CY|CZ|DK|EE|FI|FR|DE|GR|HU|IE|IT|LV|LT|LU|MT|NL|PL|PT|RO|SK|SI|ES|SE|IS|LI|NO)/.test(listing.isin || "");
  const stock = isStock(m.row);
  const ukStock = stock && UK_MICS.has(code(listing.mic));
  const ieStock = stock && IE_MICS.has(code(listing.mic));
  const { tax, rates, added, gap } = taxesFor(listing.isin, m.row, listing.mic);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const partsBook = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: usTape ? { source: "us605" } : m.venue,
    unsourced: usTape ? null : m.unsourced,
    toUsd: (x) => (usTape ? x : dollars(x, listing.currency)),
  });

  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  const pounds = notional == null ? null : convert(notional, listing.currency, "GBP");
  const euros = notional == null ? null : convert(notional, listing.currency, "EUR");
  // A fraction is filled OTC with GTN whatever the ISIN (§5).
  const otc = !eea || (n > 0 && !Number.isInteger(n));
  const ptmBites = ukStock && pounds != null && pounds > PTM.above;
  const itpBites = ieStock && euros != null && euros > ITP.above;

  const shared = {
    ...answer,
    listing,
    feeMarket: usTape ? "us" : "eu",
    cashCurrency: holdable ? settle : "",
    execution: otc ? "GTN Europe, gré à gré (ISIN hors EEE ou fraction)" : "GTN Europe, marché réglementé / MTF / SI (ISIN EEE)",
    remark: remarkOf({ holdable, currency: listing.currency, ukStock, ieStock, ptmBites, itpBites }),
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Capital.com (actions réelles, UE), relu le ${SCHEDULE.readOn} : aucune commission, change 0,4 % par sens hors devise du compte`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: holdable ? FX_EACH * 2 : 0,
  };

  if (notional == null) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notionalUsd = dollars(notional, listing.currency);
  const bookUsd =
    partsBook.a == null || partsBook.b == null || notionalUsd == null ? null : partsBook.a * notionalUsd + partsBook.b * n;
  const fxUsd = holdable ? 0 : notionalUsd == null ? null : notionalUsd * FX_EACH * 2;
  const secUsd = usTape ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const catUsd = usTape ? n * CAT_PER_SHARE * 2 : 0;
  const tafUsd = usTape ? tafOf(n, date) : 0;
  const stampUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;
  const ptmUsd = ptmBites ? dollars(PTM.each * 2, PTM.currency) : 0;
  const itpUsd = itpBites ? dollars(ITP.each * 2, ITP.currency) : 0;
  const taxUsd = plus(stampUsd, ptmUsd, itpUsd);
  const levyUsd = plus(secUsd, catUsd, tafUsd);
  const brokerFees = plus(COMMISSION, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd, levyUsd);

  const unknown = [
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange || "cette ligne"} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { each: COMMISSION, currency: "USD", eachWay: true },
    ...(holdable ? {} : { fxRate: FX_EACH }),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    sell: { sec: finite(secUsd, 6), taf: finite(tafUsd, 6) },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: 0,
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
      régulateur: finite(levyUsd, 6),
    },
    confidence: [
      `barème relu le ${SCHEDULE.readOn} : page des frais actions et ${SCHEDULE.policy} (§7 : « the spread is the only cost »), aucune commission`,
      holdable
        ? `ligne en ${settle}, devise de compte possible : pas de change`
        : `ligne en ${settle}, aucune devise de compte (EUR, USD, GBP, PLN) : change 0,4 % du spot par sens dans le total`,
      otc
        ? `${eea ? "fraction" : "ISIN hors EEE"} : exécuté de gré à gré avec GTN Europe, au prix fourni par la place (§7, §6.2) ; carnet de la place`
        : `ISIN de l'EEE : GTN Europe exécute sur marché réglementé, MTF ou SI ; carnet de la place`,
      usTape
        ? book.via606
          ? `ruban américain : Q ${Number(book.q).toFixed(3)} du 606 de GTN Americas (CRD 315499), filiale américaine de GTN Europe`
          : `ruban américain : NBBO coté, le 606 de GTN Americas (CRD 315499) n'a pas de Q ce trimestre`
        : null,
      US_ALSO.has(mic) ? `ligne ${mic} : même NBBO, lue sur le ruban américain` : null,
      usTape
        ? `SEC ${SEC_RATE * 1e6} $ par million vendu, CAT ${CAT_PER_SHARE} $ par part aux deux sens, TAF ${tafUsd ? `${tafUsd} $` : `0 $ jusqu'au 31 décembre 2026 (imprimé)`}`
        : null,
      added.length
        ? `${added.join(", ")} ${(100 * taxPct).toFixed(2).replace(".", ",")} % à l'achat : taux imprimé par Capital.com, la carte fiscale n'en a pas ; listes officielles non tenues ici`
        : taxPct
          ? `${Object.keys(rates).join(", ")} ${(100 * taxPct).toFixed(2).replace(".", ",")} % à l'achat, depuis taxMap.mjs`
          : null,
      gap ? gap : null,
      ptmBites ? `PTM ${PTM.each} £ par sens au-delà de ${PTM.above} £` : null,
      itpBites ? `ITP ${ITP.each} € par sens au-delà de ${ITP.above} €` : null,
      marketBp != null
        ? `carnet ${Number(marketBp.toPrecision(4))} bp, aller-retour`
        : marketPerShare != null
          ? `carnet ${marketPerShare} $ la part, aller-retour`
          : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange || "cette ligne"}`,
    ]
      .filter(Boolean)
      .join(" ; "),
  };
}

// Every catalogue row at one size, for the checks: how many get a total,
// and why the others do not.
export function coverage({ amountUsd = 1000 } = {}) {
  const out = { rows: rows.length, priced: 0, na: 0, byPlace: {}, why: {} };
  for (const r of rows) {
    const usdPerUnit = usdPer(r.currency);
    const p = 100;
    const n = usdPerUnit > 0 ? amountUsd / (p * usdPerUnit) : 10;
    const res = roundTrip({ etf: r.isin || r.ticker, place: r.mic || r.exchange, currency: r.currency, shares: n, price: p });
    const key = `${r.mic}:${r.currency}`;
    const slot = (out.byPlace[key] ||= { n: 0, priced: 0 });
    slot.n += 1;
    if (res.usd != null) {
      out.priced += 1;
      slot.priced += 1;
    } else {
      out.na += 1;
      const w = String(res.why || "?").replace(/[A-Z]{2}[A-Z0-9]{9}\d/g, "ISIN");
      out.why[w] = (out.why[w] || 0) + 1;
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        { ...SCHEDULE, commission: COMMISSION, fxEach: FX_EACH, sec: SEC_RATE, cat: CAT_PER_SHARE, taf: TAF, ptm: PTM, itp: ITP, ownTax: Object.fromEntries(Object.entries(OWN_TAX).map(([k, v]) => [k, { name: v.name, rate: v.rate, mics: [...v.mics] }])) },
        null,
        2
      )
    );
    process.exit(0);
  }
  if (process.argv.includes("--check")) {
    console.log(JSON.stringify(coverage(), null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(`usage : node brokers/${FOLDER}/${FOLDER}_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--date=AAAA-MM-JJ] [--json]`);
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
    date: flag("date") || today(),
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || ""}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.change) console.log(`  change         : ${parts.change} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    if (parts.régulateur) console.log(`  SEC/TAF/CAT    : ${parts.régulateur} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
