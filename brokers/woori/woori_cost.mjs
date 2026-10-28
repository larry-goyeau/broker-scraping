// What one round trip costs at Woori Investment Securities (우리투자증권):
// buy n shares at price p, sell them back at once, in dollars. Online orders
// (MTS; HTS for corporate clients). The offline rate (고객센터, 영업점), the
// negotiated rate (협의수수료), fractional orders and stock accumulation
// stay out.
//
// Commission page read 2026-10-26 (위탁매매수수료 안내):
//   KRX (코스피/코스닥)   0.010 % online, ETF/ETN alike
//   NXT                  0.010 %: same rate, same KRX row
//   K-OTC                0.100 % online
//   "위탁 매매수수료에는 유관기관제비용이 포함되어 있습니다", "10원 미만 수수료는
//   절사 처리됩니다": the fee includes the exchange and depository charges
//   and is truncated to 10 won. It is on each side's day total in one name.
//   매매관련 제세금, on the sale of a share
//     유가증권시장 (KOSPI)  0.20 % (증권거래세 0.05 % + 농어촌특별세 0.15 %)
//     코스닥시장            0.20 %
//     K-OTC                0.20 %
//     ETFs and ETNs pay no transaction tax; the 15.4 % on the gain of a
//     non-equity ETF/ETN is a tax on profit, nil on a round trip at one
//     price.
//   미국                  0.20 % online, no minimum; "SEC fee : 매도 시
//                        0.00206%, 최소 금액 $0.01". No rounding is printed
//                        for the US fee: none is applied.
//
// Cash is won only (deposits.mjs): a US order is paid in dollars bought in
// the MTS (외화환전, USD, business days 9:00-23:00) or by the next-day
// automatic conversion of the 원화증거금 service. Neither the securities
// site nor the service pages print the conversion spread, so the group's
// bank stands in (owner, 2026-10-26): Woori Bank's public daily board, USD
// 송금 (TT) 보내실때 1,337.80 / 받으실때 1,312.20 against 매매기준율
// 1,325.00 (2026-10-26 18:16), 0.97 % each way, paid on the buy and on the
// sale since the account holds won only.
//   https://spot.wooribank.com/pot/Dream?withyou=FXXRT0011
//
// K-OTC has no public book (no MIC): its lines are N/A on the book, with
// the fees still shown.
// US orders: Woori names no US broker-dealer, so the book is the quoted
// NBBO of the ticker (no Rule 606 mix). Korea: the KRX book.
//
//   https://fundsupermarket.wooriib.com/fmc/FMC3090002/main.do   (commissions, taxes)
//   https://fundsupermarket.wooriib.com/fmc/FMC3090030/main.do   (US market)
//   https://fundsupermarket.wooriib.com/fmc/FMC3090031/main.do   (overseas service, 외화환전)
//
//   node brokers/woori/woori_cost.mjs 005930 KOSPI KRW --shares=10 --price=70000
//   node brokers/woori/woori_cost.mjs 069500 KOSPI KRW --shares=100 --price=40000
//   node brokers/woori/woori_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/woori/woori_cost.mjs --schedule
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

const CATALOGUE = new URL("woori-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://fundsupermarket.wooriib.com/fmc/FMC3090002/main.do",
  us: "https://fundsupermarket.wooriib.com/fmc/FMC3090030/main.do",
  service: "https://fundsupermarket.wooriib.com/fmc/FMC3090031/main.do",
  readOn: "2026-10-26",
  entity: "우리투자증권",
};

const CASH = "KRW";
const RATE = { KRX: 0.0001, KOTC: 0.001, US: 0.002 };
const SALE_TAX = 0.002;
const SEC_RATE = 0.0000206;
const SEC_MIN = 0.01;
// Conversion spread each way, as a fraction of the mid: Woori Bank's USD
// TT spread, (1,337.80 - 1,325.00) / 1,325.00.
const FX_SPREAD = 0.0097;

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

// One side in won, truncated to 10 won.
const wonLeg = (notional, rate) => (notional > 0 ? Math.floor((notional * rate) / 10 + 1e-9) * 10 : null);

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
    return { ...answer, why: "le catalogue Woori n'existe pas encore : lancer `node brokers/woori/woori_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Woori` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Woori`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "woori",
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
  const kotc = loose(m.row.exchange) === "KOTC" && listing.currency === "KRW";
  const korea = (KOREA_MICS.has(mic) && listing.currency === "KRW") || kotc;
  const american = US_MICS.has(mic) && listing.currency === "USD";
  if (!korea && !american) {
    return { ...answer, listing, why: `${listing.brokerExchange} ${listing.currency} n'a pas de ligne dans le barème Woori` };
  }

  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const share = listing.type === "STOCK";
  const rate = kotc ? RATE.KOTC : korea ? RATE.KRX : RATE.US;
  const market = kotc ? "K-OTC" : mic === "XKOS" ? "KOSDAQ" : "KOSPI";
  const basis = korea
    ? `barème Woori en ligne, relu le ${SCHEDULE.readOn} : ${kotc ? "K-OTC 0,100 %" : "KRX 0,010 %"} par ordre, frais de place inclus, tronqué à 10 KRW ; ${share ? `taxe ${market} 0,20 % à la vente` : "ETF/ETN : pas de taxe de transaction"}`
    : `barème US Woori en ligne, relu le ${SCHEDULE.readOn} : 0,20 % par ordre, sans minimum ; SEC 0,00206 % à la vente, min 0,01 USD ; ${FX_SPREAD == null ? "écart de change non publié (compte en KRW)" : `change ${(FX_SPREAD * 100).toFixed(2).replace(".", ",")} % à l'achat et à la vente : écart 송금 USD de Woori Bank (même groupe) relevé le 2026-10-26, substitut accepté par le propriétaire`}`;
  const shared = {
    ...answer,
    listing,
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
    const quoted = usBookPerShare({ broker: "woori", ticker: listing.ticker, fallback: marketPerShare });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;

  const one = korea ? wonLeg(notional, rate) : notional * rate;
  const commissionUsd = one == null ? null : dollars(one * 2, listing.currency);
  const levyLocal = korea ? (share ? notional * SALE_TAX : 0) : Math.max(notional * SEC_RATE, SEC_MIN);
  const levyUsd = dollars(levyLocal, listing.currency);
  const fxUsd = korea ? 0 : FX_SPREAD == null || notionalUsd == null ? null : notionalUsd * FX_SPREAD * 2;
  const taxUsd = notionalUsd == null ? null : plus(notionalUsd * taxTotal, levyUsd);
  const brokerFees = plus(commissionUsd, fxUsd);
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    basis,
    korea ? "ligne en wons : pas de change" : "change dans le chiffre : le compte ne tient que des wons",
    american ? "aucun courtier US nommé : NBBO coté" : "",
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet NBBO coté ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  const why =
    american && fxUsd == null
      ? "Woori ne publie pas l'écart de change USD/KRW, et le compte ne tient que des wons : total inconnu"
      : bookUsd == null
        ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
        : null;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { rate, perOrder: one, currency: listing.currency, eachWay: true },
    bp: marketBp,
    perShare: marketPerShare,
    ...(why ? { why } : {}),
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
        { ...SCHEDULE, rates: RATE, saleTax: SALE_TAX, sec: { rate: SEC_RATE, min: SEC_MIN }, fxSpread: FX_SPREAD, cash: CASH },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/woori/woori_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]");
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
