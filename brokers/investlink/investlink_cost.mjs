// What one round trip costs at Investlink (Investlink LTD, AFSA, Kazakhstan):
// buy n shares at price p, sell them on a later day, in dollars. US shares
// and ETFs on NYSE, Nasdaq and NYSE Arca, held at Alpaca Securities LLC.
// Options and IPOs are other products.
//
// Read 2026-10-24.   https://investlink.kz/tariffs/
//
//   Pro               "$0.02 за акцию, min $2.00 за сделку"
//                     $0.02 a share, $2.00 minimum an order, each side.
//   Premium, Private  "0.25% от суммы, min $2.00 за сделку"
//                     0.25 % of the order, $2.00 minimum, each side.
//                     Footnote 1: a share under $1.50 is charged by the
//                     Pro rate instead, $0.02 a share, still $2.00 minimum.
//   Same trading card on Premium and Private (Private only differs by its
//   $100 000 minimum account and an adviser), so they are one plan here.
//   Inactivity, account and custody $0. Withdrawal $35 by SWIFT, a cash
//   movement, not this trip.
//
// Plans are the client's subscription, one row each (`query.plan`):
//   pro       Pro
//   premium   Premium / Private
//
// Regulators. The page prints "SEC … сумма сделки х $0.000008, минимум $0.01"
// and "TAF … количество акций х $0.000166, минимум $0.01, максимум $8.30",
// figures of an older SEC/FINRA year. The account is at Alpaca, which passes
// the current SEC, TAF and CAT through and rounds each type up to the cent,
// per account, per day (https://files.alpaca.markets/disclosures/library/BrokFeeSched.pdf),
// as alpaca and fintual do: the buy day pays CAT, the sell day pays SEC, TAF
// and CAT. Four cents on a small ticket.
//
// Money comes in by SWIFT to the Alpaca account in dollars (deposits.mjs:
// USD); every row is USD, so no FX.
//
// Book: the account is at Alpaca Securities LLC (investlink.kz home page and
// /reliability/), so a US line uses Alpaca's 606 Q (spreads/rule606.mjs key
// "alpaca") on the 605 effective spread.
//
//   node brokers/investlink/investlink_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/investlink/investlink_cost.mjs AAPL NASDAQ USD --shares=10 --price=230 --plan=premium
//   node brokers/investlink/investlink_cost.mjs SPY AMEX USD --shares=10 --price=500 --plan=premium
//   node brokers/investlink/investlink_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("investlink-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://investlink.kz/tariffs/",
  regulators: "https://files.alpaca.markets/disclosures/library/BrokFeeSched.pdf",
  readOn: "2026-10-24",
  entity: "Investlink LTD",
  clearing: "Alpaca Securities LLC",
  rule606: "alpaca",
};

const PER_SHARE = 0.02;
const PERCENT = 0.0025;
const MIN_ORDER = 2;
const PER_SHARE_BELOW = 1.5;

const PLANS = {
  pro: { id: "pro", name: "Pro", kind: "perShare" },
  premium: { id: "premium", name: "Premium / Private", kind: "percent" },
};
const PLAN_ALIAS = { pro: "pro", premium: "premium", private: "premium" };
const DEFAULT_PLAN = "pro";

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const CAT_PER_SHARE = 0.000003;
const CENT = 0.01;
const up = (value) => (value > 0 ? Math.ceil(value / CENT - 1e-9) * CENT : 0);
const BASE = "USD";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

export const planOf = (name) => PLANS[PLAN_ALIAS[String(name || "").trim().toLowerCase()]] || null;

/** Investlink's commission on one side, in dollars. */
export function commissionEach({ plan, shares, price }) {
  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) return null;
  const byShare = plan.kind === "perShare" || p < PER_SHARE_BELOW;
  return Math.max(byShare ? n * PER_SHARE : n * p * PERCENT, MIN_ORDER);
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace)
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const chosen = planOf(plan || DEFAULT_PLAN);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: chosen?.id ?? plan,
    onlineBuy: true,
    cashCurrency: BASE,
    url: SCHEDULE.url,
    remark: "",
  };
  if (!chosen) return { ...answer, why: `formule inconnue chez Investlink : ${plan}` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Investlink n'existe pas encore : lancer `node brokers/investlink/investlink_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Investlink` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Investlink`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "investlink",
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
  const quoted = usBookPerShare({ broker: SCHEDULE.rule606, ticker: listing.ticker, fallback: book.leaf?.perShare ?? null });
  const marketBp = bp ?? null;
  const marketPerShare = perShare ?? quoted;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const cash = listingCash(listing.currency);
  const held = depositHas("investlink", null, cash);
  const card =
    chosen.kind === "perShare"
      ? `${PER_SHARE} $ la part, minimum ${MIN_ORDER} $ par ordre`
      : `${(100 * PERCENT).toFixed(2)} % du montant, minimum ${MIN_ORDER} $ par ordre, ${PER_SHARE} $ la part sous ${PER_SHARE_BELOW} $`;
  const shared = {
    ...answer,
    cashCurrency: held ? cash : BASE,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis: `barème Investlink ${chosen.name}, relu le ${SCHEDULE.readOn} : ${card}, à l'achat et à la vente ; Alpaca arrondit SEC, TAF et CAT au centime par jour, vente un autre jour`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: null,
  };
  if (!held) {
    return { ...shared, why: `change forcé non publié : ${cash} n'est pas une devise de dépôt chez Investlink, et aucun taux n'est imprimé` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = commissionEach({ plan: chosen, shares: n, price: p });
  const commissionUsd = dollars(2 * each, "USD");
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const catLeg = n * CAT_PER_SHARE;
  const secRaw = notionalUsd * SEC_RATE;
  const tafRaw = Math.min(n * TAF_PER_SHARE, TAF_CAP);
  // Buy day: CAT. Sell day: SEC, TAF and CAT, each type rounded up to the cent.
  const regulatory = up(catLeg) + up(secRaw) + up(tafRaw) + up(catLeg);
  const usd = plus(bookUsd, commissionUsd, regulatory, taxUsd);
  const byShare = chosen.kind === "perShare" || p < PER_SHARE_BELOW;
  const confidence = [
    shared.basis,
    listing.type === "ETF" ? "barème ETF (le même)" : "barème action",
    `courtage ${each.toFixed(2)} $ par jambe (${
      each === MIN_ORDER ? "minimum" : byShare ? `${n} × ${PER_SHARE} $` : `${(100 * PERCENT).toFixed(2)} % de ${notional.toFixed(2)} $`
    })` + (chosen.kind === "percent" && p < PER_SHARE_BELOW ? ` : cours sous ${PER_SHARE_BELOW} $, tarif Pro (note 1)` : ""),
    `réglementaire ${regulatory.toFixed(2)} $ : CAT le jour de l'achat, SEC, TAF et CAT le jour de la vente (taux courants ; la page imprime encore SEC 0.000008 et TAF 0.000166 / 8.30 $)`,
    "mélange 606 d'Alpaca Securities",
    "compte en dollars, aucun change",
    marketPerShare != null ? `carnet ${marketPerShare} $ la part` : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: {
      each,
      currency: "USD",
      eachWay: true,
      plan: chosen.id,
      ...(byShare ? { perShare: PER_SHARE } : { rate: PERCENT }),
      min: MIN_ORDER,
    },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de 605 pour ce ticker"}` }
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
      courtage: finite(commissionUsd, 6),
      réglementaire: finite(regulatory, 6),
      taxes: finite(taxUsd, 6),
    },
    sell: { sec: up(secRaw), taf: up(tafRaw), tafCapped: tafRaw >= TAF_CAP, cat: 2 * up(catLeg) },
    confidence,
  };
}

roundTrip.plans = Object.keys(PLANS);

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
    console.log(JSON.stringify({
      ...SCHEDULE,
      plans: PLANS,
      perShare: PER_SHARE,
      percent: PERCENT,
      minOrder: MIN_ORDER,
      perShareBelowPrice: PER_SHARE_BELOW,
      sec: SEC_RATE,
      taf: { perShare: TAF_PER_SHARE, cap: TAF_CAP },
      cat: CAT_PER_SHARE,
    }, null, 2));
    return;
  }
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/investlink/investlink_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=pro|premium]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    plan: flag("plan"),
  });
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}  [${out.plan}]\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.réglementaire) console.log(`  réglementaire  : ${parts.réglementaire} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
