// What one round trip costs at GCM Yatırım: buy n shares at price p on Borsa
// İstanbul, sell them back at once, in GCM Borsa Trader (web and mobile), in
// dollars. Shares and the BIST exchange-traded funds (BYF) of the catalogue.
// VİOP, the forex and CFD side of GCM, and the phone desk are not this trip.
//
// "Borsa İşlem Koşulları", read on 2026-10-18 (table titled "2025 ÜCRET ve
// MASRAF TARİFESİ"; the account fee is stated for 2026). The page prints one
// pay piyasası table and no separate rate for web, mobile or another channel.
//
//   Commission     by the month's trading volume, each way:
//                    0 - 2,500,000 TL            0.0009   (on binde 9)
//                    2,500,001 - 5,000,000 TL    0.0008
//                    5,000,001 - 7,500,000 TL    0.0007
//                    7,500,001 - 10,000,000 TL   0.0006
//                    10,000,001 TL +             0.0005
//                  "Komisyon oranlarına Borsa Payı dâhildir": the BIST
//                  exchange share is inside the rate. One trip is the first
//                  band; the lower bands stay in the remark, as a cut of
//                  the 0.0009 rate (0.0008: 11% lower, 0.0005: 44%).
//   Minimum        5 TL. The "Ücret ve Komisyonlar" page says a day's total
//                  commission under 5 TL is charged as 5 TL. The buy and the
//                  immediate sale are one day, so the floor bites on the sum
//                  of the two legs.
//   BSMV           "Komisyon oranlarına BSMV eklenmektedir": the banking and
//                  insurance transactions tax is added on the commission.
//                  GCM prints no rate; 5 % is the statutory rate another BIST
//                  member prints on the same line (Ak Yatırım's table, "%5
//                  (yüzde beş) oranında BSMV ... dahil değildir").
//   Takasbank      "Ücret ve Komisyonlar" (rates excluding BSMV, in force
//                  from February 2025): pay senedi işlemleri, Borsa payı
//                  0.000025, Takas payı 0.000004, both "aynı oranda
//                  yansıtılır". The Borsa payı is inside the commission (see
//                  above); the Takas payı is passed on top, each way, with
//                  BSMV on it.
//   Not this trip  hesap işletim ücreti 120 TL a month in 2026, MKK /
//                  Takasbank custody at their tariff, EFT and FX transfers,
//                  data feeds, the 15 % commission on the overnight sweep.
//
// Cash is lira only (deposits.mjs), every line is lira: no conversion. No
// stamp or transaction tax applies to a BIST share; the tax map is still read.
// Book: Borsa İstanbul through spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://www.gcmyatirim.com.tr/borsa/borsa-islem-kosullari
//   https://www.gcmyatirim.com.tr/sirket-profili/yasal-bildirimler/ucret-ve-komisyonlar
//   https://www.akyatirim.com.tr/media/la4piffm/aylik-kademeli-komisyon-oranlari.pdf
//
//   node brokers/gcm/gcm_cost.mjs GARAN BIST TRY --shares=100 --price=130
//   node brokers/gcm/gcm_cost.mjs THYAO BIST TRY --shares=10 --price=300
//   node brokers/gcm/gcm_cost.mjs --schedule
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

const CATALOGUE = new URL("gcm-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.gcmyatirim.com.tr/borsa/borsa-islem-kosullari",
  fees: "https://www.gcmyatirim.com.tr/sirket-profili/yasal-bildirimler/ucret-ve-komisyonlar",
  bsmvSource: "https://www.akyatirim.com.tr/media/la4piffm/aylik-kademeli-komisyon-oranlari.pdf",
  readOn: "2026-10-18",
  entity: "GCM Yatırım Menkul Değerler A.Ş.",
};

// Monthly volume bands, TL, upper bound inclusive. The trip is the first.
const BANDS = [
  { upTo: 2_500_000, rate: 0.0009 },
  { upTo: 5_000_000, rate: 0.0008 },
  { upTo: 7_500_000, rate: 0.0007 },
  { upTo: 10_000_000, rate: 0.0006 },
  { upTo: Infinity, rate: 0.0005 },
];
const RATE = BANDS[0].rate;
// How far a lower band is under the first one, as a cut of its rate in
// percent: whole when 10 or more, one decimal below.
const lower = (rate) => {
  const x = (100 * (RATE - rate)) / RATE;
  return x >= 10 ? Math.round(x) : Math.round(x * 10) / 10;
};
const DAILY_MIN = 5;
const BSMV = 0.05;
const TAKAS = 0.000004;
const ACCOUNT_FEE_MONTHLY = 120;
const CASH = "TRY";

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

// Both legs in lira, the day's floor on their sum.
export function commissionTry(notional) {
  return Math.max(DAILY_MIN, notional * RATE * 2);
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is GCM's commission.
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
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue GCM n'existe pas encore : lancer `node brokers/gcm/gcm_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue GCM Yatırım` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez GCM Yatırım`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "gcm",
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
    return { ...answer, listing, why: `${listing.currency} n'est pas une ligne du barème pay piyasası (lira seulement)` };
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
    remark:
      `If the month's volume >${BANDS[0].upTo / 1e6}M TL commission is ${lower(BANDS[1].rate)}% lower, ` +
      `if >${BANDS[3].upTo / 1e6}M TL ${lower(BANDS[4].rate)}% lower. ` +
      `Account fee ${ACCOUNT_FEE_MONTHLY} TL a month in 2026.`,
    url: SCHEDULE.url,
    basis: `barème GCM relu le ${SCHEDULE.readOn} : 0,09 % par sens (borsa payı inclus), minimum ${DAILY_MIN} TL par jour, BSMV 5 % en sus, takas payı 0,0004 %`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const commission = commissionTry(notional);
  const takas = notional * TAKAS * 2;
  const bsmv = (commission + takas) * BSMV;
  const commissionUsd = dollars(commission, CASH);
  const leviesUsd = dollars(takas + bsmv, CASH);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : plus(leviesUsd, notionalUsd * taxTotal);
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    shared.basis,
    commission === DAILY_MIN ? `plancher journalier de ${DAILY_MIN} TL atteint sur les deux sens` : "au-dessus du plancher journalier",
    "premier palier de volume mensuel (0 à 2 500 000 TL)",
    "BSMV : GCM l'ajoute sans imprimer le taux, 5 % est le taux légal imprimé par Ak Yatırım",
    "cash en lires : pas de change",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} TRY la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    commission: { rate: RATE, dailyMin: DAILY_MIN, currency: CASH, eachWay: true, bsmv: BSMV, takas: TAKAS },
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
    console.log(JSON.stringify({ ...SCHEDULE, bands: BANDS, dailyMin: DAILY_MIN, bsmv: BSMV, takas: TAKAS, accountFeeMonthly: ACCOUNT_FEE_MONTHLY }, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/gcm/gcm_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
  }
  console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  for (const [name, value] of Object.entries(out.parts || {})) {
    if (value != null) console.log(`  ${name.padEnd(15)}: ${value} $`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
