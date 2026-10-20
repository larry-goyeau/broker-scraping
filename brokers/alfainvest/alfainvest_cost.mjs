// What one round trip costs at Alfa-Investments (АО «Альфа-Банк»): buy n
// shares or fund units on the Moscow Exchange or the SPB Exchange and sell
// them back the same day, in dollars. Every catalogue line is in rubles,
// and rubles are a deposit currency, so nothing is converted.
//
// «Тарифы АО "Альфа-Банк" на брокерские услуги», in force from
// 21 October 2026, read on 2026-10-19 (the edition of 5 October prints the
// same Инвестор rate):
//   https://alfabank.servicecdn.ru/site-upload/d0/16/2014/broker_tariffs_21102026.pdf
// with the plan sheets on https://alfabank.ru/make-money/investments/tariffs/.
// Two self-service plans, each a row (`query.plan`):
//   Инвестор (1.1, the default on opening)  0.3% of each trade on the
//       Moscow and SPB exchanges. Note III: the rate includes the
//       exchange fees. Note X: account upkeep is included.
//   Альфа-Трейдинг (1.2)  the rate is set by last month's settled turnover
//       (columns) and last month's average net assets (rows). The row
//       here takes last month's turnover at 4 million RUB or less and the
//       net assets at the trade's own amount: up to 200,000 RUB 0.04%,
//       to 4 million 0.035%, to 20 million 0.025%, to 50 million 0.021%,
//       above 0.018%. Note III: this plan's rate does NOT include the
//       exchange fees; note XXXI adds a fee "equivalent to the exchange's
//       settlement fee". The Moscow Exchange tariff (below) is added once,
//       its clearing part being that note-XXXI fee. Note XXX: on the SPB
//       exchange a trade pays at least 1/100 of a currency unit a share.
//       Note XLI: the month costs 499 RUB less the month's commissions;
//       that floor is in the remark and stays out of the trip.
// Note VI: Alfa-Capital's exchange-traded funds (БПИФ УК «Альфа-Капитал»)
// pay no commission and no settlement fee on either plan.
//
// The Moscow Exchange equity tariff in force since 01.11.2022,
// https://www.moex.com/s1166 read on 2026-10-19: the T+ book uses the
// maker-taker model, taker 0.01725% (exchange) plus 0.01275% (NCC
// clearing) = 0.03%, at least 0.02 RUB a trade. A round trip that
// crosses the book is a taker on both sides. The SPB Exchange tariff was
// not read, so an SPB line on Альфа-Трейдинг has no levy figure; no SPB
// book is stored either.
//
// Left out: negotiated (РПС) and OTC deals, structured bonds and pre-IPO
// are other tickets. Custody is free on both plans.
//
//   node brokers/alfainvest/alfainvest_cost.mjs SBER MISX RUB --shares=10 --price=286
//   node brokers/alfainvest/alfainvest_cost.mjs SBER MISX RUB --shares=10 --price=286 --plan=trading
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("alfainvest-parsed.json", import.meta.url);
const PAGE = "https://alfabank.servicecdn.ru/site-upload/d0/16/2014/broker_tariffs_21102026.pdf";
const PLANS_PAGE = "https://alfabank.ru/make-money/investments/tariffs/";
const MOEX_PAGE = "https://www.moex.com/s1166";
const READ_ON = "2026-10-19";
const CASH = "RUB";
const DEPOSITS = new Set(["RUB", "USD", "EUR", "CNY", "HKD", "GBP", "CHF", "TRY", "BYN"]);

const INVESTOR_RATE = 0.003;
// Альфа-Трейдинг, first column (last month's turnover ≤ 4 million RUB),
// rows by average net assets, `upTo` inclusive.
const TRADING_BANDS = [
  { upTo: 200000, rate: 0.0004 },
  { upTo: 4000000, rate: 0.00035 },
  { upTo: 20000000, rate: 0.00025 },
  { upTo: 50000000, rate: 0.00021 },
  { upTo: Infinity, rate: 0.00018 },
];
const SPB_MIN_PER_SHARE = 0.01;
const MOEX_TRADING = 0.0001725;
const MOEX_CLEARING = 0.0001275;
const MOEX_MIN_TRADING = 0.01;
const MOEX_MIN_CLEARING = 0.01;

const PLANS = {
  // fx: item 16 of the tariff, buying or selling a currency, % of the
  // amount (16.7 Инвестор 1 %, 16.8 Альфа-Трейдинг 0.04 %). Rubles are a
  // deposit currency, so it is the remark for cash held in another one.
  investor: { id: "investor", name: "Инвестор", remark: "", fx: 0.01 },
  trading: { id: "trading", name: "Альфа-Трейдинг", remark: "Monthly minimum is RUB 499.", fx: 0.0004 },
};
const DEFAULT_PLAN = "investor";

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

// Alfa-Capital's exchange-traded funds: the catalogue types them ETF, and
// their names carry Alfa (Альфа) and their tickers start AK. AKRN (Acron)
// is a share.
export function isAlfaCapitalFund(row) {
  return code(row?.type) === "ETF" && (/Альфа/i.test(String(row?.name || "")) || /^AK/.test(code(row?.ticker)));
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
    return { ...answer, why: "le catalogue Alfa-Investments n'existe pas encore : lancer `node brokers/alfainvest/alfainvest_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Alfa-Investments` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Alfa-Investments`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "alfainvest",
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
  const ownFund = isAlfaCapitalFund(m.row);
  const trading = chosen.id === "trading";
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const basis = ownFund
    ? `tarifs Alfa-Banque (en vigueur le 21 octobre 2026) relus le ${READ_ON} : un БПИФ d'Alfa-Capital ne paie ni commission ni frais de règlement (note VI).` +
      (trading ? " Part bourse de la Bourse de Moscou en sus : 0,01725 %, au moins 0,01 RUB, chaque sens." : "")
    : trading
      ? `tarifs Alfa-Banque (en vigueur le 21 octobre 2026) relus le ${READ_ON}, plan Альфа-Трейдинг : 0,04 % jusqu'à 200 000 RUB d'actifs, ` +
        `0,035 % jusqu'à 4 millions, 0,025 % jusqu'à 20, 0,021 % jusqu'à 50, 0,018 % au-delà (colonne : chiffre du mois passé ≤ 4 millions). ` +
        (moex
          ? "Frais de la Bourse de Moscou en sus (note III) : preneur 0,01725 % + 0,01275 % (NCC) = 0,03 %, au moins 0,02 RUB, chaque sens."
          : "Frais de la bourse de Saint-Pétersbourg en sus, barème non relu ; au moins 0,01 RUB par titre (note XXX).")
      : `tarifs Alfa-Banque (en vigueur le 21 octobre 2026) relus le ${READ_ON}, plan Инвестор : 0,3 % de chaque opération, frais de bourse compris (note III).`;
  const shared = {
    ...answer,
    remark: [joinRemarks(m.row.remark, chosen.remark), fxRemark(100 * chosen.fx, listing.currency)].filter(Boolean).join("\n"),
    listing,
    basis,
    ...(trading && !ownFund
      ? {
          confidence:
            "taux Альфа-Трейдинг pris pour un client dont le chiffre du mois passé est ≤ 4 millions de RUB et dont l'actif moyen égale le montant de l'ordre ; " +
            "frais de règlement de la note XXXI lus comme la part NCC du tarif de la Bourse de Moscou",
        }
      : {}),
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!DEPOSITS.has(listing.currency)) {
    return { ...shared, why: `${listing.currency} n'est pas une devise de dépôt Alfa-Investments` };
  }
  if (listing.currency !== CASH) {
    return { ...shared, cashCurrency: listing.currency, why: `pas de barème lu pour une ligne en ${listing.currency}` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  let rate = 0;
  let side = 0;
  if (!ownFund) {
    rate = trading ? TRADING_BANDS.find((band) => notional <= band.upTo).rate : INVESTOR_RATE;
    side = notional * rate;
    if (trading && !moex) side = Math.max(side, SPB_MIN_PER_SHARE * n);
  }
  const brokerRub = side * 2;
  const brokerFees = dollars(brokerRub, CASH);
  // Exchange fees: inside the Инвестор rate; on top on Альфа-Трейдинг.
  let levyRub = 0;
  if (trading) {
    if (!moex) levyRub = null;
    else if (ownFund) levyRub = 2 * Math.max(notional * MOEX_TRADING, MOEX_MIN_TRADING);
    else
      levyRub =
        2 * (Math.max(notional * MOEX_TRADING, MOEX_MIN_TRADING) + Math.max(notional * MOEX_CLEARING, MOEX_MIN_CLEARING));
  }
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
    commission: { plan: chosen.name, rate, buy: side, sell: side, eachWay: true, currency: CASH, ownFund },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(plus(levies, taxUsd), 6),
      courtageRub: finite(brokerRub, 6),
      fraisBourseRub: finite(levyRub, 6),
    },
    sources: { fees: PAGE, plans: PLANS_PAGE, moex: MOEX_PAGE },
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
