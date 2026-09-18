// What one round trip costs at ELANA Global Trader: buy n shares at price p,
// sell them back at once, online, Standard, in dollars.
//
// The affine triple hid the ticket. Xetra's 3 € floor, the US 2 $ minimum
// and every other printed min lived in `min fees` / `c` = 0, so a ten-share
// AAPL trip was missing 4 $ and a VWCE trip 6 €. OTC's 25 $ under 50 000 $
// sat in `c`, which the page no longer reads. PTM £1 and ITP 1.25 € lived
// only in `threshold`. FINRA's 9.79 $ TAF cap sat in `cap`. `roundTrip` is
// given the size and charges what is charged.
//
// ELANA TRADING AD (BG), Global Trader (Saxo white label). Stocks / ETF
// card on globaltrader.elana.net, re-read 2026-09-15 — unchanged since the
// 10th (VIP arrived with the 20 August 2026 tariff). ETF / ETC / ETN use
// the same exchange line as shares. Default is Standard, not VIP (volume /
// 1 M$ AUM). BG Trader (BSE 0.80 %, min 2.50 €), the investment-centre BSE
// card, CFDs, futures, options, bonds and algo pre-market (+0.005 $/share)
// are not this trip. Catalogue 14 517 lines — 9 251 stocks, 4 759 ETFs,
// 201 ETC, 96 ETN, 210 funds — no Sofia board, no Frankfurt floor line.
//
//   US listed     0.01 $/share, min 2 $     (VIP 0.009 $ NYSE / Nasdaq,
//                  same 0.01 $ on AMEX; Cboe BZX same NMS tape)
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
// What is in the number: the printed % or $/share at its floor, each way;
// OTC's 25 $ or 0.15 %; Irish stamp 1 % and UK stamp 0.50 % on a share
// purchase (taxMap when it has the ISIN, else the rates they print);
// French / Italian / Spanish FTT from the same map, never invented; HK
// stamp 0.10 % on a Hong Kong share; PTM £1 each way on a UK share above
// 10 000 £ (they still print £1); ITP 1.25 € each way on an Irish share
// above 12 500 €; current SEC and TAF on an American sale, TAF capped at
// 9.79 $ (their printed 27.8 $ / million is stale); the market spread,
// once.
//
// Custody 0.1 % / year is a holding cost. Cash can sit in several
// currencies; conversion is spot ± 0.5 % only if the sub-account is the
// wrong currency, so FX stays out of the total.
//
//   https://globaltrader.elana.net/en/en-tc/trading-conditions-stocks/
//   https://globaltrader.elana.net/en/en-tc/trading-conditions-etf/
//   https://www.elana.net/web/files/documents/202/files/elana-trading-tarifa-en.pdf
//
//   node elana/elana_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node elana/elana_cost.mjs VWCE XETR EUR --shares=1 --price=140
//   node elana/elana_cost.mjs SHEL LSE GBP --shares=500 --price=28
//   node elana/elana_cost.mjs 00700 HKEX HKD --shares=10 --price=400
//   node elana/elana_cost.mjs AAPL NASDAQ USD --plan=vip --shares=10 --price=230
//   node elana/elana_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("elana-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://globaltrader.elana.net/en/en-tc/trading-conditions-stocks/",
  etf: "https://globaltrader.elana.net/en/en-tc/trading-conditions-etf/",
  tariff: "https://www.elana.net/web/files/documents/202/files/elana-trading-tarifa-en.pdf",
  readOn: "2026-09-15",
  previouslyRead: "2026-09-10",
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
const IE_STAMP = 0.01;
const UK_STAMP = 0.005;
const HK_STAMP = 0.001;
const PTM = { each: 1, currency: "GBP", above: 10000 };
const ITP = { each: 1.25, currency: "EUR", above: 12500 };
const UK_ISSUERS = /^(GB|JE|GG|IM)$/;

const RULE = {
  us: { kind: "perShare", standard: 0.01, vip: 0.009, amexVip: 0.01, min: 2, minCcy: "USD" },
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
const isStock = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";
const issuerCc = (isin) => String(isin || "").slice(0, 2).toUpperCase();
const isAmex = (mic, exchange) =>
  String(mic || "").toUpperCase() === "XASE" || /^(AMEX|NYSEAMERICAN)$/.test(loose(exchange));

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const toCcy = (amount, from, to) => {
  if (String(from || "").toUpperCase() === String(to || "").toUpperCase()) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
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

function rateOf(rule, plan, listing = {}) {
  if (rule.kind === "flat") return plan.id === "vip" ? rule.vip : rule.standard;
  if (rule.kind === "perShare") {
    if (plan.id === "vip" && isAmex(listing.mic, listing.brokerExchange || listing.exchange)) {
      return rule.amexVip ?? rule.standard;
    }
    return plan.id === "vip" ? rule.vip : rule.standard;
  }
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
  if (m === "XIOB" || code === "LSIN" || code === "LSEINTL" || code === "LSEIOB") return "lsin";
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

function remarkOf(currency) {
  return `Custody 0.1%/year.\n${fxRemark("0.5", currency)}`;
}

/**
 * Stamp from the tax map when Trading212 swept the ISIN. Irish, British and
 * Hong Kong shares it never asked about still pay the rates Elana prints
 * (1 % / 0.50 % / 0.10 %). A German name on London is not a UK share.
 */
export function taxesFor(isin, listing, market) {
  const tax = taxesOf(isin);
  const mapped = taxRates(tax);
  if (Object.keys(mapped).length) return { tax, rates: mapped, source: "taxMap" };
  if (!isStock(listing)) return { tax, rates: {}, source: null };
  const cc = issuerCc(isin);
  if (cc === "IE") return { tax, rates: { stamp: IE_STAMP }, source: "elana" };
  if (UK_ISSUERS.test(cc)) return { tax, rates: { stamp: UK_STAMP }, source: "elana" };
  if (market === "hkex") return { tax, rates: { stamp: HK_STAMP }, source: "elana" };
  return { tax, rates: {}, source: null };
}

function levyEach({ listing, notional, currency }) {
  if (!isStock(listing)) return { itp: 0, ptm: 0 };
  const cc = issuerCc(listing.isin);
  const mic = String(listing.mic || "").toUpperCase();
  const irish = cc === "IE";
  const london = mic === "XLON" || /^(LSE|LONDON)/i.test(listing.brokerExchange || listing.exchange || "");
  const british = UK_ISSUERS.test(cc) && london;
  const out = { itp: 0, ptm: 0 };
  if (irish) {
    const eur = toCcy(notional, currency, "EUR");
    if (eur == null) out.itp = null;
    else {
      out.itp = eur > ITP.above ? ITP.each : 0;
      out.itpCcy = ITP.currency;
    }
  }
  if (british) {
    const gbp = toCcy(notional, currency, "GBP");
    if (gbp == null) out.ptm = null;
    else {
      out.ptm = gbp > PTM.above ? PTM.each : 0;
      out.ptmCcy = PTM.currency;
    }
  }
  return out;
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

/**
 * One side, in the printed ticket currency. The % (or $/share) is floored
 * at the ticket; OTC jumps from 25 $ to 0.15 % at 50 000 $.
 */
export function commissionSide({ amount, shares, market, plan = DEFAULT_PLAN, listing = {} }) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  const rule = RULE[market];
  if (!picked || !rule) return null;
  const rate = rateOf(rule, picked, listing);
  const min = minOf(rule, picked);
  const ccy = rule.minCcy || "USD";

  if (rule.kind === "flat") {
    const usd = toCcy(amount, listing.currency, "USD");
    if (usd == null || !Number.isFinite(usd)) return null;
    if (usd >= rule.above) {
      const pct = picked.id === "vip" ? rule.aboveVip : rule.aboveStandard;
      const charged = usd * pct;
      return { charged, raw: charged, floored: false, rate: pct, currency: "USD", kind: "pct" };
    }
    return { charged: rate, raw: rate, floored: false, rate: null, currency: "USD", kind: "flat" };
  }

  if (rule.kind === "perShare") {
    if (shares == null || !Number.isFinite(Number(shares))) return null;
    const raw = Number(shares) * rate;
    const charged = Math.max(min, raw);
    return { charged, raw, floored: raw < min, rate, currency: ccy, kind: "perShare" };
  }

  const native = toCcy(amount, listing.currency, ccy);
  if (native == null || !Number.isFinite(native)) return null;
  const raw = native * rate;
  const charged = Math.max(min, raw);
  return { charged, raw, floored: raw < min, rate, currency: ccy, kind: "pct" };
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `brokerFees` is the Elana ticket, not stamp / PTM / SEC / TAF.
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
}) {
  const picked = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: null,
    plan: picked?.id ?? plan,
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (standard|vip)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Elana n'existe pas encore : lancer `node elana/elana_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
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
  const { tax, rates, source: taxSource } = taxesFor(listing.isin, listing, market);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const rate = rateOf(rule, picked, listing);
  const min = minOf(rule, picked);

  const shared = {
    ...answer,
    cashCurrency: listing.currency,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: remarkOf(listing.currency),
  };

  const basis =
    `barème Elana Global Trader ${picked.label}, palier ${market}, page du ${SCHEDULE.revised} relue le ${SCHEDULE.readOn}` +
    (rule.kind === "perShare"
      ? ` : ${rate} $/share, plancher ${min} $`
      : rule.kind === "flat"
        ? ` : ${rate} $ sous ${rule.above} $`
        : ` : ${(rate * 100).toFixed(2)} %, plancher ${min} ${rule.minCcy}`);

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        picked,
        market,
        rule,
        rate,
        min,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        taxPct,
        taxSource,
      }),
    };
  }

  const notional = n * p;
  const notionalUsd = toUsd(notional, listing.currency);
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buy = commissionSide({
    amount: notional,
    shares: n,
    market,
    plan: picked,
    listing,
  });
  const sell = commissionSide({
    amount: notional,
    shares: n,
    market,
    plan: picked,
    listing,
  });
  const buyUsd = buy ? dollars(buy.charged, buy.currency) : null;
  const sellUsd = sell ? dollars(sell.charged, sell.currency) : null;
  const brokerFees = plus(buyUsd, sellUsd);

  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const tafUsd = american ? Math.min(TAF_CAP, TAF_PER_SHARE * n) : 0;
  const levy = levyEach({ listing, notional, currency: listing.currency });
  const itpUsd = levy.itp == null ? null : dollars((levy.itp || 0) * 2, levy.itpCcy || "EUR") ?? 0;
  const ptmUsd = levy.ptm == null ? null : dollars((levy.ptm || 0) * 2, levy.ptmCcy || "GBP") ?? 0;

  const usd = plus(bookUsd, brokerFees, taxUsd, secUsd, tafUsd, itpUsd, ptmUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why:
            `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ` +
            `${m.unsourced?.why || "pas de source de spread"}`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    buy: {
      commission: finite(buyUsd, 6),
      native: buy ? { ...buy, charged: finite(buy.charged, 6), raw: finite(buy.raw, 6) } : null,
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
    },
    sell: {
      commission: finite(sellUsd, 6),
      native: sell ? { ...sell, charged: finite(sell.charged, 6), raw: finite(sell.raw, 6) } : null,
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
      réglementaire: finite(plus(secUsd, tafUsd, itpUsd, ptmUsd), 6),
    },
    levy: { itp: levy.itp, ptm: levy.ptm },
    commission: {
      kind: rule.kind,
      rate: rule.kind === "pct" ? rate : null,
      perShare: rule.kind === "perShare" ? rate : null,
      min,
      currency: rule.minCcy,
      eachWay: true,
      plan: picked.id,
    },
    basis,
    confidence: confidenceOf({
      picked,
      market,
      rule,
      rate,
      min,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      taxSource,
      buy,
      n,
      american,
      levy,
    }),
  };
}

function confidenceOf({
  picked,
  market,
  rule,
  rate,
  min,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  taxSource,
  buy,
  n,
  american,
  levy,
}) {
  const said = [];
  said.push(
    `Elana Global Trader ${picked.label}, palier ${market}, page du ${SCHEDULE.revised} relue le ${SCHEDULE.readOn} ` +
      `(inchangée depuis le ${SCHEDULE.previouslyRead})`
  );
  if (rule.kind === "flat") {
    said.push(
      buy?.kind === "pct"
        ? `OTC au-delà de ${rule.above} $ : ${((picked.id === "vip" ? rule.aboveVip : rule.aboveStandard) * 100).toFixed(2)} % par sens`
        : `OTC ${rate} $ par sens sous ${rule.above} $`
    );
  } else if (rule.kind === "perShare") {
    said.push(
      buy?.floored
        ? `le plancher mord : ${Number(buy.raw.toPrecision(3))} $ calculés, ${min} $ facturés par sens`
        : `courtage ${rate} $/share` + (buy ? `, ${Number(buy.charged.toPrecision(4))} $ par sens` : "")
    );
  } else {
    said.push(
      buy?.floored
        ? `le plancher mord : ${Number(buy.raw.toPrecision(3))} ${rule.minCcy} calculés, ${min} ${rule.minCcy} facturés par sens`
        : `courtage ${(rate * 100).toFixed(2)} % par sens` +
          (buy ? `, ${Number(buy.charged.toPrecision(4))} ${rule.minCcy}` : "")
    );
  }
  if (taxPct) {
    said.push(
      taxSource === "elana"
        ? `taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant — timbre ${issuerCc(listing.isin) || market} qu'Elana imprime (cet ISIN n'est pas dans taxMap.mjs)`
        : `taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant, depuis taxMap.mjs`
    );
  }
  if (levy?.itp) said.push(`ITP ${ITP.each} € par sens, le montant dépasse ${ITP.above} €`);
  if (levy?.ptm) {
    said.push(
      `PTM ${PTM.each} £ par sens, le montant dépasse ${PTM.above} £ (Elana imprime 1 £ — le prélèvement statutaire est 1,50 £)`
    );
  }
  if (american) {
    said.push(
      `vente américaine : SEC ${SEC_RATE} du montant et TAF FINRA ${TAF_PER_SHARE} $ la part (plafond ${TAF_CAP} $), ` +
        `pas le 27,8 $ / million imprimé`
    );
  }
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part, moyenne 100–499 parts`);
  else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    `hors total : change spot ± 0,5 % si le sous-compte n'est pas dans la devise, garde 0,1 % / an, ` +
      `BG Trader / téléphone / algo pre-market. Aucun aller-retour réel dans ce dépôt`
  );
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
          ptm: PTM,
          itp: ITP,
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
        "  ex.   node elana_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node elana_cost.mjs VWCE XETR EUR --shares=1 --price=140\n" +
        "        node elana_cost.mjs SHEL LSE GBP --shares=500 --price=28\n" +
        "        node elana_cost.mjs 00700 HKEX HKD --shares=10 --price=400"
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
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce qu'Elana propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${picked?.label || out.plan}]\n`
  );

  if (out.trade?.notional != null) {
    const t = out.trade;
    console.log(
      `${t.shares ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` : ""}` +
        `${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
    );
    console.log();
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
