// What one round trip costs at BUX: buy n shares at price p, sell them back
// at once (market order both ways).
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. The published ticket is in euros; it is
// converted at the ECB mid and folded into the floor (`c` = 0).
//
// BUX B.V. (NL), phone app, eight EU countries. The catalogue is recovered
// from screen recordings (`bux.mjs`). Cash is euro. Three plans on
// bux.com/fees, read 2026-09-10. Default is Basic (no monthly fee).
//
// Market order, each way:
//   EU stocks    Basic 3.99 € · Plus 1.99 € · Prime 0.99 €
//   US stocks    0.99 € every plan
//   ETF / ETC    0.99 € every plan
//
// The ticket is a flat order fee, not a percentage (`min fees`, `c` = 0).
// US FX markup (0.75 % / 0.25 % / 0.20 %) is charged on conversion and sits
// in `a` both ways. EUR lines have no FX. SEC / TAF are not on the card
// and not on the 2026-09-10 ex-ante. Monthly and custody stay in the remark.
//
// Zero Orders (end of day) and Investment Plan buys are not this trip: the
// plan buy is free, the sell is a market order. Limit / GTC / Zero are not
// on Basic.
//
// One live Plus trip on 2026-09-10, EUR cash. One TXG (US88025U1097) market
// both ways. Tickets 0.99 € each way. Ex-ante FX on the buy is 0.25 % (the
// Plus card) and on the sell prints 0.33 %; `a` keeps 0.25 % × 2. Cash
// 70.00 → 67.48. `c` stays 0; the 1.98 € is the floor.
//
//   https://bux.com/fees/
//
//   node bux/bux_cost.mjs CAC
//   node bux/bux_cost.mjs AAPL NASDAQ USD --plan=plus
//   node bux/bux_cost.mjs TXG NASDAQ USD --plan=plus --shares=1 --price=66
//   node bux/bux_cost.mjs AIR EURONEXT EUR --shares=1 --price=140 --plan=prime
//   node bux/bux_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";

const CATALOGUE = new URL("bux-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);
const TAXES = new URL("../parsed_json/taxes.json", import.meta.url);
const T212 = new URL("../trading212/trading212-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://bux.com/fees/",
  readOn: "2026-09-10",
  entity: "BUX B.V. (NL)",
};

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const CHECK = {
  isin: "US88025U1097",
  ticker: "TXG",
  plan: "plus",
  accountCcy: "EUR",
  n: 1,
  buy: { priceUsd: 66.44, commission: 0.99, fxEur: 0.14, fxPct: 0.0025 },
  sell: { priceUsd: 66.06, commission: 0.99, fxEur: 0.19, fxPct: 0.0033 },
  cash: { start: 70, end: 67.477 },
  commissionPaid: 1.98,
  on: "2026-09-10",
};

const DEFAULT_PLAN = "basic";

const PLANS = {
  basic: {
    id: "basic",
    label: "Basic",
    eu: 3.99,
    us: 0.99,
    etf: 0.99,
    fx: 0.0075,
    monthly: 0,
    custody: 0.002,
    custodyAbove: 0,
  },
  plus: {
    id: "plus",
    label: "Plus",
    eu: 1.99,
    us: 0.99,
    etf: 0.99,
    fx: 0.0025,
    monthly: 2.99,
    custody: 0.001,
    custodyAbove: 250000,
  },
  prime: {
    id: "prime",
    label: "Prime",
    eu: 0.99,
    us: 0.99,
    etf: 0.99,
    fx: 0.002,
    monthly: 7.99,
    custody: 0.001,
    custodyAbove: 500000,
  },
};

const PLAN_ALIAS = {
  basic: "basic",
  plus: "plus",
  prime: "prime",
  free: "basic",
  default: "basic",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};
const taxFile = fs.existsSync(TAXES) ? JSON.parse(fs.readFileSync(TAXES, "utf8")) : null;

const taxByIsin = (() => {
  const out = new Map();
  if (!taxFile?.byCode || !fs.existsSync(T212)) return out;
  const t212 = JSON.parse(fs.readFileSync(T212, "utf8"));
  for (const r of Array.isArray(t212) ? t212 : t212.rows || []) {
    const isin = String(r.isin || "").toUpperCase();
    const entry = r.code ? taxFile.byCode[r.code] : null;
    if (isin && entry && (entry.achat || entry.vente)) out.set(isin, entry);
  }
  return out;
})();

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function planOf(name) {
  const id = PLAN_ALIAS[loose(name || DEFAULT_PLAN).toLowerCase()] || PLAN_ALIAS[loose(name)];
  return PLANS[id] || PLANS[DEFAULT_PLAN];
}

export function ticketOf(plan, market) {
  const p = typeof plan === "string" ? planOf(plan) : plan;
  if (market === "etf") return p.etf;
  if (market === "us") return p.us;
  return p.eu;
}

function remarkOf({ plan, market } = {}) {
  const each = ticketOf(plan, market);
  const lines = [`min fees ${Number((each * 2).toPrecision(4))} €.`];
  if (plan.monthly) lines.push(`${plan.monthly} €/month.`);
  if (plan.custodyAbove) {
    lines.push(`Custody ${(plan.custody * 100).toFixed(2)}%/year above ${plan.custodyAbove / 1000}k €.`);
  } else if (plan.custody) {
    lines.push(`Custody ${(plan.custody * 100).toFixed(2)}%/year.`);
  }
  return lines.join("\n");
}

export function feeMarketOf(row, mic) {
  const type = String(row?.type || "").toUpperCase();
  if (type === "ETF" || type === "ETC" || type === "ETN") return "etf";
  const code = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (US_MICS.has(m) || /^(NASDAQ|NYSE|AMEX|ARCA|BATS|CBOE)$/.test(code)) return "us";
  return "eu";
}

function taxesOf(isin) {
  if (!taxFile) return { known: false, why: "relevé fiscal absent : lancer node taxes.mjs" };
  const entry = taxByIsin.get(String(isin || "").toUpperCase());
  if (entry) return { known: true, buy: entry.achat ?? {}, sell: entry.vente ?? {} };
  return { known: false, assumedZero: true, why: "pas de ligne fiscale Trading212 pour cet ISIN" };
}

function taxRates(tax) {
  const rates = {};
  for (const [name, line] of Object.entries(tax.buy ?? {})) {
    if (line.ofValue != null) rates[name] = line.ofValue;
  }
  return rates;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (!m.row.exchange) return false;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r, book.mic ?? venue?.mic);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function exactCost({ plan = DEFAULT_PLAN, market }) {
  const picked = planOf(plan);
  const each = ticketOf(picked, market);
  return {
    commission: dollars(each * 2, "EUR"),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: "EUR" },
    plan: picked.id,
  };
}

export function roundTripCost({ etf, place, currency, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    b: 0,
    c: 0,
    ccy: QUOTE,
    floor: null,
    cap: null,
    threshold: null,
    plan: picked.id,
    etf,
    place,
    currency,
  };

  if (!catalogue) {
    return { ...answer, why: "le catalogue BUX n'existe pas encore : lancer `node bux/bux.mjs`" };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BUX` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BUX`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row, listing.mic);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const fxPct = american ? picked.fx * 2 : 0;
  const knownPct = taxTotal + fxPct;
  const a = marketBp != null ? marketBp / 1e4 + knownPct : knownPct || 0;
  const bookUsd = american ? (marketPerShare ?? 0) : dollars(marketPerShare ?? 0, listing.currency) ?? 0;
  const each = ticketOf(picked, market);
  const floorUsd = dollars(each * 2, "EUR");

  return {
    ...answer,
    a: Number(Number(a).toPrecision(4)),
    b: Number(bookUsd.toPrecision(6)),
    c: 0,
    floor: floorUsd,
    listing,
    feeMarket: market,
    remark: remarkOf({ plan: picked, market }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      change: fxPct || null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème BUX ${picked.label}, palier ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      each,
      roundTrip: each * 2,
      currency: "EUR",
      eachWay: true,
      plan: picked.id,
    },
    ccy: QUOTE,
    cap: null,
    threshold: null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `commission ${picked.label} ${market} selon bux.com/fees, lu le ${SCHEDULE.readOn}. ` +
      `Ticket ${each} € par jambe (market order). ` +
      (fxPct ? `FX US ${(picked.fx * 100).toFixed(2)} % par jambe dans a. ` : "") +
      `Ticket dans le plancher, b = 0, c = 0. SEC / TAF absents de la carte et de l'ex-ante. ` +
      `Zero Order et Investment Plan ne sont pas cet aller-retour. ` +
      (american
        ? `Aller-retour Plus TXG le ${CHECK.on} : tickets ${CHECK.commissionPaid} €, FX des deux côtés (achat ${CHECK.buy.fxPct * 100} %, vente ex-ante ${CHECK.sell.fxPct * 100} %). `
        : "") +
      (leaf ? "" : `Pas de feuille de carnet pour cet ISIN / cette place. `),
    check: american ? CHECK : null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, plans: PLANS, coverage: coverage() }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node bux_cost.mjs <ticker|ISIN> [place] [devise] [--plan=basic|plus|prime] [--shares=n] [--price=p] [--json]\n" +
        "        node bux_cost.mjs --schedule\n" +
        "  ex.   node bux_cost.mjs CAC\n" +
        "        node bux_cost.mjs AAPL NASDAQ USD --plan=plus\n" +
        "        node bux_cost.mjs AIRFRANCE EURONEXT EUR --shares=1 --price=10"
    );
    process.exit(2);
  }

  const out = roundTripCost({
    etf,
    place,
    currency,
    plan: flag("plan") || DEFAULT_PLAN,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null && !out.listing) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que BUX propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.change) detail.push(`change ${out.parts.change}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : spread 605" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre : ticket dans la remark, pas dans c)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  if (out.why) console.log(out.why);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const extra = out.threshold && amount >= out.threshold.above ? out.threshold.c : 0;
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c + extra : null;
    const billed = exactCost({ plan: out.plan, market: out.feeMarket });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          (billed.native?.each != null
            ? ` (${Number(billed.native.each).toPrecision(4)} ${billed.native.currency} × 2)`
            : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
