// What one round trip costs at Hapi (hapi.trade): buy n shares at price p,
// sell them back at once, online, in regular hours (9:30-16:00 New York), in
// dollars. US-listed stocks, ETFs and ETNs in a self-directed cash account.
// Crypto (Hapi Crypto, LLC with Bakkt) and margin stay out.
//
// Hapi Securities, LLC (US, CRD 311868), clearing and custody at Apex
// Clearing Corporation. Fee schedule PDF read in full 2026-10-20 (file
// last modified 2026-04-29); the help article re-read the same day.
//
//   https://hapi-public-documents.s3.us-east-1.amazonaws.com/hapi-fees-schedule.pdf
//   https://help.hapi.trade/en/articles/8976002-understanding-the-clearing-house-fee-and-other-fees-on-hapi
//
//   commission              $0 each way
//   clearing house fee      per trade, regular hours:
//     Regular               $0.10 whole shares, $0.15 fractional shares
//     Prime                 $0.05 ($9.99 a month)
//   extended / overnight    $2.99 a trade, Prime $0.05 (not this trip)
//   SEC                     0.0000206 of the sale, rounded up to the cent
//   FINRA TAF               $0.00: the help article prints a holiday from
//                           1 Oct to 31 Dec 2026. After it, $0.000195 a
//                           share sold, cap $9.79, rounded up to the cent.
//   CAT                     not printed, so 0
//   ADR                     custody fees set by each depositary bank, and
//                           "might have" $0.06 a share minimum or $0.25 a
//                           trade: remark, not in the total
//
// The PDF's two regulatory rows are mislabelled. "Regulatory Fee (charged
// by FINRA)" prints the SEC rate with the TAF cap ($9.79); "TAF (Charged by
// SEC)" prints the SEC rate again. The trip charges the SEC rate once and the
// TAF at FINRA's own rate (on holiday until 31 Dec 2026), as the help article
// says.
//
// Prime changes the clearing fee, so it is a plan: `plan: "regular"` (the
// default) and `plan: "prime"`, one row each on the page.
//
// A trade is fractional when the share count is not whole (the page's $1,000
// trip usually is); that is the $0.15 line on Regular.
//
// Routing: Hapi files no 606 of its own. The FINRA 606 bulk file, 2026 Q2
// adopt-by-reference list, has "311868|HAPI|13071|APEX CLEARING
// CORPORATION" from 2025 Q1. So a US line takes Apex's Q (rule606 key
// "apex"), as Public does. The eight Texas Stock Exchange lines (dual
// listings) take the same per-symbol 605 × Q.
//   https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip
//
// Cash is dollars only (deposits.mjs) and every line is in dollars, so there
// is no conversion. Deposit fees (ACH $2.99, card 3.85%), the $20 wire out
// and the $4.99 inactivity fee do not ride on an order.
//
//   node brokers/hapi/hapi_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/hapi/hapi_cost.mjs SPY ARCA USD --shares=2.5 --price=600 --plan=prime
//   node brokers/hapi/hapi_cost.mjs BABA NYSE USD --shares=10 --price=120
//   node brokers/hapi/hapi_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf, isListedUsTape } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("hapi-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://hapi-public-documents.s3.us-east-1.amazonaws.com/hapi-fees-schedule.pdf",
  help: "https://help.hapi.trade/en/articles/8976002-understanding-the-clearing-house-fee-and-other-fees-on-hapi",
  routing: "https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip",
  readOn: "2026-10-20",
  pdfModified: "2026-04-29",
  entity: "Hapi Securities, LLC",
  crd: "311868",
  clearing: "Apex Clearing Corporation",
  // Hapi adopts Apex's 606 by reference (FINRA bulk file, 2026 Q2).
  rule606: "apex",
};

const DEFAULT_PLAN = "regular";
const PLANS = {
  regular: { id: "regular", name: "Hapi Regular", whole: 0.1, fractional: 0.15, month: null },
  prime: { id: "prime", name: "Hapi Prime", whole: 0.05, fractional: 0.05, month: 9.99 },
};
const PLAN_ALIAS = { regular: "regular", standard: "regular", free: "regular", basic: "regular", prime: "prime" };

const COMMISSION = 0;
const SEC_RATE = 0.0000206;
const TAF = { perShare: 0.000195, cap: 9.79 };
const TAF_HOLIDAY = { from: "2026-10-01", to: "2026-12-31" };
const ADR = { perShare: 0.06, perTrade: 0.25 };
const CENT = 0.01;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
// The catalogue keeps Hapi's category in `raw` ("... | ADR Common Stock | FIGI").
const categoryOf = (row) => String(row?.raw || "").split(" | ")[3] || "";
const isAdr = (row) => /^ADR\b/i.test(categoryOf(row)) || /\bADRs?\b|american deposit/i.test(String(row?.name || ""));
// Rounded up to the cent, as the schedule says. Missing stays missing.
const up = (value) =>
  value == null || Number.isNaN(value) ? null : value > 0 ? Number((Math.ceil(value / CENT - 1e-9) * CENT).toFixed(2)) : 0;
const money = (x) => `$${Number(x).toFixed(2)}`;

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || DEFAULT_PLAN).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

/** Clearing house fee for one order in regular hours. */
export function clearingEach(shares, plan = DEFAULT_PLAN) {
  const p = typeof plan === "string" ? planOf(plan) : plan;
  const n = Number(shares);
  if (!p || !(n > 0)) return null;
  return Number.isInteger(n) ? p.whole : p.fractional;
}

/** TAF per share on `day` (YYYY-MM-DD): 0 during the printed holiday. */
export function tafPerShare(day = new Date().toISOString().slice(0, 10)) {
  return day >= TAF_HOLIDAY.from && day <= TAF_HOLIDAY.to ? 0 : TAF.perShare;
}

export function sellLevies(notionalUsd, shares, day) {
  const secRaw = notionalUsd * SEC_RATE;
  const tafRaw = Math.min(shares * tafPerShare(day), TAF.cap);
  return { sec: up(secRaw), secExact: secRaw, taf: up(tafRaw), tafExact: tafRaw };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue || null : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace || loose(r.mic) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace || exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency || "USD") === wantCurrency);
  return { named, matches };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

function remarkOf({ plan, adr }) {
  const lines = [];
  if (plan.month) lines.push(`$${plan.month}/month.`);
  if (adr) lines.push(`ADRs may pay ${money(ADR.perShare)} a share minimum or ${money(ADR.perTrade)} a trade, and custody fees.`);
  return lines.join("\n");
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints; `brokerFees` is the clearing house
 * fee, twice (the commission is zero).
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: picked?.id ?? plan,
    onlineBuy: true,
    cashCurrency: "USD",
    url: SCHEDULE.source,
    remark: "",
  };
  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (regular|prime)` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Hapi n'existe pas encore : lancer `node brokers/hapi/hapi_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Hapi` };
  if (!matches.length) {
    return { ...answer, why: `${etf} n'est pas coté sur cette place dans cette devise chez Hapi`, alternatives: listAlternatives(named) };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? m.row.mic ?? null,
    currency: m.row.currency || "USD",
    unsourced: m.unsourced,
    broker: SCHEDULE.rule606,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    category: categoryOf(m.row) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency || "USD"),
    brokerExchange: m.row.exchange || null,
    adr: isAdr(m.row),
  };
  // The Texas Stock Exchange is an NMS venue on the same NBBO, and the 605
  // figure is per symbol, so its lines (dual listings such as DDS) read it too.
  const listed = isListedUsTape(listing.mic) || listing.mic === "TXSE";
  // Apex's 605 × Q on a listed US line; elsewhere the leaf the module found.
  const quoted = listed
    ? usBookPerShare({ broker: SCHEDULE.rule606, ticker: listing.ticker, fallback: book.leaf?.perShare ?? null })
    : book.leaf?.perShare ?? null;
  const marketPerShare = perShare ?? quoted;
  const marketBp = bp ?? (marketPerShare == null ? book.leaf?.bp ?? null : null);
  const q = qOf(SCHEDULE.rule606);
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);

  const n = Number(shares);
  const p = Number(price);
  const fractional = n > 0 && !Number.isInteger(n);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    remark: remarkOf({ plan: picked, adr: listing.adr }),
    basis:
      `barème Hapi (PDF modifié le ${SCHEDULE.pdfModified}), relu le ${SCHEDULE.readOn} : 0 $ de commission, ` +
      `frais de compensation ${picked.name} ` +
      (picked.whole === picked.fractional
        ? `${picked.whole} $ par ordre`
        : `${picked.whole} $ par ordre en parts entières, ${picked.fractional} $ en fractions`) +
      ", heures normales",
  };
  if (!(n > 0) || !(p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const perShareUsd = marketPerShare != null ? toUsd(marketPerShare, listing.currency) : null;
  const bookUsd =
    perShareUsd != null
      ? perShareUsd * n
      : marketPerShare == null && marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const clearing = clearingEach(n, picked);
  const brokerFees = COMMISSION * 2 + clearing * 2;
  const sell = notionalUsd == null ? null : sellLevies(notionalUsd, n);
  const regulators = sell == null ? null : sell.sec + sell.taf;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, regulators, taxUsd);
  const tafNow = tafPerShare();

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de source 605"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: { commission: COMMISSION, clearing },
    sell: {
      commission: COMMISSION,
      clearing,
      sec: sell && finite(sell.sec, 6),
      secExact: sell && finite(sell.secExact, 6),
      taf: sell && finite(sell.taf, 6),
    },
    commission: { each: COMMISSION + clearing, currency: "USD", eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      bourse: finite(regulators, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: [
      shared.basis,
      `${fractional ? "ordre fractionnaire" : "ordre en parts entières"} : ${clearing} $ à l'achat et à la vente`,
      `SEC ${SEC_RATE} de la vente arrondie au centime supérieur (${Number(((sell?.secExact) ?? 0).toPrecision(3))} $ au calcul), ` +
        `les deux lignes réglementaires du PDF sont mal libellées, le taux SEC est compté une fois`,
      tafNow === 0
        ? `TAF à 0 $ : congé du ${TAF_HOLIDAY.from} au ${TAF_HOLIDAY.to} selon l'article d'aide, puis ${TAF.perShare} $ la part plafonnée à ${TAF.cap} $`
        : `TAF ${TAF.perShare} $ la part vendue, plafond ${TAF.cap} $, arrondie au centime supérieur`,
      "CAT non imprimé, compté 0",
      listed && marketPerShare != null
        ? `carnet 605 × Q d'Apex Clearing${q != null ? ` (Q ${q.toFixed(3)})` : ""}, ${marketPerShare} $ la part : Hapi (CRD ${SCHEDULE.crd}) adopte le 606 d'Apex par référence`
        : marketPerShare != null
          ? `carnet ${marketPerShare} $ la part`
          : marketBp != null
            ? `carnet ${Number(marketBp.toPrecision(4))} bp`
            : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
      listing.adr
        ? `ADR : frais de garde du dépositaire et « might have » ${ADR.perShare} $ la part minimum ou ${ADR.perTrade} $ par ordre, conditionnels, hors total`
        : null,
      picked.month ? `abonnement Prime ${picked.month} $/mois hors trajet` : "sans abonnement",
      "compte en dollars, ligne en dollars : aucune conversion",
    ]
      .filter(Boolean)
      .join(" ; "),
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
        { ...SCHEDULE, commission: COMMISSION, plans: PLANS, sec: SEC_RATE, taf: TAF, tafHoliday: TAF_HOLIDAY, tafToday: tafPerShare(), adr: ADR, q: qOf(SCHEDULE.rule606) },
        null,
        2
      )
    );
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error(
      "usage : node brokers/hapi/hapi_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=regular|prime] [--json]"
    );
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
    plan: flag("plan") || DEFAULT_PLAN,
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }
  const l = out.listing;
  if (!l) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(`\nce que Hapi propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }
  console.log(`${l.ticker || l.isin} — ${l.name || ""}  [${out.plan}]`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.category ? `, ${l.category}` : l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
  }
  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  for (const [name, v] of Object.entries(out.parts || {})) if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
  for (const line of String(out.confidence || "").split(" ; ")) if (line) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
}
