// What one round trip costs at Futu Securities (Hong Kong): buy n shares,
// sell them back, in dollars. Online cash order. The account opens on
// the fixed plan, so that is the line priced here. The tiered plan,
// margin, options, futures, warrants and odd lots stay out.
//
// https://www.futuhk.com/en/commissionnew
// Read on 2026-10-13.
//   Hong Kong stocks, ETFs and REITs, each side
//                                        commission 0.03 %, minimum 3 HKD
//                                        platform 15 HKD
//                                        https://www.futuhk.com/en/support/topic2_335
//   The same page prints commission at 0 during the commission-free
//   period. That is the remark. Stamp is 0.1 %, rounded up to the next
//   Hong Kong dollar, on a stock or a REIT, and 0 on an ETF.
//   United States stocks, ETFs and REITs, fixed plan, each side
//                                        commission 0.0049 USD a share, minimum 0.99 USD
//                                        platform 0.005 USD a share, minimum 1 USD
//                                        commission and platform together are at most
//                                        0.5 % of the order; below that cap the
//                                        order is 0.99 USD
//                                        https://www.futuhk.com/en/support/topic2_283
//   A US stock is held and routed at Futu Clearing Inc. The book is
//   that firm's Rule 606.
//   https://www.futuhk.com/support/topic2_277
//   The page prints the FINRA trading-activity fee as 0.00 USD a share.
//   China Connect stocks and ETFs, each side
//                                        commission 0.03 %, minimum 3 CNH
//                                        platform 15 CNH
//                                        https://www.futuhk.com/en/support/topic2_334
//   An ETF pays the 0.004 % handling fee and no CSRC fee, no CSDC
//   transfer fee and no stamp. A stock pays 0.00341 % handling, 0.002 %
//   CSRC, 0.001 % CSDC, 0.002 % HKSCC, and 0.05 % stamp on the sale.
//   The portfolio fee is 0.008 % a year and stays in the remark.
//   Japan stocks and ETFs, each side      commission 0.08 %, minimum 80 JPY
//                                        platform 180 JPY
//                                        settlement 40 JPY, not Futu's fee
//                                        https://www.futuhk.com/en/support/topic2_1524
//   The Japan page does not print a REIT line, so a REIT stays out of
//   the number.
//   Singapore stocks, ETFs and REITs, each side
//                                        commission 0.08 %, rounded up to the next cent
//                                        platform 2.50 SGD, 2 USD or 15 HKD
//                                        https://www.futuhk.com/en/support/topic2_1781
//   The page prints no platform fee for another Singapore currency.
//
//   node brokers/futuhk/futuhk_cost.mjs 00700 "Hong Kong" HKD --shares=10 --price=400
//   node brokers/futuhk/futuhk_cost.mjs AAPL Nasdaq USD --shares=10 --price=230
//   node brokers/futuhk/futuhk_cost.mjs 601398 "Shanghai Stock Exchange" CNH --shares=100 --price=7
//   node brokers/futuhk/futuhk_cost.mjs 7203 Tokyo JPY --shares=10 --price=3000
//   node brokers/futuhk/futuhk_cost.mjs D05 "Singapore Exchange" SGD --shares=10 --price=40
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("futuhk-parsed.json", import.meta.url);
const PAGE = "https://www.futuhk.com/en/commissionnew";
const PAGES = {
  HK: "https://www.futuhk.com/en/support/topic2_335",
  US: "https://www.futuhk.com/en/support/topic2_283",
  CN: "https://www.futuhk.com/en/support/topic2_334",
  JP: "https://www.futuhk.com/en/support/topic2_1524",
  SG: "https://www.futuhk.com/en/support/topic2_1781",
};
const READ_ON = "2026-10-13";
const HK_FREE = "Commission is 0 during the commission-free period.";
const CN_HOLDING = "Portfolio fee is 0.008% a year.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function ceilDollar(amount) {
  return Math.ceil(amount - 1e-6);
}

function ceilCent(amount) {
  return Math.ceil(amount * 100 - 1e-6) / 100;
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
  if (mic === "XHKG" || place === "HONGKONG") return "HK";
  if (["XNAS", "XNYS", "ARCX", "XASE"].includes(mic) || /NASDAQ|NEWYORK|NYSE/.test(place)) return "US";
  if (mic === "XSHG" || mic === "XSHE" || place.startsWith("SHANGHAI") || place.startsWith("SHENZHEN")) return "CN";
  if (mic === "XTKS" || place === "TOKYO") return "JP";
  if (mic === "XSES" || place.startsWith("SINGAPORE")) return "SG";
  return "";
}

function hkSide(notional, etf) {
  const broker = Math.max(3, notional * 0.0003) + 15;
  const levy =
    notional * 0.000042 +
    Math.max(0.01, notional * 0.0000565) +
    Math.max(0.01, notional * 0.000027) +
    notional * 0.0000015 +
    (etf ? 0 : ceilDollar(notional * 0.001));
  return { broker, levy };
}

function usBrokerSide(shares, notional) {
  const raw = Math.max(0.99, shares * 0.0049) + Math.max(1, shares * 0.005);
  const cap = notional * 0.005;
  if (raw <= cap) return raw;
  return cap < 0.99 ? 0.99 : cap;
}

function cnLevySide(notional, etf) {
  if (etf) return notional * (0.00004 + 0.00002);
  return notional * (0.0000341 + 0.00002 + 0.00001 + 0.00002);
}

function sgPlatform(currency) {
  if (currency === "SGD") return 2.5;
  if (currency === "USD") return 2;
  if (currency === "HKD") return 15;
  return null;
}

function quote(listing, row, market) {
  const lines = [];
  if (row.remark) lines.push(row.remark);
  if (market === "HK") lines.push(HK_FREE);
  if (market === "CN") lines.push(CN_HOLDING);
  return lines.join(" ");
}

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
    return { ...answer, why: "le catalogue futu n'existe pas encore : lancer `node brokers/futuhk/futuhk_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue futu` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez futu`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "futuhk",
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
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    url: PAGES[market] || PAGE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!market) return { ...shared, why: `${listing.brokerExchange} n'a pas de ligne dans le barème` };
  if (market === "JP" && listing.type === "REIT") {
    return { ...shared, why: "le barème Japon imprime la commission des actions et des ETF, pas celle des REIT" };
  }
  if (market === "SG" && sgPlatform(listing.currency) == null) {
    return { ...shared, why: `le barème Singapour n'imprime pas de frais de plateforme en ${listing.currency}` };
  }

  const etfLike = listing.type === "ETF";
  const basis = {
    HK: `livraison en ligne, forfait fixe, barème relu le ${READ_ON}. Commission 0,03 %, plancher 3 HKD. Plateforme 15 HKD. Vente identique.`,
    US: `livraison en ligne, forfait fixe, barème relu le ${READ_ON}. Commission 0,0049 USD par action, plancher 0,99 USD. Plateforme 0,005 USD par action, plancher 1 USD. Les deux ensemble plafonnent à 0,5 % de l'ordre, et l'ordre est 0,99 USD sous ce plancher. Vente identique.`,
    CN: `livraison en ligne, barème relu le ${READ_ON}. Commission 0,03 %, plancher 3 CNH. Plateforme 15 CNH. Vente identique.`,
    JP: `livraison en ligne, barème relu le ${READ_ON}. Commission 0,08 %, plancher 80 JPY. Plateforme 180 JPY. Vente identique.`,
    SG: `livraison en ligne, barème relu le ${READ_ON}. Commission 0,08 %, arrondie au centime supérieur. Plateforme selon la devise de la ligne. Vente identique.`,
  }[market];

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, basis, remark: quote(listing, m.row, market), why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, basis, remark: quote(listing, m.row, market), why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  let brokerLocal = null;
  let levyLocal = null;
  if (market === "HK") {
    const side = hkSide(notional, etfLike);
    brokerLocal = side.broker * 2;
    levyLocal = side.levy * 2;
  } else if (market === "US") {
    brokerLocal = usBrokerSide(n, notional) * 2;
    const sec = Math.max(0.01, notional * 0.0000206);
    levyLocal = n * 0.003 * 2 + n * 0.000003 * 2 + sec;
  } else if (market === "CN") {
    brokerLocal = (Math.max(3, notional * 0.0003) + 15) * 2;
    levyLocal = cnLevySide(notional, etfLike) * 2 + (etfLike ? 0 : notional * 0.0005);
  } else if (market === "JP") {
    brokerLocal = (Math.max(80, notional * 0.0008) + 180) * 2;
    levyLocal = 40 * 2;
  } else {
    const money = /money market/i.test(listing.name || "");
    const rate = money ? 0.000001 + 0.000001 : 0.000075 + 0.000325;
    brokerLocal = (ceilCent(notional * 0.0008) + sgPlatform(listing.currency)) * 2;
    levyLocal = notional * rate * 2;
  }

  brokerLocal = Number(brokerLocal.toPrecision(12));
  levyLocal = Number(levyLocal.toPrecision(12));
  const brokerFees = dollars(brokerLocal, listing.currency);
  const levyUsd = dollars(levyLocal, listing.currency);
  let marketBp = bp ?? book.leaf?.bp ?? null;
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  if (market === "US") {
    const quoted = usBookPerShare({ broker: "futuhk", ticker: listing.ticker, fallback: marketPerShare });
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

  return {
    ...shared,
    basis,
    remark: quote(listing, m.row, market),
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: brokerLocal / 2, sell: brokerLocal / 2, currency: listing.currency },
    levy: { amount: levyLocal, currency: listing.currency },
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
