// What one round trip costs at Davy Select: buy n shares at price p, sell them
// back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. Tickets that are a minimum of a % sit
// in the floor (`min fees`, `c` = 0). The overseas settlement charge is a
// flat ticket every time, so it lives in `c`.
//
// J & E Davy, Davy Select Execution-Only, schedule effective 1 August 2025,
// read 2026-09-10. Default is the direct Personal Investment Account, online.
// Telephone (1.65 % / 1.00 % / 0.50 %, min 100 €) and bonds / options (phone
// only) are not this trip. Pensions (PRSA / PRB / ARF / EPP) are wrappers
// on the same overseas card and are not a fourth coefficient.
//
//   PIA (direct, default)   0.50 % online, min 14.99 €
//                           + 50 € / quarter if commissions in the quarter
//                             are below that (waived by the tickets)
//   Investment Only         0.90 % / year of the balance, min 750 €
//                           (holding cost; no per-trade commission on IE/UK)
//   Trading Plus            same 0.90 %, min 500 € — intermediary schedule
//
// Instruments listed in Ireland or the UK have no overseas line. Everything
// else adds a published minimum of 0.06 % (direct) or 0.10 % (Trading Plus)
// per trade, plus a 25 € foreign settlement charge per trade. The % × 2 sits
// in `a`. The 25 € × 2 sits in `c`. "Fees will vary depending on overseas
// market dealt and broker used" — the printed minimum is what is copied,
// not a guessed higher broker bill.
//
// FX is "typically will not exceed 1 %" of the converted amount. That is a
// cap, not a rate, so it stays out of `a`. Stamp / ITP / PTM / FTT come
// from the tax map where the ISIN has a line; Davy also prints Irish stamp
// 1 %, UK stamp 0.50 %, ITP 1.25 € above 12 500 € and PTM 1 £ above
// 10 000 £ on shares. Those two levies sit in `threshold` for STOCK on
// Dublin / London. SEC / TAF on a US tape use the same figures as the
// other files. No live trip: a PIA round trip is already 29.98 €.
//
//   https://www.davyselect.ie/binaries/content/assets/davyselect/pdfs/fees--charges/davy-select-execution-only-fees-and-charges-schedule.pdf
//   https://www.davyselect.ie/binaries/content/assets/davyselect/pdfs/fees--charges/davy-select-execution-only-intermediary-clients-fees-and-charges-schedule.pdf
//
//   node davy/davy_cost.mjs IWDA
//   node davy/davy_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node davy/davy_cost.mjs KRZ IRISHMAIN EUR --plan=io
//   node davy/davy_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("davy-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source:
    "https://www.davyselect.ie/binaries/content/assets/davyselect/pdfs/fees--charges/davy-select-execution-only-fees-and-charges-schedule.pdf",
  intermediary:
    "https://www.davyselect.ie/binaries/content/assets/davyselect/pdfs/fees--charges/davy-select-execution-only-intermediary-clients-fees-and-charges-schedule.pdf",
  page: "https://www.davyselect.ie/charges/fees-and-charges.html",
  readOn: "2026-09-10",
  revised: "2025-08-01",
  entity: "Davy Select (J & E Davy, IE), Execution-Only",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const HOME_MICS = new Set(["XMSM", "XDUB", "XLON"]);
const PTM = { each: 1, currency: "GBP", above: 10000 };
const ITP = { each: 1.25, currency: "EUR", above: 12500 };
const SETTLEMENT_EUR = 25;
const DEFAULT_PLAN = "pia";

const PLANS = {
  pia: {
    id: "pia",
    label: "Personal Investment Account",
    rate: 0.005,
    min: 14.99,
    overseas: 0.0006,
    annual: null,
    annualMin: null,
    quarterly: 50,
  },
  io: {
    id: "io",
    label: "Investment Only",
    rate: 0,
    min: 0,
    overseas: 0.0006,
    annual: 0.009,
    annualMin: 750,
    quarterly: null,
  },
  tradingplus: {
    id: "tradingplus",
    label: "Trading Plus",
    rate: 0,
    min: 0,
    overseas: 0.001,
    annual: 0.009,
    annualMin: 500,
    quarterly: null,
  },
};

const PLAN_ALIAS = {
  pia: "pia",
  personal: "pia",
  personalinvestment: "pia",
  personalinvestmentaccount: "pia",
  default: "pia",
  io: "io",
  investmentonly: "io",
  investment: "io",
  tradingplus: "tradingplus",
  plus: "tradingplus",
  intermediary: "tradingplus",
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

export function feeMarketOf(exchange, mic) {
  const code = loose(exchange);
  if (/FUNDMANAGER|NOTQUOTED/.test(code)) return "overseas";
  const m = String(mic || "").toUpperCase();
  if (HOME_MICS.has(m)) return "home";
  if (/IRISHMAIN|IRISHSTOCK|^ISE$|XDUB|XMSM/.test(code)) return "home";
  if (/LONDONMAIN|LONDONSTOCK|^LSE$|XLON|SEAQ|PLUSMARKETS/.test(code)) return "home";
  return "overseas";
}

export function commissionEach(amount, plan, market) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked || amount == null || !Number.isFinite(Number(amount))) return null;
  const n = Number(amount);
  const overseas = market === "overseas";
  let fee = 0;
  if (picked.rate) fee += Math.max(picked.min, n * picked.rate);
  if (overseas) fee += n * picked.overseas + SETTLEMENT_EUR;
  return fee;
}

function remarkOf({ plan }) {
  const lines = [];
  if (plan.min) lines.push(`min fees ${plan.min * 2} €.`);
  if (plan.quarterly != null) lines.push(`${plan.quarterly} €/quarter if commissions < ${plan.quarterly} €.`);
  if (plan.annual != null) lines.push(`Dealing ${(plan.annual * 100).toFixed(2)}%/year, min ${plan.annualMin} €.`);
  lines.push("FX typically ≤1% if converted.");
  return lines.join("\n");
}


function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter(
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
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

function thresholdOf(listing) {
  if (String(listing.type || "").toUpperCase() !== "STOCK") return null;
  if (listing.mic === "XLON") {
    return {
      c: dollars(2 * PTM.each, "GBP"),
      currency: QUOTE,
      above: PTM.above,
      aboveCurrency: "GBP",
      why: `prélèvement PTM de ${PTM.each} £ par ordre et par sens, au-delà de ${PTM.above} £ (barème Davy)`,
    };
  }
  if (listing.mic === "XMSM" || listing.mic === "XDUB") {
    return {
      c: dollars(2 * ITP.each, "EUR"),
      currency: QUOTE,
      above: ITP.above,
      aboveCurrency: "EUR",
      why: `prélèvement ITP de ${ITP.each} € par ordre et par sens, au-delà de ${ITP.above} €`,
    };
  }
  return null;
}

export function exactCost({ amount, market, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  if (!picked) return { commission: null, currency: QUOTE };
  const each = commissionEach(amount, picked, market);
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

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (pia|io|tradingplus)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Davy n'existe pas encore : lancer `node davy/davy_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Davy` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Davy`,
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
  const overseas = market === "overseas";
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = US_MICS.has(listing.mic);
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const commPct = (picked.rate + (overseas ? picked.overseas : 0)) * 2;
  const knownPct = taxTotal + (american ? SEC_RATE : 0) + commPct;
  const a = marketBp != null ? marketBp / 1e4 + knownPct : knownPct;
  const bookUsd = american ? (marketPerShare ?? 0) : dollars(marketPerShare ?? 0, listing.currency) ?? 0;
  const floorUsd = picked.min ? dollars(picked.min * 2, "EUR") : null;
  const settleUsd = overseas ? dollars(SETTLEMENT_EUR * 2, "EUR") ?? 0 : 0;

  return {
    ...answer,
    a: Number(Number(a).toPrecision(4)),
    b: Number((bookUsd + (american ? TAF_PER_SHARE : 0)).toPrecision(6)),
    c: Number(settleUsd.toPrecision(6)),
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
      commission: commPct || null,
      settlement: overseas ? SETTLEMENT_EUR * 2 : null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème Davy Select ${picked.label}, palier ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate: picked.rate || null,
      min: picked.min || null,
      overseas: overseas ? picked.overseas : 0,
      settlement: overseas ? SETTLEMENT_EUR : 0,
      currency: "EUR",
      eachWay: true,
      plan: picked.id,
    },
    ccy: QUOTE,
    cap: american ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" } : null,
    threshold: thresholdOf(listing),
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `Davy Select ${picked.label}, palier ${market}, brochure du ${SCHEDULE.revised} lue le ${SCHEDULE.readOn}. ` +
      (picked.rate
        ? `Courtage en ligne ${(picked.rate * 100).toFixed(2)} % par jambe, plancher ${picked.min} €. `
        : `Pas de courtage par ordre sur IE/UK (le 0,90 % annuel reste hors de a). `) +
      (overseas
        ? `Overseas ${(picked.overseas * 100).toFixed(2)} % + ${SETTLEMENT_EUR} € de settlement par jambe. `
        : `Cotation IE/UK : pas de ligne overseas. `) +
      (picked.min ? `Ticket ${picked.min} € dans le plancher. ` : "") +
      (overseas ? `Settlement overseas dans c. ` : "") +
      `b = ` +
      (american ? `605 + TAF` : `0`) +
      `. Change « typically ≤ 1 % » hors de a. ` +
      `Aucun aller-retour réel dans ce dépôt (un PIA fait déjà 29,98 €). ` +
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
        {
          ...SCHEDULE,
          defaultPlan: DEFAULT_PLAN,
          plans: Object.fromEntries(
            Object.entries(PLANS).map(([k, v]) => [
              k,
              { ...v, roundTripRate: (v.rate + v.overseas) * 2, settlementEur: SETTLEMENT_EUR },
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
      "usage : node davy_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=pia|io|tradingplus] [--json]\n" +
        "        node davy_cost.mjs --schedule\n" +
        "  ex.   node davy_cost.mjs IWDA\n" +
        "        node davy_cost.mjs AAPL NASDAQ USD --shares=1 --price=230\n" +
        "        node davy_cost.mjs KRZ IRISHMAIN EUR --plan=io"
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
      console.log(`\nce que Davy propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);
  if (out.parts?.settlement) detail.push(`settlement ${out.parts.settlement} €`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : FINRA et/ou spread 605" : " : rien"})`);
  console.log(
    `c = ${out.c} $   (par ordre : ${out.c ? "settlement overseas 25 € × 2" : "ticket dans la remark, pas dans c"})`
  );
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) console.log(`\n${out.remark}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const extra = out.threshold && amount >= out.threshold.above ? out.threshold.c : 0;
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c + extra : null;
    const billed = exactCost({ amount, market: out.feeMarket, plan: out.plan });
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
