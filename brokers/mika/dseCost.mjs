// Cash round trip on the Dhaka Stock Exchange: buy n shares, sell them
// straight back, in dollars. Shared by the DSE-only brokers whose
// catalogues come from ./dseBook.mjs (Mika, Bank Asia Securities, Sheltech,
// AB & Co., Mondol, Uniroyal uTrade). Each broker file passes its own
// commission and says how its page treats the exchange levies; the sums,
// the listing lookup and the output shape are those of
// brokers/ibsl/ibsl_cost.mjs and brokers/bracepl/bracepl_cost.mjs.
//
// The levies on each side of a DSE trade, when a broker adds them to its
// commission (`levies: "added"`):
//
//   DSE "laga" (turnover charge)   0.03 % of the trade value.
//     The DSE raised it "at 0.03 percent instead of a 0.02 percent rate"
//     when it dropped the Tk 2 hawla per side (The Daily Star, 18 Dec 2014,
//     https://www.thedailystar.net/node/61214). No later change was found.
//     The DSE takes it from the buying and from the selling broker: "In
//     settlement process DSE receives all charges and AIT from buying and
//     selling brokers" (https://www.dse.com.bd/about/clearing-settlement).
//   CDBL transaction fee           Tk 0.000125 per taka of market value
//     (0.0125 %), no minimum, paid by the participant/account holder; SME
//     platform lines Tk 0.00003 (0.003 %). BSEC gazette of 4 Aug 2016
//     (published 24 Sep 2016), Depository (User) Regulations 2003,
//     Schedule 4, item 2 (Ka) and (Cha), linked from CDBL "Fees and
//     Deposits" (https://www.cdbl.com.bd/about/fees-and-deposits, PDF
//     object website/site-pages/2026/08/f3041f58-....pdf).
//   Tax at source (AIT)            0.05 % of the value of shares traded.
//     Collected by the exchange from its members on every trade: Income
//     Tax Act 2023 s. 137 (formerly ITO 1984 s. 53BBB), "0.05% on the value
//     of shares and mutual funds" (Bank Asia booklet on the 2023 Act,
//     https://www.bankasia-bd.com/assets/home/publications/Booklet-of-Bangladesh-Income-Tax-Law-2023-National-Budget-FY-2023-2024-Key-highlights.pdf).
//
//   Each side, main board: 0.03 + 0.0125 + 0.05 = 0.0925 %.
//   Each side, SME board:  0.03 + 0.003  + 0.05 = 0.083 %.
//
// No per-trade BSEC fee is charged to investors (its share of the annual
// BO fee, Tk 50 of Tk 150 since the 5 Oct 2025 gazette, is a holding cost
// and stays out). No VAT is added on the commission, as in every other
// Bangladeshi file. Capital gain is nil on a same-price round trip.
// The SME laga is taken at the main-board 0.03 %: no separate rate found.
//
// With `levies: "included"` the page puts these inside the commission and
// nothing is added; with `levies: "out"` (the IDLC and LankaBangla way)
// the page names no levy or does not rate it, and nothing is added either.
// Only "added" changes the total.
//
// brokerFees is the commission alone (with its floor); the levies are in
// usd and in parts.taxes, as the DSE/CMSA/CSD lines of dsehisa_cost.mjs.
// XDHA has no book in spreads/ (venues.mjs: source ""), so usd stays null
// with the "aucun carnet" why until one exists. Every DSE line is in taka.
//
// schedule = {
//   broker, folder, catalogueUrl, url, readOn,
//   rate,              commission on each side (0.005 for 0.50 %)
//   minimum = 0,       floor in taka on the commission of each order
//   ceiling = false,   true when the rate is a printed maximum ("up to 1%")
//   levies = "out",    "added" | "included" | "out"
//   basis,             French sentence: the page and what it prints
//   notes = [],        French confidence items specific to the broker
//   remark = "",       English, cost facts only
//   onlineBuy = true,
// }
//
//   import { dseRoundTrip, printCli } from "../mika/dseCost.mjs";
//   export function roundTrip(query) { return dseRoundTrip(SCHEDULE, query); }
//   printCli(import.meta.url, roundTrip);
//
// Also exported: DSE_LEVIES, isSme(row), dseLevies(notional, { sme }),
// commissionOf(notional, { rate, minimum }), frPct(rate).
//
//   node brokers/mika/dseCost.mjs     (self-test on Mika's catalogue)

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CASH = "BDT";

export const DSE_LEVIES = Object.freeze({
  laga: 0.0003,
  cdbl: 0.000125,
  cdblSme: 0.00003,
  ait: 0.0005,
  sources: Object.freeze({
    laga: "https://www.thedailystar.net/node/61214",
    settlement: "https://www.dse.com.bd/about/clearing-settlement",
    cdbl: "https://www.cdbl.com.bd/about/fees-and-deposits",
    ait: "https://www.bankasia-bd.com/assets/home/publications/Booklet-of-Bangladesh-Income-Tax-Law-2023-National-Budget-FY-2023-2024-Key-highlights.pdf",
  }),
});

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// French percent, "0,0925 %".
export function frPct(rate) {
  const v = Math.round(rate * 100 * 100000) / 100000;
  return `${String(v).replace(".", ",")} %`;
}
const frTk = (x) => String(Math.round(x * 100) / 100).replace(".", ",");

// dseBook.mjs ends the raw text of every SME-board line with this.
export function isSme(row) {
  return /\|\s*DSE SME board\s*$/.test(String(row?.raw || ""));
}

// The levies on one side of a trade of `notional` taka.
export function dseLevies(notional, { sme = false } = {}) {
  const cdblRate = sme ? DSE_LEVIES.cdblSme : DSE_LEVIES.cdbl;
  const rate = DSE_LEVIES.laga + cdblRate + DSE_LEVIES.ait;
  return {
    laga: notional * DSE_LEVIES.laga,
    cdbl: notional * cdblRate,
    ait: notional * DSE_LEVIES.ait,
    total: notional * rate,
    rate,
    cdblRate,
  };
}

// The commission on one order, with its floor.
export function commissionOf(notional, { rate, minimum = 0 }) {
  return Math.max(minimum || 0, notional * rate);
}

const loaded = new Map();
function loadRows(catalogueUrl) {
  const key = String(catalogueUrl);
  if (!loaded.has(key)) {
    let rows = null;
    if (fs.existsSync(catalogueUrl)) {
      const catalogue = JSON.parse(fs.readFileSync(catalogueUrl, "utf8"));
      rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
      if (rows.length) warmListingIndex(rows);
    }
    loaded.set(key, rows);
  }
  return loaded.get(key);
}

function findListing(rows, { etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place, currency }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

const LEVY_WORDS = {
  added: () =>
    `redevances ajoutées chaque sens : laga DSE ${frPct(DSE_LEVIES.laga)}, CDBL ${frPct(DSE_LEVIES.cdbl)} ` +
    `(SME ${frPct(DSE_LEVIES.cdblSme)}), impôt à la source ${frPct(DSE_LEVIES.ait)}`,
  included: () => "redevances DSE, CDBL et impôt à la source compris dans la commission selon la page : rien d'ajouté",
  out: () => "redevances DSE, CDBL et impôt à la source ni nommées ni chiffrées par la page : laissées de côté, comme chez IDLC et LankaBangla",
};

export function dseRoundTrip(schedule, query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const levies = schedule.levies || "out";
  if (!LEVY_WORDS[levies]) throw new Error(`levies must be "added", "included" or "out", not ${levies}`);
  const minimum = schedule.minimum || 0;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: schedule.onlineBuy ?? true,
    cashCurrency: CASH,
    url: schedule.url,
    remark: schedule.remark || "",
  };
  const rows = loadRows(schedule.catalogueUrl);
  if (!rows) {
    return {
      ...answer,
      why: `le catalogue ${schedule.broker} n'existe pas encore : lancer \`node brokers/${schedule.folder}/${schedule.folder}_scraping.mjs\``,
    };
  }
  const { named, matches } = findListing(rows, { etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${schedule.broker}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${schedule.broker}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const sme = isSme(m.row);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: schedule.folder,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || CASH,
    brokerExchange: m.row.exchange || null,
    ...(sme ? { board: "SME" } : {}),
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const taxMapTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    remark: [answer.remark, m.row.remark].filter(Boolean).join(" "),
    listing,
    basis: schedule.basis,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `${schedule.broker} ne publie un barème que pour Dhaka en takas ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const perOrder = commissionOf(notional, { rate: schedule.rate, minimum });
  const commissionBdt = perOrder * 2;
  const side = dseLevies(notional, { sme });
  const leviesBdt = levies === "added" ? side.total * 2 : 0;
  const taxMapBdt = notional * taxMapTotal;
  const brokerFees = dollars(commissionBdt, listing.currency);
  const taxUsd = dollars(leviesBdt + taxMapBdt, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const why =
    usd != null
      ? null
      : notionalUsd == null
        ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
        : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;
  const confidence = [
    schedule.basis,
    `commission ${frPct(schedule.rate)} chaque sens${schedule.ceiling ? " (plafond publié, pris tel quel)" : ""}`,
    minimum ? `minimum ${frTk(minimum)} BDT par ordre${notional * schedule.rate < minimum ? ` : ${frTk(notional * schedule.rate)} BDT relevé au minimum` : ""}` : "aucun minimum publié",
    LEVY_WORDS[levies](),
    ...(levies === "added" && sme ? [`ligne du tableau SME : CDBL ${frPct(DSE_LEVIES.cdblSme)}, laga pris à ${frPct(DSE_LEVIES.laga)}`] : []),
    ...(schedule.notes || []),
    "ligne BDT, compte en takas : aucun change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} BDT par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: finite(perOrder, 8),
      sell: finite(perOrder, 8),
      rate: schedule.rate,
      minimum,
      ...(schedule.ceiling ? { ceiling: true } : {}),
      levies,
      ...(levies === "added" ? { leviesPerSide: Number(side.rate.toPrecision(6)) } : {}),
      currency: listing.currency,
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
      courtageBdt: finite(commissionBdt, 6),
      taxesBdt: finite(leviesBdt + taxMapBdt, 6),
      ...(levies === "added"
        ? { lagaBdt: finite(side.laga * 2, 6), cdblBdt: finite(side.cdbl * 2, 6), aitBdt: finite(side.ait * 2, 6) }
        : {}),
    },
    confidence,
  };
}

export function printCli(callerUrl, roundTrip) {
  let called = false;
  try {
    called = callerUrl === pathToFileURL(process.argv[1]).href;
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

// Self-test: hand-checked sums on Mika's catalogue, with a made-up 0.50 %
// and a 10 BDT floor, and a forced 20 bp book so usd is not null.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const assert = (ok, text) => {
    if (!ok) throw new Error(text);
  };
  const near = (a, b) => Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(b)); // finite(x, 6) keeps 6 significant digits
  const base = {
    broker: "Test",
    folder: "mika",
    catalogueUrl: new URL("mika-parsed.json", import.meta.url),
    url: "https://example.invalid/",
    readOn: "2026-10-26",
    rate: 0.005,
    minimum: 10,
    basis: "test",
  };
  // BRAC Bank, 1,822 × 67.40 = 122,802.80 BDT ≈ 1,000 USD.
  const added = dseRoundTrip({ ...base, levies: "added" }, { etf: "BRACBANK", place: "XDHA", currency: "BDT", shares: 1822, price: 67.4 });
  assert(added.listing?.ticker === "BRACBANK" && !added.listing.board, "BRACBANK main board");
  assert(near(added.parts.courtageBdt, 122802.8 * 0.005 * 2), `commission ${added.parts.courtageBdt}`);
  assert(near(added.parts.taxesBdt, 122802.8 * 0.000925 * 2), `levies ${added.parts.taxesBdt}`);
  assert(near(added.parts.lagaBdt, 73.68168) && near(added.parts.cdblBdt, 30.7007) && near(added.parts.aitBdt, 122.8028), "levy split");
  assert(added.usd == null && /aucun carnet/.test(added.why), "no XDHA book: usd null");
  const booked = dseRoundTrip({ ...base, levies: "added" }, { etf: "BRACBANK", place: "XDHA", currency: "BDT", shares: 1822, price: 67.4, bp: 20 });
  const expectBdt = 122802.8 * (0.002 + 0.01 + 0.00185);
  assert(near(booked.usd, Number((expectBdt / 122.79).toFixed(6))), `usd ${booked.usd} vs ${expectBdt / 122.79}`);
  const out = dseRoundTrip({ ...base, levies: "out" }, { etf: "BRACBANK", place: "XDHA", currency: "BDT", shares: 1822, price: 67.4, bp: 20 });
  assert(out.parts.taxesBdt === 0 && near(out.usd, Number(((122802.8 * 0.012) / 122.79).toFixed(6))), "levies out");
  // SME line, Achia Sea Foods: CDBL 0.003 %.
  const sme = dseRoundTrip({ ...base, levies: "added" }, { etf: "ACHIASF", place: "XDHA", currency: "BDT", shares: 4120, price: 29.8 });
  assert(sme.listing.board === "SME" && near(sme.parts.taxesBdt, 4120 * 29.8 * 0.00083 * 2), `SME levies ${sme.parts.taxesBdt}`);
  // Floor: 10 shares of BRAC Bank = 674 BDT, 0.50 % = 3.37 < 10.
  const small = dseRoundTrip({ ...base, levies: "included" }, { etf: "BRACBANK", place: "XDHA", currency: "BDT", shares: 10, price: 67.4 });
  assert(small.commission.buy === 10 && small.parts.courtageBdt === 20, "minimum per order");
  assert(dseRoundTrip(base, { etf: "NOPE", place: "XDHA", currency: "BDT", shares: 1, price: 1 }).why, "unknown ticker");
  console.log("dseCost self-test passed");
  console.log(JSON.stringify({ added: added.parts, sme: sme.parts, booked: booked.usd, confidence: added.confidence }, null, 2));
}
