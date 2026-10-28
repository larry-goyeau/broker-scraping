// What one round trip costs at Jett (OOO "MULTIBROKER", jett.uz): buy n
// shares on the Republican Stock Exchange "Tashkent" (UZSE) in the Jett
// app and sell them straight back, in dollars. New accounts opened through
// Jett are held at the broker Finance Invest Brok. Every line is in sums
// and the account is topped up from a card in sums, so nothing is
// converted.
//
// https://jett.uz/ru/plans, read on 2026-10-26, three plans (Инвестор,
// Трейдер, Pro), each fee "покупка/продажа", so on each side:
//   "Комиссия биржи на приобретение листинговых акций (STK ...)  0,31%"
//   "Комиссия биржи на торговлю акциями вне листинга (SMS ...)  0,41%"
//   "Комиссия депозитария ... листинговых акций (STK ...)  0,05%"
//   "Комиссия депозитария ... акциями вне листинга (SMS ...)  0,07%"
//   "Комиссия брокера ... листинговых акций (STK ...)  0.63% | 1% | 1%"
//   "Комиссия брокера ... акциями вне листинга (SMS ...)  0.51% | 1% | 1%"
//   "Гербовый сбор от суммы сделок при продаже (приравнен к налогам) 0,01%"
// Трейдер and Pro print the same fees, so they are one row ("trader").
//
//   Инвестор       STK 0.31 + 0.05 + 0.63 = 0.99 % each side
//                  SMS 0.41 + 0.07 + 0.51 = 0.99 % each side
//   Трейдер / Pro  STK 0.31 + 0.05 + 1.00 = 1.36 % each side
//                  SMS 0.41 + 0.07 + 1.00 = 1.48 % each side
//   Sell side      + 0.01 % state fee on a quotation-list (STK) line,
//                  + 0.30 % instead on an off-exchange (SMS, ВТП) line.
//
// The state fee is the seller's levy of law ЗРУ-1057 of 17.04.2025:
// "сделки на биржевых торгах по эмиссионным ценным бумагам – 0,01%",
// "сделки на организованных внебиржевых торгах ценными бумагами – 0,3%"
// (https://buxgalter.uz/ru/publish/doc/text207766_chto_izmenilos_v_nalogooblojenii_sdelok_s_cennymi_bumagami),
// also printed in Freedom Broker Uzbekistan's tariff (notes *** and ****).
// Jett's table prints the 0.01 % only; the off-exchange line takes the
// law's 0.3 %.
//
// The catalogue (../freedomuzbekista/uzseBook.mjs) ends the raw text of
// every off-exchange line with "off-exchange board (ВТП)". Left out: the
// 12,000 sum online account opening (https://jett.uz/ru/, FAQ), bonds. No
// minimum and no plan subscription are printed. Capital gain is nil on a
// same-price round trip (and untaxed for individuals, FAQ). UZSE has no
// book in spreads/ and fx.mjs has no UZS rate, so the total stays unknown
// until both exist; the sums in UZS are in parts.
//
//   node brokers/jett/jett_cost.mjs HMKB XSTE UZS --shares=150000 --price=85 --plan=trader
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

const BROKER = "Jett";
const FOLDER = "jett";
const CATALOGUE = new URL("jett-parsed.json", import.meta.url);
const PAGE = "https://jett.uz/ru/plans";
const FAQ = "https://jett.uz/ru/";
const LAW = "https://buxgalter.uz/ru/publish/doc/text207766_chto_izmenilos_v_nalogooblojenii_sdelok_s_cennymi_bumagami";
const READ_ON = "2026-10-26";
const CASH = "UZS";

// Exchange and depository, the same for every plan.
export const VENUE_FEES = Object.freeze({
  stk: Object.freeze({ exchange: 0.0031, depository: 0.0005 }),
  sms: Object.freeze({ exchange: 0.0041, depository: 0.0007 }),
});
export const SELL_FEE = Object.freeze({ stk: 0.0001, sms: 0.003 });

export const PLANS = Object.freeze({
  investor: Object.freeze({
    id: "investor",
    name: "Инвестор",
    broker: Object.freeze({ stk: 0.0063, sms: 0.0051 }),
    remark: "",
  }),
  trader: Object.freeze({
    id: "trader",
    name: "Трейдер / Pro",
    broker: Object.freeze({ stk: 0.01, sms: 0.01 }),
    remark: "",
  }),
});
const DEFAULT_PLAN = "investor";
const PLAN_ALIAS = { инвестор: "investor", трейдер: "trader", pro: "trader", traderpro: "trader" };

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "").trim().toLowerCase().replace(/[^a-z0-9а-я]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const frPct = (rate) => `${String(Math.round(rate * 100 * 100000) / 100000).replace(".", ",")} %`;

// uzseBook.mjs ends the raw text of every off-exchange line with this.
export function isOtc(row) {
  return /off-exchange board \(ВТП\)\s*$/.test(String(row?.raw || ""));
}

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place, currency }).venue : null;
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

const basisOf = (plan) =>
  `page « Комиссии » de Jett relue le ${READ_ON}, tarif ${plan.name} : bourse, dépositaire et courtier Finance Invest Brok ` +
  `à chaque achat et vente — cote (STK) ${frPct(VENUE_FEES.stk.exchange)} + ${frPct(VENUE_FEES.stk.depository)} + ${frPct(plan.broker.stk)}, ` +
  `hors cote (SMS) ${frPct(VENUE_FEES.sms.exchange)} + ${frPct(VENUE_FEES.sms.depository)} + ${frPct(plan.broker.sms)}`;

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const chosen = planOf(plan || DEFAULT_PLAN) || PLANS[DEFAULT_PLAN];
  const basis = basisOf(chosen);
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
    return { ...answer, why: `le catalogue ${BROKER} n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${BROKER}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${BROKER}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const board = isOtc(m.row) ? "sms" : "stk";
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: FOLDER,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? m.row.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || CASH,
    brokerExchange: m.row.exchange || null,
    board: board === "sms" ? "SMS (ВТП)" : "STK",
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const taxMapTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    remark: [answer.remark, m.row.remark].filter(Boolean).join(" "),
    listing,
    basis,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `${BROKER} ne publie un barème que pour Tachkent en sums ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const venue = VENUE_FEES[board];
  const sideRate = venue.exchange + venue.depository + chosen.broker[board];
  const perOrder = notional * sideRate;
  const brokerUzs = notional * chosen.broker[board] * 2;
  const exchangeUzs = notional * venue.exchange * 2;
  const depositoryUzs = notional * venue.depository * 2;
  const commissionUzs = perOrder * 2;
  const sellRate = SELL_FEE[board];
  const stateFeeUzs = notional * sellRate;
  const taxMapUzs = notional * taxMapTotal;
  const brokerFees = dollars(commissionUzs, listing.currency);
  const taxUsd = dollars(stateFeeUzs + taxMapUzs, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const why =
    usd != null
      ? null
      : notionalUsd == null
        ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
        : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;
  const confidence = [
    basis,
    `ligne ${board === "sms" ? "hors cote (SMS, ВТП)" : "de la cote (STK)"} : ${frPct(sideRate)} chaque sens, aucun minimum publié`,
    board === "sms"
      ? `redevance d'État de ${frPct(SELL_FEE.sms)} à la vente (loi ЗРУ-1057, marché hors cote organisé) ; la page Jett n'imprime que 0,01 %`
      : `redevance d'État de ${frPct(SELL_FEE.stk)} à la vente (« Гербовый сбор », loi ЗРУ-1057)`,
    "Трейдер et Pro impriment les mêmes frais : une seule ligne ; aucun abonnement publié",
    "ouverture du compte en ligne 12 000 UZS hors aller-retour",
    "ligne UZS, compte en sums : aucun change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} UZS par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: {
      plan: chosen.name,
      buy: finite(perOrder, 8),
      sell: finite(perOrder, 8),
      rate: Number(sideRate.toPrecision(6)),
      broker: chosen.broker[board],
      exchange: venue.exchange,
      depository: venue.depository,
      minimum: 0,
      sellFee: sellRate,
      currency: listing.currency,
      eachWay: true,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
      courtageUzs: finite(commissionUzs, 6),
      courtierUzs: finite(brokerUzs, 6),
      bourseUzs: finite(exchangeUzs, 6),
      depositaireUzs: finite(depositoryUzs, 6),
      taxesUzs: finite(stateFeeUzs + taxMapUzs, 6),
      redevanceEtatUzs: finite(stateFeeUzs, 6),
    },
    sources: { fees: PAGE, faq: FAQ, stateFee: LAW },
    confidence,
  };
}

export function printCli(callerUrl, fn) {
  let called = false;
  try {
    called = callerUrl === pathToFileURL(process.argv[1]).href;
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
      fn({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")), plan: arg("plan", null) }),
      null,
      2,
    ),
  );
}

printCli(import.meta.url, roundTrip);
