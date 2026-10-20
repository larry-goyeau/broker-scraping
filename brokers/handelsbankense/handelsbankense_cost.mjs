// What one round trip costs at Handelsbanken: buy n shares at price p,
// sell them back at once, in dollars. The online ticket, in the app or
// the internet bank. A branch or phone order is the "prislista
// bankkontor" and is not this one. Private Banking stays out.
//
// Price list read on 2026-10-18 ("Prislista aktier och värdepapper − i
// appen och internetbanken"). One table, no classes to choose from.
// The percentage is of the order in SEK. The floor is in SEK.
//
//   Svenska och nordiska börser           0.09 %, floor 9 kr
//     The footnote names Stockholmsbörsen, Nasdaq OMX Nordic, NGM,
//     First North and Oslo Börs. Copenhagen, Helsinki and their First
//     North are Nasdaq OMX Nordic. Euronext Expand and Growth Oslo are
//     run by Oslo Børs and take that row. Nordic SME is NGM's own
//     market and takes the NGM row. A Nordic share the catalogue also
//     places on Cboe Europe DXE (the venue page lists Cboe Europe for
//     shares) is the same Nordic order, so that line takes this row too.
//   Spotlight                             0.25 %, floor 9 kr
//     A Spotlight line in DKK or NOK is the same row.
//   Amerikanska aktier                    0.09 %, floor 29 kr
//   Europeiska aktier (France, the        0.09 %, floor 59 kr
//     Netherlands and Germany)
//     Tradegate is a German exchange. The Amundi ETFs the bank lists
//     there take this row.
//
// The account holds SEK only (deposits.mjs). A foreign security pays
// the running currency-exchange fee of 0.25 % on the buy and on the
// sale, and that is in the total. A Nordic line in DKK, EUR or NOK is
// a foreign currency too. Local taxes come from the tax map (French
// FTT on Paris, and so on). Custody (the depå and ISK are free here),
// the fee on a dividend in a foreign currency, and a branch order are
// not this trip.
//
// The bank names no US broker-dealer: the execution-venue page says
// non-Nordic markets are reached through brokers, unnamed. A US line
// has no Rule 606 mix, so its book is the quoted NBBO. German, French
// and Dutch lines are Cboe DXE quotes in the bank's lists; the book
// is the home market's, as the catalogue stores the line there.
//
//   https://www.handelsbanken.se/sv/om-oss/juridiska-dokument/prislistor-privat/prislista-spara/prislista-vardepappershandel
//   https://www.handelsbanken.se/en/about-us/legal-documents/execution-venues
//
//   node brokers/handelsbankense/handelsbankense_cost.mjs "INVE B" XSTO SEK --shares=10 --price=300
//   node brokers/handelsbankense/handelsbankense_cost.mjs ABAS "Spotlight Stock Market" SEK --shares=100 --price=5
//   node brokers/handelsbankense/handelsbankense_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/handelsbankense/handelsbankense_cost.mjs AI XPAR EUR --shares=10 --price=180
//   node brokers/handelsbankense/handelsbankense_cost.mjs --schedule
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

const CATALOGUE = new URL("handelsbankense-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.handelsbanken.se/sv/om-oss/juridiska-dokument/prislistor-privat/prislista-spara/prislista-vardepappershandel",
  venues: "https://www.handelsbanken.se/en/about-us/legal-documents/execution-venues",
  readOn: "2026-10-18",
  entity: "Svenska Handelsbanken AB (publ)",
  channel: "app and internet bank",
  rule606: null,
};

const CASH = "SEK";
const FX_EACH_WAY = 0.0025;

const NORDIC = { label: "Svenska och nordiska börser", rate: 0.0009, min: 9 };
const SPOTLIGHT = { label: "Spotlight", rate: 0.0025, min: 9 };
const AMERICA = { label: "Amerikanska aktier", rate: 0.0009, min: 29 };
const EUROPE = { label: "Europeiska aktier", rate: 0.0009, min: 59 };

const BY_MIC = {
  XSTO: NORDIC,
  SSME: NORDIC,
  XCSE: NORDIC,
  DSME: NORDIC,
  XHEL: NORDIC,
  FSME: NORDIC,
  XOSL: NORDIC,
  XOAS: NORDIC,
  MERK: NORDIC,
  XNGM: NORDIC,
  NSME: NORDIC,
  CEUX: NORDIC,
  XSAT: SPOTLIGHT,
  XNAS: AMERICA,
  XNYS: AMERICA,
  XASE: AMERICA,
  ARCX: AMERICA,
  BATS: AMERICA,
  XETR: EUROPE,
  XGAT: EUROPE,
  XPAR: EUROPE,
  XAMS: EUROPE,
};
const US_MICS = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function toSek(amount, currency) {
  if (code(currency) === CASH) return Number(amount);
  const usd = toUsd(amount, currency);
  const per = usdPer(CASH);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
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
      if (loose(m.row.mic) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function ruleOf(row, venue) {
  return BY_MIC[code(row.mic)] || BY_MIC[venue?.mic] || null;
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
    return { ...answer, why: "le catalogue Handelsbanken n'existe pas encore : lancer `node brokers/handelsbankense/handelsbankense_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Handelsbanken` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Handelsbanken`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const rowMic = code(m.row.mic) || m.venue?.mic || null;
  const american = US_MICS.has(rowMic) && code(m.row.currency) === "USD";
  // No US dealer is named, so the key is the bank's own: no Q, the
  // quoted NBBO of the ticker.
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "handelsbankense",
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
  const rule = ruleOf(m.row, m.venue);
  const converts = listing.currency !== CASH;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const shared = {
    ...answer,
    listing,
    basis: rule
      ? `Handelsbanken, app et banque en ligne, barème relu le ${SCHEDULE.readOn}. ${rule.label} : ${(100 * rule.rate).toFixed(2).replace(".", ",")} %, plancher ${rule.min} SEK, à l'achat et à la vente.` +
        (converts ? " Change automatique 0,25 % à l'achat et à la vente." : "")
      : `Handelsbanken, barème relu le ${SCHEDULE.readOn}.`,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    bp: marketBp,
    perShare: marketPerShare,
  };
  if (!rule) return { ...shared, why: `pas de courtage publié pour ${listing.exchange}` };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalSek = toSek(notional, listing.currency);
  const notionalUsd = dollars(notional, listing.currency);
  if (notionalSek == null || notionalUsd == null) return { ...shared, why: "pas de cours pour ramener l'ordre en couronnes" };

  const each = Math.max(rule.min, notionalSek * rule.rate);
  const commissionUsd = dollars(each * 2, CASH);
  const fxUsd = converts ? notionalUsd * FX_EACH_WAY * 2 : 0;
  const brokerFees = plus(commissionUsd, fxUsd);
  const taxUsd = notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    each === rule.min ? `plancher ${rule.min} SEK atteint` : `${Number(each.toFixed(2))} SEK par sens`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? american
          ? `carnet ${marketPerShare} $ la part, NBBO coté : aucun courtier américain nommé`
          : `carnet ${marketPerShare} la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { each, eachWay: true, currency: CASH, rate: rule.rate, min: rule.min },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
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
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({
      ...SCHEDULE,
      cash: CASH,
      fxEachWay: FX_EACH_WAY,
      nordic: NORDIC,
      spotlight: SPOTLIGHT,
      america: AMERICA,
      europe: EUROPE,
      byMic: Object.fromEntries(Object.entries(BY_MIC).map(([mic, rule]) => [mic, rule.label])),
    }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/handelsbankense/handelsbankense_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({
    etf,
    place,
    currency,
    shares: Number(flag("shares") ?? "10"),
    price: Number(flag("price") ?? "0"),
  }), null, 2));
}

printCli();
