// What one round trip costs at Ahlatcı Yatırım: buy n shares at price p on
// Borsa İstanbul, sell them back at once, through e-Şube or the mobile app,
// in dollars. Shares and the BIST exchange-traded funds (BYF) of the
// catalogue. VİOP, bonds and the Forex (CFD) desk are not this trip.
//
// "Masraf Komisyon Tarifesi" on the "Bilmeniz Gerekenler" page, read on
// 2026-10-23:
//
//   Commission     "Pay Senedi Komisyon Oranları: Binde 1 - OnBinde 1 işlem
//                  hacmine göre değişkendir": 0.1 % down to 0.01 % by
//                  trading volume, each way. The volume bands are not
//                  printed, so one trip pays the top rate, binde 1; the
//                  lowest rate stays in the remark. No minimum is printed.
//   BSMV           not printed on the commission line (the same table adds
//                  "+ BSMV" to its EFT line). 5 % is the statutory rate on a
//                  brokerage commission, the rate the other BIST members
//                  print (Ak Yatırım, Slayz "%5 oranında BSMV").
//   Levies         "Belirtilmemiş diğer masraf ve komisyonlar için Takasbank,
//                  MKK ve Borsa İstanbul AŞ'nin kurumumuza uyguladığı
//                  masraflar ilgilisinden tahsil edilir": the exchange and
//                  clearing fees are passed on at their tariffs. Each side:
//                    BIST borsa payı   0.25 bps of the amount, shares and
//                                      BYF alike
//                    Takasbank         4 per million on shares, 1 per
//                                      million on BYF
//                  (the current tariffs, as read for slayz_cost.mjs), with
//                  BSMV on them.
//   Not this trip  monthly account fee on custody balances of 1,000 TL or
//                  more (no amount printed), MKK custody (0.0065 % a year),
//                  EFT and transfer fees, short-selling lending fee.
//
// Cash is lira only (deposits.mjs), every line is lira: no conversion. No
// stamp or transaction tax applies to a BIST share; the tax map is still read.
// Book: Borsa İstanbul through spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://www.ahlatciyatirim.com.tr/hakkimizda/bilmeniz-gerekenler
//   https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf
//   https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf
//
//   node brokers/ahlatci/ahlatci_cost.mjs GARAN BIST TRY --shares=300 --price=140
//   node brokers/ahlatci/ahlatci_cost.mjs --schedule
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

const CATALOGUE = new URL("ahlatci-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.ahlatciyatirim.com.tr/hakkimizda/bilmeniz-gerekenler",
  borsaPayi: "https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf",
  takas: "https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf",
  readOn: "2026-10-23",
  entity: "Ahlatcı Yatırım Menkul Değerler A.Ş.",
};

const RATE = 0.001;
const LOWEST = 0.0001;
const BSMV = 0.05;
const BORSA_PAYI = 0.000025;
const TAKAS = { STOCK: 0.000004, ETF: 0.000001 };
const CASH = "TRY";

// Buy and sell together, with BSMV, in percent.
const LOWER_PCT = Number(((RATE - LOWEST) * 2 * (1 + BSMV) * 100).toFixed(2));
const REMARK = `Fees might be ${LOWER_PCT}% lower.`;

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
 * `usd` is the number the page prints. `brokerFees` is Ahlatcı's commission
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
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Ahlatcı n'existe pas encore : lancer `node brokers/ahlatci/ahlatci_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Ahlatcı Yatırım` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Ahlatcı Yatırım`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "ahlatci",
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
  const etfLine = listing.type === "ETF";
  const takas = etfLine ? TAKAS.ETF : TAKAS.STOCK;
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
      `barème Ahlatcı relu le ${SCHEDULE.readOn} : binde 1 (0,1 %) par sens, taux le plus haut de la fourchette « Binde 1 - OnBinde 1 » ` +
      `selon le volume, sans minimum imprimé ; BSMV 5 % ; borsa payı BIST 0,25 bps et takas payı Takasbank ${etfLine ? "1" : "4"} par million chaque sens, refacturés aux tarifs BIST et Takasbank`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const commission = notional * RATE * 2;
  const levies = notional * (BORSA_PAYI + takas) * 2;
  const commissionUsd = dollars(commission * (1 + BSMV), CASH);
  const leviesUsd = dollars(levies * (1 + BSMV), CASH);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : plus(leviesUsd, notionalUsd * taxTotal);
  const usd = plus(bookUsd, commissionUsd, taxUsd);
  const confidence = [
    shared.basis,
    "paliers de volume non imprimés : le taux le plus haut",
    "BSMV : Ahlatcı ne l'imprime pas sur la commission, 5 % est le taux légal",
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
    commission: { rate: RATE, lowest: LOWEST, currency: CASH, eachWay: true, bsmv: BSMV, borsaPayi: BORSA_PAYI, takas },
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, lowest: LOWEST, bsmv: BSMV, borsaPayi: BORSA_PAYI, takas: TAKAS }, null, 2));
    process.exit(0);
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/ahlatci/ahlatci_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
