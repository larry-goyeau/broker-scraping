// What one round trip costs at the United Arab Jordan Company for
// Investment and Financial Brokerage (AJIB's brokerage arm, Amman): buy n
// shares on the Amman Stock Exchange through the AJIB Brokerage app and sell
// them straight back, in dollars. The ASE trades in dinars and the account
// is held in dinars, so nothing is converted.
//
// The FAQ, "What are the commission rates?", read on 2026-10-26, gives an
// all-in rate per dinar of the invoice, "including capital market
// institutions' commissions and imposed tax", on each buy or sell invoice:
//   Trading through brokers   0.0052 to 0.0062
//   Mobile trading            0.0042 to 0.0082
//   https://www.uajib.com/en/faq
// Only the app is online, so its range counts, and a discretionary range
// takes its top (owner rule): 0.0082 each side. The ASE's Transaction Cost
// page sets the capital market institutions at 0.0014 and the treasury tax
// at 0.0008 "by each party to the contract", so the broker's own share is
// 0.0082 - 0.0022 = 0.006 (above the ASE's 0.004 ceiling for shares; the
// FAQ's figure is kept as printed). The bottom of the range, 0.0042, is in
// the remark as fees the client may get.
//   Broker commission                   0.006    (0.60%)  each side
//   Capital market institutions         0.0014   (0.14%)  each side
//   Tax for the state treasury          0.0008   (0.08%)  each side
//   https://www.ase.com.jo/en/Product-Services/Trading-Services/Transaction-Cost
// The commission is "directly charged or deducted from the purchase or sale
// invoice"; no minimum in dinars is printed.
//
// Left out: opening is free ("No fees apply for opening an account"); no
// custody, inactivity or account fee is printed. The dinar amounts are in
// `parts`.
// Amman's book is the daily bulletin's best bid and ask for the last
// session (spreads/ase-touch.mjs); a share that did not trade has none.
//
//   node brokers/unitedarabjordan/unitedarabjordan_cost.mjs AALU XAMM JOD --shares=700 --price=1.43
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";

const CATALOGUE = new URL("unitedarabjordan-parsed.json", import.meta.url);
const PAGE = "https://www.uajib.com/en/faq";
const READ_ON = "2026-10-26";
// Mobile trading, all-in per dinar of the invoice, each side.
const ALL_IN_MAX = 0.0082;
const ALL_IN_MIN = 0.0042;
const TREASURY = 0.0008;
const INSTITUTIONS = 0.0014;
const COMMISSION = Number((ALL_IN_MAX - TREASURY - INSTITUTIONS).toFixed(6));
const EACH = COMMISSION + TREASURY + INSTITUTIONS;
const CASH = "JOD";
// The cut of the broker's commission itself, in percent: 0.0082 → 0.0042
// all-in moves the commission from 0.006 to 0.002 (buy and sell alike).
const REMARK = `Fees might be ${Math.round((100 * (ALL_IN_MAX - ALL_IN_MIN)) / COMMISSION)}% lower.`;

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
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue United Arab Jordan n'existe pas encore : lancer `node brokers/unitedarabjordan/unitedarabjordan_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue United Arab Jordan` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez United Arab Jordan`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "unitedarabjordan",
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
    basis:
      `FAQ United Arab Jordan relue le ${READ_ON} : application mobile 0,0042 à 0,0082 par dinar de facture, ` +
      `institutions du marché et taxe comprises ; haut de la fourchette retenu (0,82 %), dont 0,14 % d'institutions et 0,08 % de taxe du Trésor d'après l'ASE ; chaque sens.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `United Arab Jordan ne publie un barème que pour la bourse d'Amman en dinars ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const commissionJod = notional * COMMISSION * 2;
  const leviesJod = notional * (TREASURY + INSTITUTIONS) * 2;
  const brokerFees = dollars(commissionJod, listing.currency);
  const levies = dollars(leviesJod, listing.currency);
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
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      buy: EACH,
      sell: EACH,
      broker: COMMISSION,
      treasury: TREASURY,
      institutions: INSTITUTIONS,
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(levies, 6),
      courtageJod: finite(commissionJod, 6),
      taxesJod: finite(leviesJod, 6),
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
