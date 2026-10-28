// What one round trip costs at IP Favorit (ИП Фаворит АД, Sofia): buy n
// shares or ETF units on the Bulgarian Stock Exchange through COBOS and sell
// them back, in dollars. Every catalogue line is XBUL and in euro (BSE Main
// Market, BaSE, BEAM).
//
// https://ipfavorit.com/wp-content/uploads/2026/08/Tariff_05_06_2025_EUR.pdf
// (the "Тарифа" page, https://ipfavorit.com/комисионни/), last amended by the
// Board on 05.06.2025, euro edition, read on 2026-10-26. Point 1.7:
//   "Сделки с ценни книжа и компенсаторни инструменти, осъществени през
//   системата COBOS (вкл. таксите на БФБ и ЦД): без годишна такса"
//   "за сделки с акции и компенсаторни инструменти" "0,5% от стойността на
//   сделката, но не по-малко от 1,02 евро"
// So 0.5% each way, minimum 1.02 €, with the BSE and Central Depository
// fees inside: nothing is added. The online-trading page still prints the
// old "не по-малко от 3 лев" (1.53 €); the euro tariff is the later, formal
// figure. The minimum bites only under about 204 € a side.
//   https://ipfavorit.com/online-търговия-на-бфб/
// Point 1.1 (office orders: 2% up to 5 000 €, min 10.23 €, then 1.5% / 1.2% /
// 1%) is not online and stays out. The tariff has no line for fund units;
// the Exchange Traded Products segment (Expat ETFs, listed national
// investment funds) trades on the same BSE book and takes the share line.
// Custody 3.14 (0.24% a year on securities, 0.5% on cash) is an annual fee
// and COBOS trading is "без годишна такса", so it is not in the remark.
// Order cancellation (1.4, 3.07 €) is not a trip.
//
// Cash: the tariff is in euro and every line is in euro, so nothing is
// converted.
//
//   node brokers/ipfavorit/ipfavorit_cost.mjs SFA "Bulgarian Stock Exchange" EUR --shares=100 --price=8.6
//   node brokers/ipfavorit/ipfavorit_cost.mjs BGX "Bulgarian Stock Exchange" EUR --shares=800 --price=1.07
//   node brokers/ipfavorit/ipfavorit_cost.mjs FORM "Bulgarian Stock Exchange" EUR --shares=20 --price=4.3
//   node brokers/ipfavorit/ipfavorit_cost.mjs --schedule
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

const FOLDER = "ipfavorit";
const CATALOGUE = new URL("ipfavorit-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://ipfavorit.com/wp-content/uploads/2026/08/Tariff_05_06_2025_EUR.pdf",
  page: "https://ipfavorit.com/%d0%ba%d0%be%d0%bc%d0%b8%d1%81%d0%b8%d0%be%d0%bd%d0%bd%d0%b8/",
  online: "https://ipfavorit.com/online-%d1%82%d1%8a%d1%80%d0%b3%d0%be%d0%b2%d0%b8%d1%8f-%d0%bd%d0%b0-%d0%b1%d1%84%d0%b1/",
  amended: "2025-06-05",
  readOn: "2026-10-26",
  entity: "ИП Фаворит АД, COBOS",
};

const CASH = "EUR";
// COBOS commission, point 1.7, each order, in euro, BSE and CD fees included.
const BROKER = { rate: 0.005, min: 1.02 };

const REMARK = null;
const PLACE = "Bulgarian Stock Exchange";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

/** True for a line on the BSE (Main Market, BaSE, BEAM). */
function onBse(row) {
  const c = loose(row?.exchange);
  return c === loose(PLACE) || /^(BSESOF|XBUL|BSE|SOFIA)$/.test(c);
}
const isEtp = (row) => code(row?.type || "STOCK") !== "STOCK";

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const exact = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exact.length ? exact : named;
  const wantVenue = !exact.length && place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace || exact.length) return true;
      if (loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
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
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue IP Favorit n'existe pas encore : lancer `node brokers/ipfavorit/ipfavorit_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue IP Favorit` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez IP Favorit`,
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
  const bse = onBse(m.row);
  const etp = isEtp(m.row);
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? (marketBp != null ? null : book.leaf?.perShare ?? null);
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    basis: bse
      ? `tarif IP Favorit modifié le ${SCHEDULE.amended}, édition euro relue le ${SCHEDULE.readOn}, point 1.7 COBOS : ` +
        `0,5 %, minimum ${BROKER.min} € par sens, frais BFB et DC inclus`
      : "",
  };
  if (!bse) return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'a pas de ligne dans le tarif COBOS d'IP Favorit` };
  if (listing.currency !== CASH) return { ...shared, why: `IP Favorit tarife en euro ; ${listing.currency} n'est pas couvert` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, CASH);
  const commissionSide = Math.max(notional * BROKER.rate, BROKER.min);
  const brokerFees = dollars(commissionSide * 2, CASH);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, CASH),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    notional * BROKER.rate < BROKER.min
      ? `le minimum de ${BROKER.min} € mord (${(notional * BROKER.rate).toFixed(2)} € calculés)`
      : `0,5 % de ${notional.toFixed(2)} € = ${commissionSide.toFixed(2)} € par sens`,
    "la page « Online търговия » imprime encore un minimum de 3 лв (1,53 €) ; le tarif en euro, plus récent, dit 1,02 €",
    ...(etp ? ["parts de fonds : le tarif n'a pas de ligne propre, la ligne actions s'applique"] : []),
    "garde 3.14 non retenue : COBOS est « без годишна такса »",
    marketBp != null ? `carnet ${marketBp} bp` : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.ticker} sur ${listing.brokerExchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    commission: { rate: BROKER.rate, min: BROKER.min, minCurrency: CASH, eachWay: true, currency: CASH, thirdPartyIncluded: true },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      réglementaire: 0,
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
    console.log(JSON.stringify({ ...SCHEDULE, broker: BROKER }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/ipfavorit/ipfavorit_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}

printCli();
