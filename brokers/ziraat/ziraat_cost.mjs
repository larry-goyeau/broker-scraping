// What one round trip costs at Ziraat Yatırım: buy n shares at price p on
// Borsa İstanbul, sell them back at once, over the internet (ZBorsa, e-Şube,
// Ziraat Trader, ZPro), in dollars. Shares and the BIST exchange-traded
// funds (BYF) of the catalogue. VİOP, warrants and Ziraat FX are not this
// trip.
//
// "Komisyon ve Masraflar", read on 2026-10-23:
//
//   Commission     "İnternet üzerinden yapılan işlemlerde (İşlem Hacmi X
//                  Binde 1,50 + BSMV) ile başlar", then the "Günlük İnternet
//                  Skala Uygulaması": the rate is set by the day's internet
//                  volume, applied at day end ("müşterinin günlük işlem
//                  hacmine bakılarak, günlük skalaya göre"). New accounts are
//                  on this scale. Rate per side, in ten-thousandths:
//                        0 -     75,000 TL   15
//                   75,001 -    150,000 TL   12
//                  150,001 -    500,000 TL   10
//                  500,001 -  1,000,000 TL    8
//                1,000,001 -  2,000,000 TL    7
//                2,000,001 -  4,000,000 TL    6
//                4,000,001 -  5,500,000 TL    5
//                5,500,001 -  7,000,000 TL    4
//                7,000,001 - 11,000,000 TL    3
//               11,000,001 - 15,000,000 TL    2.5
//               15,000,001 - 25,000,000 TL    2
//               25,000,001 - 30,000,000 TL    1.5
//               30,000,001 TL +               1
//                  The buy and the immediate sale are one day, so the day's
//                  volume is both legs together.
//   Minimum        "İnternet üzerinden yapılan işlemlerde işlem başına
//                  minimum 0.90 TL + BSMV", each trade.
//   BSMV           added on the commission; the page prints no rate, 5 % is
//                  the statutory rate other BIST members print.
//   Levies         the page names no BIST or Takasbank pass-through on a
//                  trade, so the commission is taken as the whole charge.
//   Lower rate     "Kampanyalı hesaplarda; komisyon oranı sabit Binde 1 +
//                  BSMV": teachers, health staff, police, soldiers, public
//                  employees and pensioners paid by Ziraat Bankası. In the
//                  remark when it is under the scale rate.
//   Not this trip  no account fee ("Hesap İşletim ücreti uygulaması
//                  bulunmamaktadır"); MKK custody at its tariff; transfers.
//
// Cash is lira only (deposits.mjs), every line is lira: no conversion. No
// stamp or transaction tax applies to a BIST share; the tax map is still read.
// Book: Borsa İstanbul through spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://www.ziraatyatirim.com.tr/komisyon-ve-masraflar
//
//   node brokers/ziraat/ziraat_cost.mjs GARAN BIST TRY --shares=300 --price=140
//   node brokers/ziraat/ziraat_cost.mjs --schedule
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

const CATALOGUE = new URL("ziraat-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.ziraatyatirim.com.tr/komisyon-ve-masraflar",
  readOn: "2026-10-23",
  entity: "Ziraat Yatırım Menkul Değerler A.Ş.",
};

// The day's internet volume, TL, upper bound inclusive; rate per side.
const SCALE = [
  { upTo: 75_000, rate: 0.0015 },
  { upTo: 150_000, rate: 0.0012 },
  { upTo: 500_000, rate: 0.001 },
  { upTo: 1_000_000, rate: 0.0008 },
  { upTo: 2_000_000, rate: 0.0007 },
  { upTo: 4_000_000, rate: 0.0006 },
  { upTo: 5_500_000, rate: 0.0005 },
  { upTo: 7_000_000, rate: 0.0004 },
  { upTo: 11_000_000, rate: 0.0003 },
  { upTo: 15_000_000, rate: 0.00025 },
  { upTo: 25_000_000, rate: 0.0002 },
  { upTo: 30_000_000, rate: 0.00015 },
  { upTo: Infinity, rate: 0.0001 },
];
const MIN_TRADE = 0.9;
const CAMPAIGN = 0.001;
const BSMV = 0.05;
const CASH = "TRY";

export const scaleRate = (dayVolume) => SCALE.find((b) => dayVolume <= b.upTo).rate;

// Both legs in lira, before BSMV, at a given rate.
const legs = (notional, rate) => 2 * Math.max(MIN_TRADE, notional * rate);

// The campaign rate against the scale, buy and sell together with BSMV.
function remarkFor(notional) {
  if (!(notional > 0)) return "";
  const scale = legs(notional, scaleRate(2 * notional));
  const campaign = legs(notional, CAMPAIGN);
  const pct = Number((((scale - campaign) * (1 + BSMV)) / notional * 100).toFixed(2));
  return pct > 0 ? `Teachers, health staff, police, soldiers and public employees: fees might be ${pct}% lower.` : "";
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

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is Ziraat's commission
 * with its BSMV.
 */
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
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Ziraat n'existe pas encore : lancer `node brokers/ziraat/ziraat_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Ziraat Yatırım` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Ziraat Yatırım`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "ziraat",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || CASH,
    brokerExchange: m.row.exchange || null,
  };
  if (listing.currency !== CASH) {
    return { ...answer, listing, why: `${listing.currency} n'est pas une ligne du barème pay piyasası (lire seulement)` };
  }
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    basis:
      `barème Ziraat relu le ${SCHEDULE.readOn} : échelle Internet journalière de 0,15 % à 0,01 % par sens selon le volume du jour, ` +
      `minimum ${MIN_TRADE} TL par opération, BSMV 5 % en sus`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const dayVolume = 2 * notional;
  const rate = scaleRate(dayVolume);
  const commission = legs(notional, rate);
  const commissionUsd = dollars(commission * (1 + BSMV), CASH);
  const leviesUsd = 0;
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : plus(leviesUsd, notionalUsd * taxTotal);
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    shared.basis,
    `volume du jour ${dayVolume.toFixed(2)} TL (achat et vente) : ${(rate * 10000).toLocaleString("fr-FR")} pour dix mille par sens`,
    commission === 2 * MIN_TRADE ? `minimum de ${MIN_TRADE} TL atteint sur les deux sens` : "au-dessus du minimum par opération",
    "BSMV : Ziraat l'ajoute sans imprimer le taux, 5 % est le taux légal",
    "aucun frais BIST ou Takasbank refacturé n'est imprimé : la commission est prise comme tout le coût",
    "cash en lires : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} TRY la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    remark: remarkFor(notional),
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: { rate, dayVolume, minPerTrade: MIN_TRADE, currency: CASH, eachWay: true, bsmv: BSMV },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.ticker} sur ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

function calledDirectly() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (calledDirectly()) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, scale: SCALE, minPerTrade: MIN_TRADE, campaign: CAMPAIGN, bsmv: BSMV }, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/ziraat/ziraat_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}
