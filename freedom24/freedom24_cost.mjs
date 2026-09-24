// What one round trip costs at Freedom24: buy n shares at price p, sell them
// back at once (online, exchange-traded stock / ETF / ETC / ETN), in dollars.
//
// The affine triple hid the tickets and two cliffs. Smart's 2 + 0.02 / share
// lived in `c` and `b`, which the page no longer reads, so every AAPL trip
// was missing 4.40 in the plan currency. All-inclusive's 1.20 ticket sat in
// `c` the same way. CIS Smart's 0.20 minimum lived in `floor`, and Promo's
// 0.012 € / share under 1 € lived in `threshold`. `roundTrip` is given the
// size and charges what is charged.
//
// Freedom Finance Europe Ltd (CY), Appendix 6 effective 19 Aug 2026, re-read
// 2026-09-16 — unchanged since the 10th. Default is Smart (self-directed, no
// monthly). All-inclusive (`--plan=allinc`) is the plan they assign when
// Promo expires. Exclusive is request-only (`--plan=exclusive`). Promo in
// EUR (`--plan=promo`) was assigned to FR / IT / RO / CZ accounts opened
// 1 Mar–31 Aug 2026; it is not selectable and is closed to new accounts.
// Fix / Super / Prime are legacy. Auto Invest (0), IPO, options, futures,
// the stock-store card surcharge (0.12 %) and E-Account OTC are not this
// trip. Catalogue 13 180 lines — 7 056 stocks, 6 048 ETFs, 39 ETC, 37 ETN.
// No CIS or Middle-East board in this book; the printed lines stay in the
// file and wait.
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
// the debit. OTC 30 and the CIS 0.20 stay in the plan currency (the card
// prints 30 USD / 30 EUR). A fee under one cent is rounded
// mathematically; under half a cent it is 0.
//
// What is in the number: the printed % / share / ticket at its floor,
// each way, including Promo's penny line and CIS Smart's 0.20; stamp /
// FTT from the tax map, never invented; the market spread, once.
//
// What is not: SEC / TAF (absent from the card); PTM / ITP (not printed);
// a conversion markup (cash can sit in EUR or USD, no % is printed);
// custody 0 on the trading account; withdrawal at the platform rate
// (plancher 2 $ / €, otherwise unpublished); the 0.12 % stock-store card
// surcharge. Monthly is free on every current plan.
//
//   https://freedom24.com/download/documents/1203/Appendix_6_Fee_Schedule_19082026
//
//   node freedom24/freedom24_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node freedom24/freedom24_cost.mjs VWCE XETRA EUR --shares=10 --price=140
//   node freedom24/freedom24_cost.mjs 0001 HKEX HKD --shares=10 --price=50
//   node freedom24/freedom24_cost.mjs AAPL NASDAQ USD --plan=allinc --shares=10 --price=230
//   node freedom24/freedom24_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("freedom24-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://freedom24.com/download/documents/1203/Appendix_6_Fee_Schedule_19082026",
  readOn: "2026-09-16",
  previouslyRead: "2026-09-10",
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

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
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
const WITHDRAW_MIN = 2;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const toCent = (x) => (x == null || Number.isNaN(x) ? null : Math.round(x * 100 + Number.EPSILON) / 100);

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
  const ccy = String(row?.currency || "").toUpperCase();
  if (type === "CRYPTO" || code === "CRYPTO" || code === "CRPT") return null;
  if (type === "BND" || type === "BOND") return "bond";
  if (code === "OTC" || /^(OTC|PINK|OTCMKTS|GREY)/.test(code)) return "otc";
  if (m === "XHKG" || code === "HKEX" || code === "SEHK") return "asia";
  if (m === "XSHG" || m === "XSHE" || ccy === "CNY" || ccy === "CNH") return "asia";
  if (["XDFM", "XADS", "DIFX"].includes(m) || /^(DFM|ADX|DIFX|NASDAQDUBAI)$/.test(code)) {
    return "me";
  }
  if (/^(KASE|AIX|MOEX|MISX|AIXKZ)$/.test(code)) return "cis";
  if (US_MICS.has(m) || EU_MICS.has(m) || USEU_CODES.test(code)) return "useu";
  if (ccy === "USD") return "useu";
  return null;
}

function billedCcy(plan, listingCcy) {
  const ccy = String(listingCcy || "").toUpperCase();
  return ccy && ccy !== plan.ccy ? ccy : plan.ccy;
}

function asiaTicketCcy(listingCcy) {
  return String(listingCcy || "").toUpperCase() === "CNY" || String(listingCcy || "").toUpperCase() === "CNH"
    ? "CNY"
    : "HKD";
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

function remarkOf({ plan, market } = {}) {
  const lines = [];
  if (plan.family === "promo" && market === "useu") {
    lines.push(`Promo: 0.012 €/share if the print is under ${PROMO_BELOW} €.`);
  }
  if (plan.family === "exclusive") lines.push("Exclusive on request.");
  return lines.join("\n");
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantUnsourced = resolved.unsourced || null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rowsNamed(rows, asked, 
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

function pennyApplies(price, listingCcy) {
  if (price == null || !Number.isFinite(Number(price))) return false;
  const px = toUsd(Number(price), listingCcy);
  const oneEur = toUsd(PROMO_BELOW, "EUR");
  return px != null && oneEur != null && px < oneEur;
}

/**
 * One side, in dollars. The printed ticket / share / % are converted after
 * the debit when the trade currency is not the plan's (note 1).
 */
export function commissionSide({ amount, shares, price, market, listingCcy, plan = DEFAULT_PLAN } = {}) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  const rule = ruleOf(picked, market, listingCcy);
  if (!picked || !rule) return null;
  const n = shares == null ? null : Number(shares);
  const notional = amount == null ? null : Number(amount);
  if (rule.perShare && (n == null || !Number.isFinite(n))) return null;
  if ((rule.pct || rule.min != null) && (notional == null || !Number.isFinite(notional))) return null;

  const shareCcy = rule.shareCcy || rule.ticketCcy || picked.ccy;
  const ticketCcy = rule.ticketCcy || picked.ccy;
  const shareUsd = rule.perShare ? dollars(rule.perShare * n, shareCcy) : 0;
  const ticketUsd = rule.ticket ? dollars(rule.ticket, ticketCcy) : 0;
  const pctUsd = rule.pct ? dollars(notional * rule.pct, listingCcy) : 0;
  const addPenny = rule.penny && pennyApplies(price, listingCcy);
  const pennyUsd = addPenny ? dollars(rule.penny * n, rule.pennyCcy) : 0;
  if (shareUsd == null || ticketUsd == null || pctUsd == null || pennyUsd == null) return null;

  let charged = pctUsd + shareUsd + ticketUsd + pennyUsd;
  const floorUsd = rule.min != null ? dollars(rule.min, rule.minCcy) : null;
  if (floorUsd == null && rule.min != null) return null;
  const floored = floorUsd != null && charged < floorUsd;
  if (floored) charged = floorUsd;
  return {
    charged: toCent(charged),
    raw: charged,
    floored,
    penny: addPenny,
    currency: QUOTE,
    ticketCcy,
    shareCcy,
  };
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `brokerFees` is the Freedom24 ticket.
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
    cashCurrency: picked?.ccy ?? null,
    plan: picked?.id ?? plan,
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

  const { named, matches } = findListing({ etf, place, currency });
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
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: remarkOf({ plan: picked, market }),
  };

  const basis = `barème Freedom24 ${picked.label}, palier ${market}, du ${SCHEDULE.effective} relu le ${SCHEDULE.readOn}`;

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({ picked, market, rule, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct }),
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
    price: p,
    market,
    listingCcy: listing.currency,
    plan: picked,
  });
  const sell = commissionSide({
    amount: notional,
    shares: n,
    price: p,
    market,
    listingCcy: listing.currency,
    plan: picked,
  });
  const buyUsd = buy?.charged ?? null;
  const sellUsd = sell?.charged ?? null;
  const brokerFees = plus(buyUsd, sellUsd);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, taxUsd);

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
      native: buy,
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
    },
    sell: {
      commission: finite(sellUsd, 6),
      native: sell,
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
    commission: {
      kind: rule.pct ? "pct" : rule.perShare ? "perShare" : "flat",
      rate: rule.pct || null,
      perShare: rule.perShare || null,
      ticket: rule.ticket || null,
      currency: rule.ticketCcy || rule.shareCcy || picked.ccy,
      eachWay: true,
      plan: picked.id,
    },
    basis,
    confidence: confidenceOf({
      picked,
      market,
      rule,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      buy,
    }),
  };
}

function confidenceOf({
  picked,
  market,
  rule,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  buy,
}) {
  const said = [];
  said.push(
    `Freedom24 ${picked.label}, palier ${market}, barème du ${SCHEDULE.effective} relu le ${SCHEDULE.readOn} ` +
      `(inchangé depuis le ${SCHEDULE.previouslyRead})`
  );
  if (picked.family === "promo") {
    said.push(
      buy?.penny
        ? `Promo : cours sous ${PROMO_BELOW} €, ${PROMO_PENNY} €/share par jambe`
        : `Promo 0 € par jambe (le ${PROMO_PENNY} €/share ne mord que sous ${PROMO_BELOW} €)`
    );
  } else if (rule.pct) {
    said.push(
      `courtage ${(rule.pct * 100).toFixed(2)} %` +
        (rule.perShare ? ` + ${rule.perShare} ${rule.shareCcy || ""}/share` : "") +
        (rule.ticket ? ` + ${rule.ticket} ${rule.ticketCcy}` : "") +
        ` par jambe`
    );
  } else if (rule.perShare) {
    said.push(`courtage ${rule.perShare} ${rule.shareCcy}/share + ticket ${rule.ticket} ${rule.ticketCcy} par jambe`);
  }
  if (buy?.floored) said.push(`le plancher mord : ${rule.min} ${rule.minCcy} par jambe`);
  if (taxPct) said.push(`taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant, depuis taxMap.mjs`);
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) {
    said.push(`carnet Rule 605, ${marketPerShare} $ la part, moyenne 100–499 parts`);
  } else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    `hors total : SEC / TAF et PTM / ITP (absents du barème), change sans % imprimé (EUR / USD au choix), ` +
      `garde 0 sur le compte de trading, retrait au tarif de la plateforme (plancher ${WITHDRAW_MIN} $ / €), ` +
      `surcharge stock-store 0,12 % hors de ce trajet. Note 1 : ticket / share dans la devise de négociation ` +
      `si elle n'est pas celle du plan. Arrondi au centime sous 1 ¢, à 0 sous 0,5 ¢. ` +
      `Aucun aller-retour réel dans ce dépôt`
  );
  if (leaf == null && market === "useu") said.push(`pas de feuille de carnet pour ${listing.isin}`);
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
          promo: { penny: PROMO_PENNY, below: PROMO_BELOW, belowCcy: "EUR" },
          withdrawMin: WITHDRAW_MIN,
          sec: null,
          taf: null,
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
        "  ex.   node freedom24_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node freedom24_cost.mjs VWCE XETRA EUR --shares=10 --price=140\n" +
        "        node freedom24_cost.mjs 0001 HKEX HKD --shares=10 --price=50\n" +
        "        node freedom24_cost.mjs AAPL NASDAQ USD --plan=allinc --shares=10 --price=230"
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
      console.log(`\nce que Freedom24 propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.query || l.isin} — ${l.name || ""}`);
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
