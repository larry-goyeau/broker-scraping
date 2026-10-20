// What one round trip costs at Ndovu: buy n US shares or ETF units at price
// p, sell them back at once, in dollars. Bonds, money market funds and the
// Kibaba fund stay out.
//
// Ndovu Wealth Limited (Kenya), a CMA-licensed fund manager. It is not a
// stockbroker: it "transmits money and instructions" (terms, 5.1–5.2), and
// names no US broker or custodian. Fee pages re-read 2026-10-18.
//
//   https://ndovu.co/ke/fee-structure
//   https://ndovu.co/ke/pricing
//   https://ndovu.zohodesk.com/portal/en/kb/articles/what-fees-does-ndovu-charge  (updated 2026-07-29)
//   https://ndovu.zohodesk.com/portal/en/kb/articles/how-does-currency-conversion-work-when-i-invest-in-usd-funds  (updated 2026-09-25)
//
//   investment fee  "Global funds and shares fee", on the amount invested,
//                   at purchase: Basic 4.5%, Standard 4.0%, Ultimate 2.0%.
//                   Basic is free; Standard is KES 3,000 and Ultimate
//                   KES 30,000 a year, not in the number. Default: Basic.
//                   The help article's example: KES 100,000 into a global
//                   ETF pays 4,500 and invests 95,500. So to hold n × p of
//                   shares, the amount paid is n × p / (1 − rate) and the
//                   fee is that times the rate.
//   disinvestment   "All funds — No charges".
//   minimum         "From USD 50" on every share and ETF card.
//
// No commission, SEC fee, TAF or CAT is named apart from that fee, and the
// help article says "There are no hidden charges", so none is added.
//
// FX: the account holds KES and USD and the listing is in dollars, so the
// trade converts nothing. Shillings paid into a USD investment are converted
// by the banking partner "at the bank's rate of the day plus an applicable
// spread", unpriced; a USD bank transfer avoids it. That is the deposit,
// so it is a remark. The FAQ (https://ndovu.co/ke/faqs, read 2026-10-18)
// says the partner's "prevailing OTC" rate "plus an applicable spread",
// and names no bank (DTB is only the Kibaba fund's custodian), so there is
// no board to halve. A USD bank withdrawal is USD 9.
//
// Ndovu has no 606 in spreads/rule606.mjs and names no US dealer, so
// `usBookPerShare` answers with the module's fallback: the quoted NBBO.
//
//   node brokers/ndovu/ndovu_cost.mjs AGG AMEX USD --shares=1 --price=96.22
//   node brokers/ndovu/ndovu_cost.mjs AAPL NASDAQ USD --shares=1 --price=343.46
//   node brokers/ndovu/ndovu_cost.mjs AAPL NASDAQ USD --shares=1 --price=343.46 --plan=ultimate
//   node brokers/ndovu/ndovu_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";

const CATALOGUE = new URL("ndovu-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://ndovu.co/ke/fee-structure",
  pricing: "https://ndovu.co/ke/pricing",
  feesArticle: "https://ndovu.zohodesk.com/portal/en/kb/articles/what-fees-does-ndovu-charge",
  fxArticle: "https://ndovu.zohodesk.com/portal/en/kb/articles/how-does-currency-conversion-work-when-i-invest-in-usd-funds",
  terms: "https://ndovu.co/ke/terms-and-conditions",
  readOn: "2026-10-18",
  entity: "Ndovu Wealth Limited",
  // No US dealer named: the module's fallback applies.
  rule606: "ndovu",
};

const PLANS = {
  basic: { rate: 0.045, yearly: 0 },
  standard: { rate: 0.04, yearly: 3000 },
  ultimate: { rate: 0.02, yearly: 30000 },
};
const DEFAULT_PLAN = "basic";
const SALE_FEE = 0;
const MIN_USD = 50;
const USD_WITHDRAWAL = 9;
const LABEL = { basic: "Basic", standard: "Standard", ultimate: "Ultimate" };
const remarkOf = (key) =>
  [
    PLANS[key].yearly ? `${LABEL[key]} is KES ${PLANS[key].yearly.toLocaleString("en-US")} a year.` : `${LABEL[key]} is free.`,
  ].join("\n");

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isOverTheCounter = (row) => /^(OTC|PINK|GREY)/i.test(String(row?.exchange || ""));
const pct = (r) => `${(100 * r).toFixed(1).replace(".", ",")} %`;

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
 * `usd` is the number the page prints; `brokerFees` is Ndovu's investment
 * fee. `plan` picks the rate (basic by default).
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
  const planKey = PLANS[String(plan || "").toLowerCase()] ? String(plan).toLowerCase() : DEFAULT_PLAN;
  const tier = PLANS[planKey];
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "USD", remark: remarkOf(planKey) };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Ndovu n'existe pas encore : lancer `node brokers/ndovu/ndovu_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Ndovu` };
  if (!matches.length) {
    return { ...answer, why: `${etf} n'est pas coté sur cette place dans cette devise chez Ndovu`, alternatives: listAlternatives(named) };
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
  };
  // No Ndovu Q in the module, so this is the quoted NBBO of the name.
  const quoted = otc ? null : usBookPerShare({ broker: SCHEDULE.rule606, ticker: listing.ticker, fallback: null });
  const marketPerShare = perShare ?? quoted ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare == null ? book.leaf?.bp ?? null : null);
  const q = qOf(SCHEDULE.rule606);

  const shared = {
    ...answer,
    listing,
    remark: listing.currency === "USD" ? `${answer.remark}\n${fxRemark("", listing.currency)}` : answer.remark,
    plan: planKey,
    bp: marketBp,
    perShare: marketPerShare,
    url: SCHEDULE.source,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    basis: `barème Ndovu relu le ${SCHEDULE.readOn}, offre ${planKey} : ${pct(tier.rate)} du montant investi à l'achat, sortie gratuite`,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  // The fee comes out of the amount paid, so holding `notional` of shares
  // takes notional / (1 − rate) of cash.
  const paid = notionalUsd == null ? null : notionalUsd / (1 - tier.rate);
  if (paid != null && paid < MIN_USD) {
    // Too small, not unsellable: the line stays buyable at a larger size.
    return {
      ...shared,
      why: `minimum ${MIN_USD} USD par investissement : ${Number(paid.toFixed(2))} USD payés ici`,
    };
  }
  const buyFee = paid == null ? null : paid * tier.rate;
  const bookUsd =
    marketPerShare != null ? marketPerShare * n : marketBp != null && notionalUsd != null ? (notionalUsd * marketBp) / 1e4 : null;
  const fees = plus(buyFee, SALE_FEE);
  const usd = plus(bookUsd, fees);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(fees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de source 605"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), paidUsd: finite(paid, 6), currency: listing.currency },
    buy: { fee: finite(buyFee, 6), rate: tier.rate, onGross: true },
    sell: { fee: SALE_FEE },
    parts: {
      marché: finite(bookUsd, 6),
      frais: finite(fees, 6),
    },
    commission: { each: tier.rate, currency: "USD", eachWay: false, side: "achat" },
    confidence: [
      `frais d'investissement Ndovu ${pct(tier.rate)} (offre ${planKey}) prélevés sur le montant payé : ${Number(paid.toFixed(2))} $ payés pour ${Number(notionalUsd.toFixed(2))} $ de titres, soit ${Number(buyFee.toFixed(4))} $, désinvestissement gratuit`,
      `ni commission, ni SEC, ni TAF, ni CAT nommés, et l'article d'aide dit « There are no hidden charges »`,
      marketPerShare != null
        ? `NBBO coté ${marketPerShare} $ la part : Ndovu ne nomme aucun courtier américain et n'a pas de 606 dans spreads/rule606.mjs${q != null ? "" : ", donc pas de Q"}`
        : marketBp != null
          ? `carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`
          : `aucun carnet : ${m.unsourced?.name || listing.exchange}, ${m.unsourced?.why || "pas de source"}`,
      `hors total : abonnement ${tier.yearly ? `${tier.yearly} KES par an` : "gratuit"}, conversion KES → USD au taux de la banque plus un écart non publié (un virement en USD l'évite), retrait bancaire USD ${USD_WITHDRAWAL} $`,
    ].join(" ; "),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, plans: PLANS, saleFee: SALE_FEE, minUsd: MIN_USD, usdWithdrawal: USD_WITHDRAWAL, q: qOf(SCHEDULE.rule606) }, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/ndovu/ndovu_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=basic|standard|ultimate] [--json]");
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
    if (out.alternatives?.length) console.log(`\nce que Ndovu propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
