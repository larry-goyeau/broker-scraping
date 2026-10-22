// What one round trip costs at Easybroker (a trade name of DMA Europe B.V.,
// Amsterdam, an introducing broker onto Interactive Brokers Ireland): buy n
// shares at price p, sell them back at once, online, in dollars.
//
// Sources, read on 2026-10-21:
//   https://www.easybroker.nl/tarieven                       (summary page)
//   https://www.easybroker.nl/hubfs/Documenten%20-%20Easybroker/Easybroker%20Tarievenlijst%20per%201%20mei%202026.pdf
//                                         (official list, valid 1 May 2026;
//                                          the page says the list governs)
//   https://www.easybroker.nl/tarieven/ex-ante-cost-disclosure
//                                         (Easybroker's cost calculator: its
//                                          third-party fee table per exchange)
//
// Commission on shares, ETFs, trackers and ADRs, each way, by the currency
// of the line (the list's table is by currency; the summary page says the
// commission is billed in the currency of the market):
//
//   AED 0.15 % min 13        HKD 0.14 % min 50        PLN 0.14 % min 25
//   AUD 0.10 % min 10        HUF 0.14 % min 2,000     SEK 0.14 % min 40
//   CHF 0.10 % min 15        ILS 0.14 % min 25        SGD 0.14 % min 5
//   CNH 0.14 % min 50        JPY 0.14 % min 500       TWD 0.14 % min 175
//   CZK 0.14 % min 125       MXN 0.14 % min 80        EUR 0.08 % min 3
//   DKK 0.14 % min 40        NOK 0.14 % min 40        GBP 0.09 % min 3
//   USD 0.008 a share, min 3, max 1 % of the order
//   CAD 0.015 a share, min 3, max 1 % of the order
//   INR 0.14 % min 450 and MYR 0.14 % min 50: the calculator only.
//
// The calculator applies the minimum and then the 1 % cap, so the cap wins
// on a tiny order; this file does the same. The row is the line's currency.
// The per-share USD and CAD rows are for the US and Canadian markets only
// (summary page: a percentage "except in the United States and Canada"), so
// a USD line in London, Zurich, Amsterdam ... or a USD line in Toronto, and
// a CAD line outside Canada, have no published rate: N/A. KRW, BRL, SAR,
// ZAR and RON have no row anywhere: N/A.
//
// Third-party costs, in the total, each way unless said. The list says they
// are passed on as charged and names the venues; the calculator prints the
// figures (exchange, clearing, regulator):
//   Euronext Amsterdam/Paris  0.0095 % + 0.13 EUR, clearing 0.04 EUR
//   Euronext Brussels/Lisbon  0.0095 % + 0.13 EUR, clearing 0.10 EUR
//   Xetra                     0.0072 % min 0.90 EUR, clearing 0.02 EUR +
//                             0.0008 %, regulator 0.01 EUR
//   Frankfurt                 0.0144 % min 0.90 max 108 EUR, clearing
//                             0.0504 % + 2.52 EUR
//   gettex, Tradegate         0
//   Borsa Italiana            0.006 % min 1.20 EUR, clearing 0.265 EUR
//   BME Madrid                0.006 %, clearing 0.10 EUR
//   London                    0.0045 % min 0.11 GBP, clearing 0.06 GBP
//   SIX                       0.0065 % + 0.75 CHF, max 65, clearing 0.08 CHF
//   Copenhagen                0.00357 % + 6.08 DKK
//   Stockholm                 0.00357 % + 7.59 SEK
//   Oslo                      0.00204 %, clearing 0.25 NOK
//   Budapest                  0.07 %
//   Warsaw                    0.07 %
//   Nasdaq Baltic             0.035 % min 0.30 EUR, clearing 7 EUR
//   Cboe Europe, Turquoise    0.003 %, clearing 0.03 EUR
//   Aquis                     0.15 EUR
//   Hong Kong                 0.00565 %, clearing 0.0042 %, SFC/AFRC 0.00285 %
//   Tokyo                     0.002 %, clearing 0.0007 %
//   Singapore                 0.0354 %, regulator 0.00818 %
//   ASX                       0.00165 %, clearing 0.00248 %
//   Toronto                   0.0015 CAD a share, TSX Venture 0.002 CAD a
//                             share; clearing 0.00017 CAD a share (list:
//                             max 2 CAD an order); regulator 0.00011 CAD a
//                             share (list: max 3.30 CAD a trade)
//   United States             exchange 0.0002 % (calculator); from the list:
//                             NSCC/DTC 0.00020 $ a share (max 0.5 % of the
//                             value), CAT 0.000035 $ a share (exchange rate),
//                             NYSE pass-through 0.0175 % and FINRA
//                             pass-through 0.0563 % of the commission; on the
//                             sale only, SEC 20.60 $ per million and FINRA
//                             TAF 0.000195 $ a share, max 9.79 $ (the list
//                             still prints 0.00 and 0.000166 / 8.30; the
//                             regulators' current rates are used).
// A venue the list names with no figure anywhere (Stuttgart, Vienna, Tel
// Aviv, Prague, Mexico, Stock Connect, Cboe Australia, Helsinki, Dublin,
// Ljubljana, Abu Dhabi, Dubai ...) counts 0, as on the other IBKR
// introducing brokers' files.
//
// Taxes: stamp and FTT from taxMap.mjs by ISIN (taxGap = N/A); UK and Irish
// stamp on their home books only. Statutory on top: the PTM levy, 1.50 GBP
// a side above 10,000 GBP on a UK share in GBP (thepanel.org.uk); Hong Kong
// stamp duty, 0.1 % a side on a share, HKD rounded up (ird.gov.hk); Stock
// Connect stamp duty, 0.05 % on the sale of an A-share (State Taxation
// Administration, since 28 Aug 2023). Budapest, any line: the calculator's
// 0.45 % tax on the buy; it prints no ceiling, so an order above HUF
// 4,444,444 (where IBIE's own Hungary band turns) is N/A.
//
// FX: AutoFX converts a purchase at a markup of at most 0.03 %, no
// commission; sale proceeds stay in the currency. A listing in a deposit
// currency (deposits.mjs) keeps the remark "FX ≤0.03% when cash ≠ CCY.".
// TWD, INR and MYR are not deposit currencies, and the list has no
// conversion row to bring them back after the sale: N/A.
//
// Not in the number: custody and inactivity (none), withdrawals (first of
// the month free, then 1 EUR SEPA / 8 EUR or 8 USD wire), ADR periodic
// fees, real-time data, margin interest, order changes (free on stock
// venues; 0.50 EUR on a directly routed Tradegate order).
//
// In the total: the book, the commission both ways, the third-party lines
// above, stamp / FTT / PTM / Hong Kong and China stamp / the Budapest tax.
// Remark only: "FX ≤0.03% when cash ≠ CCY." (AutoFX on a purchase; every
// priced currency but TWD, INR and MYR is a deposit currency).
//
// US book: the 606 Q of IBIE's US dealer (Interactive Brokers LLC) through
// spreadLeaf (broker "easybroker", alias in spreads/rule606.mjs).
//
//   node brokers/easybroker/easybroker_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/easybroker/easybroker_cost.mjs VWCE XAMS EUR --shares=10 --price=140
//   node brokers/easybroker/easybroker_cost.mjs HSBA XLON GBP --shares=2000 --price=9
//   node brokers/easybroker/easybroker_cost.mjs 7203 XTKS JPY --shares=100 --price=2800
//   node brokers/easybroker/easybroker_cost.mjs --schedule
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

const FOLDER = "easybroker";
const CATALOGUE = new URL("easybroker-parsed.json", import.meta.url);

const SCHEDULE = {
  page: "https://www.easybroker.nl/tarieven",
  list: "https://www.easybroker.nl/hubfs/Documenten%20-%20Easybroker/Easybroker%20Tarievenlijst%20per%201%20mei%202026.pdf",
  calculator: "https://www.easybroker.nl/tarieven/ex-ante-cost-disclosure",
  readOn: "2026-10-21",
  validFrom: "2026-05-01",
  entity: "DMA Europe B.V. (Easybroker), introducing broker onto Interactive Brokers Ireland",
  base: "EUR",
};

const AUTOFX = 0.0003;
const PTM = { each: 1.5, ccy: "GBP", above: 10000 };
const HK_STAMP = 0.001;
const CONNECT_STAMP = 0.0005;
const HU_TAX = { rate: 0.0045, upTo: 4444444 };
const UK_REGISTERED = /^(GB|GG|JE|IM)/;
const STAMP_HOME = { GB: new Set(["XLON", "AQXE", "XMSM"]), IE: new Set(["XMSM", "XLON", "AQXE"]) };
const US_LISTED = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS", "IEXG", "MEMX"]);
const CA_LISTED = new Set(["XTSE", "XTSX"]);
// The per-share USD and CAD rows are the American and Canadian markets
// only ("behalve in de Verenigde Staten en Canada"): each row's own venues.
const PER_SHARE_HOME = { USD: US_LISTED, CAD: CA_LISTED };
const NO_FX_BACK = new Set(["TWD", "INR", "MYR"]);

// US third parties: the regulators' current SEC and TAF, the list's CAT,
// NSCC/DTC and pass-throughs, the calculator's exchange line.
const US = {
  secRate: 0.0000206,
  tafPerShare: 0.000195,
  tafCap: 9.79,
  catPerShare: 0.000035,
  nsccPerShare: 0.0002,
  nsccMaxPct: 0.005,
  exchangePct: 0.000002,
  nysePassThrough: 0.000175,
  finraPassThrough: 0.000563,
};

const pct = (rate, min, ccy, source = "list") => ({ rate, min, ccy, source });
const perShare = (each, min, ccy) => ({ each, min, maxPct: 0.01, ccy, source: "list" });

export const COMMISSION = {
  AED: pct(0.0015, 13, "AED"),
  AUD: pct(0.001, 10, "AUD"),
  CAD: perShare(0.015, 3, "CAD"),
  CHF: pct(0.001, 15, "CHF"),
  CNH: pct(0.0014, 50, "CNH"),
  CZK: pct(0.0014, 125, "CZK"),
  DKK: pct(0.0014, 40, "DKK"),
  EUR: pct(0.0008, 3, "EUR"),
  GBP: pct(0.0009, 3, "GBP"),
  HKD: pct(0.0014, 50, "HKD"),
  HUF: pct(0.0014, 2000, "HUF"),
  ILS: pct(0.0014, 25, "ILS"),
  JPY: pct(0.0014, 500, "JPY"),
  MXN: pct(0.0014, 80, "MXN"),
  NOK: pct(0.0014, 40, "NOK"),
  PLN: pct(0.0014, 25, "PLN"),
  SEK: pct(0.0014, 40, "SEK"),
  SGD: pct(0.0014, 5, "SGD"),
  TWD: pct(0.0014, 175, "TWD"),
  USD: perShare(0.008, 3, "USD"),
  INR: pct(0.0014, 450, "INR", "calculator"),
  MYR: pct(0.0014, 50, "MYR", "calculator"),
};

// Calculator third-party lines, per side, in `ccy`. `ex*` exchange,
// `cl*` clearing, `reg*` regulator. Percentages are of the order.
const fee = (label, ccy, f) => ({ label, ccy, ...f });
const EURONEXT_NL_FR = { exPct: 0.000095, exFix: 0.13, clFix: 0.04 };
const EURONEXT_BE_PT = { exPct: 0.000095, exFix: 0.13, clFix: 0.1 };
const PAN_EU = { exPct: 0.00003, clFix: 0.03 };
const CANADA = (exPerShare) => ({ exPerShare, clPerShare: 0.00017, clCapOrder: 2, regPerShare: 0.00011, regCap: 3.3 });

export const THIRD = {
  XAMS: fee("Euronext Amsterdam", "EUR", EURONEXT_NL_FR),
  XPAR: fee("Euronext Paris", "EUR", EURONEXT_NL_FR),
  XBRU: fee("Euronext Bruxelles", "EUR", EURONEXT_BE_PT),
  XLIS: fee("Euronext Lisbonne", "EUR", EURONEXT_BE_PT),
  XETR: fee("Xetra", "EUR", { exPct: 0.000072, exMin: 0.9, clFix: 0.02, clPct: 0.000008, regFix: 0.01 }),
  XMUN: fee("gettex", "EUR", {}),
  XGAT: fee("Tradegate", "EUR", {}),
  XFRA: fee("Francfort", "EUR", { exPct: 0.000144, exMin: 0.9, exMax: 108, clPct: 0.000504, clFix: 2.52 }),
  XMIL: fee("Borsa Italiana", "EUR", { exPct: 0.00006, exMin: 1.2, clFix: 0.265 }),
  XMAD: fee("BME", "EUR", { exPct: 0.00006, clFix: 0.1 }),
  XLON: fee("LSE", "GBP", { exPct: 0.000045, exMin: 0.11, clFix: 0.06 }),
  XSWX: fee("SIX", "CHF", { exPct: 0.000065, exFix: 0.75, exMax: 65, clFix: 0.08 }),
  XCSE: fee("Copenhague", "DKK", { exPct: 0.0000357, exFix: 6.08 }),
  XSTO: fee("Stockholm", "SEK", { exPct: 0.0000357, exFix: 7.59 }),
  XOSL: fee("Oslo", "NOK", { exPct: 0.0000204, clFix: 0.25 }),
  XBUD: fee("Budapest", "HUF", { exPct: 0.0007 }),
  XWAR: fee("Varsovie", "PLN", { exPct: 0.0007 }),
  XTAL: fee("Nasdaq Baltic", "EUR", { exPct: 0.00035, exMin: 0.3, clFix: 7 }),
  XRIS: fee("Nasdaq Baltic", "EUR", { exPct: 0.00035, exMin: 0.3, clFix: 7 }),
  XLIT: fee("Nasdaq Baltic", "EUR", { exPct: 0.00035, exMin: 0.3, clFix: 7 }),
  CHIX: fee("Cboe EU / DXE", "EUR", PAN_EU),
  TRQX: fee("Turquoise", "EUR", PAN_EU),
  AQXE: fee("Aquis", "EUR", { exFix: 0.15 }),
  XHKG: fee("Hong Kong (SEHK)", null, { exPct: 0.0000565, clPct: 0.000042, regPct: 0.0000285 }),
  XTKS: fee("Tokyo", null, { exPct: 0.00002, clPct: 0.000007 }),
  XSES: fee("Singapour (SGX)", null, { exPct: 0.000354, regPct: 0.0000818 }),
  XASX: fee("ASX", null, { exPct: 0.0000165, clPct: 0.0000248 }),
  XTSE: fee("TSX", "CAD", CANADA(0.0015)),
  XTSX: fee("TSX Venture", "CAD", CANADA(0.002)),
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
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
const pc = (r) => num(Number((100 * r).toPrecision(4)));

/** One side's commission in the rule's currency: minimum, then the 1 % cap. */
export function commissionSide(rule, { shares, amount }) {
  if (!rule || !(amount > 0)) return null;
  const raw = rule.each != null ? Number(shares) * rule.each : amount * rule.rate;
  let charged = Math.max(rule.min, raw);
  let capped = false;
  if (rule.maxPct != null && charged > amount * rule.maxPct) {
    charged = amount * rule.maxPct;
    capped = true;
  }
  return { raw, charged, capped, floored: !capped && raw < rule.min, currency: rule.ccy };
}

function ruleText(rule) {
  const body = rule.each != null
    ? `${num(rule.each)} ${rule.ccy} la part, plancher ${num(rule.min)} ${rule.ccy}, plafond 1 % de l'ordre`
    : `${pc(rule.rate)} % par sens, plancher ${num(rule.min)} ${rule.ccy}`;
  return rule.source === "calculator" ? `${body} (calculateur, absent de la liste)` : body;
}

/** One side of a venue's third-party lines, in the fee's currency. */
function thirdSide(t, { shares, amount }) {
  let ex = amount * (t.exPct || 0) + (t.exFix || 0);
  if (t.exMin != null && ex < t.exMin) ex = t.exMin;
  if (t.exMax != null && ex > t.exMax) ex = t.exMax;
  if (t.exPerShare) ex += shares * t.exPerShare;
  let cl = amount * (t.clPct || 0) + (t.clFix || 0) + shares * (t.clPerShare || 0);
  if (t.clCapOrder != null) cl = Math.min(cl, t.clCapOrder);
  let reg = amount * (t.regPct || 0) + (t.regFix || 0) + shares * (t.regPerShare || 0);
  if (t.regCap != null) reg = Math.min(reg, t.regCap);
  return ex + cl + reg;
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
 * `brokerFees` is Easybroker's commission both ways, the third-party lines
 * it passes on, and a forced conversion.
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
    url: SCHEDULE.page,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Easybroker n'existe pas encore : lancer `node brokers/easybroker/easybroker_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Easybroker` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Easybroker`,
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
  const mic = code(m.row.mic) || code(listing.mic);
  const us = US_LISTED.has(mic);
  const listed = COMMISSION[settle] ?? null;
  const offHome = listed?.each != null && !PER_SHARE_HOME[settle]?.has(mic);
  const rule = offHome ? null : listed;
  const third = us ? null : THIRD[mic] ?? null;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = givenPerShare ?? book.leaf?.perShare ?? null;

  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? settle : SCHEDULE.base,
    remark: [held ? fxRemark("≤0.03", settle) : "", m.row.remark || ""].filter(Boolean).join("\n"),
    bp: marketBp,
    perShare: marketPerShare,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(settle) },
  };

  if (!rule) {
    return {
      ...shared,
      basis: `liste Easybroker du ${SCHEDULE.validFrom} relue le ${SCHEDULE.readOn}`,
      why: offHome
        ? `Easybroker ne facture à la part en ${settle} que sur ${settle === "USD" ? "les marchés américains" : "les marchés canadiens"} et ne publie aucun taux en % pour une ligne en ${settle} sur ${listing.exchange || mic}`
        : `Easybroker ne publie pas de commission en ${settle || "cette devise"} (ni la liste ni le calculateur)`,
    };
  }

  const basis =
    `liste Easybroker du ${SCHEDULE.validFrom} relue le ${SCHEDULE.readOn}, ligne ${settle} : ${ruleText(rule)}` +
    (us
      ? " ; frais tiers américains : bourse 0,0002 %, NSCC/DTC 0,00020 $ la part, CAT 0,000035 $ la part, NYSE 0,0175 % et FINRA 0,0563 % de la commission, SEC et TAF à la vente"
      : third
        ? ` ; frais tiers ${third.label} selon le calculateur Easybroker`
        : " ; frais de bourse et de compensation nommés par la liste sans montant, comptés à 0 comme SEC / TAF / CAT non publiés");

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, basis, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, basis, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = code(listing.currency) === "GBX" ? (n * p) / 100 : n * p;
  const notionalUsd = dollars(notional, settle);
  const amount = convert(notional, settle, rule.ccy);
  const buy = commissionSide(rule, { shares: n, amount });
  const sell = commissionSide(rule, { shares: n, amount });
  const commissionNative = buy && sell ? buy.charged + sell.charged : null;
  const commissionUsd = commissionNative == null ? null : dollars(commissionNative, rule.ccy);

  // Third-party lines the list and the calculator print.
  const said = [];
  let thirdUsd = 0;
  if (us) {
    const side = (leg) =>
      notional * US.exchangePct +
      Math.min(n * US.nsccPerShare, notional * US.nsccMaxPct) +
      n * US.catPerShare +
      leg.charged * (US.nysePassThrough + US.finraPassThrough);
    const sale = notional * US.secRate + Math.min(n * US.tafPerShare, US.tafCap);
    thirdUsd = buy && sell ? dollars(side(buy) + side(sell) + sale, "USD") : null;
    said.push(`vente américaine : SEC ${US.secRate} du montant, TAF ${US.tafPerShare} $ la part (plafond ${num(US.tafCap)} $), taux courants des régulateurs`);
  } else if (third) {
    const ccy = third.ccy || settle;
    const amountThere = convert(notional, settle, ccy);
    const each = amountThere == null ? null : thirdSide(third, { shares: n, amount: amountThere });
    thirdUsd = each == null ? null : dollars(2 * each, ccy);
    if (each != null) said.push(`frais tiers ${third.label} ${Number(each.toPrecision(4))} ${ccy} par sens`);
  }

  // Forced conversion: AutoFX on the buy, no published way back for these.
  const fxUnpublished = !held && NO_FX_BACK.has(settle);
  const fxUsd = held ? 0 : fxUnpublished ? null : notionalUsd == null ? null : notionalUsd * AUTOFX;
  const brokerFees = plus(commissionUsd, thirdUsd, fxUsd);

  // Taxes from the tax map; UK / Irish stamp on the home book.
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const country = (listing.isin || "").slice(0, 2);
  const stampReaches = !STAMP_HOME[country] || STAMP_HOME[country].has(code(listing.mic));
  const taxPct = stampReaches ? Object.values(rates).reduce((s, r) => s + r, 0) : 0;
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;

  // Statutory levies outside the map, and the calculator's Budapest tax.
  let leviesNative = 0;
  let huTooBig = false;
  if (mic === "XLON" && settle === "GBP" && isStock(listing) && UK_REGISTERED.test(listing.isin || "")) {
    if (notional > PTM.above) {
      leviesNative += 2 * PTM.each;
      said.push(`prélèvement PTM ${num(PTM.each)} £ par sens, le montant dépasse ${PTM.above} £`);
    }
  }
  if (mic === "XHKG" && isStock(listing)) {
    const side = notional * HK_STAMP;
    const each = settle === "HKD" ? Math.ceil(side - 1e-9) : side;
    leviesNative += 2 * each;
    said.push(`droit de timbre de Hong Kong 0,1 % par sens sur une action${settle === "HKD" ? ", arrondi au HKD supérieur" : ""}`);
  }
  if ((mic === "XSHG" || mic === "XSHE") && isStock(listing)) {
    leviesNative += notional * CONNECT_STAMP;
    said.push("droit de timbre chinois 0,05 % à la vente (Stock Connect)");
  }
  if (mic === "XBUD") {
    const huf = convert(notional, settle, "HUF");
    if (huf == null || huf > HU_TAX.upTo) huTooBig = true;
    else {
      leviesNative += notional * HU_TAX.rate;
      said.push("taxe hongroise 0,45 % à l'achat (calculateur Easybroker)");
    }
  }
  const leviesUsd = huTooBig ? null : dollars(leviesNative, settle);

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
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
    fxUnpublished
      ? `${settle} n'est pas une devise de dépôt : AutoFX convertit l'achat (au plus 0,03 %), mais la grille de change n'a pas de ligne ${settle} pour rapatrier la vente`
      : null,
    huTooBig ? `ordre au-delà de ${HU_TAX.upTo} HUF (ou sans cours HUF) : Easybroker ne publie pas de plafond pour la taxe hongroise de 0,45 %` : null,
    notionalUsd == null ? `aucun cours en dollars pour ${settle} dans fx.mjs` : null,
  ].filter(Boolean);

  const leg = (l) =>
    l.capped
      ? `plafonnée à ${Number(l.charged.toPrecision(4))} ${l.currency} (1 % de l'ordre)`
      : l.floored
        ? `au plancher ${num(l.charged)} ${l.currency} (le barème donnerait ${Number(l.raw.toPrecision(3))})`
        : `${Number(l.charged.toPrecision(4))} ${l.currency}`;
  const confidence = [
    basis,
    buy ? `commission ${leg(buy)} par sens` : null,
    taxPct ? `taxe à l'achat ${Object.entries(rates).map(([k, v]) => `${k} ${pc(v)} %`).join(", ")} (taxMap.mjs)` : null,
    ...said,
    held
      ? `${settle} est une devise de dépôt : AutoFX au plus 0,03 % hors total`
      : !fxUnpublished
        ? `change forcé AutoFX 0,03 % à l'achat, la vente reste en ${settle}`
        : null,
    us
      ? book.q != null
        ? `carnet 605 × Q ${Number(Number(book.q).toPrecision(3))} (606 du courtier américain)`
        : "carnet NBBO coté : pas d'alias 606 easybroker dans rule606.mjs"
      : marketBp != null
        ? `carnet ${Number(Number(marketBp).toPrecision(4))} bp`
        : null,
    "hors total : garde et inactivité nulles, retraits, frais ADR périodiques, données en temps réel",
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
      perShare: rule.each ?? null,
      min: rule.min,
      maxPct: rule.maxPct ?? null,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      tiers: finite(thirdUsd, 6),
      change: finite(fxUsd, 6),
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
    console.log(JSON.stringify({ ...SCHEDULE, commission: COMMISSION, third: THIRD, us: US, autoFx: AUTOFX, ptm: PTM, hu: HU_TAX }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/easybroker/easybroker_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]");
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
    if (out.alternatives?.length) console.log(`\nce qu'Easybroker propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    return;
  }
  console.log(`Easybroker — ${l.ticker || l.isin} — ${l.name || ""}`);
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
