// What one round trip costs at Kakao Pay Securities (카카오페이증권): buy n
// shares at price p, sell them back at once, in dollars. Mobile-only broker,
// so every order is an online one (온라인 수수료). Fractional orders, stock
// accumulation and the offline rate stay out.
//
// Fee page read 2026-10-26 (수수료 안내, Retail부문):
//   KRX (KOSPI, KOSDAQ, ETF/ETN included)   0.015 % each way, minimum 1 won
//   NXT                                     0.014 %: the catalogue is one
//                                           row per KRX line; the KRX rate
//                                           is used
//   US (ETF/ETN included)                   0.1 % each way, minimum 0.01 USD
//   No rounding is printed: none is applied. The page gives no separate
//   유관기관 제비용 line for Korea: the 0.015 % is taken as the whole charge
//   (as in toss_cost.mjs).
//   Taxes and charges the page prints
//     KOSPI sale   0.20 % (증권거래세 0.15 % + 농어촌특별세 0.05 %)
//     KOSDAQ sale  0.20 % (증권거래세)
//     These are share taxes: an ETF or ETN sale pays none. The 15.4 % on
//     the gain of an "other" ETF/ETN is a tax on profit, nil on a round
//     trip at one price.
//     US sale      SEC Fee 0.00206 % (from 2026-04-02), minimum 0.01 USD;
//                  TAF waived from 2026-10-01
//   환전수수료      "매매기준율 * 스프레드 1%", the 매매기준율 being the mid of
//                  Shinhan or Hana Bank's board. A "95% 환전수수료 우대
//                  (이벤트)" applies on business days from 9:00 to 16:00.
//
// Cash is won only (deposits.mjs), so a US line converts on the buy and on
// the sale. The posted 1 % each way is in the total; the 95 % event rate
// is the remark "Fees might be 1.9% lower if …", buy and sale together.
//
// US orders: Kakao Pay names no US broker-dealer, so the book is the quoted
// NBBO of the ticker (no Rule 606 mix). Korea: the KRX book.
//
//   https://www.kakaopaysec.com/guide/feeGuide/dynamicPage.do
//
//   node brokers/kakaopay/kakaopay_cost.mjs 005930 KOSPI KRW --shares=10 --price=70000
//   node brokers/kakaopay/kakaopay_cost.mjs 069500 KOSPI KRW --shares=100 --price=40000
//   node brokers/kakaopay/kakaopay_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/kakaopay/kakaopay_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("kakaopay-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.kakaopaysec.com/guide/feeGuide/dynamicPage.do",
  readOn: "2026-10-26",
  secOn: "2026-04-02",
  entity: "카카오페이증권",
};

const CASH = "KRW";
const KR = { rate: 0.00015, min: 1 };
const US = { rate: 0.001, min: 0.01 };
const KR_SALE_TAX = { XKRX: 0.002, XKOS: 0.002 };
const SEC_RATE = 0.0000206;
const SEC_MIN = 0.01;
const FX_SPREAD = 0.01;
const FX_EVENT_DISCOUNT = 0.95;

const KOREA_MICS = new Set(["XKRX", "XKOS"]);
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "TXSE", "IEXG"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

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
      if (loose(m.row.exchange) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

const leg = (notional, rule) => (notional > 0 ? Math.max(notional * rule.rate, rule.min) : null);

const pct = (x) => Number((x * 100).toFixed(2));

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the ticket.
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
    remark: "",
    url: SCHEDULE.url,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Kakao Pay n'existe pas encore : lancer `node brokers/kakaopay/kakaopay_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Kakao Pay` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Kakao Pay`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "kakaopay",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? (m.row.mic || null),
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const mic = code(m.row.mic || listing.mic);
  const korea = KOREA_MICS.has(mic) && listing.currency === "KRW";
  const american = US_MICS.has(mic) && listing.currency === "USD";
  if (!korea && !american) {
    return { ...answer, listing, why: `${listing.brokerExchange} ${listing.currency} n'a pas de ligne dans le barème Kakao Pay` };
  }

  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const share = listing.type === "STOCK";
  const saleTax = korea && share ? KR_SALE_TAX[mic] : 0;
  const remark = american
    ? `Fees might be ${pct(2 * FX_SPREAD * FX_EVENT_DISCOUNT)}% lower if you convert between 9:00 and 16:00 on a business day.`
    : "";
  const basis = korea
    ? `barème Kakao Pay en ligne, relu le ${SCHEDULE.readOn} : KRX 0,015 % par ordre, min 1 KRW ; ${share ? `taxe ${mic === "XKRX" ? "KOSPI" : "KOSDAQ"} 0,20 % à la vente` : "ETF/ETN : pas de taxe de transaction"}`
    : `barème US Kakao Pay en ligne, relu le ${SCHEDULE.readOn} : 0,1 % par ordre, min 0,01 USD ; SEC 0,00206 % à la vente, min 0,01 USD (${SCHEDULE.secOn}) ; change 1 % du 매매기준율 à l'achat et à la vente (compte en KRW)`;
  const shared = {
    ...answer,
    listing,
    remark,
    basis,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american) {
    const quoted = usBookPerShare({ broker: "kakaopay", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;

  const one = leg(notional, korea ? KR : US);
  const commissionUsd = one == null ? null : dollars(one * 2, listing.currency);
  const levyLocal = korea ? notional * saleTax : Math.max(notional * SEC_RATE, SEC_MIN);
  const levyUsd = dollars(levyLocal, listing.currency);
  const fxUsd = american && notionalUsd != null ? notionalUsd * FX_SPREAD * 2 : 0;
  const taxUsd = notionalUsd == null ? null : plus(notionalUsd * taxTotal, levyUsd);
  const brokerFees = plus(commissionUsd, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    basis,
    korea ? "ligne en wons : pas de change" : "change dans le chiffre : le compte ne tient que des wons ; taux de l'événement 95 % en remarque",
    american ? "aucun courtier US nommé : NBBO coté" : "",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet NBBO coté ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { rate: (korea ? KR : US).rate, min: (korea ? KR : US).min, perOrder: one, currency: listing.currency, eachWay: true },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          korea: KR,
          us: US,
          saleTax: KR_SALE_TAX,
          sec: { rate: SEC_RATE, min: SEC_MIN },
          fx: { spread: FX_SPREAD, eachWay: true, eventDiscount: FX_EVENT_DISCOUNT, eventHours: "business days 9:00-16:00" },
          cash: CASH,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/kakaopay/kakaopay_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]");
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

  const show = (x) => (x == null ? "N/A" : x);
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
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.change) console.log(`  change         : ${parts.change} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
