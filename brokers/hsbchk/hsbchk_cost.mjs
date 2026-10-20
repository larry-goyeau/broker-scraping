// What one round trip costs at HSBC Hong Kong stock trading: buy n shares,
// sell them back, in dollars. Online order (HSBC Online Banking, HSBC HK
// Mobile Banking or the Easy Invest app) on the standard tariff, which
// every customer has unless they opt into a programme. HSBC Trade25 (ages
// 18 to 25), the volume tiers of HSBC Top Trader Club past HKD 10 million
// a month, phone and branch orders, margin and IPOs stay out. The first
// Top Trader Club tier is the standard rate and minimum.
//
// https://www.hsbc.com.hk/investments/products/stocks/
// Read on 2026-10-18, with the product fact sheet of each market:
//   Hong Kong   https://www.hsbc.com.hk/content/dam/hsbc/hk/docs/investments/stocks/top-trader-club/local-securities-product-fact-sheet.pdf (POR-LSS(E)/DEC26)
//   US          https://www.hsbc.com.hk/content/dam/hsbc/hk/docs/investments/stocks/top-trader-club/us-stocks-product-fact-sheet.pdf (POR-USTS(E)/MAR26)
//   China A     https://www.hsbc.com.hk/content/dam/hsbc/hk/docs/investments/stocks/china-a-shares/product-fact-sheet.pdf (PF-CNA(EN)/DEC25)
//
//   Hong Kong stocks and ETFs, each side
//                                        brokerage 0.25 %, minimum 100 HKD (100 RMB on
//                                        an RMB counter)
//                                        stamp 0.1 %, rounded up to the next dollar
//                                        SFC levy 0.0027 %
//                                        AFRC levy 0.00015 %
//                                        HKEX trading fee 0.00565 %
//                                        deposit transaction charge on the purchase only,
//                                        5 HKD a board lot, minimum 30, maximum 200 HKD
//   The board lot is the `lot` of the catalogue row, stamped by the
//   scraper from HKEX's List of Securities ("Board Lot" column, read on
//   2026-10-18):
//     https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//   so the deposit transaction charge is 5 × ceil(shares / lot), between 30
//   and 200, exactly; a row with no lot keeps it unknown and the line's
//   `usd` and `brokerFees` are N/A. It is waived when the same stock is
//   sold on T or T+1; this round trip holds longer.
//   Odd lots: "We cannot process an order consisting of both board lot and
//   odd lot portions [...] two separate orders [...] Fees and charges apply
//   to each separate transaction" (fact sheet, Odd Lot Order Handling). A
//   quantity that is not a whole number of lots is so priced as two buys
//   and two sales, each with its own brokerage minimum, deposit charge
//   minimum (the odd-lot buy: 30) and stamp rounding. The odd-lot book
//   ("may be less favorable than the normal market prices") is not priced. The 0.0042 % settlement fee is printed in the Trade25 block
//   only and is not charged here. An ETF pays no stamp (Stamp Duty
//   Ordinance waiver). Regulatory fees on an RMB or USD counter are
//   collected in HKD equivalent; they are priced in HKD and brought back.
//   The sheet's minimum is printed in HKD and RMB only, so a USD counter
//   takes 100 HKD at the fx table.
//   United States stocks and ETFs, each side
//                                        brokerage 18 USD for the first 1,000 shares,
//                                        plus 0.015 USD a share beyond
//                                        SEC 0.00206 % on the sale
//   French, Italian and Spanish financial transaction tax on an ADR
//   purchase: the rate comes from the tax map, not again from here; a
//   GB/IE/FR/IT/ES share with no tax-map line is N/A (taxGap). The
//   TAF line is printed in the Trade25 block only. HSBC names no US
//   broker-dealer: a foreign order goes to "affiliated HSBC entities and
//   third party brokers" (stocks page). By user decision a US line takes
//   the 606 Q of HSBC Securities (USA) Inc. (CRD 19585), ../../spreads/rule606.mjs.
//   China A-shares and ETFs (Northbound Stock Connect), each side
//                                        brokerage 0.25 %, minimum 100 RMB
//                                        handling fee 0.00341 %, ETF 0.004 %
//                                        securities management fee 0.002 %, ETF 0
//                                        transfer fee (ChinaClear) 0.001 %, ETF 0
//                                        transfer fee (HKSCC) 0.002 %
//                                        stamp 0.05 % on the sale, ETF 0
//                                        deposit transaction charge on the purchase only,
//                                        5 RMB a board lot of 100 shares, minimum 30,
//                                        maximum 200 RMB: the lot is known, so it is
//                                        5 × ceil(shares / 100), exactly
//
// The integrated account settles HKD, USD and RMB trades from its own
// savings currencies, so no listing here is converted. A customer whose
// cash is HKD buys the USD or RMB on HSBC's own board first: half its TT
// buying/selling spread is the remark on a USD or RMB line, not the ticket.
//   https://www.hsbc.com.hk/investments/products/foreign-exchange/currency-rate/
//   (feed: https://rbwm-api.hsbc.com.hk/digital-pws-tools-investments-eapi-prod-proxy/v1/investments/exchange-rate?locale=en_HK)
// Custody (25 HKD a month for Hong Kong; 5 USD and 25 RMB a month, both
// waived until 31 December 2026), dividend collection and scrip delivery
// are not per trade and stay out.
//
//   node brokers/hsbchk/hsbchk_cost.mjs 00005 HKEX HKD --shares=400 --price=100
//   node brokers/hsbchk/hsbchk_cost.mjs 02800 HKEX HKD --shares=500 --price=24.58
//   node brokers/hsbchk/hsbchk_cost.mjs AAPL NASDAQ USD --shares=10 --price=343.46
//   node brokers/hsbchk/hsbchk_cost.mjs 510050 SSE CNY --shares=1000 --price=3
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("hsbchk-parsed.json", import.meta.url);
const PAGE = "https://www.hsbc.com.hk/investments/products/stocks/";
const PAGES = {
  HK: "https://www.hsbc.com.hk/content/dam/hsbc/hk/docs/investments/stocks/top-trader-club/local-securities-product-fact-sheet.pdf",
  US: "https://www.hsbc.com.hk/content/dam/hsbc/hk/docs/investments/stocks/top-trader-club/us-stocks-product-fact-sheet.pdf",
  CN: "https://www.hsbc.com.hk/content/dam/hsbc/hk/docs/investments/stocks/china-a-shares/product-fact-sheet.pdf",
};
const READ_ON = "2026-10-18";
const CASH = ["HKD", "USD", "CNH"];
// 1 currency = HKD. TT buying, then TT selling. HSBC HK Foreign Exchange
// Rates, last updated 17 Oct 2026 04:55 (USD) and 04:57 (RMB) HKT, read
// 2026-10-18. RMB is the CNY row, which the account settles as CNH.
const FX_BOARD = {
  USD: [7.8136, 7.8823],
  CNH: [1.1642, 1.1833],
};

function fxHalf(currency) {
  const pair = FX_BOARD[cashOf(currency)];
  if (!pair) return fxRemark("", currency);
  const [bid, offer] = pair;
  const half = ((offer - bid) / (offer + bid)) * 100;
  return fxRemark(half.toFixed(3), currency);
}

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const REMARK = {
  HK: "Custody is 25 HKD a month.",
  US: "Custody is 5 USD a month, waived until 31 December 2026.",
  CN: "Custody is 25 RMB a month, waived until 31 December 2026.",
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
const cashOf = (currency) => (code(currency) === "CNY" ? "CNH" : code(currency));

function convert(amount, from, to) {
  if (cashOf(from) === cashOf(to)) return amount;
  const a = usdPer(from);
  const b = usdPer(to);
  return a == null || b == null ? null : (amount * a) / b;
}

function ceilDollar(amount) {
  return Math.ceil(amount - 1e-6);
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
    .filter((m) => !wantCurrency || cashOf(m.row.currency) === cashOf(wantCurrency));
  return { named, matches };
}

function marketOf(listing) {
  if (listing.mic === "XHKG") return "HK";
  if (US_MICS.has(listing.mic)) return "US";
  if (listing.mic === "XSHG" || listing.mic === "XSHE") return "CN";
  return "";
}

// The orders a quantity takes: the whole board lots, then the odd lot,
// each its own transaction. No lot: one order.
function hkOrders(shares, lot) {
  if (!(lot > 0)) return [shares];
  const odd = shares % lot;
  return [shares - odd, odd].filter((part) => part > 0);
}

// Hong Kong, the round trip, in the listing currency. Each order (buy and
// sale) pays its own brokerage minimum and stamp rounding; each buy its own
// deposit charge.
function hkTrip(shares, price, currency, etf, lot) {
  const rmb = cashOf(currency) === "CNH";
  // Brokerage and the deposit charge: RMB on an RMB counter, HKD otherwise.
  const feeCcy = rmb ? "CNH" : "HKD";
  let brokerageSide = 0;
  let levySide = 0;
  let deposit = 0;
  const orders = hkOrders(shares, lot);
  for (const part of orders) {
    const notional = part * price;
    const notionalFee = convert(notional, currency, feeCcy);
    const notionalHkd = convert(notional, currency, "HKD");
    if (notionalFee == null || notionalHkd == null) return null;
    brokerageSide += Math.max(100, notionalFee * 0.0025);
    levySide +=
      (etf ? 0 : ceilDollar(notionalHkd * 0.001)) +
      notionalHkd * 0.000027 +
      notionalHkd * 0.0000015 +
      notionalHkd * 0.0000565;
    // 5 a board lot, minimum 30, maximum 200; unknown without the lot.
    deposit = lot > 0 && deposit != null ? deposit + Math.min(200, Math.max(30, 5 * Math.ceil(part / lot - 1e-9))) : null;
  }
  const brokerage = convert(brokerageSide * 2, feeCcy, currency);
  const depositLocal = deposit == null ? null : convert(deposit, feeCcy, currency);
  const levy = convert(levySide * 2, "HKD", currency);
  if (brokerage == null || levy == null || (deposit != null && depositLocal == null)) return null;
  return { broker: plus(brokerage, depositLocal), levy, deposit: depositLocal, orders };
}

function usTrip(shares, notional) {
  const side = 18 + Math.max(0, shares - 1000) * 0.015;
  return { broker: side * 2, levy: notional * 0.0000206 };
}

function cnTrip(shares, notional, etf) {
  const brokerageSide = Math.max(100, notional * 0.0025);
  const deposit = Math.min(200, Math.max(30, Math.ceil(shares / 100 - 1e-9) * 5));
  const levySide = etf
    ? notional * (0.00004 + 0.00002)
    : notional * (0.0000341 + 0.00002 + 0.00001 + 0.00002);
  const stamp = etf ? 0 : notional * 0.0005;
  return { broker: brokerageSide * 2 + deposit, levy: levySide * 2 + stamp };
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
    return { ...answer, why: "le catalogue hsbchk n'existe pas encore : lancer `node brokers/hsbchk/hsbchk_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue hsbchk` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez HSBC HK`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "hsbchk",
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
  };
  const market = marketOf(listing);
  const cash = cashOf(listing.currency);
  const shared = {
    ...answer,
    listing,
    cashCurrency: CASH.includes(cash) ? cash : "",
    url: PAGES[market] || PAGE,
    remark: CASH.includes(cash) && cash !== "HKD" ? [REMARK[market], fxHalf(listing.currency)].filter(Boolean).join("\n") : REMARK[market] || "",
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (!market) return { ...shared, why: `${listing.brokerExchange} n'a pas de ligne dans le barème HSBC HK` };
  if (!CASH.includes(cash)) {
    return { ...shared, why: `la ligne est en ${listing.currency}, que le compte ne règle pas` };
  }

  const etfLike = listing.type === "ETF";
  const basis = {
    HK: `ordre en ligne, tarif standard, barème relu le ${READ_ON}. Courtage 0,25 %, plancher 100 HKD (100 RMB sur une ligne en RMB). Frais de dépôt à l'achat 5 par lot de bourse (lot de la liste HKEX), entre 30 et 200. Un rompu est un ordre à part, avec ses propres minima. Timbre 0,1 % arrondi au dollar supérieur (0 sur un ETF), SFC, AFRC et frais de bourse HKEX. Vente identique.`,
    US: `ordre en ligne, tarif standard, barème relu le ${READ_ON}. Courtage 18 USD jusqu'à 1 000 actions, puis 0,015 USD par action. SEC 0,00206 % à la vente. Vente identique.`,
    CN: `ordre en ligne, tarif standard, barème relu le ${READ_ON}. Courtage 0,25 %, plancher 100 RMB. Frais de dépôt à l'achat 5 RMB par lot de 100, entre 30 et 200 RMB. Frais de traitement, gestion, transfert ChinaClear et HKSCC, timbre 0,05 % à la vente (ETF : traitement et HKSCC seulement). Vente identique.`,
  }[market];

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, basis, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, basis, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const lot = market === "HK" && Number.isInteger(m.row.lot) && m.row.lot > 0 ? m.row.lot : null;
  const trip =
    market === "HK" ? hkTrip(n, p, listing.currency, etfLike, lot) : market === "US" ? usTrip(n, notional) : cnTrip(n, notional, etfLike);
  if (!trip) return { ...shared, basis, why: `pas de cours de change pour ${listing.currency}` };

  // A financial transaction tax on a US-listed ADR is the instrument's,
  // read from the tax map.
  const tax = market === "US" ? taxesOf(listing.isin) : null;
  const taxRate = tax ? Object.values(taxRates(tax)).reduce((s, r) => s + r, 0) : 0;
  const gap = market === "US" ? taxGap(listing.isin, listing.type, listing.mic) : null;
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxRate;

  const brokerLocal = finite(trip.broker, 12);
  const levyLocal = Number(trip.levy.toPrecision(12));
  const brokerFees = brokerLocal == null ? null : dollars(brokerLocal, listing.currency);
  const levyUsd = dollars(levyLocal, listing.currency);
  const marketBp = bp ?? book.leaf?.bp ?? null;
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  if (market === "US") {
    const quoted = usBookPerShare({ broker: "hsbchk", ticker: listing.ticker, fallback: marketPerShare });
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
  const usd = plus(bookUsd, brokerFees, levyUsd, taxUsd);
  const unknown = [
    bookUsd == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    market === "HK" && !lot ? `frais de dépôt à l'achat : 5 par lot, mais ${listing.ticker} n'a pas de lot dans la liste HKEX` : null,
    gap,
  ].filter(Boolean);

  const oddLot = market === "HK" && lot && n % lot ? n % lot : 0;
  // Both orders' fees are in the trip; only the odd-lot book's worse price is not.
  const remark = oddLot
    ? [shared.remark, `Odd lot of ${oddLot} (board lot ${lot}): traded on the odd-lot book at a worse price, not counted.`].filter(Boolean).join("\n")
    : shared.remark;

  return {
    ...shared,
    remark,
    basis,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(tax ? { tax } : {}),
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { trip: brokerLocal, currency: listing.currency },
    ...(market === "HK" ? { lot, deposit: { amount: trip.deposit == null ? null : finite(trip.deposit, 12), currency: listing.currency, orders: trip.orders } } : {}),
    levy: { amount: levyLocal, currency: listing.currency },
    ...(taxRate ? { taxes: finite(taxUsd, 6) } : {}),
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
