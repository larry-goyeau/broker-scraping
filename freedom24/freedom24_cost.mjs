// What one round trip costs at Freedom24: buy n shares at price p, sell them
// back at once (online, exchange-traded stock / ETF / ETC / ETN).
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. Smart's 2 and All-inclusive's 1.20 are
// always-on tickets, so they live in `c`. The 0.02 / 0.012 per share sit in
// `b`. A published minimum of a % (CIS Smart 0.20) sits in the floor
// (`min fees`, `c` = 0).
//
// Freedom Finance Europe Ltd (CY), Appendix 6 effective 19 Aug 2026, read
// 2026-09-10. Default is Smart (self-directed, no monthly). All-inclusive
// (`--plan=allinc`) is the plan they assign when Promo expires. Exclusive
// is request-only (`--plan=exclusive`). Promo in EUR (`--plan=promo`) was
// assigned to FR / IT / RO / CZ accounts opened 1 Mar–31 Aug 2026; it is
// not selectable and is closed to new accounts. Fix / Super / Prime are
// legacy. Auto Invest (0), IPO, options, futures, the stock-store card
// surcharge (0.12 %) and E-Account OTC are not this trip.
//
//   US & Europe   Smart  2 + 0.02 / share
//                 All-inc 0.50 % + 0.012 / share + 1.20 / order
//                 Exclusive 0.25 % + 0.012 / share + 1.20 / order
//                 Promo  0 (0.012 € / share if the print is under 1 €)
//   Hong Kong     0.25 % + 10 HKD / order   (every plan)
//   Middle East   0.50 % + 10 AED / order   (every plan)
//   CIS           Smart 0.08 %, min 0.20 ; others 0.50 %
//   OTC           0.12 % + 30 clearing      (30 in the plan currency)
//
// Note 1: when the trade currency is not the plan currency, the share /
// ticket amounts are charged in the trade currency and converted after
// the debit, so `b` and `c` use the listing currency (USD / EUR / GBP /
// CHF…). OTC 30 and the CIS 0.20 stay in the plan currency (the card
// prints 30 USD / 30 EUR). SEC / TAF are not on the card. Stamp / FTT
// from the tax map. Cash can sit in EUR or USD; conversion is not a
// printed %, so FX stays out of `a`. Custody 0 on the trading account.
// No live trip: the coefficients are the printed $ / € / %.
//
//   https://freedom24.com/download/documents/1203/Appendix_6_Fee_Schedule_19082026
//
//   node freedom24/freedom24_cost.mjs AAPL
//   node freedom24/freedom24_cost.mjs VWCE XETRA EUR
//   node freedom24/freedom24_cost.mjs 700 HKEX HKD
//   node freedom24/freedom24_cost.mjs AAPL NASDAQ USD --plan=allinc
//   node freedom24/freedom24_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("freedom24-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://freedom24.com/download/documents/1203/Appendix_6_Fee_Schedule_19082026",
  readOn: "2026-09-10",
  effective: "2026-08-19",
  entity: "Freedom Finance Europe Ltd (CY)",
};

const DEFAULT_PLAN = "smart";
const PLANS = {
  smart: { id: "smart", family: "smart", label: "Smart", ccy: "EUR" },
  smartusd: { id: "smartusd", family: "smart", label: "Smart USD", ccy: "USD" },
  allinc: { id: "allinc", family: "allinc", label: "All-inclusive", ccy: "EUR" },
  allincusd: { id: "allincusd", family: "allinc", label: "All-inclusive USD", ccy: "USD" },
  exclusive: { id: "exclusive", family: "exclusive", label: "Exclusive", ccy: "EUR" },
  exclusiveusd: { id: "exclusiveusd", family: "exclusive", label: "Exclusive USD", ccy: "USD" },
  promo: { id: "promo", family: "promo", label: "Promo EUR", ccy: "EUR" },
};
const PLAN_ALIAS = {
  smart: "smart",
  default: "smart",
  retail: "smart",
  smarteur: "smart",
  smartusd: "smartusd",
  usd: "smartusd",
  allinc: "allinc",
  allinclusive: "allinc",
  inclusive: "allinc",
  allinceur: "allinc",
  allincusd: "allincusd",
  exclusive: "exclusive",
  exclusiveusd: "exclusiveusd",
  promo: "promo",
  promoeur: "promo",
};

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const EU_MICS = new Set([
  "XETR",
  "XLON",
  "XSWX",
  "XVTX",
  "XPAR",
  "XAMS",
  "XBRU",
  "XLIS",
  "XMIL",
  "XOSL",
  "XMSM",
  "XDUB",
  "XWBO",
  "XGAT",
  "XMUN",
  "LSEX",
  "LSSI",
  "XFRA",
  "XHAM",
  "XHAN",
  "XMCE",
  "XMAD",
  "XATH",
  "XHEL",
  "XSTO",
  "XCSE",
  "XWAR",
]);
const USEU_CODES =
  /^(NASDAQ|NYSE|AMEX|ARCA|BATS|CBOE|XETRA|XETR|IBIS|LSE|LSEETF|LSEAIM|LSEIOB|EURONEXT|MIL|SIX|XATH|ATH|ENAX|BM|BME|VSE|VIE|OMXH|OMXHEX|OMXSTO|OMXCOP|FWB|CHIX|GETTEX|TRADEGATE)$/;
const PROMO_PENNY = 0.012;
const PROMO_BELOW = 1;

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

export function feeMarketOf(row, mic) {
  const type = String(row?.type || "").toUpperCase();
  const code = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (type === "CRYPTO" || code === "CRYPTO" || code === "CRPT") return null;
  if (type === "BND" || type === "BOND") return "bond";
  if (code === "OTC" || /^(OTC|PINK|OTCMKTS|GREY)/.test(code)) return "otc";
  if (m === "XHKG" || code === "HKEX" || code === "SEHK") return "asia";
  if (m === "XSHG" || m === "XSHE" || /CNY/.test(code)) return "asia";
  if (["XDFM", "XADS", "DIFX"].includes(m) || /^(DFM|ADX|DIFX|NASDAQDUBAI)$/.test(code)) {
    return "me";
  }
  if (/^(KASE|AIX|MOEX|MISX|AIXKZ)$/.test(code)) return "cis";
  if (US_MICS.has(m) || EU_MICS.has(m) || USEU_CODES.test(code)) return "useu";
  return null;
}

function billedCcy(plan, listingCcy) {
  const ccy = String(listingCcy || "").toUpperCase();
  return ccy && ccy !== plan.ccy ? ccy : plan.ccy;
}

function asiaTicketCcy(listingCcy) {
  return String(listingCcy || "").toUpperCase() === "CNY" ? "CNY" : "HKD";
}

export function ruleOf(plan, market, listingCcy) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked || !market) return null;
  if (market === "asia") {
    return { pct: 0.0025, perShare: 0, ticket: 10, ticketCcy: asiaTicketCcy(listingCcy) };
  }
  if (market === "me") {
    return { pct: 0.005, perShare: 0, ticket: 10, ticketCcy: "AED" };
  }
  if (market === "otc") {
    return { pct: 0.0012, perShare: 0, ticket: 30, ticketCcy: picked.ccy };
  }
  if (market === "cis") {
    if (picked.family === "smart") {
      return { pct: 0.0008, perShare: 0, ticket: 0, min: 0.2, minCcy: picked.ccy };
    }
    return { pct: 0.005, perShare: 0, ticket: 0 };
  }
  if (market === "bond") {
    const pct = picked.family === "smart" ? 0.0015 : 0.005;
    return { pct, perShare: 0, ticket: 5, ticketCcy: picked.ccy };
  }
  const ccy = billedCcy(picked, listingCcy);
  if (picked.family === "promo") {
    return { pct: 0, perShare: 0, ticket: 0, penny: PROMO_PENNY, pennyCcy: "EUR" };
  }
  if (picked.family === "smart") {
    return { pct: 0, perShare: 0.02, ticket: 2, ticketCcy: ccy, shareCcy: ccy };
  }
  if (picked.family === "exclusive") {
    return { pct: 0.0025, perShare: 0.012, ticket: 1.2, ticketCcy: ccy, shareCcy: ccy };
  }
  return { pct: 0.005, perShare: 0.012, ticket: 1.2, ticketCcy: ccy, shareCcy: ccy };
}

function remarkOf({ plan, rule }) {
  const lines = [];
  if (plan.family === "promo") {
    lines.push(`Promo: 0.012 €/share if the print is under ${PROMO_BELOW} €.`);
  }
  if (plan.family === "exclusive") lines.push("Exclusive on request.");
  if (rule?.min != null) {
    const n = rule.min * 2;
    const ccy = rule.minCcy === "EUR" ? "€" : rule.minCcy === "USD" ? "$" : rule.minCcy;
    lines.push(`min fees ${n} ${ccy}.`);
  }
  return lines.join("\n");
}

function stampOf({ listing, tax }) {
  const rates = taxRates(tax);
  const fromMap = Object.values(rates).reduce((s, r) => s + r, 0);
  if (fromMap) return { pct: fromMap, rates, source: "t212" };
  return { pct: 0, rates: {}, source: null };
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

export function exactCost({ amount, shares, price, market, listingCcy, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const rule = ruleOf(picked, market, listingCcy);
  if (!picked || !rule) return { commission: null, currency: QUOTE };
  const n = shares != null && Number.isFinite(Number(shares)) ? Number(shares) : 0;
  const notional = amount != null && Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const shareCcy = rule.shareCcy || rule.ticketCcy || picked.ccy;
  const ticketCcy = rule.ticketCcy || picked.ccy;
  let each = (rule.pct || 0) * notional + (rule.ticket || 0);
  if (rule.perShare) each += rule.perShare * n;
  if (rule.penny && price != null && toUsd(price, listingCcy) < toUsd(PROMO_BELOW, "EUR")) {
    each += rule.penny * n;
  }
  if (rule.min != null) each = Math.max(each, rule.min);
  const shareUsd = dollars(rule.perShare ? rule.perShare * n : 0, shareCcy) ?? 0;
  const ticketUsd = dollars(rule.ticket || 0, ticketCcy) ?? 0;
  const pctUsd = (rule.pct || 0) * (toUsd(notional, listingCcy) ?? 0);
  const pennyUsd =
    rule.penny && price != null && toUsd(price, listingCcy) < toUsd(PROMO_BELOW, "EUR")
      ? dollars(rule.penny * n, rule.pennyCcy) ?? 0
      : 0;
  const floorUsd = rule.min != null ? dollars(rule.min, rule.minCcy) : null;
  const usdEach = Math.max(floorUsd ?? 0, pctUsd + shareUsd + ticketUsd + pennyUsd);
  const sameCcy = !listingCcy || ticketCcy === String(listingCcy).toUpperCase();
  return {
    commission: Number((usdEach * 2).toPrecision(6)),
    currency: QUOTE,
    native: sameCcy
      ? { each, roundTrip: each * 2, currency: ticketCcy }
      : { each: usdEach, roundTrip: usdEach * 2, currency: QUOTE },
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

  if (!picked) {
    return { ...answer, why: `formule inconnue : ${plan} (smart|allinc|exclusive|promo)` };
  }
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Freedom24 n'existe pas encore : lancer `node freedom24/freedom24_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Freedom24` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Freedom24`,
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
  const rule = ruleOf(picked, market, listing.currency);
  if (!market || !rule) {
    return {
      ...answer,
      listing,
      why: `${listing.brokerExchange || listing.exchange} n'a pas de palier publié (hors actions / ETF cotés)`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = US_MICS.has(listing.mic);
  const tax = taxesOf(listing.isin);
  const stamp = stampOf({ listing, tax });
  const commPct = (rule.pct || 0) * 2;
  const knownPct = commPct + stamp.pct;
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });
  const a = plus(mkt.a, knownPct);
  const bookUsd = mkt.b;
  const shareUsd = rule.perShare ? dollars(rule.perShare * 2, rule.shareCcy || listing.currency) ?? 0 : 0;
  const ticket = rule.ticket ? dollars(rule.ticket * 2, rule.ticketCcy) ?? 0 : 0;
  const floorUsd = rule.min != null ? dollars(rule.min * 2, rule.minCcy) : null;

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(plus(bookUsd, shareUsd), 6),
    c: Number(Number(ticket).toPrecision(6)),
    floor: floorUsd,
    listing,
    feeMarket: market,
    remark: remarkOf({ plan: picked, rule }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(stamp.rates).length ? stamp.rates : null,
      commission: commPct || null,
      ticket: ticket || null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème Freedom24 ${picked.label}, palier ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      kind: commPct ? "pct" : rule.perShare ? "perShare" : "flat",
      rate: commPct ? rule.pct : null,
      perShare: rule.perShare || null,
      ticket: rule.ticket || null,
      currency: rule.ticketCcy || rule.shareCcy || picked.ccy,
      eachWay: true,
      plan: picked.id,
    },
    ccy: QUOTE,
    cap: null,
    threshold:
      picked.family === "promo" && market === "useu"
        ? {
            b: dollars(PROMO_PENNY * 2, "EUR"),
            a: 0,
            currency: QUOTE,
            below: PROMO_BELOW,
            belowCurrency: "EUR",
            why: `Promo : cours < ${PROMO_BELOW} € → ${PROMO_PENNY} €/share par jambe`,
          }
        : null,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `Freedom24 ${picked.label}, palier ${market}, barème du ${SCHEDULE.effective}, lu le ${SCHEDULE.readOn}. ` +
      (rule.pct
        ? `Courtage ${Number((rule.pct * 100).toPrecision(4))} % par jambe` +
          (rule.perShare ? ` + ${rule.perShare} ${rule.shareCcy || ""}/share` : "") +
          (rule.ticket ? ` + ${rule.ticket} ${rule.ticketCcy}` : "") +
          `. `
        : rule.perShare
          ? `Courtage ${rule.perShare} ${rule.shareCcy}/share + ticket ${rule.ticket} ${rule.ticketCcy}. `
          : picked.family === "promo"
            ? `Promo 0 € (0,012 €/share sous ${PROMO_BELOW} €). `
            : "") +
      (rule.min != null ? `Plancher ${rule.min} ${rule.minCcy} par jambe. ` : "") +
      `SEC / TAF hors de a (absents du barème). ` +
      `Change hors de a (pas de % imprimé ; EUR / USD au choix). Custody 0. ` +
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
      "usage : node freedom24_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=smart|allinc|exclusive|promo] [--json]\n" +
        "        node freedom24_cost.mjs --schedule\n" +
        "  ex.   node freedom24_cost.mjs AAPL\n" +
        "        node freedom24_cost.mjs VWCE XETRA EUR\n" +
        "        node freedom24_cost.mjs AAPL NASDAQ USD --plan=allinc"
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
      console.log(`\nce que Freedom24 propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : courtage / share et/ou spread 605" : " : rien"})`);
  console.log(
    `c = ${out.c} $   (par ordre : ${out.c ? `${out.c / 2} $ × 2` : "pas de ticket"})`
  );
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
    const billed = exactCost({
      amount,
      shares: n,
      price: p,
      market: out.feeMarket,
      listingCcy: l.currency,
      plan: out.plan,
    });
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
