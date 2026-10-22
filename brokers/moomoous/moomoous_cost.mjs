// What one round trip costs at moomoo US (Moomoo Financial Inc.) for a
// client living in the United States: buy n shares, sell them back, in
// dollars. Online cash order. Options, index options, prediction markets,
// fractional orders, margin and IPOs stay out.
//
// https://www.moomoo.com/us/pricing
// https://www.moomoo.com/us/support/topic4_66   fee schedule for U.S. residents
//   ("Updated on 1 October, 2026")
// Read on 2026-10-21.
//   US stocks, ADRs, ETFs/ETNs, REITs, each side, USD
//                       commission 0
//                       platform 0 ("During Promotion", since November 2018,
//                       "may end at anytime with 30 days notification ahead")
//                       SEC 0.0000206 of the sale, minimum 0.01 USD
//                       TAF 0 USD a share (sells only)
//                       CAT 0.000003 USD a share (NMS stocks), both sides
//                       The DTC's ADR custody fee (0.01-0.05 USD a share a
//                       year) is a holding fee and stays out. The non-retail
//                       commission (0.0049 USD a share) is for accounts the
//                       upstream firms class as non-retail and stays out.
//   (the Texas Stock Exchange, TXSE, is one of these NMS markets)
//   OTC stocks (OTC Markets: OTCQX, OTCQB, OTCID, Pink Limited), USD
//                       "Stocks include individual stocks, OTC stocks,
//                       preferred stocks": commission 0, platform 0 as above
//                       SEC 0.0000206 of the sale, minimum 0.01 USD
//                       TAF 0
//                       CAT "OTC Stocks: $0.00000003/Share", both sides
//                       No Rule 606 quarter covers OTC lines: the book is the
//                       OTC Markets touch.
//   Hong Kong stocks and ETFs, each side, HKD
//                       commission 0.03 %, minimum 3 HKD; platform 15 HKD
//                       settlement 0.0042 %, trading 0.00565 % (min 0.01),
//                       SFC 0.0027 % (min 0.01), FRC 0.00015 %
//                       stamp 0.1 %, minimum 1 HKD, rounded up to the next
//                       HKD (Hong Kong stamp law); none on an ETF (exempt
//                       since 2015), due on a REIT
//   China A-shares (Stock Connect), each side, CNH
//                       commission 0.03 %, minimum 3 CNH; platform 15 CNH
//                       handling 0.00341 % (ETF 0.004 %), securities
//                       management 0.002 % and CSDC 0.001 % (not on an ETF),
//                       HKSCC 0.002 %, stamp 0.05 % on the sale (not on an ETF)
//                       The portfolio fee (0.008 % a year of the holding) is a
//                       negligible holding fee and stays out.
//
// Cash. A deposit and a withdrawal are dollars only ("Currently, only USD
// is supported", topic4_295 and topic4_296; deposits.mjs). A Hong Kong
// dollar or CNH line is bought with dollars exchanged in the account
// ("based on the Moomoo US comprehensive rate", topic4_40; the Universal
// Account page: without cash in that currency, unified buying power borrows
// it on margin). The customer agreement only says a conversion is "at a rate
// of exchange determined conclusively by you". No spread is printed, so the
// conversion leg is unknown and the total of an HKD or CNH line is N/A. A
// Hong Kong dollar-counter line (USD) needs no conversion.
//   https://www.moomoo.com/us/support/topic4_40
//   https://www.moomoo.com/us/support/topic4_475
//
// US orders: MFI's own Rule 606 report (CRD 283078, 2026 Q2) says it
// "routes order flow to its affiliated broker-dealer Futu Clearing Inc. for
// further order handling", which routes to Citadel Securities, Jane Street,
// Virtu Americas and Canaccord. Until an alias names a dealer for moomoous,
// the US book is the quoted NBBO.
//   https://cdn.finra.org/606/2026/283078_606_NMS_2026_Q2_CNTXT_FUTM_V1.pdf
//
//   node brokers/moomoous/moomoous_cost.mjs AAPL Nasdaq USD --shares=10 --price=230
//   node brokers/moomoous/moomoous_cost.mjs NSRGY OTC USD --shares=20 --price=100
//   node brokers/moomoous/moomoous_cost.mjs 00700 "Hong Kong Stock Exchange" HKD --shares=100 --price=500
//   node brokers/moomoous/moomoous_cost.mjs 600519 "Shanghai Stock Exchange" CNH --shares=100 --price=1500
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("moomoous-parsed.json", import.meta.url);
const PAGE = "https://www.moomoo.com/us/pricing";
const SCHEDULE = "https://www.moomoo.com/us/support/topic4_66";
const FX_PAGE = "https://www.moomoo.com/us/support/topic4_40";
const READ_ON = "2026-10-21";
const SCHEDULE_ON = "2026-10-01";
// The help centre's only deposit currency (topic4_295), until deposits.mjs
// carries moomoous.
const DEPOSIT = "USD";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const ceilUnit = (amount) => Math.ceil(amount - 1e-6);

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
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function marketOf(listing) {
  const mic = listing.mic;
  const place = loose(listing.brokerExchange);
  if (mic === "OTCM" || place.startsWith("OTC")) return "OTC";
  if (mic === "XHKG" || place.startsWith("HONGKONG")) return "HK";
  if (["XNAS", "XNYS", "ARCX", "XASE", "BATS", "XCHI", "TXSE"].includes(mic) || /NASDAQ|NEWYORK|NYSE|CBOE|TEXAS/.test(place)) return "US";
  if (mic === "XSHG" || mic === "XSHE" || place.startsWith("SHANGHAI") || place.startsWith("SHENZHEN")) return "CN";
  return "";
}

// Both sides of the ticket in the fee currency: broker fees and levies.
function ticket({ market, type, currency, notional, shares }) {
  const etf = type === "ETF";
  if (market === "US" || market === "OTC") {
    const cat = market === "OTC" ? 0.00000003 : 0.000003;
    const levy = Math.max(0.01, notional * 0.0000206) + shares * cat * 2;
    return { fees: 0, levy, feeCcy: "USD" };
  }
  if (market === "HK") {
    // The Hong Kong table is in HKD, a USD or CNH counter included.
    const usd = toUsd(notional, currency);
    const hkd = usd == null || !(usdPer("HKD") > 0) ? null : usd / usdPer("HKD");
    if (hkd == null) return null;
    const side = Math.max(3, hkd * 0.0003) + 15;
    const levy =
      hkd * 0.000042 +
      Math.max(0.01, hkd * 0.0000565) +
      Math.max(0.01, hkd * 0.000027) +
      hkd * 0.0000015 +
      (etf ? 0 : Math.max(1, ceilUnit(hkd * 0.001)));
    return { fees: side * 2, levy: levy * 2, feeCcy: "HKD" };
  }
  if (market === "CN") {
    const side = Math.max(3, notional * 0.0003) + 15;
    const levy = etf
      ? notional * (0.00004 + 0.00002) * 2
      : notional * (0.0000341 + 0.00002 + 0.00001 + 0.00002) * 2 + notional * 0.0005;
    return { fees: side * 2, levy, feeCcy: currency };
  }
  return null;
}

const BASIS = {
  US: `livraison en ligne, barème des résidents américains du ${SCHEDULE_ON} relu le ${READ_ON}. Commission 0, plateforme 0 (promotion), SEC 0,00206 % de la vente (min 0,01 USD), TAF 0, CAT 0,000003 USD l'action à chaque sens. Vente identique.`,
  OTC: `livraison en ligne, barème des résidents américains du ${SCHEDULE_ON} relu le ${READ_ON} (« Stocks include individual stocks, OTC stocks »). Commission 0, plateforme 0 (promotion), SEC 0,00206 % de la vente (min 0,01 USD), TAF 0, CAT OTC 0,00000003 USD l'action à chaque sens. Vente identique.`,
  HK: `livraison en ligne, barème des résidents américains du ${SCHEDULE_ON} relu le ${READ_ON}. Commission 0,03 % (min 3 HKD), plateforme 15 HKD, règlement 0,0042 %, frais HKEX 0,00565 %, SFC 0,0027 %, FRC 0,00015 %, timbre 0,1 % arrondi au HKD supérieur hors ETF. Vente identique.`,
  CN: `livraison en ligne, barème des résidents américains du ${SCHEDULE_ON} relu le ${READ_ON}. Commission 0,03 % (min 3 CNH), plateforme 15 CNH, frais de Connect (0,00341 %, 0,002 %, 0,001 %, 0,002 %), timbre 0,05 % à la vente hors ETF. Vente identique.`,
};

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue moomoo US n'existe pas encore : lancer `node brokers/moomoous/moomoous_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue moomoo US` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez moomoo US`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "moomoous",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const market = marketOf(listing);
  const cash = listingCash(listing.currency);
  const held = depositHas("moomoous", null, cash) || cash === DEPOSIT;
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cash : DEPOSIT,
    url: SCHEDULE,
    basis: BASIS[market],
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!market) return { ...shared, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const bill = ticket({ market, type: listing.type, currency: listing.currency, notional, shares: n });
  const commissionUsd = bill ? dollars(Number(bill.fees.toPrecision(12)), bill.feeCcy) : null;
  const levyUsd = bill ? dollars(Number(bill.levy.toPrecision(12)), bill.feeCcy) : null;
  // An HKD or CNH line is bought with dollars converted at a rate the
  // broker does not print: unknown.
  const fxUsd = held ? 0 : null;
  const brokerFees = plus(commissionUsd, fxUsd);

  let marketBp = bp ?? book.leaf?.bp ?? null;
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  if (market === "US" && bp == null && perShare == null) {
    const quoted = usBookPerShare({ broker: "moomoous", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: market === "US" && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levyUsd);
  const unknown = [
    !bill ? `pas de cours ${listing.currency}/HKD dans fx.mjs` : null,
    held ? null : `change forcé USD → ${listing.currency} et retour : moomoo US n'imprime pas d'écart de change (${FX_PAGE})`,
    bookUsd == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean);

  return {
    ...shared,
    ...(held ? {} : { basis: `${shared.basis} Change forcé USD → ${listing.currency} au « Moomoo US comprehensive rate », écart non publié.` }),
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: bill ? { buy: bill.fees / 2, sell: bill.fees / 2, currency: bill.feeCcy } : null,
    levy: bill ? { amount: bill.levy, currency: bill.feeCcy } : null,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      réglementaire: finite(levyUsd, 6),
    },
    confidence: [
      shared.basis,
      market === "US" || market === "OTC" ? "plateforme 0 tant que dure la promotion (préavis de 30 jours)" : null,
      market === "OTC" ? "OTC : pas de 605 ni de 606, carnet OTC Markets ; frais de garde d'ADR possibles, non chiffrés" : null,
      market === "US" ? "carnet 605 × Q du rapport 606 de Moomoo Financial / Futu Clearing une fois l'alias posé, sinon NBBO coté" : null,
    ]
      .filter(Boolean)
      .join(" ; "),
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [symbol, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({
    etf: symbol,
    place,
    currency,
    shares: Number(arg("shares", "10")),
    price: Number(arg("price", "0")),
  }), null, 2));
}

printCli();
