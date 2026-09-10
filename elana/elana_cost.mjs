// What one round trip costs at ELANA Global Trader: buy n shares at price p,
// sell them back at once (online, standard).
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. A published minimum of a % (or of the
// US $/share) sits in the floor (`min fees`, `c` = 0). The OTC Pink ticket
// under 50 000 $ is a flat 25 $ every order, so it lives in `c`.
//
// ELANA TRADING AD (BG), Global Trader (Saxo white label). Stocks / ETF
// card on globaltrader.elana.net, read 2026-09-10. ETF / ETC / ETN use the
// same exchange line as shares. Default is Standard, not VIP (volume /
// 1 M$ AUM). BG Trader (BSE 0.80 %, min 2.50 € from 20 Aug 2026), the
// investment-centre BSE card, CFDs, futures, options and bonds are not
// this trip. The catalogue is webtrader.elana.net: no Sofia board.
//
//   US listed     0.01 $/share, min 2 $     (VIP 0.009 $, same min;
//                  NYSE / Nasdaq / AMEX on the card; Cboe BZX same tape)
//   OTC Pink      25 $ under 50 000 $       (0.15 % above; VIP 24 $ / 0.14 %)
//   Xetra         0.05 %, min 3 €           (VIP 0.04 %, same min)
//   LSE           0.10 %, min 8 £           (VIP 0.08 %, min 6 £)
//   LSE IOB       0.10 %, min 20 $          (VIP 0.09 %, min 15 $)
//   Euronext      0.10 %, min 6 €           (VIP 0.08 %, min 4 €)
//   Milan         0.10 %, min 12 €          (VIP 0.09 %, min 10 €)
//   BME           0.10 %, min 10 €          (VIP 0.09 %, same min)
//   SIX           0.10 %, min 18 CHF        (VIP 0.09 %, min 12 CHF)
//   Vienna        0.10 %, min 6 €           (VIP 0.08 %, min 4 €)
//   Oslo          0.10 %, min 65 NOK        (VIP 0.09 %, same min)
//   Stockholm     0.10 %, min 65 SEK        (VIP 0.09 %, same min)
//   Copenhagen    0.10 %, min 60 DKK        (VIP 0.08 %, min 30 DKK)
//   Helsinki      0.10 %, min 12 €          (VIP 0.08 %, min 10 €)
//   Hong Kong     0.15 %, min 150 HKD       (VIP 0.13 %, min 80 HKD)
//
// Frankfurt floor has no published line. Cboe BZX is the US 0.01 $/share
// (the card names NYSE / Nasdaq / AMEX; BATS is the same NMS tape, and
// the catalogue files hundreds of USD ETFs there). SEC / TAF use the current
// figures (their printed 27.8 $ / million is stale). Stamp / FTT / PTM from
// the tax map; else their printed UK 0.50 %, Irish 1 %, HK 0.10 % on STOCK.
// Custody 0.1 % / year is a holding cost. Cash can sit in several currencies;
// conversion is spot ± 0.5 % only if the sub-account is the wrong currency,
// so FX stays out of `a`. No live trip: the coefficients are the printed %.
//
//   https://globaltrader.elana.net/en/en-tc/trading-conditions-stocks/
//   https://globaltrader.elana.net/en/en-tc/trading-conditions-etf/
//   https://www.elana.net/web/files/documents/202/files/elana-trading-tarifa-en.pdf
//   https://elana.net/bg/trading/novini/promeni-v-tarifata-na-elana-trejding-koito-shte-vljazat-v-sila-ot-20-avgust-2026-g
//
//   node elana/elana_cost.mjs AAPL
//   node elana/elana_cost.mjs VWCE XETR EUR --shares=1 --price=140
//   node elana/elana_cost.mjs AAPL NASDAQ USD --shares=1 --price=230 --plan=vip
//   node elana/elana_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("elana-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://globaltrader.elana.net/en/en-tc/trading-conditions-stocks/",
  etf: "https://globaltrader.elana.net/en/en-tc/trading-conditions-etf/",
  tariff: "https://www.elana.net/web/files/documents/202/files/elana-trading-tarifa-en.pdf",
  readOn: "2026-09-10",
  revised: "2026-08-20",
  entity: "ELANA Trading AD (BG), Global Trader",
};

const DEFAULT_PLAN = "standard";
const PLANS = {
  standard: { id: "standard", label: "Standard" },
  vip: { id: "vip", label: "VIP" },
};
const PLAN_ALIAS = {
  standard: "standard",
  default: "standard",
  retail: "standard",
  vip: "vip",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const PTM = { each: 1, currency: "GBP", above: 10000 };
const HK_STAMP = 0.001;

const RULE = {
  us: { kind: "perShare", standard: 0.01, vip: 0.009, min: 2, minCcy: "USD" },
  otc: {
    kind: "flat",
    standard: 25,
    vip: 24,
    above: 50000,
    aboveStandard: 0.0015,
    aboveVip: 0.0014,
    minCcy: "USD",
  },
  xetr: { kind: "pct", standard: 0.0005, vip: 0.0004, min: 3, minCcy: "EUR" },
  lse: { kind: "pct", standard: 0.001, vip: 0.0008, min: 8, vipMin: 6, minCcy: "GBP" },
  lsin: { kind: "pct", standard: 0.001, vip: 0.0009, min: 20, vipMin: 15, minCcy: "USD" },
  euronext: { kind: "pct", standard: 0.001, vip: 0.0008, min: 6, vipMin: 4, minCcy: "EUR" },
  mil: { kind: "pct", standard: 0.001, vip: 0.0009, min: 12, vipMin: 10, minCcy: "EUR" },
  bme: { kind: "pct", standard: 0.001, vip: 0.0009, min: 10, minCcy: "EUR" },
  six: { kind: "pct", standard: 0.001, vip: 0.0009, min: 18, vipMin: 12, minCcy: "CHF" },
  vie: { kind: "pct", standard: 0.001, vip: 0.0008, min: 6, vipMin: 4, minCcy: "EUR" },
  osl: { kind: "pct", standard: 0.001, vip: 0.0009, min: 65, minCcy: "NOK" },
  sto: { kind: "pct", standard: 0.001, vip: 0.0009, min: 65, minCcy: "SEK" },
  cse: { kind: "pct", standard: 0.001, vip: 0.0008, min: 60, vipMin: 30, minCcy: "DKK" },
  hel: { kind: "pct", standard: 0.001, vip: 0.0008, min: 12, vipMin: 10, minCcy: "EUR" },
  hkex: { kind: "pct", standard: 0.0015, vip: 0.0013, min: 150, vipMin: 80, minCcy: "HKD" },
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

function rateOf(rule, plan) {
  if (rule.kind === "flat") return plan.id === "vip" ? rule.vip : rule.standard;
  if (rule.kind === "perShare") return plan.id === "vip" ? rule.vip : rule.standard;
  return plan.id === "vip" ? rule.vip : rule.standard;
}

function minOf(rule, plan) {
  if (rule.min == null) return null;
  if (plan.id === "vip" && rule.vipMin != null) return rule.vipMin;
  return rule.min;
}

export function feeMarketOf(row, mic) {
  const code = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (code === "OTC" || /PINK|OTCMKTS/.test(code)) return "otc";
  if (US_MICS.has(m) || /^(NASDAQ|NYSE|AMEX|CBOE)$/.test(code)) return "us";
  if (m === "XETR" || code === "XETR") return "xetr";
  if (m === "XIOB" || code === "LSIN" || code === "LSEINTL") return "lsin";
  if (m === "XLON" || code === "LSE") return "lse";
  if (["XPAR", "XAMS", "XBRU", "XLIS"].includes(m) || code === "EURONEXT") return "euronext";
  if (m === "XMIL" || code === "MIL") return "mil";
  if (m === "XMCE" || code === "BME") return "bme";
  if (m === "XSWX" || m === "XVTX" || code === "SIX") return "six";
  if (m === "XWBO" || code === "VIE") return "vie";
  if (m === "XOSL" || code === "OSL") return "osl";
  if (m === "XSTO" || m === "XOME" || code === "OMXSTO") return "sto";
  if (m === "XCSE" || code === "OMXCOP") return "cse";
  if (m === "XHEL" || code === "OMXHEX") return "hel";
  if (m === "XHKG" || code === "HKEX") return "hkex";
  return null;
}

function minLabel(rule, plan) {
  const min = minOf(rule, plan);
  if (min == null) return null;
  const n = min * 2;
  const ccy = rule.minCcy;
  if (ccy === "USD") return `${n} $`;
  if (ccy === "EUR") return `${n} €`;
  if (ccy === "GBP") return `${n} £`;
  return `${n} ${ccy}`;
}

function remarkOf({ rule, plan }) {
  const lines = [];
  if (rule.kind !== "flat") {
    const min = minLabel(rule, plan);
    if (min) lines.push(`min fees ${min}.`);
  }
  lines.push("Custody 0.1%/year.");
  lines.push("FX 0.5% if converted.");
  return lines.join("\n");
}


function stampOf({ market, listing, tax }) {
  const rates = taxRates(tax);
  const fromMap = Object.values(rates).reduce((s, r) => s + r, 0);
  if (fromMap) return { pct: fromMap, rates, source: "t212" };
  const stock = String(listing.type || "").toUpperCase() === "STOCK";
  if (market === "lse" && stock && listing.mic === "XLON") {
    return { pct: 0.005, rates: { stamp: 0.005 }, source: "elana" };
  }
  if (market === "hkex" && stock) {
    return { pct: HK_STAMP, rates: { stamp: HK_STAMP }, source: "elana" };
  }
  return { pct: 0, rates: {}, source: null };
}

function thresholdOf(listing) {
  if (String(listing.type || "").toUpperCase() !== "STOCK") return null;
  if (listing.mic === "XLON") {
    return {
      c: dollars(2 * PTM.each, "GBP"),
      currency: QUOTE,
      above: PTM.above,
      aboveCurrency: "GBP",
      why: `prélèvement PTM de ${PTM.each} £ par ordre et par sens, au-delà de ${PTM.above} £`,
    };
  }
  return null;
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

export function commissionEach({ amount, shares, market, plan = DEFAULT_PLAN }) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  const rule = RULE[market];
  if (!picked || !rule) return null;
  if (rule.kind === "flat") {
    if (amount != null && Number(amount) >= rule.above) {
      return Number(amount) * (picked.id === "vip" ? rule.aboveVip : rule.aboveStandard);
    }
    return rateOf(rule, picked);
  }
  if (rule.kind === "perShare") {
    const n = shares != null && Number.isFinite(Number(shares)) ? Number(shares) : null;
    const fee = n == null ? minOf(rule, picked) : n * rateOf(rule, picked);
    return Math.max(minOf(rule, picked), fee);
  }
  if (amount == null || !Number.isFinite(Number(amount))) return minOf(rule, picked);
  return Math.max(minOf(rule, picked), Number(amount) * rateOf(rule, picked));
}

export function exactCost({ amount, shares, market, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const rule = RULE[market];
  if (!picked || !rule) return { commission: null, currency: QUOTE };
  const each = commissionEach({ amount, shares, market, plan: picked });
  return {
    commission: dollars(each * 2, rule.minCcy || "USD"),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: rule.minCcy || "USD" },
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

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (standard|vip)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Elana n'existe pas encore : lancer `node elana/elana_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Elana` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Elana`,
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
      why: `${listing.brokerExchange || listing.exchange} n'a pas de palier publié sur Global Trader`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us" || market === "otc" || US_MICS.has(listing.mic);
  const tax = taxesOf(listing.isin);
  const stamp = stampOf({ market, listing, tax });
  const commPct = rule.kind === "pct" ? rateOf(rule, picked) * 2 : 0;
  const knownPct = commPct + stamp.pct + (american ? SEC_RATE : 0);
  const a = marketBp != null ? marketBp / 1e4 + knownPct : knownPct;
  const bookUsd = american ? (marketPerShare ?? 0) : dollars(marketPerShare ?? 0, listing.currency) ?? 0;
  const shareComm = rule.kind === "perShare" ? rateOf(rule, picked) * 2 : 0;
  const ticket =
    rule.kind === "flat" ? dollars(rateOf(rule, picked) * 2, rule.minCcy) ?? 0 : 0;
  const floorUsd = rule.kind !== "flat" && minOf(rule, picked) != null
    ? dollars(minOf(rule, picked) * 2, rule.minCcy)
    : null;

  return {
    ...answer,
    a: Number(Number(a).toPrecision(4)),
    b: Number((bookUsd + shareComm + (american ? TAF_PER_SHARE : 0)).toPrecision(6)),
    c: Number(Number(ticket).toPrecision(6)),
    floor: floorUsd,
    listing,
    feeMarket: market,
    remark: remarkOf({ rule, plan: picked }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(stamp.rates).length ? stamp.rates : null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      commission: commPct || shareComm || null,
      ticket: ticket || null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème Elana Global Trader ${picked.label}, palier ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      kind: rule.kind,
      rate: rule.kind === "pct" ? rateOf(rule, picked) : null,
      perShare: rule.kind === "perShare" ? rateOf(rule, picked) : null,
      min: minOf(rule, picked),
      currency: rule.minCcy,
      eachWay: true,
      plan: picked.id,
    },
    ccy: QUOTE,
    cap: american ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" } : null,
    threshold:
      market === "otc"
        ? {
            a: (picked.id === "vip" ? rule.aboveVip : rule.aboveStandard) * 2,
            currency: QUOTE,
            above: rule.above,
            aboveCurrency: "USD",
            why: `OTC au-delà de ${rule.above} $ : ${(picked.id === "vip" ? rule.aboveVip : rule.aboveStandard) * 100}% par jambe, plus de ticket 25 $`,
          }
        : thresholdOf(listing),
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `Elana Global Trader ${picked.label}, palier ${market}, page lue le ${SCHEDULE.readOn}. ` +
      (rule.kind === "pct"
        ? `Courtage ${(rateOf(rule, picked) * 100).toFixed(2)} % par jambe, plancher ${minOf(rule, picked)} ${rule.minCcy}. Ticket dans le plancher, c = 0. `
        : rule.kind === "perShare"
          ? `Courtage ${rateOf(rule, picked)} $/share, plancher ${minOf(rule, picked)} $. `
          : `OTC ${rateOf(rule, picked)} $ par jambe sous ${rule.above} $ (dans c). `) +
      (american ? `SEC / TAF aux figures courantes, pas au 27,8 $ / million imprimé. ` : "") +
      `Change 0,5 % hors de a (sous-compte dans la devise). Custody hors de a. ` +
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
      "usage : node elana_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=standard|vip] [--json]\n" +
        "        node elana_cost.mjs --schedule\n" +
        "  ex.   node elana_cost.mjs AAPL\n" +
        "        node elana_cost.mjs VWCE XETR EUR --shares=1 --price=140\n" +
        "        node elana_cost.mjs AAPL NASDAQ USD --shares=1 --price=230 --plan=vip"
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
      console.log(`\nce qu'Elana propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  console.log(`a = ${out.a}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`);
  console.log(`b = ${out.b} $   (par part${out.b ? " : courtage $/share, FINRA et/ou spread 605" : " : rien"})`);
  console.log(
    `c = ${out.c} $   (par ordre : ${out.c ? "ticket OTC" : "ticket dans la remark, pas dans c"})`
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
    const extra = out.threshold && amount >= out.threshold.above ? out.threshold.c || 0 : 0;
    const affine = amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c + extra : null;
    const billed = exactCost({ amount, shares: n, market: out.feeMarket, plan: out.plan });
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
