// What one round trip costs at Captin: buy n depositary receipts at price p,
// sell them back at once, in dollars. Captin B.V. (Amsterdam) has two books:
// Triodos Bank depositary receipts, whose orders Captin Broker passes to
// another broker on Euronext Amsterdam, and its own MTF (Captin Trading
// Exchange, CPTX), where HZPC certificates trade in two periods of ten
// working days a year. Both are ordered online, in euros.
//
// Sources read on 2026-10-21.
//   https://support.captin.com/hc/en-gb/articles/10470045920541-Cost-overview
//     (Triodos help centre, updated 2026-10-13; the Dutch "Kostenoverzicht"
//     prints the same figures)
//   https://www.hzpc.com/nl/over-ons/vereniging-hzpc/beurs-captin/$3675/$3716/Informatie Document MTF notering Certificaten Vereniging HZPC november 2025.pdf
//     (information document on the Captin MTF listing, November 2025, §4.3.2)
//
//   Euronext Amsterdam (Triodos DRs)
//     Standard fee     5.00 € per executed buy or sell order, charged once on
//                      the first partial execution.
//     Execution fee    0.30 % of the executed amount, each side.
//   Captin Trading Exchange (HZPC certificates)
//     Transaction fee  0.45 % of each executed order, for buyer and seller.
//   Account fee        none for 24 months after the Euronext listing (18 June
//                      2025), then 4.50 € a month billed yearly. Not charged
//                      today, so it is neither in the total nor a remark.
//   Transfer out       75 € per transfer. Not this trip.
//   FX                 cash is euros only (deposits.mjs) and every line is in
//                      euros, so nothing converts.
//   Taxes              none: Dutch shares carry no stamp duty or FTT.
//
// In the total: the book crossed plus both sides' fees. Euronext Amsterdam
// uses its own bid/ask tape. No tape for the Captin MTF is read, so the
// HZPC total is N/A while `brokerFees` carries the 0.90 % round trip.
//
//   node brokers/captin/captin_cost.mjs TRIO "Euronext Amsterdam" EUR --shares=100 --price=8
//   node brokers/captin/captin_cost.mjs NL0015000VZ2 "Captin Trading Exchange" EUR --shares=20 --price=110
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("captin-parsed.json", import.meta.url);
const PAGE = "https://support.captin.com/hc/en-gb/articles/10470045920541-Cost-overview";
const HZPC_PAGE =
  "https://www.hzpc.com/nl/over-ons/vereniging-hzpc/beurs-captin/$3675/$3716/Informatie%20Document%20MTF%20notering%20Certificaten%20Vereniging%20HZPC%20november%202025.pdf";
const READ_ON = "2026-10-21";
const CASH = "EUR";
const MTF = "CAPTINTRADINGEXCHANGE";
// Captin Broker, orders passed to Euronext Amsterdam.
const BROKER = { fixed: 5, rate: 0.003 };
// Captin MTF, HZPC information document §4.3.2.
const MTF_FEE = { fixed: 0, rate: 0.0045 };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(
    rows,
    asked,
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter(
      (m) =>
        !wantPlace ||
        loose(m.row.exchange) === wantPlace ||
        loose(m.row.mic) === wantPlace ||
        loose(m.venue?.mic) === wantPlace
    )
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
    cashCurrency: CASH,
    url: PAGE,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Captin n'existe pas encore : lancer `node brokers/captin/captin_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Captin` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Captin`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const onMtf = loose(m.row.exchange) === MTF || code(m.row.mic) === "CPTX";
  const fee = onMtf ? MTF_FEE : BROKER;
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "captin",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? (onMtf ? "CPTX" : null),
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    url: onMtf ? HZPC_PAGE : PAGE,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    basis: onMtf
      ? `document d'information HZPC de novembre 2025 relu le ${READ_ON} : 0,45 % de frais de transaction par ordre exécuté, à l'achat et à la vente, sur le MTF Captin`
      : `aperçu des coûts Captin relu le ${READ_ON} : 5,00 € de frais standard et 0,30 % de frais d'exécution par ordre exécuté, à l'achat et à la vente, transmis sur Euronext Amsterdam`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `${listing.ticker || etf} est coté en ${listing.currency} : Captin ne traite qu'en euros` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = fee.fixed + notional * fee.rate;
  const brokerFees = dollars(each * 2, CASH);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || (onMtf ? "le carnet du MTF Captin n'est pas relevé" : "pas de feuille de carnet")}`,
        }
      : {}),
    commission: { fixed: fee.fixed, rate: fee.rate, each, currency: CASH, eachWay: true },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      change: 0,
      taxes: 0,
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
