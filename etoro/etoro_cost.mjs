// What one round trip costs at eToro Global: buy n shares at price p (or
// put `amount` into a coin), sell them back at once, online, real stock /
// ETF / coin, non-club, in dollars.
//
// The affine triple hid the cliffs. The $1 / $2 stock ticket lived in `c`,
// which the page no longer reads, so every AAPL trip was missing 2 $. The
// US CFD penny line (0.02 $/share at or under 3 $) sat in `threshold` the
// same way. Crypto's 1 % was in `a`, which the front also stopped adding.
// `roundTrip` is given the size and charges what is charged.
//
// eToro (Europe) Ltd / eToro (UK) Ltd, fees page re-read 2026-09-15 —
// unchanged since the 10th. Default is the country-picker majority: $2 on
// Australia / Hong Kong / Dubai / Abu Dhabi / Tokyo, $1 on every other
// stock exchange, each way. Australia and New Zealand are $2 everywhere
// (`--plan=anz`). The United Kingdom, Ireland and the countries that are
// not in the picker pay $0 (`--plan=uk`). Club, CopyTrader, Smart
// Portfolios, recurring buys, Stock Margin (0.15 %) and futures are not
// this trip. `--plan=us` is only the Global ETF CFD book sold as a real
// ETF at eToro USA LLC ($0; they pay SEC / TAF). `--plan=anz` does the
// same for a x1 BUY in Australia: the PDS puts that line in the eToro
// Service (custodied ETF), not a CFD. UK / Ireland keep the PRIIPs CFD
// on US-domiciled names. Stocks, coins and the real UCITS shelf stay on
// the Global plans. Catalogue 10 148 lines —
// 8 800 stocks, 1 176 ETFs, 163 coins, 1 124 of them the CFD book.
//
//   stocks (real)   $1 or $2 each way, in USD regardless of the listing
//   ETF / ETC / ETN $0  (the page names ETFs; ETC share the invest book)
//   CFD stock/ETF   0.15 % each way, no ticket; US ≤ $3 is 0.02 $/share
//   crypto          1 % each way (Bronze / Silver / Gold, $0–$10 k)
//                   real coins only; LUNC adds 0.10 % on the bid / ask
//
// They print "no additional broker fees" / no markup on the market spread
// of a real stock, so SEC / TAF stay out. Stamp / FTT from the tax map;
// else their printed UK 0.50 % on a real London STOCK, never on a CFD.
// Irish stamp, PTM and ITP are not printed. Cash sits in USD and, where
// offered, GBP / EUR / AUD / DKK; conversion is 0.75 % (local ↔ USD) only
// if the wallet is the wrong currency, so FX stays out of the total.
// Custody 0, inactivity 0. Withdraw $5 from a USD account (free from a
// local one).
//
//   https://www.etoro.com/trading/fees/
//   https://www.etoro.com/trading/fees/conversion/
//   https://www.etoro.com/en-us/trading/fees/
//
//   node etoro/etoro_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node etoro/etoro_cost.mjs VUSA EURONEXT EUR --shares=10 --price=100
//   node etoro/etoro_cost.mjs 0700 HKEX HKD --shares=10 --price=400
//   node etoro/etoro_cost.mjs AAL LSE GBX --shares=10 --price=2800
//   node etoro/etoro_cost.mjs BTC --amount=1000
//   node etoro/etoro_cost.mjs AAPL NASDAQ USD --plan=uk --shares=10 --price=230
//   node etoro/etoro_cost.mjs SPY AMEX USD --plan=us --shares=10 --price=580
//   node etoro/etoro_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("etoro-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.etoro.com/trading/fees/",
  conversion: "https://www.etoro.com/trading/fees/conversion/",
  us: "https://www.etoro.com/en-us/trading/fees/",
  examples:
    "https://www.etoro.com/wp-content/uploads/2025/07/Cost-and-Charges-examples-table-Crypto-Fees-in-May-2025.pdf",
  readOn: "2026-09-15",
  previouslyRead: "2026-09-10",
  entity: "eToro (Europe) Ltd / eToro (UK) Ltd",
  usEntity: "eToro USA LLC",
};

const DEFAULT_PLAN = "standard";
const PLANS = {
  standard: { id: "standard", label: "Standard", asiaMe: 2, other: 1 },
  anz: { id: "anz", label: "Australia / New Zealand", asiaMe: 2, other: 2 },
  uk: { id: "uk", label: "UK / Ireland", asiaMe: 0, other: 0 },
  us: { id: "us", label: "US", asiaMe: 0, other: 0 },
};
const PLAN_ALIAS = {
  standard: "standard",
  default: "standard",
  retail: "standard",
  eea: "standard",
  eu: "standard",
  anz: "anz",
  au: "anz",
  australia: "anz",
  nz: "anz",
  uk: "uk",
  ie: "uk",
  ireland: "uk",
  free: "uk",
  zero: "uk",
  us: "us",
  usa: "us",
  etorous: "us",
};

const CRYPTO_EACH = 0.01;
const LUNC_EXTRA = 0.001;
const CFD_EACH = 0.0015;
const CFD_PENNY_EACH = 0.02;
const CFD_PENNY_BELOW = 3;
const UK_STAMP = 0.005;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const ASIA_ME = new Set(["ASX", "HKEX", "DFM", "ADX", "TSE"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isTracker = (type) => /^(ETF|ETC|ETN)$/i.test(type || "");
const isStock = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";
const isLunc = (row) => /LUNC/.test(loose(row?.ticker || row?.query));

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

function isUsListed(row, mic) {
  return US_MICS.has(String(mic || "").toUpperCase()) || /^(NASDAQ|NYSE|AMEX|CBOE|ARCA|NYSEARCA)$/.test(loose(row?.exchange));
}

export function isUsEtfCfd(row, mic) {
  return Boolean(row?.cfd) && isTracker(row?.type) && isUsListed(row, mic);
}

export function feeMarketOf(row, mic, plan) {
  const type = String(row?.type || "").toUpperCase();
  const code = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (type === "CRYPTO" || code === "CRYPTO") return "crypto";
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (picked?.id === "us") return isUsEtfCfd(row, mic) ? "etf" : null;
  if (picked?.id === "anz" && isUsEtfCfd(row, mic)) return "etf";
  if (row?.cfd) return "cfd";
  if (isTracker(type)) return "etf";
  if (ASIA_ME.has(code) || ASIA_ME.has(m)) return "asiaMe";
  return "other";
}

export function ticketEach(plan, market) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked) return null;
  if (market === "asiaMe") return picked.asiaMe;
  if (market === "other") return picked.other;
  return 0;
}

function remarkOf({ market, plan, currency } = {}) {
  const lines = [];
  if (plan?.id === "us") return "";
  if (market === "asiaMe" || market === "other") {
    if (plan?.id === "uk") lines.push("UK / Ireland: no stock ticket.");
    if (plan?.id === "anz") lines.push("Australia / New Zealand: $2 every stock exchange.");
  }
  if (market !== "crypto") lines.push(fxRemark("0.75", currency));
  return lines.join("\n");
}

/**
 * Stamp from the tax map when Trading212 swept the ISIN. A real London
 * share it never asked about still pays the 0.50 % eToro prints. A CFD
 * does not: they pass SDRT on UK-listed stocks, not on the derivative.
 */
export function taxesFor(isin, listing, market) {
  const tax = taxesOf(isin);
  if (market === "crypto" || market === "cfd" || listing?.cfd) {
    return { tax, rates: {}, source: null };
  }
  const mapped = taxRates(tax);
  if (Object.keys(mapped).length) return { tax, rates: mapped, source: "taxMap" };
  const london = listing.mic === "XLON" || /^(LSE|LONDON)/i.test(listing.brokerExchange || listing.exchange || "");
  if (isStock(listing) && london) return { tax, rates: { stamp: UK_STAMP }, source: "etoro" };
  return { tax, rates: {}, source: null };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantUnsourced = resolved.unsourced || null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter(
    (r) =>
      !(String(r.type || "").toUpperCase() === "CRYPTO" && r.cfd) &&
      (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked)
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

/**
 * One side, in dollars. Stocks are a flat ticket; crypto / CFD a % of the
 * USD notional; US CFDs at or under 3 $ switch to 0.02 $/share.
 */
export function commissionSide({
  market,
  plan = DEFAULT_PLAN,
  amountUsd,
  shares,
  priceUsd,
  row,
}) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked || !market) return null;

  if (market === "crypto") {
    if (amountUsd == null || !Number.isFinite(Number(amountUsd))) return null;
    const extra = isLunc(row) ? LUNC_EXTRA : 0;
    const rate = CRYPTO_EACH + extra;
    const charged = Number(amountUsd) * rate;
    return { charged, raw: charged, rate, extra, currency: "USD", kind: "pct" };
  }

  if (market === "cfd") {
    const american = US_MICS.has(String(row?._mic || "")) || /^(NASDAQ|NYSE|AMEX|CBOE)$/.test(loose(row?.exchange));
    const penny = american && priceUsd != null && Number(priceUsd) <= CFD_PENNY_BELOW;
    if (penny) {
      if (shares == null || !Number.isFinite(Number(shares))) return null;
      const charged = Number(shares) * CFD_PENNY_EACH;
      return {
        charged,
        raw: charged,
        rate: CFD_PENNY_EACH,
        currency: "USD",
        kind: "perShare",
        penny: true,
      };
    }
    if (amountUsd == null || !Number.isFinite(Number(amountUsd))) return null;
    const charged = Number(amountUsd) * CFD_EACH;
    return { charged, raw: charged, rate: CFD_EACH, currency: "USD", kind: "pct" };
  }

  const ticket = ticketEach(picked, market);
  if (ticket == null) return null;
  return { charged: ticket, raw: ticket, rate: null, currency: "USD", kind: "flat", ticket };
}

/**
 * The whole bill for buying `shares` at `price` (or putting `amount` into a
 * coin) and selling them straight back. `brokerFees` is the eToro ticket or
 * the 1 % / 0.15 %, not stamp.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  amount,
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
    cashCurrency: "USD",
    plan: picked?.id ?? plan,
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (standard|anz|uk|us)` };
  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue eToro n'existe pas encore : lancer `node etoro/etoro_scraping.mjs`",
    };
  }

  let { named, matches } = findListing({ etf, place, currency });
  if (amount != null && matches.length > 1) {
    const coins = matches.filter((hit) => feeMarketOf(hit.row) === "crypto");
    if (coins.length) matches = coins;
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue eToro` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez eToro`,
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
    currency: String(m.row.currency || "").toUpperCase() || (String(m.row.type || "").toUpperCase() === "CRYPTO" ? "USD" : ""),
    brokerExchange: m.row.exchange || null,
    query: m.row.query || null,
    cfd: picked.id !== "us" && !(picked.id === "anz" && isUsEtfCfd(m.row, book.mic ?? m.venue?.mic)) && Boolean(m.row.cfd),
  };

  const market = feeMarketOf(m.row, listing.mic, picked);
  if (!market) {
    return {
      ...answer,
      listing,
      onlineBuy: false,
      why:
        picked.id === "us"
          ? "eToro US ne vend en réel que les ETF que le Global vend en CFD"
          : `${etf} n'a pas de palier chez eToro`,
    };
  }
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const { tax, rates, source: taxSource } = taxesFor(listing.isin, listing, market);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const ticket = ticketEach(picked, market);
  const crypto = market === "crypto";
  const row = { ...m.row, _mic: listing.mic };

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? (picked.id === "us" ? SCHEDULE.us : SCHEDULE.source),
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: remarkOf({ market, plan: picked, currency: listing.currency }),
  };

  const basis =
    `barème eToro ${picked.label}, palier ${market}, page relue le ${SCHEDULE.readOn}` +
    (crypto
      ? ` : ${(CRYPTO_EACH * 100).toFixed(0)} %` + (isLunc(m.row) ? ` + ${(LUNC_EXTRA * 100).toFixed(1)} % LUNC` : "")
      : market === "cfd"
        ? ` : ${(CFD_EACH * 100).toFixed(2)} % (penny ${CFD_PENNY_EACH} $/share ≤ ${CFD_PENNY_BELOW} $)`
        : market === "etf"
          ? " : 0 $ (ETF)"
          : ` : ${ticket} $ par sens`);

  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  const notional = n > 0 && p > 0 ? n * p : crypto && cash > 0 ? cash : null;

  if (notional == null) {
    return {
      ...shared,
      basis,
      why: crypto
        ? "aucun montant pour cette ligne"
        : !(n > 0)
          ? "aucun nombre de parts"
          : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        picked,
        market,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        taxPct,
        taxSource,
        ticket,
      }),
    };
  }

  const notionalUsd = toUsd(notional, listing.currency || "USD");
  const priceUsd = n > 0 && p > 0 ? toUsd(p, listing.currency) : null;
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null && n > 0
        ? marketPerShare * n
        : crypto
          ? 0
          : null;

  const buy = commissionSide({
    market,
    plan: picked,
    amountUsd: notionalUsd,
    shares: n > 0 ? n : null,
    priceUsd,
    row,
  });
  const sell = commissionSide({
    market,
    plan: picked,
    amountUsd: notionalUsd,
    shares: n > 0 ? n : null,
    priceUsd,
    row,
  });
  const buyUsd = buy ? dollars(buy.charged, buy.currency) : null;
  const sellUsd = sell ? dollars(sell.charged, sell.currency) : null;
  const brokerFees = plus(buyUsd, sellUsd);
  const taxUsd = crypto ? 0 : notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null && !crypto
      ? {
          why:
            `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ` +
            `${m.unsourced?.why || "pas de source de spread"}`,
        }
      : {}),
    trade: {
      shares: n > 0 ? n : null,
      price: p > 0 ? p : null,
      amount: crypto && cash > 0 ? cash : null,
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
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
    },
    commission: {
      kind: buy?.kind || (ticket ? "flat" : "pct"),
      rate: buy?.rate ?? null,
      ticket: ticket || null,
      currency: "USD",
      eachWay: true,
      plan: picked.id,
      penny: Boolean(buy?.penny),
    },
    basis,
    confidence: confidenceOf({
      picked,
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      taxSource,
      ticket,
      buy,
    }),
  };
}

function confidenceOf({
  picked,
  market,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  taxSource,
  ticket,
  buy,
}) {
  const said = [];
  said.push(
    picked.id === "us"
      ? `eToro US, ETF réel, page relue le ${SCHEDULE.readOn}`
      : `eToro ${picked.label}, palier ${market}, page relue le ${SCHEDULE.readOn} ` +
          `(inchangée depuis le ${SCHEDULE.previouslyRead})`
  );
  if (market === "crypto") {
    said.push(
      `crypto ${(CRYPTO_EACH * 100).toFixed(0)} % par sens (Bronze / Silver / Gold, 0–10 k$)` +
        (buy?.extra ? `, + ${(buy.extra * 100).toFixed(1)} % LUNC sur le bid / ask` : "")
    );
  } else if (market === "cfd") {
    said.push(
      buy?.penny
        ? `CFD US ≤ ${CFD_PENNY_BELOW} $ : ${CFD_PENNY_EACH} $/share par sens à la place de ${CFD_EACH * 100} %`
        : `CFD ${CFD_EACH * 100} % par sens, pas de ticket`
    );
  } else if (market === "etf") {
    said.push(`ETF / ETC / ETN : 0 $ de commission`);
  } else {
    said.push(ticket ? `ticket ${ticket} $ par sens (en USD, quelle que soit la cotation)` : `pas de ticket`);
  }
  if (taxPct) {
    said.push(
      taxSource === "etoro"
        ? `taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant — SDRT 0,50 % qu'eToro imprime (cet ISIN n'est pas dans taxMap.mjs)`
        : `taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant, depuis taxMap.mjs`
    );
  }
  if (picked.id === "us") {
    said.push("SEC / TAF hors total : eToro US les règle à la vente");
  } else if (market !== "crypto" && market !== "cfd") {
    said.push(`SEC / TAF hors total (« no additional broker fees » sur une action réelle)`);
  }
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part, moyenne 100–499 parts`);
  else if (market !== "crypto") {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    picked.id === "us"
      ? "hors total : Club, Copy, options. Aucun aller-retour réel dans ce dépôt"
      : `hors total : change 0,75 % si le portefeuille n'est pas dans la devise, ` +
          `retrait 5 $ depuis un compte USD (gratuit en devise locale), Club, Copy, Smart Portfolios, ` +
          `Stock Margin, overnight CFD. Aucun aller-retour réel dans ce dépôt`
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
          crypto: CRYPTO_EACH,
          luncExtra: LUNC_EXTRA,
          cfd: CFD_EACH,
          cfdPenny: { each: CFD_PENNY_EACH, below: CFD_PENNY_BELOW },
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
      "usage : node etoro_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=usd] [--plan=standard|anz|uk|us] [--json]\n" +
        "        node etoro_cost.mjs --schedule\n" +
        "  ex.   node etoro_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node etoro_cost.mjs VUSA EURONEXT EUR --shares=10 --price=100\n" +
        "        node etoro_cost.mjs BTC --amount=1000\n" +
        "        node etoro_cost.mjs AAPL NASDAQ USD --plan=uk --shares=10 --price=230\n" +
        "        node etoro_cost.mjs SPY AMEX USD --plan=us --shares=10 --price=580"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : null,
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
      console.log(`\nce qu'eToro propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.query || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `${l.cfd ? ", CFD" : ""}  [${picked?.label || out.plan}]\n`
  );

  if (out.trade?.notional != null) {
    const t = out.trade;
    console.log(
      (t.amount != null
        ? `${t.amount} ${t.currency}`
        : t.shares
          ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}`
          : "") + (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
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
