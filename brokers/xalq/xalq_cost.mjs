// What one round trip costs at Xalq Bank (ASC "Xalq" Bank, Baku): buy n
// shares on the Baku Stock Exchange (BSE, MIC XIBE) through the bank's
// XalqOnline app ("Qiymətli kağızlar bazarı", user guide section 16.3) and
// sell them straight back, in dollars.
//
// "ASC "Xalq" Bankında investisiya xidmətlərinin göstərilməsi üzrə Tariflər",
// read on 2026-10-26. Individuals (section 1):
//   "1.4. Səhmlərin alqı - satqısı" (buying and selling shares)
//     "1.4.1. İlkin bazar 0.06% min.5 AZN/USD/EUR"   (primary market)
//     "1.4.2. Təkrar bazar 0.06% min.5 AZN/USD/EUR"  (secondary market)
//   Note: apart from 1.7 and 2.6 (depo statements), "digər komissiyalar
//   əqdin məbləğinə hesablanır" (the other commissions are taken on the deal
//   amount), so each side pays 0.06%, at least 5 in the deal currency.
//   "1.7.1. Depo hesabının açılması Pulsuz" (depo account opening free).
// No separate exchange (BSE) or depository (NDC) fee is printed, so the
// 0.06% is the whole trading charge, as for other brokers whose tariff names
// no levy. Companies pay "razılaşma əsasında" (by agreement): not costed.
// OTC deals (1.6, min. 50) are not exchange trades.
// Currency: every BSE share trades in manat, and the minimum is printed in
// AZN/USD/EUR, the accounts the bank keeps, so nothing is converted and no
// conversion rate is printed: no remark.
// Left out: depo statements (4 / 20 AZN, on request), the general clause
// letting the bank charge extra for unusual work (final provisions, 3).
//   https://api.xalqbank.az/storage/temp/processing/investisiya-xidmetleri-uzre-tarifler.pdf
//
// Formula: book + 2 × max(5 AZN, 0.06% × n × price).
// The BSE has no stored book (spreads/venues.mjs) and fx.mjs carries no
// manat rate, so the dollar total is N/A for now; the manat amounts are in
// `parts`.
//
//   node brokers/xalq/xalq_cost.mjs AZ1012006628 XIBE AZN --shares=32 --price=54
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("xalq-parsed.json", import.meta.url);
const PAGE = "https://api.xalqbank.az/storage/temp/processing/investisiya-xidmetleri-uzre-tarifler.pdf";
const READ_ON = "2026-10-26";
const RATE = 0.0006;
const MIN = 5;
const CASH = "AZN";
// The minimum is printed in each of these; a share line is always in AZN.
const DEAL_CURRENCIES = ["AZN", "USD", "EUR"];
const BSE = "XIBE";

// One side, in the deal currency.
export function side(notional) {
  return Math.max(MIN, notional * RATE);
}

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
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  // The BSE has no venue in venues.mjs: it is matched on its MIC or name.
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
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Xalq Bank n'existe pas encore : lancer `node brokers/xalq/xalq_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Xalq Bank` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Xalq Bank`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "xalq",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? (code(m.row.mic) || BSE),
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    basis:
      `tarifs d'investissement Xalq Bank relus le ${READ_ON} : actions, particuliers, 0,06 % du montant de l'opération, ` +
      `minimum 5 AZN/USD/EUR, chaque sens ; aucun frais de bourse ou de dépositaire imprimé à part`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!DEAL_CURRENCIES.includes(listing.currency)) {
    return { ...shared, why: `Xalq Bank ne publie un minimum qu'en AZN, USD ou EUR ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const one = side(notional);
  const commission = one * 2;
  const brokerFees = dollars(commission, listing.currency);
  const levies = 0;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levies);
  const why =
    usd != null
      ? null
      : notionalUsd == null
        ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
        : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    confidence: "le barème est clair ; le total attend le carnet de la BFB et un cours du manat",
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { rate: RATE, min: MIN, side: one, currency: listing.currency, eachWay: true },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(levies, 6),
      courtageAzn: finite(commission, 6),
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
