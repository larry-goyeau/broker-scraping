// What one round trip costs at Just2Trade (J2T Services Ltd, Cyprus, CySEC
// 281/15), MT5 Global account: buy n shares at price p, sell them back at
// once, online, in dollars. Shares, ETFs, ETCs and ETNs of the MT5 Global
// list (just2trade-parsed.json). CFDs, forwards, futures, options and bonds
// are other lines of the same table.
//
// Read on 2026-10-20:
//   https://j2t.com/en/solutions/mt5global/terms/          (Pricing, EN)
//   https://j2t.com/ru/solutions/mt5global/terms/          (same table, RU)
//   https://j2t.com/pl/solutions/mt5global/terms/          (same table, PL)
//   https://j2t.com/en/solutions/mma/                      (US access)
//   https://j2t.com/solutions/mt5global/deposit/
//   https://j2t.com/solutions/mt5global/withdrawal/
//   https://j2t.com/files/j2t/docs/Trading%20Regulations_MT5_Global_eng.pdf        (version 27.08.2026)
//   https://j2t.com/files/j2t/regulatorydocs/Terms%20and%20Conditions%20for%20the%20Provision%20of%20Investment%20Services_eng.pdf (version 22.07.2026)
//   https://j2t.com/files/j2t/regulatorydocs/Brokerage%20Regulations_eng.pdf       (version 21.08.2026)
//   https://j2t.com/files/j2t/regulatorydocs/Execution%20Venues.pdf                (version 27.07.2026)
//
// Brokerage commission, per order, each way (Pricing table):
//   USA (NYSE/NASDAQ)          0.006 USD a share, min 1.5 USD
//   Canada (TSX)               0.06 CAD a share (no minimum printed)
//   Germany (TRADEGATE/XETRA)  0.14 %
//   France (EURONEXT)          0.15 %
//   UK (LSE), UK (LSE IOB)     0.14 %
//   Spain (BME)                0.15 %
//   Poland (GPW)               0.5 %, min 30 USD
//   Hong Kong (SEHK)           0.3 %, min 6 USD
//   Japan (TSE)                0.3 %, min 5 USD
//   Korea (KRX)                0.1 %, min 15 USD
//   Singapore (SGX)            0.3 %, min 8 USD
//   Thailand (SET)             0.5 %, min 37 USD
//   Mexico (BMV)               0.7 %, min 37 USD
// China (Shanghai, Shenzhen) and Switzerland (SIX) are sold in the list but
// are not in the table: no published commission, N/A. gettex takes the
// German line (J2T labels that list "GERMANY (TRADEGATE/GETTEX)"), TSX
// Venture the Canadian one and the US list's OTC / Texas lines the US one,
// since each comes from the same J2T market as the line that is priced.
//
// "Exchange and clearing fees" under the table:
//   USA       NSCC 0.000175 USD a share, min 0.01 USD an order (each side);
//             SEC 0.00278 % of the sale, min 0.01 USD, sales only. Both in
//             the number as printed. TAF and CAT are not printed: 0.
//   France 0.15 %, UK 0.5 %, Hong Kong 0.1377 %, Singapore 0.04 %,
//   Thailand 0.0063 %.
//             UK 0.5 % is stamp duty and Hong Kong 0.1377 % is the old
//             statutory sum (stamp 0.13 % + SFC 0.0027 % + trading fee
//             0.005 %): these lines are taxes, and taxes come from
//             taxMap.mjs (UK stamp, French FTT 0.4 %, Spanish FTT). France's
//             0.15 % matches no current Euronext fee and is read as the same
//             FTT line; it is not added on top. Hong Kong, which taxMap does
//             not cover, takes today's statutory charges each side: stamp
//             0.1 % rounded up to the next HKD (not on an ETF), trading fee
//             0.00565 %, SFC 0.0027 %, AFRC 0.00015 % (min 0.01 HKD each).
//             Korea's sale tax (0.2 % on a stock, 2026 rate) likewise when
//             taxMap is silent. Singapore 0.04 % and Thailand 0.0063 % are
//             the exchange's own trading + clearing fees: each side, in the
//             number. UK PTM is not printed: out.
//   The RU page adds clearing fees "включены в брокерскую комиссию"
//   (included in the commission): nothing more is charged for them.
//
// US routing: the MT5 Global page says "Access to the US stock market is
// provided by Lime Financial USA - FINRA member" (j2t.com/en/solutions/mma/,
// which is the MT5 Global page). Lime Trading Corp's 606 Q is applied via
// spreads/rule606.mjs (alias just2trade → lime).
//
// FX: the account is opened in USD or EUR (deposits.mjs). A line in either
// pays no conversion in the total; the remark says FX applies when cash
// differs. Any other currency is converted by force, and the T&C (§19) only
// say "currency conversion fees" at "the exchange rate quoted by the
// converting bank"; the Brokerage Regulations put the spread "in the Private
// Cabinet section of my account". No rate is public: the total is N/A.
//
// Not in this trip: pre/post-market 0.003 USD a share; voice orders 5 $/€;
// market data "Advanced" 1 $/month (free with one trade); maintenance 5 USD
// / 4 EUR a month after six months with no trade, deposit or withdrawal;
// dividend commission 3 % (min 3 USD) on UK, EU and Asian shares; USD bank
// deposit 0.3 %; withdrawals (USD 0.4 % min 80 $, EUR 25 €).
//
//   node brokers/just2trade/just2trade_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/just2trade/just2trade_cost.mjs SAP XETRA EUR --shares=10 --price=200
//   node brokers/just2trade/just2trade_cost.mjs 0700 HKEX HKD --shares=100 --price=500
//   node brokers/just2trade/just2trade_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "just2trade";
const CATALOGUE = new URL("just2trade-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://j2t.com/en/solutions/mt5global/terms/",
  usAccess: "https://j2t.com/en/solutions/mma/",
  regulations: "https://j2t.com/files/j2t/docs/Trading%20Regulations_MT5_Global_eng.pdf",
  terms:
    "https://j2t.com/files/j2t/regulatorydocs/Terms%20and%20Conditions%20for%20the%20Provision%20of%20Investment%20Services_eng.pdf",
  brokerage: "https://j2t.com/files/j2t/regulatorydocs/Brokerage%20Regulations_eng.pdf",
  withdrawal: "https://j2t.com/solutions/mt5global/withdrawal/",
  readOn: "2026-10-20",
  entity: "J2T Services Ltd (CY), MT5 Global",
};

// Per side. `rate` is a fraction of the amount, `perShare` in `perShareCcy`,
// `min` in `minCcy`; `levy` an exchange fee printed under the table, each side.
const MARKETS = {
  us: { label: "USA (NYSE/NASDAQ)", perShare: 0.006, perShareCcy: "USD", min: 1.5, minCcy: "USD" },
  ca: { label: "Canada (TSX)", perShare: 0.06, perShareCcy: "CAD" },
  de: { label: "Germany (TRADEGATE/XETRA)", rate: 0.0014 },
  fr: { label: "France (EURONEXT)", rate: 0.0015 },
  uk: { label: "UK (LSE)", rate: 0.0014 },
  es: { label: "Spain (BME)", rate: 0.0015 },
  pl: { label: "Poland (GPW)", rate: 0.005, min: 30, minCcy: "USD" },
  hk: { label: "Hong Kong (SEHK)", rate: 0.003, min: 6, minCcy: "USD" },
  jp: { label: "Japan (TSE)", rate: 0.003, min: 5, minCcy: "USD" },
  kr: { label: "Korea (KRX)", rate: 0.001, min: 15, minCcy: "USD" },
  sg: { label: "Singapore (SGX)", rate: 0.003, min: 8, minCcy: "USD", levy: 0.0004 },
  th: { label: "Thailand (SET)", rate: 0.005, min: 37, minCcy: "USD", levy: 0.000063 },
  mx: { label: "Mexico (BMV)", rate: 0.007, min: 37, minCcy: "USD" },
};

const MIC_MARKET = {
  XNAS: "us",
  XNYS: "us",
  ARCX: "us",
  XASE: "us",
  BATS: "us",
  IEXG: "us",
  MEMX: "us",
  TXSE: "us",
  OTCM: "us",
  XTSE: "ca",
  XTSX: "ca",
  XETR: "de",
  XGAT: "de",
  XMUN: "de",
  XFRA: "de",
  XPAR: "fr",
  XLON: "uk",
  XMAD: "es",
  XWAR: "pl",
  XHKG: "hk",
  XTKS: "jp",
  XKRX: "kr",
  XSES: "sg",
  XBKK: "th",
  XMEX: "mx",
};

// Sold in the list, absent from the table.
const UNPUBLISHED = {
  XSHG: "Chine (Shanghai) : vendue dans la liste MT5 Global mais absente de la grille tarifaire, aucun courtage publié",
  XSHE: "Chine (Shenzhen) : vendue dans la liste MT5 Global mais absente de la grille tarifaire, aucun courtage publié",
  XSWX: "Suisse (SIX) : vendue dans la liste MT5 Global mais absente de la grille tarifaire, aucun courtage publié",
};

const US_NSCC = { perShare: 0.000175, min: 0.01 };
const US_SEC = { rate: 0.0000278, min: 0.01 };
// Hong Kong statutory charges, each side, in HKD.
const HK_LEVY = { stamp: 0.001, trading: 0.0000565, sfc: 0.000027, afrc: 0.0000015, min: 0.01 };
// Korea: securities transaction tax + special tax for rural development on a
// stock sale, 2026 (also in brokers/ibkrca/ibkrca_cost.mjs).
const KR_SALE_TAX = 0.002;
const PRINTED_EXCHANGE_FEES = { fr: 0.0015, uk: 0.005, hk: 0.001377, sg: 0.0004, th: 0.000063 };
const MAINTENANCE = { usd: 5, eur: 4, afterMonths: 6 };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(10));
};

// Amount in `from` expressed in `to`, at the fx table. GBX is a hundredth of GBP.
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  if (code(from) === code(to)) return amount;
  const a = usdPer(from);
  const b = usdPer(to);
  return a == null || !(b > 0) ? null : (amount * a) / b;
}

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

export function feeMarketOf(row, mic) {
  const m = code(row?.mic) || code(mic);
  if (UNPUBLISHED[m]) return null;
  return MIC_MARKET[m] || MIC_MARKET[code(mic)] || null;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(
    rows,
    asked,
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace || loose(r.mic) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace || exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.query || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const { venue, unsourced } = listingKey(r);
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
      broker: FOLDER,
      ticker: r.ticker,
    });
    const market = feeMarketOf(r, book.mic ?? venue?.mic) || "?";
    const slot = (out[market] ||= { n: 0, withBook: 0, held: 0 });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    if (depositHas(FOLDER, null, listingCash(r.currency))) slot.held += 1;
  }
  return out;
}

/** One side's commission, in dollars. */
export function commissionSide({ shares, notional, currency, market }) {
  const rule = MARKETS[market];
  if (!rule) return null;
  let raw;
  if (rule.perShare != null) {
    if (!(Number(shares) > 0)) return null;
    raw = dollars(rule.perShare * Number(shares), rule.perShareCcy);
  } else {
    const amountUsd = dollars(notional, currency);
    raw = amountUsd == null ? null : amountUsd * rule.rate;
  }
  if (raw == null) return null;
  const floorUsd = rule.min != null ? dollars(rule.min, rule.minCcy) : 0;
  if (floorUsd == null) return null;
  const floored = raw < floorUsd;
  return { raw, charged: floored ? floorUsd : raw, floored, currency: QUOTE };
}

// Hong Kong statutory charges for one side, in HKD: stamp, and the
// exchange / regulator levies.
function hkSide(notionalHkd, { stamp }) {
  const { trading, sfc, afrc, min } = HK_LEVY;
  return {
    stamp: stamp ? Math.ceil(notionalHkd * HK_LEVY.stamp - 1e-6) : 0,
    levies: Math.max(min, notionalHkd * trading) + Math.max(min, notionalHkd * sfc) + Math.max(min, notionalHkd * afrc),
  };
}

// Taxes and pass-through levies of the round trip, in dollars, with what was said.
function leviesOf({ listing, market, notional, notionalUsd, n, tax }) {
  const said = [];
  const rates = taxRates(tax);
  const ratePct = Object.values(rates).reduce((s, r) => s + r, 0);
  let taxUsd = notionalUsd == null ? null : notionalUsd * ratePct;
  if (ratePct) said.push(`taxe à l'achat ${(100 * ratePct).toFixed(2)} % du montant (${Object.keys(rates).join(", ")}), depuis taxMap.mjs`);
  let exchangeUsd = 0;
  let regulatoryUsd = 0;
  const etf = listing.type !== "STOCK";

  if (market === "us") {
    const nscc = Math.max(US_NSCC.min, US_NSCC.perShare * n) * 2;
    const sec = notionalUsd == null ? null : Math.max(US_SEC.min, notionalUsd * US_SEC.rate);
    regulatoryUsd = plus(nscc, sec);
    said.push(
      `NSCC ${US_NSCC.perShare} $ la part (min ${US_NSCC.min} $) à chaque sens et SEC ${(100 * US_SEC.rate).toFixed(5)} % ` +
        `de la vente (min ${US_SEC.min} $), tels qu'imprimés sous la grille, TAF et CAT non imprimés : 0`
    );
  }
  if (market === "hk") {
    // taxMap reads Trading212, which has no Hong Kong book: a line it holds
    // for the ISIN is another listing's. The stamp is statutory unless the
    // map prints a rate.
    const notionalHkd = convert(notional, listing.currency, "HKD");
    const stamp = !etf && !ratePct;
    const side = notionalHkd == null ? null : hkSide(notionalHkd, { stamp });
    exchangeUsd = side == null ? null : dollars(side.levies * 2, "HKD");
    if (stamp) taxUsd = plus(taxUsd, side == null ? null : dollars(side.stamp * 2, "HKD"));
    said.push(
      `Hong Kong, charges légales à chaque sens : ${stamp ? "droit de timbre 0,1 % arrondi au HKD supérieur, " : etf ? "pas de timbre sur un ETF, " : "timbre depuis taxMap.mjs, "}` +
        `frais de bourse 0,00565 %, SFC 0,0027 %, AFRC 0,00015 % (min 0,01 HKD chacun), ` +
        `J2T imprime encore 0,1377 %, l'ancienne somme (timbre 0,13 %)`
    );
  }
  if (market === "kr" && !etf && !ratePct) {
    const sale = notionalUsd == null ? null : notionalUsd * KR_SALE_TAX;
    taxUsd = plus(taxUsd, sale);
    said.push(`Corée : taxe sur la vente d'actions ${(100 * KR_SALE_TAX).toFixed(2)} % (taux 2026), taxMap.mjs muet`);
  }
  const levy = MARKETS[market]?.levy;
  if (levy) {
    exchangeUsd = notionalUsd == null ? null : notionalUsd * levy * 2;
    said.push(`frais de bourse et de compensation imprimés par J2T : ${(100 * levy).toFixed(4)} % à chaque sens`);
  }
  if (market === "uk" || market === "fr") {
    said.push(
      `la ligne « ${market === "uk" ? "UK: 0.5%" : "France: 0.15%"} » sous la grille est la taxe (timbre / TTF) : ` +
        `taxMap.mjs fait foi, rien n'est ajouté par-dessus`
    );
  }
  if (market === "uk") said.push("PTM non imprimé par J2T : hors total");
  return { taxUsd, exchangeUsd, regulatoryUsd, rates, said };
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `brokerFees` is J2T's commission (and a
 * forced conversion, N/A as no rate is published).
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    plan: plan || "mt5global",
    url: SCHEDULE.source,
  };

  if (!catalogue) {
    return { ...answer, why: "le catalogue Just2Trade n'existe pas encore : lancer `node brokers/just2trade/just2trade_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Just2Trade` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Just2Trade`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: FOLDER,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
    query: m.row.query || null,
  };

  const market = feeMarketOf(m.row, listing.mic);
  const rule = MARKETS[market];
  const cash = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, cash);
  const fxWhy = held
    ? null
    : `change forcé ${cash} → USD/EUR : aucun taux publié (conditions §19 « currency conversion fees » au cours de la banque, écart affiché seulement dans le cabinet privé)`;

  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = listing.isin ? taxesOf(listing.isin) : null;

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: held ? cash : "",
    bp: marketBp,
    perShare: marketPerShare,
    via606: book.via606 ?? false,
    q: book.q ?? null,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: held ? fxRemark("", cash) : "",
    url: book.leaf?.url ?? SCHEDULE.source,
  };

  if (!rule) {
    return {
      ...shared,
      basis: `grille MT5 Global lue le ${SCHEDULE.readOn} (${SCHEDULE.source})`,
      why: [UNPUBLISHED[code(m.row.mic)] || UNPUBLISHED[code(listing.mic)] || `${listing.exchange} : aucun palier publié dans la grille MT5 Global`, fxWhy]
        .filter(Boolean)
        .join(" ; "),
    };
  }

  const ruleText =
    rule.perShare != null
      ? `${rule.perShare} ${rule.perShareCcy} la part par ordre et par sens${rule.min != null ? `, min ${rule.min} ${rule.minCcy}` : ", sans minimum imprimé"}`
      : `${(100 * rule.rate).toFixed(2)} % du montant par ordre et par sens${rule.min != null ? `, min ${rule.min} ${rule.minCcy}` : ", sans minimum imprimé"}`;
  const basis =
    `grille MT5 Global lue le ${SCHEDULE.readOn}, ${rule.label} : ${ruleText}` +
    (held ? "" : ` ; change forcé ${cash} sans taux publié`);

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: [!(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs", fxWhy]
        .filter(Boolean)
        .join(" ; "),
    };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const buy = commissionSide({ shares: n, notional, currency: listing.currency, market });
  const sell = commissionSide({ shares: n, notional, currency: listing.currency, market });
  const commissionUsd = plus(buy?.charged ?? null, sell?.charged ?? null);
  const fxUsd = held ? 0 : null;
  const brokerFees = plus(commissionUsd, fxUsd);

  const levies = leviesOf({ listing, market, notional, notionalUsd, n, tax });
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap ? null : levies.taxUsd;
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd, levies.exchangeUsd, levies.regulatoryUsd);

  const why = [
    fxWhy,
    bookUsd == null
      ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    gap,
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why.length ? { why: why.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: {
      commission: finite(buy?.charged, 6),
      native: buy ? { charged: finite(buy.charged, 6), raw: finite(buy.raw, 6), floored: buy.floored, currency: buy.currency } : null,
      taxRates: Object.keys(levies.rates).length ? levies.rates : null,
    },
    sell: {
      commission: finite(sell?.charged, 6),
      native: sell ? { charged: finite(sell.charged, 6), raw: finite(sell.raw, 6), floored: sell.floored, currency: sell.currency } : null,
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
      bourse: finite(levies.exchangeUsd, 6),
      réglementaire: finite(levies.regulatoryUsd, 6),
    },
    commission: {
      rate: rule.rate ?? null,
      perShare: rule.perShare ?? null,
      perShareCurrency: rule.perShareCcy ?? null,
      min: rule.min ?? null,
      minCurrency: rule.minCcy ?? null,
      eachWay: true,
    },
    basis,
    confidence: confidenceOf({
      market,
      rule,
      listing,
      marketBp,
      marketPerShare,
      book,
      unsourced: m.unsourced,
      buy,
      levies,
      held,
      cash,
    }),
  };
}

function confidenceOf({ market, rule, listing, marketBp, marketPerShare, book, unsourced, buy, levies, held, cash }) {
  const said = [];
  said.push(`grille MT5 Global (${SCHEDULE.source}) lue le ${SCHEDULE.readOn}, identique en anglais, russe et polonais, palier ${rule.label}`);
  if (market === "de" && listing.mic === "XMUN") said.push("gettex : même liste J2T « GERMANY (TRADEGATE/GETTEX) », donc même palier 0,14 %");
  if (market === "ca" && listing.mic === "XTSX") said.push("TSX Venture : même marché J2T que Toronto, donc même palier");
  if (market === "us" && !["XNAS", "XNYS", "ARCX", "XASE", "BATS"].includes(code(listing.mic))) {
    said.push(`${listing.exchange} : ligne de la liste USA de J2T, facturée au palier USA (NYSE/NASDAQ)`);
  }
  if (buy) {
    said.push(
      rule.min == null
        ? `pas de minimum imprimé : ${Number(buy.charged.toPrecision(4))} $ par sens`
        : buy.floored
        ? `le minimum mord : ${Number(buy.raw.toPrecision(3))} $ calculés, ${Number(buy.charged.toPrecision(4))} $ facturés par sens`
        : `au-dessus du minimum : ${Number(buy.charged.toPrecision(4))} $ par sens`
    );
  }
  said.push(...levies.said);
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) {
    said.push(
      book.via606
        ? `carnet Rule 605 × Q 606 de Lime Trading Corp (Q ${Number(book.q.toPrecision(4))}), ${marketPerShare} $ la part : ` +
            `J2T écrit « Access to the US stock market is provided by Lime Financial USA » (${SCHEDULE.usAccess})`
        : `carnet ${marketPerShare} $ la part (NBBO coté)`
    );
  } else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    held
      ? `ligne en ${cash}, devise de dépôt : pas de change dans le total, un compte dans l'autre devise convertit à un taux non publié`
      : `ligne en ${cash}, hors des devises de dépôt (USD, EUR) : change forcé au cours de la banque, écart non publié, total N/A`
  );
  said.push(
    `hors total : pré / post-marché US 0,003 $ la part, ordre vocal 5 $ / 5 €, données « Advanced » 1 $ par mois (gratuit avec un ordre), ` +
      `frais de maintenance ${MAINTENANCE.usd} USD / ${MAINTENANCE.eur} EUR par mois après ${MAINTENANCE.afterMonths} mois sans activité, ` +
      `commission sur dividende 3 % (min 3 USD), dépôt bancaire USD 0,3 %, retrait USD 0,4 % (min 80 $) ou EUR 25 €. ` +
      `Aucun aller-retour réel dans ce dépôt`
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
          markets: MARKETS,
          unpublished: UNPUBLISHED,
          us: { nscc: US_NSCC, sec: US_SEC, taf: null, cat: null },
          printedExchangeFees: PRINTED_EXCHANGE_FEES,
          hongKong: HK_LEVY,
          koreaSaleTax: KR_SALE_TAX,
          maintenance: MAINTENANCE,
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
      "usage : node just2trade_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node just2trade_cost.mjs --schedule\n" +
        "  ex.   node just2trade_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node just2trade_cost.mjs SAP XETRA EUR --shares=10 --price=200"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan"),
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) console.log(`\nce que Just2Trade propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }

  console.log(`${l.ticker || l.query || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n"
    );
  }
  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
  }
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ").filter(Boolean)) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
