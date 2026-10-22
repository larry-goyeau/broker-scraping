// What one round trip costs at Grifin (Interest Investments, Inc.; advice
// from Interest Financial, LLC; Apex Clearing Corporation is the broker):
// buy n shares at price p, sell them back at once, in dollars. US-listed
// and OTC shares of the Grifin universe, market orders in market hours.
//
// Read on 2026-10-21.
//   https://www.grifin.com/documents/grifin-fee-schedule.pdf
//     (Grifin Fee Schedule 10.31.2025)
//   https://www.grifin.com/legal/fees (updated 2026-10-19, V.05 06/25/2026)
//   https://www.grifin.com/legal/advisory-agreement (v.10, 2026-06-25)
//   https://help.grifin.com/knowledge/what-does-reg-and-taf-fees-mean
//
//   Subscription    $9 a month or $90 a year (as little as $3 a month the
//                   first year; the agreement gives a $5-$12 / $60-$120
//                   range), of which $0.10 a month is the advisory fee.
//                   It is the account, not this trip, and the trading fee is
//                   the same on both, so one row.
//   Commission      $0 on the buy and on the sale ("trading occurs free of
//                   commission"; "We pay all brokerage and transaction costs
//                   for stock purchase").
//   SEC             sells only. The schedule still prints $27.80 per
//                   $1,000,000; the help page says the fee is passed through
//                   to the agency, so the number uses the current
//                   $20.60 per $1,000,000 (0.0000206 of the sale), as the
//                   other US files do. No rounding is printed for it.
//   FINRA TAF       sells only, rounded up to the penny. The schedule still
//                   prints $0.000166 a share, cap $8.30; the number uses the
//                   current $0.000195 / $9.79.
//   CAT             "we will NOT pass this fee on to you": $0.
//   Market orders only; automatic purchases may be batched and timed by
//   Grifin within market hours. The agreement says selling a fraction of a
//   share "can result in additional charges" and prices none: not counted.
//   ACH in $0, outbound wire $25 / $45, ACATS out $75: not this order.
//
// In the total: the book crossed and the SEC and TAF on the sale. No remark:
// cash is dollars only (deposits.mjs) and every line is in dollars.
//
// Apex Clearing executes every order, so a listed line takes Apex's Rule
// 606 Q (spreads/rule606.mjs maps "grifin" to "apex"). An OTC line takes
// the catalogue venue's own book.
//
//   node brokers/grifin/grifin_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/grifin/grifin_cost.mjs KO XNYS USD --shares=60000 --price=70
//   node brokers/grifin/grifin_cost.mjs ADRNY OTCM USD --shares=100 --price=40
//   node brokers/grifin/grifin_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("grifin-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.grifin.com/documents/grifin-fee-schedule.pdf",
  fees: "https://www.grifin.com/legal/fees",
  agreement: "https://www.grifin.com/legal/advisory-agreement",
  regulatory: "https://help.grifin.com/knowledge/what-does-reg-and-taf-fees-mean",
  readOn: "2026-10-21",
  scheduleOn: "2025-10-31",
  entity: "Interest Investments, Inc. (Apex Clearing Corporation)",
  rule606: "apex",
};

const SEC = 0.0000206;
const TAF = 0.000195;
const TAF_CAP = 9.79;
const ON_PAGE = { secPerMillion: 27.8, tafPerShare: 0.000166, tafCap: 8.3 };
const LISTED = new Set(["XNAS", "XNYS", "TXSE", "ARCX", "XASE", "BATS"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

// Up to the penny, as the schedule and the help page say of the TAF.
const upPenny = (value) => (value > 0 ? Math.ceil(value * 100 - 1e-9) / 100 : 0);

export function sellLevies(notional, shares) {
  return {
    sec: Number((notional * SEC).toFixed(6)),
    taf: upPenny(Math.min(shares * TAF, TAF_CAP)),
    cat: 0,
  };
}

// Apex's Q, through the "grifin" alias in rule606.mjs.
const dealer = () => (qOf("grifin") != null ? "grifin" : SCHEDULE.rule606);

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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
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
    cashCurrency: "USD",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Grifin n'existe pas encore : lancer `node brokers/grifin/grifin_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Grifin` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Grifin`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: dealer(),
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
  const listed = LISTED.has(listing.mic) && listing.currency === "USD";
  // The fallback stays null: where the 605 has no row, the leaf already
  // carries Apex's Q once.
  const quoted = listed ? usBookPerShare({ broker: dealer(), ticker: listing.ticker, fallback: null }) : null;
  const marketPerShare = perShare ?? quoted ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  // Q is Apex's gap against the improved 605, so a listed book is that 605
  // times Q, not the quoted NBBO.
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `barème Grifin du ${SCHEDULE.scheduleOn}, relu le ${SCHEDULE.readOn} : 0 $ de courtage par sens ; ` +
      `à la vente SEC 20,60 $ par million et TAF 0,000195 $ la part (plafond 9,79 $, arrondie au centime supérieur), ` +
      `taux en vigueur, le barème imprimant encore 27,80 $ et 0,000166 $ ; CAT non répercutée`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const sell = notionalUsd == null ? null : sellLevies(notionalUsd, n);
  const regulators = sell == null ? null : sell.sec + sell.taf + sell.cat;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, 0, regulators, taxUsd);
  const confidence = [
    shared.basis,
    listed ? "mélange 606 d'Apex Clearing" : "place du catalogue (OTC)",
    listed && marketPerShare != null
      ? `carnet 605 × Q Apex, ${marketPerShare} $ la part`
      : marketPerShare != null
        ? `carnet ${marketPerShare} $ la part`
        : marketBp != null
          ? `carnet ${marketBp} bp`
          : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
    "ordres au marché seulement, achats automatiques regroupés à la discrétion de Grifin pendant la séance",
    "hors total : la vente d'une fraction de part « peut entraîner des frais supplémentaires » que le contrat ne chiffre pas",
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(0, 6),
    commission: { each: 0, currency: "USD", eachWay: true },
    regulators: sell,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de carnet pour ce ticker"}` }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(0, 6),
      bourse: finite(regulators, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        { ...SCHEDULE, commission: 0, sec: SEC, taf: TAF, tafCap: TAF_CAP, cat: 0, onPage: ON_PAGE, subscription: "9 USD a month or 90 USD a year" },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/grifin/grifin_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--bp=x] [--per-share=x] [--json]");
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
  if (!out.listing) {
    console.log(out.why);
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.bourse) console.log(`  régulateur     : ${parts.bourse} $   (SEC ${out.regulators?.sec ?? 0}, TAF ${out.regulators?.taf ?? 0})`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
