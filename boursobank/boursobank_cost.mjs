// What one round trip costs at BoursoBank: buy n shares at price p, sell them
// back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. The published ticket is in euros; it is
// converted at the ECB mid and folded into the floor (`c` = 0).
//
// Brochure tarifaire 2026 (boursorama_bt.pdf), TTC, read 2026-09-09. Four
// forfaits on Euronext Paris / Amsterdam / Brussels (and extended hours).
// Other European venues share one card; the US shares another. Default is
// Découverte (no monthly fee). Classic is CTO only.
//
//   Découverte     1.99 € up to 500 €, then 0.60 %
//   Classic        5.50 € up to 1 000 €, then 0.48 % (floor 8.95 €)
//   Trader        16.65 € up to 7 750 €, then 0.22 %
//   Ultimate Trader 9.90 € up to 10 000 €, then 0.12 %
//   US             6.95 € up to 6 000 €, then 0.12 %   (every forfait)
//   other EU      11.95 € up to 4 000 €, then 0.30 %   (Xetra, Milan,
//                   Madrid, Zurich, Lisbon, London, Euronext non-euro)
//
// The published % × 2 sits in `a`. The ticket is a floor (`min fees`).
// `exactCost` still applies the step. PEA / PEA-PME caps the ticket at
// 0.50 % (`--pea`). Boursomarkets 0 € on the buy of listed products is not
// applied: there is no product list in this deposit, so every ETF keeps
// the Euronext card both ways.
//
// Cash is euro only: a non-EUR line is always converted. The brochure's
// J+1 + 0.0025 points is 0.25 % each way and sits in `a` (0.50 % the
// round trip). EUR lines have no FX. Custody is 0. Classic / Trader
// inactivity (5.95 € / month) and Ultimate's 119 € / month under 30
// orders stay in the remark.
//
// One live trip on 2026-09-09, CTO Découverte, one TTE, market both ways on
// Horaires étendus (22H). Buy 78.14, sell 78.06. Recap: 1.99 € ticket each
// way; buy FRAIS TOUT COMPRIS 2.30 € (TTF 0.31 € = 0.40 % of the fill);
// sell 1.99 € only. PRU after buy 80.44. Cash 500.00 → 419.56 → 495.63.
// `c` stays 0; the 3.98 € is the floor. The 8 cents of book is not folded
// into `a`: the board still showed the 17:35 Euronext close. Classic /
// Trader / Ultimate / US / other EU were not traded.
//
//   https://www.boursobank.com/content/brochure_tarifaire/boursorama_bt.pdf
//
//   node boursobank/boursobank_cost.mjs IWDA
//   node boursobank/boursobank_cost.mjs MC EURONEXT EUR --plan=trader
//   node boursobank/boursobank_cost.mjs MEDP NASDAQ USD --shares=1 --price=300
//   node boursobank/boursobank_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";

const CATALOGUE = new URL("boursobank-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);
const TAXES = new URL("../parsed_json/taxes.json", import.meta.url);
const T212 = new URL("../trading212/trading212-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.boursobank.com/content/brochure_tarifaire/boursorama_bt.pdf",
  help: "https://www.boursobank.com/aide-en-ligne/bourse/comment-investir-en-bourse/fonctionnement-de-la-bourse/question/quels-sont-les-frais-de-courtage-chez-boursobank-17227195",
  readOn: "2026-09-09",
  entity: "BoursoBank (Boursorama, FR)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
const FX_EACH_WAY = 0.0025;
const PEA_CAP = 0.005;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const DEFAULT_PLAN = "decouverte";

const CHECK = {
  isin: "FR0000120271",
  ticker: "TTE",
  venue: "22H",
  n: 1,
  buy: 78.14,
  sell: 78.06,
  commissionEach: 1.99,
  feesBuyAllIn: 2.3,
  ttf: 0.31,
  pruAfterBuy: 80.44,
  cash: { start: 500, afterBuy: 419.56, end: 495.63 },
  on: "2026-09-09",
};

const PLANS = {
  decouverte: { id: "decouverte", label: "Découverte" },
  classic: { id: "classic", label: "Classic" },
  trader: { id: "trader", label: "Trader" },
  ultimate: { id: "ultimate", label: "Ultimate Trader" },
};

const PLAN_ALIAS = {
  decouverte: "decouverte",
  discovery: "decouverte",
  classic: "classic",
  trader: "trader",
  ultimate: "ultimate",
  ultimatetrader: "ultimate",
};

// min / upTo in EUR. Above `upTo` the fee is `rate` of the amount (Classic
// also has minAbove).
const EURONEXT_RULE = {
  decouverte: { min: 1.99, upTo: 500, rate: 0.006 },
  classic: { min: 5.5, upTo: 1000, rate: 0.0048, minAbove: 8.95 },
  trader: { min: 16.65, upTo: 7750, rate: 0.0022 },
  ultimate: { min: 9.9, upTo: 10000, rate: 0.0012 },
};

const OTHER_RULE = {
  us: { min: 6.95, upTo: 6000, rate: 0.0012 },
  europe: { min: 11.95, upTo: 4000, rate: 0.003 },
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

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

export function feeMarketOf(exchange, mic) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  if (US_MICS.has(m) || /^(NASDAQ|NYSE|AMEX|ARCA|BATS)$/.test(code)) return "us";
  if (
    /EURONEXTPARIS|EURONEXTAMSTERDAM|EURONEXTBRUXELLES|EURONEXTBRUSSELS/.test(code) ||
    ["XPAR", "XAMS", "XBRU"].includes(m)
  ) {
    return "euronext";
  }
  return "europe";
}

export function ruleOf(plan, market) {
  const p = planOf(plan);
  if (!p) return null;
  if (market === "euronext") return EURONEXT_RULE[p.id];
  return OTHER_RULE[market] || OTHER_RULE.europe;
}

export function commissionEach(amount, rule) {
  if (!rule || amount == null || !Number.isFinite(Number(amount))) return null;
  const n = Number(amount);
  if (n <= rule.upTo) return rule.min;
  let fee = n * rule.rate;
  if (rule.minAbove != null) fee = Math.max(rule.minAbove, fee);
  return fee;
}

function remarkOf({ plan, market } = {}) {
  const rule = ruleOf(plan.id, market);
  const lines = [];
  if (rule) lines.push(`min fees ${rule.min * 2} €.`);
  if (plan.id === "classic" || plan.id === "trader") lines.push("5.95 €/month if no trade.");
  if (plan.id === "ultimate") lines.push("119 €/month if < 30 orders.");
  return lines.join("\n");
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
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function exactCost({ amount, market, plan = DEFAULT_PLAN, pea = false }) {
  const picked = planOf(plan);
  const rule = picked ? ruleOf(picked.id, market) : null;
  if (!rule) return { commission: null, currency: QUOTE };
  let each = commissionEach(amount, rule);
  if (pea && (market === "euronext" || market === "europe")) {
    each = Math.min(each, Number(amount) * PEA_CAP);
  }
  return {
    commission: dollars(each * 2, "EUR"),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: "EUR" },
    rule,
    plan: picked.id,
    pea,
  };
}

export function roundTripCost({
  etf,
  place,
  currency,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
  pea = false,
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

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (decouverte|classic|trader|ultimate)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue BoursoBank n'existe pas encore : lancer `node boursobank/boursobank.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BoursoBank` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BoursoBank`,
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

  const market = feeMarketOf(m.row.exchange, listing.mic);
  const rule = ruleOf(picked.id, market);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const fxPct = listing.currency === "EUR" ? 0 : FX_EACH_WAY * 2;
  const knownPct = taxTotal + (american ? SEC_RATE : 0) + (rule.rate ?? 0) * 2 + fxPct;
  const a = marketBp != null ? marketBp / 1e4 + knownPct : knownPct;
  const bookUsd = american ? (marketPerShare ?? 0) : dollars(marketPerShare ?? 0, listing.currency) ?? 0;
  const floorUsd = dollars(rule.min * 2, "EUR");

  return {
    ...answer,
    a: Number(Number(a).toPrecision(4)),
    b: Number((bookUsd + (american ? TAF_PER_SHARE : 0)).toPrecision(6)),
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
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      commission: (rule.rate ?? 0) * 2,
      change: fxPct || null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème BoursoBank ${picked.label}, palier ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate: rule.rate,
      min: rule.min,
      upTo: rule.upTo,
      minAbove: rule.minAbove ?? null,
      currency: "EUR",
      eachWay: true,
      plan: picked.id,
    },
    ccy: QUOTE,
    cap: american
      ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" }
      : pea
        ? { commission: { rate: PEA_CAP, why: "plafond PEA 0,50 % par ordre" } }
        : null,
    threshold:
      listing.mic === "XLON"
        ? {
            c: dollars(2 * PTM.each, "GBP"),
            currency: QUOTE,
            above: PTM.above,
            aboveCurrency: "GBP",
            why: `prélèvement PTM de ${PTM.each} £ par ordre et par sens, au-delà de ${PTM.above} £`,
          }
        : null,
    pea: pea ? { cap: PEA_CAP, why: "plafond PEA / PEA-PME 0,5 % du montant, marchés EEE" } : null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `commission ${picked.label} ${market} selon la brochure BoursoBank 2026, lue le ${SCHEDULE.readOn}. ` +
      `${(rule.rate * 100).toFixed(2)} % par jambe au-delà de ${rule.upTo} €, ` +
      `plancher ${rule.min} €. Ticket dans le plancher, b = ` +
      (american ? `605 + TAF` : `0`) +
      `, c = 0. Boursomarkets 0 € à l'achat non appliqué (pas de liste ici). ` +
      (picked.id === "decouverte" && market === "euronext"
        ? `Un aller-retour réel le ${CHECK.on} sur ${CHECK.ticker} (${CHECK.venue}) : ` +
          `achat ${CHECK.buy} / vente ${CHECK.sell}, courtage ${CHECK.commissionEach} € par jambe, ` +
          `TTF ${CHECK.ttf} € à l'achat (PRU ${CHECK.pruAfterBuy}), cash ${CHECK.cash.start} → ${CHECK.cash.end}. ` +
          `Le carnet 22H n'est pas plié dans a.`
        : `Courtage ${picked.label} / ${market} non recoupé sur un relevé ; le seul aller-retour réel est ${CHECK.ticker} 22H à 1.99 € le ticket.`) +
      (leaf ? "" : ` Pas de feuille de carnet pour cet ISIN / cette place.`),
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
        { ...SCHEDULE, defaultPlan: DEFAULT_PLAN, plans: PLANS, euronext: EURONEXT_RULE, other: OTHER_RULE, coverage: coverage() },
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
      "usage : node boursobank_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=decouverte|classic|trader|ultimate] [--pea] [--json]\n" +
        "        node boursobank_cost.mjs --schedule\n" +
        "  ex.   node boursobank_cost.mjs IWDA\n" +
        "        node boursobank_cost.mjs MC EURONEXT EUR --plan=trader\n" +
        "        node boursobank_cost.mjs MEDP NASDAQ USD --shares=1 --price=300"
    );
    process.exit(2);
  }

  const plan = flag("plan") || DEFAULT_PLAN;
  const pea = process.argv.includes("--pea");
  const out = roundTripCost({
    etf,
    place,
    currency,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan,
    pea,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (out.a == null && !out.listing) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que BoursoBank propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);
  if (out.parts?.change) detail.push(`change ${out.parts.change}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : FINRA et/ou spread 605" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre : ticket dans la remark, pas dans c)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
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
    const billed = exactCost({ amount, market: out.feeMarket, plan: out.plan, pea });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          (billed.native?.each != null ? ` (${Number(billed.native.each).toPrecision(4)} € × 2)` : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
