// What one round trip costs at Stopanska banka AD Skopje (SB Broker, NBG
// group): buy n Skopje shares at price p and sell them back, in dollars,
// ordered online through E-TRADER. Its only place here is the Macedonian
// Stock Exchange (denar lines).
//
// Read on 2026-10-26.
//   https://www.stb.com.mk/media/lg5ldbyj/tarifa_broker_mak_01-02-2024.pdf
//     1. "Тргување со акции преку Македонската берза, во име и за сметка
//     на правни и физички лица", charged on the amount traded in one
//     trading day: "до 500.000 денари 1,015%", "минимална брокерска
//     провизија 500 МКД"; 0.815% from 500,001 to 2,000,000; 0.615% to
//     5,000,000; 0.515% to 10,000,000; 0.40% above. The band's rate is
//     read on the whole amount, each buy and each sell.
//     Note: "Банката ќе пресмета и наплати стварни трошоци за домашна берза
//     и домашен депозитар" (actual exchange and depository costs on top),
//     so both are added, from their own tariffs:
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
//   E-TRADER (https://www.stb.com.mk/finansiski-pazari/brokerski-uslugi/,
//   "Можност за доставување на електронски налози за тргување преку
//   E-TRADER") has no fee of its own on the tariff.
//
// In the total: the book, the band rate (min. MKD 500) each side, the
// exchange fee and the depository fee each side. No transaction tax in
// taxMap.mjs.
// Left out: 4. the 20% staff discount, 2. administrator block trades,
// 9. custody services (0.20% a year, min. EUR 25 a month: the bank's
// custodian accounts, not the client's own depository account a broker
// trade settles to), foreign markets (10., not a place of this broker
// here), and discretionary reductions by the bank's ALCO.
//
// Cash: a buy is paid in denars, the only currency the exchange settles
// (the broker page: funds go to the buyer's account or to the bank's denar
// account at the National Bank), so a Skopje line takes no FX in the
// number. Paying from a euro account is the bank's rate list: devizen EUR
// 61.30 / 61.80 on list 198/3 of 2026-10-26
// (https://www.stb.com.mk/finansiski-pazari/kursna-lista/), half the gap
// over the mid is 0.41%, the remark.
//
// fx.mjs has no MKD rate yet and spreads/ no Skopje book, so the dollar
// total stays unknown until both exist; the denar figures are in the answer.
//
//   node brokers/stopanskabanka/stopanskabanka_cost.mjs ALK XMAE MKD --shares=2 --price=22300
//   node brokers/stopanskabanka/stopanskabanka_cost.mjs KMB XMAE MKD --shares=2 --price=24200
//   node brokers/stopanskabanka/stopanskabanka_cost.mjs MPT XMAE MKD --shares=1 --price=105500
//   node brokers/stopanskabanka/stopanskabanka_cost.mjs --schedule
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

const FOLDER = "stopanskabanka";
const NAME = "Stopanska banka";
const CATALOGUE = new URL("stopanskabanka-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.stb.com.mk/media/lg5ldbyj/tarifa_broker_mak_01-02-2024.pdf",
  page: "https://www.stb.com.mk/finansiski-pazari/brokerski-uslugi/",
  readOn: "2026-10-26",
  inForce: "2024-02-01",
  exchangeTariff: "https://www.mse.mk/Repository/Novi%20Pravila%202024/Precisten%20tekst%20na%20%D0%A2arifnik%202025%20po%20soglasnost%20od%20KHV.pdf",
  depositoryTariff: "https://cdhv.mk/ControlPanel/Upload/%D0%9F%D1%80%D0%B5%D1%87%D0%B8%D1%81%D1%82%D0%B5%D0%BD%20%D1%82%D0%B5%D0%BA%D1%81%D1%82%20%D0%A2%D0%B0%D1%80%D0%B8%D1%84%D0%B0%20%D1%81%D0%BE%20%D0%BF%D1%80%D0%B8%D0%BC%D0%B5%D0%BD%D0%B0%20%D0%BE%D0%B4%2016.06.2026.pdf",
};

// Bank side, by the amount traded in the day, each side. Upper bound of each band in MKD.
const BANDS = [
  { upToMkd: 500_000, rate: 0.01015 },
  { upToMkd: 2_000_000, rate: 0.00815 },
  { upToMkd: 5_000_000, rate: 0.00615 },
  { upToMkd: 10_000_000, rate: 0.00515 },
  { upToMkd: Infinity, rate: 0.004 },
];
const MIN_MKD = 500;
const bandOf = (value) => BANDS.find((band) => value <= band.upToMkd);
// Macedonian Stock Exchange, each side.
const MSE = { rate: 0.002, upToMkd: 5_000_000, rateAbove: 0.001, smallMkd: 10_000, smallFeeMkd: 50, minMkd: 100 };
// ЦДХВ settlement, each side.
const CSD = { rate: 0.001, minMkd: 100 };
// Devizen, EUR buy / sell in denars, list 198/3 of 2026-10-26.
const KURS = [61.3, 61.8];
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
  // The second band's cut of the commission itself: 1.015% → 0.815%.
  const tierCut = Math.round((100 * (BANDS[0].rate - BANDS[1].rate)) / BANDS[0].rate);
  const shared = {
    ...answer,
    listing,
    remark:
      `${fxRemark(half(KURS), listing.currency)} Over MKD 500,000 traded in a day: fees are ${tierCut}% lower.`,
    cashCurrency: listing.currency,
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `tarif SB Broker du ${SCHEDULE.inForce}, relu le ${SCHEDULE.readOn} : actions 1,015 % jusqu'à 500 000 MKD par jour (min. 500 MKD), ` +
      `0,815 % jusqu'à 2 M, 0,615 % jusqu'à 5 M, 0,515 % jusqu'à 10 M, 0,40 % au-delà, par sens, ` +
      `plus la commission de la Bourse de Macédoine (0,2 % jusqu'à 5 M MKD, 0,1 % au-delà, min. 100 MKD, 50 MKD jusqu'à 10 000 MKD) ` +
      `et le règlement ЦДХВ (0,1 %, min. 100 MKD), chacune par sens ; ordre en ligne par E-TRADER`,
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
  const band = bandOf(notional);
  const bankSide = Math.max(notional * band.rate, MIN_MKD);
  const floorBites = notional * band.rate < MIN_MKD;
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
      ? `le minimum de ${MIN_MKD} MKD mord (${(notional * band.rate).toFixed(2)} MKD calculés)`
      : `côté banque ${(band.rate * 100).toFixed(3)} %, ${bankSide.toFixed(2)} MKD par sens`,
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
      rate: band.rate,
      bands: BANDS.map((b) => ({ upToMkd: Number.isFinite(b.upToMkd) ? b.upToMkd : null, rate: b.rate })),
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
    console.log(JSON.stringify({ ...SCHEDULE, bands: BANDS, minMkd: MIN_MKD, mse: MSE, csd: CSD, kurs: KURS }, null, 2));
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
