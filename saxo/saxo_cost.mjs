// What one round trip costs at Saxo: buy n shares at price p, sell them
// back at once (online, cash account, no leverage), in dollars.
//
// The affine triple hid the floors. A $230 AAPL pays $1 a side, not 0.08 %,
// a TSX Venture sell stops at 25 CAD, and a 60 000-share US sale is $9.79
// of TAF, not 60 000 × $0.000195. `roundTrip` is given the size and
// charges what is charged.
//
// Saxo Bank A/S (DK) and its entities, re-read 2026-09-16 — the AU table
// still matches the 13th. ETF / ETC / ETN take the same exchange line as
// shares. Three tiers, Classic by default; Platinum wants ~200 k$ and VIP
// ~1 M$ (Australia prints the top tier as First). CFDs, futures, options,
// bonds, mutual funds and the leveraged FxCrypto book are not this trip;
// the catalogue is saxoinvestor.fr, which carries none of them.
//
//   US (Nasdaq, NYSE, NYSE American, Cboe BZX)   0.08 %, min 1 $
//   US OTC (Pink)          0.015 $/share, min 1 $, max 25 $
//   Toronto                0.08 %, min 5 CAD
//   TSX Venture            0.015 CAD/share, min 5 CAD, max 25 CAD
//   Xetra (and Saxo FSE)   0.08 %, min 3 €
//   Frankfurt floor (FFT)  0.08 %, min 5 €
//   Euronext               0.08 %, min 2 €
//   Luxembourg             0.08 %, min 2 €
//   London                 0.08 %, min 3 £
//   LSE IOB                0.08 %, min 3 $
//   Oslo / Growth Oslo     0.08 %, min 10 NOK
//   Warsaw                 0.12 %, min 10 PLN
//   Prague                 0.25 %, min 75 CZK
//   Bursa Malaysia         0.20 %, min 50 MYR
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
// Platinum and VIP take the same line at 0.05 % and 0.03 %. The three
// 0.12 % places publish only Classic and the top tier (0.05 %), so
// Platinum is not sold there rather than guessed, and likewise
// Johannesburg and the two per-share tapes.
//
// The $ / € / £ floor is in the number, so it stays out of the remark.
// Custody is a year of holding and FX is a choice — a sub-account in the
// listing currency opens for free — so both sit in the remark, not the
// total. The French catalogue is the default home: custody 0, FX 0.25 %.
// UK / AU / NL / CZ swing the custody; UK / AU swing the FX.
//
// Two traps in Saxo's own codes. `TSE` is Toronto and `TSX` is TSX
// Venture, the reverse of what the letters suggest and of what
// `venues.mjs` resolves both to (XTSE); the fee market is read off
// Saxo's code, not off the MIC. `FSE` is Xetra (symbol :xetr, 3 €):
// the printed table's Deutsche Börse line, not the floor. `FFT` is
// the floor (XFRA, 5 €). Oslo, Euronext Growth Oslo, Varsovie,
// Prague, Luxembourg, Bursa Malaysia and the LSE IOB have no printed
// Classic row; their tickets were read on SaxoTrader 2026-09-17.
//
// Stamp / FTT come from the tax map; failing that, the UK 0.5 %, Irish
// 1 % and Hong Kong 0.1 % that Saxo's taxation-by-market page prints.
// PTM £1 a side above £10 000 is that same page, not a neighbour's
// stamp. SEC and FINRA TAF use the current levies, each ceil-to-cent;
// TAF stops at $9.79. No CAT. The PEA cap (0.5 %) never binds at 0.08 %.
// Danish VAT of 25 % rides on the custody fee, not the commission.
//
//   https://www.home.saxo/rates-and-conditions/stocks/commissions
//   https://www.home.saxo/rates-and-conditions/etf/commissions
//   https://www.home.saxo/en-au/rates-and-conditions/stocks/commissions
//   https://www.home.saxo/fr-fr/rates-and-conditions/stocks/commissions
//
//   node saxo/saxo_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node saxo/saxo_cost.mjs AAPL NASDAQ USD --shares=1 --price=230 --plan=vip
//   node saxo/saxo_cost.mjs IWDA EURONEXT EUR --shares=1 --price=100
//   node saxo/saxo_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { VENUES, listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("saxo-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.home.saxo/rates-and-conditions/stocks/commissions",
  etf: "https://www.home.saxo/rates-and-conditions/etf/commissions",
  perExchange: "https://www.home.saxo/en-au/rates-and-conditions/stocks/commissions",
  fr: "https://www.home.saxo/fr-fr/rates-and-conditions/stocks/commissions",
  readOn: "2026-09-16",
  previouslyRead: "2026-09-13",
  ticketOn: "2026-09-17",
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
  first: "vip",
  platinum: "platinum",
  vip: "vip",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const CENT = 0.01;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const PTM = { each: 1, currency: "GBP", above: 10000 };
const UK_STAMP = 0.005;
const IE_STAMP = 0.01;
const HK_STAMP = 0.001;

const LADDER = { classic: 0.0008, platinum: 0.0005, vip: 0.0003 };
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
  xfra: pct(LADDER, 5, "EUR"),
  euronext: pct(LADDER, 2, "EUR"),
  lse: pct(LADDER, 3, "GBP"),
  lseIntl: pct(LADDER, 3, "USD"),
  ose: pct(LADDER, 10, "NOK"),
  wse: pct({ classic: 0.0012, platinum: null, vip: null }, 10, "PLN"),
  pra: pct({ classic: 0.0025, platinum: null, vip: null }, 75, "CZK"),
  lux: pct(LADDER, 2, "EUR"),
  malay: pct({ classic: 0.002, platinum: null, vip: null }, 50, "MYR"),
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
  connect: pct(LADDER, 15, "CNY", { billedIn: "CNH" }),
  sgx: pct(LADDER, 3, "SGD"),
  asx: pct(LADDER, 3, "AUD"),
};

const NO_LINE = {};
const TICKETED = new Set(["xfra", "ose", "wse", "pra", "lux", "malay", "lseIntl"]);

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

const HOME = "FR";
const TSXV = VENUES.find((v) => v.mic === "XTSX") ?? null;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const nativeCcy = (ccy) => (code(ccy) === "CNH" ? "CNY" : ccy);
const isAdr = (row) => /\bADRs?\b|american deposit/i.test(String(row?.name || ""));

const dollars = (amount, currency) => {
  const v = toUsd(amount, nativeCcy(currency));
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(nativeCcy(currency)),
});

const up = (value) =>
  value == null || Number.isNaN(value) ? null : value > 0 ? Math.ceil(value / CENT - 1e-9) * CENT : 0;

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

export function feeMarketOf(row, mic) {
  const raw = code(row?.exchange);
  const flat = loose(row?.exchange);
  const m = code(mic);

  if (NO_LINE[raw]) return null;
  if (raw === "TSE") return "tsx";
  if (raw === "TSX") return "tsxv";
  if (raw === "OOTC" || /PINK|OTCMKTS/.test(flat)) return "otc";
  if (raw === "FSE") return "xetr";
  if (raw === "FFT") return "xfra";
  if (raw === "OSE" || raw === "EGO") return "ose";
  if (raw === "WSE") return "wse";
  if (raw === "PRA") return "pra";
  if (raw === "LUX") return "lux";
  if (raw === "MALAY") return "malay";
  if (raw === "LSE_INTL") return "lseIntl";

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

function remarkOf({ plan, nat, adr, currency }) {
  const lines = [];
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
  if (fx) lines.push(fxRemark(Number((fx * 100).toPrecision(3)), currency));
  if (adr) lines.push("ADR 0.01–0.05 $/share (holding).");
  return lines.join("\n");
}

function stampOf({ market, listing, tax }) {
  const rates = { ...taxRates(tax) };
  delete rates.PTM_LEVY;
  delete rates.PTM;
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

/**
 * The whole bill for buying `shares` at `price` and selling them straight
 * back. `usd` is the number the page prints; `brokerFees` is only Saxo's
 * commission (the printed % or $/share, at its floor and cap).
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  bp = null,
  perShare = null,
  plan = DEFAULT_PLAN,
  nat = null,
}) {
  const picked = planOf(plan);
  const house = countryOf(nat);
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: picked?.id ?? plan,
    country: house,
    onlineBuy: true,
    cashCurrency: "",
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
  const venue = code(m.row.exchange) === "TSX" ? TSXV : m.venue;
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? venue?.mic ?? null,
    exchange: venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
    adr: isAdr(m.row),
  };

  const market = feeMarketOf(m.row, listing.mic);
  const rule = market ? RULE[market] : null;
  if (!rule) {
    const unpriced = NO_LINE[code(m.row.exchange)];
    return {
      ...answer,
      listing,
      cashCurrency: listing.currency,
      remark: remarkOf({ plan: picked, nat, adr: listing.adr, currency: listing.currency }),
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
      cashCurrency: listing.currency,
      onlineBuy: false,
      why: `Saxo ne publie pas le taux ${picked.label} sur ${market} : seuls Classic et le palier haut le sont`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = market === "us" || market === "otc" || US_MICS.has(listing.mic);
  const tax = taxesOf(listing.isin);
  const stamp = stampOf({ market, listing, tax });
  const ticketCcy = rule.billedIn || rule.minCcy;

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: listing.currency,
    onlineBuy: true,
    remark: remarkOf({ plan: picked, nat, adr: listing.adr, currency: listing.currency }),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: TICKETED.has(market)
      ? `ticket SaxoTrader ${picked.label}, palier ${market}, relu le ${SCHEDULE.ticketOn}`
      : `barème Saxo ${picked.label}, palier ${market}, relu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      kind: rule.kind,
      rate: rule.kind === "pct" ? rateOf(rule, picked) : null,
      perShare: rule.kind === "perShare" ? rateOf(rule, picked) : null,
      min: minOf(rule),
      max: rule.max ?? null,
      currency: ticketCcy,
      eachWay: true,
      plan: picked.id,
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    custody: custodyOf(nat, picked).rate ?? 0,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        picked,
        house,
        market,
        rule,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        stamp,
        american,
      }),
    };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const nativeNotional = dollars(notional, listing.currency) == null ? null : notional;
  const each = commissionEach({
    amount: rule.kind === "pct" ? nativeNotional : null,
    shares: n,
    market,
    plan: picked,
  });
  const commissionUsd = each == null ? null : dollars(each * 2, ticketCcy);

  const bookUsd =
    marketPerShare != null
      ? american
        ? marketPerShare * n
        : dollars(marketPerShare * n, listing.currency)
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;

  const taxUsd = notionalUsd == null ? null : notionalUsd * stamp.pct;
  const secUsd = american && notionalUsd != null ? up(notionalUsd * SEC_RATE) : american ? null : 0;
  const tafRaw = american && n > 0 ? Math.min(n * TAF_PER_SHARE, TAF_CAP) : 0;
  const tafUsd = american ? up(tafRaw) : 0;
  const ptmApplies =
    code(listing.type) === "STOCK" &&
    listing.mic === "XLON" &&
    listing.currency === "GBP" &&
    notional >= PTM.above;
  const ptmUsd = ptmApplies ? dollars(PTM.each * 2, PTM.currency) : 0;

  const usd = plus(bookUsd, commissionUsd, taxUsd, secUsd, tafUsd, ptmUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
            m.unsourced?.why || "pas de feuille de carnet"
          }`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      réglementaire: american || ptmApplies ? finite(plus(secUsd, tafUsd, ptmUsd), 6) : null,
      taxes: finite(taxUsd, 6),
    },
    sell: american
      ? { sec: finite(secUsd, 6), taf: finite(tafUsd, 6), tafCapped: tafRaw >= TAF_CAP }
      : null,
    confidence: confidenceOf({
      picked,
      house,
      market,
      rule,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      stamp,
      american,
      each,
      ticketCcy,
      ptmApplies,
      tafCapped: american && tafRaw >= TAF_CAP,
    }),
  };
}

function confidenceOf({
  picked,
  house,
  market,
  rule,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  stamp,
  american,
  each,
  ticketCcy,
  ptmApplies,
  tafCapped,
}) {
  const said = [];
  const rate = rateOf(rule, picked);
  said.push(
    TICKETED.has(market)
      ? `Saxo ${picked.label}, palier ${market}, ticket SaxoTrader relu le ${SCHEDULE.ticketOn} ` +
        `(absent de la table publiée relue le ${SCHEDULE.readOn})`
      : `Saxo ${picked.label}, palier ${market}, barème relu le ${SCHEDULE.readOn} ` +
        `(inchangé depuis le ${SCHEDULE.previouslyRead}, table AU identique)`
  );
  if (rule.kind === "perShare") {
    said.push(
      `courtage ${rate} ${rule.minCcy}/part par jambe, plancher ${minOf(rule)} et plafond ${rule.max} ${rule.minCcy}`
    );
  } else {
    said.push(
      `courtage ${(rate * 100).toFixed(2)} % par jambe, plancher ${minOf(rule)} ${ticketCcy || rule.minCcy}`
    );
    if (each != null && each === minOf(rule)) said.push(`le plancher mord`);
  }
  if (market === "connect") {
    said.push(`le plancher est facturé en CNH ; converti au CNY onshore, faute d'un CNH dans fx.mjs`);
  }
  if (american) {
    said.push(
      `SEC ${SEC_RATE} du montant et TAF ${TAF_PER_SHARE} $/part à la vente, plafonnée à ${TAF_CAP} $` +
        (tafCapped ? `, le plafond mord` : "")
    );
  }
  if (stamp.pct) {
    said.push(
      stamp.source === "saxo"
        ? `taxe ${(100 * stamp.pct).toFixed(2)} % — timbre ${market} que Saxo imprime (cet ISIN n'est pas dans la carte)`
        : `taxe de transfert ${(100 * stamp.pct).toFixed(2)} % prise dans la carte des taxes`
    );
  }
  if (ptmApplies) said.push(`PTM ${PTM.each} £ par jambe, le montant dépasse ${PTM.above} £`);
  said.push(
    `Saxo écrit sous chacune de ses tables que les prix varient selon le pays de résidence et que le ticket fait foi : ` +
      `ce fichier tient la table pan-Saxo, ici ${house}`
  );
  const custody = custodyOf(house, picked);
  said.push(
    `garde ${custody.rate === 0 ? "gratuite" : `${Number(((custody.rate ?? 0) * 100).toPrecision(3))} % l'an`}, hors du total`
  );
  said.push(
    `change ${Number(((fxOf(house, picked) ?? 0) * 100).toPrecision(3))} % hors du total : un sous-compte dans la devise de la ligne s'ouvre gratuitement`
  );
  if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part`);
  else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}`
    );
  }
  if (!leaf) said.push(`carnet absent pour cette ligne`);
  said.push(`aucun aller-retour réel dans ce dépôt`);
  return said.join(" ; ");
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
          plans: PLANS,
          rules: RULE,
          noLine: NO_LINE,
          custody: { default: CUSTODY_DEFAULT, byCountry: CUSTODY },
          fx: { default: FX_DEFAULT, byCountry: FX_BY_COUNTRY },
          ptm: PTM,
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
      "usage : node saxo/saxo_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]\n" +
        "                          [--plan=classic|platinum|vip] [--nat=FR] [--json]\n" +
        "        node saxo/saxo_cost.mjs --schedule\n" +
        "  ex.   node saxo/saxo_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node saxo/saxo_cost.mjs IWDA EURONEXT EUR --shares=1 --price=100\n" +
        "        node saxo/saxo_cost.mjs AAPL NASDAQ USD --shares=1 --price=230 --plan=vip"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
    nat: flag("nat"),
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
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

  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n"
    );
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const p = out.parts || {};
    if (p.marché != null) console.log(`  carnet         : ${p.marché} $`);
    if (p.courtage != null) console.log(`  courtage       : ${p.courtage} $`);
    if (p.réglementaire) console.log(`  réglementaire  : ${p.réglementaire} $`);
    if (p.taxes) console.log(`  taxes          : ${p.taxes} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.url) console.log(`\n${out.url}`);
}
