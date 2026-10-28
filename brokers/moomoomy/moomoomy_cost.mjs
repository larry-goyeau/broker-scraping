// What one round trip costs at moomoo MY (Moomoo Securities Malaysia Sdn.
// Bhd.): buy n shares, sell them back, in dollars. Online cash order.
// Warrants, options, futures, fractional orders under one share, margin
// and IPOs stay out.
//
// https://www.moomoo.com/my/pricing
// https://www.moomoo.com/my/support/topic9_137   Malaysia
// https://www.moomoo.com/my/support/topic9_136   United States
// https://www.moomoo.com/my/support/topic9_291   Hong Kong
// https://www.moomoo.com/my/support/topic9_243   Singapore
// https://www.moomoo.com/my/support/topic9_292   China Connect
// https://www.moomoo.com/my/support/topic9_138   other services, currency exchange
// Read on 2026-10-20.
//   Bursa stocks, ETFs and REITs, each side, MYR
//                       commission 0.03 %, rounded up to the sen, no minimum
//                       platform 3 MYR
//                       clearing 0.03 %, at most 1,000 MYR
//                       SST 8 % on commission, platform and clearing, on an
//                       ETF or a REIT only (the page's SST list)
//                       stamp 1 MYR per 1,000 MYR or part, at most 1,000 on a
//                       share and 200 on a REIT; a Bursa ETF is exempt to 2028
//   US stocks and ETFs, each side, USD
//                       commission 0.03 %, rounded up to the cent
//                       platform 0.99 USD
//                       settlement 0.003 USD a share, at most 1 % of the trade
//                       CAT 0.000003 USD a share; SEC 0.0000206 of the sale,
//                       minimum 0.01 USD; TAF 0 USD a share
//   Hong Kong, each side, HKD
//                       commission 0.03 %, minimum 3 HKD; platform 15 HKD
//                       settlement 0.0042 %, trading 0.00565 % (min 0.01),
//                       SFC 0.0027 % (min 0.01), FRC 0.00015 %
//                       stamp 0.1 %, rounded up to the next HKD, not on an ETF
//   Singapore, each side, in the line's currency
//                       commission 0.03 %, minimum 3 SGD (2 USD, 18 HKD)
//                       platform 0.05 %, minimum 5 SGD (4 USD, 30 HKD)
//                       trading 0.0075 %, clearing 0.0325 %
//                       No minimum is printed for a CNH, EUR or GBP line.
//   China Connect, each side, CNH
//                       commission 0.03 %, minimum 3 CNH; platform 15 CNH
//                       handling 0.00341 % (ETF 0.004 %), CSRC 0.002 % and
//                       CSDC 0.001 % (not on an ETF), HKSCC 0.002 %
//                       stamp 0.05 % on the sale, not on an ETF
//   Malaysian stamp on a US, Hong Kong, Singapore or China trade too:
//                       1 MYR per 1,000 MYR or part, at most 1,000 on a share
//                       and 200 on an ETF or a REIT
//   The 180-day new-user commission waiver is a promotion and is left out.
//
// Cash. A deposit is ringgit only (deposits.mjs), so any foreign line
// converts on the buy and back on the sale. The service-fee page prices
// the conversion at "Moomoo MY's comprehensive exchange rate quotations"
// and prints no spread, so the change leg is unknown and the total is N/A.
// Checked again on 2026-10-20: the currency-exchange help gives "Real-time
// exchange rates provided by the upstream bank" (bank not named) and the
// cross-currency help "The exchange rate is determined by a third party
// currency exchange channel. For details, please refer to your statement."
// Neither prints a rate, a spread or the bank, so there is no board to read.
// Stand-in for a USD line (owner, 2026-10-27): the group's moomoo AU
// Financial Services Guide (Futu Securities (Australia), April 2024, section
// 4.4) adds 55 pips on AUD/USD each way, 0.0055 USD an Australian dollar
// (about 0.85 %), on the buy and on the sale. Another foreign line has no
// group figure: N/A.
//   https://static.moomoo.com/upload/official-website/moo/au/moomoo-FUTU-AU_FSG0408-7c63a1a705cd5ff229d1171c1cc97c00.pdf
//   https://www.moomoo.com/my/support/topic9_33
//   https://www.moomoo.com/my/support/topic9_85
//
// US stocks are held at Futu Clearing Inc. (DTC 4272), named on
// https://www.moomoo.com/my/support/topic9_202. Until an alias names it,
// the US book is the quoted NBBO.
//
//   node brokers/moomoomy/moomoomy_cost.mjs 1155 "Bursa Malaysia" MYR --shares=100 --price=10
//   node brokers/moomoomy/moomoomy_cost.mjs 5227 "Bursa Malaysia" MYR --shares=1000 --price=1.5
//   node brokers/moomoomy/moomoomy_cost.mjs AAPL Nasdaq USD --shares=10 --price=230
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

const CATALOGUE = new URL("moomoomy-parsed.json", import.meta.url);
const PAGE = "https://www.moomoo.com/my/pricing";
const PAGES = {
  MY: "https://www.moomoo.com/my/support/topic9_137",
  US: "https://www.moomoo.com/my/support/topic9_136",
  HK: "https://www.moomoo.com/my/support/topic9_291",
  SG: "https://www.moomoo.com/my/support/topic9_243",
  CN: "https://www.moomoo.com/my/support/topic9_292",
};
const FX_PAGE = "https://www.moomoo.com/my/support/topic9_138";
// moomoo AU's added spread on AUD/USD, USD an Australian dollar (stand-in).
const AUD_USD_PIPS = 0.0055;
const READ_ON = "2026-10-20";
const SST = 0.08;
const SG_MIN = {
  SGD: { commission: 3, platform: 5 },
  USD: { commission: 2, platform: 4 },
  HKD: { commission: 18, platform: 30 },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const ceilCent = (amount) => Math.ceil(amount * 100 - 1e-6) / 100;
const ceilUnit = (amount) => Math.ceil(amount - 1e-6);
// A Bursa REIT is typed FUND in the catalogue.
const fundLike = (type) => type === "FUND" || type === "REIT";

function ringgit(amount, currency) {
  const usd = toUsd(amount, currency);
  const per = usdPer("MYR");
  return usd == null || !(per > 0) ? null : usd / per;
}

// RM1 for every RM1,000 or part of it, capped.
function stampRinggit(notionalMyr, cap) {
  if (!(cap > 0) || !(notionalMyr > 0)) return 0;
  return Math.min(cap, Math.ceil(notionalMyr / 1000 - 1e-9));
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
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function marketOf(listing) {
  const mic = listing.mic;
  const place = loose(listing.brokerExchange);
  if (mic === "XKLS" || place === "BURSAMALAYSIA") return "MY";
  if (mic === "XHKG" || place === "HONGKONG") return "HK";
  if (["XNAS", "XNYS", "ARCX", "XASE", "BATS"].includes(mic) || /NASDAQ|NEWYORK|NYSE|CBOE/.test(place)) return "US";
  if (mic === "XSES" || place.startsWith("SINGAPORE")) return "SG";
  if (mic === "XSHG" || mic === "XSHE" || place.startsWith("SHANGHAI") || place.startsWith("SHENZHEN")) return "CN";
  return "";
}

// Both sides of the ticket, in the fee currency, and the Malaysian stamp
// in ringgit. `null` when the page prints no rate for this line.
function ticket({ market, type, currency, notional, shares }) {
  const etf = type === "ETF";
  const fund = etf || fundLike(type);
  if (market === "MY") {
    const side = ceilCent(notional * 0.0003) + 3 + Math.min(1000, notional * 0.0003);
    const tax = fund ? SST : 0;
    const cap = etf ? 0 : fundLike(type) ? 200 : 1000;
    return { fees: side * (1 + tax) * 2, levy: 0, stampMyr: stampRinggit(notional, cap) * 2, feeCcy: "MYR" };
  }
  const myr = ringgit(notional, currency);
  if (myr == null) return null;
  const stampMyr = stampRinggit(myr, fund ? 200 : 1000) * 2;
  if (market === "US") {
    const side = ceilCent(notional * 0.0003) + 0.99;
    const levy =
      Math.min(shares * 0.003, notional * 0.01) * 2 + shares * 0.000003 * 2 + Math.max(0.01, notional * 0.0000206);
    return { fees: side * 2, levy, stampMyr, feeCcy: "USD" };
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
      (etf ? 0 : ceilUnit(hkd * 0.001));
    return { fees: side * 2, levy: levy * 2, stampMyr, feeCcy: "HKD" };
  }
  if (market === "SG") {
    const min = SG_MIN[currency];
    if (!min) return null;
    const side = Math.max(min.commission, notional * 0.0003) + Math.max(min.platform, notional * 0.0005);
    return { fees: side * 2, levy: notional * (0.000075 + 0.000325) * 2, stampMyr, feeCcy: currency };
  }
  if (market === "CN") {
    const side = Math.max(3, notional * 0.0003) + 15;
    const levy = etf
      ? notional * (0.00004 + 0.00002) * 2
      : notional * (0.0000341 + 0.00002 + 0.00001 + 0.00002) * 2 + notional * 0.0005;
    return { fees: side * 2, levy, stampMyr, feeCcy: currency };
  }
  return null;
}

const BASIS = {
  MY: `livraison en ligne, barème relu le ${READ_ON}. Commission 0,03 % arrondie au sen, plateforme 3 MYR, compensation 0,03 % (max 1 000 MYR), SST 8 % sur un ETF ou un REIT, timbre 1 MYR par 1 000 MYR (max 1 000, REIT 200, ETF exonéré). Vente identique.`,
  US: `livraison en ligne, barème relu le ${READ_ON}. Commission 0,03 % arrondie au cent, plateforme 0,99 USD, règlement 0,003 USD l'action (au plus 1 %), CAT 0,000003 USD l'action, SEC 0,00206 % de la vente, TAF 0, timbre malaisien. Vente identique.`,
  HK: `livraison en ligne, barème relu le ${READ_ON}. Commission 0,03 % (min 3 HKD), plateforme 15 HKD, frais HKEX, SFC, FRC, timbre HK hors ETF, timbre malaisien. Vente identique.`,
  SG: `livraison en ligne, barème relu le ${READ_ON}. Commission 0,03 % et plateforme 0,05 %, minimums selon la devise, négociation 0,0075 %, compensation 0,0325 %, timbre malaisien. Vente identique.`,
  CN: `livraison en ligne, barème relu le ${READ_ON}. Commission 0,03 % (min 3 CNH), plateforme 15 CNH, frais de Connect, timbre 0,05 % à la vente hors ETF, timbre malaisien. Vente identique.`,
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
    return { ...answer, why: "le catalogue moomoo MY n'existe pas encore : lancer `node brokers/moomoomy/moomoomy_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue moomoo MY` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez moomoo MY`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "moomoomy",
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
  const held = depositHas("moomoomy", null, cash);
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cash : "MYR",
    url: PAGES[market] || PAGE,
    remark: "",
    basis: BASIS[market],
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!market) return { ...shared, remark: "", why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const bill = ticket({ market, type: listing.type, currency: listing.currency, notional, shares: n });
  const commissionUsd = bill ? dollars(Number(bill.fees.toPrecision(12)), bill.feeCcy) : null;
  const levyUsd = bill ? plus(dollars(Number(bill.levy.toPrecision(12)), bill.feeCcy), dollars(bill.stampMyr, "MYR")) : null;
  // A USD line converts from ringgit at the group's 55-pip AUD/USD stand-in,
  // both ways; any other foreign line at a rate no one prints: unknown.
  const auFx = !held && listing.currency === "USD" && notionalUsd != null ? (2 * notionalUsd * AUD_USD_PIPS) / usdPer("AUD") : null;
  const fxUsd = held ? 0 : auFx;
  const brokerFees = plus(commissionUsd, fxUsd);

  let marketBp = bp ?? book.leaf?.bp ?? null;
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  if (market === "US" && bp == null && perShare == null) {
    const quoted = usBookPerShare({ broker: "moomoomy", ticker: listing.ticker, fallback: marketPerShare });
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
    !bill
      ? market === "SG"
        ? `le barème Singapour n'imprime pas de minimum en ${listing.currency}`
        : "pas de cours en ringgit pour le timbre malaisien"
      : null,
    held || auFx != null ? null : `change forcé MYR → ${listing.currency} et retour : moomoo MY n'imprime pas d'écart de change`,
    bookUsd == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean);

  return {
    ...shared,
    ...(held
      ? {}
      : auFx != null
        ? { basis: `${shared.basis} Change forcé MYR → USD et retour : écart non publié par moomoo MY (${FX_PAGE}), 55 pips AUD/USD du guide de moomoo AU (même groupe) pris à la place, ${finite(auFx, 4)} $.` }
        : { basis: `${shared.basis} Change forcé MYR → ${listing.currency} au cours maison, écart non publié (${FX_PAGE}).` }),
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: bill ? { buy: bill.fees / 2, sell: bill.fees / 2, currency: bill.feeCcy } : null,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(levyUsd, 6),
    },
    confidence: [
      shared.basis,
      market === "MY" && fundLike(listing.type) ? "SST 8 % : la page dit qu'elle s'applique une fois moomoo MY enregistré, sans date" : null,
      market === "US" ? "carnet 605 × Q de Futu Clearing une fois l'alias posé, sinon NBBO coté" : null,
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
