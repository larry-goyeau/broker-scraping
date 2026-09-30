// What one round trip costs at PKO supermakler: buy n shares at price p, sell
// them back at once, in dollars. Internet orders. The phone and branch line
// is another channel and stays out.
//
// Tariff in force from 1 October 2020, re-read 2026-09-27. The public table
// on the foreign-markets page prints the same rates.
//
//   Polish organised market (GPW and NewConnect), internet
//     shares, ETF, ETC, ETN, ETP   0.39 % min 5 zł per order
//     a line quoted in another currency: the same rate, min 5 of that currency
//     futures, options and bonds are not this catalogue
//   Abroad, one order, settled in the listing currency
//     Austria, Belgium, Netherlands, Spain, Portugal, Italy,
//     Czechia, Denmark, Germany, Norway, Switzerland, Sweden,
//     USA, Hungary, UK, Luxembourg                 0.28 %
//     France                                        0.49 %
//     the floor is the tariff's foreign-currency column
//
// A foreign order can settle in PLN or in the listing currency (EUR, CHF,
// GBP, USD, NOK, HUF, SEK, CZK, DKK). This number uses the listing-currency
// column when that currency is a wallet, so the ticket has no conversion.
// Settling the same order in PLN uses the złoty floor and half of KBC's
// spread (about 2.0 gr on EUR, 1.76 gr on USD, 2.54 gr on GBP, 1.83 gr on
// CHF, unpublished for the others). That spread is the remark, not the
// number. The 5 % NBP haircut is a buying-power block, not a charge.
//
// A foreign line priced under 0.10 USD is 0.015 USD a share, min 70 USD, per
// order. The 0.7 % debt line is the off-exchange bond service. Custody of
// 0.15 % a year and the 60 zł account fee are not a ticket. The under-25
// rate and IKE are another account. Stamp and FTT come from the tax map.
// The foreign-markets page names the PTM levy: 1 GBP each way on a UK share
// above 10 000 GBP. It names no SEC fee.
//
// Internet orders go to KBC Securities. Orders placed in person or by phone
// go through Goldman Sachs, Bank of America Merrill Lynch, BGC Partners,
// KBC Securities, TD Securities, KCG Europe Limited, Bernstein Autonomous,
// Patria, Raiffeisen Centrobank, Tradition, PGM Global Inc, Wood & Company,
// Equilor, Hauck & Aufhäuser, JP Morgan and M.M.Warburg. None of those is a
// US broker-dealer in the 606 file, so no Rule 606 mix is applied.
//
//   https://www.bm.pkobp.pl/api/public/9eaf7796-f0e5-458a-b5e6-6a20d94ab130.pdf
//   https://www.bm.pkobp.pl/oferta/rynki-zagraniczne
//   https://www.bm.pkobp.pl/api/public/994a8c6c-d442-47a1-bded-4eb0d5a361a4.pdf
//
//   node brokers/pkobp/pkobp_cost.mjs PLPKO0000016 GPW PLN --shares=10 --price=50
//   node brokers/pkobp/pkobp_cost.mjs US0378331005 XNAS USD --shares=10 --price=230
//   node brokers/pkobp/pkobp_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("pkobp-parsed.json", import.meta.url);
const SPREADS = new URL("../../spreads/spread.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.bm.pkobp.pl/api/public/9eaf7796-f0e5-458a-b5e6-6a20d94ab130.pdf",
  foreign: "https://www.bm.pkobp.pl/oferta/rynki-zagraniczne",
  execution: "https://www.bm.pkobp.pl/api/public/994a8c6c-d442-47a1-bded-4eb0d5a361a4.pdf",
  readOn: "2026-09-27",
  tariffOn: "2020-10-01",
  entity: "Biuro Maklerskie PKO Banku Polskiego, supermakler",
  venue: "KBC Securities",
};

const WALLETS = new Set(["PLN", "EUR", "USD", "CHF", "GBP", "NOK", "HUF", "SEK", "CZK", "DKK"]);
const UK_SHARE = /^(GB|GG|JE|IM)/;
const PTM = { each: 1, currency: "GBP", above: 10000 };
const PENNY = { under: 0.1, perShare: 0.015, min: 70, currency: "USD" };
const GROSZ = { EUR: "2.0 gr", USD: "1.76 gr", GBP: "2.54 gr", CHF: "1.83 gr" };

const eur49 = () => ({ amount: 49, currency: "EUR" });
const at = (cash) => ({ amount: 49, currency: cash === "USD" ? "USD" : "EUR" });
const ch = (cash) => ({ amount: 49, currency: cash === "EUR" || cash === "USD" ? cash : "CHF" });
const flat = (amount, currency) => () => ({ amount, currency });

// rate, PLN-settlement floor, listing-currency floor.
const FOREIGN = {
  XWBO: { rate: 0.0028, pln: 199, floor: at },
  XBRU: { rate: 0.0028, pln: 199, floor: eur49 },
  XAMS: { rate: 0.0028, pln: 199, floor: eur49 },
  XMAD: { rate: 0.0028, pln: 199, floor: eur49 },
  XLIS: { rate: 0.0028, pln: 199, floor: eur49 },
  XMIL: { rate: 0.0028, pln: 199, floor: eur49 },
  XLUX: { rate: 0.0028, pln: 199, floor: eur49 },
  XPRA: { rate: 0.0028, pln: 199, floor: flat(1200, "CZK") },
  XCSE: { rate: 0.0028, pln: 199, floor: flat(350, "DKK") },
  XPAR: { rate: 0.0049, pln: 199, floor: eur49 },
  XETR: { rate: 0.0028, pln: 38, floor: flat(9, "EUR") },
  XOSL: { rate: 0.0028, pln: 199, floor: flat(500, "NOK") },
  XSWX: { rate: 0.0028, pln: 199, floor: ch },
  XSTO: { rate: 0.0028, pln: 199, floor: flat(500, "SEK") },
  XNAS: { rate: 0.0028, pln: 38, floor: flat(10, "USD") },
  XNYS: { rate: 0.0028, pln: 38, floor: flat(10, "USD") },
  ARCX: { rate: 0.0028, pln: 38, floor: flat(10, "USD") },
  XBUD: { rate: 0.0028, pln: 199, floor: flat(15000, "HUF") },
  XLON: { rate: 0.0028, pln: 99, floor: flat(19, "GBP") },
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

const pct = (rate) => `${(rate * 100).toFixed(2)} %`;

function polishMarket(exchange) {
  const ex = loose(exchange);
  return ex === "GPW" || ex === "XWAR" || ex === "NEWCONNECT";
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

function commissionOf(listing) {
  if (polishMarket(listing.brokerExchange)) {
    const cash = listingCash(listing.currency) || "PLN";
    return {
      rate: 0.0039,
      min: 5,
      minCcy: cash,
      cashCurrency: cash,
      plnFx: false,
      label: `0.39 % min 5 ${cash}`,
    };
  }
  const spec = FOREIGN[listing.mic];
  if (!spec) return null;
  const cash = listingCash(listing.currency);
  if (WALLETS.has(cash) && cash !== "PLN") {
    const floor = spec.floor(cash);
    return {
      rate: spec.rate,
      min: floor.amount,
      minCcy: floor.currency,
      cashCurrency: cash,
      plnFx: false,
      label: `${pct(spec.rate)} min ${floor.amount} ${floor.currency}`,
    };
  }
  return {
    rate: spec.rate,
    min: spec.pln,
    minCcy: "PLN",
    cashCurrency: "PLN",
    plnFx: true,
    label: `${pct(spec.rate)} min ${spec.pln} PLN`,
  };
}

function fxRemark(currency) {
  const cash = listingCash(currency);
  if (!cash || cash === "PLN") return "";
  const spread = GROSZ[cash];
  if (spread) return `FX half the KBC spread, about ${spread} on ${cash}/PLN, when settled in PLN.`;
  return `FX half the KBC spread, unpublished for ${cash}, when settled in PLN.`;
}

function ptmEach(listing, notional) {
  if (listing.mic !== "XLON" || listing.type !== "STOCK") return 0;
  if (!UK_SHARE.test(listing.isin || "")) return 0;
  const usd = dollars(notional, listing.currency);
  const per = usdPer("GBP");
  if (usd == null || per == null) return null;
  return usd / per > PTM.above ? PTM.each : 0;
}

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
    cashCurrency: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue PKO BP n'existe pas encore : lancer `node brokers/pkobp/pkobp_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue PKO BP` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez PKO BP`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "pkobp",
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
  const polish = polishMarket(listing.brokerExchange);
  const rule = commissionOf(listing);
  if (!rule) {
    return {
      ...answer,
      listing,
      why: `${listing.exchange || listing.brokerExchange} n'a pas de ligne dans la taryfa`,
    };
  }
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: rule.cashCurrency,
    remark: polish ? "" : fxRemark(listing.currency),
    url: SCHEDULE.url,
    basis: `taryfa supermakler du ${SCHEDULE.tariffOn}, relue le ${SCHEDULE.readOn} : ${rule.label} par ordre`,
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
  const priceUsd = dollars(p, listing.currency);
  const penny = !polish && priceUsd != null && priceUsd < PENNY.under;
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null
      ? null
      : parts.b == null
        ? null
        : parts.a * notionalUsd + parts.b * n;
  const one = penny
    ? (() => {
        const raw = dollars(PENNY.perShare * n, PENNY.currency);
        const floor = dollars(PENNY.min, PENNY.currency);
        if (raw == null || floor == null) return null;
        return Math.max(raw, floor);
      })()
    : (() => {
        const raw = dollars(notional * rule.rate, listing.currency);
        const floor = dollars(rule.min, rule.minCcy);
        if (raw == null || floor == null) return null;
        return Math.max(raw, floor);
      })();
  const commissionUsd = plus(one, one);
  const brokerFees = commissionUsd;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const levy = ptmEach(listing, notional);
  const ptmUsd = levy == null ? null : dollars(levy * 2, PTM.currency);
  const usd = plus(bookUsd, brokerFees, taxUsd, ptmUsd);
  const confidence = [
    penny ? `${shared.basis} ; ligne sous 0,10 USD : 0,015 USD par action, min 70 USD` : shared.basis,
    polish ? "marché polonais" : `exécution ${SCHEDULE.venue}, règlement en ${rule.cashCurrency}`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
    levy ? `PTM ${PTM.each} £ par sens, le montant dépasse ${PTM.above} £` : "",
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { rate: penny ? null : rule.rate, min: penny ? PENNY.min : rule.min, currency: penny ? PENNY.currency : rule.minCcy, eachWay: true },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      taxes: finite(taxUsd, 6),
      ...(levy ? { réglementaire: finite(ptmUsd, 6) } : {}),
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
          cash: [...WALLETS],
          poland: "0.39 % min 5 PLN",
          rates: "0.28 % (France 0.49 %), floor in the listing currency",
          conversion: "none in the ticket when the order settles in the listing currency; PLN settlement is half the KBC spread, in the remark",
          rule606: null,
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
    console.error("usage : node brokers/pkobp/pkobp_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    if (parts.réglementaire) console.log(`  réglementaire  : ${parts.réglementaire} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
