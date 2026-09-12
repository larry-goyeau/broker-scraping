// What one round trip costs at OANDA TMS: buy n shares at price p, sell
// them back at once.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. Tickets that are a minimum of a % sit
// in the floor (`min fees`, `c` = 0).
//
// OANDA TMS Brokers S.A. (PL, KNF). The catalogue is the TMS Stocks list
// (`oanda_scraping.mjs`): cash shares and UCITS ETFs. CFD books, including
// BTCUSD, are left out. Default is a cash account kept in EUR — the card
// the EU site leads with. `--plan=usd|pln|ron|czk` is the same table for
// the other published base currencies.
//
// Table of Fees and Commissions, effective 1 July 2026, read 2026-09-12.
//
//   US shares     EUR / PLN / CZK / RON account   0
//                 USD account                     0.29 %, min 7 $
//   DE / FR / ES / UK                             0.15 %
//                 min 5 € / 5 $ / 20 zł / 20 lei / 125 Kč
//   Poland (GPW)                                  0.19 %
//                 min 1 € / 1 $ / 5 zł / 5 lei / 25 Kč
//   ETFs                                          0.10 %
//                 min 1 € / 1 $ / 5 zł / 5 lei / 25 Kč
//
// The published % × 2 sits in `a`. Ten commission-free ETF trades a month
// (up to 200 000 € turnover) are a promotion, not this trip. Telephone
// orders, inactivity and paper post are not this trip. Exchange fees are
// named without amounts, so they stay out of `a`. FX is a pip margin on
// the system mid (0.02 PLN on USDPLN, 0.006 on EURUSD, …), not a %, so
// it stays out of `a`.
//
// Stamp / FTT come from the tax map where the ISIN has a line; OANDA also
// prints Irish stamp 1 %, UK stamp 0.50 %, and PTM 1 £ above 10 000 £ on
// UK / Channel / Isle of Man stocks. Those two printed rates apply on
// STOCK when the map is empty. SEC / TAF on a US tape use the same current
// figures as the other files (their printed 0.00221 % is stale). No live
// trip: the coefficients are the printed %.
//
//   https://www.oanda.com/eu-en/document/81
//   https://www.oanda.com/eu-en/invest/brokerage-account
//   https://help.oanda.com/eu/en/faqs/trade-etfs-eu.htm
//
//   node oanda/oanda_cost.mjs AAPL
//   node oanda/oanda_cost.mjs AAPL NASDAQ USD --plan=usd
//   node oanda/oanda_cost.mjs VWCE XETR EUR
//   node oanda/oanda_cost.mjs ACP WSE PLN
//   node oanda/oanda_cost.mjs HSBA LSE GBP
//   node oanda/oanda_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("oanda-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.oanda.com/eu-en/document/81",
  page: "https://www.oanda.com/eu-en/invest/brokerage-account",
  etfHelp: "https://help.oanda.com/eu/en/faqs/trade-etfs-eu.htm",
  readOn: "2026-09-12",
  revised: "2026-07-01",
  entity: "OANDA TMS Brokers S.A. (PL)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const PTM = { each: 1, currency: "GBP", above: 10000 };
const UK_STAMP = 0.005;
const IE_STAMP = 0.01;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "BATS", "OTC"]);
const UK_REGISTERED = /^(GB|GG|JE|IM)/;
const DEFAULT_PLAN = "eur";

const PLANS = {
  eur: { id: "eur", label: "OANDA TMS (EUR)", ccy: "EUR" },
  usd: { id: "usd", label: "OANDA TMS (USD)", ccy: "USD" },
  pln: { id: "pln", label: "OANDA TMS (PLN)", ccy: "PLN" },
  ron: { id: "ron", label: "OANDA TMS (RON)", ccy: "RON" },
  czk: { id: "czk", label: "OANDA TMS (CZK)", ccy: "CZK" },
};

const PLAN_ALIAS = {
  eur: "eur",
  euro: "eur",
  default: "eur",
  usd: "usd",
  dollar: "usd",
  pln: "pln",
  zloty: "pln",
  poland: "pln",
  ron: "ron",
  leu: "ron",
  lei: "ron",
  czk: "czk",
  koruna: "czk",
};

// Native amounts, one way. min is a floor on the %, in the account currency.
const RULE = {
  eur: {
    us: { rate: 0, min: 0, currency: "EUR" },
    europe: { rate: 0.0015, min: 5, currency: "EUR" },
    poland: { rate: 0.0019, min: 1, currency: "EUR" },
    etf: { rate: 0.001, min: 1, currency: "EUR" },
  },
  usd: {
    us: { rate: 0.0029, min: 7, currency: "USD" },
    europe: { rate: 0.0015, min: 5, currency: "USD" },
    poland: { rate: 0.0019, min: 1, currency: "USD" },
    etf: { rate: 0.001, min: 1, currency: "USD" },
  },
  pln: {
    us: { rate: 0, min: 0, currency: "PLN" },
    europe: { rate: 0.0015, min: 20, currency: "PLN" },
    poland: { rate: 0.0019, min: 5, currency: "PLN" },
    etf: { rate: 0.001, min: 5, currency: "PLN" },
  },
  ron: {
    us: { rate: 0, min: 0, currency: "RON" },
    europe: { rate: 0.0015, min: 20, currency: "RON" },
    poland: { rate: 0.0019, min: 5, currency: "RON" },
    etf: { rate: 0.001, min: 5, currency: "RON" },
  },
  czk: {
    us: { rate: 0, min: 0, currency: "CZK" },
    europe: { rate: 0.0015, min: 125, currency: "CZK" },
    poland: { rate: 0.0019, min: 25, currency: "CZK" },
    etf: { rate: 0.001, min: 25, currency: "CZK" },
  },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isStock = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";
const isTracker = (listing) => /^(ETF|ETC|ETN)$/i.test(String(listing?.type || ""));

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
  if (isTracker(row)) return "etf";
  const ex = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  const ccy = String(row?.currency || "").toUpperCase();
  const isin = String(row?.isin || "").toUpperCase();
  if (/WSE|GPW|XWARS|WARSAW/.test(ex) || m === "XWAR") return "poland";
  if (
    US_MICS.has(m) ||
    US_EX.has(ex) ||
    m === "XNAS" ||
    /NASDAQ|NYSE|AMEX|ARCA|BATS|OTC/.test(ex)
  ) {
    return "us";
  }
  if (
    m === "XLON" ||
    m === "XETR" ||
    m === "XPAR" ||
    m === "XMAD" ||
    /LSE|XETR|XETRA|EURONEXT|BME|MADRID|LONDON/.test(ex)
  ) {
    return "europe";
  }
  // A few catalogue rows keep a leftover csv venue (BCS, GETTEX, LSX) on a
  // US share. The printed US card is for US-listed shares, not that venue.
  if (isin.startsWith("US") && ccy === "USD") return "us";
  return null;
}

export function ruleOf(plan, market) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked || !market) return null;
  return RULE[picked.id]?.[market] || null;
}

export function commissionEach(amount, rule) {
  if (!rule) return null;
  if (amount == null || !Number.isFinite(Number(amount))) {
    return rule.min ? rule.min : rule.rate ? null : 0;
  }
  let fee = Number(amount) * (rule.rate || 0);
  if (rule.min) fee = Math.max(rule.min, fee);
  return fee;
}

function remarkOf({ rule, market }) {
  const lines = [];
  if (rule?.min) lines.push(`min fees ${rule.min * 2} ${rule.currency}.`);
  if (market === "etf") lines.push("10 ETF trades/month free (up to 200 000 €).");
  lines.push("FX is a pip margin if converted.");
  return lines.join("\n");
}

function stampOf({ listing, tax }) {
  const rates = { ...taxRates(tax) };
  delete rates.PTM_LEVY;
  delete rates.PTM;
  const fromMap = Object.values(rates).reduce((s, r) => s + r, 0);
  if (fromMap) return { pct: fromMap, rates, source: "t212" };
  if (!isStock(listing)) return { pct: 0, rates: {}, source: null };
  const isin = String(listing.isin || "").toUpperCase();
  const mic = String(listing.mic || "").toUpperCase();
  if (isin.startsWith("IE") || mic === "XDUB" || mic === "XMSM") {
    return { pct: IE_STAMP, rates: { stamp: IE_STAMP }, source: "oanda" };
  }
  if (mic === "XLON" || isin.startsWith("GB")) {
    return { pct: UK_STAMP, rates: { stamp: UK_STAMP }, source: "oanda" };
  }
  return { pct: 0, rates: {}, source: null };
}

function thresholdOf(listing) {
  if (!isStock(listing) || !UK_REGISTERED.test(listing.isin || "")) return null;
  return {
    c: dollars(2 * PTM.each, "GBP"),
    currency: QUOTE,
    above: PTM.above,
    aboveCurrency: "GBP",
    why: `prélèvement PTM de ${PTM.each} £ par ordre et par sens, au-delà de ${PTM.above} £ (barème OANDA TMS)`,
  };
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
      if (
        wantVenue &&
        ["XPAR", "XAMS", "XBRU", "XLIS"].includes(wantVenue.mic) &&
        loose(m.row.exchange) === "EURONEXT"
      ) {
        return true;
      }
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
    const mk = (slot.byMarket[market || "none"] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function exactCost({ amount, market, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const rule = picked ? ruleOf(picked, market) : null;
  const each = commissionEach(amount, rule);
  if (each == null || !rule) return { commission: null, currency: QUOTE };
  return {
    commission: dollars(each * 2, rule.currency),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: rule.currency },
    rule,
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

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (eur|usd|pln|ron|czk)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue OANDA n'existe pas encore : lancer `node oanda/oanda_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue OANDA` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez OANDA`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  let book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
  });
  const marketGuess = feeMarketOf(m.row, book.mic ?? m.venue?.mic);
  // Rule 605 is a tape figure. A leftover csv venue (BCS, GETTEX, LSX) on a
  // US share still reads the same American report as NYSE / Nasdaq.
  if (marketGuess === "us" && book.leaf?.perShare == null) {
    const tape = spreadLeaf(spreads, {
      isin: m.row.isin,
      mic: "XNYS",
      currency: "USD",
    });
    if (tape.leaf?.perShare != null) book = tape;
  }
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange:
      (book.mic && book.mic !== m.venue?.mic
        ? resolveVenue({ mic: book.mic, exchange: book.mic }).venue?.name
        : null) ||
      m.venue?.name ||
      m.unsourced?.name ||
      m.row.exchange ||
      null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row, listing.mic);
  const rule = ruleOf(picked, market);
  const tax = taxesOf(listing.isin);
  if (!rule) {
    return {
      ...answer,
      a: null,
      b: null,
      c: null,
      listing,
      feeMarket: market,
      why: `pas de palier publié chez OANDA TMS pour ${listing.ticker || listing.isin} (${listing.exchange || "place"})`,
      tax,
      fx: fxNote(listing.currency),
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us" || US_MICS.has(listing.mic);
  const stamp = stampOf({ listing, tax });
  const knownPct = stamp.pct + (american ? SEC_RATE : 0) + (rule.rate || 0) * 2;
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });
  const a = plus(mkt.a, knownPct);
  const floorUsd = rule.min ? dollars(rule.min * 2, rule.currency) : null;

  return {
    ...answer,
    a: finite(a, 4),
    b: finite(plus(mkt.b, american ? TAF_PER_SHARE : 0), 6),
    c: 0,
    floor: floorUsd,
    listing,
    feeMarket: market,
    remark: remarkOf({ rule, market }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(stamp.rates).length ? stamp.rates : null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      commission: (rule.rate || 0) * 2 || null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème OANDA TMS ${picked.label}, palier ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate: rule.rate || null,
      min: rule.min || null,
      currency: rule.currency,
      eachWay: true,
      plan: picked.id,
    },
    ccy: QUOTE,
    cap: american ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" } : null,
    threshold: thresholdOf(listing),
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `OANDA TMS Brokers, compte ${picked.ccy}, palier ${market}, brochure du ${SCHEDULE.revised} lue le ${SCHEDULE.readOn}. ` +
      (rule.rate
        ? `Courtage ${(rule.rate * 100).toFixed(2)} % par jambe` +
          (rule.min ? `, plancher ${rule.min} ${rule.currency}. ` : ". ")
        : `Courtage 0 sur les actions US (compte ${picked.ccy}). `) +
      (rule.min ? `Ticket ${rule.min} ${rule.currency} dans le plancher. ` : "") +
      `b = ` +
      (american ? `605 + TAF` : `0`) +
      `. Change en pips hors de a. ` +
      (market === "etf" ? `10 ETF/mois offerts hors de a. ` : "") +
      `Aucun aller-retour réel dans ce dépôt. ` +
      (leaf ? "" : ` Pas de feuille de carnet pour cet ISIN / cette place.`),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
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
              { ...v, rules: RULE[k] },
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
      "usage : node oanda_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=eur|usd|pln|ron|czk] [--json]\n" +
        "        node oanda_cost.mjs --schedule\n" +
        "  ex.   node oanda_cost.mjs AAPL\n" +
        "        node oanda_cost.mjs AAPL NASDAQ USD --plan=usd\n" +
        "        node oanda_cost.mjs ACP WSE PLN\n" +
        "        node oanda_cost.mjs HSBA LSE GBP"
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
      console.log(`\nce que OANDA propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : FINRA et/ou spread 605" : " : rien"})`);
  console.log(`c = ${out.c} $   (par ordre : ticket dans la remark, pas dans c)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  if (out.why) console.log(`\n${out.why}`);
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
          (billed.native?.each != null
            ? ` (${Number(billed.native.each).toPrecision(4)} ${billed.native.currency} × 2)`
            : "")
      );
    }
  }
  if (out.url) console.log(`\n${out.url}`);
}
