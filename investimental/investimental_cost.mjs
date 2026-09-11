// What one round trip costs at Investimental: buy n shares at price p, sell
// them back at once (online, Access).
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. The 1.45 RON / 1.45 USD / 3 EUR is a
// ticket every executed order, not a minimum of a %, so it lives in `c`.
// Buy and sell % differ on the Romanian column; both sides plus the ASF
// buy-side addend sit in `a`.
//
// Investimental S.A. (RO, ASF). Grid on investimental.ro, read 2026-09-11.
// Default is Access (no portfolio floor). ProTrader (`--plan=protrader`) is
// the printed >250 k RON / InvestiMentor 30-day line. Ultra (negotiated
// above 450 k RON), the >350 k RON monthly-turnover step (stocks only,
// next month, only if cheaper than the contract), MultiCont cents-per-share,
// PIES, bonds / titluri de stat and the phone desk are not this trip.
//
//   Access ETF     RO 0.26 % + 1.45 RON buy / 0.30 % + 1.45 RON sell
//                  US 0.13 % + 1.45 USD   (♠ professional; still shown)
//                  EU 0.14 % + 3 EUR
//   Access stock   RO 0.41 % + 1.45 RON buy / 0.47 % + 1.45 RON sell
//                  US 0.13 % + 1.45 USD
//                  EU 0.14 % + 3 EUR
//   ProTrader      RO ETF same as Access; RO stock 0.31 / 0.37 %
//                  US 0.11 % + 1.45 USD ; EU 0.13 % + 3 EUR
//
// ASF is added on the Romanian buy, not folded into the printed %: 0.06 %
// stocks / structured, 0.04 % ETF / rights, 0 % government bonds. FTT from
// the tax map. SEC / TAF on a US tape. FX and custody print as zero, so
// they stay out of `a`. The card says fees may carry Romanian VAT; no rate
// is printed, so VAT is left out. BVB has no book adapter: the spread stays
// N/A. No live trip: the coefficients are the printed % and tickets.
//
//   https://www.investimental.ro/grila-comisioane-investimental/
//
//   node investimental/investimental_cost.mjs AAPL
//   node investimental/investimental_cost.mjs TVBETETF BVB RON
//   node investimental/investimental_cost.mjs VWCE XETR EUR --shares=1 --price=140
//   node investimental/investimental_cost.mjs AAPL NASDAQ USD --plan=protrader
//   node investimental/investimental_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("investimental-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.investimental.ro/grila-comisioane-investimental/",
  offer: "https://www.investimental.ro/oferta/",
  readOn: "2026-09-11",
  entity: "Investimental S.A. (RO)",
};

const DEFAULT_PLAN = "access";
const PLANS = {
  access: { id: "access", label: "Access" },
  protrader: { id: "protrader", label: "ProTrader" },
};
const PLAN_ALIAS = {
  access: "access",
  default: "access",
  retail: "access",
  standard: "access",
  protrader: "protrader",
  pro: "protrader",
  mentor: "protrader",
  investimentor: "protrader",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;

const ASF_STOCK = 0.0006;
const ASF_ETF = 0.0004;

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const RO_MICS = new Set(["XBSE", "REGS", "ORDB", "RGSP", "XRS1", "XRSI"]);
const EU_MICS = new Set([
  "XETR",
  "XFRA",
  "XLON",
  "XSWX",
  "XVTX",
  "XPAR",
  "XAMS",
  "XBRU",
  "XLIS",
  "XDUB",
  "XMIL",
  "MTAA",
  "XWBO",
  "XMAD",
  "XMCE",
]);

const RULE = {
  access: {
    etf: {
      ro: { buy: 0.0026, sell: 0.003, ticket: 1.45, ticketCcy: "RON" },
      us: { buy: 0.0013, sell: 0.0013, ticket: 1.45, ticketCcy: "USD" },
      eu: { buy: 0.0014, sell: 0.0014, ticket: 3, ticketCcy: "EUR" },
    },
    stock: {
      ro: { buy: 0.0041, sell: 0.0047, ticket: 1.45, ticketCcy: "RON" },
      us: { buy: 0.0013, sell: 0.0013, ticket: 1.45, ticketCcy: "USD" },
      eu: { buy: 0.0014, sell: 0.0014, ticket: 3, ticketCcy: "EUR" },
    },
  },
  protrader: {
    etf: {
      ro: { buy: 0.0026, sell: 0.003, ticket: 1.45, ticketCcy: "RON" },
      us: { buy: 0.0011, sell: 0.0011, ticket: 1.45, ticketCcy: "USD" },
      eu: { buy: 0.0013, sell: 0.0013, ticket: 3, ticketCcy: "EUR" },
    },
    stock: {
      ro: { buy: 0.0031, sell: 0.0037, ticket: 1.45, ticketCcy: "RON" },
      us: { buy: 0.0011, sell: 0.0011, ticket: 1.45, ticketCcy: "USD" },
      eu: { buy: 0.0013, sell: 0.0013, ticket: 3, ticketCcy: "EUR" },
    },
  },
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

export function familyOf(type) {
  return String(type || "").toUpperCase() === "ETF" ? "etf" : "stock";
}

export function feeMarketOf(row, mic) {
  const code = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (RO_MICS.has(m) || /^(BVB|BET|XBSE|REGS|ORDB|RGSP|XRS1|XRSI)$/.test(code)) return "ro";
  if (code === "OTC" || /^(OTC|PINK|OTCMKTS|OOTC|PINX|OTCQB|OTCQX)$/.test(code)) return null;
  if (US_MICS.has(m) || /^(NASDAQ|NYSE|AMEX|ARCA|BATS|CBOE|USA)$/.test(code)) return "us";
  if (EU_MICS.has(m) || /^(EURONEXT|XETR|XETRA|LSE|MIL|SIX|VIE|BME)$/.test(code)) return "eu";
  return null;
}

export function asfBuy(market, family) {
  if (market !== "ro") return 0;
  return family === "etf" ? ASF_ETF : ASF_STOCK;
}

export function ruleOf(plan, market, family) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked) return null;
  return RULE[picked.id]?.[family]?.[market] || null;
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
    .map((r) => `${r.ticker || r.query || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
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

export function exactCost({
  shares,
  price,
  market,
  family = "stock",
  plan = DEFAULT_PLAN,
  currency,
} = {}) {
  const picked = planOf(plan);
  const rule = ruleOf(picked, market, family);
  if (!picked || !rule) return { commission: null, currency: QUOTE };
  const amount = shares != null && price != null ? Number(shares) * Number(price) : null;
  const asf = asfBuy(market, family);
  const pct =
    amount != null && Number.isFinite(amount) ? amount * (rule.buy + rule.sell + asf) : null;
  const pctUsd = pct == null ? null : dollars(pct, currency);
  const ticketUsd = dollars(rule.ticket * 2, rule.ticketCcy);
  return {
    commission: amount == null ? ticketUsd : plus(pctUsd, ticketUsd),
    currency: QUOTE,
    native: {
      pct,
      ticketEach: rule.ticket,
      roundTripTicket: rule.ticket * 2,
      currency: rule.ticketCcy,
      listingCurrency: currency || null,
    },
    plan: picked.id,
    market,
    family,
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

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (access|protrader)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Investimental n'existe pas encore : lancer `node investimental/investimental_scraping.mjs` avec terminal.investimental.ro ouvert",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Investimental` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Investimental`,
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
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
    query: m.row.query || null,
  };

  const market = feeMarketOf(m.row, listing.mic);
  const family = familyOf(listing.type);
  const rule = ruleOf(picked, market, family);
  const tax = taxesOf(listing.isin);
  if (!market || !rule) {
    return {
      ...answer,
      listing,
      feeMarket: market,
      remark: "no published card for this venue.",
      why: `${listing.exchange || m.row.exchange} n'est pas sur la grille Investimental`,
      tax,
      fx: fxNote(listing.currency),
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us";
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const asf = asfBuy(market, family);
  const commissionPct = rule.buy + rule.sell;
  const knownPct = commissionPct + asf + taxTotal + (american ? SEC_RATE : 0);
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });
  const a = plus(mkt.a, knownPct);
  const bookUsd = mkt.b;
  const ticketUsd = dollars(rule.ticket * 2, rule.ticketCcy);
  const usEtf = american && family === "etf";

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(plus(bookUsd, american ? TAF_PER_SHARE : 0), 6),
    c: ticketUsd,
    floor: null,
    listing,
    feeMarket: market,
    remark: usEtf ? "US ETFs: professional clients only." : "",
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(rates).length ? rates : null,
      asf: asf || null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      commission: commissionPct,
      ticket: ticketUsd,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème Investimental ${picked.label}, palier ${market} ${family}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      buy: rule.buy,
      sell: rule.sell,
      asf,
      ticket: rule.ticket,
      currency: rule.ticketCcy,
      eachWay: true,
      plan: picked.id,
    },
    ccy: QUOTE,
    cap: american ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" } : null,
    threshold: null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `Investimental ${picked.label}, palier ${market} ${family}, grille lue le ${SCHEDULE.readOn}. ` +
      `Courtage ${(rule.buy * 100).toFixed(2)} % à l'achat` +
      (asf ? ` + ASF ${(asf * 100).toFixed(2)} %` : "") +
      ` / ${(rule.sell * 100).toFixed(2)} % à la vente, ticket ${rule.ticket} ${rule.ticketCcy} par jambe (dans c). ` +
      (american ? `SEC / TAF aux figures courantes. ` : "") +
      `Change 0, custodie 0. TVA mentionnée sans taux, hors de a. ` +
      (usEtf ? `ETF US : clients professionnels seulement. ` : "") +
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
          rules: RULE,
          asf: { stock: ASF_STOCK, etf: ASF_ETF },
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
      "usage : node investimental_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=access|protrader] [--json]\n" +
        "        node investimental_cost.mjs --schedule\n" +
        "  ex.   node investimental_cost.mjs AAPL\n" +
        "        node investimental_cost.mjs TVBETETF BVB RON\n" +
        "        node investimental_cost.mjs VWCE XETR EUR --shares=1 --price=140"
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
      console.log(`\nce qu'Investimental propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.query || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${picked?.label || out.plan}]\n`
  );

  const detail = [];
  if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.asf) detail.push(`ASF ${out.parts.asf}`);
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : FINRA et/ou spread 605" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre : ticket ${out.commission?.ticket} ${out.commission?.currency} × 2)`);
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
    const billed = exactCost({
      shares: n,
      price: p,
      market: out.feeMarket,
      family: familyOf(l.type),
      plan: out.plan,
      currency: l.currency,
    });
    console.log(
      `\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` +
        (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : "")
    );
    if (affine != null) console.log(`  a, b, c        : ${affine.toFixed(4)} $`);
    if (billed.commission != null) {
      console.log(
        `  commission     : ${Number(billed.commission).toFixed(4)} $` +
          (billed.native?.ticketEach != null
            ? ` (ticket ${billed.native.ticketEach} ${billed.native.currency} × 2)`
            : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
