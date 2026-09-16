// What one round trip costs at CapTrader: buy n shares at price p, sell them
// back at once, in dollars.
//
// The affine triple this file used to answer — a × p × n + b × n + c — could
// not hold the card. Every printed tier is a minimum, and on a retail size the
// minimum is the whole bill. The old file computed that floor and then left it
// in a `floor` field the page had no column for, so `c` stayed zero and the
// printed percentage understated every small trade by the whole ticket. America
// is 0,01 $ a share, and above 200 shares that is no longer a ticket: a
// thousand-share order pays 10 $ a side the affine answer never mentioned. The
// 1 % American and Canadian caps lived only in `exactCost`, which the page did
// not call. `roundTrip` is given the size and charges what is charged.
//
// CapTrader GmbH (DE) is an introducing broker onto Interactive Brokers
// Ireland. The catalogue is the IBKR book (`captrader_scraping.mjs`). Until that
// file has been run, this one reads `mexem-parsed.json` — the same book, a
// different introducing broker — and says so under `--schedule`.
//
// Tables re-read on 2026-09-15 from the Ninja Tables behind
// https://www.captrader.com/konditionen/aktien-handel/ (same figures on
// etf-handel). The old file had the German, American, Swiss, British, Japanese
// and Polish rows and dumped everything else into `other_eu` with `min: null`,
// so a Paris or Milan order was billed the 0,10 % alone. The page prints a
// floor on every European venue it prices. Those floors are now in `RULE`.
//
//   EUR 4     Xetra (cap 99), Vienna (cap 120), Belgium, France, Italy,
//             Netherlands, Spain
//   EUR 2     GETTEX, Tradegate, Turquoise DE, Chi-X, BATS
//   EUR 4     Frankfurt / Stuttgart in the portal (page adds a specialist
//             the preview never quotes)
//   EUR 6     Portugal
//   EUR 10    Baltics
//   GBP 8     London
//   CHF 15    Switzerland
//   NOK 60    Norway
//   SEK 40    Sweden (cap 300)
//   PLN 20    Poland
//   ILS 25    Israel, at 0,14 %
//   HUF 1 500 Hungary, at 0,15 %
//   USD 2     America, 0,01 $/share, cap 1 %
//   CAD 1     Canada, 0,01 $/share, cap 1 %
//   JPY 500   Japan
//   HKD 20    Hong Kong
//   SGD 5     Singapore
//   CNH 50    Shanghai, at 0,20 %
//   AUD 10    Australia
//   MXN 80    Mexico, at 0,25 %
//   RUB 900   Russia, at 0,20 % (cap 8 500)
//   USD 8,90  OTC / Pink under a dollar, 0,01 $/share, cap 3 %
//
// Frankfurt and Stuttgart print a specialist on top of the 0,10 %. The portal
// does not. On 2026-09-15 every euro preview — SMART, AEB, GETTEX2, IBIS, FWB —
// came back `2.00 ... 4.00 EUR`, including Lufthansa directed at FWB. The
// specialist is therefore on the page and out of the number, same reason FX is.
// Ireland is on the IBKR book and not on the page, so it answers N/A rather
// than borrow a neighbour's four euros.
//
// One live trip, 2026-09-10, account U27604034, euro cash: 1 IWDA market,
// ticket bound AEB, both legs routed GETTEX2 @ 126,10, 2,00 € each way. The
// 2026-09-15 previews quote that trip as the bottom of a 2 … 4 € range. The
// Netherlands / Xetra / Paris rows stay at the page's 4 €, which is the top
// of the same range, and `confidence` says SMART paid 2 € on the one fill.
//
// Conversion is not on the stock card. Whether cash has to cross is a fact
// about the client's balances, so FX stays in the remark. Withdrawals (first
// in a calendar month free, then 1 € SEPA / 8 € wire), ADR pass-through and
// the 0,03 % / 0,08 % yearly custody on HUF, PLN, ILS and BUX euro names are
// the same kind of thing. Account opening, custody of everything else,
// dividends and the trading software are free in as many words.
//
// What is in the number: the commission each way at its floor and its cap;
// UK stamp 0,5 % and Irish 1 % on a purchase
// of a share, and French / Italian FTT, which the page says it withholds
// (Italy is carried locally — the root map reads Trading212's off-venue zero);
// Hong Kong stamp 0,1 % from the same note; the PTM levy of 1,50 £ above
// 10 000 £; current SEC and TAF on an American sale (the page still prints
// 0,0000278 / 0,000166 / 8,30 $); and the market spread, once.
//
// The American cap binds the per-share amount and the minimum binds the
// result, in that order. Floor-then-cap would let 1 % of a 13 $ share cut
// under the 2 $ minimum. Mexem's portal answered the same question with the
// minimum, on the same IBKR ticket machine.
//
//   https://www.captrader.com/konditionen/aktien-handel/
//   https://www.captrader.com/konditionen/etf-handel/
//
//   node captrader/captrader_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node captrader/captrader_cost.mjs TTE SBF EUR --shares=10 --price=60
//   node captrader/captrader_cost.mjs IWDA AEB EUR --shares=1 --price=126.1
//   node captrader/captrader_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const LOCAL = new URL("captrader-parsed.json", import.meta.url);
const IBKR_BOOK = new URL("../mexem/mexem-parsed.json", import.meta.url);
const CATALOGUE = fs.existsSync(LOCAL) ? LOCAL : IBKR_BOOK;
const catalogueBorrowed = CATALOGUE.href !== LOCAL.href;
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  stocks: "https://www.captrader.com/konditionen/aktien-handel/",
  etfs: "https://www.captrader.com/konditionen/etf-handel/",
  overview: "https://www.captrader.com/konditionen/",
  readOn: "2026-09-15",
  pageUpdated: "2026-08-18",
  entity: "CapTrader GmbH (DE), IBKR introducing broker",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const PTM = { each: 1.5, ccy: "GBP", above: 10000 };
const UK_STAMP = 0.005;
const IE_STAMP = 0.01;
const HK_STAMP = 0.001;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "BATS"]);
const UK_REGISTERED = /^(GB|GG|JE|IM)/;
const ADR_NAMED = /\b(ADR|GDR|ADS)\b/i;

// The page withholds French and Italian FTT by name (note dated 12/2015, still
// on the 2026 page). The root map has France and reads Trading212's zero on
// Italy. Spain is not named, so it is left to the map.
const OWN_FTT = { IT: { name: "ITALIAN_FTT", rate: 0.001 } };

const CHECK = {
  on: "2026-09-10",
  account: "U27604034",
  ticker: "IWDA",
  ticketBound: "AEB",
  venuePrinted: "GETTEX2",
  n: 1,
  price: 126.1,
  ticket: 2,
  commissionPaid: 4,
  cash: { start: 251, afterBuy: 122.9, end: 247 },
};

// Previews on the same account, 2026-09-15, nothing traded. The range is the
// GETTEX door and the primary door; the live fill took the first. Orange's
// 4,06 € is 4 € plus 0,40 % of 15,815 € — French FTT inside the top, already
// in `taxMap`, so it is not a second venue fee. Dollars and Irish names were
// refused: the account is under the 2 000 € the portal wants before it will
// convert or trade a foreign currency.
const MEASURED = {
  on: "2026-09-15",
  how: "aperçu whatif du portail CapTrader, aucun ordre passé",
  account: CHECK.account,
  cashEur: 247,
  range: "2.00 ... 4.00 EUR",
  seen: {
    IWDA: { venues: ["SMART", "AEB", "GETTEX2", "FTA"], commission: "2.00 ... 4.00 EUR", price: 125.8 },
    TUI1: { venues: ["IBIS"], commission: "2.00 ... 4.00 EUR", price: 6.494 },
    LHA: { venues: ["SMART", "IBIS", "FWB"], commission: "2.00 ... 4.00 EUR", price: 7.576 },
    ORA: { venues: ["SBF"], commission: "2.00 ... 4.06 EUR", price: 15.815, fttOnTop: 0.06 },
  },
};

// Still printed. Never in a preview, even with `exchange: FWB`.
const SPECIALIST_ON_PAGE = {
  frankfurt: { rate: 0.000504, min: 2.52 },
  stuttgart: { rate: 0.000672, min: 0.63, dax: 0.000336 },
};

const WITHDRAW = { firstFree: true, sepa: 1, wire: 8, ccy: "EUR" };
const CUSTODY = {
  rate: { HUF: 0.0003, PLN: 0.0003, ILS: 0.0008 },
  also: "euro names on BUX",
};

// Per side. `rate` of the amount or `perShare` per share, floored at `min` and,
// where the page prints one, capped at `max` (absolute) or `maxPct` of the
// amount. Frankfurt and Stuttgart use the 4 € SMART ceiling the portal quotes,
// not the specialist the page adds on top.
const RULE = {
  us: { perShare: 0.01, min: 2, maxPct: 0.01, ccy: "USD" },
  ca: { perShare: 0.01, min: 1, maxPct: 0.01, ccy: "CAD" },
  otc: { perShare: 0.01, min: 8.9, maxPct: 0.03, ccy: "USD" },
  xetra: { rate: 0.001, min: 4, max: 99, ccy: "EUR" },
  cheap: { rate: 0.001, min: 2, ccy: "EUR" },
  frankfurt: { rate: 0.001, min: 4, ccy: "EUR" },
  stuttgart: { rate: 0.001, min: 4, ccy: "EUR" },
  vienna: { rate: 0.001, min: 4, max: 120, ccy: "EUR" },
  fr: { rate: 0.001, min: 4, ccy: "EUR" },
  nl: { rate: 0.001, min: 4, ccy: "EUR" },
  be: { rate: 0.001, min: 4, ccy: "EUR" },
  it: { rate: 0.001, min: 4, ccy: "EUR" },
  es: { rate: 0.001, min: 4, ccy: "EUR" },
  pt: { rate: 0.001, min: 6, ccy: "EUR" },
  baltics: { rate: 0.001, min: 10, ccy: "EUR" },
  ch: { rate: 0.001, min: 15, ccy: "CHF" },
  uk: { rate: 0.001, min: 8, ccy: "GBP" },
  no: { rate: 0.001, min: 60, ccy: "NOK" },
  se: { rate: 0.001, min: 40, max: 300, ccy: "SEK" },
  pl: { rate: 0.001, min: 20, ccy: "PLN" },
  il: { rate: 0.0014, min: 25, ccy: "ILS" },
  hu: { rate: 0.0015, min: 1500, ccy: "HUF" },
  ru: { rate: 0.002, min: 900, max: 8500, ccy: "RUB" },
  mx: { rate: 0.0025, min: 80, ccy: "MXN" },
  jp: { rate: 0.001, min: 500, ccy: "JPY" },
  hk: { rate: 0.001, min: 20, ccy: "HKD" },
  sg: { rate: 0.001, min: 5, ccy: "SGD" },
  cnh: { rate: 0.002, min: 50, ccy: "CNH" },
  au: { rate: 0.001, min: 10, ccy: "AUD" },
};

const TO_VENUES = {
  TSE: "TSX",
  TSEJ: "TSEJ",
  "BVME.ETF": "BVME",
  "ENEXT.BE": "XBRU",
  LSEIOB1: "LSE",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const fxCcy = (currency) => (String(currency || "").toUpperCase() === "CNH" ? "CNY" : currency);
const dollars = (amount, currency) => {
  const v = toUsd(amount, fxCcy(currency));
  return v == null ? null : Number(v.toPrecision(6));
};
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  const a = String(fxCcy(from) || "").toUpperCase();
  const b = String(fxCcy(to) || "").toUpperCase();
  if (a === b) return amount;
  const usd = toUsd(amount, a);
  const per = usdPer(b);
  return usd == null || !(per > 0) ? null : usd / per;
}
const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(fxCcy(currency)) });
const venueRow = (row) => ({ ...row, exchange: TO_VENUES[row.exchange] || row.exchange });
const isStock = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";
const isAmerican = (exchange, mic) => US_MICS.has(String(mic || "").toUpperCase()) || US_EX.has(loose(exchange));

export function feeMarketOf(exchange, mic) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  if (code === "PINK" || code === "PURE" || code === "VALUE" || code === "ARCAEDGE" || code === "OTCBB" || /PINK|OTCM/i.test(code)) {
    return "otc";
  }
  if (US_MICS.has(m) || US_EX.has(code)) return "us";
  if (code === "IBIS" || code === "IBIS2" || m === "XETR") return "xetra";
  if (
    code === "GETTEX" ||
    code === "GETTEX2" ||
    code === "TGATE" ||
    code === "TRADEGATE" ||
    code === "TRQX" ||
    code === "CHIX" ||
    code === "BATSEUR" ||
    m === "XMUN" ||
    m === "XGAT" ||
    m === "CHIX" ||
    m === "BATE"
  ) {
    return "cheap";
  }
  if (code === "FWB" || code === "FWB2" || m === "XFRA") return "frankfurt";
  if (code === "SWB" || code === "SWB2" || m === "XSTU") return "stuttgart";
  if (code === "VSE" || m === "XWBO") return "vienna";
  if (code === "EBS" || m === "XSWX") return "ch";
  if (code === "LSE" || code === "LSEETF" || code === "LSEIOB1" || code === "AQSE" || m === "XLON") return "uk";
  if (code === "TSE" || code === "TSX" || code === "VENTURE" || code === "AEQLIT" || m === "XTSE") return "ca";
  if (code === "TSEJ" || m === "XJPX" || m === "XTKS") return "jp";
  if (code === "WSE" || m === "XWAR") return "pl";
  if (code === "SBF" || m === "XPAR") return "fr";
  if (code === "AEB" || m === "XAMS") return "nl";
  if (code === "ENEXTBE" || m === "XBRU") return "be";
  if (code === "BVME" || code === "BVMEETF" || m === "XMIL") return "it";
  if (code === "BM" || m === "XMAD" || m === "XMCE") return "es";
  if (code === "BVL" || m === "XLIS") return "pt";
  if (code === "OSE" || code === "OMXNO" || m === "XOSL") return "no";
  if (code === "SFB" || m === "XSTO") return "se";
  if (code === "TASE" || m === "XTAE") return "il";
  if (code === "BUX" || m === "XBUD") return "hu";
  if (code === "MEXI" || m === "XMEX") return "mx";
  if (code === "SEHK" || m === "XHKG") return "hk";
  if (code === "SGX" || m === "XSES") return "sg";
  if (code === "SEHKNTL" || code === "SHSE" || m === "XSHG") return "cnh";
  if (code === "ASX" || m === "XASX") return "au";
  if (code === "MOEX" || m === "MISX") return "ru";
  if (
    /^(TLSE|RSE|NSEL|XTAL|XRIS|XLIT|NVILNIUS|NTALLINN|NRIGA)$/.test(code) ||
    ["XTAL", "XRIS", "XLIT"].includes(m)
  ) {
    return "baltics";
  }
  return null;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(venueRow(r));
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    const hasBook = book.leaf?.bp != null || book.leaf?.perShare != null;
    if (hasBook) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (hasBook) mk.withBook += 1;
  }
  return out;
}

function nativeAmount(shares, price, currency) {
  if (shares == null || price == null) return null;
  const amount = Number(shares) * Number(price);
  if (!Number.isFinite(amount)) return null;
  return String(currency || "").toUpperCase() === "GBX" ? amount / 100 : amount;
}

export function taxesFor(isin, listing) {
  const tax = taxesOf(isin);
  const mapped = taxRates(tax);
  const cc = String(isin || "").slice(0, 2).toUpperCase();
  const own = isStock(listing) ? OWN_FTT[cc] : null;
  const already = own && Object.keys(mapped).some((k) => /ITALIAN/i.test(k));
  const added = own && !already ? { [own.name]: own.rate } : {};
  const rates = { ...mapped, ...added };
  if (isStock(listing) && !Object.keys(rates).length) {
    if (cc === "IE" || listing.mic === "XDUB") return { tax, rates: { stamp: IE_STAMP }, added: ["stamp"], source: "captrader" };
    if (cc === "GB" || listing.mic === "XLON") return { tax, rates: { stamp: UK_STAMP }, added: ["stamp"], source: "captrader" };
    if (cc === "HK" || listing.mic === "XHKG") return { tax, rates: { stamp: HK_STAMP }, added: ["stamp"], source: "captrader" };
  }
  return { tax, rates, added: Object.keys(added), source: Object.keys(mapped).length ? "taxMap" : null };
}

function remarkOf({ listing, market } = {}) {
  const lines = [];
  const ccy = String(listing?.currency || "").toUpperCase();
  const settle = ccy === "GBX" ? "GBP" : ccy;
  lines.push(`FX is not on the stock card: a conversion only if cash is not already in ${settle || "the listing currency"}.`);
  if (ADR_NAMED.test(String(listing?.name || "")) || market === "us") {
    if (ADR_NAMED.test(String(listing?.name || ""))) {
      lines.push("ADR/GDR pass-through typically 0.01–0.03 per share per year.");
    }
  }
  const custody = CUSTODY.rate[ccy];
  if (custody != null || market === "hu") {
    const pct = custody != null ? custody : CUSTODY.rate.HUF;
    lines.push(`Custody ${(pct * 100).toFixed(2)}%/year on this currency (and on euro names on BUX).`);
  }
  if (market === "frankfurt" || market === "stuttgart") {
    const s = SPECIALIST_ON_PAGE[market];
    lines.push(
      `Specialist ${(100 * s.rate).toFixed(4)}% (min ${s.min} €) is on the ${market} row of the page. ` +
        `The portal quoted ${MEASURED.range} even with the order sent there.`
    );
  }
  return lines.join("\n");
}

/**
 * One side's commission, at the floor and under the cap.
 */
export function commissionSide({ shares, amount, market }) {
  const rule = RULE[market];
  if (!rule) return null;

  if (rule.perShare != null) {
    if (shares == null || !Number.isFinite(Number(shares))) return null;
    const raw = rule.perShare * Number(shares);
    const ceiling = rule.maxPct != null && amount != null ? Number(amount) * rule.maxPct : null;
    const capped = ceiling != null && ceiling < raw;
    const perShareAmount = capped ? ceiling : raw;
    const charged = Math.max(rule.min, perShareAmount);
    return { raw, charged, floored: perShareAmount < rule.min, capped, currency: rule.ccy };
  }

  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const raw = Number(amount) * rule.rate;
  const floored = Math.max(rule.min, raw);
  const charged = rule.max != null ? Math.min(floored, rule.max) : floored;
  return { raw, charged, floored: raw < rule.min, capped: rule.max != null && rule.max < floored, currency: rule.ccy };
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = { usd: null, etf, place, currency, onlineBuy: true, cashCurrency: "" };

  if (!catalogue) {
    return { ...answer, why: "le catalogue CapTrader n'existe pas encore : lancer `node captrader/captrader_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue CapTrader` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez CapTrader`,
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

  const market = feeMarketOf(m.row.exchange, listing.mic);
  const rule = market ? RULE[market] : null;
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = isAmerican(m.row.exchange, listing.mic);
  const { tax, rates, added, source: taxSource } = taxesFor(listing.isin, listing);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    onlineBuy: m.row.nonEuResident !== true,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.stocks,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: remarkOf({ listing, market }),
    withdraw: WITHDRAW,
    catalogueBorrowed,
  };

  if (!rule) {
    return {
      ...shared,
      basis: `aucun palier publié pour ${listing.brokerExchange || listing.exchange || "cette place"} chez CapTrader`,
      why:
        `${listing.brokerExchange || listing.exchange || "cette place"} n'a pas de palier sur la carte CapTrader ` +
        `du ${SCHEDULE.readOn}`,
      confidence: `place hors carte, lue le ${SCHEDULE.readOn} : la commission est N/A plutôt qu'un voisin inventé`,
    };
  }

  const basis =
    `barème CapTrader ${market}, lu le ${SCHEDULE.readOn} (page du ${SCHEDULE.pageUpdated}) : ` +
    (rule.rate != null
      ? `${(100 * rule.rate).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} % par sens`
      : `${rule.perShare} ${rule.ccy} par part`) +
    `, plancher ${rule.min} ${rule.ccy}` +
    (rule.max != null ? `, plafond ${rule.max} ${rule.ccy}` : "") +
    (rule.maxPct != null ? `, plafond ${(100 * rule.maxPct).toFixed(0)} % du montant` : "");

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
    };
  }

  const notional = nativeAmount(n, p, listing.currency);
  const settle = listing.currency === "GBX" ? "GBP" : listing.currency;
  const notionalUsd = dollars(notional, settle);
  const notionalInRule = convert(notional, settle, rule.ccy);

  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buyComm = commissionSide({ shares: n, amount: notionalInRule, market });
  const sellComm = commissionSide({ shares: n, amount: notionalInRule, market });
  const buyCommUsd = buyComm ? dollars(buyComm.charged, buyComm.currency) : null;
  const sellCommUsd = sellComm ? dollars(sellComm.charged, sellComm.currency) : null;

  const stampUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const tafUsd = american ? Math.min(TAF_PER_SHARE * n, TAF_CAP) : 0;

  const notionalGbp = convert(notional, settle, PTM.ccy);
  const ptmDue =
    !isStock(listing) || !UK_REGISTERED.test(listing.isin)
      ? false
      : notionalGbp == null
        ? null
        : notionalGbp > PTM.above;
  const ptmUsd = ptmDue === false ? 0 : ptmDue === null ? null : dollars(2 * PTM.each, PTM.ccy);

  const usd = plus(bookUsd, buyCommUsd, sellCommUsd, stampUsd, secUsd, tafUsd, ptmUsd);
  const brokerFees = plus(buyCommUsd, sellCommUsd);

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
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: {
      commission: finite(buyCommUsd, 6),
      native: buyComm
        ? {
            charged: finite(buyComm.charged, 6),
            raw: finite(buyComm.raw, 6),
            floored: buyComm.floored,
            capped: buyComm.capped,
            currency: buyComm.currency,
          }
        : null,
      taxes: finite(stampUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
    },
    sell: {
      commission: finite(sellCommUsd, 6),
      native: sellComm
        ? {
            charged: finite(sellComm.charged, 6),
            raw: finite(sellComm.raw, 6),
            floored: sellComm.floored,
            capped: sellComm.capped,
            currency: sellComm.currency,
          }
        : null,
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(plus(buyCommUsd, sellCommUsd), 6),
      taxes: finite(stampUsd, 6),
      réglementaire: finite(plus(secUsd, tafUsd, ptmUsd), 6),
    },
    commission: {
      rate: rule.rate ?? null,
      perShare: rule.perShare ?? null,
      min: rule.min,
      max: rule.max ?? null,
      maxPct: rule.maxPct ?? null,
      currency: rule.ccy,
      eachWay: true,
    },
    basis,
    confidence: confidenceOf({
      market,
      rule,
      buyComm,
      marketBp,
      marketPerShare,
      rates,
      taxPct,
      taxSource,
      added,
      american,
      ptmDue,
      unsourced: m.unsourced,
      listing,
      n,
    }),
  };
}

function confidenceOf({
  market,
  rule,
  buyComm,
  marketBp,
  marketPerShare,
  rates,
  taxPct,
  taxSource,
  added,
  american,
  ptmDue,
  unsourced,
  listing,
  n,
}) {
  const said = [];
  said.push(
    `commission CapTrader, palier ${market}, lue le ${SCHEDULE.readOn} sur la page Aktien du ${SCHEDULE.pageUpdated}, ` +
      `facturée par sens et convertie en dollars au mid BCE du ${FX_AS_OF}`
  );
  if (buyComm) {
    said.push(
      buyComm.capped
        ? `plafonnée : ${Number(buyComm.charged).toPrecision(4)} ${rule.ccy} par sens`
        : buyComm.floored
          ? `au plancher : le ticket de ${rule.min} ${rule.ccy} est toute la commission, ` +
            `le calcul au barème n'en donnerait que ${Number(buyComm.raw).toPrecision(3)}`
          : `au-dessus du plancher : ${Number(buyComm.charged).toPrecision(4)} ${rule.ccy} par sens`
    );
  }
  if (market === "frankfurt" || market === "stuttgart") {
    const s = SPECIALIST_ON_PAGE[market];
    said.push(
      `spécialiste ${(100 * s.rate).toFixed(4)} % (min ${s.min} €) sur la page, hors total : ` +
        `l'aperçu du ${MEASURED.on} sur LHA donne ${MEASURED.seen.LHA.commission} ` +
        `que l'ordre parte SMART, IBIS ou FWB`
    );
  }
  if (market === "nl") {
    said.push(
      `Amsterdam est à 4 € sur la page. L'aller-retour réel du ${CHECK.on} sur ${CHECK.ticker}, ` +
        `ticket ${CHECK.ticketBound}, a été routé ${CHECK.venuePrinted} et débité ${CHECK.ticket} € par sens ` +
        `(caisse ${CHECK.cash.start} → ${CHECK.cash.end} €). SMART peut donc prendre la porte à 2 €`
    );
  } else if (market === "cheap") {
    said.push(
      `plancher 2 € mesuré le ${CHECK.on} : ${CHECK.n} ${CHECK.ticker} @ ${CHECK.price}, ` +
        `ticket ${CHECK.ticketBound} → ${CHECK.venuePrinted}, ${CHECK.ticket} € par jambe`
    );
  }
  if (rule.perShare != null && n >= rule.min / rule.perShare) {
    said.push(
      `au-delà de ${Math.round(rule.min / rule.perShare)} parts la commission cesse d'être le ticket ` +
        `et devient ${rule.perShare} ${rule.ccy} la part`
    );
  }
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp).toPrecision(4)} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet 605 ${marketPerShare} $ la part, aller-retour`);
  else said.push(`aucun carnet : ${unsourced?.why || "place sans source de spread"} — le total est N/A et non un total sans marché`);

  if (taxPct) {
    const named = Object.entries(rates)
      .map(([k, v]) => `${k} ${(100 * v).toFixed(2)} %`)
      .join(", ");
    said.push(
      `taxe à l'achat ${named}` +
        (added?.includes("ITALIAN_FTT")
          ? `, l'italienne vient de la note CapTrader et non de la carte racine, qui lit le zéro hors-place de Trading212`
          : taxSource === "captrader"
            ? `, au taux imprimé par CapTrader`
            : `, depuis taxMap.mjs`) +
        (listing.isin.startsWith("FR") && MEASURED.seen.ORA
          ? `. L'aperçu Orange du ${MEASURED.on} annonce ${MEASURED.seen.ORA.commission} : ` +
            `les ${MEASURED.seen.ORA.fttOnTop} € du haut sont 0,40 % de ${MEASURED.seen.ORA.price} €, déjà dans taxMap`
          : "")
    );
  }
  if (american) {
    said.push(
      `vente américaine : SEC ${SEC_RATE} du montant et TAF FINRA ${TAF_PER_SHARE} la part ` +
        `(plafond ${TAF_CAP} $). La page CapTrader imprime encore 0,0000278 / 0,000166 / 8,30 $, ` +
        `les chiffres courants sont ceux que le tarif fixe IBKR répercute`
    );
  }
  if (ptmDue === null) said.push(`prélèvement PTM indécidable : le montant n'a pas pu être converti en livres`);
  else if (ptmDue) said.push(`prélèvement PTM de ${PTM.each} £ par sens, le montant dépassant ${PTM.above} £`);

  said.push(
    `hors total : la conversion, qui dépend de la trésorerie et non de l'ordre. ` +
      `Le premier retrait du mois civil est gratuit, ensuite ${WITHDRAW.sepa} € SEPA / ${WITHDRAW.wire} € virement`
  );
  said.push(`garde et ouverture gratuites hors HUF / PLN / ILS et actions euro à Budapest`);
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
          rules: RULE,
          withdraw: WITHDRAW,
          custody: CUSTODY,
          ownFtt: OWN_FTT,
          check: CHECK,
          measured: MEASURED,
          specialistOnPage: SPECIALIST_ON_PAGE,
          catalogue: catalogueBorrowed ? "mexem-parsed.json (même livre IBKR)" : "captrader-parsed.json",
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
      "usage : node captrader_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node captrader_cost.mjs --schedule\n" +
        "  ex.   node captrader_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node captrader_cost.mjs TTE SBF EUR --shares=10 --price=60\n" +
        "        node captrader_cost.mjs IWDA AEB EUR --shares=1 --price=126.1"
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
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) console.log(`\nce que CapTrader propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  if (out.trade) {
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
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
