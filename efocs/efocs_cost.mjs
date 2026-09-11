// What one round trip costs at EFOCS (EuroFinance): buy n shares at price p,
// sell them back at once (platform, retail).
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. The published ticket is a minimum of a
// % (3.50 / 4 / 6 €), so it sits in the floor (`min fees`, `c` = 0).
//
// EURO-FINANCE AD (BG), Schedule of Fees, Board minutes 465 of 13 February
// 2026, in force 16 March 2026. Read 2026-09-10. Default is the EFOCS
// platform card (Chapter I), retail. Professional is the same Xetra /
// Frankfurt % and a cheaper BSE line. Office / telephone (Chapter II:
// 1.50 %–0.40 %, min 5–10 €) and bonds are not this trip.
//
//   BSE (XBUL)     retail 0.30 %, professional 0.20 %, min 3.50 €
//   Xetra (XETR)   0.05 %, min 4 €          (retail = professional)
//   Frankfurt floor (XFRA)
//                  0.10 %, min 6 €          (retail = professional)
//
// Starred lines include third-party costs, so exchange / clearing stay out
// of `a` / `b`. The book is Xetra + Sofia: no US tape, no SEC / TAF. Stamp
// / FTT come from the tax map. Custody on the BSE / Deutsche Börse pages
// is none. Art. 33 UniCredit safekeeping is their schedule, not a figure
// here.
//
// Cash is euro (BG joined on 1 January 2026). They take EUR / USD / GBP
// deposits and convert "at the current exchange rate of Euro-Finance" on
// payments — no published fill markup, so FX stays out of `a`. No live
// trip: the coefficients are the printed %.
//
//   https://www.eurofinance.bg/wp-content/uploads/documents/legal-documents/Schedule%20of%20fees.pdf
//   https://eurofinance.bg/en/services/trading/deutscheboerse/
//   https://eurofinance.bg/en/services/trading/bse/
//
//   node efocs/efocs_cost.mjs VWCE
//   node efocs/efocs_cost.mjs APC XETR EUR --shares=1 --price=230
//   node efocs/efocs_cost.mjs ETR BSESOF EUR --plan=professional
//   node efocs/efocs_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("efocs-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.eurofinance.bg/wp-content/uploads/documents/legal-documents/Schedule%20of%20fees.pdf",
  xetra: "https://eurofinance.bg/en/services/trading/deutscheboerse/",
  bse: "https://eurofinance.bg/en/services/trading/bse/",
  readOn: "2026-09-10",
  revised: "2026-03-16",
  entity: "EFOCS (EURO-FINANCE AD, BG)",
};

const DEFAULT_PLAN = "retail";

const PLANS = {
  retail: { id: "retail", label: "Retail" },
  professional: { id: "professional", label: "Professional" },
};

const PLAN_ALIAS = {
  retail: "retail",
  default: "retail",
  nonprofessional: "retail",
  professional: "professional",
  pro: "professional",
};

const RULE = {
  bse: { retail: 0.003, professional: 0.002, min: 3.5 },
  xetr: { retail: 0.0005, professional: 0.0005, min: 4 },
  xfra: { retail: 0.001, professional: 0.001, min: 6 },
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

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

function micFromRaw(raw) {
  const t = String(raw || "").toUpperCase();
  if (/\bXFRA\b/.test(t)) return "XFRA";
  if (/\bXETR\b/.test(t)) return "XETR";
  if (/\bXBUL\b/.test(t)) return "XBUL";
  return null;
}

export function feeMarketOf(row, mic) {
  const fromRaw = micFromRaw(row?.raw);
  const m = String(fromRaw || mic || "").toUpperCase();
  const code = loose(row?.exchange);
  if (m === "XBUL" || /^(BSESOF|XBUL|BSE|SOFIA)$/.test(code)) return "bse";
  if (m === "XFRA" || code === "XFRA") return "xfra";
  if (m === "XETR" || code === "XETR") return "xetr";
  return null;
}

function rateOf(rule, plan) {
  return rule[plan.id] ?? rule.retail;
}

function remarkOf({ rule }) {
  return `min fees ${rule.min * 2} €.`;
}


function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantUnsourced = resolved.unsourced || null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter(
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      if (wantUnsourced && m.unsourced) return m.unsourced.name === wantUnsourced.name;
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
    const market = feeMarketOf(r, book.mic ?? venue?.mic) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function commissionEach({ amount, market, plan = DEFAULT_PLAN }) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  const rule = RULE[market];
  if (!picked || !rule) return null;
  const rate = rateOf(rule, picked);
  if (amount == null || !Number.isFinite(Number(amount))) return rule.min;
  return Math.max(rule.min, Number(amount) * rate);
}

export function exactCost({ amount, market, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const rule = RULE[market];
  if (!picked || !rule) return { commission: null, currency: QUOTE };
  const each = commissionEach({ amount, market, plan: picked });
  return {
    commission: dollars(each * 2, "EUR"),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: "EUR" },
    plan: picked.id,
    market,
  };
}

export function roundTripCost({
  etf,
  place,
  currency,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
}) {
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

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (retail|professional)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue EFOCS n'existe pas encore : lancer `node efocs/efocs_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue EFOCS` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez EFOCS`,
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
    mic: book.mic ?? m.venue?.mic ?? micFromRaw(m.row.raw) ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row, listing.mic);
  const rule = RULE[market];
  if (!rule) {
    return {
      ...answer,
      listing,
      why: `${listing.brokerExchange || listing.exchange} n'a pas de palier publié sur EFOCS`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const commPct = rateOf(rule, picked) * 2;
  const knownPct = commPct + taxTotal;
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const a = plus(mkt.a, knownPct);
  const bookUsd = mkt.b;
  const floorUsd = dollars(rule.min * 2, "EUR");

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(bookUsd, 6),
    c: 0,
    floor: floorUsd,
    listing,
    feeMarket: market,
    remark: remarkOf({ rule }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      commission: commPct,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème EFOCS ${picked.label}, palier ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate: rateOf(rule, picked),
      min: rule.min,
      currency: "EUR",
      eachWay: true,
      plan: picked.id,
      thirdPartyIncluded: true,
    },
    ccy: QUOTE,
    cap: null,
    threshold: null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `EFOCS ${picked.label}, palier ${market}, tarif du ${SCHEDULE.revised} lu le ${SCHEDULE.readOn}. ` +
      `Courtage plateforme ${(rateOf(rule, picked) * 100).toFixed(2)} % par jambe, plancher ${rule.min} €. ` +
      `Tiers inclus dans le %. Ticket dans le plancher, c = 0. ` +
      `Change hors de a (pas de % publié sur le fill). ` +
      `Pas d'aller-retour réel dans ce dépôt. ` +
      (leaf ? "" : `Pas de feuille de carnet pour cet ISIN / cette place. `),
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
          plans: PLANS,
          rules: Object.fromEntries(
            Object.entries(RULE).map(([k, v]) => [
              k,
              {
                ...v,
                retailRt: v.retail * 2,
                professionalRt: v.professional * 2,
                minRt: v.min * 2,
              },
            ])
          ),
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
      "usage : node efocs_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=retail|professional] [--json]\n" +
        "        node efocs_cost.mjs --schedule\n" +
        "  ex.   node efocs_cost.mjs VWCE\n" +
        "        node efocs_cost.mjs APC XETR EUR --shares=1 --price=230\n" +
        "        node efocs_cost.mjs ETR BSESOF EUR --plan=professional"
    );
    process.exit(2);
  }

  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null && !out.listing) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce qu'EFOCS propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${picked?.label || out.plan}]\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : spread publié" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre : ticket dans la remark, pas dans c)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  if (out.remark) console.log(out.remark);
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
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c : null;
    const billed = exactCost({ amount, market: out.feeMarket, plan: out.plan });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          (billed.native?.each != null
            ? ` (${Number(billed.native.each).toPrecision(4)} € × 2)`
            : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
