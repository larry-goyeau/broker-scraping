// What one round trip costs at bunq Stocks: buy n shares at price p, sell them
// back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in.
//
// bunq Stocks (Ginmon / Upvest, app only). The catalogue names an ISIN and a
// euro quote, never a venue. Upvest's best-execution list of 2025-12-16 puts
// EUR shares and EUR ETPs on Tradegate, then Quotrix. Xetra is not on that
// list. bunq's own hours (08:00–21:00 CEST) match those books, not Xetra.
// `a` is that book, taxes, and the published % × 2. There is no ticket, so
// `b` and `c` stay 0. SEC / TAF stay out: the line is a euro quote.
//
// After the first three months, Core is 0.99 % a side. Pro is 0.79 %, Elite
// 0.49 %. The first three months are 0 % up to €100,000 of completed volume
// (`--plan=promo`). Default is Core: that is the published ongoing rate, not
// the welcome window. The % is taken from the euro amount you type; Organize
// / Auto Round Up fold the fee into that amount so the cash out stays the
// figure you set.
//
// bunq's help still prints French FTT at 0.3 %. A live TTE buy on 2026-09-09
// charged 0.20 € on 49.00 € of stock (0.408 %), which is the 0.4 % tax-map line
// rounded to the cent, not 0.3 %. The tax is taken from the euro amount you
// type: 50 € typed, 49.00 stock + 0.20 FTT = 49.20 debit, 0.80 left in cash.
//
// Two live trips on an Elite account still inside the first three months,
// 2026-09-09, phone app. Every ticket printed Fees € 0.00. EUNL (IE00B4L5Y983)
// 50 € both ways at 126.00, cash 50 → 50. TTE (FR0000120271) buy 49.20
// (0.6236477 × 78.57 + 0.20 FTT), sell pending 48.97 (0.623489 × 78.54);
// cash after the pair 50 → 49.76, the 0.24 being the FTT plus a 0.03 € tick
// (78.57 → 78.54). The 0.49 % Elite rate was not charged. The quote is to
// the cent, so the Tradegate / Quotrix book cannot be read off these tickets.
//
//   https://help.bunq.com/articles/how-are-trading-fees-calculated
//   https://help.bunq.com/articles/start-investing-on-the-go-with-stocks
//
//   node bunq/bunq_cost.mjs EUNL --plan=elite
//   node bunq/bunq_cost.mjs IE00B4L5Y983 TRADEGATE EUR --plan=pro
//   node bunq/bunq_cost.mjs TOTB --plan=core --shares=1 --price=52
//   node bunq/bunq_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("bunq-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://help.bunq.com/articles/how-are-trading-fees-calculated",
  stocks: "https://help.bunq.com/articles/start-investing-on-the-go-with-stocks",
  product: "https://www.bunq.com/en-de/personal/features/stocks",
  execution: "https://eu-assets.contentstack.com/v3/assets/blt4a5ee0113ab335fb/bltc1b2304cb5f11b46/6a4775fe310892726ee90bc1/upvest_best_execution_policy.pdf",
  readOn: "2026-09-09",
  entity: "bunq (NL), Stocks via Ginmon / Upvest",
};

// Upvest §05a3, 16 Dec 2025: EUR shares and EUR ETPs, in this order.
const UPVEST_EUR_MICS = ["XGAT", "XQTX"];
const MIC_NAME = { XGAT: "Tradegate", XQTX: "Quotrix" };

const DEFAULT_PLAN = "core";
const MIN_ORDER_EUR = 10;
const PROMO_VOLUME_EUR = 100000;

const CHECK = {
  plan: "elite",
  promo: true,
  on: "2026-09-09",
  eunl: {
    isin: "IE00B4L5Y983",
    ticker: "EUNL",
    query: "MSCI World",
    buy: { n: 0.39680964, price: 126, fee: 0, total: 50 },
    sell: { n: 0.3968569, price: 126, fee: 0, total: 50 },
    cash: { start: 50, end: 50 },
  },
  tte: {
    isin: "FR0000120271",
    ticker: "TOTB",
    query: "TotalEnergies",
    buy: { n: 0.6236477, price: 78.57, fee: 0, ftt: 0.2, total: 49.2 },
    sell: { n: 0.623489, price: 78.54, fee: 0, total: 48.97, pending: true },
    cash: { start: 50, end: 49.76 },
    fttRate: 0.2 / 49,
  },
};

const PLANS = {
  free: { id: "free", label: "Free", rate: 0.0099, monthly: 0 },
  core: { id: "core", label: "Core", rate: 0.0099, monthly: 3.99 },
  pro: { id: "pro", label: "Pro", rate: 0.0079, monthly: 9.99 },
  elite: { id: "elite", label: "Elite", rate: 0.0049, monthly: 18.99 },
  promo: { id: "promo", label: "first 3 months", rate: 0, monthly: null },
};

const PLAN_ALIAS = {
  free: "free",
  core: "core",
  easy: "core",
  standard: "core",
  default: "core",
  pro: "pro",
  elite: "elite",
  promo: "promo",
  trial: "promo",
  first3: "promo",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

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

// The scrape does not print a place. The published primary EUR book is Tradegate.
const venueRow = (row) => ({
  ...row,
  exchange: row.exchange || "TRADEGATE",
});

function upvestBook(isin, currency) {
  const id = String(isin || "").toUpperCase();
  const ccy = String(currency || "EUR").toUpperCase();
  for (const mic of UPVEST_EUR_MICS) {
    const leaf = spreads[id]?.[mic]?.[ccy];
    if (leaf && (leaf.bp != null || leaf.perShare != null)) return { leaf, mic };
  }
  return { leaf: null, mic: null };
}

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

function remarkOf(plan) {
  if (plan.id === "promo") return "0% commission (first 3 months, ≤ €100k).";
  const promo = "First 3 months: 0% (≤ €100k).";
  if (!plan.monthly) return promo;
  return `${plan.monthly} €/month.\n${promo}`;
}


function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange || "TRADEGATE") === wantPlace || loose(m.row.exchange || "TRADEGATE").includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "Tradegate"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const book = upvestBook(r.isin, r.currency);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[book.mic || "unsourced"] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function exactCost({ amount, plan = DEFAULT_PLAN, currency = "EUR" }) {
  const picked = planOf(plan);
  if (!picked) return { commission: null };
  const fee = Number(amount) * picked.rate * 2;
  return {
    commission: dollars(fee, currency),
    currency: QUOTE,
    native: { each: Number(amount) * picked.rate, roundTrip: fee, currency, rate: picked.rate },
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
    plan: picked?.id ?? plan,
    etf,
    place,
    currency,
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (core|pro|elite|promo)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue bunq n'existe pas encore : lancer `node bunq/bunq_scraping.mjs` avec web.bunq.com ouvert",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue bunq` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez bunq`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = upvestBook(m.row.isin, m.row.currency);
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? "XGAT",
    exchange: MIC_NAME[book.mic] ?? m.venue?.name ?? "Tradegate",
    currency: String(m.row.currency || "EUR").toUpperCase(),
    brokerExchange: m.row.exchange || "TRADEGATE",
  };

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const commissionPct = picked.rate * 2;
  const knownPct = taxTotal + commissionPct;
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => (listing.currency === "USD" ? x : dollars(x, listing.currency)),
  });
  const a = plus(mkt.a, knownPct);
  const bookUsd = mkt.b;

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(bookUsd, 6),
    c: 0,
    listing,
    feeMarket: book.mic === "XQTX" ? "quotrix" : "tradegate",
    remark: remarkOf(picked),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      commission: { rate: picked.rate, eachWay: true },
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `bunq Stocks ${picked.label}, ${(picked.rate * 100).toFixed(2)} % par jambe, carnet ${listing.exchange}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate: picked.rate,
      eachWay: true,
      currency: listing.currency,
      plan: picked.id,
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    minOrder: { amount: MIN_ORDER_EUR, currency: "EUR" },
    confidence:
      `${(picked.rate * 100).toFixed(2)} % à l'achat et à la vente (${picked.label}), ` +
      `lu sur l'aide bunq du ${SCHEDULE.readOn}. ` +
      (picked.id === "promo"
        ? `Offre des trois premiers mois, plafonnée à ${PROMO_VOLUME_EUR} € de volume. `
        : `Les trois premiers mois sont à 0 % jusqu'à ${PROMO_VOLUME_EUR} € (--plan=promo). `) +
      `a = carnet ${listing.exchange} (Upvest : Tradegate puis Quotrix) + taxes + ${((commissionPct) * 100).toFixed(2)} % de courtage. ` +
      `Pas de ticket publié, b = c = 0. ` +
      `Aller-retour réel le ${CHECK.on} (Elite, encore en promo) : ` +
      `EUNL 50 € / 50 €, frais 0, caisse 50 → 50 ; ` +
      `TTE 49,20 € (dont 0,20 € de FTT sur 49,00, soit ${(100 * CHECK.tte.fttRate).toFixed(2)} %) ` +
      `puis vente 48,97 €, caisse 50 → 49,76. ` +
      (leaf ? "" : `Pas de feuille Tradegate/Quotrix pour cet ISIN dans spread.json. `),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          defaultPlan: DEFAULT_PLAN,
          minOrderEur: MIN_ORDER_EUR,
          promoVolumeEur: PROMO_VOLUME_EUR,
          plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { ...v, roundTrip: v.rate * 2 }])),
          coverage: coverage(),
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node bunq_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=core|pro|elite|promo] [--json]\n" +
        "        node bunq_cost.mjs --schedule\n" +
        "  ex.   node bunq_cost.mjs EUNL\n" +
        "        node bunq_cost.mjs IE00B4L5Y983 TRADEGATE EUR --plan=pro\n" +
        "        node bunq_cost.mjs TOTB --plan=elite --shares=1 --price=52"
    );
    process.exit(2);
  }

  const plan = flag("plan") || DEFAULT_PLAN;
  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null && !out.listing) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que bunq propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${picked?.label || out.plan}]\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.commission?.rate != null) detail.push(`courtage ${out.parts.commission.rate} × 2`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part : rien)`);
  console.log(`c = ${out.c} $   (par ordre : rien)`);
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
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c : null;
    const billed = exactCost({ amount, plan: out.plan, currency: l.currency });
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
