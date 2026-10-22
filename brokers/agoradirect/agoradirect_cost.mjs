// What one round trip costs at AGORA direct (First Quant GmbH, Berlin, an
// introducing broker onto Interactive Brokers Ireland): buy n shares at
// price p, sell them back at once, online, in dollars.
//
// Price list read on 2026-10-21:
//   https://www.agora-direct.com/de/aktien-etf-fonds/        (order fees)
//   https://www.agora-direct.com/de/waehrungen-handeln-kaufen/ (conversion)
//   https://www.agora-direct.com/de/gebuehren-zinsen/        (custody, other)
//
// Order fees, the same for shares, ADRs, ETFs, ETCs, ETNs and GDRs, each way:
//
//   Xetra                        0.14 %, min 5.50 EUR, "inkl. aller Kosten"
//   Tradegate, gettex, Frankfurt,
//   Stuttgart, other German      0.16 %, min 5.50 EUR, plus third-party costs
//   Australia (ASX, Cboe AU)     0.20 %, min 9.90 AUD
//   Baltics                      0.14 %, min 12 EUR
//   Belgium                      0.14 %, min 5.50 EUR
//   China (Stock Connect)        0.20 %, min 50 CNH
//   Denmark                      0.20 %, min 25 DKK
//   France                       EUR 0.14 %, min 5.50 / USD 0.16 %, min 9.90
//   United Kingdom               EUR 0.14 %, min 5.50 / GBP 0.14 %, min 10,
//                                plus third-party costs / USD 0.14 %, min 10
//   Hong Kong                    CNH 0.20 %, min 50 / HKD 0.20 %, min 50
//   Israel                       0.20 %, min 23.50 ILS
//   Italy                        0.14 %, min 5.50 EUR
//   Japan                        0.15 %, min 500 JPY
//   Canada (TSX, Venture, Cboe
//   Canada, Pure, Alpha)         0.025 CAD a share to the 2,000th share,
//                                0.015 CAD from the 2,001st, cap 2.45 % of
//                                the order, min 7 CAD, plus third-party costs
//   Mexico                       0.20 %, min 75 MXN
//   Netherlands                  EUR 0.14 %, min 5.50 / USD 0.16 %, min 9
//   Norway                       0.20 %, min 65 NOK
//   Austria                      0.16 %, min 5.50 EUR
//   Poland                       0.20 %, min 19 PLN
//   Portugal                     0.14 %, min 5.50 EUR
//   Sweden                       EUR 0.14 %, min 5.50 / SEK 0.20 %, min 75
//   Switzerland                  CHF 0.15 %, min 14.75 / EUR 0.14 %, min 5.50
//                                / GBP 0.14 %, min 9.90 / USD 0.025 a share
//                                to 2,000, 0.015 after, cap 1.75 %, min 9.90
//   Singapore                    SGD 0.16 %, min 6 / EUR 0.20 %, min 5.50 /
//                                GBP 0.20 %, min 10 / HKD 0.20 %, min 19 /
//                                USD 0.16 %, min 9.90
//   Spain                        0.14 %, min 5.50 EUR
//   Czech Republic               0.30 %, min 95 CZK, plus third-party costs
//   Hungary                      0.65 %, min 995 HUF, plus third-party costs
//   United States (listed)       0.025 USD a share to 2,000, 0.015 after,
//                                cap 1.75 % of the order, min 8.90 USD
//   United States OTC / Pink     0.009 USD a share, cap 2 %, min 5 USD
//
// The page says the fees are final prices with every exchange and
// third-party cost inside (US SEC / TAF / CAT too), unless a line says
// otherwise. The lines marked "plus ggf. Fremdspesen" (Tradegate, gettex,
// Frankfurt, Stuttgart and the other German floors, London in GBP, Canada,
// Prague, Budapest) and OTC / Pink are such cases: the page says those
// venues' exchange, clearing and transaction costs are "hochvariabel" and
// charged separately, and prints no figure. It defines them as costs "die
// vom depotführenden Institut für Dritte gesondert berechnet und eingezogen
// werden", and the depot-holding institution is Interactive Brokers Ireland:
// they are IBIE's third-party pass-through fees, with no AGORA margin named.
// So they are taken from IBIE's own third-party fee pages (Tiered column),
// read on 2026-10-22, for a marketable order (remove liquidity), one fill,
// both ways (owner decision, 2026-10-22). See THIRD_PARTY below. A venue
// IBIE prints no figure for stays N/A.
// The per-share tiers are marginal (to the 2,000th share, then from the
// 2,001st); the cap binds the per-share amount and the minimum binds the
// result, as on the other IBKR introducing brokers' tickets.
//
// A country printed by currency prices only those currencies: a GBP line in
// Paris, a JPY or CAD line on SIX and a USD line in Hong Kong are N/A. A
// country printed on one line (Canada, Hungary ...) prices every line on
// its venues, with the minimum in the currency it prints. Cboe Europe and
// Turquoise are not on the list (nor in the preisliste.pdf, valid from
// 2024-02-01, which names them only for market data). Both books are run
// from London, so their lines take the United Kingdom rows by currency
// (owner decision, 2026-10-22): EUR and USD as printed, GBP plus IBIE's
// third-party fees for the venue; CHF, DKK and JPY lines stay N/A.
//
// Conversion (Währungsumtausch): 0.07 % of the amount, minimum by currency
// (EUR 6, USD 5, GBP 6, CHF 3.95, CAD 5.95, AUD 6.75, JPY 375, HKD 37.50,
// CNH 24, SGD 6.75, MXN 75.50 ...). The minimum used is the row of the
// listing currency. A listing in a deposit currency (deposits.mjs: EUR, USD,
// CHF, GBP, CZK, DKK, HUF, ILS, NOK, PLN, SEK) keeps the remark
// "FX 0.07% (min x CCY) when cash ≠ CCY.". Any other (MXN, JPY, CAD, AUD,
// HKD, CNH, SGD) converts on the buy and back on the sale, in the total.
//
// Taxes: the page names UK stamp (max 0.5 %), Irish stamp (max 1 %), Swiss
// stamp (max 0.075 %) and the French and Italian FTT, passed on. Rates come
// from taxMap.mjs by ISIN (taxGap = N/A); UK and Irish stamp only on their
// home books. Statutory on top: the PTM levy, 1.50 GBP a side above
// 10,000 GBP on a UK-registered share in London, any trading currency
// (thepanel.org.uk); Hong Kong stamp duty,
// 0.1 % a side on a share, HKD rounded up (ird.gov.hk); Stock Connect
// stamp duty, 0.05 % on the sale of an A-share (State Taxation
// Administration, since 28 Aug 2023).
//
// Not in the number: custody and inactivity are "keine"; withdrawals (the
// first SEPA of the month free); ADR fees (max 0.03 USD a share).
//
// In the total: the book crossed once, the commission both ways, the
// forced conversion both ways on a non-deposit currency, stamp / FTT and
// the statutory levies above. Remark only: "FX 0.07% (min x CCY) when
// cash ≠ CCY." on a deposit-currency line.
//
// US book: AGORA names IBIE as the executing firm; IBIE routes US orders
// to Interactive Brokers LLC, so spreadLeaf (broker "agoradirect", alias in
// spreads/rule606.mjs) takes that dealer's 606 Q.
//
//   node brokers/agoradirect/agoradirect_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/agoradirect/agoradirect_cost.mjs VWCE XETR EUR --shares=10 --price=140
//   node brokers/agoradirect/agoradirect_cost.mjs HSBA XLON GBP --shares=2000 --price=9
//   node brokers/agoradirect/agoradirect_cost.mjs 7203 XTKS JPY --shares=100 --price=2800
//   node brokers/agoradirect/agoradirect_cost.mjs 1 XHKG HKD --shares=1000 --price=45
//   node brokers/agoradirect/agoradirect_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "agoradirect";
const CATALOGUE = new URL("agoradirect-parsed.json", import.meta.url);

const SCHEDULE = {
  orders: "https://www.agora-direct.com/de/aktien-etf-fonds/",
  fx: "https://www.agora-direct.com/de/waehrungen-handeln-kaufen/",
  other: "https://www.agora-direct.com/de/gebuehren-zinsen/",
  readOn: "2026-10-21",
  entity: "First Quant GmbH (AGORA direct), introducing broker onto Interactive Brokers Ireland",
  base: "EUR",
};

const FX_RATE = 0.0007;
const FX_MIN = {
  AED: 14.5, AUD: 6.75, BGN: 12, CAD: 5.95, CHF: 3.95, CNH: 24, CZK: 95, DKK: 27.5, EUR: 6, GBP: 6,
  HKD: 37.5, HUF: 1375, ILS: 12.5, JPY: 375, KRW: 5775, MXN: 75.5, NOK: 37.5, NZD: 6.75, PLN: 17.75,
  RON: 17.5, RUB: 457, SAR: 17.75, SEK: 37.5, SGD: 6.75, TRY: 47.75, USD: 5, ZAR: 67.75,
};
const PTM = { each: 1.5, ccy: "GBP", above: 10000 };
const HK_STAMP = 0.001;
const CONNECT_STAMP = 0.0005;
const UK_REGISTERED = /^(GB|GG|JE|IM)/;
const STAMP_HOME = {
  GB: new Set(["XLON", "AQXE", "XMSM", "CHIX", "TRQX"]),
  IE: new Set(["XMSM", "XLON", "AQXE", "CHIX", "TRQX"]),
};
const US_LISTED = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS", "IEXG", "MEMX", "TXSE"]);

// Interactive Brokers Ireland's third-party fees on the "Fremdspesen" venues,
// read 2026-10-22 on interactivebrokers.ie/en/accounts/fees/<page>.php and
// the stock commission page's Canada and United States boxes. Rebates (paid
// to a remover on Alpha and Cboe Canada) are counted as zero: AGORA names
// costs on top, not credits.
const IB_FEES = "https://www.interactivebrokers.ie/en/accounts/fees/";
const THIRD_PARTY = {
  // LSEstkfees: exchange fee 0.0045 % of the trade, minimum GBP 0.10 (ETFs)
  // or GBP 0.11 (all other), per trade; clearing GBP 0.06.
  XLON: { page: "LSEstkfees.php", ccy: "GBP" },
  // CHIXStkFees and TRQXStkFees: exchange fee 0.003 % of the trade (remove
  // liquidity, displayed), clearing EUR 0.03 a trade, both charged in the
  // settlement currency.
  CHIX: { page: "CHIXStkFees.php", ccy: "GBP" },
  TRQX: { page: "TRQXStkFees.php", ccy: "GBP" },
  // FWBStkFees: exchange fee 0.0144 %, min EUR 0.90, max 108; trade fee
  // 0.0504 %, min EUR 2.52; clearing EUR 0.06 + 0.0008 % (variable max 4.00);
  // regulatory EUR 0.01 a trade.
  XFRA: { page: "FWBStkFees.php", ccy: "EUR" },
  // SWBStkFees: exchange fee 0.095 % (stocks, min EUR 2.73, max 63; DAX
  // stocks 0.062 %, min 2.09, not told apart here) or 0.10 % (ETFs), waived
  // on an order up to EUR 1,100; regulatory EUR 0.01 a trade.
  XSTU: { page: "SWBStkFees.php", ccy: "EUR" },
  // GETTEXStkFees: exchange fee 0, clearing EUR 0.00 per order.
  XMUN: { page: "GETTEXStkFees.php", ccy: "EUR" },
  // TRADEGATEStkFees: exchange fee 0.00 per trade.
  XGAT: { page: "TRADEGATEStkFees.php", ccy: "EUR" },
  // PRAStkFees: no per-trade fee; 0.05 % a year of the CZK position value,
  // a holding cost, left out like custody.
  XPRA: { page: "PRAStkFees.php", ccy: "CZK" },
  // BUXStkFees: exchange fee 0.07 % of value; transaction tax on buys
  // 0.45 %, at most HUF 20,000 a trade.
  XBUD: { page: "BUXStkFees.php", ccy: "HUF" },
  // TSXstkfee (remove liquidity): CAD 0.00015 a share under CAD 1.00,
  // 0.0015 at or above (interlisted 0.0027), ETFs 0.0017.
  XTSE: { page: "TSXstkfee.php", ccy: "CAD" },
  XTSX: { page: "TSXstkfee.php", ccy: "CAD" },
  // PUREstkfee (CSE): TSX / Venture listed CAD 0.0012 a share at or above
  // CAD 1.00 (interlisted 0.0025), 0.0003 under; ETFs 0.0016 / 0.0003. A
  // Cboe Canada listing traded on CSE has no row: N/A.
  PURE: { page: "PUREstkfee.php", ccy: "CAD" },
  // ALPHAstkfee and AequitasNEOstkfee: removing liquidity earns a rebate.
  XATS: { page: "ALPHAstkfee.php", ccy: "CAD" },
  NEOE: { page: "AequitasNEOstkfee.php", ccy: "CAD" },
  // otc-link-ecn-fees: USD 0.0029 a share at or above USD 1.00, 0.00003
  // under, 0.3 % of the trade under USD 0.01; plus the US box: NSCC / DTC
  // clearing USD 0.0002 a share, SEC fee 0.0000206 of the sale, FINRA TAF
  // 0.00, CAT USD 0.000003 a share, NYSE and FINRA pass-through 0.0175 % and
  // 0.056 % of the commission.
  OTCM: { page: "otc-link-ecn-fees.php", ccy: "USD" },
};
// Canada box: clearing CAD 0.00017 a share (Venture listed 0.00010), at
// most CAD 2.00 an order; regulatory CAD 0.00011 a share, at most 3.30 a
// trade.
const CA_CLEARING = { all: 0.00017, venture: 0.0001, cap: 2 };
const CA_REGULATORY = { each: 0.00011, cap: 3.3 };

const pct = (rate, min, ccy, extra = false) => ({ rate, min, ccy, extra });
const perShare = (ccy, maxPct, min, extra = false) => ({ tiers: [[2000, 0.025], [Infinity, 0.015]], maxPct, min, ccy, extra });

// Fee markets. `byCcy` is a country the list prints by currency; `any` is a
// country printed on one line.
const MARKETS = {
  xetra: { label: "Xetra", any: pct(0.0014, 5.5, "EUR") },
  de: { label: "Tradegate, gettex, Francfort, Stuttgart, autres places allemandes", any: pct(0.0016, 5.5, "EUR", true) },
  au: { label: "Australie", any: pct(0.002, 9.9, "AUD") },
  baltic: { label: "Pays baltes", any: pct(0.0014, 12, "EUR") },
  be: { label: "Belgique", any: pct(0.0014, 5.5, "EUR") },
  cn: { label: "Chine (Stock Connect)", any: pct(0.002, 50, "CNH") },
  dk: { label: "Danemark", any: pct(0.002, 25, "DKK") },
  fr: { label: "France", byCcy: { EUR: pct(0.0014, 5.5, "EUR"), USD: pct(0.0016, 9.9, "USD") } },
  uk: {
    label: "Royaume-Uni",
    byCcy: { EUR: pct(0.0014, 5.5, "EUR"), GBP: pct(0.0014, 10, "GBP", true), USD: pct(0.0014, 10, "USD") },
  },
  hk: { label: "Hong Kong", byCcy: { CNH: pct(0.002, 50, "CNH"), HKD: pct(0.002, 50, "HKD") } },
  il: { label: "Israël", any: pct(0.002, 23.5, "ILS") },
  it: { label: "Italie", any: pct(0.0014, 5.5, "EUR") },
  jp: { label: "Japon", any: pct(0.0015, 500, "JPY") },
  ca: { label: "Canada", any: perShare("CAD", 0.0245, 7, true) },
  mx: { label: "Mexique", any: pct(0.002, 75, "MXN") },
  nl: { label: "Pays-Bas", byCcy: { EUR: pct(0.0014, 5.5, "EUR"), USD: pct(0.0016, 9, "USD") } },
  no: { label: "Norvège", any: pct(0.002, 65, "NOK") },
  at: { label: "Autriche", any: pct(0.0016, 5.5, "EUR") },
  pl: { label: "Pologne", any: pct(0.002, 19, "PLN") },
  pt: { label: "Portugal", any: pct(0.0014, 5.5, "EUR") },
  se: { label: "Suède", byCcy: { EUR: pct(0.0014, 5.5, "EUR"), SEK: pct(0.002, 75, "SEK") } },
  ch: {
    label: "Suisse",
    byCcy: {
      CHF: pct(0.0015, 14.75, "CHF"),
      EUR: pct(0.0014, 5.5, "EUR"),
      GBP: pct(0.0014, 9.9, "GBP"),
      USD: perShare("USD", 0.0175, 9.9),
    },
  },
  sg: {
    label: "Singapour",
    byCcy: {
      SGD: pct(0.0016, 6, "SGD"),
      EUR: pct(0.002, 5.5, "EUR"),
      GBP: pct(0.002, 10, "GBP"),
      HKD: pct(0.002, 19, "HKD"),
      USD: pct(0.0016, 9.9, "USD"),
    },
  },
  es: { label: "Espagne", any: pct(0.0014, 5.5, "EUR") },
  cz: { label: "Tchéquie", any: pct(0.003, 95, "CZK", true) },
  hu: { label: "Hongrie", any: pct(0.0065, 995, "HUF", true) },
  us: { label: "États-Unis", any: perShare("USD", 0.0175, 8.9) },
  otc: { label: "États-Unis OTC / Pink", any: { tiers: [[Infinity, 0.009]], maxPct: 0.02, min: 5, ccy: "USD", extra: true } },
};

const BY_MIC = {
  XETR: "xetra",
  XFRA: "de", XSTU: "de", XGAT: "de", XMUN: "de", XBER: "de", XDUS: "de", XHAM: "de", XHAN: "de",
  XASX: "au", CHIA: "au",
  XTAL: "baltic", XRIS: "baltic", XLIT: "baltic",
  XBRU: "be",
  XSHG: "cn", XSHE: "cn",
  XCSE: "dk",
  XPAR: "fr",
  XLON: "uk", CHIX: "uk", TRQX: "uk",
  XHKG: "hk",
  XTAE: "il",
  XMIL: "it",
  XTKS: "jp",
  XTSE: "ca", XTSX: "ca", NEOE: "ca", PURE: "ca", XATS: "ca", XCNQ: "ca",
  XMEX: "mx",
  XAMS: "nl",
  XOSL: "no",
  XWBO: "at",
  XWAR: "pl",
  XLIS: "pt",
  XSTO: "se",
  XSWX: "ch",
  XSES: "sg",
  XMAD: "es",
  XPRA: "cz",
  XBUD: "hu",
  OTCM: "otc",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
// Pence settle in pounds. CNH stays CNH: the list prints CNH rows, and
// fx.mjs reads it at the CNY mid.
const cashOf = (s) => (code(s) === "GBX" ? "GBP" : code(s));
const isStock = (listing) => code(listing?.type) === "STOCK";
const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  const a = cashOf(from);
  const b = cashOf(to);
  if (a === b) return amount;
  const usd = toUsd(amount, a);
  const per = usdPer(b);
  return usd == null || !(per > 0) ? null : usd / per;
}
const num = (x) => String(x).replace(".", ",");

export function feeMarketOf(mic) {
  const m = code(mic);
  if (US_LISTED.has(m)) return "us";
  return BY_MIC[m] ?? null;
}

export function ruleOf(market, currency) {
  const table = MARKETS[market];
  if (!table) return null;
  return table.any ?? table.byCcy?.[cashOf(currency)] ?? null;
}

/**
 * One side's commission in the rule's currency. `amount` is already in that
 * currency. Per-share: marginal tiers, the cap on the per-share amount, then
 * the minimum on the result.
 */
export function commissionSide(rule, { shares, amount }) {
  if (!rule || !(amount > 0)) return null;
  if (rule.tiers) {
    let left = Number(shares);
    let from = 0;
    let raw = 0;
    for (const [upTo, each] of rule.tiers) {
      const n = Math.max(0, Math.min(left, upTo - from));
      raw += n * each;
      left -= n;
      from = upTo;
      if (left <= 0) break;
    }
    const cap = rule.maxPct != null ? amount * rule.maxPct : Infinity;
    const capped = cap < raw;
    const body = capped ? cap : raw;
    const charged = Math.max(rule.min, body);
    return { raw, charged, capped, floored: body < rule.min, currency: rule.ccy };
  }
  const raw = amount * rule.rate;
  const charged = Math.max(rule.min, raw);
  return { raw, charged, capped: false, floored: raw < rule.min, currency: rule.ccy };
}

function ruleText(rule) {
  if (rule.tiers) {
    const t = rule.tiers.length > 1
      ? `${num(rule.tiers[0][1])} ${rule.ccy} la part jusqu'à la ${rule.tiers[0][0]}e, ${num(rule.tiers[1][1])} ensuite`
      : `${num(rule.tiers[0][1])} ${rule.ccy} la part`;
    return `${t}, plafond ${num((100 * rule.maxPct).toFixed(2))} % de l'ordre, plancher ${num(rule.min)} ${rule.ccy}`;
  }
  return `${num((100 * rule.rate).toFixed(2))} % par sens, plancher ${num(rule.min)} ${rule.ccy}`;
}

function fxLeg(notional, currency) {
  const ccy = cashOf(currency);
  const min = FX_MIN[ccy];
  if (min == null) return null;
  return Math.max(min, notional * FX_RATE);
}

// IBKR's own listing exchange for the row ("TSE", "VENTURE", "AEQLIT" ...),
// the fifth field of the scraped line.
const primaryOf = (row) => code(String(row?.raw || "").split(" | ")[4]);
const isEtfLike = (listing) => ["ETF", "ETC", "ETN"].includes(code(listing?.type));

// A Canadian share is interlisted when the catalogue also has it in the US.
let usIsins = null;
function usListed(isin) {
  if (!usIsins) {
    usIsins = new Set();
    for (const r of rows) if (US_LISTED.has(code(r.mic)) && r.isin) usIsins.add(code(r.isin));
  }
  return usIsins.has(code(isin));
}

/**
 * IBIE's third-party fees for one round trip on a "Fremdspesen" venue, in the
 * venue's fee currency, or null when IBIE prints no figure for the line.
 * `price` and `notional` are in `settle`; `commission` is AGORA's per side in
 * its own currency (the US pass-through is a share of it).
 */
export function thirdPartyRoundTrip({ mic, row, listing, shares, price, notional, settle, commission }) {
  const venue = THIRD_PARTY[code(mic)];
  if (!venue) return null;
  const ccy = venue.ccy;
  const value = convert(notional, settle, ccy);
  const each = convert(price, settle, ccy);
  if (value == null || each == null) return null;
  const n = Number(shares);
  const said = [];
  let side = 0;
  let buyOnly = 0;
  let sellOnly = 0;
  switch (code(mic)) {
    case "XLON":
      side = Math.max(value * 0.000045, isEtfLike(listing) ? 0.1 : 0.11) + 0.06;
      said.push("bourse 0,0045 % (min 0,10/0,11 £) et compensation 0,06 £ par sens");
      break;
    case "CHIX":
    case "TRQX": {
      const clearing = convert(0.03, "EUR", ccy);
      if (clearing == null) return null;
      side = value * 0.00003 + clearing;
      said.push("bourse 0,003 % et compensation 0,03 € par sens");
      break;
    }
    case "XFRA":
      side =
        Math.min(108, Math.max(0.9, value * 0.000144)) +
        Math.max(2.52, value * 0.000504) +
        0.06 +
        Math.min(4, value * 0.000008) +
        0.01;
      said.push("bourse 0,0144 % (min 0,90 €), frais de négociation 0,0504 % (min 2,52 €), compensation 0,06 € + 0,0008 %, 0,01 € réglementaire par sens");
      break;
    case "XSTU":
      if (value > 1100) side = isEtfLike(listing) ? value * 0.001 : Math.min(63, Math.max(2.73, value * 0.00095));
      side += 0.01;
      said.push(
        value > 1100
          ? `bourse ${isEtfLike(listing) ? "0,10 %" : "0,095 % (min 2,73 €)"} et 0,01 € réglementaire par sens`
          : "bourse offerte jusqu'à 1 100 €, 0,01 € réglementaire par sens",
      );
      break;
    case "XMUN":
    case "XGAT":
    case "XPRA":
      said.push("aucun frais tiers par ordre chez IBIE");
      break;
    case "XBUD":
      side = value * 0.0007;
      buyOnly = Math.min(20000, value * 0.0045);
      said.push("bourse 0,07 % par sens, taxe sur transaction 0,45 % à l'achat (max 20 000 HUF)");
      break;
    case "XTSE":
    case "XTSX":
    case "PURE":
    case "XATS":
    case "NEOE": {
      const primary = primaryOf(row);
      const inter = usListed(listing.isin);
      let perShare = 0;
      if (code(mic) === "XTSE" || code(mic) === "XTSX") {
        perShare = isEtfLike(listing) ? 0.0017 : each < 1 ? 0.00015 : inter ? 0.0027 : 0.0015;
      } else if (code(mic) === "PURE") {
        if (primary !== "TSE" && primary !== "VENTURE") return null;
        perShare = isEtfLike(listing) ? (each < 1 ? 0.0003 : 0.0016) : each < 1 ? 0.0003 : inter ? 0.0025 : 0.0012;
      }
      const clearingRate = primary === "VENTURE" ? CA_CLEARING.venture : CA_CLEARING.all;
      const clearing = Math.min(CA_CLEARING.cap, n * clearingRate);
      const regulatory = Math.min(CA_REGULATORY.cap, n * CA_REGULATORY.each);
      side = n * perShare + clearing + regulatory;
      said.push(
        `bourse ${num(perShare)} CAD la part${perShare === 0 ? " (rabais au preneur compté zéro)" : ""}, ` +
          `compensation ${num(clearingRate)} CAD la part (max 2), réglementaire 0,00011 CAD la part (max 3,30) par sens`,
      );
      break;
    }
    case "OTCM": {
      const perShare = each >= 1 ? 0.0029 : each >= 0.01 ? 0.00003 : null;
      const exchange = perShare == null ? value * 0.003 : n * perShare;
      const usd = commission ? convert(commission.charged, commission.currency, "USD") : null;
      if (usd == null) return null;
      side = exchange + n * 0.0002 + n * 0.000003 + usd * (0.000175 + 0.00056);
      sellOnly = value * 0.0000206;
      said.push("OTC Link ECN, compensation 0,0002 $ la part, CAT et frais NYSE/FINRA sur commission par sens, SEC 0,00206 % à la vente");
      break;
    }
    default:
      return null;
  }
  return { amount: 2 * side + buyOnly + sellOnly, ccy, page: `${IB_FEES}${venue.page}`, text: said.join(" ; ") };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `brokerFees` is AGORA's commission both ways plus a forced conversion.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare: givenPerShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    url: SCHEDULE.orders,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue AGORA n'existe pas encore : lancer `node brokers/agoradirect/agoradirect_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue AGORA` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez AGORA`,
      alternatives: named.slice(0, 12).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`),
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
    mic: book.mic ?? m.venue?.mic ?? code(m.row.mic) ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || null,
    brokerExchange: m.row.exchange || null,
  };

  const settle = cashOf(listing.currency);
  const held = depositHas(FOLDER, null, settle);
  const market = feeMarketOf(m.venue?.mic ?? m.row.mic);
  const table = market ? MARKETS[market] : null;
  const rule = market ? ruleOf(market, settle) : null;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = givenPerShare ?? book.leaf?.perShare ?? null;
  const fxMin = FX_MIN[settle];

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: held ? settle : SCHEDULE.base,
    remark: held ? fxRemark((100 * FX_RATE).toFixed(2), settle, fxMin != null ? `(min ${fxMin} ${settle})` : "") : "",
    bp: marketBp,
    perShare: marketPerShare,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(settle) },
    fxIfConverted: held ? FX_RATE * 2 : 0,
  };

  if (!rule) {
    return {
      ...shared,
      basis: `barème AGORA relu le ${SCHEDULE.readOn}`,
      why: table
        ? `AGORA n'imprime pas de ligne ${settle} pour ${table.label}`
        : `${listing.brokerExchange || listing.exchange || "cette place"} n'est pas sur le barème AGORA du ${SCHEDULE.readOn}`,
    };
  }

  const basis =
    `barème AGORA relu le ${SCHEDULE.readOn}, ${table.label} : ${ruleText(rule)}` +
    (rule.extra ? ", plus « ggf. Fremdspesen », pris aux frais tiers d'Interactive Brokers Ireland" : "") +
    (held ? "" : ` ; ${settle} n'est pas une devise de dépôt : change 0,07 % (min ${num(fxMin)} ${settle}) par sens dans le total`);

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, basis, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, basis, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = code(listing.currency) === "GBX" ? (n * p) / 100 : n * p;
  const notionalUsd = dollars(notional, settle);
  const amount = convert(notional, settle, rule.ccy);
  const buy = commissionSide(rule, { shares: n, amount });
  const sell = commissionSide(rule, { shares: n, amount });
  const commissionUsd = buy && sell ? dollars(buy.charged + sell.charged, rule.ccy) : null;

  // Forced conversion, both legs, minimum of the listing currency's row.
  const fxEach = held ? 0 : fxLeg(notional, settle);
  const fxUsd = held ? 0 : fxEach == null ? null : dollars(2 * fxEach, settle);
  // "plus ggf. Fremdspesen": IBIE's third-party fees for the venue, in the
  // broker's bill. A venue IBIE prints no figure for stays unknown (na.mjs).
  const extra = rule.extra
    ? thirdPartyRoundTrip({
        mic: listing.mic ?? m.row.mic,
        row: m.row,
        listing,
        shares: n,
        price: code(listing.currency) === "GBX" ? p / 100 : p,
        notional,
        settle,
        commission: buy,
      })
    : null;
  const unpriced = Boolean(rule.extra) && extra == null;
  const extraUsd = extra ? dollars(extra.amount, extra.ccy) : 0;
  const brokerFees = unpriced ? null : plus(commissionUsd, fxUsd, extraUsd);

  // Taxes the page names, from the tax map; UK / Irish stamp on the home book.
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const country = (listing.isin || "").slice(0, 2);
  const stampReaches = !STAMP_HOME[country] || STAMP_HOME[country].has(code(listing.mic));
  const taxPct = stampReaches ? Object.values(rates).reduce((s, r) => s + r, 0) : 0;
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;

  // Statutory levies outside the map.
  const said = [];
  let leviesNative = 0;
  let ptmUsd = 0;
  if (market === "uk" && isStock(listing) && UK_REGISTERED.test(listing.isin || "")) {
    const inGbp = convert(notional, settle, PTM.ccy);
    if (inGbp == null) ptmUsd = null;
    else if (inGbp > PTM.above) {
      ptmUsd = dollars(2 * PTM.each, PTM.ccy);
      said.push(`prélèvement PTM ${num(PTM.each)} £ par sens, le montant dépasse ${PTM.above} £`);
    }
  }
  if (market === "hk" && isStock(listing)) {
    const side = notional * HK_STAMP;
    const each = settle === "HKD" ? Math.ceil(side - 1e-9) : side;
    leviesNative += 2 * each;
    said.push(`droit de timbre de Hong Kong 0,1 % par sens sur une action${settle === "HKD" ? ", arrondi au HKD supérieur" : ""}`);
  }
  if (market === "cn" && isStock(listing)) {
    leviesNative += notional * CONNECT_STAMP;
    said.push("droit de timbre chinois 0,05 % à la vente (Stock Connect)");
  }
  const leviesUsd = plus(dollars(leviesNative, settle), ptmUsd);

  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (v) => dollars(v, settle),
  });
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd, leviesUsd);

  const unknown = [
    unpriced ? `${table.label} : « plus ggf. Fremdspesen », et Interactive Brokers Ireland n'imprime pas de frais tiers pour cette ligne (${listing.exchange})` : null,
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
    !held && fxEach == null ? `le change vers ${settle} n'a pas de minimum publié chez AGORA` : null,
    notionalUsd == null ? `aucun cours en dollars pour ${settle} dans fx.mjs` : null,
  ].filter(Boolean);

  const side = (leg) =>
    leg.capped
      ? `plafonnée à ${Number(leg.charged.toPrecision(4))} ${leg.currency}`
      : leg.floored
        ? `au plancher ${num(leg.charged)} ${leg.currency} (le barème donnerait ${Number(leg.raw.toPrecision(3))})`
        : `${Number(leg.charged.toPrecision(4))} ${leg.currency}`;
  const confidence = [
    basis,
    buy ? `commission ${side(buy)} par sens` : null,
    rule.extra
      ? extra
        ? `Fremdspesen d'après IBIE (${extra.page}) : ${extra.text}, ${Number(extra.amount.toPrecision(4))} ${extra.ccy} l'aller-retour`
        : "Fremdspesen en sus non chiffrés : total inconnu"
      : market === "us"
        ? "prix final selon la page (frais de place et SEC / TAF / CAT inclus)"
        : "prix final selon la page (frais de place inclus)",
    taxPct ? `taxe à l'achat ${Object.entries(rates).map(([k, v]) => `${k} ${num((100 * v).toFixed(2))} %`).join(", ")} (taxMap.mjs)` : null,
    ...said,
    held
      ? `${settle} est une devise de dépôt : change 0,07 % hors total`
      : fxEach != null
        ? `change forcé ${Number(fxEach.toPrecision(4))} ${settle} par sens`
        : null,
    market === "us"
      ? book.via606
        ? `carnet 605 × Q ${Number(Number(book.q).toPrecision(3))} (606 du courtier américain)`
        : "carnet NBBO coté : pas d'alias 606 pour AGORA dans spreads/rule606.mjs"
      : marketBp != null
        ? `carnet ${Number(Number(marketBp).toPrecision(4))} bp`
        : null,
    "hors total : garde et inactivité « keine », retraits",
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    basis,
    confidence,
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: settle },
    commission: {
      buy: finite(buy?.charged, 6),
      sell: finite(sell?.charged, 6),
      currency: rule.ccy,
      eachWay: true,
      rate: rule.rate ?? null,
      tiers: rule.tiers ?? null,
      min: rule.min,
      maxPct: rule.maxPct ?? null,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      fremdspesen: finite(extra ? extraUsd : null, 6),
      frais: finite(leviesUsd, 6),
      taxes: finite(taxUsd, 6),
    },
  };
}

function printCli() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, markets: MARKETS, conversion: { rate: FX_RATE, min: FX_MIN }, ptm: PTM }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/agoradirect/agoradirect_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]");
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
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) console.log(`\nce qu'AGORA propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    return;
  }
  console.log(`AGORA — ${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n",
    );
  }
  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) for (const [name, v] of Object.entries(out.parts)) if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
  console.log();
  for (const line of (out.confidence || out.basis || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}

printCli();
