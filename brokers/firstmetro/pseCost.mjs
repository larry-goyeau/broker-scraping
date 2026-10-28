// Cash round trip on the Philippine Stock Exchange (XPHS, PHP and the three
// dollar lines DTEL, TCB2A, TCB2B) for the PSE members whose cost files
// import it (First Metro Securities, Philstocks, AAA Equities, Investors
// Securities, Luna Securities, Maya Stocks: see the header of each broker
// file). The listing lookup, the book, FX and the output shape are those of
// the PSE files already in the repo (col, timson, utrade); this module only
// takes the broker's own table as a schedule.
//
// Market-wide figures, for a broker page that prints them or for the one
// that leaves one out (said in its own header, as bdosec and mytrade do for
// the PSE fee):
//   PSE transaction fee   0.005% of the gross, each side (PSE_FEE)
//                         "For all stock trades that go through the exchange
//                         or the PSE, the PSE charges 0.005%" (China Bank
//                         Securities FAQ); First Metro adds 12% VAT on it.
//   SCCP fee              0.01% of the gross, each side (SCCP_FEE)
//   VAT                   12% of the commission (VAT)
//   stock transaction tax 0.1% of the gross, on the sell (STT): "reduced
//                         from 0.6% to 0.1% effective July 1, 2025 (Republic
//                         Act No. 12214, otherwise known as CMEPA)" (First
//                         Metro, Fees and Charges). A page still printing
//                         0.6% is read at 0.1%, as col, gstocks, mercantilesec.
//   https://help.firstmetrosec.com.ph/hc/en-us/articles/55429528585369-Fees-and-Charges
//   https://www.chinabankseconline.ph/
//
// schedule:
//   broker, folder        names for the `why` sentences
//   catalogueUrl          new URL("<folder>-parsed.json", import.meta.url)
//   url, readOn           the tariff page and the day it was read
//   commission            { rate, min } (min in pesos, 0 for none), or
//                         { tiers: [{ upTo, rate } | { upTo, flat }] }: the
//                         whole order takes the rate of its band (upTo in
//                         pesos, inclusive; the last band upTo: Infinity)
//   vat                   on the commission, default VAT
//   levies                [{ name, rate, vat }] rates of the gross, each side;
//                         vat: true adds VAT on that levy. Default PSE + SCCP.
//   salesTax              on the sell, default STT
//   cash                  deposit currencies kept unconverted, default ["PHP"].
//                         A line in another currency is N/A (no published
//                         rate); a line in one of them is priced in it, with
//                         the remark "FX when cash ≠ CCY." when there are two.
//   fxPct                 the broker's conversion margin in percent, when one
//                         is printed: "FX x% when cash ≠ CCY."
//   rounding              "none" (default: exact, as timson, utrade), "line"
//                         (each charge to the centavo, half up, as col) or
//                         "side" (the charges of each side added, then to the
//                         centavo, as a page whose example rounds the total)
//   remark                extra English remark (string), after the FX one
//   basis                 French sentence on the table (string, or
//                         (listing) => string); a default is written from the
//                         schedule when it is absent
//   confidence            optional French sentence, passed through
//   onlineBuy             default true
//
// pseRoundTrip(schedule, query) answers the shape of the PSE files: usd,
// brokerFees, listing, bp/perShare, trade, commission { commission, vat,
// levies, buy, sell, ... }.
//
//   node brokers/firstmetro/pseCost.mjs   (self-test on the First Metro table)

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";

export const PSE_FEE = 0.00005;
export const SCCP_FEE = 0.0001;
export const VAT = 0.12;
export const STT = 0.001;
export const LEVIES = Object.freeze([
  Object.freeze({ name: "PSE", rate: PSE_FEE, vat: false }),
  Object.freeze({ name: "SCCP", rate: SCCP_FEE, vat: false }),
]);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const cent = (amount) => Math.round(amount * 100 + Number.EPSILON) / 100;

export function frPct(rate) {
  const v = Math.round(rate * 100 * 100000) / 100000;
  return `${String(v).replace(".", ",")} %`;
}
const frNum = (x) => x.toLocaleString("fr-FR").replace(/ /g, " ");

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
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
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

// The commission of one order on `notional` (in the listing currency).
export function commissionOf(spec, notional) {
  if (Array.isArray(spec.tiers)) {
    const band = spec.tiers.find((t) => notional <= t.upTo) || spec.tiers[spec.tiers.length - 1];
    return band.flat != null ? band.flat : notional * band.rate;
  }
  return Math.max(notional * spec.rate, spec.min || 0);
}

// One order: commission, VAT, levies; the sell adds the sales tax.
export function pseTicket(schedule, notional) {
  const vatRate = schedule.vat ?? VAT;
  const levyList = schedule.levies ?? LEVIES;
  const salesTaxRate = schedule.salesTax ?? STT;
  const rounding = schedule.rounding || "none";
  const r = rounding === "line" ? cent : (x) => x;
  const commission = r(commissionOf(schedule.commission, notional));
  const vat = r(commission * vatRate);
  const levyParts = levyList.map((l) => {
    const fee = r(notional * l.rate);
    return { name: l.name, fee, vat: l.vat ? r(fee * vatRate) : 0 };
  });
  const levies = levyParts.reduce((sum, l) => sum + l.fee + l.vat, 0);
  const salesTax = r(notional * salesTaxRate);
  let buy = commission + vat + levies;
  let sell = buy + salesTax;
  if (rounding === "line" || rounding === "side") {
    buy = cent(buy);
    sell = cent(sell);
  }
  return { commission, vat, levies, levyParts, salesTax, buy, sell };
}

function defaultBasis(schedule) {
  const c = schedule.commission;
  const vatRate = schedule.vat ?? VAT;
  const levyList = schedule.levies ?? LEVIES;
  const commission = Array.isArray(c.tiers)
    ? `commission par tranche de montant (${c.tiers
        .map((t, i) => `${t.upTo === Infinity ? `au-delà de ${frNum(c.tiers[i - 1]?.upTo ?? 0)} PHP` : `jusqu'à ${frNum(t.upTo)} PHP`} ${t.flat != null ? `${frNum(t.flat)} PHP` : frPct(t.rate)}`)
        .join(", ")})`
    : `commission ${frPct(c.rate)}${c.min ? ` ou ${frNum(c.min)} PHP au minimum` : ""}`;
  const vat = vatRate ? ` plus TVA ${frPct(vatRate)} de la commission` : "";
  const levies = levyList.map((l) => `${l.name} ${frPct(l.rate)}${l.vat ? ` plus TVA` : ""}`).join(", ");
  const salesTax = (schedule.salesTax ?? STT) ? ` ; taxe de vente ${frPct(schedule.salesTax ?? STT)} à la vente` : "";
  return `${schedule.broker} en ligne, barème relu le ${schedule.readOn}. ${commission[0].toUpperCase()}${commission.slice(1)}${vat}${levies ? `, ${levies}` : ""}, chaque côté${salesTax}.`;
}

export function pseRoundTrip(schedule, query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const cash = schedule.cash || ["PHP"];
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: schedule.onlineBuy ?? true,
    cashCurrency: cash[0],
    url: schedule.url,
    remark: "",
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
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const fx = cash.length > 1 && cash.includes(listing.currency) ? fxRemark(schedule.fxPct ?? "", listing.currency) : "";
  const remark = [fx, schedule.remark || ""].filter(Boolean).join(" ");
  const basis = typeof schedule.basis === "function" ? schedule.basis(listing) : schedule.basis || defaultBasis(schedule);
  const shared = {
    ...answer,
    listing,
    cashCurrency: cash.includes(listing.currency) ? listing.currency : cash[0],
    remark,
    basis,
    ...(schedule.confidence ? { confidence: schedule.confidence } : {}),
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!cash.includes(listing.currency)) {
    return { ...shared, why: `${listing.ticker || etf} est coté en ${listing.currency} : le compte est en ${cash.join(", ")} et la conversion n'a pas de taux publié` };
  }
  const c = schedule.commission;
  const pesoFigures = (c.min || (Array.isArray(c.tiers) && c.tiers.some((t) => t.flat != null || t.upTo !== Infinity)));
  if (pesoFigures && listing.currency !== "PHP") {
    return { ...shared, why: `${listing.ticker || etf} est coté en ${listing.currency} : le barème est en pesos (minimum ou tranches) et n'a pas de montant dans cette devise` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const fees = pseTicket(schedule, notional);
  const local = fees.buy + fees.sell;
  const notionalUsd = dollars(notional, listing.currency);
  const brokerFees = dollars(local, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { ...fees, currency: listing.currency },
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

// Self-test: the worked examples printed by the brokers, checked to the
// centavo, then a real First Metro row.
function selfTest() {
  const near = (a, b, label) => {
    if (Math.abs(a - b) > 0.005) throw new Error(`${label}: ${a} instead of ${b}`);
    console.log(`ok ${label}: ${Number(a.toFixed(4))}`);
  };
  // Philstocks: 1,000 ABZY at 12.52 → buy charges 36.94, sell 49.46: each
  // line to the centavo (31.30 + 3.76 + 0.63 + 1.25; + 12.52 on the sell).
  const philstocks = { commission: { rate: 0.0025, min: 20 }, rounding: "line" };
  near(pseTicket(philstocks, 12_520).buy, 36.94, "Philstocks buy 12,520");
  near(pseTicket(philstocks, 12_520).sell, 49.46, "Philstocks sell 12,520");
  // The 20 peso floor bites under 8,000 pesos.
  near(pseTicket(philstocks, 4_000).commission, 20, "Philstocks floor 4,000");
  // AAA Equities: P100,000 → 250 + 30 + 5 + 10 = 295 buy, + 100 sell.
  const aaa = { commission: { rate: 0.0025 } };
  near(pseTicket(aaa, 100_000).buy, 295, "AAA buy 100,000");
  near(pseTicket(aaa, 100_000).sell, 395, "AAA sell 100,000");
  // First Metro: PSE fee plus 12% VAT on it.
  const fm = { commission: { rate: 0.0025 }, levies: [{ name: "PSE", rate: PSE_FEE, vat: true }, { name: "SCCP", rate: SCCP_FEE }] };
  near(pseTicket(fm, 100_000).buy, 295.6, "First Metro buy 100,000");
  // Luna tiers: 2,000 → flat 5; 50,000 → 0.20% = 100; 300,000 → 0.16% = 480.
  const luna = {
    commission: {
      tiers: [
        { upTo: 2_500, flat: 5 },
        { upTo: 100_000, rate: 0.002 },
        { upTo: 250_000, rate: 0.0018 },
        { upTo: 500_000, rate: 0.0016 },
        { upTo: 1_000_000, rate: 0.0014 },
        { upTo: Infinity, rate: 0.0012 },
      ],
    },
  };
  near(commissionOf(luna.commission, 2_000), 5, "Luna 2,000");
  near(commissionOf(luna.commission, 50_000), 100, "Luna 50,000");
  near(commissionOf(luna.commission, 300_000), 480, "Luna 300,000");
  near(commissionOf(luna.commission, 2_000_000), 2_400, "Luna 2,000,000");

  const schedule = {
    broker: "First Metro Securities",
    folder: "firstmetro",
    catalogueUrl: new URL("firstmetro-parsed.json", import.meta.url),
    url: "https://help.firstmetrosec.com.ph/hc/en-us/articles/55429528585369-Fees-and-Charges",
    readOn: "2026-10-26",
    ...fm,
    cash: ["PHP", "USD"],
  };
  const sm = pseRoundTrip(schedule, { etf: "SM", place: "PSE", currency: "PHP", shares: 120, price: 497 });
  console.log(JSON.stringify({ usd: sm.usd, brokerFees: sm.brokerFees, bp: sm.bp, remark: sm.remark, commission: sm.commission, basis: sm.basis }, null, 2));
  const dtel = pseRoundTrip(schedule, { etf: "DTEL", place: "XPHS", currency: "USD", shares: 5000, price: 0.2 });
  console.log(JSON.stringify({ usd: dtel.usd, brokerFees: dtel.brokerFees, remark: dtel.remark, why: dtel.why }, null, 2));
  const pesoOnly = pseRoundTrip({ ...schedule, cash: ["PHP"] }, { etf: "DTEL", place: "PSE", currency: "USD", shares: 5000, price: 0.2 });
  console.log(JSON.stringify({ usd: pesoOnly.usd, why: pesoOnly.why }));
}

let main = false;
try {
  main = import.meta.url === pathToFileURL(process.argv[1]).href;
} catch {
  main = false;
}
if (main) selfTest();
