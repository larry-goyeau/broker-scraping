// What one round trip costs at ING Deutschland: buy n shares at price p,
// sell them back at once, in dollars. The regular Direkt-Depot, not Young.
//
// Re-read 2026-10-10 from the price list and the securities excerpt:
//   https://www.ing.de/sparen-anlegen/direkt-depot/konditionen/
//   https://www.ing.de/dokumente/direkt-depot-auszug-plv/
//
//   Order commission, each way   4.90 € + 0.25 % of the value, cap 69.90 €
//   Direkthandel                 no venue fee
//   Munich, Stuttgart            1.90 €
//   Xetra, Frankfurt, Düsseldorf, Hamburg, Hannover, Berlin   2.90 €
//   USA and Canada               14.90 €
//
// The 0.25 % is of the euro value, so a dollar or Canadian line is converted
// at the file's mid before the commission. The venue fee sits on top of the
// cap. A buy and a sell are two orders, so both are charged twice. ING names
// no SEC fee on the foreign ticket. A foreign order is forwarded to UBS
// Switzerland AG. A US line uses the Rule 606 mix of UBS Securities LLC
// (CRD 7654).
//
// Settlement is in euro. The published FX markup is 0.25 % of the euro
// value, each way, when the listing is not euro. It is part of the bill.
// Euro is the only deposit currency (deposits.mjs), so a non-euro line is
// a forced conversion: the buy converts once and the sell converts back
// once, each at 0.25 % on the mid, under `parts.change`. Re-read
// 2026-10-19 in the PLV excerpt (Stand 10.02.2026), "Umrechnung von
// Fremdwährungsumsätzen (Auf- bzw. Abschlag): 0,25 % auf Devisenmittelkurs":
//   https://www.ing.de/dokumente/direkt-depot-auszug-plv/
// Direkt-Depot Young (1.90 € flat) and the ETF purchase promotion are
// not this schedule.
//
//   node brokers/ingde/ingde_cost.mjs DE000A1EWWW0 Xetra EUR --shares=10 --price=150
//   node brokers/ingde/ingde_cost.mjs DE000A1EWWW0 Direkthandel EUR --shares=1 --price=500
//   node brokers/ingde/ingde_cost.mjs US0378331005 Nasdaq USD --shares=10 --price=230

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("ingde-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.ing.de/sparen-anlegen/direkt-depot/konditionen/",
  plv: "https://www.ing.de/dokumente/direkt-depot-auszug-plv/",
  readOn: "2026-10-10",
  entity: "ING Deutschland",
};

const BASE_EUR = 4.9;
const RATE = 0.0025;
const CAP_EUR = 69.9;
const FX_MARKUP = 0.0025;
const VENUE_EUR = {
  direkthandel: 0,
  munich: 1.9,
  stuttgart: 1.9,
  xetra: 2.9,
  frankfurt: 2.9,
  dusseldorf: 2.9,
  hamburg: 2.9,
  hannover: 2.9,
  berlin: 2.9,
  foreign: 14.9,
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v);
};

function eurOf(amount, currency) {
  const ccy = code(currency);
  if (!(amount >= 0) || !ccy) return null;
  if (ccy === "EUR") return amount;
  const usd = toUsd(amount, ccy);
  const per = usdPer("EUR");
  if (usd == null || !(per > 0)) return null;
  return usd / per;
}

// Venue fee in euro, from the place the catalogue stored.
export function venueFee(exchange, mic) {
  const e = loose(exchange);
  const m = code(mic);
  if (e === "DIREKTHANDEL") return VENUE_EUR.direkthandel;
  if (e === "MUNICH" || e === "MUNCHEN" || m === "XMUN") return VENUE_EUR.munich;
  if (e === "STUTTGART" || m === "XSTU") return VENUE_EUR.stuttgart;
  if (e === "XETRA" || e === "ETR" || m === "XETR") return VENUE_EUR.xetra;
  if (e === "FRA" || e === "FRANKFURT" || m === "XFRA") return VENUE_EUR.frankfurt;
  if (e === "DUSSELDORF" || e === "DUS" || m === "XQTX") return VENUE_EUR.dusseldorf;
  if (e === "HAMBURG" || m === "XHAM") return VENUE_EUR.hamburg;
  if (e === "HANNOVER" || m === "XHAN") return VENUE_EUR.hannover;
  if (e === "BERLIN" || m === "XBER") return VENUE_EUR.berlin;
  if (
    e === "NASDAQ" ||
    e === "NYSE" ||
    e === "TOR" ||
    e === "TSXV" ||
    e === "TSX" ||
    e === "CNSX" ||
    m === "XNAS" ||
    m === "XNYS" ||
    m === "ARCX" ||
    m === "XASE" ||
    m === "BATS" ||
    m === "XTSE" ||
    m === "XTSX" ||
    m === "XCNQ"
  ) {
    return VENUE_EUR.foreign;
  }
  return null;
}

// One side: the capped commission plus that place's fee, in euro.
export function sideEur(notionalEur, exchange, mic) {
  const venue = venueFee(exchange, mic);
  if (venue == null || !(notionalEur >= 0)) return null;
  const commission = Math.min(CAP_EUR, BASE_EUR + RATE * notionalEur);
  return { commission, venue, charged: commission + venue };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace)
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
    cashCurrency: "EUR",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue ING n'existe pas encore : lancer `node brokers/ingde/ingde_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ING` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ING`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "ingde",
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
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  let marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const american = ["XNAS", "XNYS", "ARCX", "XASE", "BATS"].includes(listing.mic) && listing.currency === "USD";
  if (american && bp == null && perShare == null && marketBp == null && marketPerShare == null) {
    const quoted = usBookPerShare({ broker: "ingde", ticker: listing.ticker });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null && american ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    remark: "",
    cashCurrency: "EUR",
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `barème ING Deutschland relu le ${SCHEDULE.readOn} : 4,90 € + 0,25 % par sens, plafond 69,90 €, ` +
      `plus la place`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), eur: usdPer("EUR") },
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalEur = eurOf(notional, listing.currency);
  const side = sideEur(notionalEur, listing.brokerExchange, listing.mic);
  if (side == null) {
    return {
      ...shared,
      why: `${listing.brokerExchange || listing.exchange} n'a pas de frais de place publié chez ING`,
    };
  }

  // A deposit currency is never converted; anything else is converted on the
  // buy and back on the sell, 0.25 % on the mid each time.
  const held = depositHas("ingde", null, listingCash(listing.currency));
  const fxEach = held ? 0 : notionalEur * FX_MARKUP;
  const each = side.charged + fxEach;
  const notionalUsd = dollars(notional, listing.currency);
  const courtageUsd = dollars(side.charged * 2, "EUR");
  const fxUsd = dollars(fxEach * 2, "EUR");
  const brokerFees = plus(courtageUsd, fxUsd);
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    `commission ${side.commission.toFixed(2)} €, place ${side.venue.toFixed(2)} €` +
      (fxEach > 0 ? `, change ${fxEach.toFixed(2)} €` : "") +
      `, par sens`,
    held ? "montant déjà en euro" : "0,25 % de change sur le mid, à l'achat et à la vente",
    marketPerShare != null
      ? american
        ? `carnet ${marketPerShare} $ la part, mélange 606 d'UBS Securities LLC`
        : `carnet ${marketPerShare} $ la part`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    ...(held
      ? {}
      : {
          basis:
            `${shared.basis} ; change forcé EUR→${listingCash(listing.currency)} : 0,25 % sur le cours moyen ` +
            `par conversion, à l'achat et à la vente (PLV ING du 10.02.2026, relu le 2026-10-19)`,
        }),
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: {
      base: BASE_EUR,
      rate: RATE,
      cap: CAP_EUR,
      each,
      commissionEach: side.commission,
      venueEach: side.venue,
      fxEach,
      currency: "EUR",
      eachWay: true,
    },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
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
      courtage: finite(courtageUsd, 6),
      change: finite(fxUsd, 6),
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
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage : node brokers/ingde/ingde_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
  }
  if (out.remark) console.log(out.remark);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
