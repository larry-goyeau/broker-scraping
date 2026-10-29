// What one round trip costs at Caucasus Capital: buy n shares at price p,
// sell them straight back, online, in dollars.
//
// Caucasus Capital (Caucasus Capital Group, Tbilisi) is an introducing broker
// of Interactive Brokers: the accounts are carried by Interactive Brokers
// LLC (see caucasus_scraping.mjs). Its commission page prints its own card,
// IBKR's Fixed layout with Caucasus Capital's rates and a "ticket charge" on
// every trade. Read on 2026-10-28 (the Exceptions PDF the US row links to is
// a 404; the Global X, Infrastructure and O'Shares ETF rows are inside an
// HTML comment, not shown, so every US line takes the "All" row):
//
//   https://capital.ge/commissions/   (tab Stocks, Warrants and ETFs; Forex)
//
// Commission, each side ("Fixed", stocks and ETFs):
//
//   United States    USD 0.015 a share, min USD 1, max 1.5 % of the trade;
//                    "in the event the calculated maximum per order is less
//                    than the minimum per order, the minimum ... will be
//                    assessed". NMS, OTCBB and Pink Sheet stocks alike.
//   Canada           CAD 0.02 a share, min CAD 1, max 1.5 % (one line: it
//                    prices the USD lines of TSX, Venture and Cboe Canada
//                    too, in CAD)
//   Mexico           0.3 %, min MXN 60
//   Austria          0.105 %, min EUR 4, max EUR 120
//   Belgium          0.105 %, min EUR 4, max EUR 29
//   France           EUR 0.105 %, min 4, max 29 / USD 0.3 %, min 1, max 42
//   Germany          Stuttgart 0.126 %, min EUR 6; Frankfurt (FWB) 0.105 %,
//                    min 4, max 99, "Plus Trade Fee"; "Chi-X / BATS /
//                    Turquoise DE / Tradegate" 0.105 %, min 4, max 29;
//                    Xetra 0.105 %, min 4, max 85 (ETFs; ETCs and ETNs, the
//                    same XTF segment) or 290 (stocks)
//   Italy            0.1 %, min EUR 4, max 29 (Euronext Milan, ETFplus)
//   Netherlands      EUR 0.105 %, min 4, max 29 / USD 0.3 %, min 5, max 42
//   Norway           0.09 %, min NOK 49
//   Portugal         0.1575 %, min EUR 4
//   Spain            0.105 %, min EUR 4
//   Sweden           0.09 %, min SEK 49 (one line: EUR lines too)
//   Switzerland      CHF 0.15 %, min 10 / EUR 0.105 %, min 10 / USD 0.3 %,
//                    min 10 / GBP 0.2 %, min 6
//   United Kingdom   GBP 6 up to GBP 50,000, then GBP 6 + 0.1 % of the part
//                    above, max GBP 85; "LSE International Order Book and
//                    USD-denominated stocks" 0.095 %, min USD 5; EUR 0.105 %,
//                    min 4, max 29
//   Australia        0.1 %, min AUD 6 (ASX, Cboe Australia)
//   Hong Kong        SEHK stocks 0.14 %, min HKD 18 (HKD, USD and CNH lines)
//   Stock Connect    "Shanghai-Hong Kong Connect Stocks" 0.14 %, min CNH 15
//   Japan            0.14 %, min JPY 80
//   Singapore        0.14 %, min SGD 2.50 / USD 2.00 / HKD 18.00
//
// Ticket charges, each trade, "for respective currency denominated stocks
// and ETFs": North America USD 13, CAD 13, MXN 120; Europe USD 13, EUR 6,
// GBP 6, CHF 7, NOK 56, SEK 51; Asia-Pacific USD 13, AUD 8, HKD 127, CNH
// 105, JPY 1320, SGD 19.5.
//
// What the page passes on, on top:
//   - US "transaction fees ... only charged for sell orders": the SEC fee.
//     The page prints 0.0000218; the regulator's rate is used, rounded up to
//     the cent (wellstrade/usCost.mjs secFee). No TAF or CAT is named: 0.
//   - Frankfurt "Plus Trade Fee", no figure: Interactive Brokers LLC's own
//     FWB page, the carrying broker (owner's rule for IBKR introducers),
//     0.0504 % of the trade, min EUR 2.52 an order.
//   - Hong Kong: "all external costs will be passed through": exchange
//     trading fee, tariff, settlement fee, stamp 0.1 % rounded up to the
//     dollar (stocks only), SFC levy 0.0027 % (stocks and warrants). The
//     figures it does not print are IBKR LLC's SEHK page: exchange 0.00565 %,
//     clearing 0.0042 %, FRC levy 0.00015 % (stocks); it prints no tariff.
//   - Stock Connect (in the Hong Kong table): IBKR LLC's Northbound page,
//     handling 0.00341 % (ETF 0.004 %), securities management 0.002 % and
//     transfer 0.001 % (both waived on ETFs) each side, stamp 0.05 % on the
//     sale of a stock.
//   - Stamp taxes "(UK=0.5%, Ireland=1%) are directly passed through", the
//     French and Italian FTT: taxMap.mjs by ISIN (taxGap = N/A); UK and Irish
//     stamp only on their home books. The PTM levy, GBP 1.50 a side above
//     GBP 10,000 on a UK-registered share (statutory, as the siblings).
//   Elsewhere "all exchange and regulatory fees are included".
// Not priced: the exchange fees the US and Canadian max carries (note 1,
// "plus the applicable exchange, ECN and/or specialist fees"; the venue is
// not known, as in ibkrca_cost.mjs); VAT "where applicable" (no rate).
//
// Stand-ins and N/A:
//   - Shenzhen Connect (with ChiNext) and the STAR Market are not on the
//     card; the catalogue keeps them (owner's rule of 2026-10-28). They take
//     the "Shanghai-Hong Kong Connect Stocks" row: the same Northbound link,
//     one IBKR fee page for both.
//   - Cboe Europe and Turquoise: the card prints only the German books
//     ("Chi-X / BATS / Turquoise DE"). A line takes the country its IBKR
//     book names (CHIXUK -> United Kingdom, CHIXCH -> Switzerland, CHIXEN ->
//     Euronext, VSE -> Austria, SBF -> France, FWB / SWB / TGATE -> the
//     German MTF row ...). Euronext USD lines take the Netherlands USD row
//     (min USD 5, the higher of France and Netherlands).
//   - N/A: Denmark (DKK lines on Cboe Europe and Turquoise; no Danish row,
//     no DKK ticket), a GBP line in Paris, JPY and CAD lines on SIX, EUR,
//     GBP and CNH lines in Singapore (no minimum printed in that currency).
//
// FX: every market currency of the catalogue is a cash currency
// (deposits.mjs), so FX is a remark: the Forex tab's 0.60 basis point of
// the trade value (first tier), min USD 2, plus a ticket in the contract's
// currency (USD 5, EUR 5, GBP 4, CHF 5, JPY 500 ...): "FX 0.006% (min USD 2)
// + EUR 5 ticket when cash ≠ EUR.".
//
// US book: Interactive Brokers LLC's 606 Q (spreadLeaf, broker
// "interactivebrokers"), the carrying broker. Not in the number: custody
// (none printed), market data, withdrawals.
//
//   node brokers/caucasus/caucasus_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/caucasus/caucasus_cost.mjs SAP XFRA EUR --shares=10 --price=220
//   node brokers/caucasus/caucasus_cost.mjs 7203 XTKS JPY --shares=100 --price=2800
//   node brokers/caucasus/caucasus_cost.mjs 700 XHKG HKD --shares=100 --price=500
//   node brokers/caucasus/caucasus_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";
import { secFee, secRate } from "../wellstrade/usCost.mjs";

export const READ_ON = "2026-10-28";

const FOLDER = "caucasus";
const ENTITY = "Caucasus Capital";
const CATALOGUE = new URL("caucasus-parsed.json", import.meta.url);
const PAGE = "https://capital.ge/commissions/";
const IB_FEES = "https://www.interactivebrokers.com/en/accounts/fees/";

// Forex tab, first tier: 0.60 bp of the trade value, min USD 2, and a ticket
// in the contract's currency.
const FX = { rate: 0.00006, label: "0.006", minUsd: 2 };
const FX_TICKET = {
  USD: 5, CAD: 7, MXN: 90, EUR: 5, GBP: 4, CHF: 5, NOK: 30, SEK: 30, DKK: 30, AUD: 7, JPY: 500, NZD: 8,
  HKD: 40, SGD: 7, ZAR: 80, ILS: 20, KRW: 11000, CNH: 30, CZK: 125, HUF: 1500, PLN: 20,
};

// Ticket charges per trade, by region, in the listing currency.
const TICKET = {
  na: { USD: 13, CAD: 13, MXN: 120 },
  eu: { USD: 13, EUR: 6, GBP: 6, CHF: 7, NOK: 56, SEK: 51 },
  ap: { USD: 13, AUD: 8, HKD: 127, CNH: 105, JPY: 1320, SGD: 19.5 },
};

// IBKR LLC's third-party figures for what the card names without one.
const FWB_TRADE = { rate: 0.000504, min: 2.52 };
const HK = { exchange: 0.0000565, clearing: 0.000042, sfc: 0.000027, frc: 0.0000015, stamp: 0.001 };
const CONNECT = { handling: 0.0000341, handlingEtf: 0.00004, management: 0.00002, transfer: 0.00001, stamp: 0.0005 };
const PTM = { each: 1.5, ccy: "GBP", above: 10000 };
const UK_REGISTERED = /^(GB|GG|JE|IM)/;
const STAMP_HOME = {
  GB: new Set(["XLON", "AQXE", "XMSM", "CHIX", "TRQX"]),
  IE: new Set(["XMSM", "XLON", "AQXE", "CHIX", "TRQX"]),
};

const pct = (rate, min, ccy, max = null) => ({ rate, min, ccy, max });
const eur105 = (max) => pct(0.00105, 4, "EUR", max);

// Fee markets. `byCcy` is a country the card prints by currency; `any` is a
// country printed on one line (every currency on it, in the line's own).
const MARKETS = {
  us: { label: "États-Unis", region: "na", any: { perShare: 0.015, min: 1, maxPct: 0.015, ccy: "USD" } },
  ca: { label: "Canada", region: "na", any: { perShare: 0.02, min: 1, maxPct: 0.015, ccy: "CAD" } },
  mx: { label: "Mexique", region: "na", any: pct(0.003, 60, "MXN") },
  at: { label: "Autriche", region: "eu", any: eur105(120) },
  be: { label: "Belgique", region: "eu", any: eur105(29) },
  fr: { label: "France", region: "eu", byCcy: { EUR: eur105(29), USD: pct(0.003, 1, "USD", 42) } },
  nl: { label: "Pays-Bas", region: "eu", byCcy: { EUR: eur105(29), USD: pct(0.003, 5, "USD", 42) } },
  en: { label: "Euronext (Cboe / Turquoise, livre EN)", region: "eu", byCcy: { EUR: eur105(29), USD: pct(0.003, 5, "USD", 42) } },
  swb: { label: "Allemagne (Stuttgart)", region: "eu", any: pct(0.00126, 6, "EUR") },
  fwb: { label: "Allemagne (Francfort, FWB)", region: "eu", any: eur105(99), tradeFee: true },
  dem: { label: "Allemagne (Chi-X / BATS / Turquoise DE / Tradegate)", region: "eu", any: eur105(29) },
  xetra: { label: "Allemagne (Xetra)", region: "eu", any: eur105(290), etf: eur105(85) },
  it: { label: "Italie", region: "eu", any: pct(0.001, 4, "EUR", 29) },
  no: { label: "Norvège", region: "eu", any: pct(0.0009, 49, "NOK") },
  pt: { label: "Portugal", region: "eu", any: pct(0.001575, 4, "EUR") },
  es: { label: "Espagne", region: "eu", any: eur105(null) },
  se: { label: "Suède", region: "eu", any: pct(0.0009, 49, "SEK") },
  ch: {
    label: "Suisse",
    region: "eu",
    byCcy: { CHF: pct(0.0015, 10, "CHF"), EUR: pct(0.00105, 10, "EUR"), USD: pct(0.003, 10, "USD"), GBP: pct(0.002, 6, "GBP") },
  },
  uk: {
    label: "Royaume-Uni",
    region: "eu",
    byCcy: {
      GBP: { flat: 6, band: 50000, above: 0.001, min: 6, max: 85, ccy: "GBP" },
      USD: pct(0.00095, 5, "USD"),
      EUR: eur105(29),
    },
    iob: pct(0.00095, 5, "USD"),
  },
  dk: { label: "Danemark", region: "eu" },
  au: { label: "Australie", region: "ap", any: pct(0.001, 6, "AUD") },
  hk: { label: "Hong Kong", region: "ap", any: pct(0.0014, 18, "HKD") },
  connect: { label: "Stock Connect (Shanghai-Hong Kong Connect Stocks)", region: "ap", any: pct(0.0014, 15, "CNH") },
  jp: { label: "Japon", region: "ap", any: pct(0.0014, 80, "JPY") },
  sg: {
    label: "Singapour",
    region: "ap",
    byCcy: { SGD: pct(0.0014, 2.5, "SGD"), USD: pct(0.0014, 2, "USD"), HKD: pct(0.0014, 18, "HKD") },
  },
};

const BY_MIC = {
  XNAS: "us", XNYS: "us", ARCX: "us", XASE: "us", BATS: "us", TXSE: "us", OTCM: "us",
  XTSE: "ca", XTSX: "ca", NEOE: "ca",
  XMEX: "mx",
  XWBO: "at",
  XBRU: "be",
  XPAR: "fr",
  XAMS: "nl",
  XSTU: "swb",
  XFRA: "fwb",
  XGAT: "dem",
  XETR: "xetra",
  XMIL: "it",
  XOSL: "no",
  XLIS: "pt",
  XMAD: "es",
  XSTO: "se",
  XSWX: "ch",
  XLON: "uk",
  XASX: "au", CHIA: "au",
  XHKG: "hk",
  XSHG: "connect", XSHE: "connect",
  XTKS: "jp",
  XSES: "sg",
};
// Cboe Europe and Turquoise: the IBKR book of the line names the country.
const MTF = new Set(["CHIX", "TRQX"]);
const MTF_BOOK = {
  CHIXUK: "uk", TRQXUK: "uk",
  CHIXCH: "ch", TRQXCH: "ch",
  CHIXES: "es", TRQXES: "es",
  CHIXIT: "it",
  CHIXEN: "en", DXEEN: "en", TRQXEN: "en", TGHEEN: "en",
  DXEDK: "dk", TGHEDK: "dk",
  VSE: "at", SBF: "fr", "ENEXT.BE": "be", AEB: "nl",
  FWB: "dem", SWB: "dem", TGATE: "dem", IBIS: "dem",
  BVME: "it", "BVME.ETF": "it", BM: "es", EBS: "ch", LSE: "uk", LSEETF: "uk",
  SFB: "se", OSE: "no", BVL: "pt",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
// Pence settle in pounds. CNH stays CNH on the card; fx.mjs reads it at the
// CNY mid.
const cashOf = (s) => (code(s) === "GBX" ? "GBP" : code(s));
const fxCode = (s) => (cashOf(s) === "CNH" ? "CNY" : cashOf(s));
const isStock = (listing) => code(listing?.type) === "STOCK";
const isEtfLike = (listing) => ["ETF", "ETC", "ETN"].includes(code(listing?.type));
// IBKR's book of the scraped line ("SEHKNTL", "CHIXUK", "LSEIOB1" ...).
const ibkrBook = (row) => code(String(row?.raw || "").split(" | ")[4]);
const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const v = toUsd(amount, fxCode(currency));
  return v == null ? null : Number(v.toPrecision(12));
};
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  const a = fxCode(from);
  const b = fxCode(to);
  if (a === b) return amount;
  const usd = toUsd(amount, a);
  const per = usdPer(b);
  return usd == null || !(per > 0) ? null : usd / per;
}
const num = (x) => String(x).replace(".", ",");
const pctText = (rate) => `${num(Number((100 * rate).toPrecision(6)))} %`;

/** The fee market of a catalogue row: its venue, or on an MTF its IBKR book. */
export function feeMarketOf(row, mic) {
  const m = code(mic || row?.mic);
  if (MTF.has(m)) return MTF_BOOK[ibkrBook(row)] ?? null;
  return BY_MIC[m] ?? null;
}

/** The card's rule for a market, a currency and a line. */
export function ruleOf(market, currency, { listing = null, book = "" } = {}) {
  const table = MARKETS[market];
  if (!table) return null;
  if (table.iob && book === "LSEIOB1") return table.iob;
  if (table.etf && isEtfLike(listing)) return table.etf;
  return table.any ?? table.byCcy?.[cashOf(currency)] ?? null;
}

/**
 * One side's commission in the rule's currency; `amount` is in that
 * currency. Per share: the cap binds the per-share amount, then the minimum
 * binds the result (the card's note: under the minimum, the minimum is
 * assessed). Percent: the minimum, then the maximum.
 */
export function commissionSide(rule, { shares, amount }) {
  if (!rule || !(amount > 0)) return null;
  let raw;
  let charged;
  let capped = false;
  if (rule.perShare != null) {
    raw = rule.perShare * Number(shares);
    const cap = amount * rule.maxPct;
    capped = cap < raw;
    charged = Math.max(rule.min, capped ? cap : raw);
  } else if (rule.flat != null) {
    raw = rule.flat + rule.above * Math.max(0, amount - rule.band);
    capped = raw > rule.max;
    charged = Math.max(rule.min, Math.min(rule.max, raw));
  } else {
    raw = amount * rule.rate;
    charged = Math.max(rule.min, raw);
    if (rule.max != null && charged > rule.max) {
      charged = rule.max;
      capped = true;
    }
  }
  return { raw, charged, capped: capped && charged > rule.min, floored: charged === rule.min && raw < rule.min, currency: rule.ccy };
}

function ruleText(rule) {
  if (rule.perShare != null) {
    return `${num(rule.perShare)} ${rule.ccy} la part, plancher ${num(rule.min)} ${rule.ccy}, plafond ${pctText(rule.maxPct)} (sous le plancher, le plancher)`;
  }
  if (rule.flat != null) {
    return `${rule.flat} ${rule.ccy} jusqu'à ${rule.band} ${rule.ccy}, puis ${rule.flat} + ${pctText(rule.above)} au-delà, plafond ${rule.max} ${rule.ccy}`;
  }
  return `${pctText(rule.rate)} par sens, plancher ${num(rule.min)} ${rule.ccy}` + (rule.max != null ? `, plafond ${num(rule.max)} ${rule.ccy}` : "");
}

/**
 * Third-party fees the card passes on, both sides together, in the listing
 * currency: `broker` is billed with the commission (exchange and clearing),
 * `levy` is regulatory or statutory. US SEC is in dollars, apart.
 */
function passedOn({ market, listing, notional, settle, n }) {
  const out = { broker: 0, levy: 0, secUsd: 0, said: [] };
  const stock = isStock(listing);
  const etf = isEtfLike(listing);
  if (market === "us") {
    const notionalUsd = dollars(notional, settle);
    out.secUsd = secFee(notionalUsd, "up");
    out.said.push(`frais de transaction à la vente : SEC ${secRate()} au taux du régulateur, au centime supérieur (la page imprime 0,0000218) ; ni TAF ni CAT nommées : 0`);
  } else if (market === "fwb") {
    const eur = convert(notional, settle, "EUR");
    const side = eur == null ? null : Math.max(FWB_TRADE.min, eur * FWB_TRADE.rate);
    out.broker = side == null ? null : 2 * convert(side, "EUR", settle);
    out.said.push(`« Plus Trade Fee » sans chiffre : frais de négociation FWB d'IBKR LLC, 0,0504 % (min 2,52 €) par sens (${IB_FEES}FWBStkFees.php)`);
  } else if (market === "hk") {
    out.broker = 2 * notional * (HK.exchange + HK.clearing);
    if (stock) {
      const stamp = settle === "HKD" ? Math.ceil(notional * HK.stamp - 1e-9) : notional * HK.stamp;
      out.levy = 2 * (notional * (HK.sfc + HK.frc) + stamp);
    }
    out.said.push(
      `frais externes de Hong Kong répercutés : bourse 0,00565 % et compensation 0,0042 % par sens (page SEHK d'IBKR LLC, ${IB_FEES}SEHK-StkFees.php)` +
        (stock ? ", SFC 0,0027 %, FRC 0,00015 % et timbre 0,1 % par sens sur une action" + (settle === "HKD" ? " (timbre au HKD supérieur)" : "") : " ; ETF : ni timbre ni SFC"),
    );
  } else if (market === "connect") {
    const side = etf ? CONNECT.handlingEtf : CONNECT.handling + CONNECT.management + CONNECT.transfer;
    out.broker = 2 * notional * side;
    out.levy = stock ? notional * CONNECT.stamp : 0;
    out.said.push(
      etf
        ? `Stock Connect, ETF : frais de traitement 0,004 % par sens, gestion et transfert exonérés (page Northbound d'IBKR LLC, ${IB_FEES}SEHKNTL-Fees.php)`
        : `Stock Connect : traitement 0,00341 %, gestion 0,002 % et transfert 0,001 % par sens, timbre 0,05 % à la vente (page Northbound d'IBKR LLC, ${IB_FEES}SEHKNTL-Fees.php)`,
    );
  } else if (market === "uk" && stock && UK_REGISTERED.test(listing.isin || "")) {
    const gbp = convert(notional, settle, PTM.ccy);
    if (gbp == null) out.levy = null;
    else if (gbp > PTM.above) {
      out.levy = 2 * convert(PTM.each, PTM.ccy, settle);
      out.said.push(`prélèvement PTM ${num(PTM.each)} £ par sens, le montant dépasse ${PTM.above} £`);
    }
  }
  return out;
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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `brokerFees` is Caucasus Capital's commission and tickets both ways plus
 * the exchange and clearing fees it passes on.
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
    cashCurrency: "USD",
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Caucasus Capital n'existe pas encore : lancer `node brokers/caucasus/caucasus_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Caucasus Capital` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Caucasus Capital`,
      alternatives: named.slice(0, 12).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`),
    };
  }

  const m = matches[0];
  // US orders are carried by Interactive Brokers LLC: its 606 Q on the tape.
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "interactivebrokers",
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
    ibkrBook: ibkrBook(m.row) || null,
  };

  const settle = cashOf(listing.currency);
  const held = depositHas(FOLDER, null, settle);
  const market = feeMarketOf(m.row, m.row.mic);
  const table = market ? MARKETS[market] : null;
  const rule = market ? ruleOf(market, settle, { listing, book: listing.ibkrBook }) : null;
  const ticket = table ? TICKET[table.region]?.[settle] ?? null : null;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = givenPerShare ?? book.leaf?.perShare ?? null;
  const fxTicket = FX_TICKET[settle];

  const remarks = [m.row.remark || ""];
  if (held && settle !== "USD") {
    remarks.push(`FX ${FX.label}% (min USD ${FX.minUsd})${fxTicket != null ? ` + ${settle} ${fxTicket} ticket` : ""} when cash ≠ ${settle}.`);
  }
  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: held ? settle : "USD",
    remark: remarks.filter(Boolean).join("\n"),
    bp: marketBp,
    perShare: marketPerShare,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(fxCode(settle)) },
    fxIfConverted: held ? 2 * FX.rate : 0,
  };

  if (!rule || ticket == null) {
    return {
      ...shared,
      basis: `${ENTITY}, grille Fixed relue le ${READ_ON}`,
      why: !table
        ? `${listing.brokerExchange || listing.exchange || "cette place"} (${listing.ibkrBook || listing.mic}) n'est pas sur la grille ${ENTITY} du ${READ_ON}`
        : !table.any && !table.byCcy
          ? `${table.label} n'est pas sur la grille ${ENTITY} du ${READ_ON}`
          : !rule
            ? `${ENTITY} n'imprime pas de ligne ${settle} pour ${table.label}`
            : `${ENTITY} n'imprime pas de ticket charge ${settle} pour ${table.label}`,
    };
  }
  if (!held) {
    // Every catalogue currency is a cash currency today; a new one would
    // need its conversion priced in the total.
    return { ...shared, why: `${settle} n'est pas une devise de dépôt : conversion forcée non chiffrée ici` };
  }

  const standIn =
    market === "connect" && listing.mic === "XSHE"
      ? "Shenzhen Connect absent de la grille : ligne « Shanghai-Hong Kong Connect Stocks » (même lien Northbound, même page de frais IBKR)"
      : market === "connect" && listing.ibkrBook === "SEHKSTAR"
        ? "STAR Market absent de la grille : ligne « Shanghai-Hong Kong Connect Stocks »"
        : MTF.has(code(m.row.mic))
          ? `${listing.brokerExchange} : ligne du pays du livre IBKR ${listing.ibkrBook} (${table.label})`
          : market === "ca" && settle !== "CAD"
            ? "ligne Canada imprimée sans devise : commission en CAD sur une ligne en dollars américains"
            : null;
  const basis =
    `${ENTITY}, grille Fixed relue le ${READ_ON}, ${table.label} : ${ruleText(rule)}, ticket charge ${ticket} ${settle} par ordre` +
    (standIn ? ` ; ${standIn}` : "");

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
  const ticketUsd = dollars(2 * ticket, settle);

  const third = passedOn({ market, listing, notional, settle, n });
  const passedBrokerUsd = third.broker == null ? null : dollars(third.broker, settle);
  const brokerFees = plus(commissionUsd, ticketUsd, passedBrokerUsd);
  const leviesUsd = plus(third.levy == null ? null : dollars(third.levy, settle), third.secUsd);

  // Taxes the page names (UK, Irish stamp; French, Italian FTT), by ISIN.
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const country = (listing.isin || "").slice(0, 2);
  const stampReaches = !STAMP_HOME[country] || STAMP_HOME[country].has(code(m.row.mic));
  const taxPct = stampReaches ? Object.values(rates).reduce((s, r) => s + r, 0) : 0;
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;

  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (v) => dollars(v, settle),
  });
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, leviesUsd, taxUsd);

  const unknown = [
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
    notionalUsd == null ? `aucun cours en dollars pour ${settle} dans fx.mjs` : null,
    third.broker == null || third.levy == null ? "frais répercutés non convertis" : null,
  ].filter(Boolean);

  const side = (leg) =>
    leg.capped
      ? `plafonnée à ${Number(leg.charged.toPrecision(4))} ${leg.currency}`
      : leg.floored
        ? `au plancher ${num(leg.charged)} ${leg.currency} (le barème donnerait ${Number(leg.raw.toPrecision(3))})`
        : `${Number(leg.charged.toPrecision(4))} ${leg.currency}`;
  const confidence = [
    basis,
    buy ? `commission ${side(buy)} par sens, plus ticket charge ${ticket} ${settle} par sens` : null,
    ...third.said,
    (market === "us" || market === "ca") && buy?.capped ? "frais de bourse ajoutés à un ordre plafonné (note 1) non chiffrés : place d'exécution inconnue" : null,
    !["us", "fwb", "hk", "connect"].includes(market) ? "frais de bourse et réglementaires inclus selon la page" : null,
    taxPct ? `taxe à l'achat ${Object.entries(rates).map(([k, v]) => `${k} ${num((100 * v).toFixed(2))} %`).join(", ")} (taxMap.mjs)` : null,
    `${settle} est une devise de dépôt : change 0,006 % (min 2 USD) plus ticket hors total`,
    market === "us"
      ? book.via606
        ? `carnet 605 × Q ${Number(Number(book.q).toPrecision(3))} (606 d'Interactive Brokers LLC)`
        : "carnet NBBO coté"
      : marketBp != null
        ? `carnet ${Number(Number(marketBp).toPrecision(4))} bp`
        : null,
    "hors total : garde (aucune imprimée), données de marché, TVA « where applicable » sans taux",
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
      perShare: rule.perShare ?? null,
      min: rule.min,
      max: rule.max ?? null,
      maxPct: rule.maxPct ?? null,
      ticket: { each: ticket, currency: settle },
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      tickets: finite(ticketUsd, 6),
      change: 0,
      frais: finite(plus(passedBrokerUsd, leviesUsd), 6),
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
    console.log(JSON.stringify({ page: PAGE, readOn: READ_ON, markets: MARKETS, tickets: TICKET, fx: { ...FX, ticket: FX_TICKET } }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/caucasus/caucasus_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]");
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
    if (out.alternatives?.length) console.log(`\nce que Caucasus Capital propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    return;
  }
  console.log(`Caucasus Capital — ${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}, livre IBKR ${l.ibkrBook || "?"}\n`);
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
