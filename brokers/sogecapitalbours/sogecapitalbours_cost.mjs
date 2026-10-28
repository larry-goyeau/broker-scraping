// What one round trip costs at Sogecapital Bourse, now Saham Capital
// Bourse, the broker of Saham Bank (ex Société Générale Maroc): buy n
// shares, sell them back, in dollars. Online order (Saham Bourse) on a
// listed Casablanca share.
//
// https://www.sahambank.com/wp-content/uploads/2026/02/Affiche-tarifaire-JAN-2026-Saham-Bank.pdf
// read on 2026-10-26, the bank's poster in force from January 2026.
// Block "VIII. Opérations sur les valeurs mobilières", in DH HT:
//   Commission          "Commission sur achat / vente action 0,9%". It is
//                       the only trading line, with no floor and no
//                       separate exchange or settlement line. 0.9 % is
//                       the sum of the usual Casablanca lines (brokerage
//                       0.6 % + settlement 0.2 % + exchange 0.1 %), so it
//                       is taken as all-in.
//   VAT                 10 %. The poster prints the block before tax and
//                       no rate; 10 % is Morocco's VAT on these
//                       commissions, printed on the same lines by Valoris
//                       ("+TVA 10%"), CFG Bank and CDG Capital Bourse.
//   Custody             "de 0,1% à 0,3% en fonction du portefeuille".
//   Book                the Casablanca (XCAS) leaf of spreads/book.mjs.
// The online page (https://www.sahambank.com/produit/execution-de-vos-
// ordres-de-bourse-en-ligne/) prints no other price and the poster no
// online subscription for Saham Bourse ("Web Valeurs" is a remote banking
// line for cheques and bills, not shares).
//
// In the total: the book, then 0.9 % x 1.10, each side. Remark: custody,
// which depends on the portfolio, not on the trade. Left out: the
// dividend fee (2 %) and the transfer-out fee (0.2 %). The trade settles
// in dirhams and every line is in MAD, so there is no conversion.
// Casablanca prints no transaction tax.
//
//   node brokers/sogecapitalbours/sogecapitalbours_cost.mjs ADH Casablanca MAD --shares=300 --price=30
//   node brokers/sogecapitalbours/sogecapitalbours_cost.mjs ATW Casablanca MAD --shares=14 --price=700
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("sogecapitalbours-parsed.json", import.meta.url);
const PAGE = "https://www.sahambank.com/wp-content/uploads/2026/02/Affiche-tarifaire-JAN-2026-Saham-Bank.pdf";
const READ_ON = "2026-10-26";
const COMMISSION = 0.009;
const VAT = 0.1;
const REMARK = "Custody is 0.1% to 0.3% of the portfolio, before VAT.";

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

// One side, in MAD, VAT included.
function leg(notional) {
  return notional * COMMISSION * (1 + VAT);
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
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Sogecapital Bourse n'existe pas encore : lancer `node brokers/sogecapitalbours/sogecapitalbours_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Sogecapital Bourse` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Sogecapital Bourse`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "sogecapitalbours",
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
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    listing,
    cashCurrency: listing.currency,
    basis:
      `ordre en ligne (Saham Bourse), affiche tarifaire Saham Bank de janvier 2026 relue le ${READ_ON}. ` +
      `Commission sur achat / vente action 0,9 % HT, prise comme tout compris (courtage, règlement, Bourse), ` +
      `TVA 10 %, chaque sens.`,
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
  const one = leg(notional);
  const brokerFees = dollars(one + one, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);
  const rate = COMMISSION * (1 + VAT);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: rate, sell: rate, currency: listing.currency },
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
