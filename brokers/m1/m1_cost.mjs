// What one round trip costs at M1: buy n shares at price p, sell them back at
// once, in dollars. Stocks, ETFs, ETNs and closed-end funds in a self-directed
// M1 Invest account. Crypto (Bakkt), M1 Advisor and the cash account stay out.
//
// M1 Finance LLC (US), self-clearing. Fee schedule re-read 2026-10-18, the
// PDF says "Last Updated: October 2026". The pricing page says the same
// thing in a sentence: no commission, no trading fee, no management fee.
//
//   https://m1-production-agreements.s3.us-east-1.amazonaws.com/documents/Miscellaneous_Fees.pdf
//   https://m1.com/pricing/
//   https://m1.com/legal/disclosures/
//
//   commission      $0 each way
//   SEC             0.0000206 of the sale, rounded up to the cent
//   FINRA TAF       $0.00 a share: the schedule prints a fee holiday from
//                   1 Oct 2026 to 31 Dec 2026, and no rate for after it
//   ADR             charged by the depositary bank, no rate printed
//
// The schedule's worked example (ten Apple at $150: "nothing for SEC fees
// and 1 cent in TAF") is older than its own rates. At 0.0000206 that sale
// pays 4 cents of SEC, and the TAF is on holiday. The formula is used, not
// the example.
//
// Left out because they do not ride on an order: the $3 monthly platform fee
// (waived above $10,000 on the platform), the $50 minimum-balance fee, the
// $25 domestic wire, the $100 outgoing transfer. The account holds dollars and
// takes wires from US banks only, so there is no conversion.
//
// M1 publishes no Rule 606(a) report: it takes orders "on a not held basis
// and therefore is not required to provide this report" (Rules 606 & 607
// disclosure), and it is not in the FINRA 606 bulk file. It is self-
// clearing and names no other dealer (the Apex brochures on the disclosure
// page are the legacy accounts). So `usBookPerShare` answers with the
// module's fallback: the quoted NBBO of the name, not a wholesaler fill.
//   https://m1-production-agreements.s3.amazonaws.com/documents/M1+Rules+606+%26+607+Disclosures.pdf
//
//   node brokers/m1/m1_cost.mjs VOO NYSE USD --shares=10 --price=630
//   node brokers/m1/m1_cost.mjs AAPL NASDAQ USD --shares=10 --price=343.46
//   node brokers/m1/m1_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("m1-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://m1-production-agreements.s3.us-east-1.amazonaws.com/documents/Miscellaneous_Fees.pdf",
  pricing: "https://m1.com/pricing/",
  disclosures: "https://m1.com/legal/disclosures/",
  printed: "October 2026",
  readOn: "2026-10-18",
  entity: "M1 Finance LLC",
  // No 606(a) report and no dealer named: the module's fallback applies.
  rule606: "m1",
};

const COMMISSION = 0;
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0;
const TAF_HOLIDAY = { from: "2026-10-01", to: "2026-12-31" };
const PLATFORM_FEE = { monthly: 3, waivedAbove: 10000 };
const CENT = 0.01;
const REMARK = `Platform fee $${PLATFORM_FEE.monthly}/month under $${PLATFORM_FEE.waivedAbove.toLocaleString("en-US")}.`;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isOverTheCounter = (row) => /^(OTC|PINK|GREY)/i.test(String(row?.exchange || ""));
const isAdr = (row) => /\bADRs?\b|american deposit/i.test(String(row?.name || ""));
// Rounds a charge up to the cent, as the schedule says. Missing stays missing.
const up = (value) => (value == null || Number.isNaN(value) ? null : value > 0 ? Math.ceil(value / CENT - 1e-9) * CENT : 0);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue || null : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();
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
    .filter((m) => !wantCurrency || String(m.row.currency || "USD").toUpperCase() === wantCurrency);
  return { named, matches };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints; `brokerFees` is the commission alone.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "USD", remark: REMARK };
  if (!catalogue) {
    return { ...answer, why: "le catalogue M1 n'existe pas encore : lancer `node brokers/m1/m1_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue M1` };
  if (!matches.length) {
    return { ...answer, why: `${etf} n'est pas coté sur cette place dans cette devise chez M1`, alternatives: listAlternatives(named) };
  }

  const m = matches[0];
  const otc = isOverTheCounter(m.row);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency || "USD",
    unsourced: m.unsourced,
    broker: SCHEDULE.rule606,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "USD").toUpperCase(),
    brokerExchange: m.row.exchange || null,
    otc,
    adr: isAdr(m.row),
  };
  // No M1 Q in the module, so this is the quoted NBBO of the name. The
  // fallback stays null: the leaf below is already the same call's answer.
  const quoted = otc ? null : usBookPerShare({ broker: SCHEDULE.rule606, ticker: listing.ticker, fallback: null });
  const marketPerShare = perShare ?? quoted ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare == null ? book.leaf?.bp ?? null : null);
  const q = qOf(SCHEDULE.rule606);

  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    url: SCHEDULE.source,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    remark: listing.adr ? `${REMARK}\nADR fees charged by the depositary.` : REMARK,
    basis: `barème M1 (« Last Updated: ${SCHEDULE.printed} »), relu le ${SCHEDULE.readOn} : 0 $ de commission, SEC à la vente, TAF en congé`,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const bookUsd =
    marketPerShare != null ? marketPerShare * n : marketBp != null && notionalUsd != null ? (notionalUsd * marketBp) / 1e4 : null;
  const secRaw = notionalUsd == null ? null : notionalUsd * SEC_RATE;
  const sec = up(secRaw);
  const taf = up(n * TAF_PER_SHARE);
  const commission = COMMISSION * 2;
  const usd = plus(bookUsd, commission, sec, taf);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commission, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de source 605"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: { commission: COMMISSION },
    sell: { commission: COMMISSION, sec: finite(sec, 6), secExact: finite(secRaw, 6), taf: finite(taf, 6) },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(commission, 6),
      réglementaire: finite(plus(sec, taf), 6),
    },
    commission: { each: COMMISSION, currency: "USD", eachWay: true },
    confidence: [
      `commission M1 0 $ par sens, barème « ${SCHEDULE.printed} » relu le ${SCHEDULE.readOn}`,
      `SEC ${SEC_RATE} du montant à la vente, arrondie au centime supérieur : ${Number((secRaw ?? 0).toPrecision(3))} $ au calcul, ${(sec ?? 0).toFixed(2)} $ facturés`,
      `TAF à 0 $ la part : congé imprimé du ${TAF_HOLIDAY.from} au ${TAF_HOLIDAY.to}, aucun taux pour la suite — relire le barème en janvier`,
      marketPerShare != null
        ? `NBBO coté ${marketPerShare} $ la part : M1 ne publie pas de 606(a) (ordres not held) et ne nomme aucun autre courtier${q != null ? "" : ", donc pas de Q"}`
        : marketBp != null
          ? `carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`
          : `aucun carnet : ${m.unsourced?.name || listing.exchange}, ${m.unsourced?.why || "pas de source"}`,
      `hors total : frais de plateforme ${PLATFORM_FEE.monthly} $ par mois sous ${PLATFORM_FEE.waivedAbove} $, frais d'ADR du dépositaire, virement 25 $, transfert sortant 100 $. Compte en dollars, aucune conversion`,
    ].join(" ; "),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, commission: COMMISSION, sec: SEC_RATE, taf: TAF_PER_SHARE, tafHoliday: TAF_HOLIDAY, platformFee: PLATFORM_FEE, q: qOf(SCHEDULE.rule606) }, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/m1/m1_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]");
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
    process.exit(0);
  }
  const l = out.listing;
  if (!l) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(`\nce que M1 propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
  }
  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  for (const [name, v] of Object.entries(out.parts || {})) if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
  console.log(`\n  ${out.basis}`);
  for (const line of String(out.confidence || "").split(" ; ")) if (line) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
}
