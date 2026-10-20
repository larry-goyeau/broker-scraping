// What one round trip costs at ALOR Broker (ООО «АЛОР +»): buy n shares or
// fund units on the Moscow Exchange or the SPB Exchange and sell them back
// the same day, in dollars. Every catalogue line is in rubles and the
// account is funded in rubles only, so nothing is converted.
//
// Brokerage tariffs, edition in force from 08.10.2026, the file
// "Тарифы БО.pdf" in ALOR's open-information bucket, read on 2026-10-19:
//   https://storage.alorbroker.ru/openinfo-reglaments/%D0%A2%D0%B0%D1%80%D0%B8%D1%84%D1%8B%20%D0%91%D0%9E.pdf
// Three stock-market plans are open to a client, each a row (`query.plan`):
//   Профессионал (2.4, the default)  the day's turnover up to 500,000 RUB
//       0.04%, to 1 million 0.035%, to 10 million 0.03%, above 0.025%.
//       It is the plan a client lands on when the 30-day welcome plan
//       ends.
//   Активный (2.3)  up to 1 million 0.08%, to 10 million 0.025%, to 30
//       million 0.02%, to 50 million 0.015%, above 0.01%.
//   Единый (2.5)  0.1% of each trade.
// The two turnover plans charge "daily on the turnover of all trades made
// on the client's orders during the trading day"; a same-day round trip is
// a turnover of twice the amount, and the band it falls in prices all of
// it. No floor is printed. Профессионал and Активный also pay the account
// fee of 500 RUB a month (1.13); Единый does not (1.14). That month is in
// the remark and stays out of the trip. «Добро пожаловать!» lasts 30 days
// and «Первый» is closed to new clients since 16 May 2023, so neither is a
// row; the advisory and copy-trading plans are not execution tickets.
//
// Exchange and clearing fees are billed on top at the venue's own tariff
// (1.5). The Moscow Exchange equity tariff in force since 01.11.2022,
// https://www.moex.com/s1166 read on 2026-10-19: the T+ order book and the
// odd-lot board use the maker-taker model, maker 0, taker 0.01725%
// (exchange) plus 0.01275% (NCC clearing) = 0.03%, at least 0.02 RUB a
// trade. A round trip that crosses the book is a taker on both sides. The
// SPB Exchange tariff was not read, so an SPB line has no levy figure; it
// has no stored book either.
//
// Left out: a phone order adds 100 RUB (1.12) and is not this ticket.
// Holding is not a trade.
//
//   node brokers/alor/alor_cost.mjs SBER MISX RUB --shares=10 --price=286
//   node brokers/alor/alor_cost.mjs SBER MISX RUB --shares=10 --price=286 --plan=unified
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("alor-parsed.json", import.meta.url);
const PAGE =
  "https://storage.alorbroker.ru/openinfo-reglaments/%D0%A2%D0%B0%D1%80%D0%B8%D1%84%D1%8B%20%D0%91%D0%9E.pdf";
const MOEX_PAGE = "https://www.moex.com/s1166";
const READ_ON = "2026-10-19";
const EDITION = "08.10.2026";
const CASH = "RUB";
const ACCOUNT_FEE_REMARK = "Account fee is RUB 500 a month.";

// Bands on the day's turnover in rubles: `upTo` inclusive, the rate prices
// the whole turnover.
const PLANS = {
  professional: {
    id: "professional",
    name: "Профессионал",
    bands: [
      { upTo: 500000, rate: 0.0004 },
      { upTo: 1000000, rate: 0.00035 },
      { upTo: 10000000, rate: 0.0003 },
      { upTo: Infinity, rate: 0.00025 },
    ],
    remark: ACCOUNT_FEE_REMARK,
    basis: "plan Профессионал : 0,04 % du chiffre du jour jusqu'à 500 000 RUB, 0,035 % jusqu'à 1 million, 0,03 % jusqu'à 10 millions, 0,025 % au-delà",
  },
  active: {
    id: "active",
    name: "Активный",
    bands: [
      { upTo: 1000000, rate: 0.0008 },
      { upTo: 10000000, rate: 0.00025 },
      { upTo: 30000000, rate: 0.0002 },
      { upTo: 50000000, rate: 0.00015 },
      { upTo: Infinity, rate: 0.0001 },
    ],
    remark: ACCOUNT_FEE_REMARK,
    basis: "plan Активный : 0,08 % du chiffre du jour jusqu'à 1 million de RUB, 0,025 % jusqu'à 10 millions, 0,02 % jusqu'à 30, 0,015 % jusqu'à 50, 0,01 % au-delà",
  },
  unified: {
    id: "unified",
    name: "Единый",
    bands: [{ upTo: Infinity, rate: 0.001 }],
    remark: "",
    basis: "plan Единый : 0,1 % de chaque opération, sans frais de tenue de compte",
  },
};
const DEFAULT_PLAN = "professional";

// Moscow Exchange, T+ book and odd lots, taker side: exchange plus NCC.
const MOEX_TAKER = 0.0003;
const MOEX_MIN = 0.02;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const joinRemarks = (...xs) => xs.map((x) => String(x || "").trim()).filter(Boolean).join(" ");

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

export function planRate(plan, turnoverRub) {
  return plan.bands.find((band) => turnoverRub <= band.upTo).rate;
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const chosen = PLANS[String(plan || DEFAULT_PLAN)] || PLANS[DEFAULT_PLAN];
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
    remark: chosen.remark,
    plan: chosen.id,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue ALOR n'existe pas encore : lancer `node brokers/alor/alor_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ALOR` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ALOR`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "alor",
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
  const moex = listing.mic === "MISX";
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    remark: joinRemarks(m.row.remark, chosen.remark),
    listing,
    basis:
      `tarifs ALOR (édition du ${EDITION}) relus le ${READ_ON}, ${chosen.basis}. ` +
      (moex
        ? "Frais de la Bourse de Moscou en sus : preneur 0,01725 % (bourse) + 0,01275 % (NCC) = 0,03 %, au moins 0,02 RUB, chaque sens."
        : "Frais de la bourse de Saint-Pétersbourg en sus, barème non relu."),
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `ALOR n'est approvisionné qu'en roubles ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  // Buy and sell on the same day: the day's turnover is twice the amount.
  const turnover = notional * 2;
  const rate = planRate(chosen, turnover);
  const brokerRub = turnover * rate;
  const brokerFees = dollars(brokerRub, CASH);
  const levyRub = moex ? 2 * Math.max(notional * MOEX_TAKER, MOEX_MIN) : null;
  const levies = levyRub == null ? null : dollars(levyRub, CASH);
  const taxPct = Object.values(taxRates(taxesOf(listing.isin))).reduce((sum, r) => sum + r, 0);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, levies, taxUsd);
  const why =
    usd != null
      ? null
      : notionalUsd == null
        ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
        : bookUsd == null
          ? `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
          : `frais de ${listing.exchange} non relus`;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { plan: chosen.name, rate, dayTurnover: turnover, buy: notional * rate, sell: notional * rate, currency: CASH },
    levies: moex ? { taker: MOEX_TAKER, min: MOEX_MIN, eachWay: true, currency: CASH } : null,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(plus(levies, taxUsd), 6),
      courtageRub: finite(brokerRub, 6),
      fraisBourseRub: finite(levyRub, 6),
    },
    sources: { fees: PAGE, moex: MOEX_PAGE },
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
  console.log(
    JSON.stringify(
      roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")), plan: arg("plan", null) }),
      null,
      2
    )
  );
}

printCli();
