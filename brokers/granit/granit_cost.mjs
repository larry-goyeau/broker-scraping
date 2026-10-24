// What one round trip costs at Gránit Bank: buy n shares on the Budapest
// Stock Exchange (BÉT, premium and standard categories) in the Gránit App
// and sell them back, in dollars. 47 lines trade in forint, 2 in euro.
//
// https://granitbank.hu/tajekoztatok-es-nyilatkozatok/befektetesi-szolgaltatasok
// "Hirdetmény ... (Kondíciós lista)", in force from 2026-10-01 (published
// 2026-09-30), for clients with a framework contract from 2024-12-13, read on
// 2026-10-23. Section B.3, "BÉT prémium és standard részvényszekciójába
// tartozó értékpapírok azonnali tőzsdei megbízások díjai", each buy and each
// sell ("Vételi és eladási megbízás teljesítési díja"):
//   3.1.1. Gránit App alkalmazáson keresztül   0,5% (min. 349 Ft/1EUR/1USD)
//          akcióban 2026.12.31-ig              0,34% (min. 349 Ft/1EUR/1USD)
//   3.1.2. Bankfiókban/Videóbankon keresztül   1% (min. 3 000 Ft/10EUR/10USD)
// The promotional 0.34% runs to 2026-12-31 for every App order, so it is the
// figure until then and 0.5% after. Branch and video-bank orders stay out.
// Footnote 6: fees are on the transaction value at the trade price. The
// bank's own ex-ante cost sheet for a share purchase ("Részvény
// költségtájékoztató", same page) lists the 0.50% buy and sell fees and the
// 0.15% custody and nothing else: no exchange, clearing or third-party line.
// Custody (A.3.3): 0.15% a year under 40 million Ft, 0.10% above, charged
// monthly. That is the remark.
//
// Cash: forint and foreign-currency client accounts (deposits.mjs HUF, EUR,
// USD), and every line trades in one of them, so nothing is converted in
// the number. Converting in the Gránit App uses the "Digitális árfolyam":
// the live interbank mid-rate, "banki költségek nélkül", up to a monthly
// limit (1,500,000 Ft on the Prestige package), weekdays 9:00–17:00.
//   https://granitbank.hu/arfolyamok   read on 2026-10-23
// So the FX remark is 0% within that limit.
//
//   node brokers/granit/granit_cost.mjs OTP XBUD HUF --shares=10 --price=31000
//   node brokers/granit/granit_cost.mjs GSPARK XBUD EUR --shares=100 --price=9.5
//   node brokers/granit/granit_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const FOLDER = "granit";
const CATALOGUE = new URL("granit-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://granitbank.hu/tajekoztatok-es-nyilatkozatok/befektetesi-szolgaltatasok",
  tariff:
    "https://granitbank.hu/api/cms/assets/B59C2047-036C-402E-A6D4-43FDBF5999A7/Hirdetm%C3%A9ny%20a%20Befektet%C3%A9si%20szolg%C3%A1ltat%C3%A1si%20tev%C3%A9kenys%C3%A9ghez%20kapcsol%C3%B3d%C3%B3%20d%C3%ADjakr%C3%B3l%20k%C3%B6lts%C3%A9gekr%C5%91l%20(Kond%C3%ADci%C3%B3s%20lista)%2020261001.pdf",
  fx: "https://granitbank.hu/arfolyamok",
  inForce: "2026-10-01",
  readOn: "2026-10-23",
  promoThrough: "2026-12-31",
  entity: "Gránit Bank Zrt., Gránit App",
};

const RATE = 0.005;
const PROMO_RATE = 0.0034;
// Minimum per order in the listing's currency (B.3.1.1).
const MIN = { HUF: 349, EUR: 1, USD: 1 };
const CUSTODY = "Custody is 0.15% a year.";
const FX_NOTE = (currency) => fxRemark("0", currency, "in the app within a monthly limit");

const today = () => new Date().toISOString().slice(0, 10);
const promoLive = () => today() <= SCHEDULE.promoThrough;
const rateNow = () => (promoLive() ? PROMO_RATE : RATE);

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
    cashCurrency: "HUF",
    url: SCHEDULE.url,
    remark: CUSTODY,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Gránit n'existe pas encore : lancer `node brokers/granit/granit_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Gránit` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Gránit`,
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
  const cash = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, cash);
  const rate = rateNow();
  const min = MIN[cash] ?? null;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? (marketBp != null ? null : book.leaf?.perShare ?? null);
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cash : "HUF",
    remark: [CUSTODY, FX_NOTE(listing.currency)].join(" "),
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    basis:
      `Kondíciós lista du ${SCHEDULE.inForce}, relue le ${SCHEDULE.readOn}, B.3.1.1 Gránit App : ` +
      (promoLive()
        ? `0,34 % (promotion jusqu'au ${SCHEDULE.promoThrough}, 0,5 % ensuite)`
        : "0,5 %") +
      `, minimum 349 Ft / 1 € / 1 $, à l'achat et à la vente ; aucun frais de bourse ni de tiers imprimé`,
  };
  if (!held || min == null) {
    return { ...shared, why: `Gránit ne tient pas de compte en ${cash} : aucun change publié pour cette ligne` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = Math.max(notional * rate, min);
  const floorBites = notional * rate < min;
  const brokerFees = dollars(side * 2, listing.currency);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    floorBites
      ? `le minimum de ${min} ${cash} mord : ${(notional * rate).toFixed(2)} ${cash} calculés`
      : `${(rate * 100).toFixed(2)} % de ${notional.toFixed(2)} ${listing.currency} = ${side.toFixed(2)} par sens`,
    `ligne en ${cash}, devise de dépôt : pas de change ; conversion dans l'app au cours moyen sans frais dans la limite mensuelle`,
    "garde 0,15 % / an (0,10 % au-delà de 40 millions Ft) en remarque",
    marketBp != null
      ? `carnet ${marketBp} bp (table MiFID II pré-négociation de la BÉT)`
      : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${listing.ticker} sur ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet pour cette ligne"}` }
      : {}),
    commission: { rate, standardRate: RATE, promoThrough: SCHEDULE.promoThrough, min, minCurrency: cash, eachWay: true, currency: listing.currency },
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
    console.log(JSON.stringify({ ...SCHEDULE, rate: RATE, promoRate: PROMO_RATE, rateNow: rateNow(), min: MIN }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/granit/granit_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
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
