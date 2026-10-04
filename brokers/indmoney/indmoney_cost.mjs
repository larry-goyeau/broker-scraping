// What one round trip costs at INDmoney: buy, then sell, in dollars.
// Online delivery. Not intraday, not F&O, not a call-and-trade order.
//
// https://www.indmoney.com/pricing
// https://www.indmoney.com/pricing?type=us-stocks
// https://www.indmoney.com/us-stocks
// read on 2026-10-04.
//
//   Indian shares and ETFs, delivery. The number follows the delivery
//   column. The note under it prints a different NSE rate and splits BSE
//   by scrip group. The catalogue row has no group, so that note stays
//   out of the number.
//     Brokerage                  the lower of 0.1% and ₹20 per executed
//                                order, and at least ₹2.
//     STT                        0.1% on the buy and on the sell.
//     Stamp                      0.015% on the buy.
//     Exchange                   NSE 0.00307%, BSE 0.00375%, each side.
//     SEBI                       0.0001% of turnover, each side.
//     IPFT                       0.0000001% of turnover, each side.
//     DP on a delivery sell      ₹18.5 per ISIN, plus GST. The male and
//                                female splits both add to ₹18.5.
//     GST                        18% on brokerage, SEBI and the DP debit.
//                                The page does not put the exchange line
//                                or IPFT in that list.
//   United States shares and ETFs. The public stocks page prints 0.25%
//   a trade, which is the Global Access card. Direct Access (NSEIX) is
//   the other card: `--plan=direct`.
//     Global Access, each side   0.25%, maximum $25 before GST,
//                                then GST 18%. The US card names GST
//                                and does not print the percent. The
//                                rate is heading 9971 of Notification
//                                11/2017-Central Tax (Rate): central
//                                tax 9%, and the same 18% is printed
//                                on INDmoney's Indian brokerage line.
//     SEC, sell only             $0.0000206 of the order, minimum $0.01.
//     TAF, sell only             $0.000195 a share, minimum $0.01,
//                                maximum $9.79.
//     IFSCA                      0.005% of the order, minimum $0.01,
//                                GST already inside, each side.
//     DriveWealth, price under $1, is 0.38% before GST. The card does
//                                not say every order takes that path.
//     Direct Access              brokerage $0, so brokerFees is 0.
//                                Exchange transaction $0. IFSCA 0.0001%
//                                of the order, each side, then GST 18%.
//     The bank's conversion is 0.5% to 1.2%. That range is the remark,
//     not a single rate. US orders are named at DriveWealth and at
//     Alpaca. The book uses whichever of those two Rule 606 Qs is
//     higher. DriveWealth's 2026-Q2 file has no market-order mix, so
//     the book is Alpaca's Q.
//
//   node brokers/indmoney/indmoney_cost.mjs INE144J01027 NSE INR --shares=10 --price=1400
//   node brokers/indmoney/indmoney_cost.mjs AAPL NASDAQ USD --shares=10 --price=200
//   node brokers/indmoney/indmoney_cost.mjs AAPL NASDAQ USD --shares=10 --price=200 --plan=direct
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, pct, sebiRate } from "../../indianDelivery.mjs";
import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("indmoney-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);
const PAGE = "https://www.indmoney.com/pricing";
const US_PAGE = "https://www.indmoney.com/pricing?type=us-stocks";
const READ_ON = "2026-10-04";
const GLOBAL_RATE = 0.0025;
const GLOBAL_CAP = 25;
const SEC = 0.0000206;
const SEC_MIN = 0.01;
const TAF = 0.000195;
const TAF_MIN = 0.01;
const TAF_MAX = 9.79;
const IFSCA = 0.00005;
const IFSCA_MIN = 0.01;
const DIRECT_IFSCA = 0.000001;
const GST = 0.18;
const US_DEALERS = ["alpaca", "drivewealth"];
const FX_REMARK = "FX 0.5% to 1.2% when cash ≠ USD.";
const TCS_REMARK =
  "When more than ₹10 lakh is sent to the US wallet in a year, the bank collects 20% TCS. The tax can be claimed back when filing.";
const GLOBAL_REMARK = [FX_REMARK, TCS_REMARK].join(" ");
const DIRECT_REMARK = [
  FX_REMARK,
  "GST 18% on the IFSCA line.",
  TCS_REMARK,
].join(" ");

const SCHEDULE = {
  broker: "INDmoney",
  folder: "indmoney",
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  brokerageEach: (notional) => Math.min(20, Math.max(2, notional * pct("0.1"))),
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00307") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnTxn: false,
  gstOnDp: true,
  ipftRate: pct("0.0000001"),
  dpInr: 18.5,
  basis:
    "Courtage livraison : le plus bas de 0,1 % et 20 ₹, et au moins 2 ₹. DP 18,5 ₹ + GST à la vente.",
  remark: "Intraday is the lower of ₹20 and 0.1%, minimum ₹2.",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function planOf(value) {
  const key = String(value || "global").trim().toLowerCase();
  if (["direct", "nseix", "gift"].includes(key)) return "direct";
  return "global";
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(
    rows,
    asked,
    (r) =>
      loose(r.isin) === asked ||
      loose(r.ticker) === asked ||
      loose(r.query) === asked ||
      (Array.isArray(r.matches) && r.matches.some((item) => loose(item) === asked))
  );
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

function atLeast(amount, floor) {
  return amount < floor ? floor : amount;
}

// The page names both US broker-dealers and does not assign an order to
// one of them. The wider Rule 606 Q is the book. A dealer with no
// market-order mix has no Q and drops out.
function widerUsBook(ticker) {
  let dealer = null;
  let q = null;
  for (const name of US_DEALERS) {
    const next = qOf(name);
    if (next == null || (q != null && next <= q)) continue;
    dealer = name;
    q = next;
  }
  if (!dealer) return { dealer: null, q: null, perShare: null };
  return { dealer, q, perShare: usBookPerShare({ broker: dealer, ticker }) };
}

function usRoundTrip(query, plan) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const direct = plan === "direct";
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "USD",
    url: US_PAGE,
    plan: direct ? "direct" : "global",
    remark: direct ? DIRECT_REMARK : GLOBAL_REMARK,
  };
  if (!rows.length) {
    return { ...answer, why: "le catalogue INDmoney n'existe pas encore : lancer `node brokers/indmoney/indmoney_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue INDmoney` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez INDmoney`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }
  const m = matches[0];
  const leafBook = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "indmoney",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: leafBook.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const shared = {
    ...answer,
    listing,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    basis: direct
      ? `Direct Access (NSEIX), page relue le ${READ_ON}. Courtage 0 $. Transaction de place 0 $. IFSCA 0,0001 % par ordre, puis GST 18 %.`
      : `Global Access, page relue le ${READ_ON}. Courtage 0,25 % par ordre, plafond 25 $ avant GST, puis GST 18 %. IFSCA 0,005 %, minimum 0,01 $, GST comprise.`,
  };
  if (listing.currency !== "USD" || ["NSE", "BSE"].includes(code(listing.brokerExchange))) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'est pas au barème US` };
  }
  if (listing.type !== "STOCK" && listing.type !== "ETF") {
    return { ...shared, why: `${listing.ticker || listing.isin} n'est pas au barème action et ETF` };
  }
  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, "USD");
  const commissionEach = direct ? 0 : Math.min(GLOBAL_CAP, notional * GLOBAL_RATE);
  const ifscaEach = direct ? notional * DIRECT_IFSCA : atLeast(notional * IFSCA, IFSCA_MIN);
  const sec = atLeast(notional * SEC, SEC_MIN);
  const taf = Math.min(TAF_MAX, atLeast(n * TAF, TAF_MIN));
  // Global Access brokerage is before GST. Direct Access prints $0, and
  // GST on the IFSCA line sits with that levy, not in the broker's bill.
  const brokerFees = direct ? 0 : commissionEach * 2 * (1 + GST);
  const ifscaCharged = ifscaEach * (direct ? 1 + GST : 1);
  const levy = (direct ? 0 : sec) + (direct ? 0 : taf) + ifscaCharged * 2;
  const routed = widerUsBook(listing.ticker);
  const marketBp = bp ?? (routed.perShare != null ? null : leafBook.leaf?.bp ?? null);
  const marketPerShare = perShare ?? routed.perShare ?? leafBook.leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: routed.perShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, "USD"),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levy);

  const who = routed.dealer === "alpaca" ? "Alpaca" : routed.dealer === "drivewealth" ? "DriveWealth" : "";
  return {
    ...shared,
    ...(who ? { basis: `${shared.basis} Carnet 605 × Q ${who} ${Number(routed.q.toFixed(3))}.` } : {}),
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: "USD" },
    commission: {
      each: commissionEach,
      ifsca: ifscaCharged,
      sec: direct ? null : sec,
      taf: direct ? null : taf,
      currency: "USD",
    },
  };
}

export function roundTrip(query) {
  const plan = planOf(query.plan);
  const place = code(query.place);
  if (place === "NSE" || place === "BSE" || code(query.currency) === "INR") return indiaRoundTrip(SCHEDULE, query);
  return usRoundTrip(query, plan);
}

function printOwnCli() {
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
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(
    JSON.stringify(
      roundTrip({
        etf,
        place,
        currency,
        shares: Number(arg("shares", "10")),
        price: Number(arg("price", "0")),
        plan: arg("plan", "global"),
      }),
      null,
      2
    )
  );
}

printOwnCli();
