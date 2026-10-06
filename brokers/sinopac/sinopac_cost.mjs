// What one round trip costs at Bank SinoPac: buy n shares, sell
// them back, in dollars. Online order.
//
// https://mma.sinopac.com/StockandETF/index
// read on 2026-10-05. The same notice covers a US share, a US ETF
// and a Hong Kong ETF.
//   Buy and sell, each side   the posted 1% of the fill. A promotion
//                             through 2026-12-31 is not a printed
//                             rate, so the number uses the posted one.
//   Floor, each side          the equivalent of 20 USD on a US line.
//                             A Hong Kong ETF has none.
//   Market charges            the client bears them. The rates are the
//                             venues', not the bank's.
//                             United States, on the sale: SEC
//                             0.00206% of the fill, $20.60 per million,
//                             from 2026-04-04.
//                             https://www.sec.gov/rules-regulations/fee-rate-advisories/2026-2
//                             The activity fee is paused at 0 through
//                             2026-12-31. The rate underneath is
//                             $0.000195 a share, cap $9.79, back on
//                             2027-01-01. SR-FINRA-2026-021.
//                             Hong Kong ETF, each side: SFC 0.0027%,
//                             AFRC 0.00015%, trading fee 0.00565%.
//                             Stamp duty on an ETF transfer is waived,
//                             so it is not in the number.
//                             https://www.hkex.com.hk/Services/Rules-and-Forms-and-Fees/Fees/Securities-(Hong-Kong)/Trading/Transaction?sc_lang=en
//                             https://www.ird.gov.hk/eng/faq/ETFs.htm
//   Trust management          0.2% a year by the day, taken from the
//                             sale, at least NT$500, USD 15, HK$120
//                             or RMB 100, by the trust currency. The
//                             days are not an input, so it stays out
//                             of the number.
//   United States             the quoted NBBO of the ticker. The bank
//                             does not name a US broker-dealer, so no
//                             Rule 606 mix is applied.
//   Hong Kong                 no book is published here
//   The regular-savings plan is another order. It is not this round
//   trip.
//   The public spot board versus the Taiwan dollar is a bank bid and
//   a bank ask on the remittance line, not the cash line. The remark
//   is half that spread, as "FX 0.163% when cash ≠ USD".
//   The board's own quote time is 2026-10-02 15:30 Taipei.
//   CNH is the offshore renminbi line. The board prints it apart
//   from CNY.
//   https://bank.sinopac.com/sinopacBT/personal/forex/exchange-rate/exchange-rate.html
//
//   node brokers/sinopac/sinopac_cost.mjs AAPL US USD --shares=10 --price=200
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

const CATALOGUE = new URL("sinopac-parsed.json", import.meta.url);
const PAGE = "https://mma.sinopac.com/StockandETF/index";
const READ_ON = "2026-10-05";
const RATE = 0.01;
const FLOOR_USD = 20;
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0;
const HK_LEVY = 0.000027 + 0.0000015 + 0.0000565;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const CUSTODY = "Custody is 0.2% a year, min $15";
// Spot bid and ask versus the Taiwan dollar, bank buy then bank sell.
// Half the pair's spread, over the mid, is how far the ask sits above
// the middle. CNH is the offshore renminbi line, printed apart from CNY.
const BOARD = {
  USD: [31.839, 31.943],
  HKD: [4.0372, 4.0922],
  CNH: [4.7313, 4.7832],
};

function ticket(notional, floor) {
  const percent = notional * RATE;
  if (!(floor > 0)) return percent;
  return Math.max(percent, floor);
}

function marketCharge(exchange, notional, shares) {
  const place = loose(exchange);
  if (place === "US") return { buy: 0, sell: notional * SEC_RATE + shares * TAF_PER_SHARE };
  if (place === "HONGKONG") {
    const side = notional * HK_LEVY;
    return { buy: side, sell: side };
  }
  return null;
}

function remarkOf(currency, row) {
  const lines = [CUSTODY];
  const pair = BOARD[code(currency)];
  if (pair) {
    const [bid, ask] = pair;
    const gap = ((ask - bid) / (ask + bid)) * 100;
    lines.push(`FX ${gap.toFixed(3)}% when cash ≠ ${code(currency)}.`);
  }
  if (String(row?.raw || "").trim().endsWith("professional")) lines.push("For professional investors only.");
  return lines.join("\n");
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
    remark: CUSTODY,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Bank SinoPac n'existe pas encore : lancer `node brokers/sinopac/sinopac_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Bank SinoPac` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Bank SinoPac`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "sinopac",
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
  const american = loose(listing.brokerExchange) === "US" && listing.currency === "USD";
  const floor = american ? FLOOR_USD : null;
  const quoted = american ? usBookPerShare({ broker: "sinopac", ticker: listing.ticker }) : null;
  const marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? quoted ?? (american ? null : book.leaf?.perShare ?? null);
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    remark: remarkOf(listing.currency, m.row),
    basis: `livraison en ligne, page relue le ${READ_ON}. Achat 1 %. Vente 1 %. Plancher 20 USD de chaque côté sur une ligne américaine. SEC 0,00206 % de la vente. Taxe d'activité à 0 jusqu'au 2026-12-31. ETF de Hong Kong : SFC, AFRC et trading fee de chaque côté, sans stamp duty.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const buy = ticket(notional, floor);
  const sell = ticket(notional, floor);
  const brokerFees = dollars(buy + sell, listing.currency);
  const local = marketCharge(listing.brokerExchange, notional, n);
  if (!local) return { ...shared, why: `${listing.brokerExchange} n'a pas de frais de marché publiés` };
  const levyUsd = dollars(local.buy + local.sell, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levyUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: RATE, sell: RATE, floor, currency: listing.currency },
    local: { buy: local.buy, sell: local.sell, currency: listing.currency },
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
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
