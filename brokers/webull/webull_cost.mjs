// What one round trip costs at Webull: buy n shares at price p, sell them
// back at once, in dollars. A coin is bought by the amount.
//
// The affine triple hid the $1 EU floor, the UK FX cliff and the OTC
// 100 000-share surcharge. `roundTrip` is given the size and charges
// what is charged.
//
// One folder per national entity (brokers/webull<cc>/), each with its own
// catalogue; its cost file calls `makeRoundTrip` here with its plans, and
// this file holds the fee card. Options, futures and algo ($0.005 / share)
// are not this trip. Each side unless said.
//
//   US (Webull Financial LLC), read 2026-09-18
//     https://www.webull.com/pricing
//     https://www.webull.com/help/faq/11091-Fees-and-Limits
//               listed / ordinary OTC     $0
//               OTC > 100 000 shares, p < $1
//                                   $0.0002 / share, cap 5 %
//               crypto              1 % spread each way (0 on USDC)
//               CAT NMS / OTC       $0.000003 / $0.00000003 a share, both sides
//   Europe, read 2026-09-18
//     https://www.webull.eu/pricing
//     https://www.webull.eu/help/faq/1289
//               US shares           $1 + FX 0.25 % (USD cannot be held)
//
//   UK, read 2026-10-21              https://www.webull-uk.com/pricing
//               US                  $0 + FX Go 0.50 % / Meridian 0.35 %
//               LSE shares, ETFs    Go 0.075 % (min £1), Meridian 0.05 % (min 50p)
//                                   + FX Go 0.50 % / Meridian 0.35 % on a USD line
//               HK                  $0; trading 0.00565 % (min HK$0.01),
//                                   settlement 0.0042 %, SFC 0.0027 % (min HK$0.01),
//                                   FRC 0.00015 %, stamp 0.1 % rounded up to HK$1 (min HK$1)
//                                   + FX Go 0.50 % / Meridian 0.35 %
//               China Connect       $0; handling 0.00341 %, CSRC 0.002 %, CSDC 0.001 %,
//                                   HKSCC 0.002 % (each min CNH 0.01),
//                                   stamp 0.05 % on the sale (min CNH 0.01)
//                                   + FX 0.35 % (one rate printed on the A-share table)
//   Singapore, read 2026-10-21       https://www.webull.com.sg/pricing
//               US / OTC            $0, SEC 0.0000206 on the sale, CAT $0.000003 / share
//               SGX                 commission 0.025 % (min S$0.80) + platform 0.025 %
//                                   (min S$0.80); SGX clearing 0.0325 %, trading 0.0075 %,
//                                   SI fees S$0.35 + S$0.35 a trade
//                                   (commission waived the first year for new clients)
//               HK                  0.03 % (min HK$12); trading 0.00565 %, settlement
//                                   0.0042 %, SFC 0.0027 % (each min HK$0.01), FRC 0.00015 %,
//                                   stamp 0.1 % rounded up (min HK$1), ETFs exempt
//               China Connect       0.02 % (min CNH 12); stock levies as UK;
//                                   ETF: handling 0.004 %, HKSCC 0.002 %, no CSRC/CSDC/stamp
//               GST 9 % on Webull's commission and platform fee and on SGX's fees.
//               No FX rate printed: a line in a currency SG cannot hold is N/A.
//   Canada, read 2026-10-21          https://www.webull.ca/pricing
//                                     https://www.webull.ca/help/faq/355
//               US / OTC, TSX, TSXV, NEX, CSE, Cboe Canada   $0
//               crypto              1 % markup / markdown in the price each way
//               FX                  exchange rate + 1.5 %
//   Australia, read 2026-10-21       https://www.webull.com.au/pricing
//               US                  $0
//               ASX / Cboe AU       shares 0.03 % (min A$1, GST in), ETFs $0
//               HK                  $0; trading 0.00565 % (min HK$0.01), settlement 0.002 %,
//                                   SFC 0.0027 % (min HK$0.01), FRC 0.00015 %,
//                                   stamp 0.13 % rounded up (min HK$1), as printed
//               China Connect       $0; stock and ETF levies as SG
//               FX                  50 pips (0.50 %)
//   Hong Kong, read 2026-10-21       https://www.webull.hk/en/pricing
//                                     https://www.webull.hk/en/help/faq/601-Popular-inquiries-about-currency-exchange
//               US / HK             $0; HK levies as SG, settlement without minimum
//               China Connect       commission 0 + platform CNY 15 an order; levies as SG
//               JP shares, ETFs     0.05 % (min JPY 80), platform 0
//               FX                  "Webull does not charge any fees for currency exchange"
//
// SEC 0.0000206 of the sale and TAF $0.000195 / $9.79 where the card
// names regulatory fees. CAT only where the card prints it. Stamp / FTT
// from taxMap by ISIN, except on Hong Kong and China Connect, whose stamp
// is the page's own line (taxMap carries none for those books). Tickets
// already in the number stay out of the remark. FX remarks show the
// one-way rate only, and only on a multi-currency entity whose rate is
// printed; where the listing currency cannot be held, FX is in the total.
//
// The 1 % crypto spread sits in the price, not on a ticket, so it is
// in `usd` and not in `brokerFees`. F-stock and NSCC illiquidity
// surcharges are named without a list of symbols and stay out.
//
//   node brokers/webullus/webullus_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/webulluk/webulluk_cost.mjs VOD LSE GBX --shares=100 --price=70 --plan=uk-meridian
//   node brokers/webullsg/webullsg_cost.mjs D05 SGX SGD --shares=10 --price=40
//   node brokers/webullhk/webullhk_cost.mjs 7203 Tokyo JPY --shares=100 --price=3000
//   node brokers/webullca/webullca_cost.mjs BTC --amount=1000
//   node brokers/webullus/webullus_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxGap, taxesOf, taxRates } from "../../taxMap.mjs";


const SCHEDULE = {
  us: ["https://www.webull.com/pricing", "https://www.webull.com/help/faq/11091-Fees-and-Limits"],
  uk: ["https://www.webull-uk.com/pricing"],
  eu: ["https://www.webull.eu/pricing", "https://www.webull.eu/help/faq/1289"],
  sg: ["https://www.webull.com.sg/pricing"],
  ca: ["https://www.webull.ca/pricing", "https://www.webull.ca/help/faq/355"],
  au: ["https://www.webull.com.au/pricing"],
  hk: ["https://www.webull.hk/en/pricing", "https://www.webull.hk/en/help/faq/601-Popular-inquiries-about-currency-exchange"],
  entity: "Webull Financial LLC",
  crd: "289063",
};

const DEFAULT_PLAN = "us";
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const TAF_MIN = 0.01;
const CAT_NMS = 0.000003;
const CAT_OTC = 0.00000003;
const OTC_LOW_PS = 0.0002;
const OTC_LOW_CAP = 0.05;
const OTC_LOW_SHARES = 100000;
const OTC_LOW_PRICE = 1;
const CRYPTO_SPREAD = 0.01;
const STABLES = new Set(["USDC"]);
const ADR_NAMED = /\bADRs?\b|american deposit|depositary receipt/i;

const LISTED_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const LISTED_CODES = /^(NASDAQ|NYSE|AMEX|ARCA|NYSEARCA|BATS|BZX|CBOE|IEX)$/;
const HK_CODES = /^(HKEX|SEHK|XGEM)$/;
const CHINA_CODES = /^(SHANGHAI|SHENZHEN|SSE|SZSE)$/;
const CHINA_MICS = new Set(["XSHG", "XSHE"]);

// Markets outside the US tape, by the catalogue's place name or by MIC.
const LOCAL_CODES = [
  [/^(LSE|LON|LONDON STOCK EXCHANGE)$/, "lse"],
  [/^(SGX|SES|SINGAPORE EXCHANGE)$/, "sgx"],
  [/^(TORONTO STOCK EXCHANGE|TSX|TSX VENTURE|TSXV|NEX|CANADIAN SECURITIES EXCHANGE|CSE|CBOE CANADA|NEO)$/, "canada"],
  [/^(ASX|CBOE AUSTRALIA|CHI-X AUSTRALIA)$/, "asx"],
  [/^(TOKYO|TSE|TOKYO STOCK EXCHANGE)$/, "tokyo"],
];
const LOCAL_MICS = {
  XLON: "lse",
  XSES: "sgx",
  XTSE: "canada",
  XTSX: "canada",
  XCNQ: "canada",
  NEOE: "canada",
  XASX: "asx",
  CXAC: "asx",
  XTKS: "tokyo",
};
// The currency each market's fees are printed in.
const FEE_CCY = { hk: "HKD", china: "CNH", lse: "GBP", sgx: "SGD", canada: "CAD", asx: "AUD", tokyo: "JPY" };

// Pass-through lines, as each entity's page prints them: a rate of the
// trade value (with a minimum when printed) or a flat amount, on both
// sides unless `sellOnly`. `stamp` lines go to taxes, the rest to the
// regulatory part. `dollarUp`: rounded up to the whole dollar.
const HK_TRADING = { name: "SEHK trading fee", rate: 0.0000565, min: 0.01 };
const HK_SFC = { name: "SFC levy", rate: 0.000027, min: 0.01 };
const HK_FRC = { name: "FRC levy", rate: 0.0000015 };
const HK_STAMP = { name: "stamp", rate: 0.001, min: 1, dollarUp: true, stamp: true };
const HK_LEVIES = {
  uk: [HK_TRADING, { name: "HKSCC settlement", rate: 0.000042 }, HK_SFC, HK_FRC, HK_STAMP],
  sg: [
    HK_TRADING,
    { name: "HKSCC settlement", rate: 0.000042, min: 0.01 },
    HK_SFC,
    HK_FRC,
    { ...HK_STAMP, etfExempt: true },
  ],
  // AU prints settlement at 0.002 % and stamp at 0.13 %; the card keeps the page.
  au: [
    HK_TRADING,
    { name: "HKSCC settlement", rate: 0.00002 },
    HK_SFC,
    HK_FRC,
    { ...HK_STAMP, rate: 0.0013 },
  ],
  hk: [
    HK_TRADING,
    { name: "HKSCC settlement", rate: 0.000042 },
    HK_SFC,
    HK_FRC,
    { ...HK_STAMP, etfExempt: true },
  ],
};
const CN_STOCK = [
  { name: "SSE/SZSE handling", rate: 0.0000341, min: 0.01 },
  { name: "CSRC management", rate: 0.00002, min: 0.01 },
  { name: "CSDC transfer", rate: 0.00001, min: 0.01 },
  { name: "HKSCC transfer", rate: 0.00002, min: 0.01 },
  { name: "stamp", rate: 0.0005, min: 0.01, sellOnly: true, stamp: true },
];
const CN_ETF = [
  { name: "SSE/SZSE handling", rate: 0.00004, min: 0.01 },
  { name: "HKSCC transfer", rate: 0.00002, min: 0.01 },
];
const SGX_LEVIES = [
  { name: "SGX clearing", rate: 0.000325, gst: true },
  { name: "SGX trading", rate: 0.000075, gst: true },
  { name: "SGX clearing SI", flat: 0.35, gst: true },
  { name: "SGX DA SI", flat: 0.35, gst: true },
];

// `local[market]`: Webull's own charge on a market outside the US tape,
// in that market's fee currency (FEE_CCY): `commission` and `platform`
// as { rate, min } or { flat }, `etfFree` when the page prints ETFs at 0,
// and the pass-through `levies` (by `stock` / `etf` when the page splits
// them). `fx`: the one-way markup when the listing currency is not held;
// null when the entity prints none. `fxBy` overrides it per market.
const PLANS = {
  us: {
    id: "us",
    name: "Webull US",
    hold: new Set(["USD"]),
    offers: new Set(["listed", "otc", "crypto"]),
    ticket: 0,
    ticketCcy: "USD",
    local: {},
    fx: 0,
    sec: true,
    taf: true,
    cat: true,
    url: "us",
    readOn: "2026-09-18",
  },
  "uk-go": {
    id: "uk-go",
    name: "Webull UK Go",
    hold: new Set(["GBP"]),
    offers: new Set(["listed", "hk", "china", "lse"]),
    ticket: 0,
    ticketCcy: "USD",
    local: {
      lse: { commission: { rate: 0.00075, min: 1 } },
      hk: { levies: HK_LEVIES.uk },
      china: { levies: { stock: CN_STOCK } },
    },
    fx: 0.005,
    fxBy: { china: 0.0035 },
    sec: true,
    taf: true,
    cat: true,
    url: "uk",
    readOn: "2026-10-21",
  },
  "uk-meridian": {
    id: "uk-meridian",
    name: "Webull UK Meridian",
    hold: new Set(["GBP"]),
    offers: new Set(["listed", "hk", "china", "lse"]),
    ticket: 0,
    ticketCcy: "USD",
    local: {
      lse: { commission: { rate: 0.0005, min: 0.5 } },
      hk: { levies: HK_LEVIES.uk },
      china: { levies: { stock: CN_STOCK } },
    },
    fx: 0.0035,
    sec: true,
    taf: true,
    cat: true,
    url: "uk",
    readOn: "2026-10-21",
  },
  eu: {
    id: "eu",
    name: "Webull Europe",
    hold: new Set(["EUR"]),
    offers: new Set(["listed"]),
    ticket: 1,
    ticketCcy: "USD",
    local: {},
    // FAQ 1289: "USD cannot be held in Webull EU accounts"; buys convert at 0.25 %.
    fx: 0.0025,
    sec: true,
    taf: true,
    cat: true,
    url: "eu",
    readOn: "2026-09-18",
  },
  sg: {
    id: "sg",
    name: "Webull Singapore",
    hold: new Set(["SGD", "USD", "HKD"]),
    offers: new Set(["listed", "otc", "sgx", "hk", "china"]),
    ticket: 0,
    ticketCcy: "USD",
    local: {
      sgx: {
        commission: { rate: 0.00025, min: 0.8 },
        platform: { rate: 0.00025, min: 0.8 },
        levies: SGX_LEVIES,
        newClientFree: true,
      },
      hk: { commission: { rate: 0.0003, min: 12 }, levies: HK_LEVIES.sg },
      china: { commission: { rate: 0.0002, min: 12 }, levies: { stock: CN_STOCK, etf: CN_ETF } },
    },
    gst: 0.09,
    fx: null,
    sec: true,
    taf: false,
    cat: true,
    url: "sg",
    readOn: "2026-10-21",
  },
  ca: {
    id: "ca",
    name: "Webull Canada",
    hold: new Set(["CAD", "USD"]),
    offers: new Set(["listed", "otc", "canada", "crypto"]),
    ticket: 0,
    ticketCcy: "USD",
    local: { canada: { commission: { flat: 0 } } },
    fx: 0.015,
    sec: true,
    // webull.ca/pricing prints TAF at $0 from October to December 2026.
    taf: false,
    cat: false,
    url: "ca",
    readOn: "2026-10-21",
  },
  au: {
    id: "au",
    name: "Webull Australia",
    hold: new Set(["AUD", "USD"]),
    offers: new Set(["listed", "asx", "hk", "china"]),
    ticket: 0,
    ticketCcy: "USD",
    local: {
      asx: { commission: { rate: 0.0003, min: 1 }, etfFree: true },
      hk: { levies: HK_LEVIES.au },
      china: { levies: { stock: CN_STOCK, etf: CN_ETF } },
    },
    fx: 0.005,
    sec: true,
    taf: true,
    cat: false,
    url: "au",
    readOn: "2026-10-21",
  },
  hk: {
    id: "hk",
    name: "Webull HK",
    hold: new Set(["HKD", "CNH", "USD"]),
    offers: new Set(["listed", "hk", "china", "tokyo"]),
    ticket: 0,
    ticketCcy: "USD",
    local: {
      hk: { levies: HK_LEVIES.hk },
      china: { platform: { flat: 15 }, levies: { stock: CN_STOCK, etf: CN_ETF } },
      tokyo: { commission: { rate: 0.0005, min: 80 } },
    },
    // FAQ 601: "Webull does not charge any fees for currency exchange."
    fx: 0,
    sec: true,
    taf: true,
    cat: false,
    url: "hk",
    readOn: "2026-10-21",
  },
};

const PLAN_ALIAS = {
  us: "us",
  usa: "us",
  "uk-go": "uk-go",
  uk: "uk-go",
  go: "uk-go",
  "uk-meridian": "uk-meridian",
  meridian: "uk-meridian",
  eu: "eu",
  europe: "eu",
  eea: "eu",
  sg: "sg",
  singapore: "sg",
  ca: "ca",
  canada: "ca",
  au: "au",
  australia: "au",
  hk: "hk",
  hongkong: "hk",
};

// One catalogue per Webull entity (brokers/webull<cc>/). Each entity's cost
// file builds its round trip with `makeRoundTrip`, which reads that folder's
// catalogue; this file keeps the fee card every entity shares.
function loadRows(url) {
  const data = fs.existsSync(url) ? JSON.parse(fs.readFileSync(url, "utf8")) : null;
  const list = Array.isArray(data) ? data : data?.rows || [];
  warmListingIndex(list);
  return { catalogue: data, rows: list };
}

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const settleCcy = (currency) => (code(currency) === "GBX" ? "GBP" : code(currency));
const isCrypto = (row) => code(row?.type) === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const isOverTheCounter = (row) => /^(OTC|PINK|GREY|OTCBB|OTCQX|OTCQB)$/i.test(String(row?.exchange || ""));
const cryptoBase = (ticker) => {
  const text = code(ticker);
  const cut = text.search(/[/_:-]/);
  if (cut >= 0) return text.slice(0, cut);
  return text.replace(/[-/]?(USD|USDT|USDC)$/i, "") || text;
};

const dollars = (amount, currency) => {
  // fx.mjs prices GBX in pence; settleCcy would read pence as pounds.
  const v = toUsd(amount, code(currency) || currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote_ = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(settleCcy(currency) || currency),
});

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

export function feeMarketOf(row, mic) {
  if (isCrypto(row)) return "crypto";
  const raw = code(row?.exchange);
  const m = code(mic);
  if (isOverTheCounter(row) || raw === "OTC") return "otc";
  if (CHINA_CODES.test(raw) || CHINA_MICS.has(m)) return "china";
  // An RMB counter on the Hong Kong exchange is a Hong Kong trade.
  if (HK_CODES.test(raw) || m === "XHKG") return "hk";
  for (const [re, market] of LOCAL_CODES) if (re.test(raw)) return market;
  if (LOCAL_MICS[m]) return LOCAL_MICS[m];
  if (code(row?.currency) === "CNH") return "china";
  if (LISTED_MICS.has(m) || LISTED_CODES.test(raw)) return "listed";
  return null;
}

const american = (market) => market === "listed" || market === "otc";

/** Webull's own ticket, in `ticketCcy`, on the US tape. */
export function commissionEach({ market, plan, shares, price, notional }) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  const n = Number(shares);
  const p = Number(price);
  const amt = Number(notional);
  if (!picked) return null;
  if (market === "crypto") return 0;
  if (!picked.offers.has(market) || !american(market)) return null;
  if (market === "otc" && picked.id === "us" && n > OTC_LOW_SHARES && p < OTC_LOW_PRICE && amt > 0) {
    return Math.min(n * OTC_LOW_PS, OTC_LOW_CAP * amt);
  }
  return picked.ticket;
}

const centUp = (v) => Math.ceil(v * 100 - 1e-9) / 100;
const isFund = (type) => /^(ETF|ETN|ETC)$/i.test(String(type || ""));

function charge(line, amount) {
  if (!line) return 0;
  if (line.flat != null) return line.flat;
  const v = line.rate * amount;
  return line.min != null ? Math.max(v, line.min) : v;
}

function levyEach(line, amount) {
  if (line.flat != null) return line.flat;
  if (line.dollarUp) return Math.max(Math.ceil(line.rate * amount - 1e-9), line.min ?? 0);
  return centUp(charge(line, amount));
}

/**
 * Round trip on a market outside the US tape, in its fee currency:
 * Webull's commission and platform fee (GST added where the entity says
 * so), the pass-through levies and the stamp the page prints. `amount` is
 * the order's value in that currency. null when the page has no line.
 */
export function localFees({ plan, market, amount, type }) {
  const spec = plan?.local?.[market];
  if (!spec || !(amount > 0)) return null;
  const fund = isFund(type);
  const levies = Array.isArray(spec.levies) ? spec.levies : spec.levies ? spec.levies[fund ? "etf" : "stock"] : [];
  if (!levies) return null;
  const gst = plan.gst || 0;
  const commissionSide = spec.etfFree && fund ? 0 : charge(spec.commission, amount);
  const platformSide = charge(spec.platform, amount);
  const webullSide = (commissionSide + platformSide) * (1 + gst);
  let regulatory = 0;
  let stamp = 0;
  let gstOnLevies = 0;
  const lines = [];
  for (const line of levies) {
    if (line.stamp && line.etfExempt && fund) continue;
    const each = levyEach(line, amount);
    const total = line.sellOnly ? each : 2 * each;
    if (line.stamp) stamp += total;
    else regulatory += total;
    if (line.gst) gstOnLevies += total * gst;
    lines.push(`${line.name} ${line.flat != null ? `${line.flat}` : `${+(line.rate * 100).toPrecision(4)} %`}${line.sellOnly ? " (vente)" : ""}`);
  }
  return {
    ccy: FEE_CCY[market],
    commissionSide,
    platformSide,
    webull: 2 * webullSide,
    regulatory: regulatory + gstOnLevies,
    stamp,
    gstOnLevies,
    lines,
  };
}

function findListing({ etf, place, currency, rows }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(rows, asked, (r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked) return true;
    return isCrypto(r) && loose(cryptoBase(r.ticker)) === asked;
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => code(r.currency) === wantCurrency)) ||
      crypto.find((r) => code(r.currency) === "USD") ||
      crypto[0];
    return { named, matches: [{ row, ...listingKey(row) }] };
  }

  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named.filter((r) => !isCrypto(r));
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage(rows, broker) {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = isCrypto(r)
      ? { leaf: { bp: CRYPTO_SPREAD * 1e4 }, mic: null }
      : spreadLeaf(spreads, {
          isin: r.isin,
          mic: venue?.mic ?? null,
          currency: r.currency,
          unsourced,
          broker,
          ticker: r.ticker,
        });
    const market = feeMarketOf(r, venue?.mic) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

function remarkOf({ plan, adr, fxNote, newClient }) {
  const lines = [];
  if (plan?.id?.startsWith("uk") && adr) lines.push("ADR custody $0.01–$0.03/share.");
  else if (adr) lines.push("ADR pass-through billed as incurred.");
  if (newClient) lines.push(newClient);
  if (fxNote) lines.push(fxNote);
  return lines.join("\n");
}

/**
 * The whole bill for buying `shares` at `price` (or putting `amount` into a
 * coin) and selling straight back. `usd` is the number the page prints;
 * `brokerFees` is Webull's own ticket and, when printed, the FX markup.
 */
function roundTripWith(
  { rows, catalogue, broker, folder },
  { etf, place, currency, shares, price, amount, bp = null, perShare = null, plan = DEFAULT_PLAN }
) {
  const picked = planOf(plan);
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan: picked?.id ?? plan,
    onlineBuy: true,
    cashCurrency: picked ? [...picked.hold][0] : "",
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan}` };
  if (!catalogue) {
    return {
      ...answer,
      why: `le catalogue Webull n'existe pas encore : lancer \`node brokers/${folder}/${folder}_scraping.mjs\``,
    };
  }

  const { named, matches } = findListing({ etf, place, currency, rows });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Webull` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Webull`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  const listingCcy = code(m.row.currency) || (crypto ? "USD" : null);
  const book = crypto
    ? { leaf: null, mic: null, assumed: false }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: listingCcy,
        unsourced: m.unsourced,
        broker,
        ticker: m.row.ticker,
      });
  const market = feeMarketOf(m.row, book.mic ?? m.venue?.mic);
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: crypto ? "Webull Crypto" : m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: listingCcy,
    brokerExchange: m.row.exchange || null,
    otc: isOverTheCounter(m.row),
    adr: ADR_NAMED.test(String(m.row.name || "")),
  };

  if (!market) {
    return {
      ...answer,
      listing,
      why: `${listing.brokerExchange || listing.exchange} n'a pas de palier publié chez Webull`,
    };
  }
  // Webull UK Go: the FTSE 100 and its own ETF shortlist only.
  if (picked.id === "uk-go" && m.row.go === false) {
    return { ...answer, listing, onlineBuy: false, why: `${picked.name} ne propose pas ce titre` };
  }
  if (!picked.offers.has(market)) {
    return {
      ...answer,
      listing,
      onlineBuy: false,
      why: `${picked.name} ne vend pas ce palier (${market})`,
    };
  }
  const local = !american(market) && market !== "crypto";
  if (local && !picked.local?.[market]) {
    return { ...answer, listing, why: `${picked.name} n'imprime pas de barème ${market}` };
  }
  if (local && !localFees({ plan: picked, market, amount: 1, type: listing.type })) {
    return {
      ...answer,
      listing,
      why: `${picked.name} n'imprime pas de ligne ${listing.type || "?"} sur le barème ${market}`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  // Hong Kong and China Connect: the stamp is the page's own line, so taxMap stays out.
  const venueStamp = market === "hk" || market === "china";
  const tax = crypto || venueStamp ? { known: true, buy: {}, sell: {} } : taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const gap = local && !venueStamp ? taxGap(listing.isin, listing.type, book.mic ?? m.venue?.mic ?? null) : null;
  const cashCcy = settleCcy(listing.currency);
  const holdable = picked.hold.has(cashCcy);
  const fxRate = picked.fxBy?.[market] ?? picked.fx;
  const fxPct = !crypto && !holdable ? fxRate : 0;
  const coin = cryptoBase(m.row.ticker || etf);
  const stable = crypto && STABLES.has(coin);
  // A multi-currency entity that prints its rate: the FX it would charge on cash in another currency.
  const fxNote =
    holdable && picked.hold.size > 1 && fxRate > 0 ? fxRemark((100 * fxRate).toFixed(2), listing.currency) : "";

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: holdable ? cashCcy : [...picked.hold][0] || "",
    remark: remarkOf({ plan: picked, adr: listing.adr, fxNote }),
    bp: crypto ? (stable ? 0 : CRYPTO_SPREAD * 1e4) : marketBp,
    perShare: marketPerShare,
    url: (SCHEDULE[picked.url] || SCHEDULE.us)[0],
    sources: SCHEDULE[picked.url] || SCHEDULE.us,
    basis: `barème ${picked.name}, palier ${market}, relu le ${picked.readOn}`,
    tax,
    ccy: QUOTE,
    fx: fxNote_(listing.currency),
    fxIfConverted: fxRate == null ? null : fxRate * 2,
  };

  if (fxPct == null) {
    return {
      ...shared,
      why: `change forcé non publié : ${cashCcy} n'est pas une devise de dépôt chez ${picked.name}, et aucun taux de conversion n'est imprimé`,
    };
  }
  if (gap) return { ...shared, why: gap };

  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  const notional = n > 0 && p > 0 ? n * p : crypto && cash > 0 ? cash : null;
  const each = local ? null : commissionEach({ market, plan: picked, shares: n, price: p, notional });
  const spec = picked.local?.[market];

  shared.commission = local
    ? {
        rate: spec.etfFree && isFund(listing.type) ? 0 : spec.commission?.rate ?? 0,
        min: spec.etfFree && isFund(listing.type) ? 0 : spec.commission?.min ?? spec.commission?.flat ?? 0,
        platform: spec.platform ?? null,
        gst: picked.gst || 0,
        currency: FEE_CCY[market],
        eachWay: true,
        plan: picked.id,
      }
    : {
        rate: 0,
        flat: crypto ? 0 : each,
        currency: picked.ticketCcy,
        eachWay: true,
        plan: picked.id,
        ...(crypto ? { spread: stable ? 0 : CRYPTO_SPREAD } : {}),
      };

  const notes = {
    picked,
    market,
    listing,
    leaf,
    marketBp,
    marketPerShare,
    unsourced: m.unsourced,
    via606: book.via606,
    fxPct,
    holdable,
    taxTotal,
    stable,
    coin,
  };

  if (notional == null) {
    return {
      ...shared,
      why: crypto
        ? "aucun montant"
        : !(n > 0)
          ? "aucun nombre de parts"
          : "aucun prix pour cette ligne : lancer node assets/prices.mjs",
      confidence: confidenceOf(notes),
    };
  }

  const notionalUsd = dollars(notional, crypto ? "USD" : listing.currency);
  const feeCcy = local ? FEE_CCY[market] : null;
  const feeAmount = local && notionalUsd != null && usdPer(feeCcy) ? notionalUsd / usdPer(feeCcy) : null;
  const venue = local ? localFees({ plan: picked, market, amount: feeAmount, type: listing.type }) : null;
  const inUsd = (x) => (x == null ? null : toUsd(x, feeCcy));

  const commissionUsd = local
    ? venue ? inUsd(venue.webull) : null
    : each == null ? null : dollars(each * 2, picked.ticketCcy);
  const spreadUsd = crypto ? (stable || notionalUsd == null ? 0 : notionalUsd * CRYPTO_SPREAD * 2) : 0;
  const bookUsd = crypto
    ? spreadUsd
    : marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const us = american(market);
  const secUsd = picked.sec && us && notionalUsd != null ? notionalUsd * SEC_RATE : 0;
  const tafRaw = picked.taf && us && n > 0 ? n * TAF_PER_SHARE : 0;
  const tafUsd = picked.taf && us ? Math.min(Math.max(tafRaw, tafRaw ? TAF_MIN : 0), TAF_CAP) : 0;
  const catRate = market === "otc" ? CAT_OTC : CAT_NMS;
  const catUsd = picked.cat && us && n > 0 ? n * catRate * 2 : 0;
  const levyUsd = local ? (venue ? inUsd(venue.regulatory) : null) : 0;
  const stampUsd = local ? (venue ? inUsd(venue.stamp) : null) : 0;
  const taxUsd = crypto || notionalUsd == null ? 0 : plus(notionalUsd * taxTotal, stampUsd);
  const fxUsd = fxPct && notionalUsd != null ? notionalUsd * fxPct * 2 : 0;
  const usd = plus(bookUsd, commissionUsd, secUsd, tafUsd, catUsd, levyUsd, taxUsd, fxUsd);
  const brokerFees = plus(commissionUsd, fxUsd);

  // SGX: the page waives the commission for a new client's first year. The
  // remark is the cut of Webull's own fees (commission + platform, GST in):
  // whole from 10 up, one decimal below.
  let newClient = "";
  if (spec?.newClientFree && venue && venue.webull > 0) {
    const raw = (100 * 2 * venue.commissionSide * (1 + (picked.gst || 0))) / venue.webull;
    const waived = raw >= 10 ? Math.round(raw) : Math.round(raw * 10) / 10;
    if (waived > 0) newClient = `New clients' first year: ${waived}% lower.`;
  }
  if (newClient) shared.remark = remarkOf({ plan: picked, adr: listing.adr, fxNote, newClient });

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
            m.unsourced?.why || "pas de feuille de carnet"
          }`,
        }
      : {}),
    trade: {
      shares: n > 0 ? n : null,
      price: p > 0 ? p : null,
      amount: crypto ? notional : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: crypto ? "USD" : listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      réglementaire: finite(plus(secUsd, tafUsd, catUsd, levyUsd), 6),
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
    },
    sell:
      us && (picked.sec || picked.taf)
        ? { sec: finite(secUsd, 6), taf: finite(tafUsd, 6), tafCapped: tafUsd >= TAF_CAP, cat: finite(catUsd, 6) }
        : null,
    confidence: confidenceOf({ ...notes, each, n, p, american: us, venue, spec }),
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
  via606,
  fxPct,
  holdable,
  taxTotal,
  stable,
  coin,
  each,
  n,
  p,
  american,
  venue,
  spec,
}) {
  const said = [];
  said.push(`barème ${picked.name} ${market}, relu le ${picked.readOn}`);
  if (market === "crypto") {
    said.push(
      stable
        ? `USDC : le 1 % ne s'applique pas aux stablecoins`
        : `spread ${CRYPTO_SPREAD * 100} % par jambe, dans le prix, pas un ticket`
    );
  } else if (spec) {
    const ccy = FEE_CCY[market];
    const fund = isFund(listing.type);
    const c = spec.commission;
    if (spec.etfFree && fund) said.push(`courtage 0 sur un ETF`);
    else if (c?.rate) said.push(`courtage ${+(c.rate * 100).toPrecision(4)} % par jambe, minimum ${c.min} ${ccy}`);
    else said.push(`courtage 0`);
    if (spec.platform?.rate) said.push(`frais de plateforme ${+(spec.platform.rate * 100).toPrecision(4)} %, minimum ${spec.platform.min} ${ccy}`);
    else if (spec.platform?.flat) said.push(`frais de plateforme ${spec.platform.flat} ${ccy} par ordre`);
    if (picked.gst) said.push(`GST ${picked.gst * 100} % sur le courtage, la plateforme et les frais SGX`);
    if (venue?.lines?.length) said.push(`frais de place imprimés : ${venue.lines.join(", ")}`);
    if (market === "hk" || market === "china") said.push(`droit de timbre pris sur la page, pas dans taxMap`);
  } else if (each) {
    said.push(`ticket ${each} ${picked.ticketCcy} par jambe`);
  } else {
    said.push(`courtage 0`);
  }
  if (market === "otc" && picked.id === "us") {
    said.push(
      n > OTC_LOW_SHARES && p < OTC_LOW_PRICE
        ? `surcharge OTC ${OTC_LOW_PS} $/part, plafond ${OTC_LOW_CAP * 100} %`
        : `surcharge OTC $0.0002 / part seulement au-delà de ${OTC_LOW_SHARES} parts sous $1`
    );
  }
  if (fxPct) {
    said.push(
      `change ${(fxPct * 100).toFixed(2)} % × 2 : ${listing.currency} n'est pas tenu, donc dans le total`
    );
  } else if (!holdable && market !== "crypto") {
    said.push(
      fxPct === 0
        ? `change à 0 : ${listing.currency} n'est pas tenu, et l'entité dit ne prendre aucun frais de change`
        : `change hors du total : ${listing.currency} n'est pas une devise de caisse imprimée, et aucun % n'est publié`
    );
  } else if (holdable && market !== "crypto") {
    said.push(`change hors du total : le compte tient déjà ${settleCcy(listing.currency)}`);
  }
  if (american && picked.sec) {
    said.push(
      `SEC ${SEC_RATE} du montant à la vente` +
        (picked.taf ? ` et TAF ${TAF_PER_SHARE} $/part, plancher ${TAF_MIN} $, plafond ${TAF_CAP} $` : "")
    );
  } else if (american && !picked.sec) {
    said.push(`SEC / TAF non nommés sur cette carte`);
  }
  if (american && picked.cat) {
    said.push(
      `CAT ${market === "otc" ? CAT_OTC : CAT_NMS} $/part les deux jambes` +
        (picked.id === "us" ? ` (la page US dit « Total Trade Volume », le UK dit « per Share »)` : "")
    );
  }
  if (taxTotal) said.push(`taxe à l'achat ${(100 * taxTotal).toFixed(2)} % du montant, depuis taxMap.mjs`);
  if (market === "crypto" && coin === "PAXG") {
    said.push(`PAXG n'est pas un stablecoin : le 1 % tient`);
  } else if (market !== "crypto" && marketBp != null) {
    said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  } else if (marketPerShare != null) {
    said.push(
      via606
        ? `carnet 605 × Q Webull, ${marketPerShare} $ la part`
        : `carnet NBBO reconstitué, ${marketPerShare} $ la part`
    );
  } else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${
        unsourced?.why || "pas de source"
      }`
    );
  }
  said.push(`aucun aller-retour réel dans ce dépôt`);
  if (!leaf && market !== "crypto") said.push(`carnet absent pour cette ligne`);
  return said.join(" ; ");
}

/**
 * The round trip of one entity's folder: `plans` are the plan ids that folder
 * shows (one, or Go and Meridian for the UK), `defaultPlan` the first.
 */
export function makeRoundTrip({ catalogueUrl, folder, broker = folder, plans }) {
  const ctx = { ...loadRows(catalogueUrl), broker, folder };
  const defaultPlan = plans[0];
  const roundTrip = (query = {}) => {
    const asked = planOf(query.plan || defaultPlan);
    const plan = asked && plans.includes(asked.id) ? asked.id : query.plan ? query.plan : defaultPlan;
    if (!plans.includes(planOf(plan)?.id)) {
      return { usd: null, brokerFees: null, ccy: QUOTE, plan, why: `formule inconnue chez ${folder} : ${plan}` };
    }
    return roundTripWith(ctx, { ...query, plan });
  };
  roundTrip.coverage = () => coverage(ctx.rows, broker);
  roundTrip.plans = plans;
  return roundTrip;
}

/** The CLI every entity's cost file runs: `runCli(import.meta.url, roundTrip)`. */
export function runCli(url, roundTrip) {
  if (url !== `file://${process.argv[1]}`) return;
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          plans: Object.fromEntries(
            roundTrip.plans.map((id) => [id, { ...PLANS[id], hold: [...PLANS[id].hold], offers: [...PLANS[id].offers] }])
          ),
          sec: SEC_RATE,
          taf: { perShare: TAF_PER_SHARE, min: TAF_MIN, cap: TAF_CAP },
          cat: { nms: CAT_NMS, otc: CAT_OTC },
          crypto: { spread: CRYPTO_SPREAD, stables: [...STABLES] },
          coverage: roundTrip.coverage(),
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
      "usage : node brokers/webull<cc>/webull<cc>_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=a] [--plan=…] [--json]\n" +
        "        node brokers/webull<cc>/webull<cc>_cost.mjs --schedule\n" +
        "  ex.   node brokers/webullus/webullus_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node brokers/webulluk/webulluk_cost.mjs AAPL NASDAQ USD --plan=uk-go --shares=10 --price=230"
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
    plan: flag("plan") || undefined,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce que Webull propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.plan}]\n`
  );

  if (out.trade) {
    const t = out.trade;
    if (t.amount != null) {
      console.log(`${t.amount} $ de crypto\n`);
    } else {
      console.log(
        `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
          (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
          "\n"
      );
    }
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.réglementaire) console.log(`  réglementaire  : ${parts.réglementaire} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    if (parts.change) console.log(`  change         : ${parts.change} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
