// What one round trip costs at Upstox: buy n shares, sell them back, in
// dollars. Online delivery. Not intraday, not F&O, not call-and-trade.
//
// India, https://upstox.com/brokerage-charges/ read on 2026-10-18.
//   Delivery brokerage          ₹20 per executed order
//   STT                         0.1% on the buy and on the sell
//   Transaction (from 1 March 2026)
//                               NSE 0.00307% on the buy and on the sell.
//                               BSE "varies as per the scrip group", which
//                               Upstox passes through. The rates are BSE's
//                               own table (bseindia.com/static/members/
//                               TFEquity.aspx, notice 20221109-7, read
//                               2026-10-18), per crore of gross turnover:
//                                 A, B                        ₹375
//                                 E F FC G GC I W             ₹375, or ₹275
//                                   if the scrip is BSE-exclusive (here:
//                                   no NSE line in the catalogue)
//                                 M, MT, TS, MS, IF, IT, R    ₹275
//                                 X, XT, Z (XC, XD merged)    ₹10,000
//                                 P, ZP, odd lot              ₹1,00,000
//                               SS and ST are ₹1,00,000 on Upstox's page.
//                               Upstox's page still puts ZP at ₹10,000
//                               (a 2016 notice); BSE's table is followed.
//                               Group T is in neither table: that line
//                               answers with a `why`. The group is the
//                               token before the ISIN on the catalogue line.
//   IPFT                        "combined with transaction charges" from
//                               now on, says the page. It still prints
//                               ₹0.01 per crore in one table and ₹0.10 per
//                               lakh in another. It is not added twice: 0.
//   GST                         18% of brokerage + transaction + demat +
//                               IPFT. SEBI is not in that list.
//   SEBI                        ₹10 per crore
//   Stamp                       0.015% on the buy
//   DP on a delivery sell       ₹20 per scrip per day + GST (CDSL ₹3.5 +
//                               Upstox ₹16.5; a woman's CDSL part is ₹3.25,
//                               the total is the same ₹20)
// Intraday is the lower of ₹20 and 0.1%. Upstox Plus is another plan
// ("up to ₹30 per order"). An account processing fee may be charged at
// onboarding.
//
// United States, https://upstox.com/us-stocks/ read on 2026-10-18.
// Upstox Securities (IFSC branch, GIFT City) is the Global Access
// provider. Alpaca Securities LLC is the US clearing broker the page
// names. The US book is the 605 × Alpaca's Rule 606 Q: spreads/rule606.mjs
// aliases upstox to alpaca.
//   Brokerage, each side        0.25% per transaction, minimum $0.01,
//                               maximum $25, then GST 18%. The page prints
//                               "GST (as applicable) 18%" without saying on
//                               which line. It is put on the brokerage, as
//                               on the Indian table. Free for the first 30
//                               days after enabling: the remark says so.
//   IFSCA turnover, each side   0.005% of trade value
//   CAT, each side              $0.000002 per share
//   FINRA TAF, sell only        $0.000195 per share, max $9.79
//   SEC, sell only              $0.0000206 of the sell value
//   Account opening, AMC, deposits, withdrawals: $0.
//   The INR → USD conversion is done by the payment gateway or partner
//   bank at the rate the app shows. Upstox says it takes no commission on
//   it and that charges are "pass-through"; no markup is printed. The
//   account holds INR only (deposits.mjs), so that conversion happens on
//   every US trade, and back to INR on the sale proceeds.
//
//   Global Investing FAQ PDF, https://assets.upstox.com/website/us-stocks/
//   global-%20Investing-faqs.pdf read on 2026-10-18, Q6 and Q8:
//     "remittances for US Stocks are supported only through HDFC Bank,
//     ICICI Bank, Axis Bank, and IDFC FIRST Bank" (the help-centre
//     article 264394 adds Kotak).
//     "For INR to USD deposits, the applicable exchange rate typically
//     includes: Telegraphic Transfer Buying Rate (TTBR), Bank's FX spread
//     (varies by bank), Upstox charges, Bank charges, Applicable GST".
//   No bank prints a markup over interbank for an LRS remittance: HDFC
//   RemitNow (hdfc.bank.in/remitnow/remitnow-fees-and-charges) and IDFC
//   FIRST (idfcfirstbank.com/banking-products/outward-remittance.html)
//   print a fee per remittance and refer to the day's card rate. The
//   spread, and the "Upstox charges" inside the rate, have no number: a
//   US line's `usd` stays N/A (`brokerFees` stays).
//   The per-remittance commission (HDFC ₹500 up to USD 500, ₹1,000 above,
//   + GST 18%; IDFC FIRST ₹100 + GST) is per funding, not per trade, and
//   depends on the client's bank: remark.
//
//   GST on the conversion itself is statutory: CGST Rules 2017, rule
//   32(2)(b), value of a money-changing supply = 1% of the gross amount
//   up to ₹1 lakh (min ₹250); ₹1,000 + 0.5% of the part from ₹1 lakh to
//   ₹10 lakh; ₹5,500 + 0.1% above ₹10 lakh (max ₹60,000); GST 18% on that.
//   HDFC's RemitNow table prints the same slab as tax: 0.18% of the
//   amount up to ₹1 lakh (min ₹45, max ₹180); ₹180 + 0.09% to ₹10 lakh
//   (max ₹990); ₹990 + 0.018% above (max ₹10,800). It is priced on the
//   rupees converted out on the buy and on the sale proceeds converted
//   back (fx.mjs rate). Rule 32(2)(a) lets a bank tax 18% of its spread
//   instead; that spread is the unknown leg above.
//   TCS on LRS remittances (20% above ₹10 lakh a year) is a tax credit
//   claimed back in the return, not a cost: remark.
//   A GB/IE/FR/IT/ES share with no tax-map line is N/A too (taxGap).
//
//   node brokers/upstox/upstox_cost.mjs RELIANCE NSE INR --shares=10 --price=1167.7
//   node brokers/upstox/upstox_cost.mjs AAPL NASDAQ USD --shares=10 --price=343.46
//   node brokers/upstox/upstox_cost.mjs SPY ARCX USD --shares=10 --price=761.69
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, pct, sameDaySell, sebiRate } from "../../indianDelivery.mjs";
import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const CATALOGUE = new URL("upstox-parsed.json", import.meta.url);
const PAGE = "https://upstox.com/brokerage-charges/";
const US_PAGE = "https://upstox.com/us-stocks/";
const READ_ON = "2026-10-18";

// BSE per crore of gross turnover, by scrip group (see the header).
const BSE_PER_CRORE = {
  A: 375, B: 375,
  M: 275, MT: 275, TS: 275, MS: 275, IF: 275, IT: 275, R: 275,
  X: 10000, XC: 10000, XD: 10000, XT: 10000, Z: 10000,
  P: 100000, ZP: 100000, SS: 100000, ST: 100000,
};
// ₹375 when the scrip also trades elsewhere, ₹275 when it is BSE-exclusive.
const BSE_SHARED = new Set(["E", "F", "FC", "G", "GC", "I", "W"]);
const CRORE = 1e7;

const US_RATE = 0.0025;
const US_MIN = 0.01;
const US_CAP = 25;
const GST = 0.18;
const IFSCA = 0.00005;
const CAT = 0.000002;
const TAF = 0.000195;
const TAF_MAX = 9.79;
const SEC = 0.0000206;
// Folder key: spreads/rule606.mjs aliases upstox to Alpaca Securities LLC.
const US_DEALER = "upstox";
const US_PLACES = new Set(["NASDAQ", "NYSE", "NYSE ARCA", "NYSE AMERICAN", "CBOE BZX", "OTC", "AMEX", "CBOE"]);

const FAQ_PDF = "https://assets.upstox.com/website/us-stocks/global-%20Investing-faqs.pdf";

// GST on a money-changing supply, in rupees: 18% of the CGST rule
// 32(2)(b) value, as HDFC's RemitNow table prints it.
function fxGstInr(amount) {
  if (!(amount > 0)) return 0;
  if (amount <= 1e5) return Math.min(180, Math.max(45, amount * 0.0018));
  if (amount <= 1e6) return 180 + (amount - 1e5) * 0.0009;
  return Math.min(10800, 990 + (amount - 1e6) * 0.00018);
}

// The bank's spread and the per-remittance bank fee; the free first 30
// days (no brokerage: 100% lower) are put in front once this order's
// commission is known to be above zero.
const US_REMARK = [
  "FX through the client's bank at a rate not stated.",
  "Each transfer of money to the US account pays a bank fee plus 18% GST: HDFC ₹500 up to $500 sent, ₹1,000 above; IDFC FIRST ₹100.",
].join("\n");

// "… BSE <group> <ISIN>" on a BSE catalogue line.
function bseGroup(row) {
  const hit = String(row?.raw || "").match(/\bBSE\s+([A-Z]{1,2})\s+[A-Z]{2}[A-Z0-9]{9}\d\s*$/);
  return hit ? hit[1] : null;
}

function txnRate(exchange, row) {
  if (exchange === "NSE") return pct("0.00307");
  if (exchange !== "BSE") return null;
  const group = bseGroup(row);
  if (BSE_PER_CRORE[group] != null) return BSE_PER_CRORE[group] / CRORE;
  if (BSE_SHARED.has(group)) return (onNse.has(String(row?.isin || "").toUpperCase()) ? 375 : 275) / CRORE;
  return null;
}

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);
// A scrip with an NSE line is not BSE-exclusive.
const onNse = new Set(rows.filter((r) => r.exchange === "NSE" && r.isin).map((r) => String(r.isin).toUpperCase()));

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place, currency }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .filter((r) => US_PLACES.has(code(r.exchange)))
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function usRoundTrip(query) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "INR",
    url: US_PAGE,
    fxUrl: FAQ_PDF,
    remark: US_REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Upstox n'existe pas encore : lancer `node brokers/upstox/upstox_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Upstox` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Upstox`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }
  const m = matches[0];
  const leafBook = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "upstox",
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
  const q = qOf(US_DEALER);
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    basis:
      `actions US via GIFT City, page relue le ${READ_ON}. Courtage 0,25 % par ordre, minimum 0,01 $, plafond 25 $, puis GST 18 %. ` +
      "IFSCA 0,005 % et CAT 0,000002 $ par part à chaque sens. TAF et SEC à la vente. " +
      "GST sur le change (règle 32(2)(b) des CGST Rules, barème imprimé par HDFC) sur les roupies converties à l'achat et sur le produit de la vente rapatrié." +
      (q != null ? ` Carnet 605 × Q Alpaca ${Number(q.toFixed(3))}.` : ""),
  };
  if (listing.currency !== "USD") {
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
  const commissionEach = Math.min(US_CAP, Math.max(US_MIN, notional * US_RATE));
  const brokerFees = commissionEach * 2 * (1 + GST);
  const ifsca = notional * IFSCA * 2;
  const cat = n * CAT * 2;
  const taf = Math.min(TAF_MAX, n * TAF);
  const sec = notional * SEC;
  const levy = ifsca + cat + taf + sec;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  // Rupees converted out on the buy and back on the sale, at the fx.mjs rate.
  const inrPerUsd = usdPer("INR") ? 1 / usdPer("INR") : null;
  const fxGstUsd =
    notionalUsd == null || inrPerUsd == null ? null : (2 * fxGstInr(notionalUsd * inrPerUsd)) / inrPerUsd;

  const us605 = m.venue?.source === "us605";
  const routed = us605
    ? usBookPerShare({ broker: US_DEALER, ticker: listing.ticker, fallback: leafBook.leaf?.perShare ?? null })
    : null;
  const marketBp = bp ?? (routed != null ? null : leafBook.leaf?.bp ?? null);
  const marketPerShare = perShare ?? routed ?? leafBook.leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: routed != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, "USD"),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  // The bank's spread (and the Upstox charge inside the rate) on both
  // conversions has no published number, and a taxed country's share with
  // no tax line has no known tax: either makes the trip unknown.
  const fxUsd = null;
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const usd = plus(bookUsd, brokerFees, levy, gap ? null : taxUsd, fxGstUsd, fxUsd);
  const unknown = [
    bookUsd == null ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    "marge de change INR↔USD de la banque et frais Upstox inclus dans le taux non publiés (FAQ Global Investing, Q8 : « Bank's FX spread (varies by bank) », « Upstox charges »)",
    gap,
  ].filter(Boolean);

  const freeCut = commissionEach > 0 ? 100 : 0;
  return {
    ...shared,
    remark: [freeCut ? `First 30 days: ${freeCut}% lower fee.` : "", US_REMARK].filter(Boolean).join("\n"),
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    why: unknown.join(" ; "),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: "USD" },
    commission: {
      each: finite(commissionEach, 6),
      gst: GST,
      ifsca: finite(ifsca, 6),
      cat: finite(cat, 8),
      taf: finite(taf, 6),
      sec: finite(sec, 6),
      fxGst: finite(fxGstUsd, 6),
      currency: "USD",
    },
    parts: {
      market: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      levies: finite(levy, 6),
      taxes: finite(taxUsd, 6),
      fxGst: finite(fxGstUsd, 6),
      fx: null,
    },
  };
}

const SCHEDULE = {
  broker: "Upstox",
  folder: "upstox",
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  brokerageEach: () => 20,
  txnRate,
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: GST,
  gstOnSebi: false,
  gstOnIpft: true,
  gstOnDp: true,
  ipftRate: 0,
  dpInr: 20,
  // A US line found without a place or a currency.
  us: ({ query }) => usRoundTrip(query),
  basis:
    "Courtage livraison 20 ₹ par ordre. DP 20 ₹ + GST par valeur à la vente. BSE : frais de transaction selon le groupe, barème de la BSE (A, B 0,00375 % ; X, XT, Z 0,1 % ; P, ZP 1 % ; M, MT, TS, MS, R 0,00275 %).",
  remark: "",
};

// Intraday is the lower of ₹20 and 0.1% an order; delivery is ₹20.
const indiaTrip = (query) =>
  sameDaySell(indiaRoundTrip(SCHEDULE, query), () => 20, (notional) => Math.min(20, notional * pct("0.1")));

export function roundTrip(query) {
  const place = code(query.place);
  const ccy = code(query.currency);
  if (place === "NSE" || place === "BSE" || ccy === "INR") return indiaTrip(query);
  if (!place && !ccy) {
    // No place and no currency: the first catalogue line decides, as in indianDelivery.
    const asked = loose(query.etf);
    const first = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked)[0];
    if (!first || !US_PLACES.has(code(first.exchange))) return indiaTrip(query);
  }
  return usRoundTrip(query);
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
      roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }),
      null,
      2
    )
  );
}

printOwnCli();
