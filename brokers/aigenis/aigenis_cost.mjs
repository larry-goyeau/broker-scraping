// What one round trip costs at AIGENIS (ZAO "Aigenis", Minsk) in its app
// AIGENIS invest: buy n shares at price p, sell them back at once, in
// dollars. Two books: Belarusian shares on the BCSE (brokerage account, in
// BYN) and Russian shares on the Moscow Exchange (trust management "by
// order" through the Russian subsidiary IK Aigenis, in RUB).
//
// Read on 2026-10-24.
//
// BCSE, https://aigenis.by/tarify/ item 2: "Заключение сделок в торговой
// системе ОАО «Белорусская валютно-фондовая биржа» с акциями через
// программный комплекс AIGENIS invest 0,3% от суммы сделки, но не менее
// 2,00 бел.руб., в т.ч. НДС" (0.3% of the deal, at least BYN 2, VAT
// included). Footnote 1: the minimum is taken once per session and per
// order of one issue, so once a leg here. Footnote 2: the client repays the
// BCSE exchange and clearing fees. Those are the exchange's own tariff,
// https://bcse.by/fileManager/files/become_members/sbornik-plat-31.07.2026_a9ba.pdf
// (Сборник размеров плат, in force from 31.07.2026), chapter 3 item 1:
// shares bought or sold, from the seller and the buyer, exchange fee 0,01%
// and clearing fee 0,0021% of each deal, no VAT (footnote 6). So a leg is
// max(0.3% × amount, BYN 2) + 0.0121% × amount. No rounding is printed.
// Depository (https://aigenis.by/tarify-depozitarnoe-obsluzhivanie/ 1.7):
// account upkeep free. BYN is the deposit currency: no FX.
//
// MOEX, https://aigenis.by/rossijskij-fondovyj-rynok/ "КОМИССИИ":
//   management   1% годовых of every asset, accrued daily, taken monthly
//                from the BYN trust account: a remark, out of the trip.
//   per deal     0,2% currency conversion, 0,035% securities operations
//   MOEX fees    ("указаны максимальные значения", taken as printed)
//                conversion: TMS 0,075%, at least 1 RUB (orders up to
//                999.99 BYN); TOM 0,0045%, at least 50 RUB up to
//                50,000 BYN and 1 RUB above (lots of 1,000 BYN)
//                shares: 0,03% of the deal
// Deposits and withdrawals are BYN only (deposits.mjs: BYN), and MOEX
// trades in RUB, so each leg also pays a conversion, in the total:
// BYN → RUB before the buy, RUB → BYN after the sale, each at 0.2% plus
// MOEX's currency fee on the trade's amount. The cheaper of TMS (split in
// orders of at most 999.99 BYN) and TOM lots with the remainder in TMS is
// taken. The BYN/RUB book itself is not added.
//
// Books: the MOEX book of the share (spreads). BCSE has no venue in
// spreads/venues.mjs: N/A, broker fees still computed.
//
// fx.mjs has no BYN rate on 2026-10-24: until it does, every BCSE row and
// the conversion leg of the MOEX rows answer N/A.
//
//   node brokers/aigenis/aigenis_cost.mjs SberB-S0009 BCSE BYN --shares=100 --price=1
//   node brokers/aigenis/aigenis_cost.mjs SBER MISX RUB --shares=10 --price=300
//   node brokers/aigenis/aigenis_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("aigenis-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://aigenis.by/tarify/",
  moex: "https://aigenis.by/rossijskij-fondovyj-rynok/",
  bcseFees: "https://bcse.by/fileManager/files/become_members/sbornik-plat-31.07.2026_a9ba.pdf",
  depository: "https://aigenis.by/tarify-depozitarnoe-obsluzhivanie/",
  readOn: "2026-10-24",
  entity: 'ZAO "Aigenis" (BY); OOO "IK Aigenis" (RU)',
};

const CASH = "BYN";
const BCSE = {
  rate: 0.003, // item 2, VAT included
  min: 2, // BYN, once per order
  exchange: 0.0001, // BCSE exchange fee, each side
  clearing: 0.000021, // BCSE clearing fee, each side
};
const MOEX = {
  rate: 0.00035, // 0,035% securities operations
  exchange: 0.0003, // MOEX shares, maximum
  fx: 0.002, // 0,2% conversion
  tms: { rate: 0.00075, min: 1, maxByn: 999.99 },
  tom: { rate: 0.000045, lotByn: 1000, minSmall: 50, minLarge: 1, smallUpToByn: 50000 },
  management: 0.01, // a year, remark
};
const MOEX_REMARK = "Management fee is 1% a year of the account.";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

/** One BCSE leg in BYN: commission (floor BYN 2) plus the exchange's fees. */
export function bcseLeg(amount) {
  const value = Number(amount);
  if (!(value > 0)) return null;
  const commission = Math.max(value * BCSE.rate, BCSE.min);
  const exchange = value * (BCSE.exchange + BCSE.clearing);
  return { commission, exchange, total: commission + exchange };
}

/** One MOEX securities leg in RUB: AIGENIS 0.035% and the MOEX share fee. */
export function moexLeg(amount) {
  const value = Number(amount);
  if (!(value > 0)) return null;
  const commission = value * MOEX.rate;
  const exchange = value * MOEX.exchange;
  return { commission, exchange, total: commission + exchange };
}

/**
 * One BYN/RUB conversion in RUB: 0.2% to AIGENIS and MOEX's currency fee,
 * the cheaper of TMS orders and TOM lots plus a TMS remainder. `rubPerByn`
 * converts the BYN thresholds; null when it is unknown.
 */
export function conversion(amountRub, rubPerByn) {
  const rub = Number(amountRub);
  if (!(rub > 0) || !(rubPerByn > 0)) return null;
  const byn = rub / rubPerByn;
  const tmsFee = (r) => {
    if (!(r > 0)) return 0;
    const orders = Math.ceil(r / rubPerByn / MOEX.tms.maxByn - 1e-9);
    return Math.max(r * MOEX.tms.rate, orders * MOEX.tms.min);
  };
  const allTms = tmsFee(rub);
  const lots = Math.floor(byn / MOEX.tom.lotByn + 1e-9);
  let viaTom = Infinity;
  if (lots > 0) {
    const tomRub = lots * MOEX.tom.lotByn * rubPerByn;
    const min = lots * MOEX.tom.lotByn <= MOEX.tom.smallUpToByn ? MOEX.tom.minSmall : MOEX.tom.minLarge;
    viaTom = Math.max(tomRub * MOEX.tom.rate, min) + tmsFee(rub - tomRub);
  }
  const exchange = Math.min(allTms, viaTom);
  const commission = rub * MOEX.fx;
  return { commission, exchange, mode: viaTom < allTms ? "TOM" : "TMS", total: commission + exchange };
}

export function marketOf(row) {
  const mic = code(row?.mic);
  if (mic === "BCSE" || /BELARUS/.test(loose(row?.exchange))) return "bcse";
  if (mic === "MISX" || mic === "XMOS" || /MOSCOW/.test(loose(row?.exchange))) return "moex";
  return null;
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
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
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
    cashCurrency: CASH,
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue AIGENIS n'existe pas encore : lancer `node brokers/aigenis/aigenis_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue AIGENIS` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez AIGENIS`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "aigenis",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? code(m.row.mic) ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const market = marketOf(m.row);
  if (!market) return { ...answer, listing, why: `${listing.brokerExchange} n'a pas de ligne dans le tarif` };
  const moex = market === "moex";
  const held = depositHas("aigenis", null, listing.currency);
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, r) => sum + r, 0);
  const shared = {
    ...answer,
    listing,
    url: moex ? SCHEDULE.moex : SCHEDULE.url,
    remark: moex ? MOEX_REMARK : "",
    bp: marketBp,
    perShare: marketPerShare,
    basis: moex
      ? `page Фондовый рынок России d'AIGENIS relue le ${SCHEDULE.readOn} : 0,035 % par opération sur titres et frais MOEX actions 0,03 % (maximum imprimé), ` +
        `à l'achat et à la vente ; dépôt en BYN seulement : conversion BYN/RUB à chaque sens, 0,2 % plus frais MOEX devises ` +
        `(TMS 0,075 %, min. 1 RUB ; TOM 0,0045 %, min. 50 RUB jusqu'à 50 000 BYN), dans le chiffre ; gestion 1 % par an hors aller-retour`
      : `tarif AIGENIS relu le ${SCHEDULE.readOn}, point 2 : 0,3 % TTC, au moins 2 BYN par ordre, à l'achat et à la vente ; ` +
        `plus frais BVFB remboursés (note 2) : bourse 0,01 % et compensation 0,0021 % de chaque opération (Сборник размеров плат, chap. 3, point 1)`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), cash: usdPer(CASH) },
    fxIfConverted: moex ? MOEX.fx : 0,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  let leg;
  let fxLeg = null;
  if (moex) {
    leg = moexLeg(notional);
    const rubPer = usdPer("RUB");
    const bynPer = usdPer(CASH);
    fxLeg = held ? { commission: 0, exchange: 0, total: 0 } : conversion(notional, rubPer && bynPer ? bynPer / rubPer : null);
  } else {
    leg = bcseLeg(notional);
  }
  const commissionUsd = dollars(leg.commission * 2, listing.currency);
  const exchangeUsd = dollars(leg.exchange * 2, listing.currency);
  const fxUsd = !moex ? 0 : fxLeg == null ? null : dollars(fxLeg.total * 2, listing.currency);
  const brokerFees = plus(commissionUsd, exchangeUsd, fxUsd);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");
  const why =
    usd != null
      ? null
      : notionalUsd == null || (moex && fxUsd == null)
        ? `aucun cours en dollars pour ${notionalUsd == null ? listing.currency : CASH} dans fx.mjs`
        : `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de place dans spreads/venues.mjs"}`;

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    commission: moex
      ? { rate: MOEX.rate, exchange: MOEX.exchange, buy: finite(leg.total, 6), sell: finite(leg.total, 6), eachWay: true, currency: "RUB" }
      : { rate: BCSE.rate, min: BCSE.min, exchange: BCSE.exchange + BCSE.clearing, buy: finite(leg.total, 6), sell: finite(leg.total, 6), eachWay: true, currency: "BYN" },
    ...(moex ? { conversion: fxLeg ? { ...fxLeg, eachWay: true, currency: "RUB" } : null } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      bourse: finite(exchangeUsd, 6),
      ...(moex ? { change: finite(fxUsd, 6) } : {}),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, bcse: BCSE, moex: MOEX, deposits: [CASH] }, null, 2));
    process.exit(0);
  }
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/aigenis/aigenis_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });
  if (!out.listing) {
    console.log(out.why);
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $   (${out.commission?.buy} ${out.commission?.currency} par sens hors change)`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.bourse != null) console.log(`  frais de bourse: ${parts.bourse} $`);
    if (parts.change !== undefined) console.log(`  change         : ${parts.change ?? "N/A"} $${out.conversion ? `   (${finite(out.conversion.total, 6)} RUB par sens, ${out.conversion.mode})` : ""}`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(out.why);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
