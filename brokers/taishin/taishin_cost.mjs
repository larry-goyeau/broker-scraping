// What one round trip costs at Taishin Bank: buy n shares, sell
// them back, in dollars. Online order.
//
// https://www.taishinbank.com.tw/TSB/export/sites/TSB/files/investment/ETF11508.pdf
// version 11508, read on 2026-10-05. The same disclosure covers a
// foreign share and a foreign ETF.
//   Buy and sell, each side   the top of the printed range, 1.5% of
//                             the fill. The range includes the
//                             executing broker's commission. The bank
//                             does not say where inside 0% to 1.5%
//                             the order sits. The number uses 1.5%.
//   A promotion is not a printed rate. The robo-advisor is another
//     product. Neither is this round trip.
//   United States             the quoted NBBO of the ticker. The bank
//                             does not name a US broker-dealer, so no
//                             Rule 606 mix is applied.
//   Hong Kong, Shanghai and
//   Shenzhen                  no book is published here
//   A domestic ETF is a different card.
//   https://www.taishinbank.com.tw/TSB/personal/investment/fund/fund/TSBankGridPage-000285/
//   Each side is the fund company's own rate. Custody is 0.2% a year
//   under two years, then 0.1% until three years, then free, minimum
//   NT$300, taken on the way out. The years are not an input, so it
//   stays out of the number. The fill is a price in the first hour
//   of the next session, so the exchange book is not used.
//   The public spot board versus the Taiwan dollar is a bank bid and
//   a bank ask on the spot line, not the cash line. The remark is
//   half that spread, as "FX 0.251% when cash ≠ USD".
//   The board's own quote time is 2026-10-05 05:00 Taipei.
//   Renminbi is one line, printed as CNY. The shelf's CNH is that line.
//   https://www.taishinbank.com.tw/TSB/personal/deposit/lookup/realtime/
//
//   node brokers/taishin/taishin_cost.mjs AAPL US USD --shares=10 --price=200
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("taishin-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);
const PAGE = "https://www.taishinbank.com.tw/TSB/personal/investment/offshore-bond/foreign-stock/";
const READ_ON = "2026-10-05";
const RATE = 0.015;

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

const DOMESTIC = [
  "Each side is the fund company's own rate.",
  "Custody is 0.2% a year under two years, then 0.1% until three years, then free, min NT$300.",
  "The fill is a price in the first hour of the next session.",
].join("\n");
// Spot bid and ask versus the Taiwan dollar, bank buy then bank sell.
// Half the pair's spread, over the mid, is how far the ask sits above
// the middle. Renminbi is one line, printed as CNY.
const BOARD = {
  USD: [31.781, 31.941],
  HKD: [4.0353, 4.0853],
  CNY: [4.7275, 4.7735],
  CNH: [4.7275, 4.7735],
};

function remarkOf(currency, row) {
  const domestic = loose(row?.exchange) === "TWSE";
  const lines = domestic ? [DOMESTIC] : [];
  const pair = domestic ? null : BOARD[code(currency)];
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
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Taishin n'existe pas encore : lancer `node brokers/taishin/taishin_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Taishin` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Taishin`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const domestic = loose(m.row.exchange) === "TWSE";
  const book = domestic
    ? { mic: null, leaf: null }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
        broker: "taishin",
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
  const american = !domestic && loose(listing.brokerExchange) === "US" && listing.currency === "USD";
  const quoted = american ? usBookPerShare({ broker: "taishin", ticker: listing.ticker }) : null;
  const marketBp = domestic ? null : bp ?? (american ? null : book.leaf?.bp ?? null);
  const marketPerShare = domestic ? null : perShare ?? quoted ?? (american ? null : book.leaf?.perShare ?? null);
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    remark: remarkOf(listing.currency, m.row),
    basis: domestic
      ? `ETF domestique, page relue le ${READ_ON}. Chaque côté suit la société de gestion. La garde est hors du nombre. Le cours est un prix dans la première heure de la séance suivante.`
      : `livraison en ligne, page relue le ${READ_ON}. Achat 1,5 %. Vente 1,5 %. Le haut de la fourchette 0 % à 1,5 %, commission du courtier incluse.`,
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
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: domestic ? { why: "le cours est un prix dans la première heure de la séance suivante" } : m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const brokerFees = domestic ? null : dollars(notional * RATE * 2, listing.currency);
  const usd = plus(bookUsd, brokerFees);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(domestic
      ? { why: "le cours est un prix dans la première heure de la séance suivante" }
      : bookUsd == null
        ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
        : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: domestic ? null : RATE, sell: domestic ? null : RATE, currency: listing.currency },
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
