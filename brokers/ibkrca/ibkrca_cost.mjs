// What one round trip costs at Interactive Brokers Canada: buy n shares at
// price p, sell them straight back, online, in dollars.
//
// Interactive Brokers Canada Inc. (CIRO member). The catalogue is the IBKR
// group's stock and ETF book under the "ca" domain (`ibkrca_scraping.mjs`).
// The price list is the Canadian page, read on 2026-10-19:
//
//   https://www.interactivebrokers.ca/en/pricing/commissions-stocks.php
//   https://www.interactivebrokers.ca/en/pricing/commissions-spot-currencies.php
//   https://www.interactivebrokers.ca/en/accounts/fees/<exchange>.php  (third-party fees)
//
// Its stock tables are word for word the IE and UK ones. The account picks
// Fixed or Tiered. Tiered adds each venue's exchange, clearing and ECN fee,
// which depends on where SmartRouting fills, so it has no single number:
// this file prices IBKR Pro Fixed + IB SmartRouting, the all-in column.
// Korea, Taiwan, Malaysia and Brazil print Tiered only; there the first
// volume bucket is used with the third-party fees their fee pages print.
//
//   United States    USD 0.005 a share, min 1, max 1 % (max wins under min).
//                    SEC 0.0000206 of a sale, FINRA TAF USD 0.00 (fee
//                    holiday 1 Oct - 31 Dec 2026), CAT 0.000003 a share both
//                    ways. OTC Link and the Texas exchange are on this card.
//   Canada           CAD 0.01 a share, min 1, max 0.5 %. USD lines: TSX only,
//                    USD 0.008, min 0.80, max 0.4 %. Fixed: no third party.
//   Europe           0.05 %, min EUR 3 / GBP 3 / CHF 5 / USD 4 / DKK, NOK,
//                    SEK 49, by the currency the country prints. Swedish
//                    EUR 0.10 % min 4, Swiss JPY 0.08 % min 80. Portugal
//                    0.15 % min 6, Baltics 0.20 % min 10, Poland 0.10 % min
//                    PLN 15, Prague 0.15 % min CZK 70, Bucharest 0.28 % min
//                    RON 10, Ljubljana 0.35 % min 3, Budapest HUF 0.55 % buy
//                    (the 0.45 % FTT inside, to HUF 4 444 444, then 0.10 %)
//                    and 0.10 % sell, min HUF 200. Euronext FR/NL/BE ETFs
//                    pay EUR 0.75 an execution; the PTM levy is GBP 1.50 a
//                    side above GBP 10 000. Cboe Europe, Turquoise and Aquis
//                    lines are priced on the country of their IBKR book
//                    (CHIXDE -> Germany ...).
//   Hong Kong        0.08 %, min HKD 18 / USD 2.25 / CNH 15. Fixed passes the
//                    regulatory fees: SFC 0.0027 %, FRC 0.00015 % a side,
//                    stamp 0.1 % a side on a stock (HKD rounded up).
//   Stock Connect    0.08 %, min CNH 15; stamp 0.05 % on a stock sale.
//   Japan 0.08 % min JPY 80. Australia (ASX, Cboe AU) 0.08 % min AUD 6.
//   Singapore 0.08 %, min SGD 2.50 / USD 2 / GBP 1.40 / HKD 14.50 / EUR 2.
//   Israel 0.10 % min ILS 15. Saudi 0.10 %. ADX 0.10 % min AED 5. DFM 0.25 %
//   min AED 5 plus AED 10 an order. Mexico 0.10 % min MXN 60.
//   Korea (Tiered)   0.06 % min KRW 4 000; 0.2 % tax on a stock sale.
//   Taiwan (Tiered)  0.08 % min TWD 80; 0.02 % execution a side; tax 0.3 %
//                    on a stock sale (0.15 % same day), 0.1 % on an ETF.
//   Malaysia (Tiered) 0.08 % min MYR 12; stamp MYR 1 per 1 000 or part a
//                    side (max 1 000, none on an ETF), clearing 0.03 % (max
//                    1 000) and MYR 43.40 settlement an order.
//   Brazil (Tiered)  0.07 %; exchange 0.005 % and clearing 0.025 % a side.
//                    The USD 20 monthly B3 fee is a remark.
//
// Not on the card, so N/A: Helsinki, Euronext Dublin, Johannesburg, a USD
// line on Cboe Canada / CSE / TSX Venture, and any currency a country does
// not print (a USD line in Paris, CAD on SIX ...). Fixed's position fee on
// PLN, CZK and Ljubljana stock (0.03-0.05 % a year) is not a same-day cost.
// Fractional orders: the US 0.01 floor applies, the lower European
// fractional minimums do not (whole-share minimum kept). GST/PST on
// "eligible services" has no rate for a trade. Custody is free.
//
// FX: a listing in a deposit currency (deposits.mjs) is a remark, the 0.03 %
// auto-conversion spread ("FX 0.03% when cash ≠ CCY."). Any other currency
// (KRW, TWD, MYR, BRL, SAR, AED, RON) converts both ways at that 0.03 %, in
// the total. Stamp / FTT come from taxMap.mjs (taxGap = N/A). The book is
// spreadLeaf; on the US tape Interactive Brokers LLC's 606 Q, the broker
// that carries IBKR Canada's US orders.
//
//   node brokers/ibkrca/ibkrca_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/ibkrca/ibkrca_cost.mjs RY XTSE CAD --shares=10 --price=190
//   node brokers/ibkrca/ibkrca_cost.mjs 700 XHKG HKD --shares=100 --price=500
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

export const READ_ON = "2026-10-19";

// US regulatory block of the Fixed column.
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0; // fee holiday, 1 Oct - 31 Dec 2026
const CAT_PER_SHARE = 0.000003;
const PTM = { each: 1.5, ccy: "GBP", above: 10000 };
const EURONEXT_ETF = { each: 0.75, ccy: "EUR" };
const FX_AUTO = 0.0003;
const HK = { sfc: 0.000027, frc: 0.0000015, stamp: 0.001 };
const CONNECT_STAMP = 0.0005;
const KR_TAX = 0.002;
const TW = { exec: 0.0002, stock: 0.003, etf: 0.001, dayTrade: 0.0015 };
const MY = { stampPer: 1000, stampMax: 1000, clearing: 0.0003, clearingMax: 1000, settlement: 43.4 };
const BR = { exchange: 0.00005, clearing: 0.00025, monthlyUsd: 20 };
const DFM_ORDER = 10;
const UK_REGISTERED = /^(GB|GG|JE|IM)/;
const STAMP_HOME = { GB: new Set(["XLON", "AQXE", "XMSM"]), IE: new Set(["XMSM", "XLON", "AQXE"]) };

const p5 = (min) => ({ rate: 0.0005, min });
// Fixed SmartRouting, first bucket. Each country lists the currencies it prints.
export const MARKETS = {
  us: { label: "États-Unis", byCcy: { USD: { perShare: 0.005, min: 1, maxPct: 0.01, fractionalFloor: 0.01 } } },
  tsx: {
    label: "Canada (TSX)",
    byCcy: { CAD: { perShare: 0.01, min: 1, maxPct: 0.005 }, USD: { perShare: 0.008, min: 0.8, maxPct: 0.004 } },
  },
  ca: { label: "Canada", byCcy: { CAD: { perShare: 0.01, min: 1, maxPct: 0.005 } } },
  mx: { label: "Mexique", byCcy: { MXN: { rate: 0.001, min: 60 } } },
  br: { label: "Brésil", tieredOnly: true, byCcy: { BRL: { rate: 0.0007, min: null } } },
  at: { label: "Autriche", byCcy: { EUR: p5(3) } },
  be: { label: "Belgique", byCcy: { EUR: p5(3) } },
  fr: { label: "France", byCcy: { EUR: p5(3) } },
  en: { label: "Euronext (FR/NL/BE)", byCcy: { EUR: p5(3) } },
  de: { label: "Allemagne", byCcy: { EUR: p5(3) } },
  it: { label: "Italie", byCcy: { EUR: p5(3) } },
  es: { label: "Espagne", byCcy: { EUR: p5(3) } },
  nl: { label: "Pays-Bas", byCcy: { EUR: p5(3), USD: p5(4) } },
  uk: { label: "Royaume-Uni", byCcy: { GBP: p5(3), GBX: p5(3), EUR: p5(3), USD: p5(4) } },
  ch: {
    label: "Suisse",
    byCcy: { CHF: p5(5), EUR: p5(3), GBP: p5(3), USD: p5(4), JPY: { rate: 0.0008, min: 80 } },
  },
  dk: { label: "Danemark", byCcy: { DKK: p5(49) } },
  no: { label: "Norvège", byCcy: { NOK: p5(49) } },
  se: { label: "Suède", byCcy: { SEK: p5(49), EUR: { rate: 0.001, min: 4 } } },
  pt: { label: "Portugal", byCcy: { EUR: { rate: 0.0015, min: 6 } } },
  baltic: { label: "Baltes", byCcy: { EUR: { rate: 0.002, min: 10 } } },
  pl: { label: "Pologne", byCcy: { PLN: { rate: 0.001, min: 15 } } },
  cz: { label: "Tchéquie", byCcy: { CZK: { rate: 0.0015, min: 70 } } },
  hu: { label: "Hongrie", byCcy: { HUF: { buy: 0.0055, sell: 0.001, buyBand: 4444444, min: 200 } } },
  ro: { label: "Roumanie", byCcy: { RON: { rate: 0.0028, min: 10 } } },
  si: { label: "Slovénie", byCcy: { EUR: { rate: 0.0035, min: 3 } } },
  hk: {
    label: "Hong Kong",
    byCcy: { HKD: { rate: 0.0008, min: 18 }, USD: { rate: 0.0008, min: 2.25 }, CNH: { rate: 0.0008, min: 15 } },
  },
  connect: { label: "Stock Connect", byCcy: { CNH: { rate: 0.0008, min: 15 } } },
  jp: { label: "Japon", byCcy: { JPY: { rate: 0.0008, min: 80 } } },
  au: { label: "Australie", byCcy: { AUD: { rate: 0.0008, min: 6 } } },
  sg: {
    label: "Singapour",
    byCcy: {
      SGD: { rate: 0.0008, min: 2.5 },
      USD: { rate: 0.0008, min: 2 },
      GBP: { rate: 0.0008, min: 1.4 },
      HKD: { rate: 0.0008, min: 14.5 },
      EUR: { rate: 0.0008, min: 2 },
    },
  },
  kr: { label: "Corée", tieredOnly: true, byCcy: { KRW: { rate: 0.0006, min: 4000 } } },
  tw: { label: "Taïwan", tieredOnly: true, byCcy: { TWD: { rate: 0.0008, min: 80 } } },
  my: { label: "Malaisie", tieredOnly: true, byCcy: { MYR: { rate: 0.0008, min: 12 } } },
  il: { label: "Israël", byCcy: { ILS: { rate: 0.001, min: 15 } } },
  sa: { label: "Arabie saoudite", byCcy: { SAR: { rate: 0.001, min: null } } },
  adx: { label: "Abu Dhabi", byCcy: { AED: { rate: 0.001, min: 5 } } },
  dfm: { label: "Dubaï", byCcy: { AED: { rate: 0.0025, min: 5 } } },
};

const BY_MIC = {
  XNAS: "us",
  XNYS: "us",
  ARCX: "us",
  XASE: "us",
  BATS: "us",
  TXSE: "us",
  OTCM: "us",
  XTSE: "tsx",
  XATS: "tsx",
  XTSX: "ca",
  NEOE: "ca",
  XCNQ: "ca",
  XMEX: "mx",
  BVMF: "br",
  XWBO: "at",
  XBRU: "be",
  XPAR: "fr",
  XAMS: "nl",
  XMIL: "it",
  XMAD: "es",
  XETR: "de",
  XFRA: "de",
  XSTU: "de",
  XMUN: "de",
  XGAT: "de",
  XLON: "uk",
  XSWX: "ch",
  XCSE: "dk",
  XOSL: "no",
  XSTO: "se",
  XLIS: "pt",
  XTAL: "baltic",
  XRIS: "baltic",
  XLIT: "baltic",
  XWAR: "pl",
  XPRA: "cz",
  XBUD: "hu",
  XBSE: "ro",
  XLJU: "si",
  XHKG: "hk",
  XSHG: "connect",
  XSHE: "connect",
  XTKS: "jp",
  XASX: "au",
  CHIA: "au",
  XSES: "sg",
  XKRX: "kr",
  XTAI: "tw",
  ROCO: "tw",
  XKLS: "my",
  XTAE: "il",
  XSAU: "sa",
  XADS: "adx",
  XDFM: "dfm",
};
// Cboe Europe, Turquoise and Aquis: the IBKR book names the country.
const MTF = new Set(["CHIX", "TRQX", "AQXE"]);
const MTF_COUNTRY = { CH: "ch", DE: "de", EN: "en", ES: "es", IT: "it", UK: "uk", AT: "at", DK: "dk" };
const EURONEXT_ETF_MICS = new Set(["XPAR", "XAMS", "XBRU"]);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
// GBX is pence of GBP; CNH stays CNH (fx.mjs folds it into CNY for prices only).
const cashOf = (ccy) => (code(ccy) === "GBX" ? "GBP" : code(ccy));
const fxNote = (ccy) =>
  cashOf(ccy) === "CNH" ? `FX ${(100 * FX_AUTO).toFixed(2)}% when cash ≠ CNH.` : fxRemark((100 * FX_AUTO).toFixed(2), ccy);
const ibkrBook = (row) => code(String(row?.raw || "").split(" | ")[4]);
const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const c = code(currency) === "CNH" ? "CNY" : currency;
  const v = toUsd(amount, c);
  return v == null ? null : Number(v.toPrecision(12));
};
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  const a = code(from) === "CNH" ? "CNY" : code(from);
  const b = code(to) === "CNH" ? "CNY" : code(to);
  if (a === b) return amount;
  const usd = toUsd(amount, a);
  const per = usdPer(b);
  return usd == null || !(per > 0) ? null : usd / per;
}

/** The fee market of a catalogue row, from its MIC (and its IBKR book on an MTF). */
export function marketOf(row, mic) {
  const m = code(mic || row?.mic);
  if (MTF.has(m)) {
    const suffix = ibkrBook(row).slice(-2);
    return MTF_COUNTRY[suffix] || null;
  }
  return BY_MIC[m] || null;
}

/** One side's commission in the rule's currency. `amount` is in that currency too. */
export function commissionSide(rule, { shares, amount, side }) {
  if (rule.perShare != null) {
    if (!(shares > 0) || amount == null) return null;
    const raw = rule.perShare * shares;
    const ceiling = rule.maxPct != null ? amount * rule.maxPct : null;
    let charged;
    if (ceiling != null && rule.min != null && ceiling < rule.min) charged = ceiling;
    else {
      charged = ceiling != null ? Math.min(raw, ceiling) : raw;
      if (rule.min != null) charged = Math.max(rule.min, charged);
    }
    if (rule.fractionalFloor != null && !Number.isInteger(shares)) charged = Math.max(rule.fractionalFloor, charged);
    return { raw, charged, floored: rule.min != null && charged === rule.min && raw < rule.min, capped: ceiling != null && charged === ceiling };
  }
  if (amount == null) return null;
  let raw;
  if (rule.buy != null) {
    if (side === "sell") raw = amount * rule.sell;
    else raw = amount > rule.buyBand ? rule.buyBand * rule.buy + (amount - rule.buyBand) * rule.sell : amount * rule.buy;
  } else raw = amount * rule.rate;
  const charged = rule.min != null ? Math.max(rule.min, raw) : raw;
  return { raw, charged, floored: rule.min != null && raw < rule.min, capped: false };
}

// Third-party fees the column used passes on, in the listing currency, both
// sides together. Taxes from taxMap are separate.
function leviesOf({ market, listing, n, notional, notionalGbp }) {
  const stock = listing.type === "STOCK";
  const etf = listing.type === "ETF";
  const ccy = listing.currency;
  const out = { native: 0, said: [], remark: [] };
  if (market === "us") {
    out.native = notional * SEC_RATE + TAF_PER_SHARE * n + 2 * CAT_PER_SHARE * n;
    out.said.push(`SEC ${SEC_RATE} de la vente, TAF 0 (suspendue jusqu'au 31/12/2026), CAT ${CAT_PER_SHARE} $ la part dans les deux sens`);
  } else if (market === "hk") {
    const stampSide = !stock ? 0 : ccy === "HKD" ? Math.ceil(notional * HK.stamp) : notional * HK.stamp;
    out.native = 2 * notional * (HK.sfc + HK.frc) + 2 * stampSide;
    out.said.push(`SFC 0,0027 % et FRC 0,00015 % par sens${stock ? ", droit de timbre 0,1 % par sens" : ""} (colonne Fixed : « Regulatory Fees »)`);
  } else if (market === "connect") {
    out.native = stock ? notional * CONNECT_STAMP : 0;
    if (stock) out.said.push("droit de timbre 0,05 % sur la vente (Stock Connect)");
  } else if (market === "kr") {
    out.native = stock ? notional * KR_TAX : 0;
    if (stock) out.said.push("taxe coréenne 0,2 % sur la vente d'une action");
  } else if (market === "tw") {
    const tax = stock ? TW.stock : TW.etf;
    out.native = 2 * notional * TW.exec + notional * tax;
    out.said.push(`frais d'exécution 0,02 % par sens, taxe ${(100 * tax).toFixed(1)} % sur la vente`);
    if (stock) out.remark.push(`Same day sell is ${Number((100 * (TW.stock - TW.dayTrade)).toFixed(2))}% lower.`);
  } else if (market === "my") {
    const stamp = etf ? 0 : Math.min(MY.stampMax, Math.ceil(notional / MY.stampPer));
    const clearing = Math.min(MY.clearingMax, notional * MY.clearing);
    out.native = 2 * (stamp + clearing + MY.settlement);
    out.said.push("timbre 1 MYR par 1 000 (max 1 000, pas sur un ETF), compensation 0,03 % (max 1 000), règlement 43,40 MYR par ordre, chaque sens");
  } else if (market === "br") {
    out.native = 2 * notional * (BR.exchange + BR.clearing);
    out.said.push("B3 : bourse 0,005 % et compensation 0,025 % par sens");
    out.remark.push(`B3 access is USD ${BR.monthlyUsd} a month.`);
  } else if (market === "dfm") {
    out.native = 2 * DFM_ORDER;
    out.said.push("DFM : 10 AED par ordre, chaque sens");
  }
  if (etf && EURONEXT_ETF_MICS.has(listing.mic)) {
    const each = convert(EURONEXT_ETF.each, EURONEXT_ETF.ccy, ccy);
    out.native = each == null ? null : out.native + 2 * each;
    out.said.push("Euronext ETF : 0,75 € par exécution, les deux sens");
  }
  if (market === "uk" && stock && UK_REGISTERED.test(listing.isin || "")) {
    if (notionalGbp == null) {
      out.native = null;
      out.said.push("prélèvement PTM indécidable : montant non converti en livres");
    } else if (notionalGbp > PTM.above) {
      const each = convert(PTM.each, PTM.ccy, ccy);
      out.native = each == null || out.native == null ? null : out.native + 2 * each;
      out.said.push("prélèvement PTM de 1,50 £ par sens au-delà de 10 000 £");
    }
  }
  return out;
}

function findListing(rows, { etf, place, currency }) {
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
 * MARKETS with an entity's partial override merged over it. Each key of
 * `over` is a market: `null` drops it (N/A), an object is merged over the
 * default (a new key adds a market) and its `byCcy` is merged currency by
 * currency (`null` drops a currency). No override returns MARKETS itself.
 */
export function mergeMarkets(over) {
  if (!over) return MARKETS;
  const out = { ...MARKETS };
  for (const [key, value] of Object.entries(over)) {
    if (value == null) {
      delete out[key];
      continue;
    }
    const prior = out[key] || {};
    const byCcy = { ...(prior.byCcy || {}), ...(value.byCcy || {}) };
    for (const [ccy, rule] of Object.entries(byCcy)) if (rule == null) delete byCcy[ccy];
    out[key] = { ...prior, ...value, byCcy };
  }
  return out;
}

/**
 * One IBKR entity: its folder, its catalogue, the cash it is based in, its
 * price-list URL and its name. Every IBKR price list prints the same stock
 * tables; what changes is the account currency and the deposit list.
 * Where an entity's own page differs, `markets` is a partial MARKETS
 * override (see mergeMarkets) and `byMic` maps extra MICs to a market key
 * (a falsy value makes that MIC N/A). A market entry may also carry
 * `column` (French name of the price column, default "Fixed + IB
 * SmartRouting"), `plan` (the answer's plan) and `levies` (the market key
 * whose third-party fees apply, default its own); a rule may carry `note`
 * (French text replacing the generated rule text). `commissionTax` is
 * `{ rate, label, markets }`: a consumption tax (GST) on the commission,
 * on every market or only the listed market keys. `catalogue` passes an
 * already parsed catalogue (two plans of one entity share it).
 */
export function makeIbkr({ folder, entity, base, page, catalogueUrl, markets = null, byMic = null, commissionTax = null, catalogue: given = null }) {
  const MARKET = mergeMarkets(markets);
  const micMap = byMic ? { ...BY_MIC, ...byMic } : BY_MIC;
  const marketHere = (row, mic) => {
    const m = code(mic || row?.mic);
    if (!MTF.has(m) && Object.prototype.hasOwnProperty.call(micMap, m)) return micMap[m] || null;
    return marketOf(row, mic);
  };
  const catalogue = given ?? (fs.existsSync(catalogueUrl) ? JSON.parse(fs.readFileSync(catalogueUrl, "utf8")) : null);
  const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
  if (rows.length) warmListingIndex(rows);
  const deposit = (ccy) => depositHas(folder, null, cashOf(ccy));

  function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
    const answer = {
      usd: null,
      brokerFees: null,
      ccy: QUOTE,
      etf,
      place,
      currency,
      onlineBuy: true,
      cashCurrency: base,
      url: page,
      remark: "",
    };
    if (!catalogue) {
      return { ...answer, why: `le catalogue ${entity} n'existe pas encore : lancer \`node brokers/${folder}/${folder}_scraping.mjs\`` };
    }
    const { named, matches } = findListing(rows, { etf, place, currency });
    if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${entity}` };
    if (!matches.length) {
      return {
        ...answer,
        why: `${etf} n'est pas coté sur cette place dans cette devise chez ${entity}`,
        alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
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
      currency: code(m.row.currency),
      brokerExchange: m.row.exchange || null,
      ibkrBook: ibkrBook(m.row) || null,
    };
    const cash = cashOf(listing.currency);
    const held = deposit(listing.currency);
    const marketBp = bp ?? book.leaf?.bp ?? null;
    const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
    const market = marketHere(m.row, m.venue?.mic ?? m.row.mic);
    const table = market ? MARKET[market] ?? null : null;
    const rule = table?.byCcy?.[listing.currency] ?? null;
    const ruleCcy = rule ? (listing.currency === "GBX" ? "GBP" : listing.currency) : null;

    const remarks = [];
    if (held && cash !== base) remarks.push(fxNote(listing.currency));
    const rowRemark = m.row.remark || "";
    const shared = {
      ...answer,
      listing,
      cashCurrency: held ? cash : base,
      feeMarket: market,
      plan: table?.plan ?? (table?.tieredOnly ? "tiered" : "fixed"),
      fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
      fxIfConverted: held ? FX_AUTO : 0,
      bp: marketBp,
      perShare: marketPerShare,
      remark: [rowRemark, ...remarks].filter(Boolean).join("\n"),
    };
    if (!rule) {
      return {
        ...shared,
        basis: `${entity}, grille Fixed SmartRouting relue le ${READ_ON}`,
        why: table
          ? `${entity} n'imprime pas de grille ${listing.currency} pour ${table.label}`
          : `${listing.exchange || listing.brokerExchange || "cette place"} n'est pas sur la grille ${entity} du ${READ_ON}`,
      };
    }

    const n = Number(shares);
    const p = Number(price);
    if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
    if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

    const settle = listing.currency === "GBX" ? "GBP" : listing.currency;
    const notional = listing.currency === "GBX" ? (n * p) / 100 : n * p;
    const notionalUsd = dollars(notional, settle);
    const amount = convert(notional, settle, ruleCcy === "GBX" ? "GBP" : ruleCcy);
    const buy = commissionSide(rule, { shares: n, amount, side: "buy" });
    const sell = commissionSide(rule, { shares: n, amount, side: "sell" });
    const commissionCcy = ruleCcy === "GBX" ? "GBP" : ruleCcy;
    const vat =
      commissionTax && (!commissionTax.markets || commissionTax.markets.includes(market)) ? commissionTax.rate : 0;
    const commissionUsd = buy && sell ? dollars((buy.charged + sell.charged) * (1 + vat), commissionCcy) : null;
    const fxUsd = held ? 0 : notionalUsd == null ? null : notionalUsd * FX_AUTO * 2;
    const brokerFees = plus(commissionUsd, fxUsd);

    const levies = leviesOf({ market: table.levies ?? market, listing, n, notional, notionalGbp: convert(notional, settle, "GBP") });
    const leviesUsd = levies.native == null ? null : dollars(levies.native, settle);

    const tax = taxesOf(listing.isin);
    const country = (listing.isin || "").slice(0, 2);
    const stampReaches = !STAMP_HOME[country] || STAMP_HOME[country].has(listing.mic);
    const taxPct = stampReaches ? Object.values(taxRates(tax)).reduce((s, r) => s + r, 0) : 0;
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
      notionalUsd == null ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs` : null,
      levies.native == null ? "frais de place non convertis" : null,
    ].filter(Boolean);

    const ruleText =
      rule.note ??
      (rule.perShare != null
        ? `${rule.perShare} ${commissionCcy} la part, plancher ${rule.min}, plafond ${(100 * rule.maxPct).toFixed(1)} %`
        : rule.buy != null
          ? `${(100 * rule.buy).toFixed(2)} % à l'achat (jusqu'à ${rule.buyBand} ${commissionCcy}, puis ${(100 * rule.sell).toFixed(2)} %), ${(100 * rule.sell).toFixed(2)} % à la vente, plancher ${rule.min}`
          : `${(100 * rule.rate).toFixed(3)} % par sens` + (rule.min != null ? `, plancher ${rule.min} ${commissionCcy}` : ", sans plancher"));
    const said = [
      `${entity}, ${table.column ?? (table.tieredOnly ? "Tiered seul imprimé, premier palier" : "Fixed + IB SmartRouting")}, ${table.label} : ${ruleText}`,
      buy?.capped ? "commission au plafond" : buy?.floored ? "commission au plancher" : "commission au taux",
      vat ? `${commissionTax.label} sur la commission` : null,
      ...levies.said,
      taxPct ? `taxe à l'achat ${(100 * taxPct).toFixed(2)} % (taxMap.mjs)` : null,
      held
        ? `${listing.currency} est une devise de dépôt : conversion 0,03 % hors total`
        : `${listing.currency} n'est pas une devise de dépôt : conversion automatique 0,03 % par sens dans le total`,
    ].filter(Boolean);

    return {
      ...shared,
      remark: [shared.remark, ...levies.remark].filter(Boolean).join("\n"),
      usd: finite(usd, 6),
      brokerFees: finite(brokerFees, 6),
      ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
      basis: `${entity}, grille relue le ${READ_ON} : ${ruleText}`,
      confidence: said.join(" ; "),
      trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: settle },
      commission: {
        buy: finite(buy?.charged, 6),
        sell: finite(sell?.charged, 6),
        currency: commissionCcy,
        eachWay: true,
        rate: rule.rate ?? null,
        perShare: rule.perShare ?? null,
        min: rule.min ?? null,
        maxPct: rule.maxPct ?? null,
        ...(vat ? { tax: vat } : {}),
      },
      parts: {
        marché: finite(bookUsd, 6),
        courtage: finite(commissionUsd, 6),
        change: finite(fxUsd, 6),
        frais: finite(leviesUsd, 6),
        taxes: finite(taxUsd, 6),
      },
    };
  }

  return { roundTrip, rows };
}

// Entities whose page prints an IBKR Lite column (US, Singapore).
export const PLANS = ["pro", "lite"];

/**
 * An IBKR entity that prints both IBKR Pro (Fixed) and IBKR Lite: US
 * exchange-listed lines at USD 0, OTC Markets and other markets at Fixed.
 * `opts` are makeIbkr's; `liteLabel` names the Lite column.
 */
export function makeIbkrProLite(opts, liteLabel = "IBKR Lite") {
  const pro = makeIbkr(opts);
  const lite = makeIbkr({
    ...opts,
    catalogue: pro.rows.length ? pro.rows : null,
    markets: {
      ...(opts.markets || {}),
      us: {
        column: liteLabel,
        byCcy: { USD: { rate: 0, min: null, note: "0 USD, sans plancher (IBKR Lite, actions et ETF cotés sur une bourse américaine)" } },
      },
      // OTC Markets is "non-exchange-listed": Fixed pricing under Lite.
      otc: { ...MARKETS.us, label: "États-Unis (OTC)", column: `${liteLabel}, OTC au tarif Fixed`, levies: "us" },
    },
    byMic: { ...(opts.byMic || {}), OTCM: "otc" },
  });
  function roundTrip({ plan = "pro", ...query }) {
    const id = String(plan || "pro").toLowerCase();
    if (id === "pro" || id === "fixed") return { ...pro.roundTrip(query), plan: "pro" };
    if (id === "lite") return { ...lite.roundTrip(query), plan: "lite" };
    const { parts, commission, trade, basis, confidence, ...head } = pro.roundTrip(query);
    return { ...head, usd: null, brokerFees: null, plan: id, why: `formule inconnue : ${plan} (pro|lite)` };
  }
  return { roundTrip, rows: pro.rows };
}

const ibkrca = makeIbkr({
  folder: "ibkrca",
  entity: "Interactive Brokers Canada",
  base: "CAD",
  page: "https://www.interactivebrokers.ca/en/pricing/commissions-stocks.php",
  catalogueUrl: new URL("ibkrca-parsed.json", import.meta.url),
});

export const roundTrip = ibkrca.roundTrip;

export function runCli(metaUrl, fn) {
  let called = false;
  try {
    called = metaUrl === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(
    JSON.stringify(
      fn({
        etf,
        place,
        currency,
        shares: Number(arg("shares", "10")),
        price: Number(arg("price", "0")),
        ...(arg("plan") ? { plan: arg("plan") } : {}),
      }),
      null,
      2
    )
  );
}

runCli(import.meta.url, roundTrip);
