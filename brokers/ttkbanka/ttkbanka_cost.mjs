// What one round trip costs at TTK Banka AD Skopje: buy n Skopje shares at
// price p and sell them back, in dollars, ordered online through eTrader.
// Its only place is the Macedonian Stock Exchange (denar lines).
//
// Read on 2026-10-26.
//   https://www.ttk.com.mk/cms/Upload/Tarifa/Hartii%20od%20vrednost/TАРИФА%20ЗА%20НАДОМЕСТОЦИ%20НА%20УСЛУГИ%20ОД%20ОБЛАСТА%20НА%20РАБОТА%20СО%20ХАРТИИ%20ОД%20ВРЕДНОСТ.pdf
//     1. "Купување и продавање акции ... согласно остварен претходен
//     кумулативен промет": "до 3.000.000 ден. 0,80% мин. 250 ден.", then
//     0.60% over MKD 3m, 0.55% over 7m ... 0.30% over 150m of past
//     turnover. A client without past turnover takes the first line, each
//     buy and each sell. Several trades of one client in one issuer on one
//     day are summed for the minimum.
//     Note: "Покрај наплатата на провизиите ... се наплаќа и Берзанска
//     провизија и ЦДХВ провизија" (the exchange and depository fees are
//     charged on top), so both are added, from their own tariffs:
//   Macedonian Stock Exchange, Tarifnik (consolidated, December 2025), 3.
//   "Надоместоци за тргување со акции": 0.2% of the transaction up to MKD
//   5m, 0.1% above, computed cumulatively; MKD 50 a transaction up to MKD
//   10,000, at least MKD 100 above, "и за купување и за продавање" (each
//   side). No VAT is printed on it.
//     https://www.mse.mk/Repository/Novi%20Pravila%202024/Precisten%20tekst%20na%20%D0%A2arifnik%202025%20po%20soglasnost%20od%20KHV.pdf
//   Central Securities Depository (ЦДХВ), Tarifa in force from 2026-06-16,
//   3.1 settlement of exchange trades (DVP): "0,1% од вредноста на
//   трансакцијата, но не помалку од 100 МКД", "од продажна и од куповна
//   страна" (each side); the same figure in its VAT-inclusive edition.
//     https://cdhv.mk/ControlPanel/Upload/Пречистен%20текст%20Тарифа%20со%20примена%20од%2016.06.2026.pdf
//
//   10. eTrader, the online order channel: Ниво 1 MKD 236 a month with VAT
//   (2,549 a year), Ниво 2 MKD 826 a month. A subscription, not a per-trade
//   fee, so it is in the remark, not the number.
//
// In the total: the book, 0.80% (min. MKD 250) each side, the exchange fee
// and the depository fee each side. No transaction tax in taxMap.mjs.
// Left out: the past-turnover tiers (in the remark, the next one as a cut
// of the 0.80%: 25% lower), institutional and
// block-trade lines, the eTrader subscription (remark), report fees.
//
// Cash: a buy is paid in denars, the only currency the exchange settles,
// so a Skopje line takes no FX in the number. Paying from a euro account
// is the bank's rate list: devizen pazar EUR 61.40 / 61.80 on list
// 2026-10-26 08:50 (https://www.ttk.com.mk/Web/Курсна_листа.aspx), half
// the gap over the mid is 0.33%, the remark.
//
// fx.mjs has no MKD rate yet and spreads/ no Skopje book, so the dollar
// total stays unknown until both exist; the denar figures are in the answer.
//
//   node brokers/ttkbanka/ttkbanka_cost.mjs ALK XMAE MKD --shares=2 --price=22300
//   node brokers/ttkbanka/ttkbanka_cost.mjs KMB XMAE MKD --shares=2 --price=24200
//   node brokers/ttkbanka/ttkbanka_cost.mjs MPT XMAE MKD --shares=1 --price=105500
//   node brokers/ttkbanka/ttkbanka_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const FOLDER = "ttkbanka";
const NAME = "TTK Banka";
const CATALOGUE = new URL("ttkbanka-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.ttk.com.mk/cms/Upload/Tarifa/Hartii%20od%20vrednost/T%D0%90%D0%A0%D0%98%D0%A4%D0%90%20%D0%97%D0%90%20%D0%9D%D0%90%D0%94%D0%9E%D0%9C%D0%95%D0%A1%D0%A2%D0%9E%D0%A6%D0%98%20%D0%9D%D0%90%20%D0%A3%D0%A1%D0%9B%D0%A3%D0%93%D0%98%20%D0%9E%D0%94%20%D0%9E%D0%91%D0%9B%D0%90%D0%A1%D0%A2%D0%90%20%D0%9D%D0%90%20%D0%A0%D0%90%D0%91%D0%9E%D0%A2%D0%90%20%D0%A1%D0%9E%20%D0%A5%D0%90%D0%A0%D0%A2%D0%98%D0%98%20%D0%9E%D0%94%20%D0%92%D0%A0%D0%95%D0%94%D0%9D%D0%9E%D0%A1%D0%A2.pdf",
  page: "https://www.ttk.com.mk/Web/ФИЗИЧКИ_ЛИЦА/Хартии_од_вредност/Електронско_тргување_со_хартии_од_вредност.aspx",
  readOn: "2026-10-26",
  exchangeTariff: "https://www.mse.mk/Repository/Novi%20Pravila%202024/Precisten%20tekst%20na%20%D0%A2arifnik%202025%20po%20soglasnost%20od%20KHV.pdf",
  depositoryTariff: "https://cdhv.mk/ControlPanel/Upload/%D0%9F%D1%80%D0%B5%D1%87%D0%B8%D1%81%D1%82%D0%B5%D0%BD%20%D1%82%D0%B5%D0%BA%D1%81%D1%82%20%D0%A2%D0%B0%D1%80%D0%B8%D1%84%D0%B0%20%D1%81%D0%BE%20%D0%BF%D1%80%D0%B8%D0%BC%D0%B5%D0%BD%D0%B0%20%D0%BE%D0%B4%2016.06.2026.pdf",
};

// Bank side, first line of the past-turnover scale, each side.
const RATE = 0.008;
const MIN_MKD = 250;
const NEXT_TIER = { rate: 0.006, overMkd: 3_000_000 };
// Macedonian Stock Exchange, each side.
const MSE = { rate: 0.002, upToMkd: 5_000_000, rateAbove: 0.001, smallMkd: 10_000, smallFeeMkd: 50, minMkd: 100 };
// ЦДХВ settlement, each side.
const CSD = { rate: 0.001, minMkd: 100 };
const ETRADER_MONTH_MKD = 236;
// Devizen pazar, EUR buy / sell in denars, list 2026-10-26 08:50.
const KURS = [61.4, 61.8];
const half = ([buy, sell]) => (((sell - buy) / (sell + buy)) * 100).toFixed(3);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const SKOPJE = new Set(["XMAE", "MSE", "MKSE", "MACEDONIANSTOCKEXCHANGE", "SKOPJE"]);

export function mseFee(value) {
  if (value <= MSE.smallMkd) return MSE.smallFeeMkd;
  const fee = Math.min(value, MSE.upToMkd) * MSE.rate + Math.max(value - MSE.upToMkd, 0) * MSE.rateAbove;
  return Math.max(fee, MSE.minMkd);
}
export const csdFee = (value) => Math.max(value * CSD.rate, CSD.minMkd);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || SKOPJE.has(wantPlace) || loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace)
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
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: `le catalogue ${NAME} n'existe pas encore : lancer \`node brokers/${FOLDER}/${FOLDER}_scraping.mjs\`` };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${NAME}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${NAME}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
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
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const leaf = book.leaf;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const marketBp = bp ?? (marketPerShare != null ? null : leaf?.bp ?? null);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const tierCut = Math.round((100 * (RATE - NEXT_TIER.rate)) / RATE);
  const shared = {
    ...answer,
    listing,
    remark:
      `${fxRemark(half(KURS), listing.currency)} eTrader costs MKD ${ETRADER_MONTH_MKD} a month. ` +
      `Over MKD 3 million past turnover: fees are ${tierCut}% lower.`,
    cashCurrency: listing.currency,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `tarif titres TTK Banka relu le ${SCHEDULE.readOn} : actions 0,80 % (min. 250 MKD) par sens sans chiffre d'affaires passé, ` +
      `plus la commission de la Bourse de Macédoine (0,2 % jusqu'à 5 M MKD, 0,1 % au-delà, min. 100 MKD, 50 MKD jusqu'à 10 000 MKD) ` +
      `et le règlement ЦДХВ (0,1 %, min. 100 MKD), chacune par sens ; ordre en ligne par eTrader`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const bankSide = Math.max(notional * RATE, MIN_MKD);
  const floorBites = notional * RATE < MIN_MKD;
  const leviesSide = mseFee(notional) + csdFee(notional);
  const commissionMkd = bankSide * 2;
  const leviesMkd = leviesSide * 2;
  const brokerFees = dollars(commissionMkd, listing.currency);
  const bourse = dollars(leviesMkd, listing.currency);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, bourse, taxUsd);
  const why = [
    notionalUsd == null ? `fx.mjs n'a pas de cours ${listing.currency}` : null,
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean);
  const confidence = [
    shared.basis,
    floorBites
      ? `le minimum de ${MIN_MKD} MKD mord (${(notional * RATE).toFixed(2)} MKD calculés)`
      : `côté banque ${bankSide.toFixed(2)} MKD par sens`,
    `Bourse ${mseFee(notional).toFixed(2)} MKD et ЦДХВ ${csdFee(notional).toFixed(2)} MKD par sens`,
    `frais aller-retour hors carnet ${(commissionMkd + leviesMkd).toFixed(2)} MKD`,
    taxTotal ? `taxe ${(taxTotal * 100).toFixed(2)} % depuis taxMap.mjs` : "aucune taxe de transaction dans taxMap.mjs",
    "ligne en denars, seule devise de règlement : pas de change ; demi-écart de la liste de cours de la banque en remarque",
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why.length ? { why: why.join(" ; ") } : {}),
    commission: {
      rate: RATE,
      min: MIN_MKD,
      eachWay: true,
      currency: "MKD",
      thirdParty: { exchange: MSE, csd: CSD },
    },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    mkd: {
      courtage: Number(commissionMkd.toFixed(2)),
      bourse: Number(leviesMkd.toFixed(2)),
      total: Number((commissionMkd + leviesMkd).toFixed(2)),
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      bourse: finite(bourse, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
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
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, minMkd: MIN_MKD, nextTier: NEXT_TIER, mse: MSE, csd: CSD, etraderMonthMkd: ETRADER_MONTH_MKD, kurs: KURS }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error(`usage : node brokers/${FOLDER}/${FOLDER}_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]`);
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}

printCli();
