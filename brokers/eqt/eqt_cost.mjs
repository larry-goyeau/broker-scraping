// What one round trip costs at EQT (Old Mutual Wealth's self-directed
// platform, formerly My Wealth Trader): buy n units of a JSE line online and
// sell them back, in dollars. Every catalogue line is a JSE share, ETF or
// ETN / AMC in rand (../eqt/jseBook.mjs), and the local account holds rand,
// so nothing is converted.
//
// Read on 2026-10-26 (plain request, rendered HTML).
//   https://www.oldmutual.co.za/wealth/eqt/   "Transparent fees and trading costs"
//     column Local:  Custody fee 0.05% p.a. ; Custody fee minimum R25 p.m. ;
//                    Brokerage "0.25% per trade" ; Forex "0.25% per trade"
//     "There are no platform access fees and no minimum account balance
//     requirements."
//   https://www.oldmutual.co.za/om-docs/blt79d5f271f2c82551/EQT_brochure.pdf
//     (features only, no fee figure)
//
// Formula: each buy and each sell pays 0.25% of the value traded (no
// minimum, no VAT line printed, so none is added); a STOCK purchase also
// pays South Africa's securities transfer tax, 0.25% of the value (as in
// ../easyequities, which prints it; ETFs, which are collective investment
// schemes, and ETNs, which are debt, pay none); plus the JSE spread once.
// A taxMap line, if one ever appears for the ISIN, replaces the STT.
//
// Left out: Strate / settlement and the JSE investor protection levy, which
// the page does not print; the custody fee (0.05% a year, at least R25 a
// month), a holding cost, in the remark; Forex 0.25% applies only when cash
// in another currency is converted, in the remark.
//
//   node brokers/eqt/eqt_cost.mjs NPN JSE ZAR --shares=3 --price=5500
//   node brokers/eqt/eqt_cost.mjs STX40 JSE ZAR --shares=200 --price=90
//   node brokers/eqt/eqt_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";

const FOLDER = "eqt";
const CATALOGUE = new URL("eqt-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.oldmutual.co.za/wealth/eqt/",
  brochure: "https://www.oldmutual.co.za/om-docs/blt79d5f271f2c82551/EQT_brochure.pdf",
  readOn: "2026-10-26",
  entity: "Old Mutual Wealth, EQT (formerly My Wealth Trader)",
};

const BROKERAGE = 0.0025; // "0.25% per trade", each way
const VAT = 0; // no VAT line printed
const STT = 0.0025; // South African securities transfer tax, STOCK purchase
const FX = "0.25"; // "Forex 0.25% per trade"
const CASH = "ZAR";
const REMARK = ["Custody 0.05% a year, min R25 a month.", fxRemark(FX, CASH)].join("\n");

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
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace) return true;
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
    return { ...answer, why: "le catalogue EQT n'existe pas encore : lancer `node brokers/eqt/eqt_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue EQT` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez EQT`,
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
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? (marketBp != null ? null : book.leaf?.perShare ?? null);
  const tax = taxesOf(listing.isin);
  const mapPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const stt = !mapPct && listing.type === "STOCK" ? STT : 0;
  const taxPct = mapPct || stt;
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const shared = {
    ...answer,
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    basis:
      `page EQT relue le ${SCHEDULE.readOn} : courtage 0,25 % par ordre à l'achat et à la vente, ` +
      `aucun minimum ni TVA ni autre frais par ordre imprimé ; STT 0,25 % à l'achat d'une action`,
  };
  if (listing.currency !== CASH) {
    return { ...shared, why: `le catalogue EQT ne couvre que le JSE en rand ; ${listing.currency} n'est pas couvert` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, CASH);
  const side = notional * BROKERAGE * (1 + VAT);
  const brokerFees = dollars(side * 2, CASH);
  const taxUsd = gap ? null : notionalUsd == null ? null : notionalUsd * taxPct;
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
  const why = [
    bookUsd == null ? `aucun carnet pour ${listing.ticker} sur ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
    gap,
  ].filter(Boolean);
  const confidence = [
    shared.basis,
    `${(BROKERAGE * (1 + VAT) * 100).toFixed(3)} % de ${notional.toFixed(2)} ZAR = ${side.toFixed(2)} ZAR par sens`,
    stt ? `STT ${(stt * 100).toFixed(2)} % à l'achat = ${(notional * stt).toFixed(2)} ZAR` : mapPct ? "taxe selon taxMap" : "pas de STT (ETF / ETN)",
    "garde 0,05 % / an (min. 25 R / mois) et change 0,25 % en remarque",
    marketBp != null ? `carnet ${marketBp} bp` : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why.length ? { why: why.join(" ; ") } : {}),
    commission: { rate: BROKERAGE, vat: VAT, eachWay: true, currency: CASH },
    stt: { rate: stt, onBuy: true, source: mapPct ? "taxMap" : stt ? "loi STT (ZA)" : null },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
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
    console.log(JSON.stringify({ ...SCHEDULE, brokerage: BROKERAGE, vat: VAT, stt: STT, fx: FX }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/eqt/eqt_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
