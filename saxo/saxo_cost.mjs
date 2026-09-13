// What one round trip costs at Saxo: buy n shares at price p, sell them back
// at once (online, cash account, no leverage).
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit the
// other `*_cost.mjs` files answer in. Saxo's minimum per order is a floor on
// the % already in `a`, so it sits in the floor (`min fees`) and `c` stays 0.
// Two tapes are billed per share instead (US OTC, TSX Venture): those go to
// `b`, and their 25-unit ceiling to `cap`.
//
// Saxo Bank A/S (DK) and its entities, read 2026-09-13. ETF / ETC / ETN take
// the same exchange line as shares — Saxo prints one table for both. Three
// tiers, Classic by default; Platinum wants ~200 k$ and VIP ~1 M$. CFDs,
// futures, options, bonds, mutual funds and the leveraged FxCrypto book are
// not this trip; the catalogue is saxoinvestor.fr, which carries none of them.
//
//   US (Nasdaq, NYSE, NYSE American, Cboe BZX)   0.08 %, min 1 $
//   US OTC (Pink)          0.015 $/share, min 1 $, max 25 $
//   Toronto                0.08 %, min 5 CAD
//   TSX Venture            0.015 CAD/share, min 5 CAD, max 25 CAD
//   Xetra                  0.08 %, min 3 €
//   Euronext               0.08 %, min 2 €
//   London                 0.08 %, min 3 £
//   Milan                  0.08 %, min 3 €
//   SIX                    0.08 %, min 3 CHF
//   Copenhague             0.08 %, min 10 DKK
//   Stockholm              0.08 %, min 10 SEK
//   Helsinki               0.08 %, min 3 €
//   Madrid, Dublin, Vienne 0.12 %, min 5 €
//   Johannesburg           0.30 %, min 50 ZAR
//   Tokyo                  0.08 %, min 800 ¥
//   Hong Kong              0.08 %, min 15 HKD
//   Stock Connect          0.08 %, min 15 CNH
//   Singapour              0.08 %, min 3 SGD
//   Sydney                 0.08 %, min 3 AUD
//
// Platinum and VIP take the same line at 0.05 % and 0.03 %. The three 0.12 %
// places publish only Classic and the top tier (0.05 %), so Platinum is null
// there rather than guessed, and likewise Johannesburg and the two per-share
// tapes.
//
// Saxo prints, under every one of those tables, that the prices "vary
// according to the country of residency" and that the trade ticket is what
// binds. This file holds the pan-Saxo table, which the French, Belgian, Swiss
// and Australian pages all repeat unchanged. Two things do move with
// residency and are read per country:
//
//   custody   free in BE / FR / IT / PL / CH, 0.01 % (max 40 €, refunded as
//             trading credit) in NL, 0.12 % in GB, waived against securities
//             lending in CZ, else the published 0.15 % / 0.12 % / 0.09 % a
//             year. It is a holding cost, not a trade, so it stays out of `a`
//             and goes to the remark. The Nordic and Singaporean rows of that
//             table were not read: DK, NO, SE, FI and SG therefore fall to the
//             0.15 %, which is a ceiling on them, not a reading.
//   change    0.25 % nearly everywhere, 0.6 % / 0.4 % / 0.2 % at Saxo UK.
//             A sub-account can be opened in the listing currency for free,
//             so the conversion is a choice, not a toll: out of `a`, in the
//             remark, like Elana — which runs this very platform.
//
// Two traps in Saxo's own codes. `TSE` is Toronto and `TSX` is TSX Venture,
// the reverse of what the letters suggest and of what `venues.mjs` resolves
// both to (XTSE); the fee market is therefore read off Saxo's code, not off
// the MIC. And `FSE` (Frankfurt floor) resolves to XETR here while Saxo's
// table names only Deutsche Börse (XETRA): Frankfurt has no published line,
// so it answers N/A rather than borrow the Xetra one. Same for Oslo, Varsovie,
// Prague, Luxembourg, Bursa Malaysia and the LSE International Order Book —
// 1 689 lines of 28 388, six per cent of the shelf. Elana, on the same
// platform, prices the IOB apart from the LSE, which is why it is not folded
// in here either.
//
// Stamp / FTT / PTM come from the tax map; failing that, the UK 0.5 %, Irish
// 1 % and Hong Kong 0.1 % that Saxo's taxation-by-market page prints. SEC and
// FINRA TAF use the repo's current figures. The PEA cap (0.5 % of the order,
// French entity) never binds at 0.08 %. Danish VAT of 25 % rides on the
// custody fee for EU residents, not on the commission. No live round trip:
// the coefficients are the printed %.
//
//   https://www.home.saxo/rates-and-conditions/stocks/commissions
//   https://www.home.saxo/rates-and-conditions/etf/commissions
//   https://www.home.saxo/en-au/rates-and-conditions/stocks/commissions
//   https://www.home.saxo/fr-fr/rates-and-conditions/stocks/commissions
//
//   node saxo/saxo_cost.mjs AAPL
//   node saxo/saxo_cost.mjs IWDA EURONEXT EUR --shares=1 --price=100
//   node saxo/saxo_cost.mjs AAPL NASDAQ USD --shares=1 --price=230 --plan=vip
//   node saxo/saxo_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { VENUES, listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("saxo-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.home.saxo/rates-and-conditions/stocks/commissions",
  etf: "https://www.home.saxo/rates-and-conditions/etf/commissions",
  perExchange: "https://www.home.saxo/en-au/rates-and-conditions/stocks/commissions",
  fr: "https://www.home.saxo/fr-fr/rates-and-conditions/stocks/commissions",
  readOn: "2026-09-13",
  entity: "Saxo Bank A/S (DK) et ses filiales",
  catalogueFrom: "saxoinvestor.fr",
};

const DEFAULT_PLAN = "classic";
const PLANS = {
  classic: { id: "classic", label: "Classic", from: null },
  platinum: { id: "platinum", label: "Platinum", from: "≈ 200 000 $" },
  vip: { id: "vip", label: "VIP", from: "≈ 1 000 000 $" },
};
const PLAN_ALIAS = {
  classic: "classic",
  default: "classic",
  retail: "classic",
  standard: "classic",
  first: "vip", // Totality Australia renamed the top tier.
  platinum: "platinum",
  vip: "vip",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const PTM = { each: 1, currency: "GBP", above: 10000 };
const UK_STAMP = 0.005;
const IE_STAMP = 0.01;
const HK_STAMP = 0.001;

// The ladder Saxo repeats on every entity page for the mainstream tapes.
const LADDER = { classic: 0.0008, platinum: 0.0005, vip: 0.0003 };
// The three European places that sit a rung above, where only Classic and the
// top tier are printed.
const HIGH = { classic: 0.0012, platinum: null, vip: 0.0005 };

const pct = (rates, min, minCcy, extra = {}) => ({ kind: "pct", ...rates, min, minCcy, ...extra });

const RULE = {
  us: pct(LADDER, 1, "USD"),
  otc: {
    kind: "perShare",
    classic: 0.015,
    platinum: null,
    vip: 0.005,
    min: 1,
    max: 25,
    minCcy: "USD",
  },
  tsx: pct(LADDER, 5, "CAD"),
  tsxv: {
    kind: "perShare",
    classic: 0.015,
    platinum: null,
    vip: 0.005,
    min: 5,
    max: 25,
    minCcy: "CAD",
  },
  xetr: pct(LADDER, 3, "EUR"),
  euronext: pct(LADDER, 2, "EUR"),
  lse: pct(LADDER, 3, "GBP"),
  mil: pct(LADDER, 3, "EUR"),
  six: pct(LADDER, 3, "CHF"),
  cph: pct(LADDER, 10, "DKK"),
  sto: pct(LADDER, 10, "SEK"),
  hel: pct(LADDER, 3, "EUR"),
  bme: pct(HIGH, 5, "EUR"),
  dublin: pct(HIGH, 5, "EUR"),
  vie: pct(HIGH, 5, "EUR"),
  jse: pct({ classic: 0.003, platinum: null, vip: 0.002 }, 50, "ZAR"),
  tyo: pct(LADDER, 800, "JPY"),
  hkex: pct(LADDER, 15, "HKD"),
  // Saxo bills the Stock Connect minimum in CNH; `fx.mjs` carries the onshore
  // CNY, the same currency within a fraction of a percent.
  connect: pct(LADDER, 15, "CNY", { billedIn: "CNH" }),
  sgx: pct(LADDER, 3, "SGD"),
  asx: pct(LADDER, 3, "AUD"),
};

// Places the catalogue carries and the fee tables do not name. Read off Saxo's
// own code, before any MIC: `venues.mjs` folds Frankfurt into Xetra and the
// IOB into the LSE, and borrowing their lines would be an invention.
const NO_LINE = {
  FSE: "la criée de Francfort",
  FFT: "la criée de Francfort",
  OSE: "Oslo Børs",
  EGO: "Euronext Growth Oslo",
  WSE: "la Bourse de Varsovie",
  PRA: "la Bourse de Prague",
  LUX: "la Bourse de Luxembourg",
  MALAY: "Bursa Malaysia",
  LSE_INTL: "l'International Order Book de Londres",
};

// Custody is a year of holding, not a round trip. It is read per country all
// the same, because it is the one Saxo fee that swings by residency.
const CUSTODY_DEFAULT = { classic: 0.0015, platinum: 0.0012, vip: 0.0009 };
const CUSTODY = {
  BE: { classic: 0, platinum: 0, vip: 0 },
  FR: { classic: 0, platinum: 0, vip: 0 },
  IT: { classic: 0, platinum: 0, vip: 0 },
  PL: { classic: 0, platinum: 0, vip: 0 },
  CH: { classic: 0, platinum: 0, vip: 0 },
  NL: { classic: 0.0001, platinum: 0.0001, vip: 0.0001, cap: 40, capCcy: "EUR", refunded: true },
  CZ: { ...CUSTODY_DEFAULT, waivedBy: "prêt de titres" },
  GB: { classic: 0.0012, platinum: 0.0012, vip: 0.0008 },
  AU: { classic: 0.0012, platinum: 0.0012, vip: 0.0006 },
};

const FX_DEFAULT = { classic: 0.0025, platinum: 0.0025, vip: 0.0025 };
const FX_BY_COUNTRY = {
  GB: { classic: 0.006, platinum: 0.004, vip: 0.002 },
  AU: { classic: 0.0045, platinum: 0.0045, vip: 0.0045 },
};

// The catalogue was read on saxoinvestor.fr, so a reader who has not said
// where they live is answered as the French entity: custody free, change
// 0.25 %. Saying nothing would print the 0.15 % of the countries Saxo serves
// at arm's length, which is the wrong default for the shelf this file reads.
const HOME = "FR";

const TSXV = VENUES.find((v) => v.mic === "XTSX") ?? null;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

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

export function countryOf(nat) {
  const c = code(nat);
  return /^[A-Z]{2}$/.test(c) ? c : HOME;
}

export function custodyOf(nat, plan = DEFAULT_PLAN) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  const table = CUSTODY[countryOf(nat)] ?? CUSTODY_DEFAULT;
  const rate = picked ? table[picked.id] : null;
  return { rate: rate ?? null, ...table, country: countryOf(nat) };
}

export function fxOf(nat, plan = DEFAULT_PLAN) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  const table = FX_BY_COUNTRY[countryOf(nat)] ?? FX_DEFAULT;
  return picked ? table[picked.id] ?? null : null;
}

const rateOf = (rule, plan) => rule[plan.id] ?? null;

const minOf = (rule) => (rule.min == null ? null : rule.min);

// Saxo's code first: it separates Toronto from TSX Venture, and Frankfurt
// from Xetra, where the resolved MIC does not.
export function feeMarketOf(row, mic) {
  const raw = code(row?.exchange);
  const flat = loose(row?.exchange);
  const m = code(mic);

  if (NO_LINE[raw]) return null;
  if (raw === "TSE") return "tsx"; // Toronto Stock Exchange
  if (raw === "TSX") return "tsxv"; // TSX Venture Exchange
  if (raw === "OOTC" || /PINK|OTCMKTS/.test(flat)) return "otc";

  if (US_MICS.has(m) || ["NASDAQ", "NYSE", "AMEX", "CBOE", "NSC", "BATSBZX"].includes(flat)) {
    return "us";
  }
  if (raw === "MIL" || raw === "MIL_AIM" || m === "XMIL") return "mil";
  if (raw === "XETR" || m === "XETR") return "xetr";
  if (["EURONEXT", "BRU", "LISB", "EGP", "EGB", "PAR_ACCESS", "BRU_ACCESS", "LIS_ACCESS", "PAR_MC_ETF"].includes(raw)) {
    return "euronext";
  }
  if (["XPAR", "XAMS", "XBRU", "XLIS"].includes(m)) return "euronext";
  if (raw === "EGD" || raw === "ISE" || m === "XMSM" || m === "XDUB") return "dublin";
  if (raw.startsWith("LSE") || m === "XLON") return "lse";
  if (["SIX", "VX", "SWX_BND_ETF"].includes(raw) || ["XSWX", "XVTX"].includes(m)) return "six";
  if (raw.startsWith("CSE") || m === "XCSE") return "cph";
  if (raw.startsWith("SSE") || m === "XSTO" || m === "XOME") return "sto";
  if (raw.startsWith("HSE") || m === "XHEL") return "hel";
  if (raw === "SIBE" || m === "XMAD" || m === "XMCE") return "bme";
  if (raw === "VIE" || m === "XWBO") return "vie";
  if (raw === "JSE" || m === "XJSE") return "jse";
  if (raw === "TYO" || ["XTKS", "XJPX"].includes(m)) return "tyo";
  if (raw === "HKEX" || m === "XHKG") return "hkex";
  if (raw === "SHANGHAI_SC" || raw === "SHENZHEN_SC") return "connect";
  if (raw.startsWith("SGX") || m === "XSES") return "sgx";
  if (raw === "ASX" || m === "XASX") return "asx";
  return null;
}

function minLabel(rule) {
  const min = minOf(rule);
  if (min == null) return null;
  const n = min * 2;
  const ccy = rule.billedIn || rule.minCcy;
  if (ccy === "USD") return `${n} $`;
  if (ccy === "EUR") return `${n} €`;
  if (ccy === "GBP") return `${n} £`;
  return `${n} ${ccy}`;
}

function remarkOf({ rule, plan, nat }) {
  const lines = [];
  const min = minLabel(rule);
  if (min) lines.push(`min fees ${min}.`);
  const custody = custodyOf(nat, plan);
  if (custody.rate) {
    lines.push(
      `Custody ${Number((custody.rate * 100).toPrecision(3))}%/year` +
        (custody.refunded ? ", refunded as credit" : "") +
        (custody.waivedBy ? ", waived with securities lending" : "") +
        "."
    );
  }
  const fx = fxOf(nat, plan);
  if (fx) lines.push(`FX ${Number((fx * 100).toPrecision(3))}% if converted.`);
  return lines.join("\n");
}

function stampOf({ market, listing, tax }) {
  const rates = taxRates(tax);
  const fromMap = Object.values(rates).reduce((s, r) => s + r, 0);
  if (fromMap) return { pct: fromMap, rates, source: "t212" };
  const stock = code(listing.type) === "STOCK";
  if (!stock) return { pct: 0, rates: {}, source: null };
  if (market === "lse" && listing.currency === "GBP") {
    return { pct: UK_STAMP, rates: { stamp: UK_STAMP }, source: "saxo" };
  }
  if (market === "dublin") return { pct: IE_STAMP, rates: { stamp: IE_STAMP }, source: "saxo" };
  if (market === "hkex") return { pct: HK_STAMP, rates: { stamp: HK_STAMP }, source: "saxo" };
  return { pct: 0, rates: {}, source: null };
}

function thresholdOf(listing) {
  if (code(listing.type) !== "STOCK") return null;
  if (listing.mic !== "XLON") return null;
  return {
    c: dollars(2 * PTM.each, PTM.currency),
    currency: QUOTE,
    above: PTM.above,
    aboveCurrency: PTM.currency,
    why: `prélèvement PTM de ${PTM.each} £ par ordre et par sens, au-delà de ${PTM.above} £`,
  };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantUnsourced = resolved.unsourced || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

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
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);

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
  const rate = rateOf(rule, picked);
  if (rate == null) return null;
  const min = minOf(rule);
  if (rule.kind === "perShare") {
    const n = shares != null && Number.isFinite(Number(shares)) ? Number(shares) : null;
    if (n == null) return min;
    return Math.min(rule.max ?? Infinity, Math.max(min, n * rate));
  }
  if (amount == null || !Number.isFinite(Number(amount))) return min;
  return Math.max(min, Number(amount) * rate);
}

export function exactCost({ amount, shares, market, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const rule = RULE[market];
  if (!picked || !rule) return { commission: null, currency: QUOTE };
  const each = commissionEach({ amount, shares, market, plan: picked });
  if (each == null) return { commission: null, currency: QUOTE, plan: picked.id, market };
  return {
    commission: dollars(each * 2, rule.minCcy),
    currency: QUOTE,
    native: { each, roundTrip: each * 2, currency: rule.billedIn || rule.minCcy },
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
  nat = null,
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
    country: countryOf(nat),
    etf,
    place,
    currency,
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (classic|platinum|vip)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Saxo n'existe pas encore : lancer `node saxo/saxo_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Saxo` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Saxo`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  // `venues.mjs` reads the string TSX as Toronto, which it is for every other
  // broker. Saxo files the juniors there and Toronto under TSE, so the venue is
  // corrected before the book is looked up, not after.
  const venue = code(m.row.exchange) === "TSX" ? TSXV : m.venue;
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
  });
  const listing = {
    isin: code(m.row.isin),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? venue?.mic ?? null,
    exchange: venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row, listing.mic);
  const rule = market ? RULE[market] : null;
  if (!rule) {
    const unpriced = NO_LINE[code(m.row.exchange)];
    return {
      ...answer,
      listing,
      why: unpriced
        ? `${unpriced} n'a pas de ligne au barème Saxo : le tarif n'est lisible que dans le ticket`
        : `${listing.brokerExchange || listing.exchange} n'a pas de palier publié chez Saxo`,
    };
  }
  if (rateOf(rule, picked) == null) {
    return {
      ...answer,
      listing,
      feeMarket: market,
      why: `Saxo ne publie pas le taux ${picked.label} sur ${market} : seuls Classic et le palier haut le sont`,
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
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue,
    unsourced: m.unsourced,
    toUsd: (x) => (american ? x : dollars(x, listing.currency)),
  });
  const shareComm =
    rule.kind === "perShare" ? dollars(rateOf(rule, picked) * 2, rule.minCcy) : 0;
  const floorUsd = dollars(minOf(rule) * 2, rule.minCcy);

  return {
    ...answer,
    a: finite(plus(mkt.a, knownPct), 4),
    b: finite(plus(mkt.b, shareComm, american ? TAF_PER_SHARE : 0), 6),
    c: 0,
    floor: floorUsd,
    listing,
    feeMarket: market,
    remark: remarkOf({ rule, plan: picked, nat }),
    parts: {
      marché:
        marketBp != null
          ? Number((marketBp / 1e4).toPrecision(4))
          : marketPerShare != null
            ? `${marketPerShare} par part`
            : null,
      taxes: Object.keys(stamp.rates).length ? stamp.rates : null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${TAF_PER_SHARE} par part` } : null,
      // Two tapes are billed per share, not on the amount: that belongs with
      // `b`, and printing it next to the prorata terms would double-count it
      // to the eye.
      commission: commPct || null,
      commissionParPart: shareComm || null,
      ticket: null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème Saxo ${picked.label}, palier ${market}, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      kind: rule.kind,
      rate: rule.kind === "pct" ? rateOf(rule, picked) : null,
      perShare: rule.kind === "perShare" ? rateOf(rule, picked) : null,
      min: minOf(rule),
      max: rule.max ?? null,
      currency: rule.billedIn || rule.minCcy,
      eachWay: true,
      plan: picked.id,
    },
    fees: {
      custody: custodyOf(nat, picked),
      fxIfConverted: fxOf(nat, picked),
      vatOnCustody: { rate: 0.25, who: "résidents UE, TVA danoise sur la garde seule" },
      peaCap: market === "euronext" ? 0.005 : null,
      schedule: SCHEDULE,
    },
    ccy: QUOTE,
    cap:
      rule.max != null
        ? {
            term: "b",
            part: "commission",
            amount: rule.max,
            currency: rule.minCcy,
            per: "ordre",
          }
        : american
          ? { term: "b", part: "FINRA TAF", amount: TAF_CAP, per: "exécution" }
          : null,
    threshold: thresholdOf(listing),
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      `Saxo ${picked.label}, palier ${market}, barème lu le ${SCHEDULE.readOn}. ` +
      (rule.kind === "pct"
        ? `Courtage ${(rateOf(rule, picked) * 100).toFixed(2)} % par jambe, plancher ` +
          `${minOf(rule)} ${rule.billedIn || rule.minCcy}, le même aux trois paliers. Le plancher est ` +
          `un sol sur le %, pas un ticket en plus : il est dans floor et c = 0. `
        : `Courtage ${rateOf(rule, picked)} ${rule.minCcy}/part par jambe, plancher ${minOf(rule)} et ` +
          `plafond ${rule.max} ${rule.minCcy} par ordre. `) +
      (market === "connect"
        ? `Le plancher est facturé en CNH ; converti au CNY onshore, faute d'un CNH dans fx.mjs. `
        : "") +
      (american ? `SEC et FINRA TAF aux figures courantes du dépôt. ` : "") +
      `Saxo écrit sous chacune de ses tables que les prix varient selon le pays de résidence et que ` +
      `le ticket fait foi : ce fichier tient la table pan-Saxo, que les pages française, belge, suisse ` +
      `et australienne répètent à l'identique. Garde et change, eux, sont lus par pays — ` +
      `ici ${countryOf(nat)}${nat ? "" : ", faute de résidence dite, comme le catalogue qui vient de saxoinvestor.fr"}. ` +
      `Garde ${custodyOf(nat, picked).rate === 0 ? "gratuite" : `${Number(((custodyOf(nat, picked).rate ?? 0) * 100).toPrecision(3))} % l'an`}, ` +
      `hors de a : c'est une année de détention, pas un aller-retour. ` +
      `Change ${Number(((fxOf(nat, picked) ?? 0) * 100).toPrecision(3))} % hors de a aussi : un sous-compte dans la ` +
      `devise de la ligne s'ouvre gratuitement, donc la conversion est un choix. ` +
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
          noLine: NO_LINE,
          custody: { default: CUSTODY_DEFAULT, byCountry: CUSTODY },
          fx: { default: FX_DEFAULT, byCountry: FX_BY_COUNTRY },
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
      "usage : node saxo_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]\n" +
        "                          [--plan=classic|platinum|vip] [--nat=FR] [--json]\n" +
        "        node saxo_cost.mjs --schedule\n" +
        "  ex.   node saxo_cost.mjs AAPL\n" +
        "        node saxo_cost.mjs IWDA EURONEXT EUR --shares=1 --price=100\n" +
        "        node saxo_cost.mjs AAPL NASDAQ USD --shares=1 --price=230 --plan=vip"
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
    nat: flag("nat"),
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (!out.listing) {
    console.log(`a = N/A   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) {
      console.log(`\nce que Saxo propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${picked?.label || out.plan} · ${out.country}]\n`
  );

  if (out.why) {
    console.log(`a = N/A   b = ${out.b}   c = ${out.c}`);
    console.log(out.why);
    process.exit(0);
  }

  const detail = [];
  if (typeof out.parts?.marché === "number") detail.push(`carnet ${out.parts.marché}`);
  for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
  if (out.parts?.commission) detail.push(`courtage ${out.parts.commission}`);
  if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);

  console.log(
    `a = ${out.a ?? "N/A"}   (au prorata${detail.length ? " : " + detail.join(" + ") : " : rien"})`
  );
  const perPart = [];
  if (out.parts?.commissionParPart) perPart.push(`courtage ${out.parts.commissionParPart}`);
  if (out.parts?.réglementaire) perPart.push(`FINRA ${TAF_PER_SHARE}`);
  if (typeof out.parts?.marché === "string") perPart.push(`carnet 605`);
  console.log(
    `b = ${out.b ?? "N/A"} $   (par part${perPart.length ? " : " + perPart.join(" + ") : " : rien"})`
  );
  console.log(`c = ${out.c} $   (par ordre : le plancher est dans floor, pas un ticket en plus)`);
  if (out.floor != null) console.log(`plancher ${out.floor} $`);
  if (out.remark) console.log(out.remark);
  const fx = out.fx?.listing ?? usdPer(l.currency);
  console.log(
    `\ncoût = ${out.a ?? "N/A"} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b ?? "N/A"} × n + ${out.c}   ($ ; p en ${l.currency})`
  );
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);

  const n = Number(flag("shares"));
  const p = Number(flag("price"));
  if (n > 0 && p > 0) {
    const amount = n * p;
    const amountUsd = toUsd(amount, l.currency);
    const extra = out.threshold && amount >= out.threshold.above ? out.threshold.c || 0 : 0;
    const affine =
      amountUsd != null && out.a != null ? out.a * amountUsd + out.b * n + out.c + extra : null;
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
